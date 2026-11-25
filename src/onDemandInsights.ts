import { additive, blankNarrative, cleanOptions, hasOptions, moneyOf, narrativeError, valuesOf, type DateGroup, type Insight, type InsightFilter, type InsightMeasure, type InsightType, type OnDemandColumn, type OnDemandPage, type OnDemandRow, type OnDemandType } from './onDemand.ts'

// OND-11…OND-17 Insights of an On-Demand page: what each chart or summary table is made of, the checks of its column
// references, and the aggregation of the page's rows into categories × series. Kept free of React so that every rule
// is tested on its own (tests/on-demand-insights.test.mjs).

export const insightTypes: { key: InsightType; label: string; hint: string }[] = [
  { key: 'bar', label: 'Bar / column', hint: 'A value per category, optionally stacked by a Dropdown or Multi-select.' },
  { key: 'line', label: 'Line over time', hint: 'A value per month of a Date column.' },
  { key: 'pie', label: 'Pie / donut', hint: 'Each category’s share of the total; more than 5 categories: the 5 largest and “Other”.' },
  { key: 'pareto', label: 'Pareto', hint: 'Categories largest first as columns, the cumulative share (%) as a line on a 0–100% axis and an 80% line.' },
  { key: 'kpi', label: 'KPI (one number)', hint: 'One number: the count, sum, average, minimum, maximum or distinct count of the rows.' },
  { key: 'table', label: 'Pivot table', hint: 'Rows by up to 3 fields and optional columns by up to 2 (＋ then by), with subtotals and totals; groups open and close, and a click lists the rows behind a number.' },
  { key: 'narrative', label: 'Narrative (text)', hint: 'Sentences about the measure — the total, the highest and lowest, the change against the previous period — and rules of your own, as plain text.' },
]
export const insightTypeLabel = (type: InsightType) => insightTypes.find((entry) => entry.key === type)?.label ?? type
export const measures: { key: InsightMeasure; label: string }[] = [{ key: 'count', label: 'Count of rows' }, { key: 'sum', label: 'Sum' }, { key: 'average', label: 'Average' }, { key: 'min', label: 'Minimum' }, { key: 'max', label: 'Maximum' }, { key: 'distinct', label: 'Distinct count' }]
// CHT-07: the measures a type offers — a pie or Pareto shows shares of a total, so only the measures that add up.
export const measuresFor = (type: InsightType) => measures.filter((measure) => type !== 'pie' && type !== 'pareto' || additive(measure.key))

// Which columns each part may use.
const categoryTypes: Record<InsightType, OnDemandType[]> = { bar: ['dropdown', 'multi', 'text', 'date'], line: ['date'], pie: ['dropdown', 'multi', 'text', 'date'], table: ['dropdown', 'multi', 'text', 'date'], pareto: ['dropdown', 'multi', 'text', 'date'], kpi: [], narrative: ['dropdown', 'multi', 'text', 'date'] }
const secondTypes: Record<InsightType, OnDemandType[]> = { bar: ['dropdown', 'multi'], line: ['dropdown', 'multi'], pie: [], table: ['dropdown', 'multi', 'text', 'date'], pareto: [], kpi: [], narrative: [] }
export const categoryColumns = (page: OnDemandPage, type: InsightType) => page.columns.filter((column) => categoryTypes[type].includes(column.type))
export const secondColumns = (page: OnDemandPage, type: InsightType) => page.columns.filter((column) => secondTypes[type].includes(column.type))
// OND-24: Sum and Average take a Number or a Currency column.
const valueTypes: OnDemandType[] = ['number', 'currency']
export const valueColumns = (page: OnDemandPage) => page.columns.filter((column) => valueTypes.includes(column.type))
// CHT-07: Minimum and Maximum take a Number or Currency column like Sum; Distinct count any column but Long text.
const distinctTypes: OnDemandType[] = ['text', 'number', 'currency', 'date', 'dropdown', 'multi']
const measureTypes = (measure: InsightMeasure) => measure === 'distinct' ? distinctTypes : valueTypes
export const measureColumns = (page: OnDemandPage, measure: InsightMeasure) => page.columns.filter((column) => measureTypes(measure).includes(column.type))
export const filterColumns = (page: OnDemandPage) => page.columns.filter((column) => hasOptions(column.type) || column.type === 'date')
// CHT-40: a bar chart whose series are drawn side by side (grouped) — only with a second field.
export const isGrouped = (insight: Pick<Insight, 'type' | 'second' | 'options'>) => insight.type === 'bar' && Boolean(insight.second) && insight.options?.grouping === 'grouped'
export const secondLabel = (type: InsightType) => type === 'table' ? 'Columns by' : type === 'line' ? 'One line per' : 'Stacked by'
// CHT-03: the words of a date grouping.
export const dateGroupLabels: Record<DateGroup, { label: string; unit: string }> = { day: { label: 'Day', unit: 'day' }, week: { label: 'Week (ISO, from Monday)', unit: 'week' }, month: { label: 'Month', unit: 'month' }, quarter: { label: 'Quarter', unit: 'quarter' }, year: { label: 'Year', unit: 'year' } }
export const grainOf = (insight: Insight): DateGroup => insight.options?.dateGroup ?? 'month'

