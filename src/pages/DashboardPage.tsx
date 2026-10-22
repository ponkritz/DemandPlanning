import { useState } from 'react'
import { EmptyState, Metric, Metrics, Page, Panel, Pill, TablePanel, type Tone } from '../components/ui'
import { HoursTrendChart } from '../components/HoursTrendChart'
import { DonutChart, EpicBulletChart, EpicMixChart, ParetoChart, UtilizationChart, UtilizationHeatmap } from '../components/WorkloadCharts'
import { epicColors, shortFeatureTitle } from '../chartUtils'
import { ScopeSwitch } from '../components/ScopeSwitch'
import { usePersonScope } from '../usePersonScope'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { MyWork } from '../useMyWork'
import { TeamFilterBar } from '../components/TeamFilterBar'
import { capacityContext, capacityModel, itemsForPerson, itemsForTeam, regions, resourceRoles, teamFiltered, type TeamFilter, monthlyHours, problemBreakdown, absenceKinds, type LoadStatus } from '../capacity'
import { formatHours, formatPercent, monthName } from '../format'
import type { Page as PageId } from './registry'
import type { PageProps } from './types'

const statusTone: Record<LoadStatus, Tone> = { 'Overloaded': 'danger', 'Balanced': 'open', 'Has capacity': 'info', 'No bookings': 'neutral' }
const maxMatrixStreams = 8
type Level = 'feature' | 'epic'

function LevelToggle({ value, onChange }: { value: Level; onChange: (value: Level) => void }) {
  return <div className="viz-range" role="group" aria-label="Group by">{(['feature', 'epic'] as const).map((level) => <button key={level} type="button" className={value === level ? 'primary' : 'ghost'} aria-pressed={value === level} onClick={() => onChange(level)}>By {level === 'feature' ? 'Feature' : 'Epic'}</button>)}</div>
}

