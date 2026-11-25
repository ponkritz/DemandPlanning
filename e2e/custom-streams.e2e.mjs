import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { navigate, openPage, rolesFile, startApp, text } from './helpers.mjs'

// Custom streams (STR-01…06): the Tool Owner adds a stream "Labeling" (Azure DevOps, Like Content) without a code
// change, maps a connection named "Labeling", and its Release page appears under Release Details with the parts of
// UI-STANDARDS §10 (TC-STR-06, UAT); a viewer without “Change the stream mapping” sees ＋ Add stream… disabled with the
// reason (TC-STR-07). GitHub and Azure DevOps are mocked; nothing leaves the machine.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

// Optional screenshots for the pull request (E2E_SHOTS=<folder>); the assertions never depend on them.
const shots = process.env.E2E_SHOTS
const shot = async (page, name) => { if (!shots) return; mkdirSync(shots, { recursive: true }); await page.screenshot({ path: `${shots}/${name}.png`, fullPage: false }) }

const setup = () => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'test-token')
  // A cloud server with its PAT (My settings → Servers and PATs), so a stream's query can be set up on it.
  localStorage.setItem('demand-planning-servers-v1', JSON.stringify([{ serverUrl: '', organization: 'example' }]))
  localStorage.setItem('demand-planning-server-pats-v1', JSON.stringify({ 'https://dev.azure.com/example': 'test-pat' }))
}
// The data repository (files by path, every write recorded) and Azure DevOps answering the Labeling query with three
// documents approved this month (two releases).
async function mock(context, files, role = 'Tool Owner') {
  const writes = []
  const now = new Date(), month = now.toISOString().slice(0, 7)
  const documents = [
    { id: 101, title: 'Label Set ABC_RELEASE v4', day: '02' },
    { id: 102, title: 'Label Set ABC_RELEASE v4', day: '03' },
    { id: 103, title: 'IFU Patient Monitor Labels', day: '04' },
  ].map(({ id, title, day }) => ({ id, rev: 1, fields: { 'System.Id': id, 'System.Title': title, 'System.WorkItemType': 'Document', 'System.State': 'Approved', 'System.AreaPath': 'Labeling\\Documents', 'System.IterationPath': 'Labeling', 'System.TeamProject': 'Labeling', 'System.ChangedDate': `${month}-${day}T10:00:00Z`, 'Custom.AuthorApprovalDate': `${month}-${day}T09:00:00Z` } }))
  await context.route('https://dev.azure.com/**', (route) => {
    const request = route.request(), url = new URL(request.url())
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname.endsWith('/_apis/wit/wiql')) {
      const query = JSON.parse(request.postData() ?? '{}').query ?? ''
      return json({ workItems: /\[System\.Id\] > 0\b/.test(query) ? documents.map(({ id }) => ({ id })) : [] })
    }
    if (url.pathname.endsWith('/_apis/wit/workitemsbatch')) { const ids = JSON.parse(request.postData() ?? '{}').ids ?? []; return json({ value: documents.filter((entry) => ids.includes(entry.id)) }) }
    if (url.pathname.endsWith('/_apis/wit/fields')) return json({ value: [{ referenceName: 'Custom.AuthorApprovalDate', name: 'Author Approval Date' }] })
    return json({ value: [] })
  })
  await context.route('https://api.github.com/**', (route) => {
    if (/^\/repos\/[^/]+\/[^/]+\/branches\/[^/]+$/.test(new URL(route.request().url()).pathname)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ name: 'main' }) }) // GIT-25: the branch can be read
    const request = route.request(), url = new URL(request.url())
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/repos/example/storage') return json({ visibility: 'private', permissions: { push: true } })
    if (url.pathname === '/repos/example/storage/commits') return json([])
    const match = /^\/repos\/example\/storage\/contents\/(.*)$/.exec(url.pathname)
    if (!match) return json({ message: 'Not Found' }, 404)
    const path = decodeURIComponent(match[1])
    if (request.method() === 'PUT') {
      if (path === '.demand-planning-write-check') return json({ message: 'Invalid request' }, 422)
      const body = JSON.parse(request.postData())
      files[path] = Buffer.from(body.content, 'base64').toString()
      writes.push({ path, message: body.message, data: JSON.parse(files[path]) })
      return json({ content: { sha: `v${writes.length}` }, commit: { html_url: `https://github.com/example/storage/commit/v${writes.length}` } })
    }
    if (path === 'access.json') return json(rolesFile(role))
    if (files[path] != null) return json({ type: 'file', encoding: 'base64', content: Buffer.from(files[path]).toString('base64'), sha: `s${files[path].length}` })
    return json({ message: 'Not Found' }, 404)
  })
  return writes
}
const releaseDetails = (page) => page.locator('.sidebar nav .nav-section', { hasText: 'RELEASE DETAILS' })

