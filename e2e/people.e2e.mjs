import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { loadSample, menuOf, navigate, openPage, openPerson, startApp, text, toggleFilter } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'

// Admin → People & roles → People (CAP-58…CAP-62; TC-CAP-30…TC-CAP-34, TC-CAP-31 UAT): a read-only list with filters,
// a drawer to edit a person (profile with the planning data, app access roles in access.json), the bulk edit, the
// warnings in one line, Default Time tracking started in the ⋯ menu, the Team tree tab, and the month's capacity on
// Capacity & time. Every step waits for what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const rowNames = (page) => page.locator('.people-table tbody tr').evaluateAll((rows) => rows.map((row) => row.dataset.rowKey))
const jobs = async (page) => { await page.locator('.jobs-button').click(); const panel = page.getByRole('dialog', { name: 'Background jobs' }); await panel.waitFor(); return panel }

test('TC-CAP-30: the People list is read-only, filtered by Region, Role, Access role and Status (Active and Left by default), with search and Reset filters', async () => {
  const { page, context, errors } = await openPage(app, { roles: true })
  await loadSample(page)
  await navigate(page, 'People & roles')
  const table = page.locator('.people-table')
  await table.waitFor()
  assert.equal(await table.locator('tbody').locator('select, input:not([type=checkbox]), textarea').count(), 0, 'no field in the rows: the list is read-only')
  const all = await rowNames(page)
  assert.ok(all.length >= 6, `the sample people are listed: ${all.join(', ')}`)
  assert.equal(await text(page.getByRole('button', { name: /^Status: / })), '2 selected ▾', 'Status starts on Active and Left')
  assert.match(await text(page.locator('.people-table tr[data-row-key="Chen Wei"]')), /Chen Wei 6 months · .*Default \(Tool Owner\) India QE Ben Okafor Active since /)
  // Region: only that region's people; Reset filters brings everyone back.
  await toggleFilter(page, 'Region', 'India')
  const india = await rowNames(page)
  assert.ok(india.includes('Chen Wei') && !india.includes('Ben Okafor'), `India only: ${india.join(', ')}`)
  assert.match(await text(page.locator('.data-table-status')), new RegExp(`^${india.length} of ${all.length} people$`))
  await page.getByRole('button', { name: 'Reset filters' }).click()
  assert.deepEqual(await rowNames(page), all)
  // Role and search.
  await toggleFilter(page, 'Role', 'Lead')
  assert.ok((await rowNames(page)).every((name) => ['Ana Costa', 'Ben Okafor'].includes(name)), 'Lead only')
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await page.getByLabel('Search people').fill('chen')
  assert.deepEqual(await rowNames(page), ['Chen Wei'])
  await page.getByRole('button', { name: 'Reset filters' }).click()
  // Status: a person Not part of the team leaves the default list and is one click away.
  const drawer = await openPerson(page, 'Fatima Zahra')
  await drawer.getByRole('button', { name: 'Not part of the team' }).click()
  await page.getByRole('form', { name: 'Fatima Zahra not part of the team' }).getByRole('button', { name: 'Remove from the team' }).click()
  await page.keyboard.press('Escape')
  await drawer.waitFor({ state: 'detached' })
  assert.equal((await rowNames(page)).includes('Fatima Zahra'), false, 'not in the default list')
  await toggleFilter(page, 'Status', 'Not part of the team')
  assert.match(await text(page.locator('.people-table tr[data-row-key="Fatima Zahra"]')), /Not part of the team$/, 'shown with the Status filter')
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-CAP-31: a person is edited in the drawer — region and app access roles saved in two saves (planning data, access.json), Mark as left removes their access too', async () => {
  const policy = defaultPolicy()
  policy.defaultRole = 'Team Member'
  policy.members = { 'lead@example.com': ['Tool Owner'], 'omar.haddad@example.com': ['Team Member'] }
  const gh = fakeGitHub({ files: { 'access.json': serializeAccess(policy) } })
  const profile = { id: 'tw-people', url: 'https://dev.azure.com/example/Project/_backlogs/backlog/Team%20A/Features', reason: 'Time Writing', token: 'x'.repeat(52), role: 'time-tracking', creatorEmail: 'lead@example.com' }
  const { page, context, errors } = await openPage(app, { init: (connection) => {
    localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify([connection]))
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', 'lead@example.com')
  }, initArg: profile })
  await context.route('https://api.github.com/**', gh.route)
  // The team list answers; every other Azure DevOps call is refused, so nothing is fetched or written there.
  await context.route('https://dev.azure.com/**', (route) => /\/teams\/[^/]+\/members/.test(route.request().url())
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ value: [{ identity: { displayName: 'Rita Gomez', uniqueName: 'rita.gomez@example.com' } }, { identity: { displayName: 'Omar Haddad', uniqueName: 'omar.haddad@example.com' } }, { identity: { displayName: 'Lea Lead', uniqueName: 'lead@example.com' } }] }) })
    : route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, () => guide.getByRole('button', { name: 'Close', exact: true }).last().click())
  await page.reload()
  await navigate(page, 'People & roles')
  await page.locator('.people-table tr[data-row-key="Rita Gomez"]').waitFor()
  // View first: the person's facts and sections; Edit turns them into fields.
  const drawer = await openPerson(page, 'Rita Gomez')
  assert.match(await text(drawer), /Email rita\.gomez@example\.com Status Active.* Access App access roles Default \(Team Member\) Profile Region Not set/)
  assert.equal(await drawer.getByRole('combobox').count(), 0, 'nothing to change before Edit')
  await drawer.getByRole('button', { name: 'Edit', exact: true }).click()
  await drawer.getByLabel('Region', { exact: true }).selectOption('India')
  await drawer.getByRole('button', { name: 'App access roles: Default (Team Member)' }).click()
  const list = page.getByRole('listbox', { name: 'App access roles' })
  for (const role of ['Scrum Master', 'Team Member']) await list.getByRole('checkbox', { name: role, exact: true }).check()
  await page.keyboard.press('Escape')
  await list.waitFor({ state: 'detached' })
  // Unsaved edits ask before the drawer moves on; Keep editing keeps them.
  await drawer.getByRole('button', { name: 'Previous person' }).click()
  const ask = page.getByRole('dialog', { name: 'Discard your changes?' })
  await ask.getByRole('button', { name: 'Keep editing' }).click()
  await ask.waitFor({ state: 'detached' })
  await drawer.getByRole('button', { name: 'Save', exact: true }).click()
  await drawer.getByRole('button', { name: 'Edit', exact: true }).waitFor()
  // Save 1: access.json — Rita's roles, in the matrix order.
  const accessFile = () => JSON.parse(gh.read('access.json')).members
  assert.deepEqual(accessFile()['rita.gomez@example.com'], ['Scrum Master', 'Team Member'])
  assert.match(await text(drawer.getByRole('region', { name: 'Access' })), /Scrum Master\s*Team Member/)
  assert.match(await text(drawer.getByRole('region', { name: 'Profile' })), /Region India/)
  await page.keyboard.press('Escape')
  await drawer.waitFor({ state: 'detached' })
  const panel = await jobs(page)
  assert.match(await text(panel.locator('li.job', { hasText: 'Access · Rita Gomez' })), /Rita Gomez: app access roles Scrum Master, Team Member; saved to access\.json\./)
  assert.match(await text(panel.locator('li.job', { hasText: 'Save Rita Gomez' })), /Rita Gomez: region = India\. Saved with the planning data/)
  await panel.getByRole('button', { name: 'Close', exact: true }).click()
  // Save 2: the planning data, with the Git bar's Save to Git as before.
  await page.locator('.git-bar-dirty').getByRole('button', { name: 'Save to Git' }).click()
  await page.locator('.git-bar-synced').waitFor()
  assert.equal(JSON.parse(gh.read('planning-data.json')).resourceProfiles['Rita Gomez'].region, 'India')
  // Mark as left…: Left on and, ticked by default, their app access removed (one more save of access.json).
  const omar = await openPerson(page, 'Omar Haddad')
  await omar.getByRole('button', { name: 'Mark as left…' }).click()
  const form = page.getByRole('form', { name: 'Mark Omar Haddad as left' })
  await form.getByLabel('Left the team on').fill('2026-11-20')
  assert.equal(await form.getByRole('checkbox', { name: /Also remove their app access \(Team Member\)/ }).isChecked(), true)
  await form.getByRole('button', { name: 'Mark as left' }).click()
  await form.waitFor({ state: 'detached' })
  await omar.locator('.od-row-facts', { hasText: /Status\s*Left on/ }).waitFor()
  await omar.getByRole('region', { name: 'Access' }).getByText('Default (Team Member)').waitFor()
  assert.equal('omar.haddad@example.com' in accessFile(), false, 'their app access is removed')
  await page.keyboard.press('Escape')
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized|Failed to load resource/.test(entry)), [])
  await context.close()
})

