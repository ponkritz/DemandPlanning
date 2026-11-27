import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { navigate, openPage, startApp, text } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'

// TC-CON-79 (UAT), TC-GIT-25 and TC-GIT-26: Other views per person and the forced "Load latest Release Details"
// (CON-119…CON-124, GIT-29…GIT-31, SET-20), against one mocked GitHub shared by three browsers. The older shared setup
// (azure-views.json) still lists two Other views. The admin's first start moves them to the unassigned list; a blocking
// pop-up asks every browser once to load everything from Git; the admin assigns one view to Ana; Ana sees it, and a view
// she added on her computer goes into her own file; Ben sees neither. A load that fails names what failed and shows the
// Git storage connection setup in the pop-up with Retry; it can never be skipped. Synthetic data only; every step waits for what it
// needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

// Optional screenshots for the pull request (E2E_SHOTS=<folder>); the assertions never depend on them.
const shots = process.env.E2E_SHOTS
const profilesKey = 'demand-planning-azure-connection-profiles-v1'
const base = 'https://tfs.example.invalid/Coll'
const view = (id, viewName) => ({ id, reason: viewName, viewName, role: 'reference', showInMenu: false, url: `${base}/Project`, baseUrl: base, query: `SELECT [System.Id] FROM WorkItems WHERE [System.Title] = '${viewName}'` })
const supplier = view('supplier-x', 'Supplier X'), audit = view('audit-y', 'Audit Y')
const policy = defaultPolicy()
policy.defaultRole = 'Team Member'
policy.members = { 'admin@example.com': ['Admin'] }
const until = async (check, what) => { for (const end = Date.now() + 60000; Date.now() < end;) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 50)) } assert.fail(`timed out waiting for ${what}`) }
const repository = () => fakeGitHub({ files: { 'access.json': serializeAccess(policy), 'azure-views.json': JSON.stringify({ schema: 1, kind: 'azure-devops-views', views: [audit, supplier] }) } })

