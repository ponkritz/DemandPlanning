import { normalEmail } from './access.ts'
import { merge3, mergeKeyed, type Merge } from './gitSaveQueue.ts'
import { isHidden, kindOf, ownersOf, withListOwners, type MenuLayout, type Viewer } from './menuLayout.ts'
import { releaseFor } from './releasePath.ts'
import { approvalDateFrom, normalizeVersion } from './releaseSource.ts'
import { parseExportDate } from './windchillReleases.ts'
import { completionDateOf } from './toolQueries.ts'
import type { NamingPattern } from './namingPatterns.ts'
import type { PageKind } from './menuLayout.ts'
import type { AzureWorkItem } from './domain'

// TVL-01…TVL-14 Tool Validations master list: every tool the team has validated, kept in the Git data repository next to
// the planning data (tool-validations.json), so that a tool stays listed — with its dates, notes and hand corrections —
// after it leaves the source it came from. Tools come from several sources: the Tool Validations stream's own Azure
// DevOps query (appended automatically whenever its data is fetched, TVL-04), another Azure DevOps query, an imported
// Windchill export and a manual list kept as an On-Demand table page (each merged with "Merge into master list", TVL-05).
// The same tool from two sources is one entry: the same name (letter case, spaces and punctuation ignored) and version
// (TVL-03). Each entry has a validation date, a validity period (months) and a due date — the source's own due date when
// it has one, else the validation date plus the period, and 24 months when no period is given (TVL-06). A tool from an
// Azure DevOps source takes the completion date (TVL-20) as its validation date unless the source maps one (TVL-29), and
// is changed only there: Edit and Remove are refused while Azure DevOps returns it (TVL-30). Pure: the file, its checks,
// merges and the expiry list.

export const toolValidationsFile = 'tool-validations.json'
const kind = 'tool-validations'
export const defaultExpiryDays = 60
export const maxExpiryDays = 730
export const maxTools = 5000
export const maxSources = 20
export const maxPeriodMonths = 600
export const streamSourceId = 'stream'

export type ToolSourceKind = 'stream' | 'azure' | 'windchill' | 'ondemand'
export const sourceKinds: { key: ToolSourceKind; label: string; detail: string }[] = [
  { key: 'stream', label: 'Tool Validations query (Azure DevOps)', detail: 'The connection named “Tool Validations”: its tools are added to the master list whenever its data is fetched.' },
  { key: 'azure', label: 'Another Azure DevOps query', detail: 'Any other connection (cloud or on-premises) fetched in this app; merged with “Merge into master list”.' },
  { key: 'windchill', label: 'Windchill export', detail: 'An export imported under Release Details or Other views; merged with “Merge into master list”.' },
  { key: 'ondemand', label: 'Manual list (On-Demand table page)', detail: 'A table page of the app (On-Demand or another group) where the team keeps tools by hand; merged with “Merge into master list”.' },
]
export const kindLabel = (key: ToolSourceKind) => sourceKinds.find((entry) => entry.key === key)?.label ?? key

// The fields a source is read with (TVL-07). For Azure DevOps sources a field is a field reference name of the query's
// columns or one of the special values below; for a Windchill export a column name; for an On-Demand page a column id.
export type MappingField = 'name' | 'version' | 'validationDate' | 'validityPeriod' | 'dueDate' | AzureField
// TVL-34: the fields only an Azure DevOps source gives (the Tool List [TFS] query's columns) — the work item's ID and
// its Source, State and Type columns, shown on the master list as ID, Used by, Validated and Type. Optional; guessed by
// column name; locked like the other Azure DevOps values (TVL-30).
export type AzureField = 'id' | 'usedBy' | 'validated' | 'type'
export const azureFields: AzureField[] = ['id', 'usedBy', 'validated', 'type']
export const isAzureField = (key: MappingField): key is AzureField => (azureFields as string[]).includes(key)
// TVL-34: "None" chosen for an Azure DevOps field in Edit mapping — stored, so that a saved mapping is not guessed again.
export const noField = '@none'
export const mappingFields: { key: MappingField; label: string; required?: boolean; help: string; azureOnly?: boolean }[] = [
  { key: 'name', label: 'Tool name', required: true, help: 'The tool the row belongs to.' },
  { key: 'version', label: 'Version (optional)', help: 'Different versions of a tool are separate entries.' },
  { key: 'validationDate', label: 'Validation date (optional)', help: 'When the tool was validated; the latest of a tool’s rows is kept.' },
  { key: 'validityPeriod', label: 'Validity period (optional)', help: 'How long a validation stays valid: a number (in the unit below) or a text such as “24 months” or “2 years”.' },
  { key: 'dueDate', label: 'Due date (optional)', help: 'An explicit due date; it wins over validation date + validity period.' },
  { key: 'id', label: 'ID (optional)', help: 'The Azure DevOps work item ID of the tool (System.Id): shown as ID and used for the Current Month Status.', azureOnly: true },
  { key: 'usedBy', label: 'Used by (optional)', help: 'The query’s Source column: who uses the tool.', azureOnly: true },
  { key: 'validated', label: 'Validated (optional)', help: 'The query’s State column.', azureOnly: true },
  { key: 'type', label: 'Type (optional)', help: 'The query’s Type column (else the work item type).', azureOnly: true },
]
export interface ToolMapping { name?: string; version?: string; validationDate?: string; validityPeriod?: string; dueDate?: string; id?: string; usedBy?: string; validated?: string; type?: string; periodUnit: 'months' | 'years'; confirmed: boolean }
export const specialFields: { key: string; label: string }[] = [
  { key: '@tool-name', label: 'Tool (the Tool Validations rule: Area Path folder, else the Title)' },
  { key: '@tool-version', label: 'Version (the Tool Validations rule: Iteration Path release, else the Title’s version)' },
  { key: '@title', label: 'Title' },
  { key: '@approval', label: 'Author Approval Date (as the Releases table’s Approved)' },
  { key: '@completion', label: 'Completion date (Stream mapping → Tool Validations queries; the default)' },
]
// TVL-29: the special value of an Azure DevOps source's Validation date — the completion date chosen in Stream mapping →
// Tool Validations queries → Completion date (TVL-20, default System.ChangedDate). An Azure DevOps source whose mapping
// names no validation date reads this one too.
export const completionSpecial = '@completion'
export const isAzureKind = (sourceKind: ToolSourceKind) => sourceKind === 'stream' || sourceKind === 'azure'

// TVL-32: the category of a source, asked when it is added (Setup → Sources → ＋ Add source…) and changed in its Edit
// mapping…: a **Tool List** (one row per tool: it feeds the master list — Merge into master list…, and for the Tool
// Validations query the automatic append) or **Validation Documents** (documents of the validations: listed on the
// source's own tab with every column, never added to or changing the master list). Stored as `category` on the source in
// tool-validations.json; a source without it reads as a Tool List (sources from before TVL-32 behave as before). The
// Tool Validations query (source "stream") is always a Tool List: its Validation Documents query is set in Stream mapping
// (TVL-33).
export type SourceCategory = 'tools' | 'documents'
export const sourceCategories: { key: SourceCategory; label: string; detail: string }[] = [
  { key: 'tools', label: 'Tool List', detail: 'One row per tool: its tools are added to the master list (Merge into master list…).' },
  { key: 'documents', label: 'Validation Documents', detail: 'Documents of the validations: listed on the source’s own tab with every column; never added to the master list.' },
]
export const categoryOf = (source: Pick<ToolSource, 'category'>): SourceCategory => source.category ?? 'tools'
export const categoryLabel = (key: SourceCategory) => sourceCategories.find((entry) => entry.key === key)?.label ?? key
// Only a Tool List source feeds the master list (TVL-04, TVL-05, TVL-32).
export const feedsMasterList = (source: Pick<ToolSource, 'category'>) => categoryOf(source) === 'tools'

export interface ToolSource { id: string; kind: ToolSourceKind; name: string; category?: SourceCategory; ref?: string; mapping: ToolMapping; mergedAt?: string; mergedBy?: string }
// The link of an entry to a source: whether the source held the tool when it was last read (TVL-04: "not in source now").
export interface ToolLink { inSource: boolean }
export type ManualField = 'name' | 'validationDate' | 'validityMonths' | 'dueDate'
// TVL-34: id, usedBy, validated and type — from an Azure DevOps source only (the work item's ID, its Source, State and
// Type columns); never entered by hand.
export interface ToolEntry { key: string; name: string; version: string; validationDate?: string; validityMonths?: number; dueDate?: string; id?: number; usedBy?: string; validated?: string; type?: string; manual: ManualField[]; notes?: string; sources: Record<string, ToolLink>; addedAt: string; addedBy?: string; changedAt?: string; changedBy?: string }
// TVL-15, TVL-16: a tab the owners added — an On-Demand page (Table, Table + Insights or On-Demand Dashboard) shown only
// as a tab of this page, by its page id, with the tab's name and the page type it was created as.
export interface CustomTab { pageId: string; name: string; kind: PageKind }
// TVL-27: a due date highlight band — tools due within `days` days (0: overdue or due today) are tinted in `colour`.
export interface HighlightBand { days: number; colour: HighlightColour }
// `highlights` absent: the default bands (defaultHighlights); an empty list: no highlighting (the owners removed them all).
export interface ToolValidationsFile { schema: 1; kind: 'tool-validations'; defaultDays: number; owners: string[]; sources: ToolSource[]; tools: ToolEntry[]; tabs: CustomTab[]; highlights?: HighlightBand[] }

