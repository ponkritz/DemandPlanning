import { useMemo, useState, type ReactNode } from 'react'
import { ReleaseCountsPanel } from '../components/ReleaseCounts'
import { SignedByMe } from '../components/SignedByMe'
import { azureSignatures, isSignatureField, windchillSignatures } from '../mySignatures'
import { streamPatterns } from '../releaseSource'
import { allStreams, profileForStream, streamArea, windchillOptionsForView, windchillStreamExports } from '../streams'
import { viewSource } from '../viewSources'
import type { WindchillWorkspace } from '../useWindchill'
import { capacityContext, capacityGap, capacityModel, itemsForPerson, problemBreakdown, type CapacitySettings } from '../capacity'
import { absenceRuleText, capacityParts, capacityText, monthRange, narrowPeriod, offeredMonths, offeredQuarters, periodMonths, periodOf, periodQuarters, periodYears, personMonths, streamTotals, totals, type Period } from '../dashboard'
import { isMine, isPending, myNames, stateChecks } from '../myWork'
import { formatDate, formatHours, formatPercent, monthName } from '../format'
import { utcToday } from '../businessTime'
import { EmptyState, Metric, Metrics, Modal, Notice, Page, Pill, TablePanel } from '../components/ui'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { MyWork } from '../useMyWork'
import type { Page as PageId } from './registry'
import type { PageProps } from './types'
import type { PersonalViewsStore } from '../usePersonalViews'
import type { Area } from '../access'
import type { GitStorage } from '../useGitStorage'
import type { OnDemandStore } from '../useOnDemand'
import type { HistoryStore } from '../useHistory'
import { BlockDialog, BlockPanel, KpiTile } from '../components/DashboardBlocks'
import { ChartGrid, GridCell, SizeFields } from '../components/ChartSize'
import { MultiSelect } from '../components/MultiSelect'
import { ViewActions } from '../components/ViewActions'
import { factoryOf, sizeFromOptions, withSizeOptions, type GridSize } from '../chartSize'
import { blockDataset, blockTypeLabel, dashId, dataSources, narrowRows, type DashboardBlock, type Dataset } from '../dashboardPages'
import { hoursLinesCached } from '../dashboardHours'
import { defaultStreamReleases } from '../releaseOverview'
import { pulseStreamsKey, readPulseStreams } from '../pulseStreams'
import { entryOf, removedSourceOf, sourceEntries, type LoadAction, type SourceInput } from '../dashboardSources'
import { useToolValidationsEnv } from '../useToolValidations'
import { arrangeMyItems, isSection, maxMyBlocks, myBlankBlock, myDashboardKey, myDashboardOut, myDashboardPage, myDashboardViewKey, mySections, parseMyDashboard, sectionKindSize, withBlock, withoutBlock, type MyDashboard } from '../myDashboard'
import { cleanOptions, insightKindOf as kindOf, withoutHidden } from '../onDemand'
import { parseTracker, type KpiTracker } from '../kpiTracker'
import { runInBackground } from '../backgroundJobs'
import { usePageSettingsGear } from '../usePageSettingsGear'

// What My dashboard's blocks read (MYD-15): the data the app has loaded, the viewer's areas and the loads they may start.
export interface MyDashboardSources {
  sees: (area: Area) => boolean
  // CON-89: View as — read only, the default My dashboard of the viewed role (never the viewed person's own layout).
  viewingAs: boolean
  git: GitStorage
  onDemand: OnDemandStore
  isDashboard: (id: string) => boolean
  history: HistoryStore
  settings: CapacitySettings
  items: AzureWorkspace['items']
}

// MYD-20: the KPI tracker read for My dashboard in this visit (the KPI tracker page reads its own).
let kpiRead: KpiTracker | null | undefined
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const emptyPeriod = (): Period => ({ years: [], quarters: [], months: [] })

