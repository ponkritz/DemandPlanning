import type { AzureWorkItem } from './domain'
import { fieldOf } from './dpReleases.ts'
import { dpFeatureTitle, dpProgramOf, dpVersionOf, type BoardHit } from './dpBoardMatch.ts'
import { dpReleaseName } from './dpMilestones.ts'
import { releaseTypesOf, type EpicSetup, type QeMapColumns, type ReleaseTypeSetup } from './featureSetup.ts'
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
export interface BulkLine { row: AzureWorkItem; title: string; version: string; type?: DpReleaseType; set?: ReleaseTypeSetup; qe: string; email: string; skip: string; note: string }
export function bulkPlan(rows: AzureWorkItem[], options: { setup?: EpicSetup; qeMapping?: QeMappingFile | null; board: AzureWorkItem[]; featureMatch: (row: AzureWorkItem) => BoardHit | undefined }): BulkLine[] {
  const sets = releaseTypesOf(options.setup)
  return rows.map((row) => {
    const version = dpRowVersion(row), typed = dpReleaseType(version), found = qeFor(row, options.qeMapping, options.setup?.qeColumns)
    const qe = found?.qe ?? '', email = qe ? emailFor(qe, options.board) : ''
    const hit = options.featureMatch(row)
    const skip = fullMatch(hit) ? `Feature #${hit!.item.id} on QMS-0025 matches it 100%`
      : !typed ? `no release type from the version “${version || '—'}” (x.y.z.a expected)`
      : !options.setup?.qeColumns ? 'the QE Mapping columns are not set (Feature setup → Epic 13946)'
      : !qe ? 'no QE in the QE Mapping for this product'
      : !email ? `no email found for ${qe} (not assigned anything on QMS-0025 yet)` : ''
    return { row, title: dpFeatureTitle(row), version, ...(typed ? { type: typed.type, set: sets[typed.kind] } : {}), qe, email, skip, note: skip ? '' : similarNote(hit) }
  })
}
