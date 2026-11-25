// Reading from Azure DevOps: iterations, the backlog fetch and its mapping to work items, field names and team members.
import { isFinishedState } from './workStates.ts'
import { utcToday } from './businessTime.ts'
import { fillClosedDates } from './closedHistory.ts'
import type { AzureWorkItem } from './domain'
import { collectionUrl, isCloudBase, normalizeBaseUrl, projectApiBase, requestAzure, type AzureConfig, type AzureRequest, type AzureTransport } from './azureClient.ts'

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

function scheduledIterationPairs(iterations: AzureIteration[], date: Date, schedule: 'current' | 'future') {
  const today = utcToday(date) // the current Sprint / PI is decided in UTC (NAV-51)
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
export interface RawItem { id: number; rev?: number; fields: Record<string, unknown>; relations?: { rel: string; url: string }[] }
interface TeamAreas { field: { referenceName: string }; values: { value: string; includeChildren: boolean }[] }
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

export const literal = (value: string) => `'${value.replaceAll("'", "''")}'`

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
  // Owner decision 10: finished items without a Closed Date get it from their history.
  const filled = await fillClosedDates(items, request)
  return { items: filled, areaPaths, asOf, scope: { organization: config.organization, project: config.project, team: config.team, itemKeys: items.map((item) => item.key), areaPaths, fetchedAt: asOf } }
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
export const identityName = (value: unknown) => typeof value === 'string' ? value : value && typeof value === 'object' && 'displayName' in value ? String((value as { displayName: unknown }).displayName) : ''

// Predecessor / Successor links (CON-81): Azure DevOps returns them with every work item read ($expand Relations) as the
// Dependency link type — Successor = System.LinkTypes.Dependency-Forward, Predecessor = …-Reverse. Kept as fields of
// their own, "123, 456", so a query view can show, sort, search and export them like any column.
export const successorRef = 'Links.Successor', predecessorRef = 'Links.Predecessor'
const linkedIds = (item: Pick<RawItem, 'relations'>, rel: string) => [...new Set((item.relations ?? []).filter((link) => link.rel === rel).map((link) => Number(/\/workItems\/(\d+)\/?$/i.exec(link.url)?.[1])).filter((id) => Number.isSafeInteger(id) && id > 0))].sort((a, b) => a - b)
export function dependencyFields(item: Pick<RawItem, 'relations'>): Record<string, string> {
  const successors = linkedIds(item, 'System.LinkTypes.Dependency-Forward'), predecessors = linkedIds(item, 'System.LinkTypes.Dependency-Reverse')
  return { ...(successors.length ? { [successorRef]: successors.join(', ') } : {}), ...(predecessors.length ? { [predecessorRef]: predecessors.join(', ') } : {}) }
}

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
    targetDate: date('Microsoft.VSTS.Scheduling.TargetDate'),
    // Owner decision 10: a finished item without a Closed Date takes the day it entered that state (State Change Date,
    // else Resolved Date); when neither is there, fillClosedDates reads its history.
    ...(closedOf(text('System.State'), date('Microsoft.VSTS.Common.ClosedDate'), date('Microsoft.VSTS.Common.StateChangeDate'), date('Microsoft.VSTS.Common.ResolvedDate'))),
    changedDate: date('System.ChangedDate'), tags: text('System.Tags'),
    url: `${projectApiBase(config)}/_workitems/edit/${item.id}`,
    syncedAt: new Date().toISOString(),
  }
}

function closedOf(state: string, closed?: string, stateChange?: string, resolved?: string): Pick<AzureWorkItem, 'closedDate' | 'closedDateFrom'> {
  if (closed) return { closedDate: closed }
  if (!isFinishedState(state)) return {}
  const fallback = stateChange ?? resolved
  return fallback ? { closedDate: fallback, closedDateFrom: stateChange ? 'state-change' : 'resolved' } : {}
}

function parentFromRelation(item: RawItem) {
  const relation = item.relations?.find((link) => link.rel === 'System.LinkTypes.Hierarchy-Reverse')
  const match = relation && /\/workitems\/(\d+)$/i.exec(relation.url)
  return match ? Number(match[1]) : undefined
}


// Display names of the project's work-item fields (reference name → name), for query-view column headings.
// Read-only; when it fails the view falls back to readable reference names.
export async function readFieldNames(config: AzureConfig, pat: string, transport: AzureTransport = requestAzure): Promise<Record<string, string>> {
  try {
    const response = await transport({ ...config, team: config.team || config.project, pat, operation: 'fields' }) as { value?: { referenceName?: unknown; name?: unknown }[] }
    return Object.fromEntries((response.value ?? []).flatMap((field) => typeof field.referenceName === 'string' && typeof field.name === 'string' ? [[field.referenceName, field.name]] : []))
  } catch { return {} }
}

// The members of the connection's team (CAP-30): read only, for Admin → People & roles → People. Needs a PAT that may read the
// project's teams (Project and Team, Read); names and emails only.
export async function fetchTeamMembers(config: AzureConfig, pat: string, transport: AzureTransport = requestAzure) {
  const members = (await readTeamIdentities(config, pat, transport)).map(({ name, email }) => ({ name, ...(email ? { email } : {}) }))
  return [...new Map(members.map((member) => [member.name, member])).values()].sort((a, b) => a.name.localeCompare(b.name))
}
// LST-04, LST-06: the same read, every member kept with their Azure DevOps identity id (identity.id, a GUID): two members
// with the same display name stay two. The id is the stable key of the built-in lists; the email is for the screen only.
export async function readTeamIdentities(config: AzureConfig, pat: string, transport: AzureTransport = requestAzure): Promise<{ name: string; id?: string; email?: string }[]> {
  if (!config.organization || !config.project || !config.team) throw new Error('The Time Writing connection needs an organization, project and team.')
  if (!pat.trim()) throw new Error('Enter the PAT of the Time Writing connection first.')
  const response = await transport({ ...config, pat: pat.trim(), operation: 'team-members' }) as { value?: { identity?: { id?: unknown; displayName?: unknown; uniqueName?: unknown; isContainer?: unknown } }[] }
  return (response.value ?? []).flatMap(({ identity }) => identity && identity.isContainer !== true && typeof identity.displayName === 'string' && identity.displayName.trim() ? [{ name: identity.displayName.trim().slice(0, 120), ...(typeof identity.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identity.id.trim()) ? { id: identity.id.trim().toLowerCase() } : {}), ...(typeof identity.uniqueName === 'string' && /^[^\s@]+@[^\s@]+$/.test(identity.uniqueName) ? { email: identity.uniqueName.trim().toLowerCase().slice(0, 200) } : {}) }] : [])
}
