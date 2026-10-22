import { EmptyState, Info, Metric, Metrics, Panel, Pill, TablePanel, type Tone } from './ui'
import { DonutChart, EpicBulletChart } from './WorkloadCharts'
import { epicColors } from '../chartUtils'
import { absenceKinds, capacityModel, monthlyHours, type CapacitySettings, type LoadStatus } from '../capacity'
import { formatHours, formatPercent, monthName } from '../format'
import type { AzureWorkItem } from '../domain'
import type { Page as PageId } from '../pages/registry'

// Overview "This month", for any month: Overview shows the selected month, Pulse Check → Last month the one before it.
const statusTone: Record<LoadStatus, Tone> = { 'Overloaded': 'danger', 'Balanced': 'open', 'Has capacity': 'info', 'No bookings': 'neutral' }
const maxMatrixStreams = 8
export type CapacityModel = ReturnType<typeof capacityModel>

export function CapacityMetrics({ model, settings, label }: { model: CapacityModel; settings: CapacitySettings; label: string }) {
  return <>
  <Metrics>
    <Metric label={label} value={formatPercent(model.totals.utilization)} hint={`${formatHours(model.totals.work)}h booked of ${formatHours(model.totals.available)}h available`} tone={model.totals.utilization != null && model.totals.utilization >= settings.overloadedAt ? 'negative' : undefined} />
    <Metric label="Overloaded" value={model.counts.overloaded} hint={`≥ ${settings.overloadedAt}% of available hours`} tone={model.counts.overloaded ? 'negative' : undefined} />
    <Metric label="Has capacity" value={model.counts.hasCapacity} hint={`< ${settings.availableBelow}% of available hours`} tone={model.counts.hasCapacity ? 'positive' : undefined} />
    <Metric label="Absence" value={formatHours(model.totals.absence)} hint={absenceKinds.filter((kind) => model.totals.absenceByKind[kind]).map((kind) => `${kind} ${formatHours(model.totals.absenceByKind[kind])}h`).join(' · ') || `Under Epic #${settings.absenceEpicId}`} />
  </Metrics>
  </>
}

