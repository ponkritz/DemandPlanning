import type { AzureWorkItem } from './domain'
import { isMonthTask, timeWritingMonth } from './azureInsights.ts'

// Historical hours (HIS-01…HIS-09): the planned and recorded hours of the months before Azure DevOps Time Writing was
// used, imported once from the team's Excel planning workbook (sheet "TransformedData": one row per person, month and
// activity) and kept in the Git data repository (history-hours.json) — never in the app's source. Before the cut-off
// month the history is the only source of hours; from the cut-off on, Azure DevOps is. The history feeds the report
// pages as read-only Time Writing Tasks under their Epic, so every report counts it as it counts Azure DevOps hours;
// nothing is written to Azure DevOps, and the pages that write never see it.

export const historyPath = 'history-hours.json'
export const defaultCutoff = '2026-10'
export const maxHistoryRows = 20000
const kind = 'history-hours'

export interface HistoryRow { person: string; month: string; featureId?: number; epicId?: number; stream: string; activity: string; type?: string; planned?: number; actual?: number }
export interface HistoryFile {
  schema: 1; kind: typeof kind
  // The first month taken from Azure DevOps: the history counts only before it.
  cutoff: string
  source: string; sheet: string; importedAt: string; importedBy: string
  rows: HistoryRow[]
  // A Stream name without an Epic No → the Epic its hours belong to (chosen on import).
  streamEpics: Record<string, number>
  // A name as written in the Excel → the name the reports use (the Azure DevOps name for people still in the team).
  people: Record<string, string>
}
export interface SkippedRow { row: number; reason: string }

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/
const text = (value: unknown) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
const hoursOf = (value: string) => { const cleaned = value.trim().replace(',', '.'); if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return undefined; const number = Number(cleaned); return Number.isFinite(number) && number >= 0 && number <= 1000 ? Math.round(number * 100) / 100 : undefined }
const placeholder = (value: string) => !value || /^(#n\/a|n\/a|tbd|0|-|none|all)$/i.test(value)
// A group in the person column (HIS-13): "All" is everyone, "All-BLR" / "All-NL" / "All-US" everyone in that region.
export type GroupScope = 'everyone' | 'India' | 'Netherlands' | 'US'
export function groupOf(person: string): GroupScope | undefined {
  const match = /^all(?:[\s_–—-]*(.+))?$/i.exec(person.trim())
  if (!match) return undefined
  const region = (match[1] ?? '').trim().toLowerCase()
  if (!region) return 'everyone'
  if (/^(blr|bangalore|bengaluru|india|in|ind)$/.test(region)) return 'India'
  if (/^(nl|netherlands|holland|best|eindhoven)$/.test(region)) return 'Netherlands'
  if (/^(us|usa|united states)$/.test(region)) return 'US'
  return undefined
}

// The columns, found by their heading (any case, extra columns ignored).
const columns = {
  person: /^(qa\s*\/\s*qe|person|name|qe|engineer|supporting quality engineer)$/i,
  month: /^month\s*\(date\)$/i,
  monthText: /^month$/i,
  epic: /^epic\s*(no|nr|id|number)\.?$/i,
  feature: /^feature\s*(id|no|nr|number)\.?$/i,
  stream: /^stream/i,
  activity: /^(project\s*\/\s*release title|activity|title|topic explanation)$/i,
  type: /^(service\s*\/\s*project\s*\/\s*release|type)$/i,
  planned: /^(expected|planned|planned hours|estimate)$/i,
  actual: /^(actual|recorded|recorded hours|actual hours|completed work)$/i,
}
type Column = keyof typeof columns

// The month of a cell: a date (2026-05-01, 2026-05-01 00:00, 01-05-2026, 01/05/2026) or "2026-05".
export function monthOfCell(value: string) {
  const textValue = value.trim()
  let match = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?(?:[ T].*)?$/.exec(textValue)
  if (match) { const month = `${match[1]}-${match[2].padStart(2, '0')}`; return monthPattern.test(month) ? month : undefined }
  match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(textValue)
  if (match) { const month = `${match[3]}-${match[2].padStart(2, '0')}`; return monthPattern.test(month) ? month : undefined }
  return undefined
}

// The sheet to read: "TransformedData" when the workbook has one, else the first sheet with a person, a month and an
// hours column in one of its first rows.
export function pickHistorySheet(sheets: { name: string; rows: string[][] }[]) {
  const usable = (rows: string[][]) => rows.slice(0, 10).findIndex((row) => { const found = headerIndex(row); return found.person != null && found.month != null && (found.planned != null || found.actual != null) })
  const named = sheets.find((sheet) => sheet.name.trim().toLowerCase() === 'transformeddata' && usable(sheet.rows) >= 0)
  return named ?? sheets.find((sheet) => usable(sheet.rows) >= 0)
}
function headerIndex(row: string[]) {
  const found: Partial<Record<Column, number>> = {}
  row.forEach((cell, index) => { const heading = text(cell); for (const [name, pattern] of Object.entries(columns) as [Column, RegExp][]) if (found[name] == null && pattern.test(heading)) found[name] = index })
  return found
}

// The rows of the sheet before the cut-off month; every row not taken is listed with its reason (spreadsheet row number).
export function parseHistorySheet(rows: string[][], cutoff = defaultCutoff) {
  const headerAt = rows.slice(0, 10).findIndex((row) => { const found = headerIndex(row); return found.person != null && found.month != null })
  if (headerAt < 0) throw new Error('No header row with a person (QA/QE) and a Month(Date) column was found in the first 10 rows.')
  const at = headerIndex(rows[headerAt])
  if (at.planned == null && at.actual == null) throw new Error('No Expected or Actual hours column was found.')
  const cell = (row: string[], name: Column) => at[name] == null ? '' : text(row[at[name]!])
  const taken: HistoryRow[] = [], skipped: SkippedRow[] = []
  for (let index = headerAt + 1; index < rows.length; index++) {
    const row = rows[index] ?? []
    if (!row.some((value) => text(value))) continue
    const number = index + 1
    const person = cell(row, 'person'), month = monthOfCell(cell(row, 'month'))
    const planned = hoursOf(cell(row, 'planned')), actual = hoursOf(cell(row, 'actual'))
    if (!groupOf(person) && placeholder(person)) { skipped.push({ row: number, reason: 'no person' }); continue }
    if (!groupOf(person) && /^all\b/i.test(person)) { skipped.push({ row: number, reason: `unknown group "${person}" (use All, All-BLR, All-NL or All-US)` }); continue }
    if (!month) { skipped.push({ row: number, reason: 'no month (Month(Date) is not a date)' }); continue }
    if (month >= cutoff) { skipped.push({ row: number, reason: `${month}: from the cut-off on, Azure DevOps counts` }); continue }
    if (!planned && !actual) { skipped.push({ row: number, reason: 'no hours' }); continue }
    const epic = Number(cell(row, 'epic')), feature = Number(cell(row, 'feature'))
    const stream = cell(row, 'stream'), activity = cell(row, 'activity'), type = cell(row, 'type')
    taken.push({ person, month, ...(Number.isInteger(feature) && feature > 0 ? { featureId: feature } : {}), ...(Number.isInteger(epic) && epic > 0 ? { epicId: epic } : {}), stream: placeholder(stream) ? '' : stream, activity: placeholder(activity) ? '' : activity, ...(placeholder(type) ? {} : { type }), ...(planned ? { planned } : {}), ...(actual ? { actual } : {}) })
    if (taken.length > maxHistoryRows) throw new Error(`More than ${maxHistoryRows} rows: split the history or remove rows outside the months to import.`)
  }
  return { rows: taken, skipped, header: headerAt + 1 }
}

// Matching an Excel name ("Evelyn Simons") to a name the reports know ("Simons, Evelyn" from Azure DevOps): the same
// words in any order, case, commas and an e-mail in angle brackets ignored. Only a single candidate counts; two or none
// leave the name as written for the person to choose.
const words = (name: string) => name.replace(/<[^>]*>/g, ' ').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[\s,.;]+/).filter(Boolean)
export function matchPeople(excelNames: string[], known: string[]) {
  const candidates = [...new Set(known.map((name) => name.trim()).filter(Boolean))]
  const key = (name: string) => words(name).sort().join(' ')
  const result: Record<string, string> = {}
  for (const name of [...new Set(excelNames)]) {
    const own = key(name)
    const same = candidates.filter((candidate) => key(candidate) === own)
    // Fewer words in the Excel ("Evelyn" for "Simons, Evelyn"): each word must be one of the candidate's words.
    const partial = same.length ? same : candidates.filter((candidate) => { const theirs = words(candidate); const mine = words(name); return mine.length > 0 && mine.every((word) => theirs.includes(word)) })
    if (partial.length === 1) result[name] = partial[0]
  }
  return result
}

