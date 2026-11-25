import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fixture, loadSample, navigate, openPage, profileItem, startApp, text } from './helpers.mjs'

// UI-10: every table has one Export that offers Excel or CSV.
const exportFrom = async (page, scope, format = 'CSV (.csv)') => { await scope.getByRole('button', { name: /^Export/ }).first().click(); const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: format }).click()]); return download }

// Documentation, Windchill export and data-safety scenarios of the UAT (TC-DOC-01, TC-DOC-02, TC-CON-39, TC-CON-37,
// TC-STO-04, TC-INS-01, TC-QV-23, TC-QV-43, TC-QV-40, TC-QV-44), automated against the built web app.
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

test('TC-DOC-06: the user guide is the first tab and the profile menu\'s User guide opens it; its screenshots load from the build and its clips play from the build', async () => {
  const { page, context, errors } = await openPage(app)
  await navigate(page, 'Documentation')
  // Another document is chosen first, so that the profile menu has to bring the guide back.
  await page.getByRole('tab', { name: 'Requirements' }).click()
  await profileItem(page, 'User guide')
  const tabs = page.getByRole('tablist', { name: 'Documents' }).getByRole('tab')
  assert.equal(await text(tabs.first()), 'User guide', 'the first tab')
  assert.equal(await text(page.getByRole('tab', { selected: true })), 'User guide', 'opened by the profile menu')
  const panel = page.locator('.docs-panel')
  await panel.locator('h2', { hasText: 'User guide' }).first().waitFor()
  // Every screenshot is a file of this build (same origin or data:) and loads; none is left as text.
  const origin = new URL(app.url).origin
  const images = panel.locator('img.markdown-image')
  assert.ok(await images.count() >= 30, 'the screenshots are shown')
  assert.equal(await panel.locator('span.muted', { hasText: /^\[/ }).count(), 0, 'no picture missing from the build')
  for (const image of await images.all()) {
    await image.scrollIntoViewIfNeeded()
    await page.waitForFunction((element) => element.complete, await image.elementHandle())
    const { src, width } = await image.evaluate((element) => ({ src: element.currentSrc, width: element.naturalWidth }))
    assert.ok(src.startsWith(origin) || src.startsWith('data:image/png'), `${src} is from the app`)
    assert.ok(width > 0, `${src} loads`)
  }
  // The clips: muted, loaded only when played, from the app's own files, with a poster; one plays.
  const videos = panel.locator('figure.markdown-video video')
  assert.ok(await videos.count() >= 6, 'the clips are shown')
  for (const video of await videos.all()) {
    const facts = await video.evaluate((element) => ({ src: element.src, poster: element.poster, muted: element.muted, preload: element.preload, controls: element.controls }))
    assert.ok(facts.src.startsWith(origin), `${facts.src} is from the app`)
    assert.ok(facts.poster, 'a poster')
    assert.deepEqual([facts.muted, facts.preload, facts.controls], [true, 'none', true])
  }
  const first = videos.first()
  await first.scrollIntoViewIfNeeded()
  await first.evaluate((element) => element.play())
  await page.waitForFunction((element) => element.currentTime > 0.2, await first.elementHandle())
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-CON-39 / TC-CON-37 / TC-QV-27: a Windchill export lists its unique releases, clubbed names included, its raw rows on their own tab, and exports a neutralised CSV', async () => {
  const { page, context, errors } = await openPage(app, { roles: true })
  await navigate(page, 'Import Windchill export')
  await page.locator('input[type=file]').first().setInputFiles(fixture('windchill-export.csv'))
  const releases = page.locator('.panel').filter({ has: page.locator('h2, h3', { hasText: /^Releases/ }) }).first()
  await releases.waitFor()
  await page.getByRole('radiogroup', { name: 'Show' }).getByRole('radio', { name: 'All months' }).click()
  const body = await text(releases)
  assert.match(body, /5 releases · 6 of 7 documents · 1 clubbed/)
  // QV-62: Release name ▸ (opens the documents), Release, the latest date, Documents (a count).
  for (const row of ['▸ Remote Diagnostics 1.6 2026-10-01 2', '▸ Service1_rel1_Service2_rel2 1 + 2 2026-10-06 1', '▸ CareLink 3.2 2026-08-01 1']) assert.ok(body.includes(row), row)
  assert.match(body, /1 document without a release number in the name/)
  const download = await exportFrom(page, releases)
  const csv = readFileSync(await download.path(), 'utf8')
  assert.match(csv, /Remote Diagnostics/)
  // CON-69: a cell that a spreadsheet would read as a formula is prefixed so that it stays text.
  await page.locator('input[type=file]').first().setInputFiles(fixture('windchill-formula.csv'))
  await page.locator('.notice, .panel', { hasText: /windchill-formula/ }).first().waitFor().catch(() => {})
  // VIEW-01, QV-62: the imported rows are on the "Source data" tab, not below the releases.
  assert.equal(await page.getByLabel(/^Search /).count(), 0, 'the raw rows are not shown on the Releases tab')
  await page.getByRole('tab', { name: /^Source data/ }).click()
  await page.getByLabel(/^Search /).waitFor()
  const exported = await exportFrom(page, page.getByRole('tabpanel'))
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
  // The start-up fetch with the test PAT fails (NAV-41 opens Get started with the reason): close it first.
  await context.route('https://dev.azure.com/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await page.reload()
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await guide.waitFor({ timeout: 20000 })
  await guide.getByRole('button', { name: 'Close', exact: true }).last().click()
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
  const { page, context, errors } = await openPage(app, { roles: true })
  await navigate(page, 'Import Windchill export')
  await page.locator('input[type=file]').first().setInputFiles(fixture('windchill-locations.csv'))
  const releases = page.locator('.panel').filter({ has: page.locator('h2, h3', { hasText: /^Releases/ }) }).first()
  await releases.waitFor()
  await page.getByRole('radiogroup', { name: 'Show' }).getByRole('radio', { name: 'All months' }).click()
  let body = await text(releases)
  assert.match(body, /5 releases · 6 of 7 documents · from Location/)
  for (const row of ['CareLink R3.2', 'Remote Diagnostics 1.7', '▸ Remote Diagnostics 1.6 2026-10-01 2 1', 'Service1 1.0']) assert.ok(body.includes(row), row)
  assert.match(body, /1 document without a release in the Location/)
  assert.deepEqual((await releases.locator('tbody tr td:first-child button').allInnerTexts()).map((name) => name.replace(/^▸\s*/, '')), ['Service1', 'IntelliSpace Portal', 'Remote Diagnostics', 'Remote Diagnostics', 'CareLink'], 'newest Last Modified first')
  await releases.locator('summary', { hasText: /unique locations/ }).click()
  body = await text(releases)
  assert.match(body, /6 unique locations/)
  assert.ok(body.includes('/Products/Remote Diagnostics 1.6/DHF 2 Remote Diagnostics 1.6'), 'the unique locations table shows the folder, its count and the release read from it')
  assert.ok(body.includes('/Quality/Manuals 1 none'))
  assert.equal(await page.getByRole('button', { name: 'Save locations to Git' }).count(), 0, 'no Git storage connected: no save button')
  const download = await exportFrom(page, releases.locator('details.dp-counted', { hasText: /unique locations/ }))
  // The CSV starts with a UTF-8 byte-order mark so that Excel reads it as UTF-8.
  const csv = readFileSync(await download.path(), 'utf8').replace(/^\uFEFF/, '').split('\r\n')
  assert.equal(csv[0], 'Location,Documents,Releases read from it,Release folder')
  assert.equal(csv[1], '/Products/Remote Diagnostics 1.6/DHF,2,Remote Diagnostics 1.6,Products/Remote Diagnostics 1.6')
  await releases.locator('label.inline-field', { hasText: /^Read from/ }).locator('select').selectOption('name')
  // The names in this fixture are plain document names: only the clubbed one holds releases.
  assert.match(await text(releases), /1 release · 1 of 7 documents · 1 clubbed · from Document name/)
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-CON-41: the export page follows the header month, sorts by any column and has draggable column widths', async () => {
  const { page, context, errors } = await openPage(app, { roles: true })
  await navigate(page, 'Import Windchill export')
  await page.locator('input[type=file]').first().setInputFiles(fixture('windchill-export.csv'))
  const releases = page.locator('.panel').filter({ has: page.locator('h2, h3', { hasText: /^Releases/ }) }).first()
  await releases.waitFor()
  const month = page.locator('header.topbar input[type=month]')
  assert.equal(await month.count(), 1, 'the export page shows the header month picker')
  await month.fill('2026-10')
  assert.match(await text(releases), /4 of 5 releases with a document Last Modified in October 2026 · 5 documents/)
  await month.fill('2026-08')
  let body = await text(releases)
  assert.match(body, /1 of 5 releases with a document Last Modified in August 2026 · 1 document/)
  assert.ok(body.includes('CareLink 3.2'))
  await page.getByRole('radiogroup', { name: 'Show' }).getByRole('radio', { name: 'All months' }).click()
  assert.match(await text(releases), /5 releases · 6 of 7 documents/)
  const names = async () => (await releases.locator('tbody tr td:first-child button').allInnerTexts()).map((name) => name.replace(/^▸\s*/, ''))
  await releases.getByRole('button', { name: /^Release name/ }).click()
  assert.deepEqual((await names())[0], 'CareLink', 'A→Z')
  await releases.getByRole('button', { name: /^Release name/ }).click()
  assert.deepEqual((await names())[0], 'Service1_rel1_Service2_rel2', 'Z→A')
  await releases.getByRole('button', { name: /^Latest Last Modified/ }).click()
  assert.deepEqual((await names())[0], 'Service1_rel1_Service2_rel2', 'newest first again (2026-10-06)')
  // QV-65: 8 headings — Release name, Release, Latest Last Modified, Documents, Time Writing Feature, Planned (h), Booked (h), QMS-0025 match.
  assert.equal(await releases.locator('th [role=separator]').count(), 8, 'every heading (the hours and QMS-0025 match included) has a resize handle')
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-QV-23: the export\'s releases have a QMS-0025 match column with Create Feature, sortable, as on the DP table', async () => {
  const { page, context, errors } = await openPage(app, { roles: true })
  await navigate(page, 'Import Windchill export')
  await page.locator('input[type=file]').first().setInputFiles(fixture('windchill-export.csv'))
  const releases = page.locator('.panel').filter({ has: page.locator('h2, h3', { hasText: /^Releases/ }) }).first()
  await releases.waitFor()
  await page.getByRole('radiogroup', { name: 'Show' }).getByRole('radio', { name: 'All months' }).click()
  assert.equal(await releases.getByRole('button', { name: /^QMS-0025 match/ }).count(), 1, 'the column heading sorts')
  const rows = releases.locator('table').first().locator('tbody > tr')
  assert.equal(await rows.count(), 5)
  // Without the QMS-0025 board loaded there is nothing to match: each row says so and offers Create Feature, disabled
  // with the reason (no Time Writing connection, or no Epic loaded to put the Feature under).
  assert.equal(await releases.locator('.board-match', { hasText: 'board not loaded' }).count(), 5)
  const create = releases.getByRole('button', { name: 'Create Feature' })
  assert.equal(await create.count(), 5)
  assert.equal(await create.first().isDisabled(), true)
  assert.match(await releases.locator('.board-match small.muted').nth(1).innerText(), /Connect the QMS-0025 Time Writing connection first|Load the QMS-0025 board first/)
  await releases.getByRole('button', { name: /^QMS-0025 match/ }).click()
  assert.equal(await rows.count(), 5, 'sorting by the match keeps every release')
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-CON-53 / TC-QV-43: "＋ ECP" imports the export as the ECP page whatever the file is called, read by project, with the common Release name / Release columns', async () => {
  const { page, context, errors } = await openPage(app, { roles: true })
  await page.locator('nav button', { hasText: /^＋\s*ECP$/ }).click()
  assert.equal(await page.getByLabel(/^Name/).first().inputValue(), 'ECP', 'the import is named after the stream')
  await page.locator('input[type=file]').first().setInputFiles(fixture('windchill-ecp.csv'))
  const releases = page.locator('.panel').filter({ has: page.locator('h2, h3', { hasText: /^Releases/ }) }).first()
  await releases.waitFor()
  await page.getByRole('radiogroup', { name: 'Show' }).getByRole('radio', { name: 'All months' }).click()
  const body = await text(releases)
  assert.match(body, /123456/)
  // QV-62 (CON-86 retired): an ECP release is a project, shown with the columns every Release page has.
  const headers = (await releases.locator('thead th').allTextContents()).map((header) => header.trim().toLowerCase())
  assert.deepEqual(headers.slice(0, 2), ['release name', 'release'], `common columns first: ${headers.join(' | ')}`)
  assert.ok(!headers.some((header) => header.startsWith('project')), `no Project columns: ${headers.join(' | ')}`)
  assert.equal(await page.getByRole('tab', { name: 'Releases', exact: true }).getAttribute('aria-selected'), 'true', 'the main tab is Releases, not Projects')
  assert.match(body, /Lab Automation/)
  assert.equal(await page.locator('nav button', { hasText: /^＋\s*ECP$/ }).count(), 0, 'ECP is no longer "not imported"')
  assert.equal(await page.locator('nav button', { hasText: /^\S*\s*ECP$/ }).count(), 1, 'ECP opens the export')
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-CON-55 / TC-QV-28: an ECP setup named "ECP - Type 2" reads projects from the 3rd Location folder, is listed on its own, with compact page actions', async () => {
  const { page, context, errors } = await openPage(app, { roles: true })
  await page.locator('nav button', { hasText: /^＋\s*ECP$/ }).click()
  assert.equal(await page.getByLabel('Logic').inputValue(), 'ecp', 'opened from ＋ ECP: the ECP setup')
  await page.getByLabel('Project details at').selectOption('3')
  await page.getByLabel(/^Name/).first().fill('ECP - Type 2')
  await page.locator('input[type=file]').first().setInputFiles(fixture('windchill-ecp-type2.csv'))
  const releases = page.locator('.panel').filter({ has: page.locator('h2, h3', { hasText: /^Releases/ }) }).first()
  await releases.waitFor()
  await page.getByRole('radiogroup', { name: 'Show' }).getByRole('radio', { name: 'All months' }).click()
  let body = await text(releases)
  assert.match(body, /Patient Monitor/)
  assert.match(body, /Scanner/)
  assert.equal(await page.locator('nav button', { hasText: /ECP - Type 2$/ }).count(), 1, 'the export has its own menu entry')
  assert.equal(await page.locator('nav button', { hasText: /ECP export$/ }).count(), 1, '＋ ECP export adds another')
  // TC-QV-28: the page's actions are compact — a small import button and a ⋯ menu with the rest.
  assert.equal(await page.getByRole('button', { name: 'Remove' }).count(), 0, 'no full-size Remove button')
  assert.equal(await page.locator('.view-actions label[title="Import newer export"]').count(), 1, 'Import newer export is a small button with its name as tooltip')
  await page.getByRole('button', { name: 'More actions: ECP - Type 2' }).click()
  assert.equal(await page.getByRole('menuitem', { name: 'Remove this export…' }).count(), 1, 'Remove is in the ⋯ menu')
  await page.keyboard.press('Escape')
  assert.equal(await page.getByRole('menu').count(), 0, 'Escape closes the menu')
  // The setup can be changed on the export's page: the 2nd folder gives the parent folder instead.
  await releases.getByLabel('Project details at').selectOption('2')
  body = await text(releases)
  assert.match(body, /Programs/)
  assert.doesNotMatch(body, /Patient Monitor ▸/)
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-UI-04 / TC-UI-05: every table follows the table default — move, hide, density, one Export with Excel dates; Settings → Table defaults changes them all', async () => {
  const { page, context, errors } = await openPage(app, { roles: true })
  await navigate(page, 'Import Windchill export')
  await page.locator('input[type=file]').first().setInputFiles(fixture('windchill-export.csv'))
  await page.getByRole('tab', { name: /^Source data/ }).click()
  const table = page.getByRole('tabpanel')
  const headings = () => table.locator('thead th').allTextContents()
  assert.deepEqual((await headings()).map((h) => h.trim()), ['Number', 'Name', 'State', 'Last Modified'])
  // Move with the Columns list (↑) and hide a column there; the order and choice stay for this table.
  await table.getByRole('button', { name: /^Columns/ }).click()
  await table.getByRole('button', { name: 'Move Name up' }).click()
  await table.locator('.column-choice', { hasText: 'State' }).getByRole('checkbox').uncheck()
  assert.deepEqual((await headings()).map((h) => h.trim()), ['Name', 'Number', 'Last Modified'], '1, 2, 3 → 2, 1, 3; State hidden')
  await table.getByLabel('Row density').selectOption('compact')
  assert.equal(await table.locator('.data-table-compact').count(), 1)
  // One Export: Excel holds the date as a real date-time (a number with a date format).
  await table.getByRole('button', { name: /^Export/ }).first().click()
  const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Excel (.xlsx)' }).click()])
  assert.match(xlsx.suggestedFilename(), /\.xlsx$/)
  const { readXlsx } = await import('../src/xlsx.ts')
  const [sheet] = await readXlsx(new Uint8Array(readFileSync(await xlsx.path())))
  assert.deepEqual(sheet.rows[0], ['Name', 'Number', 'Last Modified'], 'the export follows the shown columns and order')
  assert.match(sheet.rows[1][2], /^\d{4}-\d{2}-\d{2}/, 'the date cell is a real date in the workbook (read back as a date)')
  // Look & feel → Table and chart defaults (SET-18): without CSV, every Export offers Excel only.
  await profileItem(page, 'Look & feel')
  await page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'Table and chart defaults' }).click()
  await page.getByRole('checkbox', { name: 'CSV (.csv)' }).uncheck()
  await navigate(page, 'Import Windchill export')
  await page.locator('nav button', { hasText: /windchill-export/ }).first().click().catch(() => {})
  await page.getByRole('tab', { name: /^Source data/ }).click()
  assert.equal(await page.getByRole('tabpanel').getByRole('button', { name: 'Export Excel' }).count(), 1, 'one format: a single Export Excel button')
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-UI-06: the page tables follow the table default too — My Work keeps its tree, Backlog Health its lists, each with Columns and one Export', async () => {
  const { page, context, errors } = await openPage(app, { roles: true })
  await page.getByRole('button', { name: 'Load synthetic sample' }).click()
  await navigate(page, 'My Tasks [Board]')
  const pick = page.locator('input[placeholder^="Choose a person"]').first()
  await pick.click(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter')
  const work = page.locator('.data-table').first()
  await work.locator('button.tree-toggle').first().click()
  assert.ok(await work.locator('tr.work-child').count() > 0, 'a Feature opens its children as rows of the same table')
  assert.equal(await work.getByRole('button', { name: /^Columns/ }).count(), 1)
  assert.equal(await work.getByRole('button', { name: /^Export/ }).count(), 1)
  await navigate(page, 'Backlog Health')
  assert.equal(await page.getByRole('button', { name: 'Export CSV' }).count(), 0, 'no second export: the table has its own')
  assert.equal(await page.locator('.data-table').getByRole('button', { name: /^Columns/ }).count(), 1)
  await navigate(page, 'Baselines')
  assert.ok(await page.locator('.data-table').count() >= 1, 'Baselines tables on the default')
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-QV-18: Pulse Check shows the Supported summary next to Releases, with the S&S IT export\'s releases of the month', async () => {
  const { page, context, errors } = await openPage(app, { roles: true })
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

test('TC-QV-17: Pulse Check folds the DP Supported Releases list; Show list opens it and the choice is remembered', async () => {
  const { page, context, errors } = await openPage(app, { init: () => {
    localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify([{ id: 'dp', url: 'https://azure.example.com/tfs/Collection/DP', baseUrl: 'https://azure.example.com/tfs', reason: 'DP', viewName: 'DP', role: 'release-source', query: 'SELECT [System.Id] FROM WorkItems', showInMenu: true, token: 'e2e-dp-token-0123456789' }]))
  } })
  await navigate(page, 'Pulse Check')
  await page.getByRole('tab', { name: /^Current month releases/ }).click()
  const panel = page.locator('.panel').filter({ has: page.locator('h2, h3', { hasText: /^Supported Releases · DP/ }) }).first()
  await panel.waitFor()
  const toggle = panel.getByRole('button', { name: 'Show list' })
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'folded by default')
  assert.equal(await panel.locator('.empty-state, table').count(), 0, 'no list and no message while folded')
  assert.match(await text(panel), /0 releases · 0 milestones/, 'the count stays visible')
  await toggle.click()
  assert.match(await text(panel), /The DP view has not been fetched yet/)
  assert.equal(await panel.getByRole('button', { name: 'Hide list' }).getAttribute('aria-expanded'), 'true')
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, 'Pulse Check')
  await page.getByRole('tab', { name: /^Current month releases/ }).click()
  await page.locator('.panel').filter({ has: page.locator('h2, h3', { hasText: /^Supported Releases · DP/ }) }).first().getByRole('button', { name: 'Hide list' }).waitFor() // remembered for this viewer
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-CON-42: tables fit their columns — widening a column widens the table — and Wrap text wraps long cells', async () => {
  const { page, context, errors } = await openPage(app, { roles: true, width: 1300 })
  await navigate(page, 'Import Windchill export')
  await page.locator('input[type=file]').first().setInputFiles(fixture('windchill-export.csv'))
  const releases = page.locator('.panel').filter({ has: page.locator('h2, h3', { hasText: /^Releases/ }) }).first()
  await releases.waitFor()
  await page.getByRole('radiogroup', { name: 'Show' }).getByRole('radio', { name: 'All months' }).click()
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

test('TC-DOC-05: open, browse and download bundled design documents', async () => {
  const { page, context, errors } = await openPage(app)
  await navigate(page, 'Documentation')
  await page.getByRole('button', { name: 'Design documents', exact: true }).click()
  const panel = page.locator('.docs-panel')
  await panel.getByRole('heading', { name: 'DemandPlanning as-built design', exact: true }).waitFor()
  await panel.getByRole('link', { name: 'Home', exact: true }).click()
  await panel.getByRole('heading', { name: 'Home', exact: true }).waitFor()
  assert.match(await panel.getByRole('link', { name: 'App.tsx', exact: true }).getAttribute('href'), /^https:\/\/github\.com\/ponkritz\/DemandPlanning\/blob\/[^/]+\/src\/App\.tsx$/)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download .md', exact: true }).click()])
  assert.equal(download.suggestedFilename(), 'home.md')
  assert.equal(readFileSync(await download.path(), 'utf8'), readFileSync(new URL('../docs/design/home.md', import.meta.url), 'utf8'))
  const picker = page.getByLabel('Design document', { exact: true })
  const files = readdirSync(new URL('../docs/design/', import.meta.url), { recursive: true })
    .filter((file) => file.endsWith('.md'))
    .map((file) => `design/${file.replaceAll('\\', '/')}`)
    .sort()
  const choices = await picker.locator('option').evaluateAll((options) => options.map((option) => option.value).sort())
  assert.deepEqual(choices, files)
  await picker.selectOption('design/settings/home.md')
  await panel.getByRole('heading', { name: 'Admin Overview', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Design index', exact: true }).click()
  await panel.getByRole('heading', { name: 'DemandPlanning as-built design', exact: true }).waitFor()
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-QV-43: every Release page has the source bar, counts, Releases | Source data tabs (Tool Validations: Expiry list | Master list | Tool List [TFS] | Setup, no Releases table) and the common columns in order', async () => {
  // DP, IOCC and Content read the synthetic sample's release documents (the same query, so each shows them); the
  // Time Writing connection comes first so that the sample loads. Nothing is fetched: Azure DevOps answers 401.
  const query = "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.State] = 'Approved'"
  const view = (name) => ({ id: name.toLowerCase().replace(/\W+/g, '-'), url: `https://azure.example.com/tfs/Collection/${encodeURIComponent(name)}`, baseUrl: 'https://azure.example.com/tfs', token: 'e2e-token-0123456789', reason: name, viewName: name, role: 'release-source', query, showInMenu: true })
  const profiles = [{ id: 'tw', url: 'https://dev.azure.com/ALMP-ORG-MSTP01/Patient%20Safety%20and%20Quality/_backlogs/backlog/InD%20Quality/Epics', token: '', reason: 'QMS-0025', role: 'time-tracking', showInMenu: true }, ...['DP', 'IOCC', 'Content', 'Tool Validations'].map(view)]
  const { page, context, errors } = await openPage(app, { roles: true, init: (list) => { localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify(list)) }, initArg: profiles })
  await context.route(/azure\.example\.com|dev\.azure\.com/, (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  const guide = page.getByRole('dialog').filter({ hasText: 'Get started' })
  if (await guide.waitFor({ timeout: 10000 }).then(() => true, () => false)) await guide.getByRole('button', { name: 'Close', exact: true }).last().click()
  await loadSample(page)
  const open = async (name) => { await page.locator('.sidebar nav button').filter({ hasText: new RegExp(`(^|[^A-Za-z])${name}$`) }).first().click(); await page.locator('.page-loading').waitFor({ state: 'detached' }); await page.locator('.release-source').getByRole('button', { name: `More actions: ${name}`, exact: true }).waitFor() }
  const releases = () => page.locator('.panel', { has: page.locator('h2', { hasText: /^Releases/ }) }).first()
  const headers = async () => (await releases().locator('thead').waitFor(), await releases().locator('thead th').allTextContents()).map((header) => header.replace(/[▴▾▲▼↑↓]/g, '').trim().toLowerCase())
  const show = page.getByRole('radiogroup', { name: 'Show' })
  // counts: the tiles after Releases in {Month} (QV-58, QV-64; at most three, UI-STANDARDS §9).
  const parts = async (name, { counts }) => {
    const bar = page.locator('.release-source')
    // (1) Source bar (QV-70): only Show: {month} / All months, ↻ and ⋯ — no name, source or ⓘ Info; where the data
    // comes from and when it was fetched is the first line of ⋯ (not an action).
    assert.equal(await text(bar.locator('.view-source-bar')).then((shown) => shown.includes(' · ')), false, `${name}: no name · source · fetched in the bar`)
    assert.equal(await bar.getByRole('button', { name: 'Info', exact: true }).count(), 0, `${name}: no ⓘ Info in the bar`)
    await bar.getByRole('button', { name: `More actions: ${name}`, exact: true }).click()
    const menu = page.getByRole('menu', { name })
    assert.match(await text(menu.locator('.view-actions-note')), /^.+ · .*(fetched|imported) /, `${name}: ⋯ starts with source · when fetched`)
    await page.keyboard.press('Escape')
    await menu.waitFor({ state: 'detached' })
    // TVL-14 (a named exception to §10 (1) and (3)): Tool Validations has no Releases table, so no Show — its
    // master list's Current Month Status and counts are for the header month.
    // QV-71: elsewhere a toggle Selected month | All months — the month is not repeated (top bar and tooltip).
    const tool = name === 'Tool Validations'
    let monthLabel
    if (tool) {
      monthLabel = await page.locator('header.topbar input[type=month]').inputValue().then((value) => new Date(`${value}-01T00:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }))
      assert.equal(await show.count(), 0, `${name}: no Show`)
    } else {
      assert.deepEqual(await show.getByRole('radio').allInnerTexts(), ['Selected month', 'All months'], `${name}: Show: Selected month / All months`)
      assert.equal(await show.getByRole('radio', { name: 'Selected month' }).getAttribute('aria-checked'), 'true', `${name}: the selected month by default`)
      monthLabel = (await show.getByRole('radio', { name: 'Selected month' }).getAttribute('title')).replace(/^Only (.+) \(the month in the top bar\)$/, '$1')
      assert.match(monthLabel, /^\w+ \d{4}$/, `${name}: the tooltip names the header month`)
    }
    assert.equal(await bar.locator('.view-actions .primary', { hasText: '↻' }).count(), 1, `${name}: ↻`)
    assert.equal(await bar.getByRole('button', { name: `More actions: ${name}` }).count(), 1, `${name}: ⋯`)
    // (2) Counts: every stream, with the tiles it has a rule for; the numbers in the one KPI size (24px, §9).
    // TVL-23: Tool Validations shows them on its Master list tab only, as Validations.
    if (tool) {
      assert.equal(await page.locator('.release-counts').count(), 0, `${name}: no counts above the tabs or on the Expiry list`)
      await page.getByRole('tablist', { name: 'Result' }).getByRole('tab', { name: 'Master list' }).click()
      await page.locator('.release-counts').waitFor()
    }
    assert.deepEqual((await page.locator('.release-counts .metric-grid article > span').allInnerTexts()).map((label) => label.trim().toLowerCase()), [`${tool ? 'validations' : 'releases'} in ${monthLabel.toLowerCase()}`, ...counts], `${name}: the counts`)
    assert.equal(await page.locator('.release-counts').getByRole('button', { name: /What was counted/ }).count(), 1, `${name}: ⓘ What was counted`)
    for (const size of await page.locator('.release-counts .metric-grid article > strong').evaluateAll((numbers) => numbers.map((number) => getComputedStyle(number).fontSize))) assert.equal(size, '24px', `${name}: KPI numbers 24px`)
    // (3) Tabs: Releases | Source data (n), with every month shown.
    if (!tool) await show.getByRole('radio', { name: 'All months' }).click()
    const tabs = page.getByRole('tablist', { name: 'Result' })
    await tabs.waitFor()
    const labels = (await tabs.getByRole('tab').allInnerTexts()).map((label) => label.trim())
    // TVL-14 (a named exception to §10 (3)): Tool Validations has Expiry list | Master list | Tool List [TFS] (the
    // query's rows; Validation Documents [TFS] with a second query), then a tab per other source and Setup last; no
    // Releases table.
    if (tool) {
      assert.deepEqual(labels, ['Expiry list', 'Master list', 'Tool List [TFS]', 'Setup'], `${name}: Expiry list | Master list | Tool List [TFS] | Setup`)
      await tabs.getByRole('tab', { name: 'Tool List [TFS]' }).click()
      await page.locator('.panel', { has: page.locator('h2', { hasText: /^Tool List \[TFS\]/ }) }).locator('tbody tr').first().waitFor()
      assert.equal(await page.locator('.panel', { has: page.locator('h2', { hasText: /^Releases/ }) }).count(), 0, `${name}: no Releases table`)
      return
    }
    assert.equal(labels[0], 'Releases', `${name}: the Releases tab first`)
    assert.match(labels.at(-1), /^Source data \(\d+\)$/, `${name}: Source data (n)`)
    assert.deepEqual(labels.slice(1, -1), [], `${name}: no tabs between`)
  }
  // The common end of the Releases table (QV-65): the Time Writing Feature, its hours, then the QMS-0025 match.
  const commonEnd = ['time writing feature', 'planned (h)', 'booked (h)', 'qms-0025 match']
  const rightAligned = async (label) => { const index = (await headers()).indexOf(label) + 1; return releases().locator(`tbody tr td:nth-child(${index})`).first().evaluate((cell) => getComputedStyle(cell).textAlign) }
  await open('DP')
  await parts('DP', { counts: ['completed', 'supported'] })
  // QV-70: what ⓘ Info held — the month filter rule, the items fetched, the milestone names — is behind ⋯ → About this source….
  await page.getByRole('button', { name: 'More actions: DP', exact: true }).click()
  await page.getByRole('menuitem', { name: 'About this source…' }).click()
  const about = page.getByRole('dialog', { name: 'About this source' })
  assert.match(await text(about), /RELEASE PAGE · DP/i, 'About: the eyebrow names the page')
  assert.match(await text(about), / · fetched .*Month filter: by DDT Date in UTC.*items fetched/, 'About: source · fetched, then the details')
  await about.getByRole('button', { name: 'Close', exact: true }).last().click()
  await about.waitFor({ state: 'detached' })
  // (4) DP: its query's rows are the releases — Select first (bulk Create Features), the QMS-0025 match last.
  let shown = await headers()
  assert.equal(shown[0], 'select', 'DP: Select first')
  assert.deepEqual(shown.slice(1, 4), ['release name', 'version', 'release classification (detected)'], 'DPF-12: then Release name, Version, Release Classification (detected)')
  assert.deepEqual(shown.slice(-4), commonEnd, 'DP: Time Writing Feature, Planned (h), Booked (h), then QMS-0025 match last')
  for (const label of ['planned (h)', 'booked (h)']) assert.equal(await rightAligned(label), 'right', `DP: ${label} right-aligned`)
  for (const label of ['Select all shown', 'Clear']) assert.equal(await releases().getByRole('button', { name: label, exact: true }).count(), 1, `DP toolbar: ${label}`)
  assert.equal(await releases().getByRole('button', { name: /^Create Features \(0\)$/ }).count(), 1)

  await open('IOCC')
  await parts('IOCC', { counts: ['completed', 'supported'] })

  // QV-64: Content counts its releases of the month (no Completed or Supported rule); Tool Validations its master
  // list's tools, Supported as Pulse Check counts them (no Completed rule with one query, TVL-36).
  await open('Tool Validations')
  await parts('Tool Validations', { counts: ['supported validations'] })

  await open('Content')
  await parts('Content', { counts: [] })
  shown = await headers()
  assert.deepEqual(shown, ['select', 'release name', 'approved', 'documents', 'time writing feature', 'planned (h)', 'booked (h)', 'qms-0025 match'], 'Content: the common columns in the standard order (no Release number: the Title is the release)')
  assert.equal(await releases().locator('tbody tr td:nth-child(4)').first().evaluate((cell) => getComputedStyle(cell).textAlign), 'right', 'Documents right-aligned')
  assert.equal(await releases().getByRole('button', { name: 'Select all shown', exact: true }).count(), 1, 'Content toolbar: Select all shown')

  await navigate(page, 'Import Windchill export')
  await page.getByLabel(/^Name/).first().fill('S&S IT')
  await page.locator('input[type=file]').first().setInputFiles(fixture('windchill-export.csv'))
  await page.getByRole('tab', { name: /^Source data/ }).waitFor()
  await parts('S&S IT', { counts: ['supported'] })
  assert.deepEqual(await headers(), ['release name', 'release', 'latest last modified', 'documents', ...commonEnd], 'S&S IT: Release name, Release, the latest date (Approved place), Documents, the matched Feature with its hours, the QMS-0025 match')
  for (const label of ['documents', 'planned (h)', 'booked (h)']) assert.equal(await rightAligned(label), 'right', `S&S IT: ${label} right-aligned`)
  // QV-64: the tiles count what the table lists for the month — the same number as the table's "n of N releases".
  await show.getByRole('radio', { name: 'Selected month' }).click()
  const [listed] = (await text(releases().locator('.record-count'))).match(/^\d+/) ?? ['']
  assert.equal(await text(page.locator('.release-counts .metric-grid article').first().locator('strong')), listed, 'S&S IT: Releases in the month = the releases the table lists')
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-QV-40: no bulk creation Epic is built in — without one mapped, Create Features is disabled with the reason and opens Bulk creation Epics; a mapping saved there is used', async () => {
  // The same synthetic DP, IOCC and Content release pages as TC-QV-43; nothing is fetched (Azure DevOps answers 401).
  const query = "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.State] = 'Approved'"
  const view = (name) => ({ id: name.toLowerCase().replace(/\W+/g, '-'), url: `https://azure.example.com/tfs/Collection/${encodeURIComponent(name)}`, baseUrl: 'https://azure.example.com/tfs', token: 'e2e-token-0123456789', reason: name, viewName: name, role: 'release-source', query, showInMenu: true })
  const profiles = [{ id: 'tw', url: 'https://dev.azure.com/ALMP-ORG-MSTP01/Patient%20Safety%20and%20Quality/_backlogs/backlog/InD%20Quality/Epics', token: '', reason: 'QMS-0025', role: 'time-tracking', showInMenu: true }, ...['DP', 'IOCC', 'Content'].map(view)]
  const { page, context, errors } = await openPage(app, { roles: true, init: (list) => { localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify(list)) }, initArg: profiles })
  await context.route(/azure\.example\.com|dev\.azure\.com/, (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  for (const title of ['Get started', 'Could not fetch from Azure DevOps']) {
    const dialog = page.getByRole('dialog').filter({ hasText: title })
    await page.addLocatorHandler(dialog, () => dialog.getByRole('button', { name: 'Close', exact: true }).last().click())
  }
  await loadSample(page)
  const open = async (name) => { await page.locator('.sidebar nav button').filter({ hasText: new RegExp(`(^|[^A-Za-z])${name}$`) }).first().click(); await page.locator('.page-loading').waitFor({ state: 'detached' }); await page.locator('.release-source').getByRole('button', { name: `More actions: ${name}`, exact: true }).waitFor(); await page.getByRole('radiogroup', { name: 'Show' }).getByRole('radio', { name: 'All months' }).click() }
  const releases = () => page.locator('.panel', { has: page.locator('h2', { hasText: /^Releases/ }) }).first()
  const note = (stream) => releases().getByRole('note').filter({ hasText: `No ${stream} bulk creation Epic is set` })
  const create = () => releases().getByRole('button', { name: /^Create Features \(\d+\)$/ })
  await open('DP')
  assert.equal(await text(note('DP')), 'No DP bulk creation Epic is set: map it in Admin → Stream options → Bulk creation Epics.', 'the reason next to the button')
  await releases().getByRole('button', { name: 'Select all shown', exact: true }).click()
  assert.notEqual(await text(create()), 'Create Features (0)', 'releases are ticked')
  assert.equal(await create().isDisabled(), true, 'DP Create Features is disabled without a mapped Epic')
  // Content too (the IOCC sample here has no releases; IOCC shares Content's release table and reason, L1).
  await open('Content')
  await note('Content').waitFor()
  assert.equal(await create().isDisabled(), true, 'Content Create Features is disabled too')
  // The button next to the reason opens Admin → Stream options → Bulk creation Epics: every stream "not set".
  await open('DP')
  await releases().getByRole('button', { name: 'Open Bulk creation Epics' }).click()
  const panel = page.locator('.bulk-epics')
  await panel.waitFor()
  assert.equal(await text(page.locator('header.topbar h1')), 'Stream options')
  const row = (stream) => panel.getByRole('row', { name: new RegExp(`^${stream}`) })
  for (const stream of ['DP', 'IOCC', 'Content']) { assert.match(await text(row(stream)), /not set/, `${stream}: not set`); assert.doesNotMatch(await text(row(stream)), /built in/, `${stream}: no built-in Epic`) }
  // No Git storage is connected, so the shared Epic cannot be set here: map my own.
  await panel.getByLabel('DP my bulk Epic').fill('15000')
  await row('DP').getByRole('button', { name: 'Save' }).click()
  await row('DP').filter({ hasText: /#15000.*mine/ }).waitFor()
  // Mapped: the reason is gone, Create Features opens and works under the mapped Epic.
  await open('DP')
  await releases().getByRole('button', { name: 'Select all shown', exact: true }).click()
  assert.equal(await note('DP').count(), 0, 'no reason once the Epic is mapped')
  assert.equal(await create().isDisabled(), false, 'Create Features is enabled')
  await create().click()
  const dialog = page.getByRole('dialog').filter({ hasText: /Create Features for \d+ DP release/ })
  await dialog.waitFor()
  assert.match(await text(dialog), /Under Epic #15000/, 'the mapped Epic is used')
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-QV-44: the result of an action on a Release page — a Windchill import, a file that is not an export — is listed in Background jobs, not as a notice on the page', async () => {
  const { page, context, errors } = await openPage(app, { roles: true })
  await navigate(page, 'Import Windchill export')
  await page.getByLabel(/^Name/).first().fill('S&S IT')
  await page.locator('input[type=file]').first().setInputFiles(fixture('windchill-export.csv'))
  await page.getByRole('tab', { name: /^Source data/ }).waitFor()
  const notices = page.locator('.release-page .notice')
  assert.equal(await notices.filter({ hasText: /imported/ }).count(), 0, 'no "imported" notice on the page')
  // QV-63: the import is a finished entry named after the export, with its result.
  const jobs = page.locator('.jobs-button')
  await jobs.click()
  const panel = page.getByRole('dialog', { name: 'Background jobs' })
  const imported = panel.locator('li.job', { hasText: 'Import Windchill export · S&S IT' })
  assert.match(await text(imported), /Done .*7 results imported from windchill-export\.csv\./)
  assert.match(await imported.getAttribute('class'), /\bjob-done\b/)
  await panel.getByRole('button', { name: 'Close', exact: true }).click()
  // A newer file that is not an export: the entry needs a look; the page keeps no error notice.
  await page.locator('.view-actions label[title="Import newer export"] input[type=file]').setInputFiles({ name: 'not-an-export.csv', mimeType: 'text/csv', buffer: Buffer.from('<html><body>Sign in</body></html>') })
  await page.locator('.jobs-button.jobs-failed').waitFor()
  assert.match(await text(jobs), /1 to check/, 'the top-bar button says how many need a look')
  await jobs.click()
  const failed = panel.locator('li.job-error', { hasText: 'Import Windchill export · S&S IT' })
  assert.match(await text(failed), /Needs a look .*This is a web page \(HTML\), not a CSV export\./)
  assert.equal(await notices.filter({ hasText: /web page|could not be read/ }).count(), 0, 'no error notice on the page')
  await panel.getByRole('button', { name: 'Close', exact: true }).click()
  await panel.waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'More actions: S&S IT', exact: true }).click()
  assert.match(await text(page.getByRole('menu', { name: 'S&S IT' }).locator('.view-actions-note')), /7 results · imported/, 'the data shown is unchanged')
  // CON-108: ⋯ → Upload latest export… takes a newer export for this page (the same page, its name kept).
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menu', { name: 'S&S IT' }).getByRole('menuitem', { name: 'Upload latest export…' }).click()
  await (await chooser).setFiles(fixture('windchill-export.csv'))
  await jobs.click()
  await panel.locator('li.job-done', { hasText: 'Import Windchill export · S&S IT' }).nth(1).waitFor()
  await panel.getByRole('button', { name: 'Close', exact: true }).click()
  assert.equal(await text(page.locator('header.topbar h1')), 'S&S IT', 'the same page')
  assert.deepEqual(errors, [])
  await context.close()
})
