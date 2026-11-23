import { useState } from 'react'
import { useUnsavedEdit } from '../pageEdits'
import { recordJob } from '../backgroundJobs'
import { DataTable, type DataColumn } from '../components/DataTable'
import { BlockDialog, BlockPanel, KpiTile } from '../components/DashboardBlocks'
import { MultiSelect } from '../components/MultiSelect'
import { EmptyState, Metrics, Modal, Notice, Page, Panel, SaveQueueStatus, WriteBlocked } from '../components/ui'
import { narrowPeriod, offeredMonths, offeredQuarters, periodMonths, periodOf, periodQuarters, periodYears, type Period } from '../dashboard'
import { utcToday } from '../businessTime'
import { noData, blankBlock, blockTypeLabel, dashId, dataSources, filterColumns, maxBlocks, maxTabs, maxViewerFilters, missingDataset, moveBlock, narrowRows, pageOfSource, removeBlock, setTabsAndFilters, sourceName, tabsError, upsertBlock, viewerKey, type DashboardBlock, type DashboardTab, type Dataset, type ViewerFilter } from '../dashboardPages'
import { outcomeText } from '../gitSaveQueue'
import { deleteReason, findGroup, gitReasonOf, hideReason, isDashboard, isHidden, pageMenuReason, pageRights, placementOf, removePlacement, setHidden, type Viewer } from '../menuLayout'
import { hasOptions, onDemandPath, renamePage, type OnDemandPage, withoutHidden } from '../onDemand'
import { noneKey, noneLabel } from '../onDemandInsights'
import { useWriteBlock } from '../useCan'
import { useDashboardPage } from '../useDashboardPage'
import type { GitStorage } from '../useGitStorage'
import type { MenuLayoutStore } from '../useMenuLayout'
import type { OnDemandStore } from '../useOnDemand'
import type { PersonalViewsStore } from '../usePersonalViews'
import { PageNameDialog } from './OnDemandPage'

// DSH-01…DSH-12 An On-Demand Dashboard page (page builder, PGB-01): read only for everyone, built by its owners from
// blocks over the rows of table pages. Top to bottom (UI-STANDARDS §1, §7, §9): the filter row (Year /
// Quarter / Month as in Team overview, the owners' filters, Reset filters), the KPI tiles (each opens its tab), the tabs
// and the chart and table panels of the chosen tab. The viewer's tab, period and filters are remembered per person
// (personal views, MYD-08; else this browser). The owners — whoever may set the page up (PGB-08…PGB-11) — add, edit,
// reorder and remove blocks, tabs and filters, each saved to Git at once (dashboards/<page-id>.json, GIT-17), the result
// in Background jobs (§8); for everyone else those buttons are disabled with the reason (CON-102).

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

