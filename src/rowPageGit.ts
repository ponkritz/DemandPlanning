import { GitConflictError, deleteFileAt, listEntries, readTextFile, siblingConfig, writeTextFile, type Fetch, type GitConfig } from './gitStorage.ts'
import { stampMessage } from './gitSaveQueue.ts'
import { commitFiles, readBlobs, readTree } from './gitTrees.ts'
import { newRowKey, onDemandPath, parseOnDemandPage, rowKeyPattern, type OnDemandPage, type OnDemandRow } from './onDemand.ts'
import { assembleRowPage, convertedFiles, counterPath, diffPages, isMovedMarker, keyOfRowFile, pageFolder, pageJsonPath, parseCounter, rowFilePath, rowsFolder, serializeCounter, serializeHead, serializeRow } from './rowFiles.ts'
import { lockDecision, lockFolderOf, lockPath, newLock, parseLock, renewLock, serializeLock, type RowLock } from './rowLocks.ts'

// OND-31…OND-35: reading and writing a row-file page and its locks in the GitHub data repository. Paths are relative to
// the folder of the planning data (siblingConfig), as every other shared file; `at` is a branch or a commit.

const at = (config: GitConfig, path: string, ref = config.branch): GitConfig => ({ ...siblingConfig(config, path), branch: ref })

// ---- reading (OND-31) ----
// The page: its folder listed (one call: page.json, counter.json and the rows folder's version), page.json and the rows
// folder's entries (one call each, side by side), then the row files not read before — by their version (blob sha), in
// batches (gitTrees.readBlobs). cache: row texts by blob sha, kept for the next read, so a page read again fetches only
// the rows that changed. null when the folder holds no page.json.
export interface RowPageRead { page: OnDemandPage; headSha: string; headText: string; rowsSha: string | null; rows: Record<string, { sha: string; text: string }>; calls: number }
export async function loadRowPage(config: GitConfig, token: string, id: string, cache: Map<string, string>, fetchImpl: Fetch = fetch, ref = config.branch): Promise<RowPageRead | null> {
  let calls = 1
  const entries = await listEntries(at(config, pageFolder(id), ref), token, fetchImpl)
  const head = entries.find((entry) => entry.name === 'page.json' && entry.type === 'file')
  if (!head) return null
  const rowsDir = entries.find((entry) => entry.name === 'rows' && entry.type === 'dir') ?? null
  const [headRead, tree] = await Promise.all([readTextFile(at(config, pageJsonPath(id), ref), token, fetchImpl), rowsDir ? readTree(config, token, rowsDir.sha, fetchImpl) : Promise.resolve([])])
  calls += rowsDir ? 2 : 1
  if (headRead.text == null || !headRead.sha) return null
  const files = tree.filter((entry) => entry.type === 'blob' && keyOfRowFile(entry.name))
  const missing = files.filter((entry) => !cache.has(entry.sha)).map((entry) => entry.sha)
  if (missing.length) {
    const read = await readBlobs(config, token, missing, fetchImpl)
    calls += Math.ceil(missing.length / 100)
    for (const [sha, text] of read) cache.set(sha, text)
  }
  const rows: RowPageRead['rows'] = {}
  for (const entry of files) { const text = cache.get(entry.sha); if (text != null) rows[entry.name] = { sha: entry.sha, text } }
  const page = assembleRowPage(id, headRead.text, Object.entries(rows).map(([name, row]) => ({ name, text: row.text })))
  return { page, headSha: headRead.sha, headText: headRead.text, rowsSha: rowsDir?.sha ?? null, rows, calls }
}

// ---- the readable ID of a new row (OND-33) ----
// counter.json holds the next free number; it is taken with a version-checked update, so two people adding a row at the
// same moment never get the same number: the second update is refused (the file changed), read again and retried.
// atLeast: the highest number on the page here + 1 (a counter behind the rows never gives a number twice).
export async function takeRowNumber(config: GitConfig, token: string, page: Pick<OnDemandPage, 'id' | 'name'>, atLeast: number, fetchImpl: Fetch = fetch, tries = 6): Promise<number> {
  const target = at(config, counterPath(page.id))
  for (let attempt = 1; attempt <= tries; attempt++) {
    const read = await readTextFile(target, token, fetchImpl)
    const next = Math.max(parseCounter(read.text) ?? 1, atLeast, 1)
    try { await writeTextFile(target, token, serializeCounter(next + 1), read.sha, `${page.name}: next row number ${next + 1}`, fetchImpl); return next }
    catch (failure) { if (!(failure instanceof GitConflictError)) throw failure }
  }
  throw new Error(`${counterPath(page.id)} kept changing in Git while taking the next row ID (${tries} tries). Nothing was saved: try again.`)
}
// A new row's file, created (never replacing one): when a file with its key exists (the same 4 random characters on
// the same day, a key clash), the row gets a new key and is created again.
export async function createRowFile(config: GitConfig, token: string, page: OnDemandPage, row: OnDemandRow, message: (row: OnDemandRow) => string, stamp: string, fetchImpl: Fetch = fetch, random: () => number = Math.random): Promise<{ row: OnDemandRow; sha: string; commitUrl: string; text: string }> {
  let current = row
  const taken = new Set(page.rows.flatMap((entry) => entry.key ? [entry.key] : []))
  for (let attempt = 1; attempt <= 5; attempt++) {
    const key = current.key && !taken.has(current.key) ? current.key : newRowKey(page.keyPrefix, taken, random)
    current = { ...current, key }
    const text = serializeRow(current)
    try { const written = await writeTextFile(at(config, rowFilePath(page.id, key)), token, text, null, stampMessage(message(current), stamp), fetchImpl); return { row: current, ...written, text } }
    catch (failure) { if (!(failure instanceof GitConflictError)) throw failure; taken.add(key) }
  }
  throw new Error('Could not find a free row key after 5 tries. Nothing was saved: try again.')
}

