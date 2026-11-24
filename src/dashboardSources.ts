import type { Area } from './access.ts'
import type { AppState, AzureWorkItem } from './domain'
import type { AzureConnectionProfileSummary } from './azureCredentials.ts'
import type { CapacitySettings } from './capacity.ts'
import { personMonths } from './dashboard.ts'
import { datasetPage, hoursSource, missingDataset, pageOfSource, type Dataset } from './dashboardPages.ts'
import { hoursFor, notAvailable, type HoursLine } from './dashboardHours.ts'
import type { HistoryFile } from './history.ts'
import { sheetTable, type KpiTracker } from './kpiTracker.ts'
import { isMine, myNames, piPathOf, type Me } from './myWork.ts'
import type { OnDemandColumn, OnDemandRow, OnDemandType } from './onDemand.ts'
import type { QeMappingFile } from './qeMapping.ts'
import { completedCount, supportedCount, type ReleaseStream } from './releaseOverview.ts'

// MYD-15…MYD-22 The data sources of My dashboard's blocks, as one registry so that more can be added: each kind of
// source declares its fields (text, category, date, number, currency), the menu area a role needs to see it
// (access.sees, CON-94 — fail closed: without it the source says "Not available for your role." and no rows are built),
// and builds its rows from data the app has already loaded (no network call of its own; when the data is not loaded
// yet the source says what to load, with the app's own action). The rows are in the shape of an On-Demand table page,
// so the On-Demand Dashboard blocks (DSH-05: KPI, bar, line, pie, Pareto, summary table, narrative), the period, the
// filters and the drill-down apply to every source unchanged. Kept free of React so that every rule is tested on its
// own (tests/dashboard-sources.test.mjs).

export type FieldType = 'text' | 'category' | 'multi' | 'date' | 'number' | 'currency'
export interface SourceField { id: string; name: string; type: FieldType }
// A built row: its cells by field id, an optional key shown as the row's ID in a drill-down and its link (https only).
export interface SourceRow { key?: string; link?: string; cells: Record<string, string | string[]> }
// load: what the person loads for a source whose data is not there yet (the page offers the app's own action).
export type LoadAction = 'azure' | 'kpi' | 'qe' | 'history' | 'windchill'
export interface SourceEntry { dataset: Dataset; kind: string; load?: LoadAction }

// What the sources read — everything already loaded by the app (App.tsx); months: the dashboard period's months.
export interface SourceInput {
  sees: (area: Area) => boolean
  months: string[]
  today: string
  me: Me
  // The report items: Azure DevOps with the historical hours merged in (HIS-05), as Team overview reads them.
  items: AzureWorkItem[]
  settings: CapacitySettings
  releases: { state: Pick<AppState, 'azureSources' | 'releaseSource'> & Partial<Pick<AppState, 'releaseSourceSettings'>>; profiles: AzureConnectionProfileSummary[]; streamsOf: (month: string) => ReleaseStream[] }
  qe: { file: QeMappingFile | null; loaded: boolean }
  kpi: KpiTracker | null | undefined // undefined: not loaded in this visit yet
  history: { file: HistoryFile | null; loaded: boolean; connected: boolean }
  windchill: { viewId: string; name: string; fetchedAt: string; columns: string[]; rows: Record<string, unknown>[] }[]
  pages: Dataset[] // the table pages as saved in Git (DSH-03), built by the page
  hours: (allowed: boolean) => HoursLine[] // DSH-16: the Time Writing lines over the months (worked out only when allowed)
}

export interface SourceKind {
  id: string; label: string; areas: Area[]; describe: string
  // The datasets of this kind; wanted(key) false: the fields only, no rows worked out (a source no block uses).
  entries: (input: SourceInput, wanted: (key: string) => boolean) => SourceEntry[]
}

