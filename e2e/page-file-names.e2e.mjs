import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { navigate, startApp, text } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'

// Page file names (OND-120…OND-131, OND-133) against one mocked GitHub with branches, trees and blobs
// (e2e/fakeGitHub.mjs): a page added is saved as on-demand/<Name>--<id>.json; renamed, its file moves in one commit; a
// row-file page kept under its name renamed moves its folder (TC-OND-129, UAT); CoNQ and the other pages of the form
// before keep their files when renamed (TC-OND-133, UAT); a second browser with a row-file page open — holding a row's
// lock and a save that failed — saves into the renamed folder and sees the new name (TC-OND-131); two copies of a page,
// the Tool Owner's Delete older copy (TC-OND-136, UAT); a Dashboard page's blocks file named as the page and moved with
// it, one from before kept (TC-OND-137). Synthetic data only.
// PAGE_FILE_SHOTS=<folder> saves screenshots of the paths shown (Background jobs).
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const tool = 'tool.owner@example.com', ben = 'ben@example.com'
const policy = () => { const value = defaultPolicy(); value.defaultRole = 'Team Member'; value.members = { [tool]: ['Tool Owner'], [ben]: ['Admin'] }; return serializeAccess(value) }
const columns = [{ id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Complaint'], required: true }, { id: 'c2', name: 'Cost', type: 'number' }]
const table = (id, name, prefix, rows = []) => JSON.stringify({ schema: 1, kind: 'on-demand-page', id, name, description: '', keyPrefix: prefix, columns, rows, insights: [] })
const row = (key, seq, category, cost) => ({ id: `r${seq}`, key, seq, addedBy: 'ana@example.com', addedAt: '2026-11-20T08:00:00.000Z', cells: { c1: category, c2: String(cost) } })
// A page kept as row files in its folder (OND-31); in the form before (on-demand/<id>/) with the marker of OND-32.
const rowPage = (stem, id, name, prefix, rows) => ({
  [`on-demand/${stem}/page.json`]: JSON.stringify({ schema: 1, kind: 'on-demand-page', id, name, description: '', keyPrefix: prefix, columns, rows: [], insights: [], storage: 'rows' }),
  [`on-demand/${stem}/counter.json`]: `${JSON.stringify({ schema: 1, kind: 'on-demand-counter', next: rows.length + 1 })}\n`,
  ...Object.fromEntries(rows.map((entry) => [`on-demand/${stem}/rows/${entry.key}.json`, `${JSON.stringify({ schema: 1, kind: 'on-demand-row', ...entry }, null, 1)}\n`])),
  ...(stem === id ? { [`on-demand/${id}.json`]: `${JSON.stringify({ schema: 1, kind: 'on-demand-moved', id, moved: `on-demand/${id}/` }, null, 1)}\n` } : {}),
})
const layout = (pages) => JSON.stringify({ schema: 1, kind: 'menu-layout', groups: {}, pages: Object.fromEntries(pages.map(([id, type], index) => [id, { type, group: 'on-demand', order: index + 1, icon: '▦', owners: [] }])) })
const pagePaths = (gh) => Object.keys(gh.files()).filter((path) => path.startsWith('on-demand/')).sort()

// One person: their browser on the shared repository. failing(): while true, this browser's saves of page files fail
// (as with no network) — reads, locks and other files go through.
async function person(gh, email, { failing = () => false } = {}) {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 }, ...(process.env.PAGE_FILE_SHOTS ? { deviceScaleFactor: 2 } : {}) })
  await context.addInitScript((work) => {
    localStorage.setItem('demand-planning-setup-guide-v1', 'dismissed')
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', work)
  }, email)
  await context.route('https://dev.azure.com/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await context.route('https://api.github.com/**', (route) => {
    const request = route.request()
    if (failing() && request.method() === 'PUT' && /\/contents\/on-demand\//.test(new URL(request.url()).pathname)) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Service unavailable"}' })
    return gh.route(route)
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const slowdown = Number(process.env.E2E_CPU_SLOWDOWN ?? 1)
  if (slowdown > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: slowdown })
  await page.goto(app.url)
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors }
}
const until = async (check, what) => { for (let i = 0; i < 400; i++) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 50)) } throw new Error(`Timed out waiting for ${what}`) }
const commitOf = (gh, ...paths) => gh.writes.find((write) => paths.every((path) => write.paths.includes(path)))
const pagesTable = (page) => page.locator('.pgb-pages')
async function renameInPagesMenu(page, from, to) {
  await pagesTable(page).getByRole('button', { name: `Edit page ${from}` }).click()
  const edit = page.getByRole('dialog', { name: 'Edit the page' })
  await edit.getByLabel('Page name', { exact: true }).fill(to)
  await edit.getByRole('button', { name: 'Save to Git' }).click()
  await edit.waitFor({ state: 'detached' })
}
const shots = process.env.PAGE_FILE_SHOTS
async function shoot(page, name) {
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.screenshot({ path: `${shots}/${name}.png` })
}
const owned = (errors) => errors.filter((entry) => !/401|Unauthorized/.test(entry))

