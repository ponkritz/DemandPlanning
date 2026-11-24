import { useEffect, useState } from 'react'
import { EpicFeatureEditor } from '../components/EpicFeatureEditor'
import { AdminOverview } from '../components/AdminOverview'
import { setupGaps } from '../adminOverview'
import { UsagePanel } from '../components/UsagePanel'
import type { SetupStep } from '../setupGuide'
import { useBulkEpic } from '../useStreamEpics'
import { NamingPatternsPanel } from '../components/NamingPatternsPanel'
import { EpicSetupPanel } from '../components/EpicSetupPanel'
import { StoryTemplatesPanel } from '../components/StoryTemplatesPanel'
import type { EpicSetupStore } from '../useEpicSetup'
import { ScopeChip } from '../components/ScopeChip'
import { MyViewsPanel } from '../components/MyViewsPanel'
import { useNow } from '../useNow'
import { actualsLockDate, actualsLocked, defaultActualsLockDay, defaultPlanLockDay, planLockDate, planningLocked } from '../planningLock'
import { groupOf } from '../history'
import { fetchTeamMembers } from '../azureDevOps'
import { HistoryPanel } from '../components/HistoryPanel'
import type { HistoryStore } from '../useHistory'
import { TableDefaultsPanel } from '../components/TableDefaultsPanel'
import { PageLayoutPanel, StartViewPanel, ThemePanel } from '../components/LookAndFeel'
import type { StartView } from '../homeTiles'
import { EmptyState, Info, Modal, Notice, Page, Panel, Pill, SettingsSummary } from '../components/ui'
import { formatDate, formatDateTime, formatHours, monthName } from '../format'
import { utcToday } from '../businessTime'
import { azureResources, capacityContext, capacityModel, type CapacityRoles, normalizeCapacitySettings, normalizeProfiles, resourceRows, type CapacitySettings, type MonthLock, type ResourceProfile, type SharedTimeRule } from '../capacity'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { GitStorage } from '../useGitStorage'
import { GitStoragePanel, GitSyncBar } from '../components/GitStorage'
import { AzureViewsGitPanel } from '../components/AzureViewsGit'
import { AzureConnections } from '../components/AzureConnections'
import { AccessPanel } from '../components/AccessPanel'
import { SharedTimePanel } from '../components/SharedTimePanel'
import { CalculationProfilesPanel } from '../components/CalculationProfilesPanel'
import { CapacityRolesPanel } from '../components/CapacityRolesPanel'
import { defaultPolicy, keepsManager, toolOwnerExists, type Action, type Role } from '../access'
import { PeoplePanel } from '../components/PeoplePanel'
import { patchProfiles, personStatus, setRolesFor, type PersonEntry } from '../people'
import { BucketRulesPanel } from '../components/BucketRulesPanel'
import { InsightThresholdsPanel } from '../components/InsightThresholdsPanel'
import type { InsightThresholds } from '../insightThresholds'
import type { BucketRules } from '../bucketRules'
import type { CalculationProfile, ProfileTerms } from '../calculationProfiles'
import type { FeatureSetup } from '../useFeatureSetup'
import type { Access } from '../useAccess'
import type { PageProps } from './types'
import { resolveSettings, settingsPagesFor, type SettingsTab } from '../settingsTabs'
import { SectionTabs } from '../components/SectionTabs'
import { MonthlyPackSetupPanel } from '../components/MonthlyPackSetupPanel'
import type { MonthlyPackStore } from '../useMonthlyPack'

