import { hasOptions, moneyOf, valuesOf, type Insight, type InsightFilter, type InsightMeasure, type InsightType, type OnDemandColumn, type OnDemandPage, type OnDemandRow, type OnDemandType } from './onDemand.ts'

// OND-11…OND-17 Insights of an On-Demand page: what each chart or summary table is made of, the checks of its column
// references, and the aggregation of the page's rows into categories × series. Kept free of React so that every rule
// is tested on its own (tests/on-demand-insights.test.mjs).

export const insightTypes: { key: InsightType; label: string; hint: string }[] = [
  { key: 'bar', label: 'Bar / column', hint: 'A value per category, optionally stacked by a Dropdown or Multi-select.' },
  { key: 'line', label: 'Line over time', hint: 'A value per month of a Date column.' },
  { key: 'pie', label: 'Pie / donut', hint: 'Each category’s share of the total; more than 5 categories: the 5 largest and “Other”.' },
  { key: 'table', label: 'Summary table', hint: 'Rows by one field, optional columns by another, with totals.' },
]
export const insightTypeLabel = (type: InsightType) => insightTypes.find((entry) => entry.key === type)?.label ?? type
export const measures: { key: InsightMeasure; label: string }[] = [{ key: 'count', label: 'Count of rows' }, { key: 'sum', label: 'Sum' }, { key: 'average', label: 'Average' }]

// Which columns each part may use.
const categoryTypes: Record<InsightType, OnDemandType[]> = { bar: ['dropdown', 'multi', 'text', 'date'], line: ['date'], pie: ['dropdown', 'multi', 'text', 'date'], table: ['dropdown', 'multi', 'text', 'date'] }
const secondTypes: Record<InsightType, OnDemandType[]> = { bar: ['dropdown', 'multi'], line: ['dropdown', 'multi'], pie: [], table: ['dropdown', 'multi', 'text', 'date'] }
export const categoryColumns = (page: OnDemandPage, type: InsightType) => page.columns.filter((column) => categoryTypes[type].includes(column.type))
export const secondColumns = (page: OnDemandPage, type: InsightType) => page.columns.filter((column) => secondTypes[type].includes(column.type))
// OND-24: Sum and Average take a Number or a Currency column.
const valueTypes: OnDemandType[] = ['number', 'currency']
export const valueColumns = (page: OnDemandPage) => page.columns.filter((column) => valueTypes.includes(column.type))
export const filterColumns = (page: OnDemandPage) => page.columns.filter((column) => hasOptions(column.type) || column.type === 'date')
export const secondLabel = (type: InsightType) => type === 'table' ? 'Columns by' : type === 'line' ? 'One line per' : 'Stacked by'

// A new insight's starting point: the first column that fits, Count of rows, no filter, largest first.
export function blankInsight(page: OnDemandPage, id: string, type: InsightType = 'bar'): Insight {
  return { id, title: '', type, category: categoryColumns(page, type)[0]?.id ?? '', second: '', measure: 'count', value: '', filters: [], sort: type === 'line' ? 'label' : 'value' }
}
// The draft after the type is changed: fields that no longer fit are cleared or replaced by the first that fits.
export function withType(page: OnDemandPage, insight: Insight, type: InsightType): Insight {
  const category = categoryColumns(page, type).some((column) => column.id === insight.category) ? insight.category : categoryColumns(page, type)[0]?.id ?? ''
  const second = secondColumns(page, type).some((column) => column.id === insight.second) && insight.second !== category ? insight.second : ''
  const measure = type === 'pie' && insight.measure === 'average' ? 'sum' : insight.measure
  return { ...insight, type, category, second, measure, sort: type === 'line' ? 'label' : insight.sort }
}

// ---- references (OND-17) ----
const columnOf = (page: OnDemandPage, id: string) => page.columns.find((column) => column.id === id)
const typeName: Record<OnDemandType, string> = { text: 'Text', longtext: 'Long text', number: 'Number', currency: 'Currency', date: 'Date', dropdown: 'Dropdown', multi: 'Multi-select' }
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
  check(insight.category, insight.type === 'line' ? 'for the months' : 'for the categories', categoryTypes[insight.type])
  if (insight.second) {
    if (insight.second === insight.category) problems.push('The same column is used twice: choose another one, or none.')
    else check(insight.second, insight.type === 'table' ? 'for the table’s columns' : insight.type === 'line' ? 'for the lines' : 'for the stacks', secondTypes[insight.type])
  }
  if (insight.measure !== 'count') check(insight.value, `for the ${insight.measure === 'sum' ? 'sum' : 'average'}`, valueTypes)
  if (insight.measure === 'average' && insight.type === 'pie') problems.push('A pie shows shares of a total: choose Count of rows or Sum.')
  if (insight.measure === 'average' && insight.type === 'bar' && insight.second) problems.push('Stacked bars add their parts up: an Average cannot be stacked. Choose Count or Sum, or no stack.')
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
  return insightProblems(page, insight)[0] ?? ''
}