test('TC-OND-129: a page added is saved as on-demand/<Name>--<id>.json; renamed, its file moves in one commit; a page of row files kept under its name renamed moves its folder', async () => {
  const gh = fakeGitHub({ files: { 'access.json': policy(), 'menu-layout.json': layout([['log', 'table']]), ...rowPage('Log--log', 'log', 'Log', 'LOG', [row('LOG-261120-K7Q2', 1, 'Scrap', 10), row('LOG-261121-M3P4', 2, 'Rework', 20)]) } })
  const owner = await person(gh, tool)
  await navigate(owner.page, 'Pages & reports')
  await pagesTable(owner.page).locator('tbody tr', { hasText: 'Log' }).waitFor()

  // ＋ Add page…: the page file is named after the page (and the note for older apps is written once, OND-121).
  await owner.page.getByRole('button', { name: '＋ Add page…' }).click()
  const add = owner.page.getByRole('dialog', { name: 'Add a page' })
  await add.getByRole('radio', { name: 'Table', exact: true }).check()
  await add.getByLabel('Page name', { exact: true }).fill('Supplier issues')
  await add.getByRole('button', { name: 'Add page' }).click()
  await add.waitFor({ state: 'detached' })
  await owner.page.locator('header.topbar h1', { hasText: 'Supplier issues' }).waitFor()
  await until(() => gh.read('on-demand/app-update-required.json') != null, 'the note for older apps')
  const created = JSON.parse(gh.read('on-demand/Supplier issues--supplier-issues.json'))
  assert.deepEqual([created.id, created.name], ['supplier-issues', 'Supplier issues'], 'the id stays inside the file')
  assert.equal(gh.read('on-demand/supplier-issues.json'), null)
  assert.match(JSON.parse(gh.read('on-demand/app-update-required.json')).note, /named after the page/)
  // The page's ⓘ names where it is kept.
  await owner.page.locator('.od-panel h2 .info-button').first().hover()
  assert.match(await text(owner.page.getByRole('tooltip')), /as on-demand\/Supplier issues--supplier-issues\.json the moment it is saved/)
  await owner.page.keyboard.press('Escape')

  // Renamed (Pages & menu → Edit): the file moves in the same commit — the old one deleted, the new one created.
  await navigate(owner.page, 'Pages & reports')
  await renameInPagesMenu(owner.page, 'Supplier issues', 'Supplier quality')
  await until(() => gh.read('on-demand/Supplier quality--supplier-issues.json') != null, 'the file moved')
  assert.equal(gh.read('on-demand/Supplier issues--supplier-issues.json'), null)
  const move = commitOf(gh, 'on-demand/Supplier issues--supplier-issues.json', 'on-demand/Supplier quality--supplier-issues.json')
  assert.ok(move, 'one commit holds the delete and the create')
  assert.match(move.message, /^Pages & menu: rename Supplier issues to Supplier quality/)
  assert.equal(JSON.parse(gh.read('on-demand/Supplier quality--supplier-issues.json')).id, 'supplier-issues')
  await owner.page.locator('.jobs-button').click()
  assert.match(await text(owner.page.getByRole('dialog', { name: 'Background jobs' }).locator('li.job', { hasText: 'Add page · Supplier issues' })), /Saved to Git\. on-demand\/Supplier issues--supplier-issues\.json/)
  assert.match(await text(owner.page.getByRole('dialog', { name: 'Background jobs' }).locator('li.job', { hasText: 'Rename page · Supplier issues' })), /Saved to Git\. on-demand\/Supplier quality--supplier-issues\.json/)
  await owner.page.mouse.move(0, 0)
  await shoot(owner.page, 'new-page-file-path')
  await owner.page.getByRole('dialog', { name: 'Background jobs' }).getByRole('button', { name: 'Close', exact: true }).click()

  // A page of row files renamed: the whole folder moves in one commit; the rows keep their keys and IDs.
  await renameInPagesMenu(owner.page, 'Log', 'Lab log')
  await until(() => gh.read('on-demand/Lab log--log/page.json') != null, 'the folder moved')
  assert.deepEqual(pagePaths(gh).filter((path) => path.includes('log')), ['on-demand/Lab log--log/counter.json', 'on-demand/Lab log--log/page.json', 'on-demand/Lab log--log/rows/LOG-261120-K7Q2.json', 'on-demand/Lab log--log/rows/LOG-261121-M3P4.json'])
  assert.ok(commitOf(gh, 'on-demand/Log--log/page.json', 'on-demand/Lab log--log/page.json', 'on-demand/Log--log/rows/LOG-261120-K7Q2.json', 'on-demand/Lab log--log/rows/LOG-261121-M3P4.json'), 'one commit')
  assert.equal(JSON.parse(gh.read('on-demand/Lab log--log/page.json')).name, 'Lab log')
  await pagesTable(owner.page).getByRole('button', { name: 'Open Lab log' }).click()
  await owner.page.locator('.od-panel table tbody tr', { hasText: 'LOG-0002' }).waitFor()
  assert.equal(await owner.page.locator('.od-panel table tbody tr').count(), 2)
  assert.deepEqual(owned(owner.errors), [])
  await owner.context.close()
})