export function CustomDashboardPage({ git, store, pageId, menu, viewer, views, onOpen, addPageReason = '', onAddPage }: { git: GitStorage; store: OnDemandStore; pageId: string; menu: MenuLayoutStore; viewer: Viewer; views?: PersonalViewsStore; onOpen: (id: string) => void; addPageReason?: string; onAddPage: () => void }) {
  const page = store.pages.find((entry) => entry.id === pageId)
  const dash = useDashboardPage(git, pageId)
  const dashboard = dash.dashboard
  const block = useWriteBlock()
  const currentYear = Number(utcToday().slice(0, 4))
  const [viewed, setViewed] = useState<Viewed>(() => readViewed(pageId, views?.filter(viewerKey(pageId), (value) => value)))
  const update = (next: Partial<Viewed>) => setViewed((current) => { const value = { ...current, ...next }; try { localStorage.setItem(localKey(pageId), JSON.stringify(value)) } catch { /* convenience only */ } views?.setFilter(viewerKey(pageId), value); return value })
  const [editing, setEditing] = useState<{ block: DashboardBlock; isNew: boolean } | null>(null)
  const [arranging, setArranging] = useState(false)
  const [setup, setSetup] = useState(false)
  const [pageDialog, setPageDialog] = useState<'rename' | 'remove' | null>(null)
  const [error, setError] = useState('')
  // GIT-18: an open block editor, tabs and filters pop-up or rename: Load the newer data asks first.
  useUnsavedEdit(editing ? `the block you are editing on ${page?.name ?? 'this dashboard'}` : setup ? `the tabs and filters you are setting up on ${page?.name ?? 'this dashboard'}` : pageDialog === 'rename' ? `the new name of ${page?.name ?? 'this dashboard'}` : false)

  // DSH-09: rights. Building the dashboard: whoever may set the page up; renaming and removing it: the page builder's.
  const gitReason = gitReasonOf(git)
  const rights = pageRights(viewer, menu.layout, pageId)
  const buildReason = gitReason || (rights.setup ? '' : block.noteFor('on this dashboard', 'ondemand.setup')) || (dash.loaded || !git.connected ? '' : 'Reading the dashboard from Git…')
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
  const datasets = dataSources(store.pages, visibleStored, (id) => isDashboard(menu.layout, id), pageId)
  const datasetOf = (source: string) => datasets.find((entry) => entry.key === source) ?? missingDataset(source, `The table page “${pageOfSource(source)}” is no longer there (removed), or you cannot see it.`)
  const narrow = (dataset: Dataset, entry: DashboardBlock) => dataset.problem ? null : narrowRows(dataset, entry, months, dashboard.filters, viewed.choices)

  // Years offered: those in the dates the blocks filter on, this year and any chosen.
  const found = new Set<number>([currentYear, ...viewed.period.years])
  for (const entry of dashboard.blocks) {
    const source = tablePages.find((candidate) => `page:${candidate.id}` === entry.source)
    if (!source || !entry.period) continue
    for (const row of source.rows) { const value = row.cells[entry.period]; const year = typeof value === 'string' ? Number(value.slice(0, 4)) : NaN; if (year > 2000 && year < 2100) found.add(year) }
  }
  const years = [...found].sort((a, b) => a - b)

  const tabs = dashboard.tabs
  const activeTab = tabs.find((tab) => tab.id === viewed.tab) ?? tabs[0]
  const onTab = (entry: DashboardBlock) => !tabs.length || (entry.tab && tabs.some((tab) => tab.id === entry.tab) ? entry.tab : tabs[0].id) === activeTab?.id
  const tiles = dashboard.blocks.filter((entry) => entry.type === 'kpi')
  const panels = dashboard.blocks.filter((entry) => entry.type !== 'kpi' && onTab(entry))
  const filtered = Boolean(Object.values(viewed.choices).some((value) => value.length)) || JSON.stringify(viewed.period) !== JSON.stringify(defaultPeriod())
  const placement = placementOf(menu.layout, pageId)
  const group = findGroup(menu.layout, placement.group)
  const owners = [...new Set([...placement.owners, ...(group?.acceptsPages ? group.owners : [])])]

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

  if (!page) return <Page><EmptyState title="This page is no longer there." detail="It was removed, or Git has not been read yet." /></Page>
  const firstSource = datasets.find((entry) => !entry.problem)
  const addReason = buildReason || (dashboard.blocks.length >= maxBlocks ? `A dashboard holds at most ${maxBlocks} blocks: remove one first.` : '') || (firstSource ? '' : 'There is no data source yet: add a table page with rows first.')

  return <Page className="dashboard-page" intro={page.description || 'An On-Demand Dashboard of KPI tiles, charts and summary tables — read only, the same for everyone.'}
    actions={<>
      <button type="button" className="ghost" disabled={Boolean(addReason)} title={addReason || undefined} onClick={() => setEditing({ block: blankBlock(firstSource!, dashId('b'), 'kpi', activeTab && activeTab.id !== tabs[0]?.id ? activeTab.id : ''), isNew: true })}>＋ Add block…</button>
      <button type="button" className="ghost" disabled={Boolean(buildReason)} title={buildReason || undefined} onClick={() => setArranging(true)}>Arrange blocks…</button>
      <button type="button" className="ghost" disabled={Boolean(buildReason)} title={buildReason || undefined} onClick={() => setSetup(true)}>Tabs and filters…</button>
      <button type="button" className="ghost" disabled={Boolean(gitReason || addPageReason)} title={gitReason || addPageReason || undefined} onClick={onAddPage}>＋ Add page…</button>
      <button type="button" className="ghost" disabled={Boolean(menuReason)} title={menuReason || undefined} onClick={() => setPageDialog('rename')}>Rename page…</button>
      <button type="button" className="ghost" disabled={Boolean(hidingReason)} title={hidingReason || undefined} onClick={toggleHidden}>{hidden ? 'Show page' : 'Hide page'}</button>
      <button type="button" className="danger-button" disabled={Boolean(removeReason)} title={removeReason || undefined} onClick={() => setPageDialog('remove')}>Delete page…</button>
      {git.connected && <button type="button" className="ghost" onClick={() => { void dash.reload(); void store.reload() }}>↻ Reload from Git</button>}
    </>}>
    {gitReason && <Notice tone={git.isSample ? 'warning' : 'info'}>{gitReason}{!git.connected ? ' The dashboard last loaded in this browser is shown.' : ''}</Notice>}
    {!gitReason && <WriteBlocked reason={rights.setup ? '' : block.noteFor('on this dashboard', 'ondemand.setup')} />}
    {dash.error && <Notice tone="error">Dashboard: {dash.error} The dashboard last read is kept.</Notice>}
    {dash.dropped.length > 0 && <Notice tone="warning">Dashboard: {dash.path} — {dash.dropped.join(' ')}</Notice>}
    {store.errors.map((entry) => <Notice key={entry} tone="error">On-Demand: {entry}</Notice>)}
    {error && <Notice tone="error">{error}</Notice>}
    <SaveQueueStatus state={dash.queue} onRetry={() => void dash.retry()} />

    <div className="dash-filters" role="group" aria-label="Dashboard filters">
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
      <button type="button" className="ghost" disabled={!filtered} onClick={() => update({ period: defaultPeriod(), choices: {} })}>Reset filters</button>
    </div>
    <p className="muted dsh-scope" role="status">Period: {months.length === countingYears.length * 12 ? `${countingYears.join(', ')} (whole ${several ? 'years' : 'year'})` : months.map((month) => `${monthNames[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`).join(', ')}{Object.values(viewed.choices).some((value) => value.length) ? ' · filtered' : ''}.</p>

    {!dashboard.blocks.length ? <Panel eyebrow={(group?.name ?? 'On-Demand').toUpperCase()} title={page.name} info={<DashboardInfo path={dash.path} history={dash.history} owners={owners} />}>
      <EmptyState title="No blocks yet." detail={buildReason ? 'The dashboard’s owners add KPI tiles, charts and summary tables.' : 'Add the first one with ＋ Add block…: a KPI tile, a bar, line or pie chart, or a summary table over a table page.'} />
    </Panel> : <>
      {tiles.length > 0 && <Metrics>{tiles.map((entry) => { const dataset = datasetOf(entry.source); const target = tabs.length ? tabs.find((tab) => tab.id === entry.tab) ?? tabs[0] : undefined; return <KpiTile key={entry.id} dataset={dataset} block={entry} narrowed={narrow(dataset, entry)} tabName={target?.name} onOpenTab={target ? () => update({ tab: target.id }) : undefined} /> })}</Metrics>}
      {tabs.length > 0 && <div className="overview-tabs dsh-tabs" role="tablist" aria-label="Dashboard tabs">{tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={tab.id === activeTab?.id} className={`backlog-tab ${tab.id === activeTab?.id ? 'backlog-tab-active' : ''}`} onClick={() => update({ tab: tab.id })}>{tab.name}</button>)}</div>}
      <div className="od-insights dsh-panels" role={tabs.length ? 'tabpanel' : undefined}>
        {panels.map((entry) => { const dataset = datasetOf(entry.source); return <BlockPanel key={entry.id} dataset={dataset} block={entry} narrowed={narrow(dataset, entry)} colors={dashboard.colors} /> })}
      </div>
      {!panels.length && <EmptyState title={tabs.length ? `No charts or tables on ${activeTab?.name}.` : 'No charts or tables yet.'} detail={tiles.length ? undefined : noData.detail} />}
      <Panel className="dsh-about" eyebrow={(group?.name ?? 'On-Demand').toUpperCase()} title="About this dashboard" detail={`${dashboard.blocks.length} block${dashboard.blocks.length === 1 ? '' : 's'}${tabs.length ? ` on ${tabs.length} tab${tabs.length === 1 ? '' : 's'}` : ''}, read only, the same for everyone.`} info={<DashboardInfo path={dash.path} history={dash.history} owners={owners} />}><span /></Panel>
    </>}

    {editing && <BlockDialog datasets={datasets} dashboard={dashboard} block={editing.block} isNew={editing.isNew} preview={narrow} onCancel={() => setEditing(null)}
      onSave={async (entry, colors) => { const next = upsertBlock(dashboard, entry); if (colors) next.colors = colors; else delete next.colors; await saveDashboard(next, editing.isNew ? 'Add block' : 'Edit block', `Dashboard ${page.name}: ${editing.isNew ? 'add' : 'change'} the ${blockTypeLabel(entry.type)} ${entry.title}`); setEditing(null) }} />}
    {arranging && <ArrangeDialog blocks={dashboard.blocks} tabs={tabs} sourceOf={(source) => sourceName(datasets, source)} onClose={() => setArranging(false)} onEdit={(entry) => { setArranging(false); setEditing({ block: entry, isNew: false }) }}
      onMove={(entry, by) => run(() => saveDashboard(moveBlock(dashboard, entry.id, by), 'Move block', `Dashboard ${page.name}: move ${entry.title} ${by < 0 ? 'up' : 'down'}`))}
      onRemove={(entry) => saveDashboard(removeBlock(dashboard, entry.id), 'Remove block', `Dashboard ${page.name}: remove the ${blockTypeLabel(entry.type)} ${entry.title}`)} />}
    {setup && <SetupDialog tabs={tabs} filters={dashboard.filters} datasets={datasets} onCancel={() => setSetup(false)}
      onSave={async (nextTabs, nextFilters) => { await saveDashboard(setTabsAndFilters(dashboard, nextTabs, nextFilters), 'Tabs and filters', `Dashboard ${page.name}: tabs and filters`); setSetup(false) }} />}
    {pageDialog === 'rename' && <PageNameDialog title="Rename the page" action="Save to Git" name={page.name} description={page.description} except={`ondemand:${page.id}`} onCancel={() => setPageDialog(null)} onSave={async (name, description) => {
      const stored = store.stored(page.id) ?? page
      const saved = await store.save(renamePage(stored, name, description), `Pages & menu: rename ${stored.name} to ${name.trim()}`)
      recordJob(`pages:${page.id}`, `Rename page · ${stored.name}`, { text: `${outcomeText(saved)} ${onDemandPath(page.id)}` })
      setPageDialog(null)
    }} />}
    {pageDialog === 'remove' && <RemoveDashboardDialog page={page} blocks={dashboard.blocks.length} path={dash.path} onCancel={() => setPageDialog(null)} onRemove={async () => {
      await store.remove(page.id, `Pages & menu: remove the dashboard ${page.name} (${dashboard.blocks.length} blocks)`)
      const removed = await git.removeDashboard(page.id, `Pages & menu: remove the dashboard ${page.name} (${dashboard.blocks.length} blocks)`)
      if (menu.layout.pages[page.id]) await menu.save(removePlacement(menu.layout, page.id), `Pages & menu: remove the page ${page.name}`)
      recordJob(`pages:${page.id}`, `Remove page · ${page.name}`, { text: `Removed ${onDemandPath(page.id)}${removed ? ` and ${dash.path}` : ''}; the history stays in GitHub. The data sources are not changed.` })
      setPageDialog(null); const next = store.pages.find((entry) => entry.id !== page.id); if (next) onOpen(next.id)
    }} />}
  </Page>
}

