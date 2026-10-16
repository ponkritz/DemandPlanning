import type { AzureWorkItem } from './domain'

export interface AzureConfig { organization: string; project: string; team: string }
export interface AzureRequest extends AzureConfig {
  operation: 'areas' | 'iterations' | 'query' | 'items' | 'create-feature' | 'create-child'
  pat: string
  query?: string
  ids?: number[]
  feature?: FeatureInput & { areaPath: string }
  validateOnly?: boolean
  workItemType?: 'User Story' | 'Task'
}
export interface FeatureInput { parentId: number; title: string; description: string; acceptanceCriteria: string; areaPath?: string; iterationPath?: string; assignedTo?: string; targetDate?: string }
export function featureDescription(kind: 'PU' | 'Release') {
  return kind === 'PU' ? 'Feature DoD: DT finished. This is a PU release.' : 'Feature DoD: IQOQ finished and Checklist uploaded into the Feature.'
}
export interface AzureFetchResult { items: AzureWorkItem[]; areaPaths: string[]; asOf: string }
interface RawItem { id: number; fields: Record<string, unknown>; relations?: { rel: string; url: string }[] }
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
    parentId: typeof fields['System.Parent'] === 'number' ? fields['System.Parent'] : parentFromRelation(item),
    targetDate: date('Microsoft.VSTS.Scheduling.TargetDate'), closedDate: date('Microsoft.VSTS.Common.ClosedDate'),
    changedDate: date('System.ChangedDate'), tags: text('System.Tags'),
    url: `https://dev.azure.com/${encodeURIComponent(config.organization)}/${encodeURIComponent(config.project)}/_workitems/edit/${item.id}`,
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
  const parentResponse = await transport({ ...config, pat, operation: 'items', ids: [feature.parentId] }) as { value: RawItem[] }
  const parent = parentResponse.value?.find((item) => item.id === feature.parentId)
  if (!parent || parent.fields['System.WorkItemType'] !== 'Epic') throw new Error('The selected parent is not an accessible Epic. Refresh and select an Epic.')
  const parentProject = parent.fields['System.TeamProject']
  if (typeof parentProject === 'string' && parentProject.toLowerCase() !== config.project.toLowerCase()) throw new Error('The parent Epic belongs to a different project.')
  const areaPath = feature.areaPath?.trim() || parent.fields['System.AreaPath']
  if (typeof areaPath !== 'string' || !areaPath) throw new Error('The parent Epic has no area path. Check it in Azure DevOps.')
  let iterationPath = feature.iterationPath?.trim()
  if (iterationPath && !iterationPath.includes('\\')) {
    const iterations = await transport({ ...config, pat, operation: 'iterations' }) as { value?: { name: string; path: string }[] }
    const matches = iterations.value?.filter((iteration) => iteration.name.toLowerCase() === iterationPath!.toLowerCase()) ?? []
    if (matches.length !== 1) throw new Error(`Iteration "${iterationPath}" ${matches.length ? 'is ambiguous' : 'was not found in team iterations'}. Enter its full iteration path from Azure DevOps.`)
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
    const mapped = mapAzureWorkItem(item, config)
    if (mapped.parentId !== feature.parentId || mapped.workItemType !== 'Feature') throw new Error('Parent/type verification failed.')
    if (mapped.areaPath.toLowerCase() !== areaPath.toLowerCase() || (iterationPath && mapped.iterationPath.toLowerCase() !== iterationPath.toLowerCase())) throw new Error('Area/iteration verification failed.')
    return mapped
  } catch {
    throw new Error(`Feature #${created.id} was created, but its parent, area or iteration could not be verified. Check it in Azure DevOps before creating another.`)
  }
}

const htmlText = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '<br>')

