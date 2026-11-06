import { useMemo, useState } from 'react'
import { capacityContext } from '../capacity'
import { allCva, capacityVsActual, type CvaFilter } from '../capacityActual'
import { EmptyState, Page } from '../components/ui'
import { formatHours, monthName, todayIso } from '../format'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { PageProps } from './types'

// Capacity vs Actual (CVA-01…CVA-06), under Testing: what the team had against what it booked. Read only.

const shortMonth = (month: string) => new Intl.DateTimeFormat('en', { month: 'short', year: '2-digit' }).format(new Date(`${month}-01T00:00:00`))
const change = (now: number | null, before: number | null) => now == null || before == null ? null : Math.round((now - before) * 10) / 10

function Delta({ value, unit, goodWhenUp }: { value: number | null; unit: string; goodWhenUp?: boolean }) {
  if (value == null) return <small className="ovw-delta">no previous month</small>
  const good = value === 0 || goodWhenUp == null ? undefined : (value > 0) === goodWhenUp
  return <small className={`ovw-delta${good === undefined ? '' : good ? ' ovw-good' : ' ovw-bad'}`}><span aria-hidden="true">{value === 0 ? '■' : value > 0 ? '▲' : '▼'}</span> {value > 0 ? '+' : ''}{unit === 'h' ? formatHours(value) : value}{unit} <span>vs previous month</span></small>
}

