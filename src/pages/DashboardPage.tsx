import { useState, type ReactNode } from 'react'
import { EmptyState, Info, Metric, Metrics, Notice, Page, Panel, Pill, TablePanel } from '../components/ui'
import { EpicMixChart, ParetoChart } from '../components/WorkloadCharts'
import { epicColors, shortFeatureTitle } from '../chartUtils'
import { capacityContext, monthlyHours, problemBreakdown, regions, resourceRoles, type Region, type ResourceRole } from '../capacity'
import { applyFilter, bandOf, byPerson, byRole, byStream, change, concentration, groupBy, noFilter, periodMonths, persistentOverload, personMonths, plannedOverload, quarterOf, rebalancing, streamTotals, totals, type Bands, type Dimension, type Period, type PersonMonth, type DashboardFilter } from '../dashboard'
import { MultiSelect } from '../components/MultiSelect'
import { timeWritingMonth } from '../azureInsights'
import { anomalies, healthScore, monthForecast, planAccuracy, resilience, streamMomentum, type ForecastStatus, type AccuracyVerdict, type Momentum } from '../insights'
import { streamCounts, type StreamCounts } from '../releaseOverview'
import { formatHours, formatPercent, monthName, todayIso } from '../format'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { MyWork } from '../useMyWork'
import type { Page as PageId } from './registry'
import type { PageProps } from './types'

// Dashboard: demand (planned hours), recorded hours and capacity per person and month, over a period, with one
// utilization model everywhere — the bands from Settings → Capacity (overloaded at or above overloadedAt %, spare
// below availableBelow %, balanced in between). Six tabs: Summary (chart, findings, rebalancing, monitor, horizon),
// Insights (insights.ts), Months (utilization by month, plan or actual, and the month-on-month comparison), People
// (by person, role or region), Streams (Epics: totals, assignments, mix by month, overrun and ad-hoc Pareto) and
// Definitions. Hour differences are shown without colour; colour is reserved for utilization against capacity.
const tabs = [['summary', 'Summary'], ['insights', 'Insights'], ['months', 'Months'], ['people', 'People'], ['streams', 'Streams'], ['definitions', 'Definitions']] as const
type Tab = typeof tabs[number][0]
interface Saved { tab: Tab; period: Period; filter: DashboardFilter }
const storageKey = 'demand-planning-dashboard-v3'
const list = <T extends string>(value: unknown, allowed?: readonly T[]) => Array.isArray(value) ? value.filter((entry): entry is T => typeof entry === 'string' && (!allowed || allowed.includes(entry as T))) : []
const numbers = (value: unknown, max: number) => Array.isArray(value) ? [...new Set(value.filter((entry): entry is number => Number.isInteger(entry) && entry >= 1 && entry <= max))].sort((a, b) => a - b) : []
// Starts on the quarter of the month picked in the header; the choice is remembered in this browser.
const load = (month: string): Saved => {
  const fallback: Saved = { tab: 'summary', period: { year: Number(month.slice(0, 4)), quarters: [quarterOf(month)], months: [] }, filter: noFilter }
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<Saved> | null
    if (!saved) return fallback
    const year = Number(saved.period?.year)
    return {
      tab: tabs.some(([key]) => key === saved.tab) ? saved.tab! : 'summary',
      period: Number.isInteger(year) && year > 2000 && year < 2100 ? { year, quarters: numbers(saved.period?.quarters, 4), months: numbers(saved.period?.months, 12) } : fallback.period,
      filter: { regions: list(saved.filter?.regions, regions), roles: list(saved.filter?.roles, resourceRoles), people: list(saved.filter?.people), streams: list(saved.filter?.streams) },
    }
  } catch { return fallback }
}
const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Utilization against capacity in the Settings bands: ↑ red at or above the overloaded threshold, green balanced,
// ↓ blue spare below the available threshold.
export function Util({ value, bands }: { value: number | null | undefined; bands: Bands }) {
  if (value == null) return <span className="muted">—</span>
  const band = bandOf(value, bands)
  return <span className={`util util-${band}`}>{band === 'over' ? '↑ ' : band === 'spare' ? '↓ ' : ''}{value.toFixed(1)}%</span>
}
const h = (value: number | undefined) => value == null ? '—' : formatHours(value)
// A difference in hours or percent: direction and size, no colour (colour is for utilization only).
const signed = (value: number | undefined, unit = 'h') => value == null ? <span className="muted">—</span> : <span className="delta">{value > 0 ? '+' : value < 0 ? '−' : ''}{formatHours(Math.abs(value))}{unit}</span>
const short = (month: string) => new Intl.DateTimeFormat('en', { month: 'short', year: '2-digit' }).format(new Date(`${month}-01T00:00:00`))
const statusLabel = { elapsed: 'Elapsed', partial: 'Partial', future: 'Future' } as const
const pctText = (value: number | null | undefined) => value == null ? '—' : `${value}%`
const signedPct = (value: number | null | undefined) => value == null ? '—' : `${value > 0 ? '+' : ''}${value}%`

