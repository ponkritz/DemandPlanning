import { useMemo, useState } from 'react'
import { normalizeRules, normalizeScopes } from '../baseline'
import { capacityContext } from '../capacity'
import { EmptyState, Page } from '../components/ui'
import type { AzureWorkItem } from '../domain'
import { formatDate, formatHours, monthName, todayIso } from '../format'
import { allFilter, planningOverview, type ExceptionKind, type OverviewFilter } from '../planningOverview'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { PageProps } from './types'

// Planning Overview (OVW-01…OVW-08), under Testing: the team's month — filters, four tiles against the month before,
// workload against capacity over 12 months, one exception queue and delivery health per Epic. Read only.

const kindLabel: Record<ExceptionKind, string> = { 'over-baseline': 'Over 25% baseline', 'missing-baseline': 'Missing baseline', 'capacity-risk': 'Capacity risk' }
const shortMonth = (month: string) => new Intl.DateTimeFormat('en', { month: 'short', year: '2-digit' }).format(new Date(`${month}-01T00:00:00`))
const delta = (now: number | null, before: number | null) => now == null || before == null ? null : Math.round((now - before) * 10) / 10

function Change({ value, unit = 'pp', goodWhenUp = true }: { value: number | null; unit?: string; goodWhenUp?: boolean }) {
  if (value == null) return <small className="ovw-delta">no previous month</small>
  const up = value > 0, good = value === 0 ? undefined : up === goodWhenUp
  return <small className={`ovw-delta${good === undefined ? '' : good ? ' ovw-good' : ' ovw-bad'}`}><span aria-hidden="true">{value === 0 ? '■' : up ? '▲' : '▼'}</span> {value > 0 ? '+' : ''}{value}{unit} <span>vs previous month</span></small>
}