// ---- Pivot table fields (CHT-74…CHT-79) ----
// A Pivot table (type 'table') has up to 3 row fields, outermost first (category, rows2, rows3), and up to 2 column
// fields (second, second2); every other type has its category and second only.
export const maxPivotRows = 3, maxPivotColumns = 2
type PivotFields = Pick<Insight, 'type' | 'category' | 'second' | 'rows2' | 'rows3' | 'second2'>
export const pivotRowFields = (insight: PivotFields) => insight.type !== 'table' ? [insight.category].filter(Boolean) : [insight.category, insight.category ? insight.rows2 ?? '' : '', insight.category && insight.rows2 ? insight.rows3 ?? '' : ''].filter(Boolean)
export const pivotColumnFields = (insight: PivotFields) => insight.type !== 'table' ? [insight.second].filter(Boolean) : [insight.second, insight.second ? insight.second2 ?? '' : ''].filter(Boolean)
// A table with more than one row or column field: drawn as the nested Pivot table (CHT-74); a one-level table as before.
export const isNestedPivot = (insight: PivotFields) => insight.type === 'table' && (pivotRowFields(insight).length > 1 || pivotColumnFields(insight).length > 1)
// The insight with these row and column fields (outermost first): the stored fields set, the ones not given cleared.
export function withPivotFields<T extends PivotFields>(insight: T, rows: string[], columns: string[]): T {
  const out = { ...insight, category: rows[0] ?? '', second: columns[0] ?? '' }
  delete out.rows2; delete out.rows3; delete out.second2
  if (insight.type !== 'table') return out
  if (rows[1]) out.rows2 = rows[1]
  if (rows[1] && rows[2]) out.rows3 = rows[2]
  if (columns[0] && columns[1]) out.second2 = columns[1]
  return out
}

// A new insight's starting point: the first column that fits, Count of rows, no filter, largest first.
export function blankInsight(page: OnDemandPage, id: string, type: InsightType = 'bar'): Insight {
  const out: Insight = { id, title: '', type, category: type === 'kpi' ? '' : categoryColumns(page, type)[0]?.id ?? '', second: '', measure: 'count', value: '', filters: [], sort: type === 'line' ? 'label' : 'value' }
  if (type === 'narrative') out.narrative = blankNarrative()
  return out
}
// The draft after the type is changed: fields that no longer fit are cleared or replaced by the first that fits.
export function withType(page: OnDemandPage, insight: Insight, type: InsightType): Insight {
  // CHT-60: a Narrative's Group by is optional — kept when it fits, else the first column that fits.
  const category = type === 'kpi' ? '' : categoryColumns(page, type).some((column) => column.id === insight.category) ? insight.category : categoryColumns(page, type)[0]?.id ?? ''
  const second = secondColumns(page, type).some((column) => column.id === insight.second) && insight.second !== category ? insight.second : ''
  // A pie or Pareto adds its parts up: Average, Minimum, Maximum become Sum (of the same column), Distinct count Count.
  const shares = type === 'pie' || type === 'pareto'
  const measure: InsightMeasure = shares && !additive(insight.measure) ? insight.measure === 'distinct' ? 'count' : 'sum' : insight.measure
  const value = measure === 'count' ? '' : measure === insight.measure ? insight.value : valueColumns(page).some((column) => column.id === insight.value) ? insight.value : valueColumns(page)[0]?.id ?? ''
  const options = cleanOptions(type, measure, insight.options)
  // CHT-79: a Pivot table keeps its nested fields that still fit (each column once); any other type drops them.
  const fits = (id: string | undefined) => Boolean(id) && secondColumns(page, 'table').some((column) => column.id === id)
  const nested = type !== 'table' ? { rows: [category], columns: [second] } : (() => {
    const rows = [category, ...[insight.rows2, insight.rows3].filter(fits) as string[]]
    const columns = [second, ...(second && fits(insight.second2) ? [insight.second2!] : [])]
    const seen = new Set<string>()
    const once = (list: string[]) => list.filter((id) => id && !seen.has(id) && Boolean(seen.add(id)))
    return { rows: once(rows), columns: once(columns) }
  })()
  const next: Insight = withPivotFields({ ...insight, type, category, second, measure, value, sort: type === 'line' ? 'label' : type === 'pareto' || type === 'narrative' ? 'value' : insight.sort }, nested.rows, nested.columns)
  if (options) next.options = options
  else delete next.options
  if (type === 'narrative') next.narrative = insight.narrative ?? blankNarrative()
  else delete next.narrative
  return next
}

