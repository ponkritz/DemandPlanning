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

// OND-136…OND-142 Start from a file (TC-OND-142, UAT; TC-OND-141): a Table (Build your own) page started from an .xlsx
// file in ＋ Add page… — the columns with their suggested types, one changed, the rows previewed — an empty page's Start
// from a file…, and a column the page does not have added from Upload Excel…. Synthetic data only.
const xlsxFile = (name, rows) => ({ name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(writeXlsx([{ name: name.replace(/\.xlsx$/, ''), rows }])) })
const day = (d) => ({ date: new Date(2026, 10, d), time: false })
const typeOf = (dialog, letter) => dialog.getByRole('combobox', { name: `Type of column ${letter}`, exact: true })

test('TC-OND-142: ＋ Add page… with Table (Build your own) and Start from a file — the suggested types checked and one changed, the rows previewed; Save to Git creates the columns and the valid rows in one commit', async () => {
  const gh = repository()
  const { page, context, errors } = await openPage(gh)
  await page.getByRole('button', { name: '＋ Add page…' }).first().click()
  const add = page.getByRole('dialog', { name: /^Add a page/ })
  await add.waitFor()
  const own = add.getByRole('checkbox', { name: 'Table (Build your own)', exact: true })
  assert.equal(await own.isChecked(), true)
  const field = add.getByLabel('Start from a file (optional)')
  await field.waitFor()
  // Only with Table (Build your own): gone with a Dashboard.
  await own.uncheck()
  await add.getByRole('checkbox', { name: 'Dashboard', exact: true }).check()
  await field.waitFor({ state: 'detached' })
  await add.getByRole('checkbox', { name: 'Dashboard', exact: true }).uncheck()
  await own.check()
  await field.setInputFiles(xlsxFile('Audit findings.xlsx', [
    ['Finding', 'Area', 'Severity', 'Found on', 'Cost', 'Note'],
    ['Label missing', 'Line 1', 'High', day(2), 120, '=SUM(A1)'],
    ['Torque too low', 'Line 2', 'Low', day(3), 80, ''],
    ['Scratch on cover', 'Line 1', 'High', day(5), 'n/a', ''],
    ['Wrong part number', 'Line 2', 'Low', day(9), 45.5, 'Checked twice'],
    ['Loose cable', 'Line 1', 'High', day(12), 10, ''],
    ['Missing washer', 'Line 2', 'Low', day(20), 15, ''],
  ]))
  await add.getByText('Audit findings.xlsx: 6 columns and 6 rows read.').waitFor()
  await add.getByLabel('Page name', { exact: true }).fill('Audit findings')
  await add.getByRole('button', { name: 'Add page', exact: true }).click()
  await add.waitFor({ state: 'detached' })

  // The new page opens with the Start from a file pop-up: each column with its suggested type.
  const dialog = page.getByRole('dialog', { name: 'Start from a file' })
  await dialog.waitFor()
  assert.equal(await text(dialog.locator('.eyebrow')), 'ON-DEMAND · AUDIT FINDINGS')
  assert.deepEqual(await Promise.all(['A', 'B', 'C', 'D', 'E', 'F'].map((letter) => typeOf(dialog, letter).inputValue())), ['text', 'dropdown', 'dropdown', 'date', 'text', 'text'])
  assert.match(await text(dialog), /2 options from the values: Line 1, Line 2/)
  assert.equal(await dialog.getByRole('checkbox', { name: 'Column A is required' }).isChecked(), false, 'Required starts unticked')
  const preview = dialog.getByRole('status', { name: 'Preview' })
  await preview.getByText('6 added · 0 updated · 0 unchanged · 0 with errors').waitFor()
  // Cost holds "n/a": suggested Text; made a Number, that row has an error and is left out.
  await typeOf(dialog, 'E').selectOption('number')
  await dialog.getByRole('checkbox', { name: 'Column A is required' }).check()
  await dialog.getByLabel('Name of column E').fill('Cost (EUR)')
  await preview.getByText('5 added · 0 updated · 0 unchanged · 1 with errors').waitFor()
  assert.match(await text(preview), /4 new Error “Cost \(EUR\)” is not a number: “n\/a”/)
  assert.match(await text(preview), /1 text value starting with =, \+, - or @ is stored with an apostrophe first/)
  assert.match(await text(dialog), /Save to Git adds the 6 columns to Audit findings and saves the 5 valid rows as one change; the 1 row with errors is left out/)
  await shoot(page, 'start-from-file-preview')
  await dialog.getByRole('button', { name: 'Save to Git', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  const pageFile = () => Object.keys(gh.files('main') ?? {}).find((path) => /^on-demand\/Audit findings--audit-findings\.json$/.test(path))
  await until(() => pageFile() && (gh.read(pageFile()) ?? '').includes('Missing washer'), 'the columns and rows saved to Git')
  const saved = JSON.parse(gh.read(pageFile()))
  assert.deepEqual(saved.columns.map((column) => [column.name, column.type, column.required === true]), [['Finding', 'text', true], ['Area', 'dropdown', false], ['Severity', 'dropdown', false], ['Found on', 'date', false], ['Cost (EUR)', 'number', false], ['Note', 'text', false]])
  assert.deepEqual(saved.columns[2].options, ['High', 'Low'])
  assert.equal(saved.rows.length, 5)
  assert.equal(saved.rows[0].cells[saved.columns[5].id], "'=SUM(A1)")
  assert.equal(saved.rows[0].log[0].comment, 'Bulk upload from Audit findings.xlsx')
  assert.ok(gh.writes.some((entry) => entry.message.startsWith('Audit findings: start from Audit findings.xlsx (6 columns, 5 rows added)')), gh.writes.map((entry) => entry.message).join(' | '))
  await page.locator('.od-panel table tbody tr', { hasText: 'Missing washer' }).waitFor()
  // Everything stays editable in Set up columns….
  await page.getByRole('button', { name: 'Set up columns…' }).click()
  const setup = page.getByRole('dialog', { name: 'Set up columns' })
  await setup.waitFor()
  assert.ok((await setup.locator('input').evaluateAll((inputs) => inputs.map((input) => input.value))).includes('Cost (EUR)'))
  await setup.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.locator('.jobs-button').click()
  const jobs = page.getByRole('dialog', { name: 'Background jobs' })
  await jobs.getByText('Start from a file · Audit findings · Audit findings.xlsx').waitFor()
  assert.match(await text(jobs), /6 columns added, 5 rows added, 0 rows updated; 1 row with errors not saved/)
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-OND-141: Upload Excel… lists a column the page does not have, unticked; ticked with its type it is added with its values in the same save', async () => {
  const gh = repository()
  const { page, context, errors } = await openPage(gh)
  const menu = await menuOf(page, 'page Supplier issues')
  await menu.getByRole('menuitem', { name: 'Upload Excel…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Upload Excel' })
  await dialog.waitFor()
  await dialog.getByLabel('Excel or CSV file').setInputFiles(xlsxFile('Supplier issues - priority.xlsx', [
    ['Row ID', 'Category', 'Priority', 'Comment'],
    ['SUP-0001', 'Scrap', 'High', 'first'],
    ['SUP-0002', 'Rework', 'Low', ''],
    ['SUP-0003', 'Warranty', 'High', ''],
    ['', 'Scrap', 'Low', 'new'],
  ]))
  const columns = dialog.getByRole('group', { name: 'Columns not on Supplier issues' })
  await columns.waitFor()
  const priority = columns.getByRole('checkbox', { name: 'Add “Priority” as a new column' })
  assert.equal(await priority.isChecked(), false, 'unticked by default')
  assert.equal(await columns.getByRole('combobox', { name: 'Type of Priority' }).inputValue(), 'dropdown')
  const preview = dialog.getByRole('status', { name: 'Preview' })
  await preview.getByText('1 added · 0 updated · 3 unchanged · 0 with errors').waitFor()
  assert.match(await text(preview), /Ignored columns \(not a column of Supplier issues\): “Priority”, “Comment”/)
  await priority.check()
  await preview.getByText('1 added · 3 updated · 0 unchanged · 0 with errors').waitFor()
  assert.match(await text(preview), /Ignored column \(not a column of Supplier issues\): “Comment”/)
  assert.match(await text(dialog), /Only the 4 valid rows are saved to Git, with the 1 new column/)
  await shoot(page, 'upload-new-column')
  await dialog.getByRole('button', { name: 'Save to Git', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  await until(() => (gh.read('on-demand/supplier-issues.json') ?? '').includes('"Priority"'), 'the new column saved to Git')
  const saved = JSON.parse(gh.read('on-demand/supplier-issues.json'))
  const added = saved.columns.at(-1)
  assert.deepEqual([added.name, added.type, added.options, added.required === true], ['Priority', 'dropdown', ['High', 'Low'], false])
  assert.deepEqual(saved.rows.map((row) => row.cells[added.id]), ['High', 'Low', 'High', 'Low'])
  assert.ok(gh.writes.some((entry) => entry.message.includes('(1 row added, 3 rows updated; 1 column added)')))
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-OND-143: an empty Build-your-own page offers Start from a file… next to Set up columns…; a file with many columns opens full size', async () => {
  const gh = fakeGitHub({ files: {
    'access.json': policy(),
    'menu-layout.json': JSON.stringify({ schema: 1, kind: 'menu-layout', groups: {}, pages: { 'empty-list': { type: 'table', group: 'on-demand', order: 1, icon: '▦', owners: [] } } }),
    'on-demand/empty-list.json': JSON.stringify({ schema: 1, kind: 'on-demand-page', id: 'empty-list', name: 'Empty list', description: '', keyPrefix: 'EMP', columns: [], rows: [], insights: [] }),
  } })
  const { page, context, errors } = await open(gh)
  await navigate(page, 'Empty list')
  await page.getByText('No columns yet.').waitFor()
  const actions = page.locator('.od-panel .button-row').first()
  assert.deepEqual((await actions.getByRole('button').allInnerTexts()).map((label) => label.trim()), ['Start from a file…', 'Set up columns…'])
  await actions.getByRole('button', { name: 'Start from a file…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Start from a file' })
  await dialog.waitFor()
  assert.equal(await dialog.getByRole('button', { name: 'Save to Git', exact: true }).isDisabled(), true)
  assert.match(await text(dialog.locator('.modal-actions')), /Choose an Excel \(\.xlsx\) or CSV file\./)
  const header = Array.from({ length: 14 }, (_, i) => `Field ${i + 1}`)
  const csv = [header.join(','), header.map((_, i) => String(i)).join(','), header.map((_, i) => String(i * 2)).join(',')].join('\r\n')
  await dialog.getByLabel('Excel or CSV file').setInputFiles({ name: 'fields.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await dialog.getByRole('status', { name: 'Preview' }).getByText('2 added · 0 updated · 0 unchanged · 0 with errors').waitFor()
  assert.equal(await page.locator('.modal.modal-full').count(), 1, 'more than 12 columns: full size')
  await dialog.getByRole('button', { name: 'Save to Git', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  await until(() => (gh.read('on-demand/empty-list.json') ?? '').includes('Field 14'), 'the columns saved')
  assert.equal(JSON.parse(gh.read('on-demand/empty-list.json')).rows.length, 2)
  assert.deepEqual(errors, [])
  await context.close()
})
