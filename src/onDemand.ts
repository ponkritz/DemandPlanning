import { kindOf, parseGridBox, type GridBox, type GridKind } from './chartSize.ts'
import { csvCell } from './csv.ts'
import type { Merge } from './gitSaveQueue.ts'
import { cleanElements, type ChartElements } from './chartElements.ts'

// OND-01…OND-10 On-Demand pages: blank tables the team sets up itself — CoNQ (Cost of Non-Quality) first, more pages
// added, renamed and removed by the roles allowed "Set up On-Demand pages". Each page is one JSON file in the Git data
// repository (on-demand/<page-id>.json: name, description, columns with their type and options, rows), with stable ids
// for columns and rows so that renaming or moving a column keeps its values and two saves can be merged entry by entry.

export type OnDemandType = 'text' | 'longtext' | 'number' | 'currency' | 'date' | 'dropdown' | 'multi'
export const onDemandTypes: { key: OnDemandType; label: string }[] = [
  { key: 'text', label: 'Text' },
  { key: 'longtext', label: 'Long text' },
  { key: 'number', label: 'Number' },
  { key: 'currency', label: 'Currency' },
  { key: 'date', label: 'Date' },
  { key: 'dropdown', label: 'Dropdown (one value)' },
  { key: 'multi', label: 'Multi-select' },
]
export const typeLabel = (type: OnDemandType) => onDemandTypes.find((entry) => entry.key === type)?.label ?? type
export const hasOptions = (type: OnDemandType) => type === 'dropdown' || type === 'multi'
export type OnDemandValue = string | string[]
// LST-08: a built-in list column is a Dropdown or Multi-select whose `list` names a shared list — "team:<id>" (a list of
// Azure DevOps team members, shared-lists.json, src/sharedLists.ts) or "values:<id>" (a Value list of the Epic setup,
// epic-setup.json). Its choices are the list's items; `options` keeps the names as they were when the columns were last
// saved, so an app version without built-in lists still shows a Dropdown with those choices (LIM-105).
export const listRefPattern = /^(team|values):[a-z0-9-]{1,60}$/
export const listTypeLabels: Record<'dropdown' | 'multi', string> = { dropdown: 'Dropdown (built-in list)', multi: 'Multi-select (built-in list)' }
export const columnTypeLabel = (column: { type: OnDemandType; list?: string }) => column.list != null && hasOptions(column.type) ? listTypeLabels[column.type as 'dropdown' | 'multi'] : typeLabel(column.type)
// LST-09: an item of a built-in list — the name shown and stored in the rows, and for a person their Azure DevOps
// identity id (identity.id of the team-members read: an opaque GUID, the stable key that follows a renamed person; never
// an email).
export interface ListItem { name: string; id?: string }
export const listKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// OND-25: description — how or what to fill (optional, shown under the field and as ⓘ on the header); OND-23: currency
// — the default currency of a Currency column (ISO 4217 code). LST-08: list — the built-in list of the column; items and
// listMissing are set at run time from the lists in use (never written): the list's items, or that it is not found.
export interface OnDemandColumn { id: string; name: string; type: OnDemandType; options: string[]; required: boolean; description?: string; currency?: string; list?: string; items?: ListItem[]; listMissing?: boolean }
// OND-21: one entry of a row's update log — who, when (UTC) and what changed per field (column id, old → new as text),
// written by the app on every saved change; a comment only when a file holds one (the app writes none). The first entry is the row being added (added: true).
export interface RowChange { column: string; from: string; to: string }
// OND-39: action — the row was hidden or shown again (no value changed).
export interface LogEntry { id: string; at: string; by: string; added?: true; action?: 'hidden' | 'shown'; comment?: string; changes: RowChange[] }
// OND-19…21: seq — the readable sequential number (given on Save to Git); addedBy / addedAt — who added the row and
// when (UTC ISO), set once; log — the update log.
// OND-39: hidden — who hid the row and when; a hidden row stays in the file with its ID and is left out of the table,
// the Insights, the exports and the dashboards.
// link (MYD-24): a row built by a data source of My dashboard links to its origin (an Azure DevOps work item, https only);
// never read from or written to a page file.
// LST-09: refs — per built-in list column, the stable key (a person's Azure DevOps identity id, '' for none) of each value, in the
// order of the values; the row shows the name the list has now for that key (a renamed person still matches).
export interface OnDemandRow { id: string; key?: string; link?: string; seq?: number; addedBy?: string; addedAt?: string; log?: LogEntry[]; hidden?: { by: string; at: string }; refs?: Record<string, string[]>; cells: Record<string, OnDemandValue> }
// OND-31: storage 'rows' — the page is kept as one file per row (on-demand/<id>/page.json, rows/<key>.json, counter.json,
// src/rowFiles.ts); absent — the single page file on-demand/<id>.json (OND-08).
// OND-63, OND-66: sample — the page as shown in Sample (src/sampleRows.ts): its rows are made up; it is never written.
export interface OnDemandPage { schema: 1; kind: 'on-demand-page'; id: string; name: string; description: string; keyPrefix: string; columns: OnDemandColumn[]; rows: OnDemandRow[]; insights: Insight[]; colors?: ColorPins; storage?: 'rows'; lastSeq?: number; insightFilters?: InsightFilterSetup; sample?: true }

