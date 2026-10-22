import type { AzureWorkItem } from './domain'
import { mapAzureWorkItem, requestAzure, type AzureConfig, type AzureRequest } from './azureDevOps.ts'
import { pickFields, queryLayout } from './queryView.ts'
import { releaseFor } from './releasePath.ts'
import type { ReleaseRule } from './streams.ts'
import { isMonthTask, timeWritingStoryIds } from './azureInsights.ts'

// Read-only release source: a second Azure project (e.g. DHFI) queried with a saved WIQL query.
// Approved documents carry their release in the Area or Iteration Path ("…\Name\Release x.y.z", see releasePath).
// matchThreshold: the % a fuzzy Feature match (DP, IOCC) needs to count as the release's Feature (default 80).
export interface ReleaseSourceSettings { approvalDateField?: string; matchThreshold?: number }
export const defaultReleaseSourceSettings: ReleaseSourceSettings = {}
export interface ReleaseSourceSnapshot { organization: string; project: string; query: string; fetchedAt: string; items: AzureWorkItem[]; columns?: { ref: string; name: string }[]; orderBy?: { ref: string; desc: boolean }[] }
export interface ReleaseEntry { key: string; group?: string; match?: { feature: AzureWorkItem; score: number }; name: string; release: string; documents: number; items: AzureWorkItem[]; tracked: boolean; trackedBy: AzureWorkItem[]; features: AzureWorkItem[]; planned: number; booked: number; hourTasks: number; approvalDate?: string; approvalMonth?: string }

type Transport = (request: AzureRequest) => Promise<unknown>

// Earlier settings (stream segment, release pattern) are no longer used and are dropped.
export function normalizeReleaseSourceSettings(value: unknown): ReleaseSourceSettings {
  const input = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof ReleaseSourceSettings, unknown>>
  const approvalDateField = typeof input.approvalDateField === 'string' && /^[\w.]{1,120}$/.test(input.approvalDateField.trim()) ? input.approvalDateField.trim() : undefined
  const threshold = Number(input.matchThreshold)
  return { ...(approvalDateField ? { approvalDateField } : {}), ...(Number.isInteger(threshold) && threshold >= 1 && threshold <= 100 ? { matchThreshold: threshold } : {}) }
}

// Accept a flat work-item query as pasted from Azure DevOps. Only its WHERE clause is kept so paging
// and the read-only guard in the Electron proxy ("SELECT [System.Id] FROM WorkItems WHERE …") stay in force.
export function releaseQueryWhere(wiql: string) {
  const text = wiql.replace(/\s+/g, ' ').trim()
  const match = /^SELECT\s+.+?\s+FROM\s+WorkItems\s+WHERE\s+(.+?)(?:\s+ORDER\s+BY\s+.+)?$/i.exec(text)
  if (!match) throw new Error('Paste a flat work-item query: SELECT … FROM WorkItems WHERE … (tree and link queries are not supported).')
  const where = match[1].trim()
  if (/\bASOF\b|\bMODE\s*\(/i.test(where)) throw new Error('Historical (ASOF) and link-mode queries are not supported.')
  if (where.length > 50000) throw new Error('The query is too long.')
  return where
}

export function pagedReleaseQuery(where: string, afterId: number) {
  return `SELECT [System.Id] FROM WorkItems WHERE (${where}) AND [System.Id] > ${afterId} ORDER BY [System.Id] ASC`
}

// "Author Approval Date" is a custom field; read it by the configured reference name, else by the first field whose name mentions an approval date.
export function approvalDateFrom(fields: Record<string, unknown>, settings: ReleaseSourceSettings = defaultReleaseSourceSettings) {
  const candidates = settings.approvalDateField ? [settings.approvalDateField] : Object.keys(fields).filter((key) => /approv\w*\.?\s*_?date|date\w*approv/i.test(key.replace(/[._]/g, ' ')))
  for (const key of candidates) { const value = fields[key]; if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && Number.isFinite(Date.parse(value))) return value }
  return undefined
}