// A person (work email) with Git storage connected; extra: the connections already in this browser.
// fail: the HTTP status GitHub answers for a request (0: normal); hold: a promise a request waits for before it is answered.
async function open(gh, email, extra = [], { width = 1440, height = 1000, fail, hold } = {}) {
  const { page, context, errors } = await openPage(app, { width, height, loadFromGit: false, ...(shots ? { scale: 2 } : {}), init: ({ profiles, who }) => {
    if (!localStorage.getItem('demand-planning-azure-connection-profiles-v1')) localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify(profiles))
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', who)
  }, initArg: { profiles: extra, who: email } })
  const answer = (route) => fail?.(route) ? route.fulfill({ status: fail(route), contentType: 'application/json', body: JSON.stringify({ message: fail(route) === 401 ? 'Bad credentials' : 'Server Error' }) }) : gh.route(route)
  await context.route('https://api.github.com/**', async (route) => { const wait = hold?.(route); if (wait) await wait; return answer(route) })
  await context.route('https://dev.azure.com/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await context.route('https://tfs.example.invalid/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, () => guide.getByRole('button', { name: 'Close', exact: true }).last().click())
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors }
}
const ids = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]').map((entry) => entry.id).sort(), profilesKey)
const prompt = (page) => page.getByRole('dialog', { name: 'Load latest Release Details' })
// The pop-up blocks the page: no ×, Escape does nothing, and the page under it cannot be clicked.
async function assertBlocking(page) {
  const dialog = prompt(page)
  await dialog.waitFor()
  assert.equal(await dialog.getByRole('button', { name: 'Close' }).count(), 0, 'no ×')
  assert.equal(await dialog.getByRole('button', { name: 'Continue without loading' }).count(), 0, 'no way round it before a failed load')
  await page.keyboard.press('Escape')
  assert.equal(await dialog.isVisible(), true, 'Escape does not close it')
  const covered = await page.evaluate(() => { const nav = document.querySelector('.sidebar nav button'); if (!nav) return false; const box = nav.getBoundingClientRect(); const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2); return Boolean(top?.closest('.modal-backdrop')) })
  assert.equal(covered, true, 'the page under it cannot be clicked')
}
// GIT-33: the pop-up closes at once and the load runs as a background job, listed in the top bar's Background jobs.
const loadJob = (page, label = 'Load latest Release Details') => page.getByRole('dialog', { name: 'Background jobs' }).locator('li.job', { hasText: label }).first()
async function jobsPanel(page) {
  const panel = page.getByRole('dialog', { name: 'Background jobs' })
  if (!(await panel.count())) await page.locator('.jobs-button').click()
  await panel.waitFor()
  return panel
}
async function closeJobs(page) { const panel = page.getByRole('dialog', { name: 'Background jobs' }); if (await panel.count()) await panel.getByRole('button', { name: 'Close' }).click() }
async function loadJobEnds(page, state = 'done', label = 'Load latest Release Details') {
  await jobsPanel(page)
  await page.locator(`.jobs-panel li.job-${state}`, { hasText: label }).first().waitFor()
  await closeJobs(page)
}
async function loadAll(page) {
  await prompt(page).getByRole('button', { name: 'Load latest Release Details' }).click()
  await prompt(page).waitFor({ state: 'detached' })
  await loadJobEnds(page)
}
async function otherViewsTab(page) {
  await navigate(page, 'Data & history')
  await page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'Other views' }).click()
  await page.locator('.own-views-note').waitFor()
}
// At 390 px the menu slides out of view first (waited for, not timed); `focus` is scrolled into view for the picture.
async function shot(page, name, focus) {
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  for (const [width, label] of [[1440, '1440'], [390, '390']]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    if (width === 390) await page.waitForFunction(() => { const bar = document.querySelector('.sidebar'); return !bar || bar.getBoundingClientRect().right <= 1 })
    if (focus) await focus.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${shots}/${name}-${label}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
}

test('TC-CON-79: Other views are each person’s own — the older shared ones wait unassigned for an admin; the forced load blocks until done (TC-GIT-25)', async () => {
  const gh = repository()
  // The admin's first start: the two Other views leave the shared setup for the unassigned list; the pop-up blocks.
  const admin = await open(gh, 'admin@example.com', [{ ...supplier, token: '' }, { ...audit, token: '' }])
  await assertBlocking(admin.page)
  await until(() => gh.read('other-views/unassigned.json'), 'the move to the unassigned list')
  assert.deepEqual(JSON.parse(gh.read('other-views/unassigned.json')).views.map((entry) => entry.id), ['audit-y', 'supplier-x'])
  assert.deepEqual(JSON.parse(gh.read('azure-views.json')).views, [], 'the shared setup keeps the Stream mapping only')
  await shot(admin.page, 'forced-load-popup')
  await loadAll(admin.page)
  assert.deepEqual(await ids(admin.page), [], 'unassigned views are nobody’s: not even the admin’s own Other views')
  // Loaded once: the next start does not ask again.
  await admin.page.reload()
  await admin.page.locator('.sidebar nav').waitFor()
  await otherViewsTab(admin.page)
  assert.equal(await prompt(admin.page).count(), 0)

  // The admin assigns Supplier X to Ana: the confirmation names her file.
  const list = admin.page.locator('.unassigned-other-views')
  const row = list.locator('tbody tr', { hasText: 'Supplier X' })
  await row.waitFor()
  assert.equal(await list.locator('tbody tr').count(), 2)
  await shot(admin.page, 'unassigned-other-views', list)
  await row.getByLabel('Assign Supplier X to (work email)').fill('ana@example.com')
  await row.getByRole('button', { name: 'Assign…' }).click()
  const confirm = admin.page.getByRole('dialog', { name: 'Assign “Supplier X” to ana@example.com?' })
  assert.match(await text(confirm), /other-views\/ana@example\.com\.json/)
  await confirm.getByRole('button', { name: 'Assign', exact: true }).click()
  await list.getByText(/“Supplier X” assigned to ana@example\.com/).waitFor()
  assert.deepEqual(JSON.parse(gh.read('other-views/ana@example.com.json')).views.map((entry) => [entry.id, entry.createdBy, entry.assignedBy]), [['supplier-x', 'ana@example.com', 'admin@example.com']])
  assert.deepEqual(JSON.parse(gh.read('other-views/unassigned.json')).views.map((entry) => entry.id), ['audit-y'])

  // Ana: the pop-up once; then Supplier X is hers, Audit Y (unassigned) is not, and the view she added here goes into her file.
  const anaLocal = view('ana-local', 'Ana Local')
  const ana = await open(gh, 'ana@example.com', [{ ...supplier, token: '' }, { ...audit, token: '' }, { ...anaLocal, token: '' }])
  await assertBlocking(ana.page)
  await loadAll(ana.page)
  await until(async () => JSON.stringify(await ids(ana.page)) === JSON.stringify(['ana-local', 'supplier-x']), 'Ana’s own Other views only')
  await until(() => JSON.parse(gh.read('other-views/ana@example.com.json') ?? '{"views":[]}').views.some((entry) => entry.id === 'ana-local'), 'the view Ana added here in her file')
  const anaFile = JSON.parse(gh.read('other-views/ana@example.com.json'))
  assert.deepEqual(anaFile.views.map((entry) => [entry.id, entry.createdBy]), [['ana-local', 'ana@example.com'], ['supplier-x', 'ana@example.com']])
  assert.equal(gh.read('other-views/ana@example.com.json').includes('token'), false, 'no PAT in her file')
  await otherViewsTab(ana.page)
  const anaRows = ana.page.locator('table.connection-table tbody tr')
  await until(async () => (await anaRows.count()) === 2, 'Ana’s Other views panel')
  assert.match(await text(ana.page.locator('.own-views-note')), /other-views\/ana@example\.com\.json.*only you see them/)
  assert.equal(await ana.page.locator('.unassigned-other-views').count(), 0, 'a Team Member never sees the unassigned list')
  await shot(ana.page, 'own-other-views-panel', ana.page.locator('.own-views-note'))
  // CON-124: Ana removes the view she added — here, from her file and, by a removal marker, on her other computers.
  await anaRows.filter({ hasText: 'Ana Local' }).getByRole('button', { name: 'Remove', exact: true }).click()
  const remove = ana.page.getByRole('dialog', { name: 'Remove “Ana Local”?' })
  assert.match(await text(remove), /one of your Other views: nobody else sees it/)
  await remove.getByRole('button', { name: 'Remove', exact: true }).click()
  await ana.page.getByText(/“Ana Local” removed from your Other views here and in Git/).waitFor()
  assert.deepEqual(JSON.parse(gh.read('other-views/ana@example.com.json')).views.map((entry) => entry.id), ['supplier-x'])
  assert.deepEqual(JSON.parse(gh.read('azure-views-removed.json')).removed.map((entry) => [entry.id, entry.by]), [['ana-local', 'ana@example.com']])
  assert.deepEqual(await ids(ana.page), ['supplier-x'])

  // Ben: had the older shared views here; after the load he has neither Ana's views nor the unassigned one.
  const ben = await open(gh, 'ben@example.com', [{ ...supplier, token: '' }, { ...audit, token: '' }])
  await assertBlocking(ben.page)
  await loadAll(ben.page)
  await until(async () => (await ids(ben.page)).length === 0, 'Ben without others’ Other views')
  await otherViewsTab(ben.page)
  assert.equal(await ben.page.locator('table.connection-table').count(), 0, 'Ben sees no Other view of Ana’s')
  assert.equal(gh.read('other-views/ben@example.com.json'), null, 'nothing written for Ben')
  for (const run of [admin, ana, ben]) assert.deepEqual(run.errors.filter((entry) => !/401|Unauthorized|Failed to fetch/.test(entry)), [])
  await admin.context.close(); await ana.context.close(); await ben.context.close()
})

test('TC-GIT-26: a failed load names what failed and shows the Git storage setup in the pop-up — no skip for a setup error; Continue without loading only in a GitHub outage (GIT-32); a saved connection and Retry load everything', async () => {
  const gh = repository()
  let failing = 0 // the HTTP status GitHub answers for the connection setup file; 0: answers normally
  const person = await open(gh, 'cleo@example.com', [], { fail: (route) => failing && route.request().method() === 'GET' && route.request().url().includes('azure-views-reset.json') ? failing : 0 })
  await assertBlocking(person.page)
  // A setup error (the token refused): the setup is shown, and there is no way round it.
  failing = 401
  await prompt(person.page).getByRole('button', { name: 'Load latest Release Details' }).click()
  // The job fails (Jobs done: needs a look) and the pop-up comes back in its failed state (GIT-35).
  const failed = prompt(person.page).locator('.streams-update-failed')
  await failed.waitFor()
  assert.match(await text(person.page.locator('.jobs-button')), /to check/)
  assert.match(await text(failed), /What failed: Stream mapping: /)
  // The Git storage connection setup is inside the pop-up (the same form as Admin → Data & history → Git storage).
  const setup = prompt(person.page).getByRole('region', { name: 'Git storage connection' })
  for (const label of ['Owner (user or organisation)', 'Repository', 'Branch', 'Data file', 'GitHub token']) await setup.getByLabel(label, { exact: label !== 'GitHub token' }).first().waitFor()
  assert.equal(await setup.getByLabel('Repository', { exact: true }).inputValue(), 'storage')
  assert.equal(await prompt(person.page).getByRole('button', { name: 'Continue without loading' }).count(), 0, 'a setup error is never skipped')
  assert.equal(await prompt(person.page).getByRole('button', { name: 'Close' }).count(), 0)
  await person.page.keyboard.press('Escape')
  assert.equal(await prompt(person.page).isVisible(), true)
  await shot(person.page, 'forced-load-failed-setup', failed)
  // The person saves the connection again (a new token, kept in this browser only).
  await setup.getByRole('textbox', { name: /^GitHub token/ }).fill('test-token-2')
  // As in the Git storage panel, unsaved planning changes here are confirmed before the load replaces them (GIT-16).
  person.page.once('dialog', (dialog) => void dialog.accept())
  await setup.getByRole('button', { name: 'Update & load' }).click()
  await setup.getByText('Saved: the connection is updated. Press Retry to load everything with it.').waitFor()
  assert.equal(await person.page.evaluate(() => localStorage.getItem('demand-planning-git-token-v1')), 'test-token-2')
  assert.equal(JSON.stringify(gh.files()).includes('test-token-2'), false, 'the token is never written to Git')
  // GitHub itself does not answer (HTTP 500): an outage — Continue without loading is offered (GIT-32).
  failing = 500
  await prompt(person.page).getByRole('button', { name: 'Retry' }).click()
  const skip = prompt(person.page).getByRole('button', { name: 'Continue without loading' })
  await skip.waitFor()
  assert.match(await text(failed), /GitHub is not answering \(an outage\)/)
  await shot(person.page, 'forced-load-outage', failed)
  await skip.click()
  await prompt(person.page).waitFor({ state: 'detached' })
  // Not loaded: the pop-up comes back at the next start; with GitHub back, Load latest Release Details closes it for good.
  failing = 0
  await person.page.reload()
  await loadAll(person.page)
  await person.page.reload()
  await person.page.locator('.sidebar nav').waitFor()
  await otherViewsTab(person.page)
  assert.equal(await prompt(person.page).count(), 0)
  await person.context.close()
})

// The reads of a file in the mocked GitHub (contents API) between two points of its call log.
const readsIn = (calls) => calls.filter((call) => call.startsWith('GET ')).map((call) => call.replace(/^GET \/repos\/example\/storage\/contents\//, '')).filter((path) => !path.startsWith('GET '))
test('TC-GIT-28: Load latest Release Details runs as a background job reading the Stream mapping only — the pop-up closes at once and stays closed while it runs; Load everything stays on the Git storage tab, one load at a time (TC-GIT-29, TC-GIT-30, TC-GIT-31)', async () => {
  const gh = repository()
  let gate = null
  const person = await open(gh, 'dana@example.com', [], { hold: (route) => gate && route.request().method() === 'GET' && route.request().url().includes('azure-views-reset.json') ? gate.promise : null })
  await prompt(person.page).waitFor()
  // The start-up reads are done (the on-prem view data and the Windchill exports are listed after the setup sync).
  await until(() => gh.calls.some((call) => call.endsWith('/contents/azure-data')) && gh.calls.some((call) => call.endsWith('/contents/windchill-data')), 'the start-up reads')
  let release = () => undefined
  gate = { promise: new Promise((resolve) => { release = resolve }) }
  const from = gh.calls.length
  await prompt(person.page).getByRole('button', { name: 'Load latest Release Details' }).click()
  await prompt(person.page).waitFor({ state: 'detached' })
  // Running: listed in Background jobs; the app can be used, and the pop-up does not come back meanwhile.
  await jobsPanel(person.page)
  await person.page.locator('.jobs-panel li.job-running', { hasText: 'Load latest Release Details' }).waitFor()
  assert.match(await text(loadJob(person.page)), /Running.*Loading stream mapping…/)
  await shot(person.page, 'release-details-job-running', loadJob(person.page))
  await closeJobs(person.page)
  assert.equal(await prompt(person.page).count(), 0, 'the pop-up stays closed while its job runs')
  gate = null; release()
  await loadJobEnds(person.page)
  const mappingReads = readsIn(gh.calls.slice(from))
  // GIT-36: the Stream mapping only — the connection setup with its markers and the person's Other views, and the custom
  // streams; never the planning data, roles, Feature setup, on-prem view data or Windchill exports.
  for (const wanted of ['azure-views.json', 'custom-streams.json']) assert.ok(mappingReads.includes(wanted), `reads ${wanted}`)
  for (const path of mappingReads) assert.match(path, /^(azure-views\.json|azure-views-reset\.json|azure-views-removed\.json|custom-streams\.json|other-views\/[^/]+\.json)$/, `reads only the Stream mapping, not ${path}`)
  await jobsPanel(person.page)
  assert.match(await text(loadJob(person.page)), /Done.*Loaded: custom streams; connection setup/)
  await shot(person.page, 'release-details-job-done', loadJob(person.page))
  await closeJobs(person.page)
  assert.equal(await prompt(person.page).count(), 0, 'loaded: the pop-up does not come back')
  // GIT-37: Load everything from Git is on the Git storage tab (no Load from Git tab any more), as the same kind of job.
  await navigate(person.page, 'Data & history')
  const tabs = person.page.getByRole('tablist', { name: 'Sections' })
  assert.equal(await tabs.getByRole('tab', { name: 'Load from Git' }).count(), 0)
  await tabs.getByRole('tab', { name: 'Git storage' }).click()
  const full = person.page.locator('.load-everything-panel')
  await full.waitFor()
  await shot(person.page, 'git-storage-load-everything', full)
  gate = { promise: new Promise((resolve) => { release = resolve }) }
  const fullFrom = gh.calls.length
  // Unsaved planning changes here are confirmed before the planning data is replaced (GIT-16): accepted.
  person.page.once('dialog', (dialog) => void dialog.accept())
  await full.getByRole('button', { name: 'Load everything from Git', exact: true }).click()
  // One load at a time: the button says the load is running and starts nothing.
  const busy = full.getByRole('button', { name: 'Loading in the background…' })
  await busy.waitFor()
  assert.equal(await busy.isDisabled(), true)
  await full.locator('.load-job-running').waitFor()
  gate = null; release()
  await full.locator('.notice', { hasText: /^Loaded: planning data/ }).waitFor()
  await loadJobEnds(person.page, 'done', 'Load everything from Git')
  const fullReads = readsIn(gh.calls.slice(fullFrom))
  for (const wanted of ['planning-data.json', 'azure-views.json', 'custom-streams.json', 'access.json', 'azure-data', 'windchill-data']) assert.ok(fullReads.includes(wanted), `Load everything reads ${wanted}`)
  assert.equal(await prompt(person.page).count(), 0)
  await person.context.close()
})
