import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { menuOf, navigate, startApp, text } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'
import { unzip } from '../src/xlsx.ts'

// Built-in lists (LST-01…LST-14, CON-115; TC-LST-09 UAT, TC-LST-10): against a mocked GitHub (access.json, menu-layout.json,
// the Table page "Audits", the shared shared-lists.json) and a fake dev.azure.com whose team "QE Team" lists its members
// (names, Azure DevOps identity ids and work emails; only names and ids are saved). The Tool Owner creates the list "QE team" from the team in Admin → Feature & PI setup →
// Value lists, uses it in a column "Auditor" (Dropdown (built-in list)) of the On-Demand page, picks people in rows,
// refreshes the list — one person added, one removed, one renamed (the same identity id), and a second Ana Silva joins (told apart by her id), — and sees the removed person kept and
// marked and the renamed one under the new name; Replace hands the removed person's row over; the Excel template's data
// validation lists the list as it is now. A Team Member sees the lists read only with the reason; a co-owner of the page
// refreshes them. Synthetic data only; every step waits for what it needs, never for a time.
// LISTS_SHOTS=<folder> saves the screenshots (1440 px, light, scale 2).
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })
const shots = process.env.LISTS_SHOTS
const shoot = async (page, name) => { if (!shots) return; mkdirSync(shots, { recursive: true }); await page.screenshot({ path: `${shots}/${name}-1440-light.png` }) }

const lead = 'tom.owner@example.com', member = 'tia.member@example.com', owner = 'pia.patel@example.com'
const ana = { id: 'a1a1a1a1-0000-4000-8000-00000000000a', displayName: 'Ana Silva', uniqueName: 'ana.silva@example.com' }, ben = { id: 'b2b2b2b2-0000-4000-8000-00000000000b', displayName: 'Ben Okafor', uniqueName: 'ben.okafor@example.com' }
const cara = { id: 'c3c3c3c3-0000-4000-8000-00000000000c', displayName: 'Cara Lund', uniqueName: 'cara.lund@example.com' }, dev = { id: 'd4d4d4d4-0000-4000-8000-00000000000d', displayName: 'Dev Rao', uniqueName: 'dev.rao@example.com' }
const anaTwin = { id: 'e5e5e5e5-0000-4000-8000-00000000000e', displayName: 'Ana Silva', uniqueName: 'ana.silva2@example.com' }
const policy = () => { const value = defaultPolicy(); value.defaultRole = 'Team Member'; value.members = { [lead]: ['Tool Owner'], [member]: ['Team Member'], [owner]: ['Team Member'] }; return serializeAccess(value) }
const layout = () => JSON.stringify({ schema: 1, kind: 'menu-layout', groups: {}, pages: { audits: { type: 'table', group: 'on-demand', order: 1, icon: '▦', owners: [owner] } } })
const audits = () => JSON.stringify({
  schema: 1, kind: 'on-demand-page', id: 'audits', name: 'Audits', description: 'Internal audits', keyPrefix: 'AUD',
  columns: [{ id: 'c1', name: 'Audit', type: 'text', options: [], required: true }],
  rows: [{ id: 'r1', key: 'AUD-261120-K7Q2', seq: 1, addedBy: lead, addedAt: '2026-11-20T08:00:00.000Z', cells: { c1: 'Supplier audit' } }],
  insights: [],
})
const repository = (files = {}) => fakeGitHub({ files: { 'access.json': policy(), 'menu-layout.json': layout(), 'on-demand/audits.json': audits(), ...files } })

