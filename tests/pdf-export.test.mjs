import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { cssString, defaultPdfOptions, desktopPdfRequest, exportStamp, footerText, pageRule, pdfFileName, printableWidth, safeName } from '../src/printExport.ts'
const { pdfRequest, footerTemplate, printOptions, savePdf } = createRequire(import.meta.url)('../electron/pdf-export.cjs')

const at = new Date('2026-11-24T13:32:00Z')

test('OND-71: the footer’s date and time of the export in the person’s own time zone, with the zone’s name (TC-OND-55)', () => {
  assert.equal(exportStamp(at, { date: true, time: true }, 'Europe/Berlin'), '24 Nov 2026, 14:32 CET')
  assert.equal(exportStamp(new Date('2026-07-01T08:05:00Z'), {}, 'Europe/Berlin'), '1 Jul 2026, 10:05 CEST')
  assert.equal(exportStamp(at, { date: true, time: false }, 'Europe/Berlin'), '24 Nov 2026')
  assert.equal(exportStamp(at, { date: false, time: true }, 'UTC'), '13:32 UTC')
  assert.equal(exportStamp(at, { date: false, time: false }, 'UTC'), '')
  // Another zone, another day: the date is the person's own.
  assert.equal(exportStamp(new Date('2026-11-24T23:30:00Z'), {}, 'Asia/Kolkata'), '25 Nov 2026, 05:00 GMT+5:30')
  assert.equal(footerText({ pageName: 'CoNQ', stamp: '24 Nov 2026, 14:32 CET', sample: false }), 'CoNQ · Exported 24 Nov 2026, 14:32 CET')
  assert.equal(footerText({ pageName: 'CoNQ\n', stamp: '', sample: true }), 'CoNQ · Sample data')
})

test('OND-69, OND-72: the print view’s page rule, paper widths and file name (TC-OND-56)', () => {
  assert.deepEqual(defaultPdfOptions(['i1', 'i2']), { charts: ['i1', 'i2'], filters: true, paper: 'A4', orientation: 'landscape', footerDate: true, footerTime: true })
  const footer = 'CoNQ · Exported 24 Nov 2026, 14:32 CET'
  const numbered = pageRule({ paper: 'A4', orientation: 'landscape' }, footer, { pageNumbers: true })
  assert.match(numbered, /^@page \{ size: A4 landscape; margin: 12mm 12mm 16mm; @bottom-left \{ content: "CoNQ · Exported 24 Nov 2026, 14:32 CET";/)
  assert.match(numbered, /@bottom-right \{ content: "Page " counter\(page\) " of " counter\(pages\);/)
  assert.equal(pageRule({ paper: 'Letter', orientation: 'portrait' }, footer, { pageNumbers: false }), '@page { size: Letter portrait; margin: 12mm 12mm 16mm; }', 'no page margin boxes: no numbers')
  assert.doesNotMatch(pageRule({ paper: 'A4', orientation: 'portrait' }, footer, { pageNumbers: true, desktop: true }), /bottom/, 'the desktop app draws its own footer')
  // A page name cannot leave its CSS string.
  assert.equal(cssString('A "quoted" \\ name\n} body { x'), '"A \\"quoted\\" \\\\ name } body { x"')
  assert.equal(cssString('</style><script>'), '"\\3c /style>\\3c script>"')
  assert.equal(printableWidth('A4', 'portrait'), 702)
  assert.equal(printableWidth('A4', 'landscape'), 1031)
  assert.ok(printableWidth('Letter', 'portrait') > printableWidth('A4', 'portrait'))
  assert.equal(pdfFileName('CoNQ', false, at, 'Europe/Berlin'), 'CoNQ-2026-11-24.pdf')
  assert.equal(pdfFileName('Cost / Quality: Q4', true, at, 'UTC'), 'Sample-Cost - Quality- Q4-2026-11-24.pdf')
  assert.equal(safeName('../../etc'), 'etc')
  assert.deepEqual(desktopPdfRequest({ ...defaultPdfOptions([]), paper: 'Letter', orientation: 'portrait' }, 'CoNQ.pdf', footer), { fileName: 'CoNQ.pdf', paper: 'Letter', landscape: false, footer })
})

test('OND-69: the desktop handler checks the request, prints with the footer template and saves where the person chose (TC-OND-57)', async () => {
  const request = { fileName: 'CoNQ-2026-11-24.pdf', paper: 'A4', landscape: true, footer: 'CoNQ · Exported 24 Nov 2026, 14:32 CET · <b>x</b>' }
  assert.deepEqual(pdfRequest(request), request)
  for (const bad of [{ ...request, fileName: '../x.pdf' }, { ...request, fileName: 'x.exe' }, { ...request, fileName: 'C:\\x.pdf' }, { ...request, paper: 'A3' }, { ...request, landscape: 'yes' }, { ...request, footer: '' }, { ...request, footer: 'x'.repeat(301) }, null]) assert.throws(() => pdfRequest(bad))
  const template = footerTemplate(request.footer)
  assert.match(template, /&lt;b&gt;x&lt;\/b&gt;/, 'the footer text is escaped')
  assert.match(template, /Page <span class="pageNumber"><\/span> of <span class="totalPages"><\/span>/)
  const options = printOptions(pdfRequest(request))
  assert.equal(options.displayHeaderFooter, true)
  assert.equal(options.pageSize, 'A4')
  assert.equal(options.landscape, true)
  assert.equal(options.printBackground, true)
  // Fakes for printToPDF, the save dialog and the file system.
  const calls = []
  const fakes = (choice) => ({
    print: async (given) => { calls.push(['print', given.pageSize]); return Buffer.from('%PDF-1.7') },
    showSaveDialog: async (given) => { calls.push(['dialog', given.defaultPath]); return choice },
    writeFile: async (target, bytes) => { calls.push(['write', target, bytes.toString()]) },
    defaultDir: '/home/me/Documents',
  })
  assert.deepEqual(await savePdf(request, fakes({ canceled: false, filePath: '/home/me/Reports/CoNQ' })), { saved: true, path: '/home/me/Reports/CoNQ.pdf' })
  assert.deepEqual(calls, [['print', 'A4'], ['dialog', path.join('/home/me/Documents', 'CoNQ-2026-11-24.pdf')], ['write', '/home/me/Reports/CoNQ.pdf', '%PDF-1.7']])
  calls.length = 0
  assert.deepEqual(await savePdf(request, fakes({ canceled: true })), { saved: false })
  assert.deepEqual(calls.map((call) => call[0]), ['print', 'dialog'], 'nothing written when cancelled')
  await assert.rejects(savePdf({ ...request, fileName: 'x' }, fakes({ canceled: true })), /Invalid PDF file name/)
})
