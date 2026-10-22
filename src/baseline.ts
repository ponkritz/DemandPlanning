import type { AzureWorkItem } from './domain'
import { isMonthTask, timeWritingStoryIds } from './azureInsights.ts'

// Baseline = one estimation rule per stream, the same formula for every stream:
//   hours per unit × (base units + units per driver × driver count), capped at an optional maximum
// e.g. CP: 2h × (14 + 11 × assets), Serviceability: 2h × (0 + 1 × documents), max 60h.
// A release's scope (its driver count) is kept as a dated history, so a re-baseline after items are scoped in is
// visible as growth rather than overwriting the original estimate.
export interface BaselineRule { stream: string; hoursPerUnit: number; baseUnits: number; driver: string; unitsPerDriver: number; cap?: number }
export interface ScopeEntry { at: string; drivers: Record<string, number>; reason?: string }
export interface ReleaseScope { release: string; stream: string; history: ScopeEntry[] }

// Illustrative values from the planning conversation; replaced by the exact baseline when it is shared. DP's values
// are placeholders: its old rule used release types (Major/MLD/PU), which the uniform formula does not have.
export const exampleBaselineRules: BaselineRule[] = [
  { stream: 'DP', hoursPerUnit: 2, baseUnits: 10, driver: 'documents', unitsPerDriver: 1 },
  { stream: 'Serviceability', hoursPerUnit: 2, baseUnits: 0, driver: 'documents', unitsPerDriver: 1, cap: 60 },
  { stream: 'CP', hoursPerUnit: 2, baseUnits: 14, driver: 'assets', unitsPerDriver: 11 },
]

const finite = (value: unknown, min = 0) => { const number = Number(value); return Number.isFinite(number) && number >= min ? number : undefined }
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''

// Rules saved in the earlier shape ({ types, items[] }) are read as the uniform formula: the first line item is kept;
// a rule that only had release types becomes 0h per document, so the editor asks for its formula.
export function normalizeRules(value: unknown): BaselineRule[] {
  if (!Array.isArray(value)) return exampleBaselineRules
  const seen = new Set<string>()
  return value.flatMap((raw): BaselineRule[] => {
    if (!raw || typeof raw !== 'object') return []
    const input = raw as Record<string, unknown>
    const stream = text(input.stream)
    if (!stream || seen.has(stream.toLowerCase())) return []
    seen.add(stream.toLowerCase())
    const legacy = Array.isArray(input.items) ? input.items.find((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && finite((item as Record<string, unknown>).hoursPerUnit) != null) : undefined
    const from = input.hoursPerUnit != null || !legacy ? input : legacy
    const driver = text(from.driver)
    const cap = finite(input.cap)
    return [{ stream, hoursPerUnit: finite(from.hoursPerUnit) ?? 0, baseUnits: finite(from.baseUnits) ?? 0, driver: driver || 'documents', unitsPerDriver: driver ? finite(from.unitsPerDriver) ?? 0 : finite(from.unitsPerDriver) ?? 1, ...(cap ? { cap } : {}) }]
  })
}

export function normalizeScopes(value: unknown): ReleaseScope[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw): ReleaseScope[] => {
    if (!raw || typeof raw !== 'object') return []
    const input = raw as Record<string, unknown>
    const release = text(input.release), stream = text(input.stream)
    const history = (Array.isArray(input.history) ? input.history : []).flatMap((item): ScopeEntry[] => {
      if (!item || typeof item !== 'object') return []
      const entry = item as Record<string, unknown>
      if (!Number.isFinite(Date.parse(text(entry.at)))) return []
      const drivers: Record<string, number> = {}
      if (entry.drivers && typeof entry.drivers === 'object' && !Array.isArray(entry.drivers)) for (const [name, count] of Object.entries(entry.drivers)) { const value = finite(count); if (name.trim() && value != null) drivers[name.trim()] = value }
      return [{ at: text(entry.at), drivers, ...(text(entry.reason) ? { reason: text(entry.reason) } : {}) }]
    }).sort((a, b) => a.at.localeCompare(b.at))
    return release && stream && history.length ? [{ release, stream, history }] : []
  })
}

