import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { navigate, openPage, rolesFile, startApp, text } from './helpers.mjs'

// Tool Validations master list (TVL-01…TVL-14): the Tool Owner maps the Tool Validations query; its tools are added to
// the master list in Git when it is fetched; the page opens on its Expiry list tab, which lists what is overdue, due within
// the viewer's window and without a due date (the owners set the team default there too); the Master list tab next to
// it holds only the master list; the Tool List [TFS] tab holds the query's rows (no Releases table); the Setup tab, last, holds the
// sources and the team settings; a tool is added by hand, the team default is changed (Expiry list, then Setup) and a manual list (a Table page) is added as a source (Setup → Sources) — its own tab — merged in from
// that tab and removed again, with its tab (TC-TVL-07, UAT; TC-TVL-09). A Team Member reads it all, Setup included, with
// the buttons disabled and the reason shown, and keeps a window of their own (TC-TVL-05, TC-TVL-06); a tool with only a
// validation date is due 24 months later (default), on both lists (TC-TVL-20).
// TVL-15…TVL-18: the Tool Owner adds a Table tab and an On-Demand Dashboard tab (Setup → Tabs), renames and reorders
// them, adds a row on the Table tab and a chart of the master list on the dashboard tab, and removes both — one page
// deleted, one kept hidden; the pages are never in the menu (TC-TVL-11, UAT). A Team Member reads the tabs with every
// change disabled and the reason shown (TC-TVL-13).
// TVL-24…TVL-26: a hidden page made a tab again (TC-TVL-21), the list's co-owners written to the tab pages and taken off
// again without touching those added by hand (TC-TVL-22), a dashboard block with Show expiry status off (TC-TVL-23).
// TVL-27, TVL-28: the Tool Owner sets the due date highlights on Setup; the Master list and the Expiry list tint the rows
// with a pill and a legend; a Team Member sees them read only (TC-TVL-25, UAT).
// TVL-32: the Tool Owner adds a Validation Documents source — its tab lists its rows with every column, the master list
// unchanged — and a Tool List source whose tools are appended; changed to Validation Documents, its tools stay, "Not in
// source now" (TC-TVL-31, UAT).
// GitHub and Azure DevOps are mocked; nothing leaves the machine.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

// Optional screenshots (E2E_SHOTS=<folder>); the assertions never depend on them.
const shots = process.env.E2E_SHOTS
const shot = async (page, name) => { if (!shots) return; mkdirSync(shots, { recursive: true }); await page.screenshot({ path: `${shots}/${name}.png`, fullPage: false }) }

const day = (offset) => { const at = new Date(); at.setUTCHours(0, 0, 0, 0); at.setUTCDate(at.getUTCDate() + offset); return at.toISOString().slice(0, 10) }
const yearsBack = (date, years) => `${Number(date.slice(0, 4)) - years}${date.slice(4)}`
// TVL-06: a day plus whole calendar months (the last day of a shorter month), and the days from today to a day (UTC).
const plusMonths = (date, months) => { const [y, m, d] = date.split('-').map(Number); const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate(); return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10) }
const daysTo = (date) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${day(0)}T00:00:00Z`)) / 86_400_000)
const longDate = (page, date) => page.evaluate((value) => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)), date)
const setup = () => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'test-token')
  localStorage.setItem('demand-planning-servers-v1', JSON.stringify([{ serverUrl: '', organization: 'example' }]))
  localStorage.setItem('demand-planning-server-pats-v1', JSON.stringify({ 'https://dev.azure.com/example': 'test-pat' }))
}
// The viewer of the second scenario has no PAT: nothing is fetched, the master list is shown as Git has it. This browser
// tab remembers the Master list tab ("tool-master"): it opens the Master list (TVL-14).
const setupReader = () => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'test-token')
  sessionStorage.setItem('demand-planning-result-tab-v1', JSON.stringify({ 'azure:Tool Validations': 'tool-master' }))
}
// Synthetic validation documents: Minitab 21 (two documents, approved — and last changed, the completion date that dates
// them, TVL-29 — two years before 30 days from now, valid 24 months: due in 30 days), LabVIEW 2020 (due date 10 days ago: overdue), Python 3.11 (no dates), JMP 17 (valid 36 months from a
// month ago: due later).
const documents = () => [
  { id: 201, title: 'Minitab 21 Validation Plan', area: 'DHP\\Tool Validations\\Minitab', iteration: 'DHP\\Release 21', approved: `${yearsBack(day(28), 2)}T09:00:00Z`, period: '24' },
  { id: 202, title: 'Minitab 21 Validation Report', area: 'DHP\\Tool Validations\\Minitab', iteration: 'DHP\\Release 21', approved: `${yearsBack(day(30), 2)}T09:00:00Z`, period: '24' },
  { id: 203, title: 'LabVIEW 2020 Validation Report', area: 'DHP\\Tool Validations\\LabVIEW', iteration: 'DHP\\Release 2020', due: `${day(-10)}T00:00:00Z` },
  { id: 204, title: 'Python 3.11 Validation Report', area: 'DHP\\Tool Validations', iteration: 'DHP' },
  { id: 205, title: 'JMP 17 Validation Report', area: 'DHP\\Tool Validations\\JMP', iteration: 'DHP\\Release 17', approved: `${day(-30)}T09:00:00Z`, period: '3 years' },
].map((entry) => ({ id: entry.id, rev: 1, fields: { 'System.Id': entry.id, 'System.Title': entry.title, 'System.WorkItemType': 'Document', 'System.State': 'Approved', 'System.AreaPath': entry.area, 'System.IterationPath': entry.iteration, 'System.TeamProject': 'DHP', ...(entry.approved ? { 'Custom.AuthorApprovalDate': entry.approved, 'System.ChangedDate': entry.approved } : {}), ...(entry.period ? { 'Custom.ValidityPeriod': entry.period } : {}), ...(entry.due ? { 'Microsoft.VSTS.Scheduling.DueDate': entry.due } : {}) } }))
// A manual list kept as a Table page of the app (On-Demand): LabVIEW (also in the query) and Polyspace (only here).
const toolRegister = () => JSON.stringify({ schema: 1, kind: 'on-demand-page', id: 'tool-register', name: 'Tool register', description: '', keyPrefix: 'TR', insights: [],
  columns: [{ id: 'c-tool', name: 'Tool', type: 'text', options: [], required: true }, { id: 'c-version', name: 'Version', type: 'text', options: [], required: false }, { id: 'c-due', name: 'Due date', type: 'date', options: [], required: false }],
  rows: [{ id: 'r-1', cells: { 'c-tool': 'LabVIEW', 'c-version': '2020' } }, { id: 'r-2', cells: { 'c-tool': 'Polyspace', 'c-version': 'R2024a', 'c-due': day(20) } }] })

async function mock(context, files, role = 'Tool Owner') {
  const writes = []
  await context.route('https://dev.azure.com/**', (route) => {
    const request = route.request(), url = new URL(request.url())
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    const all = documents()
    if (url.pathname.endsWith('/_apis/wit/wiql')) { const query = JSON.parse(request.postData() ?? '{}').query ?? ''; return json({ workItems: /\[System\.Id\] > 0\b/.test(query) ? all.map(({ id }) => ({ id })) : [] }) }
    if (url.pathname.endsWith('/_apis/wit/workitemsbatch')) { const ids = JSON.parse(request.postData() ?? '{}').ids ?? []; return json({ value: all.filter((entry) => ids.includes(entry.id)) }) }
    if (url.pathname.endsWith('/_apis/wit/fields')) return json({ value: [{ referenceName: 'Custom.AuthorApprovalDate', name: 'Author Approval Date' }, { referenceName: 'Custom.ValidityPeriod', name: 'Validity Period' }, { referenceName: 'Microsoft.VSTS.Scheduling.DueDate', name: 'Due Date' }] })
    return json({ value: [] })
  })
  await context.route('https://api.github.com/**', (route) => {
    const request = route.request(), url = new URL(request.url())
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/repos/example/storage') return json({ visibility: 'private', permissions: { push: true } })
    if (url.pathname === '/repos/example/storage/commits') return json([])
    // GIT-25: the branch exists (as in a real repository), so a 404 of a file means it is missing.
    if (url.pathname === '/repos/example/storage/branches/main') return json({ name: 'main' })
    const match = /^\/repos\/example\/storage\/contents\/(.*)$/.exec(url.pathname)
    if (!match) return json({ message: 'Not Found' }, 404)
    const path = decodeURIComponent(match[1])
    // TVL-16: a Tool Owner deletes the page of a removed tab.
    if (request.method() === 'DELETE') {
      if (files[path] == null) return json({ message: 'Not Found' }, 404)
      delete files[path]
      writes.push({ path, message: JSON.parse(request.postData()).message, deleted: true })
      return json({ commit: { sha: `d${writes.length}` } })
    }
    if (request.method() === 'PUT') {
      if (path === '.demand-planning-write-check') return json({ message: 'Invalid request' }, 422)
      const body = JSON.parse(request.postData())
      files[path] = Buffer.from(body.content, 'base64').toString()
      writes.push({ path, message: body.message, data: JSON.parse(files[path]) })
      return json({ content: { sha: `v${writes.length}` }, commit: { html_url: `https://github.com/example/storage/commit/v${writes.length}` } })
    }
    if (path === 'access.json') return json(rolesFile(role))
    const folder = Object.keys(files).filter((name) => name.startsWith(`${path}/`))
    if (files[path] == null && folder.length) return json(folder.map((name) => ({ type: 'file', name: name.slice(path.length + 1), path: name, sha: `s${files[name].length}` })))
    if (files[path] != null) return json({ type: 'file', encoding: 'base64', content: Buffer.from(files[path]).toString('base64'), sha: `s${files[path].length}` })
    return json({ message: 'Not Found' }, 404)
  })
  return writes
}
const releaseDetails = (page) => page.locator('.sidebar nav .nav-section', { hasText: 'RELEASE DETAILS' })
const panelTitled = (page, title) => page.locator('.panel').filter({ has: page.locator('h2', { hasText: new RegExp(`^${title}`) }) })
const until = async (check, what) => { for (const end = Date.now() + 30000; Date.now() < end;) { const value = check(); if (value) return value; await new Promise((resolve) => setTimeout(resolve, 50)) } throw new Error(`Timed out waiting for ${what}`) }
const savedList = (writes, test = () => true) => [...writes].reverse().find((entry) => entry.path === 'tool-validations.json' && test(entry))
const tabLabels = async (tabs) => (await tabs.getByRole('tab').allInnerTexts()).map((label) => label.trim())
const selectedTab = async (tabs) => (await tabs.locator('[role=tab][aria-selected=true]').innerText()).trim()
const rowsOf = async (panel) => (await panel.locator('tbody tr').allInnerTexts()).map((row) => row.replace(/\s+/g, ' ').trim())
// The azure-views.json the first scenario shares, so the second one opens with the same Tool Validations connection.
let sharedViews = null