// ---- references (OND-17) ----
const columnOf = (page: OnDemandPage, id: string) => page.columns.find((column) => column.id === id)
const typeName: Record<OnDemandType, string> = { text: 'Text', longtext: 'Long text', number: 'Number', currency: 'Currency', date: 'Date', dropdown: 'Dropdown', multi: 'Multi-select' }
const measureWord: Record<InsightMeasure, string> = { count: 'count', sum: 'sum', average: 'average', min: 'minimum', max: 'maximum', distinct: 'distinct count' }
const allowed = (types: OnDemandType[]) => types.map((type) => typeName[type]).join(', ').replace(/, ([^,]*)$/, ' or $1')
// Why an insight cannot be drawn with the page's columns as they are now — empty when it can. A removed column is named
// by its role (its name went with it); a renamed column is simply followed.
export function insightProblems(page: OnDemandPage, insight: Insight): string[] {
  const problems: string[] = []
  const check = (id: string, role: string, types: OnDemandType[]) => {
    const column = columnOf(page, id)
    if (!id || !column) problems.push(`The column ${role} is no longer on the page (removed).`)
    else if (!types.includes(column.type)) problems.push(`“${column.name}” ${role} is now a ${typeName[column.type]} column; it needs ${allowed(types)}.`)
  }
  // CHT-60: a Narrative without a Group by has no category to check; its period must be a Date column.
  if (insight.type === 'narrative') {
    if (insight.category) check(insight.category, 'for Group by', categoryTypes.narrative)
    if (insight.narrative?.period) check(insight.narrative.period, 'for the period', ['date'])
  } else if (insight.type !== 'kpi') check(insight.category, insight.type === 'line' ? `for the ${dateGroupLabels[grainOf(insight)].unit}s` : 'for the categories', categoryTypes[insight.type])
  if (insight.second) {
    if (insight.second === insight.category) problems.push('The same column is used twice: choose another one, or none.')
    else check(insight.second, insight.type === 'table' ? 'for the table’s columns' : insight.type === 'line' ? 'for the lines' : 'for the stacks', secondTypes[insight.type])
  }
  // CHT-79: a Pivot table's further row and column fields, each a column of a kind the table takes, each column once.
  if (insight.type === 'table') {
    const nested: [string | undefined, string][] = [[pivotRowFields(insight)[1], 'for the rows (level 2)'], [pivotRowFields(insight)[2], 'for the rows (level 3)'], [pivotColumnFields(insight)[1], 'for the columns (level 2)']]
    for (const [id, role] of nested) if (id) check(id, role, secondTypes.table)
    const used = [...pivotRowFields(insight), ...pivotColumnFields(insight)]
    if (isNestedPivot(insight) && new Set(used).size < used.length && insight.second !== insight.category) problems.push('The same column is used twice: choose another one, or none.')
  }
  if (insight.measure !== 'count') check(insight.value, `for the ${measureWord[insight.measure]}`, measureTypes(insight.measure))
  if (!additive(insight.measure) && insight.type === 'pie') problems.push('A pie shows shares of a total: choose Count of rows or Sum.')
  if (!additive(insight.measure) && insight.type === 'pareto') problems.push('A Pareto adds its categories up to 100%: choose Count of rows or Sum.')
  // CHT-40: grouped bars (side by side) take every measure; stacked ones add their parts up.
  if (!additive(insight.measure) && insight.type === 'bar' && insight.second && !isGrouped(insight)) problems.push(`Stacked bars add their parts up: ${insight.measure === 'average' ? 'an Average' : `a ${measureWord[insight.measure]}`} cannot be stacked. Choose Count or Sum, Grouped (side by side) under Format, or no stack.`)
  for (const filter of insight.filters) {
    const column = columnOf(page, filter.column)
    if (!column) problems.push('A filter’s column is no longer on the page (removed).')
    else if (filter.values?.length && !hasOptions(column.type)) problems.push(`The filter on “${column.name}” picks values, but it is now a ${typeName[column.type]} column.`)
    else if ((filter.from || filter.to) && column.type !== 'date') problems.push(`The filter on “${column.name}” is a date range, but it is now a ${typeName[column.type]} column.`)
  }
  return problems
}
// The pop-up's check before Add / Save: a title and the problems above.
export function insightError(page: OnDemandPage, insight: Insight): string {
  if (!insight.title.trim()) return 'Give the chart or table a title.'
  if (insight.type === 'line' && !categoryColumns(page, 'line').length) return 'A line over time needs a Date column on the page.'
  const target = insight.options?.target
  if (target && !Number.isFinite(target.value)) return 'The target line needs a number.'
  if (insight.type === 'narrative') { const problem = narrativeError(insight.narrative, Boolean(insight.category)); if (problem) return problem }
  return insightProblems(page, insight)[0] ?? ''
}

// ---- values of a row in a field ----
export const noneKey = '', noneLabel = '(none)', otherKey = '\u0000other'
export interface Bucket { key: string; label: string }
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthLabel = (month: string) => `${monthNames[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`
const none: Bucket = { key: noneKey, label: noneLabel }
// CHT-03: the period a date falls in — day (YYYY-MM-DD), ISO week (YYYY-Www: weeks start on Monday, week 1 holds the
// year's first Thursday), month (YYYY-MM, as before), quarter (YYYY-Qn) or year (YYYY). Keys sort in time order.
const day = 86_400_000
const pad2 = (value: number) => String(value).padStart(2, '0')
const utc = (date: string) => new Date(`${date}T00:00:00Z`)
function isoWeek(date: string) {
  const at = utc(date)
  const thursday = new Date(at.getTime() + (3 - (at.getUTCDay() + 6) % 7) * day)
  const year = thursday.getUTCFullYear()
  return { year, week: 1 + Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / day / 7) }
}
const mondayOf = (year: number, week: number) => { const jan4 = Date.UTC(year, 0, 4); return new Date(jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * day + (week - 1) * 7 * day) }
export function periodOf(date: string, grain: DateGroup = 'month'): Bucket {
  if (grain === 'day') return { key: date, label: `${Number(date.slice(8, 10))} ${monthLabel(date.slice(0, 7))}` }
  if (grain === 'week') { const { year, week } = isoWeek(date); return { key: `${year}-W${pad2(week)}`, label: `W${pad2(week)} ${year}` } }
  if (grain === 'quarter') { const quarter = Math.ceil(Number(date.slice(5, 7)) / 3); return { key: `${date.slice(0, 4)}-Q${quarter}`, label: `Q${quarter} ${date.slice(0, 4)}` } }
  if (grain === 'year') return { key: date.slice(0, 4), label: date.slice(0, 4) }
  return { key: date.slice(0, 7), label: monthLabel(date.slice(0, 7)) }
}
// The period after a period's key (to draw every period from the first to the last).
export function periodAfter(key: string, grain: DateGroup = 'month'): Bucket {
  if (grain === 'day') return periodOf(new Date(utc(key).getTime() + day).toISOString().slice(0, 10), 'day')
  if (grain === 'week') { const monday = mondayOf(Number(key.slice(0, 4)), Number(key.slice(6))); return periodOf(new Date(monday.getTime() + 7 * day).toISOString().slice(0, 10), 'week') }
  if (grain === 'quarter') { const year = Number(key.slice(0, 4)), quarter = Number(key.slice(6)); return periodOf(quarter === 4 ? `${year + 1}-01-01` : `${year}-${pad2(quarter * 3 + 1)}-01`, 'quarter') }
  if (grain === 'year') return periodOf(`${Number(key) + 1}-01-01`, 'year')
  const [y, m] = key.split('-').map(Number)
  const month = m === 12 ? `${y + 1}-01` : `${y}-${pad2(m + 1)}`
  return { key: month, label: monthLabel(month) }
}
// The categories one row falls in for a column: a Date by its month (or the chosen period, CHT-03); a Dropdown /
// Multi-select by each of its values in the list (a Multi-select row in each of them); a Text by its text. Empty, "not
// in the list" or not a date: "(none)".
export function bucketsOf(column: OnDemandColumn, value: OnDemandRow['cells'][string] | undefined, grain: DateGroup = 'month'): Bucket[] {
  const values = valuesOf(value).map((entry) => entry.trim()).filter(Boolean)
  if (column.type === 'date') return values.length === 1 && isDate(values[0]) ? [periodOf(values[0], grain)] : [none]
  if (hasOptions(column.type)) {
    const known = [...new Set(values.filter((entry) => column.options.includes(entry)))]
    const out = known.map((entry) => ({ key: entry, label: entry }))
    return !values.length || known.length < values.length ? [...out, none] : out
  }
  return values.length ? [{ key: values.join(', '), label: values.join(', ') }] : [none]
}
export const numberOf = (value: OnDemandRow['cells'][string] | undefined) => { const text = valuesOf(value).join(', ').trim(); return text !== '' && Number.isFinite(Number(text)) ? Number(text) : null }