// utilizationOnly: just Who has capacity and how utilization is calculated (Pulse Check → Last month).
export function MonthSections({ items, month, settings, navigate, utilizationOnly = false }: { items: AzureWorkItem[]; month: string; settings: CapacitySettings; navigate: (page: PageId) => void; utilizationOnly?: boolean }) {
  const model = capacityModel(items, month, settings)
  const profileLine = (name: string) => [settings.profiles?.[name]?.role, settings.profiles?.[name]?.region].filter(Boolean).join(' · ')
  const fundedOver = Math.max(0, model.totals.work + model.totals.absence - model.totals.funded)
  const matrixMax = Math.max(1, ...model.people.flatMap((person) => person.streams.map((stream) => stream.work)))
  // Epic colours come from a fixed 12-month window, as on Overview, so an Epic keeps its colour.
  const colors = epicColors(monthlyHours(items, month, 12, settings))
  const matrixStreams = model.streams.slice(0, maxMatrixStreams)
  const otherStreams = model.streams.slice(maxMatrixStreams)
  const personOther = (streams: CapacityModel['people'][number]['streams']) => streams.filter((stream) => otherStreams.some((other) => other.key === stream.key)).reduce((sum, stream) => sum + stream.work, 0)
  return <>
  <div className="overview-stack">
    <TablePanel title="Who has capacity" info={`${monthName(month)} · ${model.workingDays} working days × ${settings.hoursPerDay}h = ${formatHours(model.fundedPerPerson)}h funded per person, less absence.`} count={`${model.people.length} people`} empty={model.people.length ? undefined : 'No Time Writing Tasks for this month.'}>
      <table><thead><tr><th>Person</th><th>Status</th><th>Available</th><th>Planned</th><th>Booked</th><th>Utilization</th><th>Main stream</th></tr></thead><tbody>{model.people.map((person) => <tr key={person.name}><td><strong>{person.name}</strong>{profileLine(person.name) && <small>{profileLine(person.name)}</small>}{person.absence > 0 && <small>{formatHours(person.absence)}h absence</small>}</td><td><Pill tone={statusTone[person.status]}>{person.status}</Pill></td><td>{formatHours(person.available)}</td><td>{formatHours(person.planned)}</td><td>{formatHours(person.work)}</td><td><div className="load"><div className="progress"><i className={person.status === 'Overloaded' ? 'over' : ''} style={{ width: `${Math.min(100, person.utilization ?? 0)}%` }} /></div><span>{formatPercent(person.utilization)}</span></div></td><td>{person.streams[0]?.title ?? '—'}{person.streams.length > 1 && <small>+{person.streams.length - 1} more</small>}</td></tr>)}</tbody></table>
    </TablePanel>
    {!utilizationOnly && <>
    <TablePanel title="Streams of work" info="Epics with booked hours this month. Absence is excluded." count={`${model.streams.length} streams`} empty={model.streams.length ? undefined : 'No booked hours this month.'}>
      <table><thead><tr><th>Stream (Epic)</th><th>Booked</th><th>Share</th><th>Planned</th><th>People</th></tr></thead><tbody>{model.streams.map((stream) => <tr key={stream.key}><td>{stream.epic ? <a href={stream.epic.url} target="_blank" rel="noreferrer">#{stream.epic.id} {stream.title}</a> : stream.title}<small>{stream.features} feature{stream.features === 1 ? '' : 's'}</small></td><td>{formatHours(stream.work)}</td><td><div className="load"><div className="progress"><i style={{ width: `${stream.share ?? 0}%` }} /></div><span>{formatPercent(stream.share, 0)}</span></div></td><td>{formatHours(stream.planned)}</td><td>{stream.people}</td></tr>)}</tbody></table>
    </TablePanel>
    </>}
  </div>
  {!utilizationOnly && <>
  <Panel className="viz-panel" title={`Hours by Epic · ${monthName(month)}`} info="Bar = booked hours, tick = planned hours; share of the month's booked hours on the right. Absence is excluded.">
        {model.streams.length ? <EpicBulletChart streams={model.streams} colors={colors} /> : <EmptyState title="No booked hours this month." />}
  </Panel>
  <div className="dashboard-grid viz-grid-2">
    <Panel className="viz-panel" title={`Funded hours · ${monthName(month)}`} info={fundedOver > 0 ? `Booked plus absence exceeds funded hours by ${formatHours(fundedOver)}h, so the ring shows booked and absence only.` : 'Where the team’s funded hours went: booked work, absence and unbooked capacity.'}>
      {model.totals.funded > 0 ? <DonutChart label="Funded hours" centerValue={`${formatHours(model.totals.funded)}h`} centerLabel="funded" segments={[{ key: 'booked', label: 'Booked work', value: model.totals.work, color: 'var(--viz-series-1)' }, { key: 'absence', label: 'Absence', value: model.totals.absence, color: 'var(--viz-series-4)' }, { key: 'unbooked', label: 'Unbooked capacity', value: Math.max(0, model.totals.funded - model.totals.work - model.totals.absence), color: 'var(--viz-other)' }]} /> : <EmptyState title="No funded hours this month." />}
    </Panel>
    <Panel className="viz-panel" title={`Absence · ${monthName(month)}`} info={`Completed Work under Epic #${settings.absenceEpicId}; regional holidays apply to everyone mapped to that region`}>
      {model.totals.absence > 0 ? <DonutChart label="Absence" centerValue={`${formatHours(model.totals.absence)}h`} centerLabel="absence" segments={absenceKinds.map((kind, index) => ({ key: kind, label: kind, value: model.totals.absenceByKind[kind], color: index < 4 ? `var(--viz-series-${index + 1})` : 'var(--viz-other)' }))} /> : <EmptyState title="No absence booked." detail="Hours under the absence Epic appear here split by PTO, Sick Leave, Unplanned Leave and regional public holidays." />}
      {model.people.filter((person) => person.absence > 0).length > 0 && <p className="muted">{model.people.filter((person) => person.absence > 0).map((person) => `${person.name} ${formatHours(person.absence)}h`).join(' · ')}</p>}
    </Panel>
  </div>
  <TablePanel className="matrix" title="Hours by person and stream" info={otherStreams.length ? `Top ${maxMatrixStreams} streams by hours; ${otherStreams.length} smaller stream(s) grouped under Other. Darker cells = more hours.` : 'Booked hours (Completed Work) per person and Epic; darker cells = more hours.'} empty={model.people.length && model.streams.length ? undefined : 'Nothing to break down yet.'}>
    {model.people.length > 0 && model.streams.length > 0 && <div className="azure-table"><table><thead><tr><th>Person</th>{matrixStreams.map((stream) => <th key={stream.key} title={stream.title}>{stream.title}</th>)}{otherStreams.length > 0 && <th>Other</th>}<th>Absence</th><th>Total</th></tr></thead><tbody>{model.people.map((person) => <tr key={person.name}><td><strong>{person.name}</strong></td>{matrixStreams.map((stream) => { const cell = person.streams.find((item) => item.key === stream.key); return <td key={stream.key} className={cell ? 'viz-shade' : 'muted'} style={cell ? { background: `color-mix(in srgb, var(--viz-diverge-lo) ${Math.round(cell.work / matrixMax * 40)}%, transparent)` } : undefined}>{cell ? formatHours(cell.work) : '·'}</td> })}{otherStreams.length > 0 && <td>{formatHours(personOther(person.streams)) || '·'}</td>}<td>{person.absence ? formatHours(person.absence) : '·'}</td><td><strong>{formatHours(person.work)}</strong></td></tr>)}<tr className="matrix-total"><td>Total</td>{matrixStreams.map((stream) => <td key={stream.key}>{formatHours(stream.work)}</td>)}{otherStreams.length > 0 && <td>{formatHours(otherStreams.reduce((sum, stream) => sum + stream.work, 0))}</td>}<td>{formatHours(model.totals.absence)}</td><td><strong>{formatHours(model.totals.work)}</strong></td></tr></tbody></table></div>}
  </TablePanel>
  </>}
  <div className="how-calculated"><Info label="How utilization is calculated">
    <p>Funded hours per person: {model.workingDays} working days × {settings.hoursPerDay}h = {formatHours(model.fundedPerPerson)}h.</p>
    <p>Available = funded − absence hours (Completed Work on Tasks under Epic #{settings.absenceEpicId}; PTO, Sick Leave and Unplanned Leave are read from the Feature and Task titles).</p>
    <p>Utilization = booked hours (Completed Work on all other {monthName(month)} Time Writing Tasks) ÷ available × 100. Overloaded at ≥ {settings.overloadedAt}%; has capacity below {settings.availableBelow}%.</p>
    <p className="muted">Tasks are matched to the month when their title starts or ends with the month and year (e.g. “{monthName(month)} | …” or “… | {monthName(month)}”, any delimiter). Thresholds and the absence Epic are set under Settings → Capacity and absence.</p>
    <div className="button-row"><button className="text-button" onClick={() => navigate('monthly')}>Open monthly detail →</button><button className="text-button" onClick={() => navigate('admin')}>Capacity settings →</button></div>
  </Info></div>
  </>
}
