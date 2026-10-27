import { windchillReleases } from '../windchillReleases'
import { SupportedReleasesTable } from '../components/DpMonthCounts'
import { useState } from 'react'
import { ReleaseQuadrants } from '../components/ReleaseQuadrants'
import { CapacityMetrics, MonthSections } from '../components/MonthOverview'
import { GapsPanel } from '../components/GapsPanel'
import { ScopeSwitch } from '../components/ScopeSwitch'
import { TeamFilterBar } from '../components/TeamFilterBar'
import { defaultStreamReleases, type ReleaseStream } from '../releaseOverview'
import { defaultStreams, exportForStream } from '../streams'
import { formatDate, formatDateTime, formatHours, monthName, todayIso } from '../format'
import type { WindchillWorkspace } from '../useWindchill'
import { ongoingWork, previousMonth, releaseComparison, workFlow } from '../pulseCheck'
import { timeWritingGaps, timeWritingMonth } from '../azureInsights'
import { capacityContext, capacityModel, inTeam, itemsForPerson, itemsForTeam, teamFiltered } from '../capacity'
import { isMine } from '../myWork'
import { usePersonScope, useTeamFilter } from '../usePersonScope'
import { EmptyState, Metric, Metrics, Page, Pill, TablePanel } from '../components/ui'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { MyWork } from '../useMyWork'
import type { Page as PageId } from './registry'
import type { PageProps } from './types'

type Tab = 'releases' | 'last' | 'ongoing' | 'current'
const tabKeys: Tab[] = ['releases', 'last', 'ongoing', 'current']
const tabKey = 'demand-planning-pulse-tab-v1'
const change = (now: number, before: number) => now === before ? <span className="muted">±0</span> : <span className={now > before ? 'positive' : 'negative'}>{now > before ? '+' : '−'}{Math.abs(now - before)}</span>

