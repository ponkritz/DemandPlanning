import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fixture, navigate, openPage, startApp, text } from './helpers.mjs'

// Documentation, Windchill export and data-safety scenarios of the UAT (TC-DOC-01, TC-DOC-02, TC-CON-39, TC-CON-37,
// TC-STO-04, TC-INS-01), automated against the built web app.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

test('TC-DOC-01: the Documentation page has one tab per document in docs/, each rendered without raw Markdown', async () => {
  const { page, context, errors } = await openPage(app)
  await navigate(page, 'Documentation')
  const files = readdirSync(new URL('../docs/', import.meta.url)).filter((file) => file.endsWith('.md'))
  const tabs = page.getByRole('tablist', { name: 'Documents' }).getByRole('tab')
  assert.equal(await tabs.count(), files.length, `${files.length} tabs, one per document`)
  for (let index = 0; index < files.length; index += 1) {
    await tabs.nth(index).click()
    const panel = page.locator('.docs-panel')
    await panel.locator('h1, h2').first().waitFor()
    // The test plan itself quotes "|---|" and "**" as examples of raw Markdown, so only unrendered table rules are checked.
    const body = await panel.innerText()
    assert.doesNotMatch(body, /^\|---\|/m, `${await tabs.nth(index).innerText()} shows no raw Markdown`)
    assert.doesNotMatch(body, /^\*\*TC-/m, `${await tabs.nth(index).innerText()} renders bold text`)
    assert.match(body, /docs\/.+\.md · this build/)
  }
  for (const label of ['Validation package', 'Traceability matrix', 'Known issues', 'Software components', 'Security assessment', 'DFMEA', 'Development process']) {
    assert.equal(await tabs.filter({ hasText: label }).count(), 1, `${label} tab`)
  }
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-DOC-02: a link to another document opens it at the linked section, and Download .md downloads the document', async () => {
  const { page, context, errors } = await openPage(app)
  await navigate(page, 'Documentation')
  await page.getByRole('tab', { name: 'Requirements' }).click()
  await page.locator('.docs-panel a', { hasText: 'TEST-PLAN.md §7' }).first().click()
  assert.equal(await text(page.getByRole('tab', { selected: true })), 'Test plan')
  // Document headings are rendered one level down (the panel title is the h2), so a "##" section is an h3.
  await page.locator('.docs-panel h3', { hasText: '7. Requirements coverage matrix' }).waitFor()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download .md' }).click()])
  assert.equal(download.suggestedFilename(), 'TEST-PLAN.md')
  assert.equal(readFileSync(await download.path(), 'utf8'), readFileSync(new URL('../docs/TEST-PLAN.md', import.meta.url), 'utf8'))
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-CON-39 / TC-CON-37: a Windchill export lists its unique releases, clubbed names included, and exports a neutralised CSV', async () => {
  const { page, context, errors } = await openPage(app)
  await navigate(page, 'Import Windchill export')
  await page.locator('input[type=file]').first().setInputFiles(fixture('windchill-export.csv'))
  const releases = page.locator('.panel').filter({ has: page.locator('h2, h3', { hasText: /^Releases/ }) }).first()
  await releases.waitFor()
  await releases.getByLabel('Show').selectOption('all')
  const body = await text(releases)
  assert.match(body, /5 releases · 6 of 7 documents · 1 clubbed/)
  for (const row of ['Remote Diagnostics 1.6 ▸ 2 documents', 'Service1_rel1_Service2_rel2 1 + 2 ▸ 1 document', 'CareLink 3.2']) assert.ok(body.includes(row), row)
  assert.match(body, /1 document without a release number in the name/)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export releases CSV' }).click()])
  const csv = readFileSync(await download.path(), 'utf8')
  assert.match(csv, /Remote Diagnostics/)
  // CON-69: a cell that a spreadsheet would read as a formula is prefixed so that it stays text.
  await page.locator('input[type=file]').first().setInputFiles(fixture('windchill-formula.csv'))
  await page.locator('.notice, .panel', { hasText: /windchill-formula/ }).first().waitFor().catch(() => {})
  const [exported] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^Export CSV/ }).first().click()])
  const content = readFileSync(await exported.path(), 'utf8')
  assert.ok(content.includes("'=HYPERLINK") || content.includes('"\'=HYPERLINK'), `formula cell is neutralised: ${content.split('\n')[1]}`)
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-STO-04 / TC-INS-01: a JSON backup contains the app state but no PAT, connection profile or Git token', async () => {
  const secret = 'e2e-secret-pat-value-0123456789'
  const { page, context, errors } = await openPage(app, { init: () => {
    localStorage.setItem('demand-planning-git-token-v1', 'e2e-secret-git-token-9876543210')
    localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify([{ id: 'tw', url: 'https://dev.azure.com/org/QMS', reason: 'QMS-0025', role: 'time-tracking', creatorEmail: 'me@example.com', showInMenu: true, token: 'e2e-secret-pat-value-0123456789' }]))
  } })
  await navigate(page, 'Snapshots')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export current JSON backup/ }).click()])
  assert.match(download.suggestedFilename(), /^demand-planning-backup-\d{4}-\d{2}-\d{2}\.json$/)
  const backup = readFileSync(await download.path(), 'utf8')
  const state = JSON.parse(backup)
  assert.ok(typeof state === 'object' && state !== null && 'schemaVersion' in state)
  assert.equal(backup.includes(secret), false, 'no PAT in the backup (STO-09)')
  assert.equal(backup.includes('e2e-secret-git-token'), false, 'no Git token in the backup (STO-09)')
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-CON-40: an export with a Location column reads its releases from Location, lists the unique locations and exports them', async () => {
  const { page, context, errors } = await openPage(app)
  await navigate(page, 'Import Windchill export')
  await page.locator('input[type=file]').first().setInputFiles(fixture('windchill-locations.csv'))
  const releases = page.locator('.panel').filter({ has: page.locator('h2, h3', { hasText: /^Releases/ }) }).first()
  await releases.waitFor()
  await releases.getByLabel('Show').selectOption('all')
  let body = await text(releases)
  assert.match(body, /5 releases · 6 of 7 documents · from Location/)
  for (const row of ['CareLink R3.2', 'Remote Diagnostics 1.7', 'Remote Diagnostics 1.6 ▸ 2 documents 1', 'Service1 1.0']) assert.ok(body.includes(row), row)
  assert.match(body, /1 document without a release in the Location/)
  assert.deepEqual(await releases.locator('tbody tr td:first-child strong').allInnerTexts(), ['Service1', 'IntelliSpace Portal', 'Remote Diagnostics', 'Remote Diagnostics', 'CareLink'], 'newest Last Modified first')
  await releases.locator('summary', { hasText: /unique locations/ }).click()
  body = await text(releases)
  assert.match(body, /6 unique locations/)
  assert.ok(body.includes('/Products/Remote Diagnostics 1.6/DHF 2 Remote Diagnostics 1.6'), 'the unique locations table shows the folder, its count and the release read from it')
  assert.ok(body.includes('/Quality/Manuals 1 none'))
  assert.equal(await page.getByRole('button', { name: 'Save locations to Git' }).count(), 0, 'no Git storage connected: no save button')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export locations CSV' }).click()])
  // The CSV starts with a UTF-8 byte-order mark so that Excel reads it as UTF-8.
  const csv = readFileSync(await download.path(), 'utf8').replace(/^\uFEFF/, '').split('\r\n')
  assert.equal(csv[0], 'Location,Documents,Releases,Release folder')
  assert.equal(csv[1], '/Products/Remote Diagnostics 1.6/DHF,2,Remote Diagnostics 1.6,Products/Remote Diagnostics 1.6')
  await releases.getByLabel('Read from').selectOption('name')
  // The names in this fixture are plain document names: only the clubbed one holds releases.
  assert.match(await text(releases), /1 release · 1 of 7 documents · 1 clubbed · from Document name/)
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-CON-41: the export page follows the header month, sorts by any column and has draggable column widths', async () => {
  const { page, context, errors } = await openPage(app)
  await navigate(page, 'Import Windchill export')
  await page.locator('input[type=file]').first().setInputFiles(fixture('windchill-export.csv'))
  const releases = page.locator('.panel').filter({ has: page.locator('h2, h3', { hasText: /^Releases/ }) }).first()
  await releases.waitFor()
  const month = page.locator('header.topbar input[type=month]')
  assert.equal(await month.count(), 1, 'the export page shows the header month picker')
  await month.fill('2026-10')
  assert.match(await text(releases), /4 of 5 releases with the latest Last Modified in October 2026 · 5 documents/)
  await month.fill('2026-08')
  let body = await text(releases)
  assert.match(body, /1 of 5 releases with the latest Last Modified in August 2026 · 1 document/)
  assert.ok(body.includes('CareLink 3.2'))
  await releases.getByLabel('Show').selectOption('all')
  assert.match(await text(releases), /5 releases · 6 of 7 documents/)
  const names = () => releases.locator('tbody tr td:first-child strong').allInnerTexts()
  await releases.getByRole('button', { name: /^Release name/ }).click()
  assert.deepEqual((await names())[0], 'CareLink', 'A→Z')
  await releases.getByRole('button', { name: /^Release name/ }).click()
  assert.deepEqual((await names())[0], 'Service1_rel1_Service2_rel2', 'Z→A')
  await releases.getByRole('button', { name: /^Latest Last Modified/ }).click()
  assert.deepEqual((await names())[0], 'Service1_rel1_Service2_rel2', 'newest first again (2026-10-06)')
  assert.equal(await releases.locator('th [role=separator]').count(), 4, 'every heading has a resize handle')
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-QV-18: Pulse Check shows the Supported summary next to Releases, with the S&S IT export\'s releases of the month', async () => {
  const { page, context, errors } = await openPage(app)
  await navigate(page, 'Import Windchill export')
  // The export page names the import after the stream so that Pulse Check finds it.
  await page.getByLabel(/name/i).first().fill('S&S IT').catch(() => {})
  await page.locator('input[type=file]').first().setInputFiles(fixture('windchill-export.csv'))
  await page.locator('.panel').filter({ has: page.locator('h2, h3', { hasText: /^Releases/ }) }).first().waitFor()
  await navigate(page, 'Pulse Check')
  // The Releases tab shows the month before the header month ("Releases · last month").
  await page.locator('header.topbar input[type=month]').fill('2026-11')
  await page.getByRole('tab', { name: /^Releases ·/ }).click()
  const supported = page.locator('.supported-summary')
  await supported.waitFor()
  const body = await text(supported)
  assert.match(body, /SUPPORTED/)
  assert.match(body, /October 2026 · 4 supported releases/)
  assert.match(body, /S&S IT \[4\] : Service1_rel1_Service2_rel2 1 \+ 2, IntelliSpace Portal 12\.1, Remote Diagnostics 1\.7, Remote Diagnostics 1\.6/)
  await page.locator('header.topbar input[type=month]').fill('2026-09')
  assert.match(await text(supported), /S&S IT \[1\] : CareLink 3\.2/)
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-CON-42: tables fit their columns — widening a column widens the table — and Wrap text wraps long cells', async () => {
  const { page, context, errors } = await openPage(app, { width: 1300 })
  await navigate(page, 'Import Windchill export')
  await page.locator('input[type=file]').first().setInputFiles(fixture('windchill-export.csv'))
  const releases = page.locator('.panel').filter({ has: page.locator('h2, h3', { hasText: /^Releases/ }) }).first()
  await releases.waitFor()
  await releases.getByLabel('Show').selectOption('all')
  const table = releases.locator('table.resizable')
  assert.match(await table.getAttribute('class'), /\bno-wrap\b/, 'one line per cell by default')
  const widths = () => table.locator('thead th').evaluateAll((cells) => cells.map((cell) => Math.round(cell.getBoundingClientRect().width)))
  const before = await widths(), tableBefore = (await table.boundingBox()).width
  // Drag the right edge of the first heading 200px to the right.
  const handle = table.locator('thead th').first().locator('[role=separator]')
  const box = await handle.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()
  const after = await widths(), tableAfter = (await table.boundingBox()).width
  assert.ok(after[0] >= before[0] + 190, `the first column grew (${before[0]} → ${after[0]})`)
  assert.deepEqual(after.slice(1), before.slice(1), 'the other columns keep their width')
  assert.ok(tableAfter >= tableBefore + 190, `the table grew instead (${tableBefore} → ${tableAfter})`)
  await releases.getByLabel('Wrap text').check()
  assert.match(await table.getAttribute('class'), /\bwrap\b/)
  assert.equal(await table.locator('tbody td').first().evaluate((cell) => getComputedStyle(cell).whiteSpace), 'pre-wrap')
  await releases.getByLabel('Wrap text').uncheck()
  assert.equal(await table.locator('tbody td').first().evaluate((cell) => getComputedStyle(cell).whiteSpace), 'nowrap')
  assert.deepEqual(errors, [])
  await context.close()
})