// Runs a flat WIQL query read-only: ids are paged by [System.Id] and read in batches of 200.
export const defaultReleaseQuery = "SELECT [System.Id], [System.Title], [System.AreaPath], [System.State]\nFROM WorkItems\nWHERE [System.TeamProject] = @project AND [System.State] = 'Approved'\nORDER BY [System.Id]"
export const projectQuery = "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.State] <> 'Removed'"
export async function runWorkItemQuery(config: AzureConfig, pat: string, wiql: string, transport: Transport = requestAzure, map: (item: { id: number; fields: Record<string, unknown>; relations?: { rel: string; url: string }[] }) => AzureWorkItem = (item) => mapAzureWorkItem(item, config), limit = 20000): Promise<AzureWorkItem[]> {
  if (!config.organization || !config.project) throw new Error('The connection needs an organization and a project.')
  if (!pat.trim()) throw new Error('The connection needs a PAT with Work Items (Read).')
  const where = releaseQueryWhere(wiql)
  // The proxy requires a team on every read request; query and batch endpoints are project-scoped and ignore it.
  const scoped = { ...config, team: config.team || config.project }
  const request = (operation: AzureRequest['operation'], extra: Partial<AzureRequest> = {}) => transport({ ...scoped, pat: pat.trim(), operation, ...extra })
  const items: AzureWorkItem[] = []
  let afterId = 0
  while (true) {
    const page = await request('query', { query: pagedReleaseQuery(where, afterId) }) as { workItems?: { id: number }[] }
    if (!Array.isArray(page.workItems)) throw new Error('The query returned no work-item list. Check the query in Azure DevOps.')
    if (!page.workItems.length) break
    const ids = page.workItems.map((item) => item.id)
    if (ids.some((id) => !Number.isSafeInteger(id) || id <= afterId)) throw new Error('Unexpected query paging response. Nothing was saved.')
    items.push(...await readWorkItems(request, ids, map))
    afterId = Math.max(...ids)
    if (items.length > limit) throw new Error(`The query returned more than ${limit.toLocaleString()} items. Narrow the query.`)
  }
  return items
}

type ItemRequest = (operation: AzureRequest['operation'], extra?: Partial<AzureRequest>) => Promise<unknown>
async function readWorkItems(request: ItemRequest, ids: number[], map: Parameters<typeof runWorkItemQuery>[4] & object) {
  const result: AzureWorkItem[] = []
  for (let index = 0; index < ids.length; index += 200) {
    const batchIds = ids.slice(index, index + 200)
    const batch = await request('items', { ids: batchIds }) as { value?: { id: number; fields: Record<string, unknown>; relations?: { rel: string; url: string }[] }[] }
    if (!Array.isArray(batch.value) || batch.value.length !== batchIds.length) throw new Error('Some work items could not be read. Nothing was saved.')
    result.push(...batch.value.map(map))
  }
  return result
}

// Adds the parents of query results (Story → Feature → Epic) that the query itself did not return, so a query-based
// Time Writing fetch still resolves streams and absence. Stops at the top of the hierarchy or after 10 levels.
export async function withAncestors(config: AzureConfig, pat: string, items: AzureWorkItem[], transport: Transport = requestAzure) {
  const scoped = { ...config, team: config.team || config.project }
  const request: ItemRequest = (operation, extra = {}) => transport({ ...scoped, pat: pat.trim(), operation, ...extra })
  const all = [...items], known = new Set(items.map((item) => item.id))
  for (let depth = 0; depth < 10; depth++) {
    const missing = [...new Set(all.map((item) => item.parentId).filter((id): id is number => id != null && !known.has(id)))]
    if (!missing.length) break
    const parents = await readWorkItems(request, missing, (item) => mapAzureWorkItem(item, config))
    for (const parent of parents) { known.add(parent.id); all.push(parent) }
  }
  return all
}