// ---- matching (TVL-03) ----
// The same tool: the same name, ignoring letter case and every run of spaces and punctuation, and the same version
// (a leading "v" and trailing ".0" ignored: "v2.1.0" = "2.1"); no version is a version of its own.
export const nameKey = (name: string) => name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
export const versionKey = (version: string) => normalizeVersion(version.trim())
export const toolKey = (name: string, version: string) => `${nameKey(name)}@${versionKey(version)}`

// ---- dates and periods (TVL-06) ----
const plainDay = /^(\d{4})-(\d{2})-(\d{2})$/
export function isDay(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = plainDay.exec(value)
  if (!match) return false
  const at = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return at.getUTCDate() === Number(match[3]) && at.getUTCMonth() === Number(match[2]) - 1
}
// A date as a source writes it (ISO with or without a time, 27-Oct-2026, Oct 27, 2026, 27.10.2026, 10/27/2026), as its
// UTC day; undefined when it is not a date.
export function dayOf(value: unknown): string | undefined {
  if (value == null || value === '' || typeof value === 'boolean') return undefined
  const text = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) { const at = Date.parse(text); return Number.isFinite(at) ? new Date(at).toISOString().slice(0, 10) : undefined }
  const at = parseExportDate(text)
  return at === undefined ? undefined : new Date(at).toISOString().slice(0, 10)
}
// A validity period in months: a number in the source's unit, or a text with its unit ("24 months", "2 years", "2y",
// "18 mo"). Whole months, 1 to 600; anything else is not a period.
export function monthsOf(value: unknown, unit: 'months' | 'years' = 'months'): number | undefined {
  if (value == null || value === '' || typeof value === 'boolean') return undefined
  const text = String(value).trim().toLowerCase().replace(',', '.')
  const match = /^(\d+(?:\.\d+)?)\s*(y|yr|yrs|year|years|m|mo|mos|month|months)?$/.exec(text)
  if (!match) return undefined
  const number = Number(match[1]), inYears = match[2] ? match[2].startsWith('y') : unit === 'years'
  const months = Math.round(inYears ? number * 12 : number)
  return months >= 1 && months <= maxPeriodMonths ? months : undefined
}
// The day a number of calendar months after a day; a day the month does not have becomes its last (31 Jan + 1 → 28/29 Feb).
export function addMonths(day: string, months: number): string {
  const [year, month, date] = day.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(date, last))).toISOString().slice(0, 10)
}
export type DueFrom = 'source' | 'entered' | 'calculated' | 'default' | 'none'
// TVL-06: the validity period used when an entry gives none (2 years). Applied when the list is read, never written to
// tool-validations.json, so a period given later (by a source or by hand) wins and the file format stays the same.
export const defaultValidityMonths = 24
// TVL-06: the due date shown — an explicit one (from a source, or entered by hand) wins; else validation date + period;
// else validation date + the default period (24 months); with no validation date there is no due date.
export function dueOf(entry: Pick<ToolEntry, 'validationDate' | 'validityMonths' | 'dueDate' | 'manual'>): { due?: string; from: DueFrom } {
  if (entry.dueDate) return { due: entry.dueDate, from: entry.manual.includes('dueDate') ? 'entered' : 'source' }
  if (entry.validationDate && entry.validityMonths) return { due: addMonths(entry.validationDate, entry.validityMonths), from: 'calculated' }
  if (entry.validationDate) return { due: addMonths(entry.validationDate, defaultValidityMonths), from: 'default' }
  return { from: 'none' }
}
// TVL-06: the validity period an entry's due date is worked out with — its own; else the default (marked as such) when
// the default gives the due date (a validation date, no due date); else none (an explicit due date needs no period).
export function validityOf(entry: Pick<ToolEntry, 'validationDate' | 'validityMonths' | 'dueDate'>): { months?: number; defaulted: boolean } {
  if (entry.validityMonths) return { months: entry.validityMonths, defaulted: false }
  return entry.validationDate && !entry.dueDate ? { months: defaultValidityMonths, defaulted: true } : { defaulted: false }
}
export const dueFromLabel: Record<DueFrom, string> = { source: 'from the source', entered: 'entered by hand', calculated: 'validation date + validity period', default: `validation date + ${defaultValidityMonths} months (default)`, none: 'no due date' }
// TVL-29: where the due date comes from, worded for a tool whose validation date is the completion date of Azure DevOps.
export const dueFromText = (from: DueFrom, completion = false) => !completion ? dueFromLabel[from] : from === 'default' ? `completion date + ${defaultValidityMonths} months (default)` : from === 'calculated' ? 'completion date + validity period' : dueFromLabel[from]
export const completionNote = '(completion date)'
const dayMs = 86_400_000
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs)

// ---- the expiry view (TVL-08) ----
export type ExpiryStatus = 'overdue' | 'due' | 'none' | 'later'
export interface ExpiryRow { entry: ToolEntry; due?: string; from: DueFrom; days?: number; status: ExpiryStatus }
export const statusLabel: Record<ExpiryStatus, string> = { overdue: 'Overdue', due: 'Due soon', none: 'No due date', later: 'Later' }
const statusOrder: Record<ExpiryStatus, number> = { overdue: 0, due: 1, none: 2, later: 3 }
// Every entry with its due date and days left (negative: overdue) on the UTC day `today`; the list shown is the overdue
// ones first, then those due within `days` days (soonest first), then those without a due date (by name). Entries due
// later are left out (they are on the Master list).
export function expiryRows(tools: ToolEntry[], today: string, days: number): ExpiryRow[] {
  return tools.map((entry): ExpiryRow => {
    const { due, from } = dueOf(entry)
    if (!due) return { entry, from, status: 'none' }
    const left = daysBetween(today, due)
    return { entry, due, from, days: left, status: left < 0 ? 'overdue' : left <= days ? 'due' : 'later' }
  }).filter((row) => row.status !== 'later').sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || (a.days ?? 0) - (b.days ?? 0) || a.entry.name.localeCompare(b.entry.name, 'en', { sensitivity: 'base' }) || a.entry.version.localeCompare(b.entry.version))
}
export const daysLeftText = (row: Pick<ExpiryRow, 'days'>) => row.days == null ? '' : row.days < 0 ? `${-row.days} day${row.days === -1 ? '' : 's'} overdue` : row.days === 0 ? 'Due today' : `${row.days} day${row.days === 1 ? '' : 's'} left`
// TVL-09: the number of days a viewer looks ahead — their own (personal views), else the team default from the file.
export function cleanDays(value: unknown): number | undefined {
  const number = typeof value === 'string' && value.trim() ? Number(value) : value
  return typeof number === 'number' && Number.isInteger(number) && number >= 1 && number <= maxExpiryDays ? number : undefined
}

