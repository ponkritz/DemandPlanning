import { useMemo, useState } from 'react'
import { OlderCopies } from '../components/OlderCopies'
import { useUnsavedEdit } from '../pageEdits'
import { recordJob } from '../backgroundJobs'
import { DataTable, type DataColumn } from '../components/DataTable'
import { BlockDialog, BlockPanel, KpiTile } from '../components/DashboardBlocks'
import { MultiSelect } from '../components/MultiSelect'
import { ChartGrid, SizeDialog, SizeFields } from '../components/ChartSize'
import { ViewActions } from '../components/ViewActions'
import { blockChartId, factoryOf, parseGridBox, sizeFromOptions, sizeText, withGridBox, withSizeOptions, type ChartSize, type GridBox } from '../chartSize'
import { matchRowHeights, packLayout, resizePanel, rowOf, type Layout } from '../chartGrid'
import { useChartSizes } from '../useChartSize'
import { EmptyState, Metrics, Modal, Notice, Page, Panel, SaveQueueStatus, WriteBlocked } from '../components/ui'
import { narrowPeriod, offeredMonths, offeredQuarters, periodMonths, periodOf, periodQuarters, periodYears, type Period } from '../dashboard'
import { utcToday } from '../businessTime'
import { noData, blankBlock, blockDataset, blockTypeLabel, copyBlock, dashId, dataSources, filterColumns, hoursSource, maxBlocks, maxTabs, maxViewerFilters, missingDataset, moveBlock, narrowRows, pageOfSource, removeBlock, setTabsAndFilters, sourceName, tabsError, upsertBlock, viewerKey, type DashboardBlock, type DashboardTab, type Dataset, type ViewerFilter } from '../dashboardPages'
import { hoursFor, hoursLinesCached } from '../dashboardHours'
import { timeWritingMonth } from '../azureInsights'
import type { CapacitySettings } from '../capacity'
import type { AzureWorkItem } from '../domain'
import { outcomeText } from '../gitSaveQueue'
import { canBuildDashboard, deleteReason, findGroup, gitReasonOf, hideReason, isDashboard, isHidden, pageMenuReason, placementOf, removePlacement, setHidden, type Viewer } from '../menuLayout'
import { PublishDialog } from '../components/PublishDialog'
import { prepareDashboard, useSchedules, type PublishAuthorization } from '../publishRun'
import { publishKey } from '../publishSchedule'
import { formatDateTime } from '../format'
import { cleanOptions, hasOptions, insightKindOf as kindOf, renamePage, type OnDemandPage, withoutHidden } from '../onDemand'
import { noneKey, noneLabel } from '../onDemandInsights'
import { useWriteBlock } from '../useCan'
import { changeOtherDashboard, useDashboardPage } from '../useDashboardPage'
import type { GitStorage } from '../useGitStorage'
import type { MenuLayoutStore } from '../useMenuLayout'
import type { OnDemandStore } from '../useOnDemand'
import type { PersonalViewsStore } from '../usePersonalViews'
import { PageViewForEveryone } from '../components/ViewForEveryone'
import { PageNameDialog } from './OnDemandPage'
import { ExportNoteContext, sampleExportNote } from '../exportNote'
import { PdfExport, type PrintItem } from '../components/PrintView'
import { AddAzureQueryDialog, RemoveAzureQueryDialog, type QueryConnection } from '../components/AzureQueryDialogs'
import { maxQueryRefs, queryOfSource } from '../azureQueryRef'
import { isConnectionSource, missingConnection } from '../azureQuerySources'
import { useAzureQueries } from '../useAzureQueries'
import type { AzureConnectionProfileSummary } from '../azureCredentials'

// DSH-01…DSH-12 An On-Demand Dashboard page (page builder, PGB-01): read only for everyone, built by its owners from
// blocks over the rows of table pages. Top to bottom (UI-STANDARDS §1, §7, §9): the filter row (Year /
// Quarter / Month as in Team overview, the owners' filters, Reset filters), the KPI tiles (each opens its tab), the tabs
// and the chart and table panels of the chosen tab. The viewer's tab, period and filters are remembered per person
// (personal views, MYD-08; else this browser). The builders — the role right "Build On-Demand Dashboards" (CON-107) or a
// co-owner of the page or its group — add, edit, reorder, copy (DSH-15) and remove blocks, tabs and filters, each saved
// to Git at once (dashboards/<page-id>.json, GIT-17), the result in Background jobs (§8); for everyone else those buttons are disabled with the reason (CON-102).

interface Viewed { tab: string; period: Period; choices: Record<string, string[]> }
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const localKey = (id: string) => `demand-planning-dashboard-page-view-v1:${id}`
// DSH-07: nothing ticked — Year is the current year (OV-16), Quarter and Month every one of it.
const defaultPeriod = (): Period => ({ years: [], quarters: [], months: [] })
function readViewed(id: string, stored: unknown): Viewed {
  const fallback: Viewed = { tab: '', period: defaultPeriod(), choices: {} }
  try {
    const saved = (stored && typeof stored === 'object' ? stored : JSON.parse(localStorage.getItem(localKey(id)) ?? 'null')) as Partial<Viewed> | null
    if (!saved) return fallback
    const choices = saved.choices && typeof saved.choices === 'object' ? Object.fromEntries(Object.entries(saved.choices).filter(([key, value]) => /^[\w-]{1,40}$/.test(key) && Array.isArray(value)).map(([key, value]) => [key, (value as unknown[]).filter((entry): entry is string => typeof entry === 'string').slice(0, 200)])) : {}
    return { tab: typeof saved.tab === 'string' ? saved.tab.slice(0, 40) : '', period: periodOf(saved.period, fallback.period), choices }
  } catch { return fallback }
}

