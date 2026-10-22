import { useState, type ReactNode } from 'react'
import { EmptyState, Info, Metric, Metrics, Notice, Page, Panel, TablePanel } from '../components/ui'
import { OverviewTrends } from '../components/OverviewTrends'
import { capacityContext, regions, resourceRoles, type Region, type ResourceRole } from '../capacity'
import { applyFilter, byPerson, byRole, byStream, change, concentration, groupBy, noFilter, periodMonths, persistentOverload, personMonths, plannedOverload, quarterOf, rebalancing, streamTotals, totals, type Dimension, type Period, type PersonMonth, type DashboardFilter } from '../dashboard'
import { MultiSelect } from '../components/MultiSelect'
import { timeWritingMonth } from '../azureInsights'
import { formatHours, monthName, todayIso } from '../format'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { MyWork } from '../useMyWork'
import type { Page as PageId } from './registry'
import type { PageProps } from './types'

const tabs = [
  ['actions', 'Overview & Actions'], ['region', 'Region & Role'], ['months', 'Utilization by month'], ['trend', 'Actuals trend'],
  ['people', 'People & capacity'], ['streams', 'Streams & Epics'], ['charts', 'Charts'], ['definitions', 'Definitions'],
] as const
type Tab = typeof tabs[number][0]
interface Saved { tab: Tab; period: Period; filter: DashboardFilter }
const storageKey = 'demand-planning-dashboard-v2'
const list = <T extends string>(value: unknown, allowed?: readonly T[]) => Array.isArray(value) ? value.filter((entry): entry is T => typeof entry === 'string' && (!allowed || allowed.includes(entry as T))) : []
const numbers = (value: unknown, max: number) => Array.isArray(value) ? [...new Set(value.filter((entry): entry is number => Number.isInteger(entry) && entry >= 1 && entry <= max))].sort((a, b) => a - b) : []
// Starts on the quarter of the month picked in the header; the choice is remembered in this browser.
const load = (month: string): Saved => {
  const fallback: Saved = { tab: 'actions', period: { year: Number(month.slice(0, 4)), quarters: [quarterOf(month)], months: [] }, filter: noFilter }
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<Saved> | null
    if (!saved) return fallback
    const year = Number(saved.period?.year)
    return {
      tab: tabs.some(([key]) => key === saved.tab) ? saved.tab! : 'actions',
      period: Number.isInteger(year) && year > 2000 && year < 2100 ? { year, quarters: numbers(saved.period?.quarters, 4), months: numbers(saved.period?.months, 12) } : fallback.period,
      filter: { regions: list(saved.filter?.regions, regions), roles: list(saved.filter?.roles, resourceRoles), people: list(saved.filter?.people), streams: list(saved.filter?.streams) },
    }
  } catch { return fallback }
}
const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Utilization with direction against 100% of capacity: ↑ above (red), ↓ below (green), → exactly 100%.
export function Util({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="muted">—</span>
  const tone = value > 100 ? 'util-over' : value < 100 ? 'util-under' : 'util-at'
  return <span className={`util ${tone}`}>{value > 100 ? '↑' : value < 100 ? '↓' : '→'} {value.toFixed(1)}%</span>
}
const h = (value: number | undefined) => value == null ? '—' : formatHours(value)
const signed = (value: number | undefined, unit = 'h') => value == null ? <span className="muted">—</span> : <span className={value > 0 ? 'positive' : value < 0 ? 'negative' : 'muted'}>{value > 0 ? '↑ +' : value < 0 ? '↓ −' : '→ '}{formatHours(Math.abs(value))}{unit}</span>
const short = (month: string) => new Intl.DateTimeFormat('en', { month: 'short', year: '2-digit' }).format(new Date(`${month}-01T00:00:00`))
const statusLabel = { elapsed: 'Elapsed', partial: 'Partial', future: 'Future' } as const

export function DashboardPage({ month, azure, store, setMonth, my }: { month: string; azure: AzureWorkspace; navigate: (page: PageId) => void; store: PageProps['store']; setMonth?: (month: string) => void; my: MyWork }) {
  const settings = capacityContext(store.state)
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
  const people = [...new Set(everyone.map((row) => row.person))].sort((a, b) => a.localeCompare(b))
  const streamOptions = streamTotals(everyone)
  const notNow = months.filter((entry) => entry >= today.slice(0, 7))
  const overload = plannedOverload(rows)
  const filtered = Boolean(saved.filter.regions.length || saved.filter.roles.length || saved.filter.people.length || saved.filter.streams.length)
  const meName = my.me.name
  // Charts: the work items with only the Tasks of the people left by the region, role and person filters (unassigned
  // Tasks such as regional holidays stay); streams do not apply. They end with the last month of the period.
  const chartPeople = new Set(applyFilter(everyone, { ...saved.filter, streams: [] }).map((row) => row.person))
  const chartItems = filtered ? azure.items.filter((item) => item.workItemType !== 'Task' || !item.assignedTo || chartPeople.has(item.assignedTo)) : azure.items

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
      <div className="dash-chips"><span className="multi-label">Months</span><div className="chip-row">{monthLabels.map((label, index) => { const value = index + 1, inQuarter = saved.period.quarters.includes(Math.ceil(value / 3)); return <button key={label} type="button" className={`chip ${saved.period.months.includes(value) || inQuarter ? 'chip-on' : ''}`} aria-pressed={saved.period.months.includes(value) || inQuarter} disabled={inQuarter} title={inQuarter ? `In Q${Math.ceil(value / 3)}` : undefined} onClick={() => setPeriod({ months: toggle(saved.period.months, value) })}>{label}</button> })}</div></div>
      <button type="button" className="text-button" disabled={!saved.period.quarters.length && !saved.period.months.length} onClick={() => setPeriod({ quarters: [], months: [] })}>Whole year</button>
    </div>
    <p className="dash-legend"><span className="util util-over">↑ above 100% = red</span> <span className="util util-under">↓ below 100% = green</span> <span className="muted">→ at 100%. Colours show capacity position, not delivery performance.</span> <Info>Planned hours = Original Estimate and actual hours = Completed Work on the month's Time Writing Tasks. Capacity = working days × {settings.hoursPerDay}h, less absence and regional public holidays, counted once per person and month. Absence is not demand. Region and role come from Settings → Resources.</Info></p>
    <p className="muted dash-scope">{months.length === 1 ? monthName(months[0]) : months.length === 12 ? `${saved.period.year} (whole year)` : months.map(short).join(', ')} · {all.people} {all.people === 1 ? 'person' : 'people'} · {rows.length} person-months{saved.filter.streams.length ? ` · ${saved.filter.streams.map((key) => streamOptions.find((stream) => stream.key === key)?.title ?? key).join(', ')}` : ''}</p>
    {notNow.length > 0 && <Notice tone="warning">The selection includes partial or future months ({notNow.map(monthName).join(', ')}) as of {today}. Their hours ratios are not delivery results; averages over several months can hide overload in single months — see Utilization by month.</Notice>}
    {!rows.length ? <EmptyState title="No Time Writing data for this selection." detail="Change the period or filters, refresh from Azure, or load the synthetic sample." /> : <>
      <Metrics>
        <Metric label="Planned utilization" value={<Util value={all.planUtil} />} hint={`${formatHours(all.plan)}h plan / ${formatHours(all.capacity)}h capacity`} />
        <Metric label="Actual utilization" value={<Util value={all.actualUtil} />} hint={`${formatHours(all.actual)}h recorded`} />
        <Metric label="Planned overload" value={`${overload.over.length} / ${overload.people}`} hint="People planned above their capacity over the period" tone={overload.over.length ? 'negative' : undefined} />
        <Metric label="Net capacity gap" value={signed(all.gap)} hint={all.gap >= 0 ? 'Capacity not yet allocated in the plan' : 'Plan above capacity'} />
        <Metric label="Actual / planned hours" value={all.ratio == null ? '—' : `${all.ratio.toFixed(1)}%`} hint={<>{signed(Math.round((all.actual - all.plan) * 100) / 100)} actual − plan</>} />
      </Metrics>
      <div className="overview-tabs dash-tabs" role="tablist" aria-label="Overview sections">{tabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={saved.tab === key} className={`backlog-tab ${saved.tab === key ? 'backlog-tab-active' : ''}`} onClick={() => update({ tab: key })}>{label}</button>)}</div>
      {saved.tab === 'actions' && <ActionsTab rows={rows} months={months} />}
      {saved.tab === 'region' && <RegionTab rows={rows} />}
      {saved.tab === 'months' && <MonthsTab rows={rows} months={months} />}
      {saved.tab === 'trend' && <TrendTab rows={rows} months={months} />}
      {saved.tab === 'people' && <PeopleTab rows={rows} months={months} />}
      {saved.tab === 'streams' && <StreamsTab rows={rows} />}
      {saved.tab === 'charts' && <OverviewTrends items={chartItems} month={months[months.length - 1]} settings={settings} setMonth={setMonth} />}
      {saved.tab === 'definitions' && <DefinitionsTab hoursPerDay={settings.hoursPerDay} absenceEpicId={settings.absenceEpicId} />}
    </>}
  </Page>
}

