import type { Page } from '../App'
import { Panel, Pill } from '../components/ui'
import { capacityUtilization, isVarianceFlagged, variancePercent } from '../rules'
import type { PageProps } from './types'

export function DashboardPage({ store, month, navigate }: PageProps & { navigate: (page: Page) => void }) {
  const efforts = store.state.efforts.filter((item) => item.month === month)
  const planned = efforts.reduce((sum, item) => sum + (item.plannedHours ?? 0), 0)
  const actual = efforts.reduce((sum, item) => sum + (item.actualHours ?? 0), 0)
  const flags = efforts.filter(isVarianceFlagged)
  const adHoc = efforts.filter((item) => item.classification === 'Ad-hoc')
  const resourceLoads = store.state.people.filter((person) => person.role === 'Contributor').map((person) => {
    const activityIds = store.state.activities.filter((activity) => activity.resourceId === person.id).map((activity) => activity.id)
    const resourceActual = efforts.filter((effort) => activityIds.includes(effort.activityId)).reduce((sum, effort) => sum + (effort.actualHours ?? 0), 0)
    return { ...person, actual: resourceActual, utilization: capacityUtilization(resourceActual, 160) }
  })

  return <section className="content">
    <div className="notice"><strong>MVP development adapter:</strong> All records shown here are synthetic and stored locally. No Philips production data is included.</div>
    <div className="metric-grid">
      <article><span>Planned hours</span><strong>{planned}</strong><small>Frozen monthly plan</small></article>
      <article><span>Actual hours</span><strong>{actual}</strong><small>{planned ? Math.round((actual / planned) * 100) : 0}% of plan used</small></article>
      <article><span>Variance</span><strong className={actual > planned ? 'negative' : 'positive'}>{actual - planned > 0 ? '+' : ''}{actual - planned}h</strong><small>Actual minus planned</small></article>
      <article><span>Ad-hoc demand</span><strong>{adHoc.length}</strong><small>{adHoc.reduce((sum, item) => sum + (item.actualHours ?? 0), 0)} actual hours</small></article>
    </div>
    <div className="dashboard-grid">
      <Panel className="chart-panel"><div className="panel-heading"><div><p className="eyebrow">TREND</p><h2>Plan vs actual</h2></div><button className="ghost">Last 6 months⌄</button></div><div className="bars" aria-label="Monthly effort trend">{[['May',64,58],['Jun',72,76],['Jul',68,62],['Aug',82,88],['Sep',91,86],['Oct',planned,actual]].map(([label,plan,used]) => <div className="bar-group" key={label}><div className="bar-values"><i style={{ height: `${Number(plan) * .9}px` }} /><b style={{ height: `${Number(used) * .9}px` }} /></div><span>{label}</span></div>)}</div><div className="legend"><span><i className="planned-dot" /> Planned</span><span><i className="actual-dot" /> Actual</span></div></Panel>
      <Panel><div className="panel-heading"><div><p className="eyebrow">ATTENTION</p><h2>Signals</h2></div><Pill tone={flags.length ? 'warning' : 'open'}>{flags.length} flags</Pill></div>{flags.length ? flags.map((effort) => { const activity = store.state.activities.find((item) => item.id === effort.activityId); const variance = variancePercent(effort); return <div className="signal" key={effort.id}><span className="signal-icon warning">!</span><div><strong>{activity?.name}</strong><p>{Math.abs(Math.round(variance ?? 0))}% {Number(variance) > 0 ? 'over' : 'under'} the comparison value.</p></div></div> }) : <div className="empty-state">No items exceed the 25% variance threshold.</div>}<button className="text-button" onClick={() => navigate('monthly')}>Review monthly effort →</button></Panel>
    </div>
    <div className="dashboard-grid">
      <Panel><div className="panel-heading"><div><p className="eyebrow">CAPACITY</p><h2>Resource utilization</h2></div></div>{resourceLoads.map((resource) => <div className="utilization-row" key={resource.id}><div><strong>{resource.name}</strong><small>{resource.actual} of 160 hours</small></div><div className="progress"><i style={{ width: `${Math.min(resource.utilization, 100)}%` }} /></div><Pill tone={resource.utilization > 100 ? 'danger' : resource.utilization > 85 ? 'warning' : 'open'}>{Math.round(resource.utilization)}%</Pill></div>)}</Panel>
      <Panel><div className="panel-heading"><div><p className="eyebrow">MILESTONES</p><h2>Release closure</h2></div></div>{store.state.releases.slice(0,4).map((release) => <div className="release-row" key={release.id}><div><strong>{release.releaseName}</strong><p>{release.milestone} · {release.releaseType}</p></div><Pill tone={release.actualClosure && release.actualClosure > release.plannedClosure ? 'warning' : 'open'}>{release.actualClosure ? (release.actualClosure > release.plannedClosure ? 'Late' : 'Closed') : 'Open'}</Pill></div>)}</Panel>
    </div>
  </section>
}
