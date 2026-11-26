import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { menuOf, navigate, openPage, startApp, text } from './helpers.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'

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
    if (path === 'access.json') return json(roles(role))
    const folder = Object.keys(files).filter((file) => file.startsWith(`${path}/`))
    if (folder.length) return json(folder.map((file) => ({ type: 'file', name: file.slice(path.length + 1), path: file, sha: `s${files[file].length}` })))
    if (files[path] != null) return json({ type: 'file', encoding: 'base64', content: Buffer.from(files[path]).toString('base64'), sha: `s${files[path].length}` })
    return json({ message: 'Not Found' }, 404)
  })
  return writes
}
// access.json with everyone in `role` and the people given roles by work email (PGB-18: offered as co-owners).
function roles(role) {
  const policy = defaultPolicy(); policy.defaultRole = role
  policy.members = { [lead]: ['Team Member'], 'auditor@example.com': ['Team Member'] }
  return { type: 'file', encoding: 'base64', content: Buffer.from(serializeAccess(policy)).toString('base64'), sha: 'roles' }
}
// PGB-18: co-owners are ticked in the list (type to filter), not typed.
async function pickOwners(dialog, label, emails) {
  await dialog.getByRole('button', { name: new RegExp(`^${label.replace(/[()]/g, '\\$&')}:`) }).click()
  const list = dialog.getByRole('listbox', { name: label })
  for (const email of emails) {
    await list.getByLabel(`Filter ${label}`).fill(email.split('@')[0])
    await list.getByRole('checkbox', { name: email }).check()
  }
  await dialog.getByRole('button', { name: new RegExp(`^${label.replace(/[()]/g, '\\$&')}:`) }).click()
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
  const pageFile = lastWrite(writes, 'on-demand/Supplier issues--supplier-issues.json').data
  assert.deepEqual([pageFile.kind, pageFile.id, pageFile.name, pageFile.description], ['on-demand-page', 'supplier-issues', 'Supplier issues', 'Issues raised with suppliers'])
  let layout = lastWrite(writes, 'menu-layout.json').data
  assert.deepEqual(layout.groups['g-quality'], { name: 'Quality', order: 1, acceptsPages: true, owners: [] })
  assert.deepEqual(layout.pages['supplier-issues'], { type: 'table', group: 'g-quality', order: 1, icon: '⚑', owners: [] })
  assert.match(lastWrite(writes, 'menu-layout.json').message, /\[saved \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\]( \[by [^\]]+\])?$/, 'a queued save (GIT-17)')

  // Admin → Pages & menu: Edit the group Quality — a co-owner.
  await navigate(page, 'Pages & menu')
  const groups = page.locator('.pgb-groups')
  await groups.getByRole('button', { name: 'Edit group Quality' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit the group Quality' })
  await pickOwners(edit, 'Group co-owners (optional)', [lead])
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
  const saved = lastWrite(writes, 'on-demand/Supplier issues--supplier-issues.json').data
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
  assert.equal(await pagesTable.getByRole('button', { name: 'Hide page CoNQ' }).isDisabled(), true)
  // PGB-19, PGB-20: their page they hide and show, but only a Tool Owner deletes it.
  assert.equal(await pagesTable.getByRole('button', { name: 'Hide page Supplier issues' }).isDisabled(), false)
  assert.equal(await pagesTable.getByRole('button', { name: 'Delete page Supplier issues' }).isDisabled(), true)
  // ＋ Add page…: only Quality is offered, no new group.
  await page.getByRole('button', { name: '＋ Add page…' }).click()
  const add = page.getByRole('dialog', { name: 'Add a page' })
  assert.deepEqual(await add.getByLabel('Menu group').locator('option').allInnerTexts(), ['Quality'])
  await add.getByRole('radio', { name: 'Table + Insights' }).check()
  await add.getByLabel('Page name', { exact: true }).fill('Audit findings')
  await pickOwners(add, 'Page co-owners (optional)', ['auditor@example.com'])
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
  for (const name of ['Edit page Supplier issues', 'Move page Supplier issues up', 'Hide page Supplier issues', 'Delete page Supplier issues', 'Delete page CoNQ']) assert.equal(await pagesTable.getByRole('button', { name }).isDisabled(), true, `${name} is disabled`)
  assert.equal(await pagesTable.getByRole('button', { name: 'Move page Supplier issues up' }).getAttribute('title'), 'Only a Tool Owner or a co-owner of the group “Quality” can change this page in the menu.')
  assert.match(await pagesTable.getByRole('button', { name: 'Delete page Supplier issues' }).getAttribute('title'), /^Only a Tool Owner .* can delete a page\. Hide it instead/)
  assert.match(await text(page.locator('.pages-menu-page .settings-summary').first()), /View only: a Tool Owner changes the groups\./)
  // The page itself: rows shown, every change disabled with the role reason (OND-07).
  await pagesTable.getByRole('button', { name: 'Open Supplier issues' }).click()
  await page.locator('.od-panel table tbody tr').first().waitFor()
  assert.match(await text(page.locator('.od-panel table tbody tr').first()), /Late delivery/)
  for (const name of ['＋ Add row', 'Set up columns…']) assert.equal(await page.getByRole('button', { name }).isDisabled(), true, `${name} is disabled`)
  assert.equal(await text(page.locator('.od-panel .write-blocked')), 'Your role does not allow “Edit On-Demand data (rows)”, “Set up On-Demand pages (pages, columns, options)”. An Admin can change this in Admin → People & roles → Role rights.')
  // OND-61: the page's actions in its ⋯ menu, each disabled with its reason as its tooltip.
  const pageMenu = await menuOf(page, 'page Supplier issues')
  for (const name of ['＋ Add page…', 'Rename page…', 'Hide page', 'Delete page…']) assert.equal(await pageMenu.getByRole('menuitem', { name }).isDisabled(), true, `${name} is disabled`)
  assert.equal(await pageMenu.getByRole('menuitem', { name: 'Rename page…' }).getAttribute('title'), 'Only a Tool Owner or a co-owner of the group “Quality” can change this page in the menu.')
  await page.keyboard.press('Escape')
  assert.equal(writes.length, 0, 'nothing is written')
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

test('TC-PGB-12: a page name already in the menu — another case, extra spaces, full-width letters, a built-in page — shows the error at the name field and Save stays disabled (Add page, Edit, Rename page)', async () => {
  const files = qualityFiles()
  const { page, context, errors, writes } = await open('tool.owner@example.com', files, 'Tool Owner')
  await navigate(page, 'Pages & menu')
  await page.locator('.pgb-pages tbody tr', { hasText: 'Supplier issues' }).waitFor()
  await page.getByRole('button', { name: '＋ Add page…' }).click()
  const add = page.getByRole('dialog', { name: 'Add a page' })
  const name = add.getByLabel('Page name', { exact: true })
  await name.fill('  supplier   ISSUES ')
  const error = add.locator('.field-error')
  assert.equal(await text(error), 'There is already a page named “Supplier issues” (in Quality). Choose another name.')
  assert.equal(await name.getAttribute('aria-invalid'), 'true')
  assert.equal(await add.getByRole('button', { name: 'Add page' }).isDisabled(), true, 'Add page stays disabled while the name clashes')
  await name.fill('ＣｏＮＱ')
  assert.equal(await text(error), 'There is already a page named “CoNQ” (in On-Demand). Choose another name.', 'full-width letters are the same name')
  await name.fill('snapshots')
  assert.equal(await text(error), 'There is already a page named “Snapshots” (in Data & governance). Choose another name.', 'a built-in page')
  await name.fill('Supplier audits')
  await error.waitFor({ state: 'detached' })
  assert.equal(await add.getByRole('button', { name: 'Add page' }).isDisabled(), false)
  await add.getByRole('button', { name: 'Cancel' }).click()
  // Edit (rename or move) in Pages & menu: CoNQ cannot take Supplier issues' name; its own name is fine.
  await page.locator('.pgb-pages').getByRole('button', { name: 'Edit page CoNQ' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit the page' })
  await edit.getByLabel('Page name', { exact: true }).fill('Supplier Issues')
  assert.equal(await text(edit.locator('.field-error')), 'There is already a page named “Supplier issues” (in Quality). Choose another name.')
  assert.equal(await edit.getByRole('button', { name: 'Save to Git' }).isDisabled(), true)
  await edit.getByLabel('Page name', { exact: true }).fill('conq')
  await edit.locator('.field-error').waitFor({ state: 'detached' })
  assert.equal(await edit.getByRole('button', { name: 'Save to Git' }).isDisabled(), false, 'a page may keep its own name in another case')
  await edit.getByRole('button', { name: 'Cancel' }).click()
  // Rename page… on the page itself.
  await page.locator('.pgb-pages').getByRole('button', { name: 'Open Supplier issues' }).click()
  await page.locator('.od-panel table tbody tr').first().waitFor()
  await (await menuOf(page, 'page Supplier issues')).getByRole('menuitem', { name: 'Rename page…' }).click()
  const rename = page.getByRole('dialog', { name: 'Rename the page' })
  await rename.getByLabel('Page name', { exact: true }).fill('CONQ')
  assert.equal(await text(rename.locator('.field-error')), 'There is already a page named “CoNQ” (in On-Demand). Choose another name.')
  assert.equal(await rename.getByRole('button', { name: 'Save to Git' }).isDisabled(), true)
  await rename.getByRole('button', { name: 'Cancel' }).click()
  assert.equal(writes.length, 0, 'nothing is written')
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

test('TC-PGB-13: two pages with the same name in Git (saved at the same time) are both kept, shown with their group in the menu and listed on Pages & menu with the suggestion to rename one; TC-PGB-14: co-owners picked from a list', async () => {
  const files = qualityFiles()
  const layout = JSON.parse(files['menu-layout.json'])
  layout.pages['conq-quality'] = { type: 'table', group: 'g-quality', order: 2, icon: '▦', owners: ['old.owner@example.com'] }
  files['menu-layout.json'] = JSON.stringify(layout)
  files['on-demand/conq-quality.json'] = JSON.stringify({ ...conq, id: 'conq-quality', name: 'conq ' })
  const { page, context, errors, writes } = await open('tool.owner@example.com', files, 'Tool Owner')
  await menuGroup(page, 'Quality').getByRole('button', { name: 'conq (Quality)' }).waitFor()
  assert.equal(await menuGroup(page, 'On-Demand').getByRole('button', { name: 'CoNQ (On-Demand)' }).count(), 1, 'both kept, each with its group')
  await navigate(page, 'Pages & menu')
  const warning = page.locator('.pgb-duplicates')
  await warning.waitFor()
  assert.equal(await text(warning), 'Pages with the same name: “CoNQ” (On-Demand, Quality). Both pages are kept and the menu shows each with its group; rename one with Edit so everyone can tell them apart.')
  assert.equal(writes.length, 0, 'nothing is renamed automatically')
  // TC-PGB-14 (PGB-18): the co-owners are a list of the people the app knows; one not in it stays ticked, marked.
  await page.locator('.pgb-pages').getByRole('button', { name: 'Edit page conq', exact: true }).click()
  const edit = page.getByRole('dialog', { name: 'Edit the page' })
  await edit.getByRole('button', { name: /^Page co-owners \(optional\):/ }).click()
  const list = edit.getByRole('listbox', { name: 'Page co-owners (optional)' })
  assert.equal(await list.getByRole('checkbox', { name: 'old.owner@example.com — not in Azure DevOps' }).isChecked(), true)
  assert.equal(await list.getByRole('checkbox', { name: lead }).isChecked(), false)
  await list.getByLabel('Filter Page co-owners (optional)').fill('auditor')
  assert.deepEqual(await list.getByRole('checkbox').count(), 1, 'type to filter')
  await edit.getByRole('button', { name: 'Cancel' }).click()
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

test('TC-PGB-16: the co-owner list offers the Azure DevOps team members read at start — without opening People & roles, once per session', async () => {
  const profile = { id: 'tw-team', url: 'https://dev.azure.com/example/Project/_backlogs/backlog/Team%20A/Features', reason: 'Time Writing', token: 'x'.repeat(52), role: 'time-tracking', creatorEmail: 'tool.owner@example.com' }
  const { page, context, errors } = await openPage(app, { init: ([email, connection]) => {
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', email)
    localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify([connection]))
  }, initArg: ['tool.owner@example.com', profile] })
  await mockGitHub(context, qualityFiles(), 'Tool Owner')
  // Azure DevOps: the team's members (one is a group); the start fetch finds no work, so nobody is Assigned To.
  // Counted for the reloaded page only: the first load's own start fetch can still reach the route on a slow runner.
  let counting = false, teamReads = 0, teamRead = () => undefined
  const read = new Promise((resolve) => { teamRead = resolve })
  await context.route('https://dev.azure.com/**', (route) => {
    const url = route.request().url(), json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (/\/teams\/[^/]+\/members/.test(url)) { if (counting) { teamReads += 1; teamRead() } return json({ value: [{ identity: { displayName: 'Rita Gomez', uniqueName: 'Rita.Gomez@Example.com' } }, { identity: { displayName: 'Omar Haddad', uniqueName: 'omar.haddad@example.com' } }, { identity: { displayName: 'QA Group', uniqueName: 'group', isContainer: true } }] }) }
    if (/\/_apis\/wit\/wiql/.test(url)) return json({ workItems: [] })
    return json({ value: [] })
  })
  // The start fetch finds no work and may open the setup guide at any moment after the reload (later on a slow
  // runner): close it whenever it appears, instead of checking once.
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, async () => { await guide.getByRole('button', { name: 'Close', exact: true }).last().click() })
  // From the moment the reload commits the old page can send nothing more; every team read after it is the new page's.
  await page.reload({ waitUntil: 'commit' })
  counting = true
  await page.locator('.sidebar nav').waitFor()
  await read
  await navigate(page, 'Pages & menu')
  const pick = async () => {
    await page.locator('.pgb-pages').getByRole('button', { name: 'Edit page Supplier issues', exact: true }).click()
    const edit = page.getByRole('dialog', { name: 'Edit the page' })
    await edit.getByRole('button', { name: /^Page co-owners \(optional\):/ }).click()
    return edit
  }
  const edit = await pick()
  const list = edit.getByRole('listbox', { name: 'Page co-owners (optional)' })
  await list.getByRole('checkbox', { name: 'Rita Gomez (rita.gomez@example.com)' }).waitFor()
  assert.equal(await list.getByRole('checkbox', { name: 'Omar Haddad (omar.haddad@example.com)' }).count(), 1, 'a team member without fetched work is offered')
  assert.equal(await list.getByRole('checkbox', { name: /QA Group/ }).count(), 0, 'groups are not people')
  assert.equal(await list.getByRole('checkbox', { name: lead }).count(), 1, 'the people with app roles stay offered')
  await edit.getByRole('button', { name: 'Cancel' }).click()
  await edit.waitFor({ state: 'detached' })
  await navigate(page, 'Home')
  await navigate(page, 'Pages & menu')
  const again = await pick()
  await again.getByRole('listbox', { name: 'Page co-owners (optional)' }).getByRole('checkbox', { name: 'Rita Gomez (rita.gomez@example.com)' }).waitFor()
  assert.equal(teamReads, 1, 'read once for the session')
  await again.getByRole('button', { name: 'Cancel' }).click()
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})
