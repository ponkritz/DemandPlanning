import type { AzureWorkItem } from './domain'
import type { ReleaseEntry } from './releaseSource.ts'
import { fieldOf } from './dpReleases.ts'
import { dpFeatureTitle, dpProgramOf, dpVersionOf, type BoardHit } from './dpBoardMatch.ts'
import { dpReleaseName } from './dpMilestones.ts'
import { bulkSetFor, type EpicSetup, type QeMapColumns, type ReleaseTypeSetup } from './featureSetup.ts'
import { classificationFromType } from './epicSetup.ts'
import type { QeMappingFile } from './qeMapping.ts'

// DP releases (Release Details → DP, Epic 13946): the release type from the version, the QE from the QE Mapping, the
// possible QEs from the earlier releases of the same product, and the plan for creating their Features in bulk.

// DPF-01: x.y.z.a — X.0.0.0 Major, x.y.0.0 Minor (both a Release), x.y.z.0 MLD and x.y.z.a Platform Update (both a PU).
// Missing parts count as 0 ("4.2" is 4.2.0.0); a leading "v" is ignored; anything else has no type.
export type DpReleaseType = 'Major' | 'Minor' | 'MLD' | 'Platform Update'
export function dpReleaseType(version: string): { type: DpReleaseType; kind: 'release' | 'pu' } | null {
  const text = version.trim().replace(/^v/i, '')
  if (!/^\d+(\.\d+){0,3}$/.test(text)) return null
  const [, y = 0, z = 0, a = 0] = text.split('.').map(Number)
  const type: DpReleaseType = a ? 'Platform Update' : z ? 'MLD' : y ? 'Minor' : 'Major'
  return { type, kind: type === 'Major' || type === 'Minor' ? 'release' : 'pu' }
}
export const dpTypeLabel = (type: DpReleaseType) => type === 'Platform Update' ? 'PU' : type
export const dpRowVersion = (row: AzureWorkItem) => fieldOf(row, 'Release')?.trim() || dpVersionOf(row)

// DPF-02: the QE of a release — the QE Mapping row whose product column (chosen in the DP setup) names the release's
// product: its PsName, else its Program (SourceProgram). Exact (ignoring case, spaces and punctuation) first, else a row
// whose value holds the product name as whole words or the other way round; the first sheet with both columns.
const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const holds = (whole: string, part: string) => Boolean(part) && ` ${whole} `.includes(` ${part} `)
export function qeColumnsOf(file: QeMappingFile | null | undefined, columns: QeMapColumns | undefined) {
  if (!file || !columns) return null
  for (const sheet of file.sheets) {
    const find = (name: string) => sheet.columns.find((column) => norm(column.name) === norm(name))
    const match = find(columns.matchColumn), qe = find(columns.qeColumn)
    if (match && qe) return { sheet, match, qe }
  }
  return null
}
export function qeFor(row: AzureWorkItem, file: QeMappingFile | null | undefined, columns: QeMapColumns | undefined): { qe: string; product: string } | null {
  const found = qeColumnsOf(file, columns)
  if (!found) return null
  const products = [fieldOf(row, 'PsName')?.trim() ?? '', dpProgramOf(row)].filter(Boolean)
  const rows = found.sheet.rows.map((entry) => ({ product: (entry.cells[found.match.id] ?? '').trim(), qe: (entry.cells[found.qe.id] ?? '').trim() })).filter((entry) => entry.product && entry.qe)
  for (const product of products) {
    const wanted = norm(product)
    const hit = rows.find((entry) => norm(entry.product) === wanted) ?? rows.find((entry) => holds(norm(entry.product), wanted) || holds(wanted, norm(entry.product)))
    if (hit) return hit
  }
  return null
}