// A fake Azure DevOps: the team "QE Team" of the project lists state.members (the read of a list), anything else is empty.
function fakeAzure(state) {
  return (route) => {
    const request = route.request(), path = decodeURIComponent(new URL(request.url()).pathname)
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (request.method() !== 'GET' && !path.endsWith('/_apis/wit/wiql') && !path.endsWith('/_apis/wit/workitemsbatch')) { state.writes.push(`${request.method()} ${path}`); return json({}, 405) }
    const team = /\/_apis\/projects\/([^/]+)\/teams\/([^/]+)\/members$/.exec(path)
    if (team) { state.reads.push(`${team[1]}/${team[2]}`); return json({ value: team[2] === 'QE Team' ? state.members.map((identity) => ({ identity })) : [] }) }
    return json({ value: [] })
  }
}
async function open(gh, email, state) {
  const context = await app.browser.newContext({ viewport: { width: shots ? 1440 : 1300, height: 1000 }, deviceScaleFactor: shots ? 2 : 1, acceptDownloads: true })
  const connection = { id: 'tw-lists', url: 'https://dev.azure.com/example/Project/_backlogs/backlog/Team%20A/Features', reason: 'Time Writing', token: 'x'.repeat(52), role: 'time-tracking', creatorEmail: email }
  await context.addInitScript(({ who, profile }) => {
    localStorage.setItem('demand-planning-setup-guide-v1', 'dismissed')
    localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify([profile]))
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', who)
  }, { who: email, profile: connection })
  await context.route('https://api.github.com/**', gh.route)
  await context.route('https://dev.azure.com/**', fakeAzure(state))
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const slowdown = Number(process.env.E2E_CPU_SLOWDOWN ?? 1)
  if (slowdown > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: slowdown })
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, () => guide.getByRole('button', { name: 'Close', exact: true }).last().click())
  await page.goto(app.url)
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors }
}
const until = async (check, what) => { for (let i = 0; i < 600; i++) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 50)) } throw new Error(`Timed out waiting for ${what}`) }
async function openLists(page) {
  await navigate(page, 'Feature & PI setup')
  await page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'Lists' }).click()
  const panel = page.locator('article.panel.shared-lists')
  await panel.waitFor()
  return panel
}
const listsFile = (gh) => JSON.parse(gh.read('shared-lists.json') ?? 'null')
const pageFile = (gh) => JSON.parse(gh.read('on-demand/audits.json'))