// ---- filters (OND-14) ----
export function passesFilter(column: OnDemandColumn | undefined, filter: InsightFilter, row: OnDemandRow) {
  if (!column) return true // a broken filter is reported (OND-17); it filters nothing
  const keys = bucketsOf(column, row.cells[column.id]).map((bucket) => bucket.key)
  if (filter.values?.length && !keys.some((key) => filter.values!.includes(key))) return false
  if (filter.from || filter.to) {
    const month = keys[0]
    if (!month) return false
    if (filter.from && month < filter.from) return false
    if (filter.to && month > filter.to) return false
  }
  return true
}
export const filterRowsFor = (page: OnDemandPage, insight: Insight) => page.rows.filter((row) => insight.filters.every((filter) => passesFilter(columnOf(page, filter.column), filter, row)))

// ---- aggregation (OND-13) ----
export interface InsightData {
  categories: Bucket[]
  series: Bucket[] // one entry with key '' when there is no second field
  values: (number | null)[][] // [category][series]; null: no row (average) — count and sum give 0
  categoryTotals: (number | null)[] // each row once per category, whatever its series
  seriesTotals: (number | null)[]
  total: number | null // each row once
  rows: { all: number; matched: number; used: number; noNumber: number; noDate: number; multi: boolean; otherCurrency: number }
  // OND-24: for a Sum / Average of a Currency column, the currencies found in the matched rows (with how many rows
  // each, most first) and the one shown; '' / [] otherwise. Amounts of different currencies are never added up.
  currencies: { code: string; rows: number }[]
  currency: string
}
// CHT-07: the smallest and largest number; for Distinct count the set of the values seen.
interface Acc { sum: number; n: number; min: number; max: number; seen?: Set<string> }
const result = (measure: InsightMeasure, acc: Acc | undefined): number | null => {
  if (measure === 'average') return acc && acc.n ? acc.sum / acc.n : null
  if (measure === 'count') return acc?.n ?? 0
  if (measure === 'min') return acc && acc.n ? acc.min : null
  if (measure === 'max') return acc && acc.n ? acc.max : null
  if (measure === 'distinct') return acc?.seen?.size ?? 0
  return acc?.sum ?? 0
}
const add = (map: Map<string, Acc>, key: string, value: number, distinct?: string[]) => {
  const acc = map.get(key) ?? { sum: 0, n: 0, min: Infinity, max: -Infinity }
  acc.sum += value; acc.n += 1; acc.min = Math.min(acc.min, value); acc.max = Math.max(acc.max, value)
  if (distinct) { acc.seen ??= new Set(); for (const entry of distinct) acc.seen.add(entry) }
  map.set(key, acc)
}
const dedupe = (buckets: Bucket[]) => buckets.filter((bucket, index) => buckets.findIndex((entry) => entry.key === bucket.key) === index)
const maxPeriods = (grain: DateGroup) => grain === 'day' ? 4000 : 600