test('TC-OND-133: CoNQ and the other pages of the form before keep their files — renamed, only the title in the file changes; a page of row files keeps its folder; nothing else is written', async () => {
  const gh = fakeGitHub({ files: {
    'access.json': policy(), 'menu-layout.json': layout([['conq', 'table-insights'], ['log', 'table']]),
    'on-demand/conq.json': table('conq', 'CoNQ', 'CONQ', [row('CONQ-261120-K7Q2', 1, 'Scrap', 300)]),
    ...rowPage('log', 'log', 'Log', 'LOG', [row('LOG-261120-K7Q2', 1, 'Rework', 20)]),
  } })
  const owner = await person(gh, tool)
  await navigate(owner.page, 'Pages & reports')
  await pagesTable(owner.page).locator('tbody tr', { hasText: 'Log' }).waitFor()
  assert.equal(await owner.page.getByRole('button', { name: 'Rename page files…' }).count(), 0, 'no one-time move')
  const before = pagePaths(gh)

  // CoNQ renamed: on-demand/conq.json keeps its name and id; the new title is inside.
  await renameInPagesMenu(owner.page, 'CoNQ', 'Cost of Non-Quality')
  await until(() => JSON.parse(gh.read('on-demand/conq.json')).name === 'Cost of Non-Quality', 'the title saved')
  assert.deepEqual(gh.writes.filter((write) => /^Pages & menu: rename CoNQ /.test(write.message)).map((write) => write.paths), [['on-demand/conq.json']], 'one file in one commit')
  assert.equal(JSON.parse(gh.read('on-demand/conq.json')).id, 'conq')
  // A page of row files of the form before: its folder stays, page.json holds the new title.
  await renameInPagesMenu(owner.page, 'Log', 'Lab log')
  await until(() => JSON.parse(gh.read('on-demand/log/page.json')).name === 'Lab log', 'the title saved')
  assert.deepEqual(pagePaths(gh), before, 'no file added, moved or removed; no note for older apps')
  await owner.page.locator('.jobs-button').click()
  assert.match(await text(owner.page.getByRole('dialog', { name: 'Background jobs' }).locator('li.job', { hasText: 'Rename page · CoNQ' })), /Saved to Git\. on-demand\/conq\.json/)
  await owner.page.mouse.move(0, 0)
  await shoot(owner.page, 'existing-page-kept')
  await owner.page.getByRole('dialog', { name: 'Background jobs' }).getByRole('button', { name: 'Close', exact: true }).click()
  // Both open as before, from their files.
  await pagesTable(owner.page).getByRole('button', { name: 'Open Cost of Non-Quality' }).click()
  await owner.page.locator('.od-panel table tbody tr', { hasText: 'CONQ-0001' }).waitFor()
  assert.deepEqual(owned(owner.errors), [])
  await owner.context.close()
})

