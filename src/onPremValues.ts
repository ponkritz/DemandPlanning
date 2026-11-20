import { createContext, useContext } from 'react'
import type { AzureWorkItem } from './domain'
import { fieldOf } from './dpReleases.ts'

// EPS-06: the values of an on-prem field (e.g. Custom.Program) across the fetched on-prem data — the release source and
// every fetched view — for the drop-down of a Feature field that names it. Distinct (case ignored), sorted, at most 500.
type Sources = { items: Pick<AzureWorkItem, 'fields'>[] }[]
const cache = new WeakMap<Sources, Map<string, string[]>>()
export function onPremValues(sources: Sources, source: string): string[] {
  const name = source.trim()
  if (!name) return []
  let bySource = cache.get(sources)
  if (!bySource) { bySource = new Map(); cache.set(sources, bySource) }
  const known = bySource.get(name.toLowerCase())
  if (known) return known
  const seen = new Map<string, string>()
  for (const entry of sources) for (const item of entry.items) {
    const value = fieldOf(item, name)?.trim()
    if (value && value.length <= 255 && !seen.has(value.toLowerCase())) seen.set(value.toLowerCase(), value)
    if (seen.size >= 500) break
  }
  const values = [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  bySource.set(name.toLowerCase(), values)
  return values
}
// Provided by the app from the fetched data; without a provider no values are known.
export const OnPremContext = createContext<Sources>([])
export const useOnPremSources = () => useContext(OnPremContext)