// The rows an aggregation measures, each with its number and the categories and series it falls in — shared by the
// aggregation and the drill-down (CHT-10), so the rows listed behind a bar are exactly the rows counted in it.
interface Prepared { row: OnDemandRow; x: number; d?: string[]; cats: Bucket[]; sers: Bucket[] }
// CHT-76: also the Pivot table's (src/pivotTable.ts), which groups the same measured rows by its nested fields.
export function prepare(page: OnDemandPage, insight: Insight, currencyWanted?: string) {
  const category = columnOf(page, insight.category)
  const second = insight.second ? columnOf(page, insight.second) : undefined
  const value = insight.measure === 'count' ? undefined : columnOf(page, insight.value)
  const grain = grainOf(insight)
  const matched = filterRowsFor(page, insight)
  // OND-24: a Currency column — the currencies of the matched rows; only the rows of one of them are measured.
  const money = value?.type === 'currency' && insight.measure !== 'distinct'
  const found = new Map<string, number>()
  if (money) for (const row of matched) { const amount = moneyOf(row.cells[value.id], value.currency); if (amount) found.set(amount.currency, (found.get(amount.currency) ?? 0) + 1) }
  const currencies = [...found].map(([code, rows]) => ({ code, rows })).sort((a, b) => b.rows - a.rows || a.code.localeCompare(b.code))
  const currency = !money ? '' : currencies.some((entry) => entry.code === currencyWanted) ? currencyWanted! : currencies[0]?.code ?? value.currency ?? ''
  let noNumber = 0, noDate = 0, multi = false, otherCurrency = 0
  const prepared = !category ? [] : matched.flatMap((row): Prepared[] => {
    let x: number | null = 1
    let d: string[] | undefined
    // Distinct count: the values' texts (each value of a Multi-select on its own); a row without one adds nothing.
    if (insight.measure === 'distinct') d = value ? valuesOf(row.cells[value.id]).map((entry) => entry.trim()).filter(Boolean) : []
    else if (insight.measure !== 'count') {
      if (money) { const amount = moneyOf(row.cells[value.id], value.currency); x = amount?.amount ?? null; if (amount && amount.currency !== currency) { otherCurrency++; return [] } }
      else x = value ? numberOf(row.cells[value.id]) : null
    }
    if (x == null) { noNumber++; return [] }
    let cats = bucketsOf(category, row.cells[category.id], grain)
    if (insight.type === 'line') { cats = cats.filter((bucket) => bucket.key !== noneKey); if (!cats.length) { noDate++; return [] } }
    const sers = second ? bucketsOf(second, row.cells[second.id], grain) : [{ key: '', label: '' }]
    if (cats.length > 1 || sers.length > 1) multi = true
    return [{ row, x, d, cats, sers }]
  })
  return { category, second, matched, prepared, currencies, currency, noNumber, noDate, multi, otherCurrency }
}

// Rows grouped by the category field and the second field, the measure of each cell. Totals take each row once
// (a Multi-select row in two categories counts once in the total), so with a Multi-select field the parts can add up
// to more than the total — said in the insight's ⓘ. maxCategories / maxSeries keep that many largest values and put the
// rest, with "(none)", in "Other" (pie: 5 + Other = 6 slices; stacks and lines: the 5 series colours + Other).
// limits.currency: the currency to show for a Currency column (OND-24); not found or not given, the one of most rows.
export function aggregate(page: OnDemandPage, insight: Insight, limits: { maxCategories?: number; maxSeries?: number; currency?: string } = {}): InsightData {
  const { category, second, matched, prepared, currencies, currency, noNumber, noDate, multi, otherCurrency } = prepare(page, insight, limits.currency)
  const empty: InsightData = { categories: [], series: [], values: [], categoryTotals: [], seriesTotals: [], total: null, rows: { all: page.rows.length, matched: matched.length, used: 0, noNumber: 0, noDate: 0, multi: false, otherCurrency: 0 }, currencies, currency }
  if (!category) return empty
  const grain = grainOf(insight)
  // Keep the largest (by the measure over each row once), the rest in "Other".
  const keep = (pick: (entry: Prepared) => Bucket[], max: number | undefined) => {
    const totals = new Map<string, Acc>()
    for (const entry of prepared) for (const bucket of dedupe(pick(entry))) add(totals, bucket.key, entry.x, entry.d)
    const real = [...totals.keys()].filter((key) => key !== noneKey)
    if (!max || real.length <= max) return null
    // Grouping: "(none)" goes into "Other" too, so the chart has at most max colours and one neutral.
    const order = real.sort((a, b) => (result(insight.measure, totals.get(b)) ?? 0) - (result(insight.measure, totals.get(a)) ?? 0) || a.localeCompare(b))
    return new Set(order.slice(0, max))
  }
  const keptCats = insight.type === 'line' ? null : keep((entry) => entry.cats, limits.maxCategories)
  const keptSers = second ? keep((entry) => entry.sers, limits.maxSeries) : null
  const other = (kept: Set<string> | null, buckets: Bucket[]) => dedupe(kept ? buckets.map((bucket) => kept.has(bucket.key) ? bucket : { key: otherKey, label: 'Other' }) : buckets)
  const cells = new Map<string, Acc>(), catTotals = new Map<string, Acc>(), serTotals = new Map<string, Acc>(), all = new Map<string, Acc>()
  const catSeen = new Map<string, Bucket>(), serSeen = new Map<string, Bucket>()
  for (const entry of prepared) {
    const cats = other(keptCats, entry.cats), sers = other(keptSers, entry.sers)
    for (const cat of cats) { catSeen.set(cat.key, cat); add(catTotals, cat.key, entry.x, entry.d); for (const ser of sers) add(cells, `${cat.key}\u0001${ser.key}`, entry.x, entry.d) }
    for (const ser of sers) { serSeen.set(ser.key, ser); add(serTotals, ser.key, entry.x, entry.d) }
    add(all, '', entry.x, entry.d)
  }
  // Order: Dropdown / Multi-select by their option order, Date by period, Text by name; "(none)" and "Other" last.
  const natural = (column: OnDemandColumn | undefined) => (a: Bucket, b: Bucket) => {
    const rank = (bucket: Bucket) => bucket.key === otherKey ? 2 : bucket.key === noneKey ? 1 : 0
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    if (column && hasOptions(column.type)) return column.options.indexOf(a.key) - column.options.indexOf(b.key)
    return a.key.localeCompare(b.key, undefined, { numeric: true, sensitivity: 'base' })
  }
  let categories = [...catSeen.values()].sort(natural(category))
  if (insight.type === 'line' && categories.length) {
    // Every period from the first to the last, so the line keeps time to scale.
    const periods: Bucket[] = []
    const last = categories[categories.length - 1].key
    for (let period = categories[0]; period.key <= last && periods.length < maxPeriods(grain); period = periodAfter(period.key, grain)) periods.push(period)
    categories = periods
  } else if (insight.sort === 'value' || insight.type === 'pareto') {
    const rank = (bucket: Bucket) => bucket.key === otherKey ? 2 : bucket.key === noneKey ? 1 : 0
    categories.sort((a, b) => rank(a) - rank(b) || (result(insight.measure, catTotals.get(b.key)) ?? -Infinity) - (result(insight.measure, catTotals.get(a.key)) ?? -Infinity) || natural(category)(a, b))
  }
  const series = second ? [...serSeen.values()].sort(natural(second)) : [{ key: '', label: '' }]
  const blank = insight.measure === 'average' || insight.measure === 'min' || insight.measure === 'max'
  return {
    categories, series,
    values: categories.map((cat) => series.map((ser) => result(insight.measure, cells.get(`${cat.key}\u0001${ser.key}`)))),
    categoryTotals: categories.map((cat) => result(insight.measure, catTotals.get(cat.key))),
    seriesTotals: series.map((ser) => result(insight.measure, serTotals.get(ser.key))),
    total: prepared.length ? result(insight.measure, all.get('')) : blank ? null : 0,
    rows: { all: page.rows.length, matched: matched.length, used: prepared.length, noNumber: insight.measure === 'count' || insight.measure === 'distinct' ? 0 : noNumber, noDate, multi, otherCurrency },
    currencies, currency,
  }
}