export function PlanningOverviewPage({ azure, store, month, onOpenPack }: { azure: AzureWorkspace; store: PageProps['store']; month: string; onOpenPack: () => void }) {
  const [filter, setFilter] = useState<OverviewFilter>(allFilter)
  const [kind, setKind] = useState<ExceptionKind | 'all'>('all')
  const [hover, setHover] = useState<number | null>(null)
  const settings = capacityContext(store.state)
  const model = useMemo(() => planningOverview({ items: azure.items, month, today: todayIso(), settings, rules: normalizeRules(store.state.baselineRules), scopes: normalizeScopes(store.state.releaseScopes) }, filter),
    [azure.items, month, settings, store.state.baselineRules, store.state.releaseScopes, filter])
  if (!azure.items.length) return <Page><EmptyState title="No work items yet" detail="Fetch the Time Writing data from Azure DevOps (Settings → Azure DevOps), or load the synthetic sample, to see the overview." /></Page>
  const set = (key: keyof OverviewFilter) => (value: string) => setFilter((current) => ({ ...current, [key]: value }))
  const { tiles, trend } = model
  const shown = kind === 'all' ? model.exceptions : model.exceptions.filter((entry) => entry.kind === kind)
  const count = (value: ExceptionKind) => model.exceptions.filter((entry) => entry.kind === value).length
  const link = (item?: AzureWorkItem) => item ? <a href={item.url} target="_blank" rel="noreferrer">#{item.id}</a> : null

  // Workload chart: planned and actual hours (bars) against capacity (line), one axis in hours.
  const top = Math.max(1, ...trend.flatMap((entry) => [entry.plan, entry.actual, entry.capacity]))
  const width = 1100, height = 240, left = 48, bottom = 24, plotW = width - left - 8, plotH = height - bottom - 10
  const step = plotW / trend.length, bar = Math.min(16, step / 3)
  const y = (value: number) => 10 + plotH - (value / top) * plotH
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((share) => Math.round(top * share))
  const line = trend.map((entry, index) => `${index ? 'L' : 'M'}${left + step * index + step / 2},${y(entry.capacity)}`).join(' ')

  return <Page className="overview-page">
    <header className="act-header"><div><h2>Planning overview</h2><p>The team’s {monthName(month)} at a glance — workload, delivery and what needs attention.</p></div>
      <button type="button" className="act-primary ovw-pack" onClick={onOpenPack}>Generate Monthly Pack</button></header>

    <div className="ovw-filters" role="group" aria-label="Filters">
      <label>Region<select value={filter.region} onChange={(event) => set('region')(event.target.value)}><option value="">All regions</option>{model.options.regions.map((region) => <option key={region}>{region}</option>)}</select></label>
      <label>Epic<select value={filter.epic} onChange={(event) => set('epic')(event.target.value)}><option value="">All Epics</option>{model.options.epics.map((epic) => <option key={epic.key} value={epic.key}>#{epic.id} {epic.title}</option>)}</select></label>
      <label>Owner<select value={filter.owner} onChange={(event) => set('owner')(event.target.value)}><option value="">All owners</option>{model.options.owners.map((owner) => <option key={owner}>{owner}</option>)}</select></label>
      {(filter.region || filter.epic || filter.owner) && <button type="button" className="act-link" onClick={() => setFilter(allFilter)}>Clear filters</button>}
    </div>

    <section className="ovw-tiles" aria-label="Headline figures">
      <article className="act-card ovw-tile"><span>Planned utilization</span><strong>{tiles.utilization.now == null ? '—' : `${Math.round(tiles.utilization.now)}%`}</strong><Change value={delta(tiles.utilization.now, tiles.utilization.before)} goodWhenUp={(tiles.utilization.now ?? 0) <= settings.overloadedAt} /></article>
      <article className="act-card ovw-tile"><span>Delivery</span><strong>{tiles.delivery.now.rate == null ? '—' : `${Math.round(tiles.delivery.now.rate)}%`}</strong><small>{tiles.delivery.now.completed} of {tiles.delivery.now.due} Features due this month done</small><Change value={delta(tiles.delivery.now.rate, tiles.delivery.before.rate)} /></article>
      <article className={`act-card ovw-tile${tiles.baseline.over ? ' ovw-alert' : ''}`}><span>Baseline exceptions</span><strong>{tiles.baseline.over}</strong><small>over their baseline by more than 25% · {tiles.baseline.missing} without a baseline</small></article>
      <article className={`act-card ovw-tile${tiles.capacity.atRisk ? ' ovw-alert' : ''}`}><span>Capacity risk</span><strong>{tiles.capacity.atRisk}</strong><small>of {tiles.capacity.people} people planned over {settings.overloadedAt}% of capacity</small></article>
    </section>

    <section className="act-card ovw-trend" aria-labelledby="ovw-trend">
      <div className="ovw-head"><h3 id="ovw-trend">Workload and capacity · last 12 months</h3>
        <ul className="ovw-legend"><li><i className="ovw-k-plan" />Planned</li><li><i className="ovw-k-actual" />Actual</li><li><i className="ovw-k-cap" />Capacity</li></ul></div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Planned and actual hours against capacity per month" className="ovw-chart" onMouseLeave={() => setHover(null)}>
        {ticks.map((tick) => <g key={tick}><line x1={left} x2={width - 8} y1={y(tick)} y2={y(tick)} className="ovw-grid" /><text x={left - 6} y={y(tick) + 4} textAnchor="end" className="ovw-axis">{formatHours(tick)}</text></g>)}
        {trend.map((entry, index) => { const x = left + step * index + step / 2; return <g key={entry.month} onMouseEnter={() => setHover(index)}>
          <rect x={x - step / 2} y={10} width={step} height={plotH} fill="transparent" />
          <rect x={x - bar - 1} y={y(entry.plan)} width={bar} height={Math.max(0, 10 + plotH - y(entry.plan))} rx={3} className="ovw-plan" />
          <rect x={x + 1} y={y(entry.actual)} width={bar} height={Math.max(0, 10 + plotH - y(entry.actual))} rx={3} className="ovw-actual" />
          <text x={x} y={height - 6} textAnchor="middle" className="ovw-axis">{shortMonth(entry.month)}</text></g> })}
        <path d={line} className="ovw-cap" />
        {trend.map((entry, index) => <circle key={entry.month} cx={left + step * index + step / 2} cy={y(entry.capacity)} r={4} className="ovw-cap-dot" />)}
      </svg>
      {hover != null && <p className="ovw-tip" role="status"><strong>{monthName(trend[hover].month)}</strong> · Planned {formatHours(trend[hover].plan)}h · Actual {formatHours(trend[hover].actual)}h · Capacity {formatHours(trend[hover].capacity)}h{trend[hover].planUtil != null ? ` · ${Math.round(trend[hover].planUtil!)}% planned` : ''}</p>}
      <details className="ovw-table"><summary>Show as a table</summary><table><thead><tr><th>Month</th><th>Planned (h)</th><th>Actual (h)</th><th>Capacity (h)</th></tr></thead><tbody>{trend.map((entry) => <tr key={entry.month}><td>{monthName(entry.month)}</td><td>{formatHours(entry.plan)}</td><td>{formatHours(entry.actual)}</td><td>{formatHours(entry.capacity)}</td></tr>)}</tbody></table></details>
    </section>

    <div className="ovw-bottom">
      <section className="act-card" aria-labelledby="ovw-queue">
        <div className="ovw-head"><h3 id="ovw-queue">Exception queue <small>({model.exceptions.length})</small></h3>
          <div className="ovw-chips" role="group" aria-label="Exception type">{(['all', 'over-baseline', 'missing-baseline', 'capacity-risk'] as const).map((value) => <button key={value} type="button" aria-pressed={kind === value} className={kind === value ? 'active' : ''} onClick={() => setKind(value)}>{value === 'all' ? 'All' : kindLabel[value]} <b>{value === 'all' ? model.exceptions.length : count(value)}</b></button>)}</div></div>
        {shown.length ? <div className="ovw-scroll"><table className="ovw-queue"><thead><tr><th>Item</th><th>Epic</th><th>Issue</th><th>Impact</th><th>Owner</th><th>Target date</th></tr></thead><tbody>
          {shown.map((entry, index) => <tr key={`${entry.kind}:${entry.item?.id ?? entry.title}:${index}`}><td>{link(entry.item)} {entry.title}{entry.region ? <small>{entry.region}</small> : null}</td><td>{entry.epic}</td><td><span className={`ovw-issue ovw-${entry.kind}`}>{kindLabel[entry.kind]}</span></td><td>{entry.impact}</td><td>{entry.owner}</td><td>{entry.target ? formatDate(entry.target) : '—'}</td></tr>)}
        </tbody></table></div> : <p className="act-sub">Nothing needs attention for these filters.</p>}
      </section>

      <section className="act-card" aria-labelledby="ovw-health">
        <h3 id="ovw-health">Delivery health · next 6 months</h3>
        <p className="act-sub">Features by Target date, from {monthName(month)}.</p>
        <div className="ovw-totals"><div><strong>{model.timelineTotals.total}</strong><span>Due</span></div><div className="ovw-good"><strong>{model.timelineTotals.completed}</strong><span>Completed</span></div><div className="ovw-warn"><strong>{model.timelineTotals.atRisk}</strong><span>Open</span></div><div className="ovw-bad"><strong>{model.timelineTotals.overdue}</strong><span>Overdue</span></div></div>
        {model.timeline.length ? <ul className="ovw-health">{model.timeline.slice(0, 8).map((entry) => <li key={entry.epic.id} title={`${entry.epic.title}: ${entry.completed} completed, ${entry.atRisk} open, ${entry.overdue} overdue`}>
          <span>{entry.epic.title}</span>
          <div className="ovw-stack" aria-hidden="true">{(['completed', 'atRisk', 'overdue'] as const).map((part) => entry[part] ? <i key={part} className={`ovw-s-${part}`} style={{ flex: entry[part] }} /> : null)}</div>
          <b>{entry.total}</b></li>)}</ul> : <p className="act-sub">No Features with a Target date in these months.</p>}
        <ul className="ovw-legend"><li><i className="ovw-s-completed" />Completed</li><li><i className="ovw-s-atRisk" />Open, date ahead</li><li><i className="ovw-s-overdue" />Overdue</li></ul>
      </section>
    </div>
  </Page>
}
