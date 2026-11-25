import { deleteFile, fileCommits, fileSha, GitConflictError, GitServerError, isNetworkFailure, readTextFile, writeBinaryFile, writeTextFile, type GitConfig } from './gitStorage.ts'

// GIT-17 (design defaults review, decision 8): saves to the shared Git files that used to be last-writer-wins — the
// historical hours, the default views, the KPI tracker copy, the connection backups and the Monthly pack template — are
// queued with their time (to the second) and written one after another, in that order, each as its own commit. Before
// each write the file is read again from Git; when someone else changed it since it was read here, the change is merged
// into the latest content entry by entry (both survive; where both changed the same entry, the later time wins). A
// conflict at write time reads, merges and tries again (at most three times); then the change stays in the queue.
// The template is binary and cannot be merged: the latest time wins, so an older save never replaces a newer one.

type Fetch = (input: string, init?: RequestInit) => Promise<Response>
type Json = Record<string, unknown>

export const maxSaveTries = 3
export const saveStamp = (date: Date = new Date()) => `${date.toISOString().slice(0, 19)}Z`
const stampPattern = /\[saved (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\]/
// The save time travels in the commit message, so the next save (on any computer) knows which of two changes is later.
export const stampMessage = (message: string, at: string) => `${message.trim()} [saved ${at}]`
export function stampOf(message: string, date = ''): string | null {
  const found = stampPattern.exec(message)
  if (found) return found[1]
  const parsed = Date.parse(date)
  return Number.isFinite(parsed) ? saveStamp(new Date(parsed)) : null
}
// The time of the latest save of a file: its commit's [saved …] stamp, else the commit date; null when it has none.
export async function latestStamp(target: GitConfig, token: string, fetchImpl: Fetch = fetch): Promise<string | null> {
  const [last] = await fileCommits(target, token, 1, fetchImpl)
  return last ? stampOf(last.message, last.date) : null
}

// A save that could not be written after the retries: the change is kept in the queue (Retry writes it again).
export class GitQueueError extends Error {}

// ---- Merging ----------------------------------------------------------------------------------------------------
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
// One value, three ways: unchanged here → theirs; unchanged there → mine; both changed → the later time wins, except
// that a change always wins over a removal (nothing is dropped that someone still changed).
export function merge3<T>(base: T | undefined, mine: T | undefined, theirs: T | undefined, mineLater: boolean): T | undefined {
  if (same(mine, base)) return theirs
  if (same(theirs, base)) return mine
  if (mine === undefined) return theirs
  if (theirs === undefined) return mine
  return mineLater ? mine : theirs
}
// Entries by key. Without a base (the file was never read here) every entry counts as new, so both sides' entries stay.
export function mergeKeyed<T>(base: Record<string, T> | null, mine: Record<string, T>, theirs: Record<string, T>, mineLater: boolean): Record<string, T> {
  const own = (record: Record<string, T> | null, key: string) => record && Object.hasOwn(record, key) ? record[key] : undefined
  const keys = [...new Set([...Object.keys(theirs), ...Object.keys(mine), ...Object.keys(base ?? {})])]
  return Object.fromEntries(keys.flatMap((key) => { const value = merge3(own(base, key), own(mine, key), own(theirs, key), mineLater); return value === undefined ? [] : [[key, value]] }))
}
const parseObject = (text: string | null): Json | null => { if (!text) return null; try { const value = JSON.parse(text) as unknown; return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : null } catch { return null } }
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const pick = (file: Json | null, fields: string[]) => file ? Object.fromEntries(fields.filter((field) => file[field] !== undefined).map((field) => [field, file[field]])) : undefined
// Entries of a list by a key; the same key twice gets #2, #3 … so duplicates are kept apart.
function byKey(items: unknown[], keyOf: (item: Json) => string): Record<string, unknown> {
  const seen = new Map<string, number>()
  return Object.fromEntries(items.filter((item): item is Json => Boolean(item && typeof item === 'object')).map((item) => { const key = keyOf(item); const count = (seen.get(key) ?? 0) + 1; seen.set(key, count); return [count === 1 ? key : `${key}#${count}`, item] }))
}
export type Merge = (base: string | null, mine: string, theirs: string, mineLater: boolean) => string

// Historical hours (history-hours.json): rows by person, month, Feature, Epic, stream, activity, type and tag; the
// people and stream → Epic choices by name; the import details (cut-off, source, sheet, who and when) as one entry.
// Rows from the resulting cut-off month on are left out, as at an import.
const historyRowKey = (row: Json) => ['person', 'month', 'featureId', 'epicId', 'stream', 'activity', 'type', 'tag'].map((field) => String(row[field] ?? '')).join('\u0001')
export const mergeHistoryText: Merge = (baseText, mineText, theirsText, mineLater) => {
  const base = parseObject(baseText), mine = parseObject(mineText), theirs = parseObject(theirsText)
  if (!mine || !theirs || !Array.isArray(theirs.rows)) return mineText
  const fields = ['cutoff', 'source', 'sheet', 'importedAt', 'importedBy']
  const head = merge3(pick(base, fields), pick(mine, fields), pick(theirs, fields), mineLater) ?? pick(mine, fields) ?? {}
  const cutoff = String(head.cutoff ?? mine.cutoff)
  const rows = Object.values(mergeKeyed(base ? byKey(list(base.rows), historyRowKey) : null, byKey(list(mine.rows), historyRowKey), byKey(list(theirs.rows), historyRowKey), mineLater)).filter((row) => String(record(row).month) < cutoff).slice(0, 20000)
  const streamEpics = mergeKeyed(base ? record(base.streamEpics) : null, record(mine.streamEpics), record(theirs.streamEpics), mineLater)
  const people = mergeKeyed(base ? record(base.people) : null, record(mine.people), record(theirs.people), mineLater)
  return `${JSON.stringify({ schema: mine.schema, kind: mine.kind, ...head, rows, streamEpics, people })}\n`
}

// Default views (personal-views-defaults.json): each page's sections by page, the menu as one entry, filters by page.
export const mergeViewsDefaultsText: Merge = (baseText, mineText, theirsText, mineLater) => {
  const base = parseObject(baseText), mine = parseObject(mineText), theirs = parseObject(theirsText)
  if (!mine || !theirs) return mineText
  const sections = mergeKeyed(base ? record(base.sections) : null, record(mine.sections), record(theirs.sections), mineLater)
  const menu = merge3(base?.menu, mine.menu, theirs.menu, mineLater) ?? mine.menu
  const filters = mergeKeyed(base ? record(base.filters) : null, record(mine.filters), record(theirs.filters), mineLater)
  return `${JSON.stringify({ schema: 1, kind: mine.kind, sections, menu, filters }, null, 2)}\n`
}

// KPI tracker copy (kpi-tracker.json): sheets by name; the details of the read (link, file name, when and by whom) as
// one entry. At most 20 sheets, as at a read.
export const mergeKpiTrackerText: Merge = (baseText, mineText, theirsText, mineLater) => {
  const base = parseObject(baseText), mine = parseObject(mineText), theirs = parseObject(theirsText)
  if (!mine || !theirs || !Array.isArray(theirs.sheets)) return mineText
  const fields = ['fileUrl', 'fileName', 'readAt', 'readBy', 'modified', 'truncated']
  const head = merge3(pick(base, fields), pick(mine, fields), pick(theirs, fields), mineLater) ?? pick(mine, fields) ?? {}
  const sheetName = (sheet: Json) => String(sheet.name ?? '')
  const sheets = Object.values(mergeKeyed(base ? byKey(list(base.sheets), sheetName) : null, byKey(list(mine.sheets), sheetName), byKey(list(theirs.sheets), sheetName), mineLater)).slice(0, 20)
  return `${JSON.stringify({ schema: 1, ...head, sheets })}\n`
}

// A connection backup (azure-views-backups/<time>.json) is a new file each time; two backups in the same second keep
// every connection of both, by connection id.
export const mergeViewsBackupText: Merge = (baseText, mineText, theirsText, mineLater) => {
  const base = parseObject(baseText), mine = parseObject(mineText), theirs = parseObject(theirsText)
  if (!mine || !theirs || !Array.isArray(theirs.views)) return mineText
  const viewId = (view: Json) => String(view.id ?? '')
  const views = Object.values(mergeKeyed(base ? byKey(list(base.views), viewId) : null, byKey(list(mine.views), viewId), byKey(list(theirs.views), viewId), mineLater)).sort((a, b) => viewId(record(a)).localeCompare(viewId(record(b))))
  return `${JSON.stringify({ schema: 1, kind: mine.kind, views }, null, 2)}\n`
}

// ---- Failures in plain words (GIT-27) ---------------------------------------------------------------------------
// A save that got no answer (the browser's "Failed to fetch") or a server error (HTTP 500, 502, 503, 504) is tried once
// more by itself after a short pause (1–2 s): it is safe to repeat, because every write first reads the file again and
// sends the version it read — when the first write did reach Git the file is already the same (nothing is written
// again), and a write over a version that changed meanwhile is refused as a conflict and merged (GIT-17). When it fails
// again the change is kept and the message says, in plain words, what happened and what to do; the browser's or
// GitHub's own words follow in brackets.
export const transientPause = () => 1000 + Math.round(Math.random() * 1000)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
export const isTransient = (failure: unknown) => failure instanceof GitServerError || isNetworkFailure(failure)
// The size of the file (KB) and, for a page kept in one file (on-demand/<id>.json), the hint to convert it (OND-32).
const sizeHint = (path: string, bytes: number) => {
  const kb = Math.max(1, Math.round(bytes / 1000))
  return /(^|\/)on-demand\/[^/]+\.json$/.test(path) ? `the page file is ${kb.toLocaleString('en-US')} KB — a page with many rows saves faster as row files (the page’s ⋯ → Convert to row files…)` : `the file is ${kb.toLocaleString('en-US')} KB`
}
export function saveFailureText(failure: unknown, path: string, bytes = 0): string {
  const raw = failure instanceof Error ? failure.message : String(failure ?? '')
  if (failure instanceof GitServerError) return `GitHub had a problem saving ${path} (HTTP ${failure.status}). Your change is kept here — press Retry in a minute. If it keeps failing, ${sizeHint(path, bytes)}.${failure.detail ? ` (GitHub: ${failure.detail})` : ''}`
  if (isNetworkFailure(failure)) return `GitHub could not be reached (network, VPN or proxy): ${path} is not saved. Your change is kept here — check the connection and press Retry. (Browser: ${raw})`
  return raw
}
// A save's failure as the queue reports it: a network or server failure in plain words (GIT-27), any other as it is.
export function plainSaveError(failure: unknown, path: string, bytes = 0): unknown {
  return isTransient(failure) ? new Error(saveFailureText(failure, path, bytes)) : failure
}

// ---- Writing --------------------------------------------------------------------------------------------------
export interface QueuedOutcome { sha: string | null; commitUrl: string; merged: boolean; unchanged: boolean; keptNewer: boolean }
export interface TextChange { text: string; base: string | null; at: string; message: string; merge: Merge }

// Reads the latest version, merges this change into it when someone else changed the file since `base` was read here,
// and commits the result with the version just read. A conflict at write time starts again from the read.
// replaced (GIT-18): the version in Git this save replaced (or found already the same), so a listing that still shows it
// is not taken for newer data saved by someone else.
// GIT-27: a network or server failure (of the read or the write) starts again from the read once, after `pause` ms.
export async function writeQueuedText(target: GitConfig, token: string, change: TextChange, fetchImpl: Fetch = fetch, tries = maxSaveTries, pause: () => number = transientPause): Promise<QueuedOutcome & { text: string; replaced: string | null }> {
  let again = true
  for (let attempt = 1; attempt <= tries; attempt++) {
    let next = change.text
    try {
      const latest = await readTextFile(target, token, fetchImpl)
      if (latest.text != null && latest.text !== change.base && latest.text !== change.text) {
        const theirs = await latestStamp(target, token, fetchImpl)
        next = change.merge(change.base, change.text, latest.text, !theirs || change.at >= theirs)
      }
      const merged = next !== change.text
      if (latest.text === next) return { sha: latest.sha, commitUrl: '', merged, unchanged: true, keptNewer: false, text: next, replaced: latest.sha }
      const written = await writeTextFile(target, token, next, latest.sha, stampMessage(change.message, change.at), fetchImpl)
      return { ...written, merged, unchanged: false, keptNewer: false, text: next, replaced: latest.sha }
    } catch (failure) {
      if (failure instanceof GitConflictError) continue
      if (again && isTransient(failure)) { again = false; attempt -= 1; await sleep(pause()); continue }
      throw plainSaveError(failure, target.path, new TextEncoder().encode(next).length)
    }
  }
  throw new GitQueueError(`${target.path} kept changing in Git while saving (${tries} tries). Your change is kept here and not lost: choose Retry to save it again.`)
}

// The binary template: replaced (or removed, bytes null) only when no newer save is in Git; never merged.
export async function writeQueuedBinary(target: GitConfig, token: string, change: { bytes: Uint8Array | null; at: string; message: string }, fetchImpl: Fetch = fetch, tries = maxSaveTries): Promise<QueuedOutcome> {
  for (let attempt = 1; attempt <= tries; attempt++) {
    const theirs = await latestStamp(target, token, fetchImpl)
    if (theirs && theirs > change.at) return { sha: null, commitUrl: '', merged: false, unchanged: false, keptNewer: true }
    try {
      if (!change.bytes) { await deleteFile(target, token, stampMessage(change.message, change.at), fetchImpl); return { sha: null, commitUrl: '', merged: false, unchanged: false, keptNewer: false } }
      const written = await writeBinaryFile(target, token, change.bytes, await fileSha(target, token, fetchImpl), stampMessage(change.message, change.at), fetchImpl)
      return { ...written, merged: false, unchanged: false, keptNewer: false }
    } catch (failure) { if (!(failure instanceof GitConflictError)) throw failure }
  }
  throw new GitQueueError(`${target.path} kept changing in Git while saving (${tries} tries). Your template is kept here and not lost: choose Retry to save it again.`)
}

// ---- The queue ------------------------------------------------------------------------------------------------
// One queue per file: saves run one after another in the order of their time (to the second; the same second in the
// order they were made). A save that fails stays in the queue as failed until Retry (or the page is closed).
export interface QueueState { waiting: number; failed: number; error: string }
interface Entry { at: string; seq: number; run: () => Promise<unknown>; resolve: (value: unknown) => void; reject: (reason: unknown) => void }

export class SaveQueue {
  private waiting = new Map<string, Entry[]>()
  private failed = new Map<string, { entry: Entry; error: string }[]>()
  private running = new Set<string>()
  private seq = 0
  private listeners = new Set<() => void>()
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private changed() { for (const listener of this.listeners) listener() }
  state(path: string): QueueState {
    const failed = this.failed.get(path) ?? []
    return { waiting: (this.waiting.get(path)?.length ?? 0) + (this.running.has(path) ? 1 : 0), failed: failed.length, error: failed[failed.length - 1]?.error ?? '' }
  }
  enqueue<T>(path: string, at: string, run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => { this.insert(path, { at, seq: this.seq++, run, resolve: resolve as (value: unknown) => void, reject }) })
  }
  private insert(path: string, entry: Entry) {
    const entries = [...(this.waiting.get(path) ?? []), entry].sort((a, b) => a.at.localeCompare(b.at) || a.seq - b.seq)
    this.waiting.set(path, entries); this.changed()
    if (!this.running.has(path)) void this.pump(path)
  }
  // Failed saves of a file go back in the queue (with their own time); resolves when they have run.
  retry(path: string): Promise<unknown[]> {
    const failed = this.failed.get(path) ?? []
    this.failed.delete(path)
    return Promise.allSettled(failed.map(({ entry }) => new Promise((resolve, reject) => this.insert(path, { ...entry, resolve, reject })))).then((results) => results.map((result) => result.status === 'fulfilled' ? result.value : undefined))
  }
  private async pump(path: string) {
    this.running.add(path)
    try {
      for (let entry = this.waiting.get(path)?.shift(); entry; entry = this.waiting.get(path)?.shift()) {
        this.changed()
        try { entry.resolve(await entry.run()) }
        catch (failure) {
          if (failure instanceof GitQueueError) this.failed.set(path, [...(this.failed.get(path) ?? []), { entry, error: failure.message }])
          entry.reject(failure)
        }
      }
    } finally { this.running.delete(path); this.changed() }
  }
}

// The result of a queued save, for the message where the save happened.
export function outcomeText(outcome: Pick<QueuedOutcome, 'merged' | 'unchanged' | 'keptNewer'>): string {
  if (outcome.keptNewer) return 'Not replaced: a newer save by someone else is in Git and is kept.'
  if (outcome.merged) return 'Saved to Git — merged with a change by someone else.'
  if (outcome.unchanged) return 'Already the same in Git.'
  return 'Saved to Git.'
}