// Lists cut at a limit, with the rest a click away.
function useMore<T>(items: T[], limit: number) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, limit)
  const more = items.length - shown.length
  const button = more > 0 || all ? <button type="button" className="text-button" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all (+${more} more)`}</button> : null
  return { shown, button }
}
function MoreTable<T>({ items, limit = 8, render, head }: { items: T[]; limit?: number; render: (item: T) => ReactNode; head: ReactNode }) {
  const { shown, button } = useMore(items, limit)
  return <><div className="azure-table"><table><thead>{head}</thead><tbody>{shown.map(render)}</tbody></table></div>{button}</>
}

export function DashboardPage({ month, azure, store, my }: { month: string; azure: AzureWorkspace; navigate: (page: PageId) => void; store: PageProps['store']; setMonth?: (month: string) => void; my: MyWork }) {
  const settings = capacityContext(store.state)
  const bands: Bands = { overloadedAt: settings.overloadedAt, availableBelow: settings.availableBelow }
  const [saved, setSaved] = useState(() => load(month))
  const update = (next: Partial<Saved>) => setSaved((current) => { const value = { ...current, ...next }; try { localStorage.setItem(storageKey, JSON.stringify(value)) } catch { /* convenience only */ } return value })
  const setFilter = (change: Partial<DashboardFilter>) => update({ filter: { ...saved.filter, ...change } })
  const today = todayIso()
  const months = periodMonths(saved.period)
  const setPeriod = (change: Partial<Period>) => update({ period: { ...saved.period, ...change } })
  const toggle = (values: number[], value: number) => values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value].sort((a, b) => a - b)
  const years = [...new Set([...azure.items.map((item) => Number(timeWritingMonth(item.title)?.slice(0, 4))).filter((year) => year > 2000), saved.period.year, Number(today.slice(0, 4))])].sort()
  const everyone = personMonths(azure.items, months, today, settings)
  const rows = applyFilter(everyone, saved.filter)
  const all = totals(rows)
  const elapsed = totals(rows.filter((row) => row.status === 'elapsed'))
  const thisMonth = today.slice(0, 7)
  const forecast = months.includes(thisMonth) ? monthForecast(rows, thisMonth, today, bands) : null
  const people = [...new Set(everyone.map((row) => row.person))].sort((a, b) => a.localeCompare(b))
  const streamOptions = streamTotals(everyone)
  const notNow = months.filter((entry) => entry >= thisMonth)
  const overload = plannedOverload(rows, bands)
  const filtered = Boolean(saved.filter.regions.length || saved.filter.roles.length || saved.filter.people.length || saved.filter.streams.length)
  const meName = my.me.name
  // Streams tab charts: the work items with only the Tasks of the people left by the region, role and person filters
  // (unassigned Tasks such as regional holidays stay); the stream filter does not apply there and the tab says so.
  const chartPeople = new Set(applyFilter(everyone, { ...saved.filter, streams: [] }).map((row) => row.person))
  const chartItems = filtered ? azure.items.filter((item) => item.workItemType !== 'Task' || !item.assignedTo || chartPeople.has(item.assignedTo)) : azure.items
  const filterNote = filtered ? `Filters: ${[saved.filter.regions.length && 'region', saved.filter.roles.length && 'role', saved.filter.people.length && 'team member', saved.filter.streams.length && 'stream'].filter(Boolean).join(', ')}` : 'No filters'

  return <Page>
    <div className="dash-filters" role="group" aria-label="Dashboard filters">
      <MultiSelect label="Region" options={regions.map((region) => [region, region])} value={saved.filter.regions} onChange={(value) => setFilter({ regions: value as Region[] })} />
      <MultiSelect label="Role" options={resourceRoles.map((role) => [role, role])} value={saved.filter.roles} onChange={(value) => setFilter({ roles: value as ResourceRole[] })} />
      <MultiSelect label="Team member" options={people.map((name) => [name, name === meName ? `${name} (me)` : name])} value={saved.filter.people} onChange={(value) => setFilter({ people: value })} />
      <MultiSelect label="Stream" options={streamOptions.map((stream) => [stream.key, stream.title])} value={saved.filter.streams} onChange={(value) => setFilter({ streams: value })} />
      <button type="button" className="ghost" disabled={!filtered} onClick={() => update({ filter: noFilter })}>Reset filters</button>
    </div>
    <div className="dash-period" role="group" aria-label="Time period">
      <label className="dash-select">Year<select value={saved.period.year} onChange={(event) => setPeriod({ year: Number(event.target.value) })}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
      <div className="dash-chips"><span className="multi-label">Quarters</span><div className="chip-row">{[1, 2, 3, 4].map((quarter) => <button key={quarter} type="button" className={`chip ${saved.period.quarters.includes(quarter) ? 'chip-on' : ''}`} aria-pressed={saved.period.quarters.includes(quarter)} onClick={() => setPeriod({ quarters: toggle(saved.period.quarters, quarter) })}>Q{quarter}</button>)}</div></div>
      <div className="dash-chips"><span className="multi-label">Months</span><div className="chip-row">{monthLabels.map((label, index) => { const value = index + 1, inQuarter = saved.period.quarters.includes(Math.ceil(value / 3)); return <button key={label} type="button" className={`chip ${saved.period.months.includes(value) || inQuarter ? 'chip-on' : ''}`} aria-pressed={saved.period.months.includes(value) || inQuarter} disabled={inQuarter} title={inQuarter ? 'Included by its quarter' : undefined} onClick={() => setPeriod({ months: toggle(saved.period.months, value) })}>{label}</button> })}</div></div>
      <button type="button" className="text-button" disabled={!saved.period.quarters.length && !saved.period.months.length} onClick={() => setPeriod({ quarters: [], months: [] })}>Whole year</button>
    </div>
    <p className="muted dash-scope">{months.length === 1 ? monthName(months[0]) : months.length === 12 ? `${saved.period.year} (whole year)` : months.map(short).join(', ')} · {all.people} {all.people === 1 ? 'person' : 'people'} · {rows.length} person-months · {filterNote}{notNow.length > 0 && <> · <span className="warning-text">{notNow.length === 1 ? `${short(notNow[0])} is` : `${notNow.map(short).join(', ')} are`} not finished: {notNow.length === 1 ? 'its' : 'their'} ratios are not results</span></>} <Info label="Utilization colours">Utilization = hours ÷ net capacity (working days × {settings.hoursPerDay}h, less absence). <span className="util util-over">↑ red</span> at or above {bands.overloadedAt}% (overloaded), <span className="util util-balanced">green</span> balanced, <span className="util util-spare">↓ blue</span> below {bands.availableBelow}% (spare). The thresholds come from Settings → Capacity and apply to every number on this page. Hour differences carry no colour: + and − only say the direction. Partial and future months do not establish spare capacity or results.</Info></p>
    {!rows.length ? <EmptyState title="No Time Writing data for this selection." detail="Change the period or filters, refresh from Azure, or load the synthetic sample." /> : <>
      <Metrics>
        <Metric label="Planned utilization" value={<Util value={all.planUtil} bands={bands} />} hint={`${formatHours(all.plan)}h plan / ${formatHours(all.capacity)}h capacity`} />
        <Metric label="Actual utilization" value={<Util value={all.actualUtil} bands={bands} />} hint={`${formatHours(all.actual)}h recorded`} />
        <Metric label="Elapsed months: recorded vs planned" value={elapsed.ratio == null ? '—' : formatPercent(elapsed.ratio)} hint={elapsed.plan ? <>{signed(Math.round((elapsed.actual - elapsed.plan) * 100) / 100)} · {formatHours(elapsed.actual)}h of {formatHours(elapsed.plan)}h</> : 'No elapsed month with a plan in the period'} />
        <Metric label={forecast ? `${short(thisMonth)}: projected vs plan` : 'This month: projected vs plan'} value={forecast && forecast.people.length ? signed(forecast.vsPlan) : '—'} hint={forecast && forecast.people.length ? `${formatHours(forecast.projected)}h projected · ${forecast.share}% of the month gone · ${forecast.counts['over-capacity']} heading over capacity` : 'The current month is not in the period'} tone={forecast && forecast.counts['over-capacity'] ? 'negative' : undefined} />
        <Metric label="Planned overload" value={`${overload.over.length} / ${overload.people}`} hint={`People planned at ${bands.overloadedAt}% of capacity or more over the period`} tone={overload.over.length ? 'negative' : undefined} />
        <Metric label="Unplanned capacity" value={signed(all.gap)} hint={all.gap >= 0 ? 'Capacity − plan over the period: not yet allocated' : 'Capacity − plan: the plan is above capacity'} />
      </Metrics>
      <div className="overview-tabs dash-tabs" role="tablist" aria-label="Dashboard sections">{tabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={saved.tab === key} className={`backlog-tab ${saved.tab === key ? 'backlog-tab-active' : ''}`} onClick={() => update({ tab: key })}>{label}</button>)}</div>
      {saved.tab === 'summary' && <SummaryTab rows={rows} months={months} bands={bands} />}
      {saved.tab === 'insights' && <InsightsTab rows={rows} months={months} today={today} bands={bands} delivery={streamCounts(store.state, azure.connectionProfiles, months)} />}
      {saved.tab === 'months' && <MonthsTab rows={rows} months={months} bands={bands} />}
      {saved.tab === 'people' && <PeopleTab rows={rows} months={months} bands={bands} />}
      {saved.tab === 'streams' && <StreamsTab rows={rows} months={months} items={chartItems} settings={settings} streamFiltered={saved.filter.streams.length > 0} />}
      {saved.tab === 'definitions' && <DefinitionsTab hoursPerDay={settings.hoursPerDay} absenceEpicId={settings.absenceEpicId} bands={bands} />}
    </>}
  </Page>
}

function Section({ eyebrow, title, info, children, action }: { eyebrow?: string; title: string; info?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return <Panel className="dash-section" eyebrow={eyebrow} title={title} info={info} action={action}>{children}</Panel>
}
function Card({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'danger' | 'warning' | 'ok' }) {
  return <div className={`dash-card ${tone ? `dash-card-${tone}` : ''}`}><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>
}
function monthSeries(rows: PersonMonth[], months: string[]) {
  return months.map((month) => { const entries = rows.filter((row) => row.month === month); return { month, status: entries[0]?.status, rows: entries, ...totals(entries), planLines: entries.reduce((sum, row) => sum + row.planLines, 0), blankActuals: entries.reduce((sum, row) => sum + row.blankActuals, 0) } })
}
const hasHours = (rows: PersonMonth[]) => rows.some((row) => row.plan > 0 || row.actual > 0)
// A tab or panel without hours says so instead of drawing empty charts.
function NoHours({ children, rows, title = 'Nothing planned or recorded for this selection.' }: { children: ReactNode; rows: PersonMonth[]; title?: string }) {
  return hasHours(rows) ? <>{children}</> : <EmptyState title={title} detail="The people match the filters, but none of their month Tasks in the period carries planned or recorded hours." />
}

// Planned and actual bars per month with the capacity as a dashed line; partial and future months shaded.
export function DemandChart({ rows, months }: { rows: PersonMonth[]; months: string[] }) {
  const series = monthSeries(rows, months)
  const max = Math.max(1, ...series.flatMap((point) => [point.plan, point.actual, point.capacity]))
  const width = Math.max(480, months.length * 70), height = 240, top = 16, bottom = 210, slot = width / months.length, bar = Math.min(22, slot / 4)
  const y = (value: number) => bottom - value / max * (bottom - top)
  const line = series.map((point, index) => `${index ? 'L' : 'M'}${index * slot + slot / 2},${y(point.capacity)}`).join(' ')
  return <div className="dash-chart">
    <div className="legend"><span><i className="dash-dot dash-plan" />Planned</span><span><i className="dash-dot dash-actual" />Recorded</span><span><i className="dash-dot dash-cap" />Net capacity</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Planned and recorded hours against capacity by month">
      {series.map((point, index) => <g key={point.month}>
        {point.status !== 'elapsed' && <rect x={index * slot} y={top} width={slot} height={bottom - top} className="dash-shade" />}
        <rect x={index * slot + slot / 2 - bar - 1} y={y(point.plan)} width={bar} height={bottom - y(point.plan)} className="dash-plan"><title>{`${monthName(point.month)}: ${formatHours(point.plan)}h planned`}</title></rect>
        <rect x={index * slot + slot / 2 + 1} y={y(point.actual)} width={bar} height={bottom - y(point.actual)} className="dash-actual"><title>{`${monthName(point.month)}: ${formatHours(point.actual)}h recorded`}</title></rect>
        <text x={index * slot + slot / 2} y={height - 10} textAnchor="middle">{short(point.month)}</text>
      </g>)}
      <path d={line} className="dash-cap-line" />
      {series.map((point, index) => <circle key={point.month} cx={index * slot + slot / 2} cy={y(point.capacity)} r={3} className="dash-cap-dot"><title>{`${monthName(point.month)}: ${formatHours(point.capacity)}h capacity`}</title></circle>)}
    </svg>
    <small className="muted">Shaded: partial and future months.</small>
  </div>
}

function GroupTable({ rows, by, label, bands, extra }: { rows: PersonMonth[]; by: (row: PersonMonth) => string; label: string; bands: Bands; extra?: boolean }) {
  const groups = groupBy(rows, by).sort((a, b) => (b.planUtil ?? 0) - (a.planUtil ?? 0))
  return <div className="azure-table"><table><thead><tr><th>{label}</th>{extra && <th>Region · role</th>}<th>People</th><th>Capacity h</th>{extra && <th>Absence h</th>}<th>Plan h</th><th>Actual h</th><th>Planned utilization</th><th>Actual utilization</th><th>Actual − plan h</th><th>Capacity − plan h</th></tr></thead><tbody>
    {groups.map((group) => <tr key={group.name}><td><strong>{group.name}</strong></td>{extra && <td>{[group.rows[0]?.region, group.rows[0]?.role].filter(Boolean).join(' · ') || '—'}</td>}<td>{group.people}</td><td>{h(group.capacity)}</td>{extra && <td>{h(group.absence)}</td>}<td>{h(group.plan)}</td><td>{h(group.actual)}</td><td><Util value={group.planUtil} bands={bands} /></td><td><Util value={group.actualUtil} bands={bands} /></td><td>{signed(Math.round((group.actual - group.plan) * 100) / 100)}</td><td>{signed(group.gap)}</td></tr>)}
  </tbody></table></div>
}

function SummaryTab({ rows, months, bands }: { rows: PersonMonth[]; months: string[]; bands: Bands }) {
  const persistentActual = persistentOverload(rows, months, 'actual', 3, bands), persistentPlan = persistentOverload(rows, months, 'plan', 3, bands)
  const covered = new Set(rows.filter((row) => row.actual > 0 || row.tasks > 0).map((row) => row.person)).size
  const people = groupBy(rows, (row) => row.person)
  const actualTop = concentration(rows, 'actual')
  const all = totals(rows), moves = rebalancing(rows), series = monthSeries(rows, months)
  const withData = series.filter((point) => point.plan > 0 || point.actual > 0 || point.capacity > 0)
  const elapsed = rows.filter((row) => row.status === 'elapsed')
  const highest = [...people].filter((person) => person.planUtil != null).sort((a, b) => (b.planUtil ?? 0) - (a.planUtil ?? 0))[0]
  const overActual = groupBy(elapsed, (row) => row.person).filter((person) => bandOf(person.actualUtil, bands) === 'over')
  const gapPerson = groupBy(elapsed, (row) => row.person).sort((a, b) => (b.plan - b.actual) - (a.plan - a.actual))[0]
  return <NoHours rows={rows}>
    <div className="dash-grid-wide">
      <Panel title="Demand against available capacity" info="Monthly hours for the selected people: planned (Original Estimate), recorded (Completed Work) and net capacity (less absence)."><DemandChart rows={rows} months={months} /></Panel>
      <Panel title="What the numbers mean" info="Findings for the selected period and filters, recalculated with every change.">
        <dl className="dash-findings">
          <dt>{signed(all.gap)} capacity − plan</dt><dd>{all.gap >= 0 ? `${formatHours(all.gap)}h of capacity is not yet planned. At most ${formatHours(moves.movable)}h of overload could move to headroom in the same role and month.` : `The plan is ${formatHours(-all.gap)}h above capacity. Review scope, timing and priorities.`}</dd>
          {highest && <><dt>{highest.name} has the highest planned utilization</dt><dd>{formatHours(highest.plan)}h planned against {formatHours(highest.capacity)}h capacity (<Util value={highest.planUtil} bands={bands} />).</dd></>}
          <dt>{overActual.length} {overActual.length === 1 ? 'person is' : 'people are'} overloaded on recorded hours</dt><dd>{overActual.length ? overActual.map((person) => person.name).join(', ') + '. ' : ''}Elapsed months only, at {bands.overloadedAt}% of capacity or more. Recorded hours may include work outside the plan; check completeness before drawing staffing conclusions.</dd>
          {gapPerson && gapPerson.plan - gapPerson.actual > 0 && <><dt>{gapPerson.name} has a {formatHours(gapPerson.plan - gapPerson.actual)}h plan-to-recorded gap</dt><dd>Elapsed months only: planned {formatHours(gapPerson.plan)}h, recorded {formatHours(gapPerson.actual)}h.</dd></>}
          <dt>{formatHours(all.absence)}h absence</dt><dd>Leave and public holidays lower capacity; they are not counted as demand.</dd>
        </dl>
      </Panel>
    </div>
    <Section eyebrow="REBALANCING" title="Rebalancing has a limit" info="Overload (plan above capacity, in hours) can only move to headroom of the same role in the same month, and only in current or future months; people without a role are left out of the lists and counted apart.">
      <div className="dash-cards dash-cards-4"><Card label="Gross monthly overload" value={`${formatHours(moves.overload)}h`} tone={moves.overload ? 'danger' : undefined} hint="Plan above capacity, summed per person and month" /><Card label="Headroom (current & future)" value={`${formatHours(moves.headroom)}h`} hint="Capacity above plan in months not yet over" /><Card label="Movable in same role & month" value={`${formatHours(moves.movable)}h`} hint="The most that could move" /><Card label="Remaining shortfall" value={`${formatHours(moves.shortfall)}h`} tone={moves.shortfall ? 'warning' : undefined} hint="Overload no move can absorb" /></div>
      {moves.unmapped.people > 0 && <p className="muted">{moves.unmapped.people} {moves.unmapped.people === 1 ? 'person' : 'people'} without a role ({formatHours(moves.unmapped.overload)}h overload, {formatHours(moves.unmapped.headroom)}h headroom) {moves.unmapped.people === 1 ? 'is' : 'are'} left out of the lists below; map them in Settings → Resources to include them.</p>}
      <div className="dash-stack">
        <div><h3>Largest planned relief needs</h3>{moves.needs.length ? <MoreTable items={moves.needs} head={<tr><th>Person</th><th>Month</th><th>Plan h</th><th>Capacity h</th><th>Relief h</th></tr>} render={(entry) => <tr key={`${entry.person}-${entry.month}`}><td>{entry.person}<small>{[entry.region, entry.role].filter(Boolean).join(' · ')}</small></td><td>{short(entry.month)}</td><td>{h(entry.plan)}</td><td>{h(entry.capacity)}</td><td className="negative">{h(entry.need)}</td></tr>} /> : <p className="muted">Nobody is planned above capacity.</p>}</div>
        <div><h3>Potential receivers</h3>{moves.receivers.length ? <MoreTable items={moves.receivers} head={<tr><th>Person</th><th>Month</th><th>Plan h</th><th>Headroom h</th></tr>} render={(entry) => <tr key={`${entry.person}-${entry.month}`}><td>{entry.person}<small>{[entry.region, entry.role].filter(Boolean).join(' · ')}</small></td><td>{short(entry.month)}</td><td>{h(entry.plan)}</td><td className="positive">{h(entry.headroom)}</td></tr>} /> : <p className="muted">No headroom in the current or future months of the period.</p>}</div>
      </div>
    </Section>
    <Section eyebrow="WORKLOAD MONITOR" title="Repeated overload & concentration" info={`Persistent overload = at or above ${bands.overloadedAt}% of capacity in at least 3 consecutive elapsed months of the period; a month without data breaks the streak. Concentration compares the top 20% of people (rounded up) by recorded hours with their share of capacity; an alert at 10 percentage points or more.`}>
      <div className="dash-cards dash-cards-4">
        <Card label="Persistent overload · recorded" value={`${persistentActual.length} ${persistentActual.length === 1 ? 'person' : 'people'}`} hint={persistentActual.join(', ') || 'None'} tone={persistentActual.length ? 'danger' : undefined} />
        <Card label="Persistent overload · planned" value={`${persistentPlan.length} ${persistentPlan.length === 1 ? 'person' : 'people'}`} hint={persistentPlan.join(', ') || 'None'} tone={persistentPlan.length ? 'danger' : undefined} />
        <Card label="People with entries" value={`${covered} / ${people.length}`} hint="At least one Time Writing Task" />
        <Card label="Concentration of recorded hours" value={`${actualTop.hoursShare ?? 0}%`} tone={actualTop.alert ? 'warning' : undefined} hint={`Top ${actualTop.top.length} of ${actualTop.of}: ${actualTop.top.map((person) => person.name).join(', ') || '—'} · capacity share ${actualTop.capacityShare ?? 0}%`} />
      </div>
    </Section>
    <TablePanel title="Planning horizon & recording coverage" info="Months of the period with data. Lines with plan > 0 = month Tasks with an Original Estimate; of these, blank actual = no Completed Work entered (a numeric 0 counts as entered). A thin plan in a future month is a reason to validate demand." count={`${withData.length} of ${months.length} month${months.length === 1 ? '' : 's'}`}>
      {withData.length ? <table><thead><tr><th>Month</th><th>Plan h</th><th>Actual h</th><th>Capacity h</th><th>Planned utilization</th><th>Actual utilization</th><th>Lines with plan &gt; 0</th><th>Of these: blank actual</th><th>Absence h</th></tr></thead><tbody>
        {withData.map((point) => <tr key={point.month}><td><strong>{monthName(point.month)}</strong>{point.status && <small>{statusLabel[point.status]}</small>}</td><td>{h(point.plan)}</td><td>{h(point.actual)}</td><td>{h(point.capacity)}</td><td><Util value={point.planUtil} bands={bands} /></td><td><Util value={point.actualUtil} bands={bands} /></td><td>{point.planLines}</td><td>{point.blankActuals}</td><td>{h(point.absence)}</td></tr>)}
      </tbody></table> : <p className="muted">No month of the period has data.</p>}
      {withData.length < months.length && <small className="muted">{months.length - withData.length} month{months.length - withData.length === 1 ? '' : 's'} without data hidden.</small>}
    </TablePanel>
  </NoHours>
}

function Bars({ groups, bands }: { groups: ReturnType<typeof groupBy>; bands: Bands }) {
  const max = Math.max(100, ...groups.flatMap((group) => [group.planUtil ?? 0, group.actualUtil ?? 0]))
  return <div className="dash-bars">{groups.map((group) => <div key={group.name} className="dash-bar-row">
    <div className="dash-bar-label"><strong>{group.name}</strong><small>{group.people} {group.people === 1 ? 'person' : 'people'} · {formatHours(group.capacity)}h capacity · {formatHours(group.plan)}h plan · {formatHours(group.actual)}h recorded</small></div>
    <div className="dash-bar-track"><i className="dash-plan" style={{ width: `${(group.planUtil ?? 0) / max * 100}%` }} /><i className="dash-actual" style={{ width: `${(group.actualUtil ?? 0) / max * 100}%` }} /><b style={{ left: `${bands.overloadedAt / max * 100}%` }} title={`${bands.overloadedAt}% of capacity`} /></div>
    <div className="dash-bar-values">Plan <Util value={group.planUtil} bands={bands} /> · Recorded <Util value={group.actualUtil} bands={bands} /></div>
  </div>)}</div>
}

type Measure = 'actual' | 'plan'
// A person × month (or group × month) grid of utilization in the Settings bands; a month with Tasks but 0 recorded
// hours is "0 recorded" (grey), not spare capacity; the tooltip names the hours, capacity and absence.
function Heatmap({ title, info, lines, months, measure, bands }: { title: string; info: string; lines: { name: string; detail?: string; rows: PersonMonth[] }[]; months: string[]; measure: Measure; bands: Bands }) {
  return <TablePanel title={title} info={info}><div className="azure-table"><table className="dash-heat"><thead><tr><th>Person / group</th>{months.map((month) => <th key={month}>{short(month)}</th>)}</tr></thead><tbody>
    {lines.map((line) => <tr key={line.name}><td><strong>{line.name}</strong>{line.detail && <small>{line.detail}</small>}</td>{months.map((month) => {
      const entries = line.rows.filter((row) => row.month === month); const t = totals(entries)
      const hours = measure === 'actual' ? t.actual : t.plan, util = measure === 'actual' ? t.actualUtil : t.planUtil
      const tracked = entries.length > 0 && entries.some((row) => row.tasks)
      const zero = tracked && hours <= 0
      const band = tracked && !zero ? bandOf(util, bands) : null
      const reserved = entries.reduce((sum, row) => sum + row.reserved, 0)
      const tip = entries.length ? `${formatHours(hours)}h ${measure === 'actual' ? 'recorded' : 'planned'} / ${formatHours(t.capacity)}h capacity${t.absence ? ` · ${formatHours(t.absence)}h absence` : ''}${reserved ? ` · ${formatHours(reserved)}h common activities` : ''}` : 'No entry'
      return <td key={month} className={zero ? 'heat-zero' : band ? `heat-${band}` : 'heat-none'} title={tip}>{!tracked ? <span className="muted">No entry</span> : zero ? <span className="muted">0 {measure === 'actual' ? 'recorded' : 'planned'}</span> : <Util value={util} bands={bands} />}</td> })}</tr>)}
  </tbody></table></div></TablePanel>
}

function MeasureSwitch({ value, onChange }: { value: Measure; onChange: (value: Measure) => void }) {
  return <div className="chip-row" role="group" aria-label="Measure">{(['actual', 'plan'] as const).map((entry) => <button key={entry} type="button" className={`chip ${value === entry ? 'chip-on' : ''}`} aria-pressed={value === entry} onClick={() => onChange(entry)}>{entry === 'actual' ? 'Recorded' : 'Planned'}</button>)}</div>
}

function MonthsTab({ rows, months, bands }: { rows: PersonMonth[]; months: string[]; bands: Bands }) {
  const [measure, setMeasure] = useState<Measure>('actual')
  const series = monthSeries(rows, months)
  const withData = series.filter((point) => point.rows.some((row) => row.tasks))
  const people = groupBy(rows, (row) => row.person).sort((a, b) => a.name.localeCompare(b.name))
  return <NoHours rows={rows}>
    <Section eyebrow="BY MONTH" title={`${measure === 'actual' ? 'Recorded' : 'Planned'} utilization by month`} info={`Per month of the period: ${measure === 'actual' ? 'recorded' : 'planned'} hours ÷ net capacity, in the Settings bands. Months without a Time Writing Task are not shown. Partial and future months do not establish spare capacity or results.`} action={<MeasureSwitch value={measure} onChange={setMeasure} />}>
      <div className="dash-cards dash-cards-4">{withData.map((point) => <Card key={point.month} label={monthName(point.month)} value={<Util value={measure === 'actual' ? point.actualUtil : point.planUtil} bands={bands} />} hint={<>{formatHours(measure === 'actual' ? point.actual : point.plan)}h {measure === 'actual' ? 'recorded' : 'planned'} / {formatHours(point.capacity)}h capacity<br />{point.status ? `${statusLabel[point.status]} month` : ''}{point.absence ? ` · ${formatHours(point.absence)}h absence` : ''}</>} />)}</div>
      {withData.length < months.length && <small className="muted">{months.length - withData.length} month{months.length - withData.length === 1 ? '' : 's'} without entries hidden.</small>}
    </Section>
    <Heatmap measure={measure} bands={bands} title={`${measure === 'actual' ? 'Recorded' : 'Planned'} utilization % · team & people`} info={`${measure === 'actual' ? 'Recorded' : 'Planned'} hours ÷ net capacity per person and month. "No entry" = no Time Writing Task that month; "0 ${measure === 'actual' ? 'recorded' : 'planned'}" = Tasks without hours, which is not spare capacity. Hover a cell for hours, capacity and absence.`} months={months} lines={[{ name: 'Selected team', rows }, ...people.map((person) => ({ name: person.name, detail: [person.rows[0]?.region, person.rows[0]?.role].filter(Boolean).join(' · '), rows: person.rows }))]} />
    <Heatmap measure={measure} bands={bands} title={`${measure === 'actual' ? 'Recorded' : 'Planned'} utilization % · by role`} info="The same per role (Settings → Resources)." months={months} lines={groupBy(rows, (row) => row.role ?? 'No role').map((group) => ({ name: group.name, rows: group.rows }))} />
    <Comparison rows={rows} months={months} bands={bands} />
  </NoHours>
}

function ChangeTable({ title, rows, previous, current, dimension, label }: { title: string; rows: PersonMonth[]; previous: string; current: string; dimension: Dimension; label: string }) {
  const lines = change(rows, previous, current, dimension)
  return <TablePanel title={title} info="Recorded hours in both months under the same filters. Missing entries mean nothing was recorded, not zero effort." empty={lines.length ? undefined : 'Nothing recorded in either month.'}>
    {lines.length > 0 && <table><thead><tr><th>{label}</th><th>{short(previous)} h</th><th>{short(current)} h</th><th>Change h</th><th>Change %</th></tr></thead><tbody>{lines.map((line) => <tr key={line.name}><td>{line.name}</td><td>{h(line.previous)}</td><td>{h(line.current)}</td><td>{line.change == null ? <span className="muted">No comparable entries</span> : signed(line.change)}</td><td>{line.percent == null ? '—' : signed(line.percent, '%')}</td></tr>)}</tbody></table>}
  </TablePanel>
}

// Month-on-month comparison of recorded hours: a month against the one before it, for pairs with data in both.
function Comparison({ rows, months, bands }: { rows: PersonMonth[]; months: string[]; bands: Bands }) {
  const series = monthSeries(rows, months)
  const pairs = months.slice(1).filter((_, index) => series[index + 1].actual > 0)
  const [chosen, setChosen] = useState('')
  const current = pairs.includes(chosen) ? chosen : pairs[pairs.length - 1]
  if (!current) return <Section eyebrow="MONTH ON MONTH" title="Recorded hours against the month before"><EmptyState title="Nothing to compare." detail="The comparison needs two consecutive months of the period with recorded hours." /></Section>
  const previous = months[months.indexOf(current) - 1]
  const now = series.find((point) => point.month === current)!, before = series.find((point) => point.month === previous)!
  const max = Math.max(1, ...series.map((point) => point.actual))
  return <Section eyebrow="MONTH ON MONTH" title={`Recorded hours: ${monthName(current)} against ${monthName(previous)}`} info="Each month is compared with the one before it, under the same filters. Only months with recorded hours are offered." action={pairs.length > 1 ? <div className="chip-row">{pairs.map((month) => <button key={month} type="button" className={`chip ${month === current ? 'chip-on' : ''}`} onClick={() => setChosen(month)}>{short(month)}</button>)}</div> : undefined}>
    {now.status !== 'elapsed' && <Notice tone="warning">{monthName(current)} is a {now.status} month: its recorded hours are not comparable with a completed month.</Notice>}
    <div className="dash-cards dash-cards-4">
      <Card label={`${short(current)} recorded`} value={`${formatHours(now.actual)}h`} hint={<>Utilization <Util value={now.actualUtil} bands={bands} /></>} />
      <Card label={`${short(previous)} recorded`} value={`${formatHours(before.actual)}h`} hint={<>Utilization <Util value={before.actualUtil} bands={bands} /></>} />
      <Card label="Change" value={signed(Math.round((now.actual - before.actual) * 100) / 100)} hint={before.actual > 0 ? signedPct(Math.round((now.actual - before.actual) / before.actual * 1000) / 10) : 'New from zero'} />
      <Card label="People with entries" value={`${new Set(now.rows.filter((row) => row.actual > 0).map((row) => row.person)).size} / ${now.people}`} hint={short(current)} />
    </div>
    <div className="dash-columns">{series.map((point) => <div key={point.month} className={point.month === current ? 'is-current' : point.month === previous ? 'is-previous' : ''}><span>{formatHours(point.actual)}</span><i style={{ height: `${point.actual / max * 140}px` }} /><small>{short(point.month)}</small></div>)}</div>
    <div className="dash-grid-2">
      <ChangeTable title="Change by role" rows={rows} previous={previous} current={current} dimension={byRole} label="Role" />
      <ChangeTable title="Change by stream" rows={rows} previous={previous} current={current} dimension={byStream} label="Stream (Epic)" />
    </div>
    <ChangeTable title="Change by team member" rows={rows} previous={previous} current={current} dimension={byPerson} label="Person" />
  </Section>
}

type Grouping = 'person' | 'role' | 'region'
function PeopleTab({ rows, months, bands }: { rows: PersonMonth[]; months: string[]; bands: Bands }) {
  const [grouping, setGrouping] = useState<Grouping>('person')
  const persistent = new Set(persistentOverload(rows, months, 'actual', 3, bands))
  const by = (row: PersonMonth) => grouping === 'person' ? row.person : grouping === 'role' ? row.role ?? 'No role' : row.region ?? 'No region'
  const label = grouping === 'person' ? 'Person' : grouping === 'role' ? 'Role' : 'Region'
  const groups = groupBy(rows, by).sort((a, b) => (b.planUtil ?? 0) - (a.planUtil ?? 0))
  return <NoHours rows={rows}>
    <Section eyebrow="WHO" title={`Workload by ${label.toLowerCase()}`} info={`Over the period, highest planned utilization first: capacity (net of absence), planned and recorded hours, utilization in the Settings bands, and the differences actual − plan and capacity − plan. ⚠ = overloaded on recorded hours in 3 or more consecutive elapsed months. Roles and regions come from Settings → Resources; people without one are grouped as "No role" / "No region".`} action={<div className="chip-row" role="group" aria-label="Group by">{(['person', 'role', 'region'] as const).map((entry) => <button key={entry} type="button" className={`chip ${grouping === entry ? 'chip-on' : ''}`} aria-pressed={grouping === entry} onClick={() => setGrouping(entry)}>{entry === 'person' ? 'People' : entry === 'role' ? 'Roles' : 'Regions'}</button>)}</div>}>
      {grouping === 'person' ? <div className="azure-table"><table><thead><tr><th>Person</th><th>Region · role</th><th>Capacity h</th><th>Absence h</th><th>Plan h</th><th>Actual h</th><th>Planned utilization</th><th>Actual utilization</th><th>Actual − plan h</th></tr></thead><tbody>
        {groups.map((person) => <tr key={person.name}><td><strong>{person.name}{persistent.has(person.name) && <span className="negative" title="Persistent overload on recorded hours"> ⚠</span>}</strong></td><td>{[person.rows[0]?.region, person.rows[0]?.role].filter(Boolean).join(' · ') || '—'}</td><td>{h(person.capacity)}</td><td>{h(person.absence)}</td><td>{h(person.plan)}</td><td>{h(person.actual)}</td><td><Util value={person.planUtil} bands={bands} /></td><td><Util value={person.actualUtil} bands={bands} /></td><td>{signed(Math.round((person.actual - person.plan) * 100) / 100)}</td></tr>)}
      </tbody></table></div> : <>
        <Bars groups={groups} bands={bands} />
        <GroupTable rows={rows} by={by} label={label} bands={bands} />
      </>}
    </Section>
    {grouping === 'person' && <TablePanel title="Where pressure is concentrated" info="Region and role combined, highest planned utilization first."><GroupTable rows={rows} by={(row) => `${row.region ?? 'No region'} · ${row.role ?? 'No role'}`} label="Region · role" bands={bands} /></TablePanel>}
  </NoHours>
}

function StreamsTab({ rows, months, items, settings, streamFiltered }: { rows: PersonMonth[]; months: string[]; items: Parameters<typeof monthlyHours>[0]; settings: ReturnType<typeof capacityContext>; streamFiltered: boolean }) {
  const streams = streamTotals(rows)
  const max = Math.max(1, ...streams.flatMap((stream) => [stream.plan, stream.actual]))
  const assignments = streams.map((stream) => ({ stream, people: groupBy(rows.filter((row) => row.streams.some((entry) => entry.key === stream.key)).map((row) => { const entry = row.streams.find((item) => item.key === stream.key)!; return { ...row, plan: entry.plan, actual: entry.actual } }), (row) => row.person).sort((a, b) => b.plan - a.plan) }))
  const [openStreams, setOpenStreams] = useState<string[]>([])
  // Epic mix and the Pareto charts read the Tasks themselves over the period's months (region, role and team member
  // filters applied; the stream filter is not).
  const span = months.length ? Math.max(1, (Number(months[months.length - 1].slice(0, 4)) - Number(months[0].slice(0, 4))) * 12 + Number(months[months.length - 1].slice(5)) - Number(months[0].slice(5)) + 1) : 1
  const trend = months.length ? monthlyHours(items, months[months.length - 1], span, settings).filter((point) => months.includes(point.month)) : []
  const problems = problemBreakdown(items, months, settings)
  const colors = epicColors(trend)
  const [overrunLevel, setOverrunLevel] = useState<'feature' | 'epic'>('feature')
  const [adhocLevel, setAdhocLevel] = useState<'feature' | 'epic'>('epic')
  const levelToggle = (value: 'feature' | 'epic', onChange: (value: 'feature' | 'epic') => void) => <div className="chip-row" role="group" aria-label="Group by">{(['feature', 'epic'] as const).map((level) => <button key={level} type="button" className={`chip ${value === level ? 'chip-on' : ''}`} aria-pressed={value === level} onClick={() => onChange(level)}>{level === 'feature' ? 'By Feature' : 'By Epic'}</button>)}</div>
  return <NoHours rows={rows}>
    <TablePanel title="Where planned demand sits" info="Planned and recorded hours per stream (the Epic above the Time Writing Task); share = share of the planned hours. Absence is excluded." count={`${streams.length} streams`} empty={streams.length ? undefined : 'No hours in this selection.'}>
      {streams.length > 0 && <table><thead><tr><th>Stream (Epic)</th><th>Plan h</th><th>Actual h</th><th>Actual − plan h</th><th>Share of plan</th><th>People</th><th>Plan vs recorded</th></tr></thead><tbody>
        {streams.map((stream) => <tr key={stream.key}><td><strong>{stream.title}</strong></td><td>{h(stream.plan)}</td><td>{h(stream.actual)}</td><td>{signed(Math.round((stream.actual - stream.plan) * 100) / 100)}</td><td>{stream.share == null ? '—' : `${stream.share.toFixed(1)}%`}</td><td title={stream.people.join(', ')}>{stream.people.length}</td><td className="dash-pair"><i className="dash-plan" style={{ width: `${stream.plan / max * 100}%` }} /><i className="dash-actual" style={{ width: `${stream.actual / max * 100}%` }} /></td></tr>)}
      </tbody></table>}
    </TablePanel>
    <TablePanel title="Who works on each stream" info="People per stream with their planned and recorded hours on it, largest plan first; the three largest are shown, the rest open per stream.">
      <table><thead><tr><th>Stream (Epic)</th><th>Person</th><th>Plan h</th><th>Actual h</th></tr></thead><tbody>
        {assignments.flatMap(({ stream, people }) => { const open = openStreams.includes(stream.key); const shown = open ? people : people.slice(0, 3); return [
          ...shown.map((person, index) => <tr key={`${stream.key}-${person.name}`}><td>{index === 0 ? <strong>{stream.title}</strong> : ''}</td><td>{person.name}</td><td>{h(person.plan)}</td><td>{h(person.actual)}</td></tr>),
          ...(people.length > 3 ? [<tr key={`${stream.key}-more`}><td /><td colSpan={3}><button type="button" className="text-button" onClick={() => setOpenStreams(open ? openStreams.filter((key) => key !== stream.key) : [...openStreams, stream.key])}>{open ? 'Show fewer' : `Show all (+${people.length - 3} more)`}</button></td></tr>] : []),
        ] })}
      </tbody></table>
    </TablePanel>
    {streamFiltered && <Notice tone="info">The stream filter does not apply to the charts below: they show every Epic for the selected people.</Notice>}
    {trend.some((point) => point.actual != null) ? <>
      <Panel className="viz-panel" title="Epic mix by month" info="Stacked bars: recorded hours per Epic over the period (the five largest keep their colour; the rest are grouped as Other Epics). Line: available hours on the same scale.">
        <EpicMixChart series={trend} selected={[...trend].reverse().find((point) => point.actual)?.month ?? months[months.length - 1]} colors={colors} />
      </Panel>
      <Panel className="viz-panel" title="Overrun hours" detail={`${formatHours(problems.overrun.total)}h above estimate on ${problems.overrun.tasks} Task${problems.overrun.tasks === 1 ? '' : 's'}`} info="Completed Work above Original Estimate per Task, over the period. The few Features or Epics up to the 80% line account for most of the overrun: that is where to look first." action={levelToggle(overrunLevel, setOverrunLevel)}>
        <ParetoChart items={problems.overrun[overrunLevel]} colors={colors} noun={overrunLevel === 'feature' ? 'Feature' : 'Epic'} measure="overrun hours" shortLabel={overrunLevel === 'feature' ? shortFeatureTitle : undefined} />
      </Panel>
      <Panel className="viz-panel" title="Ad-hoc hours" detail={`${formatHours(problems.adhoc.total)}h on ${problems.adhoc.tasks} Task${problems.adhoc.tasks === 1 ? '' : 's'} — ${formatPercent(problems.adhoc.share)} of recorded hours`} info="Hours on Tasks tagged ad-hoc: unplanned work that arrived after planning locked, over the period." action={levelToggle(adhocLevel, setAdhocLevel)}>
        <ParetoChart items={problems.adhoc[adhocLevel]} colors={colors} noun={adhocLevel === 'feature' ? 'Feature' : 'Epic'} measure="ad-hoc hours" shortLabel={adhocLevel === 'feature' ? shortFeatureTitle : undefined} />
      </Panel>
    </> : null}
  </NoHours>
}

// Insights: what the numbers say beyond the totals — see insights.ts for every rule; the thresholds are in the Info
// texts. Colours: green = as planned or healthy; amber = deviates, worth a look; red = at or above the overloaded
// threshold; blue = more than planned (not a fault by itself).
const forecastTone: Record<ForecastStatus, 'open' | 'warning' | 'danger' | 'neutral' | 'info'> = { 'on-track': 'open', ahead: 'info', behind: 'warning', 'over-capacity': 'danger', 'no-data': 'neutral' }
const forecastLabel: Record<ForecastStatus, string> = { 'on-track': 'On track', ahead: 'More than planned', behind: 'Behind plan', 'over-capacity': 'Heading over capacity', 'no-data': 'Nothing recorded yet' }
const verdictTone: Record<AccuracyVerdict, 'open' | 'warning' | 'danger' | 'neutral' | 'info'> = { reliable: 'open', 'under-records': 'warning', 'over-runs': 'warning', uneven: 'warning', 'no-plan': 'neutral' }
const verdictLabel: Record<AccuracyVerdict, string> = { reliable: 'Reliable', 'under-records': 'Under-records', 'over-runs': 'Over-runs', uneven: 'Uneven', 'no-plan': 'No plan' }
const trendLabel: Record<Momentum, string> = { rising: '↑ Rising', falling: '↓ Falling', steady: '→ Steady', new: '✦ New', gone: '○ Gone' }
const trendTone: Record<Momentum, 'open' | 'warning' | 'danger' | 'neutral' | 'info'> = { rising: 'info', falling: 'warning', steady: 'neutral', new: 'open', gone: 'neutral' }
const scoreTone = (value: number | null) => value == null ? 'neutral' : value >= 75 ? 'open' : value >= 50 ? 'warning' : 'danger'
const scoreClass = (value: number | null) => value == null ? '' : value >= 75 ? 'heat-balanced' : value >= 50 ? 'heat-mid' : 'heat-over'
function InsightsTab({ rows, months, today, bands, delivery }: { rows: PersonMonth[]; months: string[]; today: string; bands: Bands; delivery: StreamCounts[] }) {
  const current = months.find((month) => month === today.slice(0, 7)) ?? months.filter((month) => month <= today.slice(0, 7)).at(-1) ?? months[0]
  const forecast = monthForecast(rows, current, today, bands)
  const accuracy = planAccuracy(rows)
  const momentum = streamMomentum(rows, months)
  const strength = resilience(rows)
  const unusual = anomalies(rows)
  const health = healthScore(rows, months, bands)
  const attention = forecast.people.filter((entry) => entry.status === 'behind' || entry.status === 'over-capacity')
  const forecastRows = useMore(forecast.people, 8), accuracyRows = useMore(accuracy.people, 8), streamRows = useMore(strength.streams, 8), personRows = useMore(strength.people, 8), unusualRows = useMore(unusual, 8)
  return <NoHours rows={rows}>
    <p className="muted dash-key">Colours in this tab: <Pill tone="open">green</Pill> as planned or healthy · <Pill tone="warning">amber</Pill> deviates, worth a look · <Pill tone="danger">red</Pill> at or above {bands.overloadedAt}% of capacity · <Pill tone="info">blue</Pill> more than planned, not a fault by itself.</p>
    <Section eyebrow="HEALTH" title="How healthy is the plan?" info={`One score, 0–100, as the average of the components with data: balance = share of people planned in the balanced band (${bands.availableBelow}–${bands.overloadedAt}% of capacity, Settings → Capacity); recording = share of planned month Tasks with a recorded actual (elapsed months); resilience = share of streams not resting on one person. Green from 75, amber from 50, red below.`}>
      <div className="dash-cards dash-cards-4">
        <Card label="Health score" value={<Pill tone={scoreTone(health.overall.score)}>{health.overall.score ?? '—'}</Pill>} hint="Average of the three components" />
        <Card label="Balance" value={pctText(health.overall.balance)} tone={health.overall.balance == null ? undefined : health.overall.balance >= 75 ? 'ok' : health.overall.balance >= 50 ? 'warning' : 'danger'} hint={`People planned at ${bands.availableBelow}–${bands.overloadedAt}% of capacity`} />
        <Card label="Recording" value={pctText(health.overall.recording)} tone={health.overall.recording == null ? undefined : health.overall.recording >= 75 ? 'ok' : health.overall.recording >= 50 ? 'warning' : 'danger'} hint="Planned Tasks with an actual (elapsed months)" />
        <Card label="Resilience" value={pctText(health.overall.resilience)} tone={health.overall.resilience == null ? undefined : health.overall.resilience >= 75 ? 'ok' : health.overall.resilience >= 50 ? 'warning' : 'danger'} hint="Streams not resting on one person" />
      </div>
      {health.byMonth.some((entry) => entry.score != null) && <div className="azure-table"><table className="dash-heat"><thead><tr><th>Component</th>{months.map((month) => <th key={month}>{short(month)}</th>)}</tr></thead><tbody>
        {([['Score', 'score'], ['Balance', 'balance'], ['Recording', 'recording'], ['Resilience', 'resilience']] as const).map(([label, key]) => <tr key={key}><td><strong>{label}</strong></td>{health.byMonth.map((entry) => <td key={entry.month} className={scoreClass(entry[key])}>{pctText(entry[key])}</td>)}</tr>)}
      </tbody></table></div>}
    </Section>
    <Section eyebrow="DELIVERY" title="Releases and documents per stream" info="How many releases each stream completed per month of the period, and how many approved documents those releases carry — the same counts as Pulse Check. DP counts from its own query: Completed Releases (DT, Design Transfer: DDT Done in the month) as its releases and Supported Releases (DT, SFV = Start of Verification / Hardening, PRD = PRD Milestone and RPE = Release Planning Event, Done in the month — each release once) in place of documents. A stream marked not set up has no connection yet (Settings → Azure DevOps → Stream mapping). The Dashboard filters do not apply here: these are team-wide counts.">
      <div className="dash-cards dash-cards-4">
        <Card label="Releases in period" value={delivery.reduce((sum, stream) => sum + stream.releases, 0)} hint={`${delivery.filter((stream) => !stream.notSetUp).length} streams counted`} />
        <Card label="Documents in period" value={delivery.reduce((sum, stream) => sum + stream.documents, 0)} hint="Approved documents of those releases" />
        <Card label="Busiest stream" value={[...delivery].sort((a, b) => b.releases - a.releases)[0]?.releases ? [...delivery].sort((a, b) => b.releases - a.releases)[0].name : '—'} hint="Most releases in the period" />
        <Card label="Not set up" value={delivery.filter((stream) => stream.notSetUp).length} tone={delivery.some((stream) => stream.notSetUp) ? 'warning' : undefined} hint="Streams without a connection" />
      </div>
      <div className="azure-table"><table className="dash-heat"><thead><tr><th>Stream</th>{months.map((month) => <th key={month}>{short(month)}</th>)}<th>Releases</th><th>Documents</th></tr></thead><tbody>
        {delivery.map((stream) => <tr key={stream.id}><td><strong>{stream.name}</strong>{stream.notSetUp && <small>Not set up</small>}</td>{stream.months.map((entry) => <td key={entry.month}>{stream.notSetUp ? <span className="muted">—</span> : <>{entry.releases}<small className="muted"> · {entry.supported != null ? `${entry.supported} supported` : `${entry.documents} docs`}</small></>}</td>)}<td><strong>{stream.notSetUp ? '—' : stream.releases}</strong></td><td>{stream.notSetUp ? '—' : stream.supported != null ? `${stream.supported} supported` : stream.documents}</td></tr>)}
      </tbody></table></div>
    </Section>
    <Section eyebrow="FORECAST" title={`Where ${monthName(current)} is heading`} info={`Run rate: the hours recorded so far, divided by the share of the month's weekdays already gone (today included), project each person's month-end total. On track = within ±10% of the plan; behind / more than planned beyond that; heading over capacity = the projection reaches ${bands.overloadedAt}% of net capacity. Holidays and absence are already netted out of capacity. For a past month the projection equals the recorded hours.`}>
      <div className="dash-cards dash-cards-4">
        <Card label="Month elapsed" value={`${forecast.share}%`} hint="Share of weekdays gone" />
        <Card label="Projected hours" value={`${formatHours(forecast.projected)}h`} hint={<>{signed(forecast.vsPlan)} against {formatHours(forecast.plan)}h planned</>} />
        <Card label="Needs attention" value={attention.length} tone={attention.length ? 'danger' : undefined} hint={`${forecast.counts.behind} behind plan · ${forecast.counts['over-capacity']} heading over capacity`} />
        <Card label="On track" value={`${forecast.counts['on-track']} / ${forecast.people.length}`} hint={`${forecast.counts.ahead} more than planned · ${forecast.counts['no-data']} nothing recorded yet`} />
      </div>
      {forecast.people.length ? <><div className="azure-table"><table><thead><tr><th>Person</th><th>Plan h</th><th>Recorded h</th><th>Projected h</th><th>vs plan</th><th>Capacity h</th><th>Status</th></tr></thead><tbody>
        {forecastRows.shown.map((entry) => <tr key={entry.person}><td><strong>{entry.person}</strong>{entry.role && <small>{entry.role}</small>}</td><td>{h(entry.plan)}</td><td>{h(entry.actual)}</td><td>{h(entry.projected)}</td><td>{signed(entry.vsPlan)}</td><td>{h(entry.capacity)}</td><td><Pill tone={forecastTone[entry.status]}>{forecastLabel[entry.status]}</Pill></td></tr>)}
      </tbody></table></div>{forecastRows.button}</> : <EmptyState title={`No rows for ${monthName(current)}.`} />}
    </Section>
    <Section eyebrow="PLAN ACCURACY" title="How well do plans predict the hours?" info="Elapsed months only. Error = Σ|actual − plan| ÷ Σplan per person: how far the recorded hours land from the plan, whichever direction. Bias = (Σactual − Σplan) ÷ Σplan: negative means less recorded than planned (time not written, or plans too generous), positive means over-runs. Reliable at an error of 15% or less; under-records at a bias of −20% or lower; over-runs at +20% or higher; uneven otherwise.">
      <div className="dash-cards dash-cards-4">
        <Card label="Team error" value={pctText(accuracy.team.error)} hint={`Over ${accuracy.months} elapsed month${accuracy.months === 1 ? '' : 's'}`} />
        <Card label="Team bias" value={signedPct(accuracy.team.bias)} hint={accuracy.team.bias == null ? '' : accuracy.team.bias < 0 ? 'Less recorded than planned' : 'More recorded than planned'} />
        <Card label="Reliable planners" value={`${accuracy.people.filter((entry) => entry.verdict === 'reliable').length} / ${accuracy.people.length}`} hint="Error ≤ 15%" />
        <Card label="Under-recording" value={accuracy.people.filter((entry) => entry.verdict === 'under-records').length} tone={accuracy.people.some((entry) => entry.verdict === 'under-records') ? 'warning' : undefined} hint="Bias ≤ −20%: time not written or plans too generous" />
      </div>
      {accuracy.people.length ? <div className="dash-grid-2">
        <div><div className="azure-table"><table><thead><tr><th>Person</th><th>Months</th><th>Plan h</th><th>Actual h</th><th>Error</th><th>Bias</th><th>Verdict</th></tr></thead><tbody>
          {accuracyRows.shown.map((entry) => <tr key={entry.person}><td><strong>{entry.person}</strong>{entry.role && <small>{entry.role}</small>}</td><td>{entry.months}</td><td>{h(entry.plan)}</td><td>{h(entry.actual)}</td><td>{pctText(entry.error)}</td><td>{signedPct(entry.bias)}</td><td><Pill tone={verdictTone[entry.verdict]}>{verdictLabel[entry.verdict]}</Pill></td></tr>)}
        </tbody></table></div>{accuracyRows.button}</div>
        <div className="azure-table"><table><thead><tr><th>Month</th><th>Plan h</th><th>Actual h</th><th>Error</th><th>Bias</th></tr></thead><tbody>
          {accuracy.byMonth.map((entry) => <tr key={entry.month}><td><strong>{short(entry.month)}</strong></td><td>{h(entry.plan)}</td><td>{h(entry.actual)}</td><td>{pctText(entry.error)}</td><td>{signedPct(entry.bias)}</td></tr>)}
        </tbody></table></div>
      </div> : <EmptyState title="No elapsed months with a plan in the selection." detail="Plan accuracy needs at least one month that has ended." />}
    </Section>
    <Section eyebrow="MOMENTUM" title="Which streams gain or lose effort?" info={`Average recorded hours per month over the latest up to 3 elapsed months (${momentum.recentMonths.map(short).join(', ') || 'none'}) against the up to 3 before them (${momentum.earlierMonths.map(short).join(', ') || 'none'}), with each stream's share of all recorded hours in both windows. Rising / falling at a change of 20% or more and at least 8 hours; new = hours only in the recent window; gone = hours only before (a finished Epic looks like this).`}>
      {momentum.streams.length ? <div className="azure-table"><table><thead><tr><th>Stream (Epic)</th><th>Recent h / month</th><th>Earlier h / month</th><th>Change</th><th>Share now</th><th>Share before</th><th>People</th><th>Trend</th></tr></thead><tbody>
        {momentum.streams.map((entry) => <tr key={entry.key}><td><strong>{entry.title}</strong></td><td>{h(entry.recent)}</td><td>{momentum.earlierMonths.length ? h(entry.earlier) : '—'}</td><td>{signedPct(entry.change)}</td><td>{pctText(entry.shareRecent)}</td><td>{pctText(entry.shareEarlier)}</td><td>{entry.people}</td><td><Pill tone={trendTone[entry.trend]}>{trendLabel[entry.trend]}</Pill></td></tr>)}
      </tbody></table></div> : <EmptyState title="No elapsed months with recorded hours in the selection." />}
      {momentum.recentMonths.length > 0 && !momentum.earlierMonths.length && <p className="muted">Only {momentum.recentMonths.length} elapsed month{momentum.recentMonths.length === 1 ? '' : 's'} in the period: widen it to see a trend.</p>}
    </Section>
    <Section eyebrow="RESILIENCE" title="Where does the team depend on one person?" info="Elapsed months. A stream rests on one person when that person recorded 80% or more of its hours: a single point of failure if they are away. A specialist put 90% or more of their recorded hours into one stream: little room to move them. Both are facts to weigh, not faults.">
      <div className="dash-cards dash-cards-4">
        <Card label="Streams on one person" value={strength.singlePoints} tone={strength.singlePoints ? 'warning' : undefined} hint={`of ${strength.streams.length} with recorded hours`} />
        <Card label="Specialists" value={strength.specialists} hint={`of ${strength.people.length} people with recorded hours`} />
      </div>
      <div className="dash-grid-2">
        <div><h3>Streams and their main contributor</h3>{strength.streams.length ? <><div className="azure-table"><table><thead><tr><th>Stream</th><th>Hours</th><th>People</th><th>Main contributor</th><th>Share</th></tr></thead><tbody>
          {streamRows.shown.map((entry) => <tr key={entry.key}><td><strong>{entry.title}</strong></td><td>{h(entry.actual)}</td><td>{entry.people}</td><td>{entry.top}</td><td>{entry.singlePoint ? <Pill tone="warning">{entry.topShare}%</Pill> : `${entry.topShare}%`}</td></tr>)}
        </tbody></table></div>{streamRows.button}</> : <EmptyState title="No recorded hours in elapsed months." />}</div>
        <div><h3>People and their main stream</h3>{strength.people.length ? <><div className="azure-table"><table><thead><tr><th>Person</th><th>Hours</th><th>Streams</th><th>Main stream</th><th>Share</th></tr></thead><tbody>
          {personRows.shown.map((entry) => <tr key={entry.person}><td><strong>{entry.person}</strong>{entry.role && <small>{entry.role}</small>}</td><td>{h(entry.actual)}</td><td>{entry.streams}</td><td>{entry.main}</td><td>{entry.specialist ? <Pill tone="warning">{entry.mainShare}%</Pill> : `${entry.mainShare}%`}</td></tr>)}
        </tbody></table></div>{personRows.button}</> : <EmptyState title="No recorded hours in elapsed months." />}</div>
      </div>
    </Section>
    <Section eyebrow="UNUSUAL MONTHS" title="Which months stand out for a person?" info="Elapsed months. A person's recorded hours in a month that differ from the median of their other elapsed months by 50% or more and by at least 8 hours; at least 3 elapsed months with data are needed. A spike or a drop is a question to ask, not a verdict: leave, a release push or hours written late all look like this.">
      {unusual.length ? <><div className="azure-table"><table><thead><tr><th>Person</th><th>Month</th><th>Recorded h</th><th>Typical h</th><th>Change</th><th></th></tr></thead><tbody>
        {unusualRows.shown.map((entry) => <tr key={`${entry.person}-${entry.month}`}><td><strong>{entry.person}</strong></td><td>{short(entry.month)}</td><td>{h(entry.actual)}</td><td>{h(entry.typical)}</td><td>{signedPct(entry.change)}</td><td><Pill tone={entry.kind === 'spike' ? 'info' : 'warning'}>{entry.kind === 'spike' ? 'Spike' : 'Drop'}</Pill></td></tr>)}
      </tbody></table></div>{unusualRows.button}</> : <EmptyState title="No unusual months." detail="Nothing differs from a person's typical month by 50% or more — or fewer than 3 elapsed months with data." />}
    </Section>
  </NoHours>
}

