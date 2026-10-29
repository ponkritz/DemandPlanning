import { useState } from 'react'
import type { MasterValue } from '../domain'
import type { SharePointConfig } from '../sharepoint'
import { EmptyState, Modal, Notice, Page, Panel, Pill, SettingsSummary, type Tone } from '../components/ui'
import { formatDate, formatDateTime, formatHours, formatPercent, monthName } from '../format'
import { azureResources, capacityContext, capacityModel, normalizeCapacitySettings, normalizeProfiles, regions, resourceRoles, type LoadStatus, type ResourceProfile, type SharedTimeRule } from '../capacity'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { GitStorage } from '../useGitStorage'
import { GitStoragePanel, GitSyncBar } from '../components/GitStorage'
import { AzureViewsGitPanel } from '../components/AzureViewsGit'
import { AzureConnections } from '../components/AzureConnections'
import { AccessPanel } from '../components/AccessPanel'
import { FeatureSetupPanel } from '../components/FeatureSetupPanel'
import { SharedTimePanel } from '../components/SharedTimePanel'
import type { FeatureSetup } from '../useFeatureSetup'
import type { Access } from '../useAccess'
import type { PageProps } from './types'
import { settingsTabKey as tabKey, type SettingsTab } from '../settingsTabs'
import { MonthlyPackSetupPanel } from '../components/MonthlyPackSetupPanel'
import type { MonthlyPackStore } from '../useMonthlyPack'