export function CapacityActualPage({ azure, store, month }: { azure: AzureWorkspace; store: PageProps['store']; month: string }) {
  const [filter, setFilter] = useState<CvaFilter>(allCva)
  const [hover, setHover] = useState<number | null>(null)
  const settings = capacityContext(store.state)
  const model = useMemo(() => capacityVsActual({ items: azure.items, month, today: todayIso(), settings }, filter), [azure.items, month, settings, filter])
  if (!azure.items.length) return <Page><EmptyState title="No work items yet" detail="Fetch the Time Writing data from Azure DevOps (Settings → Azure DevOps), or load the synthetic sample, to compare capacity with actual hours." /></Page>
  const set = (key: keyof CvaFilter) => (value: string) => setFilter((current) => ({ ...current, [key]: value }))
  const { tiles, trend } = model
  const usedNow = tiles.used.now

  // Chart: actual hours (bars) against capacity (line), one hours axis.
  const top = Math.max(1, ...trend.flatMap((entry) => [entry.capacity, entry.actual]))
  const width = 1100, height = 240, left = 48, bottom = 24, plotW = width - left - 8, plotH = height - bottom - 10
  const step = plotW / trend.length, bar = Math.min(26, step / 2.2)
  const y = (value: number) => 10 + plotH - (value / top) * plotH
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((share) => Math.round(top * share))
  const line = trend.map((entry, index) => `${index ? 'L' : 'M'}${left + step * index + step / 2},${y(entry.capacity)}`).join(' ')
  const streamTop = Math.max(1, ...model.streams.map((entry) => entry.actual))

  return <Page className="overview-page">
    <header className="act-header"><div><h2>Capacity vs actual</h2><p>What the team had — capacity after leave and holidays — against the hours it booked in {monthName(month)}.</p></div></header>
    <div className="ovw-filters" role="group" aria-label="Filters">
      <label>Region<select value={filter.region} onChange={(event) => set('region')(event.target.value)}><option value="">All regions</option>{model.options.regions.map((region) => <option key={region}>{region}</option>)}</select></label>
      <label>Epic<select value={filter.epic} onChange={(event) => set('epic')(event.target.value)}><option value="">All Epics</option>{model.options.epics.map((epic) => <option key={epic.key} value={epic.key}>#{epic.id} {epic.title}</option>)}</select></label>
      <label>Owner<select value={filter.owner} onChange={(event) => set('owner')(event.target.value)}><option value="">All people</option>{model.options.owners.map((owner) => <option key={owner}>{owner}</option>)}</select></label>
      {(filter.region || filter.epic || filter.owner) && <button type="button" className="act-link" onClick={() => setFilter(allCva)}>Clear filters</button>}
    </div>

    <section className="ovw-tiles" aria-label="Headline figures">
      <article className="act-card ovw-tile"><span>Capacity</span><strong>{formatHours(tiles.capacity.now)}h</strong><small>after leave and holidays</small><Delta value={change(tiles.capacity.now, tiles.capacity.before)} unit="h" /></article>
      <article className="act-card ovw-tile"><span>Actual</span><strong>{formatHours(tiles.actual.now)}h</strong><small>Completed Work booked{filter.epic ? ' on this Epic' : ''}</small><Delta value={change(tiles.actual.now, tiles.actual.before)} unit="h" /></article>
      <article className={`act-card ovw-tile${usedNow != null && usedNow > settings.overloadedAt ? ' ovw-alert' : ''}`}><span>Actual utilization</span><strong>{usedNow == null ? '—' : `${Math.round(usedNow)}%`}</strong><small>actual ÷ capacity · {model.bands.over} over, {model.bands.onTrack} on track, {model.bands.under} under</small><Delta value={change(usedNow, tiles.used.before)} unit="pp" /></article>
      <article className={`act-card ovw-tile${tiles.headroom.now < 0 ? ' ovw-alert' : ''}`}><span>{tiles.headroom.now < 0 ? 'Over capacity' : 'Headroom'}</span><strong>{formatHours(Math.abs(tiles.headroom.now))}h</strong><small>{tiles.headroom.now < 0 ? 'booked beyond capacity' : 'capacity not booked'}</small><Delta value={tiles.headroom.before == null ? null : change(Math.abs(tiles.headroom.now), (tiles.headroom.now < 0 ? -1 : 1) * tiles.headroom.before)} unit="h" /></article>
    </section>

    <section className="act-card ovw-trend" aria-labelledby="cva-trend">
      <div className="ovw-head"><h3 id="cva-trend">Capacity vs actual · last 12 months</h3>
        <ul className="ovw-legend"><li><i className="ovw-k-actual" />Actual</li><li><i className="ovw-k-cap" />Capacity</li></ul></div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Actual hours against capacity per month" className="ovw-chart" onMouseLeave={() => setHover(null)}>
        {ticks.map((tick) => <g key={tick}><line x1={left} x2={width - 8} y1={y(tick)} y2={y(tick)} className="ovw-grid" /><text x={left - 6} y={y(tick) + 4} textAnchor="end" className="ovw-axis">{formatHours(tick)}</text></g>)}
        {trend.map((entry, index) => { const x = left + step * index + step / 2; return <g key={entry.month} onMouseEnter={() => setHover(index)}>
          <rect x={x - step / 2} y={10} width={step} height={plotH} fill="transparent" />
          <rect x={x - bar / 2} y={y(entry.actual)} width={bar} height={Math.max(0, 10 + plotH - y(entry.actual))} rx={3} className={entry.capacity > 0 && entry.actual > entry.capacity ? 'cva-over' : 'ovw-actual'} />
          <text x={x} y={height - 6} textAnchor="middle" className="ovw-axis">{shortMonth(entry.month)}</text></g> })}
        <path d={line} className="ovw-cap" />
        {trend.map((entry, index) => <circle key={entry.month} cx={left + step * index + step / 2} cy={y(entry.capacity)} r={4} className="ovw-cap-dot" />)}
      </svg>
      {hover != null && <p className="ovw-tip" role="status"><strong>{monthName(trend[hover].month)}</strong> · Capacity {formatHours(trend[hover].capacity)}h · Actual {formatHours(trend[hover].actual)}h{trend[hover].used != null ? ` · ${Math.round(trend[hover].used!)}% used` : ''}</p>}
      <p className="act-sub">Bars over the capacity line are drawn in red.</p>
      <details className="ovw-table"><summary>Show as a table</summary><table><thead><tr><th>Month</th><th>Capacity (h)</th><th>Actual (h)</th><th>Used</th></tr></thead><tbody>{trend.map((entry) => <tr key={entry.month}><td>{monthName(entry.month)}</td><td>{formatHours(entry.capacity)}</td><td>{formatHours(entry.actual)}</td><td>{entry.used == null ? '—' : `${Math.round(entry.used)}%`}</td></tr>)}</tbody></table></details>
    </section>

    <div className="ovw-bottom">
      <section className="act-card" aria-labelledby="cva-people">
        <h3 id="cva-people">By person · {monthName(month)}</h3>
        <p className="act-sub">Over above {settings.overloadedAt}%, under below {settings.availableBelow}% (Settings → Capacity & periods).</p>
        {model.people.length ? <div className="ovw-scroll"><table className="ovw-queue"><thead><tr><th>Person</th><th>Capacity</th><th>Actual</th><th>Planned</th><th>Used</th><th>Status</th></tr></thead><tbody>
          {model.people.map((row) => <tr key={row.person}><td>{row.person}{row.region || row.role ? <small>{[row.region, row.role].filter(Boolean).join(' · ')}</small> : null}</td><td>{formatHours(row.capacity)}h</td><td>{formatHours(row.actual)}h</td><td>{formatHours(row.plan)}h</td>
            <td><div className="cva-meter" aria-hidden="true"><i className={`cva-${row.band === 'Over' ? 'over' : row.band === 'Under' ? 'under' : 'ok'}`} style={{ width: `${Math.min(100, row.used ?? 0)}%` }} /></div>{row.used == null ? '—' : `${Math.round(row.used)}%`}</td>
            <td><span className={`ovw-issue cva-band-${row.band.replace(/\s/g, '').toLowerCase()}`}>{row.band}</span></td></tr>)}
        </tbody></table></div> : <p className="act-sub">No one has capacity or hours for these filters.</p>}
      </section>
      <section className="act-card" aria-labelledby="cva-streams">
        <h3 id="cva-streams">Where the hours went · by Epic</h3>
        <p className="act-sub">Actual hours booked in {monthName(month)}.</p>
        {model.streams.length ? <ul className="ovw-health cva-epics">{model.streams.slice(0, 10).map((entry) => <li key={entry.title}><span title={entry.title}>{entry.title}</span><div className="ovw-stack" aria-hidden="true"><i className="ovw-s-completed cva-stream" style={{ flex: `0 0 ${entry.actual / streamTop * 100}%` }} /></div><b>{formatHours(entry.actual)}h</b></li>)}</ul> : <p className="act-sub">No hours booked yet.</p>}
      </section>
    </div>
  </Page>
}