test('TC-TVL-07: the Tool Owner maps the Tool Validations query — its tools land in the master list in Git, Validation expiry lists overdue, due soon and no due date; a tool added by hand, the team default changed and a manual list merged in', async () => {
  const files = { 'on-demand/tool-register.json': toolRegister() }
  const { page, context, errors } = await openPage(app, { init: setup })
  page.addLocatorHandler(page.getByRole('dialog', { name: /Could not fetch from Azure DevOps/ }), async (dialog) => { await dialog.getByRole('button', { name: /Close|Not now|Dismiss/ }).first().click() })
  const writes = await mock(context, files)
  await page.reload()
  await page.locator('.sidebar nav').waitFor()

  // Stream mapping → Tool Validations → Add query: the connection, fetched at once.
  await navigate(page, /Streams$/)
  const mapping = page.locator('.connection-panel', { hasText: 'STEP 2' })
  // The stream's own row (TVL-19 adds a "Tool Validations · Validation Documents" row below it, TVL-33).
  const row = mapping.locator('tbody tr').filter({ has: page.locator('td:first-child strong', { hasText: /^Tool Validations$/ }) })
  await row.getByRole('button', { name: 'Add query' }).click()
  const form = page.getByRole('dialog', { name: 'New connection' })
  assert.equal(await form.getByLabel('Name', { exact: true }).inputValue(), 'Tool Validations')
  await form.locator('label', { hasText: /^Server/ }).locator('select').selectOption('https://dev.azure.com/example')
  await form.locator('label', { hasText: /^Project/ }).locator('input').fill('DHP')
  await form.locator('label.query-field textarea').fill("SELECT [System.Id], [System.Title], [System.AreaPath], [System.IterationPath], [Custom.AuthorApprovalDate], [Custom.ValidityPeriod], [Microsoft.VSTS.Scheduling.DueDate] FROM WorkItems WHERE [System.WorkItemType] = 'Document'")
  await form.getByRole('button', { name: 'Save and refresh data' }).click()
  await form.waitFor({ state: 'detached' })
  sharedViews = await until(() => files['azure-views.json'], 'the shared connection setup')

  // TVL-04: the fetch adds its tools to the master list in Git (the Tool Owner may edit it), with the guessed mapping.
  const first = await until(() => savedList(writes), 'the master list saved to Git')
  assert.match(first.message, /^Tool Validations: 4 new, 0 updated, 0 no longer in the source from the Tool Validations query \[saved \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\]/)
  assert.deepEqual(first.data.tools.map((entry) => `${entry.name} ${entry.version}`), ['JMP 17', 'LabVIEW 2020', 'Minitab 21', 'Python 3.11'])
  const minitab = first.data.tools.find((entry) => entry.name === 'Minitab')
  assert.deepEqual([minitab.validationDate, minitab.validityMonths, minitab.sources], [yearsBack(day(30), 2), 24, { stream: { inSource: true } }], 'the latest approval of its two documents and the period')
  assert.equal(first.data.tools.find((entry) => entry.name === 'LabVIEW').dueDate, day(-10))
  assert.deepEqual([first.data.schema, first.data.kind, first.data.defaultDays, first.data.sources[0].mapping.confirmed], [1, 'tool-validations', 60, false])

  // Release Details → Tool Validations: TVL-14 the tabs Expiry list | Master list | Tool List [TFS] | Setup (one query:
  // no Validation Documents [TFS]); the Expiry list opens
  // first — the tiles on top (the team default of 60 days), then the expiry table; no master list, no Sources or Team
  // settings there.
  await releaseDetails(page).locator('button:not(.nav-missing)', { hasText: 'Tool Validations' }).click()
  await page.locator('.page-loading').waitFor({ state: 'detached' })
  const tabs = page.getByRole('tablist', { name: 'Result' })
  await tabs.waitFor()
  assert.deepEqual(await tabLabels(tabs), ['Expiry list', 'Master list', 'Tool List [TFS]', 'Setup'])
  assert.equal(await selectedTab(tabs), 'Expiry list', 'the Expiry list opens first')
  const expiry = panelTitled(page, 'Validation expiry')
  const master = panelTitled(page, 'Master list')
  await expiry.locator('tbody tr').first().waitFor()
  assert.equal(await page.getByRole('tabpanel').locator('.panel').count(), 1, 'only the expiry table on the Expiry list tab')
  assert.equal(await master.count(), 0, 'the master list is not on this tab')
  assert.deepEqual([await panelTitled(page, 'Sources').count(), await panelTitled(page, 'Team settings').count()], [0, 0], 'Sources and Team settings are on Setup')
  assert.equal(await page.getByLabel('Days ahead').count(), 1, 'the window N on the Expiry list tab')
  assert.ok((await page.locator('.tool-expiry-counts').boundingBox()).y < (await expiry.boundingBox()).y, 'the tiles on top')
  assert.match(await text(page.locator('.tool-expiry-counts')), /Overdue 1 .*Due in the next 60 days 1 .*No due date 1/)
  const listed = await rowsOf(expiry)
  assert.equal(listed.length, 3, 'JMP is due later: not listed')
  assert.match(listed[0], /^Overdue LabVIEW 2020 .* 10 days overdue/)
  assert.match(listed[1], /^Due soon Minitab 21 .* 30 days left/)
  assert.match(listed[2], /^No due date Python 3\.11 No due date/)
  await shot(page, 'expiry')
  // KB-93: the window, the filter row and the table's first column line up with the panel's title.
  const left = (locator) => locator.first().evaluate((element) => Math.round(element.getBoundingClientRect().left))
  const lineUp = async (panel) => {
    const title = await left(panel.locator('.panel-heading h2'))
    const edges = [await left(panel.locator('.data-table-toolbar > *')), await left(panel.locator('.segmented')), await left(panel.locator('thead th').first().locator('span, button').first())]
    assert.deepEqual(edges, edges.map(() => title), `the left edges line up with the title at ${title}px`)
  }
  await lineUp(expiry)
  assert.equal(await left(page.locator('.tool-expiry-window')), await left(expiry.locator('.panel-heading h2')), 'the window N lines up with the title')

  // TVL-09: my own window — 10 days drops Minitab; Use the team default brings it back.
  const window = page.getByLabel('Days ahead')
  await window.fill('10')
  await page.locator('.tool-expiry-counts').getByText('Due in the next 10 days').waitFor()
  assert.equal((await rowsOf(expiry)).length, 2)
  assert.match(await text(expiry), /Your own window \(10 days\), kept for you; the team default is 60 days\./)
  await page.getByRole('button', { name: 'Use the team default (60)' }).click()
  await page.locator('.tool-expiry-counts').getByText('Due in the next 60 days').waitFor()
  assert.equal((await rowsOf(expiry)).length, 3)
  assert.ok(await page.getByRole('button', { name: 'Set 60 days as team default' }).isDisabled(), 'already the team default')
  // TVL-09: the Tool Owner makes the window shown the team default right here — saved to Git as Team settings saves it.
  await window.fill('45')
  await page.getByRole('button', { name: 'Set 45 days as team default' }).click()
  const fromExpiry = await until(() => savedList(writes, (entry) => entry.data.defaultDays === 45), 'the team default set on the Expiry list')
  assert.match(fromExpiry.message, /^Tool Validations: team default 45 days, 0 co-owners/)
  await expiry.getByText('The team default: 45 days.').waitFor()
  assert.ok(await page.getByRole('button', { name: 'Use the team default (45)' }).isDisabled(), 'the window is the team default now, not my own')

  // TVL-10, TVL-14: the Master list tab — only the master list: no tiles, no expiry table, no window N.
  await tabs.getByRole('tab', { name: 'Master list' }).click()
  await master.locator('tbody tr').first().waitFor()
  assert.equal(await page.getByRole('tabpanel').locator('.panel').count(), 1, 'only the master list on the Master list tab')
  assert.deepEqual([await expiry.count(), await page.locator('.tool-expiry-counts').count(), await page.getByLabel('Days ahead').count()], [0, 0, 0], 'no expiry table, no tiles, no window N on the Master list tab')
  await lineUp(master)

  // TVL-14: the Tool List [TFS] tab — the query's rows, no Releases table, no expiry view.
  await tabs.getByRole('tab', { name: 'Tool List [TFS]' }).click()
  await panelTitled(page, 'Tool List \\[TFS\\]').locator('tbody tr').first().waitFor()
  assert.equal(await text(panelTitled(page, 'Tool List \\[TFS\\]').locator('.record-count').first()), '5 rows')
  assert.equal(await panelTitled(page, 'Releases').count(), 0, 'no Releases table')
  assert.equal(await page.getByLabel('Days ahead').count(), 0)
  await shot(page, 'tool-list-tfs')

  // TVL-10: ＋ Add tool… by hand, due in 5 days.
  await tabs.getByRole('tab', { name: 'Master list' }).click()
  await master.locator('tbody tr').first().waitFor()
  assert.equal((await rowsOf(master)).length, 4)
  assert.match(await text(master.locator('.write-blocked')), /^Tools from Azure DevOps are changed there/, 'nothing blocked for the Tool Owner but the tools of the query (TVL-30)')
  await master.getByRole('button', { name: '＋ Add tool…' }).click()
  const add = page.getByRole('dialog', { name: 'Add a tool' })
  await add.getByLabel('Tool name').fill('Excel Validator')
  await add.getByLabel('Version (optional)').fill('2.0')
  await add.getByLabel('Due date (optional)').fill(day(5))
  await add.getByRole('button', { name: 'Add tool' }).click()
  await add.waitFor({ state: 'detached' })
  const byHand = await until(() => savedList(writes, (entry) => entry.data.tools.some((tool) => tool.name === 'Excel Validator')), 'the tool added by hand')
  assert.deepEqual(byHand.data.tools.find((entry) => entry.name === 'Excel Validator'), { ...byHand.data.tools.find((entry) => entry.name === 'Excel Validator'), version: '2.0', dueDate: day(5), manual: ['dueDate'], sources: {} })
  await master.locator('tbody tr', { hasText: 'Excel Validator' }).getByText('Added by hand').waitFor()

  // TVL-09, TVL-14: the team default on the Setup tab (Sources and Team settings; no expiry view, no master list), saved in Git.
  await tabs.getByRole('tab', { name: 'Setup' }).click()
  await panelTitled(page, 'Team settings').waitFor()
  assert.equal(await panelTitled(page, 'Sources').count(), 1, 'Sources on Setup')
  assert.deepEqual([await panelTitled(page, 'Master list').count(), await page.getByLabel('Days ahead').count()], [0, 0])
  assert.ok((await panelTitled(page, 'Sources').boundingBox()).y < (await panelTitled(page, 'Team settings').boundingBox()).y, 'Sources, then Team settings')
  await shot(page, 'setup')
  await panelTitled(page, 'Team settings').getByRole('button', { name: 'Edit…' }).click()
  const team = page.getByRole('dialog', { name: 'Team settings' })
  // KB-91: the co-owners list closes — with Escape (the pop-up stays open), with its own button, and with a click elsewhere in the pop-up.
  const ownersButton = team.getByRole('button', { name: /^Co-owners of the list/ })
  const ownersList = team.getByRole('listbox', { name: /^Co-owners of the list/ })
  await ownersButton.click()
  await ownersList.waitFor()
  await page.keyboard.press('Escape')
  await ownersList.waitFor({ state: 'detached' })
  assert.equal(await team.isVisible(), true, 'Escape closes only the list, not the pop-up')
  assert.equal(await ownersButton.evaluate((element) => element === document.activeElement), true, 'the focus is back on the list button')
  await ownersButton.click()
  await ownersList.waitFor()
  await ownersButton.click()
  await ownersList.waitFor({ state: 'detached' })
  await ownersButton.click()
  await ownersList.waitFor()
  await team.getByLabel('Expiry window, team default (days)').click()
  await ownersList.waitFor({ state: 'detached' })
  await team.getByLabel('Expiry window, team default (days)').fill('30')
  await team.getByRole('button', { name: 'Save to Git' }).click()
  await team.waitFor({ state: 'detached' })
  assert.equal((await until(() => savedList(writes, (entry) => entry.data.defaultDays === 30), 'the team default')).data.defaultDays, 30)

  // TVL-05: a manual list (Table page) as a source (Setup → Sources), merged into the master list after a preview.
  const sources = panelTitled(page, 'Sources')
  await sources.getByRole('button', { name: '＋ Add source…' }).click()
  const addSource = page.getByRole('dialog', { name: 'Add a source' })
  await addSource.locator('label', { hasText: /^Kind/ }).locator('select').selectOption('ondemand')
  await addSource.locator('label', { hasText: /^Table page/ }).locator('select').selectOption('tool-register')
  assert.equal(await addSource.locator('label', { hasText: /^Name/ }).locator('input').inputValue(), 'Tool register')
  await addSource.getByRole('radio', { name: 'Tool List' }).check()
  await addSource.getByRole('button', { name: 'Add source' }).click()
  await addSource.waitFor({ state: 'detached' })
  const register = sources.locator('tbody tr', { hasText: 'Tool register' })
  await register.waitFor()
  assert.match(await text(register), /Guessed Tool name: Tool · Version: Version · Due date: Due date/)
  // TVL-14: the source has its own tab, after Tool List [TFS] and before Setup — its rows as mapped, with Edit mapping… and Merge
  // into master list….
  await tabs.getByRole('tab', { name: 'Tool register' }).waitFor()
  assert.deepEqual(await tabLabels(tabs), ['Expiry list', 'Master list', 'Tool List [TFS]', 'Tool register', 'Setup'])
  assert.equal(await selectedTab(tabs), 'Setup', 'Setup stays open after adding the source')
  await tabs.getByRole('tab', { name: 'Tool register' }).click()
  const own = panelTitled(page, 'Tool register')
  await own.locator('tbody tr').first().waitFor()
  const ownRows = await rowsOf(own)
  assert.equal(ownRows.length, 2)
  assert.match(ownRows[0], /^LabVIEW 2020 .*Not merged yet$/)
  assert.match(ownRows[1], /^Polyspace R2024a — — .*\d{4} \(from the source\) Not merged yet$/, 'its due date read (no period: none needed, no default)')
  assert.equal(await own.getByRole('button', { name: 'Edit mapping…' }).isDisabled(), false)
  await shot(page, 'source-tab')
  await own.getByRole('button', { name: 'Merge into master list…' }).click()
  const merge = page.getByRole('dialog', { name: 'Merge Tool register into the master list' })
  assert.match(await text(merge), /2 rows of Tool register read with its field mapping: 1 new, 1 updated, 0 no longer in the source\. New: Polyspace/)
  await shot(page, 'merge')
  await merge.getByRole('button', { name: 'Merge into master list' }).click()
  await merge.waitFor({ state: 'detached' })
  const merged = await until(() => savedList(writes, (entry) => entry.data.tools.some((tool) => tool.name === 'Polyspace')), 'the merge')
  assert.deepEqual(merged.data.tools.find((entry) => entry.name === 'LabVIEW').sources, { stream: { inSource: true }, 'tool-register': { inSource: true } }, 'one entry, both sources')
  assert.ok(merged.data.sources.find((source) => source.id === 'tool-register').mergedAt)
  await own.locator('tbody tr', { hasText: 'Polyspace' }).getByText('Merged', { exact: true }).waitFor()

  // TVL-14: removing the source (Setup → Sources) removes its tab; its tools stay.
  await tabs.getByRole('tab', { name: 'Master list' }).click()
  await master.locator('tbody tr', { hasText: 'Polyspace' }).waitFor()
  await shot(page, 'master-list')
  await tabs.getByRole('tab', { name: 'Setup' }).click()
  await sources.locator('tbody tr', { hasText: 'Tool register' }).getByRole('button', { name: 'Remove' }).click()
  const removeSource = page.getByRole('dialog', { name: 'Remove the source Tool register' })
  await removeSource.getByRole('button', { name: 'Remove Tool register' }).click()
  await removeSource.waitFor({ state: 'detached' })
  await tabs.getByRole('tab', { name: 'Tool register' }).waitFor({ state: 'detached' })
  assert.deepEqual(await tabLabels(tabs), ['Expiry list', 'Master list', 'Tool List [TFS]', 'Setup'])
  assert.equal(await sources.locator('tbody tr', { hasText: 'Tool register' }).count(), 0)
  const removed = await until(() => savedList(writes, (entry) => !entry.data.sources.some((source) => source.id === 'tool-register')), 'the source removed')
  assert.ok(removed.data.tools.some((tool) => tool.name === 'Polyspace'), 'its tools stay')
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-TVL-06: a Team Member reads the master list and the expiry view — every change disabled with the reason — and keeps a window of their own; a tool with only a validation date is due 24 months later (TC-TVL-20)', async () => {
  assert.ok(sharedViews, 'the first scenario shared the connection setup')
  // TVL-06 (TC-TVL-20): SAS 9.4 and R 4.3 have only a validation date — due 24 months after it (default): SAS overdue,
  // R due within the window.
  const sasValidated = day(-800), rValidated = day(-720)
  const sasDue = plusMonths(sasValidated, 24), rDue = plusMonths(rValidated, 24)
  const list = { schema: 1, kind: 'tool-validations', defaultDays: 45, owners: ['co.owner@example.com'], sources: [{ id: 'stream', kind: 'stream', name: 'Tool Validations', mapping: { periodUnit: 'months', confirmed: true, name: '@tool-name', version: '@tool-version', dueDate: 'Microsoft.VSTS.Scheduling.DueDate' } }, { id: 'windchill-tools', kind: 'windchill', name: 'Windchill tools', ref: 'wc-tools', mapping: { periodUnit: 'months', confirmed: true, name: 'Name' } }],
    tools: [{ name: 'LabVIEW', version: '2020', dueDate: day(-3), sources: { stream: { inSource: false } }, addedAt: '2026-01-05T10:00:00Z' }, { name: 'Excel Validator', version: '2.0', dueDate: day(40), manual: ['dueDate'], sources: {}, addedAt: '2026-01-05T10:00:00Z' },
      { name: 'SAS', version: '9.4', validationDate: sasValidated, sources: { stream: { inSource: true } }, addedAt: '2026-01-05T10:00:00Z' }, { name: 'R', version: '4.3', validationDate: rValidated, sources: {}, addedAt: '2026-01-05T10:00:00Z' }] }
  const files = { 'azure-views.json': sharedViews, 'tool-validations.json': JSON.stringify(list) }
  const { page, context, errors } = await openPage(app, { init: setupReader })
  page.addLocatorHandler(page.getByRole('dialog', { name: /Could not fetch from Azure DevOps/ }), async (dialog) => { await dialog.getByRole('button', { name: /Close|Not now|Dismiss/ }).first().click() })
  const writes = await mock(context, files, 'Team Member')
  await page.reload()
  const entry = releaseDetails(page).locator('button:not(.nav-missing)', { hasText: 'Tool Validations' })
  await entry.waitFor()
  await entry.click()
  await page.locator('.page-loading').waitFor({ state: 'detached' })
  const tabs = page.getByRole('tablist', { name: 'Result' })
  await tabs.waitFor()
  // TVL-14: the remembered Master list tab ("tool-master") opens the Master list, not the Expiry list; the Windchill
  // source has its tab; Setup is last and shown to everyone.
  assert.deepEqual(await tabLabels(tabs), ['Expiry list', 'Master list', 'Tool List [TFS]', 'Windchill tools', 'Setup'])
  assert.equal(await selectedTab(tabs), 'Master list', 'the remembered tab')
  await panelTitled(page, 'Master list').locator('tbody tr', { hasText: 'LabVIEW' }).waitFor()
  await tabs.getByRole('tab', { name: 'Expiry list' }).click()
  const expiry = panelTitled(page, 'Validation expiry')
  await expiry.locator('tbody tr', { hasText: 'LabVIEW' }).waitFor()
  assert.equal(await panelTitled(page, 'Master list').count(), 0, 'the master list is on its own tab')
  assert.match(await text(page.locator('.tool-expiry-counts')), /Overdue 2 .*Due in the next 45 days 2 .*No due date 0/, 'the team default from Git: 45 days; SAS and R have a due date (default)')
  // TVL-06, TVL-08: the defaulted due date, the days left and "(default)" on the Expiry list.
  const defaulted = '24 \\(default\\)'
  assert.match(await text(expiry.locator('tbody tr', { hasText: 'SAS' })), new RegExp(`^Overdue SAS 9\\.4 ${await longDate(page, sasDue)} Overdue / today ${-daysTo(sasDue)} days overdue completion date \\+ 24 months \\(default\\) .*\\(completion date\\) ${defaulted}$`))
  assert.match(await text(expiry.locator('tbody tr').filter({ has: page.getByRole('cell', { name: 'R', exact: true }) })), new RegExp(`^Due soon R 4\\.3 ${await longDate(page, rDue)} ≤ 30 days ${daysTo(rDue)} days left validation date \\+ 24 months \\(default\\) .* ${defaulted}$`), 'R was added by hand: its own validation date')
  // TVL-28 with TVL-06: the defaulted due dates are highlighted in the default bands — SAS overdue (red), R within 30 days (amber).
  const tint = async (row) => /\btvl-hl-(\w+)/.exec((await row.getAttribute('class')) ?? '')?.[1] ?? ''
  assert.deepEqual([await tint(expiry.locator('tbody tr', { hasText: 'SAS' })), await tint(expiry.locator('tbody tr').filter({ has: page.getByRole('cell', { name: 'R', exact: true }) }))], ['red', 'amber'])
  // TVL-09: anyone keeps a window of their own.
  await page.getByLabel('Days ahead').fill('20')
  await page.locator('.tool-expiry-counts').getByText('Due in the next 20 days').waitFor()
  assert.deepEqual((await rowsOf(expiry)).map((row) => /^(Overdue|Due soon) (\S+)/.exec(row)?.slice(1).join(' ')), ['Overdue SAS', 'Overdue LabVIEW', 'Due soon R'], 'R (due in about 10 days, default) stays; Excel Validator (40 days) drops')
  assert.equal(await page.getByRole('button', { name: 'Use the team default (45)' }).isDisabled(), false)
  const reason = 'Only a Tool Owner (“Manage pages and menu groups”) or a co-owner of the Tool Validations list can change it. A Tool Owner names the co-owners in Team settings.'
  // TVL-09, TVL-11: only the owners set the team default here — disabled with the reason.
  const setDefault = page.getByRole('button', { name: 'Set 20 days as team default' })
  assert.ok(await setDefault.isDisabled())
  assert.equal(await setDefault.getAttribute('title'), reason)
  assert.equal(await text(page.locator('.tool-expiry-window .write-blocked')), reason)

  // TVL-11: the master list read only (its own tab, without the tiles and the window) — the reason visible next to the
  // disabled buttons.
  await tabs.getByRole('tab', { name: 'Master list' }).click()
  const master = panelTitled(page, 'Master list')
  await master.locator('tbody tr', { hasText: 'LabVIEW' }).waitFor()
  assert.match(await text(master.locator('tbody tr', { hasText: 'LabVIEW' })), /Not in source now/)
  // TVL-06: the Master list shows the period as "24 (default)" and the due date worked out with it.
  assert.match(await text(master.locator('tbody tr', { hasText: 'SAS' })), new RegExp(`^SAS 9\\.4 — ${await longDate(page, sasValidated)} \\(completion date\\) 24 \\(default\\) ${await longDate(page, sasDue)} Overdue / today \\(completion date \\+ 24 months \\(default\\)\\) In source`), 'TVL-29: from the Tool Validations query, whose mapping names no validation date: the completion date')
  assert.equal(await text(master.locator('.write-blocked')), reason)
  const add = master.getByRole('button', { name: '＋ Add tool…' })
  assert.ok(await add.isDisabled())
  assert.equal(await add.getAttribute('title'), reason)
  assert.ok(await master.getByRole('button', { name: 'Edit', exact: true }).first().isDisabled())
  assert.ok(await master.getByRole('button', { name: 'Remove' }).first().isDisabled())
  assert.deepEqual([await panelTitled(page, 'Sources').count(), await panelTitled(page, 'Team settings').count(), await panelTitled(page, 'Validation expiry').count(), await page.locator('.tool-expiry-counts').count()], [0, 0, 0, 0], 'only the master list on the Master list tab')
  await shot(page, 'read-only')
  // TVL-11, TVL-14: Setup read only — Sources and Team settings shown, every button disabled with the reason.
  await tabs.getByRole('tab', { name: 'Setup' }).click()
  const sources = panelTitled(page, 'Sources')
  await sources.locator('tbody tr', { hasText: 'Windchill tools' }).waitFor()
  assert.equal(await text(sources.locator('.write-blocked')), reason)
  const addSource = sources.getByRole('button', { name: '＋ Add source…' })
  assert.ok(await addSource.isDisabled())
  assert.equal(await addSource.getAttribute('title'), reason)
  for (const name of ['Edit mapping…', 'Merge into master list…', 'Remove']) assert.ok(await sources.locator('tbody tr', { hasText: 'Windchill tools' }).getByRole('button', { name }).isDisabled(), name)
  const team = panelTitled(page, 'Team settings')
  assert.ok(await team.getByRole('button', { name: 'Edit…' }).isDisabled())
  assert.equal(await text(team.locator('.write-blocked')), reason)
  assert.match(await text(team), /Expiry window \(team default\) 45 days Co-owners co\.owner@example\.com/i)
  await shot(page, 'setup-read-only')
  // TVL-14: the source's tab says how to load its data; its buttons are disabled with the reason too.
  await tabs.getByRole('tab', { name: 'Windchill tools' }).click()
  const own = panelTitled(page, 'Windchill tools')
  await own.getByText('That Windchill export is not in this browser.').waitFor()
  assert.match(await text(own), /Import the Windchill export \(Import Windchill export\)/)
  assert.equal(await text(own.locator('.write-blocked')), reason)
  assert.ok(await own.getByRole('button', { name: 'Edit mapping…' }).isDisabled())
  assert.ok(await own.getByRole('button', { name: 'Merge into master list…' }).isDisabled())
  // The Tool List [TFS] tab before a fetch: the usual fetch empty state.
  await tabs.getByRole('tab', { name: 'Tool List [TFS]' }).click()
  await page.getByText('“Tool Validations” has not been fetched yet.').waitFor()
  assert.equal(writes.filter((write) => write.path === 'tool-validations.json').length, 0, 'nothing written to the master list')
  assert.deepEqual(errors, [])
  await context.close()
})