function Section({ eyebrow, title, info, children }: { eyebrow: string; title: string; info?: ReactNode; children: ReactNode }) {
  return <Panel className="dash-section" eyebrow={eyebrow} title={title} info={info}>{children}</Panel>
}
function Card({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'danger' }) {
  return <div className={`dash-card ${tone ? `dash-card-${tone}` : ''}`}><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>
}
function monthSeries(rows: PersonMonth[], months: string[]) {
  return months.map((month) => { const entries = rows.filter((row) => row.month === month); return { month, status: entries[0]?.status, rows: entries, ...totals(entries), planLines: entries.reduce((sum, row) => sum + row.planLines, 0), blankActuals: entries.reduce((sum, row) => sum + row.blankActuals, 0) } })
}

// Planned and actual bars per month with the capacity as a dashed line; partial and future months shaded.
function DemandChart({ rows, months }: { rows: PersonMonth[]; months: string[] }) {
  const series = monthSeries(rows, months)
  const max = Math.max(1, ...series.flatMap((point) => [point.plan, point.actual, point.capacity]))
  const width = Math.max(480, months.length * 70), height = 240, top = 16, bottom = 210, slot = width / months.length, bar = Math.min(22, slot / 4)
  const y = (value: number) => bottom - value / max * (bottom - top)
  const line = series.map((point, index) => `${index ? 'L' : 'M'}${index * slot + slot / 2},${y(point.capacity)}`).join(' ')
  return <div className="dash-chart">
    <div className="legend"><span><i className="dash-dot dash-plan" />Planned</span><span><i className="dash-dot dash-actual" />Actual recorded</span><span><i className="dash-dot dash-cap" />Net capacity</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Planned and actual hours against capacity by month">
      {series.map((point, index) => <g key={point.month}>
        {point.status !== 'elapsed' && <rect x={index * slot} y={top} width={slot} height={bottom - top} className="dash-shade" />}
        <rect x={index * slot + slot / 2 - bar - 1} y={y(point.plan)} width={bar} height={bottom - y(point.plan)} className="dash-plan"><title>{`${monthName(point.month)}: ${formatHours(point.plan)}h planned`}</title></rect>
        <rect x={index * slot + slot / 2 + 1} y={y(point.actual)} width={bar} height={bottom - y(point.actual)} className="dash-actual"><title>{`${monthName(point.month)}: ${formatHours(point.actual)}h actual`}</title></rect>
        <text x={index * slot + slot / 2} y={height - 10} textAnchor="middle">{short(point.month)}</text>
      </g>)}
      <path d={line} className="dash-cap-line" />
      {series.map((point, index) => <circle key={point.month} cx={index * slot + slot / 2} cy={y(point.capacity)} r={3} className="dash-cap-dot"><title>{`${monthName(point.month)}: ${formatHours(point.capacity)}h capacity`}</title></circle>)}
    </svg>
    <small className="muted">Shaded: partial and future months.</small>
  </div>
}

