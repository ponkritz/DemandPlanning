import { useEffect, useRef, useState } from 'react'
import './App.css'
import './fresh.css'
import { useAppStore } from './store'
import { Notice } from './components/ui'
import { ThemeToggle } from './components/Clock'
import { DataNotices, DataStatus } from './components/DataStatus'
import { pages, pageGroups, pageMeta, type Page } from './pages/registry'
import { DashboardPage } from './pages/DashboardPage'
import { MonthlyPage } from './pages/MonthlyPage'
import { BaselinesPage } from './pages/BaselinesPage'
import { SnapshotsPage } from './pages/SnapshotsPage'
import { AdminPage } from './pages/AdminPage'
import { settingsTabOnOpen } from './settingsTabs'
import { defaultStreams, exportForStream, profileForStream } from './streams'
import { connectionPresets } from './connectionPresets'
import { gitSyncedIds, markViewsSynced, removeDuplicateConnections, serializeViews, viewsFile } from './viewDefinitions'
import { listAzureConnectionProfiles } from './azureCredentials'
import { DocsPage } from './pages/DocsPage'
import { BoardPage } from './pages/BoardPage'
import { useAzureWorkspace, type FetchListener, type GitDataSource } from './useAzureWorkspace'
import { sharedThroughGit } from './gitSnapshots'
import { useGitStorage } from './useGitStorage'
import { useWindchill } from './useWindchill'
import { WindchillExportImport, WindchillPage } from './components/WindchillViews'
import { BacklogHealthPage } from './pages/BacklogHealthPage'
import { PulseCheckPage } from './pages/PulseCheckPage'
import { PiReviewPage } from './pages/PiReviewPage'
import { QeMappingPage } from './pages/QeMappingPage'
import { useAccess } from './useAccess'
import { useFeatureSetup } from './useFeatureSetup'
import type { Area } from './access'
import { useMyWork } from './useMyWork'
import { MyWorkPage } from './pages/MyWorkPage'
import { BulkActionsPage } from './pages/BulkActionsPage'
import { DesktopDownload } from './components/DesktopDownload'
import { exportStateJson } from './download'
import { BuildStatus } from './components/BuildStatus'
import { backlogViews, loadBacklogTab, otherMenuViews, saveBacklogTab, timeWritingView } from './backlogViews'
import { mergeAzureWorkItems } from './azureDevOps'
import { formatDateTime, todayIso } from './format'
import { HeaderSlot } from './headerSlot'

