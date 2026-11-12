import { EmptyState, Info, Metric, Metrics, Panel, Pill, TablePanel, type Tone } from './ui'
import { DonutChart, EpicBulletChart } from './WorkloadCharts'
import { epicColors } from '../chartUtils'
import { absenceKinds, capacityModel, monthlyHours, type CapacitySettings, type LoadStatus } from '../capacity'
import { formatDateTime, formatHours, formatPercent, monthName } from '../format'
import type { AzureWorkItem } from '../domain'
import type { Page as PageId } from '../pages/registry'

// Overview "This month", for any month: Overview shows the selected month, Pulse Check → Last month the one before it.
const statusTone: Record<LoadStatus, Tone> = { 'Overloaded': 'danger', 'Balanced': 'open', 'Has capacity': 'info', 'No bookings': 'neutral' }
const maxMatrixStreams = 8
export type CapacityModel = ReturnType<typeof capacityModel>

// CAP-38 / CAP-39: one person per row — Contractual, Absence, Available (= contractual − absence), Work, Trainings,
// Other NPRA, Common activities, Planned, Utilized (= work + trainings + other NPRA + common activities), Utilization.
export function UtilizationTable({ people, profileLine = () => '' }: { people: CapacityModel['people']; profileLine?: (name: string) => string }) {
  return <table><thead><tr><th>Person</th><th>Status</th><th>Contractual hours</th><th>Absence hours</th><th>Available hours</th><th>Project work</th><th>Training</th><th>Other NPRA</th><th>Common activities</th><th>Total planned</th><th>Total actual</th><th>Actual utilization</th><th>Main stream</th></tr></thead><tbody>{people.map((person) => <tr key={person.name}><td><strong>{person.name}</strong>{profileLine(person.name) && <small>{profileLine(person.name)}</small>}{person.npraOver > 0 && <small className="negative">NPRA {formatHours(person.npraOver)}h over the {formatHours(person.npraAllowance)}h maximum</small>}</td><td><Pill tone={statusTone[person.status]}>{person.status}</Pill></td><td>{formatHours(person.funded)}</td><td>{formatHours(person.absence)}</td><td>{formatHours(person.available)}</td><td>{formatHours(person.work)}</td><td>{formatHours(person.training)}</td><td>{formatHours(person.npraOther)}</td><td>{formatHours(person.reservedActual)}</td><td>{formatHours(person.utilizedPlanned)}</td><td>{formatHours(person.utilized)}</td><td><div className="load"><div className="progress"><i className={person.status === 'Overloaded' ? 'over' : ''} style={{ width: `${Math.min(100, person.utilization ?? 0)}%` }} /></div><span>{formatPercent(person.utilization)}</span></div></td><td>{person.streams[0]?.title ?? '—'}{person.streams.length > 1 && <small>+{person.streams.length - 1} more</small>}</td></tr>)}</tbody></table>
}

export function CapacityMetrics({ model, settings, label }: { model: CapacityModel; settings: CapacitySettings; label: string }) {
  return <>
  <Metrics>
    <Metric label={label} value={formatPercent(model.totals.utilization)} hint={`${formatHours(model.totals.utilized)}h actual of ${formatHours(model.totals.available)}h available · ${model.locked ? `🔒 locked, ${model.locked.profileName}` : model.profile.name}`} tone={model.totals.utilization != null && model.totals.utilization >= settings.overloadedAt ? 'negative' : undefined} />
    <Metric label="Overloaded" value={model.counts.overloaded} hint={`≥ ${settings.overloadedAt}% of available hours`} tone={model.counts.overloaded ? 'negative' : undefined} />
    <Metric label="Has capacity" value={model.counts.hasCapacity} hint={`< ${settings.availableBelow}% of available hours`} tone={model.counts.hasCapacity ? 'positive' : undefined} />
    <Metric label="NPRA" value={formatHours(model.totals.npra)} hint={`Training ${formatHours(model.totals.training)}h · Other ${formatHours(model.totals.npraOther)}h · ` + (settings.npraHoursPerMonth > 0 ? `max ${formatHours(settings.npraHoursPerMonth)}h per person · ${model.counts.npraOver ? `${model.counts.npraOver} over it` : 'nobody over it'}` : 'no maximum set')} tone={model.counts.npraOver ? 'negative' : undefined} />
    <Metric label="Absence" value={formatHours(model.totals.absence)} hint={[...absenceKinds.filter((kind) => model.totals.absenceByKind[kind]).map((kind) => `${kind} ${formatHours(model.totals.absenceByKind[kind])}h`)].join(' · ') || `Under Epic #${settings.absenceEpicId}`} />
  </Metrics>
  </>
}