test('TC-LST-09: the QE list from an Azure DevOps team — created, used in a column, picked in rows, refreshed (added, removed, renamed), Replace and the Excel template follow it', async () => {
  const gh = repository()
  const state = { members: [ana, ben, cara], reads: [], writes: [] }
  const { page, context, errors } = await open(gh, lead, state)

  // 1. Create the list from the team: the Time Writing connection's server and project prefilled; the members read.
  let panel = await openLists(page)
  await panel.getByText('No team lists yet.').waitFor()
  await panel.getByRole('button', { name: '＋ New list…' }).click()
  let dialog = page.getByRole('dialog', { name: 'New team list' })
  await dialog.getByLabel('List name').fill('QE team')
  assert.equal(await dialog.getByLabel('Azure DevOps server').inputValue(), 'https://dev.azure.com/example')
  assert.equal(await dialog.getByLabel('Project').inputValue(), 'Project')
  await dialog.getByLabel('Team').fill('QE Team')
  assert.equal(await dialog.getByRole('button', { name: 'Save to Git' }).isDisabled(), true, 'the team is read first')
  await dialog.getByRole('button', { name: '↻ Read the team' }).click()
  await dialog.getByText('3 team members read from Azure DevOps.').waitFor()
  assert.match(await text(dialog.getByRole('list', { name: 'Members' })), /Ana Silva ana\.silva@example\.com Ben Okafor ben\.okafor@example\.com Cara Lund cara\.lund@example\.com/)
  await dialog.getByRole('button', { name: 'Save to Git' }).click()
  await dialog.waitFor({ state: 'detached' })
  await until(() => listsFile(gh)?.lists.length === 1, 'the list saved to Git')
  const created = listsFile(gh).lists[0]
  assert.deepEqual([created.id, created.name, created.source], ['qe-team', 'QE team', { kind: 'azure-team', server: 'https://dev.azure.com/example', project: 'Project', team: 'QE Team' }])
  assert.deepEqual(created.items, [{ name: 'Ana Silva', id: 'a1a1a1a1-0000-4000-8000-00000000000a' }, { name: 'Ben Okafor', id: 'b2b2b2b2-0000-4000-8000-00000000000b' }, { name: 'Cara Lund', id: 'c3c3c3c3-0000-4000-8000-00000000000c' }])
  assert.doesNotMatch(gh.read('shared-lists.json'), /@/, 'no email in the shared lists file')
  assert.equal(created.log[0].action, 'created')
  assert.ok(gh.writes.some((entry) => entry.message.startsWith('Built-in lists: create QE team (3 people from QE Team)')))
  assert.match(await text(panel.locator('tbody tr')), /QE team dev\.azure\.com\/example · Project · QE Team 3 .* Not used yet/)

  // 2. Use it in a column of the On-Demand page: Dropdown (built-in list), the list chosen instead of options.
  await navigate(page, 'Audits')
  await page.locator('.od-panel table tbody tr', { hasText: 'AUD-0001' }).waitFor()
  await page.getByRole('button', { name: 'Set up columns…' }).click()
  const columns = page.getByRole('dialog', { name: 'Set up columns' })
  await columns.getByRole('button', { name: '＋ Add column' }).click()
  await columns.getByLabel('Column 2 name').fill('Auditor')
  const types = await columns.getByLabel('Column 2 type').locator('option').allInnerTexts()
  assert.deepEqual(types, ['Text', 'Long text', 'Number', 'Currency', 'Date', 'Dropdown (one value)', 'Multi-select', 'Dropdown (built-in list)', 'Multi-select (built-in list)'])
  await columns.getByLabel('Column 2 type').selectOption({ label: 'Dropdown (built-in list)' })
  await columns.getByLabel('Auditor list').selectOption({ label: 'QE team (Azure DevOps team QE Team · 3 people)' })
  await columns.getByText('The choices are the list\'s values as it is now (Ana Silva, Ben Okafor, Cara Lund).', { exact: false }).waitFor()
  assert.equal(await columns.getByRole('button', { name: '＋ Add option' }).count(), 0, 'no options of its own')
  await shoot(page, 'builtin-list-column-editor')
  await columns.getByRole('button', { name: 'Save', exact: true }).click()
  await columns.waitFor({ state: 'detached' })
  await until(() => pageFile(gh).columns.length === 2, 'the column saved')
  const auditorId = pageFile(gh).columns[1].id
  assert.deepEqual(pageFile(gh).columns[1], { id: auditorId, name: 'Auditor', type: 'dropdown', options: ['Ana Silva', 'Ben Okafor', 'Cara Lund'], list: 'team:qe-team' })

  // 3. Pick people in rows (the row form shows the list's names); the Azure DevOps identity id is kept as the key (no email).
  await page.getByRole('button', { name: '＋ Add row' }).click()
  const row = page.getByRole('dialog', { name: 'New row' })
  await row.getByLabel('Audit', { exact: true }).fill('Lab audit')
  assert.deepEqual(await row.getByLabel('Auditor').locator('option').allInnerTexts(), ['— Choose —', 'Ana Silva', 'Ben Okafor', 'Cara Lund'])
  await row.getByLabel('Auditor').selectOption('Cara Lund')
  await shoot(page, 'builtin-list-row-form')
  await row.getByRole('button', { name: 'Save to Git' }).click()
  await page.getByRole('dialog', { name: 'AUD-0002' }).waitFor()
  await page.keyboard.press('Escape')
  await until(() => pageFile(gh).rows.length === 2, 'the row saved')
  await page.getByRole('dialog', { name: 'AUD-0002' }).waitFor({ state: 'detached' })
  await page.locator('.od-panel table tbody tr', { hasText: 'AUD-0001' }).locator('td', { hasText: 'Supplier audit' }).click()
  const first = page.getByRole('dialog', { name: 'AUD-0001' })
  await first.waitFor()
  await first.getByRole('button', { name: 'Edit', exact: true }).click()
  await first.getByLabel('Auditor').selectOption('Ben Okafor')
  await first.getByRole('button', { name: 'Save to Git' }).click()
  await first.locator('.od-row-values').waitFor()
  await until(() => pageFile(gh).rows[0].cells[auditorId] === 'Ben Okafor', 'the first row saved')
  await page.keyboard.press('Escape')
  await first.waitFor({ state: 'detached' })
  assert.deepEqual(pageFile(gh).rows.map((entry) => [entry.cells[auditorId], entry.refs?.[auditorId]]), [['Ben Okafor', ['b2b2b2b2-0000-4000-8000-00000000000b']], ['Cara Lund', ['c3c3c3c3-0000-4000-8000-00000000000c']]])

  // 4. Refresh: Dev Rao added, Cara Lund removed, Ben Okafor renamed (same id), a second Ana Silva — shown before Save to Git.
  state.members = [ana, { ...ben, displayName: 'Ben Okafor-Smith' }, dev, anaTwin]
  panel = await openLists(page)
  assert.match(await text(panel.locator('tbody tr')), /Audits: Auditor/)
  await panel.getByRole('button', { name: 'Refresh QE team' }).click()
  dialog = page.getByRole('dialog', { name: 'Refresh QE team' })
  await dialog.getByText('2 added · 1 removed · 1 renamed · 1 unchanged').waitFor()
  assert.equal(await text(dialog.getByRole('list', { name: 'Added' })), 'Ana Silva ana.silva2@example.com Dev Rao dev.rao@example.com')
  assert.equal(await text(dialog.getByRole('list', { name: 'Removed' })), 'Cara Lund', 'a removed person: no email (none is kept)')
  assert.equal(await text(dialog.getByRole('list', { name: 'Renamed' })), 'Ben Okafor → Ben Okafor-Smith ben.okafor@example.com')
  await dialog.getByText('1 row uses a removed person: the value is kept and shown as “not in the list”.').waitFor()
  await shoot(page, 'builtin-list-refresh-diff')
  await dialog.getByRole('button', { name: 'Save to Git' }).click()
  await dialog.waitFor({ state: 'detached' })
  await until(() => listsFile(gh).lists[0].items.length === 4 && listsFile(gh).lists[0].items.some((item) => item.name === 'Dev Rao'), 'the refresh saved')
  assert.deepEqual(listsFile(gh).lists[0].log.map((entry) => entry.action), ['created', 'refreshed'])
  assert.deepEqual(listsFile(gh).lists[0].log[1].renamed, ['Ben Okafor → Ben Okafor-Smith'])
  await panel.getByRole('button', { name: 'Log of QE team' }).click()
  const log = page.getByRole('dialog', { name: 'Log of QE team' })
  assert.match(await text(log), /Refreshed .* Added: Ana Silva, Dev Rao Removed: Cara Lund Renamed: Ben Okafor → Ben Okafor-Smith Created · .* Added: Ana Silva, Ben Okafor, Cara Lund/)
  await log.getByRole('button', { name: 'Close', exact: true }).last().click()

  // The table: the renamed person under the new name, the removed one kept and marked.
  await navigate(page, 'Audits')
  const table = page.locator('.od-panel table')
  await table.locator('tbody tr', { hasText: 'AUD-0001' }).filter({ hasText: 'Ben Okafor-Smith' }).waitFor()
  assert.match(await text(table.locator('tbody tr', { hasText: 'AUD-0002' })), /Cara Lund not in the list/)

  // 5. Replace…: the removed person's row handed over to Dev Rao (a value of the list).
  const menu = await menuOf(page, 'page Audits')
  await menu.getByRole('menuitem', { name: 'Replace…' }).click()
  const replace = page.getByRole('dialog', { name: 'Replace a value' })
  await replace.getByLabel('Column', { exact: true }).selectOption({ label: 'Auditor' })
  const find = replace.getByLabel('Find', { exact: true })
  await find.locator('option', { hasText: 'Cara Lund (1 row)' }).waitFor({ state: 'attached' })
  await find.selectOption('Cara Lund')
  await replace.getByLabel('Replace with', { exact: true }).fill('Zed Unknown')
  await replace.getByText('“Zed Unknown” is not in the built-in list of Auditor.', { exact: false }).waitFor()
  assert.equal(await replace.getByRole('button', { name: 'Replace', exact: true }).isDisabled(), true, 'only a value of the list')
  await replace.getByLabel('Replace with', { exact: true }).fill('Dev Rao')
  await replace.getByRole('status', { name: 'Preview' }).getByText('1 row will change').waitFor()
  await replace.getByRole('button', { name: 'Replace', exact: true }).click()
  await replace.waitFor({ state: 'detached' })
  await until(() => pageFile(gh).rows[1].cells[auditorId] === 'Dev Rao', 'the replace saved')
  assert.deepEqual(pageFile(gh).rows[1].refs, { [auditorId]: ['d4d4d4d4-0000-4000-8000-00000000000d'] })
  await table.locator('tbody tr', { hasText: 'AUD-0002' }).filter({ hasText: 'Dev Rao' }).waitFor()

  // 6. Download Excel template…: the Auditor column's data validation is the list as it is now.
  const templateMenu = await menuOf(page, 'page Audits')
  await templateMenu.getByRole('menuitem', { name: 'Download Excel template…' }).click()
  const template = page.getByRole('dialog', { name: 'Download Excel template' })
  const [download] = await Promise.all([page.waitForEvent('download'), template.getByRole('button', { name: 'Download template', exact: true }).click()])
  const files = await unzip(new Uint8Array(readFileSync(await download.path())))
  const sheet = new TextDecoder().decode(files.get('xl/worksheets/sheet1.xml'))
  assert.match(sheet, /<dataValidation type="list"[^>]*sqref="C2:C2001"><formula1>&quot;Ana Silva \(#a1a1\),Ana Silva \(#e5e5\),Ben Okafor-Smith,Dev Rao&quot;<\/formula1>/)
  assert.match(sheet, /Choose one value of the built-in list\./)

  // Read only from Azure DevOps: the team read three times, nothing written there.
  assert.deepEqual(state.writes, [])
  assert.ok(state.reads.filter((entry) => entry === 'Project/QE Team').length >= 2)
  assert.equal(JSON.stringify(gh.read('shared-lists.json')).includes('x'.repeat(52)), false, 'no PAT in Git')
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-LST-10: without “Manage built-in lists” the lists are read only with the reason; a co-owner of an On-Demand page refreshes them but cannot remove one', async () => {
  const list = { id: 'qe-team', name: 'QE team', source: { kind: 'azure-team', server: 'https://dev.azure.com/example', project: 'Project', team: 'QE Team' }, items: [{ name: 'Ana Silva', id: 'a1a1a1a1-0000-4000-8000-00000000000a' }], createdBy: 'Tom Owner', createdAt: '2026-11-20T08:00:00.000Z', refreshedAt: '2026-11-20T08:00:00.000Z', refreshedBy: 'Tom Owner', log: [] }
  const gh = repository({ 'shared-lists.json': `${JSON.stringify({ schema: 1, kind: 'shared-lists', lists: [list] }, null, 1)}\n` })
  const state = { members: [ana, ben], reads: [], writes: [] }
  // A Team Member: everything shown, nothing allowed, each with the reason (SET-31: read only, not hidden).
  let { page, context, errors } = await open(gh, member, state)
  let panel = await openLists(page)
  await panel.locator('tbody tr', { hasText: 'QE team' }).waitFor()
  for (const name of ['＋ New list…', 'Refresh QE team', 'Edit QE team', 'Remove QE team']) assert.equal(await panel.getByRole('button', { name }).isDisabled(), true, `${name} is disabled`)
  assert.match(await text(panel.locator('.write-blocked').first()), /Your role does not allow “Manage built-in lists.*Co-owners of an On-Demand page can create and refresh lists too\./)
  assert.equal(await panel.getByRole('button', { name: 'Log of QE team' }).isDisabled(), false, 'the log is open to everyone')
  assert.deepEqual(errors, [])
  await context.close();
  // A Team Member who co-owns the page "Audits": Refresh… allowed, Remove not.
  ({ page, context, errors } = await open(gh, owner, state))
  panel = await openLists(page)
  await panel.locator('tbody tr', { hasText: 'QE team' }).waitFor()
  await until(async () => !(await panel.getByRole('button', { name: 'Refresh QE team' }).isDisabled()), 'Refresh allowed for the page co-owner')
  assert.match(await panel.getByRole('button', { name: 'Remove QE team' }).getAttribute('title'), /A page co-owner cannot remove a list/)
  await panel.getByRole('button', { name: 'Refresh QE team' }).click()
  const dialog = page.getByRole('dialog', { name: 'Refresh QE team' })
  await dialog.getByText('1 added · 0 removed · 0 renamed · 1 unchanged').waitFor()
  await dialog.getByRole('button', { name: 'Save to Git' }).click()
  await dialog.waitFor({ state: 'detached' })
  await until(() => listsFile(gh).lists[0].items.length === 2, 'the refresh saved')
  assert.deepEqual(errors, [])
  await context.close()
})