test('TC-OND-131: a second browser with a page of row files open — editing a row, its save failed — saves into the folder the Tool Owner renamed meanwhile, keeps its lock, and shows the new name', async () => {
  let offline = false
  const gh = fakeGitHub({ files: { 'access.json': policy(), 'menu-layout.json': layout([['conq', 'table']]), ...rowPage('CoNQ--conq', 'conq', 'CoNQ', 'CONQ', [row('CONQ-261120-K7Q2', 1, 'Scrap', 300), row('CONQ-261121-M3P4', 2, 'Rework', 1200)]) } })
  const b = await person(gh, ben, { failing: () => offline })
  await navigate(b.page, 'CoNQ')
  await b.page.locator('.od-panel table tbody tr', { hasText: 'CONQ-0002' }).waitFor()
  // Ben edits CONQ-0001 (the row's lock is his, kept by the page id) and saves while his saves fail.
  await b.page.locator('.od-panel table tbody tr', { hasText: 'CONQ-0001' }).getByRole('button', { name: /^Edit row/ }).click()
  const drawer = b.page.locator('aside.drawer[role="dialog"]')
  await drawer.getByLabel('Cost', { exact: true }).fill('450')
  assert.equal(JSON.parse(gh.read('locks/conq/CONQ-261120-K7Q2.json', 'locks')).by, ben)
  offline = true
  await drawer.getByRole('button', { name: 'Save to Git' }).click()
  await drawer.locator('.drawer-error').waitFor()

  // Meanwhile the Tool Owner renames CoNQ: the folder moves.
  const owner = await person(gh, tool)
  await navigate(owner.page, 'Pages & reports')
  await renameInPagesMenu(owner.page, 'CoNQ', 'Cost of quality')
  await until(() => gh.read('on-demand/Cost of quality--conq/page.json') != null, 'the folder moved')
  assert.equal(gh.read('on-demand/CoNQ--conq/page.json'), null)
  assert.equal(JSON.parse(gh.read('locks/conq/CONQ-261120-K7Q2.json', 'locks')).by, ben, 'the lock is the page id\'s: untouched by the rename')

  // Ben is back online: Retry saves his change into the renamed folder — nothing under the old name — and his page
  // shows the new name; his lock is released.
  offline = false
  await drawer.locator('.drawer-error').getByRole('button', { name: 'Retry' }).click()
  await drawer.locator('.drawer-error').waitFor({ state: 'detached' })
  await until(() => JSON.parse(gh.read('on-demand/Cost of quality--conq/rows/CONQ-261120-K7Q2.json')).cells.c2 === '450', 'the change in the renamed folder')
  assert.deepEqual(pagePaths(gh).filter((path) => path.includes('CoNQ--')), [], 'nothing written under the old name')
  await until(() => gh.read('locks/conq/CONQ-261120-K7Q2.json', 'locks') === null, 'the lock released after the save')
  await b.page.keyboard.press('Escape')
  await b.page.locator('header.topbar h1', { hasText: 'Cost of quality' }).waitFor()
  assert.equal(JSON.parse(gh.read('on-demand/Cost of quality--conq/page.json')).name, 'Cost of quality')
  assert.deepEqual(owned(b.errors), [])
  assert.deepEqual(owned(owner.errors), [])
  await b.context.close()
  await owner.context.close()
})

