import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeGitHub } from '../e2e/fakeGitHub.mjs'
import { countdown, defaultTimeoutMinutes, draftKey, draftLifeMs, draftRestore, dropDraft, editPhase, findDraft, heldBy, keepDraft, lockDecision, lockPath, minuteMs, newLock, parseLock, parseLockSettings, serializeLock, serializeLockSettings, shouldRenew, timeoutError, warningLeadMs } from '../src/rowLocks.ts'
import { dropLock, keepLock, readLocks, takeLock } from '../src/rowPageGit.ts'
import { ensureBranch } from '../src/gitTrees.ts'
import { pagesOfFile } from '../src/gitWatch.ts'

// OND-35…OND-38: row locks — the lock file, acquire / conflict / expiry / takeover / renew with a fake clock, the
// timeout and its warning, the shared timeout setting, drafts kept a day, and the lock branch (or its fallback).
const config = { owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }
const t0 = Date.UTC(2026, 10, 23, 10, 2)
const anna = { by: 'anna@example.com', name: 'anna@example.com', session: 's1' }, ben = { by: 'ben@example.com', name: 'ben@example.com', session: 's2' }
const timeout = 15 * minuteMs

test('OND-35: acquire, conflict, expiry and takeover of a row lock with a fake clock (TC-OND-30)', async () => {
  const gh = fakeGitHub()
  const locks = { ...config, branch: 'main' }
  const key = 'CONQ-261123-K7Q2'
  const a = await takeLock(locks, 't', 'conq', key, anna, t0, timeout, gh.fetch)
  assert.equal(a.ok, true)
  assert.equal(parseLock(gh.read(lockPath('conq', key))).by, anna.by)
  // Ben: the file exists → refused → read → Anna holds it, not expired.
  const b = await takeLock(locks, 't', 'conq', key, ben, t0 + 5 * minuteMs, timeout, gh.fetch)
  assert.equal(b.ok, false)
  assert.equal(b.lock.by, anna.by)
  assert.equal(b.lock.at, new Date(t0).toISOString())
  // Anna again (another window): her own lock is taken over.
  const again = await takeLock(locks, 't', 'conq', key, { ...anna, session: 's3' }, t0 + 6 * minuteMs, timeout, gh.fetch)
  assert.equal(again.ok, true)
  // Renewed while she is active: the expiry moves on.
  const kept = await keepLock(locks, 't', 'conq', key, { lock: again.lock, sha: again.sha }, t0 + 8 * minuteMs, timeout, gh.fetch)
  assert.equal(kept.ok, true)
  assert.equal(parseLock(gh.read(lockPath('conq', key))).expires, new Date(t0 + 23 * minuteMs).toISOString())
  // After the expiry Ben takes it over (a version-checked update).
  const late = await takeLock(locks, 't', 'conq', key, ben, t0 + 24 * minuteMs, timeout, gh.fetch)
  assert.equal(late.ok, true)
  // Anna's renewal now fails: the lock is Ben's — her edit must stop.
  const lost = await keepLock(locks, 't', 'conq', key, { lock: kept.lock, sha: kept.sha }, t0 + 25 * minuteMs, timeout, gh.fetch)
  assert.equal(lost.ok, false)
  assert.equal(lost.lock.by, ben.by)
  // The page's locks in one listing; released with the version written.
  const listed = await readLocks(locks, 't', 'conq', new Map(), gh.fetch)
  assert.deepEqual(Object.keys(listed), [key])
  assert.equal(await dropLock(locks, 't', 'conq', key, listed[key].sha, 'release', gh.fetch), true)
  assert.deepEqual(await readLocks(locks, 't', 'conq', new Map(), gh.fetch), {})
  assert.equal(await dropLock(locks, 't', 'conq', key, listed[key].sha, 'release', gh.fetch), false, 'already released')
})

test('OND-35: two people taking over the same expired lock — only one wins (TC-OND-30)', async () => {
  const gh = fakeGitHub()
  const key = 'CONQ-261123-K7Q2'
  await takeLock(config, 't', 'conq', key, anna, t0, timeout, gh.fetch)
  const later = t0 + 20 * minuteMs
  const results = await Promise.all([takeLock(config, 't', 'conq', key, ben, later, timeout, gh.fetch), takeLock(config, 't', 'conq', key, { by: 'cleo@example.com', name: 'cleo@example.com', session: 's9' }, later, timeout, gh.fetch)])
  assert.equal(results.filter((result) => result.ok).length, 1)
})

test('OND-35: the decision, the holder shown and the lock file read safely (TC-OND-30)', () => {
  const lock = newLock(anna, t0, timeout)
  assert.equal(lockDecision(null, ben.by, t0), 'create')
  assert.equal(lockDecision(lock, ben.by, t0 + minuteMs), 'held')
  assert.equal(lockDecision(lock, 'ANNA@example.com', t0 + minuteMs), 'takeover')
  assert.equal(lockDecision(lock, ben.by, t0 + timeout), 'takeover')
  assert.equal(heldBy(lock, ben.by, t0 + minuteMs), lock)
  assert.equal(heldBy(lock, anna.by, t0 + minuteMs), null, 'one’s own lock is no badge')
  assert.equal(heldBy(lock, ben.by, t0 + timeout + 1), null, 'an expired lock frees the row')
  assert.deepEqual(parseLock(serializeLock(lock)), lock)
  for (const bad of [null, '', 'x', '{}', '{"by":"a","at":"no","expires":"no"}']) assert.equal(parseLock(bad), null)
  assert.throws(() => lockPath('conq', '../x'), /Not a valid/)
  assert.throws(() => lockPath('../conq', 'CONQ-261123-K7Q2'), /Not a valid/)
})