// The streams without an Epic No, with their row count, for the Stream → Epic table.
export function streamsWithoutEpic(rows: HistoryRow[]) {
  const counts = new Map<string, number>()
  for (const row of rows) if (row.epicId == null) counts.set(row.stream || '(no stream)', (counts.get(row.stream || '(no stream)') ?? 0) + 1)
  return [...counts].map(([stream, count]) => ({ stream, count })).sort((a, b) => b.count - a.count || a.stream.localeCompare(b.stream))
}

export function buildHistoryFile(input: { rows: HistoryRow[]; cutoff: string; source: string; sheet: string; importedBy: string; streamEpics: Record<string, number>; people: Record<string, string> }, importedAt = new Date().toISOString()): HistoryFile {
  return { schema: 1, kind, cutoff: input.cutoff, source: input.source, sheet: input.sheet, importedAt, importedBy: input.importedBy, rows: input.rows, streamEpics: input.streamEpics, people: input.people }
}
export const serializeHistory = (file: HistoryFile) => `${JSON.stringify(file)}\n`

// Read from Git like any other input: only known shapes are kept; anything else reads as no history.
export function parseHistoryFile(textValue: string | null | undefined): HistoryFile | null {
  if (!textValue) return null
  let raw: unknown
  try { raw = JSON.parse(textValue) } catch { return null }
  const input = raw as Partial<Record<keyof HistoryFile, unknown>> | null
  if (!input || typeof input !== 'object' || input.schema !== 1 || input.kind !== kind || typeof input.cutoff !== 'string' || !monthPattern.test(input.cutoff) || !Array.isArray(input.rows)) return null
  const short = (value: unknown, max = 200) => typeof value === 'string' ? value.slice(0, max) : ''
  const rows: HistoryRow[] = []
  for (const entry of input.rows.slice(0, maxHistoryRows)) {
    if (!entry || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>
    const person = short(row.person, 120).trim(), month = short(row.month, 7)
    if (!person || !monthPattern.test(month)) continue
    const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000 ? value : undefined
    const id = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
    const epicId = id(row.epicId), featureId = id(row.featureId)
    const planned = number(row.planned), actual = number(row.actual)
    rows.push({ person, month, ...(featureId ? { featureId } : {}), ...(epicId ? { epicId } : {}), stream: short(row.stream), activity: short(row.activity), ...(short(row.type) ? { type: short(row.type, 80) } : {}), ...(planned ? { planned } : {}), ...(actual ? { actual } : {}) })
  }
  const record = (value: unknown, check: (entry: unknown) => boolean) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([name, entry]) => name.length <= 200 && check(entry)).slice(0, 2000)) : {}
  return {
    schema: 1, kind, cutoff: input.cutoff, source: short(input.source), sheet: short(input.sheet, 80), importedAt: short(input.importedAt, 40), importedBy: short(input.importedBy, 120), rows,
    streamEpics: record(input.streamEpics, (entry) => typeof entry === 'number' && Number.isInteger(entry) && entry > 0) as Record<string, number>,
    people: record(input.people, (entry) => typeof entry === 'string' && entry.trim().length > 0 && entry.length <= 120) as Record<string, string>,
  }
}