function GroupTable({ rows, by, label }: { rows: PersonMonth[]; by: (row: PersonMonth) => string; label: string }) {
  const groups = groupBy(rows, by).sort((a, b) => b.plan - a.plan)
  return <div className="azure-table"><table><thead><tr><th>{label}</th><th>People</th><th>Plan h</th><th>Actual h</th><th>Capacity h</th><th>Plan / capacity</th><th>Actual / capacity</th><th>Actual / plan</th><th>Capacity gap h</th></tr></thead><tbody>
    {groups.map((group) => <tr key={group.name}><td><strong>{group.name}</strong></td><td>{group.people}</td><td>{h(group.plan)}</td><td>{h(group.actual)}</td><td>{h(group.capacity)}</td><td><Util value={group.planUtil} /></td><td><Util value={group.actualUtil} /></td><td>{group.ratio == null ? '—' : `${group.ratio.toFixed(1)}%`}</td><td>{signed(group.gap)}</td></tr>)}
  </tbody></table></div>
}

function ActionsTab({ rows, months }: { rows: PersonMonth[]; months: string[] }) {
  const persistentActual = persistentOverload(rows, months, 'actual'), persistentPlan = persistentOverload(rows, months, 'plan')
  const covered = new Set(rows.filter((row) => row.actual > 0 || row.tasks > 0).map((row) => row.person)).size
  const people = groupBy(rows, (row) => row.person)
  const actualTop = concentration(rows, 'actual'), planTop = concentration(rows, 'plan')
  const all = totals(rows), moves = rebalancing(rows), series = monthSeries(rows, months)
  const elapsed = rows.filter((row) => row.status === 'elapsed')
  const highest = [...people].filter((person) => person.planUtil != null).sort((a, b) => (b.planUtil ?? 0) - (a.planUtil ?? 0))[0]
  const overActual = groupBy(elapsed, (row) => row.person).filter((person) => person.actual > person.capacity)
  const gapPerson = groupBy(elapsed, (row) => row.person).sort((a, b) => (b.plan - b.actual) - (a.plan - a.actual))[0]
  const concentrationText = (top: ReturnType<typeof concentration>, what: string) => <>
    <strong>Top {top.top.length} of {top.of} people account for {top.hoursShare ?? 0}% of {what}.</strong>
    <p className="muted">{top.top.map((person) => `${person.name} (${formatHours(person.hours)}h)`).join(', ')}. Their share of capacity is {top.capacityShare ?? 0}%{top.hoursShare != null && top.capacityShare != null ? `; the hours share is ${Math.abs(Math.round((top.hoursShare - top.capacityShare) * 10) / 10)} percentage points ${top.hoursShare >= top.capacityShare ? 'above' : 'below'} it` : ''}.</p>
    <div className="progress"><i className={top.alert ? 'over' : ''} style={{ width: `${Math.min(100, top.hoursShare ?? 0)}%` }} /></div>
    <small className={top.alert ? 'negative' : 'muted'}>{top.alert ? 'Concentration to review: hours share is at least 10 percentage points above capacity share.' : 'No concentration alert at the 10-percentage-point threshold.'}</small>
  </>
  return <>
    <Section eyebrow="WORKLOAD MONITOR" title="Repeated overload & workload concentration" info="Persistent overload = above 100% of capacity in at least 3 consecutive elapsed months of the period; a month without data breaks the streak. Partial and future months are left out. Concentration compares the top 20% of people (rounded up) by hours with their share of capacity.">
      <div className="dash-cards">
        <Card label="Persistent actual overload" value={`${persistentActual.length} ${persistentActual.length === 1 ? 'person' : 'people'}`} hint={persistentActual.join(', ') || 'None'} tone={persistentActual.length ? 'danger' : undefined} />
        <Card label="Persistent planned overload" value={`${persistentPlan.length} ${persistentPlan.length === 1 ? 'person' : 'people'}`} hint={persistentPlan.join(', ') || 'None'} tone={persistentPlan.length ? 'danger' : undefined} />
        <Card label="Actuals coverage" value={`${covered} / ${people.length}`} hint="People with at least one entry" />
      </div>
      <div className="dash-grid-2"><div><h3>Recorded actual hours</h3>{concentrationText(actualTop, 'actual hours')}</div><div><h3>Planned hours</h3>{concentrationText(planTop, 'planned hours')}</div></div>
    </Section>
    <div className="dash-grid-wide">
      <Panel title="Demand against available capacity" info="Monthly hours for the selected people: planned (Original Estimate), actual recorded (Completed Work) and net capacity (less absence)."><DemandChart rows={rows} months={months} /></Panel>
      <Panel title="What the numbers mean" info="Findings for the selected period and filters, recalculated with every change.">
        <dl className="dash-findings">
          <dt>{signed(all.gap)} between capacity and plan</dt><dd>{all.gap >= 0 ? `${formatHours(all.gap)}h of capacity is not yet planned. At most ${formatHours(moves.movable)}h of overload could move to headroom in the same role and month.` : `The plan is ${formatHours(-all.gap)}h above capacity. Review scope, timing and priorities.`}</dd>
          {highest && <><dt>{highest.name} has the highest planned utilization</dt><dd>{formatHours(highest.plan)}h planned against {formatHours(highest.capacity)}h capacity (<Util value={highest.planUtil} />).</dd></>}
          <dt>{overActual.length} {overActual.length === 1 ? 'person exceeds' : 'people exceed'} capacity on recorded actuals</dt><dd>{overActual.length ? overActual.map((person) => person.name).join(', ') + '. ' : ''}Elapsed months only. Recorded hours may include work done outside plan; check completeness before drawing staffing conclusions.</dd>
          {gapPerson && gapPerson.plan - gapPerson.actual > 0 && <><dt>{gapPerson.name} has a {formatHours(gapPerson.plan - gapPerson.actual)}h plan-to-actual gap</dt><dd>Elapsed months only: planned {formatHours(gapPerson.plan)}h, recorded {formatHours(gapPerson.actual)}h.</dd></>}
          <dt>{formatHours(all.absence)}h absence</dt><dd>Leave and public holidays lower capacity; they are not counted as demand.</dd>
        </dl>
      </Panel>
    </div>
    <div className="dash-grid-2">
      <Panel title="Rebalancing has a limit" info="Overload (plan above capacity) can only move to headroom of the same role in the same month; people without a role are left out. Headroom counts only the current and future months.">
        <div className="dash-cards"><Card label="Gross monthly overload" value={`${formatHours(moves.overload)}h`} tone={moves.overload ? 'danger' : undefined} /><Card label="Headroom (current & future)" value={`${formatHours(moves.headroom)}h`} /><Card label="Movable in same role & month" value={`${formatHours(moves.movable)}h`} hint={`Remaining shortfall ${formatHours(moves.shortfall)}h`} /></div>
        <h3>Largest planned relief needs</h3>
        {moves.needs.length ? <div className="azure-table"><table><thead><tr><th>Person</th><th>Month</th><th>Plan h</th><th>Capacity h</th><th>Relief h</th></tr></thead><tbody>{moves.needs.slice(0, 8).map((entry) => <tr key={`${entry.person}-${entry.month}`}><td>{entry.person}<small>{[entry.region, entry.role].filter(Boolean).join(' / ')}</small></td><td>{short(entry.month)}</td><td>{h(entry.plan)}</td><td>{h(entry.capacity)}</td><td className="negative">↑ {h(entry.need)}</td></tr>)}</tbody></table></div> : <p className="muted">Nobody is planned above capacity.</p>}
        <h3>Potential receivers</h3>
        {moves.receivers.length ? <div className="azure-table"><table><thead><tr><th>Person</th><th>Month</th><th>Plan h</th><th>Headroom h</th></tr></thead><tbody>{moves.receivers.slice(0, 8).map((entry) => <tr key={`${entry.person}-${entry.month}`}><td>{entry.person}<small>{[entry.region, entry.role].filter(Boolean).join(' / ')}</small></td><td>{short(entry.month)}</td><td>{h(entry.plan)}</td><td className="positive">↓ {h(entry.headroom)}</td></tr>)}</tbody></table></div> : <p className="muted">No headroom in the current or future months of the period.</p>}
      </Panel>
      <Panel title="Role-level demand & capacity" info="Per role from Settings → Resources; people without a role are grouped as No role. Rebalancing works within one role.">
        <GroupTable rows={rows} by={(row) => row.role ?? 'No role'} label="Role" />
      </Panel>
    </div>
    <TablePanel title="Planning horizon & recording coverage" info="A thin plan is a reason to validate future demand. Lines with plan > 0 = month Tasks with an Original Estimate; of these, blank actuals = no Completed Work entered (a numeric 0 counts as entered)." count={`${months.length} month${months.length === 1 ? '' : 's'}`}>
      <table><thead><tr><th>Month</th><th>Planned h</th><th>Actual h</th><th>Capacity h</th><th>Planned utilization</th><th>Actual utilization</th><th>Lines with plan &gt; 0</th><th>Of these: blank actual</th><th>Absence h</th></tr></thead><tbody>
        {series.map((point) => <tr key={point.month}><td><strong>{monthName(point.month)}</strong>{point.status && <small>{statusLabel[point.status]}</small>}</td><td>{h(point.plan)}</td><td>{h(point.actual)}</td><td>{h(point.capacity)}</td><td><Util value={point.planUtil} /></td><td><Util value={point.actualUtil} /></td><td>{point.planLines}</td><td>{point.blankActuals}</td><td>{h(point.absence)}</td></tr>)}
      </tbody></table>
    </TablePanel>
  </>
}

