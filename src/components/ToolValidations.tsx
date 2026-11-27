import { lazy, Suspense, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { recordJob } from '../backgroundJobs'
import { outcomeText } from '../gitSaveQueue'
import { defaultIcon, deleteReason, gitReasonOf, isHidden, kindLabel as pageKindLabel, kindOf, onDemandGroup, placementOf, removePlacement, serializeMenuLayout, setHidden, withListOwners, type MenuLayout, type PageKind } from '../menuLayout'
import { renamePage } from '../onDemand'
import { createPage, type MenuLayoutStore } from '../useMenuLayout'
import { usePageNameClash } from '../usePageNames'
import { utcToday } from '../businessTime'
import { formatDate, formatDateTime, monthName } from '../format'
import { statusText, type ToolMonthStatus, type ToolStatusRow } from '../toolQueries'
import { windchillCell } from '../windchillViews'
import { addSource, emptyMapping, categoryLabel, categoryOf, categoryProblem, feedsMasterList, setCategory, sourceCategories, type SourceCategory, azureFieldOptions, azureInputs, azureLock, completionDated, completionNote, dueFromText, isAzureKind, readsCompletion, cleanDays, daysLeftText, defaultValidityMonths, dueFromLabel, dueOf, editOf, editProblem, entryState, entryStateLabel, expiryRows, guessMapping, inputsFromRows, kindLabel, mappingFields, mappingFor, markMerged, maxExpiryDays, mergeSource, mergeSummary, nameLocked, removeSource, removeTool, saveTool, setMapping, setTeam, sourceKinds, sourceProblem, statusLabel, openToolTab, toolKey, toolTabDocuments, toolTabTools, toolTabExpiry, mapped, noField, isAzureField, toolTabMaster, toolTabSetup, toolTabs, toolValidationsFile, addTab, addTabReason, customToolTabs, hiddenPageChoices, listReason, parseToolValidations, tabOwnerCounts, tabOwnersBehind, tabOwnersLayout, maxCustomTabs, maxTabName, moveTab, removeTab, renameTab, tabNameProblem, validityOf, bandCounts, bandFor, bandLabel, bandShort, bandsOf, colourLabel, defaultHighlights, highlightColours, highlightsProblem, maxHighlightDays, maxHighlights, setHighlights, sortBands, type CustomTab, type EntryState, type ExpiryRow, type ExpiryStatus, type ToolEdit, type ToolEntry, type ToolInput, type ToolMapping, type ToolSource, type ToolSourceKind, type ToolValidationsFile, type HighlightBand, type HighlightColour } from '../toolValidations'
import { useToolValidationsEnv, type CustomTabsEnv, type SourceData, type ToolValidationsEnv } from '../useToolValidations'
import { DataTable, type DataColumn } from './DataTable'
import { OwnersField, PageNameField } from './PageDialogs'
import { usePageTypeChoice } from '../usePageTypeChoice'
import { ResultTabs } from './ResultTabs'
import { EmptyState, Metric, Metrics, Modal, Notice, Panel, Pill, SaveQueueStatus, SettingsSummary, TablePanel, WriteBlocked } from './ui'

// TVL-08…TVL-12, TVL-14: the Tool Validations Release page's tabs — Expiry list (what is overdue or due soon in the
// viewer's own window of N days: the tiles, then the expiry table; the owners set the team default there too), Master
// list (every tool kept in Git, with its Current Month Status, TVL-35), Tool List [TFS] and Validation Documents [TFS]
// (the two queries' rows, TVL-31), one tab per
// other source (its rows as mapped, Edit mapping…, Merge into master list…) and Setup last (the sources and the team settings). Everyone reads them; the Tool Owner and the list's
// co-owners change them (TVL-11), each change saved to Git (GIT-17) with its result under Background jobs (UI-STANDARDS §8).


const pillTone: Record<ExpiryStatus, 'danger' | 'warning' | 'neutral' | 'info'> = { overdue: 'danger', due: 'warning', none: 'neutral', later: 'info' }
const stateTone: Record<EntryState, 'open' | 'warning' | 'neutral'> = { 'in-source': 'open', gone: 'warning', manual: 'neutral' }
const sourceNames = (file: ToolValidationsFile, entry: ToolEntry) => Object.entries(entry.sources).map(([id, link]) => `${file.sources.find((source) => source.id === id)?.name ?? id}${link.inSource ? '' : ' (not in it now)'}`).join(', ')
// TVL-06: the validity period shown — the entry's own; "24 (default)" when the default gives its due date; else —.
type PeriodOf = Parameters<typeof validityOf>[0]
const periodCell = (entry: PeriodOf) => { const period = validityOf(entry); return period.defaulted ? <>{period.months} <small>(default)</small></> : period.months ? `${period.months}` : '—' }
const periodExport = (entry: PeriodOf) => { const period = validityOf(entry); return period.defaulted ? `${period.months} (default)` : period.months ?? '' }

// ---- TVL-28: the due date highlights on the Expiry list and the Master list — the row tinted in its band's colour, a
// marker with the band's text in the Due date cell (not colour alone) and a legend of the bands above the table ----
const bandClass = (band?: HighlightBand) => band ? `tvl-hl tvl-hl-${band.colour}` : undefined
const BandPill = ({ band }: { band?: HighlightBand }) => band ? <span className={`pill tvl-band tvl-band-${band.colour}`} title={bandLabel(band)}>{bandShort(band)}</span> : null
const Swatch = ({ colour }: { colour: HighlightColour }) => <span className={`tvl-swatch tvl-band-${colour}`} aria-hidden="true" />
function BandLegend({ bands }: { bands: HighlightBand[] }) {
  if (!bands.length) return null
  return <p className="tvl-legend" aria-label="Due date highlights"><span className="muted">Highlighted:</span>{bands.map((band) => <span key={band.days} className="tvl-legend-item"><Swatch colour={band.colour} />{bandLabel(band)}</span>)}<span className="muted">(an overdue tool is in the first band; set on Setup)</span></p>
}

// TVL-06, TVL-29: the validation date with where it comes from — "(entered)" by hand, "(completion date)" when it is the
// completion date of Azure DevOps (Stream mapping → Tool Validations queries → Completion date).
function ValidationDate({ file, entry }: { file: ToolValidationsFile; entry: ToolEntry }) {
  return <>{formatDate(entry.validationDate, '—')}{entry.manual.includes('validationDate') ? <small> (entered)</small> : completionDated(file, entry) ? <small> {completionNote}</small> : null}</>
}

// Without the app's provider (never in the app itself) the tabs say so instead of failing.
function Missing() { return <Panel><EmptyState title="The Tool Validations master list is not available here." /></Panel> }

// ---- TVL-14, TVL-15: the tabs — Expiry list first, Master list, Tool List [TFS], Validation Documents [TFS] (only with
// the two queries: `documents` given), one per other source in the order added, the owners' tabs in their order, Setup
// last ----
// TVL-23: `masterTop` (the month's Validations, Completed and Supported counts) shows on the Master list tab only.
// TVL-35: `status` — the Current Month Status of the master list's tools in `month` (toolMonthStatus).
export interface MonthStatus { month: string; status: ToolMonthStatus }
export function ToolValidationsTabs({ id, toolList, documents, masterTop, status }: { id: string; toolList: ReactNode; documents?: ReactNode; masterTop?: ReactNode; status?: MonthStatus }) {
  const env = useToolValidationsEnv()
  const file = env?.store.shown ?? { sources: [], tabs: [] }
  const extra = toolTabs(file, customToolTabs(file), documents !== undefined).filter((tab) => tab.key !== toolTabExpiry)
    .map((tab) => ({ key: tab.key, label: tab.label, node: tab.key === toolTabMaster ? <>{masterTop}<ToolMasterList status={status} /></> : tab.key === toolTabTools ? toolList : tab.key === toolTabDocuments ? documents : tab.key === toolTabSetup ? <ToolSetup /> : env && tab.source ? <SourceTab env={env} source={tab.source} /> : env && tab.custom ? <CustomTabView env={env} tab={tab.custom} /> : <Missing /> }))
  return <ResultTabs id={id} mainKey={toolTabExpiry} mainLabel="Expiry list" main={<ToolExpiryTab status={status} />} extra={extra} open={openToolTab} />
}

// ---- TVL-35: the Current Month Status column — "Completed", "Supported" or both as pills; blank otherwise ----
const statusTitle = (status: MonthStatus) => `Current Month Status in ${monthName(status.month)} (the header month, UTC): Completed — the tool's completion date is in the month; Supported — one of its documents has a Quality signature in the month. Only the tools of the Tool List [TFS] query.`
function statusColumn<R>(status: MonthStatus | undefined, entryOf: (row: R) => ToolEntry): DataColumn<R>[] {
  if (!status) return []
  const of = (row: R): ToolStatusRow | undefined => status.status.byKey.get(entryOf(row).key)
  return [{ id: 'month-status', label: 'Current Month Status', value: (row) => statusText(of(row)), title: () => statusTitle(status),
    render: (row) => { const found = of(row); return found && (found.completed || found.supported) ? <span className="nowrap">{found.completed && <Pill tone="open">Completed</Pill>}{found.completed && found.supported && ' '}{found.supported && <Pill tone="info">Supported</Pill>}</span> : '' } }]
}

// ---- TVL-08, TVL-09, TVL-14: the Expiry list tab — the tiles, then the Validation expiry table ----
export function ToolExpiryTab({ status }: { status?: MonthStatus }) {
  const env = useToolValidationsEnv()
  if (!env) return <Missing />
  return <ToolExpiry env={env} status={status} />
}
type StatusFilter = 'all' | 'overdue' | 'due' | 'none'
function ToolExpiry({ env, status: monthStatus }: { env: ToolValidationsEnv; status?: MonthStatus }) {
  const [status, setStatus] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const file = env.store.shown, why = env.store.reason
  const teamDays = file.defaultDays, days = env.personalDays ?? teamDays
  const today = utcToday()
  const all = expiryRows(file.tools, today, days)
  const count = (key: ExpiryStatus) => all.filter((row) => row.status === key).length
  const needle = search.trim().toLowerCase()
  const rows = all.filter((row) => (status === 'all' || row.status === status) && (!needle || `${row.entry.name} ${row.entry.version} ${row.entry.notes ?? ''}`.toLowerCase().includes(needle)))
  const typed = draft ?? String(days)
  const typedDays = cleanDays(typed)
  const bands = bandsOf(file)
  const columns: DataColumn<ExpiryRow>[] = [
    { id: 'status', label: 'Status', value: (row) => statusLabel[row.status], render: (row) => <Pill tone={pillTone[row.status]}>{statusLabel[row.status]}</Pill> },
    { id: 'name', label: 'Tool', value: (row) => row.entry.name },
    { id: 'version', label: 'Version', value: (row) => row.entry.version },
    { id: 'due', label: 'Due date', value: (row) => row.due ?? '', render: (row) => row.due ? <>{formatDate(row.due)} <BandPill band={bandFor(bands, row.due, today)} /></> : 'No due date', title: (row) => `Due date: ${dueFromText(row.from, completionDated(file, row.entry))}`, firstSortDesc: false },
    { id: 'days', label: 'Days left', align: 'right', value: (row) => row.days ?? '', render: (row) => daysLeftText(row) || '—', exportValue: (row) => row.days ?? '' },
    { id: 'from', label: 'Due date from', value: (row) => row.from === 'none' ? '' : dueFromText(row.from, completionDated(file, row.entry)) },
    { id: 'validated', label: 'Validation date', value: (row) => row.entry.validationDate ?? '', render: (row) => <ValidationDate file={file} entry={row.entry} /> },
    { id: 'period', label: 'Validity (months)', align: 'right', value: (row) => validityOf(row.entry).months ?? '', render: (row) => periodCell(row.entry), exportValue: (row) => periodExport(row.entry) },
    ...statusColumn<ExpiryRow>(monthStatus, (row) => row.entry),
    { id: 'sources', label: 'Sources', value: (row) => sourceNames(file, row.entry) || 'Added by hand', defaultHidden: true },
    { id: 'notes', label: 'Notes', value: (row) => row.entry.notes ?? '', defaultHidden: true },
  ]
  const reset = () => { setStatus('all'); setSearch('') }
  // TVL-09: the owners make the window shown the team default here, saved as Setup → Team settings saves it.
  const setDefault = async () => {
    const base = env.store.file
    setSaving(true); setSaveError('')
    try {
      const saved = await env.store.save(setTeam(base, days, base.owners), `Tool Validations: team default ${days} days, ${base.owners.length} co-owner${base.owners.length === 1 ? '' : 's'}`, 'Tool Validations · team settings')
      setDraft(null); env.setPersonalDays(undefined)
      // TVL-25: the save writes the co-owners (unchanged): the tab pages are brought in line with them when they are not.
      if (env.pages && !tabsReason(env)) await writeTabOwners(env.pages, savedFile(saved, base))
    } catch (failure) { setSaveError(failure instanceof Error ? failure.message : String(failure)) } finally { setSaving(false) }
  }
  const sameAsTeam = days === teamDays
  const windowField = <div className="tool-expiry-window">
    <label className="inline-field">Expiring in the next<input type="number" aria-label="Days ahead" min={1} max={maxExpiryDays} step={1} value={typed} onChange={(event) => { setDraft(event.target.value); const next = cleanDays(event.target.value); if (next !== undefined) env.setPersonalDays(next === teamDays ? undefined : next) }} onBlur={() => setDraft(null)} />days</label>
    <button type="button" className="ghost" disabled={env.personalDays === undefined} title={env.personalDays === undefined ? `You use the team default (${teamDays} days)` : `Back to the team default (${teamDays} days)`} onClick={() => { setDraft(null); env.setPersonalDays(undefined) }}>Use the team default ({teamDays})</button>
    <button type="button" className="ghost" disabled={Boolean(why) || saving || sameAsTeam || typedDays === undefined} title={why || (sameAsTeam ? `${days} days is the team default` : `Make ${days} days the team default for everyone (saved to Git)`)} onClick={() => void setDefault()}>{saving ? 'Saving to Git…' : `Set ${days} days as team default`}</button>
    <small className="muted" role="status">{typedDays === undefined ? `Enter a whole number of days from 1 to ${maxExpiryDays}.` : env.personalDays !== undefined ? `Your own window (${env.personalDays} days), kept for you; the team default is ${teamDays} days.` : `The team default: ${teamDays} days.`}</small>
    <WriteBlocked reason={why} />
    {saveError && <Notice tone="error">{saveError}</Notice>}
  </div>
  return <>
    <div className="tool-expiry-counts"><Metrics>
      <Metric label="Overdue" value={count('overdue')} hint="Due date passed" tone={count('overdue') ? 'negative' : undefined} />
      <Metric label={`Due in the next ${days} days`} value={count('due')} hint={`Due by ${formatDate(new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10))}`} />
      <Metric label="No due date" value={count('none')} hint="No due date and no validation date" />
    </Metrics></div>
    <TablePanel title="Validation expiry" count={`${rows.length} of ${all.length} tools`}
      info={<ul><li>Every tool of the master list that is <strong>overdue</strong> (its due date has passed), <strong>due</strong> within the next {days} days, or has <strong>no due date</strong> — never hidden. Tools due later are on the Master list tab.</li><li>The due date is the source's own due date (or one entered by hand) when there is one; else the validation date plus the validity period (months) — {defaultValidityMonths} months when the tool has none (shown as “{defaultValidityMonths} (default)”). A tool from Azure DevOps is validated on its <strong>completion date</strong> (Stream mapping → Tool Validations queries → Completion date; Changed Date by default, which moves on any edit of the work item) unless its source maps another validation date. Days are counted in UTC.</li><li>The window is yours: change it here and it is kept for you on every computer (your views); <strong>Use the team default</strong> goes back to the {teamDays} days the list's owners set. The Tool Owner and the list's co-owners make the window shown the team default with <strong>Set … days as team default</strong> (saved to Git, as Setup → Team settings).</li><li>Rows are <strong>highlighted</strong> by how soon they are due, in the colours of the team's bands (Setup → Due date highlights), with the band named in the Due date cell.</li><li>Export writes the rows shown (Excel or CSV; a value that could be read as a formula is written as text).</li></ul>}>
      <DataTable id="tool-validations:expiry" rows={rows} rowKey={(row) => row.entry.key} columns={columns} exportName="Tool validation expiry" defaultSort={{ id: 'days' }} rowClassName={(row) => bandClass(bandFor(bands, row.due, today))}
        toolbar={<div className="tool-filter-bar">{windowField}
          <div className="segmented" role="group" aria-label="Status">{([['all', 'All'], ['overdue', `Overdue (${count('overdue')})`], ['due', `Due soon (${count('due')})`], ['none', `No due date (${count('none')})`]] as [StatusFilter, string][]).map(([key, label]) => <button key={key} type="button" aria-pressed={status === key} onClick={() => setStatus(key)}>{label}</button>)}</div>
          <input className="search" type="search" aria-label="Search tools" placeholder="Search tool, version or notes" value={search} onChange={(event) => setSearch(event.target.value)} />
          <button type="button" className="ghost" disabled={status === 'all' && !search} onClick={reset}>Reset filters</button>
          <BandLegend bands={bands} />
        </div>}
        empty={<EmptyState title={all.length ? 'No tools match the filters.' : file.tools.length ? `No tool is overdue, due within ${days} days or without a due date.` : 'The master list has no tools yet.'} detail={all.length ? 'Reset filters to see every tool listed here.' : file.tools.length ? 'Widen the window, or see every tool on the Master list tab.' : 'Fetch the Tool Validations query (↻), or add a tool on the Master list tab.'} />} />
    </TablePanel>
  </>
}

// ---- reading a source (TVL-07) ----
// TVL-32: `table` — every column of the source and its rows as text, for a Validation Documents source's tab.
interface SourceTable { columns: [string, string][]; rows: Record<string, string>[] }
interface SourceRead { options: [string, string][]; rows: number; read: (mapping: ToolMapping) => ToolInput[]; table: () => SourceTable; missing: string; target: string }
const cellText = (value: unknown) => value == null ? '' : Array.isArray(value) ? value.join(', ') : String(value)
function readSource(source: Pick<ToolSource, 'kind' | 'ref'>, data: SourceData): SourceRead {
  const none = (missing: string, target: string): SourceRead => ({ options: [], rows: 0, read: () => [], table: () => ({ columns: [], rows: [] }), missing, target })
  if (source.kind === 'stream' || source.kind === 'azure') {
    const found = source.kind === 'stream' ? { name: 'Tool Validations', items: data.streamItems } : data.azure.find((entry) => entry.id === source.ref)
    if (!found) return none('That connection is not set up in this browser.', source.ref ?? '')
    const items = found.items ?? []
    if (!items.length) return none(`“${found.name}” has not been fetched in this browser yet (or has no items): fetch it first.`, found.name)
    const table = (): SourceTable => {
      const refs = [...new Set(items.flatMap((item) => Object.keys(item.fields ?? {})))].filter((ref) => ref !== 'System.Id' && ref !== 'System.Title')
      return { columns: [['System.Id', 'ID'], ['System.Title', 'Title'], ...refs.map((ref): [string, string] => [ref, ref])], rows: items.map((item) => ({ ...Object.fromEntries(refs.map((ref) => [ref, cellText(item.fields?.[ref])])), 'System.Id': String(item.id), 'System.Title': item.title })) }
    }
    return { options: azureFieldOptions(items), rows: items.length, read: (mapping) => azureInputs(items, mapping, data.patterns, data.completionField), table, missing: '', target: found.name }
  }
  if (source.kind === 'windchill') {
    const found = data.windchill.find((entry) => entry.id === source.ref)
    if (!found) return none('That Windchill export is not in this browser.', source.ref ?? '')
    if (!found.rows?.length) return none(`“${found.name}” has no rows here yet: import it (or load it from Git) first.`, found.name)
    const rows = found.rows
    return { options: found.columns.map((column): [string, string] => [column, column]), rows: rows.length, read: (mapping) => inputsFromRows(rows, mapping, (row, field) => field ? windchillCell(row, field) || undefined : undefined), table: () => ({ columns: found.columns.map((column): [string, string] => [column, column]), rows: rows.map((row) => Object.fromEntries(found.columns.map((column) => [column, windchillCell(row, column)]))) }), missing: '', target: found.name }
  }
  const page = data.pages.find((entry) => entry.id === source.ref)
  if (!page) return none('That table page is not in the menu (removed, or not read from Git yet).', source.ref ?? '')
  const rows = page.rows.filter((row) => !row.hidden)
  return { options: page.columns.map((column): [string, string] => [column.id, column.name]), rows: rows.length, table: () => ({ columns: page.columns.map((column): [string, string] => [column.id, column.name]), rows: rows.map((row) => Object.fromEntries(page.columns.map((column) => [column.id, cellText(row.cells[column.id])]))) }), read: (mapping) => inputsFromRows(rows, mapping, (row, field) => { const value = field ? row.cells[field] : undefined; return Array.isArray(value) ? value.join(', ') || undefined : value || undefined }), missing: rows.length ? '' : `“${page.name}” has no rows yet.`, target: page.name }
}
const choicesFor = (kind: Exclude<ToolSourceKind, 'stream'>, data: SourceData): [string, string][] => kind === 'azure' ? data.azure.map((entry) => [entry.id, entry.name]) : kind === 'windchill' ? data.windchill.map((entry) => [entry.id, entry.name]) : data.pages.map((entry) => [entry.id, entry.name])

// ---- TVL-10, TVL-12: the Master list ----
type StateFilter = 'all' | EntryState
type ToolDialogState = { kind: 'tool'; editing?: ToolEntry } | { kind: 'notes'; entry: ToolEntry } | { kind: 'remove'; entry: ToolEntry }
// The notices about the list's file in Git, on the Master list and on Setup: not connected, not readable, its save queue.
function StoreNotices({ env }: { env: ToolValidationsEnv }) {
  const { store } = env
  return <>
    {!store.connected && <Notice tone="info">Connect Git storage (Admin → Data & history) to keep the master list for the team. Until then the tools of the Tool Validations query fetched here are shown, not kept.</Notice>}
    {store.error && <Notice tone="warning">{toolValidationsFile} could not be read from Git: {store.error} The master list last read here is shown and cannot be changed.</Notice>}
    {store.refused.length > 0 && <Notice tone="warning">Not used — {toolValidationsFile} in Git: {store.refused.map((entry) => `${entry.name}: ${entry.reason}`).join(' · ')}</Notice>}
    <SaveQueueStatus state={store.queue} onRetry={() => void store.retry()} />
  </>
}
export function ToolMasterList({ status }: { status?: MonthStatus }) {
  const env = useToolValidationsEnv()
  const [dialog, setDialog] = useState<ToolDialogState | null>(null)
  const [filter, setFilter] = useState<StateFilter>('all')
  const [search, setSearch] = useState('')
  if (!env) return <Missing />
  const { store } = env, file = store.shown, why = store.reason
  const needle = search.trim().toLowerCase()
  const rows = file.tools.filter((entry) => (filter === 'all' || entryState(entry) === filter) && (!needle || `${entry.name} ${entry.version} ${entry.notes ?? ''}`.toLowerCase().includes(needle)))
  const countOf = (key: EntryState) => file.tools.filter((entry) => entryState(entry) === key).length
  const bands = bandsOf(file), today = utcToday()
  const columns: DataColumn<ToolEntry>[] = [
    { id: 'name', label: 'Tool', value: (entry) => entry.name },
    { id: 'version', label: 'Version', value: (entry) => entry.version },
    // TVL-34: from the Tool List [TFS] query — the work item ID, its Source (Used by), State (Validated) and Type.
    { id: 'azure-id', label: 'ID', align: 'right', value: (entry) => entry.id ?? '', render: (entry) => entry.id ?? '—' },
    { id: 'used-by', label: 'Used by', value: (entry) => entry.usedBy ?? '' },
    { id: 'azure-state', label: 'Validated', value: (entry) => entry.validated ?? '' },
    { id: 'azure-type', label: 'Type', value: (entry) => entry.type ?? '' },
    ...statusColumn<ToolEntry>(status, (entry) => entry),
    { id: 'validated', label: 'Validation date', value: (entry) => entry.validationDate ?? '', render: (entry) => <ValidationDate file={file} entry={entry} /> },
    { id: 'period', label: 'Validity (months)', align: 'right', value: (entry) => validityOf(entry).months ?? '', render: (entry) => <>{periodCell(entry)}{entry.manual.includes('validityMonths') && <small> (entered)</small>}</>, exportValue: (entry) => periodExport(entry) },
    { id: 'due', label: 'Due date', value: (entry) => dueOf(entry).due ?? '', render: (entry) => { const due = dueOf(entry); return due.due ? <>{formatDate(due.due)} <BandPill band={bandFor(bands, due.due, today)} /> <small>({dueFromText(due.from, completionDated(file, entry))})</small></> : 'No due date' } },
    { id: 'state', label: 'Status', value: (entry) => entryStateLabel[entryState(entry)], render: (entry) => <Pill tone={stateTone[entryState(entry)]}>{entryStateLabel[entryState(entry)]}</Pill> },
    { id: 'sources', label: 'Sources', value: (entry) => sourceNames(file, entry) || '—' },
    { id: 'notes', label: 'Notes', value: (entry) => entry.notes ?? '' },
    { id: 'added', label: 'Added', value: (entry) => entry.addedAt, render: (entry) => <>{formatDateTime(entry.addedAt)}{entry.addedBy && <small> · {entry.addedBy}</small>}</>, defaultHidden: true },
    // TVL-30: a tool from Azure DevOps is changed there — Edit disabled (Edit notes… for its notes), Remove too while
    // Azure DevOps returns it.
    { id: 'actions', label: 'Actions', sortable: false, export: false, render: (entry) => { const lock = azureLock(file, entry), noEdit = why || lock.edit, noRemove = why || lock.remove; return <div className="button-row nowrap"><button type="button" className="ghost" disabled={Boolean(noEdit)} title={noEdit || `Edit ${entry.name}`} onClick={() => setDialog({ kind: 'tool', editing: entry })}>Edit</button>{lock.edit && <button type="button" className="ghost" disabled={Boolean(why)} title={why || `Edit the notes of ${entry.name} (the rest comes from Azure DevOps)`} onClick={() => setDialog({ kind: 'notes', entry })}>Edit notes…</button>}<button type="button" className="text-button danger-text" disabled={Boolean(noRemove)} title={noRemove || `Remove ${entry.name}`} onClick={() => setDialog({ kind: 'remove', entry })}>Remove</button></div> } },
  ]
  const fromAzure = file.tools.some((entry) => azureLock(file, entry).edit)
  const close = () => setDialog(null)
  return <>
    <StoreNotices env={env} />
    {store.pending && why && <Notice tone="info">{mergeSummary(store.pending)} in the latest fetch of the Tool Validations query — shown here, saved to Git by the next Tool Owner or co-owner who opens the app.</Notice>}
    <TablePanel title="Master list" count={`${rows.length} of ${file.tools.length} tools`}
      info={<ul><li>Every tool the team has validated, kept in Git ({toolValidationsFile}). A tool <strong>stays</strong> once it is listed: when it leaves its source it is marked <strong>Not in source now</strong> until someone removes it.</li><li>The tools of the <strong>Tool Validations</strong> query are added whenever its data is fetched; the other sources are merged with <strong>Merge into master list</strong> (on the source's own tab, or Setup → Sources).</li><li>The same tool from two sources is one entry: the same name (letter case, spaces and punctuation ignored) and version. A date or period changed by hand is kept when the sources are read again.</li><li>A tool from <strong>Azure DevOps</strong> (the Tool Validations query or another query) is changed there: <strong>Edit</strong> is disabled for it, and <strong>Remove</strong> until Azure DevOps no longer returns it (Not in source now). Its validation date is the <strong>completion date</strong> unless its source maps another, and its due date that date + {defaultValidityMonths} months unless the source gives a period or a due date.</li><li>Rows are <strong>highlighted</strong> by how soon they are due, in the colours of the team's bands (Setup → Due date highlights), with the band named in the Due date cell.</li><li>The Tool Owner and the list's co-owners change it; everyone else reads it.</li></ul>}
      action={<button type="button" className="primary" disabled={Boolean(why)} title={why || 'Add a tool by hand'} onClick={() => setDialog({ kind: 'tool' })}>＋ Add tool…</button>}>
      <WriteBlocked reason={why || (fromAzure ? 'Tools from Azure DevOps are changed there: Edit is disabled for them (Edit notes… changes their notes here), and Remove until Azure DevOps no longer returns them.' : '')} />
      <DataTable id="tool-validations:master" rows={rows} rowKey={(entry) => entry.key} columns={columns} exportName="Tool validations master list" defaultSort={{ id: 'name' }} rowClassName={(entry) => bandClass(bandFor(bands, dueOf(entry).due, today))}
        toolbar={<div className="tool-filter-bar">
          <div className="segmented" role="group" aria-label="Status">{([['all', 'All'], ['in-source', `In source (${countOf('in-source')})`], ['gone', `Not in source now (${countOf('gone')})`], ['manual', `Added by hand (${countOf('manual')})`]] as [StateFilter, string][]).map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div>
          <input className="search" type="search" aria-label="Search the master list" placeholder="Search tool, version or notes" value={search} onChange={(event) => setSearch(event.target.value)} />
          <button type="button" className="ghost" disabled={filter === 'all' && !search} onClick={() => { setFilter('all'); setSearch('') }}>Reset filters</button>
          <BandLegend bands={bands} />
        </div>}
        empty={<EmptyState title={file.tools.length ? 'No tools match the filters.' : 'The master list has no tools yet.'} detail={file.tools.length ? 'Reset filters to see every tool.' : 'Fetch the Tool Validations query (↻), merge a source (its tab, or Setup → Sources), or add a tool by hand.'} />} />
    </TablePanel>
    {dialog?.kind === 'tool' && <ToolDialog env={env} editing={dialog.editing} onClose={close} />}
    {dialog?.kind === 'notes' && <NotesDialog env={env} entry={dialog.entry} onClose={close} />}
    {dialog?.kind === 'remove' && <RemoveDialog env={env} entry={dialog.entry} onClose={close} />}
  </>
}

// ---- TVL-01, TVL-07, TVL-09, TVL-11, TVL-14: the Setup tab — the sources and the team settings ----
type Dialog = { kind: 'team' } | { kind: 'highlights' } | { kind: 'add-source' } | { kind: 'mapping'; source: ToolSource } | { kind: 'merge'; source: ToolSource } | { kind: 'remove-source'; source: ToolSource } | { kind: 'add-tab' } | { kind: 'add-existing-tab' } | { kind: 'rename-tab'; tab: CustomTab } | { kind: 'remove-tab'; tab: CustomTab }
export function ToolSetup() {
  const env = useToolValidationsEnv()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  if (!env) return <Missing />
  const file = env.store.shown, why = env.store.reason
  const close = () => setDialog(null)
  return <>
    <StoreNotices env={env} />
    <SourcesPanel env={env} why={why} open={setDialog} />
    <TabsPanel env={env} why={why} open={setDialog} />
    <Panel title="Team settings" info="The team default of the expiry window and the co-owners of the list, kept in the master list's file in Git. Each person may look at their own window on the Expiry list tab, where the owners may also set the team default."
      action={<button type="button" className="ghost" disabled={Boolean(why)} title={why || 'Change the team default and the co-owners'} onClick={() => setDialog({ kind: 'team' })}>Edit…</button>}>
      <SettingsSummary rows={[['Expiry window (team default)', `${file.defaultDays} days`], ['Co-owners', file.owners.length ? file.owners.join(', ') : 'Nobody yet — only Tool Owners change the list']]} />
      <WriteBlocked reason={why} />
    </Panel>
    <HighlightsPanel env={env} why={why} open={setDialog} />
    {dialog?.kind === 'team' && <TeamDialog env={env} onClose={close} />}
    {dialog?.kind === 'highlights' && <HighlightsDialog env={env} onClose={close} />}
    {dialog?.kind === 'add-source' && <AddSourceDialog env={env} onClose={close} />}
    {dialog?.kind === 'mapping' && <MappingDialog env={env} source={dialog.source} onClose={close} />}
    {dialog?.kind === 'merge' && <MergeDialog env={env} source={dialog.source} onClose={close} />}
    {dialog?.kind === 'remove-source' && <RemoveSourceDialog env={env} source={dialog.source} onClose={close} />}
    {dialog?.kind === 'add-tab' && env.pages && <AddTabDialog env={env} pages={env.pages} onClose={close} />}
    {dialog?.kind === 'add-existing-tab' && env.pages && <AddExistingTabDialog env={env} pages={env.pages} onClose={close} />}
    {dialog?.kind === 'rename-tab' && env.pages && <RenameTabDialog env={env} pages={env.pages} tab={dialog.tab} onClose={close} />}
    {dialog?.kind === 'remove-tab' && env.pages && <RemoveTabDialog env={env} pages={env.pages} tab={dialog.tab} onClose={close} />}
  </>
}

function SourcesPanel({ env, why, open }: { env: ToolValidationsEnv; why: string; open: (dialog: Dialog) => void }) {
  const file = env.store.shown
  return <Panel title="Sources" info={<ul><li><strong>Tool Validations query</strong>: the connection named “Tool Validations”; its tools are added to the master list whenever its data is fetched.</li><li><strong>Another Azure DevOps query</strong>, a <strong>Windchill export</strong> or a <strong>manual list</strong> (a Table page of the app, e.g. one added under On-Demand): read on its own page, shown on a tab of its own here (its rows as mapped) and merged with <strong>Merge into master list</strong>, which shows what changes before it saves.</li><li>Each source is read with its <strong>field mapping</strong> — which field or column gives the tool name, version, validation date, validity period and due date. Until the mapping is saved, the app's guesses are used (marked “Guessed”).</li><li><strong>Category</strong>, asked when a source is added and changed in its Edit mapping…: only a <strong>Tool List</strong> feeds the master list. A <strong>Validation Documents</strong> source keeps its own tab with every column of its rows and never adds to or changes the master list; changed to Validation Documents, the tools it fed stay, marked “Not in source now” for it.</li></ul>}
    action={<button type="button" className="ghost" disabled={Boolean(why)} title={why || 'Add another source'} onClick={() => open({ kind: 'add-source' })}>＋ Add source…</button>}>
    <WriteBlocked reason={why} />
    <div className="azure-table tool-sources"><table><thead><tr><th>Source</th><th>Category</th><th>Reads</th><th>Field mapping</th><th className="num">Tools</th><th>Last merged</th><th>Actions</th></tr></thead><tbody>
      {file.sources.map((source) => {
        const read = readSource(source, env.sources)
        const mapping = mappingFor(source, read.options)
        const tools = file.tools.filter((entry) => entry.sources[source.id]?.inSource).length
        const feeds = feedsMasterList(source)
        return <tr key={source.id}>
          <td><strong>{source.name}</strong><small>{kindLabel(source.kind)}</small></td>
          <td><Pill tone={feeds ? 'info' : 'neutral'}>{categoryLabel(categoryOf(source))}</Pill></td>
          <td><small className="plain">{read.target || '—'}{read.missing ? ` — ${read.missing}` : ` · ${read.rows} row${read.rows === 1 ? '' : 's'}`}</small></td>
          <td><small className="plain">{!feeds ? 'Not needed — every column is listed on its tab' : <>{source.mapping.confirmed ? 'Saved' : <Pill tone="warning">Guessed</Pill>} {fieldsOf(source).filter((field) => mapped(mapping, field.key)).map((field) => `${field.label.replace(' (optional)', '')}: ${optionLabel(read.options, mapping[field.key]!)}`).join(' · ') || 'Nothing mapped'}</>}</small></td>
          <td className="num">{feeds ? tools : '—'}</td>
          <td><small className="plain">{!feeds ? 'Never (Validation Documents)' : source.mergedAt ? `${formatDateTime(source.mergedAt)}${source.mergedBy ? ` · ${source.mergedBy}` : ''}` : source.kind === 'stream' ? 'At each fetch' : 'Not yet'}</small></td>
          <td><div className="button-row nowrap">
            <button type="button" className="ghost" disabled={Boolean(why)} title={why || `Set which fields of ${source.name} are read`} onClick={() => open({ kind: 'mapping', source })}>Edit mapping…</button>
            {source.kind !== 'stream' && feeds && <button type="button" className="ghost" disabled={Boolean(why || read.missing)} title={why || read.missing || `Merge the tools of ${source.name} into the master list`} onClick={() => open({ kind: 'merge', source })}>Merge into master list…</button>}
            {source.kind !== 'stream' && <button type="button" className="text-button danger-text" disabled={Boolean(why)} title={why || `Remove the source ${source.name}`} onClick={() => open({ kind: 'remove-source', source })}>Remove</button>}
          </div></td>
        </tr>
      })}
    </tbody></table></div>
  </Panel>
}
// TVL-34: ID, Used by, Validated and Type are mapped for an Azure DevOps source only.
const fieldsOf = (source: Pick<ToolSource, 'kind'>) => mappingFields.filter((field) => !field.azureOnly || isAzureKind(source.kind))
const optionLabel = (options: [string, string][], key: string) => options.find(([value]) => value === key)?.[1].replace(/ \(.*\)$/, '') ?? key

// ---- TVL-14: the tab of one other source — its rows as read with its field mapping, Edit mapping… and Merge ----
interface SourceRow { index: number; input: ToolInput; listed: boolean }
const howToLoad = (source: ToolSource) => source.kind === 'azure' ? 'Open its page (Release Details or the menu group it is in) and fetch it there with ↻ — read only, nothing is written to Azure DevOps — then come back to this tab.'
  : source.kind === 'windchill' ? 'Import the Windchill export (Import Windchill export), or load it from Git on its page, then come back to this tab.'
  : 'Open the table page in the menu and add its rows (or wait until it is read from Git), then come back to this tab.'
function SourceTab({ env, source }: { env: ToolValidationsEnv; source: ToolSource }) {
  return feedsMasterList(source) ? <ToolListSourceTab env={env} source={source} /> : <DocumentsSourceTab env={env} source={source} />
}
// TVL-32: a Validation Documents source's tab — its rows with every column of the source, in its order; nothing is merged.
interface DocumentRow { index: number; cells: Record<string, string> }
function DocumentsSourceTab({ env, source }: { env: ToolValidationsEnv; source: ToolSource }) {
  const [dialog, setDialog] = useState<'mapping' | null>(null)
  const why = env.store.reason
  const read = useMemo(() => readSource(source, env.sources), [source, env.sources])
  const table = useMemo(() => read.missing ? { columns: [], rows: [] } : read.table(), [read])
  const rows: DocumentRow[] = table.rows.map((cells, index) => ({ index, cells }))
  const columns: DataColumn<DocumentRow>[] = table.columns.map(([key, label]) => ({ id: `c:${key}`, label, value: (row) => row.cells[key] ?? '' }))
  return <>
    <TablePanel title={source.name} detail={`${kindLabel(source.kind)} · ${categoryLabel('documents')} · reads ${read.target || '—'}`} count={read.missing ? undefined : `${rows.length} row${rows.length === 1 ? '' : 's'} · not in the master list`}
      info={<ul><li>A <strong>Validation Documents</strong> source: its rows as they are read in this browser, with <strong>every column</strong> of the source in its order — no field mapping is needed.</li><li>It <strong>never adds to or changes the master list</strong>; only a Tool List source does. Change its category with <strong>Edit mapping…</strong> (Setup → Sources too).</li><li>The source is set up under Setup → Sources; removing it there removes this tab.</li></ul>}
      action={<button type="button" className="ghost" disabled={Boolean(why)} title={why || `Change the category of ${source.name}`} onClick={() => setDialog('mapping')}>Edit mapping…</button>}>
      <WriteBlocked reason={why} />
      {read.missing ? <EmptyState title={read.missing} detail={howToLoad(source)} />
        : <DataTable id={`tool-validations:documents:${source.id}`} rows={rows} rowKey={(row) => String(row.index)} columns={columns} exportName={`${source.name} (validation documents)`}
          empty={<EmptyState title={`${read.target} has no rows here yet.`} />} />}
    </TablePanel>
    {dialog === 'mapping' && <MappingDialog env={env} source={source} onClose={() => setDialog(null)} />}
  </>
}
function ToolListSourceTab({ env, source }: { env: ToolValidationsEnv; source: ToolSource }) {
  const [dialog, setDialog] = useState<'mapping' | 'merge' | null>(null)
  const why = env.store.reason, file = env.store.shown
  const read = useMemo(() => readSource(source, env.sources), [source, env.sources])
  const mapping = mappingFor(source, read.options)
  const listed = new Set(file.tools.filter((entry) => entry.sources[source.id]?.inSource).map((entry) => entry.key))
  const rows: SourceRow[] = read.missing ? [] : read.read(mapping).map((input, index) => ({ index, input, listed: listed.has(toolKey(input.name, input.version)) }))
  const tools = new Set(rows.map((row) => toolKey(row.input.name, row.input.version))).size
  const completion = readsCompletion({ kind: source.kind, mapping: { ...mapping, confirmed: true } })
  const columns: DataColumn<SourceRow>[] = [
    { id: 'name', label: 'Tool', value: (row) => row.input.name },
    { id: 'version', label: 'Version', value: (row) => row.input.version },
    { id: 'validated', label: 'Validation date', value: (row) => row.input.validationDate ?? '', render: (row) => <>{formatDate(row.input.validationDate, '—')}{completion && row.input.validationDate && <small> {completionNote}</small>}</> },
    { id: 'period', label: 'Validity (months)', align: 'right', value: (row) => validityOf(row.input).months ?? '', render: (row) => periodCell(row.input), exportValue: (row) => periodExport(row.input) },
    { id: 'due', label: 'Due date', value: (row) => dueOf({ ...row.input, manual: [] }).due ?? '', render: (row) => { const due = dueOf({ ...row.input, manual: [] }); return due.due ? <>{formatDate(due.due)} <small>({dueFromText(due.from, completion)})</small></> : '—' } },
    { id: 'listed', label: 'Master list', value: (row) => row.listed ? 'Merged' : 'Not merged yet', render: (row) => <Pill tone={row.listed ? 'open' : 'neutral'}>{row.listed ? 'Merged' : 'Not merged yet'}</Pill> },
  ]
  const close = () => setDialog(null)
  return <>
    {!source.mapping.confirmed && <Notice tone="warning">The field mapping of {source.name} is still the app's guess: check it with Edit mapping… before merging.</Notice>}
    <TablePanel title={source.name} detail={`${kindLabel(source.kind)} · ${categoryLabel('tools')} · reads ${read.target || '—'}`} count={read.missing ? undefined : `${rows.length} row${rows.length === 1 ? '' : 's'} · ${tools} tool${tools === 1 ? '' : 's'}`}
      info={<ul><li>The rows of this source as they are read in this browser with its <strong>field mapping</strong> (tool, version, validation date, validity period, due date) — the same rows <strong>Merge into master list…</strong> brings in.</li><li><strong>Master list</strong> says whether the tool is in the master list from this source (merged before). A row without a tool name is not read.</li><li>The source is set up under Setup → Sources; removing it there removes this tab, its tools stay in the list.</li></ul>}
      action={<>
        <button type="button" className="ghost" disabled={Boolean(why)} title={why || `Set which fields of ${source.name} are read`} onClick={() => setDialog('mapping')}>Edit mapping…</button>
        <button type="button" className="primary" disabled={Boolean(why || read.missing)} title={why || read.missing || `Merge the tools of ${source.name} into the master list`} onClick={() => setDialog('merge')}>Merge into master list…</button>
      </>}>
      <WriteBlocked reason={why} />
      {read.missing ? <EmptyState title={read.missing} detail={howToLoad(source)} />
        : <DataTable id="tool-validations:source" rows={rows} rowKey={(row) => String(row.index)} columns={columns} exportName={`${source.name} (tool validations source)`} defaultSort={{ id: 'name' }}
          empty={<EmptyState title={`No row of ${read.target} gives a tool name with this mapping.`} detail="Check the field mapping (Edit mapping…)." />} />}
    </TablePanel>
    {dialog === 'mapping' && <MappingDialog env={env} source={source} onClose={close} />}
    {dialog === 'merge' && <MergeDialog env={env} source={source} onClose={close} />}
  </>
}

// A save of the list from a pop-up: the error stays in the pop-up (UI-STANDARDS §3) and in Background jobs.
function useSaving(env: ToolValidationsEnv, onClose: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (next: ToolValidationsFile, message: string, label: string) => {
    setBusy(true); setError('')
    try { await env.store.save(next, message, label); onClose() } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) } finally { setBusy(false) }
  }
  return { busy, error, setError, run }
}
const stampNow = () => new Date().toISOString().slice(0, 19) + 'Z'
const Actions = ({ busy, onCancel, label, why, danger = false }: { busy: boolean; onCancel: () => void; label: string; why?: string; danger?: boolean }) => <div className="modal-actions">{why && <WriteBlocked reason={why} />}<button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className={danger ? 'danger-button' : 'primary'} disabled={busy || Boolean(why)}>{busy ? 'Saving to Git…' : label}</button></div>

function ToolDialog({ env, editing, onClose }: { env: ToolValidationsEnv; editing?: ToolEntry; onClose: () => void }) {
  const [form, setForm] = useState<ToolEdit>(() => editOf(editing))
  const { busy, error, setError, run } = useSaving(env, onClose)
  const locked = nameLocked(editing)
  const set = (patch: Partial<ToolEdit>) => setForm((current) => ({ ...current, ...patch }))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const problem = editProblem(env.store.file, form, editing?.key)
    if (problem) { setError(problem); return }
    const name = form.name.trim()
    void run(saveTool(env.store.file, form, stampNow(), env.who, editing?.key), `Tool Validations: ${editing ? 'change' : 'add'} ${name}${form.version.trim() ? ` ${form.version.trim()}` : ''}`, `Tool Validations · ${editing ? 'change' : 'add'} ${name}`)
  }
  const preview = dueOf({ validationDate: form.validationDate || undefined, validityMonths: Number(form.validityMonths) || undefined, dueDate: form.dueDate || undefined, manual: form.dueDate ? ['dueDate'] : [] })
  return <Modal title={editing ? `Edit ${editing.name}` : 'Add a tool'} eyebrow="TOOL VALIDATIONS · MASTER LIST" onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={submit}>
      <label>Tool name<input required maxLength={200} disabled={locked} value={form.name} onChange={(event) => set({ name: event.target.value })} /><small>{locked ? 'From its source: the name and version are how it is matched, so they are not changed here.' : 'The same tool from a source later is matched by name (letter case, spaces and punctuation ignored) and version.'}</small></label>
      <label>Version (optional)<input maxLength={60} disabled={locked} value={form.version} onChange={(event) => set({ version: event.target.value })} /><small>Different versions are separate entries.</small></label>
      <div className="form-row">
        <label>Validation date (optional)<input type="date" value={form.validationDate} onChange={(event) => set({ validationDate: event.target.value })} /><small>Changed here, it is kept when the sources are read again; emptied, the sources fill it.</small></label>
        <label>Validity period in months (optional)<input type="number" min={1} max={600} step={1} inputMode="numeric" value={form.validityMonths} onChange={(event) => set({ validityMonths: event.target.value })} /><small>E.g. 24 for two years. Leave empty for {defaultValidityMonths} months (default).</small></label>
      </div>
      <label>Due date (optional)<input type="date" value={form.dueDate} onChange={(event) => set({ dueDate: event.target.value })} /><small>Leave empty to use validation date + validity period ({defaultValidityMonths} months when none is given). An explicit due date wins. {preview.due ? `Due ${formatDate(preview.due)} (${dueFromLabel[preview.from === 'source' ? 'entered' : preview.from]}).` : 'No due date yet.'}</small></label>
      <label>Notes (optional)<textarea maxLength={2000} rows={3} value={form.notes} onChange={(event) => set({ notes: event.target.value })} /></label>
      {error && <Notice tone="error">{error}</Notice>}
      <Actions busy={busy} onCancel={onClose} label={editing ? 'Save to Git' : 'Add tool'} why={env.store.reason} />
    </form>
  </Modal>
}

// TVL-30: the notes of a tool from Azure DevOps — the one field changed here; the rest is shown read only.
function NotesDialog({ env, entry, onClose }: { env: ToolValidationsEnv; entry: ToolEntry; onClose: () => void }) {
  const [notes, setNotes] = useState(entry.notes ?? '')
  const { busy, error, setError, run } = useSaving(env, onClose)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const form = { ...editOf(entry), notes }
    const problem = editProblem(env.store.file, form, entry.key)
    if (problem) { setError(problem); return }
    void run(saveTool(env.store.file, form, stampNow(), env.who, entry.key), `Tool Validations: notes of ${entry.name}${entry.version ? ` ${entry.version}` : ''}`, `Tool Validations · notes of ${entry.name}`)
  }
  return <Modal title={`Edit notes of ${entry.name}`} eyebrow="TOOL VALIDATIONS · MASTER LIST" onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={submit}>
      <p className="muted">{entry.name}{entry.version ? ` ${entry.version}` : ''} comes from Azure DevOps ({sourceNames(env.store.file, entry)}): its dates are changed there. Only the notes are kept here.</p>
      <label>Notes (optional)<textarea maxLength={2000} rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
      {error && <Notice tone="error">{error}</Notice>}
      <Actions busy={busy} onCancel={onClose} label="Save to Git" why={env.store.reason} />
    </form>
  </Modal>
}

function RemoveDialog({ env, entry, onClose }: { env: ToolValidationsEnv; entry: ToolEntry; onClose: () => void }) {
  const { busy, error, run } = useSaving(env, onClose)
  const holding = Object.entries(entry.sources).filter(([, link]) => link.inSource).map(([id]) => env.store.file.sources.find((source) => source.id === id)?.name ?? id)
  return <Modal title={`Remove ${entry.name}`} eyebrow="TOOL VALIDATIONS · MASTER LIST" onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={(event) => { event.preventDefault(); void run(removeTool(env.store.file, entry.key), `Tool Validations: remove ${entry.name}${entry.version ? ` ${entry.version}` : ''}`, `Tool Validations · remove ${entry.name}`) }}>
      <p>Remove <strong>{entry.name}{entry.version ? ` ${entry.version}` : ''}</strong> from the master list for everyone, with its dates and notes? {toolValidationsFile} keeps its history in Git.</p>
      {holding.length > 0 && <Notice tone="warning">It is still in {holding.join(', ')}: it comes back the next time {holding.length === 1 ? 'that source is' : 'those sources are'} read (fetched or merged).</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <Actions busy={busy} onCancel={onClose} label={`Remove ${entry.name}`} why={env.store.reason || azureLock(env.store.file, entry).remove} danger />
    </form>
  </Modal>
}

// TVL-25: the list as saved (merged with saves by others meanwhile, GIT-17), else the list sent.
function savedFile(result: { text?: string } | undefined, sent: ToolValidationsFile): ToolValidationsFile {
  try { return result?.text ? parseToolValidations(result.text).file : sent } catch { return sent }
}
function TeamDialog({ env, onClose }: { env: ToolValidationsEnv; onClose: () => void }) {
  const file = env.store.file
  const [days, setDays] = useState(String(file.defaultDays))
  const [owners, setOwners] = useState(file.owners)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // TVL-25: the co-owners are also written to the pages of the tabs — fail closed: a change of the co-owners is not saved
  // while those pages cannot be changed (the list and its pages would disagree on who may edit them).
  const chosen = env.ownersReason ? file.owners : owners
  const ownersChanged = JSON.stringify([...chosen].sort()) !== JSON.stringify([...file.owners].sort())
  const pagesWhy = ownersChanged && file.tabs.length ? tabsReason(env) : ''
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const value = cleanDays(days)
    if (!value) { setError(`The team default is a whole number of days from 1 to ${maxExpiryDays}.`); return }
    if (pagesWhy) { setError(`The co-owners are also written to the pages of the ${file.tabs.length} tab${file.tabs.length === 1 ? '' : 's'}, which cannot be changed now: ${pagesWhy}`); return }
    setBusy(true); setError('')
    let saved = false
    try {
      const next = setTeam(file, value, chosen)
      const result = await env.store.save(next, `Tool Validations: team default ${value} days, ${chosen.length} co-owner${chosen.length === 1 ? '' : 's'}`, 'Tool Validations · team settings')
      saved = true
      if (env.pages && file.tabs.length && !tabsReason(env)) await writeTabOwners(env.pages, savedFile(result, next))
      onClose()
    } catch (failure) {
      const reason = failure instanceof Error ? failure.message : String(failure)
      setError(saved ? `The team settings are saved, but the co-owners could not be written to the tab pages: ${reason} Write them again with “Write the co-owners to the tab pages” on Setup → Tabs.` : reason)
      setBusy(false)
    }
  }
  return <Modal title="Team settings" eyebrow="TOOL VALIDATIONS · SETTINGS" onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={submit}>
      <label>Expiry window, team default (days)<input type="number" required min={1} max={maxExpiryDays} step={1} value={days} onChange={(event) => setDays(event.target.value)} /><small>What everyone sees on the Expiry list until they choose their own window. 60 days unless changed.</small></label>
      <OwnersField label="Co-owners of the list (optional)" value={owners} onChange={setOwners} disabled={env.ownersReason} help={`They may add, correct and remove tools, set the team default and the sources and their mapping — as the Tool Owner does.${file.tabs.length ? ` They are also written as co-owners of the pages of the ${file.tabs.length} tab${file.tabs.length === 1 ? '' : 's'} (menu-layout.json), so they hold the page rights wherever a page is opened; co-owners added to a page by hand stay.` : ''}`} />
      {error && <Notice tone="error">{error}</Notice>}
      <Actions busy={busy} onCancel={onClose} label="Save to Git" why={env.store.reason || pagesWhy} />
    </form>
  </Modal>
}

// ---- TVL-27: Setup → Due date highlights — the team's bands (days and colour), shown to everyone, changed by those who
// may change the list (TVL-11) in a pop-up and saved to Git ----
const bandsText = (bands: HighlightBand[]) => bands.length ? bands.map((band) => `${band.days} days ${band.colour}`).join(', ') : 'none'
function HighlightsPanel({ env, why, open }: { env: ToolValidationsEnv; why: string; open: (dialog: Dialog) => void }) {
  const file = env.store.shown
  const counts = bandCounts(bandsOf(file), file.tools, utcToday())
  return <Panel title="Due date highlights" info={<ul><li>The <strong>Master list</strong> and the <strong>Expiry list</strong> tint each tool's row in the colour of its band and name the band in the Due date cell: a tool is in a band when it is due within that many days from today (0: overdue or due today). An <strong>overdue</strong> tool is in the first band (the fewest days); when a tool fits several bands, the one with the fewest days wins. A tool without a due date is not highlighted.</li><li>The bands are the same for everyone, kept in {toolValidationsFile} in Git; the Tool Owner and the list's co-owners change them with <strong>Edit…</strong>.</li><li>Until they are saved the default bands are used: overdue or due today red, within 30 days amber, within 90 days yellow. Removing every band turns the highlighting off.</li></ul>}
    action={<button type="button" className="ghost" disabled={Boolean(why)} title={why || 'Change the due date highlights'} onClick={() => open({ kind: 'highlights' })}>Edit…</button>}>
    <WriteBlocked reason={why} />
    {counts.length ? <div className="azure-table tool-highlights"><table><thead><tr><th>Band</th><th>Colour</th><th className="num">Tools now</th></tr></thead><tbody>
      {counts.map(({ band, count }) => <tr key={band.days} className={bandClass(band)}><td>{bandLabel(band)}</td><td><span className="tvl-colour"><Swatch colour={band.colour} />{colourLabel(band.colour)}</span></td><td className="num">{count}</td></tr>)}
    </tbody></table></div> : <EmptyState title="No highlighting: every band was removed." detail={why ? undefined : 'Edit… adds bands again.'} />}
    <p className="muted tvl-highlights-note">{file.highlights ? `The team's bands, saved in ${toolValidationsFile}.` : 'The default bands — not saved in Git yet; Edit… saves the team’s own.'}</p>
  </Panel>
}
interface BandDraft { id: number; days: string; colour: HighlightColour }
let nextBandId = 1
const draftOf = (band: HighlightBand): BandDraft => ({ id: nextBandId++, days: String(band.days), colour: band.colour })
function HighlightsDialog({ env, onClose }: { env: ToolValidationsEnv; onClose: () => void }) {
  const file = env.store.file
  const [bands, setBands] = useState<BandDraft[]>(() => bandsOf(file).map(draftOf))
  const { busy, error, setError, run } = useSaving(env, onClose)
  const problem = highlightsProblem(bands)
  const clean: HighlightBand[] = problem ? [] : bands.map((band) => ({ days: Number(band.days), colour: band.colour }))
  const counts = problem ? [] : bandCounts(clean, file.tools, utcToday())
  const change = (id: number, patch: Partial<BandDraft>) => { setError(''); setBands((current) => current.map((band) => band.id === id ? { ...band, ...patch } : band)) }
  const add = () => {
    setError('')
    setBands((current) => {
      const used = current.map((band) => Number(band.days)).filter((days) => Number.isInteger(days))
      const days = Math.min(maxHighlightDays, used.length ? Math.max(...used) + 30 : 0)
      const colour = highlightColours.find((entry) => !current.some((band) => band.colour === entry.key))?.key ?? 'grey'
      return [...current, { id: nextBandId++, days: String(days), colour }]
    })
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (problem) { setError(problem); return }
    void run(setHighlights(file, clean), `Tool Validations: due date highlights — ${bandsText(sortBands(clean))}`, 'Tool Validations · due date highlights')
  }
  return <Modal title="Due date highlights" eyebrow="TOOL VALIDATIONS · SETTINGS" onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={submit}>
      <p className="muted">A tool due within a band's days from today (0: overdue or due today) is tinted in its colour on the Master list and the Expiry list, with the band named in its Due date cell. An overdue tool is in the band with the fewest days, and when a tool fits several bands the one with the fewest days wins. Up to {maxHighlights} bands; with none, nothing is highlighted.</p>
      {bands.length ? <div className="azure-table tool-highlights-edit"><table><thead><tr><th>Due within (days)</th><th>Colour</th><th>Actions</th></tr></thead><tbody>
        {bands.map((band, index) => <tr key={band.id}>
          <td><input type="number" required min={0} max={maxHighlightDays} step={1} inputMode="numeric" aria-label={`Days of band ${index + 1}`} value={band.days} onChange={(event) => change(band.id, { days: event.target.value })} /></td>
          <td><span className="tvl-colour"><Swatch colour={band.colour} /><select aria-label={`Colour of band ${index + 1}`} value={band.colour} onChange={(event) => change(band.id, { colour: event.target.value as HighlightColour })}>{highlightColours.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}</select></span></td>
          <td><button type="button" className="text-button danger-text" aria-label={`Remove band ${index + 1}`} onClick={() => { setError(''); setBands((current) => current.filter((entry) => entry.id !== band.id)) }}>Remove</button></td>
        </tr>)}
      </tbody></table></div> : <EmptyState title="No bands: nothing is highlighted." detail="＋ Add band adds one." />}
      <div className="button-row">
        <button type="button" className="ghost" disabled={bands.length >= maxHighlights} title={bands.length >= maxHighlights ? `At most ${maxHighlights} bands` : 'Add a band'} onClick={add}>＋ Add band</button>
        <button type="button" className="text-button" onClick={() => { setError(''); setBands(defaultHighlights.map(draftOf)) }}>Use the default bands</button>
      </div>
      <p className="muted" role="status">{problem || (counts.length ? `Now: ${counts.map(({ band, count }) => `${bandLabel(band)} — ${count} tool${count === 1 ? '' : 's'}`).join(' · ')}.` : 'No highlighting.')}</p>
      {error && <Notice tone="error">{error}</Notice>}
      <Actions busy={busy} onCancel={onClose} label="Save to Git" why={env.store.reason} />
    </form>
  </Modal>
}

// TVL-32: the Category question — Tool List or Validation Documents, required; nothing chosen until the person picks.
function CategoryField({ value, onChange }: { value: SourceCategory | ''; onChange: (category: SourceCategory) => void }) {
  return <fieldset className="pgb-kinds"><legend>Category</legend>
    {sourceCategories.map((entry) => <div key={entry.key} className="pgb-kind"><label className="check"><input type="radio" name="source-category" required aria-describedby={`source-category-${entry.key}`} checked={value === entry.key} onChange={() => onChange(entry.key)} />{entry.label}</label><small id={`source-category-${entry.key}`}>{entry.detail}</small></div>)}
  </fieldset>
}
function AddSourceDialog({ env, onClose }: { env: ToolValidationsEnv; onClose: () => void }) {
  const [category, setCategoryChoice] = useState<SourceCategory | ''>('')
  const [kind, setKind] = useState<Exclude<ToolSourceKind, 'stream'>>('windchill')
  const choices = choicesFor(kind, env.sources)
  const [ref, setRef] = useState('')
  const [name, setName] = useState('')
  const { busy, error, setError, run } = useSaving(env, onClose)
  const chosen = choices.find(([key]) => key === ref)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const label = name.trim() || chosen?.[1] || ''
    const problem = categoryProblem(category) || sourceProblem(env.store.file, kind, ref, label)
    if (problem || !category) { setError(problem); return }
    const read = readSource({ kind, ref }, env.sources)
    const mapping = category === 'tools' ? guessMapping(kind, read.options) : emptyMapping()
    void run(addSource(env.store.file, { kind, name: label, ref, mapping, category }), `Tool Validations: add source ${label} (${kindLabel(kind)}, ${categoryLabel(category)})`, `Tool Validations · add source ${label}`)
  }
  return <Modal title="Add a source" eyebrow="TOOL VALIDATIONS · SOURCES" onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={submit}>
      <label>Kind<select value={kind} onChange={(event) => { setKind(event.target.value as Exclude<ToolSourceKind, 'stream'>); setRef(''); setName('') }}>{sourceKinds.filter((entry) => entry.key !== 'stream').map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}</select><small>{sourceKinds.find((entry) => entry.key === kind)?.detail}</small></label>
      <label>{kind === 'azure' ? 'Connection' : kind === 'windchill' ? 'Windchill export' : 'Table page'}<select required value={ref} onChange={(event) => { setRef(event.target.value); setName(choices.find(([key]) => key === event.target.value)?.[1] ?? '') }}><option value="">Choose…</option>{choices.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><small>{choices.length ? 'Its data is read in this browser when it is merged.' : kind === 'azure' ? 'No other connection is set up in this browser.' : kind === 'windchill' ? 'No Windchill export is imported in this browser.' : 'No table page yet: add one (＋ Add page…) with columns such as Tool, Version, Validation date, Validity period and Due date.'}</small></label>
      <label>Name<input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /><small>How the source is listed in the master list.</small></label>
      <CategoryField value={category} onChange={(next) => { setCategoryChoice(next); setError('') }} />
      {category === 'documents' && <Notice tone="info">No field mapping is needed: its tab lists every column of its rows. It never adds to or changes the master list.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <Actions busy={busy} onCancel={onClose} label="Add source" why={env.store.reason} />
    </form>
  </Modal>
}

function MappingDialog({ env, source, onClose }: { env: ToolValidationsEnv; source: ToolSource; onClose: () => void }) {
  const read = useMemo(() => readSource(source, env.sources), [source, env.sources])
  const [mapping, setMappingDraft] = useState<ToolMapping>(() => mappingFor(source, read.options))
  // TVL-32: the category, changed here (the Tool Validations query stays a Tool List).
  const [category, setCategoryChoice] = useState<SourceCategory>(categoryOf(source))
  const { busy, error, setError, run } = useSaving(env, onClose)
  const inputs = read.missing || category === 'documents' ? [] : read.read(mapping)
  const tools = new Set(inputs.map((input) => `${input.name}@${input.version}`)).size
  const fed = env.store.file.tools.filter((entry) => entry.sources[source.id]?.inSource).length
  const options = (current?: string): [string, string][] => current && !read.options.some(([key]) => key === current) ? [...read.options, [current, `${current} (not in the data here)`]] : read.options
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (category === 'documents') {
      if (categoryOf(source) === 'documents') { onClose(); return }
      const result = setCategory(env.store.file, source.id, 'documents', stampNow(), env.who || undefined)
      void run(result.file, `Tool Validations: ${source.name} is Validation Documents${result.gone.length ? ` — ${result.gone.length} no longer in the source` : ''}`, `Tool Validations · category of ${source.name}`)
      return
    }
    if (!mapping.name) { setError('Choose the field that gives the tool name.'); return }
    const changed = category !== categoryOf(source)
    void run(setMapping(setCategory(env.store.file, source.id, 'tools', stampNow(), env.who || undefined).file, source.id, mapping), `Tool Validations: field mapping of ${source.name}${changed ? ' (Tool List)' : ''}`, `Tool Validations · field mapping of ${source.name}`)
  }
  return <Modal title={`Field mapping of ${source.name}`} eyebrow="TOOL VALIDATIONS · SOURCES" wide onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={submit}>
      {source.kind === 'stream' ? <p className="muted">Category: <strong>{categoryLabel('tools')}</strong> — the Tool Validations query is always the Tool List; its Validation Documents query is set in Admin → Streams → Stream mapping → Tool Validations queries.</p>
        : <CategoryField value={category} onChange={(next) => { setCategoryChoice(next); setError('') }} />}
      {category === 'documents' ? <>
        <Notice tone="info">A Validation Documents source needs no field mapping: its tab lists every column of its rows. It never adds to or changes the master list.</Notice>
        {categoryOf(source) === 'tools' && fed > 0 && <Notice tone="warning">{fed} tool{fed === 1 ? '' : 's'} of the master list came from {source.name}: {fed === 1 ? 'it stays' : 'they stay'} in the list, marked “Not in source now” for this source. Nothing is deleted.</Notice>}
      </> : <>
      {!source.mapping.confirmed && <Notice tone="warning">These are the app's guesses — check each field against the data, then save the mapping.</Notice>}
      {read.missing && <Notice tone="info">{read.missing} The fields offered are the saved ones only.</Notice>}
      {fieldsOf(source).map((field) => <label key={field.key}>{field.label}<select required={field.required} value={mapped(mapping, field.key) ?? ''} onChange={(event) => setMappingDraft((current) => ({ ...current, [field.key]: event.target.value || (isAzureField(field.key) ? noField : undefined) }))}><option value="">{field.required ? 'Choose…' : field.key === 'validationDate' && isAzureKind(source.kind) ? 'None — the completion date' : 'None'}</option>{options(mapping[field.key]).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><small>{field.help}{field.key === 'validationDate' && isAzureKind(source.kind) ? ' From Azure DevOps: the completion date (Stream mapping → Tool Validations queries) unless another field is chosen.' : ''}</small></label>)}
      <label>Validity period numbers are in<select value={mapping.periodUnit} onChange={(event) => setMappingDraft((current) => ({ ...current, periodUnit: event.target.value === 'years' ? 'years' : 'months' }))}><option value="months">Months</option><option value="years">Years</option></select><small>For a plain number; a text with its unit (“2 years”, “24 months”) is read as written.</small></label>
      <p className="muted" role="status">{read.missing ? '' : `${read.rows} row${read.rows === 1 ? '' : 's'} read here give ${tools} tool${tools === 1 ? '' : 's'} with this mapping.`}</p>
      </>}
      {error && <Notice tone="error">{error}</Notice>}
      <Actions busy={busy} onCancel={onClose} label="Save to Git" why={env.store.reason} />
    </form>
  </Modal>
}

function MergeDialog({ env, source, onClose }: { env: ToolValidationsEnv; source: ToolSource; onClose: () => void }) {
  const read = useMemo(() => readSource(source, env.sources), [source, env.sources])
  const mapping = mappingFor(source, read.options)
  const { busy, error, run } = useSaving(env, onClose)
  const result = useMemo(() => mergeSource(env.store.file, source.id, read.read(mapping), stampNow(), env.who || undefined), [env.store.file, source.id, read, mapping, env.who])
  const list = (names: string[]) => names.length > 8 ? `${names.slice(0, 8).join(', ')} and ${names.length - 8} more` : names.join(', ')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const at = stampNow()
    void run(markMerged(result.file, source.id, at, env.who || undefined), `Tool Validations: merge ${source.name} — ${mergeSummary(result)}`, `Tool Validations · merge ${source.name}`)
  }
  return <Modal title={`Merge ${source.name} into the master list`} eyebrow="TOOL VALIDATIONS · SOURCES" onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={submit}>
      {!source.mapping.confirmed && <Notice tone="warning">The field mapping of this source is still the app's guess. Check it (Edit mapping…) before merging.</Notice>}
      <p>{read.rows} row{read.rows === 1 ? '' : 's'} of <strong>{read.target}</strong> read with its field mapping: <strong>{mergeSummary(result)}</strong>.</p>
      <ul>
        {result.added.length > 0 && <li>New: {list(result.added)}</li>}
        {result.updated.length > 0 && <li>Linked or updated (a date changed by hand stays): {list(result.updated)}</li>}
        {result.gone.length > 0 && <li>No longer in this source — kept, marked “Not in source now”: {list(result.gone)}</li>}
      </ul>
      {error && <Notice tone="error">{error}</Notice>}
      <Actions busy={busy} onCancel={onClose} label="Merge into master list" why={env.store.reason} />
    </form>
  </Modal>
}

function RemoveSourceDialog({ env, source, onClose }: { env: ToolValidationsEnv; source: ToolSource; onClose: () => void }) {
  const { busy, error, run } = useSaving(env, onClose)
  const linked = env.store.file.tools.filter((entry) => entry.sources[source.id]).length
  return <Modal title={`Remove the source ${source.name}`} eyebrow="TOOL VALIDATIONS · SOURCES" onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={(event) => { event.preventDefault(); void run(removeSource(env.store.file, source.id), `Tool Validations: remove source ${source.name}`, `Tool Validations · remove source ${source.name}`) }}>
      <p>Remove <strong>{source.name}</strong> and its field mapping from the master list's sources? Its {linked} tool{linked === 1 ? '' : 's'} <strong>stay</strong> in the list (as added by hand when no other source has them). Its own page and data are not changed.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <Actions busy={busy} onCancel={onClose} label={`Remove ${source.name}`} why={env.store.reason} danger />
    </form>
  </Modal>
}

// ---- TVL-15…TVL-17: the owners' tabs — each an On-Demand page (Table, Table + Insights or On-Demand Dashboard) that
// lives only as a tab of this page: saved in Git as every On-Demand page (on-demand/<page-id>.json, a dashboard's blocks
// in dashboards/<page-id>.json), placed hidden in the menu layout (not in the menu, on Home or in search), and listed with
// its name and order in tool-validations.json (`tabs`). Set up on Setup → Tabs by the Tool Owner and the list's
// co-owners (TVL-11); everyone else reads them. ----
// Why the viewer cannot add, rename, reorder or remove a tab ('' when they can): the list's rights (TVL-11), and the
// pages and the menu layout read from Git (a tab is a page and its hidden place in the menu).
function tabsReason(env: ToolValidationsEnv) {
  const pages = env.pages
  if (env.store.reason) return env.store.reason
  if (!pages) return 'The pages are not available here.'
  const git = gitReasonOf(pages.git)
  if (git) return git
  if (pages.menu.error) return `menu-layout.json could not be read from Git, so no tab can be added or removed: ${pages.menu.error}`
  if (!pages.menu.loaded || !pages.onDemand.loaded) return 'The pages are still being read from Git.'
  return ''
}
const ownerCountText = ({ fromList, byHand }: { fromList: number; byHand: number }) => `${fromList} from the list · ${byHand} added by hand`
function TabsPanel({ env, why: listWhy, open }: { env: ToolValidationsEnv; why: string; open: (dialog: Dialog) => void }) {
  const file = env.store.shown
  const why = listWhy || tabsReason(env)
  const full = addTabReason(file)
  const [moving, setMoving] = useState(false)
  const move = (tab: CustomTab, by: -1 | 1) => {
    setMoving(true)
    void env.store.save(moveTab(env.store.file, tab.pageId, by), `Tool Validations: move the tab ${tab.name} ${by < 0 ? 'left' : 'right'}`, `Tool Validations · move the tab ${tab.name}`).catch(() => undefined).finally(() => setMoving(false))
  }
  const pageOf = (tab: CustomTab) => env.pages?.onDemand.pages.find((page) => page.id === tab.pageId)
  const layout = env.pages?.menu.layout
  // TVL-24: the hidden pages that can be made a tab again.
  const choices = env.pages && layout ? hiddenPageChoices(env.pages.onDemand.pages, layout, file) : []
  const noChoice = choices.length ? '' : 'No hidden On-Demand page that is not a tab yet: a page becomes one when its tab is removed with “Kept in Git, hidden”, or when it is hidden in Admin → Pages & reports → Menu groups & pages.'
  // TVL-25: the tab pages whose co-owners are not in line with the list's (a save that failed, or an older app version).
  const behind = layout && env.pages?.menu.loaded && env.store.loaded ? tabOwnersBehind(layout, file) : []
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const sync = () => {
    if (!env.pages) return
    setSyncing(true); setSyncError('')
    void writeTabOwners(env.pages, env.store.file).catch((failure) => setSyncError(failure instanceof Error ? failure.message : String(failure))).finally(() => setSyncing(false))
  }
  return <Panel title="Tabs" info={<ul><li>The tabs the Tool Owner and the list's co-owners add to this page, between the source tabs and Setup: a <strong>Table</strong>, a <strong>Table + Insights</strong> or an <strong>On-Demand Dashboard</strong> — each an On-Demand page kept in Git like every other, set up and edited as that page type is, but shown only here (not in the menu, on Home or in search).</li><li>A dashboard tab can read the <strong>Tool Validations master list</strong> and <strong>expiry list</strong> as data sources, besides the table pages.</li><li><strong>＋ Add existing page as tab…</strong> makes a hidden On-Demand page a tab again — a page kept hidden when its tab was removed, or left behind when an older app version dropped the tabs.</li><li>The list's <strong>co-owners</strong> (Team settings) are written as <strong>co-owners of each tab's page</strong> in menu-layout.json, so they hold the page's rights also when it is opened from Admin → Pages & reports → Menu groups & pages; co-owners added to a page by hand stay, and only the co-owners the list wrote are taken off again when they leave the list or the tab is removed.</li><li><strong>←</strong> <strong>→</strong> move a tab; <strong>Rename…</strong> renames the tab and its page; <strong>Remove…</strong> asks first: the page is kept in Git, hidden — or, by a Tool Owner, deleted with its data.</li></ul>}
    action={<div className="button-row nowrap">
      <button type="button" className="ghost" disabled={Boolean(why || full)} title={why || full || 'Add a tab of your own: a Table, Table + Insights or On-Demand Dashboard page'} onClick={() => open({ kind: 'add-tab' })}>＋ Add tab…</button>
      <button type="button" className="ghost" disabled={Boolean(why || full || noChoice)} title={why || full || noChoice || 'Make a hidden On-Demand page a tab of this page again'} onClick={() => open({ kind: 'add-existing-tab' })}>＋ Add existing page as tab…</button>
    </div>}>
    <WriteBlocked reason={why} />
    {behind.length > 0 && <Notice tone="warning">The co-owners of the list are not yet written to the page{behind.length === 1 ? '' : 's'} of {behind.map((tab) => tab.name).join(', ')}: {behind.length === 1 ? 'its' : 'their'} co-owners in Admin → Pages & reports → Menu groups & pages differ from the list's.{' '}<button type="button" className="ghost" disabled={Boolean(why) || syncing} title={why || 'Write the co-owners of the list to the tab pages (menu-layout.json)'} onClick={sync}>{syncing ? 'Saving to Git…' : 'Write the co-owners to the tab pages'}</button></Notice>}
    {syncError && <Notice tone="error">{syncError}</Notice>}
    {file.tabs.length ? <div className="azure-table tool-tabs"><table><thead><tr><th>Tab</th><th>Page type</th><th>Page in Git</th><th>Page co-owners</th><th>Actions</th></tr></thead><tbody>
      {file.tabs.map((tab, index) => { const page = pageOf(tab); return <tr key={tab.pageId}>
        <td><strong>{tab.name}</strong></td>
        <td><small className="plain">{pageKindLabel(layout?.pages[tab.pageId] ? kindOf(layout, tab.pageId) : tab.kind)}</small></td>
        <td><small className="plain">{page ? `${env.pages?.onDemand.filePath(tab.pageId) ?? ''}${page.rows.length ? ` · ${page.rows.length} row${page.rows.length === 1 ? '' : 's'}` : ''}` : env.pages?.onDemand.loaded ? 'Not in Git (deleted)' : '—'}</small></td>
        <td><small className="plain">{layout?.pages[tab.pageId] ? ownerCountText(tabOwnerCounts(layout, tab.pageId)) : '—'}</small></td>
        <td><div className="button-row nowrap">
          <button type="button" className="ghost" aria-label={`Move ${tab.name} left`} disabled={Boolean(why) || moving || index === 0} title={why || (index === 0 ? 'Already the first of the added tabs' : `Move ${tab.name} one tab to the left`)} onClick={() => move(tab, -1)}>←</button>
          <button type="button" className="ghost" aria-label={`Move ${tab.name} right`} disabled={Boolean(why) || moving || index === file.tabs.length - 1} title={why || (index === file.tabs.length - 1 ? 'Already the last of the added tabs' : `Move ${tab.name} one tab to the right`)} onClick={() => move(tab, 1)}>→</button>
          <button type="button" className="ghost" disabled={Boolean(why)} title={why || `Rename the tab ${tab.name}`} onClick={() => open({ kind: 'rename-tab', tab })}>Rename…</button>
          <button type="button" className="text-button danger-text" disabled={Boolean(why)} title={why || `Remove the tab ${tab.name}`} onClick={() => open({ kind: 'remove-tab', tab })}>Remove…</button>
        </div></td>
      </tr> })}
    </tbody></table></div> : <EmptyState title="No tabs added yet." detail={why ? undefined : `＋ Add tab… adds a Table, a Table + Insights or an On-Demand Dashboard as a tab of this page (at most ${maxCustomTabs}).`} />}
  </Panel>
}

// PGB-22: the same Page type tick boxes as Add page (and, with Table (Query), its query picker, PGB-23).
function AddTabDialog({ env, pages, onClose }: { env: ToolValidationsEnv; pages: CustomTabsEnv; onClose: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const clash = usePageNameClash(name)
  const why = tabsReason(env) || addTabReason(env.store.file)
  const choice = usePageTypeChoice({ connections: pages.azure?.queryConnections ?? [], servers: pages.azure?.servers ?? [], profiles: pages.azure?.profiles ?? [], viewingAs: pages.azure?.viewingAs }, () => setError(''), true)
  const kind: PageKind = choice.kind
  const typeReason = typeof choice.result === 'string' ? choice.result : ''
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const chosen = choice.result
    if (typeof chosen === 'string') { setError(chosen); return }
    const problem = tabNameProblem(env.store.file, name)
    if (problem) { setError(problem); return }
    if (clash) return
    const clean = name.replace(/\s+/g, ' ').trim()
    setBusy(true); setError('')
    try {
      // The page file, then its hidden place in the menu (createPage, PGB-05), then the tab in tool-validations.json.
      // TVL-25: the list's co-owners are the page's co-owners from the start (remembered as written from the list).
      const listOwners = env.store.file.owners
      const id = await createPage(pages.onDemand, pages.menu, { kind, name: clean, description, icon: defaultIcon, group: onDemandGroup, newGroup: null, owners: listOwners, ownersFromList: listOwners, hidden: true, ...(chosen.source ? { source: chosen.source } : {}) })
      await env.store.save(addTab(env.store.file, { pageId: id, name: clean, kind }), `Tool Validations: add the tab ${clean} (${pageKindLabel(kind)}, page ${id})`, `Tool Validations · add the tab ${clean}`)
      onClose()
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) }
  }
  return <Modal title="Add a tab" eyebrow="TOOL VALIDATIONS · TABS" onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={(event) => void submit(event)} className="pgb-form">
      {choice.field}
      <PageNameField value={name} clash={clash} onChange={(value) => { setName(value); setError('') }} />
      <small className="muted">The name of the tab and of its page, up to {maxTabName} characters.</small>
      <label>Description (optional)<input maxLength={300} value={description} onChange={(event) => setDescription(event.target.value)} /><small>Shown at the top of the tab.</small></label>
      <small className="muted">The page is created in Git at once (on-demand/page-id.json{kind === 'dashboard' ? '; its blocks in dashboards/page-id.json when the first one is added' : ''}), placed hidden in menu-layout.json — not in the menu, on Home or in search — and added to {toolValidationsFile} as the last of the added tabs, before Setup. The Tool Owner and the list's co-owners set it up and edit it — the co-owners are written as the page's co-owners; everyone else reads it.</small>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions">{why && <WriteBlocked reason={why} />}{!why && typeReason && !error && <span className="muted">{typeReason}</span>}<button type="button" className="ghost" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy || Boolean(clash) || Boolean(why) || Boolean(typeReason)}>{busy ? 'Saving to Git…' : 'Add tab'}</button></div>
    </form>
  </Modal>
}

// TVL-24: a hidden On-Demand page made a tab again — chosen from the hidden pages that are not a tab yet, named as the
// tab (the page renamed with it when the name is changed), added as the last of the owners' tabs; the page stays hidden
// and gets the list's co-owners (TVL-25). The same rights as ＋ Add tab… (TVL-17).
function AddExistingTabDialog({ env, pages, onClose }: { env: ToolValidationsEnv; pages: CustomTabsEnv; onClose: () => void }) {
  const choices = hiddenPageChoices(pages.onDemand.pages, pages.menu.layout, env.store.file)
  const [pageId, setPageId] = useState(choices[0]?.id ?? '')
  const chosen = choices.find((choice) => choice.id === pageId)
  const [name, setName] = useState(chosen?.name.slice(0, maxTabName) ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const clash = usePageNameClash(name, chosen ? `ondemand:${chosen.id}` : undefined)
  const why = tabsReason(env) || addTabReason(env.store.file) || (choices.length ? '' : 'No hidden On-Demand page that is not a tab yet.')
  const pick = (id: string) => { setPageId(id); setName(choices.find((choice) => choice.id === id)?.name.slice(0, maxTabName) ?? ''); setError('') }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!chosen) { setError('Choose a page.'); return }
    const problem = tabNameProblem(env.store.file, name)
    if (problem) { setError(problem); return }
    if (clash) return
    const clean = name.replace(/\s+/g, ' ').trim()
    setBusy(true); setError('')
    try {
      const next = addTab(env.store.file, { pageId: chosen.id, name: clean, kind: chosen.kind })
      const saved = await env.store.save(next, `Tool Validations: add the existing page ${chosen.name} as the tab ${clean} (${pageKindLabel(chosen.kind)}, page ${chosen.id})`, `Tool Validations · add the tab ${clean}`)
      const stored = pages.onDemand.stored(chosen.id)
      if (stored && stored.name !== clean) { const renamed = await pages.onDemand.save(renamePage(stored, clean, stored.description), `Pages & menu: rename ${stored.name} to ${clean} (a tab of Tool Validations)`); recordJob(`pages:${chosen.id}`, `Rename page · ${stored.name}`, { text: `${outcomeText(renamed)} ${pages.onDemand.filePath(chosen.id)}` }) }
      await writeTabOwners(pages, savedFile(saved, next), [chosen.id])
      onClose()
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) }
  }
  return <Modal title="Add an existing page as a tab" eyebrow="TOOL VALIDATIONS · TABS" onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={(event) => void submit(event)} className="pgb-form">
      <label>Page<select aria-label="Page" value={pageId} onChange={(event) => pick(event.target.value)} disabled={!choices.length}>
        {!choices.length && <option value="">— No hidden page —</option>}
        {choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name} ({pageKindLabel(choice.kind)}{choice.kind === 'dashboard' ? '' : `, ${choice.rows} row${choice.rows === 1 ? '' : 's'}`})</option>)}
      </select><small>The On-Demand pages that are hidden from the menu and not a tab of this page — for example one kept hidden when its tab was removed, or left behind when an older app version dropped the tabs.</small></label>
      <PageNameField value={name} clash={clash} onChange={(value) => { setName(value); setError('') }} />
      <small className="muted">The name of the tab and of its page, up to {maxTabName} characters; a changed name renames the page too.</small>
      <small className="muted">The page keeps its data and stays hidden from the menu; it is added to {toolValidationsFile} as the last of the added tabs, before Setup, and the list's co-owners are written as its co-owners (those added by hand stay).</small>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions">{why && <WriteBlocked reason={why} />}<button type="button" className="ghost" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy || Boolean(clash) || Boolean(why)}>{busy ? 'Saving to Git…' : 'Add tab'}</button></div>
    </form>
  </Modal>
}

