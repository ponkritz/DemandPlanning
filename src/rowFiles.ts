import { capLog, maxSeq, onDemandPath, parseOnDemandPage, rowId, rowKeyPattern, serializeOnDemandPage, withRowKeys, withRowNumbers, type OnDemandPage, type OnDemandRow } from './onDemand.ts'
import { parseStem, stemFilePath, stemFolderPath } from './pageFiles.ts'

// OND-31…OND-34 Row files: a table page kept as one file per row, so that two people adding or editing rows at the same
// time write different files (no merge of the whole page, no 900 KB limit of the single file):
//   on-demand/<id>/page.json        the page without its rows (name, description, keyPrefix, columns, insights, colors)
//   on-demand/<id>/rows/<key>.json  one row (id, key, seq, addedBy, addedAt, log, cells), named by its key (OND-18)
//   on-demand/<id>/counter.json     the next readable ID (OND-19), taken with a version-checked update
//   on-demand/<id>.json             after the conversion only a marker {moved}, which an older app reports as not a page
// A page is "row files" when its folder holds page.json; the single file of OND-08 stays readable.
// OND-120: the folder is named by the page's stem (pageFiles.ts) — "<name>--<id>", or the id alone (the form before);
// the paths below take the stem (an id is the stem of the old form).

export const pageFolder = (stem: string) => stemFolderPath(stem)
export const pageJsonPath = (stem: string) => `${pageFolder(stem)}/page.json`
export const counterPath = (stem: string) => `${pageFolder(stem)}/counter.json`
export const rowsFolder = (stem: string) => `${pageFolder(stem)}/rows`
// SM-106: a row key becomes a file name only when it is a key of OND-18 (capital letters, digits and two hyphens):
// no slash, no dot, no "..", so a key read from a file or typed nowhere can never point outside the page's folder.
export function rowFilePath(stem: string, key: string) {
  if (!rowKeyPattern.test(key)) throw new Error(`Not a valid row key: ${JSON.stringify(key).slice(0, 40)}`)
  return `${rowsFolder(stem)}/${key}.json`
}
// The key of a row file's name (rows/<key>.json), null for anything else (an unknown file in the folder is ignored).
export const keyOfRowFile = (name: string) => { const match = /^([A-Z0-9-]{1,30})\.json$/.exec(name); return match && rowKeyPattern.test(match[1]) ? match[1] : null }
// The queue of a row-file page's saves in this browser (GIT-17): one per page, so a page's saves run one after another.
export const rowPageQueue = (id: string) => `${pageFolder(id)}/`

// ---- the files ----
// LST-09: refs — the keys of the row's built-in list values (written only when the row has any).
const rowOut = ({ id, key, seq, addedBy, addedAt, log, hidden, refs, cells }: OnDemandRow) => ({ schema: 1, kind: 'on-demand-row', id, ...(key ? { key } : {}), ...(seq ? { seq } : {}), ...(addedBy ? { addedBy } : {}), ...(addedAt ? { addedAt } : {}), ...(log?.length ? { log: log.map(({ id: entry, at, by, added, action, comment, changes }) => ({ id: entry, at, by, ...(added ? { added } : {}), ...(action ? { action } : {}), ...(comment ? { comment } : {}), changes })) } : {}), ...(hidden ? { hidden } : {}), ...(refs && Object.keys(refs).length ? { refs } : {}), cells })
export const serializeRow = (row: OnDemandRow) => `${JSON.stringify(rowOut(row), null, 1)}\n`
// page.json: the page file of OND-08 without rows, marked storage 'rows' (the parser and the merge of OND-09 read it).
export const serializeHead = (page: OnDemandPage) => serializeOnDemandPage({ ...page, rows: [], storage: 'rows' }, { fill: false })
export interface Counter { next: number }
export const serializeCounter = (next: number) => `${JSON.stringify({ schema: 1, kind: 'on-demand-counter', next })}\n`
export function parseCounter(text: string | null): number | null {
  if (!text) return null
  try { const next = (JSON.parse(text) as { next?: unknown }).next; return typeof next === 'number' && Number.isInteger(next) && next >= 1 && next <= maxSeq + 1 ? next : null } catch { return null }
}
// The marker left in on-demand/<id>.json: valid JSON that is not an On-Demand page, so an older app lists the page with
// "is not an On-Demand page" and never parses or merges it (its rows stay in the folder, untouched).
export const movedMarker = (id: string) => `${JSON.stringify({ schema: 1, kind: 'on-demand-moved', id, moved: `${pageFolder(id)}/`, note: 'This page is kept as one file per row by a newer build. Update the app to open it.' }, null, 1)}\n`
export const isMovedMarker = (text: string | null) => { if (!text) return false; try { return (JSON.parse(text) as { kind?: unknown }).kind === 'on-demand-moved' } catch { return false } }

