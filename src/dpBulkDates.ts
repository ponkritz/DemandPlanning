import type { AzureWorkItem } from './domain'
import { fieldOf } from './dpReleases.ts'
import { featureMonths, monthKeyOfDate, monthKeyOfLabel, monthLabelOfKey } from './featureMonths.ts'

// DPF-13…DPF-16: the Start date and Target date of a Feature made by DP bulk creation, read from the DP query's own
// date columns. Which columns is set in Admin → Streams → Bulk creation → DP bulk creation dates (shared,
// in the planning data with the bulk creation Epics); without a setting the DRPE Date (RPE, the Release Planning Event)
// gives the Start date and the DDT Date (DT, Design Transfer) the Target date. A column is named by its field name, matched
// by its last part so a prefix is allowed (Custom.DRPEDate), as the DP milestones are (QV-24, QV-26).
import { dateFieldName, type DpBulkDates } from './dpBulkDateSettings.ts'
export { dpBulkDateDefaults, dpBulkDatesOf, dateFieldName, normalizeDpBulkDates, type DpBulkDates } from './dpBulkDateSettings.ts'
const fieldName = /^[A-Za-z][\w.]{0,119}$/

// A date column's name as people know it: the DP milestones by their field and team names (QV-26), others by the field
// name with a space before "Date".
const milestoneNames: Record<string, string> = { drpedate: 'DRPE Date (RPE)', drpcdate: 'DRPC Date (PRD)', drfhdate: 'DRfH Date (SFV)', ddtdate: 'DDT Date (DT)' }
export function dpDateLabel(field: string) {
  const name = dateFieldName(field)
  return milestoneNames[name.toLowerCase()] ?? name.replace(/([a-z0-9])(Date)$/, '$1 $2')
}
// The short name used in the pop-up's notes: "DRPE Date", "DDT Date", "Created Date".
export const dpDateShort = (field: string) => dpDateLabel(field).replace(/\s*\(.*\)$/, '')

// DPF-13: the date columns of the DP query offered — each column whose name ends in "Date" (by its last part, once),
// in the query's order, with the four DP milestone dates always offered (also before the query is fetched).
export function dpDateColumns(columns: { ref: string; name?: string }[] | undefined): { field: string; label: string }[] {
  const seen = new Set<string>(), result: { field: string; label: string }[] = []
  const add = (ref: string) => { const field = dateFieldName(ref); const key = field.toLowerCase(); if (!field || !/date$/i.test(field) || !fieldName.test(field) || seen.has(key)) return; seen.add(key); result.push({ field, label: dpDateLabel(field) }) }
  for (const column of columns ?? []) { add(column.ref); if (column.name && !/\s/.test(column.name)) add(column.name) }
  for (const field of ['DRPEDate', 'DRPCDate', 'DRfHDate', 'DDTDate']) add(field)
  return result
}

// DPF-14: a value of a date column as a date only — its UTC day, "YYYY-MM-DD". A plain "YYYY-MM-DD" is taken as it is;
// an ISO date and time (as Azure DevOps returns it, with Z or an offset) is read as an instant and its UTC day kept;
// anything else (a local format such as 3/15/2027) is not a date.
export function utcDay(value: string | undefined): string | undefined {
  const text = value?.trim()
  if (!text) return undefined
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (plain) { const day = new Date(Date.UTC(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3]))); return day.toISOString().slice(0, 10) === text ? text : undefined }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,7})?)?(Z|[+-]\d{2}:?\d{2})$/.test(text)) return undefined
  const time = Date.parse(text)
  if (!Number.isFinite(time)) return undefined
  const day = new Date(time).toISOString().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined
}

// DPF-14, DPF-15: the Start and Target dates of one DP row. A missing or unreadable date is left empty with a note
// ("no DDT Date — Target date left empty"), which does not stop the row; a Start date after the Target date is an
// error, and the row is skipped with it.
// DPF-17: fieldNotes — the same notes, short, for the field each date fills in the single New Feature form ("No DDT Date
// on this release").
export interface DpRowDates { start?: string; target?: string; notes: string[]; error: string; fieldNotes: { start?: string; target?: string } }
export function dpRowDates(row: Pick<AzureWorkItem, 'fields'>, columns: DpBulkDates): DpRowDates {
  const notes: string[] = [], fieldNotes: DpRowDates['fieldNotes'] = {}
  const read = (field: string, what: string, key: 'start' | 'target') => {
    const raw = fieldOf(row, field), day = utcDay(raw)
    if (!raw) { notes.push(`no ${dpDateShort(field)} — ${what} left empty`); fieldNotes[key] = `No ${dpDateShort(field)} on this release` }
    else if (!day) { notes.push(`${dpDateShort(field)} “${raw.slice(0, 40)}” is not a date — ${what} left empty`); fieldNotes[key] = `${dpDateShort(field)} “${raw.slice(0, 40)}” is not a date` }
    return day
  }
  const start = read(columns.start, 'Start date', 'start'), target = read(columns.target, 'Target date', 'target')
  const error = start && target && start > target ? `the Start date ${start} (${dpDateShort(columns.start)}) is after the Target date ${target} (${dpDateShort(columns.target)})` : ''
  return { ...(start ? { start } : {}), ...(target ? { target } : {}), notes, error, fieldNotes }
}

// DPF-16: the Time Writing Tasks of a Feature made in bulk. Without the optional tick box (not ticked by default): one
// Task for the current month, as before. Ticked: one Task per month from the Start date's month to the Target date's
// month. A month before the current one cannot get a new Task (New Feature's rule, BKL-31: never before the current
// month, UTC), so a Start date in an earlier month starts at the current month and the note says so; without a Start
// date the current month is used, without a Target date (or one already past) the first month only — each said in the
// note shown in the row's Time Writing Tasks column.
const shortMonth = (label: string) => label.replace(/^(\w{3})\w*/, '$1')
export function dpTaskMonths(fromStart: boolean, dates: Pick<DpRowDates, 'start' | 'target'>, currentMonth: string): { months: string[]; note: string } {
  if (!fromStart) return { months: [currentMonth], note: '' }
  const target = dates.start && dates.target && dates.target < dates.start ? '' : dates.target ?? ''
  const months = featureMonths({ startDate: dates.start ?? '', targetDate: target, formMonth: currentMonth, currentMonth })
  const current = monthKeyOfLabel(currentMonth) ?? '', startKey = dates.start ? monthKeyOfDate(dates.start) ?? '' : ''
  const notes: string[] = []
  if (!dates.start) notes.push(`from ${shortMonth(months[0])} (no Start date)`)
  else if (startKey < current) notes.push(`from ${shortMonth(months[0])} (Start ${shortMonth(monthLabelOfKey(startKey))} is before this month)`)
  if (!target) notes.push('no Target date: first month only')
  else if ((monthKeyOfDate(target) ?? '') < (monthKeyOfLabel(months[0]) ?? '')) notes.push(`Target ${shortMonth(monthLabelOfKey(monthKeyOfDate(target)!))} is already past: first month only`)
  return { months, note: notes.join('; ') }
}
// More month Tasks than this on one row is named in the pop-up, so a Target date far ahead is seen before Create.
export const manyMonthTasks = 12
