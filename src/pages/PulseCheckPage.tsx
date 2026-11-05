import { windchillReleases, windchillSupported } from '../windchillReleases'
import { DataTable } from '../components/DataTable'
import { SupportedReleasesTable } from '../components/DpMonthCounts'
import { useMemo, useState } from 'react'
import { ReleaseQuadrants, SupportedSummary, type SupportedLine } from '../components/ReleaseQuadrants'
import { CapacityMetrics, MonthSections } from '../components/MonthOverview'
import { GapsPanel } from '../components/GapsPanel'
import { ScopeSwitch } from '../components/ScopeSwitch'
import { TeamFilterBar } from '../components/TeamFilterBar'
import { defaultStreamReleases, type ReleaseStream } from '../releaseOverview'
import { defaultStreams, windchillOptionsForView, windchillStreamExports } from '../streams'
import { formatDate, formatDateTime, formatHours, monthName, todayIso } from '../format'
import type { WindchillWorkspace } from '../useWindchill'
import { ongoingWork, previousMonth, releaseComparison, workFlow } from '../pulseCheck'
import { periodComparison, periodKinds, periodStreams, periodWorkFlow, previousPeriod, recentPeriods, type PeriodKind } from '../pulsePeriods'
import { timeWritingGaps, timeWritingMonth } from '../azureInsights'
import { capacityContext, capacityModel, inTeam, itemsForPerson, itemsForTeam, teamFiltered } from '../capacity'
import { isMine } from '../myWork'
import { usePersonScope, useTeamFilter } from '../usePersonScope'
import { EmptyState, Metric, Metrics, Page, Pill, TablePanel } from '../components/ui'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { GitStorage } from '../useGitStorage'
import type { MonthlyPackStore } from '../useMonthlyPack'
import { MonthlyPackPanel } from '../components/MonthlyPackPanel'
import type { MyWork } from '../useMyWork'
import type { Page as PageId } from './registry'
import type { PageProps } from './types'
import type { PersonalViewsStore } from '../usePersonalViews'

type Tab = 'releases' | 'last' | 'ongoing' | 'current' | 'pack'
const tabKeys: Tab[] = ['releases', 'last', 'ongoing', 'current', 'pack']
const tabKey = 'demand-planning-pulse-tab-v1'
const dpListKey = 'demand-planning-pulse-dp-list-v1'
const periodKey = 'demand-planning-pulse-period-v1'
const change = (now: number, before: number) => now === before ? <span className="muted">±0</span> : <span className={now > before ? 'positive' : 'negative'}>{now > before ? '+' : '−'}{Math.abs(now - before)}</span>