// DSH-16: hours — the Time Writing data and the capacity settings Team overview counts with, and whether the viewer may
// see Team overview (the menu area "Team insights").
export interface DashboardHours { items: AzureWorkItem[]; settings: CapacitySettings; allowed: boolean }
// OND-90: publisherName — the name a published interactive HTML file says it was published by.
// TVL-15: embedded — the dashboard shown as an owners' tab of Tool Validations (no page frame, nothing of the menu).
// TVL-18: tools — the Tool Validations master list and expiry list offered as data sources (their datasets, built by
// the caller with the viewer's read rights); absent: not offered.
// DSH-17…DSH-23: azure — the Azure DevOps queries as data sources: the app's own queries (connections, built with the
// viewer's rights for the keys wanted), the connections and servers a builder may add a saved query from, and whether
// the viewer is viewing as someone else (no reads with their PAT then).
export interface DashboardAzure { connections: (wanted: (key: string) => boolean) => Dataset[]; profiles: AzureConnectionProfileSummary[]; queryConnections: QueryConnection[]; servers: string[]; viewingAs: boolean }
export function CustomDashboardPage({ git, store, pageId, menu, viewer, views, onOpen, addPageReason = '', onAddPage, hours, publisherName = '', publisher, embedded = false, tools = [], azure }: { git: GitStorage; store: OnDemandStore; pageId: string; menu: MenuLayoutStore; viewer: Viewer; views?: PersonalViewsStore; onOpen: (id: string) => void; addPageReason?: string; onAddPage: () => void; hours?: DashboardHours; publisherName?: string; publisher: PublishAuthorization; embedded?: boolean; tools?: Dataset[]; azure?: DashboardAzure }) {
  const page = store.pages.find((entry) => entry.id === pageId)
  const dash = useDashboardPage(git, pageId)
  const dashboard = dash.dashboard
  const block = useWriteBlock()
  const currentYear = Number(utcToday().slice(0, 4))
  const [viewed, setViewed] = useState<Viewed>(() => readViewed(pageId, views?.filter(viewerKey(pageId), (value) => value)))
  const update = (next: Partial<Viewed>) => setViewed((current) => { const value = { ...current, ...next }; try { localStorage.setItem(localKey(pageId), JSON.stringify(value)) } catch { /* convenience only */ } views?.setFilter(viewerKey(pageId), value); return value })
  const [editing, setEditing] = useState<{ block: DashboardBlock; isNew: boolean } | null>(null)
  const [arranging, setArranging] = useState(false)
  const [arrangingSizes, setArrangingSizes] = useState(false)
  const [sizing, setSizing] = useState<DashboardBlock | null>(null)
  const [removing, setRemoving] = useState<DashboardBlock | null>(null)
  const [copying, setCopying] = useState<DashboardBlock | null>(null)
  // OND-68: Export PDF… (the page's ⋯).
  const [exporting, setExporting] = useState(false)
  // OND-90, OND-92: Publish interactive HTML… (the page's ⋯) and the dashboard's schedule on this computer (OND-79).
  const [publishing, setPublishing] = useState<string | null>(null)
  const publishScope = publishKey(publisher.repository, publisher.publisher, pageId)
  const schedules = useSchedules()
  const schedule = publishScope ? schedules[publishScope] : undefined
  const sizes = useChartSizes()
  const [setup, setSetup] = useState(false)
  const [pageDialog, setPageDialog] = useState<'rename' | 'remove' | null>(null)
  // DSH-18: Add Azure query… / Remove Azure query… (builders).
  const [queryDialog, setQueryDialog] = useState<'add' | 'remove' | null>(null)
  const [error, setError] = useState('')
  // GIT-18: an open block editor, tabs and filters pop-up or rename: Load the newer data asks first.
  useUnsavedEdit(editing ? `the block you are editing on ${page?.name ?? 'this dashboard'}` : setup ? `the tabs and filters you are setting up on ${page?.name ?? 'this dashboard'}` : pageDialog === 'rename' ? `the new name of ${page?.name ?? 'this dashboard'}` : false)

  // DSH-09, CON-107: rights. Building the dashboard: "Build On-Demand Dashboards" or a co-owner of the page or its group;
  // renaming and removing it: the page builder's.
  const gitReason = gitReasonOf(git)
  const builds = canBuildDashboard(viewer, menu.layout, pageId)
  const buildNote = builds ? '' : block.noteFor('on this dashboard', 'dashboards.build')
  const buildReason = gitReason || buildNote || (dash.loaded || !git.connected ? '' : 'Reading the dashboard from Git…')
  const menuReason = gitReason || pageMenuReason(viewer, menu.layout, pageId)
  // PGB-19, PGB-20: hide / show (owners) and delete (Tool Owner only), as on the table pages.
  const hidingReason = gitReason || hideReason(viewer, menu.layout, pageId)
  const removeReason = gitReason || deleteReason(viewer)
  const hidden = isHidden(menu.layout, pageId)
  const toggleHidden = () => { const next = !hidden; void menu.save(setHidden(menu.layout, pageId, next, store.pages.map((entry) => entry.id)), `Pages & menu: ${next ? 'hide' : 'show'} the page ${page?.name ?? pageId}`).then((saved) => recordJob(`pages:${pageId}`, `${next ? 'Hide' : 'Show'} page · ${page?.name ?? pageId}`, { text: `${outcomeText(saved)} ${menu.path}` }), (failure: unknown) => recordJob(`pages:${pageId}`, `${next ? 'Hide' : 'Show'} page · ${page?.name ?? pageId}`, { text: failure instanceof Error ? failure.message : String(failure), failed: true })) }

  // DSH-07: the period — Year → Quarter → Month as in Team overview (OV-15, OV-16): nothing ticked in Year is the current year.
  const months = periodMonths(viewed.period, currentYear)
  const countingYears = periodYears(viewed.period, currentYear)
  const several = countingYears.length > 1
  const setPeriod = (period: Period) => update({ period: narrowPeriod(period, currentYear) })

  // DSH-03: the data sources — every table page as saved in Git (not a dashboard, not this page).
  // OND-39: a dashboard reads the table pages without their hidden rows.
  const visibleStored = (id: string) => { const found = store.stored(id); return found ? withoutHidden(found) : null }
  const tablePages = store.pages.filter((entry) => entry.id !== pageId && !isDashboard(menu.layout, entry.id)).map((entry) => visibleStored(entry.id) ?? entry)
  // DSH-16: the Time Writing hours, after the table pages — worked out (Team overview's figures over the period's months)
  // only while a block, a filter or an open pop-up uses them; "Not available for your role." without Team overview.
  const usesHours = dashboard.blocks.some((entry) => entry.source === hoursSource) || dashboard.filters.some((filter) => filter.source === hoursSource) || Boolean(editing) || setup
  const hoursItems = hours?.items, hoursSettings = hours?.settings, hoursAllowed = Boolean(hours?.allowed), monthsKey = months.join(',')
  const today = utcToday(), counting = hoursAllowed && usesHours
  const lines = counting && hoursItems && hoursSettings ? hoursLinesCached(hoursItems, monthsKey ? monthsKey.split(',') : [], today, hoursSettings) : []
  const hoursDataset = hoursFor(hoursAllowed, lines)
  // DSH-17, DSH-19: the Azure DevOps queries — the app's own (from its fetched data) and the dashboard's saved queries (read
  // with the viewer's PAT) — rows worked out and read only for those a block or a filter uses, all while a pop-up is open.
  const usedSources = [...new Set([...dashboard.blocks.map((entry) => entry.source), ...dashboard.filters.map((filter) => filter.source)])].sort().join(',')
  const wantAll = Boolean(editing) || setup
  const wantSource = (key: string) => wantAll || usedSources.split(',').includes(key)
  const connectionsOf = azure?.connections
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const connectionList = useMemo(() => connectionsOf ? connectionsOf(wantSource) : [], [connectionsOf, usedSources, wantAll])
  const queries = dashboard.queries ?? []
  const azureQueries = useAzureQueries(queries, wantSource, { profiles: azure?.profiles ?? [], viewingAs: azure?.viewingAs })
  const datasets = [...dataSources(store.pages, visibleStored, (id) => isDashboard(menu.layout, id), pageId), ...(hours ? [hoursDataset] : []), ...tools, ...connectionList, ...azureQueries.datasets]
  // OND-65: the table pages read by a block or a filter that the viewer shows in Sample (their sample rows are used).
  const usedPages = new Set([...dashboard.blocks.map((entry) => pageOfSource(entry.source)), ...dashboard.filters.map((filter) => pageOfSource(filter.source))])
  const sampleSources = store.pages.filter((entry) => entry.sample && usedPages.has(entry.id)).map((entry) => entry.name)
  const datasetOf = (source: string) => datasets.find((entry) => entry.key === source) ?? (isConnectionSource(source) ? missingConnection(source) : queryOfSource(source) ? { ...missingDataset(source, 'This Azure DevOps query is no longer a data source of this dashboard (removed with Remove Azure query…).'), name: 'Azure DevOps query' } : missingDataset(source, `The table page “${pageOfSource(source)}” is no longer there (removed), or you cannot see it.`))
  const usesQueries = dashboard.blocks.some((entry) => queryOfSource(entry.source))
  const narrow = (dataset: Dataset, entry: DashboardBlock) => dataset.problem ? null : narrowRows(dataset, entry, months, dashboard.filters, viewed.choices)

  // Years offered: those in the dates the blocks filter on, this year and any chosen.
  const found = new Set<number>([currentYear, ...viewed.period.years])
  for (const entry of dashboard.blocks) {
    const source = tablePages.find((candidate) => `page:${candidate.id}` === entry.source)
    if (!source || !entry.period) continue
    for (const row of source.rows) { const value = row.cells[entry.period]; const year = typeof value === 'string' ? Number(value.slice(0, 4)) : NaN; if (year > 2000 && year < 2100) found.add(year) }
  }
  if (usesHours && hoursAllowed) for (const item of hoursItems ?? []) { const year = Number(timeWritingMonth(item.title)?.slice(0, 4)); if (year > 2000 && year < 2100) found.add(year) }
  const years = [...found].sort((a, b) => a - b)

  const tabs = dashboard.tabs
  const activeTab = tabs.find((tab) => tab.id === viewed.tab) ?? tabs[0]
  const onTab = (entry: DashboardBlock) => !tabs.length || (entry.tab && tabs.some((tab) => tab.id === entry.tab) ? entry.tab : tabs[0].id) === activeTab?.id
  const tiles = dashboard.blocks.filter((entry) => entry.type === 'kpi')
  const panels = dashboard.blocks.filter((entry) => entry.type !== 'kpi' && onTab(entry))
  const filtered = Boolean(Object.values(viewed.choices).some((value) => value.length)) || JSON.stringify(viewed.period) !== JSON.stringify(defaultPeriod())
  const placement = placementOf(menu.layout, pageId)
  const group = findGroup(menu.layout, placement.group)
  // OND-68, OND-70: every KPI tile and block of every tab for the PDF, with the viewer's period and filters or with the
  // dashboard's defaults (the current year, no filter), drawn by the same components (no ⋯, no resize handle).
  const scopeLine = (period: Period, choices: Record<string, string[]>) => { const list = periodMonths(period, currentYear), years = periodYears(period, currentYear); return `Period: ${list.length === years.length * 12 ? `${years.join(', ')} (whole ${years.length > 1 ? 'years' : 'year'})` : list.map((month) => `${monthNames[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`).join(', ')}${Object.values(choices).some((value) => value.length) ? ` · ${dashboard.filters.filter((filter) => choices[filter.id]?.length).map((filter) => { const dataset = datasetOf(filter.source); return `${dataset.page.columns.find((column) => column.id === filter.column)?.name ?? '?'}: ${choices[filter.id].map((value) => value || noneLabel).join(', ')}` }).join(' · ')}` : ''}.` }
  const printItems = (): PrintItem[] => dashboard.blocks.map((entry) => {
    const card = entry.type === 'kpi', size = sizeOf(entry).size
    const tab = card || !tabs.length ? undefined : (tabs.find((candidate) => candidate.id === entry.tab) ?? tabs[0]).name
    return { id: entry.id, title: entry.title, card, size, group: tab, render: (filters: boolean) => {
      const dataset = blockDataset(datasetOf(entry.source), entry)
      const narrowed = dataset.problem ? null : filters ? narrow(dataset, entry) : narrowRows(dataset, entry, periodMonths(defaultPeriod(), currentYear), dashboard.filters, {})
      return card ? <KpiTile dataset={dataset} block={entry} narrowed={narrowed} /> : <BlockPanel dataset={dataset} block={entry} narrowed={narrowed} colors={dashboard.colors} size={size} />
    } }
  })
  const owners = [...new Set([...placement.owners, ...(group?.acceptsPages ? group.owners : [])])]
  // OND-90, OND-75: publishing the dashboard as an interactive HTML file — the Tool Owner and the page's (or its group's)
  // co-owners; never while a table page it reads is shown in Sample.
  const publishReason = publisher.reason(pageId) || (page && sampleSources.length ? `Switch ${sampleSources.join(', ')} to Live to publish ${page.name}: sample rows are never published.` : '')

  async function saveDashboard(next: typeof dashboard, label: string, message: string) {
    setError('')
    try {
      const saved = await dash.save(next, message)
      recordJob(`dashboard:${pageId}`, `${label} · ${page?.name ?? pageId}`, { text: `${outcomeText(saved)} ${dash.path}${saved.commitUrl ? ` — ${saved.commitUrl}` : ''}` })
    } catch (failure) {
      const text = failure instanceof Error ? failure.message : String(failure)
      setError(text); recordJob(`dashboard:${pageId}`, `${label} · ${page?.name ?? pageId}`, { text, failed: true })
      throw failure
    }
  }
  const run = (action: () => Promise<void>) => { void action().catch(() => undefined) }

  if (!page) return <Page embedded={embedded}><EmptyState title="This page is no longer there." detail="It was removed, or Git has not been read yet." /></Page>
  const firstSource = datasets.find((entry) => !entry.problem)
  const addBlock = () => setEditing({ block: blankBlock(firstSource!, dashId('b'), 'kpi', activeTab && activeTab.id !== tabs[0]?.id ? activeTab.id : ''), isNew: true })
  // CHT-15…CHT-18: each block's size — the viewer's own, else the owners' (the dashboard file), else half width.
  const arrange = arrangingSizes && !buildReason
  const sizeOf = (entry: DashboardBlock) => { const kind = kindOf(entry.type); const resolved = sizes.resolve(blockChartId(pageId, entry.id), factoryOf(kind), sizeFromOptions(entry.options, kind), kind); return arrange ? { ...resolved, size: resolved.base, source: 'owner' as const } : resolved }
  const saveSize = (entry: DashboardBlock, size: ChartSize) => saveDashboard(upsertBlock(dashboard, withBlockSize(entry, size)), 'Size block', `Dashboard ${page.name}: size of the ${blockTypeLabel(entry.type)} ${entry.title} (${sizeText(size, kindOf(entry.type))})`)
  // CHT-47: the builders' layout of the tab's blocks (Arrange mode) — every block's place and size, saved at once.
  const saveLayout = (layout: Layout, id: string, mode: 'resize' | 'move' | 'match') => {
    const moved = dashboard.blocks.find((entry) => entry.id === id)
    const box = layout[id]
    return saveDashboard({ ...dashboard, blocks: dashboard.blocks.map((entry) => layout[entry.id] ? withBlockBox(entry, layout[entry.id]) : entry) }, mode === 'move' ? 'Move block' : 'Size block',
      mode === 'move' ? `Dashboard ${page.name}: move the ${blockTypeLabel(moved?.type ?? 'bar')} ${moved?.title ?? id} (column ${box.x + 1}, row ${box.y + 1})` : mode === 'match' ? `Dashboard ${page.name}: match the heights in the row of ${moved?.title ?? id} (${box.h} rows)` : `Dashboard ${page.name}: size of the ${blockTypeLabel(moved?.type ?? 'bar')} ${moved?.title ?? id} (${sizeText(box, kindOf(moved?.type ?? 'bar'))})`)
  }
  // KB-89, CHT-55: the builders' layout of the tab (their sizes, not a viewer's own); Match heights in this row (Arrange
  // on the page) and Size… with "Same height as the other charts in its row" give every block starting on that row one height.
  const ownerGrid = () => packLayout(panels.map((entry) => ({ id: entry.id, kind: kindOf(entry.type), size: sizeOf(entry).base, box: parseGridBox(entry.options?.grid, kindOf(entry.type)) })))
  const rowMates = (entry: DashboardBlock) => panels.includes(entry) ? Math.max(0, rowOf(ownerGrid(), entry.id).length - 1) : 0
  const matchRow = (entry: DashboardBlock, size?: ChartSize) => saveLayout(matchRowHeights(size ? resizePanel(ownerGrid(), entry.id, size) : ownerGrid(), entry.id, size?.h), entry.id, 'match')
  // DSH-15: Copy to… — this dashboard (a duplicate) or another one the viewer may build; saved to the target's file at once
  // (queued, merged, GIT-17), the result in Background jobs.
  const copyTargets = [{ id: pageId, name: 'This dashboard' }, ...store.pages.filter((entry) => entry.id !== pageId && isDashboard(menu.layout, entry.id) && canBuildDashboard(viewer, menu.layout, entry.id)).map((entry) => ({ id: entry.id, name: entry.name })).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))]
  async function copyTo(entry: DashboardBlock, targetId: string) {
    const label = `Copy block · ${entry.title}`
    if (targetId === pageId) {
      const copied = copyBlock(dashboard, entry, tabs, dashId('b'), page!.name, true)
      await saveDashboard(copied.dashboard, 'Copy block', `Dashboard ${page!.name}: copy the ${blockTypeLabel(entry.type)} ${entry.title}`)
      return
    }
    const target = store.pages.find((other) => other.id === targetId)
    const name = target?.name ?? targetId
    let note = ''
    try {
      const saved = await changeOtherDashboard(git, targetId, (current) => { const copied = copyBlock(current, entry, tabs, dashId('b'), name, false, queries); note = copied.note; return copied.dashboard }, `Dashboard ${name}: copy the ${blockTypeLabel(entry.type)} ${entry.title} from ${page!.name}`)
      recordJob(`dashboard:${targetId}`, `${label} → ${name}`, { text: `${outcomeText(saved)} dashboards/${targetId}.json${note ? ` ${note}` : ''}${saved.commitUrl ? ` — ${saved.commitUrl}` : ''}` })
    } catch (failure) {
      recordJob(`dashboard:${targetId}`, `${label} → ${name}`, { text: failure instanceof Error ? failure.message : String(failure), failed: true })
      throw failure
    }
  }
  const addReason = buildReason || (dashboard.blocks.length >= maxBlocks ? `A dashboard holds at most ${maxBlocks} blocks: remove one first.` : '') || (firstSource ? '' : 'There is no data source yet: add a table page with rows first.')

  return <ExportNoteContext.Provider value={sampleSources.length ? sampleExportNote : null}><Page className="dashboard-page" embedded={embedded} intro={embedded ? page.description || undefined : page.description || 'An On-Demand Dashboard of KPI tiles, charts and summary tables — read only, the same for everyone.'}
    // DSH-13: one main action — ＋ Add block… for the dashboard's builders, else ＋ Add page… for those who may add
    // pages — and the rest in the page's ⋯ menu, each disabled item with its reason as its tooltip.
    actions={<ViewActions label={`page ${page.name}`} primary={!buildReason
      ? <button type="button" className="primary" disabled={Boolean(addReason)} title={addReason || undefined} onClick={addBlock}>＋ Add block…</button>
      : !(embedded || gitReason || addPageReason) ? <button type="button" className="ghost" onClick={onAddPage}>＋ Add page…</button> : undefined} items={[
      ...(buildReason ? [{ key: 'add-block', label: '＋ Add block…', disabled: true, title: addReason }] : []),
      { key: 'arrange', label: 'Arrange blocks…', disabled: Boolean(buildReason), title: buildReason || undefined, onClick: () => setArranging(true) },
      { key: 'sizes', label: arrangingSizes ? 'Done arranging' : 'Arrange on the page', disabled: Boolean(buildReason), title: buildReason || 'Drag a block by ⠿ to move it, or its corner to size it, for everyone', onClick: () => setArrangingSizes(!arrangingSizes) },
      { key: 'setup', label: 'Tabs and filters…', disabled: Boolean(buildReason), title: buildReason || undefined, onClick: () => setSetup(true) },
      // DSH-18: the dashboard's saved Azure queries (builders; disabled with the reason for everyone else).
      ...(azure ? [{ key: 'add-query', label: '＋ Add Azure query…', disabled: Boolean(buildReason) || queries.length >= maxQueryRefs, title: buildReason || (queries.length >= maxQueryRefs ? `A dashboard reads at most ${maxQueryRefs} Azure queries: remove one first.` : undefined), onClick: () => setQueryDialog('add') }] : []),
      ...(queries.length ? [{ key: 'remove-query', label: 'Remove Azure query…', disabled: Boolean(buildReason), title: buildReason || undefined, onClick: () => setQueryDialog('remove') }] : []),
      ...(embedded ? [] : [
        ...(!buildReason || gitReason || addPageReason ? [{ key: 'add-page', label: '＋ Add page…', disabled: Boolean(gitReason || addPageReason), title: gitReason || addPageReason || undefined, onClick: onAddPage }] : []),
        { key: 'rename', label: 'Rename page…', disabled: Boolean(menuReason), title: menuReason || undefined, onClick: () => setPageDialog('rename') },
        { key: 'hide', label: hidden ? 'Show page' : 'Hide page', disabled: Boolean(hidingReason), title: hidingReason || undefined, onClick: toggleHidden },
        { key: 'delete', label: 'Delete page…', danger: true, disabled: Boolean(removeReason), title: removeReason || undefined, onClick: () => setPageDialog('remove') },
      ]),
      { key: 'pdf', label: 'Export PDF…', disabled: !dashboard.blocks.length, title: dashboard.blocks.length ? undefined : 'No blocks to export yet.', onClick: () => setExporting(true) },
      { key: 'publish', label: 'Publish interactive HTML…', disabled: Boolean(publishReason) || !dashboard.blocks.length, title: publishReason || (dashboard.blocks.length ? undefined : 'No blocks to publish yet.'), onClick: () => setPublishing(publishScope) },
      ...(git.connected ? [{ key: 'reload', label: '↻ Reload from Git', onClick: () => { void dash.reload(); void store.reload() } }] : []),
      // DSH-22: the saved Azure queries read again with the viewer's PAT (they are read when the dashboard opens; no polling).
      ...(usesQueries ? [{ key: 'refresh-queries', label: azureQueries.reading ? '↻ Reading Azure queries…' : '↻ Refresh Azure queries', disabled: azureQueries.reading, title: azureQueries.reading ? 'The Azure queries are being read.' : 'Read the dashboard’s Azure queries again from Azure DevOps with your PAT.', onClick: azureQueries.refresh }] : []),
    ]} />}>
    {gitReason && <Notice tone={git.isSample ? 'warning' : 'info'}>{gitReason}{!git.connected ? ' The dashboard last loaded in this browser is shown.' : ''}</Notice>}
    {!gitReason && <WriteBlocked reason={buildNote} />}
    {dash.error && <Notice tone="error">Dashboard: {dash.error} The dashboard last read is kept.</Notice>}
    {dash.dropped.length > 0 && <Notice tone="warning">Dashboard: {dash.path} — {dash.dropped.join(' ')}</Notice>}
    <OlderCopies store={store} git={git} viewer={viewer} id={page.id} name={page.name} />
    {store.errors.map((entry) => <Notice key={entry} tone="error">On-Demand: {entry}</Notice>)}
    {/* OND-65: a block over a table page the viewer shows in Sample draws its sample rows; the page says so. */}
    {sampleSources.length > 0 && <Notice tone="warning" className="od-sample-banner"><strong>Sample data — nothing is saved.</strong> {sampleSources.join(', ')} {sampleSources.length === 1 ? 'is' : 'are'} set to Sample by you: the blocks over {sampleSources.length === 1 ? 'it' : 'them'} show made-up rows. Choose Live on {sampleSources.length === 1 ? 'that page' : 'those pages'} to see the real figures.</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    {/* OND-79: a failed scheduled publish of this dashboard, with the way to put it right. */}
    {schedule && schedule.mode !== 'off' && schedule.lastOk === false && <Notice tone="warning" className="od-publish-failed">The scheduled publish of {page.name}{schedule.lastRun ? ` at ${formatDateTime(schedule.lastRun)}` : ''} failed: {schedule.lastText} {!publishReason && <button type="button" className="ghost" onClick={() => setPublishing(publishScope)}>Publish interactive HTML…</button>}</Notice>}
    <SaveQueueStatus state={dash.queue} onRetry={() => void dash.retry()} />

    {/* DSH-13: the filter row on one line, its status at the end. */}
    <div className="ins-bar"><div className="dash-filters compact-filters" role="group" aria-label="Dashboard filters">
      <MultiSelect label="Year" emptyLabel={String(currentYear)} options={years.map((year) => [String(year), String(year)])} value={viewed.period.years.map(String)} onChange={(value) => setPeriod({ ...viewed.period, years: value.map(Number) })} />
      <MultiSelect label="Quarter" options={offeredQuarters(countingYears).map((quarter) => [quarter, several ? `Q${quarter.slice(6)} ${quarter.slice(0, 4)}` : `Q${quarter.slice(6)}`])} value={viewed.period.quarters} onChange={(value) => setPeriod({ ...viewed.period, quarters: value })} />
      <MultiSelect label="Month" options={offeredMonths(periodQuarters(viewed.period, currentYear)).map((entry) => [entry, several ? `${monthNames[Number(entry.slice(5)) - 1]} ${entry.slice(0, 4)}` : monthNames[Number(entry.slice(5)) - 1]])} value={viewed.period.months} onChange={(value) => setPeriod({ ...viewed.period, months: value })} />
      {dashboard.filters.map((filter) => {
        const dataset = datasetOf(filter.source), column = dataset.page.columns.find((entry) => entry.id === filter.column)
        const label = column ? column.name : '(removed column)'
        return <MultiSelect key={filter.id} label={dashboard.filters.filter((other) => other.column === filter.column && other.source !== filter.source).length ? `${label} (${dataset.name})` : label}
          options={column && hasOptions(column.type) ? [...column.options, noneKey].map((option) => [option, option || noneLabel]) : []} value={viewed.choices[filter.id] ?? []}
          disabled={!column || Boolean(dataset.problem)} title={dataset.problem || (column ? undefined : 'The column is no longer in the data source.')}
          onChange={(value) => update({ choices: { ...viewed.choices, [filter.id]: value } })} />
      })}
      <button type="button" className="text-button" disabled={!filtered} onClick={() => update({ period: defaultPeriod(), choices: {} })}>Reset filters</button>
    </div>
    {/* UI-23: the period, filters and tab as the view for everyone (Tool Owner). */}
    <PageViewForEveryone entryKey={viewerKey(pageId)} what={`${page.name} period, filters and tab`} value={viewed} onUse={(value) => setViewed(readViewed(pageId, value))} />
    <p className="muted dsh-scope" role="status">Period: {months.length === countingYears.length * 12 ? `${countingYears.join(', ')} (whole ${several ? 'years' : 'year'})` : months.map((month) => `${monthNames[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`).join(', ')}{Object.values(viewed.choices).some((value) => value.length) ? ' · filtered' : ''}.</p></div>

    {!dashboard.blocks.length ? <Panel eyebrow={(group?.name ?? 'On-Demand').toUpperCase()} title={page.name} info={<DashboardInfo path={dash.path} history={dash.history} owners={owners} />}>
      <EmptyState title="No blocks yet." detail={buildReason ? 'The dashboard’s owners add KPI tiles, charts and summary tables.' : 'Add the first one with ＋ Add block…: a KPI tile, a bar, line or pie chart, or a summary table over a table page.'} />
    </Panel> : <>
      {tiles.length > 0 && <Metrics>{tiles.map((entry) => { const dataset = blockDataset(datasetOf(entry.source), entry); const target = tabs.length ? tabs.find((tab) => tab.id === entry.tab) ?? tabs[0] : undefined; return <KpiTile key={entry.id} dataset={dataset} block={entry} narrowed={narrow(dataset, entry)} tabName={target?.name} onOpenTab={target ? () => update({ tab: target.id }) : undefined} /> })}</Metrics>}
      {tabs.length > 0 && <div className="overview-tabs dsh-tabs" role="tablist" aria-label="Dashboard tabs">{tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={tab.id === activeTab?.id} className={`backlog-tab ${tab.id === activeTab?.id ? 'backlog-tab-active' : ''}`} onClick={() => update({ tab: tab.id })}>{tab.name}</button>)}</div>}
      {arrange && <p className="muted chart-arrange-note" role="status">Arranging the blocks for everyone on the 12-column grid: drag a block by ⠿ to move it (the others make room) and its bottom-right corner to size it — or focus ⠿ or the corner and use the arrow keys (Shift + arrows on the corner move it), Enter to keep. Each change is saved to Git at once. <button type="button" className="text-button" onClick={() => setArrangingSizes(false)}>Done arranging</button></p>}
      {panels.length > 0 && <ChartGrid className="od-insights dsh-panels" role={tabs.length ? 'tabpanel' : undefined} arranging={arrange} canMove={!buildReason}
        entries={panels.map((entry) => ({ id: entry.id, kind: kindOf(entry.type), size: sizeOf(entry).size, box: parseGridBox(entry.options?.grid, kindOf(entry.type)) }))} titleOf={(id) => dashboard.blocks.find((entry) => entry.id === id)?.title ?? id}
        onResize={(id, next) => { const entry = dashboard.blocks.find((block) => block.id === id); if (entry) sizes.setOwn(blockChartId(pageId, id), next, sizeOf(entry).base, kindOf(entry.type)) }}
        onLayout={(layout, _changed, id, mode) => run(() => saveLayout(layout, id, mode))}>
        {panels.map((entry) => { const dataset = blockDataset(datasetOf(entry.source), entry); const { size, source, base } = sizeOf(entry); const id = blockChartId(pageId, entry.id); const at = dashboard.blocks.indexOf(entry)
          return <BlockPanel key={entry.id} id={entry.id} dataset={dataset} block={entry} narrowed={narrow(dataset, entry)} colors={dashboard.colors} size={size} source={source} arranging={arrange}
            onResize={(next) => arrange ? run(() => saveSize(entry, next)) : sizes.setOwn(id, next, base, kindOf(entry.type))} onReset={arrange ? undefined : () => sizes.setOwn(id, undefined)}
            action={buildReason ? undefined : <ViewActions label={entry.title} items={[
              { key: 'up', label: 'Move up', disabled: at === 0, onClick: () => run(() => saveDashboard(moveBlock(dashboard, entry.id, -1), 'Move block', `Dashboard ${page.name}: move ${entry.title} up`)) },
              { key: 'down', label: 'Move down', disabled: at === dashboard.blocks.length - 1, onClick: () => run(() => saveDashboard(moveBlock(dashboard, entry.id, 1), 'Move block', `Dashboard ${page.name}: move ${entry.title} down`)) },
              { key: 'edit', label: 'Edit…', onClick: () => setEditing({ block: entry, isNew: false }) },
              { key: 'size', label: 'Size…', onClick: () => setSizing(entry) },
              ...(arrange ? [{ key: 'match', label: 'Match heights in this row', disabled: !rowMates(entry), title: rowMates(entry) ? undefined : 'No other block starts on its row.', onClick: () => run(() => matchRow(entry)) }] : []),
              { key: 'copy', label: 'Copy to…', onClick: () => setCopying(entry) },
              { key: 'remove', label: 'Remove…', danger: true, onClick: () => setRemoving(entry) },
            ]} />} /> })}
      </ChartGrid>}
      {!panels.length && <EmptyState title={tabs.length ? `No charts or tables on ${activeTab?.name}.` : 'No charts or tables yet.'} detail={tiles.length ? undefined : noData.detail} />}
      <Panel className="dsh-about" eyebrow={(group?.name ?? 'On-Demand').toUpperCase()} title="About this dashboard" detail={`${dashboard.blocks.length} block${dashboard.blocks.length === 1 ? '' : 's'}${tabs.length ? ` on ${tabs.length} tab${tabs.length === 1 ? '' : 's'}` : ''}, read only, the same for everyone.`} info={<DashboardInfo path={dash.path} history={dash.history} owners={owners} />}><span /></Panel>
    </>}

    {editing && <BlockDialog datasets={datasets} dashboard={dashboard} block={editing.block} isNew={editing.isNew} preview={narrow} onCancel={() => setEditing(null)}
      onSave={async (entry, colors) => { const next = upsertBlock(dashboard, entry); if (colors) next.colors = colors; else delete next.colors; await saveDashboard(next, editing.isNew ? 'Add block' : 'Edit block', `Dashboard ${page.name}: ${editing.isNew ? 'add' : 'change'} the ${blockTypeLabel(entry.type)} ${entry.title}`); setEditing(null) }} />}
    {/* OND-92: Publish now cuts each data source with the period and filters on screen (the table pages as saved in Git). */}
    {publishing && publishing === publishScope && !publishReason && <PublishDialog pageId={pageId} name={page.name} publishScope={publishing} authorization={publisher} publishedBy={publisherName} cut={{ kind: 'dashboard', period: viewed.period, choices: viewed.choices }} prepare={prepareDashboard(page, dashboard, (id) => store.stored(id), { kind: 'dashboard', period: viewed.period, choices: viewed.choices }, publisherName)} onClose={() => setPublishing(null)} />}
    {exporting && page && <PdfExport eyebrow={(group?.name ?? 'On-Demand').toUpperCase()} pageName={page.name} sample={sampleSources.length > 0} items={printItems()} onClose={() => setExporting(false)} filtersLine={(filters) => filters ? scopeLine(viewed.period, viewed.choices) : `${scopeLine(defaultPeriod(), {})} Without your filters.`} />}
    {sizing && <SizeDialog eyebrow="DASHBOARD · BLOCK" title={sizing.title} kind={kindOf(sizing.type)} size={sizeOf(sizing).base} row={sizing.type === 'table' || sizing.type === 'narrative' ? 0 : rowMates(sizing)} heightReason={sizing.type === 'table' || sizing.type === 'narrative' ? 'A summary table or a narrative takes the height of its content.' : ''} onCancel={() => setSizing(null)} onSave={async (size, match) => { await (match ? matchRow(sizing, size) : saveSize(sizing, size)); setSizing(null) }} />}
    {removing && <RemoveBlockDialog block={removing} onCancel={() => setRemoving(null)} onRemove={async () => { await saveDashboard(removeBlock(dashboard, removing.id), 'Remove block', `Dashboard ${page.name}: remove the ${blockTypeLabel(removing.type)} ${removing.title}`); setRemoving(null) }} />}
    {copying && <CopyBlockDialog block={copying} targets={copyTargets} onCancel={() => setCopying(null)} onCopy={async (target) => { await copyTo(copying, target); setCopying(null) }} />}
    {arranging && <ArrangeDialog onCopy={(entry) => { setArranging(false); setCopying(entry) }} blocks={dashboard.blocks} sizeOf={(entry) => sizeOf(entry).base} onSize={(entry, size) => run(() => saveSize(entry, size))} tabs={tabs} sourceOf={(source) => sourceName(datasets, source)} onClose={() => setArranging(false)} onEdit={(entry) => { setArranging(false); setEditing({ block: entry, isNew: false }) }}
      onMove={(entry, by) => run(() => saveDashboard(moveBlock(dashboard, entry.id, by), 'Move block', `Dashboard ${page.name}: move ${entry.title} ${by < 0 ? 'up' : 'down'}`))}
      onRemove={(entry) => saveDashboard(removeBlock(dashboard, entry.id), 'Remove block', `Dashboard ${page.name}: remove the ${blockTypeLabel(entry.type)} ${entry.title}`)} />}
    {setup && <SetupDialog tabs={tabs} filters={dashboard.filters} datasets={datasets} onCancel={() => setSetup(false)}
      onSave={async (nextTabs, nextFilters) => { await saveDashboard(setTabsAndFilters(dashboard, nextTabs, nextFilters), 'Tabs and filters', `Dashboard ${page.name}: tabs and filters`); setSetup(false) }} />}
    {queryDialog === 'add' && azure && <AddAzureQueryDialog refs={queries} connections={azure.queryConnections} servers={azure.servers} profiles={azure.profiles} viewingAs={azure.viewingAs} newId={() => dashId('b').replace(/^b/, 'q')} onCancel={() => setQueryDialog(null)}
      onSave={async (ref) => { await saveDashboard({ ...dashboard, queries: [...queries, ref] }, 'Add Azure query', `Dashboard ${page.name}: add the Azure query ${ref.name} as a data source`); setQueryDialog(null) }} />}
    {queryDialog === 'remove' && <RemoveAzureQueryDialog refs={queries} blocks={dashboard.blocks} filters={dashboard.filters} onCancel={() => setQueryDialog(null)}
      onRemove={async (ref) => { const rest = queries.filter((entry) => entry.id !== ref.id); const next = { ...dashboard }; if (rest.length) next.queries = rest; else delete next.queries; await saveDashboard(next, 'Remove Azure query', `Dashboard ${page.name}: remove the Azure query ${ref.name}`); setQueryDialog(null) }} />}
    {pageDialog === 'rename' && <PageNameDialog title="Rename the page" action="Save to Git" name={page.name} description={page.description} except={`ondemand:${page.id}`} onCancel={() => setPageDialog(null)} onSave={async (name, description) => {
      const stored = store.stored(page.id) ?? page
      const saved = await store.save(renamePage(stored, name, description), `Pages & menu: rename ${stored.name} to ${name.trim()}`)
      recordJob(`pages:${page.id}`, `Rename page · ${stored.name}`, { text: `${outcomeText(saved)} ${store.filePath(page.id)}` })
      setPageDialog(null)
    }} />}
    {pageDialog === 'remove' && <RemoveDashboardDialog page={page} blocks={dashboard.blocks.length} path={dash.path} pageFile={store.filePath(page.id)} onCancel={() => setPageDialog(null)} onRemove={async () => {
      const pageFile = store.filePath(page.id)
      await store.remove(page.id, `Pages & menu: remove the dashboard ${page.name} (${dashboard.blocks.length} blocks)`)
      const removed = await git.removeDashboard(page.id, `Pages & menu: remove the dashboard ${page.name} (${dashboard.blocks.length} blocks)`)
      if (menu.layout.pages[page.id]) await menu.save(removePlacement(menu.layout, page.id), `Pages & menu: remove the page ${page.name}`)
      recordJob(`pages:${page.id}`, `Remove page · ${page.name}`, { text: `Removed ${pageFile}${removed ? ` and ${dash.path}` : ''}; the history stays in GitHub. The data sources are not changed.` })
      setPageDialog(null); const next = store.pages.find((entry) => entry.id !== page.id); if (next) onOpen(next.id)
    }} />}
  </Page></ExportNoteContext.Provider>
}

