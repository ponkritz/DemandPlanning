import { narrowPeriod, periodMonths, type Period } from '../dashboard.ts'
import { narrowInsightRows, type InsightNarrowed, type ResolvedSetup, type ViewerChoice } from '../insightFilters.ts'
import { valuesOf, type OnDemandColumn, type OnDemandPage, type OnDemandRow } from '../onDemand.ts'
import { noneKey } from '../onDemandInsights.ts'

// OND-95 The viewer's own filter row inside a published file: it narrows only within the rows the file holds (the
// publisher's cut, OND-91 / OND-92) and starts with nothing narrowed — nothing ticked in Year means every year of the
// file (not the current year, as in the app), and the lists offer only the years and values found in the file's rows.
// The period works as in the app (Year → Quarter → Month, DSH-07) over those years. Kept free of React (tested in
// tests/standalone-html.test.mjs).

export const emptyPeriod = (): Period => ({ years: [], quarters: [], months: [] })
export const isEmptyPeriod = (period: Period) => !period.years.length && !period.quarters.length && !period.months.length
// The years of the rows' dates in a Date column (2001…2099), in order.
export function yearsIn(rows: OnDemandRow[], columns: (OnDemandColumn | undefined)[]) {
  const found = new Set<number>()
  for (const column of columns) {
    if (!column || column.type !== 'date') continue
    for (const row of rows) { const value = row.cells[column.id]; const year = typeof value === 'string' ? Number(value.slice(0, 4)) : NaN; if (year > 2000 && year < 2100) found.add(year) }
  }
  return [...found].sort((a, b) => a - b)
}
// The years that count: those ticked, else every year of the file (else this year, for a file without dates).
export const countingYears = (period: Period, years: number[], fallback: number) => period.years.length ? period.years : years.length ? years : [fallback]
const withYears = (period: Period, years: number[], fallback: number): Period => ({ ...period, years: countingYears(period, years, fallback) })
// A choice made consistent after a level above changed (quarters outside the years, months outside the quarters go).
export function narrowViewerPeriod(period: Period, years: number[], fallback: number): Period {
  const narrowed = narrowPeriod(withYears(period, years, fallback), fallback)
  return { ...narrowed, years: period.years.length ? narrowed.years : [] }
}
// The months of the viewer's period, or null when nothing is ticked (no period: every row of the file).
export function viewerMonths(period: Period, years: number[], fallback: number): string[] | null {
  if (isEmptyPeriod(period)) return null
  const effective = withYears(period, years, fallback)
  return periodMonths(effective, effective.years[effective.years.length - 1] ?? fallback)
}
// A table page's rows as the viewer's filter row keeps them (the same rules as the app's filter row, OND-54, with the
// period above). Nothing chosen: every row of the file.
export function narrowViewerTable(page: OnDemandPage, setup: ResolvedSetup, choice: ViewerChoice, years: number[], fallback: number): InsightNarrowed {
  const months = setup.period ? viewerMonths(choice.period, years, fallback) : null
  const usable: ResolvedSetup = { ...setup, period: months ? setup.period : undefined }
  const effective: ViewerChoice = months ? { ...choice, period: withYears(choice.period, years, fallback) } : choice
  return narrowInsightRows(page, usable, effective, fallback)
}
// The values a Dropdown / Multi-select filter offers: those of the column found in the file's rows, in the column's
// order (a value no longer in its list after them), "(none)" last when a row has none.
export function offeredValues(rows: OnDemandRow[], column: OnDemandColumn): string[] {
  const found = new Set<string>()
  let none = false
  for (const row of rows) { const values = valuesOf(row.cells[column.id]); if (!values.length) none = true; for (const value of values) found.add(value) }
  const ordered = column.options.filter((option) => found.has(option))
  const others = [...found].filter((value) => !column.options.includes(value)).sort((a, b) => a.localeCompare(b))
  // A value not in the column's list counts as "(none)" in the filters (OND-14): it is offered through "(none)".
  return [...ordered, ...(none || others.length ? [noneKey] : [])]
}