function Bars({ groups }: { groups: ReturnType<typeof groupBy> }) {
  const max = Math.max(100, ...groups.flatMap((group) => [group.planUtil ?? 0, group.actualUtil ?? 0]))
  return <div className="dash-bars">{groups.map((group) => <div key={group.name} className="dash-bar-row">
    <div className="dash-bar-label"><strong>{group.name}</strong><small>{group.people} people · {formatHours(group.capacity)}h capacity · {formatHours(group.plan)}h plan · {formatHours(group.actual)}h actual</small></div>
    <div className="dash-bar-track"><i className="dash-plan" style={{ width: `${(group.planUtil ?? 0) / max * 100}%` }} /><i className="dash-actual" style={{ width: `${(group.actualUtil ?? 0) / max * 100}%` }} /><b style={{ left: `${100 / max * 100}%` }} title="100% capacity" /></div>
    <div className="dash-bar-values">Plan <Util value={group.planUtil} /> · Actual <Util value={group.actualUtil} /></div>
  </div>)}</div>
}

function RegionTab({ rows }: { rows: PersonMonth[] }) {
  const pressure = groupBy(rows, (row) => `${row.region ?? 'No region'} · ${row.role ?? 'No role'}`).sort((a, b) => (b.planUtil ?? 0) - (a.planUtil ?? 0))
  return <>
    <div className="dash-grid-2">
      <Panel title="By region" info="Planned and actual hours against each region's capacity. Bars: planned (blue) and actual (green) utilization; the line is 100% of capacity."><Bars groups={groupBy(rows, (row) => row.region ?? 'No region')} /></Panel>
      <Panel title="By role" info="The same for each role (Settings → Resources)."><Bars groups={groupBy(rows, (row) => row.role ?? 'No role')} /></Panel>
    </div>
    <TablePanel title="Where pressure is concentrated" info="Region and role combined, highest planned utilization first. Low actual utilization can reflect incomplete recording."><GroupTable rows={rows} by={(row) => `${row.region ?? 'No region'} · ${row.role ?? 'No role'}`} label="Region · role" /></TablePanel>
    {pressure[0] && <p className="muted">{pressure[0].name} has the highest planned utilization: <Util value={pressure[0].planUtil} /> ({formatHours(pressure[0].plan)}h against {formatHours(pressure[0].capacity)}h).</p>}
    <TablePanel title="By region" info="Each region's totals."><GroupTable rows={rows} by={(row) => row.region ?? 'No region'} label="Region" /></TablePanel>
  </>
}