// TVL-15…TVL-18: the master list both scenarios below start from (Git), with the Tool Validations connection of the first.
const listWith = (extra = {}) => JSON.stringify({ schema: 1, kind: 'tool-validations', defaultDays: 60, owners: [], sources: [{ id: 'stream', kind: 'stream', name: 'Tool Validations', mapping: { periodUnit: 'months', confirmed: true, name: '@tool-name', version: '@tool-version', dueDate: 'Microsoft.VSTS.Scheduling.DueDate' } }],
  tools: [
    { name: 'LabVIEW', version: '2020', dueDate: day(-3), sources: { stream: { inSource: true } }, addedAt: '2026-01-05T10:00:00Z' },
    { name: 'Minitab', version: '21', dueDate: day(20), sources: { stream: { inSource: true } }, addedAt: '2026-01-05T10:00:00Z' },
    { name: 'Python', version: '3.11', sources: {}, addedAt: '2026-01-05T10:00:00Z' },
    { name: 'JMP', version: '17', dueDate: day(400), sources: { stream: { inSource: true } }, addedAt: '2026-01-05T10:00:00Z' },
  ], ...extra })
const setupOwnTabs = () => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'test-token')
}
const lastWrite = (writes, path, test = () => true) => [...writes].reverse().find((entry) => entry.path === path && test(entry))
const openToolValidations = async (page) => {
  const entry = releaseDetails(page).locator('button:not(.nav-missing)', { hasText: 'Tool Validations' })
  await entry.waitFor()
  await entry.click()
  await page.locator('.page-loading').waitFor({ state: 'detached' })
  const tabs = page.getByRole('tablist', { name: 'Result' }).first()
  await tabs.waitFor()
  return tabs
}
const enabled = (locator) => locator.and(locator.page().locator(':enabled')).waitFor()

