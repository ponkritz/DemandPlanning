import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { navigate, openPage, startApp, text } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'
import { serverKey } from '../src/azureCredentials.ts'

// TC-CON-68 (UAT) and TC-CON-69: the Tool Owner removes, and deletes, an Other view for everyone (CON-109…CON-112,
// CON-124), against one mocked GitHub shared by several browsers. Since CON-119 the Other views are each person's own
// (other-views/<email>.json): the Tool Owner's second computer, which has his views from Git, a view of its own
// (My views) and a server PAT, starts again: the removed view is gone with a one-time notice, My view and the PAT
// stay. The deleted view's data file is gone from the repository. Restore in Removed connections brings a
// view back for everyone. Synthetic data only; every step waits for what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

// Optional screenshots for the pull request (E2E_SHOTS=<folder>); the assertions never depend on them.
const shots = process.env.E2E_SHOTS
const profilesKey = 'demand-planning-azure-connection-profiles-v1'
const base = 'https://tfs.example.invalid/Coll'
const view = (id, viewName) => ({ id, reason: viewName, viewName, role: 'reference', showInMenu: false, url: `${base}/Project`, baseUrl: base, query: `SELECT [System.Id] FROM WorkItems WHERE [System.Title] = '${viewName}'` })
const supplier = view('supplier-x', 'Supplier X'), audit = view('audit-y', 'Audit Y'), kept = view('kept-z', 'Kept Z')
const personView = view('person-view', 'Person View')
// CON-120: a person's Other views file in Git (other-views/<email>.json).
const ownFile = (email, views) => JSON.stringify({ schema: 1, kind: 'other-views', owner: email, views: views.map((entry) => ({ ...entry, createdBy: email })) })
const snapshot = (target) => JSON.stringify({ schema: 1, kind: 'azure-view-snapshot', connection: target, source: { connectionId: target.id, name: target.reason, role: 'reference', organization: 'Coll', project: 'Project', query: target.query, fetchedAt: '2026-11-24T08:00:00.000Z', items: [] } })
const policy = defaultPolicy()
policy.defaultRole = 'Team Member'
policy.members = { 'owner@example.com': ['Tool Owner'] }
const until = async (check, what) => { for (const end = Date.now() + 60000; Date.now() < end;) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 50)) } assert.fail(`timed out waiting for ${what}`) }