// ---- chart options (CHT-01…CHT-12) ----
// The limits of each type as before (a pie: the 5 largest and "Other"; bars: 20 and 5 stacks; lines: 5 lines; a
// table: all) — or the chosen Top N (CHT-04).
export function limitsFor(insight: Insight): { maxCategories?: number; maxSeries?: number } {
  const top = insight.options?.top
  const chosen = top === 'all' ? undefined : top
  if (insight.type === 'pie') return { maxCategories: top ? chosen : 5 }
  if (insight.type === 'table') return top ? { maxCategories: chosen } : {}
  if (insight.type === 'line') return { maxCategories: undefined, maxSeries: 5 }
  if (insight.type === 'kpi' || insight.type === 'narrative') return {}
  return { maxCategories: top ? chosen : 20, maxSeries: 5 }
}
// The data a chart draws: the aggregation, then the running total (CHT-05) and the share of the total (CHT-06); a
// Pareto (CHT-12) also gets each category's share and the cumulative share. Without options: the aggregation as is.
export interface ChartData extends InsightData {
  unit: '' | '%'
  shares?: number[] // Pareto: each category's share of the sum of the bars (%)
  cumulative?: number[] // Pareto: the running share (%), ending at 100
}
// A KPI (CHT-02): the measure over the matched rows, each row once — one category "All".
const allColumn: OnDemandColumn = { id: 'cht-all', name: 'All', type: 'text', options: [], required: false }
const asKpi = (page: OnDemandPage, insight: Insight) => ({ page: { ...page, columns: [...page.columns, allColumn] }, insight: { ...insight, type: 'table' as const, category: allColumn.id, second: '', options: undefined } })
export function kpiData(page: OnDemandPage, insight: Insight, currency = ''): InsightData {
  const probe = asKpi(page, insight)
  return aggregate(probe.page, probe.insight, { currency })
}
export function chartData(page: OnDemandPage, insight: Insight, currency = ''): ChartData {
  // CHT-60: a Narrative counts its rows as a KPI does (what ⓘ and a Dashboard's empty state read).
  if (insight.type === 'kpi' || insight.type === 'narrative') return { ...kpiData(page, insight, currency), unit: '' }
  const data = aggregate(page, insight, { ...limitsFor(insight), currency })
  const out: ChartData = { ...data, unit: '' }
  const options = insight.options ?? {}
  if (insight.type === 'pareto') {
    const bars = data.values.map((row) => Math.max(0, row[0] ?? 0))
    const sum = bars.reduce((all, value) => all + value, 0)
    let running = 0
    out.shares = bars.map((value) => sum ? value / sum * 100 : 0)
    out.cumulative = bars.map((value) => { running += value; return sum ? running / sum * 100 : 0 })
    return out
  }
  if (!additive(insight.measure)) return out
  if (options.cumulative && (insight.type === 'bar' || insight.type === 'line')) {
    const run = (list: (number | null)[]) => { let at = 0; return list.map((value) => (at += value ?? 0)) }
    const columns = data.series.map((_, col) => run(data.values.map((row) => row[col])))
    out.values = data.values.map((row, index) => row.map((_, col) => columns[col][index]))
    out.categoryTotals = run(data.categoryTotals)
  }
  if (options.percent && (insight.type === 'bar' || insight.type === 'line' || insight.type === 'table')) {
    const total = data.total ?? 0
    const share = (value: number | null) => value == null ? null : total ? value / total * 100 : 0
    out.values = out.values.map((row) => row.map(share))
    out.categoryTotals = out.categoryTotals.map(share)
    out.seriesTotals = out.seriesTotals.map(share)
    out.total = total ? 100 : 0
    out.unit = '%'
  }
  return out
}
// CHT-10: the rows behind a category (and a series) of a chart — the matched rows counted there, "Other" included.
export function drillRows(page: OnDemandPage, insight: Insight, data: InsightData, category: number, series: number | null = null): OnDemandRow[] {
  const cat = data.categories[category], ser = series == null ? undefined : data.series[series]
  if (!cat) return []
  const keysOf = (buckets: Bucket[]) => new Set(buckets.map((bucket) => bucket.key))
  const cats = keysOf(data.categories), sers = keysOf(data.series)
  const mapped = (buckets: Bucket[], keys: Set<string>) => buckets.map((bucket) => keys.has(bucket.key) && bucket.key !== otherKey ? bucket.key : keys.has(otherKey) ? otherKey : '\u0002')
  const asked = insight.type === 'kpi' || insight.type === 'narrative' ? asKpi(page, insight) : { page, insight }
  return prepare(asked.page, asked.insight, data.currency).prepared
    .filter((entry) => mapped(entry.cats, cats).includes(cat.key) && (!ser || !insight.second || mapped(entry.sers, sers).includes(ser.key)))
    .map((entry) => entry.row)
}