// The work items the report pages read: Azure DevOps month Tasks before the cut-off left out, the history added as
// read-only Tasks (negative IDs, never written) under a Feature per activity and the row's Epic — the real Epic when
// it is in the data, else a stand-in named after it (or after the stream when no Epic is mapped).
export interface HistoryMerge { items: AzureWorkItem[]; leftOut: { tasks: number; hours: number }; added: { rows: number; hours: number; people: number } }
const cache = new WeakMap<object, WeakMap<object, HistoryMerge>>()
export function withHistory(items: AzureWorkItem[], file: HistoryFile | null): HistoryMerge {
  if (!file) return { items, leftOut: { tasks: 0, hours: 0 }, added: { rows: 0, hours: 0, people: 0 } }
  let byFile = cache.get(items)
  if (!byFile) { byFile = new WeakMap(); cache.set(items, byFile) }
  const found = byFile.get(file)
  if (found) return found
  const kept: AzureWorkItem[] = []
  let leftTasks = 0, leftHours = 0
  for (const item of items) {
    const month = isMonthTask(item) ? timeWritingMonth(item.title) : undefined
    if (month && month < file.cutoff) { leftTasks++; leftHours += item.completedWork ?? 0; continue }
    kept.push(item)
  }
  const real = new Map(items.filter((item) => item.workItemType === 'Epic').map((item) => [item.id, item]))
  const realFeatures = new Map(items.filter((item) => item.workItemType === 'Feature').map((item) => [item.id, item]))
  const base = { organization: 'history', project: 'history', state: 'Closed', areaPath: '', iterationPath: '', tags: 'History import', url: '', syncedAt: file.importedAt }
  const added: AzureWorkItem[] = []
  let next = -1
  const epics = new Map<string, number>(), features = new Map<string, number>()
  const epicFor = (row: HistoryRow) => {
    const id = row.epicId ?? file.streamEpics[row.stream || '(no stream)']
    if (id && real.has(id)) return id
    const name = id ? `epic:${id}` : `stream:${row.stream || '(no stream)'}`
    let epicId = epics.get(name)
    if (epicId == null) { epicId = next--; epics.set(name, epicId); added.push({ ...base, key: `history/${name}`, id: epicId, workItemType: 'Epic', title: id ? `Epic ${id}` : row.stream || 'No stream', assignedTo: '' }) }
    return epicId
  }
  let hours = 0
  const people = new Set<string>()
  for (const row of file.rows) {
    if (row.month >= file.cutoff) continue
    const activity = row.activity || row.stream || 'Historical hours'
    // A Feature ID of a Feature in the data wins: the hours sit under that Feature and count for its Epic (HIS-10).
    let featureId = row.featureId && realFeatures.has(row.featureId) ? row.featureId : undefined
    if (featureId == null) {
      const epicId = epicFor(row)
      const featureName = `${epicId}:${activity.toLowerCase()}`
      featureId = features.get(featureName)
      if (featureId == null) { featureId = next--; features.set(featureName, featureId); added.push({ ...base, key: `history/feature/${-featureId}`, id: featureId, workItemType: 'Feature', title: activity, assignedTo: '', parentId: epicId }) }
    }
    const group = groupOf(row.person)
    const person = group ? '' : file.people[row.person] || row.person
    const id = next--
    // A group row is shared time: its hours apply to each person in the group (counted once per person in the reports).
    added.push({ ...base, key: `history/task/${-id}`, id, workItemType: 'Task', title: `${row.month} | ${activity}`, assignedTo: person, parentId: featureId, ...(group ? { tags: `History import; Shared: ${group}` } : {}), ...(row.planned ? { originalEstimate: row.planned } : {}), ...(row.actual ? { completedWork: row.actual } : {}) })
    if (!group) { hours += row.actual ?? 0; people.add(person) }
  }
  const result = { items: [...kept, ...added], leftOut: { tasks: leftTasks, hours: Math.round(leftHours * 10) / 10 }, added: { rows: file.rows.filter((row) => row.month < file.cutoff).length, hours: Math.round(hours * 10) / 10, people: people.size } }
  byFile.set(file, result)
  return result
}
export const isHistoryItem = (item: Pick<AzureWorkItem, 'id' | 'organization'>) => item.id < 0 && item.organization === 'history'

