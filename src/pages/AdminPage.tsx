import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { subscribeJobs } from '../backgroundJobs'
import { loadJobRunning as anyLoadRunning } from '../loadEverythingJob'
import { dpQueryDateColumns } from '../dpQueryColumns'
import { EpicFeatureEditor } from '../components/EpicFeatureEditor'
import { AdminOverview } from '../components/AdminOverview'
import { setupGaps } from '../adminOverview'
import { UsagePanel } from '../components/UsagePanel'
import type { SetupStep } from '../setupGuide'
import { useBulkEpic } from '../useStreamEpics'
import { NamingPatternsPanel } from '../components/NamingPatternsPanel'
import { EpicSetupPanel } from '../components/EpicSetupPanel'
import { SharedListsPanel, type SharedListsEnv } from '../components/SharedListsPanel'
import { StoryTemplatesPanel } from '../components/StoryTemplatesPanel'
import { MyStoryTemplatesPanel } from '../components/MyStoryTemplatesPanel'
import type { EpicSetupStore } from '../useEpicSetup'
import { MyViewsPanel } from '../components/MyViewsPanel'
import { RoleStarterViewsPanel } from '../components/RoleStarterViews'
import { startersBlocked } from '../roleStarters'
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
import { chooseSetup } from '../featureSetup'
import { needsQePage } from '../qePage'
import { RetiredFilesPanel } from '../components/RetiredFiles'
import { AzureViewsGitPanel } from '../components/AzureViewsGit'
import { AzureConnections } from '../components/AzureConnections'
import { AccessPanel } from '../components/AccessPanel'
import { SharedTimePanel } from '../components/SharedTimePanel'
import { CalculationProfilesPanel } from '../components/CalculationProfilesPanel'
import { CapacityRolesPanel } from '../components/CapacityRolesPanel'
import { defaultPolicy, toolOwnerExists, type Action, type Role } from '../access'
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
import { sectionsFor, shownSettingsTab, type AdminTab, type SettingsTab } from '../settingsTabs'
import { SectionTabs, type Section } from '../components/SectionTabs'
import { MonthlyPackSetupPanel } from '../components/MonthlyPackSetupPanel'
import type { MonthlyPackStore } from '../useMonthlyPack'
import type { PageSetting } from '../pageSettings'

// SET-32: the sections of a page's ⚙ settings pop-up (the person may change each), its stream on a Release Details page.
export interface PageSettingsOnly { sections: PageSetting[]; stream?: string; onOpenAdmin: (tab: AdminTab, section: string) => void }