export function featurePatch(config: AzureConfig, feature: FeatureInput & { areaPath: string }) {
  const patch: { op: string; path: string; value: unknown }[] = [
    { op: 'add', path: '/fields/System.Title', value: feature.title },
    { op: 'add', path: '/fields/System.AreaPath', value: feature.areaPath },
    { op: 'add', path: '/fields/System.Description', value: htmlText(feature.description) },
    { op: 'add', path: '/relations/-', value: { rel: 'System.LinkTypes.Hierarchy-Reverse', url: `https://dev.azure.com/${encodeURIComponent(config.organization)}/${encodeURIComponent(config.project)}/_apis/wit/workItems/${feature.parentId}` } },
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

async function ensureChild(config: AzureConfig, pat: string, parent: AzureWorkItem, type: 'User Story' | 'Task', title: string, existing: AzureWorkItem[], transport: AzureTransport, iterationPath = parent.iterationPath) {
  const matches = existing.filter((item) => item.parentId === parent.id && item.workItemType === type && item.title.trim() === title)
  if (matches.length > 1) throw new Error(`Multiple matching ${type} items already exist under #${parent.id}. Review duplicates before continuing.`)
  if (matches.length === 1) {
    if (matches[0].areaPath !== parent.areaPath || matches[0].iterationPath !== iterationPath) throw new Error(`Existing ${type} #${matches[0].id} has a different area or iteration. Review it before continuing.`)
    return matches[0]
  }
  if (title.length > 255) throw new Error('An automatic child title exceeds 255 characters. Shorten the Feature title.')
  const request: AzureRequest = { ...config, pat, operation: 'create-child', workItemType: type,
    feature: { parentId: parent.id, title, description: '', acceptanceCriteria: '', areaPath: parent.areaPath, iterationPath } }
  await transport({ ...request, validateOnly: true })
  const response = await transport({ ...request, validateOnly: false }) as RawItem
  if (!Number.isSafeInteger(response.id) || response.id < 1) throw new Error(`${type} creation could not be confirmed. Check children under #${parent.id} before retrying.`)
  try {
    const read = await transport({ ...config, pat, operation: 'items', ids: [response.id] }) as { value: RawItem[] }
    const raw = read.value?.find((item) => item.id === response.id)
    if (!raw) throw new Error('Missing work item.')
    const item = mapAzureWorkItem(raw, config)
    if (item.parentId !== parent.id || item.workItemType !== type || item.areaPath !== parent.areaPath || item.iterationPath !== iterationPath) throw new Error('Child verification failed.')
    return item
  } catch { throw new Error(`${type} #${response.id} was created but could not be verified. Check the source before using Complete children.`) }
}

export async function completeReleaseHierarchy(config: AzureConfig, pat: string, featureId: number, kind: 'PU' | 'Release', milestones?: string[], monthLabel = currentIndiaMonth(), transport: AzureTransport = requestAzure) {
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
    for (const review of titles.reviews.filter((review) => selected.includes(review.milestone))) items.push(await ensureChild(config, pat, feature, 'User Story', review.title, children, transport))
    const timeWriting = await ensureChild(config, pat, feature, 'User Story', titles.timeWriting, children, transport)
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
  try { return await completeReleaseHierarchy(config, pat, feature.id, kind, milestones, monthLabel, transport) }
  catch (failure) {
    const partial = failure instanceof HierarchyCreationError ? failure.createdItems : []
    const items = mergeAzureWorkItems([feature], partial)
    throw new HierarchyCreationError(`Feature #${feature.id} exists. ${failure instanceof Error ? failure.message : 'Child creation stopped.'} Use Complete children on that Feature after checking the source; do not recreate the Feature.`, items)
  }
}

async function requestAzure(request: AzureRequest): Promise<unknown> {
  if (window.azureDevOps) return window.azureDevOps.request(request)
  const base = `https://dev.azure.com/${encodeURIComponent(request.organization)}/${encodeURIComponent(request.project)}`
  const writing = request.operation === 'create-feature' || request.operation === 'create-child'
  const readingMetadata = request.operation === 'areas' || request.operation === 'iterations'
  const endpoint = writing ? `_apis/wit/workitems/$${request.operation === 'create-feature' ? 'Feature' : encodeURIComponent(request.workItemType!)}` : readingMetadata ? `${encodeURIComponent(request.team)}/_apis/work/teamsettings/${request.operation === 'areas' ? 'teamfieldvalues' : 'iterations'}` : request.operation === 'query' ? '_apis/wit/wiql' : '_apis/wit/workitemsbatch'
  const body = writing ? featurePatch(request, request.feature!) : request.operation === 'query' ? { query: request.query } : { ids: request.ids, errorPolicy: 'Fail', $expand: 'Relations' }
  let response: Response
  try {
    response = await fetch(`${base}/${endpoint}?api-version=7.1${request.operation === 'query' ? '&$top=1000' : ''}${writing ? `&validateOnly=${request.validateOnly === true}` : ''}`, {
      method: readingMetadata ? 'GET' : 'POST', redirect: 'error', credentials: 'omit',
      headers: { Authorization: `Basic ${btoa(`:${request.pat}`)}`, 'Content-Type': writing ? 'application/json-patch+json' : 'application/json', Accept: 'application/json' },
      body: readingMetadata ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(45000),
    })
  } catch { throw new Error(writing && !request.validateOnly ? 'The create request could not be confirmed. Check the Azure DevOps backlog before retrying; a Feature may have been created.' : 'Azure DevOps could not be reached. Check your network/VPN. If browser cross-origin access is blocked, use the desktop package with the same PAT.') }
  if (response.status === 401) throw new Error('The PAT was rejected or has expired. Check your PAT.')
  if (response.status === 403) throw new Error(`Access denied. Check project access and PAT Work Items (${writing ? 'Read & Write' : 'Read'}) scope.`)
  if (writing && (response.status === 400 || response.status === 422)) {
    const detail = await response.json().catch(() => ({})) as { message?: string }
    throw new Error(`Azure DevOps rejected the work item: ${(detail.message ?? 'Check required fields and project rules.').replaceAll(request.pat, '[redacted]').slice(0, 1200)}`)
  }
  if (response.status === 404) throw new Error('Project or team not found. Check the project URL and team name.')
  if (!response.ok) throw new Error(writing && !request.validateOnly ? `Create request returned ${response.status}. Check the backlog before retrying to avoid duplicates.` : `Azure DevOps request failed (${response.status}). No data was imported.`)
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) throw new Error('Azure DevOps returned a sign-in page. Check the PAT and organization access.')
  return response.json()
}