// OND-11…OND-17 Insights: charts and summary tables built from the page's rows, kept in the same file (an `insights`
// list, written only when the page has one) so they travel with the page and are merged with it. Columns are referred
// to by id, so a renamed column is followed; a removed one (or one whose type no longer fits) is kept as written and
// the insight says so instead of drawing (OND-17).
// CHT-01…: 'pareto' and 'kpi' are chart types of their own; 'min', 'max' and 'distinct' further measures.
export type InsightType = 'bar' | 'line' | 'pie' | 'table' | 'pareto' | 'kpi' | 'narrative'
export type InsightMeasure = 'count' | 'sum' | 'average' | 'min' | 'max' | 'distinct'
// A filter on a Dropdown / Multi-select column (values: the options kept; '' is "(none)") or on a Date column (from / to
// month, YYYY-MM, either may be open).
export interface InsightFilter { column: string; values?: string[]; from?: string; to?: string }
// CHT-02…CHT-10: the display options of a chart, all optional — an insight or dashboard block without them is drawn as
// before (horizontal bars, dates by month, the usual number of categories, values as measured, no target, half width).
export type DateGroup = 'day' | 'week' | 'month' | 'quarter' | 'year'
export interface ChartOptions {
  orientation?: 'vertical' // a bar chart as vertical columns (horizontal bars when absent)
  grouping?: 'grouped' // CHT-40: a bar chart's series side by side (Excel's clustered bars) instead of stacked (stacked when absent)
  dateGroup?: DateGroup // a Date column grouped by day, ISO week, quarter or year (month when absent)
  top?: number | 'all' // the N largest categories and "Other" (1…50) or all of them; absent: the type's usual limit
  cumulative?: true // a running total along the categories (bar, line)
  percent?: true // values as a share of the total (bar, line, summary table)
  target?: { value: number; label: string } // a fixed reference line (bar, line, Pareto)
  size?: 'third' | 'half' | 'twothirds' | 'full' // the panel's width of a 6-column grid (half when absent; CHT-11, CHT-15)
  height?: 'small' | 'large' // the chart's height (medium, today's, when absent; CHT-16) — not for a KPI or a summary table
  xTitle?: string // the owner's title of the X axis (the automatic one when absent; CHT-24) — bar, line, Pareto
  yTitle?: string // the owner's title of the Y axis (the automatic one when absent; CHT-24) — bar, line, Pareto
  elements?: ChartElements // Excel-style chart elements set by the owners (as before when absent; CHT-26…CHT-35)
  view?: 'panel' // a KPI shown as a chart panel instead of a card in the Insights tab's card row (CHT-36)
  grid?: GridBox // CHT-47: the owners' place and size on the 12-column chart grid (x, y, w, h); `size` / `height` then hold the nearest presets for older apps
  valueName?: string // CHT-83: the owners' name of the measured value ("Services"), used wherever the chart names its value (the generated "Count of rows" when absent)
}
// CHT-60: a Narrative (type 'narrative') keeps its sentences and rules in `narrative`; its category is the optional
// Group by, '' for none.
// CHT-74, CHT-79: a Pivot table (type 'table') nests its rows and columns — `category` is the outermost row field,
// `rows2` / `rows3` the next ones, `second` the outer column field and `second2` the inner one. All optional and written
// only when set, so a one-level table is stored as before; an older app reads such a file as the one-level table of
// `category` × `second` and drops the three fields when it saves the insight (LIM-104).
export interface Insight { id: string; title: string; type: InsightType; category: string; second: string; measure: InsightMeasure; value: string; filters: InsightFilter[]; sort: 'value' | 'label'; options?: ChartOptions; narrative?: Narrative; rows2?: string; rows3?: string; second2?: string }
// CHT-79: the nested fields of a Pivot table as read from a file — only for type 'table', each a column id; a level is
// kept only under the level before it (rows3 only with rows2, second2 only with second).
export function pivotLevels(type: unknown, item: Record<string, unknown>, ref: (value: unknown) => string): { rows2?: string; rows3?: string; second2?: string } {
  if (type !== 'table') return {}
  const rows2 = ref(item.category) ? ref(item.rows2) : ''
  const rows3 = rows2 ? ref(item.rows3) : ''
  const second2 = ref(item.second) ? ref(item.second2) : ''
  return { ...(rows2 ? { rows2 } : {}), ...(rows3 ? { rows3 } : {}), ...(second2 ? { second2 } : {}) }
}
// CHT-79: the nested fields as written — after the field they follow, only when set.
export const pivotLevelsOut = ({ type, rows2, rows3, second2 }: Pick<Insight, 'type' | 'rows2' | 'rows3' | 'second2'>) => type !== 'table' ? {} : { ...(rows2 ? { rows2 } : {}), ...(rows2 && rows3 ? { rows3 } : {}), ...(second2 ? { second2 } : {}) }
// CHT-09, CHT-41: a colour pin — a palette colour 1…5 (the --viz-series-* tokens, light and dark) or any colour as
// "#rrggbb" (the same in both themes).
export type ColorPin = number | string
export type ColorPins = Record<string, ColorPin>
export const isHexColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/.test(value)
export const insightTypeKeys: InsightType[] = ['bar', 'line', 'pie', 'table', 'pareto', 'kpi', 'narrative']
export const measureKeys: InsightMeasure[] = ['count', 'sum', 'average', 'min', 'max', 'distinct']
// Count and Sum add up; the others cannot be stacked, shown as shares, summed into a running total or a Pareto.
export const additive = (measure: InsightMeasure) => measure === 'count' || measure === 'sum'
export const dateGroups: DateGroup[] = ['day', 'week', 'month', 'quarter', 'year']
export const maxTop = 50, maxTargetLabel = 40, maxColorPins = 200, maxAxisTitle = 60, maxValueName = 60
// CHT-09: the colours of the chart palette a value can be pinned to (--viz-series-1…5).
export const paletteSize = 5
// Which options each type takes; the others are dropped when read and when the type changes.
export function cleanOptions(type: InsightType, measure: InsightMeasure, raw: unknown): ChartOptions | undefined {
  const item = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const out: ChartOptions = {}
  if (type === 'bar' && item.orientation === 'vertical') out.orientation = 'vertical'
  // CHT-40: grouped bars (only a bar chart; drawn only with a second field — stacked when absent).
  if (type === 'bar' && item.grouping === 'grouped') out.grouping = 'grouped'
  if (type !== 'kpi' && type !== 'narrative' && typeof item.dateGroup === 'string' && item.dateGroup !== 'month' && dateGroups.includes(item.dateGroup as DateGroup)) out.dateGroup = item.dateGroup as DateGroup
  if (type === 'bar' || type === 'pie' || type === 'pareto' || type === 'table') {
    if (item.top === 'all') out.top = 'all'
    else if (typeof item.top === 'number' && Number.isFinite(item.top) && item.top >= 1) out.top = Math.min(maxTop, Math.round(item.top))
  }
  if ((type === 'bar' || type === 'line') && additive(measure) && item.cumulative === true) out.cumulative = true
  if ((type === 'bar' || type === 'line' || type === 'table') && additive(measure) && item.percent === true) out.percent = true
  const target = item.target as Record<string, unknown> | undefined
  if ((type === 'bar' || type === 'line' || type === 'pareto') && target && typeof target === 'object' && typeof target.value === 'number' && Number.isFinite(target.value) && Math.abs(target.value) <= 1e12) {
    out.target = { value: target.value, label: typeof target.label === 'string' ? target.label.trim().replace(/\s+/g, ' ').slice(0, maxTargetLabel) : '' }
  }
  // CHT-15, CHT-16: a width of ⅓, ½, ⅔ or Full (v10 knew half and full and drops the others: LIM-36) and a height.
  if (item.size === 'third' || item.size === 'half' || item.size === 'twothirds' || item.size === 'full') out.size = item.size
  if (type !== 'kpi' && type !== 'table' && type !== 'narrative' && (item.height === 'small' || item.height === 'large')) out.height = item.height
  // CHT-24: the axis titles of a chart with axes, plain text of up to 60 characters; empty means automatic.
  if (type === 'bar' || type === 'line' || type === 'pareto') for (const key of ['xTitle', 'yTitle'] as const) { const text = typeof item[key] === 'string' ? (item[key] as string).trim().replace(/\s+/g, ' ').slice(0, maxAxisTitle) : ''; if (text) out[key] = text }
  // CHT-83: the value's own name — plain text of up to 60 characters, for every type with a measure shown by name.
  if (type !== 'kpi' && type !== 'narrative' && typeof item.valueName === 'string') { const name = item.valueName.trim().replace(/\s+/g, ' ').slice(0, maxValueName); if (name) out.valueName = name }
  // CHT-35: the chart elements, each checked against the type (and its orientation and Percent of total).
  const elements = cleanElements(type, out, item.elements)
  if (elements) out.elements = elements
  // CHT-36: a KPI shown as a panel (a card when absent).
  if (type === 'kpi' && item.view === 'panel') out.view = 'panel'
  // CHT-47: the place on the chart grid — whole numbers clamped to the grid and the type's minimum size (since CHT-51 a
  // KPI card's too).
  const grid = parseGridBox(item.grid, insightKindOf(type))
  if (grid) out.grid = grid
  return Object.keys(out).length ? out : undefined
}
// CHT-09, CHT-41: a page's (or a dashboard's) colour pins — a value's text → a palette colour 1…5 or a colour
// "#rrggbb" (any case when read, written in lower case); anything else is dropped.
export function parseColors(raw: unknown): ColorPins | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: ColorPins = {}
  for (const [key, slot] of Object.entries(raw as Record<string, unknown>).slice(0, maxColorPins)) {
    const value = key.trim().replace(/\s+/g, ' ').slice(0, 120)
    if (!value) continue
    if (typeof slot === 'number' && Number.isInteger(slot) && slot >= 1 && slot <= paletteSize) out[value] = slot
    else if (typeof slot === 'string' && isHexColor(slot.toLowerCase())) out[value] = slot.toLowerCase()
  }
  return Object.keys(out).length ? out : undefined
}
export const maxInsights = 40, maxFilters = 10
// CHT-60: the grid kind of an insight — a Narrative is sized like a summary table (a width on the grid, the height of
// its content).
export const insightKindOf = (type: string): GridKind => kindOf(type === 'narrative' ? 'table' : type)

