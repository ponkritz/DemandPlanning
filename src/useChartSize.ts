import { createContext, useContext, useState } from 'react'
import { chartSizeKey, parseChartSize, resolveChartSize, sameSize, storedSize, type ChartSize, type GridKind } from './chartSize'
import type { PersonalViewsStore } from './usePersonalViews'

// CHT-17…CHT-20, CHT-48 Where chart sizes are kept (in grid units w × h, with the nearest presets for older apps): the viewer's own size of a chart in personal views (Git per person, MYD-06)
// and in this browser (a fallback without Git), the Tool Owner's size for everyone of a built-in chart in the shared
// views defaults (as Column options → Save for everyone, BKL-47). View as is read only (VAS): a size chosen while
// viewing as someone else lasts until the page is left and is never saved.
export interface ChartSizeEnv { views?: PersonalViewsStore; viewOnly: boolean; canSetDefault: boolean }
export const ChartSizeEnvContext = createContext<ChartSizeEnv>({ viewOnly: false, canSetDefault: false })
// The height factor of the chart drawn inside a sized panel (Medium = 1, today's height).
export const ChartHeightContext = createContext(1)
export const useChartHeight = (base: number) => Math.round(base * useContext(ChartHeightContext))
export const useHeightFactor = () => useContext(ChartHeightContext)

const localKey = 'demand-planning-chart-sizes-v1'
function readLocal(): Record<string, unknown> {
  try {
    const raw = JSON.parse(localStorage.getItem(localKey) ?? '{}') as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [id, value] of Object.entries(raw && typeof raw === 'object' ? raw : {}).slice(0, 500)) { if (parseChartSize(value) && chartSizeKey(id)) out[id] = value }
    return out
  } catch { return {} }
}
function writeLocal(map: Record<string, unknown>) { try { localStorage.setItem(localKey, JSON.stringify(map)) } catch { /* convenience only */ } }

export function useChartSizes() {
  const env = useContext(ChartSizeEnvContext)
  const [local, setLocal] = useState(readLocal)
  const [session, setSession] = useState<Record<string, ChartSize | null>>({})
  const own = (id: string, kind: GridKind = 'chart'): Partial<ChartSize> | undefined => {
    if (env.viewOnly && id in session) return session[id] ?? undefined
    // Personal views keep their own copy in this browser too; without them, this browser's list.
    const key = chartSizeKey(id)
    return parseChartSize(env.views?.ownFilter ? key ? env.views.ownFilter(key) : undefined : local[id], kind)
  }
  const shared = (id: string, kind: GridKind = 'chart'): Partial<ChartSize> | undefined => { const key = chartSizeKey(id); return key && env.views?.sharedFilter ? parseChartSize(env.views.sharedFilter(key), kind) : undefined }
  const resolve = (id: string, factory: ChartSize, owner?: Partial<ChartSize>, kind: GridKind = 'chart') => resolveChartSize({ viewer: own(id, kind), owner, factory })
  // The viewer's size: the same as the default removes it (the chart follows the default again).
  const setOwn = (id: string, size: ChartSize | undefined, base?: ChartSize, kind: GridKind = 'chart') => {
    const clear = !size || (base && sameSize(size, base))
    if (env.viewOnly) { setSession((current) => ({ ...current, [id]: clear ? null : size! })); return }
    const key = chartSizeKey(id)
    const next = { ...local }
    if (clear) delete next[id]
    else next[id] = storedSize(size!, kind)
    setLocal(next); writeLocal(next)
    if (!key || !env.views) return
    if (clear) env.views.clearFilter?.(key)
    else env.views.setFilter(key, storedSize(size!, kind))
  }
  // A Tool Owner's size of a built-in chart for everyone (null: the factory size again).
  const saveShared = async (id: string, size: ChartSize | null, kind: GridKind = 'chart') => {
    const key = chartSizeKey(id)
    if (!key || !env.views || env.viewOnly) return
    await env.views.saveEntryAsDefault(key, size ? storedSize(size, kind) : null)
  }
  return { env, own, shared, resolve, setOwn, saveShared }
}
export type ChartSizes = ReturnType<typeof useChartSizes>
