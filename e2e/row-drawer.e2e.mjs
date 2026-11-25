import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { navigate, openPage, rolesFile, startApp, text } from './helpers.mjs'

// OND-27, OND-28: a CoNQ row opens in a drawer from the right (values, descriptions, History); Edit → Save to Git writes
// the row to Git at once with its log entry; Esc closes and the focus goes back to the row; ＋ Add row opens the drawer
// empty and the row gets its ID in that save (TC-OND-21, UAT); a viewer without the right sees Edit disabled with the
// reason (TC-OND-23). Against a mocked GitHub, as e2e/on-demand.e2e.mjs.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const email = 'qe.lead@example.com'
const signIn = (work) => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'test-token')
  localStorage.setItem('demand-planning-work-email-v1', work)
}
// The data repository: files by path (text), the roles of `role`, every write recorded.
async function mockGitHub(context, files, role = 'Tool Owner') {
  const writes = []
  await context.route('https://dev.azure.com/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
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
    const folder = Object.keys(files).filter((file) => file.startsWith(`${path}/`))
    if (folder.length) return json(folder.map((file) => ({ type: 'file', name: file.slice(path.length + 1), path: file, sha: `s${files[file].length}` })))
    if (files[path] != null) return json({ type: 'file', encoding: 'base64', content: Buffer.from(files[path]).toString('base64'), sha: `s${files[path].length}` })
    return json({ message: 'Not Found' }, 404)
  })
  return writes
}
// CoNQ in Git with two rows, each with its ID, who added it and its first log entry.
const conqFile = () => JSON.stringify({
  schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ', description: 'Cost of Non-Quality', keyPrefix: 'CONQ',
  columns: [
    { id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Complaint'], required: true, description: 'What kind of non-quality cost it is.' },
    { id: 'c2', name: 'Cost', type: 'currency', currency: 'EUR', description: 'The cost without VAT.' },
    { id: 'c3', name: 'Details', type: 'longtext' },
  ],
  rows: [
    { id: 'r1', key: 'CONQ-261120-K7Q2', seq: 1, addedBy: 'ana@example.com', addedAt: '2026-11-20T08:00:00.000Z', log: [{ id: 'l1', at: '2026-11-20T08:00:00.000Z', by: 'ana@example.com', added: true, changes: [{ column: 'c1', from: '', to: 'Scrap' }, { column: 'c2', from: '', to: '300 EUR' }] }], cells: { c1: 'Scrap', c2: '300 EUR', c3: 'Seal ring cut too short.\nReworked on site.' } },
    { id: 'r2', key: 'CONQ-261121-M3P4', seq: 2, addedBy: 'ben@example.com', addedAt: '2026-11-21T09:30:00.000Z', log: [{ id: 'l2', at: '2026-11-21T09:30:00.000Z', by: 'ben@example.com', added: true, changes: [{ column: 'c1', from: '', to: 'Rework' }] }], cells: { c1: 'Rework', c2: '1200 EUR' } },
  ],
})
const drawerOf = (page) => page.locator('aside.drawer[role="dialog"]')
const openConq = async (role = 'Tool Owner') => {
  const files = { 'on-demand/conq.json': conqFile() }
  const { page, context, errors } = await openPage(app, { init: signIn, initArg: email })
  const writes = await mockGitHub(context, files, role)
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, 'CoNQ')
  await page.locator('.od-panel table tbody tr', { hasText: 'CONQ-0002' }).waitFor()
  return { page, context, errors, writes, files }
}