// columns: the field reference names to keep per item (the query's resolved SELECT list); read from the query text when not given.
export async function fetchReleaseSource(config: AzureConfig, pat: string, wiql: string, transport: Transport = requestAzure, settings: ReleaseSourceSettings = defaultReleaseSourceSettings, columns: string[] = queryLayout(wiql).columns): Promise<ReleaseSourceSnapshot> {
  if (!config.organization || !config.project) throw new Error('Select a release-source configuration with an organization and project.')
  if (!pat.trim()) throw new Error('The release-source configuration needs a Work Items (Read) PAT.')
  const items = await runWorkItemQuery(config, pat, wiql, transport, (item) => { const mapped = { ...mapAzureWorkItem(item, config), fields: pickFields(item.fields, columns) }; const approvalDate = approvalDateFrom(item.fields, settings); return approvalDate ? { ...mapped, approvalDate } : mapped })
  return { organization: config.organization, project: config.project, query: wiql.trim(), fetchedAt: new Date().toISOString(), items }
}

// Month of an item in the read-only ADS views, in the viewer's time zone: its approval date (Author Approval Date or
// any approval-date field), else its Changed Date. timeZone is for tests only.
export function viewMonthOf(item: Pick<AzureWorkItem, 'approvalDate' | 'changedDate' | 'fields'>, timeZone?: string) {
  return approvalMonthOf(item.approvalDate ?? approvalDateFrom(item.fields ?? {}) ?? item.changedDate, timeZone)
}

// Month (YYYY-MM) of a date in the viewer's time zone.
export function approvalMonthOf(date: string | undefined, timeZone?: string) {
  if (!date || !Number.isFinite(Date.parse(date))) return undefined
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', ...(timeZone ? { timeZone } : {}) }).formatToParts(new Date(date))
  return `${parts.find((part) => part.type === 'year')!.value}-${parts.find((part) => part.type === 'month')!.value}`
}

// Releases completed in a month: those whose approval date falls in it.
export function completedReleases(register: ReleaseEntry[], month: string) {
  return register.filter((release) => release.approvalMonth === month).sort((a, b) => (a.approvalDate ?? '').localeCompare(b.approvalDate ?? '') || a.key.localeCompare(b.key, undefined, { numeric: true }))
}

// One row per release (name + release from the documents' paths), no grouping by stream: document count, the latest
// approval date, and whether the Time Writing backlog tracks it: a Feature whose title names it (see tracksRelease).
// A Feature whose title matches several releases goes to the one with the longest name ("Dose Planning Lite 1.0"
// tracks Dose Planning Lite, not Dose Planning); stories and tasks do not attach releases to Features.
// Planned and booked hours: Original Estimate and Completed Work, all months, on the Time Writing Tasks (month Tasks
// or Tasks under a Time Writing story) under the Features that track the release; each Task is counted once.
// A Feature tracks a release when its title, in any order and format, names the release's name as whole words and its
// exact version: "Art-A, Dose Planning, v.1.1.0.1", "DP | Dose Planning | v1.1.0.1" or "Dose Planning Release 1.1.0.1".
// The version may carry "v", "v." or "Rel"/"Release" in front but no other digits around it, so 1.1.0.1 never matches
// 1.1.0.2, 1.1.0.10 or 11.1.0.1; trailing zero parts do not count (3.1 = 3.1.0.0). Extra words (an Art, a program)
// are allowed.
const words = (text: string) => ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Versions are equal when they differ only by trailing zero parts: 3 = 3.0.0.0, 3.1 = 3.1.0.0, 3.1.1 = 3.1.1.0.
// A version with other characters (e.g. 1.0-beta) is compared as written.
export function normalizeVersion(version: string) {
  const text = version.trim().toLowerCase().replace(/^v\.?\s*/, '')
  if (!/^\d+(\.\d+)*$/.test(text)) return text
  const parts = text.split('.').map((part) => String(Number(part)))
  while (parts.length > 1 && parts.at(-1) === '0') parts.pop()
  return parts.join('.')
}
const versionToken = /(^|[^\d.])(?:v\.?\s*|rel(?:ease)?\s*[-_:.]?\s*)?(\d+(?:\.\d+)*)(?![\d.]*\d)/gi
export function tracksRelease(title: string, name: string, release: string) {
  if (!name.trim() || !release.trim() || !words(title).includes(words(name))) return false
  const wanted = normalizeVersion(release)
  if (!/^\d+(\.\d+)*$/.test(wanted)) return new RegExp(`(^|[^\\d.])(?:v\\.?\\s*|rel(?:ease)?\\s*[-_:.]?\\s*)?${escapeRegExp(release.trim())}(?![\\d.]*\\d)`, 'i').test(title)
  return [...title.matchAll(versionToken)].some((match) => normalizeVersion(match[2]) === wanted)
}
// The Feature title the app creates for a release, in the exact form tracksRelease maps back.
export const releaseFeatureTitle = (stream: string, name: string, release: string) => release.trim() ? `${stream.trim()} | ${name.trim()} | v${release.trim()}` : `${stream.trim()} | ${name.trim()}`

