import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { menuOf, navigate, startApp, text } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'
import { readXlsx, unzip, writeXlsx } from '../src/xlsx.ts'

// Bulk upload (OND-103…OND-108; TC-OND-99 and TC-OND-100, UAT): on an On-Demand Table page, ⋯ → Download Excel template…
// gives the page's columns with data validation; ⋯ → Upload Excel… reads a filled file (made here with the app's own
// writer) with two new rows, one update, one unchanged row and one row with an error, previews the counts and saves the
// valid rows to the mocked GitHub (e2e/fakeGitHub.mjs) with a History entry each. Synthetic data only; every step waits
// for what it needs, never for a time. BULK_SHOTS=<folder> saves the screenshots (1440 px, light, scale 2).
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const lead = 'lead@example.com'
const policy = () => { const value = defaultPolicy(); value.defaultRole = 'Team Member'; value.members = { [lead]: ['Tool Owner'] }; return serializeAccess(value) }
const layout = () => JSON.stringify({ schema: 1, kind: 'menu-layout', groups: {}, pages: { 'supplier-issues': { type: 'table', group: 'on-demand', order: 1, icon: '▦', owners: [] } } })
const suppliers = Array.from({ length: 30 }, (_, i) => `Example Supplier ${String(i + 1).padStart(2, '0')}`)
const issues = () => JSON.stringify({
  schema: 1, kind: 'on-demand-page', id: 'supplier-issues', name: 'Supplier issues', description: 'Issues found at suppliers', keyPrefix: 'SUP',
  columns: [
    { id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Warranty'], required: true },
    { id: 'c2', name: 'Supplier', type: 'dropdown', options: suppliers, required: false },
    { id: 'c3', name: 'Tags', type: 'multi', options: ['Customer', 'Internal', 'Audit'], required: false },
    { id: 'c4', name: 'Cost', type: 'number', options: [], required: false },
    { id: 'c5', name: 'Found on', type: 'date', options: [], required: false },
  ],
  rows: [
    { id: 'r1', key: 'SUP-261120-K7Q2', seq: 1, addedBy: 'ana@example.com', addedAt: '2026-11-20T08:00:00.000Z', cells: { c1: 'Scrap', c2: 'Example Supplier 03', c3: ['Customer', 'Audit'], c4: '100', c5: '2026-11-02' } },
    { id: 'r2', key: 'SUP-261120-M3P4', seq: 2, addedBy: 'ana@example.com', addedAt: '2026-11-20T08:05:00.000Z', cells: { c1: 'Rework', c4: '200' } },
    { id: 'r3', key: 'SUP-261120-N4Q5', seq: 3, addedBy: 'ana@example.com', addedAt: '2026-11-20T08:10:00.000Z', cells: { c1: 'Warranty' } },
  ],
  insights: [],
})
const repository = () => fakeGitHub({ files: { 'access.json': policy(), 'menu-layout.json': layout(), 'on-demand/supplier-issues.json': issues() } })
const shots = process.env.BULK_SHOTS

async function open(gh) {
  const context = await app.browser.newContext({ viewport: { width: shots ? 1440 : 1300, height: 1000 }, deviceScaleFactor: shots ? 2 : 1, acceptDownloads: true })
  await context.addInitScript((work) => {
    localStorage.setItem('demand-planning-setup-guide-v1', 'dismissed')
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', work)
  }, lead)
  await context.route('https://dev.azure.com/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await context.route('https://api.github.com/**', gh.route)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const slowdown = Number(process.env.E2E_CPU_SLOWDOWN ?? 1)
  if (slowdown > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: slowdown })
  // The guide that opens when Azure DevOps cannot be read is closed whenever it shows.
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, () => guide.getByRole('button', { name: 'Close', exact: true }).last().click())
  await page.goto(app.url)
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors }
}
const until = async (check, what) => { for (let i = 0; i < 400; i++) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 50)) } throw new Error(`Timed out waiting for ${what}`) }
async function shoot(page, name) {
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.screenshot({ path: `${shots}/${name}-1440-light.png` })
}
async function openPage(gh) {
  const opened = await open(gh)
  await navigate(opened.page, 'Supplier issues')
  await opened.page.locator('.od-panel table tbody tr', { hasText: 'SUP-0003' }).waitFor()
  return opened
}

