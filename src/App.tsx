import { useMemo, useState } from 'react'
import './App.css'
import { useAppStore } from './store'
import { effectiveActualsOpen, effectivePlanningOpen } from './rules'
import { Pill } from './components/ui'
import { DashboardPage } from './pages/DashboardPage'
import { ActivitiesPage } from './pages/ActivitiesPage'
import { MonthlyPage } from './pages/MonthlyPage'
import { BaselinesPage } from './pages/BaselinesPage'
import { ReleasesPage } from './pages/ReleasesPage'
import { MigrationPage } from './pages/MigrationPage'
import { SnapshotsPage } from './pages/SnapshotsPage'
import { AdminPage } from './pages/AdminPage'
import { AzureDevOpsPage } from './pages/AzureDevOpsPage'
import { BoardPage } from './pages/BoardPage'
import { useAzureWorkspace } from './useAzureWorkspace'
import { exportStateJson } from './download'
import { BuildStatus } from './components/BuildStatus'
import { mergeAzureWorkItems } from './azureDevOps'
import { indiaMonth } from './azureInsights'

export type Page = 'overview' | 'activities' | 'monthly' | 'baselines' | 'releases' | 'board' | 'azure' | 'migration' | 'snapshots' | 'admin'

const nav: Array<{ id: Page; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: '▦' },
  { id: 'activities', label: 'Activities', icon: '✓' },
  { id: 'monthly', label: 'Monthly effort', icon: '◫' },
  { id: 'baselines', label: 'Baselines', icon: '⌁' },
  { id: 'releases', label: 'Releases', icon: '◆' },
  { id: 'board', label: 'Backlogs', icon: '▤' },
  { id: 'azure', label: 'Azure DevOps', icon: '⇄' },
  { id: 'migration', label: 'Migration', icon: '⇧' },
  { id: 'snapshots', label: 'Snapshots', icon: '▣' },
  { id: 'admin', label: 'Administration', icon: '⚙' },
]

export default function App() {
  const store = useAppStore()
  const azure = useAzureWorkspace(store)
  const [page, setPage] = useState<Page>('overview')
  const [month, setMonth] = useState(() => indiaMonth(new Date().toISOString())!)
  const period = useMemo(() => store.state.periods.find((item) => item.month === month) ?? store.state.periods[0], [month, store.state.periods])
  const planningOpen = period ? effectivePlanningOpen(period) : true
  const actualsOpen = period ? effectiveActualsOpen(period) : true
  const pageProps = { store, month, setMonth }
  const buildStatus = <BuildStatus pending={store.hasPendingSave} failed={store.ready && (store.cache.status === 'error' || (store.connection.mode === 'sharepoint' && ['error', 'conflict'].includes(store.connection.status)))} busy={azure.busy} preview={Boolean(azure.preview)} onBackup={store.ready ? () => exportStateJson({ ...store.state, azureWorkItems: mergeAzureWorkItems(store.state.azureWorkItems ?? [], azure.preview?.items ?? []), ...(azure.preview ? { azureBacklogScope: azure.preview.scope } : {}) }) : undefined} />

  if (!store.ready) return <main className="content"><h1>Demand Planning</h1>{store.loadError ? <div className="notice error" role="alert"><p>{store.loadError}</p><p>Do not clear browser data. If you still have an older tab open with unsaved changes, export its JSON backup first.</p><button className="primary" onClick={store.retryLoad}>Retry loading saved data</button></div> : <p role="status">Loading saved browser data…</p>}{buildStatus}</main>

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">DP</div><div><strong>Demand Planning</strong><span>Quality Engineering</span></div></div>
      <nav aria-label="Primary navigation">{nav.map((item) => <button key={item.id} className={page === item.id ? 'nav-active' : ''} onClick={() => setPage(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}</button>)}</nav>
      <div className="sidebar-footer">{buildStatus}</div>
    </aside>
    <main>
      <header className="topbar"><div><p className="eyebrow">{monthName(month).toUpperCase()}</p><h1>{nav.find((item) => item.id === page)?.label}</h1></div><div className="topbar-actions"><Pill tone={store.connection.mode === 'sharepoint' ? 'open' : store.cache.status === 'error' || store.connection.status === 'error' || store.connection.status === 'conflict' ? 'danger' : 'neutral'}>{store.connection.mode === 'sharepoint' ? '● Live SharePoint' : store.cache.status === 'error' ? '⚠ Not saved locally' : store.cache.status === 'saving' ? '◌ Saving locally' : '○ Local IndexedDB'}</Pill><label className="month-picker">Month<input type="month" value={month} onChange={(event) => /^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value) && setMonth(event.target.value)} /></label>{page !== 'overview' && <><Pill tone={planningOpen ? 'open' : 'locked'}>Planning {planningOpen ? 'open' : 'locked'}</Pill><Pill tone={actualsOpen ? 'open' : 'locked'}>Actuals {actualsOpen ? 'open' : 'locked'}</Pill></>}</div></header>
      {store.cache.status === 'error' && <div className="notice error" role="alert"><p>{store.cache.message}</p><div className="button-row"><button className="ghost" onClick={() => exportStateJson(store.state)}>Export JSON backup now</button><button className="primary" onClick={store.retrySave}>Retry browser save</button></div></div>}
      {store.connection.mode !== 'sharepoint' && store.connection.status === 'error' && <div className="notice error" role="alert">{store.connection.message}</div>}
      {page === 'overview' && <DashboardPage month={month} azure={azure} navigate={setPage} />}
      {page === 'activities' && <ActivitiesPage azure={azure} />}
      {page === 'monthly' && <MonthlyPage azure={azure} month={month} store={store} />}
      {page === 'baselines' && <BaselinesPage azure={azure} month={month} />}
      {page === 'releases' && <ReleasesPage azure={azure} month={month} />}
      {page === 'board' && <BoardPage azure={azure} onOpenConnection={() => setPage('azure')} />}
      {page === 'azure' && <AzureDevOpsPage azure={azure} onOpenBoard={() => setPage('board')} />}
      {page === 'migration' && <MigrationPage {...pageProps} />}
      {page === 'snapshots' && <SnapshotsPage {...pageProps} />}
      {page === 'admin' && <AdminPage {...pageProps} />}
    </main>
  </div>
}

function monthName(month: string) {
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`))
}