// Pulse Check: the selected month's approved releases per stream (moved from the Dashboard), and Last month — the month
// before the selected one: the Dashboard's "This month" picture for it, its releases next to the selected month's, the
// Features and User Stories created and closed, and its Time Writing gaps.
export function PulseCheckPage({ month, azure, store, my, navigate, windchill, openWindchill, git, pack, views }: { month: string; azure: AzureWorkspace; store: PageProps['store']; my: MyWork; navigate: (page: PageId) => void; windchill: WindchillWorkspace; openWindchill: (id: string) => void; git: GitStorage; pack: MonthlyPackStore; views?: PersonalViewsStore }) {
  const [tab, setTabState] = useState<Tab>(() => { try { const saved = localStorage.getItem(tabKey) as Tab; return tabKeys.includes(saved) ? saved : 'releases' } catch { return 'releases' } })
  const setTab = (next: Tab) => { setTabState(next); try { localStorage.setItem(tabKey, next) } catch { /* convenience only */ } }
  // QV-32: the DP Supported Releases list is folded by default (the Supported summary already names them); "Show list"
  // opens it, remembered per viewer.
  const [dpList, setDpListState] = useState(() => { try { return localStorage.getItem(dpListKey) === 'open' } catch { return false } })
  const setDpList = (open: boolean) => { setDpListState(open); try { localStorage.setItem(dpListKey, open ? 'open' : 'closed') } catch { /* convenience only */ } }
  const last = previousMonth(month)
  // QV-50: Month (the tabs below), or a calendar Quarter / Half-year / Year compared with the period before.
  const [period, setPeriodState] = useState<{ kind: PeriodKind; key: string }>(() => { try { const saved = (views?.filter('pulse', (value) => value && typeof value === 'object' ? value : undefined) ?? JSON.parse(localStorage.getItem(periodKey) ?? '{}')) as { kind?: PeriodKind; key?: string }; return periodKinds.some(([kind]) => kind === saved.kind) ? { kind: saved.kind!, key: saved.key ?? '' } : { kind: 'month', key: '' } } catch { return { kind: 'month', key: '' } } })
  const setPeriod = (next: { kind: PeriodKind; key: string }) => { setPeriodState(next); try { localStorage.setItem(periodKey, JSON.stringify(next)) } catch { /* convenience only */ } views?.setFilter('pulse', next) }
  // The default streams, in order: DP, CP, IOCC, Content and Tool Validations from their connections, S&S IT (and
  // later ECP) from their Windchill exports.
  // Each ECP export on its own line (CON-87).
  const exports = windchillStreamExports(windchill.views)
  const streams = defaultStreamReleases(store.state, azure.connectionProfiles, month)
  const lastStreams = defaultStreamReleases(store.state, azure.connectionProfiles, last)
  // The Supported summary (QV-33, QV-34, QV-36): DP's and IOCC's Supported Releases, the Tool Validations' unique tools, then the Windchill
  // streams' releases with a document dated in the month — every line for the tab's month (the month filter follows the
  // page: Releases shows last month, Current month releases the header month), in the default stream order.
  const supportedLines = (shown: ReleaseStream[], at: string): SupportedLine[] => [
    ...shown.filter((stream) => stream.supportedEntries).map((stream) => ({ name: stream.name, releases: stream.supportedEntries!.map((entry) => entry.label) })),
    // Tool Validations: the unique tools with a document in the tab's month (validated or supported), one entry per tool.
    ...shown.filter((stream) => { const rule = defaultStreams.find((def) => def.name === stream.name)?.rule; return rule === 'tool' }).map((stream) => ({ name: stream.name, releases: stream.releases.map((entry) => [entry.name, entry.release].filter(Boolean).join(' ')) })),
    ...exports.map(({ name, view }) => { const source = view ? windchill.sources.find((entry) => entry.viewId === view.id) : undefined; return { name, releases: source && view ? windchillSupported(source.rows, source.columns.length ? source.columns : view.columns, at, windchillOptionsForView(view)) : [] } }),
  ]
  const releases = (shown: ReleaseStream[], at: string) => <>
    {shown.length ? <ReleaseQuadrants streams={shown} month={at} supported={supportedLines(shown, at)} /> : <><EmptyState title="No Azure DevOps Server views under Release Details." detail="Add an on-prem connection shown in the menu (Settings → Azure DevOps); fetch it in the desktop app or load its data from Git." />{supportedLines(shown, at).some((line) => line.releases.length) && <SupportedSummary lines={supportedLines(shown, at)} month={at} />}</>}
    {shown.filter((stream) => stream.supportedReleases).map((stream) => <TablePanel key={`supported:${stream.id}`} title={`Supported Releases · ${stream.name} · ${monthName(at)}`} info={<p>Each release once that passed at least one milestone in {monthName(at)} — DT (Design Transfer), SFV (Start of Verification / Hardening), PRD (PRD Milestone) or RPE (Release Planning Event) — with that milestone's Status Done and its Date in the month (your time zone). A release passing several milestones in the month counts once; two rows with the same PsName and Release are one release. Completed Releases are those whose DT is among them.</p>} count={`${stream.supportedReleases!.length} release${stream.supportedReleases!.length === 1 ? '' : 's'} · ${stream.milestones ?? 0} milestone${stream.milestones === 1 ? '' : 's'}`} action={<button type="button" className="text-button" aria-expanded={dpList} onClick={() => setDpList(!dpList)}>{dpList ? 'Hide list' : 'Show list'}</button>} empty={!dpList ? undefined : stream.supportedReleases!.length ? undefined : stream.fetchedAt ? `No release passed a milestone in ${monthName(at)}.` : 'The DP view has not been fetched yet (Release Details → DP).'}>
      {dpList && stream.supportedReleases!.length > 0 && <SupportedReleasesTable releases={stream.supportedReleases!} />}
    </TablePanel>)}
    {exports.length > 0 && <TablePanel title="Windchill exports" info={<p>The Windchill streams (S&amp;S IT; ECP later): the export named like the stream, rows as last imported, and the unique releases read from the document names (release name, release number, then the document name). Open one for the release list, its columns, search and filters.</p>} count={`${exports.length} stream${exports.length === 1 ? '' : 's'}`}>
      <DataTable id="pulse:windchill-exports" rows={exports} rowKey={(entry) => entry.view?.id ?? entry.name} exportName="Windchill exports" columns={[
        { id: 'stream', label: 'Stream', value: ({ name }) => name, render: ({ name, view }) => <><strong>{name}</strong>{view?.exportFile && <small>{view.exportFile}</small>}</> },
        { id: 'rows', label: 'Rows', align: 'right', value: ({ view }) => { const source = view ? windchill.sources.find((entry) => entry.viewId === view.id) : undefined; return source ? source.rows.length : '' } },
        { id: 'releases', label: 'Releases', align: 'right', value: ({ view }) => { const source = view ? windchill.sources.find((entry) => entry.viewId === view.id) : undefined; return source && view ? windchillReleases(source.rows, source.columns.length ? source.columns : view.columns, windchillOptionsForView(view)).releases.length : '' } },
        { id: 'imported', label: 'Imported', value: ({ view }) => { const source = view ? windchill.sources.find((entry) => entry.viewId === view.id) : undefined; return source?.fetchedAt ?? '' }, render: ({ view }) => { const source = view ? windchill.sources.find((entry) => entry.viewId === view.id) : undefined; return view ? source ? formatDateTime(source.fetchedAt) : 'Not imported yet' : 'No export named like the stream yet' } },
        { id: 'open', label: '', sortable: false, export: false, render: ({ view }) => <button type="button" className="text-button" onClick={() => openWindchill(view?.id ?? '')}>{view ? 'Open →' : 'Import →'}</button> },
      ]} />
    </TablePanel>}
  </>
  const tabLabels: [Tab, string][] = [['releases', `Releases · ${monthName(last)}`], ['last', `Last month · ${monthName(last)}`], ['ongoing', 'Ongoing activities'], ['current', `Current month releases · ${monthName(month)}`], ['pack', `Monthly pack · ${monthName(last)}`]]
  const choices = period.kind === 'month' ? [] : recentPeriods(period.kind, last)
  const chosen = choices.find((entry) => entry.key === period.key) ?? choices[0]
  const periodBar = <div className="button-row pulse-period" role="group" aria-label="Pulse Check period">
    <label className="inline-select">Period<select value={period.kind} onChange={(event) => setPeriod({ kind: event.target.value as PeriodKind, key: '' })}>{periodKinds.map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label>
    {chosen && <label className="inline-select">{periodKinds.find(([kind]) => kind === period.kind)?.[1]}<select value={chosen.key} onChange={(event) => setPeriod({ kind: period.kind, key: event.target.value })}>{choices.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}</select></label>}
  </div>
  if (chosen) {
    const before = previousPeriod(chosen)
    const windchillLines = (at: string) => exports.map(({ name, view }) => { const source = view ? windchill.sources.find((entry) => entry.viewId === view.id) : undefined; return { name, releases: source && view ? windchillSupported(source.rows, source.columns.length ? source.columns : view.columns, at, windchillOptionsForView(view)) : [] } })
    const of = (months: string[]) => periodStreams(months.map((at) => defaultStreamReleases(store.state, azure.connectionProfiles, at)), months.map(windchillLines))
    return <Page>{periodBar}<PeriodPulse label={chosen.label} previous={before.label} months={chosen.months} rows={periodComparison(of(chosen.months), of(before.months))} azure={azure} absenceEpicId={capacityContext(store.state).absenceEpicId} /></Page>
  }
  return <Page>
    {periodBar}
    <div className="overview-tabs" role="tablist" aria-label="Pulse Check sections">{tabLabels.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={`backlog-tab ${tab === key ? 'backlog-tab-active' : ''}`} onClick={() => setTab(key)}>{label}</button>)}</div>
    {tab === 'releases' && releases(lastStreams, last)}
    {tab === 'last' && <LastMonth month={month} last={last} azure={azure} store={store} my={my} navigate={navigate} current={streams} />}
    {tab === 'ongoing' && <Ongoing azure={azure} month={month} absenceEpicId={capacityContext(store.state).absenceEpicId} />}
    {tab === 'current' && releases(streams, month)}
    {tab === 'pack' && <MonthlyPackPanel month={last} azure={azure} store={store} git={git} pack={pack} windchill={windchill} />}
  </Page>
}

// Features and User Stories in progress now, per stream, with this month's booked hours and overdue Target Dates.
function Ongoing({ azure, month, absenceEpicId }: { azure: AzureWorkspace; month: string; absenceEpicId: number }) {
  const today = todayIso()
  const work = ongoingWork(azure.items, month, today, timeWritingMonth, absenceEpicId)
  const [stream, setStream] = useState('')
  const shown = stream ? work.items.filter((entry) => entry.stream === stream) : work.items
  return <>
    <Metrics>
      <Metric label="Features in progress" value={work.features} />
      <Metric label="User Stories in progress" value={work.stories} />
      <Metric label="People" value={work.people} hint="Assigned to in-progress items" />
      <Metric label="Past Target Date" value={work.overdue} tone={work.overdue ? 'negative' : undefined} hint="Still in progress after their Target Date" />
    </Metrics>
    <TablePanel title="Ongoing activities" info={<ul><li>Features and User Stories whose State is Active, In Progress, Committed or Doing, per stream (the Epic above them); work under the absence Epic is left out.</li><li>Booked = Completed Work in {monthName(month)} on the month's Time Writing Tasks below the item.</li><li>Past Target Date = still in progress after the Target Date.</li></ul>}
      count={`${shown.length} of ${work.items.length}`} action={<label className="inline-select">Stream<select value={stream} onChange={(event) => setStream(event.target.value)}><option value="">All streams</option>{work.streams.map((name) => <option key={name}>{name}</option>)}</select></label>}
      empty={shown.length ? undefined : 'Nothing in progress.'}>
      {shown.length > 0 && <DataTable id="pulse:ongoing" rows={shown} rowKey={(row) => row.item.key} exportName={`Ongoing activities ${month}`} columns={[
        { id: 'stream', label: 'Stream', value: (row) => row.stream },
        { id: 'item', label: 'Item', value: (row) => `#${row.item.id} ${row.item.title}`, render: ({ item, feature }) => <><a href={item.url} target="_blank" rel="noreferrer">#{item.id}</a> <strong className="inline">{item.title}</strong><small>{item.workItemType}{item.workItemType === 'User Story' && feature ? ` · ${feature.title}` : ''}</small></> },
        { id: 'type', label: 'Type', value: (row) => row.item.workItemType, defaultHidden: true },
        { id: 'state', label: 'State', value: (row) => row.item.state, render: (row) => <Pill tone="open">{row.item.state}</Pill> },
        { id: 'assigned', label: 'Assigned to', value: (row) => row.item.assignedTo, render: (row) => row.item.assignedTo || <span className="muted">Unassigned</span> },
        { id: 'iteration', label: 'Iteration', value: (row) => row.item.iterationPath.split('\\').slice(1).join(' › ') || row.item.iterationPath, render: (row) => <small className="plain">{row.item.iterationPath.split('\\').slice(1).join(' › ') || row.item.iterationPath}</small> },
        { id: 'target', label: 'Target date', value: (row) => row.item.targetDate ?? '', firstSortDesc: true, className: '', render: (row) => <span className={row.overdue ? 'negative' : ''}>{row.item.targetDate ? formatDate(row.item.targetDate) : '—'}{row.overdue && <small>past</small>}</span> },
        { id: 'booked', label: `Booked ${monthName(month)}`, align: 'right', firstSortDesc: true, value: (row) => row.booked || '', render: (row) => row.booked ? formatHours(row.booked) : '—' },
      ]} />}
    </TablePanel>
  </>
}

function LastMonth({ month, last, azure, store, my, navigate, current }: { month: string; last: string; azure: AzureWorkspace; store: PageProps['store']; my: MyWork; navigate: (page: PageId) => void; current: ReleaseStream[] }) {
  const settings = capacityContext(store.state)
  // Same Team / Individual choice and team filter as the Dashboard (shared in this browser).
  const personScope = usePersonScope('demand-planning-overview-view-v1', 'team', my)
  const [teamFilter, setTeamFilter] = useTeamFilter()
  const { scope, individual, who } = personScope
  const teamLabel = teamFiltered(teamFilter) ? [teamFilter.region, teamFilter.roles.join(', ')].filter(Boolean).join(' · ') : 'Team'
  const items = scope ? itemsForPerson(azure.items, scope, settings) : individual ? [] : itemsForTeam(azure.items, teamFilter, settings)
  const model = capacityModel(items, last, settings)
  const releases = releaseComparison(current, defaultStreamReleases(store.state, azure.connectionProfiles, last))
  const flow = workFlow(azure.items, last, settings.absenceEpicId, undefined, (item) => scope ? isMine(item, scope) : !individual && inTeam(item.assignedTo, teamFilter, settings))
  const allGaps = timeWritingGaps(items, last)
  const gaps = scope ? { ...allGaps, storiesWithoutTask: allGaps.storiesWithoutTask.filter((story) => isMine(story, scope) || items.some((item) => item.parentId === story.id && item.workItemType === 'Task')) } : allGaps
  const lastName = monthName(last), monthLabel = monthName(month)
  return <>
    <ScopeSwitch scope={personScope} label="Last month for" note="Same choice as the Dashboard. Only this person’s Tasks and work items." />
    {!individual && <TeamFilterBar filter={teamFilter} onChange={setTeamFilter} />}
    {individual && !scope ? <EmptyState title="Choose whose last month to show." detail="Pick a person above, or set your Azure email on the Time Writing connection to make “Me” the default." /> : <>
      <CapacityMetrics model={model} settings={settings} label={`${individual ? who : teamLabel} utilization · ${lastName}`} />
      <TablePanel title={`Releases · ${lastName} vs ${monthLabel}`} info={<p>Releases and documents approved per Azure DevOps Server view under Release Details, in {lastName} and in the selected month {monthLabel}, with the change. A view counts when its documents carry “Release x.y.z” in their paths. DP counts from its own query: Completed Releases (DT, Design Transfer: DDT Done with its DDT Date in the month) and Supported Releases (DT, SFV = Start of Verification / Hardening, PRD = PRD Milestone and RPE = Release Planning Event, Done in the month — each release once) in place of documents. Not narrowed by Team / Individual.</p>} count={`${releases.length} stream${releases.length === 1 ? '' : 's'}`} empty={releases.length ? undefined : 'No release views fetched yet.'}>
        {releases.length > 0 && <table><thead><tr><th>Stream</th><th>Releases {lastName}</th><th>Documents {lastName}</th><th>Releases {monthLabel}</th><th>Documents {monthLabel}</th><th>Change (releases · documents)</th></tr></thead><tbody>
          {releases.map((row) => <tr key={row.name}><td><strong>{row.name}</strong></td><td>{row.previousReleases}{row.previousSupported != null && <small>completed</small>}</td><td>{row.previousSupported != null ? <>{row.previousSupported}<small>supported</small></> : row.previousDocuments}</td><td>{row.releases}{row.supported != null && <small>completed</small>}</td><td>{row.supported != null ? <>{row.supported}<small>supported</small></> : row.documents}</td><td>{change(row.releases, row.previousReleases)} · {row.supported != null ? change(row.supported, row.previousSupported ?? 0) : change(row.documents, row.previousDocuments)}</td></tr>)}
        </tbody></table>}
      </TablePanel>
      <TablePanel title={`Work closed and opened · ${lastName}`} info={<ul><li>Features and User Stories created in {lastName} (Created Date) and closed in it (Closed Date; an item in a finished state without one counts by its last change), per stream — the Epic above them — in your time zone.</li><li>Removed items and work under the absence Epic are left out.</li><li>Team counts the assignees in the team filter; Individual counts the person’s own items.</li></ul>}
        count={`Features +${flow.totals.Feature.created} / ✓${flow.totals.Feature.closed} · Stories +${flow.totals['User Story'].created} / ✓${flow.totals['User Story'].closed}`} empty={flow.streams.length ? undefined : `No Features or User Stories created or closed in ${lastName}.`}>
        {flow.streams.length > 0 && <table><thead><tr><th>Stream (Epic)</th><th>Features opened</th><th>Features closed</th><th>Stories opened</th><th>Stories closed</th></tr></thead><tbody>
          {flow.streams.map((stream) => <tr key={stream.key}><td>{stream.epic ? <a href={stream.epic.url} target="_blank" rel="noreferrer">#{stream.epic.id} {stream.title}</a> : stream.title}</td><td>{stream.counts.Feature.created}</td><td>{stream.counts.Feature.closed}</td><td>{stream.counts['User Story'].created}</td><td>{stream.counts['User Story'].closed}</td></tr>)}
          <tr className="matrix-total"><td>Total</td><td>{flow.totals.Feature.created}</td><td>{flow.totals.Feature.closed}</td><td>{flow.totals['User Story'].created}</td><td>{flow.totals['User Story'].closed}</td></tr>
        </tbody></table>}
        {flow.items.length > 0 && <details className="flow-items"><summary>The {flow.items.length} item{flow.items.length === 1 ? '' : 's'}</summary><ul>{flow.items.map(({ item, stream, change: kind }) => <li key={`${kind}-${item.key}`}><Pill tone={kind === 'closed' ? 'open' : 'info'}>{kind === 'closed' ? 'Closed' : 'Opened'}</Pill> <a href={item.url} target="_blank" rel="noreferrer">#{item.id} {item.title}</a> <small className="muted">{item.workItemType} · {stream}{item.assignedTo ? ` · ${item.assignedTo}` : ''}</small></li>)}</ul></details>}
      </TablePanel>
      <MonthSections items={items} month={last} settings={settings} navigate={navigate} utilizationOnly />
      <GapsPanel gaps={gaps} month={last} />
    </>}
  </>
}

// A quarter, half-year or year (QV-50): each stream's releases in the period (each release once) against the period
// before, and the Features and User Stories opened and closed in it.
function PeriodPulse({ label, previous, months, rows, azure, absenceEpicId }: { label: string; previous: string; months: string[]; rows: ReturnType<typeof periodComparison>; azure: AzureWorkspace; absenceEpicId: number }) {
  const monthsKey = months.join(',')
  const flow = useMemo(() => periodWorkFlow(azure.items, monthsKey.split(','), absenceEpicId), [azure.items, monthsKey, absenceEpicId])
  const total = rows.reduce((sum, row) => sum + row.releases, 0), totalBefore = rows.reduce((sum, row) => sum + row.previousReleases, 0)
  const elapsed = months.filter((entry) => entry <= todayIso().slice(0, 7)).length
  return <>
    <Metrics>
      <Metric label={`Releases · ${label}`} value={total} hint={`${previous}: ${totalBefore}`} />
      <Metric label="Change" value={<>{change(total, totalBefore)}</>} hint={`against ${previous}`} />
      <Metric label="Features closed" value={flow.totals.Feature.closed} hint={`${flow.totals.Feature.created} opened`} />
      <Metric label="User Stories closed" value={flow.totals['User Story'].closed} hint={`${flow.totals['User Story'].created} opened`} />
    </Metrics>
    {elapsed < months.length && <p className="muted">{label} is still running: {elapsed} of its {months.length} months so far.</p>}
    <TablePanel title={`Releases · ${label} vs ${previous}`} info={<ul><li>Per stream, the releases of every month of {label} ({months.length} months), each release once however many months it appears in; documents add up. DP counts its Completed Releases, and its Supported Releases once each.</li><li>The Windchill streams count the releases with a date in each month.</li><li>{previous} is the period of the same length just before.</li></ul>}
      empty={rows.length ? undefined : 'No release views under Release Details.'}>
      {rows.length > 0 && <table><thead><tr><th>Stream</th><th>Releases {label}</th><th>Releases {previous}</th><th>Change</th><th>Documents / supported {label}</th></tr></thead><tbody>
        {rows.map((row) => <tr key={row.name}><td><strong>{row.name}</strong>{row.list.length > 0 && <details><summary><small>{row.list.length} release{row.list.length === 1 ? '' : 's'}</small></summary><small className="plain">{row.list.join(' · ')}</small></details>}</td><td>{row.releases}</td><td>{row.previousReleases}</td><td>{change(row.releases, row.previousReleases)}</td><td>{row.supported != null ? <>{row.supported}<small>supported</small></> : row.documents}</td></tr>)}
        <tr className="matrix-total"><td>Total</td><td>{total}</td><td>{totalBefore}</td><td>{change(total, totalBefore)}</td><td /></tr>
      </tbody></table>}
    </TablePanel>
    <TablePanel title={`Work closed and opened · ${label}`} info="Features and User Stories created (Created Date) and closed (Closed Date) in the months of the period, per stream — the Epic above them. Removed items and work under the absence Epic are left out."
      count={`Features +${flow.totals.Feature.created} / ✓${flow.totals.Feature.closed} · Stories +${flow.totals['User Story'].created} / ✓${flow.totals['User Story'].closed}`} empty={flow.streams.length ? undefined : `No Features or User Stories created or closed in ${label}.`}>
      {flow.streams.length > 0 && <table><thead><tr><th>Stream (Epic)</th><th>Features opened</th><th>Features closed</th><th>Stories opened</th><th>Stories closed</th></tr></thead><tbody>
        {flow.streams.map((stream) => <tr key={stream.key}><td>{stream.epic ? <a href={stream.epic.url} target="_blank" rel="noreferrer">#{stream.epic.id} {stream.title}</a> : stream.title}</td><td>{stream.counts.Feature.created}</td><td>{stream.counts.Feature.closed}</td><td>{stream.counts['User Story'].created}</td><td>{stream.counts['User Story'].closed}</td></tr>)}
        <tr className="matrix-total"><td>Total</td><td>{flow.totals.Feature.created}</td><td>{flow.totals.Feature.closed}</td><td>{flow.totals['User Story'].created}</td><td>{flow.totals['User Story'].closed}</td></tr>
      </tbody></table>}
    </TablePanel>
  </>
}
