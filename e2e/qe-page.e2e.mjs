import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { navigate, openPage, startApp, text } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'

// The QE page (DPF-02, EPS-09; TC-DPF-02 UAT, TC-EPS-07): QE Mapping was removed and its role moved to an On-Demand
// Table page. Against a mocked GitHub: the Tool Owner sets the DP bulk Epic's "QE from page" — the page named Resource
// Mapping is offered as the default — with its Platform and QE columns and saves the Feature setup to Git (by column
// id); Release Details → DP (from an on-prem DP view's data in Git) shows each release's QE from the page, and DP bulk
// Create Features prefills each release's QE. Synthetic data only; every step waits for what it needs, never for a
// time. QE_PAGE_SHOTS=<folder> saves the screenshots (1440 px, light, scale 2).
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const shots = process.env.QE_PAGE_SHOTS
const owner = 'owner@example.com'
const epicId = 15000
const policy = () => { const value = defaultPolicy(); value.defaultRole = 'Team Member'; value.members = { [owner]: ['Tool Owner'] }; return serializeAccess(value) }
// The QE page: made-up platforms and QEs (one QE given by email, so the pop-up can preselect the person).
const resourceMapping = () => JSON.stringify({ schema: 1, kind: 'on-demand-page', id: 'resource-mapping', name: 'Resource Mapping', description: 'Which QE covers which platform', keyPrefix: 'RM', insights: [],
  columns: [{ id: 'c1', name: 'Platform', type: 'text', options: [], required: true }, { id: 'c2', name: 'QE', type: 'text', options: [], required: false }],
  rows: [
    { id: 'r1', key: 'RM-261120-A1B2', seq: 1, addedBy: owner, addedAt: '2026-11-20T08:00:00.000Z', cells: { c1: 'Dose Planning', c2: 'asha.example@example.com' } },
    { id: 'r2', key: 'RM-261120-C3D4', seq: 2, addedBy: owner, addedAt: '2026-11-20T08:05:00.000Z', cells: { c1: 'Treatment Planning System', c2: 'Ben Example' } },
  ] })
const layout = () => JSON.stringify({ schema: 1, kind: 'menu-layout', groups: {}, pages: { 'resource-mapping': { type: 'table', group: 'on-demand', order: 1, icon: '▦', owners: [] } } })
const featureSetup = () => `${JSON.stringify({ schema: 1, kind: 'feature-setup', epics: [{ epicId, epicTitle: 'Example DP releases', featureDoD: 'Done when reviewed.', stories: [] }] }, null, 2)}\n`
// An on-prem DP view whose fetched data is in Git (the web app shows it): three made-up DP releases.
const base = 'https://tfs.example.invalid/Coll'
const dpView = { id: 'dp-view', reason: 'DP', viewName: 'DP', role: 'release-source', showInMenu: true, url: `${base}/DP`, baseUrl: base, token: 'e2e-token-0123456789', query: "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.State] = 'Approved'" }
const release = (id, name, version) => ({ key: `coll/dp/${id}`, id, organization: 'Coll', project: 'DP', title: `${name} ${version}`, workItemType: 'Release', state: 'Approved', assignedTo: '', areaPath: 'DP', iterationPath: 'DP', tags: '', url: '', syncedAt: '2026-11-24T08:00:00.000Z',
  fields: { 'Custom.PsName': name, 'Custom.Release': version, 'Custom.SourceProgram': 'DP', 'Custom.DDTDate': '2026-11-10T00:00:00Z' } })
const snapshot = () => JSON.stringify({ schema: 1, kind: 'azure-view-snapshot', connection: dpView, source: { connectionId: dpView.id, name: 'DP', role: 'release-source', organization: 'Coll', project: 'DP', query: dpView.query, fetchedAt: '2026-11-24T08:00:00.000Z',
  items: [release(700001, 'Dose Planning', '5.0.0.0'), release(700002, 'Planning System', '2.1.0.0'), release(700003, 'Unmapped Tool', '1.0.0.0')] } })
const repository = () => fakeGitHub({ files: { 'access.json': policy(), 'menu-layout.json': layout(), 'on-demand/resource-mapping.json': resourceMapping(), 'feature-setup.json': featureSetup(), 'azure-data/dp-view.json': snapshot() } })
async function shoot(page, name, locator) {
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await (locator ?? page).screenshot({ path: `${shots}/${name}-1440-light.png` })
}

