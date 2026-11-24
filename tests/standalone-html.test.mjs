import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, existsSync, rmSync, promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildStandaloneHtml, embedJson, escapeHtml, inlineScript, inlineStyle, publishCsp, publishFileName, sha256Base64 } from '../src/standaloneHtml.ts'
import { cutDashboard, cutLine, cutTablePage, dashboardRows, dataElementId, publishedRow, readCut, readPublished, sourcePage } from '../src/publishData.ts'
import { pageDataset } from '../src/dashboardPages.ts'
import { resolveFilterSetup } from '../src/insightFilters.ts'
import { narrowViewerTable, offeredValues, viewerMonths, yearsIn } from '../src/standalone/viewerFilterRules.ts'
import { isDue, lastOccurrence, nextOccurrence, parsePublishKey, parseSchedules, publishKey, scheduleText } from '../src/publishSchedule.ts'
const { publishTargets } = createRequire(import.meta.url)('../electron/html-publish.cjs')

// A CoNQ page: 8 rows over 2025 and 2026, one hidden, one without a date; the Insights filter row on Found on (period)
// and Department.
const columns = [
  { id: 'c1', name: 'Category <b>', type: 'dropdown', options: ['Scrap', 'Rework', 'Complaint'], required: false },
  { id: 'c2', name: 'Cost', type: 'currency', options: [], required: false, currency: 'EUR' },
  { id: 'c3', name: 'Found on', type: 'date', options: [], required: false },
  { id: 'c4', name: 'Department', type: 'dropdown', options: ['QRE', 'QA', 'Production'], required: false },
]
const cells = [
  ['Scrap', '1200 EUR', '2026-07-02', 'QRE'], ['Rework', '80 EUR', '2026-08-15', 'QRE'], ['Complaint', '450 EUR', '2026-10-01', 'QA'],
  ['Scrap', '5 EUR', '2026-09-09', 'QRE'], ['Scrap', '70 EUR', '2026-02-01', 'QRE'], ['Rework', '10 EUR', '2025-08-01', 'QRE'],
  ['Late </script><script>alert(1)</script>', '1 EUR', '2026-11-30', 'QRE'], ['Scrap', '2 EUR', '', 'QRE'],
]
const page = { schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ <script>', description: 'Cost & "quality"', keyPrefix: 'CONQ', columns, insightFilters: { period: 'c3', fields: ['c4'] },
  insights: [{ id: 'i1', title: 'Cost by category', type: 'bar', category: 'c1', second: '', measure: 'sum', value: 'c2', filters: [], sort: 'value' }],
  rows: cells.map(([c1, c2, c3, c4], index) => ({ id: `r${index + 1}`, seq: index + 1, key: `CONQ-2601-${index}`, addedBy: 'ana@example.com', addedAt: '2026-01-02T10:00:00.000Z', cells: { c1, c2, c3, c4 },
    ...(index === 1 ? { log: [{ id: 'l1', at: '2026-03-01T09:00:00.000Z', by: 'ben@example.com', changes: [{ column: 'c2', from: '9999 EUR', to: '80 EUR' }] }] } : {}),
    ...(index === 3 ? { hidden: { by: 'ana@example.com', at: '2026-10-01T10:00:00.000Z' } } : {}) })) }
const now = new Date('2026-11-24T14:32:00Z')
const q3q4 = { period: { years: [2026], quarters: ['2026-Q3', '2026-Q4'], months: [] }, fields: { c4: { values: ['QRE'] } } }
const cutOf = (choice, kind = 'table-insights', target = page) => cutTablePage(target, { kind, choice, publishedBy: 'Ana <Costa>', now, at: '24 Nov 2026, 15:32 CET' })

