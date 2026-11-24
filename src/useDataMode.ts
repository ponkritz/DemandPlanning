import { useCallback, useState } from 'react'
import type { PersonalViewsStore } from './usePersonalViews'

// OND-63: Live | Sample per table page and per person — Live by default. Kept in the person's own views (personal views,
// MYD-08, key `data-mode:<page-id>`, "sample" or "live") so it follows them to another computer, and in this browser for
// a viewer without personal views in Git. Only the page's data shown changes: nothing is written to the page's file.
export type DataMode = 'live' | 'sample'
export const dataModeKey = (pageId: string) => `data-mode:${pageId}`
export const dataModeLocalKey = 'demand-planning-od-data-mode-v1'
export const readDataMode = (value: unknown): DataMode | undefined => value === 'sample' ? 'sample' : value === 'live' ? 'live' : undefined
function localModes(): Record<string, DataMode> {
  try {
    const raw = JSON.parse(localStorage.getItem(dataModeLocalKey) ?? '{}') as unknown
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    return Object.fromEntries(Object.entries(raw as Record<string, unknown>).flatMap(([id, value]) => { const mode = readDataMode(value); return mode && /^[a-z0-9][a-z0-9-]{0,39}$/.test(id) ? [[id, mode]] : [] }))
  } catch { return {} }
}

export function useDataMode(views?: PersonalViewsStore) {
  // A change here shows at once; the personal views follow (their own save to Git a moment later).
  const [local, setLocal] = useState(localModes)
  const modeOf = useCallback((pageId: string): DataMode => readDataMode(views?.filter(dataModeKey(pageId), (value) => value)) ?? local[pageId] ?? 'live', [views, local])
  const setMode = (pageId: string, mode: DataMode) => {
    const next = { ...local, [pageId]: mode }
    if (mode === 'live') delete next[pageId]
    setLocal(next)
    try { localStorage.setItem(dataModeLocalKey, JSON.stringify(next)) } catch { /* this visit only */ }
    views?.setFilter(dataModeKey(pageId), mode)
  }
  return { modeOf, isSample: (pageId: string) => modeOf(pageId) === 'sample', setMode }
}
export type DataModeStore = ReturnType<typeof useDataMode>