function Heatmap({ title, info, lines, months }: { title: string; info: string; lines: { name: string; detail?: string; rows: PersonMonth[] }[]; months: string[] }) {
  return <TablePanel title={title} info={info}><div className="azure-table"><table className="dash-heat"><thead><tr><th>Person / group</th>{months.map((month) => <th key={month}>{short(month)}</th>)}</tr></thead><tbody>
    {lines.map((line) => <tr key={line.name}><td><strong>{line.name}</strong>{line.detail && <small>{line.detail}</small>}</td>{months.map((month) => { const entries = line.rows.filter((row) => row.month === month); const t = totals(entries); const value = entries.length && entries.some((row) => row.tasks) ? t.actualUtil : null; return <td key={month} className={value == null ? 'heat-none' : value > 100 ? 'heat-over' : 'heat-under'} title={entries.length ? `${formatHours(t.actual)}h actual / ${formatHours(t.capacity)}h capacity` : 'No entry'}>{value == null ? 'No entry' : <Util value={value} />}</td> })}</tr>)}
  </tbody></table></div></TablePanel>
}

function MonthsTab({ rows, months }: { rows: PersonMonth[]; months: string[] }) {
  const series = monthSeries(rows, months)
  const people = groupBy(rows, (row) => row.person).sort((a, b) => a.name.localeCompare(b.name))
  return <>
    <div className="dash-cards dash-cards-4">{series.map((point) => <Card key={point.month} label={monthName(point.month)} value={<Util value={point.rows.some((row) => row.tasks) ? point.actualUtil : null} />} hint={<>{formatHours(point.actual)}h actual / {formatHours(point.capacity)}h capacity<br />{point.status ? `${statusLabel[point.status]} month` : 'No data'}</>} />)}</div>
    <Heatmap title="Actual utilization % · team & people" info="Actual utilization = recorded actual hours ÷ net capacity, per person and month. Red ↑ is above 100%; green ↓ below. No entry = no Time Writing Task that month. Partial and future months do not establish spare capacity." months={months} lines={[{ name: 'Selected team', rows }, ...people.map((person) => ({ name: person.name, detail: [person.rows[0]?.region, person.rows[0]?.role].filter(Boolean).join(' · '), rows: person.rows }))]} />
    <Heatmap title="Actual utilization % · by role" info="The same per role." months={months} lines={groupBy(rows, (row) => row.role ?? 'No role').map((group) => ({ name: group.name, rows: group.rows }))} />
  </>
}