// A row file read as a row of the page file (validated with the page by parseOnDemandPage); null when it is not one.
function rowObject(text: string): Record<string, unknown> | null {
  try { const value = JSON.parse(text) as unknown; return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null } catch { return null }
}
// The page from its files: page.json and the row files (name → text). The name gives the key (it wins over the key in
// the file, as the page file's name wins over its id); rows in ID order (then by key). Every rule of OND-08…OND-26
// applies (parseOnDemandPage): values of unknown columns dropped, a number used twice dropped from the second row, sizes capped.
export function assembleRowPage(id: string, headText: string, rows: { name: string; text: string }[]): OnDemandPage {
  const head = rowObject(headText)
  if (!head) throw new Error(`${pageJsonPath(id)} is not valid JSON.`)
  const list = rows.flatMap(({ name, text }) => { const key = keyOfRowFile(name), row = key ? rowObject(text) : null; return key && row ? [{ ...row, key }] : [] })
  const seqOf = (row: Record<string, unknown>) => typeof row.seq === 'number' ? row.seq : Number.MAX_SAFE_INTEGER
  list.sort((a, b) => seqOf(a) - seqOf(b) || String(a.key).localeCompare(String(b.key)))
  return { ...parseOnDemandPage(JSON.stringify({ ...head, rows: list }), id), storage: 'rows' }
}
// OND-32: the files of a page converted from its single file — every row with its key and ID (a row from before keys or
// IDs gets them now, as its next save would), the counter at the highest ID + 1, and the marker in place of the file.
// OND-125: a page in a named file (stem "<name>--<id>") becomes the folder of the same stem; its named file is deleted
// and the marker goes to the old-form path on-demand/<id>.json, where an older app looks.
export function convertedFiles(page: OnDemandPage, stem: string = page.id): { page: OnDemandPage; files: Record<string, string | null> } {
  const full: OnDemandPage = { ...withRowNumbers(withRowKeys(page)), storage: 'rows' }
  const files: Record<string, string | null> = { [pageJsonPath(stem)]: serializeHead(full), [counterPath(stem)]: serializeCounter(full.rows.reduce((max, row) => Math.max(max, row.seq ?? 0), 0) + 1), [onDemandPath(page.id)]: movedMarker(page.id) }
  if (parseStem(stem)?.named) files[stemFilePath(stem)] = null
  for (const row of full.rows) files[rowFilePath(stem, row.key!)] = serializeRow(row)
  return { page: full, files }
}