// ---- TVL-27, TVL-28: due date highlights ----
// The team's bands, set on Setup by those who may change the list (TVL-11) and kept in tool-validations.json. A band
// holds the tools whose due date is within its number of days from today (days left ≤ days); an overdue tool (days left
// below 0) is in every band's reach, so it falls in the narrowest — the band with the fewest days. Days are 0 to 3650
// (0: overdue or due today); there are no negative days, so "overdue" is simply the narrowest band. The narrowest band
// that holds a tool wins; a tool without a due date is never highlighted. Colours are a fixed palette of named tints
// (tokens of index.css for light and dark), stored by their key.
export type HighlightColour = 'red' | 'orange' | 'amber' | 'yellow' | 'green' | 'blue' | 'purple' | 'grey'
export const highlightColours: { key: HighlightColour; label: string }[] = [
  { key: 'red', label: 'Red' }, { key: 'orange', label: 'Orange' }, { key: 'amber', label: 'Amber' }, { key: 'yellow', label: 'Yellow' },
  { key: 'green', label: 'Green' }, { key: 'blue', label: 'Blue' }, { key: 'purple', label: 'Purple' }, { key: 'grey', label: 'Grey' },
]
export const colourLabel = (key: HighlightColour) => highlightColours.find((entry) => entry.key === key)?.label ?? key
export const maxHighlights = 10, maxHighlightDays = 3650
// No `highlights` in the file (a new file, or one from before v10.19): overdue or due today red, within 30 days amber,
// within 90 days yellow.
export const defaultHighlights: HighlightBand[] = [{ days: 0, colour: 'red' }, { days: 30, colour: 'amber' }, { days: 90, colour: 'yellow' }]
export const bandsOf = (file: Pick<ToolValidationsFile, 'highlights'>): HighlightBand[] => sortBands(file.highlights ?? defaultHighlights)
export const sortBands = (bands: HighlightBand[]) => [...bands].sort((a, b) => a.days - b.days)
// The band of a due date on the UTC day `today` (undefined: no due date, or due later than every band).
export function bandFor(bands: HighlightBand[], due: string | undefined, today: string): HighlightBand | undefined {
  if (!due) return undefined
  const left = daysBetween(today, due)
  return sortBands(bands).find((band) => left <= band.days)
}
export const bandLabel = (band: Pick<HighlightBand, 'days'>) => band.days === 0 ? 'Overdue or due today' : `Due within ${band.days} day${band.days === 1 ? '' : 's'}`
// The short text of the marker in the Due date cell, so the band is not shown by colour alone.
export const bandShort = (band: Pick<HighlightBand, 'days'>) => band.days === 0 ? 'Overdue / today' : `≤ ${band.days} day${band.days === 1 ? '' : 's'}`
// How many tools fall in each band (the preview on Setup), in band order.
export const bandCounts = (bands: HighlightBand[], tools: ToolEntry[], today: string) => {
  const sorted = sortBands(bands)
  const counts = sorted.map(() => 0)
  for (const entry of tools) { const band = bandFor(sorted, dueOf(entry).due, today); if (band) counts[sorted.indexOf(band)]++ }
  return sorted.map((band, index) => ({ band, count: counts[index] }))
}
function cleanBand(value: unknown): HighlightBand | string {
  const raw = record(value)
  if (!raw) return 'not an object'
  const days = raw.days
  if (!(typeof days === 'number' && Number.isInteger(days) && days >= 0 && days <= maxHighlightDays)) return `days “${String(days)}” is not a whole number from 0 to ${maxHighlightDays}`
  const colour = highlightColours.find((entry) => entry.key === raw.colour)?.key
  if (!colour) return `unknown colour “${String(raw.colour)}”`
  return { days, colour }
}
// Why a list of bands cannot be saved ('' when it can): each a whole number of days from 0 to 3650, a colour of the
// palette, no number of days twice, at most 10.
export function highlightsProblem(bands: { days: string | number; colour: string }[]): string {
  if (bands.length > maxHighlights) return `At most ${maxHighlights} bands.`
  const seen = new Set<number>()
  for (const band of bands) {
    const days = typeof band.days === 'string' ? (band.days.trim() ? Number(band.days) : NaN) : band.days
    if (!Number.isInteger(days) || days < 0 || days > maxHighlightDays) return `Enter the days of each band as a whole number from 0 to ${maxHighlightDays} (0: overdue or due today).`
    if (!highlightColours.some((entry) => entry.key === band.colour)) return 'Choose a colour for each band.'
    if (seen.has(days)) return `Two bands have ${days} days: each band needs its own number of days.`
    seen.add(days)
  }
  return ''
}
export const setHighlights = (file: ToolValidationsFile, bands: HighlightBand[]): ToolValidationsFile => ({ ...file, highlights: sortBands(bands.map((band) => ({ days: band.days, colour: band.colour }))) })

// ---- the status of an entry (TVL-04) ----
export type EntryState = 'in-source' | 'gone' | 'manual'
export const entryState = (entry: Pick<ToolEntry, 'sources'>): EntryState => { const links = Object.values(entry.sources); return !links.length ? 'manual' : links.some((link) => link.inSource) ? 'in-source' : 'gone' }
export const entryStateLabel: Record<EntryState, string> = { 'in-source': 'In source', gone: 'Not in source now', manual: 'Added by hand' }

// ---- the file: empty, parse (strict), serialize (TVL-02) ----
export const emptyMapping = (): ToolMapping => ({ periodUnit: 'months', confirmed: false })
export const streamSource = (): ToolSource => ({ id: streamSourceId, kind: 'stream', name: 'Tool Validations', mapping: emptyMapping() })
export const emptyFile = (): ToolValidationsFile => ({ schema: 1, kind, defaultDays: defaultExpiryDays, owners: [], sources: [streamSource()], tools: [], tabs: [] })
export interface Refused { name: string; reason: string }
export interface Parsed { file: ToolValidationsFile; refused: Refused[] }

