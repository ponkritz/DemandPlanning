import test from 'node:test'
import assert from 'node:assert/strict'
import { applyOnDemandReplace, distinctValues, onDemandReplaceCommit, onDemandReplacePlan, replaceError, replaceableColumns, sameValue } from '../src/replaceValues.ts'
import { parseOnDemandPage, serializeOnDemandPage } from '../src/onDemand.ts'
import { convertedFiles } from '../src/rowFiles.ts'
import { commitPageChange, loadRowPage } from '../src/rowPageGit.ts'
import { fakeGitHub } from '../e2e/fakeGitHub.mjs'

// OND-100…OND-102 Replace…: the match (whole cell, any case, spaces around ignored), the counts, the result,
// the History entries, locked and hidden rows. Synthetic data only.
const random = (() => { let seed = 11; return () => (seed = (seed * 16807) % 2147483647) / 2147483647 })()
const now = () => Date.UTC(2026, 10, 25, 9)

test('Replace: a cell matches as a whole, ignoring case and the spaces around it (TC-OND-98)', () => {
  assert.equal(sameValue('Alex Example', 'alex example'), true)
  assert.equal(sameValue('  ALEX EXAMPLE ', 'Alex Example'), true)
  assert.equal(sameValue('Alex Example Jr', 'Alex Example'), false, 'not a part of the cell')
  assert.equal(sameValue('Alex', 'Alex Example'), false)
  assert.equal(sameValue('', ''), false, 'an empty value to find matches nothing')
  assert.equal(sameValue('Alex  Example', 'Alex Example'), false, 'spaces inside the value count')
})

test('Replace: the distinct values of a column with their row counts, most rows first, spellings merged (TC-OND-98)', () => {
  assert.deepEqual(distinctValues([['Alex Example'], ['alex example '], ['Sam Example'], [''], ['Alex Example'], ['Kim Example', 'Sam Example']]), [
    { value: 'Alex Example', count: 3 }, { value: 'Sam Example', count: 2 }, { value: 'Kim Example', count: 1 },
  ])
})

const page = () => ({
  schema: 1, kind: 'on-demand-page', id: 'releases', name: 'Releases', description: '', keyPrefix: 'REL', insights: [],
  columns: [
    { id: 'c1', name: 'Release', type: 'text', options: [], required: true },
    { id: 'c2', name: 'QE', type: 'text', options: [], required: false },
    { id: 'c3', name: 'Status', type: 'dropdown', options: ['Open', 'Done'], required: false },
    { id: 'c4', name: 'Reviewers', type: 'multi', options: ['Alex Example', 'Sam Example', 'Kim Example'], required: false },
    { id: 'c5', name: 'Hours', type: 'number', options: [], required: false },
  ],
  rows: [
    { id: 'r1', key: 'REL-261120-K7Q2', seq: 1, addedBy: 'ana@example.com', addedAt: '2026-11-20T08:00:00.000Z', log: [{ id: 'l1', at: '2026-11-20T08:00:00.000Z', by: 'ana@example.com', added: true, changes: [] }], cells: { c1: 'R 1.0', c2: 'Alex Example', c3: 'Open', c4: ['Alex Example', 'Kim Example'] } },
    { id: 'r2', key: 'REL-261120-M3P4', seq: 2, cells: { c1: 'R 1.1', c2: 'alex example', c4: ['Alex Example', 'Sam Example'] } },
    { id: 'r3', key: 'REL-261120-N4Q5', seq: 3, cells: { c1: 'R 1.2', c2: 'Alex Example' } },
    { id: 'r4', key: 'REL-261120-P5R6', seq: 4, hidden: { by: 'ana@example.com', at: '2026-11-21T08:00:00.000Z' }, cells: { c1: 'R 0.9', c2: 'Alex Example' } },
    { id: 'r5', key: 'REL-261120-Q6S7', seq: 5, cells: { c1: 'R 2.0', c2: 'Kim Example' } },
  ],
})

