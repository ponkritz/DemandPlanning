import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { cachedRoles, loadSample, navigate, openPage, startApp, text } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'

// The Release Classification detected from the release number (DPF-10…DPF-12; TC-DPF-09 UAT, TC-DPF-10, TC-DPF-11)
// against a mocked GitHub and the synthetic sample: a Tool Owner sets, per value of an Epic's Release Classification
// list, the part of the release number that gives it, and saves the Epic setup to Git; with that Epic as the DP bulk
// creation Epic, Release Details → DP and its Create Features show the detected values, Release name → Version →
// Release Classification first. Nothing is fetched (Azure DevOps answers 401); every step waits for what it needs.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

// Optional screenshots for the pull request (E2E_SHOTS=<folder>); the assertions never depend on them.
const shots = process.env.E2E_SHOTS
const shot = async (page, name, locator) => { if (!shots) return; mkdirSync(shots, { recursive: true }); await (locator ?? page).screenshot({ path: `${shots}/${name}.png` }) }

const epicId = 15000
// Stored in this order: the setup screen lists Release Name, Version, Release Classification first (DPF-12).
const epicSetup = { schema: 1, kind: 'epic-setup', lists: [{ id: 'classes', name: 'Classes', values: ['New product', 'Release', 'MLD', 'PU'] }], epics: [{ epicId, epicTitle: 'E2E DP releases', fields: [
  { label: 'Program', type: 'text', ifEmpty: 'optional', into: 'title' },
  { label: 'Release Classification', type: 'list', list: 'classes', ifEmpty: 'optional', into: 'description' },
  { label: 'Version', type: 'text', ifEmpty: 'optional', into: 'description' },
  { label: 'Release Name', type: 'text', ifEmpty: 'optional', into: 'description' },
] }] }