test('TC-OND-21: a CoNQ row opens in a drawer from the right with its values and History; Edit → Save to Git writes the change and its log entry to Git at once; Esc closes; ＋ Add row gets its ID in its save', async () => {
  const { page, context, errors, writes } = await openConq()
  // No unsaved-changes bar and no Save to Git step on the page any more.
  assert.equal(await page.locator('.git-bar-dirty').count(), 0)
  const first = page.locator('.od-panel table tbody tr', { hasText: 'CONQ-0001' })
  await first.locator('td', { hasText: 'Scrap' }).click()
  const drawer = drawerOf(page)
  await drawer.waitFor()
  // The drawer: right side, named by the row's ID, the values with their descriptions, the History.
  assert.equal(await page.getByRole('dialog', { name: 'CONQ-0001' }).count(), 1, 'the dialog is named by the row’s ID')
  await drawer.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)))
  const box = await drawer.boundingBox(), viewport = page.viewportSize()
  assert.ok(Math.abs(box.x + box.width - viewport.width) <= 1 && box.width >= 500 && box.width <= 540, `the drawer is on the right, about 520 px wide (${box.x}, ${box.width})`)
  assert.match(await text(drawer.locator('.od-row-facts')), /ID CONQ-0001 Key CONQ-261120-K7Q2 Added .* by ana@example\.com/)
  const values = await text(drawer.locator('.od-row-values'))
  assert.match(values, /Category What kind of non-quality cost it is\. Scrap/)
  assert.match(values, /Cost The cost without VAT\. 300\.00 EUR/)
  assert.match(values, /Details Seal ring cut too short\. Reworked on site\./)
  const history = drawer.getByRole('region', { name: 'History' })
  assert.match(await text(history.locator('ol > li').first()), /^Added · .* · ana@example\.com Category: Scrap Cost: 300\.00 EUR$/)
  // Focus is inside the drawer and stays there (Tab from the last control wraps).
  assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('aside.drawer'))), true)
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('aside.drawer'))), true, 'focus is trapped in the drawer')

  // Next row (in the table's order) and back.
  await drawer.getByRole('button', { name: 'Next row' }).click()
  await page.getByRole('dialog', { name: 'CONQ-0002' }).waitFor()
  await drawer.getByRole('button', { name: 'Previous row' }).click()
  await page.getByRole('dialog', { name: 'CONQ-0001' }).waitFor()

  // Edit: the fields in place; a change, then moving away asks first.
  await drawer.getByRole('button', { name: 'Edit', exact: true }).click()
  await drawer.getByLabel('Cost', { exact: true }).fill('450')
  await drawer.getByRole('button', { name: 'Next row' }).click()
  const ask = page.getByRole('dialog', { name: 'Discard your changes?' })
  await ask.waitFor()
  await ask.getByRole('button', { name: 'Keep editing' }).click()
  await ask.waitFor({ state: 'detached' })
  assert.equal(await drawer.getByLabel('Cost', { exact: true }).inputValue(), '450', 'the edit is kept')
  // Save to Git: one commit of on-demand/conq.json with the change and the row's new log entry.
  await drawer.getByRole('button', { name: 'Save to Git' }).click()
  await drawer.locator('.od-row-values').waitFor()
  const saved = writes.filter((write) => write.path === 'on-demand/conq.json')
  assert.equal(saved.length, 1, 'saved to Git at once')
  assert.match(saved[0].message, /^CoNQ: update row CONQ-0001 \[saved \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\]( \[by [^\]]+\])?$/)
  const row = saved[0].data.rows.find((entry) => entry.id === 'r1')
  assert.equal(row.cells.c2, '450 EUR')
  assert.equal(row.log.length, 2)
  assert.equal(row.log[1].by, email)
  assert.deepEqual(row.log[1].changes, [{ column: 'c2', from: '300 EUR', to: '450 EUR' }])
  assert.equal(saved[0].data.rows.find((entry) => entry.id === 'r2').cells.c2, '1200 EUR', 'the other row is untouched')
  assert.match(await text(drawer.locator('.od-row-values')), /Cost The cost without VAT\. 450\.00 EUR/)
  assert.match(await text(history.locator('ol > li').first()), new RegExp(`^Changed · .* · ${email.replace(/\./g, '\\.')} Cost: 300\\.00 EUR → 450\\.00 EUR$`))
  assert.match(await text(first), /450\.00 EUR/)
  // §8: the result is a Background jobs entry.
  await page.keyboard.press('Escape')
  await drawer.waitFor({ state: 'detached' })
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-row-key')), 'r1', 'the focus is back on the row')
  await page.locator('.jobs-button').click()
  const jobs = page.getByRole('dialog', { name: 'Background jobs' })
  assert.match(await text(jobs.locator('li.job', { hasText: 'Save to Git · CoNQ · row CONQ-0001' })), /Saved to Git\. on-demand\/conq\.json — updated CONQ-0001/)
  await jobs.getByRole('button', { name: 'Close', exact: true }).click()

  // Keyboard: Enter on the focused row opens it.
  await page.locator('.od-panel table tbody tr', { hasText: 'CONQ-0002' }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('dialog', { name: 'CONQ-0002' }).waitFor()
  await drawer.getByRole('button', { name: 'Close' }).click()
  await drawer.waitFor({ state: 'detached' })

  // ＋ Add row: the drawer opens empty for editing; a required field is checked; Save to Git gives the row its ID.
  await page.getByRole('button', { name: '＋ Add row' }).click()
  await page.getByRole('dialog', { name: 'New row' }).waitFor()
  assert.match(await text(drawer.locator('.od-row-facts')), /ID given when the row is saved to Git/)
  await drawer.getByRole('button', { name: 'Save to Git' }).click()
  assert.match(await text(drawer.locator('.drawer-error')), /Category/, 'the required column is asked for')
  await drawer.getByLabel('Category').selectOption('Complaint')
  await drawer.getByLabel('Cost', { exact: true }).fill('80')
  await drawer.getByRole('button', { name: 'Save to Git' }).click()
  await page.getByRole('dialog', { name: 'CONQ-0003' }).waitFor()
  const added = writes.filter((write) => write.path === 'on-demand/conq.json')
  assert.equal(added.length, 2)
  const file = added[1].data
  const newRow = file.rows.find((entry) => entry.seq === 3)
  assert.match(added[1].message, new RegExp(`^CoNQ: add row CONQ-0003 \\(${newRow.key}\\) \\[saved `))
  assert.deepEqual([newRow.cells.c1, newRow.cells.c2, newRow.addedBy], ['Complaint', '80 EUR', email])
  assert.deepEqual(newRow.log.map((entry) => [entry.added, entry.by]), [[true, email]])
  assert.equal(file.rows.find((entry) => entry.id === 'r1').cells.c2, '450 EUR', 'the earlier save is kept')
  await page.locator('.od-panel table tbody tr', { hasText: 'CONQ-0003' }).waitFor()
  await page.keyboard.press('Escape')
  await drawer.waitFor({ state: 'detached' })
  assert.equal(JSON.stringify(writes).includes('test-token'), false, 'no token in the data repository')
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

test('TC-OND-23: a viewer without the right to edit rows opens a row in the drawer read only — Edit and Hide row disabled with the reason; a click beside the drawer closes it', async () => {
  const { page, context, errors, writes } = await openConq('Team Member')
  await page.locator('.od-panel table tbody tr', { hasText: 'CONQ-0002' }).locator('td', { hasText: 'Rework' }).click()
  const drawer = drawerOf(page)
  await page.getByRole('dialog', { name: 'CONQ-0002' }).waitFor()
  assert.match(await text(drawer.locator('.od-row-values')), /Category What kind of non-quality cost it is\. Rework/)
  const reason = 'Your role does not allow “Edit On-Demand data (rows)”. An Admin can change this in Admin → People & roles → Role rights.'
  assert.equal(await drawer.getByRole('button', { name: 'Edit', exact: true }).isDisabled(), true)
  assert.equal(await drawer.getByRole('button', { name: 'Edit', exact: true }).getAttribute('title'), reason)
  assert.equal(await drawer.getByRole('button', { name: 'Hide row' }).isDisabled(), true)
  assert.equal(await text(drawer.locator('.drawer-footer .write-blocked')), reason, 'the reason is a visible line')
  assert.equal(await drawer.locator('form, input, select, textarea').count(), 0, 'nothing to edit')
  // A click on the overlay beside the drawer closes it.
  await page.mouse.click(40, 400)
  await drawer.waitFor({ state: 'detached' })
  assert.equal(writes.length, 0, 'nothing is written')
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})
