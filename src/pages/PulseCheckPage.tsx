import { useState } from 'react'
import { ReleaseQuadrants } from '../components/ReleaseQuadrants'
import { CapacityMetrics, MonthSections } from '../components/MonthOverview'
import { GapsPanel } from '../components/GapsPanel'
import { ScopeSwitch } from '../components/ScopeSwitch'
import { TeamFilterBar } from '../components/TeamFilterBar'
import { releaseStreams } from '../releaseOverview'
import { backlogViews } from '../backlogViews'
import { formatDateTime, monthName } from '../format'
import type { WindchillWorkspace } from '../useWindchill'
import { flowTypes, previousMonth, releaseComparison, workFlow } from '../pulseCheck'
import { timeWritingGaps } from '../azureInsights'
import { capacityContext, capacityModel, inTeam, itemsForPerson, itemsForTeam, teamFiltered } from '../capacity'
import { isMine } from '../myWork'
import { usePersonScope, useTeamFilter } from '../usePersonScope'
import { EmptyState, Page, Pill, TablePanel } from '../components/ui'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { MyWork } from '../useMyWork'
import type { Page as PageId } from './registry'
import type { PageProps } from './types'

type Tab = 'releases' | 'last'
const tabKey = 'demand-planning-pulse-tab-v1'
const change = (now: number, before: number) => now === before ? <span className="muted">±0</span> : <span className={now > before ? 'positive' : 'negative'}>{now > before ? '+' : '−'}{Math.abs(now - before)}</span>

// Pulse Check: the selected month's approved releases per stream (moved from Overview), and Last month — the month
// before the selected one: Overview's "This month" picture for it, its releases next to the selected month's, the
// Features and User Stories created and closed, and its Time Writing gaps.
export function PulseCheckPage({ month, azure, store, my, navigate, windchill, openWindchill }: { month: string; azure: AzureWorkspace; store: PageProps['store']; my: MyWork; navigate: (page: PageId) => void; windchill: WindchillWorkspace; openWindchill: (id: string) => void }) {
  const [tab, setTabState] = useState<Tab>(() => { try { return localStorage.getItem(tabKey) === 'last' ? 'last' : 'releases' } catch { return 'releases' } })
  const setTab = (next: Tab) => { setTabState(next); try { localStorage.setItem(tabKey, next) } catch { /* convenience only */ } }
  const last = previousMonth(month)
  // Exactly the pages under Release Details: the Azure DevOps Server views shown in the menu and the Windchill exports.
  const serverViews = backlogViews(azure.connectionProfiles, azure.activeConnectionProfileId).filter((view) => view.onPrem && view.readOnly).map((view) => view.id)
  const exports = windchill.views.filter((view) => view.exportFile && view.showInMenu)
  const streams = releaseStreams(store.state, azure.connectionProfiles, month, undefined, serverViews)
  return <Page>
    <div className="overview-tabs" role="tablist" aria-label="Pulse Check sections">{([['releases', `Releases · ${monthName(month)}`], ['last', `Last month · ${monthName(last)}`]] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={`backlog-tab ${tab === key ? 'backlog-tab-active' : ''}`} onClick={() => setTab(key)}>{label}</button>)}</div>
    {tab === 'releases'
      ? <>
        {streams.length ? <ReleaseQuadrants streams={streams} month={month} /> : <EmptyState title="No Azure DevOps Server views under Release Details." detail="Add an on-prem connection shown in the menu (Settings → Azure DevOps); fetch it in the desktop app or load its data from Git." />}
        {exports.length > 0 && <TablePanel title="Windchill exports" info={<p>The Windchill exports under Release Details: rows as last imported. Open one for its columns, search and filters.</p>} count={`${exports.length} export${exports.length === 1 ? '' : 's'}`}>
          <table><thead><tr><th>Export</th><th>Rows</th><th>Imported</th><th /></tr></thead><tbody>{exports.map((view) => { const source = windchill.sources.find((entry) => entry.viewId === view.id); return <tr key={view.id}><td><strong>{view.name}</strong>{view.exportFile && <small>{view.exportFile}</small>}</td><td>{source ? source.rows.length : '—'}</td><td>{source ? formatDateTime(source.fetchedAt) : 'Not imported yet'}</td><td><button type="button" className="text-button" onClick={() => openWindchill(view.id)}>Open →</button></td></tr> })}</tbody></table>
        </TablePanel>}
      </>
      : <LastMonth month={month} last={last} azure={azure} store={store} my={my} navigate={navigate} current={streams} only={serverViews} />}
  </Page>
}