// CHT-17: a block with the owners' size written into its options (a factory value left out; a KPI tile takes none).
function withBlockSize(block: DashboardBlock, size: ChartSize): DashboardBlock {
  const kind = kindOf(block.type)
  const options = block.type === 'kpi' ? undefined : cleanOptions(block.type, block.measure, withSizeOptions(block.options, size, factoryOf(kind), false, kind))
  const out: DashboardBlock = { ...block }
  if (options) out.options = options
  else delete out.options
  return out
}

// CHT-47: a block with the builders' place on the grid (and the nearest presets for older apps).
function withBlockBox(block: DashboardBlock, box: GridBox): DashboardBlock {
  const options = block.type === 'kpi' ? block.options : cleanOptions(block.type, block.measure, withGridBox(block.options, box, kindOf(block.type)))
  const out: DashboardBlock = { ...block }
  if (options) out.options = options
  else delete out.options
  return out
}

function DashboardInfo({ path, history, owners }: { path: string; history: string; owners: string[] }) {
  return <>Read only: KPI tiles, charts and summary tables over the rows of table pages (as saved in Git). The period and the filters above apply to every block; your choice is remembered for you. The dashboard’s builders — roles allowed “Build On-Demand Dashboards” and the page’s and its group’s co-owners — add, edit, reorder, copy and remove its blocks, tabs and filters; each change is saved to Git at once as {path}, two saves at the same time merged block by block, the later one winning where both changed the same.{history && <> <a href={history} target="_blank" rel="noreferrer">History in GitHub</a></>}{owners.length > 0 && <> Co-owners: {owners.join(', ')}.</>}</>
}