// Human-readable formula, e.g. "2h × (14 + 11 × assets) · max 60h".
export function describeRule(rule: BaselineRule) {
  const driverPart = rule.unitsPerDriver ? `${rule.unitsPerDriver === 1 ? '' : `${rule.unitsPerDriver} × `}${rule.driver}` : ''
  const units = [rule.baseUnits ? String(rule.baseUnits) : '', driverPart].filter(Boolean).join(' + ') || '0'
  return `${rule.hoursPerUnit}h × ${units.includes('+') ? `(${units})` : units}${rule.cap ? ` · max ${rule.cap}h` : ''}`
}

export interface BaselineResult { total: number; units: number; uncapped: number; capped: boolean; missing: string[] }
export function baselineHours(rule: BaselineRule, scope: Pick<ScopeEntry, 'drivers'>): BaselineResult {
  const needsDriver = rule.unitsPerDriver > 0
  const count = scope.drivers[rule.driver]
  const missing = needsDriver && count == null ? [rule.driver] : []
  const units = rule.baseUnits + (needsDriver ? (count ?? 0) * rule.unitsPerDriver : 0)
  const uncapped = units * rule.hoursPerUnit
  const capped = rule.cap != null && uncapped > rule.cap
  return { total: capped ? rule.cap! : uncapped, units, uncapped, capped, missing }
}

const sameStream = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

// One row per release (a Feature under a stream Epic that has a rule): current scope and baseline, the baseline at
// first scoping, and actual hours = Completed Work on that Feature's Time Writing Tasks across all months.
export interface ReleaseBaselineRow { stream: string; feature: AzureWorkItem; rule: BaselineRule; scope?: ReleaseScope; current?: BaselineResult; original?: BaselineResult; actual: number; variance: number | null; growth: number | null }
export function releaseBaselines(source: AzureWorkItem[], rules: BaselineRule[], scopes: ReleaseScope[]): ReleaseBaselineRow[] {
  const items = [...new Map(source.filter((item) => item.state.trim().toLowerCase() !== 'removed').map((item) => [item.key, item])).values()]
  const byId = new Map(items.map((item) => [item.id, item]))
  const featureOf = (item: AzureWorkItem) => { let current = item.parentId == null ? undefined : byId.get(item.parentId); const seen = new Set<number>(); while (current && current.workItemType !== 'Feature' && !seen.has(current.id)) { seen.add(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId) } return current?.workItemType === 'Feature' ? current : undefined }
  const storyIds = timeWritingStoryIds(items)
  const actual = new Map<number, number>()
  for (const task of items) {
    if (task.workItemType !== 'Task' || !(isMonthTask(task) || (task.parentId != null && storyIds.has(task.parentId)))) continue
    const feature = featureOf(task)
    if (feature) actual.set(feature.id, (actual.get(feature.id) ?? 0) + (Number.isFinite(task.completedWork) ? Math.max(0, task.completedWork!) : 0))
  }
  const rows: ReleaseBaselineRow[] = []
  for (const rule of rules) {
    const epics = items.filter((item) => item.workItemType === 'Epic' && sameStream(item.title, rule.stream))
    for (const feature of items.filter((item) => item.workItemType === 'Feature' && epics.some((epic) => epic.id === item.parentId)).sort((a, b) => a.title.localeCompare(b.title))) {
      const scope = scopes.find((entry) => sameStream(entry.stream, rule.stream) && entry.release === feature.title)
      const current = scope ? baselineHours(rule, scope.history[scope.history.length - 1]) : undefined
      const original = scope ? baselineHours(rule, scope.history[0]) : undefined
      const booked = actual.get(feature.id) ?? 0
      rows.push({ stream: rule.stream, feature, rule, scope, current, original, actual: booked, variance: current ? booked - current.total : null, growth: current && original ? current.total - original.total : null })
    }
  }
  return rows
}
