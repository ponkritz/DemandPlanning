// DPF-13: which date columns of the DP query give a Feature made by DP bulk creation its Start date and Target date —
// the shared setting (Admin → Streams → Bulk creation → DP bulk creation dates, kept in the planning data
// with the bulk creation Epics) and its defaults: the DRPE Date (RPE, Release Planning Event) for the Start date and the
// DDT Date (DT, Design Transfer) for the Target date. Kept apart from dpBulkDates.ts so the release settings can read
// it without importing the DP rows' code.
export interface DpBulkDates { start: string; target: string }
export const dpBulkDateDefaults: DpBulkDates = { start: 'DRPEDate', target: 'DDTDate' }
const fieldName = /^[A-Za-z][\w.]{0,119}$/
// The last part of a field reference name, the name a setting keeps (Custom.DRPEDate → DRPEDate).
export const dateFieldName = (ref: string) => ref.trim().split('.').filter(Boolean).pop() ?? ''

// Read from the shared settings: field names only (letters, digits, _ and ., up to 120), kept by their last part; a
// default is not stored. Anything else is left out, so the default applies.
export function normalizeDpBulkDates(value: unknown): Partial<DpBulkDates> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  const pick = (entry: unknown, fallback: string) => { const text = typeof entry === 'string' ? entry.trim() : ''; const name = fieldName.test(text) ? dateFieldName(text) : ''; return name && name.toLowerCase() !== fallback.toLowerCase() ? name : undefined }
  const start = pick(raw.start, dpBulkDateDefaults.start), target = pick(raw.target, dpBulkDateDefaults.target)
  const result: Partial<DpBulkDates> = { ...(start ? { start } : {}), ...(target ? { target } : {}) }
  return Object.keys(result).length ? result : undefined
}
// The columns in use: the setting's, else the defaults (older files without the setting).
export const dpBulkDatesOf = (saved: Partial<DpBulkDates> | undefined): DpBulkDates => ({ start: saved?.start ?? dpBulkDateDefaults.start, target: saved?.target ?? dpBulkDateDefaults.target })
