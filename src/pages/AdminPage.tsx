import { useState } from 'react'
import { useNow } from '../useNow'
import { actualsLockDate, actualsLocked, defaultActualsLockDay, defaultPlanLockDay, planLockDate, planningLocked } from '../planningLock'
import { groupOf } from '../history'
import { fetchTeamMembers } from '../azureDevOps'
import { HistoryPanel } from '../components/HistoryPanel'
import type { HistoryStore } from '../useHistory'
import { TableDefaultsPanel } from '../components/TableDefaultsPanel'
import type { MasterValue } from '../domain'
import type { SharePointConfig } from '../sharepoint'
import { EmptyState, Modal, Notice, Page, Panel, Pill, SettingsSummary, type Tone } from '../components/ui'
import { formatDate, formatDateTime, formatHours, formatPercent, monthName } from '../format'
import { azureResources, capacityContext, capacityModel, normalizeCapacitySettings, normalizeProfiles, regions, resourceRoles, resourceRows, type CapacitySettings, type LoadStatus, type MonthLock, type ResourceProfile, type SharedTimeRule } from '../capacity'
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
import { settingsPagesFor, type SettingsTab } from '../settingsTabs'
import { SectionTabs } from '../components/SectionTabs'
import { MonthlyPackSetupPanel } from '../components/MonthlyPackSetupPanel'
import type { MonthlyPackStore } from '../useMonthlyPack'