const shortMonthName = (month: string) => new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`))

// The Windchill host and views setup is hidden (Windchill exports are imported under Release Details instead).
// Everyone sets up their own connections and tokens here; the shared sections need the role right to manage them.
export function AdminPage({ store, month, azure, git, access, featureSetup, epicSetup, sharedLists, setupSteps = [], onSearch = () => undefined, monthlyPack, history, loadEverything, onOpenBoard, tab: requested, onOpenTab, look, piReview, pagesMenu, listsOwner = false, only }: PageProps & { only?: PageSettingsOnly; piReview?: ReactNode; pagesMenu?: ReactNode; listsOwner?: boolean; look?: { startView: StartView; onStartView: (view: StartView) => void; onCustomizeMenu: () => void }; tab: SettingsTab; onOpenTab: (tab: SettingsTab, section?: string) => void; azure: AzureWorkspace; git: GitStorage; access: Access; featureSetup: FeatureSetup; epicSetup: EpicSetupStore; sharedLists?: SharedListsEnv; setupSteps?: SetupStep[]; onSearch?: () => void; monthlyPack: MonthlyPackStore; history: HistoryStore; loadEverything: () => Promise<{ loaded: string[]; failed: string[] }> | null; onOpenBoard: () => void }) {
  const [everything, setEverything] = useState<{ busy: boolean; loaded?: string[]; failed?: string[] }>({ busy: false })
  // GIT-33, GIT-34: Load everything runs as the background job of the forced load (Jobs done); one at a time.
  const loadJobRunning = useSyncExternalStore(subscribeJobs, anyLoadRunning)
  // CON-94: each shared section needs its own permission.
  const can = access.can
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
    // CON-131: access.save checks the Tool Owner rule (CON-93) and that the saver keeps “Manage access”.
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
  // The default Time tracking started (Admin → People & access → People) of everyone without their own; '' clears it.
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

  // One Admin page at a time (chosen in the menu, SET-14, SET-26); a page the viewer may not see opens the Overview.
  // SET-15: My settings for everyone; an older page key opens the page it moved to.
  const tab = shownSettingsTab(requested, can)
  // ADM-01: the Overview's shared-setup checks.
  const ioccBulk = useBulkEpic('IOCC').epicId, dpBulk = useBulkEpic('DP').epicId, contentBulk = useBulkEpic('Content').epicId
  const releaseEpic = (only?.stream === 'DP' ? dpBulk : only?.stream === 'IOCC' ? ioccBulk : only?.stream === 'Content' ? contentBulk : 0) || 0
  const facts = { policy: Boolean(access.policy), toolOwner: toolOwnerExists(access.policy), epicSetups: epicSetup.file?.epics.filter((entry) => entry.fields.length).length ?? 0, sharedFeatureSetups: featureSetup.shared?.epics.length ?? 0, bulkEpicsUnset: ([['DP', dpBulk], ['IOCC', ioccBulk], ['Content', contentBulk]] as const).filter(([, epicId]) => !epicId).map(([stream]) => stream), unsaved: git.dirty, gitConnected: git.connected, gitReadOnly: git.readOnly,
    ...setupGaps(featureSetup.shared, [{ stream: 'DP', epicId: dpBulk }, { stream: 'IOCC', epicId: ioccBulk }]) }
  // ADM-04: the Changes (formerly the page History), filtered by area and text.
  const [auditFilter, setAuditFilter] = useState({ entity: '', text: '' })
  const auditEntities = [...new Set(store.state.audits.map((item) => item.entity))].sort()
  const auditShown = store.state.audits.filter((item) => (!auditFilter.entity || item.entity === auditFilter.entity) && (!auditFilter.text.trim() || `${item.entity} ${item.detail} ${item.action}`.toLowerCase().includes(auditFilter.text.trim().toLowerCase())))
  // SET-26, SET-27: the sections of an Admin page in the order of adminSections, only those the viewer may see.
  // LST-12: a co-owner of an On-Demand page creates and refreshes the built-in lists, so Lists is shown to them too.
  const sees = (action: Action) => can(action) || (action === 'lists.manage' && listsOwner)
  const sections = (page: AdminTab, nodes: Record<string, ReactNode>): Section[] => sectionsFor(page, sees).map((section) => ({ key: section.key, label: section.label, scope: section.scope, node: nodes[section.key] }))
  const connection = (part: 'mapping' | 'counts' | 'bulk' | 'views' | 'sample' | 'mybulk', extra: Partial<Parameters<typeof AzureConnections>[0]> = {}) => <AzureConnections section={part} azure={azure} store={store} git={git} onOpenBoard={onOpenBoard} canManage={can('streams.options')} canEnterCounts={can('release.counts')} canManageStreams={access.canManageStreams} {...extra} />
  const gitBar = <div className="shared-time-panel"><GitSyncBar git={git} /></div>
  // SET-32…SET-36: the panels of each Admin page by section — shown here, or in a page's ⚙ settings pop-up (`only`).
  const nodes = {
    connections: {
      // SET-29: Stream mapping, with the Epics to match Features in on each stream's row.
      // SET-34: in a Release Details page's settings, the row of its stream only and its Release counts.
      mapping: connection('mapping', only?.stream ? { stream: only.stream } : {}),
      counts: connection('counts', only?.stream ? { stream: only.stream } : {}),
      bulk: connection('bulk'),
    } as Record<string, ReactNode>,
    storage: {
      // GIT-37: Load everything from Git is part of the Git storage section (the separate Load from Git section is gone).
      git: <><GitStoragePanel git={git} />{git.connected && <Panel className="connection-panel load-everything-panel" eyebrow="GIT" title="Load everything from Git" info="Loads everything shared through Git at once: planning data, the connection setup, on-prem view data, Windchill exports, access roles and the Feature setup. Data here is replaced only by newer data from Git; connections you changed here are kept."
        action={<button type="button" className="primary" disabled={loadJobRunning || git.isSample} onClick={() => { const done = loadEverything(); if (!done) return; setEverything({ busy: true }); void done.then((result) => setEverything({ busy: false, ...result })) }}>{loadJobRunning ? 'Loading in the background…' : 'Load everything from Git'}</button>}>
        {git.isSample && <Notice tone="warning">Synthetic sample data is loaded: loading from Git is disabled.</Notice>}
        {loadJobRunning && <Notice tone="info" className="load-job-running">A load from Git is running in the background — follow it in Background jobs (top bar); you can go on working.</Notice>}
        {everything.loaded && <Notice tone={everything.failed?.length ? 'warning' : 'success'}>Loaded: {everything.loaded.join('; ') || 'nothing'}.{everything.failed?.length ? ` Not loaded — ${everything.failed.join(' · ')}` : ''}</Notice>}
      </Panel>}</>,
      // SET-29, AR-141: Other views, with each read-only view's work items by type in its row (no Read-only sources section).
      views: <>{connection('views', { canRemoveForEveryone: access.canManageStreams, canAssignOtherViews: can('storage.shared'), people: Object.keys(access.policy?.members ?? {}).sort(), viewingAs: Boolean(access.viewingAs) })}<RoleStarterViewsPanel git={git} azure={azure} admin={can('storage.shared')} viewingAs={Boolean(access.viewingAs)} /></>,
      // Connections in Git (formerly Shared setup in Git).
      shared: <><RetiredFilesPanel git={git} viewingAs={Boolean(access.viewingAs)} toolOwner={access.rights.roles.includes('Tool Owner')} staleQeEpics={([['DP', dpBulk], ['IOCC', ioccBulk]] as const).flatMap(([stream, id]) => id && needsQePage(chooseSetup(featureSetup.setups, id, true).setup) ? [`Epic #${id} (${stream})`] : [])} /><AzureViewsGitPanel git={git} azure={azure} /></>,
      // HIS-01: Historical hours (formerly Capacity & time).
      history: <HistoryPanel history={history} git={git} items={azure.items} profileNames={Object.keys(capacityContext(store.state).profiles ?? {})} editable={git.connected && !git.readOnly && !git.isSample} importedBy={access.email} />,
      // ADM-04: the Changes (formerly the page History).
      changes: <Panel eyebrow="CHANGES" title="Changes" info="The changes made to the shared planning data, newest first, with who and what. Filter by area or text.">
        <div className="query-toolbar"><select aria-label="Area" value={auditFilter.entity} onChange={(event) => setAuditFilter({ ...auditFilter, entity: event.target.value })}><option value="">All areas</option>{auditEntities.map((entity) => <option key={entity}>{entity}</option>)}</select><input className="search" aria-label="Search changes" placeholder="Search changes" value={auditFilter.text} onChange={(event) => setAuditFilter({ ...auditFilter, text: event.target.value })} /><small className="muted">{auditShown.length} of {store.state.audits.length}</small></div>
        {auditShown.slice(0, 200).map((item) => <div className="audit-row" key={item.id}><span>{item.action}</span><div><strong>{item.entity}</strong><small>{item.detail}</small></div><time>{formatDateTime(item.timestamp)}</time></div>)}
        {!store.state.audits.length && <EmptyState title="No changes recorded yet." detail="Changes made in the app will appear here." />}
      </Panel>,
      // Demo data: the synthetic sample, and Reset synthetic MVP data for the holders of storage.shared (as on History before).
      sample: connection('sample', can('storage.shared') ? { onResetDemo: () => store.reset() } : {}),
    } as Record<string, ReactNode>,
    pages: {
      // PGB-12: the menu groups, the added pages and the row locks (formerly the page Pages & menu).
      menu: pagesMenu,
      pack: <MonthlyPackSetupPanel pack={monthlyPack} git={git} items={azure.items} />,
      // UI-12: Table & chart defaults (formerly in Look & feel).
      tables: <TableDefaultsPanel store={store} git={git} canEdit={can('layout.defaults')} />,
    } as Record<string, ReactNode>,
    capacity: {
      capacity: <>{can('capacity.settings') && <Panel eyebrow="CAPACITY" title="Capacity and absence" info="Used by the Dashboard to compute available hours and utilization. Saved with the planning data in Git (with the holidays and common activities), so everyone who loads from Git gets the same settings.">
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
      </Panel>}
        {/* CAP-57: the Capacity roles (formerly People & roles → Capacity roles). */}
        {can('people.capacityRoles') && <>{gitBar}<CapacityRolesPanel settings={capacity} canEdit={can('people.capacityRoles')} onSave={saveCapacityRoles} /></>}</>,
      profiles: <>{gitBar}<CalculationProfilesPanel settings={capacity} canEdit={can('capacity.settings')} onSave={saveProfiles} onSaveTerms={saveProfileTerms} /></>,
      // Hour classification: the Bucket rules (CAP-46) and the Holidays and common activities.
      classification: <>{gitBar}{can('capacity.rules') && <BucketRulesPanel settings={capacity} items={azure.items} month={month} canEdit={can('capacity.rules')} onSave={saveBucketRules} />}
        {can('capacity.time') && <SharedTimePanel settings={capacity} items={azure.items} month={month} onSave={saveSharedTime} />}</>,
      // Thresholds: the Insight thresholds (CAP-47); the Overloaded / Has capacity bands stay with the capacity settings.
      thresholds: <>{gitBar}<InsightThresholdsPanel settings={capacity} canEdit={can('capacity.rules')} onSave={saveInsightThresholds} /></>,
      // Month locks (formerly Period control, MON-21…MON-24).
      locks: <Panel eyebrow="MONTH LOCKS" title={`Locks of ${monthName(month)}`} info={<ul><li>Every month has its own last days to update: the plan of the month and its actuals. The day itself is still open; the month locks from the next day (the day ends at midnight UTC, the same moment for everyone).</li><li>Without a date of its own, a month uses the default days below — e.g. the November plan can be updated until 5 November (locked from 6 November), November actuals until 4 December (locked from 5 December).</li><li>Lock now locks a month before its date; to reopen a locked month, set a later last day. Saved with the planning data in Git, so everyone sees the same locks.</li></ul>}>
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
      </Panel>,
    } as Record<string, ReactNode>,
    resources: {
      people: <PeoplePanel entries={peopleEntries} names={names} outside={outside} defaultRole={access.policy?.defaultRole ?? null} defaultJoinedOn={capacity.defaultJoinedOn} accessReason={accessReason} accessOnly={accessOnly} git={git}
        teamError={team?.error} readTeam={{ disabled: azure.isSample || !azure.config || !azure.pat, onClick: () => setTeamRead((count) => count + 1) }}
        source={<>
          <p>Names and work emails come from Azure DevOps: the members of the team <strong>{azure.config?.team || '(Time Writing connection)'}</strong> and everyone Assigned To a work item. To add someone, add them to the Azure DevOps team (or assign them a work item), then refresh.</p>
          <p className="people-team-status">{azure.isSample ? 'Sample data: the Azure DevOps team is not read; the people Assigned To in the sample are listed.'
            : !azure.config || !azure.pat ? 'Set up the Time Writing connection (Admin → Streams) to read the team; until then the people Assigned To in the fetched work are listed.'
            : team?.error ? `The team was not read: ${team.error}. The PAT needs Project and Team (Read); the people Assigned To in the fetched work are listed.`
            : team ? `${team.members.length} team member${team.members.length === 1 ? '' : 's'} read from ${azure.config.team}.` : 'Reading the team from Azure DevOps…'}</p>
        </>}
        saves={{ profiles: savePeopleProfiles, roles: saveRoles, defaultJoined: setDefaultJoined }} />,
      // CAP-62: the reporting lines on their own tab.
      tree: <Panel className="admin-section" eyebrow="PEOPLE & ACCESS" title="Team tree" info="Who reports to whom, from Reports to in People. People without a manager, and managers typed in by name who are not in the list (marked “not on the board”), are at the top.">
        {resources.some((person) => profiles[person.name]?.reportsTo) ? <TeamTree names={names} profiles={profiles} /> : <EmptyState title="No reporting lines yet." detail="Open a person in People, choose Edit and set Reports to." />}
      </Panel>,
      // CON-134 (AR-011): Role rights with "Access for emails not in Azure DevOps".
      rights: <AccessPanel access={access} git={git} people={people} accessOnly={accessOnly} />,
    } as Record<string, ReactNode>,
    epics: {
      // SET-34: in a Release Details page's settings, the Release Classification of its stream — Setup per Epic opened on
      // the stream's bulk creation Epic (its Release Classification field and the rules, DPF-10, are under Fields & title).
      setup: <>{only?.stream && <Notice tone="info" className="page-settings-class">{releaseEpic ? <>The Release Classification of {only.stream} is the List field <strong>Release Classification</strong> of its bulk creation Epic #{releaseEpic} — its values and the rules that detect them from the release number are under <strong>Fields &amp; title</strong>.</> : <>No {only.stream} bulk creation Epic is mapped yet (Admin → Streams → Bulk creation): the Release Classification is set on that Epic. All Epics is shown.</>}</Notice>}
        <EpicFeatureEditor key={only?.stream ? `class:${releaseEpic}` : 'setup'} initialEpicId={only?.stream ? releaseEpic : 0} setup={featureSetup} epicSetup={epicSetup} git={git} items={azure.items} dateColumns={dpQueryDateColumns(store.state, azure.connectionProfiles).options} /></>,
      // LST-03…LST-07: Lists — the Value lists and, below them, the team lists from Azure DevOps (two files in Git) —
      // both usable as built-in lists of the On-Demand columns (LST-08).
      lists: <><EpicSetupPanel section="lists" setup={epicSetup} git={git} items={azure.items} canEdit={can('setup.epic')} canEditLists={can('setup.values')} />{sharedLists && <SharedListsPanel env={sharedLists} />}</>,
      templates: <><StoryTemplatesPanel setup={epicSetup} featureSetup={featureSetup} git={git} items={azure.items} canEdit={can('setup.values')} />{/* SET-33: My templates stay in Admin (personal). */}{!only && <MyStoryTemplatesPanel email={azure.creatorEmail} viewingAs={Boolean(access.viewingAs)} items={azure.items} epicFile={epicSetup.file} />}</>,
      // PIR-29, PIR-33: the PI Review form (formerly the page PI Review Setup).
      pireview: piReview,
    } as Record<string, ReactNode>,
  }
  // SET-32…SET-35: a page's ⚙ settings pop-up — only the sections asked (those the person may change), as tabs, each with
  // Open in Admin →; the same panels, saves and Git bar as on the Admin pages.
  if (only) return <SectionTabs page="home" remember={false} label="Settings" sections={only.sections.map((entry) => ({ key: `${entry.tab}:${entry.section}`, label: entry.label, scope: entry.scope,
    node: <><p className="page-settings-admin"><button type="button" className="text-button" onClick={() => only.onOpenAdmin(entry.tab, entry.section)}>Open in Admin →</button></p>{entry.tab === 'home' ? null : nodes[entry.tab][entry.section]}</> }))} />
  return <Page>
    {tab === 'home' && <AdminOverview steps={setupSteps} facts={facts} git={git} audits={store.state.audits} showChanges={can('storage.shared')} onOpenTab={(page, section) => page === 'connections' && section === 'bulk' && !can('streams.options') ? onOpenTab('my', 'bulk') : onOpenTab(page, section)} onSearch={onSearch} />}
    {tab === 'my' && <SectionTabs page="my" sections={[
      { key: 'email', label: 'Your work email', scope: 'you', node: <AzureConnections section="email" azure={azure} store={store} git={git} onOpenBoard={onOpenBoard} canManage={can('streams.options')} canManageStreams={access.canManageStreams} /> },
      { key: 'servers', label: 'Servers and PATs', scope: 'you', node: <AzureConnections section="servers" azure={azure} store={store} git={git} onOpenBoard={onOpenBoard} canManage={can('streams.options')} canManageStreams={access.canManageStreams} /> },
      { key: 'myviews', label: 'My views', scope: 'you', node: <MyViewsPanel azure={azure} startersBlocked={startersBlocked({ email: azure.creatorEmail, connected: git.connected, isSample: azure.isSample || git.isSample, viewingAs: Boolean(access.viewingAs) })} /> },
      // SET-29, AR-114: each person's own bulk creation Epics (formerly the column Mine of Stream options → Bulk creation Epics).
      { key: 'bulk', label: 'My bulk creation Epics', scope: 'you', node: connection('mybulk') },
      { key: 'patterns', label: 'My naming patterns', scope: 'you', node: <NamingPatternsPanel store={store} canManage mode="mine" /> },
      { key: 'usage', label: 'My page usage', scope: 'you', node: <UsagePanel /> },
    ]} />}
    {tab === 'connections' && <SectionTabs page="connections" sections={sections('connections', nodes.connections)} />}
    {tab === 'storage' && <SectionTabs page="storage" sections={sections('storage', nodes.storage)} />}
    {tab === 'look' && <SectionTabs page="look" sections={[
      { key: 'layout', label: 'Page layout', scope: 'you', node: <PageLayoutPanel /> },
      { key: 'theme', label: 'Theme and zoom', scope: 'you', node: <ThemePanel desktop={Boolean(window.desktopZoom)} /> },
      ...(look ? [{ key: 'start', label: 'Start view and menu', scope: 'you' as const, node: <StartViewPanel startView={look.startView} onStartView={look.onStartView} onCustomizeMenu={look.onCustomizeMenu} /> }] : []),
    ]} />}
    {tab === 'pages' && <SectionTabs page="pages" sections={sections('pages', nodes.pages)} />}
    {tab === 'resources' && !can('people.edit') && <Notice tone="info">People and the team tree are edited by roles allowed “Edit people” (Role rights).</Notice>}
    {tab === 'capacity' && <SectionTabs page="capacity" sections={sections('capacity', nodes.capacity)} />}
    {tab === 'resources' && <SectionTabs page="resources" sections={sections('resources', nodes.resources)} />}
    {tab === 'epics' && <SectionTabs page="epics" sections={sections('epics', nodes.epics)} />}
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
