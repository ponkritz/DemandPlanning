import { useState } from 'react'
import type { MasterValue, UserRole } from '../domain'
import type { SharePointConfig } from '../sharepoint'
import { Heading, Panel, Pill } from '../components/ui'
import type { PageProps } from './types'

const roles: UserRole[] = ['Owner', 'Admin', 'ProcessOwner', 'Contributor', 'Viewer']

export function AdminPage({ store, month }: PageProps) {
  const [reason, setReason] = useState('Approved operational extension')
  const [resourceMessage, setResourceMessage] = useState('')
  const [sharePointConfig, setSharePointConfig] = useState<SharePointConfig>(() => store.getSavedSharePointConfig())
  const period = store.state.periods.find((item) => item.month === month)

  function toggle(kind: 'planning' | 'actuals') {
    const now = new Date().toISOString()
    store.update((draft) => {
      let current = draft.periods.find((item) => item.month === month)
      if (!current) {
        current = { month, planningDeadline: `${month}-01T00:00:00.000Z`, actualsDeadline: `${month}-28T23:59:59.000Z`, planningLocked: false, actualsLocked: false, updatedAt: now, updatedBy: 'u-owner' }
        draft.periods.push(current)
      }
      if (kind === 'planning') current.planningLocked = !current.planningLocked
      else current.actualsLocked = !current.actualsLocked
      current.extensionReason = reason; current.updatedAt = now
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: now, actor: 'u-owner', action: kind === 'planning' ? (current.planningLocked ? 'Lock planning' : 'Unlock planning') : (current.actualsLocked ? 'Lock actuals' : 'Unlock actuals'), entity: 'PeriodControl', entityId: month, detail: reason })
      return draft
    })
  }

  function extend(kind: 'planning' | 'actuals', date: string) {
    if (!date) return
    store.update((draft) => {
      const current = draft.periods.find((item) => item.month === month)
      if (current) {
        if (kind === 'planning') current.planningExtendedUntil = `${date}T23:59:59`
        else current.actualsExtendedUntil = `${date}T23:59:59`
        current.extensionReason = reason
      }
      return draft
    })
  }

  function setRole(id: string, role: UserRole) {
    store.update((draft) => { const person = draft.people.find((item) => item.id === id); if (person) person.role = role; return draft })
  }

  function addResource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const name = String(data.get('name') ?? '').trim()
    const email = String(data.get('email') ?? '').trim().toLowerCase()
    const role = data.get('role') as UserRole
    if (!name || !email) return
    if (store.state.people.some((person) => person.email.toLowerCase() === email)) { setResourceMessage('A resource with this email already exists.'); return }
    const now = new Date().toISOString()
    store.update((draft) => {
      const id = crypto.randomUUID()
      draft.people.push({ id, name, email, role, active: true })
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: now, actor: 'u-owner', action: 'Create', entity: 'Resource', entityId: id, detail: `${name} added as ${role}` })
      return draft
    })
    form.reset(); setResourceMessage(`${name} is now available for assignment.`)
  }

  function addMaster(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form)
    store.update((draft) => { draft.masters.push({ id: crypto.randomUUID(), type: data.get('type') as MasterValue['type'], value: String(data.get('value')), sortOrder: draft.masters.length + 1, active: true }); return draft })
    form.reset()
  }

  async function connectSharePoint(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try { await store.connectSharePoint(sharePointConfig) } catch { /* Connection state displays the actionable error. */ }
  }

  return <section className="content">
    <Heading eyebrow="GOVERNANCE" title="Administration" detail="Owners and process owners manage periods, roles, masters and audit evidence." />
    <Panel className="connection-panel"><div className="panel-heading"><div><p className="eyebrow">CENTRAL DATA</p><h2>SharePoint connection</h2><p className="muted">Uses Microsoft sign-in and stores one versioned JSON data file in the I&amp;D Quality document library. No client secret is stored in the browser.</p></div><Pill tone={store.connection.mode === 'sharepoint' ? 'open' : store.connection.status === 'error' || store.connection.status === 'conflict' ? 'danger' : 'neutral'}>{store.connection.status}</Pill></div>
      <form className="connection-form" onSubmit={connectSharePoint}><label>Tenant ID (optional)<input value={sharePointConfig.tenantId} onChange={(event) => setSharePointConfig({ ...sharePointConfig, tenantId: event.target.value })} placeholder="Auto-detect from work sign-in" /></label><label>Application (client) ID<input required value={sharePointConfig.clientId} onChange={(event) => setSharePointConfig({ ...sharePointConfig, clientId: event.target.value })} placeholder="Registered SPA client ID" /></label><label>SharePoint host<input required value={sharePointConfig.hostname} onChange={(event) => setSharePointConfig({ ...sharePointConfig, hostname: event.target.value })} /></label><label>Site path<input required value={sharePointConfig.sitePath} onChange={(event) => setSharePointConfig({ ...sharePointConfig, sitePath: event.target.value })} /></label><label className="wide-field">Central data file<input required value={sharePointConfig.stateFilePath} onChange={(event) => setSharePointConfig({ ...sharePointConfig, stateFilePath: event.target.value })} /></label><div className="connection-actions"><button className="primary" disabled={store.connection.status === 'connecting'}>{store.connection.status === 'connecting' ? 'Connecting…' : 'Connect to SharePoint'}</button>{store.connection.mode === 'empty' && <button type="button" className="primary" onClick={() => void store.initializeSharePoint()}>Initialize central data</button>}{store.connection.mode === 'sharepoint' && <><button type="button" className="ghost" onClick={() => void store.pullSharePoint()}>Pull latest</button><button type="button" className="ghost" onClick={store.disconnectSharePoint}>Disconnect</button></>}</div></form>
      {store.connection.message && <div className={store.connection.status === 'error' || store.connection.status === 'conflict' ? 'notice error' : 'notice'}>{store.connection.message}{store.connection.account ? ` Signed in as ${store.connection.account}.` : ''}</div>}
    </Panel>
    <div className="admin-grid">
      <Panel><div className="panel-heading"><div><p className="eyebrow">PERIOD CONTROL</p><h2>{month}</h2></div></div><label>Reason for change<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        <div className="control-card"><div><strong>Planning</strong><p>Deadline: {period?.planningDeadline?.slice(0, 10) ?? 'Not configured'}</p></div><Pill tone={period?.planningLocked ? 'locked' : 'open'}>{period?.planningLocked ? 'Locked' : 'Open'}</Pill><button className="primary" onClick={() => toggle('planning')}>{period?.planningLocked ? 'Unlock' : 'Lock'}</button><label>Extend until<input type="date" onChange={(event) => extend('planning', event.target.value)} /></label></div>
        <div className="control-card"><div><strong>Actuals</strong><p>Deadline: {period?.actualsDeadline?.slice(0, 10) ?? 'Not configured'}</p></div><Pill tone={period?.actualsLocked ? 'locked' : 'open'}>{period?.actualsLocked ? 'Locked' : 'Open'}</Pill><button className="primary" onClick={() => toggle('actuals')}>{period?.actualsLocked ? 'Unlock' : 'Lock'}</button><label>Extend until<input type="date" onChange={(event) => extend('actuals', event.target.value)} /></label></div>
      </Panel>
      <Panel><div className="panel-heading"><div><p className="eyebrow">RBAC</p><h2>People and roles</h2></div></div>
        <form className="resource-form" onSubmit={addResource}><div className="form-row"><label>Name<input name="name" required placeholder="Resource name" /></label><label>Work email<input name="email" type="email" required placeholder="name@philips.com" /></label></div><div className="form-row"><label>App role<select name="role" defaultValue="Contributor"><option>Contributor</option><option>ProcessOwner</option><option>Viewer</option><option>Admin</option><option>Owner</option></select></label><button className="primary resource-add-button">＋ Add resource</button></div></form>
        {resourceMessage && <div className="notice">{resourceMessage}</div>}
        {store.state.people.map((person) => <div className="people-row" key={person.id}><div><strong>{person.name}</strong><small>{person.email || 'Email not supplied during migration'}</small></div><select value={person.role} onChange={(event) => setRole(person.id, event.target.value as UserRole)}>{roles.map((role) => <option key={role}>{role}</option>)}</select></div>)}
      </Panel>
    </div>
    <div className="admin-grid">
      <Panel><div className="panel-heading"><div><p className="eyebrow">MASTER DATA</p><h2>Admin-controlled dropdowns</h2></div></div><form className="inline-form" onSubmit={addMaster}><select name="type"><option>Release Type</option><option>Activity Type</option><option>Status</option><option>Resource Band</option><option>Complexity</option></select><input name="value" required placeholder="New value" /><button className="primary">Add</button></form>{store.state.masters.map((item) => <div className="master-row" key={item.id}><span>{item.type}</span><strong>{item.value}</strong><Pill tone={item.active ? 'open' : 'neutral'}>{item.active ? 'Active' : 'Inactive'}</Pill></div>)}</Panel>
      <Panel><div className="panel-heading"><div><p className="eyebrow">AUDIT</p><h2>Recent changes</h2></div></div>{store.state.audits.slice(0, 8).map((item) => <div className="audit-row" key={item.id}><span>{item.action}</span><div><strong>{item.entity}</strong><small>{item.detail}</small></div><time>{new Date(item.timestamp).toLocaleString()}</time></div>)}{!store.state.audits.length && <p className="muted">Changes made in the app will appear here.</p>}<button className="danger-button" onClick={store.reset}>Reset synthetic MVP data</button></Panel>
    </div>
  </section>
}