// Rows whose Feature ID points elsewhere than their Epic No, or to a Feature not in the fetched data (HIS-10): listed on
// import for a check; the Feature ID still wins when its Feature is in the data.
export function featureChecks(rows: HistoryRow[], items: AzureWorkItem[]) {
  const byId = new Map(items.map((item) => [item.id, item]))
  const epicOf = (item: AzureWorkItem | undefined) => { const seen = new Set<number>(); let current = item; while (current && !seen.has(current.id)) { if (current.workItemType === 'Epic') return current; seen.add(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId) } return undefined }
  const missing = new Set<number>(), conflicts = new Map<number, { featureId: number; epicNo: number; epicOfFeature?: number }>()
  for (const row of rows) {
    if (!row.featureId) continue
    const feature = byId.get(row.featureId)
    if (!feature || feature.workItemType !== 'Feature') { missing.add(row.featureId); continue }
    const epic = epicOf(feature)
    if (row.epicId && epic?.id !== row.epicId) conflicts.set(row.featureId, { featureId: row.featureId, epicNo: row.epicId, ...(epic ? { epicOfFeature: epic.id } : {}) })
  }
  return { missing: [...missing].sort((a, b) => a - b), conflicts: [...conflicts.values()].sort((a, b) => a.featureId - b.featureId) }
}