const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const text = (value: unknown, max: number) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : undefined
const stamp = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/.test(value) ? value : undefined
const sourceIdPattern = /^[a-z0-9][a-z0-9-]{0,39}$/
const manualFields: ManualField[] = ['name', 'validationDate', 'validityMonths', 'dueDate']
const dateFields = ['validationDate', 'validityMonths', 'dueDate'] as const
function cleanMapping(value: unknown): ToolMapping {
  const raw = record(value) ?? {}
  const mapping: ToolMapping = { periodUnit: raw.periodUnit === 'years' ? 'years' : 'months', confirmed: raw.confirmed === true }
  for (const field of mappingFields) { const found = text(raw[field.key], 200); if (found) mapping[field.key] = found }
  return mapping
}
function cleanSource(value: unknown): ToolSource | string {
  const raw = record(value)
  if (!raw) return 'not an object'
  const id = typeof raw.id === 'string' && sourceIdPattern.test(raw.id) ? raw.id : ''
  if (!id) return 'its id is missing or not lower-case letters, digits and hyphens'
  const sourceKind = sourceKinds.find((entry) => entry.key === raw.kind)?.key
  if (!sourceKind) return `unknown kind “${String(raw.kind)}”`
  if ((sourceKind === 'stream') !== (id === streamSourceId)) return 'only the source “stream” is the Tool Validations query'
  const name = text(raw.name, 80)
  if (!name) return 'its name is missing or longer than 80 characters'
  const ref = text(raw.ref, 200)
  if (sourceKind !== 'stream' && !ref) return 'it names no connection, export or page'
  // TVL-32: the category — absent: a Tool List; any other value than "tools" or "documents" refuses the source.
  const category = raw.category === undefined ? undefined : sourceCategories.find((entry) => entry.key === raw.category)?.key
  if (raw.category !== undefined && !category) return `unknown category “${String(raw.category)}” (“tools”: Tool List, or “documents”: Validation Documents)`
  if (sourceKind === 'stream' && category === 'documents') return 'the Tool Validations query is always a Tool List (its Validation Documents query is set in Stream mapping)'
  const mergedAt = stamp(raw.mergedAt), mergedBy = text(raw.mergedBy, 200)
  return { id, kind: sourceKind, name, ...(category ? { category } : {}), ...(ref && sourceKind !== 'stream' ? { ref } : {}), mapping: cleanMapping(raw.mapping), ...(mergedAt ? { mergedAt } : {}), ...(mergedBy ? { mergedBy } : {}) }
}
const textFields = ['usedBy', 'validated', 'type'] as const
const workItemId = (value: unknown) => { const id = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value; return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : undefined }
// TVL-34: the four Azure DevOps values of an entry or a tool read from a source, those present and valid.
type Loose = { [key: string]: unknown }
function azureValuesOf(raw: Loose): Pick<ToolEntry, AzureField> {
  const id = workItemId(raw.id), values: Pick<ToolEntry, AzureField> = id ? { id } : {}
  for (const field of textFields) { const found = text(raw[field], 200); if (found) values[field] = found }
  return values
}
function cleanTool(value: unknown, sources: Set<string>): ToolEntry | string {
  const raw = record(value)
  if (!raw) return 'not an object'
  const name = text(raw.name, 200)
  if (!name || !nameKey(name)) return 'no tool name (1 to 200 characters with a letter or digit)'
  const version = typeof raw.version === 'string' && raw.version.length <= 60 ? raw.version.trim() : raw.version == null ? '' : null
  if (version == null) return 'its version is not a text of up to 60 characters'
  for (const field of ['validationDate', 'dueDate'] as const) if (raw[field] != null && !isDay(raw[field])) return `${field === 'dueDate' ? 'due date' : 'validation date'} “${String(raw[field])}” is not a date (YYYY-MM-DD)`
  const months = raw.validityMonths
  if (months != null && !(typeof months === 'number' && Number.isInteger(months) && months >= 1 && months <= maxPeriodMonths)) return `validity period “${String(months)}” is not a whole number of months from 1 to ${maxPeriodMonths}`
  const notes = raw.notes == null ? undefined : typeof raw.notes === 'string' && raw.notes.length <= 2000 ? raw.notes : null
  if (notes === null) return 'its notes are not a text of up to 2000 characters'
  const addedAt = stamp(raw.addedAt)
  if (!addedAt) return 'no time it was added (addedAt)'
  const links = record(raw.sources) ?? {}
  const linked: Record<string, ToolLink> = {}
  for (const [id, link] of Object.entries(links)) if (sources.has(id) && record(link)) linked[id] = { inSource: record(link)!.inSource === true }
  const manual = Array.isArray(raw.manual) ? manualFields.filter((field) => (raw.manual as unknown[]).includes(field)) : []
  const changedAt = stamp(raw.changedAt), addedBy = text(raw.addedBy, 200), changedBy = text(raw.changedBy, 200)
  // TVL-34: the Azure DevOps ID (a whole number above 0) and the Used by, Validated and Type texts (up to 200 characters).
  if (raw.id != null && !workItemId(raw.id)) return `its ID “${String(raw.id)}” is not an Azure DevOps work item ID`
  for (const field of textFields) if (raw[field] != null && !text(raw[field], 200)) return `its ${field === 'usedBy' ? 'Used by' : field === 'validated' ? 'Validated' : 'Type'} is not a text of 1 to 200 characters`
  return {
    key: toolKey(name, version), name, version,
    ...(isDay(raw.validationDate) ? { validationDate: raw.validationDate } : {}), ...(typeof months === 'number' ? { validityMonths: months } : {}), ...(isDay(raw.dueDate) ? { dueDate: raw.dueDate } : {}),
    ...azureValuesOf(raw),
    manual, ...(notes ? { notes } : {}), sources: linked, addedAt, ...(addedBy ? { addedBy } : {}), ...(changedAt ? { changedAt } : {}), ...(changedBy ? { changedBy } : {}),
  }
}
// TVL-16: a tab — the page id (as On-Demand page ids), a name of 1 to 40 characters and a known page type.
export const maxCustomTabs = 10, maxTabName = 40
const pageIdPattern = /^[a-z0-9][a-z0-9-]{0,39}$/
const customKinds: PageKind[] = ['table', 'table-insights', 'dashboard']
function cleanTab(value: unknown): CustomTab | string {
  const raw = record(value)
  if (!raw) return 'not an object'
  const pageId = typeof raw.pageId === 'string' && pageIdPattern.test(raw.pageId) ? raw.pageId : ''
  if (!pageId) return 'its page id is missing or not lower-case letters, digits and hyphens'
  const name = typeof raw.name === 'string' ? raw.name.replace(/\s+/g, ' ').trim() : ''
  if (!name || name.length > maxTabName) return `its name is missing or longer than ${maxTabName} characters`
  const tabKind = customKinds.find((entry) => entry === raw.kind)
  if (!tabKind) return `unknown page type “${String(raw.kind)}”`
  return { pageId, name, kind: tabKind }
}
// TVL-02: a file that is not JSON or not a tool-validations file of schema 1 is refused whole (an Error: the list last
// read stays in use); each source and tool is checked on its own and a bad one is refused with why, the others used.
// The Tool Validations query (source "stream") is always there.
export function parseToolValidations(input: string | null | undefined): Parsed {
  if (input == null || !input.trim()) return { file: emptyFile(), refused: [] }
  let raw: unknown
  try { raw = JSON.parse(input) } catch { throw new Error(`${toolValidationsFile} is not valid JSON.`) }
  const top = record(raw)
  if (!top || top.schema !== 1 || top.kind !== kind) throw new Error(`${toolValidationsFile} is not a Tool Validations master list (schema 1, kind “${kind}”).`)
  const refused: Refused[] = []
  const sources: ToolSource[] = []
  for (const value of Array.isArray(top.sources) ? top.sources : []) {
    const source = cleanSource(value)
    if (typeof source === 'string') { refused.push({ name: `Source “${String(record(value)?.name ?? record(value)?.id ?? '?')}”`, reason: source }); continue }
    if (sources.some((entry) => entry.id === source.id)) { refused.push({ name: `Source “${source.name}”`, reason: `the id “${source.id}” is used twice` }); continue }
    if (sources.length >= maxSources) { refused.push({ name: `Source “${source.name}”`, reason: `more than ${maxSources} sources` }); continue }
    sources.push(source)
  }
  if (!sources.some((source) => source.id === streamSourceId)) sources.unshift(streamSource())
  const ids = new Set(sources.map((source) => source.id))
  const tools: ToolEntry[] = [], seen = new Set<string>()
  for (const value of Array.isArray(top.tools) ? top.tools : []) {
    const tool = cleanTool(value, ids)
    const label = String(record(value)?.name ?? '?')
    if (typeof tool === 'string') { refused.push({ name: label, reason: tool }); continue }
    if (seen.has(tool.key)) { refused.push({ name: label, reason: 'the same tool and version is listed twice' }); continue }
    if (tools.length >= maxTools) { refused.push({ name: label, reason: `more than ${maxTools} tools` }); continue }
    seen.add(tool.key); tools.push(tool)
  }
  const tabs: CustomTab[] = []
  for (const value of Array.isArray(top.tabs) ? top.tabs : []) {
    const tab = cleanTab(value)
    const label = `Tab “${String(record(value)?.name ?? record(value)?.pageId ?? '?')}”`
    if (typeof tab === 'string') { refused.push({ name: label, reason: tab }); continue }
    if (tabs.some((entry) => entry.pageId === tab.pageId)) { refused.push({ name: label, reason: `the page “${tab.pageId}” is a tab twice` }); continue }
    if (tabs.some((entry) => entry.name.toLowerCase() === tab.name.toLowerCase())) { refused.push({ name: label, reason: 'another tab has this name' }); continue }
    if (tabs.length >= maxCustomTabs) { refused.push({ name: label, reason: `more than ${maxCustomTabs} tabs` }); continue }
    tabs.push(tab)
  }
  // TVL-27: the bands — absent: the defaults; present: the good ones (a bad band, the same days twice or more than 10
  // refused with the reason), an empty list meaning no highlighting.
  let highlights: HighlightBand[] | undefined
  if (top.highlights !== undefined) {
    highlights = []
    if (!Array.isArray(top.highlights)) refused.push({ name: 'Due date highlights', reason: 'not a list of bands' })
    for (const value of Array.isArray(top.highlights) ? top.highlights : []) {
      const band = cleanBand(value)
      const label = `Highlight “${String(record(value)?.days ?? '?')} days”`
      if (typeof band === 'string') { refused.push({ name: label, reason: band }); continue }
      if (highlights.some((entry) => entry.days === band.days)) { refused.push({ name: label, reason: `${band.days} days is a band twice` }); continue }
      if (highlights.length >= maxHighlights) { refused.push({ name: label, reason: `more than ${maxHighlights} bands` }); continue }
      highlights.push(band)
    }
    highlights = sortBands(highlights)
  }
  const days = cleanDays(top.defaultDays)
  return { file: { schema: 1, kind, defaultDays: days ?? defaultExpiryDays, owners: ownersOf(top.owners), sources, tools: sortTools(tools), tabs, ...(highlights ? { highlights } : {}) }, refused }
}
const sortTools = (tools: ToolEntry[]) => [...tools].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.version.localeCompare(b.version) || a.key.localeCompare(b.key))
// The key is worked out from the name and version, never stored; fields in a fixed order so a change is a small diff.
function toolJson(tool: ToolEntry) {
  return { name: tool.name, version: tool.version, ...(tool.validationDate ? { validationDate: tool.validationDate } : {}), ...(tool.validityMonths ? { validityMonths: tool.validityMonths } : {}), ...(tool.dueDate ? { dueDate: tool.dueDate } : {}), ...azureValuesOf(tool as unknown as Loose), ...(tool.manual.length ? { manual: manualFields.filter((field) => tool.manual.includes(field)) } : {}), ...(tool.notes ? { notes: tool.notes } : {}), sources: Object.fromEntries(Object.keys(tool.sources).sort().map((id) => [id, { inSource: tool.sources[id].inSource }])), addedAt: tool.addedAt, ...(tool.addedBy ? { addedBy: tool.addedBy } : {}), ...(tool.changedAt ? { changedAt: tool.changedAt } : {}), ...(tool.changedBy ? { changedBy: tool.changedBy } : {}) }
}
function sourceJson(source: ToolSource) {
  const mapping = { ...Object.fromEntries(mappingFields.filter((field) => source.mapping[field.key]).map((field) => [field.key, source.mapping[field.key]])), periodUnit: source.mapping.periodUnit, confirmed: source.mapping.confirmed }
  return { id: source.id, kind: source.kind, name: source.name, ...(source.category ? { category: source.category } : {}), ...(source.ref ? { ref: source.ref } : {}), mapping, ...(source.mergedAt ? { mergedAt: source.mergedAt } : {}), ...(source.mergedBy ? { mergedBy: source.mergedBy } : {}) }
}
// The tabs are written only when there are some (in their order), so a file without tabs stays as it was; the highlight
// bands (TVL-27) only once the owners saved them — an empty list too, which means "no highlighting".
export const serializeToolValidations = (file: ToolValidationsFile) => `${JSON.stringify({ schema: 1, kind, defaultDays: file.defaultDays, owners: file.owners, ...(file.highlights ? { highlights: sortBands(file.highlights).map((band) => ({ days: band.days, colour: band.colour })) } : {}), sources: file.sources.map(sourceJson), ...(file.tabs?.length ? { tabs: file.tabs.map((tab) => ({ pageId: tab.pageId, name: tab.name, kind: tab.kind })) } : {}), tools: sortTools(file.tools).map(toolJson) }, null, 2)}\n`

