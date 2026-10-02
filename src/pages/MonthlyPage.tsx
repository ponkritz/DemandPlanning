import { useMemo } from 'react'
import { Heading, Panel, Pill } from '../components/ui'
import { classifyDemand, effectiveActualsOpen, effectivePlanningOpen, findBaseline, isVarianceFlagged, variancePercent } from '../rules'
import type { PageProps } from './types'

export function MonthlyPage({ store, month }: PageProps) {
  const period = store.state.periods.find((item) => item.month === month)
  const planningOpen = period ? effectivePlanningOpen(period) : true
  const actualsOpen = period ? effectiveActualsOpen(period) : true
  const rows = useMemo(() => store.state.activities.filter((activity) => activity.startDate.slice(0, 7) <= month && activity.endDate.slice(0, 7) >= month).map((activity) => ({ activity, effort: store.state.efforts.find((item) => item.activityId === activity.id && item.month === month) })), [month, store.state.activities, store.state.efforts])

  function setHours(activityId: string, field: 'plannedHours' | 'actualHours', value: string) {
    if ((field === 'plannedHours' && !planningOpen) || (field === 'actualHours' && !actualsOpen)) return
    const parsed = value === '' ? null : Math.max(0, Number(value))
    const now = new Date().toISOString()
    store.update((draft) => {
      let effort = draft.efforts.find((item) => item.activityId === activityId && item.month === month)
      if (!effort) {
        const activity = draft.activities.find((item) => item.id === activityId)!
        const baseline = findBaseline(activity, month, draft.baselines)
        effort = { id: crypto.randomUUID(), activityId, month, classification: period ? classifyDemand(activity.createdAt, period) : 'Planned', plannedHours: null, actualHours: null, baselineHours: baseline?.hours ?? null, notes: '', learnings: '', struggles: '', updatedAt: now, updatedBy: 'u-owner' }
        draft.efforts.push(effort)
      }
      effort[field] = parsed
      effort.updatedAt = now
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: now, actor: 'u-owner', action: 'Update', entity: 'MonthlyEffort', entityId: effort.id, detail: `${field} updated for ${month}` })
      return draft
    })
  }

  function setText(activityId: string, field: 'notes' | 'learnings' | 'struggles', value: string) {
    if (!actualsOpen) return
    store.update((draft) => {
      const effort = draft.efforts.find((item) => item.activityId === activityId && item.month === month)
      if (effort) effort[field] = value
      return draft
    })
  }

  return <section className="content"><Heading eyebrow="MONTHLY WORKBENCH" title="Plan and actual effort" detail="One place for monthly planning, actuals, learnings and struggles." />
    <div className="lock-guidance"><Pill tone={planningOpen ? 'open' : 'locked'}>Planning {planningOpen ? 'editable' : 'frozen'}</Pill><span>{planningOpen ? 'Planned hours can be changed.' : 'New work is automatically treated as ad-hoc for this month.'}</span><Pill tone={actualsOpen ? 'open' : 'locked'}>Actuals {actualsOpen ? 'editable' : 'frozen'}</Pill></div>
    <Panel className="table-panel effort-table"><table><thead><tr><th>Activity</th><th>Classification</th><th>Baseline</th><th>Plan</th><th>Actual</th><th>Variance</th><th>Notes / PI review</th></tr></thead><tbody>{rows.map(({ activity, effort }) => { const variance = effort ? variancePercent(effort) : null; return <tr key={activity.id}><td><strong>{activity.name}</strong><small>{activity.type} · {activity.status}</small></td><td><Pill tone={effort?.classification === 'Ad-hoc' ? 'warning' : 'info'}>{effort?.classification ?? (period ? classifyDemand(activity.createdAt, period) : 'Planned')}</Pill></td><td>{effort?.baselineHours ?? findBaseline(activity, month, store.state.baselines)?.hours ?? '—'}h</td><td><input aria-label={`Planned hours for ${activity.name}`} type="number" min="0" disabled={!planningOpen} value={effort?.plannedHours ?? ''} onChange={(event) => setHours(activity.id, 'plannedHours', event.target.value)} /></td><td><input aria-label={`Actual hours for ${activity.name}`} type="number" min="0" disabled={!actualsOpen} value={effort?.actualHours ?? ''} onChange={(event) => setHours(activity.id, 'actualHours', event.target.value)} /></td><td><Pill tone={effort && isVarianceFlagged(effort) ? 'warning' : 'neutral'}>{variance == null ? '—' : `${variance > 0 ? '+' : ''}${Math.round(variance)}%`}</Pill></td><td><input placeholder="Progress notes" disabled={!actualsOpen || !effort} value={effort?.notes ?? ''} onChange={(event) => setText(activity.id, 'notes', event.target.value)} /><div className="inline-fields"><input placeholder="Learning" disabled={!actualsOpen || !effort} value={effort?.learnings ?? ''} onChange={(event) => setText(activity.id, 'learnings', event.target.value)} /><input placeholder="Struggle" disabled={!actualsOpen || !effort} value={effort?.struggles ?? ''} onChange={(event) => setText(activity.id, 'struggles', event.target.value)} /></div></td></tr> })}</tbody></table></Panel>
  </section>
}