function DashboardInfo({ path, history, owners }: { path: string; history: string; owners: string[] }) {
  return <>Read only: KPI tiles, charts and summary tables over the rows of table pages (as saved in Git). The period and the filters above apply to every block; your choice is remembered for you. The dashboard’s owners — a Tool Owner, the page’s and its group’s co-owners and roles allowed “Set up On-Demand pages” — add, edit, reorder and remove its blocks, tabs and filters; each change is saved to Git at once as {path}, two saves at the same time merged block by block, the later one winning where both changed the same.{history && <> <a href={history} target="_blank" rel="noreferrer">History in GitHub</a></>}{owners.length > 0 && <> Co-owners: {owners.join(', ')}.</>}</>
}

// DSH-06: the blocks in order — Edit, ↑ ↓, Remove (after a pop-up that names the block); each change saved at once.
function ArrangeDialog({ blocks, tabs, sourceOf, onClose, onEdit, onMove, onRemove }: { blocks: DashboardBlock[]; tabs: DashboardTab[]; sourceOf: (source: string) => string; onClose: () => void; onEdit: (block: DashboardBlock) => void; onMove: (block: DashboardBlock, by: -1 | 1) => void; onRemove: (block: DashboardBlock) => Promise<void> }) {
  const [removing, setRemoving] = useState<DashboardBlock | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const columns: DataColumn<DashboardBlock>[] = [
    { id: 'dsh-order', label: 'Order', align: 'right', sortable: false, value: (entry) => blocks.indexOf(entry) + 1 },
    { id: 'dsh-title', label: 'Block', sortable: false, value: (entry) => entry.title, render: (entry) => <strong>{entry.title}</strong> },
    { id: 'dsh-type', label: 'Type', sortable: false, value: (entry) => blockTypeLabel(entry.type) },
    { id: 'dsh-source', label: 'Data source', sortable: false, value: (entry) => sourceOf(entry.source) },
    ...(tabs.length ? [{ id: 'dsh-tab', label: 'Tab', sortable: false, value: (entry: DashboardBlock) => (tabs.find((tab) => tab.id === entry.tab) ?? tabs[0]).name }] : []),
    { id: '@actions', label: 'Actions', sortable: false, export: false, render: (entry) => { const at = blocks.indexOf(entry); return <span className="button-row nowrap">
      <button type="button" className="ghost" aria-label={`Edit ${entry.title}`} onClick={() => onEdit(entry)}>Edit</button>
      <button type="button" className="ghost" disabled={at === 0} aria-label={`Move ${entry.title} up`} onClick={() => onMove(entry, -1)}>↑</button>
      <button type="button" className="ghost" disabled={at === blocks.length - 1} aria-label={`Move ${entry.title} down`} onClick={() => onMove(entry, 1)}>↓</button>
      <button type="button" className="text-button danger-text" aria-label={`Remove ${entry.title}`} onClick={() => setRemoving(entry)}>Remove</button>
    </span> } },
  ]
  return <>
    <Modal eyebrow="DASHBOARD · BLOCKS" title="Arrange the blocks" wide form={false} onClose={onClose}>
      <p className="muted">KPI tiles are shown in this order above the tabs, charts and tables in this order on their tab. Each change is saved to Git at once.</p>
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

// DSH-01: removing a Dashboard page asks first: its two files go, its data sources stay.
function RemoveDashboardDialog({ page, blocks, path, onCancel, onRemove }: { page: OnDemandPage; blocks: number; path: string; onCancel: () => void; onRemove: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const remove = async () => { setBusy(true); setError(''); try { await onRemove() } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) } }
  return <Modal eyebrow={`PAGES & MENU · ${page.name.toUpperCase()}`} title="Delete the On-Demand Dashboard" onClose={() => { if (!busy) onCancel() }}>
    <form onSubmit={(event) => { event.preventDefault(); void remove() }}>
      <p>Delete the On-Demand Dashboard <strong>{page.name}</strong> with its {blocks} block{blocks === 1 ? '' : 's'}, for everyone? Its files {onDemandPath(page.id)} and {path} are deleted from Git; their history stays in GitHub. The table pages and hours it shows are not changed.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className="danger-button" disabled={busy}>{busy ? 'Deleting…' : 'Delete On-Demand Dashboard'}</button></div>
    </form>
  </Modal>
}
