import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeBase64, encodeBase64 } from '../src/gitStorage.ts'
import { writeQueuedText } from '../src/gitSaveQueue.ts'
import { conqPage, mergeOnDemandText, parseOnDemandPage, rowId, rowSave, serializeOnDemandPage, upsertRow } from '../src/onDemand.ts'

// OND-28: a row saved at once from the drawer — the change applied to the page as last read from Git, its commit message,
// and the queued, merged save of GIT-17 with the base the change was made from (KB-80).
const columns = [
  { id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework'], required: true },
  { id: 'c2', name: 'Cost', type: 'number', options: [], required: false },
]
const page = (rows = []) => ({ ...conqPage(), columns: structuredClone(columns), rows })
const ana = 'ana@example.com', ben = 'ben@example.com'
const config = { owner: 'acme', repo: 'data', branch: 'main', path: 'on-demand/conq.json' }
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0) })
// A small GitHub holding one file, with its commits (as in git-save-queue.test.mjs).
function fakeGitHub(text) {
  let next = 1
  const state = { file: null, commits: [] }
  const put = (content, message) => { const sha = String(next++).padStart(40, '0'); state.file = { content, sha }; state.commits.push({ sha, message, date: '2026-11-23T09:00:00Z' }); return sha }
  if (text) put(encodeBase64(text), 'seed')
  state.text = () => state.file ? decodeBase64(state.file.content) : null
  state.fetch = async (url, init = {}) => {
    if (new URL(url).pathname.endsWith('/commits')) return json(200, [...state.commits].reverse().map((entry) => ({ sha: entry.sha, commit: { message: entry.message, committer: { date: entry.date } } })))
    if (!init.method) return state.file ? json(200, { type: 'file', encoding: 'base64', content: state.file.content, sha: state.file.sha }) : json(404, {})
    const body = JSON.parse(init.body)
    if ((state.file?.sha ?? undefined) !== body.sha) return json(409, {})
    const sha = put(body.content, body.message)
    return json(200, { content: { sha }, commit: { html_url: `https://github.com/acme/data/commit/${sha}` } })
  }
  return state
}
const save = (git, change, base, at) => writeQueuedText(config, 'token', { text: serializeOnDemandPage(change.page), base, at, message: change.message, merge: mergeOnDemandText }, git.fetch)

test('OND-28: a row saved at once — added, changed or removed on the page as last read from Git, with a commit message naming it (TC-OND-22)', () => {
  const stored = parseOnDemandPage(serializeOnDemandPage(upsertRow(page(), { id: 'r1', cells: { c1: 'Scrap', c2: '10' } }, { by: ana })), 'conq')
  assert.equal(rowId(stored, stored.rows[0]), 'CONQ-0001')
  // Add: the next ID it will get and its key, who added it, and the first log entry.
  const added = rowSave(stored, { id: 'r2', cells: { c1: 'Rework' } }, 'add', { by: ben })
  const row = added.page.rows.find((entry) => entry.id === 'r2')
  assert.match(added.message, /^CoNQ: add row CONQ-0002 \(CONQ-\d{6}-[2-9A-HJKMNP-Z]{4}\)$/)
  assert.ok(added.message.includes(row.key), 'the key in the message is the row’s key')
  assert.equal(row.addedBy, ben)
  assert.deepEqual(row.log.map((entry) => [entry.added, entry.by, entry.changes]), [[true, ben, [{ column: 'c1', from: '', to: 'Rework' }]]])
  assert.equal(added.page.rows[0], stored.rows[0], 'the other rows are left as they were')
  // Update: the ID in the message, a log entry with the change; no change, no new page.
  const updated = rowSave(stored, { ...stored.rows[0], cells: { c1: 'Scrap', c2: '12' } }, 'update', { by: ben })
  assert.equal(updated.message, 'CoNQ: update row CONQ-0001')
  assert.deepEqual(updated.page.rows[0].log.at(-1).changes, [{ column: 'c2', from: '10', to: '12' }])
  assert.equal(rowSave(stored, stored.rows[0], 'update', { by: ben }).page, stored, 'saving without a change changes nothing')
  // Remove: the row goes, the message names it.
  const removed = rowSave(stored, stored.rows[0], 'remove')
  assert.equal(removed.message, 'CoNQ: remove row CONQ-0001')
  assert.deepEqual(removed.page.rows, [])
})