// QV-59: the QE of a release named by its product name only (IOCC): the same rule as qeFor on that name.
export function qeForName(name: string, file: QeMappingFile | null | undefined, columns: QeMapColumns | undefined): { qe: string; product: string } | null {
  const found = qeColumnsOf(file, columns)
  const wanted = norm(name)
  if (!found || !wanted) return null
  const rows = found.sheet.rows.map((entry) => ({ product: (entry.cells[found.match.id] ?? '').trim(), qe: (entry.cells[found.qe.id] ?? '').trim() })).filter((entry) => entry.product && entry.qe)
  return rows.find((entry) => norm(entry.product) === wanted) ?? rows.find((entry) => holds(norm(entry.product), wanted) || holds(wanted, norm(entry.product))) ?? null
}
// QV-59: IOCC releases in bulk, by the DP rules: the release type from the release number (x.y.z.a), its set (Release or
// PU) from the bulk Epic's Feature setup, the QE from the QE Mapping by the release name, a 100% match skipped.
export interface IoccLine { release: ReleaseEntry; title: string; type?: DpReleaseType; classification: string; set?: ReleaseTypeSetup; qe: string; email: string; skip: string; baseSkip: string; note: string }
// DPF-08: classes — the Release Classification picked per row (by release key); classValues — the Epic's list, from
// which the release number's type is prefilled. The set follows the classification (DPF-07).
export function ioccPlan(releases: ReleaseEntry[], options: { setup?: EpicSetup; qeMapping?: QeMappingFile | null; board: AzureWorkItem[]; featureTitle: (release: ReleaseEntry) => string; featureMatch: (release: ReleaseEntry) => BoardHit | undefined; epicId?: number; classes?: Record<string, string>; classValues?: string[] }): IoccLine[] {
  return releases.map((release) => {
    const typed = dpReleaseType(release.release), classification = options.classes?.[release.key] ?? classificationFromType(options.classValues ?? [], typed?.type), found = qeForName(release.name, options.qeMapping, options.setup?.qeColumns)
    const qe = found?.qe ?? '', email = qe ? emailFor(qe, options.board) : ''
    const hit = options.featureMatch(release)
    const baseSkip = !options.epicId ? 'no IOCC bulk Epic is set (Admin → Stream options → Bulk creation Epics)'
      : fullMatch(hit) ? `Feature #${hit!.item.id} on QMS-0025 matches it 100%`
      : !options.setup ? 'the IOCC bulk Epic has no Feature setup (Admin → Epic & Feature setup)' : ''
    const qeSkip = !options.setup?.qeColumns ? 'the QE Mapping columns are not set (Feature setup of the IOCC bulk Epic)'
      : !qe ? 'no QE in the QE Mapping for this release name'
      : !email ? `no email found for ${qe} (not assigned anything on QMS-0025 yet)` : ''
    const skip = baseSkip || qeSkip
    const set = bulkSetFor(options.setup, classification)
    return { release, title: options.featureTitle(release), classification, ...(typed ? { type: typed.type } : {}), ...(set ? { set } : {}), qe, email, skip, baseSkip, note: baseSkip ? '' : similarNote(hit) }
  })
}

// DPF-03: the possible QEs of a release — the people assigned to the earlier releases of the same product (same PsName)
// in the DP data, newest release first, without the mapped QE and without the release's own Assigned To; at most 5.
const versionParts = (version: string) => version.replace(/^v/i, '').split('.').map((part) => Number(part) || 0)
const compareVersions = (a: string, b: string) => { const x = versionParts(a), y = versionParts(b); for (let at = 0; at < Math.max(x.length, y.length); at++) { const d = (x[at] ?? 0) - (y[at] ?? 0); if (d) return d } return 0 }
const personName = (value: string) => value.replace(/\s*<[^>]*>\s*$/, '').trim()
export function possibleQes(row: AzureWorkItem, rows: AzureWorkItem[], qe = ''): string[] {
  const product = norm(dpReleaseName(row).name), own = norm(personName(row.assignedTo ?? '')), mapped = norm(qe)
  if (!product) return []
  const earlier = rows.filter((other) => other.id !== row.id && norm(dpReleaseName(other).name) === product && compareVersions(dpRowVersion(other), dpRowVersion(row)) < 0)
    .sort((a, b) => compareVersions(dpRowVersion(b), dpRowVersion(a)))
  const names: string[] = []
  for (const other of earlier) {
    const name = personName(other.assignedTo ?? '')
    const key = norm(name)
    if (!key || key === 'unassigned' || key === own || key === mapped || names.some((entry) => norm(entry) === key)) continue
    names.push(name)
    if (names.length === 5) break
  }
  return names
}

