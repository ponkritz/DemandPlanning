// NAV-45 My page usage: an opt-in count of the pages this person opens, kept only in this browser's local storage —
// never sent, shared through Git or SharePoint, or put in a backup. Off by default; turning it off deletes the counts.
// It shows which pages are used, to decide what to improve or retire.
import { pages, type Page } from './pages/registry.ts'

export const usageKey = 'demand-planning-usage-v1'
export interface UsageCounts { enabled: boolean; since?: string; counts: Partial<Record<Page, number>> }
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const known = new Set<string>(pages.map((page) => page.id))
const off: UsageCounts = { enabled: false, counts: {} }

export function loadUsage(storage: Pick<Storage, 'getItem'> = localStorage): UsageCounts {
  try {
    const raw = JSON.parse(storage.getItem(usageKey) ?? 'null') as unknown
    if (!raw || typeof raw !== 'object' || (raw as UsageCounts).enabled !== true) return { ...off, counts: {} }
    const counts: Partial<Record<Page, number>> = {}
    for (const [page, count] of Object.entries((raw as UsageCounts).counts ?? {})) if (known.has(page) && Number.isInteger(count) && (count as number) > 0 && (count as number) < 1e9) counts[page as Page] = count as number
    const since = typeof (raw as UsageCounts).since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test((raw as UsageCounts).since!) ? (raw as UsageCounts).since : undefined
    return { enabled: true, ...(since ? { since } : {}), counts }
  } catch { return { ...off, counts: {} } }
}

const save = (value: UsageCounts, storage: Store) => { try { if (value.enabled) storage.setItem(usageKey, JSON.stringify(value)); else storage.removeItem(usageKey) } catch { /* this visit only */ } }

// On: counting starts today from zero. Off: the counts are deleted.
export function setUsageEnabled(enabled: boolean, storage: Store = localStorage, today = new Date().toISOString().slice(0, 10)): UsageCounts {
  const value: UsageCounts = enabled ? { enabled: true, since: today, counts: {} } : { ...off, counts: {} }
  save(value, storage)
  return value
}

// One more opening of a page; nothing happens while counting is off.
export function recordVisit(page: Page, storage: Store = localStorage): UsageCounts {
  const current = loadUsage(storage)
  if (!current.enabled || !known.has(page)) return current
  const next = { ...current, counts: { ...current.counts, [page]: (current.counts[page] ?? 0) + 1 } }
  save(next, storage)
  return next
}

// The counted pages, most used first, with their menu labels.
export const usageRows = (usage: UsageCounts) => Object.entries(usage.counts).map(([id, count]) => ({ id: id as Page, label: pages.find((page) => page.id === id)?.label ?? id, count: count ?? 0 })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