test('TC-DPF-02: the Tool Owner sets the DP bulk Epic’s QE page (Resource Mapping by default) and its columns; the DP table and DP bulk Create Features take each release’s QE from the page', async () => {
  const gh = repository()
  const { page, context, errors } = await openPage(app, { width: 1440, height: 1000, ...(shots ? { scale: 2 } : {}), init: ({ who, view }) => {
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', who)
    localStorage.setItem('demand-planning-bulk-epics-v1', JSON.stringify({ DP: 15000 }))
    localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify([view]))
  }, initArg: { who: owner, view: dpView } })
  // The raw read of a file (the on-prem view data, like GitHub's raw media type) is answered here; the rest by the fake.
  await context.route('https://api.github.com/**', (route) => {
    const request = route.request(), file = /\/contents\/(.+)$/.exec(new URL(request.url()).pathname)?.[1]
    if (request.method() === 'GET' && /raw/.test(request.headers().accept ?? '') && file) { const body = gh.read(decodeURIComponent(file)); return body == null ? route.fulfill({ status: 404, body: '{}' }) : route.fulfill({ status: 200, contentType: 'text/plain', body }) }
    return gh.route(route)
  })
  await context.route(/dev\.azure\.com|tfs\.example\.invalid/, (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  for (const title of ['Get started', 'Could not fetch from Azure DevOps']) {
    const dialog = page.getByRole('dialog').filter({ hasText: title })
    await page.addLocatorHandler(dialog, () => dialog.getByRole('button', { name: 'Close', exact: true }).last().click())
  }
  await page.reload()
  await page.locator('.sidebar nav').waitFor()

  // (1) Setup per Epic → the DP bulk Epic: QE from page, defaulted to Resource Mapping; its columns chosen and saved.
  await page.locator('.sidebar nav button', { hasText: 'Resource Mapping' }).first().waitFor()
  await navigate(page, 'Feature & PI setup')
  await page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'Setup per Epic' }).click()
  await page.locator('.efe-epics button', { hasText: `#${epicId}` }).click()
  const fields = page.getByRole('group', { name: 'QE page' })
  await fields.waitFor()
  const from = fields.getByLabel('QE from page')
  assert.equal(await from.locator('option:checked').innerText(), 'Resource Mapping', 'the page named Resource Mapping is the default')
  assert.match(await text(fields), /Default: the page named “Resource Mapping”\. Choose its columns to use it\./)
  await fields.getByLabel('Column with the Platform / Product').selectOption({ label: 'Platform' })
  await fields.getByLabel('Column with the QE').selectOption({ label: 'QE' })
  await page.locator('.qe-page-fields small', { hasText: 'Default:' }).waitFor({ state: 'detached' })
  await shoot(page, 'epic-setup-qe-page', page.locator('.efe-main'))
  await page.getByRole('region', { name: 'Unsaved changes' }).getByRole('button', { name: 'Save to Git' }).click()
  await page.locator('.efe-main .notice', { hasText: 'Saved to Git.' }).waitFor()
  const saved = JSON.parse(gh.read('feature-setup.json')).epics.find((entry) => entry.epicId === epicId)
  assert.deepEqual(saved.qePage, { pageId: 'resource-mapping', matchColumn: 'c1', qeColumn: 'c2' }, 'stored by id')

  // (2) Release Details → DP: the QE column from the page, then Create Features prefilled from it.
  await page.locator('.sidebar nav button').filter({ hasText: /(^|[^A-Za-z])DP$/ }).first().click()
  await page.locator('.page-loading').waitFor({ state: 'detached' })
  await page.getByRole('radiogroup', { name: 'Show' }).getByRole('radio', { name: 'All months' }).click()
  const releases = page.locator('.panel', { has: page.locator('h2', { hasText: /^Releases/ }) }).first()
  await releases.locator('tbody tr', { hasText: 'Dose Planning' }).first().waitFor()
  const headers = (await releases.locator('thead th').allTextContents()).map((header) => header.replace(/[▴▾▲▼↑↓]/g, '').trim())
  const qeAt = headers.indexOf('QE')
  assert.ok(qeAt > 0, `the DP table has its QE column again: ${headers.join(' | ')}`)
  const qeOf = async (name) => (await releases.locator('tbody tr', { hasText: name }).first().locator('td').nth(qeAt).innerText()).trim()
  assert.equal(await qeOf('Dose Planning'), 'asha.example@example.com')
  assert.equal(await qeOf('Planning System'), 'Ben Example', 'whole words inside the page’s name')
  assert.equal(await qeOf('Unmapped Tool'), '')
  await releases.getByRole('button', { name: 'Select all shown', exact: true }).click()
  await releases.getByRole('button', { name: /^Create Features \(\d+\)$/ }).click()
  const dialog = page.getByRole('dialog').filter({ hasText: /Create Features for \d+ DP release/ })
  await dialog.waitFor()
  const row = (name) => dialog.locator('tbody tr', { hasText: name }).first()
  const pick = row('Dose Planning').getByRole('combobox', { name: /^QE for / })
  assert.equal(await pick.inputValue(), 'asha.example@example.com', 'prefilled from the QE page')
  assert.match(await text(row('Dose Planning')), /QE page: asha\.example@example\.com/)
  assert.match(await text(row('Planning System')), /QE page: Ben Example/)
  assert.match(await text(row('Planning System')), /no email found for Ben Example/, 'a name with no email on QMS-0025 is still skipped until a person is picked')
  assert.match(await text(row('Unmapped Tool')), /no QE on the QE page for this product/)
  await shoot(page, 'bulk-create-prefilled', dialog)
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})
