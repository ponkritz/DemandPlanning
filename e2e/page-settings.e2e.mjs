import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { loadSample, navigate, openPage, startApp } from './helpers.mjs'

// SET-32…SET-35 (TC-SET-18 UAT, TC-SET-19, TC-SET-20): the settings of a page in a pop-up on the page itself. A Tool Owner
// sees ⚙ Settings for Time Writing, opens it — the tabs Month locks, Hour classification, Capacity, Setup per Epic and
// User Story templates, the same panels as Admin — changes the default last day to update the plan, and Admin →
// Capacity & time → Month locks shows the same change (one store, one save); Open in Admin → goes to the section. A Team
// Member sees no ⚙ on Time Writing, My Tasks [Board], DP. On Release Details → DP, ⚙ opens DP's row of
// Stream mapping, its Release counts and its Release Classification. Synthetic data only; every step waits for what it
// needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })
const shots = process.env.PAGE_SETTINGS_SHOTS
const shot = async (page, name) => { if (!shots) return; mkdirSync(shots, { recursive: true }); await page.screenshot({ path: `${shots}/${name}.png` }) }
const tabsOf = async (dialog) => { const list = dialog.getByRole('tablist', { name: 'Settings' }); await list.getByRole('tab').first().waitFor(); return (await list.getByRole('tab').allInnerTexts()).map((label) => label.trim()) }
const gear = (page, name) => page.getByRole('button', { name: `Settings for ${name}`, exact: true })