const statusTone: Record<LoadStatus, Tone> = { 'Overloaded': 'danger', 'Balanced': 'open', 'Has capacity': 'info', 'No bookings': 'neutral' }
const shortMonthName = (month: string) => new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`))

// The Windchill host and views setup is hidden (Windchill exports are imported under Release Details instead).
// Everyone sets up their own connections and tokens here; the shared sections need the role right to manage them.
export function AdminPage({ store, month, azure, git, access, featureSetup, monthlyPack, loadEverything, onOpenBoard }: PageProps & { azure: AzureWorkspace; git: GitStorage; access: Access; featureSetup: FeatureSetup; monthlyPack: MonthlyPackStore; loadEverything: () => Promise<{ loaded: string[]; failed: string[] }>; onOpenBoard: () => void }) {
  const [everything, setEverything] = useState<{ busy: boolean; loaded?: string[]; failed?: string[] }>({ busy: false })
  const shared = access.can('settings.manage')
  const [reason, setReason] = useState('Approved operational extension')
  const [capacityMessage, setCapacityMessage] = useState('')
  const [sharePointConfig, setSharePointConfig] = useState<SharePointConfig>(() => store.getSavedSharePointConfig())
  const [sharePointOpen, setSharePointOpen] = useState(false)
  const [capacityOpen, setCapacityOpen] = useState(false)
  const period = store.state.periods.find((item) => item.month === month)
  const capacity = capacityContext(store.state)
  const profiles = capacity.profiles ?? {}
  const resources = azureResources(azure.items, month, capacity)
  const holidays = capacityModel(azure.items, month, capacity).holidays
  const unmapped = resources.filter((person) => !profiles[person.name]?.region).map((person) => person.name)
  const names = resources.map((person) => person.name)
  // Managers typed in by name because they have no Time Writing Tasks (not on the board): offered to everyone too.
  const outside = [...new Set(Object.values(profiles).map((profile) => profile.reportsTo).filter((name): name is string => Boolean(name) && !names.includes(name!)))].sort((a, b) => a.localeCompare(b))
  const [otherFor, setOtherFor] = useState('')
  const [otherName, setOtherName] = useState('')
  // Everyone with an email in the Time Writing backlog, offered when adding members to access roles.
  const people = [...new Map(azure.items.filter((item) => item.assignedToEmail).map((item) => [item.assignedToEmail!, item.assignedTo])).entries()].map(([email, name]) => ({ email, name })).sort((a, b) => a.name.localeCompare(b.name))

  function setProfile(name: string, patch: Partial<ResourceProfile>) {
    store.update((draft) => {
      const now = new Date().toISOString()
      const current = normalizeProfiles(draft.resourceProfiles)
      draft.resourceProfiles = normalizeProfiles({ ...current, [name]: { ...current[name], ...patch } })
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: now, actor: 'u-owner', action: 'Update', entity: 'Resource', entityId: name, detail: `${name}: ${Object.entries(patch).map(([key, value]) => `${key} = ${value === undefined || value === '' ? 'cleared' : String(value)}`).join(', ')}` })
      return draft
    })
  }

  function toggle(kind: 'planning' | 'actuals') {
    const now = new Date().toISOString()
    store.update((draft) => {
      let current = draft.periods.find((item) => item.month === month)
      if (!current) {
        current = { month, planningDeadline: `${month}-05T23:59:59.000Z`, actualsDeadline: `${month}-05T23:59:59.000Z`, planningLocked: false, actualsLocked: false, updatedAt: now, updatedBy: 'u-owner' }
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

  function addMaster(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form)
    store.update((draft) => { draft.masters.push({ id: crypto.randomUUID(), type: data.get('type') as MasterValue['type'], value: String(data.get('value')), sortOrder: draft.masters.length + 1, active: true }); return draft })
    form.reset()
  }

  function saveCapacity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const next = normalizeCapacitySettings({ absenceEpicId: data.get('absenceEpicId'), hoursPerDay: data.get('hoursPerDay'), overloadedAt: data.get('overloadedAt'), availableBelow: data.get('availableBelow'), npraHoursPerMonth: data.get('npraHoursPerMonth') })
    const now = new Date().toISOString()
    store.update((draft) => {
      // The holiday and activity mappings are kept: this form edits the numbers only.
      draft.capacitySettings = normalizeCapacitySettings({ ...next, sharedTime: normalizeCapacitySettings(draft.capacitySettings).sharedTime })
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: now, actor: 'u-owner', action: 'Update', entity: 'CapacitySettings', entityId: 'capacity', detail: `Absence Epic #${next.absenceEpicId}, ${next.hoursPerDay}h/day, overloaded ≥ ${next.overloadedAt}%, capacity < ${next.availableBelow}%, NPRA ${next.npraHoursPerMonth}h/month` })
      return draft
    })
    setCapacityMessage('Capacity settings saved here. Save to Git (bar below) so everyone gets them.')
  }

  // Holidays and common activities: saved with the capacity settings (shared app data), audited.
  function saveSharedTime(rules: SharedTimeRule[], detail: string) {
    const now = new Date().toISOString()
    store.update((draft) => {
      draft.capacitySettings = normalizeCapacitySettings({ ...normalizeCapacitySettings(draft.capacitySettings), sharedTime: rules })
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: now, actor: 'u-owner', action: 'Update', entity: 'CapacitySettings', entityId: 'shared-time', detail })
      return draft
    })
    setCapacityMessage(`${detail}. Save to Git (bar above) so everyone gets it.`)
  }

  async function connectSharePoint(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try { await store.connectSharePoint(sharePointConfig) } catch { /* Connection state displays the actionable error. */ }
  }

  const connectionFailed = store.connection.status === 'error' || store.connection.status === 'conflict'
  // One tab at a time; the shared tabs only for roles that manage shared settings (Feature setup is for everyone: each
  // person keeps their own and may enable it for all). The last tab is remembered here.
  const tabs = ([['connections', 'Azure DevOps'], ['storage', 'Storage'], ['access', 'Access'], ['features', 'Feature setup'], ...(shared ? [['capacity', 'Capacity & periods'], ['resources', 'Resources'], ['masters', 'Master data'], ['pack', 'Monthly pack'], ['audit', 'Audit']] : [])] as [SettingsTab, string][])
  const [chosen, setChosen] = useState<SettingsTab>(() => { try { return (localStorage.getItem(tabKey) as SettingsTab | null) ?? 'connections' } catch { return 'connections' } })
  const tab = tabs.some(([key]) => key === chosen) ? chosen : 'connections'
  const openTab = (key: SettingsTab) => { setChosen(key); try { localStorage.setItem(tabKey, key) } catch { /* not remembered */ } }
  return <Page>
    <div className="overview-tabs settings-tabs" role="tablist" aria-label="Settings">{tabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={`backlog-tab${tab === key ? ' active' : ''}`} onClick={() => openTab(key)}>{label}</button>)}</div>
    {tab === 'connections' && <AzureConnections azure={azure} store={store} git={git} onOpenBoard={onOpenBoard} canManage={shared} />}
    {tab === 'storage' && <>
      <GitStoragePanel git={git} />
      {git.connected && <Panel className="connection-panel" eyebrow="GIT" title="Load everything from Git" info="Loads everything shared through Git at once: planning data, the connection setup, on-prem view data, Windchill exports, access roles and the Feature setup. Data here is replaced only by newer data from Git; connections you changed here are kept."
        action={<button type="button" className="primary" disabled={everything.busy || git.isSample} onClick={() => { setEverything({ busy: true }); void loadEverything().then((result) => setEverything({ busy: false, ...result })) }}>{everything.busy ? 'Loading…' : 'Load everything from Git'}</button>}>
        {git.isSample && <Notice tone="warning">Synthetic sample data is loaded: loading from Git is disabled.</Notice>}
        {everything.loaded && <Notice tone={everything.failed?.length ? 'warning' : 'success'}>Loaded: {everything.loaded.join('; ') || 'nothing'}.{everything.failed?.length ? ` Not loaded — ${everything.failed.join(' · ')}` : ''}</Notice>}
      </Panel>}
      {shared && <AzureViewsGitPanel git={git} azure={azure} />}
      <Panel className="connection-panel" eyebrow="CENTRAL DATA" title="SharePoint connection" info="Uses Microsoft sign-in and stores one versioned JSON data file in the I&D Quality document library. No client secret is stored in the browser." action={<Pill tone={store.connection.mode === 'sharepoint' ? 'open' : connectionFailed ? 'danger' : 'neutral'}>{store.connection.status}</Pill>}>
        <SettingsSummary rows={[['Host', sharePointConfig.hostname], ['Site', sharePointConfig.sitePath], ['Data file', sharePointConfig.stateFilePath], ['Application ID', sharePointConfig.clientId ? 'Set' : '']]} />
        <div className="button-row"><button type="button" className={store.connection.mode === 'sharepoint' ? 'ghost' : 'primary'} onClick={() => setSharePointOpen(true)}>{store.connection.mode === 'sharepoint' ? 'Change connection…' : 'Connect to SharePoint…'}</button>{store.connection.mode === 'empty' && <button type="button" className="primary" onClick={() => void store.initializeSharePoint()}>Initialize central data</button>}{store.connection.mode === 'sharepoint' && <><button type="button" className="ghost" onClick={() => void store.pullSharePoint()}>Pull latest</button><button type="button" className="ghost" onClick={store.disconnectSharePoint}>Disconnect</button></>}</div>
        {sharePointOpen && <Modal title="SharePoint connection" eyebrow="SETTINGS · STORAGE" wide form onClose={() => setSharePointOpen(false)}><form className="connection-form" onSubmit={(event) => { setSharePointOpen(false); void connectSharePoint(event) }}><label>Tenant ID (optional)<input value={sharePointConfig.tenantId} onChange={(event) => setSharePointConfig({ ...sharePointConfig, tenantId: event.target.value })} placeholder="Auto-detect from work sign-in" /></label><label>Application (client) ID<input required value={sharePointConfig.clientId} onChange={(event) => setSharePointConfig({ ...sharePointConfig, clientId: event.target.value })} placeholder="Registered SPA client ID" /></label><label>SharePoint host<input required value={sharePointConfig.hostname} onChange={(event) => setSharePointConfig({ ...sharePointConfig, hostname: event.target.value })} /></label><label>Site path<input required value={sharePointConfig.sitePath} onChange={(event) => setSharePointConfig({ ...sharePointConfig, sitePath: event.target.value })} /></label><label className="wide-field">Central data file<input required value={sharePointConfig.stateFilePath} onChange={(event) => setSharePointConfig({ ...sharePointConfig, stateFilePath: event.target.value })} /></label><div className="connection-actions"><button className="primary" disabled={store.connection.status === 'connecting'}>{store.connection.status === 'connecting' ? 'Connecting…' : 'Connect to SharePoint'}</button><button type="button" className="ghost" onClick={() => setSharePointOpen(false)}>Cancel</button></div></form></Modal>}
        {store.connection.message && <Notice tone={connectionFailed ? 'error' : 'info'}>{store.connection.message}{store.connection.account ? ` Signed in as ${store.connection.account}.` : ''}</Notice>}
      </Panel>
    </>}
    {tab === 'features' && <FeatureSetupPanel setup={featureSetup} git={git} items={azure.items} />}
    {tab === 'pack' && shared && <MonthlyPackSetupPanel pack={monthlyPack} git={git} items={azure.items} />}
    {tab === 'access' && <AccessPanel access={access} git={git} people={people} />}
    {!shared && tab === 'access' && <Notice tone="info">Capacity, periods, resources, master data and the shared connection setup are managed by roles with “Manage shared settings”.</Notice>}
    {tab === 'capacity' && <div className="admin-grid">
      <Panel eyebrow="CAPACITY" title="Capacity and absence" info="Used by the Dashboard to compute available hours and utilization. Saved with the planning data in Git (with the holidays and common activities), so everyone who loads from Git gets the same settings.">
        <SettingsSummary rows={[['Absence Epic', `#${capacity.absenceEpicId}`], ['Funded hours per day', `${capacity.hoursPerDay}h`], ['Overloaded at', `${capacity.overloadedAt}%`], ['Has capacity below', `${capacity.availableBelow}%`], ['NPRA maximum', `${capacity.npraHoursPerMonth}h per person per month`]]} />
        <div className="button-row"><button type="button" className="ghost" onClick={() => setCapacityOpen(true)}>Edit capacity settings…</button></div>
        {capacityOpen && <Modal title="Capacity and absence" eyebrow="SETTINGS · CAPACITY" form onClose={() => setCapacityOpen(false)}><form onSubmit={(event) => { saveCapacity(event); setCapacityOpen(false) }}>
          <div className="form-row"><label>Absence Epic ID<input name="absenceEpicId" type="number" min="1" step="1" required defaultValue={capacity.absenceEpicId} /><small>Everything under this Epic counts as absence; Feature and Task titles decide PTO, Sick Leave or Unplanned Leave.</small></label><label>Funded hours per working day<input name="hoursPerDay" type="number" min="0.25" step="0.25" required defaultValue={capacity.hoursPerDay} /></label></div>
          <div className="form-row"><label>Overloaded at or above (%)<input name="overloadedAt" type="number" min="1" step="1" required defaultValue={capacity.overloadedAt} /></label><label>Has capacity below (%)<input name="availableBelow" type="number" min="0" step="1" required defaultValue={capacity.availableBelow} /></label></div>
          <div className="form-row"><label>NPRA maximum per person per month (h)<input name="npraHoursPerMonth" type="number" min="0" step="0.5" required defaultValue={capacity.npraHoursPerMonth} /><small>Non-project related activities (internal meetings, trainings): Tasks tagged “NPRA”. Only the NPRA hours booked come off the available hours; they are tracked against this maximum and hours over it are flagged. 0 tracks without a maximum.</small></label></div>
          <div className="modal-actions"><button type="button" className="ghost" onClick={() => setCapacityOpen(false)}>Cancel</button><button className="primary">Save capacity settings</button></div>
        </form></Modal>}
        {capacityMessage && <Notice tone="success">{capacityMessage}</Notice>}
      </Panel>
      <div className="shared-time-panel"><GitSyncBar git={git} /></div>
      <SharedTimePanel settings={capacity} items={azure.items} month={month} onSave={saveSharedTime} />
      <Panel eyebrow="PERIOD CONTROL" title={monthName(month)}>
        <label>Reason for change<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        <div className="control-card"><div><strong>Planning</strong><p>Deadline: {formatDate(period?.planningDeadline, `${month}-05 (default)`)}</p></div><Pill tone={period?.planningLocked ? 'locked' : 'open'}>{period?.planningLocked ? 'Locked' : 'Open'}</Pill><button className="primary" onClick={() => toggle('planning')}>{period?.planningLocked ? 'Unlock' : 'Lock'}</button><label>Extend until<input type="date" onChange={(event) => extend('planning', event.target.value)} /></label></div>
        <div className="control-card"><div><strong>Actuals</strong><p>Deadline: {formatDate(period?.actualsDeadline, `${month}-05 (default)`)}</p></div><Pill tone={period?.actualsLocked ? 'locked' : 'open'}>{period?.actualsLocked ? 'Locked' : 'Open'}</Pill><button className="primary" onClick={() => toggle('actuals')}>{period?.actualsLocked ? 'Unlock' : 'Lock'}</button><label>Extend until<input type="date" onChange={(event) => extend('actuals', event.target.value)} /></label></div>
      </Panel>
    </div>}
    {tab === 'resources' && <Panel className="admin-section" eyebrow="AZURE DEVOPS" title="Resources" info="People come from Azure (everyone Assigned To a Time Writing Task, absence included); add or remove them in Azure DevOps. Region, role and reporting line are saved with the planning data in Git (see Git storage above). Region decides which regional holidays apply." action={<Pill tone={resources.length ? 'open' : 'neutral'}>{resources.length} {resources.length === 1 ? 'person' : 'people'}</Pill>}>
      {resources.length > 0 && <GitSyncBar git={git} />}
      {resources.length > 0 && <Notice tone={unmapped.length ? 'warning' : 'info'}>
        {holidays.length ? `Regional holidays in ${monthName(month)}: ${holidays.map((item) => `${item.region} ${formatHours(item.hours)}h → ${item.people} ${item.people === 1 ? 'person' : 'people'}`).join(' · ')}.` : `No regional holidays in ${monthName(month)}. Add a Feature such as "Public Holidays - India" under absence Epic #${capacity.absenceEpicId} with a "… - Time Writing" story and "<Month YYYY> | <Holiday>" Tasks.`}
        {unmapped.length > 0 && ` No region yet for ${unmapped.join(', ')}; regional holidays are not applied to them.`}
      </Notice>}
      {resources.length ? <div className="azure-table"><table className="resource-table"><thead><tr><th>Person</th><th>Region</th><th>Role</th><th>Reports to</th><th>Status in {shortMonthName(month)}</th><th>Utilization</th><th>Booked (h)</th><th>Absence (h)</th><th>Main streams</th></tr></thead><tbody>{resources.map((person) => {
        const profile = profiles[person.name] ?? {}
        return <tr key={person.name}>
          <td><strong>{person.name}</strong><small>{person.months} {person.months === 1 ? 'month' : 'months'} · {person.firstMonth === person.lastMonth ? shortMonthName(person.firstMonth) : `${shortMonthName(person.firstMonth)} – ${shortMonthName(person.lastMonth)}`}</small></td>
          <td><select aria-label={`Region for ${person.name}`} value={profile.region ?? ''} onChange={(event) => setProfile(person.name, { region: (event.target.value || undefined) as ResourceProfile['region'] })}><option value="">Not set</option>{regions.map((region) => <option key={region}>{region}</option>)}</select></td>
          <td><select aria-label={`Role for ${person.name}`} value={profile.role ?? ''} onChange={(event) => setProfile(person.name, { role: (event.target.value || undefined) as ResourceProfile['role'] })}><option value="">Not set</option>{resourceRoles.map((role) => <option key={role}>{role}</option>)}</select><label className="check"><input type="checkbox" checked={Boolean(profile.peopleManager)} onChange={(event) => setProfile(person.name, { peopleManager: event.target.checked || undefined })} />People manager</label></td>
          <td>{otherFor === person.name ? <form className="inline-form" onSubmit={(event) => { event.preventDefault(); const name = otherName.trim(); if (name && name !== person.name) setProfile(person.name, { reportsTo: name }); setOtherFor('') }}><input aria-label={`Manager of ${person.name}`} placeholder="Manager's name" value={otherName} autoFocus onChange={(event) => setOtherName(event.target.value)} /><button type="submit" className="ghost">OK</button><button type="button" className="text-button" onClick={() => setOtherFor('')}>Cancel</button></form>
            : <select aria-label={`${person.name} reports to`} value={profile.reportsTo ?? ''} onChange={(event) => { if (event.target.value === '__other') { setOtherFor(person.name); setOtherName('') } else setProfile(person.name, { reportsTo: event.target.value || undefined }) }}><option value="">—</option>{names.filter((name) => name !== person.name).map((name) => <option key={name}>{name}</option>)}{outside.length > 0 && <optgroup label="Not on the board">{outside.filter((name) => name !== person.name).map((name) => <option key={name}>{name}</option>)}</optgroup>}<option value="__other">Other (type a name)…</option></select>}</td>
          <td><Pill tone={statusTone[person.status]}>{person.status}</Pill></td><td>{formatPercent(person.utilization)}</td><td>{formatHours(person.work)}</td><td>{formatHours(person.absence)}</td>
          <td>{person.streams.slice(0, 2).join(', ') || '—'}{person.streams.length > 2 && <small>+{person.streams.length - 2} more</small>}</td>
        </tr>
      })}</tbody></table></div>
        : <EmptyState title="No resources from Azure yet." detail="Refresh from Azure DevOps; people appear once they are Assigned To a Time Writing Task." />}
      {!resources.length && <div className="button-row"><button className="primary" onClick={() => openTab('connections')}>Go to Azure connections</button></div>}
      {resources.some((person) => profiles[person.name]?.reportsTo) && <TeamTree names={names} profiles={profiles} />}
    </Panel>}
    {tab === 'masters' && <Panel className="admin-section" eyebrow="MASTER DATA" title="Admin-controlled dropdowns">
        <form className="inline-form" onSubmit={addMaster}><select name="type"><option>Release Type</option><option>Activity Type</option><option>Status</option><option>Resource Band</option><option>Complexity</option></select><input name="value" required placeholder="New value" /><button className="primary">Add</button></form>
        {store.state.masters.map((item) => <div className="master-row" key={item.id}><span>{item.type}</span><strong>{item.value}</strong><Pill tone={item.active ? 'open' : 'neutral'}>{item.active ? 'Active' : 'Inactive'}</Pill></div>)}
    </Panel>}
    {tab === 'audit' && <Panel eyebrow="AUDIT" title="Recent changes">
      {store.state.audits.slice(0, 8).map((item) => <div className="audit-row" key={item.id}><span>{item.action}</span><div><strong>{item.entity}</strong><small>{item.detail}</small></div><time>{formatDateTime(item.timestamp)}</time></div>)}
      {!store.state.audits.length && <EmptyState title="No changes recorded yet." detail="Changes made in the app will appear here." />}
      <button className="danger-button" onClick={store.reset}>Reset synthetic MVP data</button>
    </Panel>}
  </Page>
}

