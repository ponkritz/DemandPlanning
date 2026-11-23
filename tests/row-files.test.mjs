import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeGitHub } from '../e2e/fakeGitHub.mjs'
import { conqPage, isRowHidden, mergeOnDemandText, rowKeyPattern, rowSave, serializeOnDemandPage, setRowHidden, upsertRow, withoutHidden, withRowKeys, withRowNumbers } from '../src/onDemand.ts'
import { assembleRowPage, convertedFiles, diffPages, isMovedMarker, keyOfRowFile, mergeRowText, movedMarker, pageJsonPath, rowFilePath, serializeRow } from '../src/rowFiles.ts'
import { commitPageChange, convertPage, createRowFile, loadRowPage, takeRowNumber } from '../src/rowPageGit.ts'
import { parseOnDemandPage } from '../src/onDemand.ts'

// OND-31…OND-34: a table page as one file per row — the layout, the conversion, reading, the next ID under two clients,
// a new row's file, the field-level merge and the path check of row keys.
const config = { owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }
const columns = [
  { id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework'], required: true },
  { id: 'c2', name: 'Cost', type: 'currency', options: [], required: false, currency: 'EUR' },
  { id: 'c3', name: 'Details', type: 'longtext', options: [], required: false },
]
const insights = [{ id: 'i1', title: 'Cost by category', type: 'bar', category: 'c1', second: '', measure: 'sum', value: 'c2', filters: [], sort: 'value' }]
function samplePage(n = 3) {
  let page = { ...conqPage(), columns: structuredClone(columns), insights: structuredClone(insights), colors: { Scrap: 2 } }
  let clock = Date.UTC(2026, 10, 20, 8), seed = 7
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < n; i++) page = upsertRow(page, { id: `r${i + 1}`, cells: { c1: i % 2 ? 'Rework' : 'Scrap', c2: `${100 + i} EUR`, c3: `Row ${i + 1}\nsecond line` } }, { by: `p${i}@example.com`, now: () => clock += 60_000, random })
  return n > 1000 ? withRowNumbers(page) : parseOnDemandPage(serializeOnDemandPage(page), 'conq')
}

test('OND-32: convert → read back equals the original — keys, IDs, logs, columns, insights, colours; the marker in place of the file (TC-OND-26)', async () => {
  const original = samplePage(5)
  const { files, page } = convertedFiles(original)
  assert.equal(Object.keys(files).filter((path) => path.includes('/rows/')).length, 5)
  assert.ok(isMovedMarker(files['on-demand/conq.json']))
  assert.throws(() => parseOnDemandPage(files['on-demand/conq.json'], 'conq'), /is not an On-Demand page/, 'an older app reports the marker, never reads it as a page')
  const rows = Object.entries(files).filter(([path]) => path.includes('/rows/')).map(([path, text]) => ({ name: path.split('/').pop(), text }))
  const back = assembleRowPage('conq', files[pageJsonPath('conq')], rows.reverse())
  assert.deepEqual(back, { ...original, storage: 'rows' })
  assert.deepEqual(back, page)
  assert.equal(JSON.parse(files['on-demand/conq/counter.json']).next, 6)
  // Through the fake GitHub: one commit (no file by file), then read back from the folder.
  const gh = fakeGitHub({ files: { 'on-demand/conq.json': serializeOnDemandPage(original) } })
  const done = await convertPage(config, 'token', 'conq', (entry) => `${entry.name}: convert`, gh.fetch)
  assert.match(done.commitUrl, /commit\/[0-9a-f]{40}$/)
  assert.equal(gh.writes.length, 1, 'one commit')
  assert.equal(gh.writes[0].paths.length, 5 + 3)
  const read = await loadRowPage(config, 'token', 'conq', new Map(), gh.fetch)
  assert.deepEqual(read.page, { ...original, storage: 'rows' })
  await assert.rejects(convertPage(config, 'token', 'conq', () => 'again', gh.fetch), /already holds row files/)
})

test('OND-32: rows from before keys or IDs get them on conversion, as their next save would (TC-OND-26)', () => {
  const page = { ...conqPage(), columns: structuredClone(columns), rows: [{ id: 'r1', cells: { c1: 'Scrap' } }, { id: 'r2', seq: 4, cells: { c1: 'Rework' } }] }
  const { page: out } = convertedFiles(page)
  assert.ok(out.rows.every((row) => rowKeyPattern.test(row.key)))
  assert.deepEqual(out.rows.map((row) => row.seq), [5, 4])
  assert.deepEqual(withRowNumbers(withRowKeys(page)).rows.map((row) => row.seq), [5, 4])
})