function LastMonth({ month, last, azure, store, my, navigate, current, only }: { month: string; last: string; azure: AzureWorkspace; store: PageProps['store']; my: MyWork; navigate: (page: PageId) => void; current: ReturnType<typeof releaseStreams>; only: string[] }) {
  const settings = capacityContext(store.state)
  // Same Team / Individual choice and team filter as Overview (shared in this browser).
  const personScope = usePersonScope('demand-planning-overview-view-v1', 'team', my)
  const [teamFilter, setTeamFilter] = useTeamFilter()
  const { scope, individual, who } = personScope
  const teamLabel = teamFiltered(teamFilter) ? [teamFilter.region, teamFilter.roles.join(', ')].filter(Boolean).join(' · ') : 'Team'
  const items = scope ? itemsForPerson(azure.items, scope, settings) : individual ? [] : itemsForTeam(azure.items, teamFilter, settings)
  const model = capacityModel(items, last, settings)
  const releases = releaseComparison(current, releaseStreams(store.state, azure.connectionProfiles, last, undefined, only))
  const flow = workFlow(azure.items, last, settings.absenceEpicId, undefined, (item) => scope ? isMine(item, scope) : !individual && inTeam(item.assignedTo, teamFilter, settings))
  const allGaps = timeWritingGaps(items, last)
  const gaps = scope ? { ...allGaps, storiesWithoutTask: allGaps.storiesWithoutTask.filter((story) => isMine(story, scope) || items.some((item) => item.parentId === story.id && item.workItemType === 'Task')) } : allGaps
  const lastName = monthName(last), monthLabel = monthName(month)
  return <>
    <ScopeSwitch scope={personScope} label="Last month for" note="Same choice as Overview. Only this person’s Tasks and work items." />
    {!individual && <TeamFilterBar filter={teamFilter} onChange={setTeamFilter} />}
    {individual && !scope ? <EmptyState title="Choose whose last month to show." detail="Pick a person above, or set your Azure email on the Time Writing connection to make “Me” the default." /> : <>
      <CapacityMetrics model={model} settings={settings} label={`${individual ? who : teamLabel} utilization · ${lastName}`} />
      <TablePanel title={`Releases · ${lastName} vs ${monthLabel}`} info={<p>Releases and documents approved per Azure DevOps Server view under Release Details, in {lastName} and in the selected month {monthLabel}, with the change. A view counts when its documents carry “Release x.y.z” in their paths. Not narrowed by Team / Individual.</p>} count={`${releases.length} stream${releases.length === 1 ? '' : 's'}`} empty={releases.length ? undefined : 'No release views fetched yet.'}>
        {releases.length > 0 && <table><thead><tr><th>Stream</th><th>Releases {lastName}</th><th>Documents {lastName}</th><th>Releases {monthLabel}</th><th>Documents {monthLabel}</th><th>Change (releases · documents)</th></tr></thead><tbody>
          {releases.map((row) => <tr key={row.name}><td><strong>{row.name}</strong></td><td>{row.previousReleases}</td><td>{row.previousDocuments}</td><td>{row.releases}</td><td>{row.documents}</td><td>{change(row.releases, row.previousReleases)} · {change(row.documents, row.previousDocuments)}</td></tr>)}
        </tbody></table>}
      </TablePanel>
      <TablePanel title={`Work closed and opened · ${lastName}`} info={<ul><li>Features and User Stories created in {lastName} (Created Date) and closed in it (Closed Date; an item in a finished state without one counts by its last change), per stream — the Epic above them — in your time zone.</li><li>Removed items and work under the absence Epic are left out.</li><li>Team counts the assignees in the team filter; Individual counts the person’s own items.</li></ul>}
        count={flowTypes.map((type) => `${type}s +${flow.totals[type].created} / ✓${flow.totals[type].closed}`).join(' · ')} empty={flow.streams.length ? undefined : `No Features or User Stories created or closed in ${lastName}.`}>
        {flow.streams.length > 0 && <table><thead><tr><th>Stream (Epic)</th><th>Features opened</th><th>Features closed</th><th>Stories opened</th><th>Stories closed</th></tr></thead><tbody>
          {flow.streams.map((stream) => <tr key={stream.key}><td>{stream.epic ? <a href={stream.epic.url} target="_blank" rel="noreferrer">#{stream.epic.id} {stream.title}</a> : stream.title}</td><td>{stream.counts.Feature.created}</td><td>{stream.counts.Feature.closed}</td><td>{stream.counts['User Story'].created}</td><td>{stream.counts['User Story'].closed}</td></tr>)}
          <tr className="matrix-total"><td>Total</td><td>{flow.totals.Feature.created}</td><td>{flow.totals.Feature.closed}</td><td>{flow.totals['User Story'].created}</td><td>{flow.totals['User Story'].closed}</td></tr>
        </tbody></table>}
        {flow.items.length > 0 && <details className="flow-items"><summary>The {flow.items.length} item{flow.items.length === 1 ? '' : 's'}</summary><ul>{flow.items.map(({ item, stream, change: kind }) => <li key={`${kind}-${item.key}`}><Pill tone={kind === 'closed' ? 'open' : 'info'}>{kind === 'closed' ? 'Closed' : 'Opened'}</Pill> <a href={item.url} target="_blank" rel="noreferrer">#{item.id} {item.title}</a> <small className="muted">{item.workItemType} · {stream}{item.assignedTo ? ` · ${item.assignedTo}` : ''}</small></li>)}</ul></details>}
      </TablePanel>
      <MonthSections items={items} month={last} settings={settings} navigate={navigate} />
      <GapsPanel gaps={gaps} month={last} />
    </>}
  </>
}
