import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { loadSample, openPage, profileItem, startApp, text } from './helpers.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'

// SET-26…SET-29 (TC-SET-13 UAT, TC-SET-14, TC-SET-15, TC-SET-16): Admin in seven pages. As a Tool Owner the menu lists the
// seven pages in order and Admin opens on the Overview; a remembered or linked old page or section ('options',
// 'pireview', 'audit', 'storage:sample', a remembered 'capacity:period') opens its new place; Streams → Stream mapping
// has the Epics to match per stream and My settings the person's own bulk creation Epics. A Scrum Master whose role holds
// only "PI Review: set up the review form" sees Feature & PI setup with the PI Review form only, and no Latest changes.
// Synthetic data only (no Azure DevOps, no GitHub); every step waits for what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })
const shots = process.env.ADMIN_SHOTS
const shot = async (page, name) => { if (!shots) return; mkdirSync(shots, { recursive: true }); await page.screenshot({ path: `${shots}/${name}.png` }) }
const tabs = async (page) => (await page.getByRole('tablist', { name: 'Sections' }).getByRole('tab').allInnerTexts()).map((label) => label.trim())
// The entries of the ADMIN group of the menu, and opening one of them.
const adminGroup = (page) => page.locator('.sidebar .nav-section', { has: page.locator('button.nav-group', { hasText: 'ADMIN' }) })
const adminMenu = async (page) => (await adminGroup(page).locator('.nav-items button').allTextContents()).map((label) => label.replace(/^\W+/, '').trim())
const openAdmin = async (page, label) => { await adminGroup(page).locator('.nav-items button', { hasText: label }).first().click(); await page.locator('header.topbar h1', { hasText: label }).waitFor(); await page.locator('.page-loading').waitFor({ state: 'detached' }) }
const pages = ['Overview', 'Streams', 'Feature & PI setup', 'People & access', 'Capacity & time', 'Pages & reports', 'Data & history']
// Opens the app with an Admin page (and its sections) remembered from before, as a browser of an older version had them.
const remembered = ({ tab, sections }) => { localStorage.setItem('demand-planning-settings-tab-v1', tab); if (sections) localStorage.setItem('demand-planning-settings-section-v1', JSON.stringify(sections)) }