const shortMonthName = (month: string) => new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`))

// The Windchill host and views setup is hidden (Windchill exports are imported under Release Details instead).
// Everyone sets up their own connections and tokens here; the shared sections need the role right to manage them.
export function AdminPage({ store, month, azure, git, access, featureSetup, epicSetup, setupSteps = [], onSearch = () => undefined, qeColumnNames = [], monthlyPack, history, loadEverything, onOpenBoard, tab: requested, onOpenTab, look }: PageProps & { look?: { startView: StartView; onStartView: (view: StartView) => void; onCustomizeMenu: () => void }; tab: SettingsTab; onOpenTab: (tab: SettingsTab, section?: string) => void; azure: AzureWorkspace; git: GitStorage; access: Access; featureSetup: FeatureSetup; epicSetup: EpicSetupStore; setupSteps?: SetupStep[]; onSearch?: () => void; qeColumnNames?: string[]; monthlyPack: MonthlyPackStore; history: HistoryStore; loadEverything: () => Promise<{ loaded: string[]; failed: string[] }>; onOpenBoard: () => void }) {
  const [everything, setEverything] = useState<{ busy: boolean; loaded?: string[]; failed?: string[] }>({ busy: false })
  // CON-94: each shared section needs its own permission.
  const can = access.can
  const peopleShared = can('people.edit') || can('people.capacityRoles')
  const capacityNeeds: Record<string, Action> = { history: 'capacity.history', capacity: 'capacity.settings', profiles: 'capacity.settings', rules: 'capacity.rules', insights: 'capacity.rules', time: 'capacity.time', period: 'capacity.periods' }
  const [reason, setReason] = useState('Approved operational extension')
  const [capacityMessage, setCapacityMessage] = useState('')
  const [capacityOpen, setCapacityOpen] = useState(false)
  const capacity = capacityContext(store.state)
  const lockNow = useNow(60000)
  const profiles = capacity.profiles ?? {}
  // Resources (CAP-29…CAP-31): Time Writing people with their figures, plus everyone else who can be given a region and role.
  const historyPeople = history.file ? [...new Set(history.file.rows.filter((row) => !groupOf(row.person)).map((row) => history.file!.people[row.person] || row.person))] : []
  const allResources = resourceRows(azureResources(azure.items, month, capacity), [...new Set(azure.items.map((item) => item.assignedTo).filter(Boolean))], historyPeople, profiles)
  // CAP-51: the people come from Azure DevOps — the members of the Time Writing connection's team (read when People &
  // access opens and after every Azure refresh) and everyone Assigned To a fetched work item; names and work emails are
  // Azure's and are not typed here.
  const [team, setTeam] = useState<{ key: string; members: { name: string; email?: string }[]; error?: string } | null>(null)
  const [teamRead, setTeamRead] = useState(0)
  const teamKey = azure.config && azure.pat && !azure.isSample ? `${azure.config.organization}/${azure.config.project}/${azure.config.team}|${azure.items.length}|${teamRead}` : ''
  useEffect(() => {
    if (!teamKey || requested !== 'resources' || !azure.config) return
    let live = true
    fetchTeamMembers(azure.config, azure.pat).then((members) => { if (live) setTeam({ key: teamKey, members }) }, (failure: unknown) => { if (live) setTeam({ key: teamKey, members: [], error: failure instanceof Error ? failure.message : String(failure) }) })
    return () => { live = false }
  }, [teamKey, requested]) // eslint-disable-line react-hooks/exhaustive-deps
  const teamMembers = team?.members ?? []
  const teamNames = new Set(teamMembers.map((member) => member.name))
  // Listed: the team members and the people Assigned To in Azure DevOps (with their Time Writing, if any). Anyone else
  // with settings (historical hours, added by name before v7.0.0) is shown apart, so nothing set for them is lost.
  const fromAzure = (person: typeof allResources[number]) => teamNames.has(person.name) || person.sources.some((source) => source === 'time writing' || source === 'assigned' || source === 'team')
  const resources = [...allResources.filter(fromAzure), ...teamMembers.filter((member) => !allResources.some((person) => person.name === member.name)).map((member) => ({ name: member.name, firstMonth: '', lastMonth: '', months: 0, tasks: 0, work: 0, absence: 0, streams: [], status: 'No bookings' as const, utilization: null, sources: ['team' as const] }))].sort((a, b) => a.name.localeCompare(b.name))
  const notInAzure = allResources.filter((person) => !fromAzure(person) && !profiles[person.name]?.removed && profiles[person.name] && Object.keys(profiles[person.name]).some((key) => key !== 'listed'))
  const monthModel = capacityModel(azure.items, month, capacity)
  const holidays = monthModel.holidays
  // CAP-34: who counts in the month's capacity (a month Time Writing Task, employed that month, not removed) and how much.
  const counted = monthModel.people.filter((person) => person.name !== 'Unassigned')
  const sumOf = (pick: (person: typeof counted[number]) => number) => counted.reduce((sum, person) => sum + pick(person), 0)
  const removedNames = Object.entries(profiles).filter(([, profile]) => profile.removed).map(([name]) => name).sort((a, b) => a.localeCompare(b))
  const unmapped = resources.filter((person) => !profiles[person.name]?.region).map((person) => person.name)
  const names = resources.map((person) => person.name)

  // Managers typed in by name because they have no Time Writing Tasks (not on the board): offered to everyone too.
  const outside = [...new Set(Object.values(profiles).map((profile) => profile.reportsTo).filter((name): name is string => Boolean(name) && !names.includes(name!)))].sort((a, b) => a.localeCompare(b))
  // Everyone with an email in the Time Writing backlog, offered when adding members to access roles.
  const people = [...new Map(azure.items.filter((item) => item.assignedToEmail).map((item) => [item.assignedToEmail!, item.assignedTo])).entries()].map(([email, name]) => ({ email, name })).sort((a, b) => a.name.localeCompare(b.name))
  // CAP-49: People & access — each person's email links them to their app access role (access.json, by email).
  const accessEditable = git.connected && !git.readOnly && !git.isSample && access.can('access.manage')
  const accessReason = accessEditable ? '' : !access.can('access.manage') ? 'Changing app access roles needs “Manage access” (Role rights).' : 'Changing app access roles needs Git storage with a token that can write (not the synthetic sample).'
  const members = access.policy?.members ?? {}
  // The work email Azure DevOps gives for each name (team member, else Assigned To); an email saved before v7.0.0 is
  // used only where Azure has none.
  const emailOfName = new Map([...people.map((person) => [person.name, person.email] as const), ...teamMembers.flatMap((member) => member.email ? [[member.name, member.email] as const] : [])])
  const emailOf = (name: string) => emailOfName.get(name) ?? profiles[name]?.email
  // CON-104: a person may hold several roles (their rights are the union, CON-94); the People section sets all of them.
  const appRolesOf = (email?: string): Role[] => email ? members[email] ?? [] : []
  const mappedEmails = new Set(resources.map((person) => emailOf(person.name)).filter(Boolean))
  const accessOnly = Object.entries(members).filter(([email]) => !mappedEmails.has(email)).sort(([a], [b]) => a.localeCompare(b))
  // CAP-58: everyone in one list with their Status — the people from Azure DevOps, those with settings who are not in
  // Azure DevOps, and those not part of the team (removed) — instead of separate lists below the table.
  const noteOf = (person: typeof allResources[number]) => person.months ? `${person.months} ${person.months === 1 ? 'month' : 'months'} · ${person.firstMonth === person.lastMonth ? shortMonthName(person.firstMonth) : `${shortMonthName(person.firstMonth)} – ${shortMonthName(person.lastMonth)}`}`
    : `${teamNames.has(person.name) || person.sources.includes('team') ? 'Team member' : 'Assigned To in Azure DevOps'} · no Time Writing yet`
  const entryOf = (name: string, inAzure: boolean, note?: string): PersonEntry => {
    const profile = profiles[name] ?? {}, email = emailOf(name)
    return { name, email, emailSaved: Boolean(email) && !emailOfName.has(name), roles: appRolesOf(email), profile, status: personStatus(profile, inAzure, utcToday()), note }
  }
  const listedNames = new Set(resources.map((person) => person.name))
  const peopleEntries: PersonEntry[] = [
    ...resources.map((person) => entryOf(person.name, true, noteOf(person))),
    ...notInAzure.filter((person) => !listedNames.has(person.name)).map((person) => entryOf(person.name, false, person.months ? noteOf(person) : 'Settings kept; not in the team and not Assigned To')),
    ...removedNames.filter((name) => !listedNames.has(name)).map((name) => entryOf(name, false)),
  ]
  async function saveRoles(chosenFor: { name: string; email?: string }[], chosen: Role[]) {
    if (!accessEditable) throw new Error(accessReason)
    const result = setRolesFor(access.policy ?? defaultPolicy(access.email), chosenFor, chosen)
    if (!result.changed.length) return { changed: [], skipped: result.skipped, path: access.path }
    if (!keepsManager(result.policy, access.email)) throw new Error(`Not saved: ${access.email || 'you'} would lose “Manage access”.`)
    await access.save(result.policy, `Access: ${result.changed.join(', ')} → ${chosen.join(', ') || 'no app access role'}`)
    return { changed: result.changed, skipped: result.skipped, path: access.path }
  }
  // CAP-58…CAP-60: one change of the profiles for one person (drawer) or everyone selected (bulk edit), one History entry.
  function savePeopleProfiles(names: string[], patch: Partial<ResourceProfile>, detail: string) {
    store.update((draft) => {
      draft.resourceProfiles = patchProfiles(normalizeProfiles(draft.resourceProfiles), names, patch)
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Update', entity: 'Resource', entityId: names.length === 1 ? names[0] : `${names.length} people`, detail: detail.slice(0, 2000) })
      return draft
    })
  }
  function saveCapacityRoles(next: CapacityRoles, detail: string) {
    store.update((draft) => {
      draft.capacitySettings = normalizeCapacitySettings({ ...normalizeCapacitySettings(draft.capacitySettings), capacityRoles: next })
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Update', entity: 'CapacitySettings', entityId: 'capacity-roles', detail })
      return draft
    })
  }
  // The default Time tracking started (Admin → People & roles → People) of everyone without their own; '' clears it.
  function setDefaultJoined(value: string) {
    store.update((draft) => {
      draft.capacitySettings = normalizeCapacitySettings({ ...normalizeCapacitySettings(draft.capacitySettings), defaultJoinedOn: value })
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Update', entity: 'CapacitySettings', entityId: 'capacity', detail: `Default Time tracking started = ${value || 'none'}` })
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

  // CAP-41/42: the custom calculation profiles and the default profile, shared in Git and audited.
  function saveProfiles(profiles: CalculationProfile[], defaultId: string, detail: string) {
    store.update((draft) => {
      draft.capacitySettings = normalizeCapacitySettings({ ...normalizeCapacitySettings(draft.capacitySettings), calculationProfiles: profiles, defaultProfileId: defaultId })
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Update', entity: 'CapacitySettings', entityId: 'calculation-profiles', detail: detail.slice(0, 2000) })
      return draft
    })
  }

  // CAP-52: the names of the figures per calculation profile, shared in Git and audited.
  function saveProfileTerms(terms: ProfileTerms, detail: string) {
    store.update((draft) => {
      draft.capacitySettings = normalizeCapacitySettings({ ...normalizeCapacitySettings(draft.capacitySettings), profileTerms: terms })
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Update', entity: 'CapacitySettings', entityId: 'profile-terms', detail: detail.slice(0, 2000) })
      return draft
    })
  }

  // CAP-46: the bucket rules (words and tags), shared in Git and audited; undefined = the built-in ones.
  function saveBucketRules(rules: BucketRules | undefined, detail: string) {
    store.update((draft) => {
      draft.capacitySettings = normalizeCapacitySettings({ ...normalizeCapacitySettings(draft.capacitySettings), bucketRules: rules })
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Update', entity: 'CapacitySettings', entityId: 'bucket-rules', detail: detail.slice(0, 2000) })
      return draft
    })
  }

  // CAP-47: the insight thresholds, shared in Git and audited; undefined = the built-in values.
  function saveInsightThresholds(thresholds: InsightThresholds | undefined, detail: string) {
    store.update((draft) => {
      draft.capacitySettings = normalizeCapacitySettings({ ...normalizeCapacitySettings(draft.capacitySettings), insightThresholds: thresholds })
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Update', entity: 'CapacitySettings', entityId: 'insight-thresholds', detail: detail.slice(0, 2000) })
      return draft
    })
  }

  function saveCapacity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const next = normalizeCapacitySettings({ absenceEpicId: data.get('absenceEpicId'), hoursPerDay: data.get('hoursPerDay'), overloadedAt: data.get('overloadedAt'), availableBelow: data.get('availableBelow'), npraHoursPerMonth: data.get('npraHoursPerMonth') })
    const now = new Date().toISOString()
    store.update((draft) => {
      // This form edits the numbers only: everything else (holidays and activities, default Time tracking started, period locks,
      // Standard Hours, Old Calculation groups, calculation profiles, locked figures) is kept (KB-41).
      draft.capacitySettings = normalizeCapacitySettings({ ...normalizeCapacitySettings(draft.capacitySettings), absenceEpicId: next.absenceEpicId, hoursPerDay: next.hoursPerDay, overloadedAt: next.overloadedAt, availableBelow: next.availableBelow, npraHoursPerMonth: next.npraHoursPerMonth })
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

  // One Settings page at a time (chosen in the menu, SET-14); the shared pages only for roles that manage shared settings.
  // SET-15: My settings for everyone; an older page key opens the page it moved to.
  const asked = resolveSettings(requested).tab
  const tab = asked === 'my' || asked === 'look' || settingsPagesFor(can).some((page) => page.key === asked) ? asked : 'connections'
  // ADM-01: the Overview's shared-setup checks.
  const ioccBulk = useBulkEpic('IOCC').epicId, dpBulk = useBulkEpic('DP').epicId
  const facts = { policy: Boolean(access.policy), toolOwner: toolOwnerExists(access.policy), epicSetups: epicSetup.file?.epics.filter((entry) => entry.fields.length).length ?? 0, sharedFeatureSetups: featureSetup.shared?.epics.length ?? 0, ioccBulkEpic: Boolean(ioccBulk), unsaved: git.dirty, gitConnected: git.connected, gitReadOnly: git.readOnly,
    ...setupGaps(featureSetup.shared, [{ stream: 'DP', epicId: dpBulk }, { stream: 'IOCC', epicId: ioccBulk }]) }
  // ADM-04: History, filtered by area and text.
  const [auditFilter, setAuditFilter] = useState({ entity: '', text: '' })
  const auditEntities = [...new Set(store.state.audits.map((item) => item.entity))].sort()
  const auditShown = store.state.audits.filter((item) => (!auditFilter.entity || item.entity === auditFilter.entity) && (!auditFilter.text.trim() || `${item.entity} ${item.detail} ${item.action}`.toLowerCase().includes(auditFilter.text.trim().toLowerCase())))
  return <Page>
    {tab === 'home' && <AdminOverview steps={setupSteps} facts={facts} git={git} audits={store.state.audits} onOpenTab={onOpenTab} onSearch={onSearch} />}
    {tab === 'my' && <SectionTabs page="my" sections={[
      { key: 'email', label: 'Your work email', scope: 'you', node: <AzureConnections section="email" azure={azure} store={store} git={git} onOpenBoard={onOpenBoard} canManage={can('streams.options')} /> },
      { key: 'servers', label: 'Servers and PATs', scope: 'you', node: <AzureConnections section="servers" azure={azure} store={store} git={git} onOpenBoard={onOpenBoard} canManage={can('streams.options')} canManageStreams={access.canManageStreams} /> },
      { key: 'myviews', label: 'My views', scope: 'you', node: <MyViewsPanel azure={azure} /> },
      { key: 'patterns', label: 'My naming patterns', scope: 'you', node: <NamingPatternsPanel store={store} canManage mode="mine" /> },
      { key: 'usage', label: 'My page usage', scope: 'you', node: <UsagePanel /> },
    ]} />}
    {tab === 'connections' && <SectionTabs page="connections" sections={[
      { key: 'mapping', label: 'Stream mapping', scope: 'tool-owner', node: <AzureConnections section="mapping" azure={azure} store={store} git={git} onOpenBoard={onOpenBoard} canManage={can('streams.options')} canEnterCounts={can('release.counts')} canManageStreams={access.canManageStreams} /> },
    ]} />}
    {tab === 'options' && <SectionTabs page="options" sections={[
      { key: 'epics', label: 'Epics to match Features in', scope: 'everyone', node: <AzureConnections section="epics" azure={azure} store={store} git={git} onOpenBoard={onOpenBoard} canManage={can('streams.options')} /> },
      { key: 'bulk', label: 'Bulk creation Epics', scope: 'both', node: <AzureConnections section="bulk" azure={azure} store={store} git={git} onOpenBoard={onOpenBoard} canManage={can('streams.options')} /> },
      { key: 'counts', label: 'Release counts', scope: 'everyone', node: <AzureConnections section="counts" azure={azure} store={store} git={git} onOpenBoard={onOpenBoard} canManage={can('streams.options')} canEnterCounts={can('release.counts')} /> },
    ]} />}
    {tab === 'storage' && <SectionTabs page="storage" sections={[
      { key: 'git', label: 'Git storage', scope: 'computer', node: <GitStoragePanel git={git} /> },
      ...(git.connected ? [{ key: 'load', label: 'Load from Git', scope: 'computer' as const, node: <Panel className="connection-panel" eyebrow="GIT" title="Load everything from Git" info="Loads everything shared through Git at once: planning data, the connection setup, on-prem view data, Windchill exports, access roles and the Feature setup. Data here is replaced only by newer data from Git; connections you changed here are kept."
        action={<button type="button" className="primary" disabled={everything.busy || git.isSample} onClick={() => { setEverything({ busy: true }); void loadEverything().then((result) => setEverything({ busy: false, ...result })) }}>{everything.busy ? 'Loading…' : 'Load everything from Git'}</button>}>
        {git.isSample && <Notice tone="warning">Synthetic sample data is loaded: loading from Git is disabled.</Notice>}
        {everything.loaded && <Notice tone={everything.failed?.length ? 'warning' : 'success'}>Loaded: {everything.loaded.join('; ') || 'nothing'}.{everything.failed?.length ? ` Not loaded — ${everything.failed.join(' · ')}` : ''}</Notice>}
      </Panel> }] : []),
      ...(can('storage.shared') ? [{ key: 'shared', label: 'Shared setup in Git', scope: 'tool-owner' as const, node: <AzureViewsGitPanel git={git} azure={azure} /> }] : []),
      { key: 'views', label: 'Other views', scope: 'both', node: <AzureConnections section="views" azure={azure} store={store} git={git} onOpenBoard={onOpenBoard} canManage={can('streams.options')} /> },
      ...((store.state.azureSources ?? []).length ? [{ key: 'sources', label: 'Read-only sources', scope: 'computer' as const, node: <AzureConnections section="sources" azure={azure} store={store} git={git} onOpenBoard={onOpenBoard} canManage={can('streams.options')} /> }] : []),
      { key: 'sample', label: 'Synthetic sample', scope: 'computer', node: <AzureConnections section="sample" azure={azure} store={store} git={git} onOpenBoard={onOpenBoard} canManage={can('streams.options')} /> },
    ]} />}
    {tab === 'look' && <SectionTabs page="look" sections={[
      { key: 'layout', label: 'Page layout', scope: 'you', node: <PageLayoutPanel /> },
      { key: 'theme', label: 'Theme and zoom', scope: 'you', node: <ThemePanel desktop={Boolean(window.desktopZoom)} /> },
      ...(look ? [{ key: 'start', label: 'Start view and menu', scope: 'you' as const, node: <StartViewPanel startView={look.startView} onStartView={look.onStartView} onCustomizeMenu={look.onCustomizeMenu} /> }] : []),
      ...(can('layout.defaults') ? [{ key: 'tables', label: 'Table and chart defaults', scope: 'everyone' as const, node: <TableDefaultsPanel store={store} git={git} canEdit={can('layout.defaults')} /> }] : []),
    ]} />}
    {tab === 'pack' && <SectionTabs page="pack" sections={[
      ...(can('pack.setup') ? [{ key: 'pack', label: 'Monthly pack', scope: 'everyone' as const, node: <MonthlyPackSetupPanel pack={monthlyPack} git={git} items={azure.items} /> }] : []),
    ]} />}
    {!peopleShared && tab === 'resources' && <Notice tone="info">People and capacity roles are edited by roles allowed “Edit people” or “Capacity roles” (Role rights).</Notice>}
    {tab === 'capacity' && <SectionTabs page="capacity" sections={[
      { key: 'capacity', label: 'Capacity and absence', node: <Panel eyebrow="CAPACITY" title="Capacity and absence" info="Used by the Dashboard to compute available hours and utilization. Saved with the planning data in Git (with the holidays and common activities), so everyone who loads from Git gets the same settings.">
        {/* CAP-34 (moved here from People, CAP-61): who counts in the month's capacity, and the regional holidays. */}
        {resources.length > 0 && <Notice tone="info"><strong>Capacity in {monthName(month)}: {counted.length} {counted.length === 1 ? 'person' : 'people'}, {formatHours(sumOf((person) => person.available))}h available</strong> = {formatHours(sumOf((person) => person.funded))}h contractual − {formatHours(sumOf((person) => person.absence))}h absence (PTO, sick, unplanned leave, public holidays, other absence). Actual utilization = Total actual (project work, training, other NPRA, common activities) ÷ Available hours. <Info label="Who counts">Counted: everyone with a {monthName(month)} Time Writing Task (absence included), employed that month (Time tracking started / Left on), not removed. Per person: working days employed × {capacity.hoursPerDay}h (contractual), less absence and the public holidays of their region; never below 0. The team total is the sum.<br />{counted.map((person) => `${person.name} ${formatHours(person.available)}h`).join(' · ') || 'Nobody yet.'}{monthModel.people.some((person) => person.name === 'Unassigned') ? ' · Tasks without an assignee (Unassigned) are not in this total.' : ''}</Info></Notice>}
        {resources.length > 0 && <Notice tone={unmapped.length ? 'warning' : 'info'}>
          {holidays.length ? `Regional holidays in ${monthName(month)}: ${holidays.map((item) => `${item.region} ${formatHours(item.hours)}h → ${item.people} ${item.people === 1 ? 'person' : 'people'}`).join(' · ')}.` : `No regional holidays in ${monthName(month)}. Add a Feature such as "Public Holidays - India" under absence Epic #${capacity.absenceEpicId} with a "… - Time Writing" story and "<Month YYYY> | <Holiday>" Tasks.`}
          {unmapped.length > 0 && ` No region yet for ${unmapped.join(', ')}; regional holidays are not applied to them.`}
        </Notice>}
        <SettingsSummary rows={[['Team Holidays and Training Epic', `#${capacity.absenceEpicId}`], ['Funded hours per day', `${capacity.hoursPerDay}h`], ['Overloaded above', `${capacity.overloadedAt}%`], ['Has capacity below', `${capacity.availableBelow}%`], ['NPRA maximum', `${capacity.npraHoursPerMonth}h per person per month`]]} />
        <div className="button-row"><button type="button" className="ghost" onClick={() => setCapacityOpen(true)}>Edit capacity settings…</button></div>
        {capacityOpen && <Modal title="Capacity and absence" eyebrow="SETTINGS · CAPACITY" form onClose={() => setCapacityOpen(false)}><form onSubmit={(event) => { saveCapacity(event); setCapacityOpen(false) }}>
          <div className="form-row"><label>Team Holidays and Training Epic ID<input name="absenceEpicId" type="number" min="1" step="1" required defaultValue={capacity.absenceEpicId} /><small>Leave under this Epic counts as absence (Feature and Task titles decide PTO, Sick Leave or Unplanned Leave); a Task, Story or Feature titled with "Training" counts as NPRA instead.</small></label><label>Funded hours per day<input name="hoursPerDay" type="number" min="0.25" step="0.25" required defaultValue={capacity.hoursPerDay} /></label></div>
          <div className="form-row"><label>Overloaded above (%)<input name="overloadedAt" type="number" min="1" step="1" required defaultValue={capacity.overloadedAt} /></label><label>Has capacity below (%)<input name="availableBelow" type="number" min="0" step="1" required defaultValue={capacity.availableBelow} /></label></div>
          <div className="form-row"><label>NPRA maximum per person per month (h)<input name="npraHoursPerMonth" type="number" min="0" step="0.5" required defaultValue={capacity.npraHoursPerMonth} /><small>Non-project related activities (internal meetings, trainings): Tasks tagged “NPRA”. Only the NPRA hours booked come off the available hours; they are tracked against this maximum and hours over it are flagged. 0 tracks without a maximum.</small></label></div>
          <div className="modal-actions"><button type="button" className="ghost" onClick={() => setCapacityOpen(false)}>Cancel</button><button className="primary">Save capacity settings</button></div>
        </form></Modal>}
        {capacityMessage && <Notice tone="success">{capacityMessage}</Notice>}
      </Panel> },
      { key: 'profiles', label: 'Calculation profiles', node: <><div className="shared-time-panel"><GitSyncBar git={git} /></div><CalculationProfilesPanel settings={capacity} canEdit={can('capacity.settings')} onSave={saveProfiles} onSaveTerms={saveProfileTerms} /></> },
      { key: 'rules', label: 'Bucket rules', node: <><div className="shared-time-panel"><GitSyncBar git={git} /></div><BucketRulesPanel settings={capacity} items={azure.items} month={month} canEdit={can('capacity.rules')} onSave={saveBucketRules} /></> },
      { key: 'insights', label: 'Insight thresholds', node: <><div className="shared-time-panel"><GitSyncBar git={git} /></div><InsightThresholdsPanel settings={capacity} canEdit={can('capacity.rules')} onSave={saveInsightThresholds} /></> },
      { key: 'time', label: 'Holidays and common activities', node: <><div className="shared-time-panel"><GitSyncBar git={git} /></div>
      <SharedTimePanel settings={capacity} items={azure.items} month={month} onSave={saveSharedTime} /></> },
      { key: 'period', label: 'Period control', node: <Panel eyebrow="PERIOD CONTROL" title={`Locks of ${monthName(month)}`} info={<ul><li>Every month has its own last days to update: the plan of the month and its actuals. The day itself is still open; the month locks from the next day (the day ends at midnight UTC, the same moment for everyone).</li><li>Without a date of its own, a month uses the default days below — e.g. the November plan can be updated until 5 November (locked from 6 November), November actuals until 4 December (locked from 5 December).</li><li>Lock now locks a month before its date; to reopen a locked month, set a later last day. Saved with the planning data in Git, so everyone sees the same locks.</li></ul>}>
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
      { key: 'history', label: 'Historical hours', node: <HistoryPanel history={history} git={git} items={azure.items} profileNames={Object.keys(capacityContext(store.state).profiles ?? {})} editable={git.connected && !git.readOnly && !git.isSample} importedBy={access.email} /> },
    ].filter((section) => can(capacityNeeds[section.key])).map((section) => ({ ...section, scope: 'everyone' as const }))} />}
    {tab === 'resources' && !peopleShared && <AccessPanel access={access} git={git} people={people} membersInPeople />}
    {tab === 'resources' && peopleShared && <SectionTabs page="resources" sections={[
      { key: 'people', label: 'People', node: <PeoplePanel entries={peopleEntries} names={names} outside={outside} defaultRole={access.policy?.defaultRole ?? null} defaultJoinedOn={capacity.defaultJoinedOn} accessReason={accessReason} accessOnly={accessOnly} git={git}
        teamError={team?.error} readTeam={{ disabled: azure.isSample || !azure.config || !azure.pat, onClick: () => setTeamRead((count) => count + 1) }}
        source={<>
          <p>Names and work emails come from Azure DevOps: the members of the team <strong>{azure.config?.team || '(Time Writing connection)'}</strong> and everyone Assigned To a work item. To add someone, add them to the Azure DevOps team (or assign them a work item), then refresh.</p>
          <p className="people-team-status">{azure.isSample ? 'Sample data: the Azure DevOps team is not read; the people Assigned To in the sample are listed.'
            : !azure.config || !azure.pat ? 'Set up the Time Writing connection (Admin → Streams) to read the team; until then the people Assigned To in the fetched work are listed.'
            : team?.error ? `The team was not read: ${team.error}. The PAT needs Project and Team (Read); the people Assigned To in the fetched work are listed.`
            : team ? `${team.members.length} team member${team.members.length === 1 ? '' : 's'} read from ${azure.config.team}.` : 'Reading the team from Azure DevOps…'}</p>
        </>}
        saves={{ profiles: savePeopleProfiles, roles: saveRoles, defaultJoined: setDefaultJoined }} /> },
      // CAP-62: the reporting lines on their own tab.
      { key: 'tree', label: 'Team tree', node: <Panel className="admin-section" eyebrow="PEOPLE & ACCESS" title="Team tree" info="Who reports to whom, from Reports to in People. People without a manager, and managers typed in by name who are not in the list (marked “not on the board”), are at the top.">
        {resources.some((person) => profiles[person.name]?.reportsTo) ? <TeamTree names={names} profiles={profiles} /> : <EmptyState title="No reporting lines yet." detail="Open a person in People, choose Edit and set Reports to." />}
      </Panel> },
      { key: 'capacity-roles', label: 'Capacity roles', node: <><div className="shared-time-panel"><GitSyncBar git={git} /></div><CapacityRolesPanel settings={capacity} canEdit={can('people.capacityRoles')} onSave={saveCapacityRoles} /></> },
      { key: 'rights', label: 'Role rights', node: <AccessPanel access={access} git={git} people={people} membersInPeople /> },
    ].filter((section) => section.key === 'people' || section.key === 'tree' ? can('people.edit') : section.key === 'capacity-roles' ? can('people.capacityRoles') : true).map((section) => ({ ...section, scope: 'everyone' as const }))} />}
    {tab === 'audit' && <div className="scope-line"><ScopeChip scope="everyone" /></div>}
    {tab === 'epics' && <SectionTabs page="epics" sections={[
      { key: 'setup', label: 'Setup per Epic', scope: 'both', node: <EpicFeatureEditor setup={featureSetup} epicSetup={epicSetup} git={git} items={azure.items} qeColumnNames={qeColumnNames} /> },
      { key: 'lists', label: 'Value lists', scope: 'everyone', node: <EpicSetupPanel section="lists" setup={epicSetup} git={git} items={azure.items} canEdit={can('setup.epic')} canEditLists={can('setup.values')} /> },
      { key: 'templates', label: 'User Story templates', scope: 'everyone', node: <StoryTemplatesPanel setup={epicSetup} featureSetup={featureSetup} git={git} items={azure.items} canEdit={can('setup.values')} /> },
    ]} />}
    {tab === 'audit' && <Panel eyebrow="HISTORY" title="Changes" info="The changes made to the shared planning data, newest first, with who and what. Filter by area or text.">
      <div className="query-toolbar"><select aria-label="Area" value={auditFilter.entity} onChange={(event) => setAuditFilter({ ...auditFilter, entity: event.target.value })}><option value="">All areas</option>{auditEntities.map((entity) => <option key={entity}>{entity}</option>)}</select><input className="search" aria-label="Search changes" placeholder="Search changes" value={auditFilter.text} onChange={(event) => setAuditFilter({ ...auditFilter, text: event.target.value })} /><small className="muted">{auditShown.length} of {store.state.audits.length}</small></div>
      {auditShown.slice(0, 200).map((item) => <div className="audit-row" key={item.id}><span>{item.action}</span><div><strong>{item.entity}</strong><small>{item.detail}</small></div><time>{formatDateTime(item.timestamp)}</time></div>)}
      {!store.state.audits.length && <EmptyState title="No changes recorded yet." detail="Changes made in the app will appear here." />}
      {/* OI-09: confirmed first and recorded in History. */}
      {<button className="danger-button" onClick={() => { if (window.confirm('Reset the planning data in this browser to the synthetic MVP data? Your periods, capacity, resources, baselines and History here are replaced, and the fetched Azure DevOps data is cleared until the next fetch (connections and PATs are kept). If Git storage is connected, the change is only shared when someone saves it to Git.')) store.reset() }}>Reset synthetic MVP data</button>}
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
  return <div className="team-tree"><ul>{reports(undefined).map((name) => branch(name, new Set()))}</ul>{circular.length > 0 && <Notice tone="warning">Circular reporting line, not shown above: {circular.join(', ')}.</Notice>}</div>
}