test('OND-31, SM-106: a row key is a file name only when it is a key — no path outside the page folder (TC-OND-27)', () => {
  assert.equal(rowFilePath('conq', 'CONQ-261123-K7Q2'), 'on-demand/conq/rows/CONQ-261123-K7Q2.json')
  for (const bad of ['../access', 'CONQ-261123-K7Q2/../../x', 'conq-261123-k7q2', '', 'CONQ-261123-K7Q1', 'A'.repeat(9) + '-261123-K7Q2']) assert.throws(() => rowFilePath('conq', bad), /Not a valid row key/)
  assert.throws(() => rowFilePath('../x', 'CONQ-261123-K7Q2'), /Not a valid page id/)
  assert.equal(keyOfRowFile('CONQ-261123-K7Q2.json'), 'CONQ-261123-K7Q2')
  for (const name of ['..json', 'readme.md', 'CONQ-261123-K7Q2.json.bak', '../CONQ-261123-K7Q2.json']) assert.equal(keyOfRowFile(name), null)
  // A row file whose own key differs from its name: the name wins; an unknown file in the folder is ignored.
  const page = assembleRowPage('conq', serializeOnDemandPage({ ...conqPage(), columns }), [{ name: 'CONQ-261123-K7Q2.json', text: JSON.stringify({ id: 'r1', key: '../x', seq: 1, cells: { c1: 'Scrap' } }) }, { name: 'notes.txt', text: '{}' }])
  assert.deepEqual(page.rows.map((row) => row.key), ['CONQ-261123-K7Q2'])
})

test('OND-33: two clients add a row at the same moment — one counter update is refused, read again and retried: distinct IDs that never change (TC-OND-28)', async () => {
  const { files } = convertedFiles(samplePage(2))
  const gh = fakeGitHub({ files })
  // Both read the counter (next 3) before either writes: the second write is refused (the file changed) and retried.
  const realFetch = gh.fetch
  let firstReads = 0, release
  const gate = new Promise((resolve) => { release = resolve })
  const slow = async (url, init) => {
    const response = await realFetch(url, init)
    if (url.includes('counter.json') && (init?.method ?? 'GET') === 'GET' && firstReads < 2) { firstReads++; if (firstReads === 2) release(); await gate }
    return response
  }
  const page = { id: 'conq', name: 'CoNQ' }
  const [a, b] = await Promise.all([takeRowNumber(config, 't', page, 3, slow), takeRowNumber(config, 't', page, 3, slow)])
  assert.notEqual(a, b)
  assert.deepEqual([a, b].sort(), [3, 4])
  assert.equal(JSON.parse(gh.read('on-demand/conq/counter.json')).next, 5)
  assert.ok(gh.calls.filter((call) => call === 'PUT /repos/example/storage/contents/on-demand/conq/counter.json').length >= 3, 'one write was refused and retried')
  // A counter behind the rows never gives a number twice.
  assert.equal(await takeRowNumber(config, 't', page, 9, gh.fetch), 9)
})

test('OND-33: a new row is created as its own file, never replacing one — a key clash gets a new key (TC-OND-28)', async () => {
  const source = samplePage(1)
  const { files, page } = convertedFiles(source)
  const gh = fakeGitHub({ files })
  const taken = page.rows[0].key
  const created = await createRowFile(config, 't', { ...page, rows: [] }, { id: 'r9', key: taken, seq: 2, cells: { c1: 'Rework' } }, (row) => `CoNQ: add row ${row.key}`, '2026-11-23T10:00:00Z', gh.fetch, () => 0.5)
  assert.notEqual(created.row.key, taken)
  assert.ok(gh.read(rowFilePath('conq', created.row.key)))
  assert.equal(JSON.parse(gh.read(rowFilePath('conq', taken))).id, page.rows[0].id, 'the existing row is untouched')
})