// Reporting lines as a nested list: people without a manager, and managers typed in who are not in the Azure list
// (no Time Writing Tasks, marked "not on the board"), are the roots.
function TeamTree({ names, profiles }: { names: string[]; profiles: Record<string, ResourceProfile> }) {
  const outside = [...new Set(names.map((name) => profiles[name]?.reportsTo).filter((manager): manager is string => Boolean(manager) && !names.includes(manager!)))].sort((a, b) => a.localeCompare(b))
  const reports = (manager: string | undefined) => manager ? names.filter((name) => profiles[name]?.reportsTo === manager) : [...outside, ...names.filter((name) => !profiles[name]?.reportsTo)]
  const label = (name: string) => outside.includes(name) ? 'not on the board' : [profiles[name]?.role, profiles[name]?.peopleManager ? 'people manager' : '', profiles[name]?.region].filter(Boolean).join(' · ')
  const branch = (name: string, seen: Set<string>): React.ReactNode => {
    const children = reports(name).filter((child) => !seen.has(child))
    const next = new Set(seen).add(name)
    return <li key={name}><strong>{name}</strong>{label(name) && <small>{label(name)}</small>}{children.length > 0 && <ul>{children.map((child) => branch(child, next))}</ul>}</li>
  }
  const placed = new Set<string>(), walk = (name: string) => { if (placed.has(name)) return; placed.add(name); reports(name).forEach(walk) }
  reports(undefined).forEach(walk)
  const circular = names.filter((name) => !placed.has(name))
  return <div className="team-tree"><h3>Reporting lines</h3><ul>{reports(undefined).map((name) => branch(name, new Set()))}</ul>{circular.length > 0 && <Notice tone="warning">Circular reporting line, not shown above: {circular.join(', ')}.</Notice>}</div>
}
