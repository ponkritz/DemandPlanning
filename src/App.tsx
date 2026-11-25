import { ChartSizeEnvContext } from './useChartSize'
import { runInBackground } from './backgroundJobs'
import { BrandMark } from './components/BrandMark'
import { TableDefaultsContext } from './components/tableDesign'
import { ReleaseSettingsContext } from './useStreamEpics'
import { normalizeTableDefaults } from './tableDefaults'
import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore, lazy, Suspense } from 'react'
import { recordVisit } from './usageCounts'
import './App.css'
import './fresh.css'
import './exports.css'
import { useAppStore } from './store'
import { Notice } from './components/ui'
import { MenuCustomizer } from './components/PersonalLayout'
import { usePersonalViews } from './usePersonalViews'
import { ThemeToggle } from './components/Clock'
import { DataNotices, DataStatus } from './components/DataStatus'
import { JobsIndicator } from './components/JobsIndicator'
import { navKeyOf, pages, pageGroups, pageMeta, readCollapsedNav, type Page } from './pages/registry'
import { MyDashboardPage } from './pages/MyDashboardPage'
import { HomePage } from './pages/HomePage'
import { loadStartView, saveStartView, startPageOf, visibleTiles, type HomeLink, type HomeTile, type StartView } from './homeTiles'
import { lookLabel, mySettingsLabel, readSettingsTab, settingsPages, resolveSettings, saveSettingsSection, saveSettingsTab, settingsLabel, settingsPagesFor, shownSettingsTab, type SettingsTab } from './settingsTabs'
import { normalizeReleaseSourceSettings, streamPatterns } from './releaseSource'
import { viewSource } from './viewSources'
import { cleanDays, ownersReason as toolOwnersReason } from './toolValidations'
import { setToolMasterList } from './toolQueries'
import { ToolValidationsContext, useToolValidations, type SourceData, type ToolValidationsEnv } from './useToolValidations'
import { allStreams, dataSets, defaultMatchThreshold, defaultStreams, profileForDataSet, profileForStream, releaseMenuEntries, setToolDocumentsQuery, windchillStreamExports } from './streams'
import { CustomStreamsContext, useCustomStreams, useStreamsVersion } from './useCustomStreams'
import { connectionPresets } from './connectionPresets'
import { gitSyncedIds, markViewsSynced, removeDuplicateConnections } from './viewDefinitions'
import { listAzureConnectionProfiles } from './azureCredentials'
import { useAzureWorkspace, type FetchListener, type GitDataSource } from './useAzureWorkspace'
import { sharedThroughGit } from './gitSnapshots'
import { useGitStorage } from './useGitStorage'
import { changesForPage, pagesOfFile, type FilePages } from './gitWatch'
import { PageGitNotice } from './components/PageGitNotice'
import { useUnsavedEdits } from './pageEdits'
import { cached as cachedDashboard } from './useDashboardPage'
import { pageOfSource } from './dashboardPages'
import { useWindchill } from './useWindchill'
import { viewAsLabel, viewAsPeople, type ViewAs } from './viewAs'
import { ViewAsDialog } from './components/ViewAsDialog'
import { useHistory } from './useHistory'
import { withHistory } from './history'
import { CanContext, ReadOnlyContext } from './useCan'
import { ReviewEnvContext, type ReviewEnv } from './reviewEnv'
import { usePiFormSetup } from './usePiFormSetup'
import { formSetupBlock } from './piReviewSetup'
import { SettingsSearch } from './components/SettingsSearch'
import { EpicSetupContext, useEpicSetup } from './useEpicSetup'
import { OnPremContext } from './onPremValues'
import { myPatternsVersion, subscribeMyPatterns } from './myNamingPatterns'
import { useAccess } from './useAccess'
import { useFeatureSetup } from './useFeatureSetup'
import { useQeMapping } from './useQeMapping'
import { useOnDemand } from './useOnDemand'
import { useDataMode } from './useDataMode'
import { createPage, useMenuLayout } from './useMenuLayout'
import { addPageReason, builtInGroupOf, findGroup, gitReasonOf, isDashboard, isHidden, kindOf, menuGroups, pagesOfGroup, placementOf, type Viewer } from './menuLayout'
import { usePublishAuthorization, usePublishScheduler } from './publishRun'
import { AddPageDialog } from './components/PageDialogs'
import { OwnerPeopleContext, PageNamesContext } from './usePageNames'
import { knownPeople, teamPeopleOnce, type KnownPerson } from './ownerPeople'
import { duplicatePageNames, menuLabel, type MenuPageName } from './pageNames'
import { useMonthlyPack } from './useMonthlyPack'
import { previousMonth } from './pulseCheck'
import { accessChangedText, canManagePages, rightsChanges, rightsFor, type Area } from './access'
import { useMyWork } from './useMyWork'
import { setLockSettings } from './planningLock'
import { DesktopDownload } from './components/DesktopDownload'
import { exportStateJson } from './download'
import { BuildStatus } from './components/BuildStatus'
import { ZoomControl } from './components/ZoomControl'
import { applyPageLayout, loadPageLayout } from './pageLayout'
import { PersonPicker } from './components/PersonPicker'
import { ProfileMenu, type ProfileAction } from './components/ProfileMenu'
import { backlogViews, loadBacklogTab, otherMenuViews, saveBacklogTab, timeWritingView } from './backlogViews'
import { detectWorkEmail, fetchTeamMembers, mergeAzureWorkItems } from './azureDevOps'
import { formatDateTime } from './format'
import { utcMonthKey, utcToday } from './businessTime'
import { toolDatasets } from './dashboardSources'
import { HeaderSlot } from './headerSlot'
import { SetupGuide } from './components/SetupGuide'
import { GitSyncBar } from './components/GitStorage'
import { confirmReplace, defaultGitRepository, isRepositoryUnreadable, movedRepositoryTarget, normalizeSetupLinks, setCommitSaver, type SetupLinks } from './gitStorage'
import { guideKey, requiredOpen, setupSteps } from './setupGuide'
import { azureResources, capacityContext, setAccessRoles, setAzureEmails } from './capacity'
import { hasServerPat, loadServerPat, serverKey } from './azureCredentials'
import { ListCatalogContext, useSharedLists } from './useSharedLists'
import { listCatalog, listsBlock, listUsage, ownsAPage, removeListBlock, serverPatKey } from './sharedLists'
import { collectionUrl } from './azureClient'
import { valuesOf } from './onDemand'
import type { SharedListsEnv } from './components/SharedListsPanel'

// Pages load on demand (their own chunk), so the first download is the shell and the start page only; the
// Documentation page brings the bundled documents with it.
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const MyActivitiesPage = lazy(() => import('./pages/MyActivitiesPage').then((module) => ({ default: module.MyActivitiesPage })))
const PlanningOverviewPage = lazy(() => import('./pages/PlanningOverviewPage').then((module) => ({ default: module.PlanningOverviewPage })))
const CapacityActualPage = lazy(() => import('./pages/CapacityActualPage').then((module) => ({ default: module.CapacityActualPage })))
const BaselinesPage = lazy(() => import('./pages/BaselinesPage').then((module) => ({ default: module.BaselinesPage })))
const SnapshotsPage = lazy(() => import('./pages/SnapshotsPage').then((module) => ({ default: module.SnapshotsPage })))
const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })))
const DocsPage = lazy(() => import('./pages/DocsPage').then((module) => ({ default: module.DocsPage })))
const BoardPage = lazy(() => import('./pages/BoardPage').then((module) => ({ default: module.BoardPage })))
const BacklogHealthPage = lazy(() => import('./pages/BacklogHealthPage').then((module) => ({ default: module.BacklogHealthPage })))
const PulseCheckPage = lazy(() => import('./pages/PulseCheckPage').then((module) => ({ default: module.PulseCheckPage })))
const PiReviewPage = lazy(() => import('./pages/PiReviewPage').then((module) => ({ default: module.PiReviewPage })))
const MyPiReviewPage = lazy(() => import('./pages/MyPiReviewPage').then((module) => ({ default: module.MyPiReviewPage })))
const BritePage = lazy(() => import('./pages/BritePage').then((module) => ({ default: module.BritePage })))
const KpiTrackerPage = lazy(() => import('./pages/KpiTrackerPage').then((module) => ({ default: module.KpiTrackerPage })))
const QeMappingPage = lazy(() => import('./pages/QeMappingPage').then((module) => ({ default: module.QeMappingPage })))
const OnDemandPage = lazy(() => import('./pages/OnDemandPage').then((module) => ({ default: module.OnDemandPage })))
const CustomDashboardPage = lazy(() => import('./pages/CustomDashboardPage').then((module) => ({ default: module.CustomDashboardPage })))
const PiReviewSetupPage = lazy(() => import('./pages/PiReviewSetupPage').then((module) => ({ default: module.PiReviewSetupPage })))
const PagesMenuPage = lazy(() => import('./pages/PagesMenuPage').then((module) => ({ default: module.PagesMenuPage })))
const MyWorkPage = lazy(() => import('./pages/MyWorkPage').then((module) => ({ default: module.MyWorkPage })))
const WindchillPage = lazy(() => import('./components/WindchillViews').then((module) => ({ default: module.WindchillPage })))
const WindchillExportImport = lazy(() => import('./components/WindchillViews').then((module) => ({ default: module.WindchillExportImport })))
const SprintCheckPage = lazy(() => import('./pages/SprintCheckPage').then((module) => ({ default: module.SprintCheckPage })))
const menuMiniKey = 'demand-planning-menu-mini-v1'