test('OND-34: two saves of the same row merge field by field — the later save wins only for a field both changed; logs are united (TC-OND-29)', () => {
  const base = { id: 'r1', key: 'CONQ-261123-K7Q2', seq: 1, addedBy: 'a@x', addedAt: '2026-11-20T08:00:00.000Z', log: [{ id: 'l1', at: '2026-11-20T08:00:00.000Z', by: 'a@x', added: true, changes: [] }], cells: { c1: 'Scrap', c2: '100 EUR', c3: 'old' } }
  const mine = { ...base, log: [...base.log, { id: 'l2', at: '2026-11-21T08:00:00.000Z', by: 'b@x', changes: [] }], cells: { ...base.cells, c2: '200 EUR', c3: 'mine' } }
  const theirs = { ...base, log: [...base.log, { id: 'l3', at: '2026-11-21T09:00:00.000Z', by: 'c@x', changes: [] }], cells: { c1: 'Rework', c2: '100 EUR', c3: 'theirs' } }
  const later = JSON.parse(mergeRowText(serializeRow(base), serializeRow(mine), serializeRow(theirs), true))
  assert.deepEqual(later.cells, { c1: 'Rework', c2: '200 EUR', c3: 'mine' })
  assert.deepEqual(later.log.map((entry) => entry.id), ['l1', 'l2', 'l3'])
  const earlier = JSON.parse(mergeRowText(serializeRow(base), serializeRow(mine), serializeRow(theirs), false))
  assert.deepEqual(earlier.cells, { c1: 'Rework', c2: '200 EUR', c3: 'theirs' })
  // A value the later save cleared: cleared (c2 the other left, c3 the other changed too); c1 only the other changed.
  const cleared = JSON.parse(mergeRowText(serializeRow(base), serializeRow({ ...base, cells: { c1: 'Scrap' } }), serializeRow(theirs), true))
  assert.deepEqual(cleared.cells, { c1: 'Rework' })
  assert.equal(cleared.seq, 1)
})

test('OND-33: a column change touching values is one commit over the affected row files and page.json, applied to the rows as they are at that commit (TC-OND-28)', async () => {
  const { files } = convertedFiles(samplePage(4))
  const gh = fakeGitHub({ files })
  const rename = (page) => ({ ...page, columns: page.columns.map((column) => column.id === 'c1' ? { ...column, options: ['Scrap', 'Re-work'] } : column), rows: page.rows.map((row) => row.cells.c1 === 'Rework' ? { ...row, cells: { ...row.cells, c1: 'Re-work' } } : row) })
  await commitPageChange(config, 't', 'conq', rename, 'CoNQ: set up the columns', new Map(), gh.fetch)
  assert.equal(gh.writes.length, 1)
  assert.equal(gh.writes[0].paths.length, 3, 'page.json and the two Rework rows')
  const read = await loadRowPage(config, 't', 'conq', new Map(), gh.fetch)
  assert.deepEqual(read.page.rows.map((row) => row.cells.c1), ['Scrap', 'Re-work', 'Scrap', 'Re-work'])
  assert.deepEqual(diffPages(read.page, read.page), { head: false, added: [], updated: [], removed: [] })
})

test('OND-31: reading a row-file page reads only the rows changed since the last read; GraphQL batches, REST when GraphQL is refused (TC-OND-27)', async () => {
  const { files } = convertedFiles(samplePage(250))
  for (const graphql of [true, false]) {
    const gh = fakeGitHub({ files, graphql })
    const cache = new Map()
    const first = await loadRowPage(config, 't', 'conq', cache, gh.fetch)
    assert.equal(first.page.rows.length, 250)
    const blobCalls = gh.calls.filter((call) => call.startsWith('POST /graphql') || call.includes('/git/blobs/')).length
    assert.equal(blobCalls, graphql ? 3 : 250 + 3)
    const key = first.page.rows[10].key
    gh.put(rowFilePath('conq', key), serializeRow({ ...first.page.rows[10], cells: { c1: 'Rework' } }))
    gh.calls.length = 0
    const second = await loadRowPage(config, 't', 'conq', cache, gh.fetch)
    assert.equal(second.page.rows[10].cells.c1, 'Rework')
    assert.equal(gh.calls.filter((call) => call.startsWith('POST /graphql') || call.includes('/git/blobs/')).length, graphql ? 1 : 2, 'only the changed row is read')
  }
})

