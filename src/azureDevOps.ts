import type { AzureWorkItem } from './domain'
import { planMonthStory, timeWritingMonth } from './azureInsights.ts'

// baseUrl is the organization (https://dev.azure.com/<org>) or, on premises, the Azure DevOps Server collection
// (e.g. https://tfs.example.com/tfs/DefaultCollection). Omitted means Azure DevOps Services for organization.
export interface AzureConfig { organization: string; project: string; team: string; baseUrl?: string; apiVersion?: string }

// Normalises a base URL: https only, no credentials, query or fragment. A dev.azure.com address keeps only the
// organization segment, so a pasted project URL also works; an on-prem collection URL is kept as given.
export function normalizeBaseUrl(value: string) {
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error('Enter the base URL: https://dev.azure.com/<organization>, or your Azure DevOps Server collection URL.') }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('The base URL must use https and must not contain a user name or password.')
  if (url.search || url.hash) throw new Error('Remove the ? or # part from the base URL.')
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  if (url.hostname === 'dev.azure.com') {
    if (!parts[0]) throw new Error('The base URL must include the organization: https://dev.azure.com/<organization>.')
    return `https://dev.azure.com/${encodeURIComponent(parts[0])}`
  }
  return `${url.origin}${parts.map(encodeURIComponent).map((part) => `/${part}`).join('')}`
}
export const isCloudBase = (baseUrl: string) => new URL(baseUrl).hostname === 'dev.azure.com'
export function collectionUrl(config: Pick<AzureConfig, 'organization' | 'baseUrl'>) { return config.baseUrl ? normalizeBaseUrl(config.baseUrl) : `https://dev.azure.com/${encodeURIComponent(config.organization)}` }
export const projectApiBase = (config: Pick<AzureConfig, 'organization' | 'project' | 'baseUrl'>) => `${collectionUrl(config)}/${encodeURIComponent(config.project)}`
// Azure DevOps Services accepts 7.1; older Azure DevOps Server versions need a lower version (e.g. 6.0 or 5.0).
export const apiVersionOf = (config: Pick<AzureConfig, 'apiVersion'>) => config.apiVersion && /^\d{1,2}\.\d(-preview(\.\d)?)?$/.test(config.apiVersion) ? config.apiVersion : '7.1'
export interface AzureRequest extends AzureConfig {
  operation: 'identity' | 'backlog-epics' | 'areas' | 'iterations' | 'iteration-tree' | 'fields' | 'query' | 'items' | 'create-feature' | 'create-child' | 'update-time-writing-effort' | 'update-work-item'
  pat: string
  query?: string
  ids?: number[]
  feature?: FeatureInput & { areaPath: string }
  validateOnly?: boolean
  workItemType?: 'User Story' | 'Task'
  workItemId?: number
  planHours?: number
  actualHours?: number
  tags?: string
  state?: string
  iterationPath?: string
}
export interface FeatureInput { parentId: number; title: string; description: string; acceptanceCriteria: string; areaPath?: string; iterationPath?: string; assignedTo?: string; targetDate?: string; assignToCreator?: boolean; storyIterationPath?: string; taskOriginalEstimate?: number; taskCompletedWork?: number }
export function featureDescription(kind: 'PU' | 'Release') {
  return kind === 'PU' ? 'Feature DoD: DT finished. This is a PU release.' : 'Feature DoD: IQOQ finished and Checklist uploaded into the Feature.'
}

export interface AzureIteration { name: string; path: string; attributes?: { startDate?: string; finishDate?: string }; teamConfigured?: boolean }
interface IterationNode { name: string; path?: string; attributes?: AzureIteration['attributes']; children?: IterationNode[] }

export function projectIterationPaths(root: IterationNode): AzureIteration[] {
  const paths: AzureIteration[] = []
  function visit(node: IterationNode, parentPath = '') {
    const parts = node.path?.split('\\').filter(Boolean)
    // Classification-node paths contain an internal "Iteration" segment that work-item fields do not use.
    const path = parts?.length && parts[1]?.toLowerCase() === 'iteration' ? [parts[0], ...parts.slice(2)].join('\\') : parentPath ? `${parentPath}\\${node.name}` : node.name
    paths.push({ name: node.name, path, ...(node.attributes ? { attributes: node.attributes } : {}) })
    node.children?.forEach((child) => visit(child, path))
  }
  visit(root)
  return paths
}

// Who the PAT belongs to: the email (account) Azure DevOps reports for it. The app's access roles are matched on it.
export interface AzureIdentity { email: string; name: string }
export async function readAzureIdentity(config: AzureConfig, pat: string, transport: AzureTransport = requestAzure): Promise<AzureIdentity> {
  if (!pat.trim()) throw new Error('Enter the PAT of the Time Writing connection to identify you.')
  const response = await transport({ ...config, pat: pat.trim(), operation: 'identity' }) as { authenticatedUser?: { providerDisplayName?: unknown; customDisplayName?: unknown; properties?: Record<string, { $value?: unknown } | undefined> } } | null
  const user = response?.authenticatedUser
  const account = user?.properties?.Account?.$value
  if (typeof account !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.trim())) throw new Error('Azure DevOps did not return an email for this PAT, so your access roles cannot be matched.')
  const name = [user?.customDisplayName, user?.providerDisplayName].find((value): value is string => typeof value === 'string' && Boolean(value.trim()))
  return { email: account.trim().toLowerCase(), name: name?.trim() ?? account.trim() }
}

