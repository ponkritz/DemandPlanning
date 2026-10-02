import { useMemo, useState } from 'react'
import type { Activity, ActivityStatus, ActivityType, Complexity, ResourceBand } from '../domain'
import { Heading, Modal, Panel, Pill } from '../components/ui'
import type { PageProps } from './types'

export function ActivitiesPage({ store }: PageProps) {
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const filtered = useMemo(() => store.state.activities.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())), [search, store.state.activities])

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const activity: Activity = {
      id,
      name: String(values.get('name')).trim(),
      type: values.get('type') as ActivityType,
      processOwnerId: String(values.get('owner')),
      resourceId: String(values.get('resource')) || undefined,
      status: values.get('status') as ActivityStatus,
      startDate: String(values.get('startDate')),
      endDate: String(values.get('endDate')),
      band: values.get('band') as ResourceBand,
      complexity: values.get('complexity') as Complexity,
      featureCount: Number(values.get('featureCount') || 0),
      bugCount: Number(values.get('bugCount') || 0),
      source: 'Manual',
      createdAt: now,
      createdBy: 'u-owner',
    }
    if (!activity.name || activity.endDate < activity.startDate) return
    store.update((draft) => { draft.activities.push(activity); draft.audits.unshift({ id: crypto.randomUUID(), timestamp: now, actor: 'u-owner', action: 'Create', entity: 'Activity', entityId: id, detail: activity.name }); return draft })
    setShowForm(false)
  }

  return <section className="content"><Heading eyebrow="WORK REGISTER" title="Activities" detail="Create and track releases, projects, BAU, improvements and learning work." action={<button className="primary" onClick={() => setShowForm(true)}>＋ Add activity</button>} />
    <Panel className="table-panel"><div className="panel-heading"><input className="search" placeholder="Search activity name" value={search} onChange={(event) => setSearch(event.target.value)} /><span className="record-count">{filtered.length} activities</span></div><table><thead><tr><th>Activity</th><th>Owner / Resource</th><th>Dates</th><th>Band / Complexity</th><th>Source</th><th>Status</th></tr></thead><tbody>{filtered.map((activity) => { const owner = store.state.people.find((person) => person.id === activity.processOwnerId); const resource = store.state.people.find((person) => person.id === activity.resourceId); return <tr key={activity.id}><td><strong>{activity.name}</strong><small>{activity.type}</small></td><td>{owner?.name ?? 'Unassigned'}<small>{resource?.name ?? 'No QE assigned'}</small></td><td>{activity.startDate}<small>to {activity.endDate}</small></td><td>{activity.band}<small>{activity.complexity}</small></td><td>{activity.source}</td><td><Pill tone={activity.status === 'At Risk' ? 'warning' : activity.status === 'Completed' ? 'open' : 'neutral'}>{activity.status}</Pill></td></tr> })}</tbody></table></Panel>
    {showForm && <Modal title="Add activity" eyebrow="NEW DEMAND" onClose={() => setShowForm(false)}><form onSubmit={save}><label>Activity name<input name="name" required autoFocus /></label><div className="form-row"><label>Activity type<select name="type"><option>Release</option><option>Project</option><option>BAU</option><option>Improvement</option><option>Learning</option><option>Other</option></select></label><label>Status<select name="status"><option>Not Started</option><option>In Progress</option><option>On Track</option><option>At Risk</option><option>On Hold</option><option>Completed</option></select></label></div><div className="form-row"><label>Process Owner<select name="owner">{store.state.people.filter((person) => ['Owner','Admin','ProcessOwner'].includes(person.role)).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label>Assigned QE<select name="resource"><option value="">Unassigned</option>{store.state.people.filter((person) => person.role === 'Contributor').map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label></div><div className="form-row"><label>Start date<input name="startDate" type="date" required /></label><label>End date<input name="endDate" type="date" required /></label></div><div className="form-row"><label>Resource band<select name="band"><option>Junior</option><option>Senior</option><option>Not Applicable</option></select></label><label>Complexity<select name="complexity"><option>Low</option><option>Medium</option><option>High</option></select></label></div><div className="form-row"><label>Feature count<input name="featureCount" type="number" min="0" defaultValue="0" /></label><label>Bug count<input name="bugCount" type="number" min="0" defaultValue="0" /></label></div><div className="modal-actions"><button type="button" className="ghost" onClick={() => setShowForm(false)}>Cancel</button><button className="primary">Add activity</button></div></form></Modal>}
  </section>
}
