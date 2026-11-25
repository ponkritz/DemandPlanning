import { useCan, useWriteBlock } from '../useCan'
import { countStreams, monthReleaseCount, releaseRegister, timeWritingHours } from '../releaseSource'
import { runInBackground } from '../backgroundJobs'
import { useBulkEpic, useStreamEpics } from '../useStreamEpics'
import { bulkEpicMissing } from '../bulkEpics'
import { BulkEpicNotSet } from '../components/BulkEpicsPanel'
import type { SettingsTab } from '../settingsTabs'
import type { FeatureSetups } from '../featureSetup'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { EmptyState, Notice, Page, Panel, Pill, TablePanel, WriteBlocked } from '../components/ui'
import type { PersonalViewsStore } from '../usePersonalViews'
import { viewMetaKey } from '../personalViews'
import { recordJob } from '../backgroundJobs'
import { normalizeBacklogColumns } from '../backlogView'

// BKL-47: the QMS-0025 column order a Tool Owner saves for everyone (in the shared views defaults in Git).
const columnsDefaultKey = 'backlog-columns'
import { AzureWorkItemTree } from '../components/AzureWorkItemTree'
import { QueryView } from '../components/QueryView'
import { ResultTabs } from '../components/ResultTabs'
import { ReleaseView } from '../components/ReleaseView'
import { ToolValidationsTabs } from '../components/ToolValidations'
import { useToolValidationsEnv } from '../useToolValidations'
import { monthToolKeys } from '../toolValidations'
import { SupportedReleasesTable } from '../components/DpMonthCounts'
import { matchedFeatureColumns } from '../components/matchedFeatureColumns'
import { PeriodSelect, ReleaseCounts, ReleaseSourceBar, type CountValue, type ReleaseScope } from '../components/ReleasePage'
import { useDpBoardColumn } from '../useDpBoardColumn'
import { CpReportView } from '../components/CpReportView'
import { completedCount, cpReportFor, defaultStreamReleases, supportedCount, toolReportFor } from '../releaseOverview'
import { ToolListTable, ValidationDocumentsTable } from '../components/ToolQueriesView'
import { completionFieldOptions, fetchParentTitles, parentIdsToRead, selectColumns, toolMonthStatus, type ParentTitles } from '../toolQueries'
import { cpAllMonths, defaultCpReportingSettings } from '../cpReporting'
import { toolQueryHowLabel } from '../streams'
import type { AzureWorkItem } from '../domain'
import { ddtMonthOf, dpListedIn, dpMilestoneNames, dpMilestones, dpMilestoneText, dpMonthCounts, dpMonthText, dpPlannedMilestones } from '../dpMilestones'
import type { DataColumn } from '../components/DataTable'
import type { QeMappingFile } from '../qeMapping'
import { chooseSetup } from '../featureSetup'
import { dpRowName, dpRowVersion, fullMatch, possibleQes, qeFor } from '../dpBulk'
import { classificationOf, detectClassification } from '../epicSetup'
import { useEpicSetupFile } from '../useEpicSetup'
import { dpBoardCandidates, dpBoardMatch } from '../dpBoardMatch'
import { DpBulkCreate } from '../components/DpBulkCreate'
import { formatDate, formatDateTime, monthName } from '../format'
import { approvalDateFrom, viewMonthOf } from '../releaseSource'
import { viewSource } from '../viewSources'
import { listAzureConnectionProfiles } from '../azureCredentials'
import { connectionConfig, type AzureWorkspace } from '../useAzureWorkspace'
import { loadAzureConnectionProfile } from '../azureCredentials'
import type { BacklogView } from '../backlogViews'
import { predecessorRef, successorRef, type AzureConfig } from '../azureDevOps'
import type { PageProps } from './types'
import type { GitStorage } from '../useGitStorage'
import { columnName, queryLayout, type QueryColumn, type QueryOrder } from '../queryView'
import { dataSetOfProfile, defaultMatchThreshold, streamArea, streamOfProfile } from '../streams'
import { normalizeReleaseSourceSettings, streamPatterns } from '../releaseSource'