test('TC-OND-99: ⋯ → Download Excel template… gives the page’s columns with the rows shown, their Row IDs and data validation', async () => {
  const gh = repository()
  const { page, context, errors } = await openPage(gh)
  const menu = await menuOf(page, 'page Supplier issues')
  await menu.getByRole('menuitem', { name: 'Download Excel template…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Download Excel template' })
  await dialog.waitFor()
  assert.equal(await text(dialog.locator('.eyebrow')), 'ON-DEMAND · SUPPLIER ISSUES')
  assert.equal(await dialog.getByRole('radio', { name: 'With the 3 rows shown' }).isChecked(), true, 'the rows shown, preselected')
  assert.equal(await dialog.getByRole('radio', { name: 'Empty template' }).isChecked(), false)
  await shoot(page, 'bulk-upload-template')
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download template', exact: true }).click()])
  assert.equal(download.suggestedFilename(), 'Supplier issues - upload template.xlsx')
  await dialog.waitFor({ state: 'detached' })
  const bytes = new Uint8Array(readFileSync(await download.path()))
  const sheets = await readXlsx(bytes)
  assert.deepEqual(sheets.map((sheet) => sheet.name), ['Supplier issues', 'Lists'])
  assert.deepEqual(sheets[0].rows, [
    ['Row ID', 'Category', 'Supplier', 'Tags', 'Cost', 'Found on'],
    ['SUP-0001', 'Scrap', 'Example Supplier 03', 'Customer; Audit', '100', '2026-11-02'],
    ['SUP-0002', 'Rework', '', '', '200'],
    ['SUP-0003', 'Warranty'],
  ])
  const files = await unzip(bytes)
  const sheet = new TextDecoder().decode(files.get('xl/worksheets/sheet1.xml'))
  assert.match(sheet, /<dataValidations count="\d+">/)
  assert.match(sheet, /<dataValidation type="list"[^>]*sqref="B2:B2001"><formula1>&quot;Scrap,Rework,Warranty&quot;<\/formula1>/, 'Category: an inline list')
  assert.match(sheet, /<dataValidation type="list"[^>]*sqref="C2:C2001"><formula1>'Lists'!\$A\$2:\$A\$31<\/formula1>/, 'Supplier: too long inline, a range on the Lists sheet')
  assert.match(sheet, /<dataValidation type="decimal"[^>]*sqref="E2:E2001">/)
  assert.match(sheet, /<dataValidation type="date"[^>]*sqref="F2:F2001">/)
  assert.match(new TextDecoder().decode(files.get('xl/workbook.xml')), /<sheet name="Lists" sheetId="2" state="hidden"/)
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-OND-100: ⋯ → Upload Excel… — 2 rows added, 1 updated, 1 unchanged, 1 with an error in the preview; Save to Git saves the valid rows with a History entry each', async () => {
  const gh = repository()
  const { page, context, errors } = await openPage(gh)
  const filled = writeXlsx([{ name: 'Supplier issues', rows: [
    ['Row ID', 'Category', 'Supplier', 'Tags', 'Cost', 'Found on', 'Comment'],
    ['SUP-0001', 'Scrap', 'Example Supplier 03', 'Customer; Audit', 100, { date: new Date(2026, 10, 2), time: false }, ''],
    ['SUP-0002', 'Rework', '', '', 250, '', 'raised'],
    ['', 'Scrap', 'Example Supplier 07', 'Internal; Audit', 75.5, { date: new Date(2026, 10, 24), time: false }, ''],
    ['', 'warranty', '', 'customer', '', '', ''],
    ['', 'Junk', '', '', 'many', '', ''],
  ] }])
  const menu = await menuOf(page, 'page Supplier issues')
  await menu.getByRole('menuitem', { name: 'Upload Excel…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Upload Excel' })
  await dialog.waitFor()
  assert.equal(await text(dialog.locator('.eyebrow')), 'ON-DEMAND · SUPPLIER ISSUES')
  const save = dialog.getByRole('button', { name: 'Save to Git', exact: true })
  assert.equal(await save.isDisabled(), true, 'no file yet')
  await dialog.getByLabel('Excel or CSV file').setInputFiles({ name: 'Supplier issues - filled.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(filled) })
  const preview = dialog.getByRole('status', { name: 'Preview' })
  await preview.getByText('2 added · 1 updated · 1 unchanged · 1 with errors').waitFor()
  const shown = await text(preview)
  assert.match(shown, /Ignored column \(not a column of Supplier issues\): “Comment”/)
  assert.match(shown, /3 SUP-0002 Update Cost: 200 → 250/)
  assert.match(shown, /4 new Add Category: Scrap; Supplier: Example Supplier 07; Tags: Internal, Audit; Cost: 75.5; Found on: 2026-11-24/)
  assert.match(shown, /6 new Error “Junk” is not an option of Category; “Cost” is not a number: “many”/)
  assert.match(await text(dialog), /Only the 3 valid rows are saved to Git; the 1 with errors are left out/)
  await dialog.getByRole('button', { name: 'Download error report (CSV)' }).waitFor()
  await shoot(page, 'bulk-upload-preview')
  await save.click()
  await dialog.waitFor({ state: 'detached' })
  await until(() => (gh.read('on-demand/supplier-issues.json') ?? '').includes('Bulk upload from Supplier issues - filled.xlsx'), 'the upload saved to Git')
  const saved = JSON.parse(gh.read('on-demand/supplier-issues.json'))
  assert.deepEqual(saved.rows.map((row) => [row.seq, row.cells.c1, row.cells.c4 ?? '']), [[1, 'Scrap', '100'], [2, 'Rework', '250'], [3, 'Warranty', ''], [4, 'Scrap', '75.5'], [5, 'Warranty', '']])
  assert.deepEqual(saved.rows[3].cells.c3, ['Internal', 'Audit'])
  assert.deepEqual(saved.rows[4].cells.c3, ['Customer'], 'an option in its own spelling')
  assert.deepEqual(saved.rows.map((row) => (row.log ?? []).at(-1)?.comment ?? ''), ['', 'Bulk upload from Supplier issues - filled.xlsx', '', 'Bulk upload from Supplier issues - filled.xlsx', 'Bulk upload from Supplier issues - filled.xlsx'])
  assert.equal(saved.rows[3].addedBy, lead)
  assert.ok(gh.writes.some((entry) => entry.message.includes('Supplier issues: bulk upload from Supplier issues - filled.xlsx (2 rows added, 1 row updated)')), `the commit names the upload: ${gh.writes.map((entry) => entry.message).join(' | ')}`)
  await page.locator('.od-panel table tbody tr', { hasText: 'SUP-0005' }).waitFor()
  // The result is in Background jobs.
  await page.locator('.jobs-button').click()
  const jobs = page.getByRole('dialog', { name: 'Background jobs' })
  await jobs.getByText('Bulk upload · Supplier issues · Supplier issues - filled.xlsx').waitFor()
  assert.match(await text(jobs), /2 rows added, 1 row updated; 1 row with errors not saved/)
  assert.deepEqual(errors, [])
  await context.close()
})
