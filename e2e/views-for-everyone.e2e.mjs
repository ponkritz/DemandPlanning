import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { navigate, openPage, startApp, text, toggleFilter } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'

// Save view for everyone (UI-20…UI-23; TC-UI-16 UAT, TC-UI-17) against a mocked GitHub: the Tool Owner hides, moves and
// resizes columns of the CoNQ Data table, sorts it and saves the view for everyone (written to the shared views
// defaults in Git); a second person opening the table for the first time sees that view, changes it, keeps theirs after a
// reload and goes back with "Use the view for everyone"; a person without the right sees no Save option. On People &
// roles the Tool Owner saves the People list and its filters for everyone, and an Admin sees both. Every step waits for
// what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const year = new Date().getUTCFullYear()
const columns = [
  { id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Complaint'] },
  { id: 'c2', name: 'Sites', type: 'multi', options: ['Berlin', 'Leeds', 'Lyon'] },
  { id: 'c3', name: 'Cost (EUR)', type: 'number' },
  { id: 'c4', name: 'Found on', type: 'date' },
]
const rows = [['Rework', ['Berlin'], '1200', '03'], ['Scrap', ['Leeds'], '600', '01'], ['Complaint', ['Lyon'], '500', '02']]
  .map(([category, sites, cost, month], index) => ({ id: `r${index + 1}`, seq: index + 1, cells: { c1: category, c2: sites, c3: cost, c4: `${year}-${month}-10` } }))
const conq = { schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ', description: 'Cost of Non-Quality', keyPrefix: 'CONQ', columns, rows, insights: [] }
const policy = defaultPolicy()
policy.defaultRole = 'Team Member'
policy.members = { 'owner@example.com': ['Tool Owner'], 'admin@example.com': ['Admin'] }
const defaultsFile = 'personal-views-defaults.json'
const tableKey = 'table:on-demand:conq'

const until = async (check, what) => { for (const end = Date.now() + 60000; Date.now() < end;) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 50)) } assert.fail(`timed out waiting for ${what}`) }
const shared = (gh) => { const file = gh.read(defaultsFile); return file ? JSON.parse(file).filters ?? {} : {} }

// A person (by work email) with Git storage connected; Azure DevOps answers only the team list (People), so the "Could
// not fetch from Azure DevOps" guide may appear and is closed whenever it does.
async function open(gh, email) {
  const profile = { id: 'tw', url: 'https://dev.azure.com/example/Project/_backlogs/backlog/Team%20A/Features', reason: 'Time Writing', token: 'x'.repeat(52), role: 'time-tracking', creatorEmail: email }
  const { page, context, errors } = await openPage(app, { init: ({ connection, who }) => {
    localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify([connection]))
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', who)
  }, initArg: { connection: profile, who: email } })
  await context.route('https://api.github.com/**', gh.route)
  await context.route('https://dev.azure.com/**', (route) => /\/teams\/[^/]+\/members/.test(route.request().url())
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ value: [{ identity: { displayName: 'Rita Gomez', uniqueName: 'rita.gomez@example.com' } }, { identity: { displayName: 'Omar Haddad', uniqueName: 'omar.haddad@example.com' } }, { identity: { displayName: 'Lea Lead', uniqueName: 'lead@example.com' } }] }) })
    : route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, () => guide.getByRole('button', { name: 'Close', exact: true }).last().click())
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors }
}
const table = (page, cls) => page.locator(cls ? `.data-table.${cls}` : '.data-table').first()
const headers = async (scope) => (await scope.locator('thead th').evaluateAll((cells) => cells.map((cell) => cell.textContent))).map((entry) => entry.replace(/[▴▾]/g, '').trim()).filter(Boolean)
const columnsPanel = async (scope) => { const panel = scope.locator('fieldset.column-chooser'); if (!await panel.isVisible()) await scope.getByRole('button', { name: /^Columns/ }).click(); await panel.waitFor(); return panel }
async function openConq(page) {
  await navigate(page, 'CoNQ')
  const data = table(page)
  await data.locator('tbody tr').first().waitFor()
  return data
}

