import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { menuOf, navigate, openPage, startApp, text } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'
import { serverKey } from '../src/azureCredentials.ts'

// TC-SET-09 (UAT), TC-CON-72 and TC-CON-74: deleting from a page listed under Other views (⋯). A person deletes a view of
// their own (My views): the pop-up names it and what is deleted, the view leaves the menu and the app opens Home with a
// confirmation. A shared view's page has no delete item, for a Team Member and for the Tool Owner alike. Whoever may
// import Windchill exports deletes an export under Other views: its files go from Git in one commit (the mocked GitHub
// records it), a Team Member sees no such item. Synthetic data only; every step waits for what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

// Optional screenshots for the pull request (E2E_SHOTS=<folder>); the assertions never depend on them.
const shots = process.env.E2E_SHOTS
const shot = async (page, name) => { if (!shots) return; mkdirSync(shots, { recursive: true }); await page.screenshot({ path: `${shots}/${name}` }) }
const profilesKey = 'demand-planning-azure-connection-profiles-v1'
const base = 'https://tfs.example.invalid/Coll'
const view = (id, viewName, extra = {}) => ({ id, reason: viewName, viewName, role: 'reference', showInMenu: true, url: `${base}/Project`, baseUrl: base, query: `SELECT [System.Id] FROM WorkItems WHERE [System.Title] = '${viewName}'`, ...extra })
const supplier = view('supplier-x', 'Supplier X'), audit = view('audit-y', 'Audit Y')
const mine = view('my-open-bugs', 'My Open Bugs', { mine: true, token: '' })
const snapshot = (target) => JSON.stringify({ schema: 1, kind: 'azure-view-snapshot', connection: target, source: { connectionId: target.id, name: target.reason, role: 'reference', organization: 'Coll', project: 'Project', query: target.query, fetchedAt: '2026-11-24T08:00:00.000Z', items: [] } })
const policy = defaultPolicy()
policy.defaultRole = 'Team Member'
policy.members = { 'owner@example.com': ['Tool Owner'] }
const until = async (check, what) => { for (const end = Date.now() + 60000; Date.now() < end;) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 50)) } assert.fail(`timed out waiting for ${what}`) }
// A Windchill export under Other views, as an earlier import saved it to Git (its results and setup, and its Locations analysis).
const columns = ['Number', 'Name', 'State', 'Last Modified']
const exportView = { id: 'wc-supplier-docs', name: 'Supplier Docs', entitySet: '', filters: [], columns, showInMenu: true, exportFile: 'supplier-docs.csv' }
const exportFile = JSON.stringify({ schema: 1, kind: 'windchill-view-snapshot', view: exportView, source: { viewId: exportView.id, name: exportView.name, fetchedAt: '2026-11-24T08:00:00.000Z', query: '', columns, rows: [{ Number: 'DHF-901', Name: 'Supplier Widget 1.0 Verification Report', State: 'Released', 'Last Modified': '2026-11-02' }] } })
// CON-120: the Other views (not My views) of each person, in their file in Git.
const ownFile = (email, views) => JSON.stringify({ schema: 1, kind: 'other-views', owner: email, views: views.map((entry) => ({ ...entry, createdBy: email })) })
const repository = () => fakeGitHub({ files: { 'access.json': serializeAccess(policy), 'other-views/person@example.com.json': ownFile('person@example.com', [audit, supplier]), 'other-views/owner@example.com.json': ownFile('owner@example.com', [audit, supplier]), 'azure-data/supplier-x.json': snapshot(supplier), 'windchill-data/wc-supplier-docs.json': exportFile, 'windchill-analysis/wc-supplier-docs-locations.json': '{}', 'windchill-data/wc-other.json': exportFile.replaceAll('wc-supplier-docs', 'wc-other').replaceAll('Supplier Docs', 'Other Docs') } })