// The DP, CP, IOCC and Content queries (read-only, never answered: 401) beside the sample's Time Writing.
const query = "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.State] = 'Approved'"
const view = (name) => ({ id: name.toLowerCase().replace(/\W+/g, '-'), url: `https://azure.example.com/tfs/Collection/${encodeURIComponent(name)}`, baseUrl: 'https://azure.example.com/tfs', token: 'e2e-token-0123456789', reason: name, viewName: name, role: 'release-source', query, showInMenu: true })
const profiles = [{ id: 'tw', url: 'https://dev.azure.com/example-org/Example%20Project/_backlogs/backlog/Team%20A/Epics', token: '', reason: 'QMS-0025', role: 'time-tracking', showInMenu: true }, ...['DP', 'CP', 'IOCC', 'Content'].map(view)]
async function open(roles, { streams = false } = {}) {
  const opened = await openPage(app, { roles, width: 1440, height: 1000, scale: shots ? 2 : undefined, ...(streams ? { init: (list) => { localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify(list)) }, initArg: profiles } : {}) })
  await opened.page.emulateMedia({ colorScheme: 'light' })
  if (streams) {
    await opened.context.route(/azure\.example\.com|dev\.azure\.com/, (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
    for (const name of ['Get started', 'Could not fetch from Azure DevOps']) {
      const dialog = opened.page.getByRole('dialog').filter({ hasText: name })
      await opened.page.addLocatorHandler(dialog, () => dialog.getByRole('button', { name: 'Close', exact: true }).last().click())
    }
  }
  await loadSample(opened.page)
  return opened
}

test('TC-SET-18: a Tool Owner opens ⚙ Settings for Time Writing (the Month locks, in its last-day tile), changes a Month lock day there and Admin shows the same change; Open in Admin → opens the section', async () => {
  const { page, context, errors } = await open(true)
  await navigate(page, 'Time Writing')
  // SET-36: Time Writing's ⚙ opens the Month locks only — in its "last day" tile, or at the top right while the tiles are
  // not shown (who you are in Azure DevOps not known yet, as here).
  assert.equal(await gear(page, 'Time Writing').count(), 1, 'one ⚙ on Time Writing')
  await gear(page, 'Time Writing').click()
  const dialog = page.getByRole('dialog', { name: 'Settings for Time Writing' })
  await dialog.waitFor()
  // The Month locks panel of Admin, with its Git bar and Reason for change.
  const planDay = dialog.getByLabel('Last day to update the plan')
  await planDay.waitFor()
  assert.equal(await dialog.getByText('Open in Admin →').count(), 1, 'each tab links to its Admin section')
  await planDay.fill('9')
  await dialog.getByText('of the month (every month without its own date)').waitFor()
  await planDay.blur()
  assert.equal(await planDay.inputValue(), '9')
  await shot(page, 'page-settings-time-writing')
  assert.equal(await dialog.getByRole('tab', { name: 'Hour classification' }).count(), 0, 'only the Month locks on Time Writing')
  // Escape closes the pop-up; the ⚙ gets the focus back.
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  // Admin → Capacity & time → Month locks: the same change (one store, saved the same way).
  await navigate(page, 'Capacity & time')
  await page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'Month locks' }).click()
  assert.equal(await page.getByLabel('Last day to update the plan').inputValue(), '9', 'Admin shows the change made in the pop-up')
  // Open in Admin → from the pop-up opens that section.
  await navigate(page, 'My Tasks [Board]')
  await gear(page, 'My Tasks [Board]').click()
  const tasks = page.getByRole('dialog', { name: 'Settings for My Tasks [Board]' })
  assert.deepEqual(await tabsOf(tasks), ['Month locks', 'Hour classification', 'Capacity', 'Setup per Epic', 'User Story templates'], 'the settings of My Tasks [Board], in order')
  // The other tabs are the Admin panels too.
  await tasks.getByRole('tab', { name: 'Capacity', exact: true }).click()
  await tasks.getByRole('heading', { name: 'Capacity roles' }).waitFor()
  await tasks.getByRole('tab', { name: 'User Story templates' }).click()
  await tasks.getByRole('heading', { name: 'User Story templates' }).first().waitFor()
  assert.equal(await tasks.getByRole('heading', { name: 'My templates' }).count(), 0, 'My templates stay in Admin (personal)')
  await tasks.getByRole('tab', { name: 'Hour classification' }).click()
  await tasks.getByRole('button', { name: 'Open in Admin →' }).click()
  await tasks.waitFor({ state: 'detached' })
  await page.locator('header.topbar h1', { hasText: 'Capacity & time' }).waitFor()
  await page.getByRole('tab', { name: 'Hour classification', selected: true }).waitFor()
  // Team overview and Pulse Check have theirs.
  await navigate(page, 'Team overview')
  await gear(page, 'Team overview').click()
  const overview = page.getByRole('dialog', { name: 'Settings for Team overview' })
  assert.deepEqual(await tabsOf(overview), ['Capacity', 'Thresholds', 'Calculation profiles', 'Table & chart defaults'])
  await overview.getByRole('button', { name: 'Close', exact: true }).last().click()
  await overview.waitFor({ state: 'detached' })
  await navigate(page, 'Pulse Check')
  await gear(page, 'Pulse Check').click()
  const pulse = page.getByRole('dialog', { name: 'Settings for Pulse Check' })
  assert.deepEqual(await tabsOf(pulse), ['Monthly pack', 'Table & chart defaults'])
  await page.keyboard.press('Escape')
  await pulse.waitFor({ state: 'detached' })
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-SET-19: a Team Member sees no ⚙ settings on Time Writing, My Tasks [Board] or a Release Details page', async () => {
  const { page, context, errors } = await open('Team Member', { streams: true })
  for (const name of ['Time Writing', 'My Tasks [Board]', 'DP']) {
    await navigate(page, name)
    await page.locator('header.topbar h1', { hasText: name }).waitFor()
    await page.locator('.content').first().waitFor()
    assert.equal(await page.getByRole('button', { name: /^Settings for / }).count(), 0, `${name}: no ⚙ for a Team Member`)
  }
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-SET-20: on Release Details → DP the ⚙ opens DP’s row of Stream mapping, its Release counts and its Release Classification', async () => {
  const { page, context, errors } = await open(true, { streams: true })
  await navigate(page, 'DP')
  await gear(page, 'DP').click()
  const dialog = page.getByRole('dialog', { name: 'Settings for DP' })
  await dialog.waitFor()
  assert.deepEqual(await tabsOf(dialog), ['Stream mapping', 'Release counts', 'Release Classification'])
  // Stream mapping: DP's row (with its data sets) only, no other stream and none of the panels below it.
  const rows = dialog.locator('.connection-panel table tbody tr td:first-child strong')
  await rows.first().waitFor()
  const streams = (await rows.allInnerTexts()).map((name) => name.trim())
  assert.ok(streams.includes('DP'), 'DP’s row')
  for (const other of ['Time Writing', 'CP', 'IOCC', 'Content', 'Tool Validations']) assert.ok(!streams.includes(other), `no ${other} row`)
  await shot(page, 'page-settings-release-dp')
  // Release counts open on DP.
  await dialog.getByRole('tab', { name: 'Release counts' }).click()
  assert.equal(await dialog.getByLabel('Stream for entered counts').inputValue(), 'DP')
  // Release Classification: Setup per Epic of DP's bulk creation Epic (none mapped in the sample: it says so).
  await dialog.getByRole('tab', { name: 'Release Classification' }).click()
  await dialog.locator('.page-settings-class').waitFor()
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  await gear(page, 'DP').waitFor()
  assert.deepEqual(errors, [])
  await context.close()
})