test('OND-100, OND-101: the On-Demand replace — locked rows skipped and counted, hidden rows left, a History entry per changed row (TC-OND-98)', () => {
  const locked = new Set(['REL-261120-N4Q5'])
  const plan = onDemandReplacePlan(page(), 'c2', 'Alex Example', 'Sam Example', { locked })
  assert.deepEqual(plan.changes.map((change) => [change.label, change.from, change.to]), [['REL-261120-K7Q2', 'Alex Example', 'Sam Example'], ['REL-261120-M3P4', 'alex example', 'Sam Example']])
  assert.equal(plan.locked, 1)
  assert.equal(plan.hidden, 1)
  const done = applyOnDemandReplace(page(), 'c2', 'Alex Example', 'Sam Example', { by: 'lead@example.com', locked, random, now })
  assert.equal(done.changed, 2)
  assert.equal(done.locked, 1)
  assert.deepEqual(done.page.rows.map((row) => row.cells.c2), ['Sam Example', 'Sam Example', 'Alex Example', 'Alex Example', 'Kim Example'])
  const entry = done.page.rows[0].log.at(-1)
  assert.deepEqual({ ...entry, id: 'x' }, { id: 'x', at: '2026-11-25T09:00:00.000Z', by: 'lead@example.com', comment: 'Replaced “Alex Example” with “Sam Example” in QE', changes: [{ column: 'c2', from: 'Alex Example', to: 'Sam Example' }] })
  assert.equal(done.page.rows[0].log.length, 2, 'the earlier log is kept')
  assert.equal(done.page.rows[2].log, undefined, 'the locked row has no new entry')
  // The History entry and its comment are kept when the page is written and read back.
  const read = parseOnDemandPage(serializeOnDemandPage(done.page), 'releases')
  assert.equal(read.rows[1].log.at(-1).comment, 'Replaced “Alex Example” with “Sam Example” in QE')
  assert.equal(onDemandReplaceCommit(page(), 'QE', 'Alex Example', 'Sam Example', 2), 'Releases: replace “Alex Example” with “Sam Example” in QE (2 rows)')
})

test('OND-100: Multi-select values are replaced one by one; Dropdown and Multi-select take only an option; Number, Currency and Date are not offered (TC-OND-98)', () => {
  const done = applyOnDemandReplace(page(), 'c4', 'alex example', 'Sam Example', { by: 'lead@example.com', random, now })
  assert.deepEqual(done.page.rows.slice(0, 2).map((row) => row.cells.c4), [['Sam Example', 'Kim Example'], ['Sam Example']], 'a value the list then holds twice is kept once')
  assert.equal(done.changed, 2)
  assert.deepEqual(replaceableColumns(page()).map((column) => column.name), ['Release', 'QE', 'Status', 'Reviewers'])
  const columns = page().columns
  assert.match(replaceError(columns[2], 'Open', 'Closed'), /“Closed” is not an option of Status/)
  assert.equal(replaceError(columns[2], 'Open', 'Done'), '')
  assert.match(replaceError(columns[4], '1', '2'), /Number column/)
  assert.equal(replaceError(columns[1], ' ', 'Sam'), 'Choose or type the value to find.')
  assert.equal(replaceError(columns[1], 'Alex', ' '), 'Type the new value.')
})

test('OND-101: on a page of row files the replace writes every changed row file in one commit, applied to the rows as they are in Git (TC-OND-98)', async () => {
  const { files } = convertedFiles(page())
  const gh = fakeGitHub({ files })
  const config = { owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }
  await commitPageChange(config, 't', 'releases', (base) => applyOnDemandReplace(base, 'c2', 'Alex Example', 'Sam Example', { by: 'lead@example.com', random, now }).page, 'Releases: replace', new Map(), gh.fetch)
  assert.equal(gh.writes.length, 1, 'one commit')
  assert.equal(gh.writes[0].paths.length, 3, 'the three visible rows that held Alex Example')
  const read = await loadRowPage(config, 't', 'releases', new Map(), gh.fetch)
  assert.deepEqual(read.page.rows.map((row) => row.cells.c2), ['Sam Example', 'Sam Example', 'Sam Example', 'Alex Example', 'Kim Example'])
  assert.equal(read.page.rows[2].log.at(-1).comment, 'Replaced “Alex Example” with “Sam Example” in QE')
})