test('TC-UI-16: the Tool Owner saves the CoNQ table’s view for everyone; another person sees it first, keeps their own changes and can use the view for everyone again', async () => {
  const gh = fakeGitHub({ files: { 'access.json': serializeAccess(policy), 'on-demand/conq.json': JSON.stringify(conq) } })
  // The Tool Owner: hide Sites, move Cost (EUR) before Category, widen Category, sort by Found on (newest first).
  const owner = await open(gh, 'owner@example.com')
  let data = await openConq(owner.page)
  const builtIn = await headers(data)
  assert.ok(builtIn.includes('Sites') && builtIn.indexOf('Category') < builtIn.indexOf('Cost (EUR)'), `the built-in view: ${builtIn.join(', ')}`)
  let panel = await columnsPanel(data)
  assert.match(await text(panel.getByRole('group', { name: /^View for everyone/ })), /The built-in view Save view for everyone/)
  await panel.getByRole('checkbox', { name: 'Sites', exact: true }).uncheck()
  await panel.getByRole('button', { name: 'Move Cost (EUR) up' }).click()
  await panel.getByRole('button', { name: 'Move Cost (EUR) up' }).click()
  const handle = data.getByRole('separator', { name: 'Resize Category column' })
  const box = await handle.boundingBox()
  await owner.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await owner.page.mouse.down()
  await owner.page.mouse.move(box.x + 120, box.y + box.height / 2, { steps: 4 })
  await owner.page.mouse.up()
  const foundOn = data.locator('thead th', { hasText: 'Found on' })
  await foundOn.getByRole('button').click()
  await foundOn.getByRole('button').click()
  assert.equal(await foundOn.getAttribute('aria-sort'), 'descending')
  const ownerView = await headers(data)
  assert.equal(ownerView.includes('Sites'), false)
  assert.ok(ownerView.indexOf('Cost (EUR)') < ownerView.indexOf('Category'), `Cost first: ${ownerView.join(', ')}`)
  const width = await data.locator('thead th', { hasText: 'Category' }).evaluate((cell) => cell.style.width)
  assert.match(width, /^\d+px$/, 'Category has a width of its own')
  await panel.getByRole('button', { name: 'Save view for everyone' }).click()
  // On an On-Demand table (grouping and column filters, UI-28) the save is confirmed in a pop-up that names them.
  const confirm = owner.page.getByRole('dialog', { name: 'Save view for everyone' })
  assert.match(await text(confirm), /Group by: no grouping\. Column filters: none\./)
  assert.equal(await confirm.getByRole('checkbox', { name: 'Start collapsed' }).isDisabled(), true, 'nothing to collapse without grouping')
  await confirm.getByRole('button', { name: 'Save view for everyone' }).click()
  await until(() => Boolean(shared(gh)[tableKey]), 'the view for everyone written to Git')
  const saved = shared(gh)
  assert.ok(saved[tableKey].hidden.includes('c2'), 'Sites hidden')
  assert.deepEqual(saved[tableKey].sort, { id: 'c4', desc: true })
  assert.equal(`${saved[tableKey].widths.c1}px`, width)
  assert.equal(saved[`by:${tableKey}`].by, 'owner@example.com', 'who saved it, and when')
  await panel.getByText(/The view for everyone, saved by owner@example\.com/).waitFor()
  assert.deepEqual(owner.errors, [])
  await owner.context.close()

  // Someone else (Team Member: no right) opening the table for the first time sees the view for everyone.
  const member = await open(gh, 'member@example.com')
  data = await openConq(member.page)
  await until(async () => JSON.stringify(await headers(data)) === JSON.stringify(ownerView), 'the view for everyone on the table')
  assert.equal(await data.locator('thead th', { hasText: 'Found on' }).getAttribute('aria-sort'), 'descending', 'sorted as saved')
  assert.equal(await data.locator('thead th', { hasText: 'Category' }).evaluate((cell) => cell.style.width), width, 'the saved width')
  assert.deepEqual(await data.locator('tbody tr td').allInnerTexts().then((cells) => cells.filter((cell) => /^\d{4}-/.test(cell.trim())).map((cell) => cell.trim().slice(5, 7))), ['03', '02', '01'], 'newest first')
  panel = await columnsPanel(data)
  assert.equal(await member.page.getByRole('button', { name: 'Save view for everyone' }).count(), 0, 'no right: no Save option')
  assert.equal(await member.page.getByRole('button', { name: 'Clear the view for everyone' }).count(), 0)
  await panel.getByText(/The view for everyone, saved by owner@example\.com/).waitFor()
  // Their own change: Sites shown again — kept after a reload; "Use the view for everyone" goes back.
  await panel.getByRole('checkbox', { name: 'Sites', exact: true }).check()
  await panel.getByRole('button', { name: 'Use the view for everyone' }).waitFor()
  const mine = await headers(data)
  assert.ok(mine.includes('Sites'))
  await member.page.reload()
  data = await openConq(member.page)
  assert.deepEqual(await headers(data), mine, 'my own view after a reload')
  panel = await columnsPanel(data)
  assert.match(await text(panel.getByRole('group', { name: /^View for everyone/ })), /^Your own view · Use the view for everyone$/)
  await panel.getByRole('button', { name: 'Use the view for everyone' }).click()
  await until(async () => JSON.stringify(await headers(data)) === JSON.stringify(ownerView), 'the view for everyone again')
  assert.deepEqual(member.errors, [])
  await member.context.close()
})