function ChangeTable({ title, rows, previous, current, dimension, label }: { title: string; rows: PersonMonth[]; previous: string; current: string; dimension: Dimension; label: string }) {
  const lines = change(rows, previous, current, dimension)
  return <TablePanel title={title} info="Actual recorded hours in both months under the same filters. Missing entries mean nothing was recorded, not zero effort." empty={lines.length ? undefined : 'Nothing recorded in either month.'}>
    {lines.length > 0 && <table><thead><tr><th>{label}</th><th>{short(previous)} actual h</th><th>{short(current)} actual h</th><th>Change h</th><th>Change %</th></tr></thead><tbody>{lines.map((line) => <tr key={line.name}><td>{line.name}</td><td>{h(line.previous)}</td><td>{h(line.current)}</td><td>{line.change == null ? <span className="muted">No comparable entries</span> : signed(line.change)}</td><td>{line.percent == null ? '—' : signed(line.percent, '%')}</td></tr>)}</tbody></table>}
  </TablePanel>
}

function TrendTab({ rows, months }: { rows: PersonMonth[]; months: string[] }) {
  const series = monthSeries(rows, months)
  const withActuals = series.filter((point) => point.actual > 0).map((point) => point.month)
  const [chosen, setChosen] = useState('')
  const current = months.includes(chosen) && months.indexOf(chosen) > 0 ? chosen : withActuals[withActuals.length - 1] && months.indexOf(withActuals[withActuals.length - 1]) > 0 ? withActuals[withActuals.length - 1] : months[months.length - 1]
  const previous = months[months.indexOf(current) - 1]
  if (!previous) return <EmptyState title="Choose a period of at least two months." detail="Actuals trend compares a month with the one before it." />
  const now = series.find((point) => point.month === current)!, before = series.find((point) => point.month === previous)!
  const max = Math.max(1, ...series.map((point) => point.actual))
  return <>
    <Section eyebrow="PREVIOUS-MONTH COMPARISON · ACTUALS" title={`${monthName(current)} vs ${monthName(previous)}`} info="Each month is compared with the one before it, under the same filters.">
      <div className="chip-row">{months.slice(1).map((month) => <button key={month} type="button" className={`chip ${month === current ? 'chip-on' : ''}`} onClick={() => setChosen(month)}>{short(month)} vs {short(months[months.indexOf(month) - 1])}</button>)}</div>
    </Section>
    {now.status !== 'elapsed' && <Notice tone="warning">{monthName(current)} is a {now.status} month: its recorded hours are not comparable with a completed month.</Notice>}
    <div className="dash-cards dash-cards-5">
      <Card label="Current actual hours" value={`${formatHours(now.actual)}h`} hint={monthName(current)} />
      <Card label="Previous actual hours" value={`${formatHours(before.actual)}h`} hint={monthName(previous)} />
      <Card label="Month-on-month change" value={signed(Math.round((now.actual - before.actual) * 100) / 100)} hint={before.actual > 0 ? `${((now.actual - before.actual) / before.actual * 100).toFixed(1)}%` : 'New from zero'} />
      <Card label="Actual utilization" value={<Util value={now.actualUtil} />} hint={<>Previous <Util value={before.actualUtil} /></>} />
      <Card label="People with actual entries" value={`${new Set(now.rows.filter((row) => row.actual > 0).map((row) => row.person)).size} / ${now.people}`} />
    </div>
    <Panel title="Actual recorded hours over time" info="Under the same filters; the two compared months are highlighted.">
      <div className="dash-columns">{series.map((point) => <div key={point.month} className={point.month === current ? 'is-current' : point.month === previous ? 'is-previous' : ''}><span>{formatHours(point.actual)}</span><i style={{ height: `${point.actual / max * 140}px` }} /><small>{short(point.month)}</small></div>)}</div>
    </Panel>
    <div className="dash-grid-2">
      <ChangeTable title="Change by role" rows={rows} previous={previous} current={current} dimension={byRole} label="Role" />
      <ChangeTable title="Change by stream" rows={rows} previous={previous} current={current} dimension={byStream} label="Stream (Epic)" />
    </div>
    <ChangeTable title="Change by team member" rows={rows} previous={previous} current={current} dimension={byPerson} label="Person" />
  </>
}