test('OND-91, OND-93: a table page publishes only the rows that pass the publisher’s filter row, never a hidden row, with the filters and counts in its header (TC-OND-90)', () => {
  const file = cutOf(q3q4)
  assert.deepEqual(file.sources[0].rows.map((row) => row.id), ['r1', 'r2', 'r7'], 'Q3–Q4 2026 and QRE; the hidden r4, r5 (Q1), r6 (2025), r3 (QA) and r8 (no date) left out')
  assert.deepEqual(file.meta.cut, ['Found on: Q3 2026, Q4 2026', 'Department: QRE'])
  assert.equal(file.meta.rows, 3)
  assert.equal(file.meta.all, 7, 'the rows that are not hidden')
  assert.equal(cutLine(file), 'Data published: Found on: Q3 2026, Q4 2026 · Department: QRE · 3 of 7 rows')
  assert.deepEqual(file.meta.notes, ['1 row without a date in Found on left out by the period.'])
  assert.equal(file.meta.by, 'Ana <Costa>')
  assert.equal(file.meta.atIso, now.toISOString())
  assert.equal(file.kind, 'table')
  assert.equal(file.charts, true)
  // A row as published: no update log (old values) and no hidden flag; the last change as who / when.
  const r2 = file.sources[0].rows[1]
  assert.deepEqual(Object.keys(r2).sort(), ['addedAt', 'addedBy', 'cells', 'id', 'key', 'seq', 'updatedAt', 'updatedBy'])
  assert.equal(r2.updatedBy, 'ben@example.com')
  assert.doesNotMatch(JSON.stringify(file), /9999|hidden|"log"/)
  assert.deepEqual(publishedRow({ id: 'x', cells: {} }), { id: 'x', cells: {} })
  // Nothing chosen: the current year (as the publisher sees it); without a filter row or on a Table page: every row not hidden.
  assert.deepEqual(cutOf({ period: { years: [], quarters: [], months: [] }, fields: {} }).sources[0].rows.map((row) => row.id), ['r1', 'r2', 'r3', 'r5', 'r7'])
  assert.equal(cutOf(q3q4, 'table').meta.rows, 7)
  assert.equal(cutOf(q3q4, 'table').charts, false)
  assert.equal(cutOf(q3q4, 'table').sources[0].insights.length, 0)
  const legacy = cutTablePage(page, { kind: 'table-insights', choice: q3q4, publishedBy: 'Ana', now, at: 'now', scheduled: true, previouslyFullTable: true })
  assert.deepEqual(legacy.sources[0].rows.map((row) => row.id), ['r1', 'r2', 'r3', 'r5', 'r6', 'r7', 'r8'], 'a previously approved table schedule keeps every nonhidden row')
  assert.deepEqual(legacy.sources[0].insightFilters, page.insightFilters, 'the offline viewer can still narrow the exported rows')
  const noRow = { ...page }; delete noRow.insightFilters
  assert.equal(cutLine(cutOf(q3q4, 'table-insights', noRow)), 'Data published: every row (no filter) · 7 of 7 rows')
  // Sample rows are never published.
  assert.throws(() => cutOf(q3q4, 'table-insights', { ...page, sample: true }), /Sample data is shown for CoNQ <script>: switch to Live to publish\./)
})

// A dashboard over CoNQ and a second page: KPI over CoNQ by Found on, a bar over CoNQ not by period, a pie over the issues
// by Opened, a block over the Time Writing hours; filters Department (CoNQ) and Supplier (issues).
const issues = { schema: 1, kind: 'on-demand-page', id: 'issues', name: 'Supplier issues', description: '', keyPrefix: 'SUP', insights: [],
  columns: [{ id: 'd1', name: 'Supplier', type: 'dropdown', options: ['Acme', 'Bolt'], required: false }, { id: 'd2', name: 'Opened', type: 'date', options: [], required: false }],
  rows: [['s1', 'Acme', '2026-08-01'], ['s2', 'Bolt', '2026-08-02'], ['s3', 'Acme', '2026-01-05'], ['s4', 'Acme', '2026-09-30']].map(([id, d1, d2]) => ({ id, cells: { d1, d2 } })) }
const block = (id, source, type, period, extra = {}) => ({ id, title: id, type, source, category: '', second: '', measure: 'count', value: '', filters: [], sort: 'value', period, tab: '', ...extra })
const dashboard = { schema: 1, kind: 'dashboard', id: 'quality', tabs: [{ id: 't1', name: 'Cost' }, { id: 't2', name: 'Suppliers' }],
  filters: [{ id: 'f1', source: 'page:conq', column: 'c4' }, { id: 'f2', source: 'page:issues', column: 'd1' }, { id: 'f3', source: 'hours:time-writing', column: 'x' }],
  blocks: [block('b1', 'page:conq', 'kpi', 'c3'), block('b2', 'page:issues', 'pie', 'd2', { category: 'd1', tab: 't2' }), block('b3', 'hours:time-writing', 'kpi', ''), block('b4', 'page:gone', 'kpi', '')] }