// A person (work email) with Git storage connected, their Time Writing connection and a server PAT; Azure DevOps and
// the on-prem server answer nothing, so the "Could not fetch from Azure DevOps" guide is closed whenever it appears.
async function open(gh, email, extra = []) {
  const tw = { id: `tw-${email.split('@')[0]}`, url: 'https://dev.azure.com/example/Project/_backlogs/backlog/Team%20A/Features', reason: 'Time Writing', token: 'x'.repeat(52), role: 'time-tracking', creatorEmail: email }
  const { page, context, errors } = await openPage(app, { width: 1440, height: 1000, ...(shots ? { scale: 2 } : {}), init: ({ profiles, who, pats }) => {
    if (!localStorage.getItem('demand-planning-azure-connection-profiles-v1')) localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify(profiles))
    if (!localStorage.getItem('demand-planning-server-pats-v1')) localStorage.setItem('demand-planning-server-pats-v1', JSON.stringify(pats))
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', who)
    localStorage.setItem('demand-planning-theme', 'light')
  }, initArg: { profiles: [tw, ...extra], who: email, pats: { [serverKey(supplier)]: 'synthetic-onprem-pat' } } })
  await context.route('https://api.github.com/**', gh.route)
  await context.route('https://dev.azure.com/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await context.route('https://tfs.example.invalid/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, () => guide.getByRole('button', { name: 'Close', exact: true }).last().click())
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors }
}
const ids = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]').map((entry) => entry.id).sort(), profilesKey)
const menuButton = (page, name) => page.locator('.sidebar nav button', { hasText: name })
// An Other view's page from the menu: its title in the top bar.
async function openView(page, name) {
  await menuButton(page, name).first().waitFor()
  await navigate(page, name)
  await until(async () => (await text(page.locator('header.topbar h1'))) === name, `the page of ${name}`)
}
const menuItems = async (menu) => (await menu.getByRole('menuitem').allInnerTexts()).map((label) => label.trim())
const unexpected = (errors) => errors.filter((entry) => !/401|Unauthorized|Failed to fetch/.test(entry))

test('TC-SET-09: a person deletes a view of their own from its page — the pop-up names it, it leaves the menu, Home opens with a confirmation; the server PAT and the shared views stay', async () => {
  const gh = repository()
  const person = await open(gh, 'person@example.com', [mine])
  const { page } = person
  await until(async () => (await ids(page)).includes('supplier-x'), 'the shared views from Git')
  await openView(page, 'My Open Bugs')
  const menu = await menuOf(page, 'My Open Bugs')
  const items = await menuItems(menu)
  assert.equal(items.at(-1), 'Delete this view…', 'the destructive item is last')
  assert.ok(!items.some((label) => /for everyone/.test(label)), 'a view of your own has no shared actions')
  await shot(page, 'own-view-menu-1440-light.png')
  await menu.getByRole('menuitem', { name: 'Delete this view…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete your view “My Open Bugs”?' })
  await dialog.waitFor()
  assert.match(await text(dialog), /MY VIEWS · THIS COMPUTER.*“My Open Bugs”.*its definition — name, server, project and query — and the data fetched for it here.*Other views.*shared setup in Git and other people's views are not touched.*PAT stays/)
  await shot(page, 'own-view-delete-confirm-1440-light.png')
  // Cancel keeps it.
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await dialog.waitFor({ state: 'detached' })
  assert.ok((await ids(page)).includes('my-open-bugs'))
  await (await menuOf(page, 'My Open Bugs')).getByRole('menuitem', { name: 'Delete this view…' }).click()
  await dialog.getByRole('button', { name: 'Delete view' }).click()
  // Home, never a page for the missing view, with the confirmation.
  const note = page.locator('.view-gone-note')
  await note.waitFor()
  assert.equal(await text(page.locator('header.topbar h1')), 'Home')
  assert.match(await text(note), /^Your view “My Open Bugs” was deleted from this browser with its saved data\./)
  await shot(page, 'own-view-deleted-home-1440-light.png')
  assert.equal(await menuButton(page, 'My Open Bugs').count(), 0, 'gone from the menu')
  assert.deepEqual(await ids(page), ['audit-y', 'supplier-x', 'tw-person'])
  assert.equal(await page.evaluate((key) => JSON.parse(localStorage.getItem('demand-planning-server-pats-v1') ?? '{}')[key], serverKey(supplier)), 'synthetic-onprem-pat', 'the server PAT stays')
  assert.equal(gh.read('azure-views-removed.json'), null, 'nothing is written to Git')
  // TC-CON-72: a shared view's page has no delete item (here for a Team Member).
  await openView(page, 'Supplier X')
  const shared = await menuOf(page, 'Supplier X')
  assert.ok(!(await menuItems(shared)).some((label) => /for everyone|Delete this view/.test(label)), 'no delete action for a Team Member')
  await page.keyboard.press('Escape')
  assert.deepEqual(unexpected(person.errors), [])
  await person.context.close()
})

test('TC-CON-72: the Tool Owner has no delete item on a shared view’s page; Admin → Data & history keeps Remove / Delete for everyone', async () => {
  const gh = repository()
  const owner = await open(gh, 'owner@example.com')
  const { page } = owner
  await until(async () => (await ids(page)).includes('supplier-x'), 'the shared views from Git')
  await openView(page, 'Supplier X')
  const menu = await menuOf(page, 'Supplier X')
  const items = await menuItems(menu)
  assert.ok(!items.some((label) => /for everyone|Delete/.test(label)), `no delete item on the page: ${items.join(' | ')}`)
  await shot(page, 'shared-view-menu-tool-owner-1440-light.png')
  await page.keyboard.press('Escape')
  // CON-109…CON-112 are unchanged in Admin → Data & history → Other views.
  await navigate(page, 'Data & history')
  await page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'Other views' }).click()
  await page.locator('table.connection-table tbody tr', { hasText: 'Supplier X' }).getByRole('button', { name: 'More actions: Shared view Supplier X' }).click()
  assert.equal(await page.getByRole('menuitem', { name: 'Delete for everyone…' }).isDisabled(), false)
  await page.keyboard.press('Escape')
  assert.deepEqual(unexpected(owner.errors), [])
  await owner.context.close()
})

