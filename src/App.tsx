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

export type Page = 'overview' | 'activities' | 'monthly' | 'baselines' | 'releases' | 'migration' | 'snapshots' | 'admin'

const nav: Array<{ id: Page; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: '▦' },
  { id: 'activities', label: 'Activities', icon: '✓' },
  { id: 'monthly', label: 'Monthly effort', icon: '◫' },
  { id: 'baselines', label: 'Baselines', icon: '⌁' },
  { id: 'releases', label: 'Releases', icon: '◆' },
  { id: 'migration', label: 'Migration', icon: '⇧' },
  { id: 'snapshots', label: 'Snapshots', icon: '▣' },
  { id: 'admin', label: 'Administration', icon: '⚙' },
]

export default function App() {
  const store = useAppStore()
  const [page, setPage] = useState<Page>('overview')
  const [month, setMonth] = useState('2026-10')
  const period = useMemo(() => store.state.periods.find((item) => item.month === month) ?? store.state.periods[0], [month, store.state.periods])
  const planningOpen = period ? effectivePlanningOpen(period) : true
  const actualsOpen = period ? effectiveActualsOpen(period) : true
  const pageProps = { store, month, setMonth }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">DP</div><div><strong>Demand Planning</strong><span>Quality Engineering</span></div></div>
      <nav aria-label="Primary navigation">{nav.map((item) => <button key={item.id} className={page === item.id ? 'nav-active' : ''} onClick={() => setPage(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}</button>)}</nav>
      <div className="sidebar-footer"><span className="environment-dot" /> Desktop MVP<small>Local adapter · v0.1.0</small></div>
    </aside>
    <main>
      <header className="topbar"><div><p className="eyebrow">{monthName(month).toUpperCase()}</p><h1>{nav.find((item) => item.id === page)?.label}</h1></div><div className="topbar-actions"><Pill tone={store.connection.mode === 'sharepoint' ? 'open' : store.connection.status === 'error' || store.connection.status === 'conflict' ? 'danger' : 'neutral'}>{store.connection.mode === 'sharepoint' ? '● Live SharePoint' : '○ Local data'}</Pill><label className="month-picker">Month<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><Pill tone={planningOpen ? 'open' : 'locked'}>Planning {planningOpen ? 'open' : 'locked'}</Pill><Pill tone={actualsOpen ? 'open' : 'locked'}>Actuals {actualsOpen ? 'open' : 'locked'}</Pill></div></header>
      {page === 'overview' && <DashboardPage {...pageProps} navigate={setPage} />}
      {page === 'activities' && <ActivitiesPage {...pageProps} />}
      {page === 'monthly' && <MonthlyPage {...pageProps} />}
      {page === 'baselines' && <BaselinesPage {...pageProps} />}
      {page === 'releases' && <ReleasesPage {...pageProps} />}
      {page === 'migration' && <MigrationPage {...pageProps} />}
      {page === 'snapshots' && <SnapshotsPage {...pageProps} />}
      {page === 'admin' && <AdminPage {...pageProps} />}
    </main>
  </div>
}

function monthName(month: string) {
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`))
}