// DSH-06: the blocks in order — Edit, ↑ ↓, Remove (after a pop-up that names the block); each change saved at once.
function ArrangeDialog({ blocks, sizeOf, onSize, tabs, sourceOf, onClose, onEdit, onCopy, onMove, onRemove }: { onCopy: (block: DashboardBlock) => void; blocks: DashboardBlock[]; sizeOf: (block: DashboardBlock) => ChartSize; onSize: (block: DashboardBlock, size: ChartSize) => void; tabs: DashboardTab[]; sourceOf: (source: string) => string; onClose: () => void; onEdit: (block: DashboardBlock) => void; onMove: (block: DashboardBlock, by: -1 | 1) => void; onRemove: (block: DashboardBlock) => Promise<void> }) {
  const [removing, setRemoving] = useState<DashboardBlock | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const columns: DataColumn<DashboardBlock>[] = [
    { id: 'dsh-order', label: 'Order', align: 'right', sortable: false, value: (entry) => blocks.indexOf(entry) + 1 },
    { id: 'dsh-title', label: 'Block', sortable: false, value: (entry) => entry.title, render: (entry) => <strong>{entry.title}</strong> },
    { id: 'dsh-type', label: 'Type', sortable: false, value: (entry) => blockTypeLabel(entry.type) },
    { id: 'dsh-source', label: 'Data source', sortable: false, value: (entry) => sourceOf(entry.source) },
    ...(tabs.length ? [{ id: 'dsh-tab', label: 'Tab', sortable: false, value: (entry: DashboardBlock) => (tabs.find((tab) => tab.id === entry.tab) ?? tabs[0]).name }] : []),
    // CHT-17: each chart's or table's size for everyone (a KPI tile sits in the tile row).
    { id: 'dsh-size', label: 'Size', sortable: false, value: (entry) => entry.type === 'kpi' ? '' : sizeText(sizeOf(entry), kindOf(entry.type)), render: (entry) => entry.type === 'kpi' ? <span className="muted">Tile row</span> : <SizeFields size={sizeOf(entry)} kind={kindOf(entry.type)} label={entry.title} heightReason={entry.type === 'table' || entry.type === 'narrative' ? 'A summary table or a narrative takes the height of its content.' : ''} onChange={(size) => onSize(entry, size)} /> },
    { id: '@actions', label: 'Actions', sortable: false, export: false, render: (entry) => { const at = blocks.indexOf(entry); return <span className="button-row nowrap">
      <button type="button" className="ghost" aria-label={`Edit ${entry.title}`} onClick={() => onEdit(entry)}>Edit</button>
      <button type="button" className="ghost" aria-label={`Copy ${entry.title} to…`} onClick={() => onCopy(entry)}>Copy to…</button>
      <button type="button" className="ghost" disabled={at === 0} aria-label={`Move ${entry.title} up`} onClick={() => onMove(entry, -1)}>↑</button>
      <button type="button" className="ghost" disabled={at === blocks.length - 1} aria-label={`Move ${entry.title} down`} onClick={() => onMove(entry, 1)}>↓</button>
      <button type="button" className="text-button danger-text" aria-label={`Remove ${entry.title}`} onClick={() => setRemoving(entry)}>Remove</button>
    </span> } },
  ]
  return <>
    <Modal eyebrow="DASHBOARD · BLOCKS" title="Arrange the blocks" wide form={false} onClose={onClose}>
      <p className="muted">KPI tiles are shown in this order above the tabs, charts and tables in this order on their tab, each at its width and height (everyone’s; a viewer may still resize a chart for themselves). Each change is saved to Git at once.</p>
      <DataTable id="dashboard-blocks" columns={columns} rows={blocks} rowKey={(entry) => entry.id} status={`${blocks.length} of ${maxBlocks} blocks`} empty={<EmptyState title="No blocks yet." detail="Add one with ＋ Add block…" />} />
      <div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Close</button></div>
    </Modal>
    {removing && <Modal eyebrow="DASHBOARD · BLOCKS" title="Remove the block" onClose={() => { if (!busy) setRemoving(null) }}>
      <form onSubmit={(event) => { event.preventDefault(); setBusy(true); setError(''); void onRemove(removing).then(() => { setBusy(false); setRemoving(null) }, (failure: unknown) => { setBusy(false); setError(failure instanceof Error ? failure.message : String(failure)) }) }}>
        <p>Remove <strong>{removing.title}</strong> ({blockTypeLabel(removing.type)}) from the dashboard, for everyone? Its data source is not changed. It is saved to Git at once; the history stays in GitHub.</p>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={() => setRemoving(null)}>Cancel</button><button className="danger-button" disabled={busy}>{busy ? 'Removing…' : 'Remove block'}</button></div>
      </form>
    </Modal>}
  </>
}