// ---- words (OND-11, OND-14) ----
export const formatValue = (value: number | null | undefined) => value == null ? '—' : Number(value.toFixed(2)).toLocaleString('en')
// CHT-06: a value as the chart shows it — a share in % with one decimal, else as formatValue.
export const formatShown = (value: number | null | undefined, unit: '' | '%' = '') => unit === '%' ? value == null ? '—' : `${Number(value.toFixed(1)).toLocaleString('en')}%` : formatValue(value)
const measureName: Record<InsightMeasure, string> = { count: 'Count of rows', sum: 'Sum', average: 'Average', min: 'Minimum', max: 'Maximum', distinct: 'Distinct count' }
// currency: the currency shown (OND-24), named after the column: "Sum of Cost (EUR)".
export function measureText(page: OnDemandPage, insight: Insight, currency = '') {
  const value = columnOf(page, insight.value)?.name ?? '?'
  return insight.measure === 'count' ? 'Count of rows' : `${measureName[insight.measure]} of ${value}${currency ? ` (${currency})` : ''}`
}
// CHT-05, CHT-06: the value axis's name — the measure, with "running total" and "% of total" when chosen.
// CHT-24: the automatic titles of a chart's axes (what an empty X / Y axis title shows): horizontal bars have the
// measure along X and the categories along Y; columns and the Pareto the other way round; a line its periods along X.
export function autoAxisTitles(page: OnDemandPage, insight: Insight, currency = ''): { x: string; y: string } {
  const category = page.columns.find((column) => column.id === insight.category)?.name ?? ''
  const measure = valueText(page, insight, currency)
  if (insight.type === 'line') return { x: `${dateGroupLabels[grainOf(insight)].label.replace(/ \(.*$/, '')} of ${category}`, y: measure }
  if (insight.type === 'bar' && insight.options?.orientation !== 'vertical') return { x: measure, y: category }
  return { x: category, y: measure }
}
// CHT-83: the name the owners gave the value — the Value name, else the title they typed on the value axis (X of
// horizontal bars, Y of columns, a line or a Pareto); '' when they gave none.
export function ownValueName(insight: Pick<Insight, 'type' | 'options'>): string {
  const options = insight.options ?? {}
  if (options.valueName) return options.valueName
  if (insight.type === 'bar' && options.orientation !== 'vertical') return options.xTitle ?? ''
  return insight.type === 'bar' || insight.type === 'line' || insight.type === 'pareto' ? options.yTitle ?? '' : ''
}
// The value's name as the chart shows it — in its legend, data table, tooltips, data labels (Series name), table
// headings, Rows behind and Export (CHT-83: the owners' name when given).
export function valueText(page: OnDemandPage, insight: Insight, currency = '') {
  const options = insight.options ?? {}
  const shown = additive(insight.measure) && (insight.type === 'bar' || insight.type === 'line')
  const parts = [shown && options.cumulative ? 'running total' : '', shown || insight.type === 'table' ? options.percent && additive(insight.measure) ? '% of total' : '' : ''].filter(Boolean)
  return `${ownValueName(insight) || measureText(page, insight, currency)}${parts.length ? ` — ${parts.join(', ')}` : ''}`
}
// CHT-25: what a chart counted — "n of m rows counted", rows left out and the currency — for its ⓘ (the chart panel no
// longer shows it under the title).
export function countLines(data: ChartData): string[] {
  const all = data.rows.all
  return [
    `${data.rows.used} of ${all} row${all === 1 ? '' : 's'} counted${data.rows.matched < all ? ` (${data.rows.matched} match the filters)` : ''}.`,
    data.rows.noNumber ? `${data.rows.noNumber} row${data.rows.noNumber === 1 ? '' : 's'} without a number left out.` : '',
    data.rows.noDate ? `${data.rows.noDate} row${data.rows.noDate === 1 ? '' : 's'} without a valid date left out.` : '',
    data.rows.otherCurrency ? `${data.rows.otherCurrency} row${data.rows.otherCurrency === 1 ? '' : 's'} in other currencies left out.` : '',
    currencyText(data),
  ].filter(Boolean)
}
// OND-24: the line under a Currency chart — which currencies were found and which one is shown.
export function currencyText(data: Pick<InsightData, 'currencies' | 'currency'>) {
  if (!data.currencies.length) return ''
  const list = data.currencies.map((entry) => `${entry.code} (${entry.rows} row${entry.rows === 1 ? '' : 's'})`).join(', ')
  return data.currencies.length === 1 ? `Currency: ${list}.` : `Currencies found: ${list}; shown: ${data.currency} — amounts in different currencies are not added up.`
}
// "Sum of Cost (EUR) by Category, stacked by Sites" — what is measured and how it is split.
export function insightSubject(page: OnDemandPage, insight: Insight) {
  const name = (id: string) => columnOf(page, id)?.name ?? '(removed column)'
  if (insight.type === 'kpi' || insight.type === 'narrative' && !insight.category) return measureText(page, insight)
  // CHT-74: a Pivot table names its row and column fields, outermost first: "by Epic, then Feature, columns by Stream, then Month".
  const by = insight.type === 'line' ? `per ${dateGroupLabels[grainOf(insight)].unit} of ${name(insight.category)}` : `by ${pivotRowFields(insight).map(name).join(', then ') || name(insight.category)}`
  const split = insight.second ? `, ${isGrouped(insight) ? 'grouped by' : secondLabel(insight.type).toLowerCase()} ${pivotColumnFields(insight).map(name).join(', then ')}` : ''
  return `${measureText(page, insight)} ${by}${split}`
}
// The filters in words, stated under the chart's title: "Category: Scrap, Rework · Found on: Jan 2026 – Jun 2026".
export function filterText(page: OnDemandPage, insight: Insight) {
  if (!insight.filters.length) return 'All rows'
  return insight.filters.map((filter) => {
    const name = columnOf(page, filter.column)?.name ?? '(removed column)'
    const parts: string[] = []
    if (filter.values?.length) parts.push(filter.values.map((entry) => entry === noneKey ? noneLabel : entry).join(', '))
    if (filter.from || filter.to) parts.push(filter.from && filter.to ? `${monthLabel(filter.from)} – ${monthLabel(filter.to)}` : filter.from ? `from ${monthLabel(filter.from)}` : `up to ${monthLabel(filter.to!)}`)
    return `${name}: ${parts.join(', ')}`
  }).join(' · ')
}
// The ⓘ of an insight: how it counts, in plain words.
export function insightRules(page: OnDemandPage, insight: Insight): string[] {
  const lines: string[] = []
  const options = insight.options ?? {}
  const grain = grainOf(insight)
  const used = [...new Set([...pivotRowFields(insight), ...pivotColumnFields(insight)])].map((id) => columnOf(page, id)).filter((column): column is OnDemandColumn => Boolean(column))
  const valueName = columnOf(page, insight.value)?.name ?? 'Number'
  lines.push(insight.measure === 'count' ? 'Each row counts once in its category.' : insight.measure === 'sum' ? `The ${valueName} values of the rows are added up; rows without a number are left out.`
    : insight.measure === 'average' ? `The average of the ${valueName} values of the rows; rows without a number are left out.`
      : insight.measure === 'distinct' ? `The number of different ${valueName} values among the rows (each value of a Multi-select on its own); rows without a value add none.`
        : `The ${insight.measure === 'min' ? 'smallest' : 'largest'} ${valueName} value of the rows; rows without a number are left out.`)
  if (insight.measure !== 'count' && insight.measure !== 'distinct' && columnOf(page, insight.value)?.type === 'currency') lines.push('A Currency column: amounts are never converted or added up across currencies. The chart shows one currency at a time (the one with most rows first; choose another above the chart); rows in the other currencies are left out and ⓘ says how many.')
  if (insight.type === 'kpi') return lines
  for (const column of used.filter((entry) => entry.type === 'multi')) lines.push(`“${column.name}” is a Multi-select: a row with several values counts once in each of them, so the parts can add up to more than the total (the total takes each row once).`)
  for (const column of used.filter((entry) => entry.type === 'date')) lines.push(`“${column.name}” is grouped by ${grain === 'week' ? 'ISO week (Monday to Sunday; week 1 holds the year’s first Thursday)' : dateGroupLabels[grain].unit}.`)
  lines.push(`Rows with no value, a value “not in the list” or no valid date go to “${noneLabel}”${insight.type === 'line' ? ' (a line leaves rows without a date out)' : ''}.`)
  const top = options.top
  if (insight.type === 'pie') lines.push(top === 'all' ? 'Every category is a slice.' : `More than ${top ?? 5} categories: the ${top ?? 5} largest, the rest (with “(none)”) as “Other” — at most ${(top ?? 5) + 1} slices.`)
  else if ((insight.type === 'bar' || insight.type === 'pareto' || insight.type === 'table') && top) lines.push(top === 'all' ? 'Every category is shown.' : `The ${top} largest categories; the rest (with “(none)”) as “Other”, last.`)
  if (insight.type === 'line') lines.push(`Every ${dateGroupLabels[grain].unit} from the first to the last is shown, also ${dateGroupLabels[grain].unit}s without rows.`)
  else if (insight.type === 'pareto') lines.push('Largest first (“(none)” and “Other” last); the line is the running share of the sum of the columns, read on the 0–100% axis on the right; the dashed line marks 80%.')
  else if (isNestedPivot(insight)) {
    // CHT-75, CHT-76: how a nested Pivot table orders and adds up.
    lines.push(`${insight.sort === 'value' ? 'The outer rows largest first' : 'The outer rows in the order of the options, by month or by name'}; the rows inside a group and the columns in the order of the options, by date or by name (“(none)” and “Other” last).`)
    lines.push('Each group has a subtotal (on its own row; for an outer column a Subtotal column) and the table a Total row and column. Subtotals and totals are measured over the group’s rows, each row once — an average, minimum, maximum or distinct count is never made by adding up the cells.')
    lines.push('▸ / ▾ close and open a group, for you and this visit only. A click on a number lists the rows behind it.')
  }
  else if (insight.type !== 'table' || !insight.second) lines.push(insight.sort === 'value' ? 'Largest first.' : 'In the order of the options, by month or by name.')
  if (options.cumulative) lines.push(`Running total: each ${insight.type === 'line' ? dateGroupLabels[grain].unit : 'category'} shows its value plus all before it; a click lists the rows of that ${insight.type === 'line' ? dateGroupLabels[grain].unit : 'category'} only.`)
  if (options.percent) lines.push('Values as a share of the total (each row once), in %; with a Multi-select the shares can add up to more than 100%.')
  if (options.target) lines.push(`The dashed line is a fixed target of ${formatValue(options.target.value)}${options.target.label ? ` (“${options.target.label}”)` : ''}, set by the chart’s owners.`)
  return lines
}