test('TC-SET-13: Admin has seven pages in order, opening on the Overview; old keys open their new place; a role with only PI Review setup sees the PI Review form and, read only, Lists and templates', async () => {
  const { page, context, errors } = await openPage(app, { roles: true, width: 1440, height: 1000, scale: shots ? 2 : undefined })
  await page.emulateMedia({ colorScheme: 'light' })
  await loadSample(page)
  // The seven pages, in order, in the ADMIN group of the menu.
  await adminGroup(page).locator('.nav-items button', { hasText: 'Data & history' }).waitFor({ state: 'attached' })
  const menu = await adminMenu(page)
  assert.deepEqual(menu, pages, 'the seven pages, in order')
  for (const old of ['Stream options', 'Epic & Feature setup', 'PI Review Setup', 'People & roles', 'Reports', 'Data & sharing', 'Pages & menu', 'History']) assert.ok(!menu.includes(old), `no ${old}`)
  // Admin (the Home tile, the first page) opens on the Overview.
  await openAdmin(page, 'Overview')
  assert.equal(await text(page.locator('header.topbar h1')), 'Overview')
  await page.getByRole('heading', { name: 'Latest changes' }).waitFor()
  await shot(page, 'admin-7-pages-overview')
  // Streams: Stream mapping (with the Epics to match per stream), Release counts, Bulk creation.
  await openAdmin(page, 'Streams')
  assert.deepEqual(await tabs(page), ['Stream mapping', 'Release counts', 'Bulk creation'])
  await page.getByRole('tab', { name: 'Stream mapping' }).click()
  await page.locator('th', { hasText: 'Epics to match' }).waitFor()
  await page.getByRole('button', { name: 'Epics to match DP Features in' }).click()
  const epics = page.getByRole('dialog', { name: 'Epics to match DP Features in' })
  await epics.waitFor()
  assert.equal(await epics.getByLabel('Stream for Feature matching').count(), 0, 'the pop-up is for DP only')
  await epics.getByRole('button', { name: 'Done' }).click()
  await epics.waitFor({ state: 'detached' })
  await shot(page, 'admin-7-pages-streams')
  await page.getByRole('tab', { name: 'Bulk creation' }).click()
  const bulk = page.getByRole('table', { name: 'Bulk creation Epics' })
  await bulk.waitFor()
  assert.deepEqual((await bulk.locator('thead th').allTextContents()).map((label) => label.trim()), ['Stream', 'Shared', 'Used'], 'the shared Epics only (SET-29)')
  // Feature & PI setup: the four sections; Capacity & time: five; Pages & reports: three; Data & history: six.
  await openAdmin(page, 'Feature & PI setup')
  assert.deepEqual(await tabs(page), ['Setup per Epic', 'Lists', 'User Story templates', 'PI Review form'])
  await openAdmin(page, 'Capacity & time')
  assert.deepEqual(await tabs(page), ['Capacity', 'Calculation profiles', 'Hour classification', 'Thresholds', 'Month locks'])
  await page.getByRole('tab', { name: 'Capacity', exact: true }).click()
  await page.getByRole('heading', { name: 'Capacity roles' }).waitFor()
  await openAdmin(page, 'People & access')
  assert.deepEqual(await tabs(page), ['People', 'Team tree', 'Role rights'])
  await openAdmin(page, 'Pages & reports')
  assert.deepEqual(await tabs(page), ['Menu groups & pages', 'Monthly pack', 'Table & chart defaults'])
  await openAdmin(page, 'Data & history')
  assert.deepEqual(await tabs(page), ['Git storage', 'Other views', 'Connections in Git', 'Historical hours', 'Changes', 'Demo data'])
  await page.getByRole('tab', { name: 'Demo data' }).click()
  await page.getByRole('button', { name: 'Load synthetic sample dataset' }).waitFor()
  await page.getByRole('button', { name: 'Reset synthetic MVP data' }).waitFor()
  await shot(page, 'admin-7-pages-data')
  // My settings: the person's own bulk creation Epics (the Mine column, SET-29).
  await profileItem(page, 'My settings')
  await page.getByRole('tab', { name: 'My bulk creation Epics' }).click()
  const mine = page.getByRole('table', { name: 'My bulk creation Epics' })
  await mine.waitFor()
  assert.deepEqual((await mine.locator('thead th').allTextContents()).map((label) => label.trim()), ['Stream', 'Mine', 'Used'])
  // Look & feel no longer holds Table and chart defaults (SET-30).
  await profileItem(page, 'Look & feel')
  assert.deepEqual(await tabs(page), ['Page layout', 'Theme and zoom', 'Start view and menu'])
  assert.deepEqual(errors, [])
  await context.close()

  // SET-28: sections remembered by an older version (Period control, Read-only sources) open where they live now.
  const opened = await openPage(app, { roles: true, init: remembered, initArg: { tab: 'audit', sections: { capacity: 'period', storage: 'sources' } } })
  await openAdmin(opened.page, 'Capacity & time')
  await opened.page.getByRole('tab', { name: 'Month locks', selected: true }).waitFor()
  await openAdmin(opened.page, 'Data & history')
  await opened.page.getByRole('tab', { name: 'Other views', selected: true }).waitFor()
  // The old names still find the new place in Search settings (Ctrl K), which opens it.
  for (const [words, header, section] of [['stream options', 'Streams', 'Stream mapping'], ['pi review setup', 'Feature & PI setup', 'PI Review form'], ['history audit', 'Data & history', 'Changes'], ['synthetic sample', 'Data & history', 'Demo data'], ['period control', 'Capacity & time', 'Month locks']]) {
    await opened.page.keyboard.press('Control+k')
    const search = opened.page.getByRole('dialog').filter({ hasText: 'Search settings' })
    await search.getByLabel('Search settings').fill(words)
    await search.getByLabel('Search settings').press('Enter')
    await search.waitFor({ state: 'detached' })
    await opened.page.locator('header.topbar h1', { hasText: header }).waitFor()
    await opened.page.getByRole('tab', { name: section, exact: true, selected: true }).waitFor()
  }
  assert.deepEqual(opened.errors, [])
  await opened.context.close()
})

test('TC-SET-13: a Scrum Master whose role holds only “PI Review: set up the review form” sees Feature & PI setup with the PI Review form and, read only, Lists and User Story templates, and no Latest changes', async () => {
  const policy = defaultPolicy(); policy.defaultRole = 'Scrum Master'; policy.roles['Scrum Master'].actions = ['pireview.setup']
  const { page, context, errors } = await openPage(app, { init: (text) => { localStorage.setItem('demand-planning-access-v1', text) }, initArg: serializeAccess(policy) })
  await adminGroup(page).locator('.nav-items button', { hasText: 'Feature & PI setup' }).waitFor({ state: 'attached' })
  const menu = await adminMenu(page)
  assert.ok(!menu.includes('Capacity & time'), 'no Capacity & time: none of its rights')
  await openAdmin(page, 'Feature & PI setup')
  assert.equal(await text(page.locator('header.topbar h1')), 'Feature & PI setup')
  assert.deepEqual(await tabs(page), ['Lists', 'User Story templates', 'PI Review form'], 'Lists and templates read only for everyone (SET-31); no Setup per Epic')
  await page.getByRole('tab', { name: 'PI Review form' }).click()
  await page.getByText('PI Review starts from').first().waitFor()
  await shot(page, 'admin-7-pages-scrum-master')
  // The Overview without Latest changes; Data & history without Changes and Connections in Git (SET-27).
  await openAdmin(page, 'Overview')
  await page.getByRole('heading', { name: 'Setup health' }).waitFor()
  assert.equal(await page.getByRole('heading', { name: 'Latest changes' }).count(), 0)
  await openAdmin(page, 'Data & history')
  assert.deepEqual(await tabs(page), ['Git storage', 'Other views', 'Demo data'])
  await page.getByRole('tab', { name: 'Demo data' }).click()
  await page.getByRole('button', { name: 'Load synthetic sample dataset' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Reset synthetic MVP data' }).count(), 0, 'Reset needs “Shared setup in Git”')
  assert.deepEqual(errors, [])
  await context.close()
})