// ---- Narratives (CHT-60…CHT-69) ----
// A Narrative is text, deterministic and computed in the browser: automatic sentences the owners tick (the total, the
// highest / lowest category with its share, the change against the previous period of a Date column, how many categories
// are above / below a threshold, the biggest mover) and up to 20 rules of their own — IF a metric compares with a value
// THEN a sentence template with placeholders and a tone. Stored as the optional field `narrative` of an insight or a
// Dashboard block; templates are plain text (no HTML), placeholders are replaced by text, never by markup (SM-130).
export type NarrativeAuto = 'total' | 'top' | 'bottom' | 'change' | 'threshold' | 'mover'
export const narrativeAutoKeys: NarrativeAuto[] = ['total', 'top', 'bottom', 'change', 'threshold', 'mover']
export type NarrativeMetric = 'total' | 'count' | 'top_value' | 'share' | 'change' | 'top'
export const narrativeMetricKeys: NarrativeMetric[] = ['total', 'count', 'top_value', 'share', 'change', 'top']
export type NarrativeOp = 'gt' | 'ge' | 'lt' | 'le' | 'eq' | 'changed' | 'is_top'
export const narrativeOpKeys: NarrativeOp[] = ['gt', 'ge', 'lt', 'le', 'eq', 'changed', 'is_top']
export type NarrativeTone = 'info' | 'good' | 'warning' | 'bad'
export const narrativeToneKeys: NarrativeTone[] = ['info', 'good', 'warning', 'bad']
export type NarrativeGrain = 'month' | 'quarter' | 'year'
export const narrativeGrains: NarrativeGrain[] = ['month', 'quarter', 'year']
export const narrativePlaceholders = ['value', 'total', 'top', 'top_value', 'share', 'change', 'period', 'count', 'category'] as const
export const maxNarrativeRules = 20, maxTemplate = 300
// value: a number for the comparisons, a category's name for "is top category"; while being edited the typed text.
export interface NarrativeRule { metric: NarrativeMetric; op: NarrativeOp; value: number | string; template: string; tone: NarrativeTone }
export interface Narrative {
  auto: NarrativeAuto[] // the automatic sentences ticked, shown in the order of narrativeAutoKeys
  period?: string // the Date column of "change vs the previous period" and "biggest mover"
  grain?: NarrativeGrain // the period's length (month when absent)
  threshold?: { op: 'above' | 'below'; value: number } // of the "above / below a threshold" sentence
  rules: NarrativeRule[]
  mode?: 'first' // only the first rule that matches (every rule that matches when absent)
  otherwise?: string // the "Else" sentence, shown when no rule matches
}
export const blankNarrative = (): Narrative => ({ auto: ['total', 'top'], rules: [] })
// A template as stored: plain text — markup tags and control characters removed, spaces collapsed, unknown
// placeholders dropped, at most 300 characters.
export function cleanTemplate(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const plain = Array.from(raw.slice(0, 4 * maxTemplate), (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? ' ' : char).join('')
  return plain.replace(/<\/?[a-z!][^>]*>/gi, '')
    .replace(/\{([^{}]*)\}/g, (match, key: string) => (narrativePlaceholders as readonly string[]).includes(key) ? match : '')
    .replace(/\s+/g, ' ').trim().slice(0, maxTemplate)
}
const finiteNumber = (value: unknown) => { const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN; return Number.isFinite(number) && Math.abs(number) <= 1e15 ? number : null }
const narrativeRef = /^[A-Za-z0-9][\w-]{0,39}$/
// CHT-68: the field as read from a file — sentences, operators, metrics and tones not known are dropped, a rule without
// a sentence or a value is dropped, at most 20 rules; never throws.
export function parseNarrative(raw: unknown): Narrative {
  const item = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const auto = narrativeAutoKeys.filter((key) => Array.isArray(item.auto) && item.auto.includes(key))
  const out: Narrative = { auto, rules: [] }
  if (typeof item.period === 'string' && narrativeRef.test(item.period)) out.period = item.period
  if (item.grain === 'quarter' || item.grain === 'year') out.grain = item.grain
  const threshold = item.threshold && typeof item.threshold === 'object' ? item.threshold as Record<string, unknown> : undefined
  const limit = threshold ? finiteNumber(threshold.value) : null
  if (threshold && limit != null) out.threshold = { op: threshold.op === 'below' ? 'below' : 'above', value: limit }
  for (const entry of Array.isArray(item.rules) ? item.rules : []) {
    if (out.rules.length >= maxNarrativeRules) break
    const rule = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {}
    const op = rule.op as NarrativeOp, template = cleanTemplate(rule.template)
    if (!narrativeOpKeys.includes(op) || !template) continue
    const tone: NarrativeTone = narrativeToneKeys.includes(rule.tone as NarrativeTone) ? rule.tone as NarrativeTone : 'info'
    if (op === 'is_top') {
      const name = typeof rule.value === 'string' ? rule.value.replace(/\s+/g, ' ').trim().slice(0, 120) : ''
      if (name) out.rules.push({ metric: 'top', op, value: name, template, tone })
      continue
    }
    const value = finiteNumber(rule.value)
    if (value == null) continue
    if (op === 'changed') { out.rules.push({ metric: 'change', op, value: Math.abs(value), template, tone }); continue }
    const metric = rule.metric as NarrativeMetric
    if (!narrativeMetricKeys.includes(metric) || metric === 'top') continue
    out.rules.push({ metric, op, value, template, tone })
  }
  if (item.mode === 'first') out.mode = 'first'
  const otherwise = cleanTemplate(item.otherwise)
  if (otherwise) out.otherwise = otherwise
  return out
}
// Written in a fixed order, the optional parts only when set.
export function narrativeOut(narrative: Narrative | undefined) {
  const value = parseNarrative(narrative)
  return { auto: value.auto, ...(value.period ? { period: value.period } : {}), ...(value.grain ? { grain: value.grain } : {}), ...(value.threshold ? { threshold: value.threshold } : {}), rules: value.rules.map(({ metric, op, value: limit, template, tone }) => ({ metric, op, value: limit, template, tone })), ...(value.mode ? { mode: value.mode } : {}), ...(value.otherwise ? { otherwise: value.otherwise } : {}) }
}
// CHT-66: the pop-up's check before Add / Save (the columns are checked with the insight, onDemandInsights.ts).
// hasGroup: a Group by column is chosen.
export function narrativeError(narrative: Narrative | undefined, hasGroup: boolean): string {
  if (!narrative) return ''
  if (narrative.rules.length > maxNarrativeRules) return `A narrative holds at most ${maxNarrativeRules} rules.`
  for (const [index, rule] of narrative.rules.entries()) {
    if (!cleanTemplate(rule.template)) return `Rule ${index + 1} has no sentence: write the sentence to show, or remove the rule.`
    if (rule.op === 'is_top' ? !String(rule.value).trim() : finiteNumber(rule.value) == null) return rule.op === 'is_top' ? `Rule ${index + 1} needs the name of a category.` : `Rule ${index + 1} needs a number to compare with.`
    if (!hasGroup && (rule.op === 'is_top' || rule.metric === 'top_value' || rule.metric === 'share')) return `Rule ${index + 1} looks at the top category: choose a Group by column first.`
    if (!narrative.period && (rule.op === 'changed' || rule.metric === 'change')) return `Rule ${index + 1} looks at the change against the previous period: choose the Date column of the period first.`
  }
  if (narrative.auto.includes('threshold') && (!narrative.threshold || finiteNumber(narrative.threshold.value) == null)) return 'Give the threshold a number, or untick “Above / below a threshold”.'
  if ((narrative.auto.includes('change') || narrative.auto.includes('mover')) && !narrative.period) return 'The change against the previous period needs the Date column of the period.'
  if (!hasGroup && (narrative.auto.includes('top') || narrative.auto.includes('bottom') || narrative.auto.includes('mover'))) return 'Highest, lowest and biggest mover need a Group by column.'
  return ''
}

export const onDemandFolder = 'on-demand'
// OND-31: the page types that hold a table (Table, Table + Insights today). The follow-up that makes page types a
// combination (Table, Insights, Dashboard, Release view) changes only this predicate.
export const hasTable = (kind: string) => kind === 'table' || kind === 'table-insights'
export const onDemandPath = (id: string) => `${onDemandFolder}/${id}.json`
// GitHub's contents API reads files up to 1 MB inline; stay below it (as the QE Mapping does).
export const onDemandMaxBytes = 900_000
export const maxColumns = 60, maxOptions = 200, maxRows = 5000, maxValue = 2000
// OND-22: a Long text holds up to 10,000 characters (every value is read back up to this, so a Long text column made
// Text keeps its paragraph, marked when longer than a Text allows). OND-21: the log keeps the last 100 entries of a row,
// each old / new value up to 500 characters, a comment read from a file up to 500. OND-25: a column description up to 300.
export const maxLongValue = 10_000, maxLog = 100, maxLogText = 500, maxComment = 500, maxDescription = 300
const idPattern = /^[A-Za-z0-9][\w-]{0,39}$/
export const pageIdPattern = /^[a-z0-9][a-z0-9-]{0,39}$/
// Only files named like a page id are pages: nothing outside the folder, no other file in it.
export const pageIdOfFile = (name: string) => { const match = /^([a-z0-9][a-z0-9-]{0,39})\.json$/.exec(name); return match ? match[1] : null }

// OND-02: CoNQ is there from the start — shown (not yet in Git) while the folder has no page; the first save creates it.
export const conqId = 'conq'
export const conqPage = (): OnDemandPage => ({ schema: 1, kind: 'on-demand-page', id: conqId, name: 'CoNQ', description: 'Cost of Non-Quality', keyPrefix: 'CONQ', columns: [], rows: [], insights: [] })
export const emptyPage = (id: string, name: string, description = ''): OnDemandPage => ({ schema: 1, kind: 'on-demand-page', id, name: cleanName(name, 80), description: description.trim().slice(0, 300), keyPrefix: prefixFor(name), columns: [], rows: [], insights: [] })

// OND-18: every row has a key the moment it is added — the page's prefix, the date (UTC, yymmdd) and 4 random
// characters, e.g. CONQ-261123-K7Q2. It is made without asking Git, so two people adding rows at the same time (each
// saving on their own) get different keys; the 4 characters are drawn from 31 that cannot be mistaken for each other
// (no 0/O, 1/I/L), 923,521 per page and day. A key is checked against the page's keys when made, and a key that still
// turns up twice in a file (two saves merged) is replaced for the later row on the next save — it never changes otherwise.
export const keyPrefixPattern = /^[A-Z0-9]{1,8}$/
export const rowKeyPattern = /^[A-Z0-9]{1,8}-\d{6}-[2-9A-HJKMNP-Z]{4}$/
const keyAlphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const prefixFor = (name: string) => name.toUpperCase().normalize('NFKD').replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'ROW'
export function newRowKey(prefix: string, taken: Set<string>, random: () => number = Math.random, now: () => number = Date.now) {
  const day = new Date(now()).toISOString().slice(2, 10).replace(/-/g, '')
  for (;;) {
    const key = `${keyPrefixPattern.test(prefix) ? prefix : 'ROW'}-${day}-${Array.from({ length: 4 }, () => keyAlphabet[Math.floor(random() * keyAlphabet.length)]).join('')}`
    if (!taken.has(key)) return key
  }
}
// The page with a key on every row: rows without one (added before keys, or a duplicate dropped on reading) get one,
// in the page's order.
export function withRowKeys(page: OnDemandPage, random: () => number = Math.random, now: () => number = Date.now): OnDemandPage {
  if (page.rows.every((row) => row.key)) return page
  const taken = new Set(page.rows.flatMap((row) => row.key ? [row.key] : []))
  return { ...page, rows: page.rows.map((row) => { if (row.key) return row; const key = newRowKey(page.keyPrefix, taken, random, now); taken.add(key); return { ...row, key } }) }
}
export const hasRowKeys = (page: OnDemandPage) => page.rows.some((row) => row.key || row.seq)

// OND-19: the readable ID of a row — the page's prefix and a sequential number, CONQ-0001, CONQ-0002 … (4 digits, more
// when needed). The number is given on Save to Git (serializeOnDemandPage, so the merged file written after the GIT-17
// re-read gets them too): the next free one, the page's highest + 1, in row order; it never changes afterwards. A number
// that a merge leaves on two rows is dropped from the second when read (parseOnDemandPage) and that row gets the next
// free one on the next save. Rows from before get theirs on the next save, in page order.
export const maxSeq = 9_999_999
export const rowId = (page: Pick<OnDemandPage, 'keyPrefix'>, row: Pick<OnDemandRow, 'seq'>) => row.seq ? `${keyPrefixPattern.test(page.keyPrefix) ? page.keyPrefix : 'ROW'}-${String(row.seq).padStart(4, '0')}` : ''
// OND-40: lastSeq — the highest number given on the page, kept when a row is deleted, so a number is never given again.
export function withRowNumbers(page: OnDemandPage): OnDemandPage {
  if (page.rows.every((row) => row.seq)) return page
  let next = page.rows.reduce((max, row) => Math.max(max, row.seq ?? 0), page.lastSeq ?? 0)
  return { ...page, rows: page.rows.map((row) => row.seq || next >= maxSeq ? row : { ...row, seq: ++next }) }
}
// OND-20, OND-21: the last change of a row (the newest log entry), else when it was added.
export function lastUpdate(row: OnDemandRow): { by: string; at: string } | null {
  const last = row.log?.length ? row.log.reduce((latest, entry) => entry.at >= latest.at ? entry : latest) : null
  return last ? { by: last.by, at: last.at } : row.addedAt ? { by: row.addedBy ?? '', at: row.addedAt } : null
}

// Ids that two people adding at the same time cannot both get (the merge keeps entries apart by id).
export function newId(prefix: 'c' | 'r' | 'i' | 'l', random: () => number = Math.random, now: () => number = Date.now) {
  return `${prefix}${now().toString(36)}${Math.floor(random() * 36 ** 5).toString(36).padStart(5, '0')}`
}
// A page id from its name: lower case, letters, digits and hyphens; a taken one gets -2, -3 …
export function pageIdFor(name: string, taken: string[]) {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'page'
  let id = base
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`
  return id
}
const cleanName = (name: string, max = 120) => name.trim().replace(/\s+/g, ' ').slice(0, max)

// ---- values ----
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
const isNumber = (value: string) => value.trim() !== '' && Number.isFinite(Number(value))
export const valuesOf = (value: OnDemandValue | undefined): string[] => value == null ? [] : Array.isArray(value) ? value : value === '' ? [] : [value]
export const isEmpty = (value: OnDemandValue | undefined) => valuesOf(value).length === 0

// ---- currency (OND-23) ----
// A Currency cell is kept as one text, the amount and the ISO 4217 code: "1200.5 EUR" (an amount without a code is in
// the column's default currency). No exchange rates: amounts of different currencies are never added up (OND-24).
export const currencyCodes = ['EUR', 'USD', 'GBP', 'INR', 'CHF', 'JPY', 'CNY', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'CAD', 'AUD', 'SGD', 'HKD', 'KRW', 'BRL', 'MXN', 'ZAR', 'AED']
export const currencyPattern = /^[A-Z]{3}$/
export const defaultCurrency = 'EUR'
const moneyPattern = /^(-?\d+(?:\.\d+)?)(?:\s+([A-Za-z]{3}))?$/
export interface Money { amount: number; currency: string }
export function moneyOf(value: OnDemandValue | undefined, fallback = defaultCurrency): Money | null {
  const match = moneyPattern.exec(valuesOf(value).join(', ').trim())
  if (!match || !Number.isFinite(Number(match[1]))) return null
  return { amount: Number(match[1]), currency: match[2]?.toUpperCase() ?? (currencyPattern.test(fallback) ? fallback : defaultCurrency) }
}
// The digits a currency is written with (JPY 0, EUR 2 …), from the browser's currency data; 2 for a code it does not know.
export function currencyDigits(code: string) { try { return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2 } catch { return 2 } }
// "1,200.00 EUR": the amount with the currency's digits and the code after it.
export const formatMoney = (money: Money) => `${money.amount.toLocaleString('en', { minimumFractionDigits: currencyDigits(money.currency), maximumFractionDigits: Math.max(currencyDigits(money.currency), 2) })} ${money.currency}`

// OND-06: a value that does not fit its column is kept, and shown with why: not in the list, not a number, not a date,
// not an amount, or (a Long text made Text) longer than a Text allows.
export function cellProblem(column: OnDemandColumn, value: OnDemandValue | undefined): string {
  const values = valuesOf(value)
  if (!values.length) return ''
  if (hasOptions(column.type)) return values.some((entry) => !column.options.includes(entry)) ? 'not in the list' : ''
  if (column.type === 'number') return values.every(isNumber) ? '' : 'not a number'
  if (column.type === 'date') return values.every(isDate) ? '' : 'not a date'
  if (column.type === 'currency') return moneyOf(value, column.currency) ? '' : 'not an amount'
  if (column.type === 'text') return cellText(value).length > maxValue ? 'longer than a Text' : ''
  return ''
}
export const cellText = (value: OnDemandValue | undefined) => valuesOf(value).join(', ')
// The value as shown and exported: a Currency amount as "1,200.00 EUR", the text otherwise.
export function displayText(column: OnDemandColumn, value: OnDemandValue | undefined) {
  if (column.type === 'currency') { const money = moneyOf(value, column.currency); if (money) return formatMoney(money) }
  return cellText(value)
}
// The value to sort by: a number for a Number column, the amount for a Currency column, the text otherwise.
export function cellSortValue(column: OnDemandColumn, value: OnDemandValue | undefined): string | number {
  const text = cellText(value)
  if (column.type === 'currency') { const money = moneyOf(value, column.currency); return money ? money.amount : text }
  return column.type === 'number' && isNumber(text) ? Number(text) : text
}
// A value as its column keeps it: Multi-select a list, the others one text (a list joined with ", ").
export function convertValue(value: OnDemandValue | undefined, to: OnDemandType): OnDemandValue | undefined {
  const values = valuesOf(value)
  if (!values.length) return undefined
  return to === 'multi' ? values : values.join(', ')
}

// ---- rows ----
export function rowError(columns: OnDemandColumn[], cells: Record<string, OnDemandValue>): string {
  const missing = columns.filter((column) => column.required && isEmpty(cells[column.id]))
  if (missing.length) return `Fill in ${missing.map((column) => `“${column.name}”`).join(', ')}: ${missing.length === 1 ? 'it is' : 'they are'} required.`
  const bad = columns.filter((column) => (column.type === 'number' || column.type === 'date' || column.type === 'currency') && cellProblem(column, cells[column.id]))
  if (bad.length) return `${bad.map((column) => `“${column.name}” is ${cellProblem(column, cells[column.id])}`).join('; ')}.`
  if (!columns.some((column) => !isEmpty(cells[column.id]))) return 'Fill in at least one field.'
  return ''
}
const cleanCells = (columns: OnDemandColumn[], cells: Record<string, OnDemandValue>) => Object.fromEntries(columns.flatMap((column): [string, OnDemandValue][] => {
  const value = cells[column.id]
  if (column.type === 'multi') { const list = [...new Set(valuesOf(value).map((entry) => entry.trim().slice(0, maxValue)).filter(Boolean))]; return list.length ? [[column.id, list]] : [] }
  if (column.type === 'currency') { const money = moneyOf(value, column.currency); if (money) return [[column.id, `${money.amount} ${money.currency}`]] }
  const text = cellText(value).trim().slice(0, column.type === 'longtext' ? maxLongValue : maxValue)
  return text ? [[column.id, text]] : []
}))
// OND-21: an old or new value in the log, cut to 500 characters ("…").
const logText = (value: OnDemandValue | undefined) => { const text = cellText(value); return text.length > maxLogText ? `${text.slice(0, maxLogText - 1)}…` : text }
// The last 100 entries of a log, oldest first.
export const capLog = (log: LogEntry[]) => [...log].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)).slice(-maxLog)
// LST-09: the keys of a built-in list column's values — each value's item in the list (by name: its identity id, '' for an
// item without one), else, for a value the list no longer has, the key the value had in the row before (a removed person
// keeps their key). Nothing when no value has a key.
export function listRefs(column: OnDemandColumn, value: OnDemandValue | undefined, before?: Pick<OnDemandRow, 'cells' | 'refs'>): string[] | undefined {
  if (!column.list || !hasOptions(column.type)) return undefined
  const old = valuesOf(before?.cells[column.id]), oldRefs = before?.refs?.[column.id] ?? []
  const refs = valuesOf(value).map((entry) => {
    const item = column.items?.find((candidate) => candidate.name === entry)
    if (item) return item.id ?? ''
    const at = old.indexOf(entry)
    return at >= 0 ? oldRefs[at] ?? '' : ''
  })
  return refs.some(Boolean) ? refs : undefined
}
// LST-09: a built-in list value as the list names it now — each value whose key is an item of the list takes that item's
// name (a renamed person); the others are kept as they are (a removed person, marked "not in the list").
export function currentValue(column: OnDemandColumn, row: Pick<OnDemandRow, 'cells' | 'refs'>): OnDemandValue | undefined {
  const value = row.cells[column.id], refs = row.refs?.[column.id]
  if (!column.items?.length || !refs?.length || value == null) return value
  const byKey = new Map(column.items.flatMap((item) => item.id ? [[item.id, item.name] as const] : []))
  const names = valuesOf(value).map((entry, at) => (refs[at] && byKey.get(refs[at])) || entry)
  if (names.every((entry, at) => entry === valuesOf(value)[at])) return value
  return Array.isArray(value) ? [...new Set(names)] : names[0]
}
export function rowRefs(columns: OnDemandColumn[], cells: Record<string, OnDemandValue>, before?: Pick<OnDemandRow, 'cells' | 'refs'>): Record<string, string[]> | undefined {
  const out = Object.fromEntries(columns.flatMap((column): [string, string[]][] => { const refs = listRefs(column, cells[column.id], before); return refs ? [[column.id, refs]] : [] }))
  return Object.keys(out).length ? out : undefined
}
export interface RowEdit { by?: string; random?: () => number; now?: () => number }
// Adds or changes a row. OND-18: a new row gets its key at once. OND-20: a new row records who added it (the viewer's
// work email, else their name, else "unknown") and when (UTC), never changed afterwards. OND-21: every add and every
// edit that changes a value adds a log entry with the fields changed, old → new.
export function upsertRow(page: OnDemandPage, row: OnDemandRow, edit: RowEdit = {}): OnDemandPage {
  const { random = Math.random, now = Date.now } = edit
  const by = edit.by?.trim().slice(0, 200) || 'unknown', at = new Date(now()).toISOString()
  const existing = page.rows.find((entry) => entry.id === row.id)
  const key = existing?.key ?? row.key ?? newRowKey(page.keyPrefix, new Set(page.rows.flatMap((entry) => entry.key ? [entry.key] : [])), random, now)
  const cells = cleanCells(page.columns, row.cells)
  const entry = (changes: RowChange[], added = false): LogEntry => ({ id: newId('l', random, now), at, by, ...(added ? { added: true as const } : {}), changes })
  if (!existing) {
    const changes = page.columns.flatMap((column) => isEmpty(cells[column.id]) ? [] : [{ column: column.id, from: '', to: logText(cells[column.id]) }])
    const refs = rowRefs(page.columns, cells)
    return { ...page, rows: [...page.rows, { id: row.id, key, addedBy: by, addedAt: at, log: [entry(changes, true)], ...(refs ? { refs } : {}), cells }] }
  }
  const changes = page.columns.flatMap((column) => cellText(existing.cells[column.id]) === cellText(cells[column.id]) ? [] : [{ column: column.id, from: logText(existing.cells[column.id]), to: logText(cells[column.id]) }])
  if (!changes.length) return page
  // LST-09: the keys follow the values saved.
  const { refs: _before, ...kept } = existing
  void _before
  const refs = rowRefs(page.columns, cells, existing)
  const next: OnDemandRow = { ...kept, key, ...(refs ? { refs } : {}), cells, log: capLog([...(existing.log ?? []), entry(changes)]) }
  return { ...page, rows: page.rows.map((current) => current.id === row.id ? next : current) }
}
export const removeRow = (page: OnDemandPage, id: string): OnDemandPage => {
  const highest = page.rows.reduce((max, row) => Math.max(max, row.seq ?? 0), page.lastSeq ?? 0)
  return { ...page, rows: page.rows.filter((row) => row.id !== id), ...(highest ? { lastSeq: highest } : {}) }
}
// OND-39: hide a row (or show it again) — a change of the row with its log entry "Hidden" / "Shown"; nothing else changes.
export function setRowHidden(page: OnDemandPage, id: string, hidden: boolean, edit: RowEdit = {}): OnDemandPage {
  const { random = Math.random, now = Date.now } = edit
  const by = edit.by?.trim().slice(0, 200) || 'unknown', at = new Date(now()).toISOString()
  return { ...page, rows: page.rows.map((row) => {
    if (row.id !== id || Boolean(row.hidden) === hidden) return row
    const { hidden: _was, ...rest } = row
    void _was
    const entry: LogEntry = { id: newId('l', random, now), at, by, action: hidden ? 'hidden' : 'shown', changes: [] }
    return { ...rest, ...(hidden ? { hidden: { by, at } } : {}), log: capLog([...(row.log ?? []), entry]) }
  }) }
}
// OND-39: the page as everyone sees it by default — without its hidden rows (table, Insights, exports, dashboards).
export const isRowHidden = (row: OnDemandRow) => Boolean(row.hidden)
export const withoutHidden = (page: OnDemandPage): OnDemandPage => page.rows.some(isRowHidden) ? { ...page, rows: page.rows.filter((row) => !row.hidden) } : page
// OND-28: a row saved at once from the drawer — the row's change applied to the page as last read from Git (its log
// entry made now), and the commit message naming it: "CoNQ: add row CONQ-0013 (CONQ-261123-K7Q2)", "CoNQ: update row
// CONQ-0012", "CoNQ: remove row CONQ-0012". A new row's ID is the one it will get when nothing else was saved meanwhile
// (the merged save of GIT-17 gives the next free one otherwise); its key never changes, so the message names both.
// OND-39, OND-40: 'hide' / 'show' a row, 'delete' it for good (the Tool Owner, from a hidden row).
export type RowAction = 'add' | 'update' | 'remove' | 'hide' | 'show' | 'delete'
export function rowSave(page: OnDemandPage, row: OnDemandRow, action: RowAction, edit: RowEdit = {}): { page: OnDemandPage; message: string } {
  const next = action === 'remove' || action === 'delete' ? removeRow(page, row.id) : action === 'hide' || action === 'show' ? setRowHidden(page, row.id, action === 'hide', edit) : upsertRow(page, row, edit)
  const named = withRowNumbers(next).rows.find((entry) => entry.id === row.id) ?? page.rows.find((entry) => entry.id === row.id) ?? row
  const id = rowId(page, named)
  const label = action === 'add' ? [id, named.key].filter(Boolean).join(' (') + (id && named.key ? ')' : '') : id || named.key || row.id
  return { page: next, message: `${page.name}: ${action} row ${label}` }
}
export function filterRows(page: OnDemandPage, search: string) {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return page.rows
  return page.rows.filter((row) => { const text = [rowId(page, row), row.key ?? '', row.addedBy ?? '', ...page.columns.map((column) => displayText(column, row.cells[column.id]))].join(' ').toLowerCase(); return words.every((word) => text.includes(word)) })
}
// OND-18: the prefix of the page's row keys, set in Set up columns…; fixed once a row has a key.
export function setKeyPrefix(page: OnDemandPage, prefix: string): OnDemandPage {
  const value = prefix.trim().toUpperCase()
  if (value === page.keyPrefix) return page
  if (hasRowKeys(page)) throw new Error('The key prefix cannot change: rows already have keys or IDs.')
  if (!keyPrefixPattern.test(value)) throw new Error('The key prefix is 1 to 8 letters (A–Z) or digits.')
  return { ...page, keyPrefix: value }
}
export const renamePage = (page: OnDemandPage, name: string, description: string): OnDemandPage => {
  const value = cleanName(name, 80)
  if (!value) throw new Error('Give the page a name.')
  return { ...page, name: value, description: description.trim().slice(0, 300) }
}

// ---- columns (OND-05, OND-06) ----
// The Columns pop-up edits a copy: each option remembers the label it had (was), so a rename is told from a removal.
// LST-08: list — the built-in list of a Dropdown or Multi-select ('' while none is chosen; absent: options of its own).
export interface ColumnDraft { id: string; name: string; type: OnDemandType; required: boolean; options: { label: string; was?: string }[]; description?: string; currency?: string; list?: string; isNew?: boolean }
export const columnDrafts = (columns: OnDemandColumn[]): ColumnDraft[] => columns.map((column) => ({ id: column.id, name: column.name, type: column.type, required: column.required, options: column.options.map((label) => ({ label, was: label })), description: column.description ?? '', ...(column.type === 'currency' ? { currency: column.currency ?? defaultCurrency } : {}), ...(column.list != null && hasOptions(column.type) ? { list: column.list } : {}) }))
const cleanDescription = (text: string | undefined) => (text ?? '').trim().replace(/\s+/g, ' ').slice(0, maxDescription)
// PIR-22: noun — "column" (the On-Demand pages) or "field" (the PI Review form setup, which shares this check).
export function columnsError(drafts: ColumnDraft[], noun: 'column' | 'field' = 'column'): string {
  if (drafts.length > maxColumns) return `At most ${maxColumns} ${noun}s.`
  const names = drafts.map((draft) => cleanName(draft.name).toLowerCase())
  if (names.some((name) => !name)) return `Every ${noun} needs a name.`
  const twice = names.find((name, index) => names.indexOf(name) !== index)
  if (twice) return `There are two ${noun}s named “${drafts[names.indexOf(twice)].name.trim()}”.`
  const money = drafts.find((draft) => draft.type === 'currency' && !currencyPattern.test((draft.currency ?? defaultCurrency).trim().toUpperCase()))
  if (money) return `“${money.name.trim()}” is a Currency ${noun}: its default currency is a 3-letter code such as EUR or USD.`
  const long = drafts.find((draft) => (draft.description ?? '').trim().length > maxDescription)
  if (long) return `The description of “${long.name.trim()}” is longer than ${maxDescription} characters.`
  for (const draft of drafts.filter((entry) => hasOptions(entry.type))) {
    // LST-08: a built-in list column takes its choices from the list: it needs the list, not options of its own.
    if (draft.list != null) { if (!listRefPattern.test(draft.list)) return `“${draft.name.trim()}” is a ${columnTypeLabel(draft)} ${noun}: choose its list.`; continue }
    const labels = draft.options.map((option) => cleanName(option.label).toLowerCase())
    if (!labels.length) return `“${draft.name.trim()}” is a ${typeLabel(draft.type)} ${noun}: add at least one option.`
    if (labels.some((label) => !label)) return `“${draft.name.trim()}” has an empty option: type it or remove it.`
    const again = labels.find((label, index) => labels.indexOf(label) !== index)
    if (again) return `“${draft.name.trim()}” has the option “${draft.options[labels.indexOf(again)].label.trim()}” twice.`
    if (labels.length > maxOptions) return `“${draft.name.trim()}” has more than ${maxOptions} options.`
  }
  return ''
}
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
// What saving the columns does to the values already in the rows — said before it is done (OND-06). Empty: nothing.
export function columnEffects(page: OnDemandPage, drafts: ColumnDraft[]): string[] {
  const lines: string[] = []
  const used = (id: string) => page.rows.filter((row) => !isEmpty(row.cells[id]))
  for (const column of page.columns) {
    const draft = drafts.find((entry) => entry.id === column.id)
    const rows = used(column.id)
    if (!draft) { if (rows.length) lines.push(`“${column.name}” is removed with its ${count(rows.length, 'value')}.`); continue }
    const renames = new Map(draft.options.filter((option) => option.was && option.was !== cleanName(option.label)).map((option) => [option.was!, cleanName(option.label)]))
    const labels = draft.options.map((option) => cleanName(option.label))
    const after: OnDemandColumn = { ...column, type: draft.type, options: labels, currency: draft.currency ?? column.currency }
    const moved = (value: OnDemandValue | undefined) => { const converted = convertValue(value, draft.type); return Array.isArray(converted) ? converted.map((entry) => renames.get(entry) ?? entry) : converted == null ? undefined : renames.get(converted) ?? converted }
    if (draft.type !== column.type && rows.length) {
      const problems = rows.map((row) => cellProblem(after, moved(row.cells[column.id]))).filter(Boolean)
      const joined = column.type === 'multi' && draft.type !== 'multi' ? rows.filter((row) => valuesOf(row.cells[column.id]).length > 1).length : 0
      const kept = `its ${count(rows.length, 'value')} ${rows.length === 1 ? 'is' : 'are'} kept`
      const several = joined ? `; ${count(joined, 'row')} with several choices keep${joined === 1 ? 's' : ''} them as one text` : ''
      const misfit = problems.length ? `; ${problems.length} ${problems.length === 1 ? 'does' : 'do'} not fit and ${problems.length === 1 ? 'is' : 'are'} shown as “${problems[0]}” until changed` : ''
      lines.push(`“${column.name}” changes from ${typeLabel(column.type)} to ${typeLabel(draft.type)}: ${kept}${several}${misfit}.`)
    }
    // LST-08: a column that takes its choices from another built-in list (or from one for the first time).
    if (draft.list && draft.list !== column.list && rows.length) lines.push(`“${column.name}” takes its choices from a built-in list: its ${count(rows.length, 'value')} ${rows.length === 1 ? 'is' : 'are'} kept; a value not in the list is shown as “not in the list” until changed.`)
    for (const [from, to] of renames) { const n = rows.filter((row) => valuesOf(row.cells[column.id]).includes(from)).length; if (n) lines.push(`Option “${from}” of “${column.name}” is renamed “${to}” in ${count(n, 'row')}.`) }
    if (hasOptions(draft.type)) {
      const kept = new Set(draft.options.map((option) => option.was).filter(Boolean))
      for (const option of column.options.filter((label) => !kept.has(label))) {
        const n = rows.filter((row) => valuesOf(row.cells[column.id]).includes(option)).length
        if (n) lines.push(`Option “${option}” of “${column.name}” is removed: ${count(n, 'row')} keep${n === 1 ? 's' : ''} it, shown as “not in the list” until changed.`)
      }
    }
  }
  return lines
}
// The page with the edited columns: values follow a type change (kept, a list joined or split), a renamed option is
// renamed in every row, a removed option's values stay (shown "not in the list"), a removed column's values go.
export function applyColumns(page: OnDemandPage, drafts: ColumnDraft[], id: () => string = () => newId('c')): OnDemandPage {
  const columns: OnDemandColumn[] = drafts.map((draft) => {
    const description = cleanDescription(draft.description)
    // LST-08: a built-in list column keeps its list and, as options, the list's names (cut to the options' limit).
    const list = hasOptions(draft.type) && draft.list && listRefPattern.test(draft.list) ? draft.list : ''
    const options = hasOptions(draft.type) ? draft.options.map((option) => cleanName(option.label)) : []
    return { id: draft.isNew || !draft.id ? id() : draft.id, name: cleanName(draft.name), type: draft.type, required: draft.required, options: list ? [...new Set(options.filter(Boolean))].slice(0, maxOptions) : options, ...(description ? { description } : {}), ...(draft.type === 'currency' ? { currency: (draft.currency ?? defaultCurrency).trim().toUpperCase() } : {}), ...(list ? { list } : {}) }
  })
  // LST-09: a value's key stays while its column keeps the same built-in list and type (the values are not converted).
  const keepsRefs = (draft: ColumnDraft, index: number) => { const before = page.columns.find((column) => column.id === draft.id); return Boolean(!draft.isNew && before?.list && before.list === columns[index].list && before.type === draft.type) }
  // The row keeps its key, ID, who added it and its log (OND-18…21); only its values follow the columns.
  const rows = page.rows.map(({ refs: before, ...row }) => ({ ...row, ...refsPart(Object.fromEntries(drafts.flatMap((draft, index): [string, string[]][] => before?.[draft.id] && keepsRefs(draft, index) ? [[columns[index].id, before[draft.id]]] : []))), cells: Object.fromEntries(drafts.flatMap((draft, index) => {
    if (draft.isNew) return []
    const before = page.columns.find((column) => column.id === draft.id)
    const value = row.cells[draft.id]
    if (!before || isEmpty(value)) return []
    const renames = new Map(draft.options.filter((option) => option.was && option.was !== cleanName(option.label)).map((option) => [option.was!, cleanName(option.label)]))
    const converted = convertValue(value, draft.type)
    const renamed = Array.isArray(converted) ? [...new Set(converted.map((entry) => renames.get(entry) ?? entry))] : converted == null ? undefined : renames.get(converted) ?? converted
    return renamed == null ? [] : [[columns[index].id, renamed]]
  })) }))
  return { ...page, columns, rows }
}

const refsPart = (refs: Record<string, string[]>) => Object.keys(refs).length ? { refs } : {}

// ---- export ----
// The table as exported (OND-03, OND-19…23): ID, Key, the columns (a Currency as "1,200.00 EUR", a Long text in full),
// Added by / on and Last updated by / on (UTC). The update log itself is not exported (it is in the page file).
export const tableRows = (page: OnDemandPage, rows = page.rows) => [['ID', 'Key', ...page.columns.map((column) => column.name), 'Added by', 'Added on', 'Last updated by', 'Last updated on'], ...rows.map((row) => { const last = lastUpdate(row); return [rowId(page, row), row.key ?? '', ...page.columns.map((column) => displayText(column, row.cells[column.id])), row.addedBy ?? '', row.addedAt ?? '', last?.by ?? '', last?.at ?? ''] })]
export const tableCsv = (page: OnDemandPage, rows = page.rows) => tableRows(page, rows).map((row) => row.map(csvCell).join(',')).join('\r\n')

// ---- the Git file (OND-08) ----
const text = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean' ? String(value) : ''
const types = onDemandTypes.map((entry) => entry.key)
// Reads one page file: anything that is not a page is refused; unknown types become Text, bad ids, duplicates, values
// of unknown columns and values that are not text are dropped; sizes are capped. expectedId: the file's name, which
// wins over the id inside (so a file cannot claim another page's place).
export function parseOnDemandPage(raw: string, expectedId?: string): OnDemandPage {
  let data: unknown
  try { data = JSON.parse(raw) } catch { throw new Error(`${expectedId ? onDemandPath(expectedId) : 'The On-Demand page'} is not valid JSON.`) }
  const file = data as Partial<Record<keyof OnDemandPage, unknown>> | null
  if (!file || typeof file !== 'object' || Array.isArray(file) || file.kind !== 'on-demand-page' || !Array.isArray(file.columns) || !Array.isArray(file.rows)) throw new Error(`${expectedId ? onDemandPath(expectedId) : 'The file'} is not an On-Demand page.`)
  const id = expectedId ?? (typeof file.id === 'string' && pageIdPattern.test(file.id) ? file.id : '')
  if (!pageIdPattern.test(id)) throw new Error('The On-Demand page has no valid id.')
  const seen = new Set<string>()
  const columns = (file.columns as unknown[]).flatMap((entry): OnDemandColumn[] => {
    const column = entry as Partial<Record<keyof OnDemandColumn, unknown>> | null
    if (!column || typeof column.id !== 'string' || !idPattern.test(column.id) || seen.has(column.id)) return []
    seen.add(column.id)
    const type = types.includes(column.type as OnDemandType) ? column.type as OnDemandType : 'text'
    const options = hasOptions(type) && Array.isArray(column.options) ? [...new Set(column.options.map((option) => cleanName(text(option, 120))).filter(Boolean))].slice(0, maxOptions) : []
    const description = cleanDescription(text(column.description, maxDescription))
    const code = typeof column.currency === 'string' ? column.currency.trim().toUpperCase() : ''
    // LST-08: a list reference only on a Dropdown or Multi-select, and only of the known form.
    const list = hasOptions(type) && typeof column.list === 'string' && listRefPattern.test(column.list) ? column.list : ''
    return [{ id: column.id, name: cleanName(text(column.name, 120)) || column.id, type, options, required: column.required === true, ...(description ? { description } : {}), ...(type === 'currency' ? { currency: currencyPattern.test(code) ? code : defaultCurrency } : {}), ...(list ? { list } : {}) }]
  }).slice(0, maxColumns)
  const rowIds = new Set<string>(), rowKeys = new Set<string>(), rowSeqs = new Set<number>()
  const rows = (file.rows as unknown[]).flatMap((entry): OnDemandRow[] => {
    const row = entry as Partial<Record<keyof OnDemandRow, unknown>> | null
    if (!row || typeof row.id !== 'string' || !idPattern.test(row.id) || rowIds.has(row.id)) return []
    rowIds.add(row.id)
    // OND-18: a valid key is kept; a second row with the same key loses it here and gets a new one on the next save.
    const key = typeof row.key === 'string' && rowKeyPattern.test(row.key) && !rowKeys.has(row.key) ? row.key : undefined
    if (key) rowKeys.add(key)
    // OND-19: a whole number 1…9,999,999 is kept; a second row with the same number loses it here and gets the next
    // free one on the next save.
    const seq = typeof row.seq === 'number' && Number.isInteger(row.seq) && row.seq >= 1 && row.seq <= maxSeq && !rowSeqs.has(row.seq) ? row.seq : undefined
    if (seq) rowSeqs.add(seq)
    const addedBy = text(row.addedBy, 200).trim()
    const addedAt = isoTime(row.addedAt)
    const log = parseLog(row.log)
    const hiddenBy = row.hidden && typeof row.hidden === 'object' ? row.hidden as Record<string, unknown> : null
    const hidden = hiddenBy && isoTime(hiddenBy.at) ? { by: text(hiddenBy.by, 200).trim() || 'unknown', at: isoTime(hiddenBy.at) } : null
    const cells = row.cells && typeof row.cells === 'object' && !Array.isArray(row.cells) ? row.cells as Record<string, unknown> : {}
    const values: Record<string, OnDemandValue> = Object.fromEntries(columns.flatMap((column): [string, OnDemandValue][] => {
      const value = cells[column.id]
      if (column.type === 'multi') { const list = [...new Set((Array.isArray(value) ? value : [value]).map((item) => text(item, maxValue).trim()).filter(Boolean))].slice(0, maxOptions); return list.length ? [[column.id, list]] : [] }
      // Every single value is read up to the Long text size, so changing a column's type never cuts a value (OND-06).
      const single = (Array.isArray(value) ? value.map((item) => text(item, maxLongValue)).filter(Boolean).join(', ') : text(value, maxLongValue)).trim().slice(0, maxLongValue)
      return single ? [[column.id, single]] : []
    }))
    const refs = parseRefs(row.refs, columns, values)
    return [{ id: row.id, ...(key ? { key } : {}), ...(seq ? { seq } : {}), ...(addedBy ? { addedBy } : {}), ...(addedAt ? { addedAt } : {}), ...(log.length ? { log } : {}), ...(hidden ? { hidden } : {}), ...(refs ? { refs } : {}), cells: values }]
  }).slice(0, maxRows)
  const name = cleanName(text(file.name, 80)) || id
  const keyPrefix = typeof file.keyPrefix === 'string' && keyPrefixPattern.test(file.keyPrefix) ? file.keyPrefix : prefixFor(name)
  const colors = parseColors(file.colors)
  return { schema: 1, kind: 'on-demand-page', id, name, description: text(file.description, 300).trim(), keyPrefix, columns, rows, insights: parseInsights(file.insights), ...(colors ? { colors } : {}), ...(file.storage === 'rows' ? { storage: 'rows' as const } : {}), ...(typeof file.lastSeq === 'number' && Number.isInteger(file.lastSeq) && file.lastSeq >= 1 && file.lastSeq <= maxSeq ? { lastSeq: file.lastSeq } : {}), ...insightFiltersPart(parseInsightFilterSetup(file.insightFilters)) }
}
// LST-09: a row's keys as read — only for a built-in list column of the page and one per value (else that column's keys
// are dropped), each an identity id (a GUID, lower case) or ''; a column whose keys are all '' is left out.
function parseRefs(raw: unknown, columns: OnDemandColumn[], cells: Record<string, OnDemandValue>): Record<string, string[]> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const input = raw as Record<string, unknown>
  const out = Object.fromEntries(columns.flatMap((column): [string, string[]][] => {
    const list = input[column.id]
    if (!column.list || !Array.isArray(list) || list.length !== valuesOf(cells[column.id]).length) return []
    const refs = list.map((entry) => typeof entry === 'string' && listKeyPattern.test(entry.trim()) ? entry.trim().toLowerCase() : '')
    return refs.some(Boolean) ? [[column.id, refs]] : []
  }))
  return Object.keys(out).length ? out : undefined
}
// OND-20, OND-21: a time in the file — kept as a UTC ISO time when it is one, else dropped.
const isoTime = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : ''
// OND-21: a row's log — entries without a valid id or time, or repeated, are dropped; texts and sizes capped; oldest first.
export function parseLog(list: unknown): LogEntry[] {
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  return capLog(list.flatMap((raw): LogEntry[] => {
    const entry = raw as Partial<Record<keyof LogEntry, unknown>> | null
    const at = isoTime(entry?.at)
    if (!entry || typeof entry.id !== 'string' || !idPattern.test(entry.id) || seen.has(entry.id) || !at) return []
    seen.add(entry.id)
    const comment = text(entry.comment, maxComment).trim()
    const changes = (Array.isArray(entry.changes) ? entry.changes : []).flatMap((item): RowChange[] => {
      const change = item as Partial<Record<keyof RowChange, unknown>> | null
      if (!change || typeof change.column !== 'string' || !idPattern.test(change.column)) return []
      return [{ column: change.column, from: text(change.from, maxLogText), to: text(change.to, maxLogText) }]
    }).slice(0, maxColumns)
    return [{ id: entry.id, at, by: text(entry.by, 200).trim() || 'unknown', ...(entry.added === true ? { added: true as const } : {}), ...(entry.action === 'hidden' || entry.action === 'shown' ? { action: entry.action } : {}), ...(comment ? { comment } : {}), changes }]
  }))
}
// OND-16: the insights of a page file — an unknown type, a bad or repeated id is dropped; a reference to a column that
// is not (or no longer) on the page is kept as written and shown as broken (OND-17); sizes are capped.
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/
const ref = (value: unknown) => typeof value === 'string' && idPattern.test(value) ? value : ''
export function parseInsights(list: unknown): Insight[] {
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  return list.flatMap((entry): Insight[] => {
    const item = entry as Partial<Record<keyof Insight, unknown>> | null
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !idPattern.test(item.id) || seen.has(item.id) || !insightTypeKeys.includes(item.type as InsightType)) return []
    seen.add(item.id)
    const type = item.type as InsightType
    const measure: InsightMeasure = measureKeys.includes(item.measure as InsightMeasure) ? item.measure as InsightMeasure : 'count'
    const filters = (Array.isArray(item.filters) ? item.filters : []).flatMap((raw): InsightFilter[] => {
      const filter = raw as Partial<Record<keyof InsightFilter, unknown>> | null
      const column = ref(filter?.column)
      if (!filter || !column) return []
      const values = Array.isArray(filter.values) ? [...new Set(filter.values.filter((value): value is string => typeof value === 'string').map((value) => cleanName(value, 120)))].slice(0, maxOptions) : undefined
      const from = typeof filter.from === 'string' && monthPattern.test(filter.from) ? filter.from : undefined
      const to = typeof filter.to === 'string' && monthPattern.test(filter.to) ? filter.to : undefined
      if (!values?.length && !from && !to) return []
      return [{ column, ...(values?.length ? { values } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) }]
    }).slice(0, maxFilters)
    const options = cleanOptions(type, measure, item.options)
    // CHT-60, CHT-68: a Narrative's sentences and rules, validated (unknown sentences, operators and placeholders dropped).
    const narrative = type === 'narrative' ? { narrative: parseNarrative((item as { narrative?: unknown }).narrative) } : {}
    return [{ id: item.id, title: cleanName(text(item.title, 120)) || 'Untitled', type, category: type === 'kpi' ? '' : ref(item.category), second: type === 'pie' || type === 'pareto' || type === 'kpi' || type === 'narrative' ? '' : ref(item.second), measure, value: measure === 'count' ? '' : ref(item.value), filters, sort: type === 'line' ? 'label' : type === 'pareto' || type === 'narrative' ? 'value' : item.sort === 'label' ? 'label' : 'value', ...(options ? { options } : {}), ...narrative, ...pivotLevels(type, item as Record<string, unknown>, ref) }]
  }).slice(0, maxInsights)
}
// CHT: the options are written only when an insight has any, so a file without them stays byte for byte as before.
const insightOut = ({ id, title, type, category, second, measure, value, filters, sort, options, narrative, rows2, rows3, second2 }: Insight) => ({ id, title, type, category, ...(second ? { second } : {}), ...pivotLevelsOut({ type, rows2, rows3, second2: second ? second2 : undefined }), measure, ...(value ? { value } : {}), ...(filters.length ? { filters } : {}), sort, ...(options && Object.keys(options).length ? { options } : {}), ...(type === 'narrative' ? { narrative: narrativeOut(narrative) } : {}) })
// Schema 1 still: the new fields (a column's description and currency, a row's seq, addedBy, addedAt and log) are
// optional, so an older file reads as before; an older app version drops them when it saves (LIM-19).
const logOut = ({ id, at, by, added, action, comment, changes }: LogEntry) => ({ id, at, by, ...(added ? { added } : {}), ...(action ? { action } : {}), ...(comment ? { comment } : {}), changes })
// fill: false (the copy kept in this browser) writes the page as it is, without giving keys and numbers.
export function serializeOnDemandPage(input: OnDemandPage, { fill = true }: { fill?: boolean } = {}) {
  // OND-66: a page shown with sample rows is never written to Git (nor kept as the page last read).
  if (input.sample) throw new Error(`Sample data is shown for ${input.name}: nothing is saved to Git. Switch to Live to change it.`)
  // OND-18, OND-19: a saved file has a key and a sequential number on every row.
  const page = fill ? withRowNumbers(withRowKeys(input)) : input
  const out = `${JSON.stringify({ schema: 1, kind: 'on-demand-page', id: page.id, name: page.name, description: page.description, keyPrefix: page.keyPrefix, columns: page.columns.map(({ id, name, type, options, required, description, currency, list }) => ({ id, name, type, ...(hasOptions(type) ? { options } : {}), ...(required ? { required } : {}), ...(description ? { description } : {}), ...(type === 'currency' ? { currency: currency ?? defaultCurrency } : {}), ...(list && hasOptions(type) ? { list } : {}) })), rows: page.rows.map(({ id, key, seq, addedBy, addedAt, log, hidden, refs, cells }) => ({ id, ...(key ? { key } : {}), ...(seq ? { seq } : {}), ...(addedBy ? { addedBy } : {}), ...(addedAt ? { addedAt } : {}), ...(log?.length ? { log: log.map(logOut) } : {}), ...(hidden ? { hidden } : {}), ...(refs && Object.keys(refs).length ? { refs } : {}), cells })), ...(page.insights.length ? { insights: page.insights.map(insightOut) } : {}), ...(page.colors && Object.keys(page.colors).length ? { colors: page.colors } : {}), ...(page.storage === 'rows' ? { storage: 'rows' } : {}), ...(page.lastSeq ? { lastSeq: page.lastSeq } : {}), ...insightFiltersPart(page.insightFilters) }, null, 1)}\n`
  if (new TextEncoder().encode(out).length > onDemandMaxBytes) throw new Error(`The page is too large to save to Git (over ${Math.round(onDemandMaxBytes / 1000)} KB). Remove rows, or split it into two pages.`)
  return out
}
// OND-62: a table page still in one file is suggested to be converted to row files (OND-32) when it has more than
// 500 rows or its file is over 600 KB (two thirds of the 900 KB a single file may have, OND-08). The size is the file as
// written (a page too large to be written counts as over).
export const suggestRowFilesAt = { rows: 500, bytes: 600_000 }
export function pageFileBytes(page: OnDemandPage) { try { return new TextEncoder().encode(serializeOnDemandPage(page, { fill: false })).length } catch { return onDemandMaxBytes + 1 } }
export const suggestRowFiles = (rows: number, bytes: number) => rows > suggestRowFilesAt.rows || bytes > suggestRowFilesAt.bytes
// GIT-21: what a newer menu layout makes the app read: the pages listed in Git and not known here (read), and the pages
// known here that are no longer listed (dropped) — except keep(id), the page in use with edits not saved here.
export function pageListChange(known: string[], listed: { id: string; rows: boolean }[], keep: (id: string) => boolean = () => false) {
  const ids = new Set(listed.map((entry) => entry.id))
  return { read: listed.filter((entry) => !known.includes(entry.id)), dropped: known.filter((id) => !ids.has(id) && !keep(id)) }
}
export const sortPages = (pages: OnDemandPage[]) => [...pages].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) || a.id.localeCompare(b.id))

// ---- merging two saves (OND-09, GIT-17) ----
// The name and description are one entry; columns and rows are merged by id; where both saves changed the same entry,
// the later save wins — also between a change and a removal, so a removed row stays removed unless it was changed
// later. The column order follows the save that changed it (the later one when both did); new columns go last.
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
function later<T>(base: T | undefined, mine: T | undefined, theirs: T | undefined, mineLater: boolean): T | undefined {
  if (same(mine, base)) return theirs
  if (same(theirs, base)) return mine
  return mineLater ? mine : theirs
}
function mergeById<T extends { id: string }>(base: T[] | null, mine: T[], theirs: T[], mineLater: boolean): T[] {
  const index = (list: T[] | null) => new Map((list ?? []).map((entry) => [entry.id, entry]))
  const b = index(base), m = index(mine), t = index(theirs)
  const ids = [...new Set([...theirs.map((entry) => entry.id), ...mine.map((entry) => entry.id)])]
  // Without a base (never read here), every entry counts as new: both sides' entries stay.
  return ids.flatMap((id) => { const value = base ? later(b.get(id), m.get(id), t.get(id), mineLater) : m.get(id) ?? t.get(id); return value ? [value] : [] })
}
// OND-19…21: rows as mergeById (the later save wins for the values), then what is set once and the log are taken from
// both: the number, who added it and when from the save already in Git (theirs) when it has them, else from mine; the
// log is the union of both logs by entry id, in time order (the last 100), so no entry is lost. A number mine gave that
// is already taken in Git is dropped here and the row gets the next free one when the merged file is written.
function mergeRows(base: OnDemandRow[] | null, mine: OnDemandRow[], theirs: OnDemandRow[], mineLater: boolean): OnDemandRow[] {
  const t = new Map(theirs.map((row) => [row.id, row])), m = new Map(mine.map((row) => [row.id, row]))
  const fixed = mergeById(base, mine, theirs, mineLater).map((merged) => {
    const a = t.get(merged.id), b = m.get(merged.id)
    const log = capLog([...(a?.log ?? []), ...(b?.log ?? [])].filter((entry, index, list) => list.findIndex((other) => other.id === entry.id) === index))
    const seq = a?.seq ?? b?.seq, addedBy = a?.addedBy ?? b?.addedBy, addedAt = a?.addedAt ?? b?.addedAt
    const row: OnDemandRow = { id: merged.id, ...(merged.key ? { key: merged.key } : {}), ...(seq ? { seq } : {}), ...(addedBy ? { addedBy } : {}), ...(addedAt ? { addedAt } : {}), ...(log.length ? { log } : {}), ...(merged.hidden ? { hidden: merged.hidden } : {}), ...(merged.refs ? { refs: merged.refs } : {}), cells: merged.cells }
    return { row, inGit: Boolean(seq) && a?.seq === seq }
  })
  const taken = new Set(fixed.flatMap((entry) => entry.inGit && entry.row.seq ? [entry.row.seq] : []))
  return fixed.map(({ row, inGit }) => {
    if (inGit || !row.seq) return row
    if (taken.has(row.seq)) return { ...row, seq: undefined }
    taken.add(row.seq); return row
  })
}
export const mergeOnDemandText: Merge = (baseText, mineText, theirsText, mineLater) => {
  const read = (raw: string | null) => { if (!raw) return null; try { return parseOnDemandPage(raw) } catch { return null } }
  const mine = read(mineText), theirs = read(theirsText), base = read(baseText)
  if (!mine || !theirs) return mineText
  const headOf = (page: OnDemandPage) => ({ name: page.name, description: page.description, keyPrefix: page.keyPrefix })
  const head = later(base ? headOf(base) : undefined, headOf(mine), headOf(theirs), mineLater) ?? headOf(mine)
  const columns = mergeById(base?.columns ?? null, mine.columns, theirs.columns, mineLater)
  const order = later(base?.columns.map((column) => column.id), mine.columns.map((column) => column.id), theirs.columns.map((column) => column.id), mineLater) ?? mine.columns.map((column) => column.id)
  const ordered = [...order.flatMap((id) => columns.filter((column) => column.id === id)), ...columns.filter((column) => !order.includes(column.id))]
  const rows = mergeRows(base?.rows ?? null, mine.rows, theirs.rows, mineLater)
  // OND-16: insights merged by id like the columns, their order following the save that changed it.
  const insights = mergeById(base?.insights ?? null, mine.insights, theirs.insights, mineLater)
  const insightOrder = later(base?.insights.map((entry) => entry.id), mine.insights.map((entry) => entry.id), theirs.insights.map((entry) => entry.id), mineLater) ?? mine.insights.map((entry) => entry.id)
  const orderedInsights = [...insightOrder.flatMap((id) => insights.filter((entry) => entry.id === id)), ...insights.filter((entry) => !insightOrder.includes(entry.id))]
  // CHT-09: the colour pins are one entry, the later save's where both changed them.
  const colors = later(base?.colors, mine.colors, theirs.colors, mineLater)
  // OND-52: the Insights filter row's setup is one entry, the later save's where both changed it.
  const insightFilters = later(base?.insightFilters, mine.insightFilters, theirs.insightFilters, mineLater)
  // Read back through the parser: values of columns that are gone are dropped, every rule of the file applies.
  return serializeOnDemandPage(parseOnDemandPage(JSON.stringify({ schema: 1, kind: 'on-demand-page', id: mine.id, ...head, columns: ordered, rows, insights: orderedInsights.map(insightOut), ...(colors ? { colors } : {}), ...(mine.storage === 'rows' || theirs.storage === 'rows' ? { storage: 'rows' } : {}), ...(Math.max(mine.lastSeq ?? 0, theirs.lastSeq ?? 0) ? { lastSeq: Math.max(mine.lastSeq ?? 0, theirs.lastSeq ?? 0) } : {}), ...insightFiltersPart(insightFilters) }), mine.id))
}

// ---- the Insights filter row (OND-50…OND-56) ----
// OND-52: the page owner's setup of the Insights tab's filter row — the Date column of the period (optional) and up to 6
// filter columns, in order — as one optional field `insightFilters` of the page file, written only when set (a page
// without it is written byte for byte as before; an older app version ignores it, and drops it when it saves, LIM-35).
// Read back, only the shape is checked here (ids, no repeats, the period column not again as a field, at most 6); a
// column that is not on the page or no longer of a type that can filter is left out of the row when it is drawn, with a
// note (insightFilters.ts, resolveFilterSetup) — so a merge with a save that added the column loses nothing.
export interface InsightFilterSetup { period?: string; fields: string[] }
export const maxInsightFilters = 6
export function parseInsightFilterSetup(raw: unknown): InsightFilterSetup | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const item = raw as { period?: unknown; fields?: unknown }
  const period = ref(item.period)
  const fields = [...new Set((Array.isArray(item.fields) ? item.fields : []).map(ref).filter((id) => id && id !== period))].slice(0, maxInsightFilters)
  return period || fields.length ? { ...(period ? { period } : {}), fields } : undefined
}
const insightFiltersPart = (setup: InsightFilterSetup | undefined) => setup && (setup.period || setup.fields.length) ? { insightFilters: { ...(setup.period ? { period: setup.period } : {}), fields: setup.fields } } : {}