// TVL-25: the list's co-owners written as co-owners of the tab pages (all, or `only` these page ids) in menu-layout.json —
// one queued, merged save (GIT-17) when anything changes, its result under Background jobs; an error is thrown.
async function writeTabOwners(pages: CustomTabsEnv, file: ToolValidationsFile, only?: string[]) {
  const layout = pages.menu.layout
  const next = tabOwnersLayout(layout, file, only)
  if (serializeMenuLayout(next) === serializeMenuLayout(layout)) return
  const changed = tabOwnersBehind(layout, file).filter((tab) => !only || only.includes(tab.pageId))
  const label = 'Tool Validations · co-owners of the tab pages'
  try {
    const result = await pages.menu.save(next, `Pages & menu: the co-owners of the Tool Validations list written to the page${changed.length === 1 ? '' : 's'} of ${changed.map((tab) => tab.name).join(', ') || 'its tabs'}`)
    recordJob('tool-validations', label, { text: `${outcomeText(result)} ${pages.menu.path}` })
  } catch (failure) {
    recordJob('tool-validations', label, { text: failure instanceof Error ? failure.message : String(failure), failed: true })
    throw failure
  }
}

function RenameTabDialog({ env, pages, tab, onClose }: { env: ToolValidationsEnv; pages: CustomTabsEnv; tab: CustomTab; onClose: () => void }) {
  const [name, setName] = useState(tab.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const clash = usePageNameClash(name, `ondemand:${tab.pageId}`)
  const why = tabsReason(env)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const problem = tabNameProblem(env.store.file, name, tab.pageId)
    if (problem) { setError(problem); return }
    if (clash) return
    const clean = name.replace(/\s+/g, ' ').trim()
    setBusy(true); setError('')
    try {
      await env.store.save(renameTab(env.store.file, tab.pageId, clean), `Tool Validations: rename the tab ${tab.name} to ${clean}`, `Tool Validations · rename the tab ${tab.name}`)
      // The page keeps the tab's name (its title on the tab, its name as a data source of the dashboards).
      const stored = pages.onDemand.stored(tab.pageId)
      if (stored && stored.name !== clean) { const saved = await pages.onDemand.save(renamePage(stored, clean, stored.description), `Pages & menu: rename ${stored.name} to ${clean} (a tab of Tool Validations)`); recordJob(`pages:${tab.pageId}`, `Rename page · ${stored.name}`, { text: `${outcomeText(saved)} ${pages.onDemand.filePath(tab.pageId)}` }) }
      onClose()
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) }
  }
  return <Modal title={`Rename the tab ${tab.name}`} eyebrow="TOOL VALIDATIONS · TABS" onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={(event) => void submit(event)} className="pgb-form">
      <PageNameField value={name} clash={clash} onChange={(value) => { setName(value); setError('') }} />
      <small className="muted">The tab and its page are renamed for everyone (saved to Git).</small>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions">{why && <WriteBlocked reason={why} />}<button type="button" className="ghost" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy || Boolean(clash) || Boolean(why)}>{busy ? 'Saving to Git…' : 'Save to Git'}</button></div>
    </form>
  </Modal>
}