function PeopleTab({ rows, months }: { rows: PersonMonth[]; months: string[] }) {
  const persistent = new Set(persistentOverload(rows, months, 'actual'))
  const people = groupBy(rows, (row) => row.person).sort((a, b) => (b.planUtil ?? 0) - (a.planUtil ?? 0))
  return <>
    <TablePanel title="Team workload and variance" info="Per person over the period: capacity (net of absence), planned and actual hours, utilization and the variance actual − plan. ⚠ = above capacity on actuals in 3 or more consecutive elapsed months." count={`${people.length} people`}>
      <table><thead><tr><th>Person</th><th>Region / role</th><th>Capacity h</th><th>Absence h</th><th>Plan h</th><th>Actual h</th><th>Planned utilization</th><th>Actual utilization</th><th>Variance h</th></tr></thead><tbody>
        {people.map((person) => <tr key={person.name}><td><strong>{person.name}{persistent.has(person.name) && <span className="negative" title="Persistent actual overload"> ⚠</span>}</strong></td><td>{[person.rows[0]?.region, person.rows[0]?.role].filter(Boolean).join(' / ') || '—'}</td><td>{h(person.capacity)}</td><td>{h(person.absence)}</td><td>{h(person.plan)}</td><td>{h(person.actual)}</td><td><Util value={person.planUtil} /></td><td><Util value={person.actualUtil} /></td><td>{signed(Math.round((person.actual - person.plan) * 100) / 100)}</td></tr>)}
      </tbody></table>
    </TablePanel>
    <Heatmap title="Planned utilization across the horizon" info="Planned hours ÷ net capacity per person and month." months={months} lines={people.map((person) => ({ name: person.name, rows: person.rows.map((row) => ({ ...row, actual: row.plan })) }))} />
  </>
}