// ---- a change of the page as files (OND-33) ----
export const headOf = (page: OnDemandPage) => ({ name: page.name, description: page.description, keyPrefix: page.keyPrefix, columns: page.columns, insights: page.insights, colors: page.colors ?? null })
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export interface PageDiff { head: boolean; added: OnDemandRow[]; updated: OnDemandRow[]; removed: OnDemandRow[] }
export function diffPages(before: OnDemandPage, after: OnDemandPage): PageDiff {
  const old = new Map(before.rows.map((row) => [row.id, row])), now = new Set(after.rows.map((row) => row.id))
  return {
    head: !same(headOf(before), headOf(after)),
    added: after.rows.filter((row) => !old.has(row.id)),
    updated: after.rows.filter((row) => old.has(row.id) && !same(old.get(row.id), row)),
    removed: before.rows.filter((row) => !now.has(row.id)),
  }
}
// The commit message of one row's save, with the ID it was given: "CoNQ: add row CONQ-0013 (CONQ-261123-K7Q2)".
export const rowMessage = (page: Pick<OnDemandPage, 'name' | 'keyPrefix'>, row: OnDemandRow, action: 'add' | 'update' | 'remove') => {
  const id = rowId(page, row)
  return `${page.name}: ${action} row ${action === 'add' ? [id, row.key].filter(Boolean).join(' (') + (id && row.key ? ')' : '') : id || row.key || row.id}`
}

// ---- merging two saves of one row (OND-34, GIT-17) ----
// Field by field: a value only one save changed takes that change; a value both changed takes the later save's (also a
// value one cleared). The log is the union of both logs by entry id (the last 100); the key, ID, who added it and when
// are taken from the row in Git. Without a base (the row never read here), every field of the later save wins.
export function mergeRowText(baseText: string | null, mineText: string, theirsText: string, mineLater: boolean): string {
  const base = baseText ? rowObject(baseText) : null, mine = rowObject(mineText), theirs = rowObject(theirsText)
  if (!mine || !theirs) return mineText
  const cellsOf = (row: Record<string, unknown> | null) => (row?.cells && typeof row.cells === 'object' && !Array.isArray(row.cells) ? row.cells : {}) as Record<string, unknown>
  const b = cellsOf(base), m = cellsOf(mine), t = cellsOf(theirs)
  const cells: Record<string, unknown> = {}
  // LST-09: a value's keys go with the value — taken from the save whose value is kept.
  const refsOf = (row: Record<string, unknown> | null) => (row?.refs && typeof row.refs === 'object' && !Array.isArray(row.refs) ? row.refs : {}) as Record<string, unknown>
  const mr = refsOf(mine), tr = refsOf(theirs), refs: Record<string, unknown> = {}
  for (const column of new Set([...Object.keys(t), ...Object.keys(m), ...Object.keys(b)])) {
    const value = !base ? (mineLater ? m[column] : t[column]) ?? (mineLater ? t[column] : m[column]) : same(m[column], b[column]) ? t[column] : same(t[column], b[column]) ? m[column] : mineLater ? m[column] : t[column]
    if (value !== undefined) cells[column] = value
    const keys = same(value, m[column]) && mr[column] !== undefined ? mr[column] : same(value, t[column]) ? tr[column] : undefined
    if (value !== undefined && keys !== undefined) refs[column] = keys
  }
  const logs = [...(Array.isArray(theirs.log) ? theirs.log : []), ...(Array.isArray(mine.log) ? mine.log : [])] as { id: string; at: string }[]
  const log = capLog(logs.filter((entry, index) => entry && typeof entry.id === 'string' && logs.findIndex((other) => other?.id === entry.id) === index) as never)
  const pick = (field: string) => theirs[field] ?? mine[field]
  // OND-39: hidden is one more field (who hid it and when), merged as the values are.
  const hidden = !base ? (mineLater ? mine.hidden : theirs.hidden) : same(mine.hidden, base.hidden) ? theirs.hidden : same(theirs.hidden, base.hidden) ? mine.hidden : mineLater ? mine.hidden : theirs.hidden
  const row = { id: pick('id'), key: mine.key ?? theirs.key, seq: pick('seq'), addedBy: pick('addedBy'), addedAt: pick('addedAt'), log, ...(hidden ? { hidden } : {}), ...(Object.keys(refs).length ? { refs } : {}), cells } as unknown as OnDemandRow
  return serializeRow(row)
}