test('OND-36: the inactivity timeout — the warning 2 minutes before, the heartbeat only after input, the shared setting (TC-OND-31)', () => {
  assert.equal(warningLeadMs(timeout), 2 * minuteMs)
  assert.equal(warningLeadMs(minuteMs), 30_000)
  assert.deepEqual(editPhase(t0, t0 + 12 * minuteMs, timeout), { phase: 'active', left: 3 * minuteMs })
  assert.deepEqual(editPhase(t0, t0 + 13 * minuteMs, timeout), { phase: 'warning', left: 2 * minuteMs })
  assert.deepEqual(editPhase(t0, t0 + timeout, timeout), { phase: 'expired', left: 0 })
  assert.equal(countdown(2 * minuteMs), '2:00')
  assert.equal(countdown(61_500), '1:02')
  assert.equal(shouldRenew(t0, t0, t0 + 3 * minuteMs), false, 'no input since the last renewal')
  assert.equal(shouldRenew(t0, t0 + minuteMs, t0 + minuteMs + 30_000), false, 'not yet 2 minutes')
  assert.equal(shouldRenew(t0, t0 + minuteMs, t0 + 2 * minuteMs), true)
  assert.equal(parseLockSettings(null).timeoutMinutes, defaultTimeoutMinutes)
  assert.equal(parseLockSettings(serializeLockSettings({ timeoutMinutes: 5 })).timeoutMinutes, 5)
  for (const bad of ['{"timeoutMinutes":0}', '{"timeoutMinutes":1.5}', '{"timeoutMinutes":"5"}', 'x']) assert.equal(parseLockSettings(bad).timeoutMinutes, 15)
  assert.equal(timeoutError('1'), '')
  assert.equal(timeoutError('240'), '')
  assert.match(timeoutError('0'), /1 to 240/)
  assert.match(timeoutError('2.5'), /whole number/)
  // The setting's file and the locks never raise a "Newer data in Git" notice on a page (GIT-18).
  assert.deepEqual(pagesOfFile('locks/conq/CONQ-261123-K7Q2.json', 'planning-data.json').pages, [])
  assert.deepEqual(pagesOfFile('on-demand/conq/rows', 'planning-data.json').pages, ['ondemand:conq', 'admin:pages'])
  assert.deepEqual(pagesOfFile('on-demand/conq/page.json', 'planning-data.json').pages, ['ondemand:conq', 'admin:pages'])
  assert.equal(pagesOfFile('row-locks.json', 'planning-data.json').loader, 'rowLocks')
})

test('OND-37: drafts — kept at the timeout, found for the same repository, page, row and person, restored over the row as it is now, deleted after a day (TC-OND-32)', () => {
  const memory = new Map(), storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) }
  const id = { scope: 'example/storage@main', page: 'conq', row: 'CONQ-261123-K7Q2', by: anna.by }
  const base = { c1: 'Scrap', c2: '300 EUR', c3: 'old' }
  keepDraft(storage, { ...id, at: new Date(t0).toISOString(), cells: { c1: 'Scrap', c2: '450 EUR', c3: 'old' }, base }, t0)
  assert.equal(findDraft(storage, { ...id, by: ben.by }, t0), null, 'another person’s draft is not offered')
  const draft = findDraft(storage, id, t0 + minuteMs)
  assert.equal(draft.cells.c2, '450 EUR')
  // The row changed in Git meanwhile: Category by someone else, Cost by both.
  const columns = [{ id: 'c1', name: 'Category' }, { id: 'c2', name: 'Cost' }, { id: 'c3', name: 'Details' }].map((column) => ({ ...column, type: 'text', options: [], required: false }))
  const restore = draftRestore(draft, { c1: 'Rework', c2: '500 EUR', c3: 'old' }, columns)
  assert.deepEqual(restore.cells, { c1: 'Rework', c2: '450 EUR', c3: 'old' })
  assert.deepEqual(restore.changed.map((column) => column.id), ['c1', 'c2'])
  assert.deepEqual(restore.both.map((column) => column.id), ['c2'])
  // After a day it is gone (and removed from storage).
  assert.equal(findDraft(storage, id, t0 + draftLifeMs), null)
  assert.equal(JSON.parse(memory.get(draftKey)).length, 0)
  keepDraft(storage, { ...id, at: new Date(t0).toISOString(), cells: {}, base }, t0)
  dropDraft(storage, id, t0)
  assert.equal(findDraft(storage, id, t0), null)
  // Storage that throws (private mode, full): no draft, no error.
  const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  assert.doesNotThrow(() => keepDraft({ getItem: () => null, setItem: broken.setItem }, { ...id, at: new Date(t0).toISOString(), cells: {}, base }, t0))
})

test('OND-35: the branch `locks` is made from the data branch; where the repository refuses it, the locks go to the folder locks/ of the data branch (TC-OND-30)', async () => {
  const gh = fakeGitHub({ files: { 'planning-data.json': '{}' } })
  assert.equal(await ensureBranch(config, 't', 'locks', gh.fetch), 'created')
  assert.equal(await ensureBranch(config, 't', 'locks', gh.fetch), 'exists')
  assert.equal(gh.read('planning-data.json', 'locks'), '{}', 'made from the data branch')
  await takeLock({ ...config, branch: 'locks' }, 't', 'conq', 'CONQ-261123-K7Q2', anna, t0, timeout, gh.fetch)
  assert.ok(gh.read('locks/conq/CONQ-261123-K7Q2.json', 'locks'))
  assert.equal(gh.read('locks/conq/CONQ-261123-K7Q2.json'), null, 'nothing on the data branch')
  const refused = fakeGitHub({ files: { 'planning-data.json': '{}' }, refuseBranches: true })
  assert.equal(await ensureBranch(config, 't', 'locks', refused.fetch), 'refused')
})
