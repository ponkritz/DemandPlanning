import { factoryOf, kindOf, sizeFromOptions } from './chartSize.ts'
import { chartKind } from './chartElements.ts'
import { blankNarrative, insightKindOf, type ColorPins, type Insight, type InsightType } from './onDemand.ts'

// CHT-70…CHT-73 The chart editor's tabs (the Insights chart pop-up and the On-Demand Dashboard block pop-up): which tabs a
// type takes, the count of settings changed from the defaults each tab shows, and the tab an error belongs to. Nothing
// here changes what is saved.

export type EditorTab = 'data' | 'filters' | 'format' | 'elements' | 'narrative'
export const editorTabLabels: Record<EditorTab, string> = { data: 'Data', filters: 'Filters', format: 'Format', elements: 'Elements', narrative: 'Narrative' }
export type EditorScope = 'page' | 'dashboard'

// CHT-70: Data and Filters always; a Narrative's own tab instead of Format and Elements; Elements only for a chart type
// with Excel's chart elements (bar / column, line, pie, Pareto); no Format for a Dashboard KPI tile (nothing to choose).
export function editorTabsFor(type: InsightType, scope: EditorScope = 'page'): EditorTab[] {
  if (type === 'narrative') return ['data', 'filters', 'narrative']
  const tabs: EditorTab[] = ['data', 'filters']
  if (!(type === 'kpi' && scope === 'dashboard')) tabs.push('format')
  if (chartKind(type)) tabs.push('elements')
  return tabs
}

// The colours a chart shows (the stacks or lines, a pie's slices) come from the coloured column's values.
export function coloredColumnOf(insight: Pick<Insight, 'type' | 'category' | 'second'>): string {
  return insight.type === 'pie' ? insight.category : insight.type === 'bar' || insight.type === 'line' ? insight.second : ''
}

// CHT-71: how many settings of each tab differ from the defaults — Filters: the chart's own filters; Format: each Display
// option set (orientation, series, running total, percent, target line, Show as), an own size and colour pins on the
// values the chart shows; Elements: each chart element and axis name set; Narrative: each automatic sentence ticked or
// unticked against a new narrative's, the rules, the period, Else, "only the first rule" and an own size. 0 shows no count.
export function editorCounts(insight: Insight, pins: ColorPins | undefined, coloredValues: string[] = [], scope: EditorScope = 'page'): Record<EditorTab, number> {
  const options = insight.options ?? {}
  const narrative = insight.type === 'narrative'
  const gridKind = narrative ? insightKindOf('narrative') : kindOf(insight.type)
  const factory = factoryOf(gridKind)
  const size = { ...factory, ...sizeFromOptions(options, gridKind) }
  const ownSize = (insight.type !== 'kpi' || (scope === 'page' && options.view === 'panel')) && (size.w !== factory.w || size.h !== factory.h) ? 1 : 0
  const set = (value: unknown) => value === undefined || value === null || value === '' ? 0 : 1
  const pinned = coloredValues.some((value) => pins?.[value] != null) ? 1 : 0
  const format = narrative ? 0 : set(options.orientation) + set(options.grouping) + set(options.cumulative) + set(options.percent) + set(options.target) + set(options.view) + ownSize + pinned
  const elements = narrative ? 0 : Object.keys(options.elements ?? {}).length + set(options.xTitle) + set(options.yTitle)
  const story = insight.narrative
  // The automatic sentences count by each one ticked or unticked against a new narrative's (Total, Highest category).
  const auto = new Set(story?.auto ?? []), usual = new Set(blankNarrative().auto)
  const autoChanged = [...auto].filter((key) => !usual.has(key)).length + [...usual].filter((key) => !auto.has(key)).length
  const narrativeCount = narrative ? autoChanged + (story?.rules.length ?? 0) + set(story?.period) + set(story?.otherwise) + set(story?.mode) + ownSize : 0
  return { data: 0, filters: insight.filters.length, format, elements, narrative: narrativeCount }
}

// CHT-72: the first tab (in the order shown) that holds an error, for Save to open and focus.
export function firstErrorTab(tabs: EditorTab[], errors: Partial<Record<EditorTab, string>>): EditorTab | undefined {
  return tabs.find((tab) => errors[tab])
}

// CHT-72: the problems of the chart's columns split by tab — those of its own filters go to Filters, the rest to Data.
export function splitProblems(all: string[], withoutFilters: string[]): { data: string; filters: string } {
  const rest = [...withoutFilters]
  const filters: string[] = []
  for (const problem of all) { const at = rest.indexOf(problem); if (at >= 0) rest.splice(at, 1); else filters.push(problem) }
  return { data: withoutFilters[0] ?? '', filters: filters[0] ?? '' }
}

// The two checks of a chart's own filters made on Save (a filter with nothing chosen; a date range that ends before it starts).
export function filterError(filters: Insight['filters'], columnName: (id: string) => string): string {
  const empty = filters.find((filter) => !filter.values?.length && !filter.from && !filter.to)
  if (empty) return `The filter on “${columnName(empty.column)}” has nothing chosen: tick a value or give a month, or remove it.`
  if (filters.some((filter) => filter.from && filter.to && filter.from > filter.to)) return 'A date filter ends before it starts: check From and To.'
  return ''
}

// The ids that tie a tab to its panel (aria-controls, aria-labelledby) inside one pop-up.
export const tabId = (base: string, key: string) => `${base}-tab-${key}`
export const panelId = (base: string, key: string) => `${base}-panel-${key}`