test('TC-TVL-11: the Tool Owner adds a Table tab and an On-Demand Dashboard tab, renames and reorders them, adds a row and a chart of the master list, and removes them — the pages are never in the menu', async () => {
  assert.ok(sharedViews, 'the first scenario shared the connection setup')
  const files = { 'azure-views.json': sharedViews, 'tool-validations.json': listWith() }
  const { page, context, errors } = await openPage(app, { init: setupOwnTabs, width: 1440, height: 1000 })
  page.addLocatorHandler(page.getByRole('dialog', { name: /Could not fetch from Azure DevOps/ }), async (dialog) => { await dialog.getByRole('button', { name: /Close|Not now|Dismiss/ }).first().click() })
  const writes = await mock(context, files)
  await page.reload()
  const tabs = await openToolValidations(page)
  assert.deepEqual(await tabLabels(tabs), ['Expiry list', 'Master list', 'Tool List [TFS]', 'Setup'])

  // TVL-15: Setup → Tabs → ＋ Add tab… — a Table page named Open items.
  await tabs.getByRole('tab', { name: 'Setup' }).click()
  const tabsPanel = panelTitled(page, 'Tabs')
  await tabsPanel.getByText('No tabs added yet.').waitFor()
  assert.ok((await panelTitled(page, 'Sources').boundingBox()).y < (await tabsPanel.boundingBox()).y && (await tabsPanel.boundingBox()).y < (await panelTitled(page, 'Team settings').boundingBox()).y, 'Sources, Tabs, Team settings')
  const addButton = tabsPanel.getByRole('button', { name: '＋ Add tab…' })
  await enabled(addButton)
  await addButton.click()
  let dialog = page.getByRole('dialog', { name: 'Add a tab' })
  assert.deepEqual((await dialog.locator('.pgb-kind label').allInnerTexts()).map((label) => label.trim()), ['Table', 'Table + Insights', 'On-Demand Dashboard'])
  assert.equal(await dialog.getByRole('radio', { name: 'Table', exact: true }).isChecked(), true, 'Table first')
  await dialog.getByLabel('Page name', { exact: true }).fill('Open items')
  await dialog.getByLabel('Description (optional)').fill('Actions on the tools')
  await shot(page, 'custom-tabs-add-dialog')
  await dialog.getByRole('button', { name: 'Add tab' }).click()
  await dialog.waitFor({ state: 'detached' })
  let saved = await until(() => lastWrite(writes, 'tool-validations.json', (entry) => entry.data.tabs?.length === 1), 'the tab in tool-validations.json')
  assert.deepEqual(saved.data.tabs, [{ pageId: 'open-items', name: 'Open items', kind: 'table' }])
  assert.match(saved.message, /^Tool Validations: add the tab Open items \(Table, page open-items\)/)
  assert.equal(lastWrite(writes, 'on-demand/open-items.json').data.name, 'Open items', 'the page is in Git as every On-Demand page')
  assert.deepEqual(lastWrite(writes, 'menu-layout.json').data.pages['open-items'], { type: 'table', group: 'on-demand', order: 1, icon: '▦', owners: [], hidden: true }, 'placed hidden: not in the menu')
  await tabs.getByRole('tab', { name: 'Open items' }).waitFor()
  assert.deepEqual(await tabLabels(tabs), ['Expiry list', 'Master list', 'Tool List [TFS]', 'Open items', 'Setup'], 'after the source tabs, before Setup')
  assert.equal(await selectedTab(tabs), 'Setup', 'Setup stays open')

  // An On-Demand Dashboard tab.
  await enabled(addButton)
  await addButton.click()
  dialog = page.getByRole('dialog', { name: 'Add a tab' })
  await dialog.getByRole('radio', { name: 'On-Demand Dashboard' }).check()
  await dialog.getByLabel('Page name', { exact: true }).fill('Tool dashboard')
  await dialog.getByRole('button', { name: 'Add tab' }).click()
  await dialog.waitFor({ state: 'detached' })
  saved = await until(() => lastWrite(writes, 'tool-validations.json', (entry) => entry.data.tabs?.length === 2), 'the second tab')
  assert.deepEqual(saved.data.tabs.map((tab) => `${tab.pageId}:${tab.kind}`), ['open-items:table', 'tool-dashboard:dashboard'])
  await tabs.getByRole('tab', { name: 'Tool dashboard' }).waitFor()
  assert.deepEqual(await tabLabels(tabs), ['Expiry list', 'Master list', 'Tool List [TFS]', 'Open items', 'Tool dashboard', 'Setup'])

  // TVL-16: Rename… renames the tab and its page; ← moves the dashboard first.
  await tabsPanel.locator('tbody tr', { hasText: 'Open items' }).getByRole('button', { name: 'Rename…' }).click()
  dialog = page.getByRole('dialog', { name: 'Rename the tab Open items' })
  await dialog.getByLabel('Page name', { exact: true }).fill('Open actions')
  await dialog.getByRole('button', { name: 'Save to Git' }).click()
  await dialog.waitFor({ state: 'detached' })
  await until(() => lastWrite(writes, 'tool-validations.json', (entry) => entry.data.tabs?.[0]?.name === 'Open actions'), 'the tab renamed')
  await until(() => lastWrite(writes, 'on-demand/open-items.json', (entry) => entry.data.name === 'Open actions'), 'the page renamed')
  await tabs.getByRole('tab', { name: 'Open actions' }).waitFor()
  const left = tabsPanel.getByRole('button', { name: 'Move Tool dashboard left' })
  await enabled(left)
  await left.click()
  await until(() => lastWrite(writes, 'tool-validations.json', (entry) => entry.data.tabs?.[0]?.pageId === 'tool-dashboard'), 'the tabs reordered')
  await tabsPanel.locator('tbody tr').first().filter({ hasText: 'Tool dashboard' }).waitFor()
  assert.deepEqual(await tabLabels(tabs), ['Expiry list', 'Master list', 'Tool List [TFS]', 'Tool dashboard', 'Open actions', 'Setup'])
  assert.ok(await tabsPanel.getByRole('button', { name: 'Move Tool dashboard left' }).isDisabled(), 'the first cannot move left')
  await shot(page, 'custom-tabs-setup')

  // TVL-17: the Table tab is the page as everywhere — columns, then a row saved to Git from the row drawer.
  await tabs.getByRole('tab', { name: 'Open actions' }).click()
  const setUp = page.getByRole('button', { name: 'Set up columns…' })
  await enabled(setUp)
  await setUp.click()
  const columns = page.getByRole('dialog', { name: 'Set up columns' })
  await columns.getByRole('button', { name: '＋ Add column' }).click()
  await columns.getByLabel('Column 1 name').fill('Action')
  await columns.getByRole('button', { name: 'Save', exact: true }).click()
  await columns.waitFor({ state: 'detached' })
  await until(() => lastWrite(writes, 'on-demand/open-items.json', (entry) => entry.data.columns?.length === 1), 'the column saved')
  const addRow = page.getByRole('button', { name: '＋ Add row' })
  await enabled(addRow)
  await addRow.click()
  const row = page.getByRole('dialog', { name: 'New row' })
  await row.getByLabel('Action').fill('Re-validate LabVIEW 2020')
  await row.getByRole('button', { name: 'Save to Git' }).click()
  const withRow = await until(() => lastWrite(writes, 'on-demand/open-items.json', (entry) => entry.data.rows?.length === 1), 'the row saved to Git')
  assert.equal(Object.values(withRow.data.rows[0].cells)[0], 'Re-validate LabVIEW 2020')
  await page.locator('.od-panel tbody tr', { hasText: 'Re-validate LabVIEW 2020' }).waitFor()
  await page.keyboard.press('Escape')
  await page.locator('aside.drawer').waitFor({ state: 'detached' })
  assert.equal(await page.getByRole('button', { name: '＋ Add page…' }).count(), 0, 'nothing of the menu on the tab')
  await shot(page, 'custom-tabs-table')

  // TVL-18: the dashboard tab — a bar chart of the master list by Status.
  await tabs.getByRole('tab', { name: 'Tool dashboard' }).click()
  const addBlock = page.getByRole('button', { name: '＋ Add block…' })
  await enabled(addBlock)
  await addBlock.click()
  dialog = page.getByRole('dialog', { name: 'Add a block' })
  await dialog.getByLabel('Title').fill('Tools by status')
  await dialog.getByRole('radio', { name: 'Bar chart' }).check()
  await dialog.getByLabel('Data source').selectOption('tools:master')
  await dialog.getByLabel('Categories by').selectOption({ label: 'Status (Dropdown)' })
  await dialog.getByRole('button', { name: 'Add block' }).click()
  await dialog.waitFor({ state: 'detached' })
  const chart = panelTitled(page, 'Tools by status')
  await chart.locator('.viz-root').waitFor()
  const block = await until(() => lastWrite(writes, 'dashboards/tool-dashboard.json'), 'the dashboard saved')
  assert.deepEqual(block.data.blocks.map((entry) => [entry.type, entry.source, entry.category, entry.period ?? 'none']), [['bar', 'tools:master', 'tv-status', 'none']], 'no period column')
  await page.mouse.move(0, 0)
  await shot(page, 'custom-tabs-dashboard')
  await chart.getByRole('button', { name: 'Table', exact: true }).click()
  await chart.locator('table').waitFor()
  assert.match(await text(chart.locator('table')), /Overdue 1/)
  assert.match(await text(chart.locator('table')), /Due soon 1/)

  // Never in the menu (nor in the On-Demand group).
  const menu = await text(page.locator('.sidebar nav'))
  for (const name of ['Open actions', 'Tool dashboard']) assert.equal(menu.includes(name), false, `${name} is not in the menu`)

  // TVL-16: Remove… asks first; the Tool Owner deletes Open actions with its data, keeps Tool dashboard hidden.
  await tabs.getByRole('tab', { name: 'Setup' }).click()
  await tabsPanel.locator('tbody tr', { hasText: 'Open actions' }).getByRole('button', { name: 'Remove…' }).click()
  dialog = page.getByRole('dialog', { name: 'Remove the tab Open actions' })
  assert.match(await text(dialog), /Its page — 1 row — is:/)
  assert.equal(await dialog.getByRole('radio', { name: 'Kept in Git, hidden' }).isChecked(), true, 'kept unless chosen')
  await dialog.getByRole('radio', { name: 'Deleted with its data' }).check()
  await dialog.getByRole('button', { name: 'Remove Open actions and delete its page' }).click()
  await dialog.waitFor({ state: 'detached' })
  await until(() => writes.find((entry) => entry.deleted && entry.path === 'on-demand/open-items.json'), 'the page deleted')
  await until(() => lastWrite(writes, 'menu-layout.json', (entry) => !entry.data.pages['open-items']), 'its place removed')
  assert.deepEqual(lastWrite(writes, 'tool-validations.json').data.tabs.map((tab) => tab.pageId), ['tool-dashboard'])
  await tabs.getByRole('tab', { name: 'Open actions' }).waitFor({ state: 'detached' })
  await tabsPanel.locator('tbody tr', { hasText: 'Tool dashboard' }).getByRole('button', { name: 'Remove…' }).click()
  dialog = page.getByRole('dialog', { name: 'Remove the tab Tool dashboard' })
  await dialog.getByRole('button', { name: 'Remove Tool dashboard', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  await until(() => lastWrite(writes, 'tool-validations.json', (entry) => !entry.data.tabs), 'no tabs left')
  await tabs.getByRole('tab', { name: 'Tool dashboard' }).waitFor({ state: 'detached' })
  assert.deepEqual(await tabLabels(tabs), ['Expiry list', 'Master list', 'Tool List [TFS]', 'Setup'])
  assert.ok(files['dashboards/tool-dashboard.json'] && files['on-demand/tool-dashboard.json'], 'the kept page and its blocks stay in Git')
  assert.equal(JSON.parse(files['menu-layout.json']).pages['tool-dashboard'].hidden, true, 'hidden')
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-TVL-13: a Team Member reads the owners’ tabs — the Table and the dashboard shown, every change disabled with the reason; Setup → Tabs read only', async () => {
  assert.ok(sharedViews, 'the first scenario shared the connection setup')
  const table = { schema: 1, kind: 'on-demand-page', id: 'open-actions', name: 'Open actions', description: '', keyPrefix: 'OA', insights: [], columns: [{ id: 'c-action', name: 'Action', type: 'text', options: [], required: false }], rows: [{ id: 'r-1', cells: { 'c-action': 'Re-validate LabVIEW 2020' } }] }
  const dashboardPage = { schema: 1, kind: 'on-demand-page', id: 'tool-dashboard', name: 'Tool dashboard', description: '', keyPrefix: 'TD', insights: [], columns: [], rows: [] }
  const blocks = { schema: 1, kind: 'dashboard', id: 'tool-dashboard', tabs: [], filters: [], blocks: [{ id: 'b1', title: 'Tools by status', type: 'bar', source: 'tools:master', category: 'tv-status', second: '', measure: 'count', value: '', filters: [], sort: 'value', period: '' }] }
  const layout = { schema: 1, kind: 'menu-layout', groups: {}, pages: { 'open-actions': { type: 'table', group: 'on-demand', order: 1, icon: '▦', owners: [], hidden: true }, 'tool-dashboard': { type: 'dashboard', group: 'on-demand', order: 2, icon: '▦', owners: [], hidden: true } } }
  const files = { 'azure-views.json': sharedViews, 'tool-validations.json': listWith({ tabs: [{ pageId: 'tool-dashboard', name: 'Tool dashboard', kind: 'dashboard' }, { pageId: 'open-actions', name: 'Open actions', kind: 'table' }] }), 'on-demand/open-actions.json': JSON.stringify(table), 'on-demand/tool-dashboard.json': JSON.stringify(dashboardPage), 'dashboards/tool-dashboard.json': JSON.stringify(blocks), 'menu-layout.json': JSON.stringify(layout) }
  const { page, context, errors } = await openPage(app, { init: setupOwnTabs })
  page.addLocatorHandler(page.getByRole('dialog', { name: /Could not fetch from Azure DevOps/ }), async (dialog) => { await dialog.getByRole('button', { name: /Close|Not now|Dismiss/ }).first().click() })
  const writes = await mock(context, files, 'Team Member')
  await page.reload()
  const tabs = await openToolValidations(page)
  await tabs.getByRole('tab', { name: 'Open actions' }).waitFor()
  assert.deepEqual(await tabLabels(tabs), ['Expiry list', 'Master list', 'Tool List [TFS]', 'Tool dashboard', 'Open actions', 'Setup'])
  const menu = await text(page.locator('.sidebar nav'))
  for (const name of ['Open actions', 'Tool dashboard']) assert.equal(menu.includes(name), false, `${name} is not in the menu`)
  // The dashboard tab: the chart of the master list, built by the owners; the builder's buttons disabled with the reason.
  await tabs.getByRole('tab', { name: 'Tool dashboard' }).click()
  await panelTitled(page, 'Tools by status').locator('.viz-root').waitFor()
  assert.equal(await page.getByRole('button', { name: '＋ Add block…' }).count(), 0, 'no ＋ Add block… as the main action')
  assert.match(await text(page.locator('.dashboard-page .write-blocked').first()), /Build On-Demand Dashboards/)
  // The Table tab: the row shown; ＋ Add row and Set up columns… disabled with the reason.
  await tabs.getByRole('tab', { name: 'Open actions' }).click()
  await page.locator('.od-panel tbody tr', { hasText: 'Re-validate LabVIEW 2020' }).waitFor()
  for (const name of ['＋ Add row', 'Set up columns…']) assert.ok(await page.getByRole('button', { name }).isDisabled(), name)
  assert.match(await text(page.locator('.od-panel .write-blocked').first()), /Edit On-Demand data/)
  // Setup → Tabs read only, with the list's reason (TVL-11).
  await tabs.getByRole('tab', { name: 'Setup' }).click()
  const tabsPanel = panelTitled(page, 'Tabs')
  await tabsPanel.locator('tbody tr', { hasText: 'Open actions' }).waitFor()
  const reason = 'Only a Tool Owner (“Manage pages and menu groups”) or a co-owner of the Tool Validations list can change it. A Tool Owner names the co-owners in Team settings.'
  assert.equal(await text(tabsPanel.locator('.write-blocked')), reason)
  assert.ok(await tabsPanel.getByRole('button', { name: '＋ Add tab…' }).isDisabled())
  assert.equal(await tabsPanel.getByRole('button', { name: '＋ Add tab…' }).getAttribute('title'), reason)
  for (const name of ['Move Open actions left', 'Rename…', 'Remove…']) assert.ok(await tabsPanel.locator('tbody tr', { hasText: 'Open actions' }).getByRole('button', { name }).isDisabled(), name)
  assert.equal(writes.length, 0, 'nothing written')
  assert.deepEqual(errors, [])
  await context.close()
})

// TVL-24…TVL-26: a hidden page made a tab again, the list's co-owners written to the tab pages, and a dashboard block
// without the expiry status.
const tablePage = (id, name, rows = []) => JSON.stringify({ schema: 1, kind: 'on-demand-page', id, name, description: '', keyPrefix: 'TP', insights: [], columns: [{ id: 'c-action', name: 'Action', type: 'text', options: [], required: false }], rows: rows.map((value, index) => ({ id: `r-${index + 1}`, cells: { 'c-action': value } })) })
const placed = (type, order, extra = {}) => ({ type, group: 'on-demand', order, icon: '▦', owners: [], ...extra })
const layoutWith = (pages) => JSON.stringify({ schema: 1, kind: 'menu-layout', groups: {}, pages })
const openOwners = async (files) => {
  const { page: browser, context, errors } = await openPage(app, { init: setupOwnTabs, width: 1440, height: 1000 })
  browser.addLocatorHandler(browser.getByRole('dialog', { name: /Could not fetch from Azure DevOps/ }), async (dialog) => { await dialog.getByRole('button', { name: /Close|Not now|Dismiss/ }).first().click() })
  const writes = await mock(context, files)
  await browser.reload()
  const tabs = await openToolValidations(browser)
  return { page: browser, context, errors, writes, tabs }
}

test('TC-TVL-21: the Tool Owner makes a hidden page a tab again with ＋ Add existing page as tab… — it leaves the list of hidden pages, gets the list’s co-owners, and loses them again when its tab is removed', async () => {
  assert.ok(sharedViews, 'the first scenario shared the connection setup')
  const files = {
    'azure-views.json': sharedViews, 'tool-validations.json': listWith({ owners: ['ana@example.com'] }),
    'on-demand/old-actions.json': tablePage('old-actions', 'Old actions', ['Check the LabVIEW licence']), 'on-demand/team-notes.json': tablePage('team-notes', 'Team notes'),
    'menu-layout.json': layoutWith({ 'old-actions': placed('table', 1, { owners: ['hand@example.com'], hidden: true }), 'team-notes': placed('table', 2) }),
  }
  const { page, context, errors, writes, tabs } = await openOwners(files)
  assert.deepEqual(await tabLabels(tabs), ['Expiry list', 'Master list', 'Tool List [TFS]', 'Setup'])
  await tabs.getByRole('tab', { name: 'Setup' }).click()
  const tabsPanel = panelTitled(page, 'Tabs')
  const existing = tabsPanel.getByRole('button', { name: '＋ Add existing page as tab…' })
  await enabled(existing)
  await existing.click()
  const dialog = page.getByRole('dialog', { name: 'Add an existing page as a tab' })
  assert.deepEqual((await dialog.getByLabel('Page', { exact: true }).locator('option').allInnerTexts()).map((label) => label.trim()), ['Old actions (Table, 1 row)'], 'only the hidden page; the page in the menu is not offered')
  assert.equal(await dialog.getByLabel('Page name', { exact: true }).inputValue(), 'Old actions', 'named after its page')
  await shot(page, 'tvl-add-existing-tab')
  await dialog.getByRole('button', { name: 'Add tab' }).click()
  await dialog.waitFor({ state: 'detached' })
  const saved = await until(() => lastWrite(writes, 'tool-validations.json', (entry) => entry.data.tabs?.length === 1), 'the tab in tool-validations.json')
  assert.deepEqual(saved.data.tabs, [{ pageId: 'old-actions', name: 'Old actions', kind: 'table' }])
  assert.match(saved.message, /^Tool Validations: add the existing page Old actions as the tab Old actions \(Table, page old-actions\)/)
  // TVL-25: the list's co-owner written to the page, the one added by hand kept; the page stays hidden.
  const layout = await until(() => lastWrite(writes, 'menu-layout.json', (entry) => entry.data.pages['old-actions'].ownersFromList), 'the co-owners written to the page')
  assert.deepEqual(layout.data.pages['old-actions'], placed('table', 1, { owners: ['hand@example.com', 'ana@example.com'], hidden: true, ownersFromList: ['ana@example.com'] }))
  assert.match(layout.message, /^Pages & menu: the co-owners of the Tool Validations list written to the page of Old actions/)
  await tabs.getByRole('tab', { name: 'Old actions' }).waitFor()
  assert.deepEqual(await tabLabels(tabs), ['Expiry list', 'Master list', 'Tool List [TFS]', 'Old actions', 'Setup'], 'after the source tabs, before Setup')
  assert.equal(await selectedTab(tabs), 'Setup', 'Setup stays open')
  await tabsPanel.locator('tbody tr', { hasText: '1 from the list · 1 added by hand' }).waitFor()
  // It is a tab now: no other hidden page is left to add.
  await existing.and(page.locator(':disabled')).waitFor()
  assert.match(await existing.getAttribute('title'), /^No hidden On-Demand page that is not a tab yet/)
  await shot(page, 'tvl-tabs-co-owners')
  await tabs.getByRole('tab', { name: 'Old actions' }).click()
  await page.locator('.od-panel tbody tr', { hasText: 'Check the LabVIEW licence' }).waitFor()
  const menu = await text(page.locator('.sidebar nav'))
  assert.equal(menu.includes('Old actions'), false, 'still not in the menu')
  // Removed again, page kept: the co-owner the list wrote is taken off, the one added by hand stays; it can be added again.
  await tabs.getByRole('tab', { name: 'Setup' }).click()
  await tabsPanel.locator('tbody tr', { hasText: 'Old actions' }).getByRole('button', { name: 'Remove…' }).click()
  const remove = page.getByRole('dialog', { name: 'Remove the tab Old actions' })
  await remove.getByRole('button', { name: 'Remove Old actions', exact: true }).click()
  await remove.waitFor({ state: 'detached' })
  const off = await until(() => lastWrite(writes, 'menu-layout.json', (entry) => !entry.data.pages['old-actions'].ownersFromList), 'the list’s co-owners taken off the page')
  assert.deepEqual(off.data.pages['old-actions'], placed('table', 1, { owners: ['hand@example.com'], hidden: true }))
  await enabled(existing)
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-TVL-22: the list’s co-owners are written as co-owners of the tab pages and taken off when they leave the list — the co-owners added by hand stay', async () => {
  assert.ok(sharedViews, 'the first scenario shared the connection setup')
  const files = {
    'azure-views.json': sharedViews, 'tool-validations.json': listWith({ owners: ['ana@example.com', 'ben@example.com'], tabs: [{ pageId: 'checklist', name: 'Checklist', kind: 'table' }] }),
    'on-demand/checklist.json': tablePage('checklist', 'Checklist'),
    'menu-layout.json': layoutWith({ checklist: placed('table', 1, { owners: ['hand@example.com'], hidden: true }) }),
  }
  const { page, context, errors, writes, tabs } = await openOwners(files)
  await tabs.getByRole('tab', { name: 'Setup' }).click()
  const tabsPanel = panelTitled(page, 'Tabs')
  // A page not in line with the list (e.g. written by an older version): said so, and written on request.
  const behind = tabsPanel.locator('.notice', { hasText: 'The co-owners of the list are not yet written to the page of Checklist' })
  await behind.waitFor()
  await tabsPanel.locator('tbody tr', { hasText: '0 from the list · 1 added by hand' }).waitFor()
  const write = behind.getByRole('button', { name: 'Write the co-owners to the tab pages' })
  await enabled(write)
  await write.click()
  let layout = await until(() => lastWrite(writes, 'menu-layout.json'), 'the co-owners written')
  assert.deepEqual(layout.data.pages.checklist, placed('table', 1, { owners: ['hand@example.com', 'ana@example.com', 'ben@example.com'], hidden: true, ownersFromList: ['ana@example.com', 'ben@example.com'] }))
  await behind.waitFor({ state: 'detached' })
  await tabsPanel.locator('tbody tr', { hasText: '2 from the list · 1 added by hand' }).waitFor()
  // Team settings: Ben leaves the list — and the page; Hand (added by hand) stays.
  await panelTitled(page, 'Team settings').getByRole('button', { name: 'Edit…' }).click()
  const team = page.getByRole('dialog', { name: 'Team settings' })
  assert.match(await text(team), /also written as co-owners of the pages of the 1 tab/)
  await team.locator('.multi-button').click()
  // Unticked, Ben is no longer a co-owner (and no longer listed: he is not in Azure DevOps).
  await team.getByRole('checkbox', { name: /ben@example\.com/ }).click()
  await team.getByRole('checkbox', { name: /ben@example\.com/ }).waitFor({ state: 'detached' })
  await team.locator('.multi-button').click()
  await team.getByRole('button', { name: 'Save to Git' }).click()
  await team.waitFor({ state: 'detached' })
  const list = await until(() => lastWrite(writes, 'tool-validations.json', (entry) => entry.data.owners.length === 1), 'the co-owners saved')
  assert.deepEqual(list.data.owners, ['ana@example.com'])
  layout = await until(() => lastWrite(writes, 'menu-layout.json', (entry) => entry.data.pages.checklist.ownersFromList?.length === 1), 'Ben taken off the page')
  assert.deepEqual(layout.data.pages.checklist, placed('table', 1, { owners: ['hand@example.com', 'ana@example.com'], hidden: true, ownersFromList: ['ana@example.com'] }))
  await tabsPanel.locator('tbody tr', { hasText: '1 from the list · 1 added by hand' }).waitFor()
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-TVL-23: a dashboard block on the Tool Validations master list without the expiry status — Show expiry status off, Status and Days left neither offered nor shown', async () => {
  assert.ok(sharedViews, 'the first scenario shared the connection setup')
  const blocks = { schema: 1, kind: 'dashboard', id: 'tool-dashboard', tabs: [], filters: [], blocks: [{ id: 'b1', title: 'Tools by status', type: 'bar', source: 'tools:master', category: 'tv-status', second: '', measure: 'count', value: '', filters: [], sort: 'value', period: '' }] }
  const files = {
    'azure-views.json': sharedViews, 'tool-validations.json': listWith({ tabs: [{ pageId: 'tool-dashboard', name: 'Tool dashboard', kind: 'dashboard' }] }),
    'on-demand/tool-dashboard.json': JSON.stringify({ schema: 1, kind: 'on-demand-page', id: 'tool-dashboard', name: 'Tool dashboard', description: '', keyPrefix: 'TD', insights: [], columns: [], rows: [] }),
    'dashboards/tool-dashboard.json': JSON.stringify(blocks), 'menu-layout.json': layoutWith({ 'tool-dashboard': placed('dashboard', 1, { hidden: true }) }),
  }
  const { page, context, errors, writes, tabs } = await openOwners(files)
  await tabs.getByRole('tab', { name: 'Tool dashboard' }).click()
  const chart = panelTitled(page, 'Tools by status')
  await chart.locator('.viz-root').waitFor()
  const more = page.getByRole('button', { name: 'More actions: Tools by status', exact: true })
  await enabled(more)
  await more.click()
  await page.getByRole('menuitem', { name: 'Edit…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit the block' })
  const toggle = dialog.getByRole('checkbox', { name: 'Show expiry status' })
  assert.equal(await toggle.isChecked(), true, 'shown unless switched off')
  assert.match(await text(dialog.locator('.dsh-status-toggle')), /team default window of 60 days/)
  const offered = async () => (await dialog.getByLabel('Categories by').locator('option').allInnerTexts()).map((label) => label.trim())
  assert.ok((await offered()).includes('Status (Dropdown)'))
  await toggle.uncheck()
  await dialog.locator('.dsh-status-toggle', { hasText: 'Status and Days left are left out of this block.' }).waitFor()
  assert.equal((await offered()).some((label) => /^Status|^Days left/.test(label)), false, 'Status and Days left not offered')
  assert.notEqual(await dialog.getByLabel('Categories by').inputValue(), 'tv-status', 'the category on Status replaced')
  await dialog.getByLabel('Categories by').selectOption({ label: 'In source now (Dropdown)' })
  await shot(page, 'tvl-hide-expiry-status')
  await dialog.getByRole('button', { name: 'Save to Git' }).click()
  await dialog.waitFor({ state: 'detached' })
  const saved = await until(() => lastWrite(writes, 'dashboards/tool-dashboard.json', (entry) => entry.data.blocks[0].hideStatus), 'the block saved without the status')
  assert.deepEqual([saved.data.blocks[0].hideStatus, saved.data.blocks[0].category], [true, 'tv-state'])
  await chart.getByRole('button', { name: 'Table', exact: true }).click()
  await chart.locator('table').waitFor()
  const shown = await text(chart.locator('table'))
  assert.match(shown, /In source/)
  assert.equal(/Overdue|Due soon|Days left/.test(shown), false, 'no status in the block')
  assert.deepEqual(errors, [])
  await context.close()
})

// TVL-27, TVL-28: the due date highlights — the default bands until saved, set on Setup by the Tool Owner, saved to Git,
// shown on the Master list and the Expiry list (row tint, pill, legend), read only for a Team Member (TC-TVL-25, UAT).
const rowOf = (panel, name) => panel.locator('tbody tr', { hasText: name })
const tintOf = async (row) => /\btvl-hl-(\w+)/.exec((await row.getAttribute('class')) ?? '')?.[1] ?? ''
const legendOf = async (panel) => (await panel.locator('.tvl-legend .tvl-legend-item').allInnerTexts()).map((item) => item.trim())
const pillOf = async (row) => { const pill = row.locator('.tvl-band'); return await pill.count() ? text(pill) : '' }

test('TC-TVL-25: the Tool Owner sets the due date highlights on Setup — saved to Git; the Master list and the Expiry list tint the rows with a pill and a legend; a Team Member sees them read only', async () => {
  assert.ok(sharedViews, 'the first scenario shared the connection setup')
  const files = { 'azure-views.json': sharedViews, 'tool-validations.json': listWith() }
  const { page, context, errors } = await openPage(app, { init: setupOwnTabs, width: 1440, height: 1000 })
  page.addLocatorHandler(page.getByRole('dialog', { name: /Could not fetch from Azure DevOps/ }), async (dialog) => { await dialog.getByRole('button', { name: /Close|Not now|Dismiss/ }).first().click() })
  const writes = await mock(context, files)
  await page.reload()
  const tabs = await openToolValidations(page)

  // No `highlights` in the file: the default bands — overdue or due today red, within 30 days amber, within 90 days yellow.
  await tabs.getByRole('tab', { name: 'Master list' }).click()
  const master = panelTitled(page, 'Master list')
  await rowOf(master, 'LabVIEW').waitFor()
  assert.deepEqual([await tintOf(rowOf(master, 'LabVIEW')), await pillOf(rowOf(master, 'LabVIEW'))], ['red', 'Overdue / today'], 'overdue: the first band')
  assert.deepEqual([await tintOf(rowOf(master, 'Minitab')), await pillOf(rowOf(master, 'Minitab'))], ['amber', '≤ 30 days'], 'due in 20 days')
  assert.deepEqual([await tintOf(rowOf(master, 'JMP')), await pillOf(rowOf(master, 'JMP'))], ['', ''], 'due in 400 days: later than every band')
  assert.deepEqual([await tintOf(rowOf(master, 'Python')), await pillOf(rowOf(master, 'Python'))], ['', ''], 'no due date: never highlighted')
  assert.deepEqual(await legendOf(master), ['Overdue or due today', 'Due within 30 days', 'Due within 90 days'])

  // Setup → Due date highlights: the bands with their tools now, "not saved in Git yet".
  await tabs.getByRole('tab', { name: 'Setup' }).click()
  const panel = panelTitled(page, 'Due date highlights')
  await panel.locator('tbody tr').first().waitFor()
  assert.deepEqual(await rowsOf(panel), ['Overdue or due today Red 1', 'Due within 30 days Amber 1', 'Due within 90 days Yellow 0'])
  assert.match(await text(panel), /The default bands — not saved in Git yet/)
  assert.equal(await panel.locator('.write-blocked').count(), 0, 'nothing blocked for the Tool Owner')
  assert.ok((await panelTitled(page, 'Team settings').boundingBox()).y < (await panel.boundingBox()).y, 'under Team settings')

  // Edit…: the 30-day band blue, the 90-day band removed, ＋ Add band — the same days twice refused, then 450 days green.
  await panel.getByRole('button', { name: 'Edit…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Due date highlights' })
  await dialog.getByLabel('Colour of band 2').selectOption('blue')
  await dialog.getByRole('button', { name: 'Remove band 3' }).click()
  await dialog.getByRole('button', { name: '＋ Add band' }).click()
  const days = dialog.getByLabel('Days of band 3')
  assert.equal(await days.inputValue(), '60', 'a new band 30 days after the last')
  await days.fill('30')
  await dialog.getByRole('status').getByText('Two bands have 30 days').waitFor()
  await dialog.getByRole('button', { name: 'Save to Git' }).click()
  await dialog.locator('.notice', { hasText: 'Two bands have 30 days: each band needs its own number of days.' }).waitFor()
  assert.equal(writes.length, 0, 'nothing saved with the error')
  await days.fill('450')
  await dialog.getByLabel('Colour of band 3').selectOption('green')
  await dialog.getByRole('status').getByText(/^Now: Overdue or due today — 1 tool · Due within 30 days — 1 tool · Due within 450 days — 1 tool\.$/).waitFor()
  await dialog.getByRole('button', { name: 'Save to Git' }).click()
  await dialog.waitFor({ state: 'detached' })
  const saved = await until(() => savedList(writes, (entry) => entry.data.highlights), 'the bands saved to Git')
  assert.deepEqual(saved.data.highlights, [{ days: 0, colour: 'red' }, { days: 30, colour: 'blue' }, { days: 450, colour: 'green' }])
  assert.match(saved.message, /^Tool Validations: due date highlights — 0 days red, 30 days blue, 450 days green \[saved /)
  await panel.getByText('The team\'s bands, saved in tool-validations.json.').waitFor()
  assert.deepEqual(await rowsOf(panel), ['Overdue or due today Red 1', 'Due within 30 days Blue 1', 'Due within 450 days Green 1'])

  // The Master list and the Expiry list show the new bands.
  await tabs.getByRole('tab', { name: 'Master list' }).click()
  await rowOf(master, 'JMP').locator('.tvl-band').waitFor()
  assert.deepEqual([await tintOf(rowOf(master, 'LabVIEW')), await tintOf(rowOf(master, 'Minitab')), await tintOf(rowOf(master, 'JMP')), await tintOf(rowOf(master, 'Python'))], ['red', 'blue', 'green', ''])
  assert.deepEqual([await pillOf(rowOf(master, 'Minitab')), await pillOf(rowOf(master, 'JMP'))], ['≤ 30 days', '≤ 450 days'])
  assert.deepEqual(await legendOf(master), ['Overdue or due today', 'Due within 30 days', 'Due within 450 days'])
  await tabs.getByRole('tab', { name: 'Expiry list' }).click()
  const expiry = panelTitled(page, 'Validation expiry')
  await rowOf(expiry, 'Minitab').waitFor()
  assert.deepEqual([await tintOf(rowOf(expiry, 'LabVIEW')), await pillOf(rowOf(expiry, 'LabVIEW')), await tintOf(rowOf(expiry, 'Minitab')), await pillOf(rowOf(expiry, 'Minitab')), await tintOf(rowOf(expiry, 'Python'))], ['red', 'Overdue / today', 'blue', '≤ 30 days', ''])
  assert.deepEqual(await legendOf(expiry), ['Overdue or due today', 'Due within 30 days', 'Due within 450 days'])

  // A Team Member sees the same bands; Edit… disabled with the reason; nothing written.
  const reader = await openPage(app, { init: setupOwnTabs })
  reader.page.addLocatorHandler(reader.page.getByRole('dialog', { name: /Could not fetch from Azure DevOps/ }), async (box) => { await box.getByRole('button', { name: /Close|Not now|Dismiss/ }).first().click() })
  const readerWrites = await mock(reader.context, files, 'Team Member')
  await reader.page.reload()
  const readerTabs = await openToolValidations(reader.page)
  await readerTabs.getByRole('tab', { name: 'Master list' }).click()
  const readerMaster = panelTitled(reader.page, 'Master list')
  await rowOf(readerMaster, 'JMP').locator('.tvl-band').waitFor()
  assert.deepEqual([await tintOf(rowOf(readerMaster, 'LabVIEW')), await tintOf(rowOf(readerMaster, 'Minitab')), await tintOf(rowOf(readerMaster, 'JMP'))], ['red', 'blue', 'green'])
  await readerTabs.getByRole('tab', { name: 'Setup' }).click()
  const readerPanel = panelTitled(reader.page, 'Due date highlights')
  await readerPanel.locator('tbody tr').first().waitFor()
  const reason = 'Only a Tool Owner (“Manage pages and menu groups”) or a co-owner of the Tool Validations list can change it. A Tool Owner names the co-owners in Team settings.'
  assert.ok(await readerPanel.getByRole('button', { name: 'Edit…' }).isDisabled())
  assert.equal(await readerPanel.getByRole('button', { name: 'Edit…' }).getAttribute('title'), reason)
  assert.equal(await text(readerPanel.locator('.write-blocked')), reason)
  assert.equal(readerWrites.length, 0, 'nothing written by the Team Member')
  assert.deepEqual(reader.errors, [])
  await reader.context.close()

  // Every band removed: saved as an empty list — no row tinted, no legend.
  await tabs.getByRole('tab', { name: 'Setup' }).click()
  await panel.getByRole('button', { name: 'Edit…' }).click()
  for (let left = 3; left > 0; left--) await dialog.getByRole('button', { name: `Remove band ${left}` }).click()
  await dialog.getByText('No bands: nothing is highlighted.').waitFor()
  await dialog.getByRole('button', { name: 'Save to Git' }).click()
  await dialog.waitFor({ state: 'detached' })
  const cleared = await until(() => savedList(writes, (entry) => Array.isArray(entry.data.highlights) && entry.data.highlights.length === 0), 'no bands saved')
  assert.match(cleared.message, /^Tool Validations: due date highlights — none/)
  await panel.getByText('No highlighting: every band was removed.').waitFor()
  await tabs.getByRole('tab', { name: 'Master list' }).click()
  await rowOf(master, 'LabVIEW').waitFor()
  assert.deepEqual([await master.locator('tbody tr.tvl-hl').count(), await master.locator('.tvl-band').count(), await master.locator('.tvl-legend').count()], [0, 0, 0])
  assert.deepEqual(errors, [])
  await context.close()
})

// TVL-32: a table page of signed validation documents (no tool name or version column the master list reads).
const signedDocs = () => JSON.stringify({ schema: 1, kind: 'on-demand-page', id: 'signed-docs', name: 'Signed documents register', description: '', keyPrefix: 'SD', insights: [],
  columns: [{ id: 'c-doc', name: 'Document', type: 'text', options: [], required: true }, { id: 'c-tool', name: 'Tool', type: 'text', options: [], required: false }, { id: 'c-by', name: 'Signed by', type: 'text', options: [], required: false }, { id: 'c-on', name: 'Signed on', type: 'date', options: [], required: false }],
  rows: [{ id: 'r-1', cells: { 'c-doc': 'Minitab 21 Validation Plan', 'c-tool': 'Minitab 21', 'c-by': 'Ana Costa', 'c-on': '2026-10-14' } }, { id: 'r-2', cells: { 'c-doc': 'Polyspace R2024a Validation Report', 'c-tool': 'Polyspace R2024a', 'c-by': 'Bo Li', 'c-on': '2026-10-21' } }] })

test('TC-TVL-31: the Tool Owner adds a Validation Documents source — its tab lists its rows with every column, the master list unchanged — and a Tool List source whose tools are appended; changed to Validation Documents, its tools stay', async () => {
  assert.ok(sharedViews, 'the first scenario shared the connection setup')
  const files = { 'azure-views.json': sharedViews, 'tool-validations.json': listWith(), 'on-demand/tool-register.json': toolRegister(), 'on-demand/signed-docs.json': signedDocs() }
  const { page, context, errors } = await openPage(app, { init: setupOwnTabs, width: 1440, height: 1000, scale: shots ? 2 : undefined })
  page.addLocatorHandler(page.getByRole('dialog', { name: /Could not fetch from Azure DevOps/ }), async (dialog) => { await dialog.getByRole('button', { name: /Close|Not now|Dismiss/ }).first().click() })
  const writes = await mock(context, files)
  await page.reload()
  const tabs = await openToolValidations(page)
  await tabs.getByRole('tab', { name: 'Setup' }).click()
  const sources = panelTitled(page, 'Sources')
  await sources.locator('tbody tr').first().waitFor()
  assert.match(await text(sources.locator('tbody tr', { hasText: 'Tool Validations' }).first()), /Tool List/, 'the Tool Validations query is a Tool List')

  // ＋ Add source…: the Category is asked, nothing chosen; Validation Documents needs no field mapping.
  await sources.getByRole('button', { name: '＋ Add source…' }).click()
  const addSource = page.getByRole('dialog', { name: 'Add a source' })
  const category = addSource.locator('fieldset', { has: page.locator('legend', { hasText: /^Category$/ }) })
  assert.deepEqual(await category.getByRole('radio').evaluateAll((radios) => radios.map((radio) => [radio.parentElement.textContent.trim(), radio.checked, radio.required])), [['Tool List', false, true], ['Validation Documents', false, true]], 'required, nothing pre-selected')
  await addSource.locator('label', { hasText: /^Kind/ }).locator('select').selectOption('ondemand')
  await addSource.locator('label', { hasText: /^Table page/ }).locator('select').selectOption('signed-docs')
  await addSource.getByRole('button', { name: 'Add source' }).click()
  assert.equal(await addSource.isVisible(), true, 'not added without a category')
  assert.equal(writes.length, 0)
  await category.getByRole('radio', { name: 'Validation Documents' }).check()
  await addSource.getByText('No field mapping is needed: its tab lists every column of its rows.').waitFor()
  await shot(page, 'add-source-category')
  await addSource.getByRole('button', { name: 'Add source' }).click()
  await addSource.waitFor({ state: 'detached' })
  const added = await until(() => savedList(writes, (entry) => entry.data.sources.some((source) => source.id === 'signed-documents-register')), 'the Validation Documents source saved')
  const docsSource = added.data.sources.find((source) => source.id === 'signed-documents-register')
  assert.deepEqual([docsSource.category, docsSource.kind, docsSource.ref], ['documents', 'ondemand', 'signed-docs'])
  assert.deepEqual(added.data.tools.map((entry) => entry.name), ['JMP', 'LabVIEW', 'Minitab', 'Python'], 'the master list unchanged')
  const docsRow = sources.locator('tbody tr', { hasText: 'Signed documents register' })
  await docsRow.waitFor()
  assert.match(await text(docsRow), /Validation Documents .*Not needed — every column is listed on its tab/)
  assert.equal(await docsRow.getByRole('button', { name: 'Merge into master list…' }).count(), 0, 'never merged into the master list')

  // Its tab: every column of its rows, in the page's order; nothing merged; the master list as it was.
  await tabs.getByRole('tab', { name: 'Signed documents register' }).click()
  const own = panelTitled(page, 'Signed documents register')
  await own.locator('tbody tr').first().waitFor()
  assert.deepEqual((await own.locator('thead th').allTextContents()).map((label) => label.replace(/[▴▾]/g, '').trim()).filter(Boolean), ['Document', 'Tool', 'Signed by', 'Signed on'])
  assert.deepEqual(await rowsOf(own), ['Minitab 21 Validation Plan Minitab 21 Ana Costa 2026-10-14', 'Polyspace R2024a Validation Report Polyspace R2024a Bo Li 2026-10-21'])
  assert.match(await text(own.locator('.record-count')), /^2 rows · not in the master list$/)
  assert.equal(await own.getByRole('button', { name: 'Merge into master list…' }).count(), 0)
  await shot(page, 'validation-documents-tab')
  await tabs.getByRole('tab', { name: 'Master list' }).click()
  const master = panelTitled(page, 'Master list')
  await master.locator('tbody tr').first().waitFor()
  assert.equal((await rowsOf(master)).length, 4, 'no tool of the documents added')
  assert.equal(await master.locator('tbody tr', { hasText: 'Polyspace' }).count(), 0)

  // A Tool List source: merged, its tools appended.
  await tabs.getByRole('tab', { name: 'Setup' }).click()
  await sources.getByRole('button', { name: '＋ Add source…' }).click()
  await addSource.locator('label', { hasText: /^Kind/ }).locator('select').selectOption('ondemand')
  await addSource.locator('label', { hasText: /^Table page/ }).locator('select').selectOption('tool-register')
  await category.getByRole('radio', { name: 'Tool List' }).check()
  await addSource.getByRole('button', { name: 'Add source' }).click()
  await addSource.waitFor({ state: 'detached' })
  const listRow = sources.locator('tbody tr', { hasText: 'Tool register' })
  await listRow.getByRole('button', { name: 'Merge into master list…' }).click()
  const merge = page.getByRole('dialog', { name: 'Merge Tool register into the master list' })
  await merge.getByRole('button', { name: 'Merge into master list' }).click()
  await merge.waitFor({ state: 'detached' })
  const merged = await until(() => savedList(writes, (entry) => entry.data.tools.some((tool) => tool.name === 'Polyspace')), 'the Tool List merged')
  assert.deepEqual(merged.data.tools.find((entry) => entry.name === 'Polyspace').sources, { 'tool-register': { inSource: true } }, 'appended from the Tool List')
  assert.equal(merged.data.sources.find((source) => source.id === 'tool-register').category, 'tools')

  // Changed to Validation Documents (Edit mapping…): it stops feeding the master list; its tools stay, not in source now.
  await listRow.getByRole('button', { name: 'Edit mapping…' }).click()
  const edit = page.getByRole('dialog', { name: 'Field mapping of Tool register' })
  await edit.getByRole('radio', { name: 'Validation Documents' }).check()
  await edit.getByText(/2 tools of the master list came from Tool register: they stay in the list, marked “Not in source now” for this source\./).waitFor()
  await edit.getByRole('button', { name: 'Save to Git' }).click()
  await edit.waitFor({ state: 'detached' })
  const changed = await until(() => savedList(writes, (entry) => entry.data.sources.find((source) => source.id === 'tool-register')?.category === 'documents'), 'the category changed')
  assert.match(changed.message, /^Tool Validations: Tool register is Validation Documents — 2 no longer in the source/)
  assert.deepEqual(changed.data.tools.find((entry) => entry.name === 'Polyspace').sources, { 'tool-register': { inSource: false } }, 'kept, not in source now')
  assert.deepEqual(changed.data.tools.find((entry) => entry.name === 'LabVIEW').sources, { stream: { inSource: true }, 'tool-register': { inSource: false } })
  await tabs.getByRole('tab', { name: 'Master list' }).click()
  await master.locator('tbody tr', { hasText: 'Polyspace' }).getByText('Not in source now').waitFor()
  assert.deepEqual(errors, [])
  await context.close()
})
