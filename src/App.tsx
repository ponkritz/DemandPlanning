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
import { DocsPage } from './pages/DocsPage'
import { BoardPage } from './pages/BoardPage'
import { useAzureWorkspace, type FetchListener, type GitDataSource } from './useAzureWorkspace'
import { sharedThroughGit } from './gitSnapshots'
import { useGitStorage } from './useGitStorage'
import { useWindchill } from './useWindchill'
import { WindchillExportImport, WindchillPage } from './components/WindchillViews'
import { useMyWork } from './useMyWork'
import { MyWorkPage } from './pages/MyWorkPage'
import { BulkActionsPage } from './pages/BulkActionsPage'
import { DesktopDownload } from './components/DesktopDownload'
import { exportStateJson } from './download'
import { BuildStatus } from './components/BuildStatus'
import { backlogViews, loadBacklogTab, saveBacklogTab, timeWritingView } from './backlogViews'
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
  // Desktop app: every on-prem read-only fetch is saved to Git, so the web app can show it.
  onFetched.current = (profile, source) => { if (window.azureDevOps && git.connected && !azure.isSample && sharedThroughGit(profile)) void git.pushSnapshot(profile, source) }
  // At start with Git storage: the shared connection setup in Git is the default for every user (connections
  // changed here are kept); the Windchill exports saved to Git are loaded too, and in the web app the on-prem view data.
  const pulled = useRef(false)
  useEffect(() => {
    if (pulled.current || !store.ready || !git.connected || azure.isSample || git.status === 'loading') return
    pulled.current = true
    const web = !window.azureDevOps
    void git.syncViews().catch(() => null)
      .then(() => web ? git.pullSnapshots() : undefined).catch(() => { /* shown when loading from Settings */ })
      .finally(() => azure.reloadConnectionProfiles())
    void git.pullWindchill().then(() => windchill.reload()).catch(() => { /* shown when loading from Git on the import page */ })
  }, [store.ready, git, azure, windchill])
  const my = useMyWork(azure, store)
  const [page, setPage] = useState<Page>('overview')
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null)
  // The selected month starts on the viewer's current month (their time zone).
  const [month, setMonth] = useState(() => todayIso().slice(0, 7))
  const meta = pageMeta(page)
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
  // Windchill exports, each in the sidebar under Release Details ('' = the import page).
  const windchillViews = windchill.views.filter((entry) => entry.exportFile && entry.showInMenu)
  const [windchillId, setWindchillId] = useState('')
  const windchillView = windchillViews.find((entry) => entry.id === windchillId)
  const openWindchill = (id: string) => { setWindchillId(id); setPage('windchill') }
  const navButton = (key: string, icon: string, label: string, active: boolean, onClick: () => void) => <button key={key} className={active ? 'nav-active' : ''} aria-current={active ? 'page' : undefined} onClick={onClick}><span className="nav-icon">{icon}</span>{label}</button>
  // Azure DevOps connections live at the top of Settings.
  const openConnection = () => setPage('admin')
  const pageProps = { store, month, setMonth }
  const buildStatus = <BuildStatus pending={store.hasPendingSave} failed={store.ready && (store.cache.status === 'error' || (store.connection.mode === 'sharepoint' && ['error', 'conflict'].includes(store.connection.status)))} busy={azure.busy} preview={Boolean(azure.preview)} onBackup={store.ready ? () => exportStateJson({ ...store.state, azureWorkItems: mergeAzureWorkItems(store.state.azureWorkItems ?? [], azure.preview?.items ?? []), ...(azure.preview ? { azureBacklogScope: azure.preview.scope } : {}) }) : undefined} />
  const storageLabel = store.connection.mode === 'sharepoint' ? '● Live SharePoint' : store.cache.status === 'error' ? '⚠ Not saved locally' : store.cache.status === 'saving' ? '◌ Saving locally' : '○ Local IndexedDB'

  if (!store.ready) return <main className="content"><h1>Demand Planning</h1>{store.loadError ? <Notice tone="error"><p>{store.loadError}</p><p>Do not clear browser data. If you still have an older tab open with unsaved changes, export its JSON backup first.</p><button className="primary" onClick={store.retryLoad}>Retry loading saved data</button></Notice> : <p role="status">Loading saved browser data…</p>}{buildStatus}</main>

  return <HeaderSlot.Provider value={headerSlot}><div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">DP</div><div><strong>Demand Planning</strong><span>Quality Engineering</span></div></div>
      <nav aria-label="Primary navigation">{pageGroups.filter((group) => group !== 'I&D Board' || views.some((entry) => !entry.onPrem)).map((group) => <div key={group} className="nav-section">{group !== 'Overview' && <p className="nav-group">{group.toUpperCase()}</p>}{group === 'Release Details' && views.filter((entry) => entry.onPrem).map((entry) => navButton(`view:${entry.id}`, pageMeta('board').icon, entry.name, page === 'board' && view.id === entry.id, () => openView(entry.id)))}{pages.filter((item) => item.group === group).flatMap((item) => item.id === 'windchill' ? [...windchillViews.map((entry) => navButton(entry.id, item.icon, entry.name, page === 'windchill' && windchillView?.id === entry.id, () => openWindchill(entry.id))), navButton(item.id, '＋', item.label, page === 'windchill' && !windchillView, () => openWindchill(''))] : item.id === 'board' ? views.filter((entry) => !entry.onPrem).map((entry) => navButton(`view:${entry.id}`, item.icon, entry.name, page === 'board' && view.id === entry.id, () => openView(entry.id))) : [<button key={item.id} className={page === item.id ? 'nav-active' : ''} aria-current={page === item.id ? 'page' : undefined} onClick={() => setPage(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}{item.id === 'mywork' && my.pending.length > 0 && <span className="nav-badge" aria-label={`${my.pending.length} pending`}>{my.pending.length}</span>}</button>])}</div>)}</nav>
      <div className="sidebar-footer"><DesktopDownload /><small className="storage-line" title="Where app data is saved">{storageLabel}</small>{buildStatus}</div>
    </aside>
    <main>
      <header className="topbar"><h1 title={meta.detail}>{page === 'board' ? view.name : page === 'windchill' && windchillView ? windchillView.name : meta.label}</h1><div className="topbar-slot" ref={setHeaderSlot} /><div className="topbar-actions"><DataStatus azure={azure} />{(meta.usesMonth || (page === 'board' && view.readOnly)) && <label className="month-picker"><span className="sr-only">Month</span><input type="month" aria-label="Month" value={month} onChange={(event) => /^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value) && setMonth(event.target.value)} /></label>}<ThemeToggle /></div></header>
      <DataNotices azure={azure} onOpenConnection={openConnection} />
      {store.cache.status === 'error' && <Notice tone="error"><p>{store.cache.message}</p><div className="button-row"><button className="ghost" onClick={() => exportStateJson(store.state)}>Export JSON backup now</button><button className="primary" onClick={store.retrySave}>Retry browser save</button></div></Notice>}
      {store.connection.mode !== 'sharepoint' && store.connection.status === 'error' && <Notice tone="error">{store.connection.message}</Notice>}
      {page === 'overview' && <DashboardPage month={month} azure={azure} navigate={setPage} store={store} setMonth={setMonth} my={my} />}
      {page === 'mywork' && <MyWorkPage azure={azure} store={store} my={my} onOpenBulk={() => setPage('bulk')} />}
      {page === 'bulk' && <BulkActionsPage azure={azure} store={store} my={my} />}
      {page === 'monthly' && <MonthlyPage azure={azure} month={month} store={store} my={my} />}
      {page === 'baselines' && <BaselinesPage azure={azure} month={month} store={store} git={git} onOpenSettings={() => setPage('admin')} />}
      {page === 'windchill' && (windchillView ? <WindchillPage view={windchillView} windchill={windchill} git={git} gitNote={git.snapshotNotes[`wc:${windchillView.id}`]} /> : <WindchillExportImport windchill={windchill} git={git} onImported={openWindchill} />)}
      {page === 'board' && <BoardPage azure={azure} store={store} current={view} month={month} git={git} onOpenConnection={openConnection} />}
      {page === 'snapshots' && <SnapshotsPage {...pageProps} />}
      {page === 'admin' && <AdminPage {...pageProps} azure={azure} git={git} onOpenBoard={() => setPage('board')} />}
      {page === 'docs' && <DocsPage />}
    </main>
  </div></HeaderSlot.Provider>
}
