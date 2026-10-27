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
  const body = await text(releases)
  assert.match(body, /6 releases · 6 of 7 documents · 1 clubbed/)
  for (const row of ['Remote Diagnostics 1.6 ▸ 2 documents', 'Service1 1 ▸ 1 document', 'Service2 2 ▸ 1 document', 'CareLink 3.2']) assert.ok(body.includes(row), row)
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