// DSH-06, DSH-07: the dashboard's tabs (names, order) and the filter row's filters (a Dropdown / Multi-select column of a
// data source each), saved together.
function SetupDialog({ tabs, filters, datasets, onCancel, onSave }: { tabs: DashboardTab[]; filters: ViewerFilter[]; datasets: Dataset[]; onCancel: () => void; onSave: (tabs: DashboardTab[], filters: ViewerFilter[]) => Promise<void> }) {
  const [draftTabs, setTabs] = useState(tabs)
  const [draftFilters, setFilters] = useState(filters)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const usable = datasets.filter((entry) => !entry.problem && filterColumns(entry.page).some((column) => hasOptions(column.type)))
  const optionColumns = (source: string) => (datasets.find((entry) => entry.key === source)?.page.columns ?? []).filter((column) => hasOptions(column.type))
  const moveTab = (index: number, by: number) => { const to = index + by; if (to < 0 || to >= draftTabs.length) return; const next = [...draftTabs];[next[index], next[to]] = [next[to], next[index]]; setTabs(next) }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const problem = tabsError(draftTabs) || (draftFilters.some((filter) => !filter.column) ? 'Choose a column for every filter, or remove it.' : '')
    if (problem) { setError(problem); return }
    setBusy(true); setError('')
    try { await onSave(draftTabs.map((tab) => ({ ...tab, name: tab.name.trim() })), draftFilters) } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) }
  }
  return <Modal eyebrow="DASHBOARD · SETUP" title="Tabs and filters" onClose={() => { if (!busy) onCancel() }}>
    <form onSubmit={(event) => void submit(event)} className="pgb-form" noValidate>
      <fieldset className="od-filters"><legend>Tabs (optional)</legend>
        <small>With tabs, each chart and table is on one tab and each KPI tile opens one; without tabs every block is shown. A removed tab’s blocks go to the first tab.</small>
        {draftTabs.map((tab, index) => <div key={tab.id} className="od-filter-head">
          <input aria-label={`Tab ${index + 1} name`} required maxLength={40} value={tab.name} onChange={(event) => { setTabs(draftTabs.map((entry) => entry.id === tab.id ? { ...entry, name: event.target.value } : entry)); setError('') }} />
          <button type="button" className="ghost" disabled={index === 0} aria-label={`Move tab ${index + 1} up`} onClick={() => moveTab(index, -1)}>↑</button>
          <button type="button" className="ghost" disabled={index === draftTabs.length - 1} aria-label={`Move tab ${index + 1} down`} onClick={() => moveTab(index, 1)}>↓</button>
          <button type="button" className="text-button danger-text" aria-label={`Remove tab ${index + 1}`} onClick={() => setTabs(draftTabs.filter((entry) => entry.id !== tab.id))}>✕</button>
        </div>)}
        <button type="button" className="text-button" disabled={draftTabs.length >= maxTabs} onClick={() => setTabs([...draftTabs, { id: dashId('t'), name: '' }])}>＋ Add tab</button>
      </fieldset>
      <fieldset className="od-filters"><legend>Filters of the filter row (optional)</legend>
        <small>Each lets the viewer tick values of a Dropdown or Multi-select column of one data source; it narrows the blocks over that source. Nothing ticked = all.</small>
        {draftFilters.map((filter, index) => <div key={filter.id} className="od-filter">
          <div className="od-filter-head">
            <select aria-label={`Filter ${index + 1} data source`} value={filter.source} onChange={(event) => setFilters(draftFilters.map((entry) => entry.id === filter.id ? { ...entry, source: event.target.value, column: optionColumns(event.target.value)[0]?.id ?? '' } : entry))}>
              {!usable.some((entry) => entry.key === filter.source) && <option value={filter.source}>{sourceName(datasets, filter.source)} (not available)</option>}
              {usable.map((entry) => <option key={entry.key} value={entry.key}>{entry.name}</option>)}
            </select>
            <select aria-label={`Filter ${index + 1} column`} value={filter.column} onChange={(event) => setFilters(draftFilters.map((entry) => entry.id === filter.id ? { ...entry, column: event.target.value } : entry))}>
              {!optionColumns(filter.source).some((column) => column.id === filter.column) && <option value={filter.column}>— Choose —</option>}
              {optionColumns(filter.source).map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
            </select>
            <button type="button" className="text-button danger-text" aria-label={`Remove filter ${index + 1}`} onClick={() => setFilters(draftFilters.filter((entry) => entry.id !== filter.id))}>✕</button>
          </div>
        </div>)}
        <button type="button" className="text-button" disabled={!usable.length || draftFilters.length >= maxViewerFilters} title={usable.length ? undefined : 'Filters need a data source with a Dropdown or Multi-select column.'} onClick={() => { const source = usable[0]; setFilters([...draftFilters, { id: dashId('f'), source: source.key, column: optionColumns(source.key)[0]?.id ?? '' }]) }}>＋ Add filter</button>
      </fieldset>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Saving to Git…' : 'Save to Git'}</button></div>
    </form>
  </Modal>
}