test('TC-OND-136: a page with two copies in Git — the notice names them; Delete older copy… (Tool Owner only) lists what is deleted and what stays, deletes the older one in one commit, and the notice goes', async () => {
  const gh = fakeGitHub({ files: { 'access.json': policy(), 'menu-layout.json': layout([['conq', 'table']]), 'on-demand/CoNQ--conq.json': table('conq', 'CoNQ', 'CONQ', [row('CONQ-261120-K7Q2', 1, 'Scrap', 300)]) } })
  // An app of the version before wrote the page again under its id: that copy is the newer one now.
  gh.put('on-demand/conq.json', table('conq', 'CoNQ', 'CONQ', [row('CONQ-261120-K7Q2', 1, 'Scrap', 300), row('CONQ-261121-M3P4', 2, 'Rework', 1200)]), 'main', 'written by an older app')
  // Someone without the role: the notice, the button disabled with the reason.
  const b = await person(gh, ben)
  await navigate(b.page, 'Pages & reports')
  const bNotice = b.page.locator('.od-file-copies')
  await bNotice.waitFor()
  assert.equal(await bNotice.getByRole('button', { name: 'Delete older copy…' }).isDisabled(), true)
  assert.match(await text(bNotice.locator('.write-blocked')), /Only a Tool Owner .* deletes an older copy/)
  await b.context.close()

  const owner = await person(gh, tool)
  await navigate(owner.page, 'Pages & reports')
  const notice = owner.page.locator('.od-file-copies')
  await notice.waitFor()
  assert.match(await text(notice), /CoNQ has 2 copies of its file in Git: on-demand\/conq\.json \(newer, read and saved to\) and on-demand\/CoNQ--conq\.json/)
  await notice.getByRole('button', { name: 'Delete older copy…' }).click()
  const dialog = owner.page.getByRole('dialog', { name: 'Delete the older copy' })
  assert.match(await text(dialog), /Deleted on-demand\/CoNQ--conq\.json Stays on-demand\/conq\.json — the newer \(latest commit\), read and saved to/)
  const before = gh.writes.length
  await owner.page.mouse.move(0, 0)
  await shoot(owner.page, 'delete-older-copy-confirmation')
  await dialog.getByRole('button', { name: 'Delete older copy' }).click()
  await dialog.waitFor({ state: 'detached' })
  await notice.waitFor({ state: 'detached' })
  assert.equal(gh.writes.length, before + 1, 'one commit')
  assert.match(gh.writes.at(-1).message, /^Pages & menu: delete the older copy of CoNQ \(on-demand\/CoNQ--conq\.json\)/)
  assert.deepEqual(pagePaths(gh), ['on-demand/conq.json'], 'the newer copy stays')
  // The page reads from the copy that stays.
  await pagesTable(owner.page).getByRole('button', { name: 'Open CoNQ' }).click()
  await owner.page.locator('.od-panel table tbody tr', { hasText: 'CONQ-0002' }).waitFor()
  assert.equal(await owner.page.locator('.od-file-copies').count(), 0)
  assert.deepEqual(owned(owner.errors), [])
  await owner.context.close()
})