// utilizationOnly: just Who has capacity and how utilization is calculated (Pulse Check → Last month).
export function MonthSections({ items, month, settings, navigate, utilizationOnly = false }: { items: AzureWorkItem[]; month: string; settings: CapacitySettings; navigate: (page: PageId) => void; utilizationOnly?: boolean }) {
  const model = capacityModel(items, month, settings)
  const profileLine = (name: string) => [settings.profiles?.[name]?.role, settings.profiles?.[name]?.region].filter(Boolean).join(' · ')
  const fundedOver = Math.max(0, model.totals.utilized + model.totals.absence - model.totals.funded)
  const matrixMax = Math.max(1, ...model.people.flatMap((person) => person.streams.map((stream) => stream.work)))
  // Epic colours come from a fixed 12-month window, as on Overview, so an Epic keeps its colour.
  const colors = epicColors(monthlyHours(items, month, 12, settings))
  const matrixStreams = model.streams.slice(0, maxMatrixStreams)
  const otherStreams = model.streams.slice(maxMatrixStreams)
  const personOther = (streams: CapacityModel['people'][number]['streams']) => streams.filter((stream) => otherStreams.some((other) => other.key === stream.key)).reduce((sum, stream) => sum + stream.work, 0)
  return <>
  <div className="overview-stack">
    <p className="muted" role="note">{model.locked ? `🔒 Figures of ${monthName(month)} locked on ${formatDateTime(model.locked.lockedOn)} by ${model.locked.lockedBy}, profile ${model.locked.profileName}.` : `Calculation profile: ${model.profile.name}.`}</p>
    {(model.prorated.length > 0 || model.outsideEmployment.length > 0 || model.removed.length > 0 || model.notCounted.length > 0) && <p className="muted employment-note" role="note">
      {model.notCounted.length > 0 && <>Not counted for capacity (People & access → Capacity roles): {model.notCounted.map((person) => `${person.name} (${person.reason}${person.hours ? `, ${formatHours(person.hours)}h booked` : ''})`).join(' · ')}. </>}
      {model.removed.length > 0 && <>Removed in Settings → Resources, not counted: {model.removed.map((person) => `${person.name}${person.hours ? ` (${formatHours(person.hours)}h booked)` : ''}`).join(' · ')}. </>}
      {model.prorated.length > 0 && <>Part of the month only (Settings → Resources): {model.prorated.map((person) => `${person.name} ${person.days} of ${model.workingDays} days, ${formatHours(person.funded)}h funded`).join(' · ')}. </>}
      {model.outsideEmployment.length > 0 && <>Not employed in {monthName(month)}, so not counted: {model.outsideEmployment.map((person) => `${person.name}${person.leftOn ? ` (left ${person.leftOn})` : person.joinedOn ? ` (joins ${person.joinedOn})` : ''}${person.hours ? ` — ${formatHours(person.hours)}h booked on ${person.tasks} Task${person.tasks === 1 ? '' : 's'}, check them` : ''}`).join(' · ')}.</>}
    </p>}
    <TablePanel title="Who has capacity" info={`${model.profile.formula} ${model.workingDays} working days in ${monthName(month)}: ${formatHours(model.fundedPerPerson)}h for a full month. Available = the capacity of the profile.`} count={`${model.people.length} people`} empty={model.people.length ? undefined : 'No Time Writing Tasks for this month.'}>
      <UtilizationTable people={model.people} profileLine={profileLine} />
    </TablePanel>
    <TablePanel title={`NPRA · ${monthName(month)}`} info={`Non-project related activities — internal meetings (stand-up, special projects, town hall) and trainings (white belt, AI, Cornerstone) — are Tasks (or Stories / Features) tagged “NPRA”. Trainings (tagged Training, or training under the absence Epic) and Other NPRA are shown apart; both count as utilized hours, nothing is deducted. ${settings.npraHoursPerMonth > 0 ? `The maximum is ${formatHours(settings.npraHoursPerMonth)}h per person per month; hours over it are flagged.` : 'No maximum is set; the hours are tracked only.'} Unplanned sick leave is not NPRA: book it under the absence Epic by the end of the month at the latest — it is absence, deducted from the contractual hours.`} count={`${formatHours(model.totals.npra)}h booked`} empty={model.people.some((person) => person.npra > 0 || person.npraPlanned > 0) ? undefined : 'No NPRA hours booked this month. Tag the Tasks (or their Story / Feature) with “NPRA”.'}>
      <table><thead><tr><th>Person</th><th>Total actual</th><th>Training</th><th>Other NPRA</th><th>Total planned</th><th>Maximum</th><th>Left</th><th>Status</th></tr></thead><tbody>{model.people.filter((person) => person.npra > 0 || person.npraPlanned > 0).sort((a, b) => b.npra - a.npra || a.name.localeCompare(b.name)).map((person) => <tr key={person.name}><td><strong>{person.name}</strong><small>{person.npraTasks} task{person.npraTasks === 1 ? '' : 's'}</small></td><td>{formatHours(person.npra)}</td><td>{formatHours(person.training)}</td><td>{formatHours(person.npraOther)}</td><td>{formatHours(person.npraPlanned)}</td><td>{person.npraAllowance > 0 ? formatHours(person.npraAllowance) : '—'}</td><td>{person.npraAllowance > 0 ? formatHours(Math.max(0, person.npraAllowance - person.npra)) : '—'}</td><td>{person.npraOver > 0 ? <Pill tone="danger">{formatHours(person.npraOver)}h over the maximum</Pill> : person.npraAllowance > 0 ? <Pill tone="open">Within {formatHours(person.npraAllowance)}h</Pill> : <Pill tone="neutral">Tracked</Pill>}</td></tr>)}</tbody></table>
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
    <Panel className="viz-panel" title={`Funded hours · ${monthName(month)}`} info={fundedOver > 0 ? `Utilized plus absence exceeds contractual hours by ${formatHours(fundedOver)}h.` : 'Where the team’s contractual hours went: work, trainings, other NPRA, common activities, absence and unbooked capacity.'}>
      {model.totals.funded > 0 ? <DonutChart label="Funded hours" centerValue={`${formatHours(model.totals.funded)}h`} centerLabel="funded" segments={[{ key: 'booked', label: 'Project work', value: model.totals.work, color: 'var(--viz-series-1)' }, { key: 'absence', label: 'Absence', value: model.totals.absence, color: 'var(--viz-series-4)' }, ...(model.totals.training > 0 ? [{ key: 'training', label: 'Training', value: model.totals.training, color: 'var(--viz-series-2)' }] : []), ...(model.totals.npraOther > 0 ? [{ key: 'npra', label: 'Other NPRA', value: model.totals.npraOther, color: 'var(--viz-series-5)' }] : []), ...(model.totals.reservedActual > 0 ? [{ key: 'reserved', label: 'Common activities', value: model.totals.reservedActual, color: 'var(--viz-series-3)' }] : []), { key: 'unbooked', label: 'Unbooked capacity', value: Math.max(0, model.totals.funded - model.totals.utilized - model.totals.absence), color: 'var(--viz-other)' }]} /> : <EmptyState title="No funded hours this month." />}
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
    <p>Contractual hours per person: {model.workingDays} working days × {settings.hoursPerDay}h working hours per day = {formatHours(model.fundedPerPerson)}h.</p>
    <p>{model.profile.formula}</p>
    {model.locked && <p>The figures of {monthName(month)} are locked: they stay as they were on {formatDateTime(model.locked.lockedOn)} whatever changes later (Team overview → Utilization).</p>}
    <p>Status: overloaded at ≥ {settings.overloadedAt}%; has capacity below {settings.availableBelow}%.</p>
    <p className="muted">Tasks are matched to the month when their title starts or ends with the month and year (e.g. “{monthName(month)} | …” or “… | {monthName(month)}”, any delimiter). Thresholds and the absence Epic are set under Settings → Capacity and absence.</p>
    <div className="button-row"><button className="text-button" onClick={() => navigate('activities')}>Open My Activities →</button><button className="text-button" onClick={() => navigate('admin')}>Capacity settings →</button></div>
  </Info></div>
  </>
}