test('TC-CON-74: whoever may import Windchill exports deletes an export under Other views from its page — its files in Git in one commit, then Home; a Team Member has no such item', async () => {
  const gh = repository()
  // A Team Member (no “Import Windchill exports”) sees the export but no delete item.
  const person = await open(gh, 'person@example.com')
  await openView(person.page, 'Supplier Docs')
  assert.ok(!(await menuItems(await menuOf(person.page, 'Supplier Docs'))).some((label) => /Delete|Remove/.test(label)), 'no delete item for a Team Member')
  await person.page.keyboard.press('Escape')
  await person.context.close()

  const owner = await open(gh, 'owner@example.com')
  const { page } = owner
  await openView(page, 'Supplier Docs')
  const menu = await menuOf(page, 'Supplier Docs')
  const items = await menuItems(menu)
  assert.equal(items.at(-1), 'Delete this export…')
  assert.ok(!items.includes('Remove this export…'), 'Delete replaces the local Remove on an Other views export')
  await shot(page, 'windchill-export-menu-1440-light.png')
  await menu.getByRole('menuitem', { name: 'Delete this export…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete the export “Supplier Docs”?' })
  await dialog.locator('.delete-export-files').waitFor()
  assert.deepEqual(await dialog.locator('.delete-export-files li').allInnerTexts(), ['windchill-data/wc-supplier-docs.json', 'windchill-analysis/wc-supplier-docs-locations.json'])
  assert.match(await text(dialog), /WINDCHILL EXPORT · SHARED IN GIT.*“Supplier Docs” \(imported from supplier-docs\.csv, 1 row\).*in one commit — its history stays in GitHub/)
  await shot(page, 'windchill-export-delete-confirm-1440-light.png')
  const commits = () => gh.calls.filter((call) => /^PATCH .*\/git\/refs\/heads\/main/.test(call)).length
  const before = commits()
  await dialog.getByRole('button', { name: 'Delete export' }).click()
  const note = page.locator('.view-gone-note')
  await note.waitFor()
  assert.equal(await text(page.locator('header.topbar h1')), 'Home')
  assert.match(await text(note), /^The Windchill export “Supplier Docs” was deleted here and in Git in one commit/)
  await shot(page, 'windchill-export-deleted-home-1440-light.png')
  assert.equal(await menuButton(page, 'Supplier Docs').count(), 0, 'gone from the menu')
  assert.equal(commits() - before, 1, 'one commit')
  assert.equal(gh.read('windchill-data/wc-supplier-docs.json'), null)
  assert.equal(gh.read('windchill-analysis/wc-supplier-docs-locations.json'), null)
  assert.ok(gh.read('windchill-data/wc-other.json'), 'another export stays')
  // The next start does not bring it back from Git.
  await page.reload()
  await menuButton(page, 'Other Docs').first().waitFor()
  assert.equal(await menuButton(page, 'Supplier Docs').count(), 0)
  assert.deepEqual(unexpected(owner.errors), [])
  await owner.context.close()
})