const cutBoard = (period, choices, pages = { conq: page, issues }) => cutDashboard({ name: 'Quality', description: '', dashboard, pageOf: (id) => pages[id] ?? null, period, choices, publishedBy: 'Ana', now, at: 'now' })

test('OND-92: a dashboard publishes, for each table page a block reads, only the rows a block counts with the publisher’s period and filters (TC-OND-91)', () => {
  const file = cutBoard({ years: [2026], quarters: ['2026-Q3'], months: [] }, { f1: ['QRE'], f2: ['Acme'], f9: ['x'] })
  assert.equal(file.kind, 'dashboard')
  assert.deepEqual(file.sources.map((source) => [source.id, source.rows.map((row) => row.id)]), [['conq', ['r1', 'r2']], ['issues', ['s1', 's4']]])
  assert.deepEqual(file.meta.cut, ['Period: Q3 2026', 'Department: QRE', 'Supplier: Acme'])
  assert.equal(file.meta.rows, 4)
  assert.equal(file.meta.all, 11)
  assert.deepEqual(file.dashboard.blocks.map((entry) => entry.id), ['b1', 'b2'], 'the hours block and the one over a page that is gone are left out')
  assert.deepEqual(file.dashboard.filters.map((filter) => filter.id), ['f1', 'f2'])
  assert.deepEqual(file.dashboard.tabs, dashboard.tabs)
  assert.deepEqual(file.meta.notes, ['1 block over the Time Writing hours is not published.', '1 block over a table page that is no longer there is left out.'])
  // A row counts when any block over its page counts it: a second block over CoNQ without a period keeps every QRE row.
  const both = { ...dashboard, blocks: [...dashboard.blocks, block('b5', 'page:conq', 'bar', '', { category: 'c1' })] }
  const dataset = pageDataset({ ...page, rows: page.rows.filter((row) => !row.hidden) })
  assert.deepEqual(dashboardRows(both.blocks, dataset, ['2026-07'], both.filters, { f1: ['QRE'] }).map((row) => row.id), ['r1', 'r2', 'r5', 'r6', 'r7', 'r8'])
  assert.deepEqual(dashboardRows(dashboard.blocks, dataset, ['2026-07'], dashboard.filters, {}).map((row) => row.id), ['r1'])
  // Nothing ticked: the current year; a page in Sample refuses the publish.
  assert.deepEqual(cutBoard({ years: [], quarters: [], months: [] }, {}).sources[0].rows.map((row) => row.id), ['r1', 'r2', 'r3', 'r5', 'r7'])
  assert.throws(() => cutBoard({ years: [], quarters: [], months: [] }, {}, { conq: page, issues: { ...issues, sample: true } }), /Sample data is shown for Supplier issues/)
})