function DefinitionsTab({ hoursPerDay, absenceEpicId, bands }: { hoursPerDay: number; absenceEpicId: number; bands: Bands }) {
  return <Panel title="Definitions, assumptions & source">
    <dl className="dash-findings">
      <dt>Source</dt><dd>The Time Writing connection (QMS-0025): month Time Writing Tasks, matched to a month when their title starts or ends with the month and year.</dd>
      <dt>Planned hours</dt><dd>Original Estimate on the month's Tasks.</dd>
      <dt>Recorded (actual) hours</dt><dd>Completed Work on the month's Tasks. A blank value is missing, a 0 is recorded zero.</dd>
      <dt>Capacity</dt><dd>Working days × {hoursPerDay}h, less absence (Tasks under Epic #{absenceEpicId}), holidays and common activities such as PI Planning or an audit (Epics / Features mapped in Settings → Capacity, applied to everyone or to everyone in a region), counted once per person and month.</dd>
      <dt>Utilization and its colours</dt><dd>Planned or recorded hours ÷ capacity. One model for the whole Dashboard, from Settings → Capacity: <span className="util util-over">↑ red</span> at or above {bands.overloadedAt}% (overloaded), <span className="util util-balanced">green</span> balanced, <span className="util util-spare">↓ blue</span> below {bands.availableBelow}% (spare). Colours show capacity position, not performance. Hour differences (+ / −) carry no colour.</dd>
      <dt>Month status</dt><dd>Elapsed (before the current month), partial (the current month) and future. Partial and future months do not establish spare capacity or results.</dd>
      <dt>Region and role</dt><dd>From Settings → Resources; people without a mapping show as No region / No role and are left out of rebalancing.</dd>
      <dt>Stream</dt><dd>The Epic above the Task. The stream filter keeps only that stream's hours and the people who book on it (their whole capacity still counts); it does not apply to the Epic mix, Pareto and Delivery panels, which say so.</dd>
      <dt>Planned overload</dt><dd>A person whose planned utilization over the period is at or above {bands.overloadedAt}%.</dd>
      <dt>Persistent overload</dt><dd>At or above {bands.overloadedAt}% of capacity in 3 or more consecutive elapsed months.</dd>
      <dt>Rebalancing</dt><dd>Overload in hours (plan above capacity) can only move to headroom of the same role in the same month, and only in current or future months.</dd>
      <dt>Elapsed months: recorded vs planned</dt><dd>Σ recorded ÷ Σ planned over the months of the period that have ended.</dd>
      <dt>Month-end forecast</dt><dd>Recorded hours so far ÷ the share of the month's weekdays gone (today included). On track within ±10% of the plan; heading over capacity when the projection reaches {bands.overloadedAt}% of net capacity.</dd>
      <dt>Plan accuracy</dt><dd>Elapsed months only. Error = Σ|actual − plan| ÷ Σplan; bias = (Σactual − Σplan) ÷ Σplan. Reliable at an error ≤ 15%; under-records at a bias ≤ −20%; over-runs at ≥ +20%.</dd>
      <dt>Stream momentum</dt><dd>Average recorded hours per month over the latest up to 3 elapsed months against the up to 3 before. Rising / falling at ±20% and at least 8 hours.</dd>
      <dt>Resilience</dt><dd>A stream rests on one person when they recorded ≥ 80% of its hours; a specialist put ≥ 90% of their hours into one stream. Elapsed months.</dd>
      <dt>Unusual months</dt><dd>A person's recorded hours differ from the median of their other elapsed months by ≥ 50% and ≥ 8 hours (3 elapsed months with data needed).</dd>
      <dt>Health score</dt><dd>Average of the components with data: balance (people planned in the {bands.availableBelow}–{bands.overloadedAt}% band), recording (planned Tasks with a recorded actual, elapsed months) and resilience (streams not resting on one person). Green from 75, amber from 50, red below.</dd>
      <dt>Overrun and ad-hoc</dt><dd>Overrun = Completed Work above Original Estimate per Task; ad-hoc = hours on Tasks tagged ad-hoc. Both over the period, ranked so the few Features or Epics up to the 80% line stand out.</dd>
    </dl>
  </Panel>
}
