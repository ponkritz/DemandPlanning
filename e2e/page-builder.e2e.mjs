import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { navigate, openPage, rolesFile, startApp, text } from './helpers.mjs'

// Page builder (PGB-01…PGB-14, CON-106) against a mocked GitHub: a Tool Owner adds the group Quality with a Table page
// "Supplier issues", names a group co-owner, sets the page up and adds a row (TC-PGB-01, UAT); the group co-owner adds a
// page to Quality but cannot change the group (TC-PGB-09); a person without ownership sees everything disabled with the
// reason (TC-PGB-10).
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const conq = { schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ', description: 'Cost of Non-Quality', keyPrefix: 'CONQ', columns: [{ id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap'] }], rows: [] }
const lead = 'group.lead@example.com'
// Git storage and the viewer's work email (the email ownership is matched by).
const signIn = (email) => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'test-token')
  localStorage.setItem('demand-planning-work-email-v1', email)
}
// The data repository: files by path (text), access.json with everyone in `role`, every write recorded.
async function mockGitHub(context, files, role) {
  const writes = []
  await context.route('https://dev.azure.com/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await context.route('https://api.github.com/**', (route) => {
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
async function open(email, files, role) {
  const { page, context, errors } = await openPage(app, { init: signIn, initArg: email })
  const writes = await mockGitHub(context, files, role)
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors, writes }
}
const menuGroup = (page, name) => page.locator('.sidebar nav .nav-section', { has: page.locator('button.nav-group', { hasText: name.toUpperCase() }) })
const lastWrite = (writes, path) => writes.filter((write) => write.path === path).at(-1)
// A layout in Git with the group Quality (co-owner: the group lead) holding the Table page Supplier issues.
const qualityFiles = () => ({
  'on-demand/conq.json': JSON.stringify(conq),
  'on-demand/supplier-issues.json': JSON.stringify({ schema: 1, kind: 'on-demand-page', id: 'supplier-issues', name: 'Supplier issues', description: '', keyPrefix: 'SUPPLIER', columns: [{ id: 'c1', name: 'Issue', type: 'text' }], rows: [{ id: 'r1', key: 'SUPPLIER-261120-AB2C', seq: 1, cells: { c1: 'Late delivery' } }] }),
  'menu-layout.json': JSON.stringify({ schema: 1, kind: 'menu-layout', groups: { 'g-quality': { name: 'Quality', order: 1, acceptsPages: true, owners: [lead] } }, pages: { 'supplier-issues': { type: 'table', group: 'g-quality', order: 1, icon: '⚑', owners: [] } } }),
})

test('TC-PGB-01: a Tool Owner adds the group Quality with the Table page “Supplier issues”, names a group co-owner, sets the page up and adds a row — the page is under Quality in the menu, saved in Git', async () => {
  const files = { 'on-demand/conq.json': JSON.stringify(conq) }
  const { page, context, errors, writes } = await open('tool.owner@example.com', files, 'Tool Owner')
  await navigate(page, 'Pages & menu')
  assert.equal(await text(page.locator('header.topbar h1')), 'Pages & menu')
  // CoNQ (no placement yet) is a Table + Insights page in On-Demand.
  const pages = page.locator('.pgb-pages')
  await pages.locator('tbody tr', { hasText: 'CoNQ' }).waitFor()
  assert.match(await text(pages.locator('tbody tr', { hasText: 'CoNQ' })), /^On-Demand 1 ▦ CoNQ Cost of Non-Quality Table \+ Insights — 1 0/)

  // ＋ Add page…: type Table, name, icon, ＋ New group… "Quality".
  await page.getByRole('button', { name: '＋ Add page…' }).click()
  const add = page.getByRole('dialog', { name: 'Add a page' })
  await add.getByRole('radio', { name: 'Table', exact: true }).check()
  await add.getByLabel('Page name', { exact: true }).fill('Supplier issues')
  await add.getByLabel('Description (optional)').fill('Issues raised with suppliers')
  await add.getByLabel('Icon').selectOption('⚑')
  await add.getByLabel('Menu group').selectOption({ label: '＋ New group…' })
  await add.getByLabel('New group name').fill('Quality')
  await add.getByRole('button', { name: 'Add page' }).click()
  await add.waitFor({ state: 'detached' })
  // The page opens: a Table page (no Insights tab), under QUALITY in the menu.
  await page.locator('header.topbar h1', { hasText: 'Supplier issues' }).waitFor()
  assert.equal(await page.getByRole('tab', { name: /^Insights/ }).count(), 0, 'a Table page has no Insights tab')
  const quality = menuGroup(page, 'Quality')
  assert.match(await text(quality), /^▾ QUALITY ⋯ ⚑ Supplier issues$/)
  assert.equal(await quality.getByRole('button', { name: /Supplier issues/ }).getAttribute('aria-current'), 'page')
  const pageFile = lastWrite(writes, 'on-demand/supplier-issues.json').data
  assert.deepEqual([pageFile.kind, pageFile.id, pageFile.name, pageFile.description], ['on-demand-page', 'supplier-issues', 'Supplier issues', 'Issues raised with suppliers'])
  let layout = lastWrite(writes, 'menu-layout.json').data
  assert.deepEqual(layout.groups['g-quality'], { name: 'Quality', order: 1, acceptsPages: true, owners: [] })
  assert.deepEqual(layout.pages['supplier-issues'], { type: 'table', group: 'g-quality', order: 1, icon: '⚑', owners: [] })
  assert.match(lastWrite(writes, 'menu-layout.json').message, /\[saved \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\]$/, 'a queued save (GIT-17)')

  // Admin → Pages & menu: Edit the group Quality — a co-owner.
  await navigate(page, 'Pages & menu')
  const groups = page.locator('.pgb-groups')
  await groups.getByRole('button', { name: 'Edit group Quality' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit the group Quality' })
  await edit.getByLabel('Group co-owners (optional)').fill(`${lead}, not-an-email`)
  await edit.getByRole('button', { name: 'Save to Git' }).click()
  assert.match(await text(edit.locator('.notice')), /Not a work email: not-an-email\./)
  await edit.getByLabel('Group co-owners (optional)').fill(lead)
  await edit.getByRole('button', { name: 'Save to Git' }).click()
  await edit.waitFor({ state: 'detached' })
  layout = lastWrite(writes, 'menu-layout.json').data
  assert.deepEqual(layout.groups['g-quality'].owners, [lead])
  assert.match(await text(groups.locator('tbody tr', { hasText: 'Quality' })), new RegExp(`Quality Custom Yes ${lead.replace(/\./g, '\\.')} 1`))

  // Back on the page: Set up columns… and ＋ Add row, each saved to Git at once (OND-28).
  await quality.getByRole('button', { name: /Supplier issues/ }).click()
  await page.getByRole('button', { name: 'Set up columns…' }).click()
  const columns = page.getByRole('dialog', { name: 'Set up columns' })
  await columns.getByRole('button', { name: '＋ Add column' }).click()
  await columns.getByLabel('Column 1 name').fill('Supplier')
  await columns.getByRole('button', { name: '＋ Add column' }).click()
  await columns.getByLabel('Column 2 name').fill('Severity')
  await columns.getByLabel('Column 2 type').selectOption('dropdown')
  for (const [index, option] of ['Minor', 'Major'].entries()) { await columns.getByRole('button', { name: '＋ Add option' }).click(); await columns.getByLabel(`Severity option ${index + 1}`).fill(option) }
  await columns.getByRole('button', { name: 'Save', exact: true }).click()
  await columns.waitFor({ state: 'detached' })
  await page.getByRole('button', { name: '＋ Add row' }).click()
  const row = page.getByRole('dialog', { name: 'New row' })
  await row.getByLabel('Supplier', { exact: true }).fill('Acme Seals')
  await row.getByLabel('Severity').selectOption('Major')
  await row.getByRole('button', { name: 'Save to Git' }).click()
  await page.getByRole('dialog', { name: 'SUPPLIER-0001' }).waitFor()
  await page.keyboard.press('Escape')
  await page.locator('aside.drawer').waitFor({ state: 'detached' })
  assert.match(await text(page.locator('.od-panel .panel-heading')), /^QUALITY Supplier issues/)
  assert.match(await text(page.locator('.od-panel table tbody tr').first()), /Acme Seals Major/)
  assert.equal(await page.locator('.git-bar-dirty').count(), 0, 'no unsaved-changes bar: the columns and the row were saved at once')
  const saved = lastWrite(writes, 'on-demand/supplier-issues.json').data
  assert.deepEqual(saved.columns.map((column) => [column.name, column.type]), [['Supplier', 'text'], ['Severity', 'dropdown']])
  assert.deepEqual(saved.rows.map((entry) => Object.values(entry.cells)), [['Acme Seals', 'Major']])
  assert.equal(saved.rows[0].seq, 1)
  // CoNQ is untouched: still a Table + Insights page in On-Demand, its file never written.
  assert.equal(writes.some((write) => write.path === 'on-demand/conq.json'), false)
  await menuGroup(page, 'On-Demand').getByRole('button', { name: /CoNQ/ }).click()
  await page.getByRole('tab', { name: /^Insights/ }).waitFor()
  assert.equal(JSON.stringify(writes).includes('test-token'), false, 'no token in the data repository')
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

test('TC-PGB-09: a group co-owner adds a Table + Insights page to Quality and sets it up, but cannot create or change groups', async () => {
  const files = qualityFiles()
  const { page, context, errors, writes } = await open(lead, files, 'Team Member')
  const quality = menuGroup(page, 'Quality')
  await quality.getByRole('button', { name: /Supplier issues/ }).waitFor()
  await navigate(page, 'Pages & menu')
  // The groups are the Tool Owner's: New group…, Edit, ↑ ↓ and Remove disabled with the reason.
  const reason = 'Only a Tool Owner (“Manage pages and menu groups”) can create, rename, reorder, configure or remove menu groups. An Admin can change this in Admin → People & roles → Role rights.'
  assert.equal(await page.getByRole('button', { name: '＋ New group…' }).isDisabled(), true)
  assert.equal(await page.getByRole('button', { name: '＋ New group…' }).getAttribute('title'), reason)
  const groups = page.locator('.pgb-groups')
  assert.equal(await text(groups.locator('.write-blocked')), reason)
  for (const name of ['Edit group Quality', 'Remove group Quality', 'Edit group On-Demand']) assert.equal(await groups.getByRole('button', { name }).isDisabled(), true, `${name} is disabled`)
  assert.equal(await groups.getByRole('button', { name: 'Add a page to Quality' }).isDisabled(), false)
  assert.match(await groups.getByRole('button', { name: 'Add a page to On-Demand' }).getAttribute('title'), /Only a Tool Owner or a co-owner of the group “On-Demand”/)
  // The pages of Quality are theirs; CoNQ (On-Demand) is not.
  const pagesTable = page.locator('.pgb-pages')
  assert.equal(await pagesTable.getByRole('button', { name: 'Edit page Supplier issues' }).isDisabled(), false)
  assert.equal(await pagesTable.getByRole('button', { name: 'Remove page CoNQ' }).isDisabled(), true)
  // ＋ Add page…: only Quality is offered, no new group.
  await page.getByRole('button', { name: '＋ Add page…' }).click()
  const add = page.getByRole('dialog', { name: 'Add a page' })
  assert.deepEqual(await add.getByLabel('Menu group').locator('option').allInnerTexts(), ['Quality'])
  await add.getByRole('radio', { name: 'Table + Insights' }).check()
  await add.getByLabel('Page name', { exact: true }).fill('Audit findings')
  await add.getByLabel('Page co-owners (optional)').fill('auditor@example.com')
  await add.getByRole('button', { name: 'Add page' }).click()
  await add.waitFor({ state: 'detached' })
  await page.locator('header.topbar h1', { hasText: 'Audit findings' }).waitFor()
  await page.getByRole('tab', { name: /^Insights/ }).waitFor()
  assert.match(await text(quality), /Supplier issues.*Audit findings/)
  const layout = lastWrite(writes, 'menu-layout.json').data
  assert.deepEqual(layout.pages['audit-findings'], { type: 'table-insights', group: 'g-quality', order: 2, icon: '▦', owners: ['auditor@example.com'] })
  assert.deepEqual(layout.groups['g-quality'], { name: 'Quality', order: 1, acceptsPages: true, owners: [lead] }, 'the group unchanged')
  // As a group co-owner they set the page up (columns) although their role does not allow it.
  assert.equal(await page.getByRole('button', { name: 'Set up columns…' }).isDisabled(), false)
  assert.equal(await page.locator('.od-panel .write-blocked').count(), 0)
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

test('TC-PGB-10: a person with no ownership and no rights sees Pages & menu and the added pages with every change disabled and the reason', async () => {
  const files = qualityFiles()
  const { page, context, errors, writes } = await open('someone@example.com', files, 'Team Member')
  const quality = menuGroup(page, 'Quality')
  await quality.getByRole('button', { name: /Supplier issues/ }).waitFor()
  assert.equal(await quality.getByRole('button', { name: 'Add a page to Quality' }).count(), 0, 'no ⋯ on a group they may not add to')
  await navigate(page, 'Pages & menu')
  const add = page.getByRole('button', { name: '＋ Add page…' })
  assert.equal(await add.isDisabled(), true)
  assert.equal(await add.getAttribute('title'), 'You co-own no group that accepts added pages. A Tool Owner adds pages anywhere and names the co-owners of each group.')
  assert.equal(await page.getByRole('button', { name: '＋ New group…' }).isDisabled(), true)
  const pagesTable = page.locator('.pgb-pages')
  assert.equal(await text(pagesTable.locator('.write-blocked')), 'Only a Tool Owner or a co-owner of the group “On-Demand” (or a role allowed “Set up On-Demand pages”) can change this page in the menu.')
  for (const name of ['Edit page Supplier issues', 'Move page Supplier issues up', 'Remove page Supplier issues', 'Remove page CoNQ']) assert.equal(await pagesTable.getByRole('button', { name }).isDisabled(), true, `${name} is disabled`)
  assert.equal(await pagesTable.getByRole('button', { name: 'Remove page Supplier issues' }).getAttribute('title'), 'Only a Tool Owner or a co-owner of the group “Quality” can change this page in the menu.')
  assert.match(await text(page.locator('.pages-menu-page .settings-summary')), /View only: a Tool Owner changes the groups\./)
  // The page itself: rows shown, every change disabled with the role reason (OND-07).
  await pagesTable.getByRole('button', { name: 'Open Supplier issues' }).click()
  await page.locator('.od-panel table tbody tr').first().waitFor()
  assert.match(await text(page.locator('.od-panel table tbody tr').first()), /Late delivery/)
  for (const name of ['＋ Add row', 'Set up columns…', '＋ Add page…', 'Rename page…', 'Remove page…']) assert.equal(await page.getByRole('button', { name }).isDisabled(), true, `${name} is disabled`)
  assert.equal(await text(page.locator('.od-panel .write-blocked')), 'Your role does not allow “Edit On-Demand data (rows)”, “Set up On-Demand pages (pages, columns, options)”. An Admin can change this in Admin → People & roles → Role rights.')
  assert.equal(await page.getByRole('button', { name: 'Rename page…' }).getAttribute('title'), 'Only a Tool Owner or a co-owner of the group “Quality” can change this page in the menu.')
  assert.equal(writes.length, 0, 'nothing is written')
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})