test('OND-28, KB-80: two rows saved one after the other from the same page are both kept — the second is merged with the first, the IDs stay unique, the logs are kept (TC-OND-22)', async () => {
  const t0 = serializeOnDemandPage(page())
  const git = fakeGitHub(t0)
  const stored = parseOnDemandPage(t0, 'conq')
  // Two rows added in this browser, the second queued while the first was on its way: both made from the page as read (t0).
  const first = rowSave(stored, { id: 'r1', cells: { c1: 'Scrap' } }, 'add', { by: ana })
  const second = rowSave(stored, { id: 'r2', cells: { c1: 'Rework' } }, 'add', { by: ana })
  assert.match(second.message, /add row CONQ-0001/, 'both expect the first free number')
  const one = await save(git, first, t0, '2026-11-23T10:00:00Z')
  assert.equal(one.merged, false)
  // The base is the version the change was made from (t0), not the version written in between.
  const two = await save(git, second, t0, '2026-11-23T10:00:01Z')
  assert.equal(two.merged, true)
  const file = parseOnDemandPage(git.text(), 'conq')
  assert.deepEqual(file.rows.map((row) => [row.id, rowId(file, row), row.cells.c1, row.log.length]), [['r1', 'CONQ-0001', 'Scrap', 1], ['r2', 'CONQ-0002', 'Rework', 1]], 'the second row gets the next free number at the write')
  assert.match(git.commits.at(-1).message, /^CoNQ: add row CONQ-0001 \(CONQ-.+\) \[saved 2026-11-23T10:00:01Z\]$/)

  // An edit of one row and an edit of another, both from the same version: each keeps its change and its log entry.
  const t2 = git.text(), read = parseOnDemandPage(t2, 'conq')
  const a = rowSave(read, { ...read.rows[0], cells: { c1: 'Rework' } }, 'update', { by: ana })
  const b = rowSave(read, { ...read.rows[1], cells: { c1: 'Rework', c2: '99' } }, 'update', { by: ben })
  await save(git, a, t2, '2026-11-23T10:01:00Z')
  await save(git, b, t2, '2026-11-23T10:01:01Z')
  const after = parseOnDemandPage(git.text(), 'conq')
  assert.deepEqual(after.rows.map((row) => [row.cells.c1, row.cells.c2, row.log.length]), [['Rework', undefined, 2], ['Rework', '99', 2]])

  // KB-80, as it was: with the version written in between taken as the base, the second save is written over the first.
  const lost = fakeGitHub(t0)
  await save(lost, first, t0, '2026-11-23T10:00:00Z')
  await save(lost, second, lost.text(), '2026-11-23T10:00:01Z')
  assert.deepEqual(parseOnDemandPage(lost.text(), 'conq').rows.map((row) => row.id), ['r2'], 'the first row was lost')
})

test('OND-28: a row removed at once stays removed unless someone changed it later; a row changed meanwhile by someone else is kept (TC-OND-22)', async () => {
  const t0 = serializeOnDemandPage(upsertRow(upsertRow(page(), { id: 'r1', cells: { c1: 'Scrap' } }, { by: ana }), { id: 'r2', cells: { c1: 'Rework' } }, { by: ana }))
  const git = fakeGitHub(t0)
  const read = parseOnDemandPage(t0, 'conq')
  // Ben changes r2 (saved first); Ana removes r1 from the version she read: r1 goes, Ben's change stays.
  await save(git, rowSave(read, { ...read.rows[1], cells: { c1: 'Scrap' } }, 'update', { by: ben }), t0, '2026-11-23T10:00:00Z')
  await save(git, rowSave(read, read.rows[0], 'remove'), t0, '2026-11-23T10:00:05Z')
  const file = parseOnDemandPage(git.text(), 'conq')
  assert.deepEqual(file.rows.map((row) => [row.id, row.cells.c1, row.seq]), [['r2', 'Scrap', 2]])
})