// ---- reading a source (TVL-07) ----
export interface ToolInput { name: string; version: string; validationDate?: string; validityMonths?: number; dueDate?: string; id?: number; usedBy?: string; validated?: string; type?: string }
const later = (a?: string, b?: string) => !a ? b : !b ? a : a >= b ? a : b
// Rows of one tool (and version) are one entry: the latest validation date and due date; the period of the row with
// the latest validation date, else the first one given.
export function aggregate(inputs: ToolInput[]): Map<string, ToolInput> {
  const byKey = new Map<string, ToolInput>()
  for (const input of inputs) {
    const name = input.name.replace(/\s+/g, ' ').trim(), version = input.version.replace(/\s+/g, ' ').trim()
    if (!nameKey(name) || name.length > 200 || version.length > 60) continue
    const key = toolKey(name, version), known = byKey.get(key)
    if (!known) { byKey.set(key, { ...input, name, version }); continue }
    const newer = Boolean(input.validationDate && (!known.validationDate || input.validationDate > known.validationDate))
    // TVL-34: the ID, Used by, Validated and Type of the row with the latest validation date, else the first row's.
    const mine = azureValuesOf(known as unknown as Loose), theirs = azureValuesOf(input as unknown as Loose)
    byKey.set(key, { ...known, ...(newer ? { ...mine, ...theirs } : { ...theirs, ...mine }), validationDate: later(known.validationDate, input.validationDate), dueDate: later(known.dueDate, input.dueDate), validityMonths: newer && input.validityMonths ? input.validityMonths : known.validityMonths ?? input.validityMonths })
  }
  return byKey
}
// Azure DevOps (the stream's query or another one): a field reference name of the query's columns, or a special value.
export function azureValue(item: AzureWorkItem, field: string | undefined, patterns: NamingPattern[] = [], completionField?: string): string | undefined {
  if (!field) return undefined
  if (field === completionSpecial) return completionDateOf(item, completionField || undefined)
  if (field === '@tool-name' || field === '@tool-version') { const release = releaseFor(item, 'tool', patterns); return field === '@tool-name' ? release?.name : release?.release }
  if (field === noField) return undefined
  if (field === 'System.Id') return String(item.id)
  if (field === 'System.WorkItemType' && item.fields?.[field] == null) return item.workItemType || undefined
  if (field === 'System.State' && item.fields?.[field] == null) return item.state || undefined
  if (field === '@title' || field === 'System.Title') return item.title
  if (field === '@approval') return item.approvalDate ?? approvalDateFrom(item.fields ?? {})
  if (field === 'System.AreaPath') return item.areaPath
  if (field === 'System.IterationPath') return item.iterationPath
  const value = item.fields?.[field]
  return value == null || value === '' ? undefined : String(value)
}
export function inputsFromRows<R>(rows: R[], mapping: ToolMapping, read: (row: R, field: string | undefined) => string | undefined): ToolInput[] {
  return rows.flatMap((row) => {
    const name = read(row, mapping.name)?.trim()
    if (!name) return []
    const validationDate = dayOf(read(row, mapping.validationDate)), dueDate = dayOf(read(row, mapping.dueDate)), validityMonths = monthsOf(read(row, mapping.validityPeriod), mapping.periodUnit)
    const clean = (field: string | undefined) => read(row, field)?.replace(/\s+/g, ' ').trim().slice(0, 200)
    const azure = azureValuesOf({ id: clean(mapping.id), usedBy: clean(mapping.usedBy), validated: clean(mapping.validated), type: clean(mapping.type) })
    return [{ name, version: read(row, mapping.version)?.trim() ?? '', ...(validationDate ? { validationDate } : {}), ...(validityMonths ? { validityMonths } : {}), ...(dueDate ? { dueDate } : {}), ...azure }]
  })
}
// TVL-29: the tools of an Azure DevOps source (the Tool Validations query or another query) — read with its mapping, the
// Validation date being the field the mapping names, else the completion date (`completionField`: the TVL-20 setting,
// default System.ChangedDate). Decided per source, not per row: a mapped field that a row leaves empty gives no date.
export function azureInputs(items: AzureWorkItem[], mapping: ToolMapping, patterns: NamingPattern[] = [], completionField?: string): ToolInput[] {
  return inputsFromRows(items, { ...mapping, validationDate: mapping.validationDate || completionSpecial }, (item, field) => azureValue(item, field, patterns, completionField))
}
// What a source offers to map: its fields or columns, as [key, label].
// TVL-34: System.Id (the work item ID) is always offered, also when the query's rows carry it only as their ID.
export function azureFieldOptions(items: AzureWorkItem[]): [string, string][] {
  const refs = [...new Set(['System.Id', ...items.flatMap((item) => Object.keys(item.fields ?? {}))])].sort()
  return [...specialFields.map((field): [string, string] => [field.key, field.label]), ...refs.map((ref): [string, string] => [ref, ref])]
}
// TVL-07: the guesses while a source's mapping has not been saved — the Tool Validations rule for the name and version
// of an Azure DevOps source, the completion date for the validation date (TVL-29), Microsoft.VSTS.Scheduling.DueDate (else
// TargetDate) for the due date when the query has it; for a Windchill export or a page, the column whose name fits.
const guessColumn = (options: [string, string][], pattern: RegExp, not?: RegExp) => options.find(([, label]) => pattern.test(label) && !(not && not.test(label)))?.[0]
// TVL-34: the Azure DevOps fields by column name — ID: System.Id; Used by: the column named Source; Validated: State;
// Type: the column named Type, else System.WorkItemType. A reference name matches by its last part (Custom.Source,
// System.State), letter case ignored; a custom column wins over a System one.
const lastPart = (ref: string) => ref.slice(ref.lastIndexOf('.') + 1).toLowerCase()
function byColumnName(options: [string, string][], name: string): string | undefined {
  const found = options.filter(([key, label]) => !key.startsWith('@') && (lastPart(key) === name || label.trim().toLowerCase() === name))
  return found.find(([key]) => !key.startsWith('System.'))?.[0] ?? found[0]?.[0]
}
export function guessAzureFields(options: [string, string][]): Pick<ToolMapping, AzureField> {
  const has = (ref: string) => options.some(([key]) => key === ref)
  const usedBy = byColumnName(options, 'source'), validated = byColumnName(options, 'state')
  const type = byColumnName(options, 'type') ?? (has('System.WorkItemType') ? 'System.WorkItemType' : undefined)
  return { id: 'System.Id', ...(usedBy ? { usedBy } : {}), ...(validated ? { validated } : {}), ...(type ? { type } : {}) }
}
export function guessMapping(sourceKind: ToolSourceKind, options: [string, string][]): ToolMapping {
  if (sourceKind === 'stream' || sourceKind === 'azure') {
    const has = (ref: string) => options.some(([key]) => key === ref)
    const due = has('Microsoft.VSTS.Scheduling.DueDate') ? 'Microsoft.VSTS.Scheduling.DueDate' : has('Microsoft.VSTS.Scheduling.TargetDate') ? 'Microsoft.VSTS.Scheduling.TargetDate' : undefined
    const period = guessColumn(options.filter(([key]) => !key.startsWith('@')), /validity|valid\w*\s*period|revalidat\w*\s*(period|interval)/i)
    return { name: '@tool-name', version: '@tool-version', validationDate: completionSpecial, ...(period ? { validityPeriod: period } : {}), ...(due ? { dueDate: due } : {}), ...guessAzureFields(options), periodUnit: 'months', confirmed: false }
  }
  const name = guessColumn(options, /^(tool(\s*name)?|name|title)$/i) ?? guessColumn(options, /tool|name|title/i)
  const version = guessColumn(options, /version|^rev(ision)?$/i)
  const validationDate = guessColumn(options, /valid\w*\s*date|date\s*of\s*valid|approv\w*\s*date|released?\s*date/i, /due|expir|next/i)
  const validityPeriod = guessColumn(options, /validity|period|interval/i)
  const dueDate = guessColumn(options, /due|expir|revalid|next\s*valid/i)
  return { ...(name ? { name } : {}), ...(version ? { version } : {}), ...(validationDate ? { validationDate } : {}), ...(validityPeriod ? { validityPeriod } : {}), ...(dueDate ? { dueDate } : {}), periodUnit: 'months', confirmed: false }
}
// The mapping a source is read with: the saved one, else the guesses.
// TVL-34: a mapping saved before the Azure DevOps fields existed names none of them — they are guessed until it is saved
// again (None is then kept as "@none").
export function mappingFor(source: ToolSource, options: [string, string][]): ToolMapping {
  if (!source.mapping.confirmed) return guessMapping(source.kind, options)
  if (!isAzureKind(source.kind) || azureFields.some((field) => source.mapping[field])) return source.mapping
  return { ...source.mapping, ...guessAzureFields(options) }
}
// TVL-35: with one query (no Validation Documents query) — the master list keys of the tools named by the query's rows
// of the month (`monthItems`: the rows with a document in the month), read with the Tool Validations query's mapping.
export function monthToolKeys(file: Pick<ToolValidationsFile, 'sources'>, monthItems: AzureWorkItem[], patterns: NamingPattern[] = []): Set<string> {
  const source = file.sources.find((entry) => entry.id === streamSourceId)
  if (!source || !monthItems.length) return new Set()
  return new Set(azureInputs(monthItems, mappingFor(source, azureFieldOptions(monthItems)), patterns).map((input) => toolKey(input.name, input.version)))
}
// TVL-34: whether a field is mapped (a field set to None reads as not mapped).
export const mapped = (mapping: ToolMapping, key: MappingField) => { const value = mapping[key]; return value && value !== noField ? value : undefined }
// TVL-29: whether a source dates its tools with the completion date — an Azure DevOps source whose mapping names no
// other Validation date (the guess names the completion date).
export const readsCompletion = (source: Pick<ToolSource, 'kind' | 'mapping'>) => isAzureKind(source.kind) && (!source.mapping.confirmed || !source.mapping.validationDate || source.mapping.validationDate === completionSpecial)
// TVL-29: whether an entry's validation date is the completion date: not entered by hand, and every source it is linked
// to is an Azure DevOps source that reads the completion date (with another source the date may be that source's).
export function completionDated(file: Pick<ToolValidationsFile, 'sources'>, entry: Pick<ToolEntry, 'validationDate' | 'manual' | 'sources'>): boolean {
  if (!entry.validationDate || entry.manual.includes('validationDate')) return false
  const linked = Object.keys(entry.sources).map((id) => file.sources.find((source) => source.id === id))
  return linked.length > 0 && linked.every((source) => source && readsCompletion(source))
}