// One page for all configured Azure DevOps views (each its own entry in the sidebar): the Time Writing backlog
// (QMS-0025) as an editable tree, and every other shown connection as a read-only query view.
export function BoardPage({ azure, store, current, month, git, onOpenConnection, onOpenSettings, assign, featureSetup, qeMapping, views, canSetDefault = false }: { onOpenSettings?: (tab: SettingsTab, section?: string) => void; views?: PersonalViewsStore; canSetDefault?: boolean; azure: AzureWorkspace; store: PageProps['store']; current: BacklogView; month: string; git?: GitStorage; onOpenConnection: () => void; assign?: { me: string; canChoose: boolean }; featureSetup?: FeatureSetups | null; qeMapping?: QeMappingFile | null }) {
  const { items, config, preview, pat, featureCreated, rememberPat } = azure
  const [filter, setFilter] = useState('')
  if (current.readOnly) return <ReadOnlyView key={current.id} id={current.id} name={current.name} role={current.role} azure={azure} store={store} month={month} gitNote={git?.snapshotNotes[current.id]} onOpenConnection={onOpenConnection} onOpenSettings={onOpenSettings} assign={assign} featureSetup={featureSetup} qeMapping={qeMapping} />
  const activeItems = items.filter((item) => item.state.trim().toLowerCase() !== 'removed')
  const shown = activeItems.filter((item) => `${item.id} ${item.title} ${item.workItemType} ${item.state}`.toLowerCase().includes(filter.toLowerCase()))
  const counts = new Map<string, number>()
  for (const item of activeItems) counts.set(item.workItemType || 'Unknown', (counts.get(item.workItemType || 'Unknown') ?? 0) + 1)

  // BKL-47: the QMS-0025 column order as the view for everyone (with who and when, as every table's), or cleared;
  // the result is also listed under Background jobs.
  const columnsForEveryone = async (columns: string[] | undefined) => {
    if (!views) return
    const by = views.who || 'a Tool Owner', label = columns ? 'Save view for everyone · QMS-0025 columns' : 'Clear the view for everyone · QMS-0025 columns'
    try {
      await views.saveDefaults({ [columnsDefaultKey]: columns, [viewMetaKey(columnsDefaultKey)]: columns ? { by, at: new Date().toISOString() } : undefined }, `${columns ? 'View for everyone' : 'View for everyone cleared'}: QMS-0025 columns (${by})`)
      recordJob('views-for-everyone:backlog-columns', label, { text: columns ? 'QMS-0025 columns: saved as the view for everyone.' : 'QMS-0025 columns: the view for everyone is cleared.' })
    } catch (failure) { recordJob('views-for-everyone:backlog-columns', label, { text: failure instanceof Error ? failure.message : String(failure), failed: true }); throw failure }
  }
  // BKL-12, BKL-45: the board and its source details are two tabs; the board is the page's only scroller.
  const board = config ? <Panel className="connection-panel backlog-panel"><AzureWorkItemTree items={items} config={config} tabs={<span />} teamColumns={views?.filter(columnsDefaultKey, (value) => Array.isArray(value) ? normalizeBacklogColumns(value) : undefined)} onSaveColumnsForEveryone={canSetDefault && views ? (columns) => columnsForEveryone(columns) : undefined} onClearColumnsForEveryone={canSetDefault && views ? () => columnsForEveryone(undefined) : undefined} onCreated={featureCreated} savedPat={pat} creatorEmail={azure.creatorEmail} onSavePat={rememberPat} assign={assign} featureSetup={featureSetup} month={month} /></Panel> : <Panel><EmptyState title="Configure a valid Azure DevOps project to use Backlogs." /><button className="primary" onClick={onOpenConnection}>Open connection settings</button></Panel>
  const sourceDetails = <Panel className="connection-panel" title={preview ? 'Work-item preview' : 'Saved work items'} detail={`${items.length} items · ${preview ? `Scope: ${preview.areaPaths.join(', ')}` : 'Refresh source data from connection settings.'}`} info="Only verified team-backlog records are shown. Missing target/closure dates stay blank. Saving a fresh scoped result replaces the Azure cache; no Azure source records or demand-planning data are deleted." action={<input aria-label="Search work-item details" className="search" placeholder="Search ID, title, type or state" value={filter} onChange={(event) => setFilter(event.target.value)} />}>
    <div className="button-row">{[...counts].map(([type, count]) => <Pill key={type} tone="info">{type}: {count}</Pill>)}</div>
    {shown.length > 0 ? <div className="azure-table"><table><thead><tr><th>ID / Title</th><th>Type / State</th><th>Assigned to</th><th>Iteration / Parent</th><th>Target / Closed</th><th>Last fetched</th></tr></thead><tbody>{shown.slice(0, 100).map((item) => <tr key={item.key}><td><a href={item.url} target="_blank" rel="noreferrer">#{item.id}</a><strong>{item.title}</strong></td><td>{item.workItemType}<small>{item.state}</small></td><td>{item.assignedTo || 'Unassigned'}</td><td>{item.iterationPath}<small>{item.parentId ? `Parent #${item.parentId}` : 'No parent supplied'}</small></td><td>{formatDate(item.targetDate, 'No target date')}<small>{formatDate(item.closedDate, 'No closed date')}</small></td><td>{formatDateTime(item.syncedAt)}</td></tr>)}</tbody></table><p className="muted">Showing {Math.min(shown.length, 100)} of {shown.length} matching work items.</p></div> : <EmptyState title={items.length ? 'No matching work items.' : 'No work items loaded yet.'} />}
  </Panel>
  return <Page className="backlog-page">
    <ResultTabs id={`backlog:${current.id}`} mainLabel={current.name} rawLabel="Source details" rawCount={activeItems.length} main={board} raw={sourceDetails} />
  </Page>
}


// What each counting stream counts (QV-58, as Pulse Check counts them), shown behind ⓘ "What was counted".
const countRules: Record<string, { completed: string; supported: string }> = {
  DP: { completed: 'DT (Design Transfer) Done with the DDT Date in the month', supported: 'A milestone (DT, SFV, PRD or RPE) Done in the month, each release once' },
  CP: { completed: 'Main Release Notes signed by QA/QE in the month (also supported)', supported: 'Any document under the release signed by QA/QE in the month' },
  IOCC: { completed: 'Release Notes or Verification Report signed in the month', supported: 'Release Plan, Release Notes or Verification Report signed in the month, each release once' },
}

// DP: each row's QMS-0025 match once per data set (the Select box, the Time Writing Feature and its hours read it).
function useDpMatches(rows: AzureWorkItem[] | undefined, candidates: ReturnType<typeof dpBoardCandidates> | null, threshold: number) {
  return useMemo(() => candidates && rows ? new Map(rows.map((row) => [row.id, dpBoardMatch(row, candidates, threshold)])) : null, [rows, candidates, threshold])
}

// A read-only Azure DevOps view. A stream's view (DP, CP, IOCC, Content, Tool Validations) is its Release page, with
// the parts of UI-STANDARDS §10 (QV-62): source bar, counts (CP, DP, IOCC; QV-64: Content, Tool Validations),
// Releases | Source data tabs and the Releases table. A view of its own query keeps the source bar and its single
// table. QV-63: ↻ and Load from Git run as Background jobs named after the view; their result is listed there, and
// the page keeps only the warnings about its data (a failed refresh: the data shown is older).
const noItems: AzureWorkItem[] = []
// TVL-31: the titles of work items by ID on a saved connection (its PAT, its server; read only), or why not.
async function readParentTitles(connectionId: string, ids: number[]): Promise<ParentTitles> {
  const all = (error: string): ParentTitles => Object.fromEntries(ids.map((parent) => [String(parent), { error }]))
  const profile = loadAzureConnectionProfile(connectionId)
  if (!profile) return all('The Signed documents connection is not saved in this browser.')
  try { return await fetchParentTitles(connectionConfig(profile), profile.token, ids) } catch (failure) { return all(failure instanceof Error ? failure.message : String(failure)) }
}
// TVL-31: the names of the documents' Parents that are no tool of the Tools query are read by ID (read only) and kept
// on the saved documents (by work item ID; keepParentTitles keeps them over a later fetch).
// - Whenever the documents are shown and a Parent has no name yet (neither a title nor a reason it was not read), its
//   name is read — after any fetch (↻, Save and refresh data, the fetch at start), so no path can miss it; once per
//   fetched data set.
// - ↻ reads every Parent again (a name changed in Azure DevOps, a failed read).
async function readAndKeepParentTitles(documentsId: string, ids: number[], update: PageProps['store']['update']) {
  if (!ids.length) return
  const titles = await readParentTitles(documentsId, ids)
  update((draft) => { const entry = draft.azureSources?.find((found) => found.connectionId === documentsId); if (entry) entry.parentTitles = { ...(entry.parentTitles ?? {}), ...titles }; return draft })
}
function useMissingParentTitles(documentsId: string | undefined, fetchedAt: string | undefined, report: Parameters<typeof parentIdsToRead>[0] | undefined, titles: ParentTitles | undefined, update: PageProps['store']['update']) {
  const tried = useRef('')
  useEffect(() => {
    if (!documentsId || !fetchedAt || !report) return
    const missing = parentIdsToRead(report).filter((parent) => !titles?.[String(parent)])
    if (!missing.length) return
    const key = `${documentsId}@${fetchedAt}:${missing.join(',')}`
    if (tried.current === key) return
    tried.current = key
    void readAndKeepParentTitles(documentsId, missing, update)
  }, [documentsId, fetchedAt, report, titles, update])
}
function ReadOnlyView({ id, name, role, azure, store, month, gitNote, onOpenConnection, onOpenSettings, assign, featureSetup, qeMapping }: { onOpenSettings?: (tab: SettingsTab, section?: string) => void; featureSetup?: FeatureSetups | null; qeMapping?: QeMappingFile | null; id: string; name: string; role: BacklogView['role']; azure: AzureWorkspace; store: PageProps['store']; month: string; gitNote?: { tone: string; text: string }; onOpenConnection: () => void; assign?: { me: string; canChoose: boolean } }) {
  // QV-16: the header month, or every month (Show: {month} / All months).
  const [scope, setScope] = useState<ReleaseScope>('month')
  const allMonths = scope === 'all'
  // Every connection's fetch is stored on its own (by connection ID).
  const status = azure.connectionStatus[id]
  const profile = loadAzureConnectionProfile(id)
  const source = viewSource(store.state, id, role, profile?.query, listAzureConnectionProfiles().filter((entry) => entry.role === 'release-source').length)
  // A default stream (DP, CP, IOCC, …) reads its releases with its own rule; DP and IOCC match Features fuzzily.
  const stream = profile ? streamOfProfile({ viewName: profile.viewName, reason: profile.reason, role }) : undefined
  const threshold = normalizeReleaseSourceSettings(store.state.releaseSourceSettings).matchThreshold ?? defaultMatchThreshold
  let config: AzureConfig | null = null
  try { config = profile ? connectionConfig(profile) : null } catch { config = null }
  const busy = status?.state === 'busy'
  // Columns saved with the fetch; a snapshot fetched before columns were stored, or with another query than the
  // connection has now, shows the current query's columns until a refresh loads their values.
  const current = profile?.query ? queryLayout(profile.query) : null
  const stale = Boolean(source && current && (!source.columns?.length || source.query.trim() !== profile!.query!.trim()))
  const columns: QueryColumn[] | undefined = stale && current ? current.columns.map((ref) => ({ ref, name: columnName(ref) })) : source?.columns
  // CON-81: a view of its own (not a stream or a stream's data set) shows the Successor and Predecessor IDs read from
  // the work items' Dependency links, as two more columns, when any item has them.
  const ownView = Boolean(profile && !stream && !dataSetOfProfile({ id: profile.id, viewName: profile.viewName, reason: profile.reason, role }))
  const linkColumns = ownView && columns ? ([[successorRef, 'Successor ID'], [predecessorRef, 'Predecessor ID']] as const).filter(([ref]) => source?.items.some((item) => item.fields?.[ref])).map(([ref, name]) => ({ ref, name })) : []
  const viewColumns = linkColumns.length && columns ? [...columns.filter((column) => !linkColumns.some((link) => link.ref === column.ref)), ...linkColumns] : columns
  // TVL-31: Tool List (Azure) shows every column the Tools query selects, in its SELECT order.
  const toolListColumns = selectColumns(profile?.query, viewColumns)
  const orderBy: QueryOrder[] | undefined = stale && current ? current.orderBy : source?.orderBy
  const unresolved = stale ? current?.unresolved : source?.unresolved
  // Month filter (header month picker): items approved in the month, else changed in it; "All months" turns it off.
  // DP: the month is the DDT Date's (dpMilestones); other views: Author Approval Date, else Changed Date.
  // STR-03: a custom stream "Like DP" lists its releases by DP's path rule (ReleaseView); DP's milestones are DP's own.
  const isDp = stream?.rule === 'dp' && !stream.custom
  const area = streamArea(stream)
  // QV-55: the stream's naming patterns (saved in the shared settings, else built in), once per settings change.
  const savedSettings = store.state.releaseSourceSettings, streamName = stream?.name ?? name
  const namingPatterns = streamPatterns(savedSettings, streamName)
  // CP: its release-folder tree (the first CP connection) is read whole and reported by QA/QE signature month (cpReporting).
  const cp = stream?.rule === 'cp' ? cpReportFor(store.state, listAzureConnectionProfiles(), month) : undefined
  // QV-72: All months on CP lists every release container with a QA/QE signature in any month; the counts stay the header month's.
  const cpShown = cp && allMonths ? cpReportFor(store.state, listAzureConnectionProfiles(), cpAllMonths) : cp
  const isCp = Boolean(cp && cp.profile.id === id)
  // TVL-19…TVL-22: Tool Validations with its two queries — this page is its Tools query's (counts on the Master list tab,
  // the Tool List [TFS] and Validation Documents [TFS] tabs, TVL-14, TVL-31); the Signed documents query's own page,
  // opened from Other views, is a plain view.
  const toolTwo = stream?.rule === 'tool' && !stream.custom ? toolReportFor(store.state, azure.connectionProfiles, month) : undefined
  const isToolTwo = Boolean(toolTwo && toolTwo.tools.id === id), isToolDocuments = Boolean(toolTwo && toolTwo.documents.id === id)
  const toolDocumentsFound = toolTwo?.documentSource
  useMissingParentTitles(toolTwo?.documents.id, toolDocumentsFound?.fetchedAt, toolTwo?.report, toolDocumentsFound && 'parentTitles' in toolDocumentsFound ? toolDocumentsFound.parentTitles : undefined, store.update)
  // TVL-31: both tables show every column their query selects, in its SELECT order; the Parents' names read by ID.
  const toolDocumentsData = toolTwo && toolDocumentsFound ? { name: toolTwo.documents.viewName || toolTwo.documents.reason, items: toolDocumentsFound.items, columns: selectColumns(toolTwo.documents.query, 'columns' in toolDocumentsFound ? toolDocumentsFound.columns : undefined), orderBy: 'orderBy' in toolDocumentsFound ? toolDocumentsFound.orderBy : undefined, unresolved: 'unresolved' in toolDocumentsFound ? toolDocumentsFound.unresolved : undefined } : undefined
  // TVL-35, TVL-36: the Current Month Status of the master list's tools in the header month — the same rule as Pulse
  // Check (toolMonthStatus): with two queries by the Tools query's completion date and the documents' Quality
  // signatures; with one query, the tools with a document in the month.
  const toolPage = stream?.rule === 'tool' && !stream.custom && !isToolDocuments
  const toolEnv = useToolValidationsEnv()
  const masterFile = toolEnv?.store.shown
  const toolMonthItems = toolPage && !toolTwo && source ? source.items.filter((item) => viewMonthOf(item) === month) : noItems
  const toolStatus = !toolPage ? undefined : toolTwo ? toolMonthStatus(masterFile?.tools, { report: toolTwo.report }) : toolMonthStatus(masterFile?.tools ?? [], { supportedKeys: masterFile ? monthToolKeys(masterFile, toolMonthItems, namingPatterns) : new Set<string>() })
  const completionName = toolTwo ? completionFieldOptions(toolTwo.toolSource && 'columns' in toolTwo.toolSource ? toolTwo.toolSource.columns : undefined, toolTwo.toolSource?.items).find((option) => option.ref === toolTwo.report.completionField)?.name ?? toolTwo.report.completionField : ''
  const monthItems = source ? isCp ? source.items : source.items.filter((item) => isDp ? dpListedIn(item, month) : viewMonthOf(item) === month) : noItems
  const items = source ? allMonths || isCp ? source.items : monthItems : noItems
  // DP rows matched to the QMS-0025 board (Feature / User Story by SourceProgram + Title), with Create Feature.
  const boardColumn = useDpBoardColumn(isDp ? items : noItems, azure, threshold, assign, featureSetup)
  // QV-53: DP's Month & Year (the DDT Date's month, which the list filters on) and every milestone's month and status.
  // DPF-01…04: the release type, the QE from the QE Mapping and the possible QEs, and ticks for Create Features.
  const [picked, setPicked] = useState<number[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const can = useCan(), bulkWhy = useWriteBlock().why('work.bulk')
  // QV-59: no DP bulk creation Epic is built in — without one mapped, Create Features is disabled and links to the setting.
  const dpBulkEpic = useBulkEpic('DP').epicId
  const openBulkEpics = onOpenSettings ? () => onOpenSettings('options', 'bulk') : undefined
  const dpSetup = useMemo(() => chooseSetup(featureSetup, dpBulkEpic, true).setup, [featureSetup, dpBulkEpic])
  const dpEpics = useStreamEpics('DP')
  const dpCandidates = useMemo(() => isDp ? dpBoardCandidates(azure.items, dpEpics) : null, [isDp, azure.items, dpEpics])
  const dpMatches = useDpMatches(isDp ? source?.items : undefined, dpCandidates, threshold)
  const featureMatch = useMemo(() => (row: AzureWorkItem) => dpCandidates ? (dpMatches?.get(row.id) ?? dpBoardMatch(row, dpCandidates, threshold)).feature : undefined, [dpCandidates, dpMatches, threshold])
  // QV-65: the hours of the matched Feature's Time Writing Tasks (as IOCC, Content and Tool Validations show them).
  const hoursOf = useMemo(() => timeWritingHours(azure.items), [azure.items])
  const allDp = source?.items ?? noItems
  // DPF-12: Release name, Version and the Release Classification detected from the version (DPF-11, by the rules of the
  // DP bulk Epic's Release Classification field) as the first columns; '—' without a bulk Epic or a value found.
  const epicFile = useEpicSetupFile()
  const dpClasses = useMemo(() => classificationOf(epicFile, dpBulkEpic), [epicFile, dpBulkEpic])
  const dpLead: DataColumn<AzureWorkItem>[] = isDp ? [
    { id: '@dp-name', label: 'Release name', value: (item) => dpRowName(item) },
    { id: '@dp-version', label: 'Version', value: (item) => dpRowVersion(item), render: (item) => dpRowVersion(item) || '—' },
    { id: '@dp-class', label: `${dpClasses.label} (detected)`, value: (item) => dpBulkEpic ? detectClassification(dpClasses, dpRowVersion(item)) : '', render: (item) => (dpBulkEpic && detectClassification(dpClasses, dpRowVersion(item))) || '—', title: () => !dpBulkEpic ? 'No DP bulk creation Epic is set (Admin → Stream options → Bulk creation Epics)' : !dpClasses.values.length ? `Epic #${dpBulkEpic} has no ${dpClasses.label} List field (Admin → Epic & Feature setup)` : dpClasses.rules.length ? `Detected from the version by the rules of Epic #${dpBulkEpic} (Admin → Epic & Feature setup)` : `Epic #${dpBulkEpic} has no rules yet: the value named like the release type (Major, Minor, MLD, Platform Update)` },
  ] : []
  const dpColumns: DataColumn<AzureWorkItem>[] = isDp ? [
    { id: '@dp-pick', label: 'Select', fixed: true, sortable: false, export: false, value: (item) => picked.includes(item.id) ? 'yes' : '', render: (item) => { const full = fullMatch(featureMatch(item)); return <input type="checkbox" aria-label={`Select ${item.title}`} disabled={full} title={full ? `Feature #${featureMatch(item)!.item.id} on QMS-0025 matches this release 100%: nothing to create` : undefined} checked={!full && picked.includes(item.id)} onChange={() => setPicked((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /> } },
    { id: '@dp-qe', label: 'QE', sortable: false, value: (item) => qeFor(item, qeMapping, dpSetup?.qeColumns)?.qe ?? '', title: () => dpSetup?.qeColumns ? `From the QE Mapping: ${dpSetup.qeColumns.matchColumn} → ${dpSetup.qeColumns.qeColumn}` : `Set the QE Mapping columns in Feature setup → Epic ${dpBulkEpic}` },
    { id: '@dp-backup', label: 'Possible QEs', sortable: false, value: (item) => possibleQes(item, allDp, qeFor(item, qeMapping, dpSetup?.qeColumns)?.qe ?? '').join(', '), title: () => 'Assigned to the earlier releases of the same product (newest first), not the QE and not the release’s own Assigned To' },
    { id: '@dp-month', label: 'Month & Year', value: (item) => dpMonthText(item), title: (item) => ddtMonthOf(item) ? 'The month of the DDT Date: the month this release is listed in' : dpPlannedMilestones(item).length ? 'No DDT Date: listed in the months of its Planned / ToBePlanned milestones, not counted as Supported or Completed' : 'No DDT Date and no planned milestone: listed only with All months, never counted', sortable: false },
    { id: '@dp-milestones', label: 'Milestones', value: (item) => dpMilestoneText(item), title: () => '✓ = Done with a date: counts as Supported in that month (DDT ✓ also as Completed)', sortable: false },
    ...matchedFeatureColumns<AzureWorkItem>(featureMatch, hoursOf).map((column) => ({ ...column, id: `@dp-${column.id}` })),
  ] : []
  // Items without an approval date fall back to their Changed Date for the month filter; say how many.
  const undated = source ? source.items.filter((item) => isDp ? !ddtMonthOf(item) && !dpPlannedMilestones(item).length : !(item.approvalDate ?? approvalDateFrom(item.fields ?? {}))).length : 0
  // On-prem views with Git storage: Load from Git too; a fetch that cannot run falls back to it.
  // QV-48: a small ↻ button (its full name as tooltip; the progress shown beside it while busy) and a ⋯ menu.
  const refreshLabel = source ? 'Refresh from Azure' : 'Fetch from Azure'
  // QV-63: each as a Background job named after the view; the connection's last status is its result.
  const inBackground = (label: string, work: () => Promise<boolean>) => runInBackground(`azure:${id}`, `${label} · ${name}`, async (progress) => {
    progress(label === 'Load from Git' ? 'Loading from Git…' : 'Fetching…')
    const ok = await work(), last = azure.connectionResult(id)
    return { text: last?.message || (ok ? 'Done.' : 'Not done.'), failed: !ok }
  })
  // TVL-22: ↻ on Tool Validations with its two queries fetches both, the Tools query first.
  // TVL-31: then the titles of the documents' Parents that are no tool of the Tools query (e.g. retired tools) are read
  // by ID — read only, on the Signed documents connection with its server's PAT — and kept with the fetched documents;
  // a name not read shows as #ID with the reason. The tables never wait for it.
  const fetchAll = isToolTwo && toolTwo ? async () => { const tools = await azure.fetchConnection(id); const documents = await azure.fetchConnection(toolTwo.documents.id); await readAndKeepParentTitles(toolTwo.documents.id, parentIdsToRead(toolTwo.report), store.update); return tools && documents } : () => azure.fetchConnection(id)
  const refresh = <button type="button" className="primary" aria-label={refreshLabel} title={isToolTwo ? `${refreshLabel}: the Tools and the Signed documents queries` : refreshLabel} disabled={busy} onClick={() => inBackground(refreshLabel, fetchAll)}>↻{busy ? <small>{status?.message || 'Fetching…'}</small> : !source ? <small>Fetch</small> : null}</button>
  const menu = [...(azure.canLoadFromGit(id) ? [{ key: 'git', label: 'Load from Git', disabled: busy, onClick: () => inBackground('Load from Git', () => azure.loadFromGit(id)) }] : []), { key: 'settings', label: 'Connection settings', onClick: onOpenConnection }]
  // Information about the view sits behind ⋯ → About this source… (QV-70), not as banners; only errors and warnings stay on the page.
  const notes = [
    source && isDp ? `Month filter: by DDT Date in UTC; a release without one is listed in the months of its Planned / ToBePlanned milestones (not counted).${undated > 0 ? ` ${undated} of ${source.items.length} releases have no DDT Date and no Planned / ToBePlanned milestone date: they show only with Show: All months.` : ''}` : '',
    toolTwo && (isToolTwo || isToolDocuments) ? `Tool Validations reads two queries: Tools “${toolTwo.tools.viewName || toolTwo.tools.reason}” and Signed documents “${toolTwo.documents.viewName || toolTwo.documents.reason}” (${toolQueryHowLabel[toolTwo.how]}).${isToolDocuments ? ' This is the Signed documents query: its documents are listed on the Tool Validations page (Validation Documents [TFS] tab) and give the Supported status of the master list.' : ''}` : '',
    source && isCp ? `CP: the whole release-folder tree is read; the month is the QA/QE signature date in UTC (header month). ${cp!.enrichmentName ? `Release names come from “${cp!.enrichmentName}”.` : 'Add a second CP connection (e.g. “CP Releases”, with Release and Content) for the release names.'}` : '',
    source && !isDp && !isCp && undated > 0 ? `Month filter: by Author Approval Date in UTC. ${undated} of ${source.items.length} items have no approval date${role === 'release-source' ? '' : ' in the query’s columns'}, so their Changed Date is used.` : '',
    source ? `${source.items.length} items fetched${isCp || isToolTwo || isToolDocuments ? '' : `; ${monthItems.length} in ${monthName(month)}`}.` : '',
    isDp ? dpMilestones.map(([milestone]) => `${dpMilestoneNames[milestone].short} = ${dpMilestoneNames[milestone].long} (${milestone})`).join(' · ') : '',
    !azure.isSample && gitNote && gitNote.tone !== 'error' ? gitNote.text : '',
  ].filter(Boolean)

  // (2) QV-58: CP, DP and IOCC count their Completed and Supported releases of the header month (as Pulse Check), with
  // the counts an Admin entered while the stream has no data; Releases in the month as the Releases table lists them.
  // STR-03: a custom stream "Like IOCC" counts its Completed and Supported releases by IOCC's rules.
  const countStream = stream && ((countStreams as readonly string[]).includes(stream.name) || (stream.custom && stream.rule === 'iocc')) ? stream.name : undefined
  const counted = countStream ? defaultStreamReleases(store.state, azure.connectionProfiles, month).find((entry) => entry.name === countStream) : undefined
  const dpCounts = useMemo(() => isDp && source ? dpMonthCounts(source.items, month) : null, [isDp, source, month])
  const isIocc = stream?.rule === 'iocc'
  const ioccItems = isIocc ? monthItems : noItems
  const ioccMonth = useMemo(() => ioccItems.length ? releaseRegister(ioccItems, [], { rule: 'iocc', patterns: namingPatterns, area }).length : 0, [ioccItems, namingPatterns, area])
  // QV-64: Content and Tool Validations count the releases (Tool Validations: the tools) the Releases table lists for
  // the month, as Pulse Check does; Tool Validations' Supported is the same list (Pulse Check's Supported line).
  const listRule = !isToolTwo && !isToolDocuments && (stream?.rule === 'title' || stream?.rule === 'tool') ? stream.rule : undefined
  const listSource = listRule ? source : undefined
  const listMonth = useMemo(() => listSource ? monthReleaseCount(listSource.items, month, listRule, namingPatterns) : 0, [listSource, month, listRule, namingPatterns])
  let counts: ReactNode = null
  // TVL-36: Tool Validations with one query counts from the master list too — each tool with a document in the month.
  if (listRule === 'tool' && source && toolStatus) {
    const listed = toolStatus.listed.length
    counts = <ReleaseCounts month={month} noun="validations"
      releases={{ value: listed, hint: 'Master list tools with a validation document in the month' }}
      supported={{ value: toolStatus.supported.length, hint: 'Each master list tool with a document in the month, as Pulse Check counts it' }}
      counted={<ul><li><strong>Validations in {monthName(month)}</strong>: the master list's tools whose Current Month Status is Supported — each tool of the Tool Validations query with a document approved in the month (Author Approval Date in UTC), else changed in it; each tool once.</li><li><strong>Supported validations</strong>: the same tools — Pulse Check's Supported line counts every tool with a document in the month, once each.</li><li><strong>Completed</strong> is not counted with one query: the documents carry no completion event. Add a Validation Documents query (Admin → Streams → Stream mapping → Tool Validations queries) to count Completed by the tools' completion date.</li></ul>} />
  } else if (listRule && source) {
    const tool = listRule === 'tool', noun = tool ? 'tool' : 'release'
    counts = <ReleaseCounts month={month} noun={tool ? 'validations' : undefined}
      releases={{ value: listMonth, hint: tool ? `${streamName} tools with a validation document in the month` : `${streamName} ${noun}s the Releases table lists for the month` }}
      supported={tool ? { value: listMonth, hint: 'Each tool with a document in the month, as Pulse Check counts it' } : undefined}
      counted={<ul><li><strong>{tool ? 'Validations' : 'Releases'} in {monthName(month)}</strong>: the {noun}s the Releases table lists for the month — each {noun} with a document approved in the month (Author Approval Date in UTC), else changed in it; the same count as Pulse Check.</li>{tool ? <li><strong>Supported validations</strong>: the same tools — Pulse Check's Supported line counts every tool with a document in the month (validated or supported), once each.</li> : <li><strong>Supported</strong> is not counted: Content has no rule for a supported release apart from the releases listed.</li>}<li><strong>Completed</strong> is not counted: the documents carry no completion event (no Release Notes signature or milestone), only their approval date.</li></ul>} />
  }
  // TVL-21: Tool Validations with its two queries — Completed by the completion date, Supported by the Quality
  // signatures of the tools' documents; Releases in {Month}: the tools listed (either), as Pulse Check counts them.
  // TVL-36: the counts are the master list's Current Month Status (toolMonthStatus), as Pulse Check counts them.
  if (isToolTwo && toolTwo && source && toolStatus) {
    const { report } = toolTwo
    const changed = report.completionField === 'System.ChangedDate'
    counts = <ReleaseCounts month={month} noun="validations"
      releases={{ value: toolStatus.listed.length, hint: 'Master list tools Completed or Supported in the month' }}
      completed={{ value: toolStatus.completed.length, hint: `Master list tools whose ${completionName} is in the month` }}
      supported={{ value: toolStatus.supported.length, hint: 'Master list tools with a document signed by a Quality role in the month' }}
      counted={<ul>
        <li><strong>Validations in {monthName(month)}</strong>: the master list's tools whose <strong>Current Month Status</strong> is Completed, Supported or both, each once. Only the tools of the Tools query (Tool List [TFS]) have a status.</li>
        <li><strong>Completed validations</strong>: a tool (a row of the Tools query “{toolTwo.tools.viewName || toolTwo.tools.reason}”) whose <strong>{completionName}</strong> falls in the month, in UTC.{changed ? ' Changed Date is the last update of the tool’s work item: it moves on any edit, so a tool edited later counts in that later month.' : ''} The field is chosen in Admin → Streams → Stream mapping → Tool Validations queries.{report.noCompletionDate ? ` ${report.noCompletionDate} tool${report.noCompletionDate === 1 ? ' has' : 's have'} no ${completionName}: never counted as Completed.` : ''}</li>
        <li><strong>Supported validations</strong>: a tool with at least one document of the Signed documents query “{toolTwo.documents.viewName || toolTwo.documents.reason}” whose <strong>Parent</strong> is the tool and that has a qualifying Quality signature dated in the month — as CP counts: a role on the allowlist ({defaultCpReportingSettings.roles.join(', ')}; spaces and case ignored), a name and a valid date in the same approver slot, the month in UTC. Each tool once, however many documents.</li>
        <li><strong>Not in Tool List (Azure)</strong>: {report.unlinked.length} document{report.unlinked.length === 1 ? '' : 's'} whose Parent is no tool of the Tools query, e.g. a retired tool, or that have no Parent ({report.unlinkedSigned.length} with a Quality signature in {monthName(month)}) — listed on the Validation Documents [TFS] tab with their Parent's name, <strong>not counted</strong> and not added to the master list. Only the tools of the Tools query are counted.</li>
        <li>The same counts as Pulse Check, the Monthly pack and the cumulative chart. How the two connections are told apart: {toolQueryHowLabel[toolTwo.how]}.</li>
      </ul>} />
  }
  if (countStream && counted) {
    const rules = countRules[countStream] ?? countRules.IOCC
    const value = (count: number | undefined, hint: ReactNode): CountValue => counted.noData && !counted.entered ? { value: '—', hint: `No data (${counted.noData}) — placeholder` } : counted.noData ? { value: count ?? '—', hint: `Entered by an Admin · no data (${counted.noData})` } : { value: count ?? '—', hint }
    const listed = isDp ? monthItems.length : isCp && cp ? cp.report.rows.length : ioccMonth
    counts = <ReleaseCounts month={month}
      releases={counted.noData ? { value: '—', hint: `No data (${counted.noData})` } : { value: listed, hint: `${countStream} releases the Releases table lists for the month` }}
      completed={value(completedCount(counted), rules.completed)}
      supported={value(supportedCount(counted), dpCounts ? `${rules.supported} · ${dpCounts.milestones.length} milestone${dpCounts.milestones.length === 1 ? '' : 's'}: ${dpMilestones.map(([milestone]) => `${dpMilestoneNames[milestone].short} ${dpCounts.byMilestone[milestone]}`).join(' · ')}` : rules.supported)}
      counted={<ul><li><strong>Releases in {monthName(month)}</strong>: the releases the Releases table lists for the month{isDp ? ' (by DDT Date, else by Planned / ToBePlanned milestones)' : isCp ? ' (each Release container with a QA/QE signature in the month)' : ' (by Author Approval Date, else Changed Date)'}.</li><li><strong>Completed</strong>: {rules.completed}.</li><li><strong>Supported</strong>: {rules.supported}.{isCp ? ' Completed releases are part of the supported ones; do not add them.' : ''}</li><li>The same counts as Pulse Check, My dashboard and the Monthly pack. While {countStream} has no data for the month (not set up or not fetched), the counts an Admin entered are shown (Admin → Streams → Stream mapping → Release counts), else —.</li></ul>}>
      {dpCounts && dpCounts.supported.length > 0 && <details className="dp-counted"><summary>Supported releases counted ({dpCounts.supported.length} release{dpCounts.supported.length === 1 ? '' : 's'}, {dpCounts.milestones.length} milestone{dpCounts.milestones.length === 1 ? '' : 's'})</summary>
        <SupportedReleasesTable releases={dpCounts.supported} />
      </details>}
    </ReleaseCounts>
  }

  // (3) and (4): the Releases | Source data tabs with the Releases table, else why there is nothing to show.
  const raw = (rows: AzureWorkItem[]) => <TablePanel><QueryView name={name} items={rows} columns={columns} orderBy={orderBy} unresolved={unresolved} /></TablePanel>
  const dpBulk = <><span className="muted">{picked.length} selected</span><button type="button" className="ghost" disabled={!items.length} onClick={() => setPicked(items.filter((item) => !fullMatch(featureMatch(item))).map((item) => item.id))}>Select all shown</button><button type="button" className="ghost" disabled={!picked.length} onClick={() => setPicked([])}>Clear</button><WriteBlocked reason={bulkWhy} />{!bulkWhy && !dpBulkEpic && <BulkEpicNotSet stream="DP" onOpen={openBulkEpics} />}<button type="button" className="primary" disabled={!picked.length || !assign?.canChoose || !can('work.bulk') || !dpBulkEpic} title={bulkWhy ? bulkWhy : !dpBulkEpic ? bulkEpicMissing('DP') : assign?.canChoose ? 'Create a Feature for each selected release, assigned to its QE' : 'Needs the right to create work items for other people (Admin → People & roles → Role rights)'} onClick={() => setBulkOpen(true)}>Create Features ({picked.length})</button></>
  // TVL-14: the built-in Tool Validations stream has its own tabs — Expiry list, Master list (with the counts and the
  // Current Month Status), Tool List [TFS] (the Tools query's rows, or the fetch empty state), Validation Documents [TFS]
  // (with the two queries) and one per other source — also before a fetch and in a month without documents (the master
  // list is kept in Git, not in the fetch). No Releases table: the month's tools are the master list's status.
  const notFetched = <Panel><EmptyState title={config ? `“${name}” has not been fetched yet.` : `The connection for “${name}” is not saved in this browser.`} detail={config ? 'Fetch it read-only with ↻; nothing is written to Azure DevOps. Its items stay on this page and are not counted in Overview, Time Writing or My Tasks [Board].' : 'Add it again in Admin → Streams.'} /></Panel>
  const toolDocumentsNode = isToolTwo && toolTwo ? toolDocumentsData ? <ValidationDocumentsTable report={toolTwo.report} documents={toolDocumentsData} parentTitles={toolDocumentsFound && 'parentTitles' in toolDocumentsFound ? toolDocumentsFound.parentTitles : undefined} />
    : <Panel><EmptyState title={`The Signed documents query “${toolTwo.documents.viewName || toolTwo.documents.reason}” has not been fetched yet.`} detail="Supported counts 0 until it is fetched. Fetch it read-only; nothing is written to Azure DevOps." /><button type="button" className="primary" disabled={busy} onClick={() => inBackground('Fetch from Azure', () => azure.fetchConnection(toolTwo.documents.id))}>Fetch signed documents</button></Panel> : undefined
  const body = toolPage ? <ToolValidationsTabs id={`azure:${name}`} masterTop={counts} status={toolStatus ? { month, status: toolStatus } : undefined} documents={toolDocumentsNode}
      toolList={!source || !config ? notFetched : <ToolListTable tools={{ name, items: source.items, columns: toolListColumns, orderBy, unresolved }} single={!isToolTwo} />} />
    : !source || !config ? notFetched
    : isToolDocuments ? <TablePanel title="Source data" count={`${source.items.length} row${source.items.length === 1 ? '' : 's'}`}><QueryView name={name} items={source.items} columns={viewColumns} orderBy={orderBy} unresolved={unresolved} summary={false} /></TablePanel>
    : !items.length && source.items.length ? (<TablePanel title={stream ? 'Releases' : undefined}>{isDp ? <EmptyState title={`No release has its DDT Date — or, without one, a planned milestone — in ${monthName(month)}.`} detail="Pick another month in the header, or choose All months (next to ↻). The counts above still include milestones Done in the month." /> : <EmptyState title={`No items in ${monthName(month)}.`} detail={`${source.items.length} items have an approval date (else a changed date) in other months. Pick another month in the header, or choose All months (next to ↻).`} />}</TablePanel>)
    : isDp ? <ResultTabs id={`azure:${id}`} rawCount={items.length} main={<TablePanel title="Releases">
        {bulkOpen && <DpBulkCreate rows={(source?.items ?? []).filter((item) => picked.includes(item.id))} azure={azure} featureSetup={featureSetup} qeMapping={qeMapping} featureMatch={featureMatch} onClose={() => { setBulkOpen(false); setPicked([]) }} />}
        <QueryView name={name} items={items} columns={columns} orderBy={orderBy} unresolved={unresolved} queryOnly choose lead={dpLead} more={dpColumns} extra={boardColumn} actions={dpBulk} />
      </TablePanel>} raw={raw(items)} />
    : isCp && cp ? <ResultTabs id={`azure:${id}`} rawCount={source.items.length} main={<CpReportView report={(cpShown ?? cp).report} azure={azure} assign={assign} featureSetup={featureSetup} threshold={threshold} enrichment={cp.enrichmentName} />} raw={raw(source.items)} />
    : role === 'release-source' || stream ? <ReleaseView name={name} items={items} backlog={azure.items} azure={azure} assign={assign} featureSetup={featureSetup} qeMapping={qeMapping} rule={stream?.rule} patterns={namingPatterns} area={area} fuzzy={stream?.fuzzy} onOpenBulkEpics={openBulkEpics} threshold={threshold} columns={viewColumns} orderBy={orderBy} unresolved={unresolved} />
    : <TablePanel><QueryView name={name} items={items} columns={viewColumns} orderBy={orderBy} unresolved={unresolved} /></TablePanel>
  return <Page className="release-page">
    {/* (1) QV-48, QV-70: the source bar; Show (on CP too since QV-72: All months lists every release container signed in any month; its counts stay the header month's), ↻ and ⋯. */}
    <ReleaseSourceBar name={name} source={`${config ? `${config.organization} / ${config.project}` : 'connection not found'}${profile?.query ? ' · query' : config?.team ? ` · team ${config.team}` : ''}`}
      fetched={source ? `fetched ${formatDateTime(source.fetchedAt)}${'fromGit' in source && source.fromGit ? ' (desktop app, via Git)' : ''}` : undefined}
      about={notes.length > 0 ? notes.map((note) => <p key={note}>{note}</p>) : undefined}
      period={source && !toolPage && !isToolDocuments ? <PeriodSelect month={month} value={scope} onChange={setScope} /> : undefined} primary={refresh} menu={menu}>
      {source && status?.state === 'error' && <Notice tone="warning">Not refreshed: {status.message} The data shown is from {formatDateTime(source.fetchedAt)}.</Notice>}
      {!azure.isSample && gitNote?.tone === 'error' && <Notice tone="error">{gitNote.text}</Notice>}
      {stale && !busy && <Notice tone="warning">The saved data was fetched with different columns than the connection's query now has. Refresh from Azure to load every column's values.</Notice>}
    </ReleaseSourceBar>
    {/* TVL-23: on Tool Validations the counts show on the Master list tab only. */}
    {toolPage ? null : counts}
    {body}
  </Page>
}