export async function readAzureIterations(config: AzureConfig, pat: string, transport: AzureTransport = requestAzure): Promise<AzureIteration[]> {
  if (!pat.trim()) throw new Error('Configure your PAT first to load iteration paths.')
  const results = await Promise.allSettled([
    transport({ ...config, pat, operation: 'iterations' }),
    transport({ ...config, pat, operation: 'iteration-tree' }),
  ])
  const options = new Map<string, AzureIteration>()
  if (results[0].status === 'fulfilled') {
    const team = results[0].value as { value?: AzureIteration[] }
    for (const item of team.value ?? []) if (item.name && item.path) options.set(item.path.toLowerCase(), { ...item, teamConfigured: true })
  }
  if (results[1].status === 'fulfilled') {
    const root = results[1].value as IterationNode
    if (root.name) for (const item of projectIterationPaths(root)) options.set(item.path.toLowerCase(), { ...options.get(item.path.toLowerCase()), ...item })
  }
  if (!options.size) throw new Error('Could not load iteration paths. Check Azure DevOps access or enter the full path from Project settings → Project configuration → Iterations.')
  return [...options.values()].sort((a, b) => a.path.localeCompare(b.path))
}
function indiaDate(date: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function scheduledIterationPairs(iterations: AzureIteration[], date: Date, schedule: 'current' | 'future') {
  const today = indiaDate(date)
  const dated = iterations.filter((item) => {
    const start = item.attributes?.startDate?.slice(0, 10), finish = item.attributes?.finishDate?.slice(0, 10)
    return Boolean(start && finish && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(finish))
  })
  const eligible = dated.filter((item) => {
    const start = item.attributes!.startDate!.slice(0, 10), finish = item.attributes!.finishDate!.slice(0, 10)
    return schedule === 'current' ? start <= today && today <= finish : start > today
  })
  const under = (child: string, parent: string) => child.toLowerCase().startsWith(`${parent.toLowerCase()}\\`)
  const pairs = eligible.filter((item) => !dated.some((child) => under(child.path, item.path))).flatMap((sprint) => {
    const ancestors = iterations.filter((pi) => under(sprint.path, pi.path) && pi.path.includes('\\')).sort((a, b) => b.path.length - a.path.length)
    // Teams commonly date only the Sprint. Prefer an active PI, but safely use
    // the closest PI-named parent when the PI itself has no dates.
    const pi = ancestors.find((item) => eligible.some((current) => current.path.toLowerCase() === item.path.toLowerCase()))
      ?? ancestors.find((item) => /\b(?:pi|program\s*increment)\b/i.test(item.name))
    return pi ? [{ pi, sprint }] : []
  })
  const teamPairs = pairs.filter((pair) => pair.sprint.teamConfigured)
  const selected = teamPairs.length ? teamPairs : pairs
  return selected.sort((a, b) => a.sprint.attributes!.startDate!.localeCompare(b.sprint.attributes!.startDate!) || a.sprint.path.localeCompare(b.sprint.path))
}

export function currentIterationPairs(iterations: AzureIteration[], date = new Date()) {
  return scheduledIterationPairs(iterations, date, 'current')
}

export function futureIterationPairs(iterations: AzureIteration[], date = new Date()) {
  return scheduledIterationPairs(iterations, date, 'future')
}

export interface AzureBacklogScope extends AzureConfig { itemKeys: string[]; areaPaths: string[]; fetchedAt: string; sample?: boolean }
export interface AzureFetchResult { items: AzureWorkItem[]; areaPaths: string[]; asOf: string; scope: AzureBacklogScope }
interface RawItem { id: number; fields: Record<string, unknown>; relations?: { rel: string; url: string }[] }
interface TeamAreas { field: { referenceName: string }; values: { value: string; includeChildren: boolean }[] }
type AzureTransport = (request: AzureRequest) => Promise<unknown>

declare global {
  interface Window { azureDevOps?: { request: AzureTransport } }
}

export function parseAzureProjectUrl(input: string, baseUrl?: string): AzureConfig {
  const url = new URL(input)
  if (url.username || url.password || url.protocol !== 'https:') throw new Error('Use an https Azure DevOps project URL.')
  const base = baseUrl ? normalizeBaseUrl(baseUrl) : ''
  if (!base || isCloudBase(base)) {
    if (url.hostname !== 'dev.azure.com') throw new Error('Use an https://dev.azure.com organization/project URL, or set the base URL of your Azure DevOps Server collection.')
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    if (parts.length < 2) throw new Error('The URL must include the organization and project.')
    const backlog = parts.indexOf('_backlogs')
    const team = backlog >= 0 && parts[backlog + 1] === 'backlog' ? parts[backlog + 2] ?? '' : ''
    return { organization: parts[0], project: parts[1], team }
  }
  // Azure DevOps Server: <collection URL>/<project>[/_backlogs/backlog/<team>/…]; organization = collection name.
  const normalized = `${url.origin}${url.pathname.split('/').filter(Boolean).map((part) => `/${encodeURIComponent(decodeURIComponent(part))}`).join('')}`
  if (!normalized.toLowerCase().startsWith(`${base.toLowerCase()}/`)) throw new Error('The project URL does not belong to the configured base URL.')
  const parts = normalized.slice(base.length).split('/').filter(Boolean).map(decodeURIComponent)
  if (!parts[0]) throw new Error('The URL must include the project.')
  const backlog = parts.indexOf('_backlogs')
  const team = backlog >= 0 && parts[backlog + 1] === 'backlog' ? parts[backlog + 2] ?? '' : ''
  const collection = new URL(base).pathname.split('/').filter(Boolean).map(decodeURIComponent).at(-1) ?? new URL(base).hostname
  return { organization: collection, project: parts[0], team, baseUrl: base }
}

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`

export function buildWorkItemQuery(project: string, areas: TeamAreas['values'], afterId: number, parentIds?: number[]) {
  if (!areas.length) throw new Error('This team has no configured area paths. Check team settings in Azure DevOps.')
  const areaClause = areas.map((area) => `[System.AreaPath] ${area.includeChildren ? 'UNDER' : '='} ${literal(area.value)}`).join(' OR ')
  if (parentIds && (!parentIds.length || parentIds.length > 200 || parentIds.some((id) => !Number.isSafeInteger(id) || id < 1))) throw new Error('Invalid backlog parent IDs.')
  return `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = ${literal(project)} AND (${areaClause})${parentIds ? ` AND [System.Parent] IN (${parentIds.join(',')}) AND [System.State] <> 'Removed'` : ''} AND [System.Id] > ${afterId} ORDER BY [System.Id] ASC`
}

export async function fetchAzureWorkItems(config: AzureConfig, pat: string, transport: AzureTransport = requestAzure): Promise<AzureFetchResult> {
  if (!config.organization || !config.project || !config.team) throw new Error('Organization, project and team are required.')
  if (!pat.trim()) throw new Error('Enter a Work Items (Read) PAT to fetch data.')
  const request = (operation: AzureRequest['operation'], extra: Partial<AzureRequest> = {}) => transport({ ...config, pat: pat.trim(), operation, ...extra })
  const areas = await request('areas') as TeamAreas
  if (areas.field?.referenceName !== 'System.AreaPath' || !Array.isArray(areas.values)) throw new Error('Unexpected team area-path response.')
  const backlog = await request('backlog-epics') as { workItems?: { target?: { id: number } }[] }
  if (!Array.isArray(backlog.workItems)) throw new Error('The team Epic backlog could not be read. No project-wide fallback was attempted.')
  const rootIds = [...new Set(backlog.workItems.map((link) => link.target?.id))]
  if (rootIds.some((id) => !Number.isSafeInteger(id) || !id || id < 1)) throw new Error('Unexpected team backlog IDs. No data was imported.')
  if (rootIds.length > 50000) throw new Error('The team Epic backlog exceeds the trial safety limit. No data was imported.')
  const readItems = async (ids: number[]) => {
    const result: AzureWorkItem[] = []
    for (let index = 0; index < ids.length; index += 200) {
      const batchIds = ids.slice(index, index + 200)
      const batch = await request('items', { ids: batchIds }) as { value?: RawItem[] }
      if (!Array.isArray(batch.value) || batch.value.length !== batchIds.length || new Set(batch.value.map((item) => item.id)).size !== batchIds.length || batch.value.some((item) => !batchIds.includes(item.id) || (typeof item.fields['System.TeamProject'] === 'string' && item.fields['System.TeamProject'].toLowerCase() !== config.project.toLowerCase()))) throw new Error('Some work items could not be read. Check access and fetch again; no partial import was saved.')
      result.push(...batch.value.map((item) => mapAzureWorkItem(item, config)).filter((item) => item.state.trim().toLowerCase() !== 'removed'))
    }
    return result
  }
  const items = await readItems(rootIds as number[])
  if (items.some((item) => item.workItemType !== 'Epic')) throw new Error('The selected Epic backlog returned an unexpected work-item type. No data was imported.')
  const known = new Set(items.map((item) => item.id))
  let frontier = [...known]
  let depth = 0
  while (frontier.length) {
    if (++depth > 64) throw new Error('Unexpected backlog hierarchy depth. No partial data was imported.')
    const next: number[] = []
    for (let start = 0; start < frontier.length; start += 200) {
      const parents = frontier.slice(start, start + 200)
      let afterId = 0
      while (true) {
        const page = await request('query', { query: buildWorkItemQuery(config.project, areas.values, afterId, parents) }) as { workItems?: { id: number }[] }
        if (!Array.isArray(page.workItems)) throw new Error('Unable to read backlog children. No partial data was imported.')
        if (!page.workItems.length) break
        const ids = page.workItems.map((item) => item.id)
        if (ids.some((id) => !Number.isSafeInteger(id) || id <= afterId)) throw new Error('Unexpected child paging response. No partial data was imported.')
        for (const item of await readItems(ids.filter((id) => !known.has(id)))) {
          if (!item.parentId || !parents.includes(item.parentId)) throw new Error('A child did not belong to the requested backlog parents. No partial data was imported.')
          known.add(item.id); items.push(item); next.push(item.id)
        }
        afterId = Math.max(...ids)
        if (items.length > 50000) throw new Error('This backlog exceeds the 50,000-item trial safety limit. No partial data was imported.')
      }
    }
    frontier = next
  }
  const asOf = new Date().toISOString(), areaPaths = areas.values.map((area) => area.value)
  return { items, areaPaths, asOf, scope: { organization: config.organization, project: config.project, team: config.team, itemKeys: items.map((item) => item.key), areaPaths, fetchedAt: asOf } }
}

export function sameAzureScope(left: AzureConfig | undefined | null, right: AzureConfig | undefined | null) {
  if (!left || !right) return false
  const same = (key: 'organization' | 'project' | 'team') => typeof left[key] === 'string' && typeof right[key] === 'string' && left[key].toLowerCase() === right[key].toLowerCase()
  try { return collectionUrl(left).toLowerCase() === collectionUrl(right).toLowerCase() && same('organization') && same('project') && same('team') } catch { return false }
}

export function savedBacklogItems(items: AzureWorkItem[], scope: AzureBacklogScope | undefined, config: AzureConfig | null) {
  if (!sameAzureScope(scope, config) || !Array.isArray(scope?.itemKeys)) return []
  const keys = new Set(scope.itemKeys)
  return items.filter((item) => keys.has(item.key) && item.organization.toLowerCase() === config!.organization.toLowerCase() && item.project.toLowerCase() === config!.project.toLowerCase() && item.state.trim().toLowerCase() !== 'removed')
}

// Display name of an identity field (an object with displayName, or plain text).
const identityName = (value: unknown) => typeof value === 'string' ? value : value && typeof value === 'object' && 'displayName' in value ? String((value as { displayName: unknown }).displayName) : ''

export function mapAzureWorkItem(item: RawItem, config: AzureConfig): AzureWorkItem {
  const fields = item.fields
  const text = (name: string) => typeof fields[name] === 'string' ? fields[name] as string : ''
  const assignee = fields['System.AssignedTo']
  const assignedTo = typeof assignee === 'string' ? assignee : assignee && typeof assignee === 'object' && 'displayName' in assignee ? String(assignee.displayName) : ''
  const assigneeEmail = assignee && typeof assignee === 'object' ? String((assignee as { uniqueName?: unknown; mailAddress?: unknown }).uniqueName ?? (assignee as { mailAddress?: unknown }).mailAddress ?? '') : ''
  const date = (name: string) => { const value = text(name); return /^\d{4}-\d{2}-\d{2}(T|$)/.test(value) ? value : undefined }
  const number = (name: string) => typeof fields[name] === 'number' && Number.isFinite(fields[name]) && (fields[name] as number) >= 0 ? fields[name] as number : undefined
  return {
    key: `${config.organization.toLowerCase()}/${config.project.toLowerCase()}/${item.id}`, id: item.id,
    organization: config.organization, project: config.project,
    title: text('System.Title'), workItemType: text('System.WorkItemType'), state: text('System.State'), assignedTo,
    ...(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assigneeEmail) ? { assignedToEmail: assigneeEmail.toLowerCase() } : {}),
    description: text('System.Description'),
    originalEstimate: number('Microsoft.VSTS.Scheduling.OriginalEstimate'),
    completedWork: number('Microsoft.VSTS.Scheduling.CompletedWork'),
    remainingWork: number('Microsoft.VSTS.Scheduling.RemainingWork'),
    createdDate: date('System.CreatedDate'),
    ...(identityName(fields['System.CreatedBy']) ? { createdBy: identityName(fields['System.CreatedBy']) } : {}),
    ...(identityName(fields['System.ChangedBy']) ? { changedBy: identityName(fields['System.ChangedBy']) } : {}),
    storyPoints: typeof fields['Microsoft.VSTS.Scheduling.StoryPoints'] === 'number' && Number.isFinite(fields['Microsoft.VSTS.Scheduling.StoryPoints']) ? fields['Microsoft.VSTS.Scheduling.StoryPoints'] as number : undefined,
    areaPath: text('System.AreaPath'), iterationPath: text('System.IterationPath'),
    parentId: typeof fields['System.Parent'] === 'number' ? fields['System.Parent'] : parentFromRelation(item),
    targetDate: date('Microsoft.VSTS.Scheduling.TargetDate'), closedDate: date('Microsoft.VSTS.Common.ClosedDate'),
    changedDate: date('System.ChangedDate'), tags: text('System.Tags'),
    url: `${projectApiBase(config)}/_workitems/edit/${item.id}`,
    syncedAt: new Date().toISOString(),
  }
}

function parentFromRelation(item: RawItem) {
  const relation = item.relations?.find((link) => link.rel === 'System.LinkTypes.Hierarchy-Reverse')
  const match = relation && /\/workitems\/(\d+)$/i.exec(relation.url)
  return match ? Number(match[1]) : undefined
}

export async function createAzureFeature(config: AzureConfig, pat: string, feature: FeatureInput, transport: AzureTransport = requestAzure): Promise<AzureWorkItem> {
  if (!pat.trim()) throw new Error('Enter a Work Items (Read & Write) PAT.')
  if (!Number.isSafeInteger(feature.parentId) || feature.parentId < 1 || !feature.title.trim() || feature.title.trim().length > 255) throw new Error('Choose a parent Epic and enter a title of 1–255 characters.')
  if (feature.assignToCreator) throw new Error('Configure a Feature creator email in the ADS configuration. Azure DevOps does not accept the PAT identity GUID as Assigned To.')
  if (!feature.assignedTo?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(feature.assignedTo.trim())) throw new Error('A valid Feature creator email is required for Assigned To.')
  const parentResponse = await transport({ ...config, pat, operation: 'items', ids: [feature.parentId] }) as { value: RawItem[] }
  const parent = parentResponse.value?.find((item) => item.id === feature.parentId)
  if (!parent || parent.fields['System.WorkItemType'] !== 'Epic') throw new Error('The selected parent is not an accessible Epic. Refresh and select an Epic.')
  const parentProject = parent.fields['System.TeamProject']
  if (typeof parentProject === 'string' && parentProject.toLowerCase() !== config.project.toLowerCase()) throw new Error('The parent Epic belongs to a different project.')
  const areaPath = feature.areaPath?.trim() || parent.fields['System.AreaPath']
  if (typeof areaPath !== 'string' || !areaPath) throw new Error('The parent Epic has no area path. Check it in Azure DevOps.')
  let iterationPath = feature.iterationPath?.trim()
  if (iterationPath && !iterationPath.includes('\\')) {
    const iterations = await readAzureIterations(config, pat, transport)
    const matches = iterations.filter((iteration) => iteration.name.toLowerCase() === iterationPath!.toLowerCase())
    if (matches.length !== 1) throw new Error(`Iteration "${iterationPath}" ${matches.length ? 'is ambiguous' : 'was not found in team or project iterations'}. Use Load iteration paths and select its actual full path. Available paths: ${iterations.slice(0, 8).map((iteration) => iteration.path).join('; ')}`)
    iterationPath = matches[0].path
  }
  const request: AzureRequest = { ...config, pat, operation: 'create-feature', feature: { ...feature, title: feature.title.trim(), areaPath, iterationPath } }
  // Ask Azure DevOps to validate project-specific required fields before persisting anything.
  await transport({ ...request, validateOnly: true })
  const created = await transport({ ...request, validateOnly: false }) as RawItem
  if (!Number.isSafeInteger(created.id) || created.id < 1) throw new Error('Creation returned an unexpected response. Check the backlog before retrying to avoid duplicates.')
  try {
    const checked = await transport({ ...config, pat, operation: 'items', ids: [created.id] }) as { value: RawItem[] }
    const item = checked.value?.find((entry) => entry.id === created.id)
    if (!item) throw new Error('Verification response did not include the created Feature.')
    const assigned = item.fields['System.AssignedTo']
    const assignedName = typeof assigned === 'string' ? assigned : assigned && typeof assigned === 'object' && 'uniqueName' in assigned ? String(assigned.uniqueName) : assigned && typeof assigned === 'object' && 'mailAddress' in assigned ? String(assigned.mailAddress) : assigned && typeof assigned === 'object' && 'id' in assigned ? String(assigned.id) : ''
    if (assignedName && assignedName.toLowerCase() !== feature.assignedTo.trim().toLowerCase()) throw new Error('Configured creator email assignment verification failed.')
    const mapped = mapAzureWorkItem(item, config)
    if (mapped.parentId !== feature.parentId || mapped.workItemType !== 'Feature') throw new Error('Parent/type verification failed.')
    if (mapped.areaPath.toLowerCase() !== areaPath.toLowerCase() || (iterationPath && mapped.iterationPath.toLowerCase() !== iterationPath.toLowerCase())) throw new Error('Area/iteration verification failed.')
    return mapped
  } catch {
    throw new Error(`Feature #${created.id} was created, but its parent, area, iteration or assignee could not be verified. Check it in Azure DevOps before creating another.`)
  }
}