test('TC-STR-06: as Tool Owner add a stream “Labeling” (Azure DevOps, Like Content), map a connection named “Labeling” — the menu lists it under Release Details and its Release page has the §10 parts', async () => {
  const files = {}
  const { page, context, errors } = await openPage(app, { init: setup })
  const writes = await mock(context, files)
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  assert.equal(await releaseDetails(page).getByRole('button', { name: /Labeling/ }).count(), 0, 'no Labeling stream yet')

  // Settings → Streams → Custom streams: ＋ Add stream… with name, source and rule.
  await navigate(page, /Streams$/)
  const panel = page.locator('.custom-streams')
  await panel.getByText('No custom streams yet.').waitFor()
  await panel.getByRole('button', { name: '＋ Add stream…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add stream' })
  await dialog.getByLabel('Name', { exact: true }).fill('Labeling')
  assert.equal(await dialog.getByLabel('Source', { exact: true }).inputValue(), 'azure')
  const rules = (await dialog.getByLabel('Release rule', { exact: true }).locator('option').allInnerTexts()).map((label) => label.trim())
  assert.deepEqual(rules, ['Like DP — release from Area/Iteration path', 'Like IOCC — grouped by area, name from title', 'Like Content — each document is a release by its title', 'Like Tool Validations — one per tool'])
  await dialog.getByLabel('Release rule', { exact: true }).selectOption({ label: 'Like Content — each document is a release by its title' })
  assert.match(await text(dialog), /Every document is a release named by its Title/)
  await shot(page, 'add-stream-dialog')
  await dialog.getByRole('button', { name: 'Add stream' }).click()
  await dialog.waitFor({ state: 'detached' })
  // The dialog closes when the save is queued; wait for the write to reach the mocked GitHub (a condition, not a time).
  const savedOf = () => writes.filter((entry) => entry.path === 'custom-streams.json').pop()
  for (const until = Date.now() + 30000; !savedOf() && Date.now() < until;) await new Promise((resolve) => setTimeout(resolve, 50))
  const saved = savedOf()
  assert.deepEqual(saved.data, { schema: 1, kind: 'custom-streams', streams: [{ name: 'Labeling', rule: 'title', fuzzy: false }] }, 'saved to the shared setup in Git')
  assert.match(saved.message, /^Add stream: Labeling \(Like Content\)( \[by [^\]]+\])?$/)
  assert.match(await text(panel.locator('tbody')), /Labeling Custom Azure DevOps query connection “Labeling” Like Content — each document is a release by its title/)

  // The menu lists Labeling under Release Details (one list A–Z, NAV-52), not set up yet (＋).
  const missing = releaseDetails(page).locator('button.nav-missing', { hasText: 'Labeling' })
  await missing.waitFor()
  assert.equal(await missing.getAttribute('title'), 'Not set up: add a connection named “Labeling”')

  // The Stream mapping has its row; Add query maps a connection named “Labeling”.
  const mapping = page.locator('.connection-panel', { hasText: 'STEP 2' })
  const row = mapping.locator('tbody tr', { hasText: 'Labeling' })
  assert.match(await text(row), /Labeling Custom .*Like Content — each document is a release by its title Not mapped/)
  await row.getByRole('button', { name: 'Add query' }).click()
  const form = page.getByRole('dialog', { name: 'New connection' })
  assert.equal(await form.getByLabel('Name', { exact: true }).inputValue(), 'Labeling')
  await form.locator('label', { hasText: /^Server/ }).locator('select').selectOption('https://dev.azure.com/example')
  await form.locator('label', { hasText: /^Project/ }).locator('input').fill('Labeling')
  await form.locator('label.query-field textarea').fill("SELECT [System.Id], [System.Title] FROM WorkItems WHERE [System.WorkItemType] = 'Document'")
  await Promise.all([
    page.waitForResponse((response) => response.ok() && response.request().method() === 'PUT' && new URL(response.url()).pathname.endsWith('/contents/azure-views.json')),
    form.getByRole('button', { name: 'Save and refresh data' }).click(),
  ])
  await form.waitFor({ state: 'detached' })
  await row.getByText('Fetched').or(row.getByText('Data saved')).first().waitFor()
  const views = writes.filter((entry) => entry.path === 'azure-views.json').pop()
  assert.deepEqual(views.data.views.map((view) => view.viewName), ['Labeling'], 'the connection is shared like every stream connection')
  await shot(page, 'stream-mapping')

  // Release Details → Labeling: the Release page with the §10 parts.
  const entry = releaseDetails(page).locator('button:not(.nav-missing)', { hasText: 'Labeling' })
  await entry.waitFor()
  await shot(page, 'menu')
  await entry.click()
  await page.locator('.page-loading').waitFor({ state: 'detached' })
  const bar = page.locator('.release-source')
  await bar.waitFor()
  // (1) the source bar (QV-70): Show, ↻ and ⋯; the source and when fetched are the first line of ⋯.
  await bar.getByRole('button', { name: 'More actions: Labeling', exact: true }).click()
  assert.match(await text(page.getByRole('menu', { name: 'Labeling' }).locator('.view-actions-note')), /^example \/ Labeling · query · fetched /, '(1) the source bar: source · fetched in ⋯')
  await page.keyboard.press('Escape')
  assert.equal(await bar.getByRole('radiogroup', { name: 'Show' }).count(), 1, 'Show: Selected month / All months')
  const counts = page.locator('.release-counts')
  assert.match(await text(counts), /Releases in \w+ \d{4} 2/, '(2) the counts: two releases this month')
  const tabs = page.getByRole('tablist').filter({ has: page.getByRole('tab', { name: /^Releases/ }) })
  assert.deepEqual((await tabs.getByRole('tab').allInnerTexts()).map((label) => label.replace(/\s+/g, ' ').trim()), ['Releases', 'Source data (3)'], '(3) the tabs')
  const table = page.locator('.release-register')
  await table.waitFor()
  const headers = (await table.locator('thead th').allTextContents()).map((label) => label.replace(/[▲▼↕]/g, '').trim()).filter(Boolean)
  assert.deepEqual(headers, ['Select', 'Release name', 'Approved', 'Documents', 'Time Writing Feature', 'Planned (h)', 'Booked (h)', 'QMS-0025 match'], '(4) the common columns in order, Select for bulk Create Features')
  const dates = await page.evaluate(() => {
    const month = new Date().toISOString().slice(0, 7)
    const format = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    return ['04', '03'].map((day) => format.format(new Date(`${month}-${day}T09:00:00Z`)))
  })
  for (const [index, [title, count]] of [['IFU Patient Monitor Labels', '1'], ['Label Set ABC_RELEASE v4', '2']].entries()) {
    const release = table.locator('tbody tr', { hasText: title })
    const cells = release.getByRole('cell')
    assert.equal(await text(cells.nth(2)), dates[index], 'approval date uses browser locale')
    assert.equal(await text(cells.nth(3)), count, 'documents are grouped by release title')
    assert.equal(await release.getByRole('button', { name: 'Create Feature' }).count(), 1)
  }
  await shot(page, 'release-page')
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-STR-07: a viewer without “Change the stream mapping” sees the custom streams read only — ＋ Add stream…, Edit and Remove disabled with the reason; the stream is still in the menu', async () => {
  const files = { 'custom-streams.json': JSON.stringify({ schema: 1, kind: 'custom-streams', streams: [{ name: 'Labeling', rule: 'title', fuzzy: false }, { name: 'Tree', rule: 'cp', fuzzy: false }] }) }
  const { page, context, errors } = await openPage(app, { init: setup })
  const writes = await mock(context, files, 'Team Member')
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await releaseDetails(page).locator('button', { hasText: 'Labeling' }).waitFor()
  await navigate(page, /Streams$/)
  const panel = page.locator('.custom-streams')
  const add = panel.getByRole('button', { name: '＋ Add stream…' })
  await panel.locator('tbody tr', { hasText: 'Labeling' }).waitFor()
  assert.equal(await add.isDisabled(), true)
  const reason = 'Your role does not allow “Change the stream mapping and its query logic: servers, projects and queries of the streams, their data sets, release naming (Tool Owner)”. An Admin can change this in Admin → People & roles → Role rights.'
  assert.equal(await text(panel.locator('.write-blocked')), reason, 'the reason, visible next to the button')
  assert.equal(await add.getAttribute('title'), reason)
  assert.equal(await panel.getByRole('button', { name: 'Edit' }).isDisabled(), true)
  assert.equal(await panel.getByRole('button', { name: 'Remove' }).isDisabled(), true)
  assert.match(await text(panel), /Not used — custom-streams\.json in Git: Tree: “Tree”: CP’s release-folder tree rule cannot be used by a custom stream; choose another rule\./, 'a refused stream is named with why')
  await shot(page, 'viewer-disabled')
  assert.equal(writes.length, 0, 'nothing written')
  assert.deepEqual(errors, [])
  await context.close()
})