// ---- many files in one commit (OND-32, OND-33) ----
// OND-32: a page's single file converted into row files, as one commit: the page is read from the file at the commit
// the conversion is made on (so nothing saved meanwhile is lost) and written as page.json, a file per row, counter.json,
// and the marker in place of the file.
export async function convertPage(config: GitConfig, token: string, id: string, message: (page: OnDemandPage) => string, fetchImpl: Fetch = fetch): Promise<{ page: OnDemandPage; commit: string; commitUrl: string }> {
  let converted: OnDemandPage | null = null
  const result = await commitFiles(at(config, ''), token, async (commit) => {
    if ((await listEntries(at(config, pageFolder(id), commit), token, fetchImpl)).some((entry) => entry.name === 'page.json')) throw new Error(`${pageFolder(id)}/ already holds row files: the page is converted.`)
    const read = await readTextFile(at(config, onDemandPath(id), commit), token, fetchImpl)
    if (read.text == null || isMovedMarker(read.text)) throw new Error(`${onDemandPath(id)} is not in Git: nothing to convert.`)
    const { page, files } = convertedFiles(parseOnDemandPage(read.text, id))
    converted = page
    return { files: rebase(config, files), message: message(page) }
  }, fetchImpl)
  return { page: converted!, ...result }
}
// The paths of a commit are from the repository's root: the folder of the planning data in front.
const rebase = (config: GitConfig, files: Record<string, string | null>) => Object.fromEntries(Object.entries(files).map(([path, text]) => [siblingConfig(config, path).path, text]))
// OND-33: a change of the page that touches many rows at once (a renamed option or a type change of Set up columns…):
// page.json and every changed row file in one commit, the change applied to the page as it is at that commit.
// OND-106: rows added with it (a bulk upload) go in the same commit — each with a key no row at that commit has and the
// next readable IDs from counter.json at that commit, which is moved on in the same commit; when someone added a row
// meanwhile (their counter update moved the branch), the commit is made again from theirs (commitFiles), so no key or
// ID is given twice.
export async function commitPageChange(config: GitConfig, token: string, id: string, change: (page: OnDemandPage) => OnDemandPage, message: string, cache: Map<string, string>, fetchImpl: Fetch = fetch, random: () => number = Math.random) {
  return commitFiles(at(config, ''), token, async (commit) => {
    const read = await loadRowPage(config, token, id, cache, fetchImpl, commit)
    if (!read) throw new Error(`${pageJsonPath(id)} is not in Git.`)
    const next = change(read.page)
    const diff = diffPages(read.page, next)
    const files: Record<string, string | null> = {}
    if (diff.head) files[pageJsonPath(id)] = serializeHead(next)
    for (const row of diff.updated) files[rowFilePath(id, row.key!)] = serializeRow(row)
    for (const row of diff.removed) if (row.key) files[rowFilePath(id, row.key)] = null
    if (diff.added.length) {
      const taken = new Set(read.page.rows.flatMap((row) => row.key ? [row.key] : []))
      const counter = parseCounter((await readTextFile(at(config, counterPath(id), commit), token, fetchImpl)).text)
      let seq = Math.max(counter ?? 1, read.page.rows.reduce((max, row) => Math.max(max, row.seq ?? 0), read.page.lastSeq ?? 0) + 1, 1)
      for (const row of diff.added) {
        const key = row.key && rowKeyPattern.test(row.key) && !taken.has(row.key) ? row.key : newRowKey(read.page.keyPrefix, taken, random)
        taken.add(key)
        files[rowFilePath(id, key)] = serializeRow({ ...row, key, seq: seq++ })
      }
      files[counterPath(id)] = serializeCounter(seq)
    }
    return { files: rebase(config, files), message }
  }, fetchImpl)
}
// OND-10: removing a row-file page removes every file of its folder and the marker, as one commit.
export async function removeRowPage(config: GitConfig, token: string, id: string, message: string, fetchImpl: Fetch = fetch) {
  return commitFiles(at(config, ''), token, async (commit) => {
    const entries = await listEntries(at(config, pageFolder(id), commit), token, fetchImpl)
    const files: Record<string, string | null> = {}
    for (const entry of entries) if (entry.type === 'file') files[`${pageFolder(id)}/${entry.name}`] = null
    const rows = entries.find((entry) => entry.name === 'rows' && entry.type === 'dir')
    if (rows) for (const entry of await readTree(config, token, rows.sha, fetchImpl)) if (entry.type === 'blob') files[`${rowsFolder(id)}/${entry.name}`] = null
    if ((await readTextFile(at(config, onDemandPath(id), commit), token, fetchImpl)).text != null) files[onDemandPath(id)] = null
    return { files: rebase(config, files), message }
  }, fetchImpl)
}