test('TC-DPF-09: a Tool Owner sets the Release Classification rules per value in Epic & Feature setup and saves them to Git; DP Create Features and the DP release table show the detected values, Release name → Version → Release Classification first', async () => {
  const gh = fakeGitHub({ files: { 'access.json': cachedRoles('Tool Owner'), 'epic-setup.json': `${JSON.stringify(epicSetup, null, 2)}\n` } })
  // (1) The Tool Owner with Git storage connected.
  const owner = await openPage(app, { width: 1440, height: 1000, roles: true, init: () => {
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', 'owner@example.com')
  } })
  let page = owner.page
  await owner.context.route('https://api.github.com/**', gh.route)
  await owner.context.route(/dev\.azure\.com|azure\.example\.com/, (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, () => guide.getByRole('button', { name: 'Close', exact: true }).last().click())
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, 'Feature & PI setup')
  await page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'Setup per Epic' }).click()
  await page.locator('.efe-epics button', { hasText: `#${epicId}` }).click()
  const rules = page.locator('fieldset.efe-rules')
  await rules.waitFor()
  // (a) Release Name, Version, Release Classification first, then the others (DPF-12).
  assert.deepEqual(await page.locator('.efe-fieldrow').getByLabel(/^Field \d+ label$/).evaluateAll((inputs) => inputs.map((input) => input.value)), ['Release Name', 'Version', 'Release Classification', 'Program'])
  assert.match(await text(rules), /No rules saved: the value named like the release type .* is pre-filled, as before\./, 'no rules yet: today’s behaviour')
  // Fill with the usual rules: only the values named so (MLD → x.y.z, PU → x.y.z.w).
  await rules.getByRole('button', { name: 'Fill with the usual rules' }).click()
  const box = (value, part) => rules.getByRole('checkbox', { name: `${value}: ${part}`, exact: true })
  assert.equal(await box('MLD', 'x.y.z — third number').isChecked(), true)
  assert.equal(await box('PU', 'x.y.z.w — fourth number').isChecked(), true)
  assert.equal(await box('Release', 'x.y — second number').isChecked(), false)
  await box('New product', 'x.0 — first number only').check()
  await box('Release', 'x.y — second number').check()
  // A part given to two values is named, and the setup is not saved until fixed.
  await box('Release', 'x.0 — first number only').check()
  assert.match(await text(rules.locator('.notice')), /x\.0 is given to New product and Release: a part of the release number may decide one value only\./)
  const saveBar = page.getByRole('region', { name: 'Unsaved changes' })
  await saveBar.getByRole('button', { name: 'Save to Git' }).click()
  await page.locator('.efe-main .notice', { hasText: /^Not saved: Epic #15000 Release Classification: x\.0 is given to New product and Release/ }).waitFor()
  assert.equal(JSON.parse(gh.read('epic-setup.json')).epics[0].fields[1].classRules, undefined, 'nothing written')
  await box('Release', 'x.0 — first number only').uncheck()
  await rules.locator('.notice', { hasText: 'is given to' }).waitFor({ state: 'detached' })
  await shot(page, 'setup-rules', page.locator('.efe-section', { has: rules }))
  await saveBar.getByRole('button', { name: 'Save to Git' }).click()
  await page.locator('.efe-main .notice', { hasText: 'Saved to Git.' }).waitFor()
  const saved = JSON.parse(gh.read('epic-setup.json'))
  assert.deepEqual(saved.epics[0].fields.find((field) => field.label === 'Release Classification').classRules, [{ value: 'MLD', parts: ['x.y.z'] }, { value: 'PU', parts: ['x.y.z.w'] }, { value: 'New product', parts: ['x.0'] }, { value: 'Release', parts: ['x.y'] }], 'saved with the field in epic-setup.json')
  assert.deepEqual(saved.epics[0].fields.map((field) => field.label), epicSetup.epics[0].fields.map((field) => field.label), 'the saved field order is kept')
  assert.deepEqual(owner.errors, [])
  await owner.context.close()

  // (2) Release Details → DP with the synthetic sample: the Epic setup as last read from Git, Epic #15000 as my DP
  // bulk creation Epic. The sample's DP rows carry x.0 (v7.0, v6.0) and x.y (v4.2 …) numbers.
  const query = "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.State] = 'Approved'"
  const profiles = [{ id: 'tw', url: 'https://dev.azure.com/ALMP-ORG-MSTP01/Patient%20Safety%20and%20Quality/_backlogs/backlog/InD%20Quality/Epics', token: '', reason: 'QMS-0025', role: 'time-tracking', showInMenu: true },
    { id: 'dp', url: 'https://azure.example.com/tfs/Collection/DP', baseUrl: 'https://azure.example.com/tfs', token: 'e2e-token-0123456789', reason: 'DP', viewName: 'DP', role: 'release-source', query, showInMenu: true }]
  const viewer = await openPage(app, { width: 1440, height: 1000, roles: true, init: ({ list, setup }) => {
    localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify(list))
    localStorage.setItem('demand-planning-epic-setup-v1', setup)
    localStorage.setItem('demand-planning-bulk-epics-v1', JSON.stringify({ DP: 15000 }))
  }, initArg: { list: profiles, setup: gh.read('epic-setup.json') } })
  page = viewer.page
  await viewer.context.route(/azure\.example\.com|dev\.azure\.com/, (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  for (const title of ['Get started', 'Could not fetch from Azure DevOps']) {
    const dialog = page.getByRole('dialog').filter({ hasText: title })
    await page.addLocatorHandler(dialog, () => dialog.getByRole('button', { name: 'Close', exact: true }).last().click())
  }
  await loadSample(page)
  await page.locator('.sidebar nav button').filter({ hasText: /(^|[^A-Za-z])DP$/ }).first().click()
  await page.locator('.page-loading').waitFor({ state: 'detached' })
  await page.locator('.release-source').getByRole('button', { name: 'More actions: DP', exact: true }).waitFor()
  await page.getByRole('radiogroup', { name: 'Show' }).getByRole('radio', { name: 'All months' }).click()
  const releases = page.locator('.panel', { has: page.locator('h2', { hasText: /^Releases/ }) }).first()
  await releases.locator('thead').waitFor()
  // (c) Select, then Release name, Version, Release Classification (detected) first (DPF-12).
  const headers = (await releases.locator('thead th').allTextContents()).map((header) => header.replace(/[▴▾▲▼↑↓]/g, '').trim())
  assert.deepEqual(headers.slice(0, 4), ['Select', 'Release name', 'Version', 'Release Classification (detected)'])
  const row = (version) => releases.locator('tbody tr', { hasText: `DP ${version}` }).first()
  const cells = async (version) => (await row(version).locator('td').allInnerTexts()).slice(1, 4).map((cell) => cell.trim())
  assert.deepEqual(await cells('v4.2'), ['Design Review Approval — DP', '4.2', 'Release'], 'x.y → Release')
  assert.deepEqual(await cells('v3.9'), ['Design Review Approval — DP', '3.9', 'Release'])
  const contentRow = releases.locator('tbody tr', { hasText: 'Content v7.0' }).first()
  assert.deepEqual((await contentRow.locator('td').allInnerTexts()).slice(2, 4).map((cell) => cell.trim()), ['7.0', 'New product'], 'x.0 → New product (no built-in name would match it)')
  await shot(page, 'dp-release-table', releases)
  // (b) Create Features: Release name, Version, Release Classification, then the rest; each row prefilled, with its hint.
  await releases.getByRole('button', { name: 'Select all shown', exact: true }).click()
  await releases.getByRole('button', { name: /^Create Features \(\d+\)$/ }).click()
  const dialog = page.getByRole('dialog').filter({ hasText: /Create Features for \d+ DP release/ })
  await dialog.waitFor()
  assert.deepEqual((await dialog.locator('thead th').allTextContents()).map((header) => header.trim()), ['Release name', 'Version', 'Release Classification', 'Feature title', 'User Stories', 'Start date', 'Target date', 'Time Writing Tasks', 'QE', 'Result'])
  const pick = (version) => dialog.locator('tbody tr', { hasText: version }).first()
  const select = (version) => pick(version).getByRole('combobox', { name: /^Release Classification of / })
  assert.equal(await select('7.0').inputValue(), 'New product')
  assert.equal(await select('4.2').inputValue(), 'Release')
  assert.match(await text(pick('4.2')), /detected from 4\.2/)
  // The person can still change it; the hint then names what was detected.
  await select('4.2').selectOption('MLD')
  await pick('4.2').getByText('Release detected from 4.2').waitFor()
  await select('4.2').selectOption('Release')
  await pick('4.2').getByText('detected from 4.2', { exact: true }).waitFor()
  await shot(page, 'create-features-rows', dialog)
  assert.deepEqual(viewer.errors, [])
  await viewer.context.close()
})