function StreamsTab({ rows }: { rows: PersonMonth[] }) {
  const streams = streamTotals(rows)
  const max = Math.max(1, ...streams.flatMap((stream) => [stream.plan, stream.actual]))
  return <>
    <TablePanel title="Where planned demand sits" info="Planned and actual hours per stream (the Epic above the Time Writing Task); share = share of the planned hours. Absence is excluded." count={`${streams.length} streams`} empty={streams.length ? undefined : 'No hours in this selection.'}>
      {streams.length > 0 && <table><thead><tr><th>Stream (Epic)</th><th>Plan h</th><th>Actual h</th><th>Actual − plan</th><th>Share of plan</th><th>People</th><th>Plan vs actual</th></tr></thead><tbody>
        {streams.map((stream) => <tr key={stream.key}><td><strong>{stream.title}</strong></td><td>{h(stream.plan)}</td><td>{h(stream.actual)}</td><td>{signed(Math.round((stream.actual - stream.plan) * 100) / 100)}</td><td>{stream.share == null ? '—' : `${stream.share.toFixed(1)}%`}</td><td title={stream.people.join(', ')}>{stream.people.length}</td><td className="dash-pair"><i className="dash-plan" style={{ width: `${stream.plan / max * 100}%` }} /><i className="dash-actual" style={{ width: `${stream.actual / max * 100}%` }} /></td></tr>)}
      </tbody></table>}
    </TablePanel>
    <TablePanel title="Epic assignments" info="Who books on each stream, with their planned and actual hours.">
      <table><thead><tr><th>Stream (Epic)</th><th>Person</th><th>Plan h</th><th>Actual h</th></tr></thead><tbody>
        {streams.flatMap((stream) => groupBy(rows.filter((row) => row.streams.some((entry) => entry.key === stream.key)).map((row) => { const entry = row.streams.find((item) => item.key === stream.key)!; return { ...row, plan: entry.plan, actual: entry.actual } }), (row) => row.person).sort((a, b) => b.plan - a.plan).map((person, index) => <tr key={`${stream.key}-${person.name}`}><td>{index === 0 ? <strong>{stream.title}</strong> : ''}</td><td>{person.name}</td><td>{h(person.plan)}</td><td>{h(person.actual)}</td></tr>))}
      </tbody></table>
    </TablePanel>
  </>
}

function DefinitionsTab({ hoursPerDay, absenceEpicId }: { hoursPerDay: number; absenceEpicId: number }) {
  return <Panel title="Definitions, assumptions & source">
    <dl className="dash-findings">
      <dt>Source</dt><dd>The Time Writing connection (QMS-0025): month Time Writing Tasks, matched to a month when their title starts or ends with the month and year.</dd>
      <dt>Planned hours</dt><dd>Original Estimate on the month's Tasks.</dd>
      <dt>Actual hours</dt><dd>Completed Work on the month's Tasks. A blank value is missing, a 0 is recorded zero.</dd>
      <dt>Capacity</dt><dd>Working days × {hoursPerDay}h, less absence (Tasks under Epic #{absenceEpicId}) and regional public holidays, counted once per person and month.</dd>
      <dt>Utilization</dt><dd>Planned or actual hours ÷ capacity. ↑ red above 100%, ↓ green below, → exactly 100%. Colours show capacity position, not delivery performance.</dd>
      <dt>Month status</dt><dd>Elapsed (before the current month), partial (the current month) and future. Partial and future months do not establish spare capacity or delivery results.</dd>
      <dt>Region and role</dt><dd>From Settings → Resources; people without a mapping show as No region / No role and are left out of rebalancing.</dd>
      <dt>Stream</dt><dd>The Epic above the Task. The stream filter keeps only that stream's hours and the people who book on it (their whole capacity still counts).</dd>
      <dt>Persistent overload</dt><dd>Above 100% of capacity in 3 or more consecutive elapsed months.</dd>
      <dt>Rebalancing</dt><dd>Overload can only move to headroom of the same role in the same month, and only in current or future months.</dd>
    </dl>
  </Panel>
}