// The email of a person named in the QE Mapping: the name itself when it is an email, else the email Azure DevOps shows
// for that name on the QMS-0025 board (Assigned To of any work item), matched ignoring case.
export function emailFor(name: string, board: AzureWorkItem[]): string {
  const value = name.trim()
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return value.toLowerCase()
  const wanted = norm(personName(value))
  return board.find((item) => item.assignedToEmail && norm(personName(item.assignedTo ?? '')) === wanted)?.assignedToEmail ?? ''
}

// DPF-04: what Create Features does for each selected release — or why it is skipped.
// BLK-01: a release whose QMS-0025 Feature matches 100% cannot be selected (and is skipped if it is); a closer-than-the-
// threshold but not exact Feature is named as a note, and the release is still created.
export const fullMatch = (hit: BoardHit | undefined) => Boolean(hit && hit.score >= 100)
export const similarNote = (hit: BoardHit | undefined) => hit && hit.score < 100 ? `a similar Feature #${hit.item.id} (${hit.score}%) exists` : ''
export interface BulkLine { row: AzureWorkItem; title: string; version: string; type?: DpReleaseType; classification: string; set?: ReleaseTypeSetup; qe: string; email: string; skip: string; baseSkip: string; note: string }
export function bulkPlan(rows: AzureWorkItem[], options: { setup?: EpicSetup; qeMapping?: QeMappingFile | null; board: AzureWorkItem[]; featureMatch: (row: AzureWorkItem) => BoardHit | undefined; classes?: Record<string, string>; classValues?: string[] }): BulkLine[] {
  return rows.map((row) => {
    const version = dpRowVersion(row), typed = dpReleaseType(version), classification = options.classes?.[String(row.id)] ?? classificationFromType(options.classValues ?? [], typed?.type), found = qeFor(row, options.qeMapping, options.setup?.qeColumns)
    const qe = found?.qe ?? '', email = qe ? emailFor(qe, options.board) : ''
    const hit = options.featureMatch(row)
    const baseSkip = fullMatch(hit) ? `Feature #${hit!.item.id} on QMS-0025 matches it 100%`
      : !options.setup ? 'the DP bulk Epic has no Feature setup (Admin → Epic & Feature setup)' : ''
    const qeSkip = !options.setup?.qeColumns ? 'the QE Mapping columns are not set (Feature setup of the bulk Epic)'
      : !qe ? 'no QE in the QE Mapping for this product'
      : !email ? `no email found for ${qe} (not assigned anything on QMS-0025 yet)` : ''
    const skip = baseSkip || qeSkip
    const set = bulkSetFor(options.setup, classification)
    return { row, title: dpFeatureTitle(row), version, classification, ...(typed ? { type: typed.type } : {}), ...(set ? { set } : {}), qe, email, skip, baseSkip, note: baseSkip ? '' : similarNote(hit) }
  })
}

// DPF-06: the QE chosen in the pop-up for a release (its email), in place of the QE Mapping's: the release is then
// created for that person, even when the QE Mapping had none for it; a reason other than the QE still skips it.
export function pickQe<L extends { qe: string; email: string; skip: string; baseSkip: string }>(plan: L[], picks: Record<string, string>, keyOf: (line: L) => string, people: { name: string; email: string }[]): (L & { picked: boolean })[] {
  return plan.map((line) => {
    const email = picks[keyOf(line)]?.trim().toLowerCase()
    if (!email || email === line.email) return { ...line, picked: false }
    const name = people.find((person) => person.email === email)?.name ?? email
    return { ...line, qe: name, email, skip: line.baseSkip, picked: true }
  })
}