// ---- locks (OND-35) ----
// lockConfig: the data repository with the branch the locks are kept on (`locks`, or the data branch in the fallback).
export interface HeldLock { lock: RowLock; sha: string }
// The locks of a page: its lock folder listed (one call); a lock file not read before (by version) is read once.
export async function readLocks(lockConfig: GitConfig, token: string, pageId: string, cache: Map<string, RowLock | null>, fetchImpl: Fetch = fetch): Promise<Record<string, HeldLock>> {
  const entries = (await listEntries(at(lockConfig, lockFolderOf(pageId)), token, fetchImpl)).filter((entry) => entry.type === 'file' && keyOfRowFile(entry.name))
  const out: Record<string, HeldLock> = {}
  for (const entry of entries) {
    if (!cache.has(entry.sha)) cache.set(entry.sha, parseLock((await readTextFile(at(lockConfig, lockPath(pageId, keyOfRowFile(entry.name)!)), token, fetchImpl)).text))
    const lock = cache.get(entry.sha)
    if (lock) out[keyOfRowFile(entry.name)!] = { lock, sha: entry.sha }
  }
  return out
}
// Edit: the row's lock taken — created when there is none (GitHub refuses to create a file that exists), else taken
// over when it is the person's own or expired (an update of the version read: two takeovers cannot both win). ok false:
// someone else holds it (the lock read back, to say who and since when).
export async function takeLock(lockConfig: GitConfig, token: string, pageId: string, key: string, who: { by: string; name: string; session: string }, now: number, timeoutMs: number, fetchImpl: Fetch = fetch): Promise<{ ok: true; lock: RowLock; sha: string } | { ok: false; lock: RowLock | null }> {
  const target = at(lockConfig, lockPath(pageId, key))
  const lock = newLock(who, now, timeoutMs)
  const message = `Lock ${key} of ${pageId} (${who.by})`
  try { const written = await writeTextFile(target, token, serializeLock(lock), null, message, fetchImpl); return { ok: true, lock, sha: written.sha } }
  catch (failure) { if (!(failure instanceof GitConflictError)) throw failure }
  for (let attempt = 1; attempt <= 2; attempt++) {
    const read = await readTextFile(target, token, fetchImpl)
    const existing = parseLock(read.text)
    const decision = read.text == null ? 'create' : lockDecision(existing, who.by, now)
    if (decision === 'held') return { ok: false, lock: existing }
    try { const written = await writeTextFile(target, token, serializeLock(lock), read.sha, decision === 'create' ? message : `Take over the lock of ${key} of ${pageId} (${who.by})`, fetchImpl); return { ok: true, lock, sha: written.sha } }
    catch (failure) { if (!(failure instanceof GitConflictError)) throw failure }
  }
  return { ok: false, lock: parseLock((await readTextFile(target, token, fetchImpl)).text) }
}
// The heartbeat: the lock renewed (an update of the version this window wrote). ok false: the lock is gone or someone
// else's now (released by an owner, or taken over after it expired) — the edit must stop.
export async function keepLock(lockConfig: GitConfig, token: string, pageId: string, key: string, held: HeldLock, now: number, timeoutMs: number, fetchImpl: Fetch = fetch): Promise<{ ok: true; lock: RowLock; sha: string } | { ok: false; lock: RowLock | null }> {
  const target = at(lockConfig, lockPath(pageId, key))
  const lock = renewLock(held.lock, now, timeoutMs)
  try { const written = await writeTextFile(target, token, serializeLock(lock), held.sha, `Keep the lock of ${key} of ${pageId} (${lock.by})`, fetchImpl); return { ok: true, lock, sha: written.sha } }
  catch (failure) {
    if (!(failure instanceof GitConflictError) && !/not found/i.test(failure instanceof Error ? failure.message : '')) throw failure
    return { ok: false, lock: parseLock((await readTextFile(target, token, fetchImpl)).text) }
  }
}
// Save, Cancel, close or timeout: the lock released (the version this window wrote; best effort — the expiry covers a crash).
// An owner's Release lock: the version they saw.
export const dropLock = (lockConfig: GitConfig, token: string, pageId: string, key: string, sha: string, message: string, fetchImpl: Fetch = fetch, keepalive = false) => deleteFileAt(at(lockConfig, lockPath(pageId, key)), token, sha, message, fetchImpl, keepalive)