test('TC-CAP-32: bulk edit — tick two people, Set region… saves both in one change; Set access role… is disabled with the reason without Git storage', async () => {
  const { page, context, errors } = await openPage(app, { roles: true })
  await loadSample(page)
  await navigate(page, 'People & roles')
  await page.locator('.people-table').waitFor()
  for (const name of ['Chen Wei', 'Diya Sharma']) await page.getByRole('checkbox', { name: `Select ${name}` }).check()
  const bar = page.getByRole('region', { name: 'Selected people' })
  assert.match(await text(bar), /^2 selected Set region… Set role… Set access role… Clear selection/)
  assert.equal(await bar.getByRole('button', { name: 'Set access role…' }).isDisabled(), true)
  assert.match(await text(bar.locator('.write-blocked')), /needs Git storage with a token that can write/, 'the reason is a visible line (CON-102)')
  await bar.getByRole('button', { name: 'Set region…' }).click()
  const dialog = page.getByRole('form', { name: 'Set region for 2 people' })
  assert.match(await text(dialog), /Chen Wei, Diya Sharma/)
  await dialog.getByLabel('Region', { exact: true }).selectOption('US')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  for (const name of ['Chen Wei', 'Diya Sharma']) assert.match(await text(page.locator(`.people-table tr[data-row-key="${name}"]`)), / US /, `${name} in US`)
  const panel = await jobs(page)
  assert.match(await text(panel.locator('li.job', { hasText: 'Set region · 2 people' })), /2 people: region = US\. Saved with the planning data/)
  await panel.getByRole('button', { name: 'Close', exact: true }).click()
  // The selection stays until cleared; the header box ticks every row shown.
  await bar.getByRole('button', { name: 'Clear selection' }).click()
  await bar.waitFor({ state: 'detached' })
  await page.getByRole('checkbox', { name: 'Select every row shown' }).check()
  assert.match(await text(page.getByRole('region', { name: 'Selected people' })), new RegExp(`^${(await rowNames(page)).length} selected`))
  // One History entry for the bulk change.
  await navigate(page, 'History')
  assert.equal(await page.locator('.audit-row', { hasText: /2 people \(Chen Wei, Diya Sharma\): region = US/ }).count(), 1)
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-CAP-33 / TC-CAP-34: fewer boxes — one warning line, Default Time tracking started in the ⋯ menu, the month\'s capacity on Capacity & time, the Team tree tab', async () => {
  const { page, context, errors } = await openPage(app, { roles: true })
  await loadSample(page)
  await navigate(page, 'People & roles')
  const panel = page.locator('.people-panel')
  await panel.waitFor()
  assert.equal(await panel.locator('.notice', { hasText: /^Capacity in / }).count(), 0, 'the capacity of the month is not on People')
  assert.equal(await panel.locator('.notice', { hasText: /Regional holidays in|No regional holidays in/ }).count(), 0, 'nor the regional holidays')
  assert.equal(await panel.locator('.notice:not(.git-bar)').count(), 1, 'one warning line besides the Git bar')
  assert.equal(await panel.locator('.people-warnings details').getAttribute('open'), null, 'folded')
  assert.equal(await panel.getByLabel('Default Time tracking started').count(), 0, 'not a field on the page')
  // ⋯ → Default Time tracking started… (a pop-up).
  const menu = await menuOf(page, 'People')
  await menu.getByRole('menuitem', { name: 'Default Time tracking started…' }).click()
  const dialog = page.getByRole('form', { name: 'Default Time tracking started' })
  assert.equal(await dialog.getByLabel('Default Time tracking started').inputValue(), '2026-05-01', 'the saved default')
  await dialog.getByLabel('Default Time tracking started').fill('2026-06-01')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  assert.match(await text(page.locator('.people-table tr[data-row-key="Chen Wei"]')), /Active since (?:June 1, 2026|1 June 2026)$/, 'the Status follows the default')
  // CAP-62: Team tree tab.
  await page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'Team tree' }).click()
  const tree = page.locator('.team-tree')
  await tree.waitFor()
  assert.match(await text(tree.locator(':scope > ul > li').first()), /\S/, 'the reporting lines')
  assert.equal(await page.locator('.people-table').count(), 0, 'the tree is its own tab')
  // CAP-61: the capacity of the month and the regional holidays are on Capacity & time → Capacity and absence.
  await navigate(page, 'Capacity & time')
  await page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'Capacity and absence' }).click()
  assert.match(await text(page.locator('.notice', { hasText: /^Capacity in / })), /^Capacity in .+: \d+ (?:people|person), .*h available = .*h contractual − .*h absence/)
  assert.match(await text(page.locator('.notice', { hasText: /Regional holidays in|No regional holidays in/ })), /egional holidays in /)
  assert.deepEqual(errors, [])
  await context.close()
})