// Remove asks first and says what happens to the page: kept in Git, hidden (anyone who may change the list), or deleted
// with its data (the Tool Owner only, PGB-20).
function RemoveTabDialog({ env, pages, tab, onClose }: { env: ToolValidationsEnv; pages: CustomTabsEnv; tab: CustomTab; onClose: () => void }) {
  const [remove, setRemove] = useState<'keep' | 'delete'>('keep')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const why = tabsReason(env)
  const deleting = deleteReason(pages.viewer)
  const page = pages.onDemand.stored(tab.pageId)
  const path = pages.onDemand.filePath(tab.pageId), blocks = pages.git.dashboardPathOf(tab.pageId)
  const layout = pages.menu.layout
  const dashboard = (layout.pages[tab.pageId] ? kindOf(layout, tab.pageId) : tab.kind) === 'dashboard'
  const rows = page?.rows.length ?? 0
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      await env.store.save(removeTab(env.store.file, tab.pageId), `Tool Validations: remove the tab ${tab.name}${remove === 'delete' ? ' and delete its page' : ' (its page kept, hidden)'}`, `Tool Validations · remove the tab ${tab.name}`)
      const ids = pages.onDemand.pages.map((entry) => entry.id)
      if (remove === 'delete' && !deleting) {
        if (page) await pages.onDemand.remove(tab.pageId, `Pages & menu: delete the page ${tab.name} (a tab of Tool Validations)`)
        const removed = dashboard ? await pages.git.removeDashboard(tab.pageId, `Pages & menu: remove the dashboard ${tab.name} (a tab of Tool Validations)`) : false
        if (pages.menu.layout.pages[tab.pageId]) await pages.menu.save(removePlacement(pages.menu.layout, tab.pageId), `Pages & menu: remove the page ${tab.name}`)
        recordJob(`pages:${tab.pageId}`, `Delete page · ${tab.name}`, { text: `Deleted ${path}${removed ? ` and ${blocks}` : ''}; its history stays in GitHub.` })
      } else if (page) {
        // Kept, hidden; TVL-25: the co-owners the list wrote to the page are taken off (those added by hand stay).
        const hidden = isHidden(pages.menu.layout, tab.pageId) ? pages.menu.layout : setHidden(pages.menu.layout, tab.pageId, true, ids)
        const next = withListOwners(hidden, tab.pageId, [])
        if (serializeMenuLayout(next) !== serializeMenuLayout(pages.menu.layout)) await pages.menu.save(next, `Pages & menu: hide the page ${tab.name} (its tab removed from Tool Validations; the list's co-owners taken off it)`)
      }
      onClose()
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) }
  }
  return <Modal title={`Remove the tab ${tab.name}`} eyebrow="TOOL VALIDATIONS · TABS" onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={(event) => void submit(event)}>
      <p>Remove the tab <strong>{tab.name}</strong> from Tool Validations for everyone? Its page — {dashboard ? 'an On-Demand Dashboard' : `${rows} row${rows === 1 ? '' : 's'}`} — is:</p>
      <fieldset className="pgb-kinds"><legend>The page</legend>
        <div className="pgb-kind"><label className="check"><input type="radio" name="remove-tab" checked={remove === 'keep'} onChange={() => setRemove('keep')} />Kept in Git, hidden</label><small>Its data stays; it is not in the menu, on Home or in search, and the list's co-owners are taken off its co-owners (those added by hand stay). A Tool Owner can open, show or delete it in Admin → Pages & reports → Menu groups & pages, and it can be made a tab again with ＋ Add existing page as tab….</small></div>
        <div className="pgb-kind"><label className="check" title={deleting || undefined}><input type="radio" name="remove-tab" disabled={Boolean(deleting)} checked={remove === 'delete'} onChange={() => setRemove('delete')} />Deleted with its data</label><small>{deleting || `${path}${dashboard ? ` and dashboards/${tab.pageId}.json are` : ' is'} deleted from Git; the history stays in GitHub. A dashboard that reads the page says it is no longer there.`}</small></div>
      </fieldset>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions">{why && <WriteBlocked reason={why} />}<button type="button" className="ghost" disabled={busy} onClick={onClose}>Cancel</button><button className="danger-button" disabled={busy || Boolean(why)}>{busy ? 'Saving to Git…' : remove === 'delete' ? `Remove ${tab.name} and delete its page` : `Remove ${tab.name}`}</button></div>
    </form>
  </Modal>
}

