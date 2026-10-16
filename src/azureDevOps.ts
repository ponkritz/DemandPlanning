import type { AzureWorkItem } from './domain'

export interface AzureConfig { organization: string; project: string; team: string }
export interface AzureRequest extends AzureConfig {
  operation: 'areas' | 'query' | 'items'
  pat: string
  query?: string
  ids?: number[]
}
export interface AzureFetchResult { items: AzureWorkItem[]; areaPaths: string[]; asOf: string }
interface RawItem { id: number; fields: Record<string, unknown> }
interface TeamAreas { field: { referenceName: string }; values: { value: string; includeChildren: boolean }[] }
type AzureTransport = (request: AzureRequest) => Promise<unknown>

declare global {
  interface Window { azureDevOps?: { request: AzureTransport } }
}

export function parseAzureProjectUrl(input: string): AzureConfig {
  const url = new URL(input)
  if (url.protocol !== 'https:' || url.hostname !== 'dev.azure.com' || url.username || url.password) throw new Error('Use an https://dev.azure.com organization/project URL.')
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  if (parts.length < 2) throw new Error('The URL must include the organization and project.')
  const backlog = parts.indexOf('_backlogs')
  const team = backlog >= 0 && parts[backlog + 1] === 'backlog' ? parts[backlog + 2] ?? '' : ''
  return { organization: parts[0], project: parts[1], team }
}

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`

export function buildWorkItemQuery(project: string, areas: TeamAreas['values'], afterId: number) {
  if (!areas.length) throw new Error('This team has no configured area paths. Check team settings in Azure DevOps.')
  const areaClause = areas.map((area) => `[System.AreaPath] ${area.includeChildren ? 'UNDER' : '='} ${literal(area.value)}`).join(' OR ')
  return `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = ${literal(project)} AND (${areaClause}) AND [System.Id] > ${afterId} ORDER BY [System.Id] ASC`
}

export async function fetchAzureWorkItems(config: AzureConfig, pat: string, transport: AzureTransport = requestAzure): Promise<AzureFetchResult> {
  if (!config.organization || !config.project || !config.team) throw new Error('Organization, project and team are required.')
  if (!pat.trim()) throw new Error('Enter a Work Items (Read) PAT to fetch data.')
  const request = (operation: AzureRequest['operation'], extra: Partial<AzureRequest> = {}) => transport({ ...config, pat: pat.trim(), operation, ...extra })
  const areas = await request('areas') as TeamAreas
  if (areas.field?.referenceName !== 'System.AreaPath' || !Array.isArray(areas.values)) throw new Error('Unexpected team area-path response.')
  const items: AzureWorkItem[] = []
  let afterId = 0
  let asOf = ''
  while (true) {
    const page = await request('query', { query: buildWorkItemQuery(config.project, areas.values, afterId) }) as { workItems?: { id: number }[]; asOf?: string }
    if (!Array.isArray(page.workItems)) throw new Error('Azure DevOps did not return a work-item list.')
    if (!page.workItems.length) break
    const ids = page.workItems.map((item) => item.id)
    if (ids.some((id) => !Number.isSafeInteger(id) || id <= afterId)) throw new Error('Unexpected work-item paging response. No data was imported.')
    asOf = page.asOf ?? asOf
    for (let index = 0; index < ids.length; index += 200) {
      const batch = await request('items', { ids: ids.slice(index, index + 200) }) as { value?: RawItem[] }
      if (!Array.isArray(batch.value) || batch.value.length !== Math.min(200, ids.length - index)) throw new Error('Some work items could not be read. Check access and fetch again; no partial import was saved.')
      items.push(...batch.value.map((item) => mapAzureWorkItem(item, config)))
    }
    afterId = Math.max(...ids)
    if (items.length > 50000) throw new Error('This team exceeds the trial limit of 50,000 work items. Use a narrower team scope.')
  }
  return { items, areaPaths: areas.values.map((area) => area.value), asOf }
}

export function mapAzureWorkItem(item: RawItem, config: AzureConfig): AzureWorkItem {
  const fields = item.fields
  const text = (name: string) => typeof fields[name] === 'string' ? fields[name] as string : ''
  const assignee = fields['System.AssignedTo']
  const assignedTo = typeof assignee === 'string' ? assignee : assignee && typeof assignee === 'object' && 'displayName' in assignee ? String(assignee.displayName) : ''
  const date = (name: string) => { const value = text(name); return /^\d{4}-\d{2}-\d{2}(T|$)/.test(value) ? value : undefined }
  return {
    key: `${config.organization.toLowerCase()}/${config.project.toLowerCase()}/${item.id}`, id: item.id,
    organization: config.organization, project: config.project,
    title: text('System.Title'), workItemType: text('System.WorkItemType'), state: text('System.State'), assignedTo,
    areaPath: text('System.AreaPath'), iterationPath: text('System.IterationPath'),
    parentId: typeof fields['System.Parent'] === 'number' ? fields['System.Parent'] : undefined,
    targetDate: date('Microsoft.VSTS.Scheduling.TargetDate'), closedDate: date('Microsoft.VSTS.Common.ClosedDate'),
    changedDate: date('System.ChangedDate'), tags: text('System.Tags'),
    url: `https://dev.azure.com/${encodeURIComponent(config.organization)}/${encodeURIComponent(config.project)}/_workitems/edit/${item.id}`,
    syncedAt: new Date().toISOString(),
  }
}

export function mergeAzureWorkItems(current: AzureWorkItem[], incoming: AzureWorkItem[]) {
  const merged = new Map(current.map((item) => [item.key, item]))
  for (const item of incoming) merged.set(item.key, item)
  return [...merged.values()]
}

async function requestAzure(request: AzureRequest): Promise<unknown> {
  if (window.azureDevOps) return window.azureDevOps.request(request)
  const base = `https://dev.azure.com/${encodeURIComponent(request.organization)}/${encodeURIComponent(request.project)}`
  const endpoint = request.operation === 'areas' ? `${encodeURIComponent(request.team)}/_apis/work/teamsettings/teamfieldvalues` : request.operation === 'query' ? '_apis/wit/wiql' : '_apis/wit/workitemsbatch'
  const body = request.operation === 'query' ? { query: request.query } : { ids: request.ids, errorPolicy: 'Fail' }
  let response: Response
  try {
    response = await fetch(`${base}/${endpoint}?api-version=7.1${request.operation === 'query' ? '&$top=1000' : ''}`, {
      method: request.operation === 'areas' ? 'GET' : 'POST', redirect: 'error', credentials: 'omit',
      headers: { Authorization: `Basic ${btoa(`:${request.pat}`)}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: request.operation === 'areas' ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(45000),
    })
  } catch { throw new Error('Azure DevOps could not be reached. Check your network/VPN. If browser cross-origin access is blocked, use the desktop package with the same PAT.') }
  if (response.status === 401) throw new Error('The PAT was rejected or has expired. Create a new Work Items (Read) PAT.')
  if (response.status === 403) throw new Error('Access denied. Check project access, PAT Work Items (Read) scope and organization policy.')
  if (response.status === 404) throw new Error('Project or team not found. Check the project URL and team name.')
  if (!response.ok) throw new Error(`Azure DevOps request failed (${response.status}). No data was imported.`)
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) throw new Error('Azure DevOps returned a sign-in page. Check the PAT and organization access.')
  return response.json()
}