// Pulse Check: the selected month's approved releases per stream (moved from the Dashboard), and Last month — the month
// before the selected one: the Dashboard's "This month" picture for it, its releases next to the selected month's, the
// Features and User Stories created and closed, and its Time Writing gaps.
export function PulseCheckPage({ month, azure, store, my, navigate, windchill, openWindchill }: { month: string; azure: AzureWorkspace; store: PageProps['store']; my: MyWork; navigate: (page: PageId) => void; windchill: WindchillWorkspace; openWindchill: (id: string) => void }) {
  const [tab, setTabState] = useState<Tab>(() => { try { const saved = localStorage.getItem(tabKey) as Tab; return tabKeys.includes(saved) ? saved : 'releases' } catch { return 'releases' } })
  const setTab = (next: Tab) => { setTabState(next); try { localStorage.setItem(tabKey, next) } catch { /* convenience only */ } }
  const last = previousMonth(month)
  // The default streams, in order: DP, CP, IOCC, Content and Tool Validations from their connections, S&S IT (and
  // later ECP) from their Windchill exports.
  const exports = defaultStreams.filter((stream) => stream.source === 'windchill').map((stream) => ({ stream, view: exportForStream(stream, windchill.views) }))
  const streams = defaultStreamReleases(store.state, azure.connectionProfiles, month)
  const lastStreams = defaultStreamReleases(store.state, azure.connectionProfiles, last)
  const releases = (shown: ReleaseStream[], at: string) => <>
    {shown.length ? <ReleaseQuadrants streams={shown} month={at} /> : <EmptyState title="No Azure DevOps Server views under Release Details." detail="Add an on-prem connection shown in the menu (Settings → Azure DevOps); fetch it in the desktop app or load its data from Git." />}
    {shown.filter((stream) => stream.supportedReleases).map((stream) => <TablePanel key={`supported:${stream.id}`} title={`Supported Releases · ${stream.name} · ${monthName(at)}`} info={<p>Each release once that passed at least one milestone in {monthName(at)} — DT (Design Transfer), SFV (Start of Verification / Hardening), PRD (PRD Milestone) or RPE (Release Planning Event) — with that milestone's Status Done and its Date in the month (your time zone). A release passing several milestones in the month counts once; two rows with the same PsName and Release are one release. Completed Releases are those whose DT is among them.</p>} count={`${stream.supportedReleases!.length} release${stream.supportedReleases!.length === 1 ? '' : 's'} · ${stream.milestones ?? 0} milestone${stream.milestones === 1 ? '' : 's'}`} empty={stream.supportedReleases!.length ? undefined : stream.fetchedAt ? `No release passed a milestone in ${monthName(at)}.` : 'The DP view has not been fetched yet (Release Details → DP).'}>
      {stream.supportedReleases!.length > 0 && <SupportedReleasesTable releases={stream.supportedReleases!} />}
    </TablePanel>)}
    {exports.length > 0 && <TablePanel title="Windchill exports" info={<p>The Windchill streams (S&amp;S IT; ECP later): the export named like the stream, rows as last imported, and the unique releases read from the document names (release name, release number, then the document name). Open one for the release list, its columns, search and filters.</p>} count={`${exports.length} stream${exports.length === 1 ? '' : 's'}`}>
      <table><thead><tr><th>Stream</th><th>Rows</th><th>Releases</th><th>Imported</th><th /></tr></thead><tbody>{exports.map(({ stream, view }) => { const source = view ? windchill.sources.find((entry) => entry.viewId === view.id) : undefined; return <tr key={stream.name}><td><strong>{stream.name}</strong>{view?.exportFile && <small>{view.exportFile}</small>}</td><td>{source ? source.rows.length : '—'}</td><td>{source ? (() => { const found = windchillReleases(source.rows, source.columns.length ? source.columns : view?.columns ?? []); return <>{found.releases.length}<small>unique, from document names</small></> })() : '—'}</td><td>{view ? source ? formatDateTime(source.fetchedAt) : 'Not imported yet' : 'No export named like the stream yet'}</td><td><button type="button" className="text-button" onClick={() => openWindchill(view?.id ?? '')}>{view ? 'Open →' : 'Import →'}</button></td></tr> })}</tbody></table>
    </TablePanel>}
  </>
  const tabLabels: [Tab, string][] = [['releases', `Releases · ${monthName(last)}`], ['last', `Last month · ${monthName(last)}`], ['ongoing', 'Ongoing activities'], ['current', `Current month releases · ${monthName(month)}`]]
  return <Page>
    <div className="overview-tabs" role="tablist" aria-label="Pulse Check sections">{tabLabels.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={`backlog-tab ${tab === key ? 'backlog-tab-active' : ''}`} onClick={() => setTab(key)}>{label}</button>)}</div>
    {tab === 'releases' && releases(lastStreams, last)}
    {tab === 'last' && <LastMonth month={month} last={last} azure={azure} store={store} my={my} navigate={navigate} current={streams} />}
    {tab === 'ongoing' && <Ongoing azure={azure} month={month} absenceEpicId={capacityContext(store.state).absenceEpicId} />}
    {tab === 'current' && releases(streams, month)}
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
      {shown.length > 0 && <table><thead><tr><th>Stream</th><th>Item</th><th>State</th><th>Assigned to</th><th>Iteration</th><th>Target date</th><th>Booked {monthName(month)}</th></tr></thead><tbody>
        {shown.map(({ item, stream: name, feature, booked, overdue }) => <tr key={item.key}><td>{name}</td><td><a href={item.url} target="_blank" rel="noreferrer">#{item.id}</a> <strong className="inline">{item.title}</strong><small>{item.workItemType}{item.workItemType === 'User Story' && feature ? ` · ${feature.title}` : ''}</small></td><td><Pill tone="open">{item.state}</Pill></td><td>{item.assignedTo || <span className="muted">Unassigned</span>}</td><td><small className="plain">{item.iterationPath.split('\\').slice(1).join(' › ') || item.iterationPath}</small></td><td className={overdue ? 'negative' : ''}>{item.targetDate ? formatDate(item.targetDate) : '—'}{overdue && <small>past</small>}</td><td>{booked ? formatHours(booked) : '—'}</td></tr>)}
      </tbody></table>}
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