test('OND-94: the file — the data block escaped, the viewer inline with its CSP hashes, no address, nothing but its own script and styles (TC-OND-92)', async () => {
  const viewer = { js: 'var s="</script><!-- x";document.title=s;', css: 'body{content:"</style>"}' }
  const file = cutOf(q3q4)
  file.sources[0].rows[2].cells.c1 = 'Late </script><script>alert(1)</script> <!-- \u2028\u2029 & https://example.com/not-a-link'
  const html = await buildStandaloneHtml(file, viewer)
  const script = inlineScript(viewer.js), style = inlineStyle(viewer.css)
  assert.equal(script, 'var s="<\\/script><\\!-- x";document.title=s;')
  assert.equal(style, 'body{content:"<\\/style>"}')
  const [scriptHash, styleHash] = [createHash('sha256').update(script).digest('base64'), createHash('sha256').update(style).digest('base64')]
  assert.equal(await sha256Base64(script), scriptHash)
  assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="${publishCsp(scriptHash, styleHash)}">`))
  assert.equal(publishCsp('a', 'b'), "default-src 'none'; script-src 'sha256-a'; style-src 'sha256-b'; img-src data:; base-uri 'none'; form-action 'none'")
  assert.ok(html.includes(`<script>${script}</script>`) && html.includes(`<style>${style}</style>`))
  // Exactly one script that runs, one data block, one style; no element that loads anything.
  assert.equal(html.match(/<script>/g).length, 1)
  assert.equal(html.match(/<script type="application\/json" id="dp-published">/g).length, 1)
  assert.doesNotMatch(html, /<(?:img|link|iframe|object|embed|form|base)\b|\s(?:src|href|action)=|@import|url\(/i)
  // The data block cannot end early: no "<" in it at all; it parses back to the same data.
  const block = html.slice(html.indexOf(`id="${dataElementId}">`) + dataElementId.length + 6, html.indexOf('</script>', html.indexOf(`id="${dataElementId}"`)))
  assert.doesNotMatch(block, /[<>\u2028\u2029]/)
  assert.deepEqual(readPublished(block), file)
  assert.equal(embedJson({ a: '</script>\u2028&' }), '{"a":"\\u003c/script\\u003e\\u2028\\u0026"}')
  assert.equal(readPublished('{"schema":2}'), null)
  assert.equal(readPublished('not json'), null)
  // The only address is a row's own text (as data); no token, Git path or repository anywhere.
  assert.deepEqual(html.match(/https?:\/\/[^\s"\\]*/g), ['https://example.com/not-a-link'])
  assert.doesNotMatch(html, /token|ghp_|api\.github|on-demand\/|dashboards\/|\.json"/i)
  // The title and the no-script line are escaped.
  assert.ok(html.includes('<title>CoNQ &lt;script&gt;</title>'))
  assert.ok(html.includes('Published by Ana &lt;Costa&gt; on 24 Nov 2026, 15:32 CET'))
  assert.equal(publishFileName('CoNQ / 2026'), 'CoNQ - 2026.html')
  assert.equal(escapeHtml(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;')
})

test('OND-95: the viewer’s filter row narrows within the published rows only — every year of the file when nothing is ticked, only the values found (TC-OND-93)', () => {
  const file = cutOf({ period: { years: [2025, 2026], quarters: [], months: [] }, fields: {} })
  const viewerPage = sourcePage(file.sources[0])
  const setup = resolveFilterSetup(viewerPage)
  const years = yearsIn(viewerPage.rows, [setup.period])
  assert.deepEqual(years, [2025, 2026])
  const empty = { period: { years: [], quarters: [], months: [] }, fields: {} }
  assert.equal(viewerMonths(empty.period, years, 2027), null, 'nothing ticked: no period')
  assert.deepEqual(narrowViewerTable(viewerPage, setup, empty, years, 2027).page.rows.map((row) => row.id), ['r1', 'r2', 'r3', 'r5', 'r6', 'r7'], 'every row of the file, also of another year than this one')
  // Q3 ticked without a year: Q3 of every year of the file.
  assert.deepEqual(narrowViewerTable(viewerPage, setup, { ...empty, period: { years: [], quarters: ['2025-Q3', '2026-Q3'], months: [] } }, years, 2027).page.rows.map((row) => row.id), ['r1', 'r2', 'r6'])
  assert.deepEqual(narrowViewerTable(viewerPage, setup, { period: { years: [2026], quarters: [], months: [] }, fields: { c4: { values: ['QA'] } } }, years, 2027).page.rows.map((row) => row.id), ['r3'])
  // Only the values found in the file's rows; "(none)" when a row has none.
  assert.deepEqual(offeredValues(sourcePage(cutOf(q3q4).sources[0]).rows, columns[3]), ['QRE'])
  assert.deepEqual(offeredValues(viewerPage.rows, columns[0]), ['Scrap', 'Rework', 'Complaint', ''], 'a value not in the list is offered through (none)')
})

test('OND-96: a schedule keeps the filters saved with it, read back strictly (TC-OND-96)', () => {
  const setAt = '2026-11-20T10:00:00.000Z'
  const repo = 'acme/storage@main:access.json', publisher = 'owner@example.com'
  const conqKey = publishKey(repo, publisher, 'conq'), boardKey = publishKey(repo, publisher, 'board'), oddKey = publishKey(repo, publisher, 'odd')
  const parsed = parseSchedules(JSON.stringify({
    [conqKey]: { mode: 'daily', day: 1, time: '07:00', setAt, cut: { kind: 'table', choice: q3q4 }, cutText: 'Found on: Q3 2026 · Department: QRE' },
    [boardKey]: { mode: 'weekly', day: 1, time: '07:00', setAt, cut: { kind: 'dashboard', period: { years: [2026], quarters: ['2026-Q3'], months: [] }, choices: { f1: ['QRE', 7], 'bad id!': ['x'] } } },
    [oddKey]: { mode: 'daily', day: 1, time: '07:00', setAt, cut: { kind: 'script' }, cutText: 'x' },
  }))
  assert.deepEqual(parsed[conqKey].cut, { kind: 'table', choice: q3q4 })
  assert.equal(parsed[conqKey].cutText, 'Found on: Q3 2026 · Department: QRE')
  assert.deepEqual(parsed[boardKey].cut, { kind: 'dashboard', period: { years: [2026], quarters: ['2026-Q3'], months: [] }, choices: { f1: ['QRE'] } })
  assert.equal(parsed[oddKey].cut, undefined)
  assert.equal(parsed[oddKey].cutText, undefined)
  assert.equal(parsed[oddKey].invalidCut, true, 'an invalid stored filter is distinguishable from a previously approved full table')
  assert.equal(readCut(null), undefined)
})

test('OND-78, OND-79: the schedule — due times with a fake clock, a missed run once at the next start, read back strictly (TC-OND-61)', () => {
  const at = (day, hour = 0, minute = 0) => new Date(2026, 10, day, hour, minute) // November 2026, local time
  const daily = { mode: 'daily', day: 1, time: '07:30', setAt: at(20, 12).toISOString() }
  assert.deepEqual(lastOccurrence(daily, at(23, 8)), at(23, 7, 30))
  assert.deepEqual(lastOccurrence(daily, at(23, 7)), at(22, 7, 30))
  assert.deepEqual(nextOccurrence(daily, at(23, 8)), at(24, 7, 30))
  assert.equal(isDue(daily, at(20, 13)), false, 'not for a time before the schedule was set')
  assert.equal(isDue(daily, at(21, 7, 29)), false)
  assert.equal(isDue(daily, at(21, 7, 30)), true)
  assert.equal(isDue({ ...daily, lastRun: at(21, 7, 30).toISOString() }, at(21, 18)), false, 'once per occurrence')
  // The app was closed from the 21st to the 24th: one run at the next start.
  const missed = { ...daily, lastRun: at(21, 7, 31).toISOString() }
  assert.equal(isDue(missed, at(24, 9)), true)
  assert.equal(isDue({ ...missed, lastRun: at(24, 9).toISOString() }, at(24, 9, 1)), false)
  // Weekly on Monday (23 Nov 2026 is a Monday).
  const weekly = { mode: 'weekly', day: 1, time: '06:00', setAt: at(18).toISOString() }
  assert.deepEqual(lastOccurrence(weekly, at(25, 12)), at(23, 6))
  assert.deepEqual(lastOccurrence(weekly, at(23, 5)), at(16, 6))
  assert.deepEqual(nextOccurrence(weekly, at(25)), at(30, 6))
  assert.equal(isDue(weekly, at(22, 23)), false)
  assert.equal(isDue(weekly, at(23, 6)), true)
  assert.equal(isDue({ ...weekly, mode: 'off' }, at(23, 6)), false)
  assert.equal(scheduleText(weekly), 'Weekly on Monday at 06:00')
  assert.equal(scheduleText(daily), 'Daily at 07:30')
  // Read back strictly.
  const target = publishKey('acme/storage@main:access.json', 'owner@example.com', 'conq')
  const other = publishKey('acme/storage@main:access.json', 'owner@example.com', 'other')
  const third = publishKey('acme/storage@main:access.json', 'owner@example.com', 'third')
  const parsed = parseSchedules(JSON.stringify({ [target]: { ...weekly, lastOk: false, lastText: 'Folder missing' }, conq: weekly, [other]: { ...daily, time: '25:00' }, [third]: { ...daily, mode: 'hourly', day: 9 } }))
  assert.equal(publishKey('acme/storage@main:access.json', ' Owner@EXAMPLE.COM ', 'conq'), target)
  assert.deepEqual(parsePublishKey(target), { repository: 'acme/storage@main:access.json', publisher: 'owner@example.com', pageId: 'conq' })
  assert.deepEqual(Object.keys(parsed), [target, third])
  assert.equal(parsed[target].lastOk, false)
  assert.equal(parsed[target].invalidCut, undefined)
  assert.equal(parsed[third].mode, 'off')
  assert.equal(parsed[third].day, 1)
  assert.deepEqual(parseSchedules('not json'), {})
})

test('OND-76: the desktop file is chosen, scoped to the repository and publisher, and overwritten using an exclusive temporary file (TC-OND-62)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dph-publish-'))
  try {
    const choices = []
    const temporary = []
    const storeFile = join(dir, 'targets.json')
    const repository = 'acme/storage@main:access.json'
    const owner = 'owner@example.com'
    const target = publishKey(repository, owner, 'conq')
    const differentPage = publishKey(repository, owner, 'other')
    const differentOwner = publishKey(repository, 'other@example.com', 'conq')
    const differentRepository = publishKey('acme/another@main:access.json', owner, 'conq')
    await fs.writeFile(storeFile, JSON.stringify({ conq: join(dir, 'Legacy.html') }))
    const io = { ...fs, open: async (file, flags, mode) => { temporary.push({ file, flags, mode }); return fs.open(file, flags, mode) } }
    const targets = publishTargets({ storeFile, fs: io, documentsDir: join(dir, 'Documents'), showSaveDialog: async (options) => { choices.push(options.defaultPath); return { canceled: false, filePath: join(dir, 'Shared', 'CoNQ') } } })
    assert.equal(await targets.target(target), null, 'the old unscoped preference is ignored')
    await assert.rejects(targets.write(target, '<!doctype html><p>x'), /No file is chosen/)
    await fs.mkdir(join(dir, 'Shared'))
    assert.deepEqual(await targets.choose(target, 'CoNQ.html'), { path: join(dir, 'Shared', 'CoNQ.html') })
    assert.equal(choices[0], join(dir, 'Documents', 'CoNQ.html'))
    assert.deepEqual(await targets.target(target), { path: join(dir, 'Shared', 'CoNQ.html') })
    assert.deepEqual(await targets.write(target, '<!doctype html><p>one'), { path: join(dir, 'Shared', 'CoNQ.html'), bytes: 21 })
    await targets.write(target, '<!doctype html><p>two')
    assert.equal(readFileSync(join(dir, 'Shared', 'CoNQ.html'), 'utf8'), '<!doctype html><p>two', 'the same file overwritten')
    assert.equal(new Set(temporary.map((entry) => entry.file)).size, 2)
    assert.ok(temporary.every((entry) => entry.flags === 'wx' && entry.mode === 0o600 && !existsSync(entry.file)))
    // The next dialog starts at the remembered file.
    await targets.choose(target, 'CoNQ.html')
    assert.equal(choices[1], join(dir, 'Shared', 'CoNQ.html'))
    // A page id or content that is not one is refused; another page has no file.
    await assert.rejects(targets.write('../etc', '<!doctype html>'), /Invalid publishing repository, person or page/)
    await assert.rejects(targets.write(target, '<p>no doctype'), /Invalid HTML/)
    for (const unrelated of [differentPage, differentOwner, differentRepository]) {
      assert.equal(await targets.target(unrelated), null)
      await assert.rejects(targets.write(unrelated, '<!doctype html>'), /No file is chosen/)
    }
    // The folder gone: said so.
    rmSync(join(dir, 'Shared'), { recursive: true })
    await assert.rejects(targets.write(target, '<!doctype html><p>three'), /The folder .* is missing/)
    assert.equal(existsSync(join(dir, 'Shared')), false)
    // Cancelled dialog: nothing remembered.
    const cancel = publishTargets({ storeFile: join(dir, 'targets.json'), fs, documentsDir: dir, showSaveDialog: async () => ({ canceled: true }) })
    assert.equal(await cancel.choose(differentPage, 'New.html'), null)
    assert.equal(await cancel.target(differentPage), null)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