// ---- merging a source into the master list (TVL-04, TVL-05) ----
// The values of a tool read from a source replace the entry's — except fields corrected by hand (manual), which stay —
// and only when the source gives one (a blank never clears a date). The entry is linked to the source (in source now);
// an entry linked to it that the source no longer holds is marked "not in source now" and stays. A new tool is added.
// `inputs` is the whole of the source as last read. Returns the same file object when nothing changes.
// TVL-32: a Validation Documents source never adds or updates a tool: it is read as holding none, so the tools it fed
// while it was a Tool List are marked "not in source now" for it (kept, as by the rule above).
export interface MergeResult { file: ToolValidationsFile; added: string[]; updated: string[]; gone: string[] }
export function mergeSource(file: ToolValidationsFile, sourceId: string, inputs: ToolInput[], at: string, by?: string): MergeResult {
  const source = file.sources.find((entry) => entry.id === sourceId)
  const incoming = aggregate(source && !feedsMasterList(source) ? [] : inputs)
  const added: string[] = [], updated: string[] = [], gone: string[] = []
  const kindOfSource = source?.kind
  const fromAzure = Boolean(kindOfSource && isAzureKind(kindOfSource))
  const tools = file.tools.map((entry) => {
    const input = incoming.get(entry.key), link = entry.sources[sourceId]
    if (!input) {
      if (!link?.inSource) return entry
      gone.push(entry.name)
      return { ...entry, sources: { ...entry.sources, [sourceId]: { inSource: false } } }
    }
    incoming.delete(entry.key)
    const next: ToolEntry = { ...entry, sources: { ...entry.sources, [sourceId]: { inSource: true } } }
    // TVL-30: Azure DevOps is the truth for its tools — a date or period entered by hand (before the tool came from
    // Azure DevOps, or before the lock) is replaced by the source's value, or emptied when the source gives none.
    if (fromAzure) {
      for (const field of dateFields) if (entry.manual.includes(field) && !input[field]) delete next[field]
      next.manual = entry.manual.filter((field) => !(dateFields as readonly string[]).includes(field))
    }
    if (!next.manual.includes('validationDate') && input.validationDate) next.validationDate = input.validationDate
    if (!next.manual.includes('validityMonths') && input.validityMonths) next.validityMonths = input.validityMonths
    if (!next.manual.includes('dueDate') && input.dueDate) next.dueDate = input.dueDate
    // TVL-34: the ID, Used by, Validated and Type come from Azure DevOps only — its values win; a blank never clears one.
    if (fromAzure) Object.assign(next, azureValuesOf(input as unknown as Loose))
    const changed = JSON.stringify(toolJson(next)) !== JSON.stringify(toolJson(entry))
    if (changed) updated.push(entry.name)
    return changed ? next : entry
  })
  for (const [key, input] of incoming) {
    if (tools.length >= maxTools) break
    added.push(input.name)
    tools.push({ key, name: input.name, version: input.version, ...(input.validationDate ? { validationDate: input.validationDate } : {}), ...(input.validityMonths ? { validityMonths: input.validityMonths } : {}), ...(input.dueDate ? { dueDate: input.dueDate } : {}), ...(fromAzure ? azureValuesOf(input as unknown as Loose) : {}), manual: [], sources: { [sourceId]: { inSource: true } }, addedAt: at, ...(by ? { addedBy: by } : {}) })
  }
  if (!added.length && !updated.length && !gone.length) return { file, added, updated, gone }
  return { file: { ...file, tools: sortTools(tools) }, added, updated, gone }
}
export const markMerged = (file: ToolValidationsFile, sourceId: string, at: string, by?: string): ToolValidationsFile => ({ ...file, sources: file.sources.map((source) => source.id === sourceId ? { ...source, mergedAt: at, ...(by ? { mergedBy: by } : {}) } : source) })
export const mergeSummary = (result: Pick<MergeResult, 'added' | 'updated' | 'gone'>) => `${result.added.length} new, ${result.updated.length} updated, ${result.gone.length} no longer in the source`

// ---- changes by hand (TVL-10) ----
export interface ToolEdit { name: string; version: string; validationDate: string; validityMonths: string; dueDate: string; notes: string }
// The problems of a form (empty: none). A new tool or a renamed one must not be the same tool as another entry.
export function editProblem(file: ToolValidationsFile, edit: ToolEdit, editing?: string): string {
  // TVL-30: a tool from Azure DevOps — only its notes are changed here.
  const locked = editing ? file.tools.find((entry) => entry.key === editing) : undefined
  const lock = azureLock(file, locked).edit
  if (lock && locked) return notesOnly(locked, edit) ? (edit.notes.length > 2000 ? 'Notes are at most 2000 characters.' : '') : lock
  if (!nameKey(edit.name) || edit.name.trim().length > 200) return 'Enter the tool name (1 to 200 characters with a letter or digit).'
  if (edit.version.trim().length > 60) return 'The version is at most 60 characters.'
  if (edit.validationDate && !isDay(edit.validationDate)) return 'The validation date is not a date.'
  if (edit.dueDate && !isDay(edit.dueDate)) return 'The due date is not a date.'
  if (edit.validityMonths.trim() && !monthsOf(edit.validityMonths.trim())) return `The validity period is a whole number of months from 1 to ${maxPeriodMonths}.`
  if (edit.notes.length > 2000) return 'Notes are at most 2000 characters.'
  const key = toolKey(edit.name, edit.version)
  const same = key !== editing ? file.tools.find((entry) => entry.key === key) : undefined
  // TVL-30: a tool added by hand is matched by name and version (TVL-03), so it never stands beside — or over — a tool of Azure DevOps.
  if (same) { const lock = azureLock(file, same).edit; return lock ? `This tool and version is already in the master list. ${lock}` : 'This tool and version is already in the master list.' }
  return ''
}
// A field changed by hand is kept from then on (a later merge does not replace it); emptied, it follows the sources again.
export function saveTool(file: ToolValidationsFile, edit: ToolEdit, at: string, by: string, editing?: string): ToolValidationsFile {
  const current = editing ? file.tools.find((entry) => entry.key === editing) : undefined
  // TVL-30: of a tool from Azure DevOps only the notes are changed here (any other field: the same file); nor is a new
  // tool added over one already listed (TVL-03).
  if (current && azureLock(file, current).edit) {
    if (!notesOnly(current, edit) || edit.notes.length > 2000) return file
    const notes = edit.notes.trim()
    if (notes === (current.notes ?? '')) return file
    const next: ToolEntry = { ...current, changedAt: at, changedBy: by }
    if (notes) next.notes = notes; else delete next.notes
    return { ...file, tools: file.tools.map((tool) => tool.key === current.key ? next : tool) }
  }
  if (!current && file.tools.some((entry) => entry.key === toolKey(edit.name, edit.version))) return file
  const name = edit.name.replace(/\s+/g, ' ').trim(), version = edit.version.trim()
  const values = { validationDate: edit.validationDate || undefined, validityMonths: monthsOf(edit.validityMonths.trim()), dueDate: edit.dueDate || undefined }
  const manual = new Set<ManualField>(current?.manual ?? [])
  const fields = ['validationDate', 'validityMonths', 'dueDate'] as const
  for (const field of fields) {
    if (!current) { if (values[field] !== undefined) manual.add(field); continue }
    if (values[field] === current[field]) continue
    if (values[field] === undefined) manual.delete(field); else manual.add(field)
  }
  const sourced = current && Object.keys(current.sources).length > 0
  if (current && sourced && name !== current.name) manual.add('name')
  const entry: ToolEntry = {
    key: toolKey(name, version), name, version,
    ...(values.validationDate ? { validationDate: values.validationDate } : {}), ...(values.validityMonths ? { validityMonths: values.validityMonths } : {}), ...(values.dueDate ? { dueDate: values.dueDate } : {}),
    ...(current ? azureValuesOf(current as unknown as Loose) : {}),
    manual: manualFields.filter((field) => manual.has(field)), ...(edit.notes.trim() ? { notes: edit.notes.trim() } : {}),
    sources: current?.sources ?? {}, addedAt: current?.addedAt ?? at, ...(current?.addedBy || !current ? { addedBy: current?.addedBy ?? by } : {}), ...(current ? { changedAt: at, changedBy: by } : {}),
  }
  return { ...file, tools: sortTools([...file.tools.filter((tool) => tool.key !== editing), entry]) }
}
// TVL-30: whether a form changes nothing but the notes of an entry (the name and version as matched, TVL-03).
export function notesOnly(entry: ToolEntry, edit: ToolEdit): boolean {
  const was = editOf(entry)
  return toolKey(edit.name, edit.version) === entry.key && edit.validationDate === was.validationDate && edit.dueDate === was.dueDate && (monthsOf(edit.validityMonths.trim()) ?? '') === (entry.validityMonths ?? '')
}
export const editOf = (entry?: ToolEntry): ToolEdit => ({ name: entry?.name ?? '', version: entry?.version ?? '', validationDate: entry?.validationDate ?? '', validityMonths: entry?.validityMonths ? String(entry.validityMonths) : '', dueDate: entry?.dueDate ?? '', notes: entry?.notes ?? '' })
// TVL-30: a tool Azure DevOps still returns is not removed (the same file comes back).
export const removeTool = (file: ToolValidationsFile, key: string): ToolValidationsFile => azureLock(file, file.tools.find((entry) => entry.key === key)).remove ? file : ({ ...file, tools: file.tools.filter((entry) => entry.key !== key) })
// ---- TVL-30: tools from Azure DevOps are changed there ----
// An entry linked to an Azure DevOps source (the Tool Validations query or another query) cannot be edited here — its
// dates, period and due date come from the work item; it can be removed only once no Azure DevOps source returns it any
// more ("not in it now" for each of them). Entries added by hand, or only from a Windchill export or a manual list, are
// unchanged. '' when allowed.
export const azureSourceLabel = (source: Pick<ToolSource, 'kind' | 'name'>) => source.kind === 'stream' ? 'Tool Validations query' : source.name
export function azureLock(file: Pick<ToolValidationsFile, 'sources'>, entry?: Pick<ToolEntry, 'sources'>): { edit: string; remove: string } {
  if (!entry) return { edit: '', remove: '' }
  const linked = Object.entries(entry.sources).flatMap(([id, link]) => { const source = file.sources.find((found) => found.id === id); return source && isAzureKind(source.kind) ? [{ source, link }] : [] })
  if (!linked.length) return { edit: '', remove: '' }
  const edit = `Comes from Azure DevOps (${linked.map(({ source }) => azureSourceLabel(source)).join(', ')}): change it there.`
  const holding = linked.filter(({ link }) => link.inSource).map(({ source }) => azureSourceLabel(source)).join(', ')
  return { edit, remove: holding ? `Comes from Azure DevOps (${holding}): change it there; it can be removed here once Azure DevOps no longer returns it.` : '' }
}
// A tool from a source keeps its name and version as the source gives them (they are how it is matched); a tool added
// by hand can be renamed.
export const nameLocked = (entry?: ToolEntry) => Boolean(entry && Object.keys(entry.sources).length > 0)