// Fuzzy match of a QMS-0025 Feature title to a release, 0–100: how well the name (and group) is found in the title —
// the best of bigram similarity to the title or one of its "|" parts and the share of the name's words in the title —
// weighed 60/40 with the version: the exact version 1, the same major.minor 0.6, the same major 0.3. Without a release
// number only the name counts.
const bigrams = (text: string) => { const clean = text.toLowerCase().replace(/[^a-z0-9]+/g, ''); const list: string[] = []; for (let index = 0; index < clean.length - 1; index += 1) list.push(clean.slice(index, index + 2)); return list }
export function similarity(a: string, b: string) {
  const x = bigrams(a), y = bigrams(b)
  if (!x.length || !y.length) return a.trim().toLowerCase() === b.trim().toLowerCase() && a.trim() ? 1 : 0
  const counts = new Map<string, number>(); for (const pair of y) counts.set(pair, (counts.get(pair) ?? 0) + 1)
  let both = 0; for (const pair of x) { const left = counts.get(pair) ?? 0; if (left) { both += 1; counts.set(pair, left - 1) } }
  return 2 * both / (x.length + y.length)
}
export function matchScore(title: string, name: string, release: string, group?: string) {
  const label = [group, name].filter(Boolean).join(' ')
  const titleWords = new Set(words(title).trim().split(' ').filter(Boolean)), nameWords = words(label).trim().split(' ').filter(Boolean)
  const parts = [title, ...title.split('|')].map((part) => part.replace(/\bv?\d+(\.\d+)+\b/gi, ' ').trim()).filter(Boolean)
  const nameScore = Math.max(...parts.map((part) => similarity(label, part)), nameWords.length ? nameWords.filter((word) => titleWords.has(word)).length / nameWords.length : 0)
  if (!release.trim()) return Math.round(nameScore * 100)
  const wanted = normalizeVersion(release).split('.')
  const versionScore = Math.max(0, ...[...title.matchAll(versionToken)].map((match) => {
    const found = normalizeVersion(match[2]).split('.')
    return found.join('.') === wanted.join('.') ? 1 : found[0] === wanted[0] && (found[1] ?? '0') === (wanted[1] ?? '0') ? 0.6 : found[0] === wanted[0] ? 0.3 : 0
  }))
  return Math.round((nameScore * 0.6 + versionScore * 0.4) * 100)
}

