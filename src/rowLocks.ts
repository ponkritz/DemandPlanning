import { pageIdPattern, rowKeyPattern, valuesOf, cellText, type OnDemandColumn, type OnDemandValue } from './onDemand.ts'

// OND-35…OND-39 Row locks: a person who clicks Edit on a row of a row-file page (OND-31) takes the row's lock, a small
// file locks/<page-id>/<row-key>.json { by, name, at, expires } on the branch `locks` of the data repository (created from
// the data branch when missing; where the repository refuses the branch, in the folder locks/ of the data branch). Others
// see who is editing and cannot edit that row; viewing, the other rows, adding rows, Insights and dashboards never wait
// for a lock. The lock is renewed while the person is active and released on Save, Cancel and close; after the
// inactivity timeout (15 minutes unless an Admin or the Tool Owner set another, row-locks.json) the edit is closed, its
// unsaved values kept as a draft in this browser for one day, and the lock released. An expired lock may be taken over.

export const lockBranch = 'locks'
export const lockFolder = 'locks'
export interface RowLock { by: string; name: string; at: string; expires: string; session: string }
export const lockPath = (pageId: string, key: string) => {
  if (!pageIdPattern.test(pageId) || !rowKeyPattern.test(key)) throw new Error('Not a valid page id or row key for a lock.')
  return `${lockFolder}/${pageId}/${key}.json`
}
export const lockFolderOf = (pageId: string) => { if (!pageIdPattern.test(pageId)) throw new Error('Not a valid page id.'); return `${lockFolder}/${pageId}` }
const iso = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : ''
const short = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
// A lock file: anything that is not one (bad JSON, no time) reads as no lock — so a broken file never blocks a row
// for ever (it is replaced by the next Edit, as an expired lock is).
export function parseLock(text: string | null): RowLock | null {
  if (!text) return null
  try {
    const raw = JSON.parse(text) as Record<string, unknown>
    const at = iso(raw.at), expires = iso(raw.expires), by = short(raw.by, 200)
    return at && expires && by ? { by, name: short(raw.name, 100) || by, at, expires, session: short(raw.session, 40) } : null
  } catch { return null }
}
export const serializeLock = (lock: RowLock) => `${JSON.stringify({ schema: 1, kind: 'row-lock', ...lock })}\n`
export const isExpired = (lock: RowLock, now: number) => Date.parse(lock.expires) <= now
export function newLock(who: { by: string; name: string; session: string }, now: number, timeoutMs: number): RowLock {
  return { by: who.by, name: who.name || who.by, session: who.session, at: new Date(now).toISOString(), expires: new Date(now + timeoutMs).toISOString() }
}
export const renewLock = (lock: RowLock, now: number, timeoutMs: number): RowLock => ({ ...lock, expires: new Date(now + timeoutMs).toISOString() })
// What Edit does with the lock found: none → create it; one of this person's (another window, a crash) or an expired
// one → take it over (a version-checked update, so two people taking over the same expired lock cannot both win);
// someone else's that has not expired → held (Edit stays disabled with who and since when).
export type LockDecision = 'create' | 'takeover' | 'held'
export function lockDecision(existing: RowLock | null, me: string, now: number): LockDecision {
  if (!existing) return 'create'
  if (existing.by.toLowerCase() === me.toLowerCase() || isExpired(existing, now)) return 'takeover'
  return 'held'
}
// The lock of a row held by someone else (not expired), for the badge and the drawer; null when the row is free.
export const heldBy = (lock: RowLock | null | undefined, me: string, now: number) => lock && !isExpired(lock, now) && lock.by.toLowerCase() !== me.toLowerCase() ? lock : null