// ---- sources (TVL-07) ----
// TVL-32: the category is asked when the source is added and stored with it.
export function addSource(file: ToolValidationsFile, input: { kind: Exclude<ToolSourceKind, 'stream'>; name: string; ref: string; mapping: ToolMapping; category: SourceCategory }): ToolValidationsFile {
  const base = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || input.kind
  let id = base, n = 2
  while (file.sources.some((source) => source.id === id) || id === streamSourceId) id = `${base}-${n++}`
  return { ...file, sources: [...file.sources, { id, kind: input.kind, name: input.name.trim().slice(0, 80), category: input.category, ref: input.ref, mapping: input.mapping }] }
}
// TVL-32: why a source cannot be added ('' when it can) — the category must be chosen.
export const categoryProblem = (category: string) => sourceCategories.some((entry) => entry.key === category) ? '' : 'Choose the category: Tool List or Validation Documents.'
// TVL-32: a source's category changed (Edit mapping…). To Validation Documents: the source stops feeding the master list
// and the tools it fed are marked "not in source now" for it at once (mergeSource with nothing read; kept, never
// deleted); back to Tool List: they are linked again at its next merge. The Tool Validations query stays a Tool List.
export function setCategory(file: ToolValidationsFile, id: string, category: SourceCategory, at: string, by?: string): MergeResult {
  const source = file.sources.find((entry) => entry.id === id)
  if (!source || id === streamSourceId || categoryOf(source) === category) return { file, added: [], updated: [], gone: [] }
  const next = { ...file, sources: file.sources.map((entry) => entry.id === id ? { ...entry, category } : entry) }
  if (category === 'tools') return { file: next, added: [], updated: [], gone: [] }
  return mergeSource(next, id, [], at, by)
}
export const setMapping = (file: ToolValidationsFile, id: string, mapping: ToolMapping): ToolValidationsFile => ({ ...file, sources: file.sources.map((source) => source.id === id ? { ...source, mapping: { ...mapping, confirmed: true } } : source) })
// A removed source's links go with it; its tools stay (added by hand when no other source has them).
export function removeSource(file: ToolValidationsFile, id: string): ToolValidationsFile {
  if (id === streamSourceId) return file
  return { ...file, sources: file.sources.filter((source) => source.id !== id), tools: file.tools.map((entry) => { if (!entry.sources[id]) return entry; const sources = { ...entry.sources }; delete sources[id]; return { ...entry, sources } }) }
}
// ---- TVL-14: the tabs of the Tool Validations page ----
// Expiry list (opens first: the tiles and the expiry table), Master list (only the master list table), Tool List [TFS]
// (the Tools query's rows) and Validation Documents [TFS] (the Signed documents query's rows — only when Tool
// Validations reads two queries), then one tab per other source in the order added — a removed source's tab goes with
// it — and Setup last (the sources and the team settings). Tabs of a later kind (e.g. custom pages of the owners) go in
// `between`: after the source tabs, before Setup. There is no Releases table any more (TVL-14, v10.23).
export const toolTabExpiry = 'tool-expiry', toolTabMaster = 'tool-master', toolTabTools = 'tool-tfs-tools', toolTabDocuments = 'tool-tfs-documents', toolTabSetup = 'tool-setup'
export const toolListTabLabel = 'Tool List [TFS]', documentsTabLabel = 'Validation Documents [TFS]'
export const toolSourceTab = (id: string) => `tool-source:${id}`
export const customTabKey = (pageId: string) => `tool-tab:${pageId}`
export interface ToolTab { key: string; label: string; source?: ToolSource; custom?: CustomTab }
// TVL-15: the owners' tabs in their order — passed to toolTabs as `between`.
export const customToolTabs = (file: Pick<ToolValidationsFile, 'tabs'>): ToolTab[] => (file.tabs ?? []).map((tab) => ({ key: customTabKey(tab.pageId), label: tab.name, custom: tab }))
export const toolTabs = (file: Pick<ToolValidationsFile, 'sources'>, between: ToolTab[] = [], documents = true): ToolTab[] => [
  { key: toolTabExpiry, label: 'Expiry list' }, { key: toolTabMaster, label: 'Master list' }, { key: toolTabTools, label: toolListTabLabel },
  ...(documents ? [{ key: toolTabDocuments, label: documentsTabLabel }] : []),
  ...file.sources.filter((source) => source.id !== streamSourceId).map((source) => ({ key: toolSourceTab(source.id), label: source.name, source })),
  ...between,
  { key: toolTabSetup, label: 'Setup' },
]
// The tabs remembered before v10.13 (Releases "main", Source data "raw") and the Azure tab of v10.13…v10.22
// ("tool-azure") open Tool List [TFS]; every other kept key that still exists opens its tab ("tool-expiry" the Expiry
// list, "tool-master" the Master list, "tool-setup" Setup); a tab that no longer exists (a removed source, Validation
// Documents [TFS] with one query) or an unknown key opens the Expiry list.
const oldToolTabs: Record<string, string> = { main: toolTabTools, raw: toolTabTools, 'tool-azure': toolTabTools }
export function openToolTab(chosen: string, keys: string[]): string {
  const key = oldToolTabs[chosen] ?? chosen
  return keys.includes(key) ? key : toolTabExpiry
}
// ---- TVL-15, TVL-16: the owners' tabs — add, rename, reorder (← →), remove ----
const fixedTabNames = ['expiry list', 'master list', toolListTabLabel.toLowerCase(), documentsTabLabel.toLowerCase(), 'setup']
// Why a tab name cannot be used ('' when it can): 1 to 40 characters, not the name of another tab of the page.
export function tabNameProblem(file: Pick<ToolValidationsFile, 'tabs' | 'sources'>, name: string, except = '') {
  const clean = name.replace(/\s+/g, ' ').trim()
  if (!clean || clean.length > maxTabName) return `Enter a tab name of up to ${maxTabName} characters.`
  const lower = clean.toLowerCase()
  if (fixedTabNames.includes(lower) || file.sources.some((source) => source.id !== streamSourceId && source.name.toLowerCase() === lower) || file.tabs.some((tab) => tab.pageId !== except && tab.name.toLowerCase() === lower)) return `The page already has a tab named “${clean}”.`
  return ''
}
export const addTabReason = (file: Pick<ToolValidationsFile, 'tabs'>) => file.tabs.length >= maxCustomTabs ? `At most ${maxCustomTabs} tabs: remove one first.` : ''
export const addTab = (file: ToolValidationsFile, tab: CustomTab): ToolValidationsFile => ({ ...file, tabs: [...file.tabs.filter((entry) => entry.pageId !== tab.pageId), { pageId: tab.pageId, name: tab.name.replace(/\s+/g, ' ').trim(), kind: tab.kind }] })
export const renameTab = (file: ToolValidationsFile, pageId: string, name: string): ToolValidationsFile => ({ ...file, tabs: file.tabs.map((tab) => tab.pageId === pageId ? { ...tab, name: name.replace(/\s+/g, ' ').trim() } : tab) })
export function moveTab(file: ToolValidationsFile, pageId: string, by: -1 | 1): ToolValidationsFile {
  const from = file.tabs.findIndex((tab) => tab.pageId === pageId), to = from + by
  if (from < 0 || to < 0 || to >= file.tabs.length) return file
  const tabs = [...file.tabs]; const [moved] = tabs.splice(from, 1); tabs.splice(to, 0, moved)
  return { ...file, tabs }
}
export const removeTab = (file: ToolValidationsFile, pageId: string): ToolValidationsFile => ({ ...file, tabs: file.tabs.filter((tab) => tab.pageId !== pageId) })