// A person (work email) with Git storage connected and their Time Writing connection; Azure DevOps and the on-prem
// server answer nothing, so the "Could not fetch from Azure DevOps" guide is closed whenever it appears.
async function open(gh, email, extra = []) {
  const tw = { id: `tw-${email.split('@')[0]}`, url: 'https://dev.azure.com/example/Project/_backlogs/backlog/Team%20A/Features', reason: 'Time Writing', token: 'x'.repeat(52), role: 'time-tracking', creatorEmail: email }
  const { page, context, errors } = await openPage(app, { width: 1440, height: 1000, ...(shots ? { scale: 2 } : {}), init: ({ profiles, who, pats }) => {
    if (!localStorage.getItem('demand-planning-azure-connection-profiles-v1')) localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify(profiles))
    if (!localStorage.getItem('demand-planning-server-pats-v1')) localStorage.setItem('demand-planning-server-pats-v1', JSON.stringify(pats))
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', who)
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
async function otherViews(page) {
  await navigate(page, 'Data & sharing')
  await page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'Other views' }).click()
  return page.locator('table.connection-table')
}
async function forEveryone(page, name, action) {
  const row = (await otherViews(page)).locator('tbody tr', { hasText: name })
  await row.getByRole('button', { name: `More actions: Shared view ${name}` }).click()
  await page.getByRole('menuitem', { name: action }).click()
  return page.getByRole('dialog', { name: new RegExp(`for everyone\\?$`) })
}

test('TC-CON-68: the Tool Owner removes an Other view for everyone — the next start of another computer drops it with a notice, keeps My view and the PAT; Restore brings it back', async () => {
  // CON-120: the Other views are the Tool Owner's own (other-views/owner@example.com.json); a Team Member has one of hers.
  const gh = fakeGitHub({ files: { 'access.json': serializeAccess(policy), 'other-views/owner@example.com.json': ownFile('owner@example.com', [audit, kept, supplier]), 'other-views/person@example.com.json': ownFile('person@example.com', [personView]), 'azure-data/audit-y.json': snapshot(audit), 'azure-data/supplier-x.json': snapshot(supplier) } })
  // A Team Member sees the actions on her own view disabled with the reason, and never the Tool Owner's views.
  const person = await open(gh, 'person@example.com')
  await until(async () => (await ids(person.page)).includes('person-view'), 'her own Other view')
  const row = (await otherViews(person.page)).locator('tbody tr', { hasText: 'Person View' })
  await person.page.getByText(/Remove \/ Delete for everyone: Only the Tool Owner/).waitFor()
  await row.getByRole('button', { name: 'More actions: Shared view Person View' }).click()
  assert.equal(await person.page.getByRole('menuitem', { name: 'Remove for everyone…' }).isDisabled(), true)
  assert.equal(await person.page.getByRole('menuitem', { name: 'Delete for everyone…' }).isDisabled(), true)
  await person.page.keyboard.press('Escape')
  assert.equal((await ids(person.page)).includes('supplier-x'), false, 'another person’s Other view is never here')
  await person.context.close()

  // The Tool Owner's second computer: it has the views from his file, a view of its own (My views) and a server PAT.
  const mine = { ...view('my-supplier', 'My Supplier'), mine: true, showInMenu: true, token: '' }
  const second = await open(gh, 'owner@example.com', [mine])
  await until(async () => (await ids(second.page)).includes('supplier-x'), 'the views on the second computer')

  // The Tool Owner removes Supplier X: the pop-up says whom it affects and that My views and PATs are not touched.
  const owner = await open(gh, 'owner@example.com')
  await until(async () => (await ids(owner.page)).includes('supplier-x'), 'the Other views for the Tool Owner')
  const dialog = await forEveryone(owner.page, 'Supplier X', 'Remove for everyone…')
  assert.match(await text(dialog), /everyone who uses the shared setup in Git \(example\/storage\) — the app cannot tell how many people that is.*My views.*PATs are not touched/)
  if (shots) { mkdirSync(shots, { recursive: true }); await owner.page.screenshot({ path: `${shots}/remove-for-everyone-confirm-1440-light.png` }) }
  await dialog.getByRole('button', { name: 'Remove for everyone' }).click()
  await owner.page.getByText(/“Supplier X” removed for everyone/).waitFor()
  await until(() => !JSON.parse(gh.read('other-views/owner@example.com.json')).views.some((entry) => entry.id === 'supplier-x'), 'out of his Other views in Git')
  assert.deepEqual(JSON.parse(gh.read('other-views/owner@example.com.json')).views.map((entry) => entry.id), ['audit-y', 'kept-z'])
  const markers = JSON.parse(gh.read('azure-views-removed.json')).removed
  assert.deepEqual(markers.map((entry) => [entry.id, entry.mode, entry.by]), [['supplier-x', 'remove', 'owner@example.com']])
  assert.ok(gh.read(markers[0].backup), 'a backup of its definition is in Git')
  assert.ok(gh.read('azure-data/supplier-x.json'), 'Remove keeps its data file')
  for (const path of ['other-views/owner@example.com.json', 'azure-views-removed.json', markers[0].backup]) assert.equal(gh.read(path).includes('synthetic-onprem-pat'), false, `no PAT in ${path}`)
  assert.equal((await ids(owner.page)).includes('supplier-x'), false, 'removed in the Tool Owner’s browser too')

  // The second computer starts again: Supplier X is gone with a one-time notice; My view, the other views and the PAT stay.
  await second.page.reload()
  const notice = second.page.locator('.views-removed-note')
  await notice.waitFor()
  assert.match(await text(notice), /^The Tool Owner removed 1 shared view: Supplier X\. .*your own views \(My views\) and your PATs are kept\./)
  if (shots) {
    // Only for the picture: an action lets the locator handler close the "Could not fetch" guide if it is open.
    await second.page.getByRole('button', { name: 'Dismiss' }).first().hover()
    await second.page.screenshot({ path: `${shots}/views-removed-notice-1440-light.png` })
  }
  assert.deepEqual(await ids(second.page), ['audit-y', 'kept-z', 'my-supplier', 'tw-owner'])
  assert.equal(await second.page.evaluate((key) => JSON.parse(localStorage.getItem('demand-planning-server-pats-v1') ?? '{}')[key], serverKey(supplier)), 'synthetic-onprem-pat', 'the server PAT stays')
  // Applied once: the next start shows no notice and removes nothing more.
  await second.page.reload()
  await second.page.locator('.sidebar nav').waitFor()
  await until(async () => (await ids(second.page)).includes('audit-y'), 'the start sync')
  await navigate(second.page, 'Data & sharing')
  assert.equal(await second.page.locator('.views-removed-note').count(), 0)

  // Restore in Removed connections takes the marker away: the view is back in his Other views in Git.
  await navigate(owner.page, /Streams$/)
  const removed = owner.page.locator('.removed-connections')
  await removed.getByRole('button', { name: 'Look in Git history' }).click()
  const restoreRow = removed.locator('tbody tr', { hasText: 'Supplier X' })
  await restoreRow.getByRole('button', { name: 'Restore' }).waitFor()
  assert.match(await text(restoreRow), /Removed for everyone by owner@example\.com/)
  await restoreRow.getByRole('button', { name: 'Restore' }).click()
  await removed.getByText(/“Supplier X” is back here and in your Other views in Git/).waitFor()
  assert.deepEqual(JSON.parse(gh.read('azure-views-removed.json')).removed, [], 'the marker is gone')
  assert.ok(JSON.parse(gh.read('other-views/owner@example.com.json')).views.some((entry) => entry.id === 'supplier-x'))
  await second.page.reload()
  await until(async () => (await ids(second.page)).includes('supplier-x'), 'the restored view on the second computer')
  for (const run of [second, owner]) assert.deepEqual(run.errors.filter((entry) => !/401|Unauthorized|Failed to fetch/.test(entry)), [])
  await second.context.close(); await owner.context.close()
})

test('TC-CON-69: Delete for everyone lists and deletes the view’s data file in Git; a computer that still has the view loses it', async () => {
  const gh = fakeGitHub({ files: { 'access.json': serializeAccess(policy), 'other-views/owner@example.com.json': ownFile('owner@example.com', [audit, kept]), 'azure-data/audit-y.json': snapshot(audit), 'azure-data/kept-z.json': snapshot(kept) } })
  const owner = await open(gh, 'owner@example.com')
  await until(async () => (await ids(owner.page)).includes('audit-y'), 'his Other views')
  const dialog = await forEveryone(owner.page, 'Audit Y', 'Delete for everyone…')
  await dialog.locator('.remove-for-everyone-files').waitFor()
  assert.deepEqual(await dialog.locator('.remove-for-everyone-files li').allInnerTexts(), ['azure-data/audit-y.json'])
  await dialog.getByRole('button', { name: 'Delete for everyone' }).click()
  await owner.page.getByText(/“Audit Y” deleted for everyone.*Deleted in Git: azure-data\/audit-y\.json/).waitFor()
  assert.equal(gh.read('azure-data/audit-y.json'), null, 'its data file is deleted')
  assert.ok(gh.read('azure-data/kept-z.json'), 'another view keeps its data')
  assert.deepEqual(JSON.parse(gh.read('azure-views-removed.json')).removed.map((entry) => [entry.id, entry.mode, entry.files]), [['audit-y', 'delete', ['azure-data/audit-y.json']]])
  // Another computer that still has the deleted view (an earlier start) loses it, and the on-prem data in Git does not add it back.
  const late = await open(gh, 'owner@example.com', [{ ...audit, token: '' }])
  await late.page.locator('.views-removed-note').waitFor()
  await until(async () => (await ids(late.page)).includes('kept-z'), 'his Other views on the other computer')
  assert.deepEqual(await ids(late.page), ['kept-z', 'tw-owner'])
  assert.deepEqual(owner.errors.filter((entry) => !/401|Unauthorized|Failed to fetch/.test(entry)), [])
  await late.context.close(); await owner.context.close()
})
