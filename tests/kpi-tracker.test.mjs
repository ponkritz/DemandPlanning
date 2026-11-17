import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { checkTrackerUrl, kpiLimits, parseTracker, serializeTracker, sheetTable, trackerFromWorkbook } from '../src/kpiTracker.ts'
const { sharePointFileUrl, fileContentUrl, readSharePointFile } = createRequire(import.meta.url)('../electron/sharepoint-file.cjs')

const link = 'https://example.sharepoint.com/sites/Quality/Shared Documents/KPI/KPI tracker.xlsx'

test('KPT-02: the SharePoint link is checked — https, a site, an .xlsx file, no credentials; a "/:x:/r/" link works too', () => {
  const file = sharePointFileUrl({ fileUrl: link })
  assert.deepEqual(file, { origin: 'https://example.sharepoint.com', host: 'example.sharepoint.com', site: '/sites/Quality', path: '/sites/Quality/Shared Documents/KPI/KPI tracker.xlsx', name: 'KPI tracker.xlsx' })
  assert.equal(sharePointFileUrl({ fileUrl: 'https://example.sharepoint.com/:x:/r/sites/Quality/Shared%20Documents/KPI%20tracker.xlsx?d=w123&web=1' }).path, '/sites/Quality/Shared Documents/KPI tracker.xlsx')
  assert.throws(() => sharePointFileUrl({ fileUrl: 'http://example.sharepoint.com/sites/Q/a.xlsx' }), /https/)
  assert.throws(() => sharePointFileUrl({ fileUrl: 'https://me:pw@example.sharepoint.com/sites/Q/a.xlsx' }), /password/)
  assert.throws(() => sharePointFileUrl({ fileUrl: 'https://example.sharepoint.com/personal/a/b.xlsx' }), /site/)
  assert.throws(() => sharePointFileUrl({ fileUrl: 'https://example.sharepoint.com/sites/Q/a.docx' }), /\.xlsx/)
  assert.throws(() => sharePointFileUrl({ fileUrl: 'https://example.sharepoint.com/sites/Q/a%2F..%2Fb.xlsx' }), /site/, 'an encoded .. is refused')
  assert.throws(() => checkTrackerUrl('https://example.sharepoint.com/sites/Q/a%2F..%2Fb.xlsx'), /site/)
  assert.equal(fileContentUrl(sharePointFileUrl({ fileUrl: "https://example.sharepoint.com/sites/Quality/Docs/Bob's KPI.xlsx" })), "https://example.sharepoint.com/sites/Quality/_api/web/GetFileByServerRelativeUrl('/sites/Quality/Docs/Bob''s%20KPI.xlsx')/$value")
  assert.equal(checkTrackerUrl(` ${link} `), link)
  assert.throws(() => checkTrackerUrl('https://example.sharepoint.com/sites/Q/a.csv'), /\.xlsx/)
})

test('KPT-02: the desktop read is one GET; sign-in pages, refusals, a missing file and non-Excel answers are reported', async () => {
  const calls = []
  const zip = new Uint8Array([0x50, 0x4b, 3, 4, 0, 0])
  const ok = await readSharePointFile({ fileUrl: link }, async (url, options) => { calls.push([url, options.method]); return new Response(zip, { status: 200, headers: { 'last-modified': 'Mon, 16 Nov 2026 10:00:00 GMT' } }) })
  assert.equal(ok.ok, true); assert.deepEqual([...ok.bytes], [...zip]); assert.equal(ok.name, 'KPI tracker.xlsx'); assert.match(ok.modified, /2026/)
  assert.deepEqual(calls.map(([, method]) => method), ['GET'], 'one GET, nothing written')
  assert.match(calls[0][0], /\/_api\/web\/GetFileByServerRelativeUrl\('\/sites\/Quality\/Shared%20Documents\/KPI\/KPI%20tracker\.xlsx'\)\/\$value$/)
  const elsewhere = await readSharePointFile({ fileUrl: link }, async () => { const response = new Response('<html>login</html>', { status: 200 }); Object.defineProperty(response, 'url', { value: 'https://login.example.com/x' }); return response })
  assert.equal(elsewhere.signIn, true); assert.match(elsewhere.message, /sign-in page on login\.example\.com/)
  assert.equal((await readSharePointFile({ fileUrl: link }, async () => new Response('', { status: 403 }))).signIn, true)
  assert.match((await readSharePointFile({ fileUrl: link }, async () => new Response('', { status: 404 }))).message, /not found/)
  const page = await readSharePointFile({ fileUrl: link }, async () => new Response('<html>sign in</html>', { status: 200 }))
  assert.equal(page.ok, false); assert.equal(page.signIn, true, 'a page instead of the workbook')
  assert.match((await readSharePointFile({ fileUrl: link }, async () => { throw new Error('offline') })).message, /Could not reach/)
  assert.match((await readSharePointFile({ fileUrl: link }, async () => new Response(zip, { status: 200, headers: { 'content-length': String(30 * 1024 * 1024) } }))).message, /20 MB/)
})

test('KPT-03: the workbook is kept as text sheets within the limits; the Git copy is checked when read', () => {
  const sheets = [{ name: 'KPIs', rows: [['KPI', 'Target', 'Oct', ''], ['CAPA on time', '90%', '92%', ''], ['', '', '', ''], ['', '', '', '']] }, { name: 'Empty', rows: [['', '']] }]
  const tracker = trackerFromWorkbook(sheets, { fileUrl: link, fileName: 'KPI tracker.xlsx', readAt: '2026-11-17T08:00:00.000Z', readBy: 'Admin', modified: 'Mon' })
  assert.deepEqual(tracker.sheets, [{ name: 'KPIs', rows: [['KPI', 'Target', 'Oct'], ['CAPA on time', '90%', '92%']] }], 'empty rows, columns and sheets dropped')
  assert.equal(tracker.truncated, undefined)
  const back = parseTracker(serializeTracker(tracker))
  assert.deepEqual(back, tracker, 'round trip')
  const big = trackerFromWorkbook([{ name: 'Big', rows: Array.from({ length: kpiLimits.rows + 5 }, (_, at) => [`r${at}`, 'x'.repeat(kpiLimits.cell + 10)]) }], { fileUrl: link, fileName: 'b.xlsx', readAt: '', readBy: '' })
  assert.equal(big.truncated, true); assert.equal(big.sheets[0].rows.length, kpiLimits.rows); assert.equal(big.sheets[0].rows[0][1].length, kpiLimits.cell)
  assert.throws(() => parseTracker('{'), /not valid JSON/)
  assert.throws(() => parseTracker('{"schema":2}'), /schema 1/)
  const odd = parseTracker(JSON.stringify({ schema: 1, fileUrl: 'javascript:alert(1)', sheets: [{ name: 'S', rows: [[1, null, 'a']] }] }))
  assert.equal(odd.fileUrl, '', 'a link that is not a SharePoint .xlsx link is dropped')
  assert.deepEqual(odd.sheets[0].rows, [['1', '', 'a']], 'cells become text')
})

test('KPT-04: a sheet shows as a table — the first row with text is the header; blank and repeated headings get names', () => {
  const table = sheetTable({ name: 'S', rows: [['', ''], ['KPI', '', 'KPI'], ['A', '1', '2'], ['', '', ''], ['B', '3']] })
  assert.deepEqual(table.headers, ['KPI', 'Column 2', 'KPI (2)'])
  assert.deepEqual(table.rows, [['A', '1', '2'], ['B', '3', '']])
  assert.deepEqual(sheetTable({ name: 'E', rows: [['']] }), { headers: [], rows: [] })
})