// rule: how the stream reads its releases (streams.ts); fuzzy: match Features by matchScore, the best one tracking the
// release when it reaches the threshold (%), instead of the exact rule.
export interface RegisterOptions { rule?: ReleaseRule; fuzzy?: boolean; threshold?: number }
export function releaseRegister(source: AzureWorkItem[] | undefined, backlog: AzureWorkItem[], options: RegisterOptions = {}): ReleaseEntry[] {
  const entries = new Map<string, ReleaseEntry>()
  for (const item of source ?? []) {
    const found = releaseFor(item, options.rule)
    if (!found) continue
    const key = `${found.group ?? ''}\u0000${found.name}\u0000${normalizeVersion(found.release)}`.toLowerCase()
    const entry = entries.get(key) ?? { key: [found.group, found.name, found.release].filter(Boolean).join(' '), ...(found.group ? { group: found.group } : {}), name: found.name, release: found.release, documents: 0, items: [], tracked: false, trackedBy: [], features: [], planned: 0, booked: 0, hourTasks: 0 }
    entry.documents += 1; entry.items.push(item)
    if (item.approvalDate && (!entry.approvalDate || item.approvalDate > entry.approvalDate)) { entry.approvalDate = item.approvalDate; entry.approvalMonth = approvalMonthOf(item.approvalDate) }
    entries.set(key, entry)
  }
  // Exact match: a Feature title in segments split by "|" with one segment equal to the name and one equal to the
  // release ("v", "Release" or "Rel" in front allowed), e.g. "DP | Dose Planning | v1.1.0.1". No partial or nearby
  // numbers, and stories or tasks naming a release do not attach it to whatever Feature they sit under.
  const names = (text: string, entry: ReleaseEntry) => tracksRelease(text, entry.name, entry.release)
  const live = backlog.filter((item) => item.state.trim().toLowerCase() !== 'removed')
  const byId = new Map(live.map((item) => [item.id, item]))
  const featureOf = (item: AzureWorkItem) => { let current: AzureWorkItem | undefined = item; for (let depth = 0; current && depth < 8; depth += 1) { if (current.workItemType === 'Feature') return current; current = current.parentId == null ? undefined : byId.get(current.parentId) } return undefined }
  const storyIds = timeWritingStoryIds(live)
  const timeWritingTasks = live.filter((item) => item.workItemType === 'Task' && (isMonthTask(item) || (item.parentId != null && storyIds.has(item.parentId))))
  const hours = (value: number | undefined) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
  // Each Feature counts for the release(s) with the longest name its title matches.
  const features = live.filter((item) => item.workItemType === 'Feature')
  const bestNameLength = new Map<number, number>()
  for (const feature of features) for (const entry of entries.values()) if (names(feature.title, entry)) bestNameLength.set(feature.id, Math.max(bestNameLength.get(feature.id) ?? 0, entry.name.trim().length))
  const threshold = options.threshold ?? 80
  return [...entries.values()].map((entry) => {
    const best = options.fuzzy ? features.map((feature) => ({ feature, score: matchScore(feature.title, entry.name, entry.release, entry.group) })).sort((a, b) => b.score - a.score || a.feature.id - b.feature.id)[0] : undefined
    const tracking = options.fuzzy ? best && best.score >= threshold ? [best.feature] : [] : features.filter((feature) => names(feature.title, entry) && bestNameLength.get(feature.id) === entry.name.trim().length).sort((a, b) => a.id - b.id)
    const trackedBy = tracking
    const featureIds = new Set(tracking.map((feature) => feature.id))
    const tasks = new Map(timeWritingTasks.filter((task) => featureIds.has(featureOf(task)?.id ?? -1)).map((task) => [task.id, task]))
    const planned = [...tasks.values()].reduce((sum, task) => sum + hours(task.originalEstimate), 0)
    const booked = [...tasks.values()].reduce((sum, task) => sum + hours(task.completedWork), 0)
    return { ...entry, ...(best ? { match: best } : {}), tracked: trackedBy.length > 0, trackedBy, features: tracking, planned, booked, hourTasks: tasks.size }
  }).sort((a, b) => a.name.localeCompare(b.name) || b.release.localeCompare(a.release, undefined, { numeric: true }))
}
