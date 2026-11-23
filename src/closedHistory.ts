import type { AzureWorkItem } from './domain'
import type { AzureRequest } from './azureClient.ts'
import { isFinishedState } from './workStates.ts'

// Owner decision 10: when a finished item has no Closed Date (Resolved, or a process that does not set it), its close
// date comes from the item itself — State Change Date, else Resolved Date — and, when neither is there, from its
// history: the change that moved it into a finished state. History is read at most `limit` items per fetch and kept per
// item and revision (changed date), so it is read once. The last-changed date is used only when nothing else tells.
export interface HistoryUpdate { revisedDate?: string; fields?: Record<string, { oldValue?: unknown; newValue?: unknown }> }

export function closedDateFromUpdates(updates: HistoryUpdate[]): string | undefined {
  let found: string | undefined
  for (const update of updates) {
    const state = update.fields?.['System.State']
    if (!state || !isFinishedState(String(state.newValue ?? '')) || isFinishedState(String(state.oldValue ?? ''))) continue
    const when = update.fields?.['System.ChangedDate']?.newValue ?? update.fields?.['Microsoft.VSTS.Common.StateChangeDate']?.newValue
    if (typeof when === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(when)) found = when
  }
  return found
}

const cacheKey = 'demand-planning-closed-history-v1'
type Cache = Record<string, string>
function readCache(storage?: Pick<Storage, 'getItem'>): Cache { try { const raw = JSON.parse(storage?.getItem(cacheKey) ?? '{}') as unknown; return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Cache : {} } catch { return {} } }
function writeCache(cache: Cache, storage?: Pick<Storage, 'setItem'>) { try { storage?.setItem(cacheKey, JSON.stringify(cache)) } catch { /* read again next time */ } }
const defaultStorage = () => (typeof localStorage === 'undefined' ? undefined : localStorage)

export async function fillClosedDates(items: AzureWorkItem[], read: (operation: AzureRequest['operation'], extra: Partial<AzureRequest>) => Promise<unknown>, { limit = 200, storage = defaultStorage() }: { limit?: number; storage?: Storage } = {}): Promise<AzureWorkItem[]> {
  const cache = readCache(storage)
  let reads = 0, changed = false
  const out: AzureWorkItem[] = []
  for (const item of items) {
    if (item.closedDate || !isFinishedState(item.state)) { out.push(item); continue }
    const key = `${item.key}@${item.changedDate ?? ''}`
    let date = cache[key]
    if (!date && reads < limit) {
      reads += 1
      try {
        const page = await read('updates', { workItemId: item.id }) as { value?: HistoryUpdate[] }
        date = Array.isArray(page?.value) ? closedDateFromUpdates(page.value) ?? '' : ''
        if (date) { cache[key] = date; changed = true }
      } catch { date = '' }
    }
    out.push(date ? { ...item, closedDate: date, closedDateFrom: 'history' } : item)
  }
  if (changed) writeCache(cache, storage)
  return out
}
