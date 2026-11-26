import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { startApp } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'

// TC-NAV-55 (NAV-55): Home has a Resource Mapping tile when the On-Demand page named Resource Mapping exists and the
// person may open it; it opens that page. Without the page there is no tile. Synthetic data, a mocked GitHub
// (e2e/fakeGitHub.mjs); every step waits for what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const lead = 'lead@example.com'
const policy = () => { const value = defaultPolicy(); value.defaultRole = 'Team Member'; value.members = { [lead]: ['Tool Owner'] }; return serializeAccess(value) }
const layout = (id) => JSON.stringify({ schema: 1, kind: 'menu-layout', groups: {}, pages: id ? { [id]: { type: 'table', group: 'on-demand', order: 1, icon: '▦', owners: [] } } : {} })
const mapping = () => JSON.stringify({
  schema: 1, kind: 'on-demand-page', id: 'resource-mapping', name: 'Resource Mapping', description: 'QE per platform', keyPrefix: 'RSM',
  columns: [{ id: 'c1', name: 'Platform', type: 'text', options: [], required: true }, { id: 'c2', name: 'QE', type: 'text', options: [], required: false }],
  rows: [{ id: 'r1', key: 'RSM-261126-A1B2', seq: 1, addedBy: 'ana@example.com', addedAt: '2026-11-26T08:00:00.000Z', cells: { c1: 'Imaging', c2: 'Alex Example' } }],
  insights: [],
})

async function open(gh) {
  const context = await app.browser.newContext({ viewport: { width: 1300, height: 1000 } })
  await context.addInitScript((work) => {
    localStorage.setItem('demand-planning-setup-guide-v1', 'dismissed')
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', work)
  }, lead)
  await context.route('https://dev.azure.com/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await context.route('https://api.github.com/**', gh.route)
  const page = await context.newPage()
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, () => guide.getByRole('button', { name: 'Close', exact: true }).last().click())
  await page.goto(app.url)
  await page.locator('.sidebar nav').waitFor()
  return { page, context }
}

test('TC-NAV-55: Home shows a Resource Mapping tile when the page exists, and it opens the page; no page, no tile', async () => {
  const withPage = await open(fakeGitHub({ files: { 'access.json': policy(), 'menu-layout.json': layout('resource-mapping'), 'on-demand/resource-mapping.json': mapping() } }))
  const { page } = withPage
  // The page is in the menu once the shared pages are read; Home then shows its tile.
  await page.locator('.sidebar nav button', { hasText: 'Resource Mapping' }).first().waitFor()
  await page.locator('.sidebar nav button', { hasText: 'Home' }).first().click()
  const tile = page.getByRole('listitem', { name: 'Resource Mapping' })
  await tile.waitFor()
  await tile.getByRole('button', { name: 'Open Resource Mapping' }).click()
  await page.locator('header.topbar h1', { hasText: 'Resource Mapping' }).waitFor()
  await withPage.context.close()

  const without = await open(fakeGitHub({ files: { 'access.json': policy(), 'menu-layout.json': layout('') } }))
  await without.page.locator('.sidebar nav button', { hasText: 'Home' }).first().click()
  await without.page.getByRole('listitem', { name: 'My Work' }).waitFor()
  assert.equal(await without.page.getByRole('listitem', { name: 'Resource Mapping' }).count(), 0)
  await without.context.close()
})