// DSH-15: Copy to… — the dashboards the viewer may build ("This dashboard" first, a duplicate); the copy keeps its
// settings and data source, takes the target's tab of the same name (else its first tab, and Background jobs says so).
function CopyBlockDialog({ block, targets, onCancel, onCopy }: { block: DashboardBlock; targets: { id: string; name: string }[]; onCancel: () => void; onCopy: (target: string) => Promise<void> }) {
  const [target, setTarget] = useState(targets[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <Modal eyebrow="DASHBOARD · BLOCKS" title="Copy the block" onClose={() => { if (!busy) onCancel() }}>
    <form onSubmit={(event) => { event.preventDefault(); setBusy(true); setError(''); void onCopy(target).catch((failure: unknown) => { setBusy(false); setError(failure instanceof Error ? failure.message : String(failure)) }) }}>
      <p>Copy <strong>{block.title}</strong> ({blockTypeLabel(block.type)}) with its settings and data source to a dashboard you may build. The copy is saved to that dashboard’s file in Git at once; it goes on the tab of the same name, else on the first tab.</p>
      <label>Copy to
        <select aria-label="Copy to" value={target} disabled={busy} onChange={(event) => setTarget(event.target.value)}>
          {targets.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </label>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className="primary" disabled={busy || !target}>{busy ? 'Copying…' : 'Copy block'}</button></div>
    </form>
  </Modal>
}

// DSH-13: Remove… from a block's ⋯ menu asks first, naming the block.
function RemoveBlockDialog({ block, onCancel, onRemove }: { block: DashboardBlock; onCancel: () => void; onRemove: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <Modal eyebrow="DASHBOARD · BLOCKS" title="Remove the block" onClose={() => { if (!busy) onCancel() }}>
    <form onSubmit={(event) => { event.preventDefault(); setBusy(true); setError(''); void onRemove().catch((failure: unknown) => { setBusy(false); setError(failure instanceof Error ? failure.message : String(failure)) }) }}>
      <p>Remove <strong>{block.title}</strong> ({blockTypeLabel(block.type)}) from the dashboard, for everyone? Its data source is not changed. It is saved to Git at once; the history stays in GitHub.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className="danger-button" disabled={busy}>{busy ? 'Removing…' : 'Remove block'}</button></div>
    </form>
  </Modal>
}

// DSH-01: removing a Dashboard page asks first: its two files go, its data sources stay.
function RemoveDashboardDialog({ page, blocks, path, pageFile, onCancel, onRemove }: { page: OnDemandPage; blocks: number; path: string; pageFile: string; onCancel: () => void; onRemove: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const remove = async () => { setBusy(true); setError(''); try { await onRemove() } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) } }
  return <Modal eyebrow={`PAGES & MENU · ${page.name.toUpperCase()}`} title="Delete the On-Demand Dashboard" onClose={() => { if (!busy) onCancel() }}>
    <form onSubmit={(event) => { event.preventDefault(); void remove() }}>
      <p>Delete the On-Demand Dashboard <strong>{page.name}</strong> with its {blocks} block{blocks === 1 ? '' : 's'}, for everyone? Its files {pageFile} and {path} are deleted from Git; their history stays in GitHub. The table pages and hours it shows are not changed.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className="danger-button" disabled={busy}>{busy ? 'Deleting…' : 'Delete On-Demand Dashboard'}</button></div>
    </form>
  </Modal>
}
