import { useState, type ReactNode } from 'react'

// Release pages (QV-47, UI-STANDARDS §7 and §10): the Releases table and the source data — the raw query output or
// the imported rows — are two tabs of the page, "Releases | Source data (n)", not one long page with the raw rows at
// the bottom. The Releases tab opens first; the choice is kept per page in this browser tab.
// TVL-08: a page may add tabs of its own after the main one; a page without source data leaves its tab out.
// TVL-14: a page may name its main tab's key and choose which tab a remembered key opens (open) — the Tool Validations
// page opens its Expiry list and maps the tabs it had before.
const storageKey = 'demand-planning-result-tab-v1'
export interface ExtraTab { key: string; label: string; node: ReactNode }
function remembered(id: string): string { try { const value = JSON.parse(sessionStorage.getItem(storageKey) ?? '{}')[id]; return typeof value === 'string' ? value : '' } catch { return '' } }
function remember(id: string, tab: string) { try { const all = JSON.parse(sessionStorage.getItem(storageKey) ?? '{}'); sessionStorage.setItem(storageKey, JSON.stringify({ ...all, [id]: tab })) } catch { /* this visit only */ } }
const firstKnown = (chosen: string, keys: string[]) => keys.includes(chosen) ? chosen : keys[0]

export function ResultTabs({ id, main, raw, mainKey = 'main', mainLabel = 'Releases', rawLabel = 'Source data', rawCount, extra = [], open = firstKnown }: { id: string; main: ReactNode; raw?: ReactNode; mainKey?: string; mainLabel?: string; rawLabel?: string; rawCount?: number; extra?: ExtraTab[]; open?: (chosen: string, keys: string[]) => string }) {
  const [chosen, setTab] = useState<string>(() => remembered(id))
  const keys = [mainKey, ...extra.map((tab) => tab.key), ...(raw !== undefined ? ['raw'] : [])]
  const tab = open(chosen, keys)
  const choose = (next: string) => { setTab(next); remember(id, next) }
  const button = (key: string, label: string) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={`backlog-tab ${tab === key ? 'backlog-tab-active' : ''}`} onClick={() => choose(key)}>{label}</button>
  return <>
    <div className="overview-tabs result-tabs" role="tablist" aria-label="Result">
      {button(mainKey, mainLabel)}
      {extra.map((entry) => button(entry.key, entry.label))}
      {raw !== undefined && button('raw', `${rawLabel}${rawCount != null ? ` (${rawCount})` : ''}`)}
    </div>
    <div role="tabpanel">{tab === mainKey ? main : tab === 'raw' ? raw : extra.find((entry) => entry.key === tab)?.node}</div>
  </>
}
