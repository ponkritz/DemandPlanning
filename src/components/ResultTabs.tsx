import { useState, type ReactNode } from 'react'

// Release pages (QV-47, UI-STANDARDS §7 and §10): the Releases table and the source data — the raw query output or
// the imported rows — are two tabs of the page, "Releases | Source data (n)", not one long page with the raw rows at
// the bottom. The Releases tab opens first; the choice is kept per page in this browser tab.
const storageKey = 'demand-planning-result-tab-v1'
function remembered(id: string): 'main' | 'raw' { try { return JSON.parse(sessionStorage.getItem(storageKey) ?? '{}')[id] === 'raw' ? 'raw' : 'main' } catch { return 'main' } }
function remember(id: string, tab: 'main' | 'raw') { try { const all = JSON.parse(sessionStorage.getItem(storageKey) ?? '{}'); sessionStorage.setItem(storageKey, JSON.stringify({ ...all, [id]: tab })) } catch { /* this visit only */ } }

export function ResultTabs({ id, main, raw, mainLabel = 'Releases', rawLabel = 'Source data', rawCount }: { id: string; main: ReactNode; raw: ReactNode; mainLabel?: string; rawLabel?: string; rawCount?: number }) {
  const [tab, setTab] = useState<'main' | 'raw'>(() => remembered(id))
  const choose = (next: 'main' | 'raw') => { setTab(next); remember(id, next) }
  return <>
    <div className="overview-tabs result-tabs" role="tablist" aria-label="Result">
      <button type="button" role="tab" aria-selected={tab === 'main'} className={`backlog-tab ${tab === 'main' ? 'backlog-tab-active' : ''}`} onClick={() => choose('main')}>{mainLabel}</button>
      <button type="button" role="tab" aria-selected={tab === 'raw'} className={`backlog-tab ${tab === 'raw' ? 'backlog-tab-active' : ''}`} onClick={() => choose('raw')}>{rawLabel}{rawCount != null ? ` (${rawCount})` : ''}</button>
    </div>
    <div role="tabpanel">{tab === 'main' ? main : raw}</div>
  </>
}