// ---- building a dataset from declared fields ----
const typeOf: Record<FieldType, OnDemandType> = { text: 'text', category: 'dropdown', multi: 'multi', date: 'date', number: 'number', currency: 'currency' }
const byText = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
const round = (value: number) => Math.round(value * 100) / 100
const dateOf = (value: string | undefined) => value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : ''
const numberText = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? String(round(value)) : ''
export function fieldsDataset(key: string, name: string, kind: string, note: string, fields: SourceField[], rows: SourceRow[]): Dataset {
  const columns: OnDemandColumn[] = fields.map((field) => {
    const type = typeOf[field.type]
    const options = type === 'dropdown' || type === 'multi' ? [...new Set(rows.flatMap((row) => { const value = row.cells[field.id]; return (Array.isArray(value) ? value : [value ?? '']).map((entry) => entry.trim()).filter(Boolean) }))].sort(byText) : []
    return { id: field.id, name: field.name, type, options, required: false }
  })
  const pageRows: OnDemandRow[] = rows.map((row, index) => ({ id: `r${index + 1}`, ...(row.key ? { key: row.key } : {}), ...(row.link && /^https:\/\//.test(row.link) ? { link: row.link } : {}), cells: row.cells }))
  return { key, name, kind, note: `${note} (${rows.length} row${rows.length === 1 ? '' : 's'}).`, page: datasetPage(key.replace(/[^a-z0-9-]/gi, '-').toLowerCase().slice(0, 40), name, columns, pageRows) }
}
const blocked = (key: string, name: string, kind: string, problem: string): Dataset => ({ ...missingDataset(key, problem), name, kind })
const entry = (dataset: Dataset, kind: string, load?: LoadAction): SourceEntry => ({ dataset, kind, ...(load ? { load } : {}) })
// A column of a sheet or an export: a date when every value is a date, a number when every value is one, a category
// when its values repeat (at most 40 of them), else text.
function inferType(values: string[]): FieldType {
  const filled = values.map((value) => value.trim()).filter(Boolean)
  if (!filled.length) return 'text'
  if (filled.every((value) => /^\d{4}-\d{2}-\d{2}([T ][\d:.]+Z?)?$/.test(value))) return 'date'
  if (filled.every((value) => /^-?\d+(\.\d+)?$/.test(value.replace(/,/g, '')))) return 'number'
  const distinct = new Set(filled).size
  return distinct <= 40 && distinct < filled.length ? 'category' : 'text'
}
const safeId = (id: string, max: number) => id.replace(/[^\w.-]/g, '_').slice(0, max) || '_'
const fieldId = (prefix: string, index: number) => `${prefix}${index}`
function tableDataset(key: string, name: string, kind: string, note: string, headers: string[], rows: string[][], prefix: string): Dataset {
  const types = headers.map((_, at) => inferType(rows.map((row) => row[at] ?? '')))
  const fields = headers.map((header, at): SourceField => ({ id: fieldId(prefix, at), name: header.trim().slice(0, 80) || `Column ${at + 1}`, type: types[at] }))
  return fieldsDataset(key, name, kind, note, fields, rows.map((row) => ({ cells: Object.fromEntries(headers.map((_, at) => { const value = (row[at] ?? '').trim(); return [fieldId(prefix, at), types[at] === 'date' ? value.slice(0, 10) : types[at] === 'number' ? value.replace(/,/g, '') : value] })) })))
}

// ---- MYD-16 Azure DevOps work ----
export const azureWorkSource = 'azure:work'
export const azureWorkFields: SourceField[] = [
  { id: 'aw-id', name: 'ID', type: 'text' }, { id: 'aw-title', name: 'Title', type: 'text' },
  { id: 'aw-type', name: 'Type', type: 'category' }, { id: 'aw-state', name: 'State', type: 'category' },
  { id: 'aw-assigned', name: 'Assigned to', type: 'category' }, { id: 'aw-area', name: 'Area', type: 'category' },
  { id: 'aw-epic', name: 'Epic (stream)', type: 'category' }, { id: 'aw-feature', name: 'Feature', type: 'text' },
  { id: 'aw-pi', name: 'PI', type: 'category' }, { id: 'aw-sprint', name: 'Sprint', type: 'category' },
  { id: 'aw-created', name: 'Created', type: 'date' }, { id: 'aw-changed', name: 'Changed', type: 'date' }, { id: 'aw-closed', name: 'Closed', type: 'date' },
  { id: 'aw-target', name: 'Target date', type: 'date' },
  { id: 'aw-estimate', name: 'Original estimate', type: 'number' }, { id: 'aw-completed', name: 'Completed work', type: 'number' },
  { id: 'aw-tags', name: 'Tags', type: 'multi' },
]
export const workTypesShown = ['Feature', 'User Story', 'Task']
const isHistory = (item: Pick<AzureWorkItem, 'id' | 'organization'>) => item.id < 0 && item.organization === 'history'
export function azureWorkRows(items: AzureWorkItem[], mineOnly?: Me): SourceRow[] {
  const live = items.filter((item) => !isHistory(item))
  const byId = new Map(live.map((item) => [item.id, item]))
  const above = (item: AzureWorkItem, type: string) => { const seen = new Set([item.id]); let current = item.parentId == null ? undefined : byId.get(item.parentId); while (current && !seen.has(current.id)) { if (current.workItemType === type) return current; seen.add(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId) } return undefined }
  const names = mineOnly ? new Set(myNames(live, mineOnly).map((name) => name.toLowerCase())) : null
  return live.filter((item) => workTypesShown.includes(item.workItemType) && (!names || isMine(item, mineOnly!) || names.has(item.assignedTo.trim().toLowerCase())))
    .sort((a, b) => a.id - b.id)
    .map((item) => {
      const pi = piPathOf(item.iterationPath), piName = pi ? pi.slice(pi.lastIndexOf('\\') + 1) : ''
      const rest = pi ? item.iterationPath.slice(pi.length + 1) : ''
      const feature = item.workItemType === 'Feature' ? item : above(item, 'Feature')
      return { key: `#${item.id}`, link: item.url, cells: {
        'aw-id': `#${item.id}`, 'aw-title': item.title, 'aw-type': item.workItemType, 'aw-state': item.state, 'aw-assigned': item.assignedTo || 'Unassigned',
        'aw-area': item.areaPath, 'aw-epic': above(item, 'Epic')?.title ?? '', 'aw-feature': feature?.title ?? '', 'aw-pi': piName, 'aw-sprint': rest ? rest.slice(rest.lastIndexOf('\\') + 1) : '',
        'aw-created': dateOf(item.createdDate), 'aw-changed': dateOf(item.changedDate), 'aw-closed': dateOf(item.closedDate), 'aw-target': dateOf(item.targetDate),
        'aw-estimate': numberText(item.originalEstimate), 'aw-completed': numberText(item.completedWork),
        'aw-tags': item.tags.split(';').map((tag) => tag.trim()).filter(Boolean),
      } }
    })
}

// ---- MYD-17 Releases per stream ----
export const releasesSource = 'releases:streams'
export const releaseFields: SourceField[] = [
  { id: 'rl-stream', name: 'Stream', type: 'category' }, { id: 'rl-release', name: 'Release', type: 'text' }, { id: 'rl-type', name: 'Release type', type: 'category' },
  { id: 'rl-month', name: 'Month', type: 'date' }, { id: 'rl-approved', name: 'Approved', type: 'date' }, { id: 'rl-status', name: 'Completed / Supported', type: 'category' },
  { id: 'rl-docs', name: 'Documents', type: 'number' }, { id: 'rl-source', name: 'Counted from', type: 'category' },
]
export const enteredRelease = '(entered by an Admin)'
// One row per release Pulse Check counts in each month (Completed: the stream's releases; Supported: its Supported
// Releases, DP and IOCC) — the counts an Admin entered for a stream without data (QV-58) as that many rows — so a Count
// per stream and month is the count of Pulse Check and of My dashboard's Release counts.
export function releaseRows(months: string[], streamsOf: (month: string) => ReleaseStream[]): SourceRow[] {
  const rows: SourceRow[] = []
  for (const month of months) {
    for (const stream of streamsOf(month)) {
      const base = { 'rl-stream': stream.name, 'rl-month': `${month}-01` }
      const entered = Boolean(stream.noData && stream.entered)
      if (entered && stream.entered?.completed != null) for (let at = 0; at < stream.entered.completed; at++) rows.push({ cells: { ...base, 'rl-release': enteredRelease, 'rl-type': '', 'rl-approved': '', 'rl-status': 'Completed', 'rl-docs': '', 'rl-source': 'Entered by an Admin' } })
      else for (const release of stream.releases) rows.push({ cells: { ...base, 'rl-release': [release.name, release.release].filter(Boolean).join(' '), 'rl-type': release.type ?? '', 'rl-approved': dateOf(release.approvalDate), 'rl-status': 'Completed', 'rl-docs': String(release.documents), 'rl-source': 'Data' } })
      if (entered && stream.entered?.supported != null) for (let at = 0; at < stream.entered.supported; at++) rows.push({ cells: { ...base, 'rl-release': enteredRelease, 'rl-type': '', 'rl-approved': '', 'rl-status': 'Supported', 'rl-docs': '', 'rl-source': 'Entered by an Admin' } })
      else for (const supported of stream.supportedEntries ?? []) rows.push({ cells: { ...base, 'rl-release': supported.label, 'rl-type': '', 'rl-approved': '', 'rl-status': 'Supported', 'rl-docs': '', 'rl-source': 'Data' } })
    }
  }
  return rows
}
// The counts the rows give per stream and month — equal to Pulse Check's completedCount / supportedCount (tests).
export const releaseCountsOf = (stream: ReleaseStream) => ({ completed: completedCount(stream), supported: supportedCount(stream) })

// ---- MYD-18 Capacity and utilization ----
export const capacitySource = 'capacity:people'
export const capacityFields: SourceField[] = [
  { id: 'cp-person', name: 'Team member', type: 'category' }, { id: 'cp-region', name: 'Region', type: 'category' }, { id: 'cp-role', name: 'Role', type: 'category' },
  { id: 'cp-month', name: 'Month', type: 'date' }, { id: 'cp-status', name: 'Month status', type: 'category' },
  { id: 'cp-available', name: 'Available (capacity) hours', type: 'number' }, { id: 'cp-contractual', name: 'Contractual hours', type: 'number' }, { id: 'cp-absence', name: 'Absence hours', type: 'number' },
  { id: 'cp-planned', name: 'Planned hours', type: 'number' }, { id: 'cp-actual', name: 'Recorded hours', type: 'number' },
  { id: 'cp-planutil', name: 'Planned utilization %', type: 'number' }, { id: 'cp-util', name: 'Utilization %', type: 'number' },
]
const percent = (part: number, whole: number) => whole > 0 ? String(Math.round(part / whole * 1000) / 10) : ''
// Team overview's person-month rows (dashboard.ts personMonths: the same capacity model, people, regions and roles).
export function capacityRows(items: AzureWorkItem[], months: string[], today: string, settings: CapacitySettings): SourceRow[] {
  return personMonths(items, months, today, settings).map((row) => ({ cells: {
    'cp-person': row.person, 'cp-region': row.region ?? '', 'cp-role': row.role ?? '', 'cp-month': `${row.month}-01`, 'cp-status': row.status,
    'cp-available': numberText(row.capacity), 'cp-contractual': numberText(row.contractual), 'cp-absence': numberText(row.absence),
    'cp-planned': numberText(row.plan), 'cp-actual': numberText(row.actual), 'cp-planutil': percent(row.plan, row.capacity), 'cp-util': percent(row.actual, row.capacity),
  } }))
}

// ---- MYD-20 KPI tracker ----
export const kpiSource = 'kpi:tracker'
export const kpiFields: SourceField[] = [
  { id: 'kp-sheet', name: 'Sheet', type: 'category' }, { id: 'kp-kpi', name: 'KPI', type: 'category' }, { id: 'kp-column', name: 'Column', type: 'category' },
  { id: 'kp-month', name: 'Month', type: 'date' }, { id: 'kp-value', name: 'Value', type: 'number' },
]
const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
// A column heading that names a month: "2026-03", "Mar 2026", "March-26", "03/2026".
export function headingMonth(text: string): string {
  const value = text.trim().toLowerCase()
  let found = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(value)
  if (found && Number(found[2]) >= 1 && Number(found[2]) <= 12) return `${found[1]}-${found[2]}`
  found = /^(\d{1,2})[/.](\d{4})$/.exec(value)
  if (found && Number(found[1]) >= 1 && Number(found[1]) <= 12) return `${found[2]}-${found[1].padStart(2, '0')}`
  found = /^([a-z]{3})[a-z]*[\s'-]*(\d{2}|\d{4})$/.exec(value)
  if (found && monthNames.includes(found[1])) return `${found[2].length === 2 ? `20${found[2]}` : found[2]}-${String(monthNames.indexOf(found[1]) + 1).padStart(2, '0')}`
  return ''
}
// Every number of every sheet as a row: the sheet, the KPI (the row's first cell), the column heading, the month the
// heading names (else none) and the value. Cells that are not numbers ("n/a", text) are left out.
export function kpiRows(tracker: KpiTracker): SourceRow[] {
  const rows: SourceRow[] = []
  for (const sheet of tracker.sheets) {
    const table = sheetTable(sheet)
    for (const row of table.rows) {
      const kpi = (row[0] ?? '').trim()
      if (!kpi) continue
      table.headers.forEach((header, at) => {
        if (at === 0) return
        const raw = (row[at] ?? '').trim().replace(/,/g, '')
        const value = /^-?\d+(\.\d+)?%?$/.test(raw) ? Number(raw.replace('%', '')) : NaN
        if (!Number.isFinite(value)) return
        const month = headingMonth(header)
        rows.push({ cells: { 'kp-sheet': sheet.name, 'kp-kpi': kpi, 'kp-column': header, 'kp-month': month ? `${month}-01` : '', 'kp-value': String(value) } })
      })
    }
  }
  return rows
}

// ---- MYD-21 Historical hours ----
export const historySource = 'history:hours'
export const historyFields: SourceField[] = [
  { id: 'hs-person', name: 'Team member', type: 'category' }, { id: 'hs-month', name: 'Month', type: 'date' }, { id: 'hs-stream', name: 'Stream', type: 'category' },
  { id: 'hs-activity', name: 'Activity', type: 'text' }, { id: 'hs-type', name: 'Type', type: 'category' }, { id: 'hs-tag', name: 'Tag', type: 'category' },
  { id: 'hs-feature', name: 'Feature No', type: 'text' }, { id: 'hs-epic', name: 'Epic No', type: 'text' },
  { id: 'hs-planned', name: 'Planned hours', type: 'number' }, { id: 'hs-actual', name: 'Recorded hours', type: 'number' },
]
// The imported rows as written (before the cut-off month), the person under their report name (HIS-04).
export function historyRows(file: HistoryFile): SourceRow[] {
  return file.rows.map((row) => ({ cells: {
    'hs-person': file.people[row.person] ?? row.person, 'hs-month': `${row.month}-01`, 'hs-stream': row.stream, 'hs-activity': row.activity, 'hs-type': row.type ?? '', 'hs-tag': row.tag ?? '',
    'hs-feature': row.featureId ? String(row.featureId) : '', 'hs-epic': row.epicId ? String(row.epicId) : '', 'hs-planned': numberText(row.planned), 'hs-actual': numberText(row.actual),
  } }))
}

// ---- the registry ----
const cellText = (value: unknown) => value == null ? '' : typeof value === 'object' ? JSON.stringify(value).slice(0, 200) : String(value).slice(0, 500)
export const sourceKinds: SourceKind[] = [
  { id: 'page', label: 'On-Demand table pages', areas: ['ondemand'], describe: 'The rows of every table page as saved in Git (DSH-03).',
    entries: (input) => input.sees('ondemand') ? input.pages.map((dataset) => entry(dataset, 'On-Demand table pages')) : [] },
  { id: 'hours', label: 'Time Writing hours', areas: ['insights'], describe: 'Planned and booked hours as Team overview counts them (DSH-16).',
    entries: (input, wanted) => { const allowed = input.sees('insights'); return [entry(hoursFor(allowed, allowed && wanted(hoursSource) ? input.hours(true) : []), 'Time Writing hours')] } },
  { id: 'azure', label: 'Azure DevOps work', areas: ['board', 'mywork'], describe: 'Features, User Stories and Tasks of the fetched Azure DevOps data.',
    entries: (input, wanted) => {
      const name = 'Azure DevOps work', kind = 'Features, User Stories, Tasks'
      const all = input.sees('board'), mine = !all && input.sees('mywork')
      if (!all && !mine) return [entry(blocked(azureWorkSource, name, kind, notAvailable), name)]
      if (!input.items.some((item) => !isHistory(item))) return [entry(blocked(azureWorkSource, name, kind, 'Load Azure DevOps data to see this: fetch from Azure DevOps.'), name, 'azure')]
      const rows = wanted(azureWorkSource) ? azureWorkRows(input.items, mine ? input.me : undefined) : []
      return [entry(fieldsDataset(azureWorkSource, name, kind, mine ? 'Your own Features, User Stories and Tasks from the fetched data (your role sees My Tasks [Board], not the team’s backlogs)' : 'The Features, User Stories and Tasks of the fetched Azure DevOps data; drill down to open an item', azureWorkFields, rows), name)]
    } },
  { id: 'releases', label: 'Releases per stream', areas: ['release', 'insights'], describe: 'The releases of every stream as Pulse Check counts them.',
    entries: (input, wanted) => {
      const name = 'Releases per stream', kind = 'as in Pulse Check'
      if (!input.sees('release') && !input.sees('insights')) return [entry(blocked(releasesSource, name, kind, notAvailable), name)]
      return [entry(fieldsDataset(releasesSource, name, kind, 'Completed and Supported releases of every stream in each month of the period, counted as Pulse Check counts them (a Count per stream and month is Pulse Check’s)', releaseFields, wanted(releasesSource) ? releaseRows(input.months, input.releases.streamsOf) : []), name)]
    } },
  { id: 'capacity', label: 'Capacity and utilization', areas: ['insights'], describe: 'Team overview’s figures per team member and month.',
    entries: (input, wanted) => {
      const name = 'Capacity and utilization', kind = 'as in Team overview'
      if (!input.sees('insights')) return [entry(blocked(capacitySource, name, kind, notAvailable), name)]
      return [entry(fieldsDataset(capacitySource, name, kind, 'Team overview’s available, contractual, absence, planned and recorded hours per team member and month; a group’s utilization is the Sum of Recorded hours ÷ the Sum of Available hours (an Average of Utilization % is the average of the people’s)', capacityFields, wanted(capacitySource) ? capacityRows(input.items, input.months, input.today, input.settings) : []), name)]
    } },
  { id: 'qe', label: 'QE Mapping', areas: ['qemapping'], describe: 'The rows of each sheet of the QE Mapping (qe-mapping.json).',
    entries: (input) => {
      const name = 'QE Mapping', kind = 'QE Mapping sheet'
      if (!input.sees('qemapping')) return [entry(blocked('qe:mapping', name, kind, notAvailable), name)]
      if (!input.qe.file) return [entry(blocked('qe:mapping', name, kind, input.qe.loaded ? 'There is no QE Mapping in Git yet.' : 'Load the QE Mapping to see this.'), name, input.qe.loaded ? undefined : 'qe')]
      return input.qe.file.sheets.map((sheet) => entry(tableDataset(`qe:${safeId(sheet.id, 60)}`, input.qe.file!.sheets.length > 1 ? `QE Mapping · ${sheet.name}` : name, kind, `The rows of the QE Mapping${input.qe.file!.sheets.length > 1 ? ` sheet ${sheet.name}` : ''} as saved in Git`, sheet.columns.map((column) => column.name), sheet.rows.map((row) => sheet.columns.map((column) => row.cells[column.id] ?? '')), 'qe'), name))
    } },
  { id: 'kpi', label: 'KPI tracker', areas: ['insights'], describe: 'Every number of the KPI tracker’s Git copy, by sheet, KPI and column.',
    entries: (input, wanted) => {
      const name = 'KPI tracker values', kind = 'KPI tracker'
      if (!input.sees('insights')) return [entry(blocked(kpiSource, name, kind, notAvailable), name)]
      if (input.kpi === undefined) return [entry(blocked(kpiSource, name, kind, 'Load the KPI tracker to see this.'), name, 'kpi')]
      if (input.kpi === null) return [entry(blocked(kpiSource, name, kind, 'There is no KPI tracker copy in Git yet.'), name)]
      return [entry(fieldsDataset(kpiSource, name, kind, 'The numbers of the KPI tracker’s Git copy by sheet, KPI (a row’s first cell) and column; Month when the column heading names one', kpiFields, wanted(kpiSource) ? kpiRows(input.kpi) : []), name)]
    } },
  { id: 'history', label: 'Historical hours', areas: ['insights'], describe: 'The imported historical hours (history-hours.json) as written.',
    entries: (input, wanted) => {
      const name = 'Historical hours', kind = 'imported'
      if (!input.sees('insights')) return [entry(blocked(historySource, name, kind, notAvailable), name)]
      if (!input.history.connected) return [entry(blocked(historySource, name, kind, 'Connect Git storage to see the historical hours.'), name)]
      if (!input.history.file) return [entry(blocked(historySource, name, kind, input.history.loaded ? 'No historical hours are imported.' : 'Load the historical hours to see this.'), name, input.history.loaded ? undefined : 'history')]
      return [entry(fieldsDataset(historySource, name, kind, `The imported planned and recorded hours before ${input.history.file.cutoff}, as written in the import`, historyFields, wanted(historySource) ? historyRows(input.history.file) : []), name)]
    } },
  { id: 'windchill', label: 'Windchill exports', areas: ['release'], describe: 'The rows of each Windchill export.',
    entries: (input) => {
      const name = 'Windchill export', kind = 'Windchill export'
      if (!input.sees('release')) return [entry(blocked('windchill:exports', name, kind, notAvailable), name)]
      if (!input.windchill.length) return [entry(blocked('windchill:exports', name, kind, 'Import or fetch a Windchill export to see this.'), name, 'windchill')]
      return input.windchill.map((source) => entry(tableDataset(`windchill:${safeId(source.viewId, 54)}`, `Windchill · ${source.name}`, kind, `The rows of the Windchill export ${source.name}`, source.columns, source.rows.map((row) => source.columns.map((column) => cellText(row[column]))), 'wc'), name))
    } },
]
// Pulse Check and the Monthly pack are not sources of their own: their figures are the release counts (Releases per
// stream, the Pulse Check rules) and the utilization (Capacity and utilization) — see MYD-22.

// The source keys a stored block may name (MYD-23): the table pages and the Time Writing hours (DSH-04) and each kind above.
export const mySourcePattern = /^(page:[a-z0-9][a-z0-9-]{0,39}|hours:time-writing|azure:work|releases:streams|capacity:people|kpi:tracker|history:hours|qe:[\w.-]{1,60}|windchill:[\w.-]{1,54})$/
export const kindOfKey = (key: string) => key === hoursSource ? 'hours' : key.split(':')[0] === 'page' ? 'page' : key.split(':')[0] === 'releases' ? 'releases' : key.split(':')[0] === 'capacity' ? 'capacity' : key.split(':')[0]

// Every source entry in the registry's order; wanted: the keys whose rows are worked out.
export const sourceEntries = (input: SourceInput, wanted: (key: string) => boolean = () => true) => sourceKinds.flatMap((kind) => kind.entries(input, wanted))
// A block's source as the viewer gets it — fail closed: a kind the viewer's role cannot see is "Not available for your
// role." whatever the key; a source no longer there says so.
export function entryOf(entries: SourceEntry[], key: string, sees: (area: Area) => boolean): SourceEntry {
  const kind = sourceKinds.find((entry) => entry.id === kindOfKey(key))
  if (kind && !kind.areas.some((area) => sees(area))) return { dataset: { ...missingDataset(key, notAvailable), name: kind.label }, kind: kind.label }
  const found = entries.find((candidate) => candidate.dataset.key === key)
  if (found) return found
  // A sheet or export of a kind that is not loaded yet takes that kind's load entry.
  const pending = entries.find((candidate) => kindOfKey(candidate.dataset.key) === kindOfKey(key) && candidate.load)
  if (pending) return pending
  return { dataset: missingDataset(key, key.startsWith('page:') ? `The table page “${pageOfSource(key)}” is no longer there (removed), or you cannot see it.` : 'This data source is no longer there (a sheet or export removed).'), kind: kind?.label ?? '' }
}