// ---- values of a row in a field ----
export const noneKey = '', noneLabel = '(none)', otherKey = '\u0000other'
export interface Bucket { key: string; label: string }
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthLabel = (month: string) => `${monthNames[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`
const none: Bucket = { key: noneKey, label: noneLabel }
// The categories one row falls in for a column: a Date by its month; a Dropdown / Multi-select by each of its values in
// the list (a Multi-select row in each of them); a Text by its text. Empty, "not in the list" or not a date: "(none)".
export function bucketsOf(column: OnDemandColumn, value: OnDemandRow['cells'][string] | undefined): Bucket[] {
  const values = valuesOf(value).map((entry) => entry.trim()).filter(Boolean)
  if (column.type === 'date') return values.length === 1 && isDate(values[0]) ? [{ key: values[0].slice(0, 7), label: monthLabel(values[0].slice(0, 7)) }] : [none]
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
interface Acc { sum: number; n: number }
const result = (measure: InsightMeasure, acc: Acc | undefined): number | null => measure === 'average' ? acc && acc.n ? acc.sum / acc.n : null : measure === 'count' ? acc?.n ?? 0 : acc?.sum ?? 0
const add = (map: Map<string, Acc>, key: string, value: number) => { const acc = map.get(key) ?? { sum: 0, n: 0 }; acc.sum += value; acc.n += 1; map.set(key, acc) }
const monthAfter = (month: string) => { const [y, m] = month.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}` }
const dedupe = (buckets: Bucket[]) => buckets.filter((bucket, index) => buckets.findIndex((entry) => entry.key === bucket.key) === index)

// Rows grouped by the category field and the second field, the measure of each cell. Totals take each row once
// (a Multi-select row in two categories counts once in the total), so with a Multi-select field the parts can add up
// to more than the total — said in the insight's ⓘ. maxCategories / maxSeries keep that many largest values and put the
// rest, with "(none)", in "Other" (pie: 5 + Other = 6 slices; stacks and lines: the 5 series colours + Other).
// limits.currency: the currency to show for a Currency column (OND-24); not found or not given, the one of most rows.
export function aggregate(page: OnDemandPage, insight: Insight, limits: { maxCategories?: number; maxSeries?: number; currency?: string } = {}): InsightData {
  const category = columnOf(page, insight.category)
  const second = insight.second ? columnOf(page, insight.second) : undefined
  const value = insight.measure === 'count' ? undefined : columnOf(page, insight.value)
  const matched = filterRowsFor(page, insight)
  // OND-24: a Currency column — the currencies of the matched rows; only the rows of one of them are measured.
  const money = value?.type === 'currency'
  const found = new Map<string, number>()
  if (money) for (const row of matched) { const amount = moneyOf(row.cells[value.id], value.currency); if (amount) found.set(amount.currency, (found.get(amount.currency) ?? 0) + 1) }
  const currencies = [...found].map(([code, rows]) => ({ code, rows })).sort((a, b) => b.rows - a.rows || a.code.localeCompare(b.code))
  const currency = !money ? '' : currencies.some((entry) => entry.code === limits.currency) ? limits.currency! : currencies[0]?.code ?? value.currency ?? ''
  const empty: InsightData = { categories: [], series: [], values: [], categoryTotals: [], seriesTotals: [], total: null, rows: { all: page.rows.length, matched: matched.length, used: 0, noNumber: 0, noDate: 0, multi: false, otherCurrency: 0 }, currencies, currency }
  if (!category) return empty
  let noNumber = 0, noDate = 0, multi = false, otherCurrency = 0
  const prepared = matched.flatMap((row) => {
    let x: number | null = 1
    if (insight.measure !== 'count') {
      if (money) { const amount = moneyOf(row.cells[value.id], value.currency); x = amount?.amount ?? null; if (amount && amount.currency !== currency) { otherCurrency++; return [] } }
      else x = value ? numberOf(row.cells[value.id]) : null
    }
    if (x == null) { noNumber++; return [] }
    let cats = bucketsOf(category, row.cells[category.id])
    if (insight.type === 'line') { cats = cats.filter((bucket) => bucket.key !== noneKey); if (!cats.length) { noDate++; return [] } }
    const sers = second ? bucketsOf(second, row.cells[second.id]) : [{ key: '', label: '' }]
    if (cats.length > 1 || sers.length > 1) multi = true
    return [{ x, cats, sers }]
  })
  // Keep the largest (by the measure over each row once), the rest in "Other".
  const keep = (pick: (entry: (typeof prepared)[number]) => Bucket[], max: number | undefined) => {
    const totals = new Map<string, Acc>()
    for (const entry of prepared) for (const bucket of dedupe(pick(entry))) add(totals, bucket.key, entry.x)
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
    for (const cat of cats) { catSeen.set(cat.key, cat); add(catTotals, cat.key, entry.x); for (const ser of sers) add(cells, `${cat.key}\u0001${ser.key}`, entry.x) }
    for (const ser of sers) { serSeen.set(ser.key, ser); add(serTotals, ser.key, entry.x) }
    add(all, '', entry.x)
  }
  // Order: Dropdown / Multi-select by their option order, Date by month, Text by name; "(none)" and "Other" last.
  const natural = (column: OnDemandColumn | undefined) => (a: Bucket, b: Bucket) => {
    const rank = (bucket: Bucket) => bucket.key === otherKey ? 2 : bucket.key === noneKey ? 1 : 0
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    if (column && hasOptions(column.type)) return column.options.indexOf(a.key) - column.options.indexOf(b.key)
    return a.key.localeCompare(b.key, undefined, { numeric: true, sensitivity: 'base' })
  }
  let categories = [...catSeen.values()].sort(natural(category))
  if (insight.type === 'line' && categories.length) {
    // Every month from the first to the last, so the line keeps time to scale.
    const months: Bucket[] = []
    for (let month = categories[0].key; month <= categories[categories.length - 1].key && months.length < 600; month = monthAfter(month)) months.push({ key: month, label: monthLabel(month) })
    categories = months
  } else if (insight.sort === 'value') {
    const rank = (bucket: Bucket) => bucket.key === otherKey ? 2 : bucket.key === noneKey ? 1 : 0
    categories.sort((a, b) => rank(a) - rank(b) || (result(insight.measure, catTotals.get(b.key)) ?? -Infinity) - (result(insight.measure, catTotals.get(a.key)) ?? -Infinity) || natural(category)(a, b))
  }
  const series = second ? [...serSeen.values()].sort(natural(second)) : [{ key: '', label: '' }]
  return {
    categories, series,
    values: categories.map((cat) => series.map((ser) => result(insight.measure, cells.get(`${cat.key}\u0001${ser.key}`)))),
    categoryTotals: categories.map((cat) => result(insight.measure, catTotals.get(cat.key))),
    seriesTotals: series.map((ser) => result(insight.measure, serTotals.get(ser.key))),
    total: prepared.length ? result(insight.measure, all.get('')) : insight.measure === 'average' ? null : 0,
    rows: { all: page.rows.length, matched: matched.length, used: prepared.length, noNumber: insight.measure === 'count' ? 0 : noNumber, noDate, multi, otherCurrency },
    currencies, currency,
  }
}

// ---- words (OND-11, OND-14) ----
export const formatValue = (value: number | null | undefined) => value == null ? '—' : Number(value.toFixed(2)).toLocaleString('en')
// currency: the currency shown (OND-24), named after the column: "Sum of Cost (EUR)".
export function measureText(page: OnDemandPage, insight: Insight, currency = '') {
  const value = columnOf(page, insight.value)?.name ?? '?'
  return insight.measure === 'count' ? 'Count of rows' : `${insight.measure === 'sum' ? 'Sum' : 'Average'} of ${value}${currency ? ` (${currency})` : ''}`
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
  const by = insight.type === 'line' ? `per month of ${name(insight.category)}` : `by ${name(insight.category)}`
  const split = insight.second ? `, ${secondLabel(insight.type).toLowerCase()} ${name(insight.second)}` : ''
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
  const used = [insight.category, insight.second].map((id) => columnOf(page, id)).filter((column): column is OnDemandColumn => Boolean(column))
  lines.push(insight.measure === 'count' ? 'Each row counts once in its category.' : insight.measure === 'sum' ? `The ${columnOf(page, insight.value)?.name ?? 'Number'} values of the rows are added up; rows without a number are left out.` : `The average of the ${columnOf(page, insight.value)?.name ?? 'Number'} values of the rows; rows without a number are left out.`)
  if (insight.measure !== 'count' && columnOf(page, insight.value)?.type === 'currency') lines.push('A Currency column: amounts are never converted or added up across currencies. The chart shows one currency at a time (the one with most rows first; choose another above the chart); rows in the other currencies are left out and the line above the chart says how many.')
  for (const column of used.filter((entry) => entry.type === 'multi')) lines.push(`“${column.name}” is a Multi-select: a row with several values counts once in each of them, so the parts can add up to more than the total (the total takes each row once).`)
  for (const column of used.filter((entry) => entry.type === 'date')) lines.push(`“${column.name}” is grouped by month.`)
  lines.push(`Rows with no value, a value “not in the list” or no valid date go to “${noneLabel}”${insight.type === 'line' ? ' (a line leaves rows without a date out)' : ''}.`)
  if (insight.type === 'pie') lines.push('More than 5 categories: the 5 largest, the rest (with “(none)”) as “Other” — at most 6 slices.')
  if (insight.type === 'line') lines.push('Every month from the first to the last is shown, also months without rows.')
  else if (insight.type !== 'table' || !insight.second) lines.push(insight.sort === 'value' ? 'Largest first.' : 'In the order of the options, by month or by name.')
  return lines
}