export function DashboardPage({ month, azure, navigate, store, setMonth, my }: { month: string; azure: AzureWorkspace; navigate: (page: PageId) => void; store: PageProps['store']; setMonth?: (month: string) => void; my: MyWork }) {
  const settings = capacityContext(store.state)
  const personScope = usePersonScope('demand-planning-overview-view-v1', 'team', my)
  // Two tabs: this month's capacity picture, and the monthly-review trends; the last one opened is remembered.
  const [tab, setTabState] = useState<'month' | 'trends'>(() => { try { return localStorage.getItem('demand-planning-overview-tab-v1') === 'trends' ? 'trends' : 'month' } catch { return 'month' } })
  const setTab = (next: 'month' | 'trends') => { setTabState(next); try { localStorage.setItem('demand-planning-overview-tab-v1', next) } catch { /* convenience only */ } }
  const { scope, individual, who } = personScope
  // Team view: region and roles (remembered in this browser).
  const [teamFilter, setTeamFilterState] = useState<TeamFilter>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('demand-planning-overview-team-filter-v1') ?? '{}') as Partial<TeamFilter>
      return { region: regions.find((region) => region === saved.region), roles: Array.isArray(saved.roles) ? resourceRoles.filter((role) => saved.roles!.includes(role)) : [] }
    } catch { return { roles: [] } }
  })
  const setTeamFilter = (next: TeamFilter) => { setTeamFilterState(next); try { localStorage.setItem('demand-planning-overview-team-filter-v1', JSON.stringify(next)) } catch { /* convenience only */ } }
  const teamLabel = teamFiltered(teamFilter) ? [teamFilter.region, teamFilter.roles.join(', ')].filter(Boolean).join(' · ') : 'Team'
  const items = scope ? itemsForPerson(azure.items, scope, settings) : individual ? [] : itemsForTeam(azure.items, teamFilter, settings)
  const profileLine = (name: string) => [settings.profiles?.[name]?.role, settings.profiles?.[name]?.region].filter(Boolean).join(' · ')
  const model = capacityModel(items, month, settings)
  const [span, setSpan] = useState<6 | 12>(12)
  const trend = monthlyHours(items, month, span, settings)
  const trendTotals = trend.filter((point) => point.actual != null)
  const fundedOver = Math.max(0, model.totals.work + model.totals.absence - model.totals.funded)
  const problems = problemBreakdown(items, trend.map((point) => point.month), settings)
  const [overrunLevel, setOverrunLevel] = useState<Level>('feature')
  const [adhocLevel, setAdhocLevel] = useState<Level>('epic')
  const matrixMax = Math.max(1, ...model.people.flatMap((person) => person.streams.map((stream) => stream.work)))
  // Epic colours come from a fixed 12-month window so switching 6/12 months never repaints an Epic.
  const colors = epicColors(span === 12 ? trend : monthlyHours(items, month, 12, settings))
  const matrixStreams = model.streams.slice(0, maxMatrixStreams)
  const otherStreams = model.streams.slice(maxMatrixStreams)
  const personOther = (streams: typeof model.people[number]['streams']) => streams.filter((stream) => otherStreams.some((other) => other.key === stream.key)).reduce((sum, stream) => sum + stream.work, 0)
  return <Page>
    <ScopeSwitch scope={personScope} label="Overview for" note="Only this person’s Tasks; regional holidays still apply by region." />
    {!individual && <TeamFilterBar filter={teamFilter} onChange={setTeamFilter} />}
    {individual && !scope ? <EmptyState title="Choose whose overview to show." detail="Pick a person above, or set your Azure email on the Time Writing connection to make “Me” the default." /> : <>
    <Metrics>
      <Metric label={individual ? `${who} · utilization` : `${teamLabel} utilization`} value={formatPercent(model.totals.utilization)} hint={`${formatHours(model.totals.work)}h booked of ${formatHours(model.totals.available)}h available`} tone={model.totals.utilization != null && model.totals.utilization >= settings.overloadedAt ? 'negative' : undefined} />
      <Metric label="Overloaded" value={model.counts.overloaded} hint={`≥ ${settings.overloadedAt}% of available hours`} tone={model.counts.overloaded ? 'negative' : undefined} />
      <Metric label="Has capacity" value={model.counts.hasCapacity} hint={`< ${settings.availableBelow}% of available hours`} tone={model.counts.hasCapacity ? 'positive' : undefined} />
      <Metric label="Absence" value={formatHours(model.totals.absence)} hint={absenceKinds.filter((kind) => model.totals.absenceByKind[kind]).map((kind) => `${kind} ${formatHours(model.totals.absenceByKind[kind])}h`).join(' · ') || `Under Epic #${settings.absenceEpicId}`} />
    </Metrics>
    <div className="overview-tabs" role="tablist" aria-label="Overview sections">{([['month', `This month · ${monthName(month)}`], ['trends', 'Trends']] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={`backlog-tab ${tab === key ? 'backlog-tab-active' : ''}`} onClick={() => setTab(key)}>{label}</button>)}</div>
    {tab === 'month' ? <>
    <div className="overview-stack">
      <TablePanel title="Who has capacity" detail={`${monthName(month)} · ${model.workingDays} working days × ${settings.hoursPerDay}h = ${formatHours(model.fundedPerPerson)}h funded per person, less absence.`} count={`${model.people.length} people`} empty={model.people.length ? undefined : 'No Time Writing Tasks for this month.'}>
        <table><thead><tr><th>Person</th><th>Status</th><th>Available</th><th>Planned</th><th>Booked</th><th>Utilization</th><th>Main stream</th></tr></thead><tbody>{model.people.map((person) => <tr key={person.name}><td><strong>{person.name}</strong>{profileLine(person.name) && <small>{profileLine(person.name)}</small>}{person.absence > 0 && <small>{formatHours(person.absence)}h absence</small>}</td><td><Pill tone={statusTone[person.status]}>{person.status}</Pill></td><td>{formatHours(person.available)}</td><td>{formatHours(person.planned)}</td><td>{formatHours(person.work)}</td><td><div className="load"><div className="progress"><i className={person.status === 'Overloaded' ? 'over' : ''} style={{ width: `${Math.min(100, person.utilization ?? 0)}%` }} /></div><span>{formatPercent(person.utilization)}</span></div></td><td>{person.streams[0]?.title ?? '—'}{person.streams.length > 1 && <small>+{person.streams.length - 1} more</small>}</td></tr>)}</tbody></table>
      </TablePanel>
      <TablePanel title="Streams of work" detail="Epics with booked hours this month. Absence is excluded." count={`${model.streams.length} streams`} empty={model.streams.length ? undefined : 'No booked hours this month.'}>
        <table><thead><tr><th>Stream (Epic)</th><th>Booked</th><th>Share</th><th>Planned</th><th>People</th></tr></thead><tbody>{model.streams.map((stream) => <tr key={stream.key}><td>{stream.epic ? <a href={stream.epic.url} target="_blank" rel="noreferrer">#{stream.epic.id} {stream.title}</a> : stream.title}<small>{stream.features} feature{stream.features === 1 ? '' : 's'}</small></td><td>{formatHours(stream.work)}</td><td><div className="load"><div className="progress"><i style={{ width: `${stream.share ?? 0}%` }} /></div><span>{formatPercent(stream.share, 0)}</span></div></td><td>{formatHours(stream.planned)}</td><td>{stream.people}</td></tr>)}</tbody></table>
      </TablePanel>
    </div>
    <Panel className="viz-panel" title={`Hours by Epic · ${monthName(month)}`} detail="Bar = booked hours, tick = planned hours; share of the month's booked hours on the right. Absence is excluded.">
          {model.streams.length ? <EpicBulletChart streams={model.streams} colors={colors} /> : <EmptyState title="No booked hours this month." />}
    </Panel>
    <div className="dashboard-grid viz-grid-2">
      <Panel className="viz-panel" title={`Funded hours · ${monthName(month)}`} detail={fundedOver > 0 ? `Booked plus absence exceeds funded hours by ${formatHours(fundedOver)}h, so the ring shows booked and absence only.` : 'Where the team’s funded hours went: booked work, absence and unbooked capacity.'}>
        {model.totals.funded > 0 ? <DonutChart label="Funded hours" centerValue={`${formatHours(model.totals.funded)}h`} centerLabel="funded" segments={[{ key: 'booked', label: 'Booked work', value: model.totals.work, color: 'var(--viz-series-1)' }, { key: 'absence', label: 'Absence', value: model.totals.absence, color: 'var(--viz-series-4)' }, { key: 'unbooked', label: 'Unbooked capacity', value: Math.max(0, model.totals.funded - model.totals.work - model.totals.absence), color: 'var(--viz-other)' }]} /> : <EmptyState title="No funded hours this month." />}
      </Panel>
      <Panel className="viz-panel" title={`Absence · ${monthName(month)}`} detail={`Completed Work under Epic #${settings.absenceEpicId}; regional holidays apply to everyone mapped to that region`}>
        {model.totals.absence > 0 ? <DonutChart label="Absence" centerValue={`${formatHours(model.totals.absence)}h`} centerLabel="absence" segments={absenceKinds.map((kind, index) => ({ key: kind, label: kind, value: model.totals.absenceByKind[kind], color: index < 4 ? `var(--viz-series-${index + 1})` : 'var(--viz-other)' }))} /> : <EmptyState title="No absence booked." detail="Hours under the absence Epic appear here split by PTO, Sick Leave, Unplanned Leave and regional public holidays." />}
        {model.people.filter((person) => person.absence > 0).length > 0 && <p className="muted">{model.people.filter((person) => person.absence > 0).map((person) => `${person.name} ${formatHours(person.absence)}h`).join(' · ')}</p>}
      </Panel>
    </div>
    <TablePanel className="matrix" title="Hours by person and stream" detail={otherStreams.length ? `Top ${maxMatrixStreams} streams by hours; ${otherStreams.length} smaller stream(s) grouped under Other. Darker cells = more hours.` : 'Booked hours (Completed Work) per person and Epic; darker cells = more hours.'} empty={model.people.length && model.streams.length ? undefined : 'Nothing to break down yet.'}>
      {model.people.length > 0 && model.streams.length > 0 && <div className="azure-table"><table><thead><tr><th>Person</th>{matrixStreams.map((stream) => <th key={stream.key} title={stream.title}>{stream.title}</th>)}{otherStreams.length > 0 && <th>Other</th>}<th>Absence</th><th>Total</th></tr></thead><tbody>{model.people.map((person) => <tr key={person.name}><td><strong>{person.name}</strong></td>{matrixStreams.map((stream) => { const cell = person.streams.find((item) => item.key === stream.key); return <td key={stream.key} className={cell ? 'viz-shade' : 'muted'} style={cell ? { background: `color-mix(in srgb, var(--viz-diverge-lo) ${Math.round(cell.work / matrixMax * 40)}%, transparent)` } : undefined}>{cell ? formatHours(cell.work) : '·'}</td> })}{otherStreams.length > 0 && <td>{formatHours(personOther(person.streams)) || '·'}</td>}<td>{person.absence ? formatHours(person.absence) : '·'}</td><td><strong>{formatHours(person.work)}</strong></td></tr>)}<tr className="matrix-total"><td>Total</td>{matrixStreams.map((stream) => <td key={stream.key}>{formatHours(stream.work)}</td>)}{otherStreams.length > 0 && <td>{formatHours(otherStreams.reduce((sum, stream) => sum + stream.work, 0))}</td>}<td>{formatHours(model.totals.absence)}</td><td><strong>{formatHours(model.totals.work)}</strong></td></tr></tbody></table></div>}
    </TablePanel>
    <details className="how-calculated"><summary>How utilization is calculated</summary><Panel>
      <p>Funded hours per person: {model.workingDays} working days × {settings.hoursPerDay}h = {formatHours(model.fundedPerPerson)}h.</p>
      <p>Available = funded − absence hours (Completed Work on Tasks under Epic #{settings.absenceEpicId}; PTO, Sick Leave and Unplanned Leave are read from the Feature and Task titles).</p>
      <p>Utilization = booked hours (Completed Work on all other {monthName(month)} Time Writing Tasks) ÷ available × 100. Overloaded at ≥ {settings.overloadedAt}%; has capacity below {settings.availableBelow}%.</p>
      <p className="muted">Tasks are matched to the month when their title starts or ends with the month and year (e.g. “{monthName(month)} | …” or “… | {monthName(month)}”, any delimiter). Thresholds and the absence Epic are set under Settings → Capacity and absence.</p>
      <div className="button-row"><button className="text-button" onClick={() => navigate('monthly')}>Open monthly detail →</button><button className="text-button" onClick={() => navigate('admin')}>Capacity settings →</button></div>
    </Panel></details>
    </> : <>
    <div className="viz-filters" role="group" aria-label="Months shown"><span>Months shown</span>{([6, 12] as const).map((value) => <button key={value} type="button" className={span === value ? 'primary' : 'ghost'} aria-pressed={span === value} onClick={() => setSpan(value)}>{value} months</button>)}{trendTotals.length > 0 && <span className="record-count">{trendTotals.length} month{trendTotals.length === 1 ? '' : 's'} with bookings · click a month in any chart to select it</span>}</div>
    {trendTotals.length ? <>
      <Panel className="viz-panel" title="Hours by month" detail={`Funded = people × working days × ${settings.hoursPerDay}h; available = funded − absence; actual = booked Completed Work.`}>
        <HoursTrendChart series={trend} selected={month} onSelect={setMonth} defaultView="table" />
      </Panel>
      <Panel className="viz-panel" title="Utilization by month" detail="Bars: actual = booked Completed Work ÷ available hours. Line: planned = Original Estimate ÷ available hours. Reference lines are the thresholds set in Settings.">
        <UtilizationChart series={trend} selected={month} onSelect={setMonth} overloadedAt={settings.overloadedAt} availableBelow={settings.availableBelow} />
      </Panel>
      <Panel className="viz-panel" title="Utilization by person and month" detail={`Each cell is that person's booked ÷ available hours. Grey is ${settings.overloadedAt}% (the overloaded threshold); deeper blue = more spare capacity, deeper red = more overloaded. Sorted by average; click a month to select it.`}>
        <UtilizationHeatmap series={trend} selected={month} onSelect={setMonth} midpoint={settings.overloadedAt} />
      </Panel>
      <Panel className="viz-panel" title="Epic mix by month" detail="Stacked bars: booked hours per Epic (the five largest over the last 12 months keep their colour; the rest are grouped as Other Epics). Line: available hours on the same scale.">
        <EpicMixChart series={trend} selected={month} onSelect={setMonth} colors={colors} />
      </Panel>
      <div className="viz-section"><p className="eyebrow">PROBLEM ANALYSIS · LAST {span} MONTHS</p><h2>Where overruns and unplanned work concentrate</h2><p className="muted">Pareto charts rank causes: the few Features or Epics up to the 80% line account for most of the problem, so they are where to act first. Scoped by Months shown.</p></div>
      <Panel className="viz-panel" title="Overrun hours" detail={`${formatHours(problems.overrun.total)}h of Completed Work above Original Estimate on ${problems.overrun.tasks} Task${problems.overrun.tasks === 1 ? '' : 's'}. Tasks without an estimate cannot overrun; unplanned work is counted under Ad-hoc hours.`} action={<LevelToggle value={overrunLevel} onChange={setOverrunLevel} />}>
        <ParetoChart items={problems.overrun[overrunLevel]} colors={colors} noun={overrunLevel === 'feature' ? 'Feature' : 'Epic'} measure="overrun hours" shortLabel={overrunLevel === 'feature' ? shortFeatureTitle : undefined} />
      </Panel>
      <Panel className="viz-panel" title="Ad-hoc hours" detail={`${formatHours(problems.adhoc.total)}h on ${problems.adhoc.tasks} Task${problems.adhoc.tasks === 1 ? '' : 's'} tagged ad-hoc — ${formatPercent(problems.adhoc.share)} of booked hours. Unplanned work that arrived after planning locked.`} action={<LevelToggle value={adhocLevel} onChange={setAdhocLevel} />}>
        <ParetoChart items={problems.adhoc[adhocLevel]} colors={colors} noun={adhocLevel === 'feature' ? 'Feature' : 'Epic'} measure="ad-hoc hours" shortLabel={adhocLevel === 'feature' ? shortFeatureTitle : undefined} />
      </Panel>
    </> : <Panel className="viz-panel" title="Hours by month"><EmptyState title="No Time Writing Tasks in this range." detail="Refresh from Azure or load the synthetic sample to see the trend." /></Panel>}
    </>}
    </>}
  </Page>
}