export default function App() {
  const store = useAppStore()
  // The Task creation paths check the planning lock of Settings' periods (ad-hoc tag after the lock).
  // Month locks (MON-21): the lock dates kept with the capacity settings in Git apply on every page.
  setLockSettings(capacityContext(store.state))
  // TVL-19: which Tool Validations connection is the Signed documents query (the shared settings), for every lookup of
  // the stream's connections (streams.ts toolQueries) on this render.
  setToolDocumentsQuery(normalizeReleaseSourceSettings(store.state.releaseSourceSettings).toolValidations?.documentsQuery)
  const onFetched = useRef<FetchListener | undefined>(undefined)
  const gitData = useRef<GitDataSource | undefined>(undefined)
  const azure = useAzureWorkspace(store, onFetched, gitData)
  const git = useGitStorage(store, azure.isSample)
  // GIT-24: a connection still saved to a repository the team data has moved away from.
  const movedGit = movedRepositoryTarget(git.config)
  // On-prem views can load the data the desktop app saved to Git: on request, or when a fetch cannot run.
  gitData.current = {
    available: (id) => { const profile = azure.connectionProfiles.find((entry) => entry.id === id); return Boolean(git.connected && !azure.isSample && profile && sharedThroughGit(profile)) },
    load: async (id) => {
      const result = await git.pullSnapshot(id)
      if (!result) return null
      // Git's data was fetched with another query than this connection has (an older shared setup): not loaded.
      if (result.otherQuery) throw new Error(`the data in Git (fetched ${formatDateTime(result.fetchedAt)}) was fetched with another query than this connection has now, so it was not loaded. Fetch with the desktop app, and save the connection setup to Git so everyone fetches with the new query`)
      return result.applied ? `loaded the data saved to Git (fetched ${formatDateTime(result.fetchedAt)})` : `the data here is already the latest in Git (fetched ${formatDateTime(result.fetchedAt)})`
    },
  }
  const windchill = useWindchill(store, git)
  // Every fresh fetch of on-prem data (desktop app, or the browser where the server is reachable) is saved to Git
  // storage automatically, so everyone sees it.
  onFetched.current = (profile, source) => { if (git.connected && !git.readOnly && !azure.isSample && sharedThroughGit(profile)) void git.pushSnapshot(profile, source) }
  // At start with Git storage: the shared connection setup in Git is the default for every user (connections
  // changed here are kept); the Windchill exports saved to Git are loaded too, and in the web app the on-prem view data.
  const pulled = useRef(false)
  const [setupSynced, setSetupSynced] = useState(false)
  useEffect(() => {
    if (pulled.current || !store.ready || !git.connected || azure.isSample || git.status === 'loading') return
    pulled.current = true
    const web = !window.azureDevOps
    // The start-up fetch waits only for the connection setup (KB-38): the on-prem views' data is read from Git after it.
    void git.syncViews().catch(() => null)
      .finally(() => { azure.reloadConnectionProfiles(); setSetupSynced(true) })
      .then(() => web ? git.pullSnapshots() : undefined).catch(() => { /* shown when loading from Settings */ })
    void git.pullWindchill().then(() => windchill.reload()).catch(() => { /* shown when loading from Git on the import page */ })
  }, [store.ready, git, azure, windchill])
  // Duplicate connections (same server, project, role and query — e.g. one from the shared setup and one set up again)
  // are removed once the setup is in place: the copy with the shared ID stays, the other goes with its data here and,
  // with a Git token that can save, in Git too, so nothing is listed, fetched or matched twice.
  const deduped = useRef(false)
  useEffect(() => {
    if (deduped.current || !store.ready || (git.connected && !setupSynced)) return
    deduped.current = true
    // The copy kept: the one from the shared setup in Git, else from a preset, else the first saved.
    const removed = removeDuplicateConnections([...gitSyncedIds(), ...connectionPresets.flatMap((preset) => preset.id ? [preset.id] : [])])
    if (!removed.length) return
    const ids = removed.map((profile) => profile.id)
    store.update((draft) => { draft.azureSources = (draft.azureSources ?? []).filter((source) => !ids.includes(source.connectionId)); return draft })
    azure.reloadConnectionProfiles()
    if (git.connected && !git.readOnly && !azure.isSample) {
      const names = removed.map((profile) => profile.viewName || profile.reason).join(', ')
      void git.removeSnapshots(ids, `Remove duplicate connections: ${names}`).catch(() => undefined)
      void git.shareViews(listAzureConnectionProfiles(), `Remove duplicate connections: ${names}`, ids).then(() => markViewsSynced(listAzureConnectionProfiles())).catch(() => undefined)
    }
  }, [store, git, azure, setupSynced])
  // Every start (opening the app, Force Update, reload) fetches the cloud connections once, after the shared
  // connection setup from Git is in place — or after 10 seconds when Git is slow or does not answer (KB-38). The fetch
  // runs as a background job, so the top bar shows it, its result, or why the Time Writing connection was not fetched.
  const [gitWaitOver, setGitWaitOver] = useState(false)
  useEffect(() => { const timer = window.setTimeout(() => setGitWaitOver(true), 10000); return () => window.clearTimeout(timer) }, [])
  const autoFetched = useRef(false)
  // PGB-21: the members of the Time Writing connection's team (CAP-30), read once after the start fetch and kept for the
  // session; offered as page and group co-owners with everyone Assigned To fetched work. Refused: nobody, silently.
  const [teamPeople, setTeamPeople] = useState<KnownPerson[]>([])
  const readTeam = useRef(() => {})
  useEffect(() => { readTeam.current = () => {
    const config = azure.config, pat = azure.pat.trim()
    if (!config || !pat || azure.isSample || !config.organization || !config.project || !config.team) return
    void teamPeopleOnce(`${config.organization}/${config.project}/${config.team}`, () => fetchTeamMembers(config, pat)).then(setTeamPeople)
  } })
  useEffect(() => {
    if (autoFetched.current || !store.ready || azure.isSample || (git.connected && !setupSynced && !gitWaitOver)) return
    autoFetched.current = true
    // Nothing is shown when no connection is set up here (first start, sample data only).
    if (!azure.connectionProfiles.length) return
    runInBackground('startup:fetch', 'Fetch Azure DevOps at start', async (progress) => {
      progress('Fetching the Time Writing connection…')
      const result = await azure.fetchCloud()
      // PGB-21: then the Time Writing team's members, once per session, for the co-owner list (quietly; no job text).
      readTeam.current()
      const text = result.skipped || (result.targets ? `${result.ok} of ${result.targets} connection${result.targets === 1 ? '' : 's'} fetched and saved.${result.ok < result.targets ? ' See Admin → Streams for the one that failed.' : ''}` : 'Nothing to fetch.')
      return { text, failed: Boolean(result.skipped) || result.ok < result.targets }
    })
  }, [store.ready, azure, git.connected, setupSynced, gitWaitOver])
  // View as (CON-89…CON-92): an Admin sees the app as a person or a role, read-only, for this page load only.
  const [viewAs, setViewAs] = useState<ViewAs | null>(null)
  const [viewAsOpen, setViewAsOpen] = useState(false)
  const access = useAccess(git, azure, viewAs)
  // CAP-50: capacity counts people by their app access roles too; every render uses the loaded access.json.
  setAccessRoles(access.policy?.members)
  setAzureEmails(azure.items)
  const viewedPerson = access.viewingAs?.kind === 'person' ? access.viewingAs : undefined
  const my = useMyWork(azure, store, viewedPerson)
  // GIT-22: the app user named in every commit the app writes — the display name Azure DevOps gives for the work email
  // and the work email itself (none while viewing as someone else: nothing is saved then).
  const saverName = my.self.me.email ? my.self.me.name ?? '' : '', saverEmail = azure.isSample ? '' : azure.creatorEmail
  useEffect(() => { setCommitSaver(access.viewingAs ? {} : { name: saverName, email: saverEmail }) }, [access.viewingAs, saverName, saverEmail])
  // Admin → Data & sharing: everything shared through Git, loaded now (as at start, plus the planning data, roles and
  // Feature setup); each part reports separately so one failure does not hide the rest.
  async function loadEverything() {
    const loaded: string[] = [], failed: string[] = []
    const step = async (label: string, run: () => Promise<string>) => { try { loaded.push(await run()) } catch (failure) { failed.push(`${label}: ${failure instanceof Error ? failure.message : String(failure)}`) } }
    await step('Planning data', async () => { if (!confirmReplace(git.dirty, git.status === 'conflict')) return 'planning data skipped: your unsaved changes were kept'; await git.load(); return 'planning data (baselines, release scope, region / role mapping)' })
    await step('Connection setup', async () => { const result = await git.syncViews(); azure.reloadConnectionProfiles(); return result ? `connection setup (${result.added.length} added, ${result.updated.length} updated, ${result.removed.length} removed, ${result.kept.length} kept as changed here)` : 'no connection setup in Git' })
    await step('On-prem view data', async () => { const result = await git.pullSnapshots(); return `${result.files} on-prem view data file${result.files === 1 ? '' : 's'} (${result.applied.length} newer than here)` })
    await step('Windchill exports', async () => { const result = await git.pullWindchill(); await windchill.reload(); return `${result.files} Windchill export${result.files === 1 ? '' : 's'} (${result.applied.length} newer)` })
    await step('Access roles', async () => { await access.reload(); return 'access roles' })
    await step('Feature setup', async () => { await featureSetup.reload(); return 'Feature setup' })
    return { loaded, failed }
  }
  // MYD-06…MYD-09: each person's sections, menu and filters, in Git per person.
  const personalViews = usePersonalViews(git, viewedPerson?.email ?? azure.creatorEmail)
  // Historical hours (HIS-05): the report pages read the Azure DevOps items with the history merged in before its
  // cut-off month; every other page (and every write) keeps the Azure DevOps items only.
  const history = useHistory(git)
  const reportAzure = useMemo(() => history.file ? { ...azure, items: withHistory(azure.items, history.file).items } : azure, [azure, history.file])
  const [menuEditor, setMenuEditor] = useState(false)
  // ADM-03: Search settings, from Ctrl K / ⌘ K anywhere.
  const [searchOpen, setSearchOpen] = useState(false)
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true) } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [])
  const featureSetup = useFeatureSetup(git, azure.creatorEmail)
  const epicSetup = useEpicSetup(git)
  // PIR-19: the PI Review form setup (pi-review-form.json in Git), the built-in form without one.
  const piForm = usePiFormSetup(git)
  // LST-02, LST-08: the built-in lists (shared-lists.json in Git) and the Epic setup's Value lists, for the On-Demand columns.
  const sharedLists = useSharedLists(git)
  const listCatalogEntries = useMemo(() => listCatalog(sharedLists.file, epicSetup.file?.lists ?? []), [sharedLists.file, epicSetup.file])
  // EPS-06: the fetched on-prem data, for the drop-downs of Feature fields that name an on-prem field.
  // DSH-16: the Time Writing hours of the On-Demand Dashboards — Team overview's items (with the historical hours) and
  // capacity settings; viewing follows who may see Team overview ("Team insights").
  // (the access roles and Azure emails capacityContext reads are set from the policy and the items: renewed with them)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dashboardHoursSettings = useMemo(() => capacityContext({ capacitySettings: store.state.capacitySettings, resourceProfiles: store.state.resourceProfiles }), [store.state.capacitySettings, store.state.resourceProfiles, access.policy, reportAzure.items])
  const onPremSources = useMemo(() => [...(store.state.releaseSource ? [store.state.releaseSource] : []), ...(store.state.azureSources ?? [])], [store.state.releaseSource, store.state.azureSources])
  // QV-60: my own naming patterns changing redraws the figures.
  useSyncExternalStore(subscribeMyPatterns, myPatternsVersion)
  const qeMapping = useQeMapping(git)
  // STR-01…06: the custom streams from Git; a change redraws the menu, Home and every stream list.
  const customStreams = useCustomStreams(git)
  useStreamsVersion()
  // OND-01…10: the On-Demand pages (CoNQ, and those added), each in the menu by its name.
  // OND-63: Live | Sample per table page and person; the store gives the pages in Sample with their sample rows.
  const dataMode = useDataMode(personalViews)
  const onDemand = useOnDemand(git, dataMode.isSample, listCatalogEntries)
  const [onDemandId, setOnDemandId] = useState(() => { try { return localStorage.getItem('demand-planning-on-demand-page-v1') ?? '' } catch { return '' } })
  const onDemandPage = onDemand.pages.find((entry) => entry.id === onDemandId) ?? onDemand.pages[0]
  // PGB-02…PGB-11: the menu layout (menu-layout.json): custom groups, group settings, each added page's place, type and
  // co-owners; and the viewer as its rights see them (the work email, the role rights, the Tool Owner right, CON-106).
  const menu = useMenuLayout(git)
  const viewedEmail = access.viewingAs?.kind === 'person' ? (access.viewingAs.email ?? '').trim().toLowerCase() : access.viewingAs ? '' : access.email
  const viewer: Viewer = { email: viewedEmail, can: access.can, readOnly: access.readOnly, manager: canManagePages(access.policy, access.rights), viewingAs: Boolean(access.viewingAs) }
  const [addPageFor, setAddPageFor] = useState<string | null>(null)
  // TVL-01…TVL-12: the Tool Validations master list (tool-validations.json in Git), its sources and who may change it —
  // the Tool Owner and the list's co-owners, never while viewing as someone else, with the sample or without a token that
  // can write. The Tool Validations query's tools are appended whenever its data is fetched (TVL-04).
  const toolStream = defaultStreams.find((stream) => stream.rule === 'tool')!
  const toolProfile = profileForStream(toolStream, azure.connectionProfiles)
  const releaseSources = azure.connectionProfiles.filter((profile) => profile.role === 'release-source').length
  const toolData = toolProfile ? viewSource(store.state, toolProfile.id, toolProfile.role, toolProfile.query, releaseSources) : undefined
  const toolPatterns = useMemo(() => streamPatterns(store.state.releaseSourceSettings, toolStream.name), [store.state.releaseSourceSettings, toolStream.name])
  // TVL-29: the completion date chosen in Stream mapping (TVL-20) dates the tools of the Azure DevOps sources.
  const toolCompletionField = normalizeReleaseSourceSettings(store.state.releaseSourceSettings).toolValidations?.completionField
  const toolValidations = useToolValidations(git, { items: toolData?.items, fetchedAt: toolData?.fetchedAt, patterns: toolPatterns, completionField: toolCompletionField }, { viewer, blocked: access.viewingAs ? 'Viewing as someone else: read only, nothing is saved.' : gitReasonOf(git), by: my.self.me.name?.trim() || azure.creatorEmail.trim() })
  // TVL-36: Pulse Check, the Monthly pack and the cumulative chart count Tool Validations from this master list.
  setToolMasterList(toolValidations.shown.tools)
  const toolSources = useMemo((): SourceData => ({
    streamItems: toolData?.items, patterns: toolPatterns, completionField: toolCompletionField,
    azure: azure.connectionProfiles.filter((profile) => profile.role !== 'time-tracking' && profile.id !== toolProfile?.id).map((profile) => { const data = viewSource(store.state, profile.id, profile.role, profile.query, releaseSources); return { id: profile.id, name: profile.viewName || profile.reason, items: data?.items, fetchedAt: data?.fetchedAt } }),
    windchill: windchill.views.filter((view) => view.exportFile).map((view) => { const data = windchill.sources.find((entry) => entry.viewId === view.id); return { id: view.id, name: view.name, columns: data?.columns ?? view.columns, rows: data?.rows } }),
    pages: onDemand.pages.filter((entry) => kindOf(menu.layout, entry.id) !== 'dashboard' && !entry.sample).map((entry) => ({ id: entry.id, name: entry.name, columns: entry.columns.map((column) => ({ id: column.id, name: column.name })), rows: entry.rows })),
  }), [toolData?.items, toolPatterns, toolCompletionField, azure.connectionProfiles, toolProfile?.id, store.state, releaseSources, windchill.views, windchill.sources, onDemand.pages, menu.layout])
  const toolDaysKey = 'tool-validations:expiry-days'
  // TVL-18: the master list and the expiry list as data sources of the On-Demand Dashboards (the owners' dashboard tabs
  // and every other dashboard), for the roles that see Release Details.
  const toolsReadable = access.sees('release')
  const toolDatasetList = useMemo(() => toolDatasets({ file: toolValidations.shown, connected: toolValidations.connected, loaded: toolValidations.loaded }, toolsReadable, utcToday()), [toolValidations.shown, toolValidations.connected, toolValidations.loaded, toolsReadable])
  // OND-73, OND-78, OND-90: who an interactive HTML file is published by; the publish schedules of this computer run while the app
  // is open, each only while the person may still publish the page (the Tool Owner or its co-owners).
  const publisherName = my.self.me.name?.trim() || azure.creatorEmail.trim()
  const publisher = usePublishAuthorization({ git, store: onDemand, access, menu, viewingAs: Boolean(access.viewingAs) })
  usePublishScheduler({ store: onDemand, views: personalViews, publishedBy: publisherName, authorization: publisher })
  const toolEnv: ToolValidationsEnv = {
    store: toolValidations, ownersReason: toolValidations.reason || toolOwnersReason(viewer), who: publisherName,
    personalDays: personalViews.filter(toolDaysKey, cleanDays),
    setPersonalDays: (days) => days === undefined ? personalViews.clearFilter(toolDaysKey) : personalViews.setFilter(toolDaysKey, days),
    sources: toolSources, datasets: toolDatasetList,
    pages: {
      git, onDemand, menu, viewer, me: azure.isSample ? '' : azure.creatorEmail.trim().toLowerCase() || my.self.me.name?.trim() || '',
      views: personalViews, dataMode, publisherName, publisher,
      hours: { items: reportAzure.items, settings: dashboardHoursSettings, allowed: access.sees('insights') },
    },
  }
  // Who creates new work items (the email on the Time Writing connection) and whether they may assign them to others.
  const assign = { me: azure.creatorEmail.trim().toLowerCase(), canChoose: access.can('azure.createForOthers') }
  // NAV-42, NAV-46: the start page — Home (the tiles) in the tile view, My dashboard in the classic view.
  const [startView, setStartView] = useState<StartView>(() => loadStartView())
  // NAV-50: the page margins and border of My settings → Look & feel, applied once at start (and at once when changed there).
  useEffect(() => { applyPageLayout(loadPageLayout()) }, [])
  const [requested, setPage] = useState<Page>(() => startPageOf(loadStartView()))
  const switchView = (next: StartView) => { setStartView(saveStartView(next)); setPage(startPageOf(next)) }
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null)
  // The selected month starts on the current month in UTC (NAV-11, NAV-51), the same for every viewer.
  const [month, setMonth] = useState(() => utcMonthKey()!)
  // The Monthly pack is for the month before the header month (the month presented in the following month's call).
  const monthlyPack = useMonthlyPack(git, previousMonth(month))

  const sampleRequested = useRef(new URLSearchParams(window.location.search).get('sample') === '1')
  useEffect(() => {
    if (!store.ready || !sampleRequested.current) return
    sampleRequested.current = false
    if (!(store.state.azureWorkItems?.length)) azure.loadSampleData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.ready])
  // Azure DevOps views: connections marked "Show in menu", each in the sidebar and as a tab.
  const views = backlogViews(azure.connectionProfiles, azure.activeConnectionProfileId)
  const timeWriting = timeWritingView(azure.connectionProfiles, azure.activeConnectionProfileId)
  const [viewId, setViewId] = useState(loadBacklogTab)
  const view = views.find((entry) => entry.id === viewId) ?? views[0] ?? timeWriting
  const openView = (id: string) => { setViewId(id); saveBacklogTab(id); setPage('board') }
  // DOC-12: the profile menu's User guide opens the Documentation page on the user guide (a new mount picks the tab).
  const [docsVisit, setDocsVisit] = useState(0)
  const openUserGuide = () => { try { localStorage.setItem('demand-planning-docs-tab-v1', 'USER-GUIDE.md') } catch { /* the guide is the first tab anyway */ } setDocsVisit((visit) => visit + 1); setPage('docs') }
  const openOnDemand = (id: string) => { setOnDemandId(id); try { localStorage.setItem('demand-planning-on-demand-page-v1', id) } catch { /* this visit only */ } setPage('ondemand') }
  // Access roles: each menu entry belongs to an area; Settings is always there (each person's own connections and tokens).
  // A page the viewer's roles do not include falls back to the first one they do.
  const areaOf = (id: Page): Area | null => id === 'admin' || id === 'home' ? null : id === 'board' ? (view.onPrem ? 'release' : 'board') : id === 'windchill' || id === 'brite' ? 'release' : id === 'overview' || id === 'pulse' || id === 'pireview' || id === 'kpitracker' ? 'insights' : id === 'mydash' ? 'overview' : id === 'activities' ? 'monthly' : id === 'mypireview' ? 'mywork' : id === 'planover' || id === 'capactual' ? 'insights' : id
  // Testing (ACT-01): pages being tried out, for the Admin role only (an access policy must name it; View as follows the viewed rights).
  const testing = access.rights.roles.includes('Admin')
  const allowed = (id: Page) => { if (id === 'home' && startView === 'classic') return false; if (pageMeta(id).group === 'Testing' && !testing) return false; const area = areaOf(id); return area == null || access.sees(area) }
  const page = allowed(requested) ? requested : pages.find((entry) => allowed(entry.id))?.id ?? 'admin'
  // NAV-45: count the page opened, only when the person turned My page usage on (this browser only).
  useEffect(() => { recordVisit(page) }, [page])
  const meta = pageMeta(page)
  // Windchill exports, each in the sidebar under Release Details ('' = the import page).
  const windchillViews = windchill.views.filter((entry) => entry.exportFile && entry.showInMenu)
  const [windchillId, setWindchillId] = useState('')
  const windchillView = windchillViews.find((entry) => entry.id === windchillId)
  // "＋ ECP" / "＋ S&S IT" (not imported yet) open the import named after that stream, so the export lands on it (CON-85).
  const [windchillFor, setWindchillFor] = useState('')
  // QE Mapping (QEM-12): the QE Name of a new row is picked from the Resources list (Admin → People & roles → People): everyone with
  // Time Writing Tasks, and the people with a resource profile.
  const qeResources = useMemo(() => page !== 'qemapping' ? [] : (() => { const capacity = capacityContext(store.state); return [...new Set([...azureResources(azure.items, month, capacity).map((person) => person.name), ...Object.keys(capacity.profiles ?? {})])].filter(Boolean).sort((a, b) => a.localeCompare(b)) })(), [page, azure.items, month, store.state])
  const tableDesign = useMemo(() => normalizeTableDefaults(store.state.tableDefaults), [store.state.tableDefaults])
  const openWindchill = (id: string, stream = '') => { setWindchillId(id); setWindchillFor(id ? '' : stream); setPage('windchill') }
  // Views shown in the menu that are not the Time Writing backlog nor a default stream: listed under "Other views".
  const others = otherMenuViews(views, azure.connectionProfiles, windchillViews)
  const isOther = page === 'board' ? others.azure.some((entry) => entry.id === view.id) : page === 'windchill' && Boolean(windchillView) && others.windchill.some((entry) => entry.id === windchillView?.id)
  // Menu headings and sub-lists can be collapsed; which ones are closed is remembered in this browser.
  // Phones: the sidebar is an off-canvas menu opened from the top bar; it closes on a choice, on Escape or on the backdrop.
  const [navOpen, setNavOpen] = useState(false)
  // UI-16: the side menu folded to icons on wide screens (« / »), kept per computer.
  const [menuMini, setMenuMini] = useState(() => { try { return localStorage.getItem(menuMiniKey) === '1' } catch { return false } })
  const toggleMenuMini = () => setMenuMini((current) => { const next = !current; try { localStorage.setItem(menuMiniKey, next ? '1' : '0') } catch { /* this visit only */ } return next })
  useEffect(() => { setNavOpen(false) }, [page, viewId, windchillId, onDemandId])
  useEffect(() => { if (!navOpen) return; const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setNavOpen(false) }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [navOpen])
  // NAV-52, NAV-53: the Release Details sub-lists of earlier versions (release:ads, release:windchill) and the I&D Board
  // heading that held QMS-0025 and Backlog Health are gone; their stored keys are dropped.
  const [collapsed, setCollapsed] = useState<string[]>(() => { try { return readCollapsedNav(localStorage.getItem('demand-planning-nav-collapsed-v1')) } catch { return [] } })
  const saveCollapsed = (next: string[]) => { try { localStorage.setItem('demand-planning-nav-collapsed-v1', JSON.stringify(next)) } catch { /* this visit only */ } return next }
  const toggleNav = (key: string) => setCollapsed((now) => saveCollapsed(now.includes(key) ? now.filter((entry) => entry !== key) : [...now, key]))
  // Expand all / Collapse all (NAV-37): every heading at once.
  // PGB-04: the menu groups — the built-in ones, with the custom groups of the menu layout after On-Demand.
  const customGroups = menuGroups(menu.layout).filter((group) => !group.builtIn)
  const navGroups: string[] = pageGroups.flatMap((group): string[] => group === 'On-Demand' ? [group, ...customGroups.map((entry) => entry.name)] : [group])
  const groupIdOf = (name: string) => builtInGroupOf(name) || customGroups.find((entry) => entry.name === name)?.id || ''
  const groupNameOf = (id: string) => findGroup(menu.layout, id)?.name ?? 'On-Demand'
  const navKeys = navGroups.map(navKeyOf)
  const allCollapsed = navKeys.every((key) => collapsed.includes(key))
  const navButton = (key: string, icon: string, label: string, active: boolean, onClick: () => void) => <button key={key} title={menuMini ? label : undefined} className={active ? 'nav-active' : ''} aria-current={active ? 'page' : undefined} onClick={onClick}><span className="nav-icon">{icon}</span>{label}</button>
  // PGB-04: the added pages of a group that the viewer sees — the On-Demand area (all added pages share it, CON-103), in
  // Testing for the Admin role only — less the ones hidden in their own menu (MYD-08: "On-Demand" hides them all).
  const addedPages = (groupId: string) => !allowed('ondemand') || personalViews.menu.hidden.includes('ondemand') || (groupId === 'testing' && !testing) ? [] : pagesOfGroup(menu.layout, onDemand.pages, groupId).filter((entry) => !personalViews.menu.hidden.includes(`ondemand:${entry.id}`) && !isHidden(menu.layout, entry.id))
  // PGB-15…PGB-17: every page name in the menu, for the unique-name check of the page dialogs; an added page whose name
  // another page also has (two saves at the same time, or older files in Git) shows its group in the menu.
  const menuNames: MenuPageName[] = [
    ...pages.filter((item) => !item.hidden && item.id !== 'ondemand' && item.id !== 'admin' && item.id !== 'board').map((item) => ({ key: `page:${item.id}`, name: item.label, group: item.group === 'Home' ? 'Home' : item.group })),
    ...settingsPages.map((item) => ({ key: `admin:${item.key}`, name: item.label, group: 'Admin' })),
    ...allStreams().map((stream) => ({ key: `stream:${stream.name}`, name: stream.name, group: 'Release Details' })),
    ...onDemand.pages.map((entry) => ({ key: `ondemand:${entry.id}`, name: entry.name, group: groupNameOf(placementOf(menu.layout, entry.id).group) })),
  ]
  const duplicateNames = duplicatePageNames(menuNames)
  // PGB-18: the people co-owners are picked from — everyone Assigned To fetched work (CAP-51), with their work email,
  // the members of the Time Writing team read at start (PGB-21) and the people given app roles by work email.
  const ownerPeople = knownPeople(azure.items, [...(azure.isSample ? [] : teamPeople), ...Object.keys(access.policy?.members ?? {}).map((email) => ({ name: email, email }))])
  const addedLabel = (entry: { id: string; name: string }) => menuLabel({ key: `ondemand:${entry.id}`, name: entry.name, group: groupNameOf(placementOf(menu.layout, entry.id).group) }, duplicateNames)
  const addedButtons = (groupId: string) => addedPages(groupId).map((entry) => navButton(`ondemand:${entry.id}`, placementOf(menu.layout, entry.id).icon, addedLabel(entry), page === 'ondemand' && onDemandPage?.id === entry.id, () => openOnDemand(entry.id)))
  const addedLinks = (groupId: string): HomeLink[] => addedPages(groupId).map((entry) => ({ key: `ondemand:${entry.id}`, label: addedLabel(entry), icon: placementOf(menu.layout, entry.id).icon, open: () => openOnDemand(entry.id) }))
  const menuGitReason = gitReasonOf(git)
  // Settings pages (SET-14): one menu entry each; opening one on a given section (e.g. Stream mapping) shows that
  // section. The page is remounted so it picks up the section asked for.
  const [settingsAsked, setSettingsTab] = useState<SettingsTab>(readSettingsTab)
  // CON-94, PIR-29: a page the viewer may not see (PI Review Setup without its right) opens Streams, header included.
  const settingsTab = shownSettingsTab(settingsAsked, access.can)
  const [settingsVisit, setSettingsVisit] = useState(0)
  // SET-15: an older page or section opens where it lives now.
  const openSettings = (asked: SettingsTab, askedSection?: string) => { const { tab, section } = resolveSettings(asked, askedSection); if (section) saveSettingsSection(tab, section); saveSettingsTab(tab); setSettingsTab(tab); setSettingsVisit((visit) => visit + 1); setPage('admin') }
  // Azure DevOps connections: the Stream mapping section of Admin → Streams.
  const openConnection = () => openSettings('connections', 'mapping')
  // Get started: the setup steps with their live status; the pop-up opens by itself while a required step is open,
  // unless dismissed in this browser. The Setup button in the top bar reopens it.
  const steps = setupSteps({
    gitConnected: git.connected, gitReadOnly: git.readOnly,
    timeWriting: Boolean(azure.config), email: azure.creatorEmail.trim(), pat: Boolean(azure.pat.trim()),
    fetched: azure.items.length > 0 && !azure.isSample, sample: azure.isSample,
    region: my.me.name ? capacityContext(store.state).profiles?.[my.me.name]?.region : undefined, canManage: access.can('people.edit'),
    streams: defaultStreams.filter((stream) => stream.source === 'azure').map((stream) => { const profile = profileForStream(stream, azure.connectionProfiles); return { name: stream.name, connected: Boolean(profile && hasServerPat(serverKey(profile))) } }),
    // DP's data sets count too: without them the DP releases and dates are incomplete.
    fetchProblem: azure.fetchProblem?.kind,
    dataSets: dataSets.map((set) => { const profile = profileForDataSet(set.name, azure.connectionProfiles); return { name: set.name, connected: Boolean(profile && hasServerPat(serverKey(profile))) } }),
  })
  // NAV-40: where each token is created — the admin's links from Git, else the defaults (GitHub's and Azure DevOps' token pages).
  const linkDefaults: SetupLinks = { github: 'https://github.com/settings/personal-access-tokens/new', ...(azure.config?.organization ? { azure: `https://dev.azure.com/${encodeURIComponent(azure.config.organization)}/_usersSettings/tokens` } : {}) }
  const setupLinks: SetupLinks = { ...linkDefaults, ...normalizeSetupLinks(store.state.setupLinks) }
  const openSteps = requiredOpen(steps)
  const [guideOpen, setGuideOpen] = useState(false)
  const [guideAuto, setGuideAuto] = useState(() => { try { return localStorage.getItem(guideKey) !== 'dismissed' } catch { return true } })
  useEffect(() => { if (store.ready && guideAuto && openSteps > 0 && git.status !== 'loading') { setGuideOpen(true); setGuideAuto(false) } }, [store.ready, guideAuto, openSteps, git.status])
  // NAV-41: when the Time Writing data cannot be fetched (token missing, wrong or expired, no connection), Get started
  // opens with the reason — also after "Don't show again automatically" — once per failure.
  const problemAt = azure.fetchProblem?.at
  useEffect(() => { if (problemAt && !azure.isSample) setGuideOpen(true) }, [problemAt, azure.isSample])
  const dismissGuide = () => { try { localStorage.setItem(guideKey, 'dismissed') } catch { /* this visit only */ } setGuideOpen(false) }
  const pageProps = { store, month, setMonth }
  // PIR-13, PIR-17, PIR-18: what posting a PI review needs (PI Review, My PI Review, the Close pop-up).
  // CON-114, PIR-31: who may change the PI Review form setup, and why not.
  const piFormBlock = formSetupBlock({ viewingAs: access.viewingAs ? viewAsLabel(access.viewingAs) : '', readOnly: access.readOnly, can: access.can }, git, piForm)
  // CON-115, LST-12: who may change the built-in lists (the right, or a page co-owner) and the setup the panel needs.
  const listsViewer = { email: viewedEmail, viewingAs: access.viewingAs ? viewAsLabel(access.viewingAs) : '', readOnly: access.readOnly, can: access.can }
  const timeWritingServer = azure.config ? collectionUrl(azure.config) : ''
  const listsEnv: SharedListsEnv = {
    store: sharedLists, block: listsBlock(listsViewer, ownsAPage(menu.layout, viewedEmail), git, sharedLists), removeBlock: (usedBy) => removeListBlock(listsViewer, git, sharedLists, usedBy),
    by: my.self.me.name?.trim() || 'someone', // LST-04: a display name only, never the work email
    connection: azure.config ? { server: timeWritingServer, project: azure.config.project, team: azure.config.team } : null,
    patFor: (server) => serverPatKey(server) === serverPatKey(timeWritingServer) && azure.pat.trim() ? azure.pat.trim() : loadServerPat(serverPatKey(server)),
    usage: (ref) => listUsage(onDemand.pages, ref),
    rowsWith: (ref, names) => onDemand.pages.reduce((sum, page) => sum + page.rows.filter((row) => page.columns.some((column) => column.list === ref && valuesOf(row.cells[column.id]).some((value) => names.includes(value)))).length, 0),
  }
  const reviewEnv: ReviewEnv = { email: access.email, name: my.self.me.name ?? '', viewingAs: access.viewingAs ? viewAsLabel(access.viewingAs) : '', isSample: azure.isSample, config: azure.config, pat: azure.pat, items: azure.items, addAudit: store.addAudit, formSetup: piForm.setup, openFormSetup: () => openSettings('pireview') }
  const storageLabel = store.cache.status === 'error' ? '⚠ Not saved locally' : store.cache.status === 'saving' ? '◌ Saving locally' : '○ Local IndexedDB'
  const buildStatus = <BuildStatus pending={store.hasPendingSave} failed={store.ready && store.cache.status === 'error'} busy={azure.busy} preview={Boolean(azure.preview)} details={<p className="storage-line" title="Where app data is saved"><strong>Data saved:</strong> {storageLabel}</p>} onBackup={store.ready ? () => exportStateJson({ ...store.state, azureWorkItems: mergeAzureWorkItems(store.state.azureWorkItems ?? [], azure.preview?.items ?? []), ...(azure.preview ? { azureBacklogScope: azure.preview.scope } : {}) }) : undefined} />

  // NAV-43: the Home tiles — one per area, each with links to its pages; only what the viewer may open.
  const pageLink = (id: Page, note?: string): HomeLink[] => allowed(id) && !pageMeta(id).hidden ? [{ key: id, label: pageMeta(id).label, icon: pageMeta(id).icon, open: () => setPage(id), ...(note ? { note } : {}) }] : []
  const tileOf = (tile: Omit<HomeTile, 'open'> & { open?: () => void }): HomeTile | null => tile.open ? { ...tile, open: tile.open } : tile.links.length ? { ...tile, open: tile.links[0].open } : null
  const firstAllowed = (...ids: Page[]) => { const id = ids.find((entry) => allowed(entry)); return id ? () => setPage(id) : undefined }
  const streamLinks: HomeLink[] = access.sees('release') ? [
    // NAV-52: in the menu's order — the streams A–Z (not the "＋ … export" entries), then BRITE.
    ...releaseMenuEntries(windchillViews).flatMap((item): HomeLink[] => {
      if (item.kind === 'azure') { const profile = profileForStream(item.stream, azure.connectionProfiles), entry = profile && views.find((view) => view.id === profile.id); return [entry ? { key: `stream:${item.stream.name}`, label: item.label, icon: pageMeta('board').icon, open: () => openView(entry.id) } : { key: `stream:${item.stream.name}`, label: item.label, icon: '＋', note: 'not set up yet — opens Stream mapping', open: openConnection }] }
      if (item.kind === 'windchill') { const entry = item.view; return [{ key: `windchill:${entry?.id ?? item.stream.name}`, label: item.label, icon: entry ? pageMeta('windchill').icon : '＋', ...(entry ? {} : { note: 'not imported yet' }), open: () => entry ? openWindchill(entry.id) : openWindchill('', item.stream.name) }] }
      return []
    }),
    ...pageLink('brite'),
  ] : []
  const settingsLinks: HomeLink[] = settingsPagesFor(access.can).map((entry) => ({ key: `settings:${entry.key}`, label: entry.label, icon: pageMeta('admin').icon, open: () => openSettings(entry.key) }))
  const homeTiles = visibleTiles([
    // NAV-53: My Work ends with the Time Writing backlog (QMS-0025), as in the menu.
    tileOf({ key: 'mywork', title: 'My Work', detail: `Time Writing, your tasks, the Sprint check, your PI reviews and the ${timeWriting.name} backlog.`, tone: 'sky', open: firstAllowed('activities', 'mywork'), links: [...pageLink('activities'), ...pageLink('mywork'), ...pageLink('bulk'), ...pageLink('mypireview'), ...(access.sees('board') ? [{ key: 'board', label: timeWriting.name, icon: pageMeta('board').icon, open: () => openView(timeWriting.id) }] : []), ...addedLinks('my-work')], ...(my.known && azure.items.length ? { badge: `${my.pending.length} open` } : {}) }),
    tileOf({ key: 'mydash', title: 'My dashboard', detail: 'Your hours against your capacity, your open work and your streams.', tone: 'peach', open: firstAllowed('mydash'), links: [] }),
    tileOf({ key: 'insights', title: 'Team Insights', detail: 'Team overview, Pulse Check and PI Review.', tone: 'lilac', links: [...pageLink('overview'), ...pageLink('pulse'), ...pageLink('pireview'), ...pageLink('kpitracker'), ...addedLinks('data-insights')] }),
    // NAV-53: I&D Board has no page of its own any more: its tile is shown only while it (or Other views) holds added pages.
    tileOf({ key: 'board', title: 'I&D Board', detail: 'Pages added to I&D Board and Other views.', tone: 'mint', links: [...addedLinks('i-d-board'), ...addedLinks('other-views')] }),
    tileOf({ key: 'release', title: 'Release Details', detail: 'The releases of each stream: DP, CP, IOCC, Content, Tool Validations and the Windchill exports.', tone: 'lemon', links: [...streamLinks, ...addedLinks('release-details')] }),
    tileOf({ key: 'planning', title: 'Planning & Baselines', detail: 'Release baselines against booked hours, and the pages being tried out.', tone: 'teal', links: [...pageLink('baselines'), ...pageLink('planover'), ...pageLink('capactual'), ...addedLinks('testing')] }),
    tileOf({ key: 'qe', title: 'QE Mapping', detail: 'Which QE covers which platform or product.', tone: 'rose', open: firstAllowed('qemapping'), links: [] }),
    tileOf({ key: 'ondemand', title: 'On-Demand', detail: 'Tables the team sets up itself: CoNQ (Cost of Non-Quality) and more.', tone: 'peach', links: addedLinks('on-demand') }),
    // PGB-04: a tile for each group of your own, with its pages.
    ...customGroups.map((group) => tileOf({ key: `group:${group.id}`, title: group.name, detail: `Pages added to ${group.name}.`, tone: 'lilac', links: addedLinks(group.id) })),
    // NAV-53: Backlog Health is linked here, after Snapshots and before Documentation (its menu group is Data & governance).
    tileOf({ key: 'records', title: 'Snapshots & Documents', detail: 'Point-in-time snapshots, Backlog Health and the project documents of this build.', tone: 'sand', links: [...pageLink('snapshots'), ...pageLink('health'), ...pageLink('docs'), ...addedLinks('data-governance')] }),
    tileOf({ key: 'admin', title: 'Admin', detail: 'Streams, Epic & Feature setup, people and roles, capacity, reports and sharing.', tone: 'sky', open: () => openSettings('home'), links: settingsLinks }),
    tileOf({ key: 'my', title: mySettingsLabel, detail: 'Your work email, servers and tokens, your views and naming patterns.', tone: 'mint', open: () => openSettings('my'), links: [] }),
  ])

  // ACT-22: the top bar's real height, so sticky page headers (the Time Writing cards) sit right under it.
  const topbarRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const bar = topbarRef.current
    if (!bar || typeof ResizeObserver === 'undefined') return
    const apply = () => document.documentElement.style.setProperty('--topbar-h', `${Math.ceil(bar.getBoundingClientRect().height)}px`)
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [store.ready])
  // NAV-49: the footer's real height (it wraps on narrow screens) keeps the bars fixed at the bottom above it.
  const footerRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const footer = footerRef.current
    if (!footer || typeof ResizeObserver === 'undefined') return
    const apply = () => document.documentElement.style.setProperty('--app-footer-h', `${Math.ceil(footer.getBoundingClientRect().height)}px`)
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(footer)
    return () => observer.disconnect()
  }, [store.ready])
  // NAV-47: the person picker in the top bar, on the person-based pages only (My dashboard always shows you).
  const personPage = page === 'activities' || page === 'mywork' || page === 'bulk'
  // NAV-48: the profile menu (top right).
  const profileActions: ProfileAction[] = [
    { key: 'my', label: mySettingsLabel, icon: '⚙', onClick: () => openSettings('my') },
    { key: 'look', label: lookLabel, icon: '◧', detail: 'Page margins and border, theme, start view and menu, table and chart defaults', onClick: () => openSettings('look') },
    { key: 'view', label: startView === 'tiles' ? 'Classic view' : 'Tile view', icon: startView === 'tiles' ? '☰' : '⌂', detail: startView === 'tiles' ? 'Open on My dashboard, without Home (the classic view)' : 'Open on Home, the tiles of every area', onClick: () => switchView(startView === 'tiles' ? 'classic' : 'tiles') },
    ...(access.canViewAs ? [{ key: 'viewas', label: 'View as…', icon: '👁', onClick: () => setViewAsOpen(true) }] : []),
    { key: 'search', label: 'Search settings', icon: '⌕', detail: 'Ctrl K', onClick: () => setSearchOpen(true) },
    { key: 'menu', label: 'Customize menu', icon: '☰', onClick: () => setMenuEditor(true) },
    ...(allowed('docs') ? [{ key: 'guide', label: 'User guide', icon: '?', detail: 'How to use the app, with screenshots and short clips', onClick: openUserGuide }] : []),
  ]
  // GIT-18: newer data in Git, shown on the page in use only when that page's data changed (the others keep theirs for
  // when they are opened); the menu layout and the views are loaded quietly. A page key: the page's id, 'admin:<tab>',
  // or 'ondemand:<page id>' for an added page.
  const pageKey = page === 'ondemand' && onDemandPage ? `ondemand:${onDemandPage.id}` : page === 'admin' ? `admin:${settingsTab}` : page
  const pageName = page === 'board' ? view.name : page === 'windchill' && windchillView ? windchillView.name : page === 'admin' ? settingsLabel(settingsTab) : page === 'ondemand' && onDemandPage ? onDemandPage.name : meta.label
  // The dashboards whose blocks or filters read an On-Demand page (from the definitions last read in this browser).
  const dashboardsReading = (pageId: string) => Object.entries(menu.layout.pages).filter(([, entry]) => entry.type === 'dashboard').map(([id]) => id).filter((id) => { const dashboard = cachedDashboard(id); return Boolean(dashboard && [...dashboard.blocks, ...dashboard.filters].some((entry) => pageOfSource(entry.source) === pageId)) })
  const targetOf = (path: string): FilePages => pagesOfFile(path, git.config?.path ?? '', dashboardsReading)
  // GIT-23: the access roles are loaded quietly too, except on Admin → People & roles (someone may be editing them there).
  const rolesPage = pageKey === 'admin:resources'
  // PIR-19, PIR-29: the PI Review form too, except on Admin → PI Review Setup (someone may be editing it there).
  // LST-02: the built-in lists too, except on Admin → Epic & Feature setup (someone may be refreshing one there).
  const quietTarget = (target: FilePages) => target.quiet === 'menu' || target.quiet === 'views' || (target.quiet === 'access' && !rolesPage) || (target.quiet === 'piForm' && pageKey !== 'admin:pireview') || (target.quiet === 'lists' && pageKey !== 'admin:epics')
  // An added page's file is named by the page's name ("CoNQ"; its blocks for a dashboard).
  const pageChanges = changesForPage(git.remoteChanges, pageKey, targetOf, quietTarget).map((change) => {
    const added = /(?:^|\/)(on-demand|dashboards)\/([a-z0-9-]+)(?:\.json|\/page\.json|\/rows)$/.exec(change.path), name = added && onDemand.pages.find((entry) => entry.id === added[2])?.name
    return name ? { ...change, label: added[1] === 'dashboards' ? `the blocks of ${name}` : name } : change
  })
  const editsHere = useUnsavedEdits()
  const planningChanged = pageChanges.some((change) => change.planning)
  const unsavedHere = [...editsHere, ...(planningChanged && git.dirty ? ['the planning changes not saved to Git (baselines, release scope, the region / role mapping, the capacity settings, table defaults)'] : [])]
  const fullReload = pageChanges.some((change) => targetOf(change.path).loader === 'reload')
  // Load the newer data: each file read again by the area that holds it.
  const [pageReads, setPageReads] = useState(0)
  async function loadNewer() {
    if (fullReload) { window.location.reload(); return }
    const loaders = [...new Set(pageChanges.map((change) => targetOf(change.path).loader))]
    for (const loader of loaders) {
      if (loader === 'planning') await git.load()
      else if (loader.startsWith('ondemand:')) await onDemand.reloadPage(loader.slice('ondemand:'.length))
      else if (loader === 'access') await access.reload()
      else if (loader === 'qemapping') await qeMapping.reload()
      else if (loader === 'featureSetup') await featureSetup.reload()
      else if (loader === 'epicSetup') await epicSetup.reload()
      else if (loader === 'customStreams') await customStreams.reload()
      else if (loader === 'toolValidations') await toolValidations.reload()
      else if (loader === 'piForm') await piForm.reload()
      else if (loader === 'sharedLists') await sharedLists.reload()
      else if (loader === 'connections') { await git.syncViews(); azure.reloadConnectionProfiles() }
      else if (loader === 'monthlyPack') { await monthlyPack.reloadSetup(); await monthlyPack.reloadNotes() }
      else if (loader === 'history') await history.reload()
      else if (loader === 'menu') await menu.reload()
      else if (loader === 'views') personalViews.reload()
      else if (loader === 'rowLocks') await onDemand.reloadLockSettings()
    }
    // Pages that hold the data they show (an added page's drawer and pop-ups, a dashboard's blocks, the QE Mapping draft,
    // the KPI tracker copy) open afresh; the others show the data just loaded and keep their open forms.
    if (pageKey.startsWith('ondemand:') || pageKey === 'qemapping' || loaders.includes('remount')) setPageReads((count) => count + 1)
  }
  // The menu layout and the views: read again quietly as soon as a newer version is found.
  const quietPaths = git.remoteChanges.filter((change) => quietTarget(targetOf(change.path))).map((change) => `${change.path}@${change.sha}`).join('|')
  // GIT-21: with a newer menu layout the On-Demand folder is listed again: a page someone else added is read (only pages
  // not known here), one they deleted leaves the menu — unless it is the page in use with edits not saved here (it stays,
  // with its notice of GIT-18).
  const keepOpen = (id: string) => pageKey === `ondemand:${id}` && editsHere.length > 0
  // GIT-23: a newer access.json loaded quietly; when the viewer's own rights change, a short info line on the page in use
  // says who changed them and what (once: it goes with the page or when dismissed). Fail closed stays (CON-101): until
  // the file is read again the rights in force are the ones loaded before.
  const [accessNote, setAccessNote] = useState<{ page: string; text: string } | null>(null)
  const loadAccessQuietly = async () => {
    const change = git.remoteChanges.find((entry) => /(^|\/)access\.json$/.test(entry.path))
    const before = access.ownRights, at = pageKey
    const policy = await access.reload()
    if (policy === undefined) return
    const changes = rightsChanges(before, rightsFor(policy, access.email, false))
    if (changes.length) setAccessNote({ page: at, text: accessChangedText(change?.otherWindow ? 'you in another window of this browser' : change?.by ?? '', changes) })
  }
  const quietLoad = useRef({ menu: menu.reload, views: personalViews.reload, pages: () => onDemand.loadNew(keepOpen), access: loadAccessQuietly, piForm: piForm.reload, lists: sharedLists.reload })
  useEffect(() => { quietLoad.current = { menu: menu.reload, views: personalViews.reload, pages: () => onDemand.loadNew(keepOpen), access: loadAccessQuietly, piForm: piForm.reload, lists: sharedLists.reload } })
  useEffect(() => {
    if (!quietPaths) return
    if (quietPaths.includes('menu-layout.json@')) { void quietLoad.current.menu(); void quietLoad.current.pages().catch(() => undefined) }
    if (/personal-views/.test(quietPaths)) quietLoad.current.views()
    if (/(^|\/|\|)access\.json@/.test(quietPaths)) void quietLoad.current.access().catch(() => undefined)
    if (/(^|\/|\|)pi-review-form\.json@/.test(quietPaths)) void quietLoad.current.piForm()
    if (/(^|\/|\|)shared-lists\.json@/.test(quietPaths)) void quietLoad.current.lists()
  }, [quietPaths])
  useEffect(() => { setAccessNote((note) => note && note.page !== pageKey ? null : note) }, [pageKey])
  if (!store.ready) return <main className="content"><h1>I&amp;D Quality Demand Planning</h1>{store.loadError ? <Notice tone="error"><p>{store.loadError}</p><p>Do not clear browser data. If you still have an older tab open with unsaved changes, export its JSON backup first.</p><button className="primary" onClick={store.retryLoad}>Retry loading saved data</button></Notice> : <p role="status">Loading saved browser data…</p>}{buildStatus}</main>

  // CHT-17…CHT-20: chart sizes — each viewer's own in their personal views; a Tool Owner (Table, chart and page defaults)
  // saves a built-in chart's size for everyone with Git connected (not with the synthetic sample); View as saves nothing.
  const chartSizeEnv = { views: personalViews, viewOnly: Boolean(access.viewingAs), canSetDefault: access.can('layout.defaults') && git.connected && !git.readOnly && !git.isSample }
  // UI-12: every table follows the shared design default.
  return <ListCatalogContext.Provider value={listCatalogEntries}><PageNamesContext.Provider value={menuNames}><OwnerPeopleContext.Provider value={ownerPeople}><TableDefaultsContext.Provider value={tableDesign}><CustomStreamsContext.Provider value={customStreams}><ReleaseSettingsContext.Provider value={store.state.releaseSourceSettings}><ReviewEnvContext.Provider value={reviewEnv}><CanContext.Provider value={access.can}><ReadOnlyContext.Provider value={access.readOnly}><EpicSetupContext.Provider value={epicSetup.file}><OnPremContext.Provider value={onPremSources}><ToolValidationsContext.Provider value={toolEnv}><HeaderSlot.Provider value={headerSlot}><ChartSizeEnvContext.Provider value={chartSizeEnv}><div className={`app-shell${navOpen ? ' nav-open' : ''}${menuMini ? ' nav-mini' : ''}`}>
    {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} aria-hidden="true" />}
    <aside className="sidebar" id="primary-navigation">
      <div className="brand" title="I&amp;D Quality Demand Planning"><div className="brand-mark"><BrandMark /></div><div><strong>I&amp;D Quality</strong><span>Demand Planning</span></div><button type="button" className="nav-mini-toggle" aria-pressed={menuMini} aria-label={menuMini ? 'Expand the menu' : 'Collapse the menu'} title={menuMini ? 'Show the menu with names' : 'Fold the menu to icons'} onClick={toggleMenuMini}>{menuMini ? '»' : '«'}</button></div>
      <div className="nav-fold" role="group" aria-label="Menu headings"><button type="button" className="text-button" disabled={!collapsed.length} onClick={() => setCollapsed(saveCollapsed([]))}>Expand all</button><button type="button" className="text-button" disabled={allCollapsed} onClick={() => setCollapsed(saveCollapsed(navKeys))}>Collapse all</button></div>
      <nav aria-label="Primary navigation">{startView === 'tiles' && <div className="nav-section nav-home"><div className="nav-items">{navButton('home', pageMeta('home').icon, 'Home', page === 'home', () => setPage('home'))}</div></div>}{(() => {
        // MYD-08, PGB-04: pinned pages — built-in ones by their id, added pages as ondemand:<page id>.
        const pinned = personalViews.menu.pinned.flatMap((id) => {
          const added = id.startsWith('ondemand:') ? onDemand.pages.find((entry) => `ondemand:${entry.id}` === id) : undefined
          if (added) return allowed('ondemand') && !isHidden(menu.layout, added.id) ? [{ key: id, icon: placementOf(menu.layout, added.id).icon, label: added.name, active: page === 'ondemand' && onDemandPage?.id === added.id, open: () => openOnDemand(added.id) }] : []
          const item = pages.find((entry) => entry.id === id)
          return item && !item.hidden && allowed(item.id) ? [{ key: id, icon: item.icon, label: item.label, active: page === item.id, open: () => setPage(item.id) }] : []
        })
        return pinned.length ? <div className="nav-section nav-pinned"><span className="nav-group">PINNED</span><div className="nav-items">{pinned.map((item) => <button key={`pin:${item.key}`} className={item.active ? 'nav-active' : ''} aria-current={item.active ? 'page' : undefined} onClick={item.open}><span className="nav-icon">{item.icon}</span>{item.label}</button>)}</div></div> : null
      })()}{navGroups.map((group) => {
        const pageButton = (item: typeof pages[number]) => !allowed(item.id) ? [] : [<button key={item.id} title={menuMini ? item.label : undefined} className={page === item.id ? 'nav-active' : ''} aria-current={page === item.id ? 'page' : undefined} onClick={() => setPage(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}{item.id === 'mywork' && my.pending.length > 0 && <span className="nav-badge" aria-label={`${my.pending.length} pending`}>{my.pending.length}</span>}</button>]
        const windchillMeta = pageMeta('windchill')
        // NAV-52: Release Details is one list — BRITE at its root (CON-84), then every stream's entry (Azure DevOps and
        // Windchill exports, built-in and custom) A–Z, then "＋ ECP export" (CON-87) and Import Windchill export. A stream
        // without a connection (shown in the menu) leads to Settings to set it up; one not imported yet to its import.
        // Other connections and exports go under "Other views".
        const sections: { key: string; entries: React.ReactNode[] }[] = group === 'Release Details' ? [
          { key: 'release:root', entries: access.sees('release') ? [navButton('brite', pageMeta('brite').icon, 'BRITE', page === 'brite', () => setPage('brite'))] : [] },
          { key: 'release:streams', entries: access.sees('release') ? [...releaseMenuEntries(windchillViews).map((entry) => {
            if (entry.kind === 'azure') { const profile = profileForStream(entry.stream, azure.connectionProfiles), found = profile && views.find((item) => item.id === profile.id); return found ? navButton(`view:${found.id}`, pageMeta('board').icon, entry.label, page === 'board' && view.id === found.id, () => openView(found.id)) : <button key={`stream:${entry.stream.name}`} className="nav-missing" title={`Not set up: add a connection named “${entry.stream.name}”`} onClick={openConnection}><span className="nav-icon">＋</span>{entry.label}</button> }
            if (entry.kind === 'windchill') { const shown = entry.view; return shown ? navButton(shown.id, windchillMeta.icon, entry.label, page === 'windchill' && windchillView?.id === shown.id, () => openWindchill(shown.id)) : <button key={`stream:${entry.stream.name}`} className="nav-missing" title={`Not imported yet: import the ${entry.stream.name} export`} onClick={() => openWindchill('', entry.stream.name)}><span className="nav-icon">＋</span>{entry.label}</button> }
            // Several ECP exports (CON-87): "＋ ECP export" adds another with its own name and setup.
            return <button key={`stream:${entry.stream.name}:add`} className="nav-missing" title={`Import another ${entry.stream.name} export (its own name and project folder)`} onClick={() => openWindchill('', entry.stream.name)}><span className="nav-icon">＋</span>{entry.label}</button>
          }), ...(access.can('windchill.import') ? [navButton('windchill', '＋', windchillMeta.label, page === 'windchill' && !windchillView, () => openWindchill(''))] : [])] : [] },
        ] : group === 'Other views' ? [{ key: group, entries: [
          ...others.azure.filter((entry) => access.sees(entry.onPrem ? 'release' : 'board')).map((entry) => navButton(`view:${entry.id}`, pageMeta('board').icon, entry.name, page === 'board' && view.id === entry.id, () => openView(entry.id))),
          ...(access.sees('release') ? others.windchill.map((entry) => navButton(entry.id, pageMeta('windchill').icon, entry.name, page === 'windchill' && windchillView?.id === entry.id, () => openWindchill(entry.id))) : []),
        ] }] : group === 'On-Demand' ? [{ key: group, entries: addedButtons('on-demand') }] : group === 'Settings' ? [{ key: group, entries: settingsPagesFor(access.can).map((entry) => navButton(`settings:${entry.key}`, pageMeta('admin').icon, entry.label, page === 'admin' && settingsTab === entry.key, () => openSettings(entry.key))) }] : [{ key: group, entries: pages.filter((item) => !personalViews.menu.hidden.includes(item.id) && item.group === group && !item.hidden).flatMap((item) => item.id === 'board' ? (access.sees('board') ? views.filter((entry) => !entry.readOnly).map((entry) => navButton(`view:${entry.id}`, item.icon, entry.name, page === 'board' && view.id === entry.id, () => openView(entry.id))) : []) : pageButton(item)) }]
        // PGB-04: the pages added to a built-in group follow its own entries (On-Demand and the custom groups hold only those).
        const groupId = groupIdOf(group)
        if (group !== 'On-Demand' && group !== 'Settings' && groupId) sections.push({ key: `${group}:added`, entries: addedButtons(groupId) })
        const shown = sections.filter((section) => section.entries.length)
        if (!shown.length) return null
        const open = !collapsed.includes(navKeyOf(group))
        const holdsActive = group === (isOther ? 'Other views' : page === 'board' ? (view.readOnly ? 'Release Details' : meta.group) : page === 'ondemand' && onDemandPage ? groupNameOf(placementOf(menu.layout, onDemandPage.id).group) : meta.group)
        // PGB-05: ⋯ on a group the viewer may add a page to opens ＋ Add page for it.
        const canAdd = Boolean(groupId) && !menuGitReason && !addPageReason(viewer, menu.layout, groupId)
        return <div key={group} className="nav-section">
          <div className="nav-group-row"><button type="button" className={`nav-group${holdsActive && !open ? ' nav-group-active' : ''}`} aria-expanded={open} onClick={() => toggleNav(navKeyOf(group))}><span aria-hidden="true">{open ? '▾' : '▸'}</span>{group === 'Settings' ? <>ADMIN{git.dirty && <span className="nav-badge" title="Shared changes not yet saved to Git" aria-label="1 unsaved shared change">1</span>}</> : group.toUpperCase()}</button>
          {canAdd && <button type="button" className="nav-group-more" aria-label={`Add a page to ${group}`} title={`Add a page to ${group}`} onClick={() => setAddPageFor(groupId)}>⋯</button>}</div>
          {/* Collapsed lists stay in the page but are hidden on wide screens only: the narrow sidebar has no headings. */}
          <div className={`nav-items${open ? '' : ' nav-collapsed'}`}>{shown.map((section) => <div key={section.key} className="nav-items">{section.entries}</div>)}</div>
        </div>
      })}</nav>
    </aside>
    {searchOpen && <SettingsSearch allowed={(entry) => entry.tab === 'my' || settingsPagesFor(access.can).some((item) => item.key === entry.tab)} onOpen={openSettings} onClose={() => setSearchOpen(false)} />}
    {menuEditor && <MenuCustomizer pages={[...pages.filter((item) => !item.hidden && item.id !== 'admin' && allowed(item.id)).map(({ id, label, group }) => ({ id, label, group: group as string })), ...(allowed('ondemand') ? onDemand.pages.filter((entry) => !isHidden(menu.layout, entry.id)).map((entry) => ({ id: `ondemand:${entry.id}`, label: entry.name, group: groupNameOf(placementOf(menu.layout, entry.id).group) })) : [])]} menu={personalViews.menu} onChange={personalViews.setMenu} onClose={() => setMenuEditor(false)} />}
    <main>
      <header className="topbar" ref={topbarRef}><button type="button" className="menu-button" aria-label={navOpen ? 'Close menu' : 'Open menu'} aria-expanded={navOpen} aria-controls="primary-navigation" onClick={() => setNavOpen((open) => !open)}>{navOpen ? '✕' : '☰'}</button><h1 title={page === 'ondemand' && onDemandPage ? onDemandPage.description || `${onDemandPage.name}, in ${groupNameOf(placementOf(menu.layout, onDemandPage.id).group)}` : meta.detail}>{page === 'board' ? view.name : page === 'windchill' && windchillView ? windchillView.name : page === 'admin' ? settingsLabel(settingsTab) : page === 'ondemand' && onDemandPage ? onDemandPage.name : meta.label}</h1><div className="topbar-slot" ref={setHeaderSlot} /><div className="topbar-actions">{openSteps > 0 && <button type="button" className="ghost setup-button" title="What to configure and how" onClick={() => setGuideOpen(true)}>Setup · {steps.filter((step) => step.required && step.state === 'done').length}/{steps.filter((step) => step.required).length}</button>}<JobsIndicator /><DataStatus azure={azure} />{(meta.usesMonth || (page === 'board' && view.readOnly)) && <label className="month-picker"><span className="sr-only">Month</span><input type="month" aria-label="Month" value={month} onChange={(event) => /^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value) && setMonth(event.target.value)} /></label>}{personPage && <label className="topbar-person">Person<PersonPicker label="Person" value={my.chosenName} people={my.people} onChange={my.setName} meLabel={azure.creatorEmail.trim() ? 'Me' : 'Choose a person…'} /></label>}<ThemeToggle /><ProfileMenu name={my.self.me.name ?? ''} email={azure.creatorEmail.trim()} actions={profileActions} /></div></header>
      {access.viewingAs && <div className="view-as-banner" role="status"><span>👁 Viewing as <strong>{viewAsLabel(access.viewingAs)}</strong>{access.viewingAs.kind === 'role' ? '' : access.rights.roles.length ? ` (${access.rights.roles.join(', ')})` : ' (default role)'} — read only: nothing is saved to Azure DevOps or Git.</span><button type="button" className="ghost" onClick={() => setViewAsOpen(true)}>Change</button><button type="button" className="primary" onClick={() => setViewAs(null)}>Exit View as</button></div>}
      {viewAsOpen && <ViewAsDialog current={access.viewingAs} people={viewAsPeople(azure.items, access.policy)} onStart={(next) => { setViewAs(next); setViewAsOpen(false); setPage(startPageOf(startView)) }} onClose={() => setViewAsOpen(false)} />}
      <DataNotices azure={azure} onOpenConnection={openConnection} />
      {/* CON-101 (fail closed): until the roles file is loaded the app is read-only; say why and what to do. */}
      {movedGit && git.config && <Notice tone="warning" className="git-moved"><strong>The team data has moved</strong> to {movedGit.owner}/{movedGit.repo}. This app is still connected to {git.config.owner}/{git.config.repo}, which is no longer updated.{' '}{git.connected ? <button type="button" className="primary" disabled={git.status === 'loading' || git.status === 'saving'} onClick={() => { if (confirmReplace(git.dirty, git.status === 'conflict')) void git.connect(movedGit, '', false) }}>Switch to {movedGit.owner}/{movedGit.repo}</button> : <button type="button" className="text-button" onClick={() => openSettings('storage', 'git')}>Open Git storage →</button>}</Notice>}
      {access.readOnly && <Notice tone="warning" className="access-read-only"><strong>Read-only:</strong> {access.bootstrap ? <>there are no access roles yet (no {access.path || 'access.json'} in Git storage), so no changes can be made. <button type="button" className="text-button" onClick={() => openSettings('resources', 'rights')}>Set up roles →</button></> : access.error && isRepositoryUnreadable(access.error) ? <>the data repository cannot be read, so the access roles ({access.path || 'access.json'}) cannot be loaded and no changes can be made: {access.error} Nothing in this browser was cleared. <button type="button" className="text-button" onClick={() => openSettings('storage', 'git')}>Open Git storage →</button></>: access.error ? <>the access roles ({access.path || 'access.json'}) could not be read, so no changes can be made: {access.error} <button type="button" className="text-button" onClick={() => openSettings('storage', 'git')}>Open Git storage →</button></> : git.accessScope && !access.loaded ? <>loading the access roles ({access.path || 'access.json'}) from Git storage; no changes can be made until they are loaded.</> : <>the access roles (access.json) are not loaded, so no changes can be made. <button type="button" className="text-button" onClick={() => openSettings('storage', 'git')}>Connect Git storage →</button></>}</Notice>}
      {guideOpen && <SetupGuide steps={steps} busy={azure.busy} problem={azure.fetchProblem} links={setupLinks} linkDefaults={linkDefaults} editLinks={access.can('layout.defaults') && git.connected && !git.readOnly && !azure.isSample ? { links: store.state.setupLinks ?? {}, onChange: (links) => store.update((draft) => { draft.setupLinks = links; return draft }), saveBar: <GitSyncBar git={git} /> } : undefined} inputs={{ connectGit: (token) => git.connect({ ...defaultGitRepository, ...git.config }, token, true), saveEmail: (email) => { azure.setCreatorEmail(email) }, savePat: (token) => { azure.rememberPat(token); azure.reloadConnectionProfiles() }, detectEmail: () => azure.config ? detectWorkEmail(azure.config, azure.pat) : Promise.reject(new Error('Set up the Time Writing connection first.')), gitMessage: git.status === 'error' ? git.message : undefined }} onClose={() => setGuideOpen(false)} onDismiss={dismissGuide} onOpenTab={(tab, section) => { openSettings(tab, section); setGuideOpen(false) }} onFetch={() => void azure.refresh()} />}
      {store.cache.status === 'error' && <Notice tone="error"><p>{store.cache.message}</p><div className="button-row"><button className="ghost" onClick={() => exportStateJson(store.state)}>Export JSON backup now</button><button className="primary" onClick={store.retrySave}>Retry browser save</button></div></Notice>}
      <div className="data-notices"><PageGitNotice key={pageKey} page={pageName} changes={pageChanges} unsaved={unsavedHere} fullReload={fullReload} onLoad={loadNewer} />{git.viewsRemoved && <Notice tone="warning" className="views-removed-note">{git.viewsRemoved}{' '}<button type="button" className="text-button" onClick={git.dismissViewsRemoved}>Dismiss</button></Notice>}{accessNote?.page === pageKey && <Notice tone="info" className="access-changed-note">{accessNote.text}{' '}<button type="button" className="text-button" onClick={() => setAccessNote(null)}>Dismiss</button></Notice>}</div>
      <Suspense fallback={<p className="muted page-loading" role="status">Loading the page…</p>}><Fragment key={pageReads}>
      {page === 'home' && <HomePage tiles={homeTiles} name={my.me.name} />}
      {/* MYD-15: My dashboard's blocks read what the app has loaded, each source as the viewer's areas allow; View as: read only, the default layout. */}
      {page === 'mydash' && <MyDashboardPage month={month} azure={reportAzure} store={store} my={{ ...my, ...my.self }} navigate={setPage} views={personalViews} canSetDefault={access.can('layout.defaults')} windchill={windchill}
        sources={{ sees: access.sees, viewingAs: Boolean(access.viewingAs), git, onDemand, isDashboard: (id) => isDashboard(menu.layout, id), qe: qeMapping, history, settings: dashboardHoursSettings, items: reportAzure.items }} />}
      {page === 'overview' && <DashboardPage month={month} azure={reportAzure} navigate={setPage} store={store} setMonth={setMonth} my={my} views={personalViews} canSetDefault={access.can('layout.defaults')} canLock={access.can('capacity.periods')} />}
      {page === 'pulse' && <PulseCheckPage month={month} azure={reportAzure} store={store} my={my} navigate={setPage} windchill={windchill} openWindchill={openWindchill} git={git} pack={monthlyPack} views={personalViews} canPickProfile={access.rights.roles.includes('Admin')} />}
      {page === 'pireview' && <PiReviewPage azure={azure} store={store} />}
      {page === 'brite' && <BritePage />}
      {page === 'kpitracker' && <KpiTrackerPage git={git} canManage={access.can('storage.shared')} who={my.me.name || 'Admin'} />}
      {page === 'ondemand' && onDemandPage && kindOf(menu.layout, onDemandPage.id) === 'dashboard' && <CustomDashboardPage key={onDemandPage.id} git={git} store={onDemand} pageId={onDemandPage.id} menu={menu} viewer={viewer} views={personalViews} onOpen={openOnDemand} addPageReason={addPageReason(viewer, menu.layout, placementOf(menu.layout, onDemandPage.id).group)} onAddPage={() => setAddPageFor(placementOf(menu.layout, onDemandPage.id).group)} hours={{ items: reportAzure.items, settings: dashboardHoursSettings, allowed: access.sees('insights') }} publisherName={publisherName} publisher={publisher} tools={toolDatasetList} />}
      {page === 'ondemand' && onDemandPage && kindOf(menu.layout, onDemandPage.id) !== 'dashboard' && <OnDemandPage key={onDemandPage.id} git={git} store={onDemand} pageId={onDemandPage.id} me={azure.isSample ? '' : azure.creatorEmail.trim().toLowerCase() || my.self.me.name?.trim() || ''} onOpen={openOnDemand} kind={kindOf(menu.layout, onDemandPage.id)} menu={menu} viewer={viewer} addPageReason={addPageReason(viewer, menu.layout, placementOf(menu.layout, onDemandPage.id).group)} onAddPage={() => setAddPageFor(placementOf(menu.layout, onDemandPage.id).group)} views={personalViews} dataMode={dataMode} publisherName={publisherName} publisher={publisher} />}
      {page === 'qemapping' && <QeMappingPage git={git} store={qeMapping} resources={qeResources} viewOnly={Boolean(access.viewingAs)} qeColumnNames={[...new Set([featureSetup.setups?.shared, featureSetup.setups?.personal].flatMap((file) => file?.epics ?? []).flatMap((epic) => epic.qeColumns?.qeColumn ? [epic.qeColumns.qeColumn] : []))]} />}
      {page === 'mywork' && <MyWorkPage azure={azure} store={store} my={my} month={month} onOpenActivities={() => setPage('activities')} assign={assign} featureSetup={featureSetup.setups} />}
      {page === 'bulk' && <SprintCheckPage azure={azure} store={store} my={my} />}
      {page === 'mypireview' && <MyPiReviewPage azure={azure} my={my} />}
      {page === 'capactual' && <CapacityActualPage azure={reportAzure} store={store} month={month} />}
      {page === 'planover' && <PlanningOverviewPage azure={reportAzure} store={store} month={month} onOpenPack={() => openSettings('pack', 'pack')} />}
      {page === 'activities' && <MyActivitiesPage azure={azure} store={store} my={my} month={month} assign={assign} featureSetup={featureSetup.setups} onOpen={setPage} />}
      {page === 'baselines' && <BaselinesPage azure={azure} month={month} store={store} git={git} onOpenSettings={() => openSettings('storage', 'git')} canEdit={access.can('baselines.edit')} />}
      {page === 'windchill' && (windchillView ? <WindchillPage view={windchillView} windchill={windchill} git={git} gitNote={git.snapshotNotes[`wc:${windchillView.id}`]} month={month} board={{ azure, stream: windchillStreamExports(windchillViews).find((entry) => entry.view?.id === windchillView.id)?.stream.name ?? windchillView.name, threshold: normalizeReleaseSourceSettings(store.state.releaseSourceSettings).matchThreshold ?? defaultMatchThreshold, assign, featureSetup: featureSetup.setups }} /> : access.can('windchill.import') ? <WindchillExportImport key={windchillFor} stream={windchillFor} windchill={windchill} git={git} onImported={(id) => openWindchill(id)} /> : <Notice tone="info">Your role does not include importing Windchill exports. Open an export from the menu; an Admin can change this in Admin → People & roles → Role rights.</Notice>)}
      {page === 'health' && <BacklogHealthPage azure={azure} store={store} />}
      {page === 'board' && <BoardPage views={personalViews} canSetDefault={access.can('layout.defaults') && git.connected && !git.readOnly && !git.isSample} azure={azure} store={store} current={view} month={month} git={git} onOpenConnection={openConnection} onOpenSettings={openSettings} assign={assign} featureSetup={featureSetup.setups} qeMapping={qeMapping.file} />}
      {page === 'snapshots' && <SnapshotsPage {...pageProps} git={git} who={my.me.email || my.me.name || 'unknown'} />}
      {page === 'admin' && settingsTab === 'pages' && <PagesMenuPage duplicates={duplicateNames} git={git} store={onDemand} menu={menu} viewer={viewer} onOpen={openOnDemand} onAddPage={(group) => setAddPageFor(group ?? '')} />}
      {/* PIR-29: Admin → PI Review Setup, the PI Review form setup on a page of its own. */}
      {page === 'admin' && settingsTab === 'pireview' && <PiReviewSetupPage store={piForm} block={piFormBlock} by={my.self.me.name?.trim() || azure.creatorEmail.trim()} />}
      {page === 'admin' && settingsTab !== 'pages' && settingsTab !== 'pireview' && <AdminPage look={{ startView, onStartView: switchView, onCustomizeMenu: () => setMenuEditor(true) }} key={`${settingsTab}:${settingsVisit}`} tab={settingsTab} onOpenTab={openSettings} {...pageProps} azure={azure} git={git} access={access} featureSetup={featureSetup} epicSetup={epicSetup} sharedLists={listsEnv} setupSteps={steps} onSearch={() => setSearchOpen(true)} qeColumnNames={[...new Set((qeMapping.file?.sheets ?? []).flatMap((sheet) => sheet.columns.map((column) => column.name)))]} monthlyPack={monthlyPack} history={history} loadEverything={loadEverything} onOpenBoard={() => setPage('board')} />}
      {page === 'docs' && <DocsPage key={docsVisit} git={git} onConfigure={() => openSettings('storage', 'git')} />}
      </Fragment></Suspense>
      {addPageFor != null && <AddPageDialog viewer={viewer} layout={menu.layout} group={addPageFor || undefined} onCancel={() => setAddPageFor(null)} onCreate={async (input) => { const id = await createPage(onDemand, menu, input); setAddPageFor(null); openOnDemand(id) }} />}
      <footer className="app-footer" aria-label="Version" ref={footerRef}><ZoomControl /><DesktopDownload />{buildStatus}</footer>
    </main>
  </div></ChartSizeEnvContext.Provider></HeaderSlot.Provider></ToolValidationsContext.Provider></OnPremContext.Provider></EpicSetupContext.Provider></ReadOnlyContext.Provider></CanContext.Provider></ReviewEnvContext.Provider></ReleaseSettingsContext.Provider></CustomStreamsContext.Provider></TableDefaultsContext.Provider></OwnerPeopleContext.Provider></PageNamesContext.Provider></ListCatalogContext.Provider>
}