// My dashboard (MYD-01…MYD-04, MYD-14…MYD-24): every user's start page — their own hours against their capacity, their
// open work and their streams and releases, for the header month, as its default blocks; each person adds, removes,
// moves and resizes blocks of their own over every data source of the registry, kept with their personal views. Each
// count opens the page with the detail.
export function MyDashboardPage({ month, azure, store, my, navigate, views, canSetDefault = false, windchill, sources }: { month: string; azure: AzureWorkspace; store: PageProps['store']; my: MyWork; navigate: (page: PageId) => void; views: PersonalViewsStore; canSetDefault?: boolean; windchill?: Pick<WindchillWorkspace, 'views' | 'sources'>; sources?: MyDashboardSources }) {
  // SET-32: ⚙ Settings for this page (page actions, last), for the people who may change one of its settings.
  const settingsGear = usePageSettingsGear()
  const [editing, setEditing] = useState(false)
  const [blockEdit, setBlockEdit] = useState<{ block: DashboardBlock; isNew: boolean } | null>(null)
  const [removing, setRemoving] = useState<DashboardBlock | null>(null)
  const [status, setStatus] = useState('')
  const [kpi, setKpi] = useState<KpiTracker | null | undefined>(kpiRead)
  const [loadNote, setLoadNote] = useState('')
  const readOnly = Boolean(sources?.viewingAs)
  const sees = sources?.sees ?? (() => false)
  const currentYear = Number(utcToday().slice(0, 4))
  // MYD-23: the person's own entries only; View as reads none of them (the default layout of the viewed role).
  const parsed = useMemo(() => parseMyDashboard(readOnly ? undefined : views.ownFilter(myDashboardKey)), [readOnly, views])
  const mine = parsed.dashboard
  const layout = readOnly ? views.defaultSections(myDashboardPage) : views.sections(myDashboardPage)
  const period = readOnly ? emptyPeriod() : periodOf(views.ownFilter(myDashboardViewKey), emptyPeriod())
  const months = periodMonths(period, currentYear)
  const monthsKey = months.join(',')
  const arranged = arrangeMyItems(mine, layout)
  const shownBlocks = mine.blocks.filter((block) => arranged.shown.includes(block.id))

  // MYD-15: the sources — rows worked out only for those a shown block (or the open editor) reads.
  const used = new Set(shownBlocks.map((block) => block.source))
  const wantAll = Boolean(blockEdit)
  const areaKey = (['overview', 'insights', 'mywork', 'board', 'release', 'ondemand'] as Area[]).filter((area) => sees(area)).join(',')
  const usedKey = wantAll ? '*' : [...used].sort().join(',')
  const onDemand = sources?.onDemand, history = sources?.history, items = sources?.items ?? azure.items
  const settings = sources?.settings
  const toolStore = useToolValidationsEnv()?.store
  // MYD-25: the person's own Pulse Check Streams filter, for the Completed releases source's Counted in Pulse Check.
  const excludedKey = (views.filter(pulseStreamsKey, readPulseStreams)?.excluded ?? []).join('\u0000')
  const entries = useMemo(() => {
    if (!sources || !settings) return []
    const visibleStored = (id: string) => { const found = onDemand!.stored(id); return found ? withoutHidden(found) : null }
    const input: SourceInput = {
      sees, months: monthsKey ? monthsKey.split(',') : [], today: utcToday(), me: my.me, items, settings,
      releases: { state: store.state, profiles: azure.connectionProfiles, streamsOf: (at) => defaultStreamReleases(store.state, azure.connectionProfiles, at), windchill: windchill ?? { views: [], sources: [] }, excluded: excludedKey ? excludedKey.split('\u0000') : [] },
      kpi, history: { file: history!.file, loaded: history!.loaded, connected: sources.git.connected },
      windchill: store.state.windchillSources ?? [],
      pages: dataSources(onDemand!.pages, visibleStored, sources.isDashboard, ''),
      hours: (allowed) => allowed ? hoursLinesCached(items, monthsKey ? monthsKey.split(',') : [], utcToday(), settings) : [],
      // TVL-18: the Tool Validations master list and expiry list (the app's copy of tool-validations.json).
      ...(toolStore ? { tools: { file: toolStore.shown, connected: toolStore.connected, loaded: toolStore.loaded } } : {}),
      // MYD-26: the Azure DevOps queries the app reads (streams, Tool Validations, the person's own My views).
      connections: { profiles: azure.connectionProfiles, state: store.state, viewingAs: readOnly },
    }
    return sourceEntries(input, (key) => usedKey === '*' || usedKey.split(',').includes(key))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaKey, usedKey, monthsKey, items, settings, store.state, azure.connectionProfiles, kpi, history?.file, history?.loaded, onDemand?.pages, toolStore?.shown, toolStore?.connected, toolStore?.loaded, my.me.email, my.me.name, sources?.git.connected, windchill?.views, windchill?.sources, excludedKey, readOnly])
  const sourceOf = (key: string) => entryOf(entries, key, sees)
  const narrow = (dataset: Dataset, block: DashboardBlock) => dataset.problem ? null : narrowRows(dataset, block, months)
  const datasets = entries.map((entry) => entry.dataset)
  const firstSource = datasets.find((dataset) => !dataset.problem)

  // Saving: at once in this browser, in Git with the personal views (MYD-09).
  const save = (next: MyDashboard) => { views.setFilter(myDashboardKey, myDashboardOut(next)) }
  const setOrder = (order: string[], hidden: string[]) => views.setSections(myDashboardPage, { order, hidden })
  const move = (id: string, by: -1 | 1) => { const order = [...arranged.order], from = order.indexOf(id), to = from + by; if (from < 0 || to < 0 || to >= order.length) return; [order[from], order[to]] = [order[to], order[from]]; setOrder(order, arranged.hidden) }
  const toggle = (id: string) => setOrder(arranged.order, arranged.hidden.includes(id) ? arranged.hidden.filter((entry) => entry !== id) : [...arranged.hidden, id])
  const resize = (id: string, size: GridSize | undefined) => {
    if (isSection(id)) { const sizes = { ...mine.sizes }; if (size) sizes[id] = size; else delete sizes[id]; save({ ...mine, sizes }); return }
    const block = mine.blocks.find((entry) => entry.id === id)
    if (!block || block.type === 'kpi') return
    const kind = kindOf(block.type)
    const rest = { ...block.options }; delete rest.size; delete rest.height; delete rest.grid
    const options = cleanOptions(block.type, block.measure, size ? withSizeOptions(block.options, size, factoryOf(kind), false, kind) : rest)
    const out: DashboardBlock = { ...block }
    if (options) out.options = options; else delete out.options
    save(withBlock(mine, out))
  }
  const reset = () => { views.resetSections(myDashboardPage); views.clearFilter(myDashboardKey); views.clearFilter(myDashboardViewKey); setStatus('The default My dashboard is back: your blocks, order and sizes are removed.') }
  const setPeriod = (next: Period) => views.setFilter(myDashboardViewKey, narrowPeriod(next, currentYear))
  const load = (action: LoadAction) => {
    setLoadNote('')
    if (action === 'kpi' && sources) void sources.git.readKpiTracker().then((read) => { kpiRead = read.text == null ? null : parseTracker(read.text); setKpi(kpiRead) }, (failure: unknown) => setLoadNote(`The KPI tracker was not read: ${failure instanceof Error ? failure.message : String(failure)}`))
    if (action === 'history') void history?.reload()
    if (action === 'windchill') navigate('windchill')
    if (action === 'azure') runInBackground('mydash:fetch', 'Fetch Azure DevOps', async () => { const result = await azure.fetchCloud(); return { text: result.skipped || `${result.ok} of ${result.targets} connection${result.targets === 1 ? '' : 's'} fetched.`, failed: Boolean(result.skipped) || result.ok < result.targets } })
  }
  const loadLabel: Record<LoadAction, string> = { azure: 'Fetch from Azure DevOps', kpi: 'Load the KPI tracker', history: 'Load the historical hours', windchill: 'Open Windchill exports' }
  const addReason = readOnly ? 'View as is read only.' : mine.blocks.length >= maxMyBlocks ? `My dashboard holds at most ${maxMyBlocks} blocks of your own: remove one first.` : !sources ? 'No data sources here.' : ''
  const addBlock = () => { const first = firstSource ?? datasets[0]; if (first) setBlockEdit({ block: myBlankBlock(first, dashId('b'), 'bar'), isNew: true }) }

  if (!my.known) return <Page><EmptyState title="Who are you in Azure DevOps?" detail="Set your work email in Admin → Streams → Your work email, or choose your name on My Tasks [Board]. My dashboard then shows your own hours and work." /></Page>
  const capacity = capacityContext(store.state)
  const today = utcToday()
  const name = my.me.name ?? ''
  const sixMonths = monthRange(month, 6)
  // CAP-56: the person's rows under every name they go by (their work email's Assigned To names too).
  const names = myNames(azure.items, my.me)
  const rows = names.length ? personMonths(azure.items, sixMonths, today, capacity).filter((row) => names.includes(row.person)) : []
  // CAP-56: when I am not counted in the month, say why instead of showing 0h.
  const notCounted = names.length && !rows.some((row) => row.month === month) ? capacityGap(capacityModel(azure.items, month, capacity), names) : undefined
  const now = totals(rows.filter((row) => row.month === month))
  const problems = problemBreakdown(itemsForPerson(azure.items, my.me, capacity), [month], capacity)
  const checks = stateChecks(azure.items, my.me, my.absenceEpicId)
  const count = (type: string) => my.pending.filter((row) => row.item.workItemType === type).length
  const toClose = checks.filter((check) => check.kind === 'close-feature' || check.kind === 'close-story').length
  const needsStory = checks.filter((check) => check.kind === 'feature-needs-active-story').length
  const streams = streamTotals(rows.filter((row) => row.month === month)).filter((stream) => stream.plan > 0 || stream.actual > 0)
  // Releases behind my Features: my open or closed Features whose Target Date falls in the month.
  const due = azure.items.filter((item) => item.workItemType === 'Feature' && isMine(item, my.me) && item.targetDate?.slice(0, 7) === month).sort((a, b) => (a.targetDate ?? '').localeCompare(b.targetDate ?? ''))
  const label = monthName(month)
  // MYD-13: the documents I signed in every stream that has the data (Azure DevOps views and Windchill exports).
  const signer = { names, ...(my.me.email ? { email: my.me.email } : {}) }
  const releaseConnections = azure.connectionProfiles.filter((entry) => entry.role === 'release-source').length
  const streamData = arranged.shown.includes('signed') ? allStreams().map((stream) => {
    if (stream.source === 'azure') {
      const profile = profileForStream(stream, azure.connectionProfiles)
      const source = profile ? viewSource(store.state, profile.id, profile.role, profile.query, releaseConnections) : undefined
      return { stream: stream.name, has: Boolean(source?.items.some((item) => Object.keys(item.fields ?? {}).some(isSignatureField))), signed: source ? azureSignatures(source.items, stream.name, signer, stream.rule, streamPatterns(store.state.releaseSourceSettings, stream.name), undefined, streamArea(stream)) : [] }
    }
    const exports = windchill ? windchillStreamExports(windchill.views).filter((entry) => entry.stream === stream && entry.view) : []
    const found = exports.flatMap((entry) => { const source = windchill!.sources.find((item) => item.viewId === entry.view!.id); return source ? [{ source, view: entry.view! }] : [] })
    return { stream: stream.name, has: found.some(({ source }) => source.columns.some(isSignatureField)), signed: found.flatMap(({ source, view }) => windchillSignatures(source.rows, source.columns, stream.name, signer, windchillOptionsForView(view))) }
  }).filter((entry, index, all) => all.findIndex((other) => other.stream === entry.stream) === index) : []
  const open = (page: PageId, text: string) => <button type="button" className="text-button" onClick={() => navigate(page)}>{text} →</button>
  const sectionNode: Record<string, ReactNode> = {
    hours: <TablePanel title={`My hours · ${label}`} info={<ul><li>Planned = Original Estimate and recorded = Completed Work of your month Time Writing Tasks, without leave and holidays (they come off the capacity instead); capacity = your working days less absence, as on the Dashboard and Time Writing.</li>{rows.some((row) => row.month === month) && <li>Capacity {label}: {capacityText(capacityParts(rows.filter((row) => row.month === month)), formatHours)} = {formatHours(now.capacity)}h ({absenceRuleText}).</li>}<li>Overrun = hours recorded above the estimate; ad-hoc = hours on Tasks tagged ad-hoc.</li></ul>} action={open('activities', 'Time Writing')}>
      {notCounted && <Notice tone="info">Not counted in {label}: {notCounted}.</Notice>}
      <Metrics>
        <Metric label="Planned" value={`${formatHours(now.plan)}h`} hint={`Capacity ${formatHours(now.capacity)}h`} />
        <Metric label="Recorded" value={`${formatHours(now.actual)}h`} hint={now.absence ? `${formatHours(now.absence)}h absence` : 'No absence booked'} />
        <Metric label="Utilization" value={formatPercent(now.actualUtil ?? now.planUtil)} hint={now.actualUtil != null ? 'Recorded ÷ capacity' : 'Planned ÷ capacity'} tone={(now.actualUtil ?? now.planUtil ?? 0) > capacity.overloadedAt ? 'negative' : undefined} />
        <Metric label="Overrun · ad-hoc" value={`${formatHours(problems.overrun.total)}h · ${formatHours(problems.adhoc.total)}h`} hint="Above estimate · tagged ad-hoc" />
      </Metrics>
      {rows.length > 0 ? <div className="azure-table"><table><thead><tr><th>Month</th><th>Planned</th><th>Recorded</th><th>Capacity</th><th>Utilization</th></tr></thead><tbody>
        {sixMonths.slice().reverse().map((entry) => { const row = totals(rows.filter((item) => item.month === entry)); return <tr key={entry} className={entry === month ? 'row-current' : ''}><td>{monthName(entry)}</td><td>{formatHours(row.plan)}h</td><td>{formatHours(row.actual)}h</td><td>{formatHours(row.capacity)}h</td><td>{formatPercent(row.actualUtil ?? row.planUtil)}</td></tr> })}
      </tbody></table></div> : <EmptyState title="No Time Writing hours for you yet." detail={notCounted ? `${notCounted}.` : 'Refresh Time Writing from Azure, or check that your name on My Tasks [Board] matches your Tasks.'} />}
    </TablePanel>,
    work: <TablePanel title="My open work" info="Your New and Active work items (work under the absence Epic left out), and the state checks of Sprint check." action={open('mywork', 'My Tasks [Board]')}>
      <Metrics>
        <Metric label="Features" value={count('Feature')} hint="open, assigned to you" />
        <Metric label="User Stories" value={count('User Story')} hint={`${count('Task')} Tasks, ${count('Bug')} Bugs`} />
        <Metric label="Ready to close" value={toClose} hint="all children closed" tone={toClose ? 'negative' : undefined} />
        <Metric label="Features without an active story" value={needsStory} tone={needsStory ? 'negative' : undefined} />
      </Metrics>
      <div className="button-row">{open('mywork', 'Open my work')}{(toClose > 0 || needsStory > 0) && open('bulk', 'Fix in Sprint check')}</div>
    </TablePanel>,
    streams: <TablePanel title={`My streams and releases · ${label}`} info="The Epics you planned or recorded hours on in the month, and your Features with a Target Date in the month." empty={streams.length || due.length ? undefined : `No hours or Features due for you in ${label}.`}>
      {streams.length > 0 && <div className="azure-table"><table><thead><tr><th>Stream (Epic)</th><th>Planned</th><th>Recorded</th></tr></thead><tbody>
        {streams.map((stream) => <tr key={stream.key}><td>{stream.title}</td><td>{formatHours(stream.plan)}h</td><td>{formatHours(stream.actual)}h</td></tr>)}
      </tbody></table></div>}
      {due.length > 0 && <div className="azure-table"><table><thead><tr><th>Feature due in {label}</th><th>State</th><th>Target date</th></tr></thead><tbody>
        {due.map((item) => <tr key={item.key}><td><a href={item.url} target="_blank" rel="noreferrer">#{item.id}</a> {item.title}</td><td><Pill tone={isPending(item) ? 'open' : 'neutral'}>{item.state}</Pill></td><td>{item.targetDate ? formatDate(item.targetDate) : '—'}</td></tr>)}
      </tbody></table></div>}
    </TablePanel>,
    releasecounts: <ReleaseCountsPanel state={store.state} profiles={azure.connectionProfiles} month={month} />,
    signed: <SignedByMe signed={streamData.flatMap((entry) => entry.signed)} streams={streamData.map((entry) => entry.stream)} missing={streamData.filter((entry) => !entry.has).map((entry) => entry.stream)} month={month} />,
  }

  const labelOf = (id: string) => mySections.find((section) => section.id === id)?.label ?? mine.blocks.find((block) => block.id === id)?.title ?? id
  const blockSize = (block: DashboardBlock) => { const kind = kindOf(block.type), own = sizeFromOptions(block.options, kind); const factory = factoryOf(kind); return { size: { w: own?.w ?? factory.w, h: own?.h ?? factory.h }, own: Boolean(own) } }
  const sectionSize = (id: string) => mine.sizes[id] ?? sectionKindSize
  const tiles = arranged.shown.flatMap((id) => { const block = mine.blocks.find((entry) => entry.id === id); return block?.type === 'kpi' ? [block] : [] })
  const panels = arranged.shown.filter((id) => isSection(id) || mine.blocks.some((block) => block.id === id && block.type !== 'kpi'))
  const blockMenu = (block: DashboardBlock) => readOnly ? undefined : <ViewActions label={block.title} items={[
    { key: 'up', label: 'Move up', disabled: arranged.order.indexOf(block.id) === 0, onClick: () => move(block.id, -1) },
    { key: 'down', label: 'Move down', disabled: arranged.order.indexOf(block.id) === arranged.order.length - 1, onClick: () => move(block.id, 1) },
    { key: 'edit', label: 'Edit…', onClick: () => setBlockEdit({ block, isNew: false }) },
    { key: 'remove', label: 'Remove…', danger: true, onClick: () => setRemoving(block) },
  ]} />
  const loadButton = (key: string) => { const entry = sourceOf(key); return entry.load && !readOnly ? <button type="button" className="ghost" onClick={() => load(entry.load!)}>{loadLabel[entry.load]}</button> : null }
  // MYD-30: a block whose data source was removed from the app offers Remove block… at once (not in View as).
  const removedButton = (block: DashboardBlock) => removedSourceOf(block.source) && !readOnly ? <button type="button" className="ghost" onClick={() => setRemoving(block)}>Remove block…</button> : null
  const several = periodYears(period, currentYear).length > 1
  const years = [...new Set([currentYear - 3, currentYear - 2, currentYear - 1, currentYear, ...period.years])].sort((a, b) => a - b)
  const filtered = JSON.stringify(period) !== JSON.stringify(emptyPeriod())

  // UI-STANDARDS §1: who and which month as the intro, ＋ Add block… and Customize as the page actions.
  return <Page intro={`${name || my.me.email} · ${label}${arranged.hidden.length ? ` · ${arranged.hidden.length} hidden` : ''}`} actions={readOnly ? settingsGear ?? undefined : <>
    <button type="button" className="primary" disabled={Boolean(addReason)} title={addReason || undefined} onClick={addBlock}>＋ Add block…</button>
    <button type="button" className="ghost" aria-expanded={editing} onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Customize'}</button>
    {settingsGear}
  </>}>
    {readOnly && <Notice tone="info">View as shows the default My dashboard of the viewed role. A person’s own blocks and layout are private: nobody else sees them.</Notice>}
    {parsed.dropped.length > 0 && <Notice tone="warning">{parsed.dropped.join(' ')}</Notice>}
    {loadNote && <Notice tone="warning">{loadNote}</Notice>}
    {editing && !readOnly && <div className="layout-editor my-dash-editor" role="group" aria-label="Blocks of My dashboard">
      <ol>{arranged.order.map((id, index) => { const block = mine.blocks.find((entry) => entry.id === id); const text = labelOf(id); return <li key={id}>
        <label className="checkbox-label"><input type="checkbox" checked={!arranged.hidden.includes(id)} onChange={() => toggle(id)} />{text}</label>
        <small className="muted">{block ? `${blockTypeLabel(block.type)} · ${sourceOf(block.source).dataset.name}` : 'Built-in section'}</small>
        {block?.type !== 'kpi' && <SizeFields label={text} kind={block ? kindOf(block.type) : 'table'} size={block ? blockSize(block).size : sectionSize(id)} heightReason={!block || block.type === 'table' || block.type === 'narrative' ? 'Takes the height of its content.' : ''} onChange={(size) => resize(id, size)} />}
        <span className="button-row nowrap">
          <button type="button" className="ghost" aria-label={`Move ${text} up`} disabled={index === 0} onClick={() => move(id, -1)}>↑</button>
          <button type="button" className="ghost" aria-label={`Move ${text} down`} disabled={index === arranged.order.length - 1} onClick={() => move(id, 1)}>↓</button>
          {block && <button type="button" className="ghost" aria-label={`Edit ${text}`} onClick={() => setBlockEdit({ block, isNew: false })}>Edit…</button>}
          {block && <button type="button" className="text-button danger-text" aria-label={`Remove ${text}`} onClick={() => setRemoving(block)}>Remove…</button>}
        </span>
      </li> })}</ol>
      <div className="button-row">
        <button type="button" className="ghost" onClick={reset}>Reset to the default My dashboard</button>
        {canSetDefault && <button type="button" className="ghost" onClick={() => { setStatus('Saving…'); views.saveAsDefault().then((saved) => setStatus(saved.merged ? 'Saved as the default for everyone — merged with a change by someone else.' : 'The order of the sections saved as the default for everyone (your own blocks stay yours).'), (failure: unknown) => setStatus(`Not saved: ${failure instanceof Error ? failure.message : String(failure)}`)) }}>Use as default for everyone</button>}
      </div>
      <small className="muted">Only you see your blocks and layout. {views.inGit ? 'Kept with your personal views in Git, on every computer.' : 'Kept in this browser (connect Git storage and set your work email to keep it everywhere).'} {mine.blocks.length} of {maxMyBlocks} blocks of your own.</small>
    </div>}
    {status && <Notice tone={status.startsWith('Not saved') ? 'warning' : 'info'}>{status}</Notice>}
    {views.note && <Notice tone="warning">{views.note}</Notice>}
    {/* MYD-24: the period of the blocks (Year / Quarter / Month as On-Demand Dashboards); the sections keep the header month. */}
    {shownBlocks.length > 0 && <div className="ins-bar"><div className="dash-filters compact-filters" role="group" aria-label="Period of your blocks">
      <MultiSelect label="Year" emptyLabel={String(currentYear)} options={years.map((year) => [String(year), String(year)])} value={period.years.map(String)} onChange={(value) => setPeriod({ ...period, years: value.map(Number) })} />
      <MultiSelect label="Quarter" options={offeredQuarters(periodYears(period, currentYear)).map((quarter) => [quarter, several ? `Q${quarter.slice(6)} ${quarter.slice(0, 4)}` : `Q${quarter.slice(6)}`])} value={period.quarters} onChange={(value) => setPeriod({ ...period, quarters: value })} />
      <MultiSelect label="Month" options={offeredMonths(periodQuarters(period, currentYear)).map((entry) => [entry, several ? `${monthNames[Number(entry.slice(5)) - 1]} ${entry.slice(0, 4)}` : monthNames[Number(entry.slice(5)) - 1]])} value={period.months} onChange={(value) => setPeriod({ ...period, months: value })} />
      <button type="button" className="text-button" disabled={!filtered || readOnly} onClick={() => views.clearFilter(myDashboardViewKey)}>Reset filters</button>
    </div><p className="muted dsh-scope" role="status">Your blocks: {months.length === periodYears(period, currentYear).length * 12 ? `${periodYears(period, currentYear).join(', ')} (whole ${several ? 'years' : 'year'})` : months.map((entry) => `${monthNames[Number(entry.slice(5)) - 1]} ${entry.slice(0, 4)}`).join(', ')}. The built-in sections show {label}.</p></div>}
    {tiles.length > 0 && <Metrics>{tiles.map((block) => { const dataset = blockDataset(sourceOf(block.source).dataset, block); return <div key={block.id} className="my-dash-tile" data-block={block.id}><KpiTile dataset={dataset} block={block} narrowed={narrow(dataset, block)} />{loadButton(block.source)}{removedButton(block)}</div> })}</Metrics>}
    {panels.length > 0 && <ChartGrid className="od-insights my-dash-grid" entries={panels.map((id) => { const block = mine.blocks.find((entry) => entry.id === id); return block ? { id, kind: kindOf(block.type), size: blockSize(block).size } : { id, kind: 'table' as const, size: sectionSize(id) } })} titleOf={labelOf}
      onResize={(id, size) => { if (!readOnly) resize(id, size) }}>
      {panels.map((id) => {
        const block = mine.blocks.find((entry) => entry.id === id)
        if (!block) return <GridCell key={id} id={id} kind="table" title={labelOf(id)} size={sectionSize(id)} source={mine.sizes[id] ? 'viewer' : 'factory'} onResize={readOnly ? undefined : (size) => resize(id, size)} onReset={readOnly ? undefined : () => resize(id, undefined)}>
          {(cell) => <div className={`layout-section ${cell.className}`} style={{ ...cell.style, minWidth: 0 }} data-section={id}>{sectionNode[id]}{cell.footer}</div>}
        </GridCell>
        const dataset = blockDataset(sourceOf(block.source).dataset, block), sized = blockSize(block)
        const extra = loadButton(block.source) ?? removedButton(block)
        return <BlockPanel key={id} id={id} dataset={dataset} block={block} narrowed={narrow(dataset, block)} colors={mine.colors} size={sized.size} source={sized.own ? 'viewer' : 'factory'}
          onResize={readOnly ? undefined : (size) => resize(id, size)} onReset={readOnly ? undefined : () => resize(id, undefined)} action={extra || blockMenu(block) ? <>{extra}{blockMenu(block)}</> : undefined} />
      })}
    </ChartGrid>}
    {!arranged.shown.length && <p className="muted">Everything is hidden. Use Customize to show the sections again, or Reset to the default My dashboard.</p>}

    {blockEdit && <BlockDialog datasets={datasets} dashboard={{ schema: 1, kind: 'dashboard', id: 'my-dashboard', tabs: [], filters: [], blocks: mine.blocks, ...(mine.colors ? { colors: mine.colors } : {}) }} block={blockEdit.block} isNew={blockEdit.isNew} preview={narrow}
      saveNote="Kept with your personal views — only you see it." saveLabel="Save" onCancel={() => setBlockEdit(null)}
      onSave={async (block, colors) => { const next: MyDashboard = withBlock(mine, block); if (colors) next.colors = colors; else delete next.colors; save(next); setBlockEdit(null) }} />}
    {removing && <Modal eyebrow="MY DASHBOARD · BLOCK" title="Remove the block" onClose={() => setRemoving(null)}>
      <form onSubmit={(event) => { event.preventDefault(); const next = withoutBlock(mine, layout, removing.id); save(next.dashboard); setOrder(next.layout.order, next.layout.hidden); setRemoving(null) }}>
        <p>Remove <strong>{removing.title}</strong> ({blockTypeLabel(removing.type)}) from your dashboard? Its data source is not changed.</p>
        <div className="modal-actions"><button type="button" className="ghost" onClick={() => setRemoving(null)}>Cancel</button><button className="danger-button">Remove block</button></div>
      </form>
    </Modal>}
  </Page>
}