const validHours = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1_000_000

/** Updates only the two Azure scheduling fields on a selected-month Task. */
export async function updateAzureTimeWritingEffort(config: AzureConfig, pat: string, workItemId: number, planHours: number | undefined, actualHours: number | undefined, markAdhoc = false, transport: AzureTransport = requestAzure): Promise<AzureWorkItem> {
  if (!pat.trim()) throw new Error('Select a PAT profile with Work Items (Read & Write) before saving Plan or Actual.')
  if (!Number.isSafeInteger(workItemId) || workItemId < 1 || (planHours == null && actualHours == null) || (planHours != null && !validHours(planHours)) || (actualHours != null && !validHours(actualHours))) throw new Error('Original Estimate and Completed Work must be numbers from 0 to 1,000,000 hours.')
  const source = await transport({ ...config, pat, operation: 'items', ids: [workItemId] }) as { value?: RawItem[] }
  const raw = source.value?.find((item) => item.id === workItemId)
  // Only a Task whose title starts or ends with a month and year (any delimiter, any parent story name) can be edited here.
  if (!raw || raw.fields['System.WorkItemType'] !== 'Task' || !timeWritingMonth(String(raw.fields['System.Title'] ?? ''))) throw new Error('Only a month-named Time Writing Task can be updated from Monthly effort.')
  const existingTags = typeof raw.fields['System.Tags'] === 'string' ? raw.fields['System.Tags'] : ''
  const tags = markAdhoc && !existingTags.split(';').some(tag => tag.trim().toLowerCase() === 'ad-hoc') ? [...existingTags.split(';').map(tag => tag.trim()).filter(Boolean), 'ad-hoc'].join('; ') : undefined
  const response = await transport({ ...config, pat, operation: 'update-time-writing-effort', workItemId, planHours, actualHours, tags }) as RawItem
  if (response.id !== workItemId) throw new Error('Azure DevOps returned an unexpected work item after saving effort.')
  const updated = mapAzureWorkItem(response, config)
  if ((planHours != null && updated.originalEstimate !== planHours) || (actualHours != null && updated.completedWork !== actualHours) || (tags && !updated.tags.split(';').some(tag => tag.trim().toLowerCase() === 'ad-hoc'))) throw new Error('Azure DevOps did not confirm the saved fields. Refresh before retrying.')
  return updated
}

