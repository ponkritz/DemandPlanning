import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { menuOf, navigate, startApp, text } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'
import { serializeLock } from '../src/rowLocks.ts'

// Row files and row locks (OND-31…OND-38) with two (and more) people at once, against one mocked GitHub that keeps
// branches, trees, blobs and refs (e2e/fakeGitHub.mjs): the Tool Owner sets a short timeout and converts CoNQ; Anna edits
// a row — Ben sees "Being edited by" and Edit disabled; Ben and the Tool Owner add rows at the same moment and get
// distinct IDs; Anna's edit times out (the browser's clock moved on, no waiting), is kept as a draft and restored over the
// row as changed meanwhile; a page co-owner releases a stuck lock (TC-OND-33, UAT). Hide / Delete (TC-PGB-15) and pages
// added by someone else appearing without a reload (TC-GIT-13). ROW_LOCK_SHOTS=<folder> saves the screenshots.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const tool = 'tool.owner@example.com', anna = 'anna@example.com', ben = 'ben@example.com', cleo = 'cleo@example.com', lead = 'group.lead@example.com'
const policy = () => { const value = defaultPolicy(); value.defaultRole = 'Team Member'; value.members = { [tool]: ['Tool Owner'], [anna]: ['Admin'], [ben]: ['Admin'], [cleo]: ['Team Member'], [lead]: ['Team Member'] }; return serializeAccess(value) }
const conq = () => JSON.stringify({
  schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ', description: 'Cost of Non-Quality', keyPrefix: 'CONQ',
  columns: [{ id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Complaint'], required: true }, { id: 'c2', name: 'Cost', type: 'currency', currency: 'EUR' }],
  rows: [
    { id: 'r1', key: 'CONQ-261120-K7Q2', seq: 1, addedBy: 'ana@example.com', addedAt: '2026-11-20T08:00:00.000Z', log: [{ id: 'l1', at: '2026-11-20T08:00:00.000Z', by: 'ana@example.com', added: true, changes: [] }], cells: { c1: 'Scrap', c2: '300 EUR' } },
    { id: 'r2', key: 'CONQ-261121-M3P4', seq: 2, addedBy: 'ben@example.com', addedAt: '2026-11-21T09:30:00.000Z', cells: { c1: 'Rework', c2: '1200 EUR' } },
  ],
  insights: [{ id: 'i1', title: 'Cost by category', type: 'bar', category: 'c1', measure: 'sum', value: 'c2', sort: 'value' }],
})
const layout = (extra = {}) => JSON.stringify({ schema: 1, kind: 'menu-layout', groups: { 'g-quality': { name: 'Quality', order: 1, acceptsPages: true, owners: [lead] } }, pages: { conq: { type: 'table-insights', group: 'on-demand', order: 1, icon: '▦', owners: [cleo] }, 'supplier-issues': { type: 'table', group: 'g-quality', order: 1, icon: '▦', owners: [] }, ...extra } })
const supplier = () => JSON.stringify({ schema: 1, kind: 'on-demand-page', id: 'supplier-issues', name: 'Supplier issues', description: '', keyPrefix: 'SUPPLIER', columns: [{ id: 'c1', name: 'Issue', type: 'text' }], rows: [{ id: 'r1', key: 'SUPPLIER-261120-K7Q2', seq: 1, cells: { c1: 'Late delivery' } }] })
const repository = () => fakeGitHub({ files: { 'access.json': policy(), 'menu-layout.json': layout(), 'on-demand/conq.json': conq(), 'on-demand/supplier-issues.json': supplier() } })

// One person: their browser (own storage, own clock) on the shared repository.
async function person(gh, email, { width = 1300, height = 1000 } = {}) {
  const context = await app.browser.newContext({ viewport: { width, height } })
  await context.clock.install()
  await context.addInitScript((work) => {
    localStorage.setItem('demand-planning-setup-guide-v1', 'dismissed')
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', work)
  }, email)
  await context.route('https://dev.azure.com/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await context.route('https://api.github.com/**', gh.route)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const slowdown = Number(process.env.E2E_CPU_SLOWDOWN ?? 1)
  if (slowdown > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: slowdown })
  await page.goto(app.url)
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors }
}
const openConq = async (page) => { await navigate(page, 'CoNQ'); await page.locator('.od-panel table tbody tr', { hasText: 'CONQ-0002' }).waitFor() }
const drawerOf = (page) => page.locator('aside.drawer[role="dialog"]')
const rowOf = (page, id) => page.locator('.od-panel table tbody tr', { hasText: id })
const until = async (check, what) => { for (let i = 0; i < 300; i++) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 50)) } throw new Error(`Timed out waiting for ${what}`) }
// The open-app check (GIT-18) runs every 5 minutes: the browser's clock is moved on until the menu shows what is expected.
async function checkUntil(page, locator, state = 'visible') {
  for (let i = 0; i < 6; i++) {
    await page.clock.fastForward('05:01')
    if (await locator.waitFor({ state, timeout: 3000 }).then(() => true, () => false)) return
  }
  throw new Error(`The menu never showed the change (${state})`)
}
const shots = process.env.ROW_LOCK_SHOTS
async function shoot(page, name, locator = null) {
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  const size = page.viewportSize()
  for (const [width, label] of [[1440, '1440'], [390, '390']]) {
    await page.setViewportSize({ width, height: 900 })
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await (locator ?? page.locator('body')).first().waitFor()
      await page.screenshot({ path: `${shots}/${name}-${label}-${scheme}.png` })
    }
  }
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' })
  await page.setViewportSize(size)
}