test('OND-31: page open time for 500 and 2,000 rows against one file (2,000 rows are over the 900 KB a single file may hold; timed as if it could) — measured with 40 ms per call (TC-OND-27)', async (t) => {
  for (const n of [500, 2000]) {
    const original = samplePage(n)
    const { files } = convertedFiles(original)
    const rows = fakeGitHub({ files, delay: 40 }), single = fakeGitHub({ files: { 'on-demand/conq.json': JSON.stringify(original) }, delay: 40 })
    let start = performance.now()
    const read = await loadRowPage(config, 't', 'conq', new Map(), rows.fetch)
    const rowMs = performance.now() - start
    assert.equal(read.page.rows.length, n)
    start = performance.now()
    await single.fetch('https://api.github.com/repos/example/storage/contents/on-demand?ref=main')
    await single.fetch('https://api.github.com/repos/example/storage/contents/on-demand/conq.json?ref=main')
    const singleMs = performance.now() - start
    t.diagnostic(`${n} rows: row files ${Math.round(rowMs)} ms in ${read.calls} calls; one file ${Math.round(singleMs)} ms in 2 calls`)
    // Comparable: a few round trips more than one file (the listing, page.json beside the rows' tree, batches of 100, 4 at a time).
    assert.ok(rowMs < singleMs + 40 * (3 + Math.ceil(n / 400)) + 1500, `${n} rows open in ${Math.round(rowMs)} ms`)
  }
})

test('OND-31: the marker keeps an old file from being read as a page; a missing folder is not a row-file page', async () => {
  assert.equal(isMovedMarker(movedMarker('conq')), true)
  assert.equal(isMovedMarker('{"kind":"on-demand-page"}'), false)
  const gh = fakeGitHub({ files: { 'on-demand/conq.json': serializeOnDemandPage(samplePage(1)) } })
  assert.equal(await loadRowPage(config, 't', 'conq', new Map(), gh.fetch), null)
})

test('OND-39, OND-40: a row hidden and shown again — kept with its ID, logged, left out of what everyone sees, merged; a deleted row\'s number is never given again (TC-OND-34)', () => {
  const page = samplePage(3)
  const hidden = setRowHidden(page, 'r2', true, { by: 'ben@example.com', now: () => Date.UTC(2026, 10, 23, 9) })
  const row = hidden.rows.find((entry) => entry.id === 'r2')
  assert.deepEqual(row.hidden, { by: 'ben@example.com', at: '2026-11-23T09:00:00.000Z' })
  assert.equal(row.log.at(-1).action, 'hidden')
  assert.deepEqual(row.cells, page.rows[1].cells, 'nothing else changes')
  assert.deepEqual(withoutHidden(hidden).rows.map((entry) => entry.id), ['r1', 'r3'])
  // Kept through the page file and a row file, and in both merges.
  const back = parseOnDemandPage(serializeOnDemandPage(hidden), 'conq')
  assert.equal(isRowHidden(back.rows[1]), true)
  assert.equal(back.rows[1].log.at(-1).action, 'hidden')
  const merged = parseOnDemandPage(mergeOnDemandText(serializeOnDemandPage(page), serializeOnDemandPage(hidden), serializeOnDemandPage(upsertRow(page, { id: 'r1', cells: { c1: 'Rework' } })), true), 'conq')
  assert.equal(isRowHidden(merged.rows[1]), true)
  assert.equal(merged.rows[0].cells.c1, 'Rework')
  const rowMerged = JSON.parse(mergeRowText(serializeRow(page.rows[1]), serializeRow(row), serializeRow({ ...page.rows[1], cells: { ...page.rows[1].cells, c3: 'other' } }), true))
  assert.equal(rowMerged.hidden.by, 'ben@example.com')
  assert.equal(rowMerged.cells.c3, 'other')
  const shown = setRowHidden(hidden, 'r2', false, { by: 'cleo@example.com' })
  assert.equal(shown.rows[1].hidden, undefined)
  assert.equal(shown.rows[1].log.at(-1).action, 'shown')
  assert.equal(rowSave(page, page.rows[1], 'hide', { by: 'ben@example.com' }).message, 'CoNQ: hide row CONQ-0002')
  // Delete the highest row: the next row still gets the next number, never the deleted one's.
  const deleted = rowSave(page, page.rows[2], 'delete')
  assert.equal(deleted.message, 'CoNQ: delete row CONQ-0003')
  const after = parseOnDemandPage(serializeOnDemandPage(upsertRow(deleted.page, { id: 'r9', cells: { c1: 'Scrap' } })), 'conq')
  assert.equal(after.rows.find((entry) => entry.id === 'r9').seq, 4)
})