// ---- TVL-24: an existing hidden page made a tab again ----
// The On-Demand pages (Table, Table + Insights, On-Demand Dashboard) that are hidden from the menu and not a tab yet — a
// page left behind when its tab was removed with "Kept in Git, hidden", or when an app version before the tabs dropped
// them from tool-validations.json (LIM-70). The sample pages are never offered. By name.
export interface PageChoice { id: string; name: string; kind: PageKind; rows: number }
export function hiddenPageChoices(pages: { id: string; name: string; rows: unknown[]; sample?: boolean }[], layout: MenuLayout, file: Pick<ToolValidationsFile, 'tabs'>): PageChoice[] {
  return pages.filter((page) => !page.sample && isHidden(layout, page.id) && !file.tabs.some((tab) => tab.pageId === page.id))
    .map((page) => ({ id: page.id, name: page.name, kind: kindOf(layout, page.id), rows: page.rows.length }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
}

// ---- TVL-25: the list's co-owners written as co-owners of each tab's page (menu-layout.json, PGB-08) ----
// Each tab's page gets the list's co-owners as its co-owners, merged with those added to the page by hand (never
// removed); the owners this sync wrote are remembered in the page's ownersFromList, so that only those are removed when
// they leave the list (withListOwners). A tab whose page has no place in the menu layout (deleted) is skipped.
export function tabOwnersLayout(layout: MenuLayout, file: Pick<ToolValidationsFile, 'tabs' | 'owners'>, only?: string[]): MenuLayout {
  return file.tabs.filter((tab) => !only || only.includes(tab.pageId)).reduce((next, tab) => withListOwners(next, tab.pageId, file.owners), layout)
}
// The tabs whose page does not hold the list's co-owners as this sync would write them (none: []).
export function tabOwnersBehind(layout: MenuLayout, file: Pick<ToolValidationsFile, 'tabs' | 'owners'>): CustomTab[] {
  return file.tabs.filter((tab) => { const page = layout.pages[tab.pageId]; if (!page) return false; const next = withListOwners(layout, tab.pageId, file.owners).pages[tab.pageId]; return JSON.stringify(next.owners) !== JSON.stringify(page.owners) || JSON.stringify(next.ownersFromList ?? []) !== JSON.stringify(page.ownersFromList ?? []) })
}
// The page's co-owners as the Tabs panel shows them: from the list, and added by hand.
export function tabOwnerCounts(layout: MenuLayout, pageId: string) {
  const page = layout.pages[pageId]
  const fromList = page?.ownersFromList ?? []
  return { fromList: fromList.length, byHand: (page?.owners ?? []).filter((email) => !fromList.includes(email)).length }
}

export const setTeam = (file: ToolValidationsFile, days: number, owners: string[]): ToolValidationsFile => ({ ...file, defaultDays: cleanDays(days) ?? file.defaultDays, owners: ownersOf(owners) })
export const sourceProblem = (file: ToolValidationsFile, kindKey: ToolSourceKind, ref: string, name: string) => !name.trim() || name.trim().length > 80 ? 'Enter a name of up to 80 characters.' : !ref ? 'Choose what to read.' : file.sources.length >= maxSources ? `At most ${maxSources} sources.` : file.sources.some((source) => source.kind === kindKey && source.ref === ref) ? 'This one is already a source.' : ''

// ---- rights (TVL-11) ----
// The Tool Owner ("Manage pages and menu groups", as for the pages of the page builder) and the list's co-owners edit
// it; everyone else reads. Fail closed: nothing without the roles file (CON-101).
export const readOnlyListReason = 'Read only: the access roles are not loaded yet, so the master list cannot be changed.'
export function listReason(viewer: Pick<Viewer, 'email' | 'readOnly' | 'manager'>, file: Pick<ToolValidationsFile, 'owners'>) {
  if (viewer.readOnly) return readOnlyListReason
  if (viewer.manager || (viewer.email && file.owners.includes(normalEmail(viewer.email)))) return ''
  return 'Only a Tool Owner (“Manage pages and menu groups”) or a co-owner of the Tool Validations list can change it. A Tool Owner names the co-owners in Team settings.'
}
export const ownersReason = (viewer: Pick<Viewer, 'readOnly' | 'manager'>) => viewer.readOnly ? readOnlyListReason : viewer.manager ? '' : 'Only a Tool Owner (“Manage pages and menu groups”) can name the co-owners of the Tool Validations list.'

// ---- merging two saves (GIT-17) ----
// Tools by tool (name + version), sources by id, tabs by page id (TVL-16); an entry both saves changed takes the later save's. The co-owners are
// merged as sets (an email either save added stays, one either removed goes); the team default and the highlight bands
// (TVL-27) each as one value (both saves changed it: the later save's).
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const parse = (input: string | null) => { if (!input) return null; try { return record(JSON.parse(input)) } catch { return null } }
const keyedTools = (value: unknown) => Object.fromEntries(list(value).flatMap((tool) => { const raw = record(tool); return raw && typeof raw.name === 'string' ? [[toolKey(raw.name, typeof raw.version === 'string' ? raw.version : ''), raw]] : [] }))
const keyedSources = (value: unknown) => Object.fromEntries(list(value).flatMap((source) => { const raw = record(source); return raw && typeof raw.id === 'string' ? [[raw.id, raw]] : [] }))
const emails = (value: unknown) => list(value).filter((entry): entry is string => typeof entry === 'string')
const keyedTabs = (value: unknown) => Object.fromEntries(list(value).flatMap((tab) => { const raw = record(tab); return raw && typeof raw.pageId === 'string' ? [[raw.pageId, raw]] : [] }))
const tabIds = (value: unknown) => list(value).flatMap((tab) => { const raw = record(tab); return raw && typeof raw.pageId === 'string' ? [raw.pageId] : [] })
// TVL-16: the tabs by page id (a name both saves changed: the later save's); their order is the order of the save that
// changed it (both: the later save's), a tab missing from that order after the others.
function mergeTabs(base: Record<string, unknown> | null, mine: Record<string, unknown>, theirs: Record<string, unknown>, mineLater: boolean) {
  const entries = mergeKeyed(base ? keyedTabs(base.tabs) : null, keyedTabs(mine.tabs), keyedTabs(theirs.tabs), mineLater)
  const order = merge3(base ? tabIds(base.tabs) : undefined, tabIds(mine.tabs), tabIds(theirs.tabs), mineLater) ?? tabIds(mine.tabs)
  const rank = (id: string) => { const at = order.indexOf(id); return at < 0 ? order.length : at }
  return Object.keys(entries).map((id, index) => ({ id, index })).sort((a, b) => rank(a.id) - rank(b.id) || a.index - b.index).map(({ id }) => entries[id])
}
export const mergeToolValidationsText: Merge = (baseText, mineText, theirsText, mineLater) => {
  const base = parse(baseText), mine = parse(mineText), theirs = parse(theirsText)
  if (!mine || !theirs || theirs.kind !== kind) return mineText
  const tools = Object.values(mergeKeyed(base ? keyedTools(base.tools) : null, keyedTools(mine.tools), keyedTools(theirs.tools), mineLater))
  const sources = Object.values(mergeKeyed(base ? keyedSources(base.sources) : null, keyedSources(mine.sources), keyedSources(theirs.sources), mineLater))
  const baseOwners = emails(base?.owners), mineOwners = emails(mine.owners), theirOwners = emails(theirs.owners)
  const owners = [...new Set([...theirOwners.filter((email) => mineOwners.includes(email) || !baseOwners.includes(email)), ...mineOwners.filter((email) => !baseOwners.includes(email))])]
  const defaultDays = merge3(base?.defaultDays, mine.defaultDays, theirs.defaultDays, mineLater) ?? mine.defaultDays
  const tabs = mergeTabs(base, mine, theirs, mineLater)
  const highlights = merge3(base?.highlights, mine.highlights, theirs.highlights, mineLater)
  // Written through the parser, so the merged file is as valid as the ones it came from.
  const merged = JSON.stringify({ schema: 1, kind, defaultDays, owners, sources, tools, tabs, ...(highlights !== undefined ? { highlights } : {}) })
  try { return serializeToolValidations(parseToolValidations(merged).file) } catch { return mineText }
}