// TVL-15, TVL-17: an owners' tab — the page as its page type shows it anywhere (rows, row files and locks, Hide row,
// Insights, dashboard blocks), framed as a tab. The Tool Owner and the list's co-owners count as the page's co-owners
// here (set up, edit rows, build the dashboard); everyone else has the page's usual rights (the role rights) — read only
// for most, every change disabled with its reason. Fail closed without the roles file (CON-101).
const OnDemandPage = lazy(() => import('../pages/OnDemandPage').then((module) => ({ default: module.OnDemandPage })))
const CustomDashboardPage = lazy(() => import('../pages/CustomDashboardPage').then((module) => ({ default: module.CustomDashboardPage })))
const QueryTablePage = lazy(() => import('../pages/QueryTablePage').then((module) => ({ default: module.QueryTablePage })))
const noop = () => undefined
// The menu layout as the tab's page sees it: the viewer counted as a co-owner of the page when they may change the list;
// a save of the layout from the page keeps the page's own co-owners as they were.
function ownedMenu(menu: MenuLayoutStore, pageId: string, email: string, fallback: PageKind): MenuLayoutStore {
  if (!email) return menu
  const current = placementOf(menu.layout, pageId)
  const owners = menu.layout.pages[pageId]?.owners ?? []
  // TVL-25: the placement's other fields (the owners written from the list among them) are kept as they are.
  const layout: MenuLayout = { ...menu.layout, pages: { ...menu.layout.pages, [pageId]: { ...menu.layout.pages[pageId], type: menu.layout.pages[pageId]?.type ?? fallback, group: current.group, order: current.order, icon: current.icon, owners: owners.includes(email) ? owners : [...owners, email], ...(current.hidden ? { hidden: true } : {}) } } }
  const save = (next: MenuLayout, message: string) => {
    const entry = next.pages[pageId]
    if (!entry) return menu.save(next, message)
    const kept = entry.owners.filter((owner) => owners.includes(owner))
    const out = { ...entry, owners: kept }
    if (entry.ownersFromList) { const listed = entry.ownersFromList.filter((owner) => kept.includes(owner)); if (listed.length) out.ownersFromList = listed; else delete out.ownersFromList }
    return menu.save({ ...next, pages: { ...next.pages, [pageId]: out } }, message)
  }
  return { ...menu, layout, save }
}
function CustomTabView({ env, tab }: { env: ToolValidationsEnv; tab: CustomTab }) {
  const pages = env.pages
  if (!pages) return <Missing />
  const page = pages.onDemand.pages.find((entry) => entry.id === tab.pageId)
  if (!page) return <Panel><EmptyState title={pages.onDemand.loaded ? `The page of the tab ${tab.name} is not in Git (it was deleted).` : `Reading ${tab.name} from Git…`} detail={pages.onDemand.loaded ? 'A Tool Owner or a co-owner of the list removes the tab on Setup → Tabs.' : undefined} /></Panel>
  const layout = pages.menu.layout
  const kind = layout.pages[tab.pageId] ? kindOf(layout, tab.pageId) : tab.kind
  const owns = !pages.viewer.readOnly && !listReason(pages.viewer, env.store.shown)
  const menu = owns ? ownedMenu(pages.menu, tab.pageId, pages.viewer.email.trim().toLowerCase(), tab.kind) : pages.menu
  return <Suspense fallback={<Panel><EmptyState title={`Opening ${tab.name}…`} /></Panel>}>
    {kind === 'dashboard'
      ? <CustomDashboardPage key={tab.pageId} embedded git={pages.git} store={pages.onDemand} pageId={tab.pageId} menu={menu} viewer={pages.viewer} views={pages.views} onOpen={noop} onAddPage={noop} hours={pages.hours} publisherName={pages.publisherName} publisher={pages.publisher} tools={env.datasets} azure={pages.azure} />
      : page.source ? <QueryTablePage key={tab.pageId} embedded git={pages.git} store={pages.onDemand} pageId={tab.pageId} onOpen={noop} onAddPage={noop} kind={kind} menu={menu} viewer={pages.viewer} views={pages.views} azure={pages.azure} />
      : <OnDemandPage key={tab.pageId} embedded git={pages.git} store={pages.onDemand} pageId={tab.pageId} me={pages.me} onOpen={noop} onAddPage={noop} kind={kind} menu={menu} viewer={pages.viewer} views={pages.views} dataMode={pages.dataMode} publisherName={pages.publisherName} publisher={pages.publisher} />}
  </Suspense>
}