export default function App() {
  const store = useAppStore()
  const onFetched = useRef<FetchListener | undefined>(undefined)
  const gitData = useRef<GitDataSource | undefined>(undefined)
  const azure = useAzureWorkspace(store, onFetched, gitData)
  const git = useGitStorage(store, azure.isSample)
  // On-prem views can load the data the desktop app saved to Git: on request, or when a fetch cannot run.
  gitData.current = {
    available: (id) => { const profile = azure.connectionProfiles.find((entry) => entry.id === id); return Boolean(git.connected && !azure.isSample && profile && sharedThroughGit(profile)) },
    load: async (id) => {
      const result = await git.pullSnapshot(id)
      if (!result) return null
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
    void git.syncViews().catch(() => null)
      .then(() => web ? git.pullSnapshots() : undefined).catch(() => { /* shown when loading from Settings */ })
      .finally(() => { azure.reloadConnectionProfiles(); setSetupSynced(true) })
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
      void git.writeViews(serializeViews(viewsFile(listAzureConnectionProfiles())), `Remove duplicate connections: ${names}`).then(() => markViewsSynced(listAzureConnectionProfiles())).catch(() => undefined)
    }
  }, [store, git, azure, setupSynced])
  // Every start (opening the app, Force Update, reload) fetches the cloud connections once, after the shared
  // connection setup from Git is in place.
  const autoFetched = useRef(false)
  useEffect(() => {
    if (autoFetched.current || !store.ready || azure.isSample || (git.connected && !setupSynced)) return
    autoFetched.current = true
    void azure.fetchCloud()
  }, [store.ready, azure, git.connected, setupSynced])
  const my = useMyWork(azure, store)
  // Settings → Storage: everything shared through Git, loaded now (as at start, plus the planning data, roles and
  // Feature setup); each part reports separately so one failure does not hide the rest.
  async function loadEverything() {
    const loaded: string[] = [], failed: string[] = []
    const step = async (label: string, run: () => Promise<string>) => { try { loaded.push(await run()) } catch (failure) { failed.push(`${label}: ${failure instanceof Error ? failure.message : String(failure)}`) } }
    await step('Planning data', async () => { await git.load(); return 'planning data (baselines, release scope, region / role mapping)' })
    await step('Connection setup', async () => { const result = await git.syncViews(); azure.reloadConnectionProfiles(); return result ? `connection setup (${result.added.length} added, ${result.updated.length} updated, ${result.removed.length} removed, ${result.kept.length} kept as changed here)` : 'no connection setup in Git' })
    await step('On-prem view data', async () => { const result = await git.pullSnapshots(); return `${result.files} on-prem view data file${result.files === 1 ? '' : 's'} (${result.applied.length} newer than here)` })
    await step('Windchill exports', async () => { const result = await git.pullWindchill(); await windchill.reload(); return `${result.files} Windchill export${result.files === 1 ? '' : 's'} (${result.applied.length} newer)` })
    await step('Access roles', async () => { await access.reload(); return 'access roles' })
    await step('Feature setup', async () => { await featureSetup.reload(); return 'Feature setup' })
    return { loaded, failed }
  }
  const access = useAccess(git, azure)
  const featureSetup = useFeatureSetup(git, azure.creatorEmail)
  // Who creates new work items (the email on the Time Writing connection) and whether they may assign them to others.
  const assign = { me: azure.creatorEmail.trim().toLowerCase(), canChoose: access.can('azure.createForOthers') }
  const [requested, setPage] = useState<Page>('overview')
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null)
  // The selected month starts on the viewer's current month (their time zone).
  const [month, setMonth] = useState(() => todayIso().slice(0, 7))

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
  // Access roles: each menu entry belongs to an area; Settings is always there (each person's own connections and tokens).
  // A page the viewer's roles do not include falls back to the first one they do.
  const areaOf = (id: Page): Area | null => id === 'admin' ? null : id === 'board' ? (view.onPrem ? 'release' : 'board') : id === 'windchill' ? 'release' : id === 'pulse' || id === 'pireview' ? 'overview' : id
  const allowed = (id: Page) => { const area = areaOf(id); return area == null || access.sees(area) }
  const page = allowed(requested) ? requested : pages.find((entry) => allowed(entry.id))?.id ?? 'admin'
  const meta = pageMeta(page)
  // Windchill exports, each in the sidebar under Release Details ('' = the import page).
  const windchillViews = windchill.views.filter((entry) => entry.exportFile && entry.showInMenu)
  const [windchillId, setWindchillId] = useState('')
  const windchillView = windchillViews.find((entry) => entry.id === windchillId)
  const openWindchill = (id: string) => { setWindchillId(id); setPage('windchill') }
  // Views shown in the menu that are not the Time Writing backlog nor a default stream: listed under "Other views".
  const others = otherMenuViews(views, azure.connectionProfiles, windchillViews)
  const isOther = page === 'board' ? others.azure.some((entry) => entry.id === view.id) : page === 'windchill' && Boolean(windchillView) && others.windchill.some((entry) => entry.id === windchillView?.id)
  // Menu headings and sub-lists can be collapsed; which ones are closed is remembered in this browser.
  // Phones: the sidebar is an off-canvas menu opened from the top bar; it closes on a choice, on Escape or on the backdrop.
  const [navOpen, setNavOpen] = useState(false)
  useEffect(() => { setNavOpen(false) }, [page, viewId, windchillId])
  useEffect(() => { if (!navOpen) return; const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setNavOpen(false) }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [navOpen])
  const [collapsed, setCollapsed] = useState<string[]>(() => { try { const saved = JSON.parse(localStorage.getItem('demand-planning-nav-collapsed-v1') ?? '[]'); return Array.isArray(saved) ? saved.filter((key): key is string => typeof key === 'string') : [] } catch { return [] } })
  const toggleNav = (key: string) => setCollapsed((now) => { const next = now.includes(key) ? now.filter((entry) => entry !== key) : [...now, key]; try { localStorage.setItem('demand-planning-nav-collapsed-v1', JSON.stringify(next)) } catch { /* this visit only */ } return next })
  const navButton = (key: string, icon: string, label: string, active: boolean, onClick: () => void) => <button key={key} className={active ? 'nav-active' : ''} aria-current={active ? 'page' : undefined} onClick={onClick}><span className="nav-icon">{icon}</span>{label}</button>
  // Azure DevOps connections live at the top of Settings.
  const openConnection = () => { settingsTabOnOpen('connections'); setPage('admin') }
  const pageProps = { store, month, setMonth }
  const buildStatus = <BuildStatus pending={store.hasPendingSave} failed={store.ready && (store.cache.status === 'error' || (store.connection.mode === 'sharepoint' && ['error', 'conflict'].includes(store.connection.status)))} busy={azure.busy} preview={Boolean(azure.preview)} onBackup={store.ready ? () => exportStateJson({ ...store.state, azureWorkItems: mergeAzureWorkItems(store.state.azureWorkItems ?? [], azure.preview?.items ?? []), ...(azure.preview ? { azureBacklogScope: azure.preview.scope } : {}) }) : undefined} />
  const storageLabel = store.connection.mode === 'sharepoint' ? '● Live SharePoint' : store.cache.status === 'error' ? '⚠ Not saved locally' : store.cache.status === 'saving' ? '◌ Saving locally' : '○ Local IndexedDB'

  if (!store.ready) return <main className="content"><h1>Demand Planning</h1>{store.loadError ? <Notice tone="error"><p>{store.loadError}</p><p>Do not clear browser data. If you still have an older tab open with unsaved changes, export its JSON backup first.</p><button className="primary" onClick={store.retryLoad}>Retry loading saved data</button></Notice> : <p role="status">Loading saved browser data…</p>}{buildStatus}</main>

  return <HeaderSlot.Provider value={headerSlot}><div className={`app-shell${navOpen ? ' nav-open' : ''}`}>
    {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} aria-hidden="true" />}
    <aside className="sidebar" id="primary-navigation">
      <div className="brand"><div className="brand-mark">DP</div><div><strong>Demand Planning</strong><span>Quality Engineering</span></div></div>
      <nav aria-label="Primary navigation">{pageGroups.map((group) => {
        const pageButton = (item: typeof pages[number]) => !allowed(item.id) ? [] : [<button key={item.id} className={page === item.id ? 'nav-active' : ''} aria-current={page === item.id ? 'page' : undefined} onClick={() => setPage(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}{item.id === 'mywork' && my.pending.length > 0 && <span className="nav-badge" aria-label={`${my.pending.length} pending`}>{my.pending.length}</span>}</button>]
        const windchillMeta = pageMeta('windchill')
        // Release Details has two sub-lists: the default Azure streams (DP, CP, IOCC, Content, Tool Validations) and the
        // Windchill streams (S&S IT; ECP later), each in a fixed order. Other connections and exports go under "Other views".
        const sections: { key: string; label?: string; entries: React.ReactNode[] }[] = group === 'Release Details' ? [
          // The default streams in order; one without a connection (shown in the menu) leads to Settings to set it up.
          { key: 'release:ads', label: 'Azure DevOps Server', entries: access.sees('release') ? defaultStreams.filter((stream) => stream.source === 'azure').map((stream) => { const profile = profileForStream(stream, azure.connectionProfiles), entry = profile && views.find((item) => item.id === profile.id); return entry ? navButton(`view:${entry.id}`, pageMeta('board').icon, stream.name, page === 'board' && view.id === entry.id, () => openView(entry.id)) : <button key={`stream:${stream.name}`} className="nav-missing" title={`Not set up: add a connection named “${stream.name}”`} onClick={openConnection}><span className="nav-icon">＋</span>{stream.name}</button> }) : [] },
          { key: 'release:windchill', label: 'Windchill exports', entries: access.sees('release') ? [...defaultStreams.filter((stream) => stream.source === 'windchill').map((stream) => { const entry = exportForStream(stream, windchillViews); return entry ? navButton(entry.id, windchillMeta.icon, stream.name, page === 'windchill' && windchillView?.id === entry.id, () => openWindchill(entry.id)) : <button key={`stream:${stream.name}`} className="nav-missing" title={`Not imported yet: import a Windchill export named “${stream.name}”`} onClick={() => openWindchill('')}><span className="nav-icon">＋</span>{stream.name}</button> }), ...(access.can('windchill.import') ? [navButton('windchill', '＋', windchillMeta.label, page === 'windchill' && !windchillView, () => openWindchill(''))] : [])] : [] },
        ] : group === 'Other views' ? [{ key: group, entries: [
          ...others.azure.filter((entry) => access.sees(entry.onPrem ? 'release' : 'board')).map((entry) => navButton(`view:${entry.id}`, pageMeta('board').icon, entry.name, page === 'board' && view.id === entry.id, () => openView(entry.id))),
          ...(access.sees('release') ? others.windchill.map((entry) => navButton(entry.id, pageMeta('windchill').icon, entry.name, page === 'windchill' && windchillView?.id === entry.id, () => openWindchill(entry.id))) : []),
        ] }] : [{ key: group, entries: pages.filter((item) => item.group === group).flatMap((item) => item.id === 'board' ? (access.sees('board') ? views.filter((entry) => !entry.readOnly).map((entry) => navButton(`view:${entry.id}`, item.icon, entry.name, page === 'board' && view.id === entry.id, () => openView(entry.id))) : []) : pageButton(item)) }]
        const shown = sections.filter((section) => section.entries.length)
        if (!shown.length) return null
        const open = !collapsed.includes(group)
        const holdsActive = group === (isOther ? 'Other views' : page === 'board' ? (view.onPrem ? 'Release Details' : 'I&D Board') : meta.group)
        return <div key={group} className="nav-section">
          <button type="button" className={`nav-group${holdsActive && !open ? ' nav-group-active' : ''}`} aria-expanded={open} onClick={() => toggleNav(group)}><span aria-hidden="true">{open ? '▾' : '▸'}</span>{group.toUpperCase()}</button>
          {/* Collapsed lists stay in the page but are hidden on wide screens only: the narrow sidebar has no headings. */}
          <div className={`nav-items${open ? '' : ' nav-collapsed'}`}>{shown.map((section) => section.label ? <div key={section.key} className="nav-subsection">
            <button type="button" className="nav-subgroup" aria-expanded={!collapsed.includes(section.key)} onClick={() => toggleNav(section.key)}><span aria-hidden="true">{collapsed.includes(section.key) ? '▸' : '▾'}</span>{section.label}</button>
            <div className={`nav-items${collapsed.includes(section.key) ? ' nav-collapsed' : ''}`}>{section.entries}</div>
          </div> : <div key={section.key} className="nav-items">{section.entries}</div>)}</div>
        </div>
      })}</nav>
      <div className="sidebar-footer"><DesktopDownload /><small className="storage-line" title="Where app data is saved">{storageLabel}</small>{buildStatus}</div>
    </aside>
    <main>
      <header className="topbar"><button type="button" className="menu-button" aria-label={navOpen ? 'Close menu' : 'Open menu'} aria-expanded={navOpen} aria-controls="primary-navigation" onClick={() => setNavOpen((open) => !open)}>{navOpen ? '✕' : '☰'}</button><h1 title={meta.detail}>{page === 'board' ? view.name : page === 'windchill' && windchillView ? windchillView.name : meta.label}</h1><div className="topbar-slot" ref={setHeaderSlot} /><div className="topbar-actions"><DataStatus azure={azure} />{(meta.usesMonth || (page === 'board' && view.readOnly)) && <label className="month-picker"><span className="sr-only">Month</span><input type="month" aria-label="Month" value={month} onChange={(event) => /^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value) && setMonth(event.target.value)} /></label>}<ThemeToggle /></div></header>
      <DataNotices azure={azure} onOpenConnection={openConnection} />
      {store.cache.status === 'error' && <Notice tone="error"><p>{store.cache.message}</p><div className="button-row"><button className="ghost" onClick={() => exportStateJson(store.state)}>Export JSON backup now</button><button className="primary" onClick={store.retrySave}>Retry browser save</button></div></Notice>}
      {store.connection.mode !== 'sharepoint' && store.connection.status === 'error' && <Notice tone="error">{store.connection.message}</Notice>}
      {page === 'overview' && <DashboardPage month={month} azure={azure} navigate={setPage} store={store} setMonth={setMonth} my={my} />}
      {page === 'pulse' && <PulseCheckPage month={month} azure={azure} store={store} my={my} navigate={setPage} windchill={windchill} openWindchill={openWindchill} />}
      {page === 'pireview' && <PiReviewPage />}
      {page === 'qemapping' && <QeMappingPage />}
      {page === 'mywork' && <MyWorkPage azure={azure} store={store} my={my} onOpenBulk={() => setPage('bulk')} assign={assign} featureSetup={featureSetup.setups} />}
      {page === 'bulk' && <BulkActionsPage azure={azure} store={store} my={my} assign={assign} />}
      {page === 'monthly' && <MonthlyPage azure={azure} month={month} store={store} my={my} />}
      {page === 'baselines' && <BaselinesPage azure={azure} month={month} store={store} git={git} onOpenSettings={() => { settingsTabOnOpen('storage'); setPage('admin') }} canEdit={access.can('baselines.edit')} />}
      {page === 'windchill' && (windchillView ? <WindchillPage view={windchillView} windchill={windchill} git={git} gitNote={git.snapshotNotes[`wc:${windchillView.id}`]} /> : access.can('windchill.import') ? <WindchillExportImport windchill={windchill} git={git} onImported={openWindchill} /> : <Notice tone="info">Your role does not include importing Windchill exports. Open an export from the menu; an Admin can change this in Settings → Access.</Notice>)}
      {page === 'health' && <BacklogHealthPage azure={azure} store={store} />}
      {page === 'board' && <BoardPage azure={azure} store={store} current={view} month={month} git={git} onOpenConnection={openConnection} assign={assign} featureSetup={featureSetup.setups} />}
      {page === 'snapshots' && <SnapshotsPage {...pageProps} />}
      {page === 'admin' && <AdminPage {...pageProps} azure={azure} git={git} access={access} featureSetup={featureSetup} loadEverything={loadEverything} onOpenBoard={() => setPage('board')} />}
      {page === 'docs' && <DocsPage />}
    </main>
  </div></HeaderSlot.Provider>
}