// ---- the inactivity timeout (OND-36) ----
export const minuteMs = 60_000
export const defaultTimeoutMinutes = 15, minTimeoutMinutes = 1, maxTimeoutMinutes = 240
export const renewIntervalMs = 2 * minuteMs
// The warning comes 2 minutes before the edit is closed (half the timeout when it is shorter than 4 minutes).
export const warningLeadMs = (timeoutMs: number) => Math.min(2 * minuteMs, Math.floor(timeoutMs / 2))
export type EditPhase = { phase: 'active' | 'warning'; left: number } | { phase: 'expired'; left: 0 }
export function editPhase(lastActivity: number, now: number, timeoutMs: number): EditPhase {
  const left = lastActivity + timeoutMs - now
  if (left <= 0) return { phase: 'expired', left: 0 }
  return { phase: left <= warningLeadMs(timeoutMs) ? 'warning' : 'active', left }
}
// The heartbeat (every 2 minutes) renews only when there was input since the last renewal.
export const shouldRenew = (lastRenew: number, lastInput: number, now: number) => lastInput > lastRenew && now - lastRenew >= renewIntervalMs
export const countdown = (ms: number) => { const seconds = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` }

// The shared setting (row-locks.json next to the planning data): the inactivity timeout in whole minutes, 1…240.
export const lockSettingsFile = 'row-locks.json'
export interface LockSettings { timeoutMinutes: number }
export const defaultLockSettings = (): LockSettings => ({ timeoutMinutes: defaultTimeoutMinutes })
export function timeoutError(value: string) {
  const n = Number(value)
  return /^\d+$/.test(value.trim()) && n >= minTimeoutMinutes && n <= maxTimeoutMinutes ? '' : `The timeout is a whole number of minutes, ${minTimeoutMinutes} to ${maxTimeoutMinutes}.`
}
export function parseLockSettings(text: string | null): LockSettings {
  if (!text) return defaultLockSettings()
  try {
    const raw = JSON.parse(text) as { timeoutMinutes?: unknown }
    const n = raw.timeoutMinutes
    return { timeoutMinutes: typeof n === 'number' && Number.isInteger(n) && n >= minTimeoutMinutes && n <= maxTimeoutMinutes ? n : defaultTimeoutMinutes }
  } catch { return defaultLockSettings() }
}
export const serializeLockSettings = (settings: LockSettings) => `${JSON.stringify({ schema: 1, kind: 'row-lock-settings', timeoutMinutes: settings.timeoutMinutes }, null, 2)}\n`
// Two saves of the setting: the later one wins (one value).
export const mergeLockSettingsText = (_base: string | null, mine: string, theirs: string, mineLater: boolean) => mineLater ? mine : theirs

// ---- drafts (OND-37) ----
// At the timeout the unsaved values of the row are kept in this browser's storage — the page id, the row key, who edited
// it, the values typed and the row's values when the edit started (to show what changed meanwhile) — for one day; a
// draft older than that is deleted whenever drafts are read. No token, no other row. Per repository and person.
export const draftKey = 'demand-planning-row-drafts-v1'
export const draftLifeMs = 24 * 60 * minuteMs
export interface RowDraft { scope: string; page: string; row: string; by: string; at: string; cells: Record<string, OnDemandValue>; base: Record<string, OnDemandValue> }
type Store = Pick<Storage, 'getItem' | 'setItem'>
const draftId = (draft: Pick<RowDraft, 'scope' | 'page' | 'row' | 'by'>) => `${draft.scope}|${draft.page}|${draft.row}|${draft.by.toLowerCase()}`
function readDrafts(storage: Store, now: number): RowDraft[] {
  let list: unknown
  try { list = JSON.parse(storage.getItem(draftKey) ?? '[]') } catch { list = [] }
  const drafts = (Array.isArray(list) ? list : []).filter((entry): entry is RowDraft => Boolean(entry && typeof entry === 'object' && typeof entry.page === 'string' && typeof entry.row === 'string' && typeof entry.by === 'string' && typeof entry.at === 'string' && entry.cells && typeof entry.cells === 'object'))
  const fresh = drafts.filter((draft) => now - Date.parse(draft.at) < draftLifeMs)
  if (fresh.length !== drafts.length) writeDrafts(storage, fresh)
  return fresh
}
function writeDrafts(storage: Store, drafts: RowDraft[]) { try { storage.setItem(draftKey, JSON.stringify(drafts)) } catch { /* storage full or blocked: the draft is kept for this visit only */ } }
export function keepDraft(storage: Store, draft: RowDraft, now: number) {
  writeDrafts(storage, [...readDrafts(storage, now).filter((entry) => draftId(entry) !== draftId(draft)), draft])
}
export const findDraft = (storage: Store, key: Pick<RowDraft, 'scope' | 'page' | 'row' | 'by'>, now: number) => readDrafts(storage, now).find((entry) => draftId(entry) === draftId(key)) ?? null
export function dropDraft(storage: Store, key: Pick<RowDraft, 'scope' | 'page' | 'row' | 'by'>, now: number) {
  const drafts = readDrafts(storage, now)
  const left = drafts.filter((entry) => draftId(entry) !== draftId(key))
  if (left.length !== drafts.length) writeDrafts(storage, left)
}
export const pruneDrafts = (storage: Store, now: number) => { readDrafts(storage, now) }
// Restoring a draft on the row as it is now: the fields the person changed in the draft take the draft's value; the
// others keep the row's current value. changed: the fields changed in Git since the draft's edit started; both: of
// those, the ones the draft changed too (the draft's value wins when restored, so they are named before).
export function draftRestore(draft: RowDraft, current: Record<string, OnDemandValue>, columns: OnDemandColumn[]) {
  const same = (a: OnDemandValue | undefined, b: OnDemandValue | undefined) => cellText(a) === cellText(b) && valuesOf(a).length === valuesOf(b).length
  const mine = columns.filter((column) => !same(draft.cells[column.id], draft.base[column.id]))
  const changed = columns.filter((column) => !same(current[column.id], draft.base[column.id]))
  const cells: Record<string, OnDemandValue> = { ...current }
  for (const column of mine) { const value = draft.cells[column.id]; if (value === undefined) delete cells[column.id]; else cells[column.id] = value }
  return { cells, mine, changed, both: changed.filter((column) => mine.includes(column)) }
}