const statusTone: Record<LoadStatus, Tone> = { 'Overloaded': 'danger', 'Balanced': 'open', 'Has capacity': 'info', 'No bookings': 'neutral' }
const shortMonthName = (month: string) => new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`))

// The Windchill host and views setup is hidden (Windchill exports are imported under Release Details instead).
// Everyone sets up their own connections and tokens here; the shared sections need the role right to manage them.
export function AdminPage({ store, month, azure, git, access, featureSetup, monthlyPack, history, loadEverything, onOpenBoard, tab: requested, onOpenTab }: PageProps & { tab: SettingsTab; onOpenTab: (tab: SettingsTab, section?: string) => void; azure: AzureWorkspace; git: GitStorage; access: Access; featureSetup: FeatureSetup; monthlyPack: MonthlyPackStore; history: HistoryStore; loadEverything: () => Promise<{ loaded: string[]; failed: string[] }>; onOpenBoard: () => void }) {
  const [everything, setEverything] = useState<{ busy: boolean; loaded?: string[]; failed?: string[] }>({ busy: false })
  const shared = access.can('settings.manage')
  const [reason, setReason] = useState('Approved operational extension')
  const [capacityMessage, setCapacityMessage] = useState('')
  const [sharePointConfig, setSharePointConfig] = useState<SharePointConfig>(() => store.getSavedSharePointConfig())
  const [sharePointOpen, setSharePointOpen] = useState(false)
  const [capacityOpen, setCapacityOpen] = useState(false)
  const capacity = capacityContext(store.state)
  const lockNow = useNow(60000)
  const profiles = capacity.profiles ?? {}
  // Resources (CAP-29…CAP-31): Time Writing people with their figures, plus everyone else who can be given a region and role.
  const historyPeople = history.file ? [...new Set(history.file.rows.filter((row) => !groupOf(row.person)).map((row) => history.file!.people[row.person] || row.person))] : []
  const resources = resourceRows(azureResources(azure.items, month, capacity), [...new Set(azure.items.map((item) => item.assignedTo).filter(Boolean))], historyPeople, profiles)
  const [teamStatus, setTeamStatus] = useState('')
  const [newPerson, setNewPerson] = useState('')
  async function addTeamMembers() {
    setTeamStatus('Reading the team from Azure DevOps…')
    try {
      if (!azure.config) throw new Error('Set up and fetch the Time Writing connection first')
      const team = azure.config.team
      const members = await fetchTeamMembers(azure.config, azure.pat)
      const known = new Set(resources.map((person) => person.name))
      const added = members.filter((member) => !known.has(member.name))
      if (added.length) store.update((draft) => {
        const current = normalizeProfiles(draft.resourceProfiles)
        draft.resourceProfiles = normalizeProfiles({ ...current, ...Object.fromEntries(added.map((member) => [member.name, { ...current[member.name], listed: 'team' }])) })
        draft.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Update', entity: 'Resource', entityId: 'team', detail: `Added ${added.length} team member${added.length === 1 ? '' : 's'} from Azure DevOps` })
        return draft
      })
      setTeamStatus(`${members.length} team member${members.length === 1 ? '' : 's'} in ${team}; ${added.length} added to the list.`)
    } catch (failure) { setTeamStatus(`Not read: ${failure instanceof Error ? failure.message : String(failure)}. The PAT needs Project and Team (Read) for the team list.`) }
  }
  const holidays = capacityModel(azure.items, month, capacity).holidays
  const unmapped = resources.filter((person) => !profiles[person.name]?.region).map((person) => person.name)
  const names = resources.map((person) => person.name)
  // Managers typed in by name because they have no Time Writing Tasks (not on the board): offered to everyone too.
  const outside = [...new Set(Object.values(profiles).map((profile) => profile.reportsTo).filter((name): name is string => Boolean(name) && !names.includes(name!)))].sort((a, b) => a.localeCompare(b))
  const [otherFor, setOtherFor] = useState('')
  const [otherName, setOtherName] = useState('')
  // Everyone with an email in the Time Writing backlog, offered when adding members to access roles.
  const people = [...new Map(azure.items.filter((item) => item.assignedToEmail).map((item) => [item.assignedToEmail!, item.assignedTo])).entries()].map(([email, name]) => ({ email, name })).sort((a, b) => a.name.localeCompare(b.name))

  // The default Joined on (Settings → Resources) of everyone without their own; '' clears it.
  function setDefaultJoined(value: string) {
    store.update((draft) => {
      draft.capacitySettings = normalizeCapacitySettings({ ...normalizeCapacitySettings(draft.capacitySettings), defaultJoinedOn: value })
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Update', entity: 'CapacitySettings', entityId: 'capacity', detail: `Default Joined on = ${value || 'none'}` })
      return draft
    })
  }
  function setProfile(name: string, patch: Partial<ResourceProfile>) {
    store.update((draft) => {
      const now = new Date().toISOString()
      const current = normalizeProfiles(draft.resourceProfiles)
      draft.resourceProfiles = normalizeProfiles({ ...current, [name]: { ...current[name], ...patch } })
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: now, actor: 'u-owner', action: 'Update', entity: 'Resource', entityId: name, detail: `${name}: ${Object.entries(patch).map(([key, value]) => `${key} = ${value === undefined || value === '' ? 'cleared' : String(value)}`).join(', ')}` })
      return draft
    })
  }

  // Month locks (MON-21…MON-24): the lock dates and early locks of the header month, and the default lock days, kept with
  // the capacity settings (planning data in Git); every lock is worked out from the current time.
  function setLocks(change: (settings: CapacitySettings) => CapacitySettings, detail: string) {
    store.update((draft) => {
      const now = new Date().toISOString()
      draft.capacitySettings = normalizeCapacitySettings(change(normalizeCapacitySettings(draft.capacitySettings)))
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: now, actor: 'u-owner', action: 'Update', entity: 'PeriodControl', entityId: month, detail: reason ? `${detail} — ${reason}` : detail })
      return draft
    })
  }
  function setMonthLock(patch: Partial<MonthLock>, detail: string) {
    setLocks((settings) => {
      const current = settings.monthLocks?.[month] ?? {}
      const next: MonthLock = { ...current, ...patch, ...(reason ? { reason } : {}), updatedAt: new Date().toISOString(), updatedBy: access.email || 'Settings' }
      for (const key of Object.keys(patch) as (keyof MonthLock)[]) if (patch[key] === undefined) delete next[key]
      return { ...settings, monthLocks: { ...(settings.monthLocks ?? {}), [month]: next } }
    }, detail)
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
      // The holiday and activity mappings and the default Joined on are kept: this form edits the numbers only.
      draft.capacitySettings = normalizeCapacitySettings({ ...next, sharedTime: normalizeCapacitySettings(draft.capacitySettings).sharedTime, defaultJoinedOn: normalizeCapacitySettings(draft.capacitySettings).defaultJoinedOn })
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
  // One Settings page at a time (chosen in the menu, SET-14); the shared pages only for roles that manage shared settings.
  const tab = settingsPagesFor(shared).some((page) => page.key === requested) ? requested : 'connections'
  return <Page>
    {tab === 'connections' && <SectionTabs page="connections" sections={[
      { key: 'email', label: 'Your work email', node: <AzureConnections section="email" azure={azure} store={store} git={git} onOpenBoard={onOpenBoard} canManage={shared} /> },
      { key: 'servers', label: 'Servers and PATs', node: <AzureConnections section="servers" azure={azure} store={store} git={git} onOpenBoard={onOpenBoard} canManage={shared} /> },
      { key: 'mapping', label: 'Stream mapping', node: <AzureConnections section="mapping" azure={azure} store={store} git={git} onOpenBoard={onOpenBoard} canManage={shared} /> },
      { key: 'views', label: 'Other views', node: <AzureConnections section="views" azure={azure} store={store} git={git} onOpenBoard={onOpenBoard} canManage={shared} /> },
      ...((store.state.azureSources ?? []).length ? [{ key: 'sources', label: 'Read-only sources', node: <AzureConnections section="sources" azure={azure} store={store} git={git} onOpenBoard={onOpenBoard} canManage={shared} /> }] : []),
      { key: 'sample', label: 'Synthetic sample', node: <AzureConnections section="sample" azure={azure} store={store} git={git} onOpenBoard={onOpenBoard} canManage={shared} /> },
    ]} />}
    {tab === 'storage' && <SectionTabs page="storage" sections={[
      { key: 'git', label: 'Git storage', node: <GitStoragePanel git={git} /> },
      ...(git.connected ? [{ key: 'load', label: 'Load from Git', node: <Panel className="connection-panel" eyebrow="GIT" title="Load everything from Git" info="Loads everything shared through Git at once: planning data, the connection setup, on-prem view data, Windchill exports, access roles and the Feature setup. Data here is replaced only by newer data from Git; connections you changed here are kept."
        action={<button type="button" className="primary" disabled={everything.busy || git.isSample} onClick={() => { setEverything({ busy: true }); void loadEverything().then((result) => setEverything({ busy: false, ...result })) }}>{everything.busy ? 'Loading…' : 'Load everything from Git'}</button>}>
        {git.isSample && <Notice tone="warning">Synthetic sample data is loaded: loading from Git is disabled.</Notice>}
        {everything.loaded && <Notice tone={everything.failed?.length ? 'warning' : 'success'}>Loaded: {everything.loaded.join('; ') || 'nothing'}.{everything.failed?.length ? ` Not loaded — ${everything.failed.join(' · ')}` : ''}</Notice>}
      </Panel> }] : []),
      ...(shared ? [{ key: 'shared', label: 'Shared setup in Git', node: <AzureViewsGitPanel git={git} azure={azure} /> }] : []),
      { key: 'sharepoint', label: 'SharePoint', node: <Panel className="connection-panel" eyebrow="CENTRAL DATA" title="SharePoint connection" info="Uses Microsoft sign-in and stores one versioned JSON data file in the I&D Quality document library. No client secret is stored in the browser." action={<Pill tone={store.connection.mode === 'sharepoint' ? 'open' : connectionFailed ? 'danger' : 'neutral'}>{store.connection.status}</Pill>}>
        <SettingsSummary rows={[['Host', sharePointConfig.hostname], ['Site', sharePointConfig.sitePath], ['Data file', sharePointConfig.stateFilePath], ['Application ID', sharePointConfig.clientId ? 'Set' : '']]} />
        <div className="button-row"><button type="button" className={store.connection.mode === 'sharepoint' ? 'ghost' : 'primary'} onClick={() => setSharePointOpen(true)}>{store.connection.mode === 'sharepoint' ? 'Change connection…' : 'Connect to SharePoint…'}</button>{store.connection.mode === 'empty' && <button type="button" className="primary" onClick={() => void store.initializeSharePoint()}>Initialize central data</button>}{store.connection.mode === 'sharepoint' && <><button type="button" className="ghost" onClick={() => void store.pullSharePoint()}>Pull latest</button><button type="button" className="ghost" onClick={store.disconnectSharePoint}>Disconnect</button></>}</div>
        {sharePointOpen && <Modal title="SharePoint connection" eyebrow="SETTINGS · STORAGE" wide form onClose={() => setSharePointOpen(false)}><form className="connection-form" onSubmit={(event) => { setSharePointOpen(false); void connectSharePoint(event) }}><label>Tenant ID (optional)<input value={sharePointConfig.tenantId} onChange={(event) => setSharePointConfig({ ...sharePointConfig, tenantId: event.target.value })} placeholder="Auto-detect from work sign-in" /></label><label>Application (client) ID<input required value={sharePointConfig.clientId} onChange={(event) => setSharePointConfig({ ...sharePointConfig, clientId: event.target.value })} placeholder="Registered SPA client ID" /></label><label>SharePoint host<input required value={sharePointConfig.hostname} onChange={(event) => setSharePointConfig({ ...sharePointConfig, hostname: event.target.value })} /></label><label>Site path<input required value={sharePointConfig.sitePath} onChange={(event) => setSharePointConfig({ ...sharePointConfig, sitePath: event.target.value })} /></label><label className="wide-field">Central data file<input required value={sharePointConfig.stateFilePath} onChange={(event) => setSharePointConfig({ ...sharePointConfig, stateFilePath: event.target.value })} /></label><div className="connection-actions"><button className="primary" disabled={store.connection.status === 'connecting'}>{store.connection.status === 'connecting' ? 'Connecting…' : 'Connect to SharePoint'}</button><button type="button" className="ghost" onClick={() => setSharePointOpen(false)}>Cancel</button></div></form></Modal>}
        {store.connection.message && <Notice tone={connectionFailed ? 'error' : 'info'}>{store.connection.message}{store.connection.account ? ` Signed in as ${store.connection.account}.` : ''}</Notice>}
      </Panel> },
    ]} />}
    {tab === 'features' && <FeatureSetupPanel setup={featureSetup} git={git} items={azure.items} />}
    {tab === 'pack' && shared && <MonthlyPackSetupPanel pack={monthlyPack} git={git} items={azure.items} />}
    {tab === 'history' && shared && <HistoryPanel history={history} git={git} items={azure.items} profileNames={Object.keys(capacityContext(store.state).profiles ?? {})} editable={git.connected && !git.readOnly && !git.isSample} importedBy={access.email} />}
    {tab === 'tables' && <TableDefaultsPanel store={store} git={git} canEdit={shared} />}
    {tab === 'access' && <AccessPanel access={access} git={git} people={people} />}
    {!shared && tab === 'access' && <Notice tone="info">Capacity, periods, resources, master data and the shared connection setup are managed by roles with “Manage shared settings”.</Notice>}
    {tab === 'capacity' && <SectionTabs page="capacity" sections={[
      { key: 'capacity', label: 'Capacity and absence', node: <Panel eyebrow="CAPACITY" title="Capacity and absence" info="Used by the Dashboard to compute available hours and utilization. Saved with the planning data in Git (with the holidays and common activities), so everyone who loads from Git gets the same settings.">
        <SettingsSummary rows={[['Team Holidays and Training Epic', `#${capacity.absenceEpicId}`], ['Funded hours per day', `${capacity.hoursPerDay}h`], ['Overloaded at', `${capacity.overloadedAt}%`], ['Has capacity below', `${capacity.availableBelow}%`], ['NPRA maximum', `${capacity.npraHoursPerMonth}h per person per month`]]} />
        <div className="button-row"><button type="button" className="ghost" onClick={() => setCapacityOpen(true)}>Edit capacity settings…</button></div>
        {capacityOpen && <Modal title="Capacity and absence" eyebrow="SETTINGS · CAPACITY" form onClose={() => setCapacityOpen(false)}><form onSubmit={(event) => { saveCapacity(event); setCapacityOpen(false) }}>
          <div className="form-row"><label>Team Holidays and Training Epic ID<input name="absenceEpicId" type="number" min="1" step="1" required defaultValue={capacity.absenceEpicId} /><small>Leave under this Epic counts as absence (Feature and Task titles decide PTO, Sick Leave or Unplanned Leave); a Task, Story or Feature titled with "Training" counts as NPRA instead.</small></label><label>Funded hours per working day<input name="hoursPerDay" type="number" min="0.25" step="0.25" required defaultValue={capacity.hoursPerDay} /></label></div>
          <div className="form-row"><label>Overloaded at or above (%)<input name="overloadedAt" type="number" min="1" step="1" required defaultValue={capacity.overloadedAt} /></label><label>Has capacity below (%)<input name="availableBelow" type="number" min="0" step="1" required defaultValue={capacity.availableBelow} /></label></div>
          <div className="form-row"><label>NPRA maximum per person per month (h)<input name="npraHoursPerMonth" type="number" min="0" step="0.5" required defaultValue={capacity.npraHoursPerMonth} /><small>Non-project related activities (internal meetings, trainings): Tasks tagged “NPRA”. Only the NPRA hours booked come off the available hours; they are tracked against this maximum and hours over it are flagged. 0 tracks without a maximum.</small></label></div>
          <div className="modal-actions"><button type="button" className="ghost" onClick={() => setCapacityOpen(false)}>Cancel</button><button className="primary">Save capacity settings</button></div>
        </form></Modal>}
        {capacityMessage && <Notice tone="success">{capacityMessage}</Notice>}
      </Panel> },
      { key: 'time', label: 'Holidays and common activities', node: <><div className="shared-time-panel"><GitSyncBar git={git} /></div>
      <SharedTimePanel settings={capacity} items={azure.items} month={month} onSave={saveSharedTime} /></> },
      { key: 'period', label: 'Period control', node: <Panel eyebrow="PERIOD CONTROL" title={`Locks of ${monthName(month)}`} info={<ul><li>Every month has its own last days to update: the plan of the month and its actuals. The day itself is still open; the month locks from the next day (your local time).</li><li>Without a date of its own, a month uses the default days below — e.g. the November plan can be updated until 5 November (locked from 6 November), November actuals until 4 December (locked from 5 December).</li><li>Lock now locks a month before its date; to reopen a locked month, set a later last day. Saved with the planning data in Git, so everyone sees the same locks.</li></ul>}>
        <GitSyncBar git={git} />
        <div className="lock-defaults">
          <label>Last day to update the plan<input type="number" min={1} max={28} value={capacity.planLockDay ?? defaultPlanLockDay} onChange={(event) => { const day = Number(event.target.value); if (day >= 1 && day <= 28) setLocks((settings) => ({ ...settings, planLockDay: day }), `Default planning lock day = ${day}`) }} /><small className="muted">of the month (every month without its own date); locked from the next day</small></label>
          <label>Last day to update actuals<input type="number" min={1} max={28} value={capacity.actualsLockDay ?? defaultActualsLockDay} onChange={(event) => { const day = Number(event.target.value); if (day >= 1 && day <= 28) setLocks((settings) => ({ ...settings, actualsLockDay: day }), `Default actuals lock day = ${day}`) }} /><small className="muted">of the next month; locked from the next day</small></label>
        </div>
        <label>Reason for change<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        {([['planning', 'Planning', planLockDate(capacity, month), planningLocked(capacity, month, lockNow), 'planOn', 'planLocked'], ['actuals', 'Actuals', actualsLockDate(capacity, month), actualsLocked(capacity, month, lockNow), 'actualsOn', 'actualsLocked']] as const).map(([kind, label, date, locked, dateKey, flagKey]) => {
          const own = capacity.monthLocks?.[month]
          return <div className="control-card" key={kind}><div><strong>{label} of {monthName(month)}</strong><p>Last day to update: {formatDate(date)}{own?.[dateKey] ? ' (date of this month)' : ' (default)'}{own?.[flagKey] ? ' · locked early' : ''}</p></div>
            <Pill tone={locked ? 'locked' : 'open'}>{locked ? 'Locked' : 'Open'}</Pill>
            <label>Last day to update<input type="date" aria-label={`${label} last day to update of ${monthName(month)}`} value={date} onChange={(event) => event.target.value && setMonthLock({ [dateKey]: event.target.value }, `${label} of ${month} locks after ${event.target.value}`)} /></label>
            {own?.[dateKey] && <button type="button" className="ghost" onClick={() => setMonthLock({ [dateKey]: undefined }, `${label} of ${month}: default lock date`)}>Use default</button>}
            <button type="button" className="primary" onClick={() => setMonthLock({ [flagKey]: own?.[flagKey] ? undefined : true }, `${label} of ${month} ${own?.[flagKey] ? 'no longer locked early' : 'locked now'}`)}>{own?.[flagKey] ? 'Undo early lock' : 'Lock now'}</button>
          </div>
        })}
      </Panel> },
    ]} />}
    {tab === 'resources' && <Panel className="admin-section" eyebrow="AZURE DEVOPS" title="Resources" info="Everyone whose region, role and dates can be set: the people with Time Writing Tasks (with their figures), everyone else Assigned To fetched work, the people of the historical hours (leavers included), the Azure DevOps team members (Add team members) and people added by name. Region, role and reporting line are saved with the planning data in Git (see Git storage above). Region decides which regional holidays apply. Joined on / Left on (both days worked) limit a person's funded hours to the working days they are employed: a month they join or leave in is prorated, and in a month before joining or after leaving they have no capacity and are not counted." action={<Pill tone={resources.length ? 'open' : 'neutral'}>{resources.length} {resources.length === 1 ? 'person' : 'people'}</Pill>}>
      {resources.length > 0 && <GitSyncBar git={git} />}
      {resources.length > 0 && <Notice tone={unmapped.length ? 'warning' : 'info'}>
        {holidays.length ? `Regional holidays in ${monthName(month)}: ${holidays.map((item) => `${item.region} ${formatHours(item.hours)}h → ${item.people} ${item.people === 1 ? 'person' : 'people'}`).join(' · ')}.` : `No regional holidays in ${monthName(month)}. Add a Feature such as "Public Holidays - India" under absence Epic #${capacity.absenceEpicId} with a "… - Time Writing" story and "<Month YYYY> | <Holiday>" Tasks.`}
        {unmapped.length > 0 && ` No region yet for ${unmapped.join(', ')}; regional holidays are not applied to them.`}
      </Notice>}
      <div className="button-row">
        <button type="button" className="ghost" disabled={azure.isSample} onClick={() => void addTeamMembers()}>Add team members from Azure DevOps</button>
        <form className="inline-form" onSubmit={(event) => { event.preventDefault(); const name = newPerson.trim(); if (name && !resources.some((person) => person.name === name)) setProfile(name, { listed: 'added' }); setNewPerson('') }}><input aria-label="Add a person by name" placeholder="Add a person by name" value={newPerson} onChange={(event) => setNewPerson(event.target.value)} /><button type="submit" className="ghost" disabled={!newPerson.trim()}>Add</button></form>
      </div>
      {teamStatus && <Notice tone={teamStatus.startsWith('Not read') ? 'warning' : 'info'}>{teamStatus}</Notice>}
      <label className="default-joined">Default Joined on (everyone without their own date; months before it count no capacity)<span className="button-row"><input type="date" aria-label="Default Joined on" value={capacity.defaultJoinedOn ?? ''} onChange={(event) => setDefaultJoined(event.target.value)} />{capacity.defaultJoinedOn && <button type="button" className="text-button" onClick={() => setDefaultJoined('')}>Clear</button>}</span></label>
      {resources.length ? <div className="azure-table"><table className="resource-table"><thead><tr><th>Person</th><th>Region</th><th>Role</th><th>Reports to</th><th>Employed</th><th>Status in {shortMonthName(month)}</th><th>Utilization</th><th>Booked (h)</th><th>Absence (h)</th><th>Main streams</th></tr></thead><tbody>{resources.map((person) => {
        const profile = profiles[person.name] ?? {}
        return <tr key={person.name}>
          <td><strong>{person.name}</strong>{person.months ? <small>{person.months} {person.months === 1 ? 'month' : 'months'} · {person.firstMonth === person.lastMonth ? shortMonthName(person.firstMonth) : `${shortMonthName(person.firstMonth)} – ${shortMonthName(person.lastMonth)}`}</small>
            : <small>No Time Writing yet · {person.sources.map((source) => ({ 'time writing': 'Time Writing', assigned: 'assigned in Azure DevOps', history: 'historical hours', team: 'team member', added: 'added by name', profile: 'profile' })[source]).join(', ')}{(profile.listed && !person.sources.some((source) => source === 'assigned' || source === 'history')) && <> · <button type="button" className="text-button" onClick={() => setProfile(person.name, { listed: undefined })}>Remove</button></>}</small>}</td>
          <td><select aria-label={`Region for ${person.name}`} value={profile.region ?? ''} onChange={(event) => setProfile(person.name, { region: (event.target.value || undefined) as ResourceProfile['region'] })}><option value="">Not set</option>{regions.map((region) => <option key={region}>{region}</option>)}</select></td>
          <td><select aria-label={`Role for ${person.name}`} value={profile.role ?? ''} onChange={(event) => setProfile(person.name, { role: (event.target.value || undefined) as ResourceProfile['role'] })}><option value="">Not set</option>{resourceRoles.map((role) => <option key={role}>{role}</option>)}</select><label className="check"><input type="checkbox" checked={Boolean(profile.peopleManager)} onChange={(event) => setProfile(person.name, { peopleManager: event.target.checked || undefined })} />People manager</label></td>
          <td>{otherFor === person.name ? <form className="inline-form" onSubmit={(event) => { event.preventDefault(); const name = otherName.trim(); if (name && name !== person.name) setProfile(person.name, { reportsTo: name }); setOtherFor('') }}><input aria-label={`Manager of ${person.name}`} placeholder="Manager's name" value={otherName} autoFocus onChange={(event) => setOtherName(event.target.value)} /><button type="submit" className="ghost">OK</button><button type="button" className="text-button" onClick={() => setOtherFor('')}>Cancel</button></form>
            : <select aria-label={`${person.name} reports to`} value={profile.reportsTo ?? ''} onChange={(event) => { if (event.target.value === '__other') { setOtherFor(person.name); setOtherName('') } else setProfile(person.name, { reportsTo: event.target.value || undefined }) }}><option value="">—</option>{names.filter((name) => name !== person.name).map((name) => <option key={name}>{name}</option>)}{outside.length > 0 && <optgroup label="Not on the board">{outside.filter((name) => name !== person.name).map((name) => <option key={name}>{name}</option>)}</optgroup>}<option value="__other">Other (type a name)…</option></select>}</td>
          <td className="employment-dates"><label>Joined on<input type="date" aria-label={`${person.name} joined on`} value={profile.joinedOn ?? ''} max={profile.leftOn} onChange={(event) => setProfile(person.name, { joinedOn: event.target.value || undefined })} /></label><label>Left on<input type="date" aria-label={`${person.name} left on`} value={profile.leftOn ?? ''} min={profile.joinedOn} onChange={(event) => setProfile(person.name, { leftOn: event.target.value || undefined })} /></label></td>
          <td><Pill tone={statusTone[person.status]}>{person.status}</Pill></td><td>{formatPercent(person.utilization)}</td><td>{formatHours(person.work)}</td><td>{formatHours(person.absence)}</td>
          <td>{person.streams.slice(0, 2).join(', ') || '—'}{person.streams.length > 2 && <small>+{person.streams.length - 2} more</small>}</td>
        </tr>
      })}</tbody></table></div>
        : <EmptyState title="No resources from Azure yet." detail="Refresh from Azure DevOps; people appear once they are Assigned To a Time Writing Task." />}
      {!resources.length && <div className="button-row"><button className="primary" onClick={() => onOpenTab('connections', 'servers')}>Go to Azure connections</button></div>}
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
