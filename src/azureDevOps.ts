import type { AzureWorkItem } from './domain'

export interface AzureConfig { organization: string; project: string; team: string }
export interface AzureRequest extends AzureConfig {
  operation: 'backlog-epics' | 'identity' | 'areas' | 'iterations' | 'iteration-tree' | 'query' | 'items' | 'create-feature' | 'create-child'
  pat: string
  query?: string
  ids?: number[]
  feature?: FeatureInput & { areaPath: string }
  validateOnly?: boolean
  workItemType?: 'User Story' | 'Task'
}
export interface FeatureInput { parentId: number; title: string; description: string; acceptanceCriteria: string; areaPath?: string; iterationPath?: string; assignedTo?: string; targetDate?: string; assignToCreator?: boolean; storyIterationPath?: string }
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
export function currentIterationPairs(iterations: AzureIteration[], date = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  const active = iterations.filter((item) => {
    const start = item.attributes?.startDate?.slice(0, 10), finish = item.attributes?.finishDate?.slice(0, 10)
    return start && finish && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(finish) && start <= today && today <= finish
  })
  const under = (child: string, parent: string) => child.toLowerCase().startsWith(`${parent.toLowerCase()}\\`)
  const pairs = active.filter((item) => !active.some((child) => under(child.path, item.path))).flatMap((sprint) => {
    const ancestors = active.filter((pi) => under(sprint.path, pi.path) && pi.path.includes('\\')).sort((a, b) => b.path.length - a.path.length)
    return ancestors[0] ? [{ pi: ancestors[0], sprint }] : []
  })
  const teamPairs = pairs.filter((pair) => pair.sprint.teamConfigured)
  return teamPairs.length ? teamPairs : pairs
}

export async function readAzureCreator(config: AzureConfig, pat: string, transport: AzureTransport = requestAzure) {
  const response = await transport({ ...config, pat, operation: 'identity' }) as { authenticatedUser?: { id?: string; providerDisplayName?: string; properties?: Record<string, { $value?: string }> } }
  const user = response.authenticatedUser
  if (!user?.id || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(user.id)) throw new Error('Unable to identify the PAT owner. No Feature was created. Check the connection identity.')
  return { id: user.id, name: user.providerDisplayName || user.properties?.Account?.$value || user.id }
}
export interface AzureBacklogScope extends AzureConfig { itemKeys: string[]; areaPaths: string[]; fetchedAt: string }
export interface AzureFetchResult { items: AzureWorkItem[]; areaPaths: string[]; asOf: string; scope: AzureBacklogScope }
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
  return Boolean(left && right && ['organization', 'project', 'team'].every((key) => typeof left[key as keyof AzureConfig] === 'string' && typeof right[key as keyof AzureConfig] === 'string' && left[key as keyof AzureConfig].toLowerCase() === right[key as keyof AzureConfig].toLowerCase()))
}

export function savedBacklogItems(items: AzureWorkItem[], scope: AzureBacklogScope | undefined, config: AzureConfig | null) {
  if (!sameAzureScope(scope, config) || !Array.isArray(scope?.itemKeys)) return []
  const keys = new Set(scope.itemKeys)
  return items.filter((item) => keys.has(item.key) && item.organization.toLowerCase() === config!.organization.toLowerCase() && item.project.toLowerCase() === config!.project.toLowerCase() && item.state.trim().toLowerCase() !== 'removed')
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
    description: text('System.Description'),
    storyPoints: typeof fields['Microsoft.VSTS.Scheduling.StoryPoints'] === 'number' && Number.isFinite(fields['Microsoft.VSTS.Scheduling.StoryPoints']) ? fields['Microsoft.VSTS.Scheduling.StoryPoints'] as number : undefined,
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
  const creator = feature.assignToCreator ? await readAzureCreator(config, pat, transport) : null
  if (creator) feature = { ...feature, assignedTo: creator.id }
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
    if (creator && (item.fields['System.AssignedTo'] as { id?: string } | undefined)?.id?.toLowerCase() !== creator.id.toLowerCase()) throw new Error('Creator assignment verification failed.')
    const mapped = mapAzureWorkItem(item, config)
    if (mapped.parentId !== feature.parentId || mapped.workItemType !== 'Feature') throw new Error('Parent/type verification failed.')
    if (mapped.areaPath.toLowerCase() !== areaPath.toLowerCase() || (iterationPath && mapped.iterationPath.toLowerCase() !== iterationPath.toLowerCase())) throw new Error('Area/iteration verification failed.')
    return mapped
  } catch {
    throw new Error(`Feature #${created.id} was created, but its parent, area, iteration or assignee could not be verified. Check it in Azure DevOps before creating another.`)
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
  try { return await completeReleaseHierarchy(config, pat, feature.id, kind, milestones, monthLabel, transport, input.storyIterationPath) }
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
  const readingMetadata = request.operation === 'backlog-epics' || request.operation === 'identity' || request.operation === 'areas' || request.operation === 'iterations' || request.operation === 'iteration-tree'
  const endpoint = writing ? `_apis/wit/workitems/$${request.operation === 'create-feature' ? 'Feature' : encodeURIComponent(request.workItemType!)}` : request.operation === 'backlog-epics' ? `${encodeURIComponent(request.team)}/_apis/work/backlogs/Microsoft.EpicCategory/workItems` : request.operation === 'iteration-tree' ? '_apis/wit/classificationnodes/iterations' : readingMetadata ? `${encodeURIComponent(request.team)}/_apis/work/teamsettings/${request.operation === 'areas' ? 'teamfieldvalues' : 'iterations'}` : request.operation === 'query' ? '_apis/wit/wiql' : '_apis/wit/workitemsbatch'
  const body = writing ? featurePatch(request, request.feature!) : request.operation === 'query' ? { query: request.query } : { ids: request.ids, errorPolicy: 'Fail', $expand: 'Relations' }
  let response: Response
  try {
    const url = request.operation === 'identity' ? `https://dev.azure.com/${encodeURIComponent(request.organization)}/_apis/connectionData?api-version=7.1-preview.1` : `${base}/${endpoint}?api-version=7.1${request.operation === 'query' ? '&$top=1000' : ''}${request.operation === 'iteration-tree' ? '&$depth=10' : ''}${writing ? `&validateOnly=${request.validateOnly === true}` : ''}`
    response = await fetch(url, {
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