test('TC-OND-33: two people on a page of row files — convert as Tool Owner, a row lock with "Being edited by", rows added at the same moment with distinct IDs, the timeout keeping a draft that is restored, and a page co-owner releasing a stuck lock', async () => {
  const gh = repository()
  // The Tool Owner: the timeout to 1 minute (Admin → Pages & menu), then CoNQ converted to row files.
  const owner = await person(gh, tool)
  await navigate(owner.page, 'Pages & menu')
  await owner.page.locator('.pgb-row-locks').getByRole('button', { name: 'Change…' }).click()
  const timeoutDialog = owner.page.getByRole('dialog', { name: 'Row lock timeout' })
  await timeoutDialog.getByLabel('Inactivity timeout (minutes)').fill('1')
  await timeoutDialog.getByRole('button', { name: 'Save to Git' }).click()
  await timeoutDialog.waitFor({ state: 'detached' })
  assert.equal(JSON.parse(gh.read('row-locks.json')).timeoutMinutes, 1)
  await openConq(owner.page)
  await (await menuOf(owner.page, 'page CoNQ')).getByRole('menuitem', { name: 'Convert to row files…' }).click()
  const convert = owner.page.getByRole('dialog', { name: 'Convert to row files' })
  assert.match(await text(convert), /Convert CoNQ with its 2 rows from the single file on-demand\/conq\.json to one file per row in on-demand\/conq\//)
  await shoot(owner.page, 'convert-popup', convert)
  await convert.getByRole('button', { name: 'Convert 2 rows' }).click()
  await convert.waitFor({ state: 'detached' })
  assert.ok(gh.read('on-demand/conq/page.json'))
  assert.deepEqual(JSON.parse(gh.read('on-demand/conq/rows/CONQ-261120-K7Q2.json')).cells, { c1: 'Scrap', c2: '300 EUR' })
  assert.equal(JSON.parse(gh.read('on-demand/conq.json')).kind, 'on-demand-moved')
  const after = await menuOf(owner.page, 'page CoNQ')
  assert.equal(await after.getByRole('menuitem', { name: 'Convert to row files…' }).count(), 0)
  await owner.page.keyboard.press('Escape')
  // The Insights still read the rows.
  await owner.page.getByRole('tab', { name: /Insights/ }).click()
  await owner.page.locator('.panel', { hasText: 'Cost by category' }).first().waitFor()
  assert.match(await text(owner.page.locator('.panel', { hasText: 'Cost by category' }).first()), /Rework/)
  await owner.page.getByRole('tab', { name: /Data/ }).click()

  // Anna edits CONQ-0001: the lock is taken on the branch `locks`.
  const a = await person(gh, anna)
  await openConq(a.page)
  await rowOf(a.page, 'CONQ-0001').getByRole('button', { name: /^Edit row/ }).click()
  await drawerOf(a.page).getByLabel('Cost', { exact: true }).waitFor()
  assert.equal(JSON.parse(gh.read('locks/conq/CONQ-261120-K7Q2.json', 'locks')).by, anna)
  assert.equal(gh.read('locks/conq/CONQ-261120-K7Q2.json'), null, 'not on the data branch')

  // Ben: the row says who is editing; Edit and Hide row disabled with the reason; no Release lock for him.
  const b = await person(gh, ben)
  await openConq(b.page)
  await rowOf(b.page, 'CONQ-0001').locator('.od-lock').waitFor()
  assert.match(await text(rowOf(b.page, 'CONQ-0001')), /✎ anna/)
  await rowOf(b.page, 'CONQ-0001').locator('td').nth(2).click()
  const bDrawer = drawerOf(b.page)
  await bDrawer.locator('.od-lock-note').waitFor()
  assert.match(await text(bDrawer.locator('.od-lock-note')), /^Being edited by anna@example\.com since /)
  assert.equal(await bDrawer.getByRole('button', { name: 'Edit', exact: true }).isDisabled(), true)
  assert.equal(await bDrawer.getByRole('button', { name: 'Hide row' }).isDisabled(), true)
  assert.match(await text(bDrawer.locator('.write-blocked')), /anna@example\.com is editing CONQ-0001 since .*You can view it; Edit is free again when they save or cancel, or 1 minute after their last activity\./)
  assert.equal(await bDrawer.getByRole('button', { name: 'Release lock' }).count(), 0)
  await shoot(b.page, 'being-edited', bDrawer)
  await b.page.keyboard.press('Escape')
  await bDrawer.waitFor({ state: 'detached' })

  // Ben and the Tool Owner add a row at the same moment (no lock): two row files with distinct IDs.
  const add = async (page, category) => {
    await page.getByRole('button', { name: '＋ Add row' }).click()
    const drawer = drawerOf(page)
    await drawer.getByLabel('Category', { exact: true }).selectOption(category)
    return drawer
  }
  const [bAdd, oAdd] = [await add(b.page, 'Complaint'), await add(owner.page, 'Rework')]
  await Promise.all([bAdd.getByRole('button', { name: 'Save to Git' }).click(), oAdd.getByRole('button', { name: 'Save to Git' }).click()])
  await until(async () => Object.keys(gh.files()).filter((path) => path.startsWith('on-demand/conq/rows/')).length === 4, 'the two new row files')
  const seqs = Object.keys(gh.files()).filter((path) => path.startsWith('on-demand/conq/rows/')).map((path) => JSON.parse(gh.read(path)).seq).sort()
  assert.deepEqual(seqs, [1, 2, 3, 4])
  await b.page.getByRole('dialog', { name: /^CONQ-000[34]$/ }).waitFor()
  await owner.page.getByRole('dialog', { name: /^CONQ-000[34]$/ }).waitFor()
  assert.notEqual(await text(b.page.locator('aside.drawer h2')), await text(owner.page.locator('aside.drawer h2')))

  // Anna types a cost, then nothing: her clock moves on — the warning, then the edit closes and the draft is kept.
  await drawerOf(a.page).getByLabel('Cost', { exact: true }).fill('999')
  await a.page.clock.fastForward(35_000)
  const warning = drawerOf(a.page).locator('.od-timeout')
  await warning.waitFor()
  assert.match(await text(warning), /No activity: your changes to CONQ-0001 will be discarded in 0:\d\d .*Keep editing/)
  assert.equal(await warning.getAttribute('role'), 'status', 'a polite live region')
  await shoot(a.page, 'timeout-warning', warning)
  await warning.getByRole('button', { name: 'Keep editing' }).click()
  await warning.waitFor({ state: 'detached' })
  await a.page.clock.fastForward(35_000)
  await warning.waitFor()
  await a.page.clock.fastForward(30_000)
  await drawerOf(a.page).locator('.od-timeout-note').waitFor()
  assert.match(await text(drawerOf(a.page).locator('.od-timeout-note')), /Your edit of CONQ-0001 was closed after 1 minute without activity.*kept in this browser as a draft for one day/)
  await until(async () => gh.read('locks/conq/CONQ-261120-K7Q2.json', 'locks') === null, 'the lock released')
  assert.equal(JSON.parse(gh.read('on-demand/conq/rows/CONQ-261120-K7Q2.json')).cells.c2, '300 EUR', 'nothing was saved')

  // Someone changes the row's category meanwhile; Anna's next Edit reads it and offers her draft, naming the change.
  const row = JSON.parse(gh.read('on-demand/conq/rows/CONQ-261120-K7Q2.json'))
  gh.put('on-demand/conq/rows/CONQ-261120-K7Q2.json', `${JSON.stringify({ ...row, cells: { ...row.cells, c1: 'Complaint' } }, null, 1)}\n`)
  await drawerOf(a.page).getByRole('button', { name: 'Edit', exact: true }).click()
  const offer = drawerOf(a.page).locator('.od-draft')
  await offer.waitFor()
  assert.match(await text(offer), /Restore your draft from .*\? It holds your unsaved change to “Cost”\. Changed in Git since that edit started: Category: Scrap → Complaint/)
  await shoot(a.page, 'draft-restore', offer)
  await offer.getByRole('button', { name: 'Restore draft' }).click()
  assert.equal(await drawerOf(a.page).getByLabel('Cost', { exact: true }).inputValue(), '999')
  assert.equal(await drawerOf(a.page).getByLabel('Category', { exact: true }).inputValue(), 'Complaint')
  await drawerOf(a.page).getByRole('button', { name: 'Save to Git' }).click()
  await drawerOf(a.page).locator('.od-row-values').waitFor()
  assert.deepEqual(JSON.parse(gh.read('on-demand/conq/rows/CONQ-261120-K7Q2.json')).cells, { c1: 'Complaint', c2: '999 EUR' })
  await until(async () => gh.read('locks/conq/CONQ-261120-K7Q2.json', 'locks') === null, 'the lock released after the save')
  assert.equal(await a.page.evaluate(() => JSON.parse(localStorage.getItem('demand-planning-row-drafts-v1') ?? '[]').length), 0, 'the draft is gone once restored')

  // A stuck lock (someone left without saving) on CONQ-0002: Cleo, a co-owner of the page, releases it.
  gh.put('locks/conq/CONQ-261121-M3P4.json', serializeLock({ by: 'dave@example.com', name: 'dave@example.com', at: new Date().toISOString(), expires: new Date(Date.now() + 3600_000).toISOString(), session: 'x' }), 'locks')
  const c = await person(gh, cleo)
  await openConq(c.page)
  await rowOf(c.page, 'CONQ-0002').locator('td').nth(2).click()
  const cDrawer = drawerOf(c.page)
  await cDrawer.locator('.od-lock-note').waitFor()
  assert.equal(await cDrawer.getByRole('button', { name: 'Edit', exact: true }).isDisabled(), true)
  await cDrawer.getByRole('button', { name: 'Release lock' }).click()
  const release = c.page.getByRole('dialog', { name: 'Release the lock' })
  assert.match(await text(release), /Release the lock of CONQ-0002 held by dave@example\.com since /)
  await release.getByRole('button', { name: 'Release lock' }).click()
  await release.waitFor({ state: 'detached' })
  await until(async () => gh.read('locks/conq/CONQ-261121-M3P4.json', 'locks') === null, 'the stuck lock released')
  await cDrawer.locator('.od-lock-note').waitFor({ state: 'detached' })
  assert.equal(await cDrawer.getByRole('button', { name: 'Edit', exact: true }).isDisabled(), false)
  for (const who of [owner, a, b, c]) { assert.deepEqual(who.errors, []); await who.context.close() }
})

test('TC-PGB-15: a group co-owner hides and shows a page but cannot delete it; the Tool Owner deletes one', async () => {
  const gh = repository()
  const l = await person(gh, lead)
  await navigate(l.page, 'Supplier issues')
  await l.page.locator('.od-panel table tbody tr', { hasText: 'Late delivery' }).waitFor()
  const leadMenu = await menuOf(l.page, 'page Supplier issues')
  assert.equal(await leadMenu.getByRole('menuitem', { name: 'Delete page…' }).isDisabled(), true)
  assert.match(await leadMenu.getByRole('menuitem', { name: 'Delete page…' }).getAttribute('title'), /Only a Tool Owner .* can delete a page\. Hide it instead/)
  await leadMenu.getByRole('menuitem', { name: 'Hide page' }).click()
  await l.page.locator('.od-hidden-note').waitFor()
  assert.equal(JSON.parse(gh.read('menu-layout.json')).pages['supplier-issues'].hidden, true)
  assert.equal(await l.page.locator('.sidebar nav button', { hasText: 'Supplier issues' }).count(), 0, 'gone from the menu')
  assert.ok(gh.read('on-demand/supplier-issues.json'), 'its data stays in Git')
  await l.page.locator('.od-hidden-note').getByRole('button', { name: 'Show page' }).click()
  await l.page.locator('.sidebar nav button', { hasText: 'Supplier issues' }).waitFor()
  assert.equal(JSON.parse(gh.read('menu-layout.json')).pages['supplier-issues'].hidden, undefined)
  // The Tool Owner deletes it (the pop-up names its rows and columns).
  const owner = await person(gh, tool)
  await navigate(owner.page, 'Supplier issues')
  await (await menuOf(owner.page, 'page Supplier issues')).getByRole('menuitem', { name: 'Delete page…' }).click()
  const dialog = owner.page.getByRole('dialog', { name: 'Delete the page' })
  assert.match(await text(dialog), /Delete Supplier issues with its 1 row and 1 column, for everyone\?/)
  await dialog.getByRole('button', { name: 'Delete page and 1 row' }).click()
  await dialog.waitFor({ state: 'detached' })
  await until(async () => gh.read('on-demand/supplier-issues.json') === null, 'the page file deleted')
  for (const who of [l, owner]) { assert.deepEqual(who.errors, []); await who.context.close() }
})

test('TC-GIT-13: a page someone else adds appears in the menu without a reload, and leaves it when they delete it', async () => {
  const gh = repository()
  const b = await person(gh, ben)
  await b.page.locator('.sidebar nav button', { hasText: 'Supplier issues' }).first().waitFor()
  await b.page.locator('.sidebar nav button', { hasText: 'CoNQ' }).first().waitFor()
  assert.equal(await b.page.locator('.sidebar nav button', { hasText: 'Audits' }).count(), 0)
  // Another person's commits: the page's file, then its place in the menu.
  gh.put('on-demand/audits.json', JSON.stringify({ schema: 1, kind: 'on-demand-page', id: 'audits', name: 'Audits', description: '', keyPrefix: 'AUDITS', columns: [], rows: [] }))
  gh.put('menu-layout.json', layout({ audits: { type: 'table', group: 'g-quality', order: 2, icon: '▦', owners: [] } }))
  // The open-app check (every 5 minutes) — the browser's clock moved on, no waiting.
  await checkUntil(b.page, b.page.locator('.sidebar nav button', { hasText: 'Audits' }))
  assert.equal(await b.page.locator('.page-git-notice').count(), 0, 'quietly, no notice')
  gh.put('on-demand/audits.json', null)
  gh.put('menu-layout.json', layout())
  await checkUntil(b.page, b.page.locator('.sidebar nav button', { hasText: 'Audits' }), 'detached')
  assert.deepEqual(b.errors, [])
  await b.context.close()
})

test('TC-OND-34: an editor hides a row — it leaves the table and the chart for everyone and comes back with Show row; the Tool Owner deletes a hidden row and its number is not given again', async () => {
  const gh = repository()
  const b = await person(gh, ben)
  await openConq(b.page)
  await rowOf(b.page, 'CONQ-0002').getByRole('button', { name: /^Hide row/ }).click()
  await rowOf(b.page, 'CONQ-0002').waitFor({ state: 'detached' })
  await until(async () => JSON.parse(gh.read('on-demand/conq.json')).rows.find((row) => row.id === 'r2').hidden?.by === ben, 'the row hidden in Git')
  const saved = JSON.parse(gh.read('on-demand/conq.json')).rows.find((row) => row.id === 'r2')
  assert.equal(saved.seq, 2, 'the row and its ID stay')
  assert.equal(saved.log.at(-1).action, 'hidden')
  // The chart leaves it out.
  await b.page.getByRole('tab', { name: /Insights/ }).click()
  const chart = b.page.locator('.panel', { hasText: 'Cost by category' }).first()
  await chart.waitFor()
  assert.doesNotMatch(await text(chart), /Rework/)
  await b.page.getByRole('tab', { name: /Data/ }).click()
  // Show hidden rows (1): listed greyed with its Hidden mark; Show row brings it back, to the chart too.
  await b.page.getByLabel('Show hidden rows (1)').check()
  await rowOf(b.page, 'CONQ-0002').waitFor()
  assert.match(await text(rowOf(b.page, 'CONQ-0002')), /Hidden/)
  assert.match(await rowOf(b.page, 'CONQ-0002').getAttribute('class'), /od-row-hidden/)
  await rowOf(b.page, 'CONQ-0002').locator('td').nth(2).click()
  const drawer = drawerOf(b.page)
  assert.match(await text(drawer.locator('.od-hidden-row')), /^Hidden by ben@example\.com on /)
  assert.equal(await drawer.getByRole('button', { name: 'Delete row…' }).count(), 0, 'no delete for an Admin')
  await drawer.getByRole('button', { name: 'Show row' }).click()
  await drawer.locator('.od-hidden-row').waitFor({ state: 'detached' })
  assert.match(await text(drawer.locator('.od-history ol > li').first()), /^Shown again · /)
  await b.page.keyboard.press('Escape')
  await b.page.getByRole('tab', { name: /Insights/ }).click()
  await until(async () => /Rework/.test(await text(chart)), 'the row back in the chart')
  assert.equal(JSON.parse(gh.read('on-demand/conq.json')).rows.find((row) => row.id === 'r2').hidden, undefined)

  // The Tool Owner hides CONQ-0002 and deletes it; the next row gets CONQ-0003, not CONQ-0002 again.
  const owner = await person(gh, tool)
  await openConq(owner.page)
  await rowOf(owner.page, 'CONQ-0002').getByRole('button', { name: /^Hide row/ }).click()
  await rowOf(owner.page, 'CONQ-0002').waitFor({ state: 'detached' })
  await owner.page.getByLabel('Show hidden rows (1)').check()
  await rowOf(owner.page, 'CONQ-0002').locator('td').nth(2).click()
  await drawerOf(owner.page).getByRole('button', { name: 'Delete row…' }).click()
  const dialog = owner.page.getByRole('dialog', { name: 'Delete the row' })
  assert.match(await text(dialog), /Delete CONQ-0002 .*for good, for everyone\? .*its number CONQ-0002 is never given again/)
  await dialog.getByRole('button', { name: 'Delete CONQ-0002' }).click()
  await dialog.waitFor({ state: 'detached' })
  await until(async () => !JSON.parse(gh.read('on-demand/conq.json')).rows.some((row) => row.id === 'r2'), 'the row deleted')
  await owner.page.getByRole('button', { name: '＋ Add row' }).click()
  await drawerOf(owner.page).getByLabel('Category', { exact: true }).selectOption('Scrap')
  await drawerOf(owner.page).getByRole('button', { name: 'Save to Git' }).click()
  await owner.page.getByRole('dialog', { name: 'CONQ-0003' }).waitFor()
  for (const who of [b, owner]) { assert.deepEqual(who.errors, []); await who.context.close() }
})

test('TC-OND-50: a large page in one file — the Tool Owner is offered Convert to row files on the page and can dismiss it for that page; others see nothing', async () => {
  const big = JSON.parse(conq())
  big.rows = Array.from({ length: 501 }, (_, index) => ({ id: `r${index + 1}`, key: `CONQ-261120-${String(index + 1).padStart(4, '0').replace(/0/g, 'Z')}`, seq: index + 1, cells: { c1: 'Scrap', c2: `${index} EUR` } }))
  const gh = fakeGitHub({ files: { 'access.json': policy(), 'menu-layout.json': layout(), 'on-demand/conq.json': JSON.stringify(big), 'on-demand/supplier-issues.json': supplier() } })
  const owner = await person(gh, tool)
  await openConq(owner.page)
  const hint = owner.page.locator('.od-convert-hint')
  await hint.waitFor()
  assert.equal(await text(hint), 'This page has 501 rows; converting it to row files keeps it fast and lets several people edit at once. Convert to row files… Dismiss')
  // The button opens the existing pop-up (OND-32); Cancel leaves the page as it is.
  await hint.getByRole('button', { name: 'Convert to row files…' }).click()
  const convert = owner.page.getByRole('dialog', { name: 'Convert to row files' })
  await convert.getByRole('button', { name: 'Convert 501 rows' }).waitFor()
  await convert.getByRole('button', { name: 'Cancel' }).click()
  await convert.waitFor({ state: 'detached' })
  assert.equal(JSON.parse(gh.read('on-demand/conq.json')).rows.length, 501, 'nothing converted')
  // A small page: no suggestion.
  await navigate(owner.page, 'Supplier issues')
  await owner.page.locator('.od-panel table tbody tr', { hasText: 'Late delivery' }).waitFor()
  assert.equal(await owner.page.locator('.od-convert-hint').count(), 0)
  // Dismissed for CoNQ: gone, also after a reload.
  await openConq(owner.page)
  await hint.getByRole('button', { name: 'Dismiss' }).click()
  await hint.waitFor({ state: 'detached' })
  await owner.page.reload()
  await openConq(owner.page)
  assert.equal(await hint.count(), 0, 'dismissed per page and person')
  // Anna (Admin: sets pages up, but cannot convert) sees nothing.
  const a = await person(gh, anna)
  await openConq(a.page)
  assert.equal(await a.page.locator('.od-convert-hint').count(), 0)
  for (const { errors } of [owner, a]) assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await owner.context.close(); await a.context.close()
})