test('TC-UI-17: the People list and its filters saved for everyone by the Tool Owner; an Admin (who holds the right) sees both first and can save too', async () => {
  const gh = fakeGitHub({ files: { 'access.json': serializeAccess(policy) } })
  const owner = await open(gh, 'owner@example.com')
  await navigate(owner.page, 'People & roles')
  let people = table(owner.page, 'people-table')
  await people.locator('tr[data-row-key="Rita Gomez"]').waitFor()
  // The list: Email shown, Region hidden, sorted by Person descending; the filters: Status also "Not part of the team".
  const panel = await columnsPanel(people)
  await panel.getByRole('checkbox', { name: 'Email', exact: true }).check()
  await panel.getByRole('checkbox', { name: 'Region', exact: true }).uncheck()
  const person = people.locator('thead th', { hasText: 'Person' })
  await person.getByRole('button').click()
  assert.equal(await person.getAttribute('aria-sort'), 'descending', 'the second click on the default sort column')
  const ownerView = await headers(people)
  await panel.getByRole('button', { name: 'Save view for everyone' }).click()
  await toggleFilter(owner.page, 'Status', 'Not part of the team')
  const filters = owner.page.getByRole('group', { name: 'View for everyone: People filters' })
  await filters.getByRole('button', { name: 'Save view for everyone' }).click()
  await until(() => Boolean(shared(gh)['table:admin:people'] && shared(gh)['people-filters']), 'both views written to Git')
  assert.deepEqual(shared(gh)['people-filters'].status.length, 3)
  assert.deepEqual(owner.errors, [])
  await owner.context.close()

  const admin = await open(gh, 'admin@example.com')
  await navigate(admin.page, 'People & roles')
  people = table(admin.page, 'people-table')
  await people.locator('tr[data-row-key="Rita Gomez"]').waitFor()
  await until(async () => JSON.stringify(await headers(people)) === JSON.stringify(ownerView), 'the People list as saved for everyone')
  assert.deepEqual(await people.locator('tbody tr').evaluateAll((list) => list.map((row) => row.dataset.rowKey)), ['Rita Gomez', 'Omar Haddad', 'Lea Lead'], 'Person descending')
  assert.equal(await text(admin.page.getByRole('button', { name: /^Status: / })), '3 selected ▾', 'the filters saved for everyone')
  const adminFilters = admin.page.getByRole('group', { name: 'View for everyone: People filters' })
  assert.match(await text(adminFilters), /^The view for everyone, saved by owner@example\.com on .+ Save view for everyone Clear the view for everyone$/, 'the Admin holds the right too')
  assert.deepEqual(admin.errors, [])
  await admin.context.close()
})