const htmlText = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '<br>')

export function featurePatch(config: AzureConfig, feature: FeatureInput & { areaPath: string }) {
  const patch: { op: string; path: string; value: unknown }[] = [
    { op: 'add', path: '/fields/System.Title', value: feature.title },
    { op: 'add', path: '/fields/System.AreaPath', value: feature.areaPath },
    { op: 'add', path: '/fields/System.Description', value: htmlText(feature.description) },
    { op: 'add', path: '/relations/-', value: { rel: 'System.LinkTypes.Hierarchy-Reverse', url: `${projectApiBase(config)}/_apis/wit/workItems/${feature.parentId}` } },
  ]
  if (feature.acceptanceCriteria.trim()) patch.push({ op: 'add', path: '/fields/Microsoft.VSTS.Common.AcceptanceCriteria', value: htmlText(feature.acceptanceCriteria) })
  if (feature.iterationPath) patch.push({ op: 'add', path: '/fields/System.IterationPath', value: feature.iterationPath })
  if (feature.assignedTo?.trim()) patch.push({ op: 'add', path: '/fields/System.AssignedTo', value: feature.assignedTo.trim() })
  if (feature.targetDate) patch.push({ op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.TargetDate', value: `${feature.targetDate}T00:00:00Z` })
  return patch
}

export function mergeAzureWorkItems(current: AzureWorkItem[], incoming: AzureWorkItem[]) {
  const merged = new Map(current.map((item) => [item.key, item]))
  for (const item of incoming) merged.set(item.key, item)
  return [...merged.values()]
}

export function releaseHierarchyTitles(title: string, kind: 'PU' | 'Release', monthLabel: string) {
  const parts = title.split('|').map((part) => part.trim())
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error('Use the Feature title format Program | Service | vRelease.')
  const identifier = `${parts[1]} ${parts[2].replace(/^v/i, '')}`
  return {
    reviews: (kind === 'PU' ? ['SFV', 'DT', 'IQOQ'] : ['PRD', 'SFV', 'DT', 'IQOQ']).map((milestone) => ({ milestone, title: `${milestone} : Review of Deliverables (${identifier})` })),
    timeWriting: `${title.trim()} - Time Writing`,
    task: `${monthLabel} | ${title.trim()}`,
  }
}

export function currentIndiaMonth(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(date)
}

export class HierarchyCreationError extends Error {
  createdItems: AzureWorkItem[]
  constructor(message: string, createdItems: AzureWorkItem[]) { super(message); this.name = 'HierarchyCreationError'; this.createdItems = createdItems }
}

async function directChildren(config: AzureConfig, pat: string, parentId: number, transport: AzureTransport) {
  const page = await transport({ ...config, pat, operation: 'query', query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = ${literal(config.project)} AND [System.Parent] = ${parentId} ORDER BY [System.Id] ASC` }) as { workItems?: { id: number }[] }
  if (!Array.isArray(page.workItems)) throw new Error('Could not check existing children. No child creation was attempted.')
  if (page.workItems.length >= 1000) throw new Error('This parent has too many children to verify safely. Review it in Azure DevOps.')
  const items: AzureWorkItem[] = []
  for (let index = 0; index < page.workItems.length; index += 200) {
    const ids = page.workItems.slice(index, index + 200).map((item) => item.id)
    const batch = await transport({ ...config, pat, operation: 'items', ids }) as { value?: RawItem[] }
    if (batch.value?.length !== ids.length) throw new Error('Could not read all existing children. Refresh before retrying.')
    items.push(...batch.value.map((item) => mapAzureWorkItem(item, config)))
  }
  return items
}

async function ensureChild(config: AzureConfig, pat: string, parent: AzureWorkItem, type: 'User Story' | 'Task', title: string, existing: AzureWorkItem[], transport: AzureTransport, iterationPath = parent.iterationPath, taskOriginalEstimate?: number, taskCompletedWork?: number) {
  const matches = existing.filter((item) => item.parentId === parent.id && item.workItemType === type && item.title.trim() === title)
  if (matches.length > 1) throw new Error(`Multiple matching ${type} items already exist under #${parent.id}. Review duplicates before continuing.`)
  if (matches.length === 1) {
    if (matches[0].areaPath !== parent.areaPath || matches[0].iterationPath !== iterationPath) throw new Error(`Existing ${type} #${matches[0].id} has a different area or iteration. Review it before continuing.`)
    return matches[0]
  }
  if (title.length > 255) throw new Error('An automatic child title exceeds 255 characters. Shorten the Feature title.')
  const request: AzureRequest = { ...config, pat, operation: 'create-child', workItemType: type,
    feature: { parentId: parent.id, title, description: '', acceptanceCriteria: '', areaPath: parent.areaPath, iterationPath, ...(type === 'Task' && taskOriginalEstimate != null ? { taskOriginalEstimate } : {}), ...(type === 'Task' && taskCompletedWork != null ? { taskCompletedWork } : {}) } }
  await transport({ ...request, validateOnly: true })
  const response = await transport({ ...request, validateOnly: false }) as RawItem
  if (!Number.isSafeInteger(response.id) || response.id < 1) throw new Error(`${type} creation could not be confirmed. Check children under #${parent.id} before retrying.`)
  try {
    const read = await transport({ ...config, pat, operation: 'items', ids: [response.id] }) as { value: RawItem[] }
    const raw = read.value?.find((item) => item.id === response.id)
    if (!raw) throw new Error('Missing work item.')
    const item = mapAzureWorkItem(raw, config)
    if (item.parentId !== parent.id || item.workItemType !== type || item.areaPath !== parent.areaPath || item.iterationPath !== iterationPath || (taskOriginalEstimate != null && item.originalEstimate !== taskOriginalEstimate) || (taskCompletedWork != null && item.completedWork !== taskCompletedWork)) throw new Error('Child verification failed.')
    return item
  } catch { throw new Error(`${type} #${response.id} was created but could not be verified. Check the source before using Complete children.`) }
}

// Month Time Writing task for one person on one Feature: "<Feature> - Time Writing" story (created if missing) and
// "<Month YYYY> | <Feature>" Task assigned to that person. Children are re-read from Azure first, so an existing task
// for the same person is reused rather than duplicated; another person's task with the same title is left alone.
export type MonthTaskResult = { status: 'exists' | 'created'; task: AzureWorkItem; story: AzureWorkItem; storyCreated: boolean }
export async function ensureMonthTask(config: AzureConfig, pat: string, featureId: number, assignee: string, monthLabel = currentIndiaMonth(), transport: AzureTransport = requestAzure): Promise<MonthTaskResult> {
  if (!pat.trim()) throw new Error('Enter a Work Items (Read & Write) PAT.')
  const email = assignee.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set your Azure DevOps email (Feature creator email on the Time Writing connection) first.')
  const source = await transport({ ...config, pat, operation: 'items', ids: [featureId] }) as { value?: RawItem[] }
  const raw = source.value?.find((item) => item.id === featureId)
  if (!raw || raw.fields['System.WorkItemType'] !== 'Feature') throw new Error(`#${featureId} is not an accessible Feature.`)
  const feature = mapAzureWorkItem(raw, config)
  const storyTitle = `${feature.title.trim()} - Time Writing`, taskTitle = `${monthLabel} | ${feature.title.trim()}`
  if (taskTitle.length > 255 || storyTitle.length > 255) throw new Error(`#${feature.id}: the Feature title is too long for an automatic child title.`)
  // Every story under the Feature and its Tasks are re-read now, so a month Task of mine with any title or delimiter,
  // under any story, is found and reused rather than duplicated.
  const children = await directChildren(config, pat, feature.id, transport)
  const stories = []
  for (const story of children.filter((item) => item.workItemType === 'User Story' && item.state.toLowerCase() !== 'removed')) stories.push({ story, tasks: await directChildren(config, pat, story.id, transport) })
  const plan = planMonthStory(stories, children.filter((item) => item.workItemType === 'Task'), timeWritingMonth(monthLabel) ?? '', storyTitle, (item) => item.assignedToEmail === email)
  if (plan.status === 'exists') return { status: 'exists', task: plan.task, story: plan.story ?? feature, storyCreated: false }
  if (plan.status === 'conflict') throw new Error(`#${feature.id} has ${plan.stories.length} possible Time Writing stories (${plan.stories.map((item) => `#${item.id}`).join(', ')}). Add your month Task under the right one in Azure DevOps.`)
  let story: AzureWorkItem, storyCreated = false
  if (plan.status === 'use') story = plan.story
  else { story = await createChildItem(config, pat, feature, 'User Story', storyTitle, feature.iterationPath, undefined, transport); storyCreated = true }
  const task = await createChildItem(config, pat, story, 'Task', taskTitle, config.project, email, transport)
  return { status: 'created', task, story, storyCreated }
}

async function createChildItem(config: AzureConfig, pat: string, parent: AzureWorkItem, type: 'User Story' | 'Task', title: string, iterationPath: string, assignedTo: string | undefined, transport: AzureTransport) {
  const request: AzureRequest = { ...config, pat, operation: 'create-child', workItemType: type, feature: { parentId: parent.id, title, description: '', acceptanceCriteria: '', areaPath: parent.areaPath, iterationPath, ...(assignedTo ? { assignedTo } : {}) } }
  await transport({ ...request, validateOnly: true })
  const response = await transport({ ...request, validateOnly: false }) as RawItem
  if (!Number.isSafeInteger(response.id) || response.id < 1) throw new Error(`${type} creation under #${parent.id} could not be confirmed. Check it in Azure DevOps before retrying.`)
  const read = await transport({ ...config, pat, operation: 'items', ids: [response.id] }) as { value?: RawItem[] }
  const raw = read.value?.find((item) => item.id === response.id)
  if (!raw) throw new Error(`${type} #${response.id} was created but could not be read back.`)
  const item = mapAzureWorkItem(raw, config)
  if (item.parentId !== parent.id || item.workItemType !== type || item.title.trim() !== title) throw new Error(`${type} #${response.id} was created but does not match what was requested. Check it in Azure DevOps.`)
  return item
}

export async function completeReleaseHierarchy(config: AzureConfig, pat: string, featureId: number, kind: 'PU' | 'Release', milestones?: string[], monthLabel = currentIndiaMonth(), transport: AzureTransport = requestAzure, storyIterationPath?: string) {
  const items: AzureWorkItem[] = []
  try {
    if (!pat.trim()) throw new Error('Enter a Work Items (Read & Write) PAT.')
    const source = await transport({ ...config, pat, operation: 'items', ids: [featureId] }) as { value: RawItem[] }
    const raw = source.value?.find((item) => item.id === featureId)
    if (!raw || raw.fields['System.WorkItemType'] !== 'Feature') throw new Error('The selected item is not an accessible Feature.')
    const feature = mapAzureWorkItem(raw, config)
    items.push(feature)
    const titles = releaseHierarchyTitles(feature.title, kind, monthLabel)
    const selected = milestones ?? titles.reviews.map((review) => review.milestone)
    if (selected.some((milestone) => !titles.reviews.some((review) => review.milestone === milestone))) throw new Error('Unsupported milestone selection for this release classification.')
    const children = await directChildren(config, pat, feature.id, transport)
    for (const review of titles.reviews.filter((review) => selected.includes(review.milestone))) items.push(await ensureChild(config, pat, feature, 'User Story', review.title, children, transport, storyIterationPath || feature.iterationPath))
    const timeWriting = await ensureChild(config, pat, feature, 'User Story', titles.timeWriting, children, transport, storyIterationPath || feature.iterationPath)
    items.push(timeWriting)
    const tasks = await directChildren(config, pat, timeWriting.id, transport)
    items.push(await ensureChild(config, pat, timeWriting, 'Task', titles.task, tasks, transport, config.project))
    return { feature, items }
  } catch (failure) {
    throw new HierarchyCreationError(failure instanceof Error ? failure.message : 'Unable to complete the release hierarchy.', items)
  }
}

export async function createAzureReleaseHierarchy(config: AzureConfig, pat: string, input: FeatureInput, kind: 'PU' | 'Release', milestones?: string[], monthLabel = currentIndiaMonth(), transport: AzureTransport = requestAzure) {
  const titles = releaseHierarchyTitles(input.title.trim(), kind, monthLabel)
  if ([...titles.reviews.map((review) => review.title), titles.timeWriting, titles.task].some((title) => title.length > 255)) throw new Error('An automatic child title exceeds 255 characters. Shorten the Feature title.')
  if (milestones?.some((milestone) => !titles.reviews.some((review) => review.milestone === milestone))) throw new Error('Unsupported milestone selection for this release classification.')
  const feature = await createAzureFeature(config, pat, input, transport)
  try {
    const bundle = await completeReleaseHierarchy(config, pat, feature.id, kind, milestones, monthLabel, transport, input.storyIterationPath)
    // Initial effort is deliberately saved on the month-named Task, not the User Story.
    if (input.taskOriginalEstimate != null || input.taskCompletedWork != null) {
      const task = bundle.items.find((item) => item.workItemType === 'Task')
      if (!task) throw new Error('Time Writing Task was not created.')
      const updated = await updateAzureTimeWritingEffort(config, pat, task.id, input.taskOriginalEstimate, input.taskCompletedWork, false, transport)
      return { feature: bundle.feature, items: mergeAzureWorkItems(bundle.items, [updated]) }
    }
    return bundle
  }
  catch (failure) {
    const partial = failure instanceof HierarchyCreationError ? failure.createdItems : []
    const items = mergeAzureWorkItems([feature], partial)
    throw new HierarchyCreationError(`Feature #${feature.id} exists. ${failure instanceof Error ? failure.message : 'Child creation stopped.'} Use Complete children on that Feature after checking the source; do not recreate the Feature.`, items)
  }
}

// Constrained write: only System.State and System.IterationPath can change through this path.
export function workItemUpdatePatch(request: Pick<AzureRequest, 'state' | 'iterationPath'>) {
  const patch: { op: 'add'; path: string; value: string }[] = []
  if (request.state != null) patch.push({ op: 'add', path: '/fields/System.State', value: request.state })
  if (request.iterationPath != null) patch.push({ op: 'add', path: '/fields/System.IterationPath', value: request.iterationPath })
  return patch
}

// Changes a work item's state and/or iteration path, then reads it back and checks the change landed.
export async function updateAzureWorkItem(config: AzureConfig, pat: string, workItemId: number, update: { state?: string; iterationPath?: string }, transport: AzureTransport = requestAzure): Promise<AzureWorkItem> {
  if (!pat.trim()) throw new Error('Enter a Work Items (Read & Write) PAT.')
  if (!Number.isSafeInteger(workItemId) || workItemId < 1) throw new Error('Invalid work item.')
  const state = update.state?.trim(), iterationPath = update.iterationPath?.trim()
  if (!state && !iterationPath) throw new Error('Nothing to change.')
  if (state != null && (state.length > 64 || !/^[\p{L}\p{N} _-]+$/u.test(state))) throw new Error('Invalid state.')
  if (iterationPath != null && (iterationPath.length > 4096 || /\p{Cc}/u.test(iterationPath))) throw new Error('Invalid iteration path.')
  await transport({ ...config, pat, operation: 'update-work-item', workItemId, ...(state ? { state } : {}), ...(iterationPath ? { iterationPath } : {}) })
  const read = await transport({ ...config, pat, operation: 'items', ids: [workItemId] }) as { value?: RawItem[] }
  const raw = read.value?.find((item) => item.id === workItemId)
  if (!raw) throw new Error(`#${workItemId} was updated but could not be read back. Check it in Azure DevOps.`)
  const item = mapAzureWorkItem(raw, config)
  if ((state && item.state.toLowerCase() !== state.toLowerCase()) || (iterationPath && item.iterationPath.toLowerCase() !== iterationPath.toLowerCase())) throw new Error(`#${workItemId} was saved but Azure DevOps reports ${item.state} · ${item.iterationPath}. Check its rules in Azure DevOps.`)
  return item
}

// api-version negotiation: an explicit version is used as is; otherwise 7.1, then 6.0 and 5.0 for older Azure DevOps
// Server releases. The version that worked is remembered per collection for the rest of the session.
const detectedVersions = new Map<string, string>()
export function versionsToTry(config: Pick<AzureConfig, 'apiVersion' | 'organization' | 'baseUrl'>) {
  if (config.apiVersion && apiVersionOf(config) === config.apiVersion) return [config.apiVersion]
  const known = detectedVersions.get(collectionUrl(config).toLowerCase())
  return known ? [known] : ['7.1', '6.0', '5.0']
}
export const isApiVersionError = (text: string) => /api[- ]?version|version of the api|VssVersionOutOfRange|out of range/i.test(text) && /version/i.test(text)

// Set by the app from the viewer's access roles; while it returns false, nothing is changed in Azure DevOps.
let writesAllowed: () => boolean = () => true
export function guardAzureWrites(check: () => boolean) { writesAllowed = check }
export const changesAzure = (operation: AzureRequest['operation']) => operation === 'create-feature' || operation === 'create-child' || operation === 'update-time-writing-effort' || operation === 'update-work-item'

export async function requestAzure(request: AzureRequest): Promise<unknown> {
  if (changesAzure(request.operation) && !writesAllowed()) throw new Error('Your role does not allow changes in Azure DevOps. An Admin can change this in Settings → Access.')
  if (window.azureDevOps) return window.azureDevOps.request(request)
  // identity: who the PAT belongs to (connectionData, organization or collection level, a preview API).
  const identity = request.operation === 'identity'
  const base = identity ? collectionUrl(request) : projectApiBase(request)
  const updating = request.operation === 'update-time-writing-effort' || request.operation === 'update-work-item'
  const writing = request.operation === 'create-feature' || request.operation === 'create-child' || updating
  const readingMetadata = identity || request.operation === 'backlog-epics' || request.operation === 'areas' || request.operation === 'iterations' || request.operation === 'iteration-tree' || request.operation === 'fields'
  const create = request.operation === 'create-feature' || request.operation === 'create-child'
  const endpoint = identity ? '_apis/connectionData' : updating ? `_apis/wit/workitems/${request.workItemId}` : create ? `_apis/wit/workitems/$${request.operation === 'create-feature' ? 'Feature' : encodeURIComponent(request.workItemType!)}` : request.operation === 'backlog-epics' ? `${encodeURIComponent(request.team)}/_apis/work/backlogs/Microsoft.EpicCategory/workItems` : request.operation === 'iteration-tree' ? '_apis/wit/classificationnodes/iterations' : request.operation === 'fields' ? '_apis/wit/fields' : readingMetadata ? `${encodeURIComponent(request.team)}/_apis/work/teamsettings/${request.operation === 'areas' ? 'teamfieldvalues' : 'iterations'}` : request.operation === 'query' ? '_apis/wit/wiql' : '_apis/wit/workitemsbatch'
  const body = request.operation === 'update-work-item' ? workItemUpdatePatch(request) : request.operation === 'update-time-writing-effort' ? [{ ...(request.planHours == null ? {} : { op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.OriginalEstimate', value: request.planHours }) }, { ...(request.actualHours == null ? {} : { op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.CompletedWork', value: request.actualHours }) }, ...(request.tags ? [{ op: 'add', path: '/fields/System.Tags', value: request.tags }] : [])].filter(patch => 'op' in patch) : create ? featurePatch(request, request.feature!) : request.operation === 'query' ? { query: request.query } : { ids: request.ids, errorPolicy: 'Fail', $expand: 'Relations' }
  const versions = versionsToTry(request)
  let response: Response | undefined
  for (const [attempt, version] of versions.entries()) {
    try {
      const url = `${base}/${endpoint}?api-version=${identity ? `${version.replace(/-preview.*$/, '')}-preview` : version}${request.operation === 'query' ? '&$top=1000' : ''}${request.operation === 'iteration-tree' ? '&$depth=10' : ''}${create ? `&validateOnly=${request.validateOnly === true}` : ''}`
      response = await fetch(url, {
        method: readingMetadata ? 'GET' : updating ? 'PATCH' : 'POST', redirect: 'error', credentials: 'omit',
        headers: { Authorization: `Basic ${btoa(`:${request.pat}`)}`, 'Content-Type': writing ? 'application/json-patch+json' : 'application/json', Accept: 'application/json' },
        body: readingMetadata ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(45000),
      })
    } catch {
      const host = new URL(base).hostname
      throw new Error(updating ? `The update of #${request.workItemId} could not be confirmed. Check it in Azure DevOps before retrying.` : writing && !request.validateOnly ? 'The create request could not be confirmed. Check the Azure DevOps backlog before retrying; a Feature may have been created.'
        : host === 'dev.azure.com' ? 'Azure DevOps could not be reached. Check your network/VPN. If browser cross-origin access is blocked, use the desktop package with the same PAT.'
          : `The browser could not reach ${host}. On-premises servers usually block requests from other websites (CORS) or use a company certificate the browser page cannot use. Use the Windows app for on-prem connections (on VPN); it sends requests itself.`)
    }
    // An older Azure DevOps Server rejects a newer api-version with HTTP 400; try the next lower version once.
    if (response.status === 400 && attempt < versions.length - 1) {
      const text = await response.clone().text().catch(() => '')
      if (isApiVersionError(text)) continue
    }
    if (response.ok && attempt > 0) detectedVersions.set(collectionUrl(request).toLowerCase(), version)
    break
  }
  if (!response) throw new Error('Azure DevOps could not be reached.')
  if (response.status === 401) throw new Error('The PAT was rejected or has expired. Check your PAT.')
  if (response.status === 403) throw new Error(`Access denied. Check project access and PAT Work Items (${writing ? 'Read & Write' : 'Read'}) scope.`)
  if (writing && (response.status === 400 || response.status === 422)) {
    const detail = await response.json().catch(() => ({})) as { message?: string }
    throw new Error(`Azure DevOps rejected the work item: ${(detail.message ?? 'Check required fields and project rules.').replaceAll(request.pat, '[redacted]').slice(0, 1200)}`)
  }
  if (response.status === 404) throw new Error(`Not found at ${projectApiBase(request).replace(/^https:\/\//, '')}. Check the organization / collection, project and team names.`)
  if (!response.ok && response.status === 400) {
    const detail = await response.json().catch(() => ({})) as { message?: string }
    if (detail.message) throw new Error(`Azure DevOps refused the request: ${detail.message.replaceAll(request.pat, '[redacted]').slice(0, 600)}`)
  }
  if (!response.ok) throw new Error(updating ? `Update of #${request.workItemId} returned ${response.status}. Check it in Azure DevOps.` : writing && !request.validateOnly ? `Create request returned ${response.status}. Check the backlog before retrying to avoid duplicates.` : `Azure DevOps request failed (${response.status}). No data was imported.`)
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) throw new Error('Azure DevOps returned a sign-in page. Check the PAT and organization access.')
  return response.json()
}

// Display names of the project's work-item fields (reference name → name), for query-view column headings.
// Read-only; when it fails the view falls back to readable reference names.
export async function readFieldNames(config: AzureConfig, pat: string, transport: AzureTransport = requestAzure): Promise<Record<string, string>> {
  try {
    const response = await transport({ ...config, team: config.team || config.project, pat, operation: 'fields' }) as { value?: { referenceName?: unknown; name?: unknown }[] }
    return Object.fromEntries((response.value ?? []).flatMap((field) => typeof field.referenceName === 'string' && typeof field.name === 'string' ? [[field.referenceName, field.name]] : []))
  } catch { return {} }
}