test('TC-OND-137: a Dashboard page added keeps its blocks in dashboards/<Name>--<id>.json, moved with the page on rename; a Dashboard page from before keeps dashboards/<id>.json', async () => {
  const blocks = (id) => JSON.stringify({ schema: 1, kind: 'dashboard', id, tabs: [], filters: [], blocks: [{ id: 'b1', title: 'Issues', type: 'kpi', source: 'page:issues', measure: 'count', sort: 'value' }] })
  const gh = fakeGitHub({ files: {
    'access.json': policy(), 'menu-layout.json': layout([['issues', 'table'], ['board', 'dashboard']]),
    'on-demand/issues.json': table('issues', 'Issues', 'ISS', [row('ISS-261120-K7Q2', 1, 'Scrap', 10), row('ISS-261121-M3P4', 2, 'Rework', 20)]),
    'on-demand/board.json': JSON.stringify({ schema: 1, kind: 'on-demand-page', id: 'board', name: 'Board', description: '', keyPrefix: 'BOARD', columns: [], rows: [], insights: [] }), 'dashboards/board.json': blocks('board'),
  } })
  const owner = await person(gh, tool)
  await navigate(owner.page, 'Pages & reports')
  await pagesTable(owner.page).locator('tbody tr', { hasText: 'Issues' }).waitFor()
  // A new Dashboard page: its first block creates dashboards/<Name>--<id>.json.
  await owner.page.getByRole('button', { name: '＋ Add page…' }).click()
  const add = owner.page.getByRole('dialog', { name: 'Add a page' })
  await add.getByRole('radio', { name: 'On-Demand Dashboard' }).check()
  await add.getByLabel('Page name', { exact: true }).fill('Quality wall')
  await add.getByRole('button', { name: 'Add page' }).click()
  await add.waitFor({ state: 'detached' })
  await owner.page.locator('.empty-state', { hasText: 'No blocks yet.' }).waitFor()
  await owner.page.getByRole('button', { name: '＋ Add block…' }).click()
  const dialog = owner.page.getByRole('dialog', { name: 'Add a block' })
  await dialog.getByLabel('Title').fill('Issues')
  await dialog.getByLabel('Data source').selectOption({ label: 'Issues (table page)' })
  await dialog.locator('.od-insight-preview .metric-grid article').waitFor()
  await dialog.getByRole('button', { name: 'Add block' }).click()
  await dialog.waitFor({ state: 'detached' })
  await until(() => gh.read('dashboards/Quality wall--quality-wall.json') != null, 'the blocks saved under the page name')
  assert.ok(gh.read('on-demand/Quality wall--quality-wall.json'))
  assert.equal(gh.read('dashboards/quality-wall.json'), null)
  // Renamed: the page file and the blocks file move in the same commit.
  await navigate(owner.page, 'Pages & reports')
  await renameInPagesMenu(owner.page, 'Quality wall', 'Quality board')
  await until(() => gh.read('dashboards/Quality board--quality-wall.json') != null, 'the blocks moved')
  assert.ok(commitOf(gh, 'on-demand/Quality wall--quality-wall.json', 'on-demand/Quality board--quality-wall.json', 'dashboards/Quality wall--quality-wall.json', 'dashboards/Quality board--quality-wall.json'), 'one commit')
  assert.equal(gh.read('dashboards/Quality wall--quality-wall.json'), null)
  // The Dashboard page from before: renamed, both files stay where they are.
  await renameInPagesMenu(owner.page, 'Board', 'Team board')
  await until(() => JSON.parse(gh.read('on-demand/board.json')).name === 'Team board', 'the title saved')
  assert.equal(gh.read('dashboards/board.json'), blocks('board'))
  assert.deepEqual(Object.keys(gh.files()).filter((path) => path.startsWith('dashboards/')).sort(), ['dashboards/Quality board--quality-wall.json', 'dashboards/board.json'])
  // Both open with their blocks.
  await pagesTable(owner.page).getByRole('button', { name: 'Open Quality board' }).click()
  await owner.page.locator('.metric-grid article', { hasText: 'Issues' }).first().waitFor()
  await navigate(owner.page, 'Pages & reports')
  await pagesTable(owner.page).getByRole('button', { name: 'Open Team board' }).click()
  await owner.page.locator('.metric-grid article', { hasText: 'Issues' }).first().waitFor()
  assert.deepEqual(owned(owner.errors), [])
  await owner.context.close()
})
