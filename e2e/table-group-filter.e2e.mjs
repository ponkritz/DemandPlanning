import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { navigate, openPage, startApp, text } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'

// Group by and Filter by column on an On-Demand Table page (UI-25…UI-28, OND-132; TC-UI-20 UAT, TC-UI-23, TC-OND-103)
// against a mocked GitHub, with synthetic rows: the Tool Owner groups the table by State, then Assignee, filters Sites
// and saves the view for everyone with "Start collapsed"; another person sees only the State groups, opens one, changes
// their own filter, and Reset layout brings back the owner's view; Expand all / Collapse all; a row opens from a group;
// Export writes the filtered rows in the order of the groups. Every step waits for what it needs, never for a time, so it
// also holds on a slow CPU (E2E_CPU_SLOWDOWN=4).
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const columns = [
  { id: 'c1', name: 'Title', type: 'text' },
  { id: 'c2', name: 'State', type: 'dropdown', options: ['New', 'Active', 'Closed'] },
  { id: 'c3', name: 'Assignee', type: 'text' },
  { id: 'c4', name: 'Sites', type: 'multi', options: ['Berlin', 'Leeds', 'Lyon'] },
]
const data = [
  ['Pump seal check', 'Active', 'Rita Gomez', ['Berlin']],
  ['Valve audit', 'Active', 'Omar Haddad', ['Berlin', 'Leeds']],
  ['Label review', 'New', 'Rita Gomez', ['Berlin']],
  ['Torque spec', 'Closed', 'Omar Haddad', ['Leeds']],
  ['Gasket trial', 'Active', '', ['Berlin']],
  ['Sensor drift', '', 'Rita Gomez', ['Berlin', 'Lyon']],
  ['Hose routing', 'New', 'Omar Haddad', ['Lyon']],
]
const rows = data.map(([title, state, assignee, sites], index) => ({ id: `r${index + 1}`, seq: index + 1, cells: { c1: title, ...(state ? { c2: state } : {}), ...(assignee ? { c3: assignee } : {}), c4: sites } }))
const conq = { schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ', description: 'Synthetic test rows', keyPrefix: 'CONQ', columns, rows, insights: [] }
const policy = defaultPolicy()
policy.defaultRole = 'Team Member'
policy.members = { 'owner@example.com': ['Tool Owner'] }
const defaultsFile = 'personal-views-defaults.json'
const tableKey = 'table:on-demand:conq'

const until = async (check, what) => { for (const end = Date.now() + 60000; Date.now() < end;) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 50)) } assert.fail(`timed out waiting for ${what}`) }
const shared = (gh) => { const file = gh.read(defaultsFile); return file ? JSON.parse(file).filters ?? {} : {} }

async function open(gh, email) {
  const { page, context, errors } = await openPage(app, { width: 1440, height: 1000, init: ({ who }) => {
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', who)
  }, initArg: { who: email } })
  await context.route('https://api.github.com/**', gh.route)
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors }
}
async function openConq(page) {
  await navigate(page, 'CoNQ')
  const table = page.locator('.on-demand-page .data-table').first()
  await table.locator('tbody tr').first().waitFor()
  return table
}
// What the table body shows: group rows as "▸ State: Active 3 rows" (indented by level), data rows by their Title.
const body = (table) => table.locator('tbody tr').evaluateAll((list) => list.map((row) => row.classList.contains('data-table-group')
  ? `${'  '.repeat(Number(row.dataset.groupDepth))}${row.innerText.replace(/\s+/g, ' ').trim()}`
  : row.querySelectorAll('td')[2]?.innerText.trim() ?? row.innerText.trim()))
const group = (table, name) => table.locator('tr.data-table-group').getByRole('button', { name })

test('TC-UI-20: the Tool Owner saves Group by State → Assignee, a column filter and Start collapsed for everyone; another person sees it collapsed, opens a group, changes their own filter, and Reset layout brings the owner’s view back', async () => {
  const gh = fakeGitHub({ files: { 'access.json': serializeAccess(policy), 'on-demand/conq.json': JSON.stringify(conq) } })
  const owner = await open(gh, 'owner@example.com')
  let table = await openConq(owner.page)
  const bar = table.getByRole('group', { name: 'Group and filter the table' })
  assert.equal(await table.locator('tbody tr[data-row-key]').count(), 7, 'no grouping, no filter: every row')
  // Group by State, then by Assignee (the "then by" list leaves State out).
  await bar.getByRole('combobox', { name: 'Group by' }).selectOption({ label: 'State' })
  const second = bar.getByRole('combobox', { name: 'Group level 2' })
  assert.equal(await second.locator('option', { hasText: 'State' }).count(), 0, 'a column is grouped once')
  assert.equal(await bar.getByRole('combobox', { name: 'Group by' }).locator('option', { hasText: /^ID$|^Key$/ }).count(), 0, 'one group per row: not offered')
  await second.selectOption({ label: 'Assignee' })
  await table.locator('tr.data-table-group[data-group-depth="1"]').first().waitFor()
  // Filter by column: Sites (a Multi-select) is a pick list; Berlin keeps the rows that have Berlin among their sites.
  await bar.getByRole('button', { name: 'Filter by column' }).click()
  const sites = table.getByRole('combobox', { name: 'Filter Sites' })
  assert.deepEqual(await sites.locator('option').allInnerTexts(), ['All', 'Berlin', 'Leeds', 'Lyon'])
  await sites.selectOption('Berlin')
  await until(async () => (await table.locator('tbody tr[data-row-key]').count()) === 5, 'the Berlin rows')
  assert.match(await text(bar), /5 of 7 rows match the column filter on Sites/)
  assert.match(await text(table.locator('.data-table-status')), /^5 of 7 rows/, 'the count of the matching rows')
  assert.deepEqual(await body(table), [
    '▾ State: Active 3 rows', '  ▾ Assignee: Omar Haddad 1 row', 'Valve audit', '  ▾ Assignee: Rita Gomez 1 row', 'Pump seal check', '  ▾ Assignee: (blank) 1 row', 'Gasket trial',
    '▾ State: New 1 row', '  ▾ Assignee: Rita Gomez 1 row', 'Label review',
    '▾ State: (blank) 1 row', '  ▾ Assignee: Rita Gomez 1 row', 'Sensor drift',
  ], 'nested, natural order, (blank) last, a count per group')
  // Save view for everyone: the pop-up names the grouping and the filter and offers Start collapsed.
  await table.getByRole('button', { name: /^Columns/ }).click()
  await table.locator('fieldset.column-chooser').getByRole('button', { name: 'Save view for everyone' }).click()
  const dialog = owner.page.getByRole('dialog', { name: 'Save view for everyone' })
  await dialog.waitFor()
  assert.match(await text(dialog), /Group by: State → Assignee\./)
  assert.match(await text(dialog), /Column filters: Sites “Berlin”\./)
  const collapsed = dialog.getByRole('checkbox', { name: 'Start collapsed' })
  assert.equal(await collapsed.isChecked(), false, 'open expanded unless chosen')
  await collapsed.check()
  await dialog.getByRole('button', { name: 'Save view for everyone' }).click()
  await until(() => Boolean(shared(gh)[tableKey]), 'the view for everyone written to Git')
  const saved = shared(gh)[tableKey]
  assert.deepEqual(saved.groupBy, ['c2', 'c3'])
  assert.deepEqual(saved.filters, { c4: 'Berlin' })
  assert.equal(saved.startCollapsed, true)
  assert.deepEqual(owner.errors, [])
  await owner.context.close()

  // Someone else (no right to save) opens the table for the first time: only the State groups, closed.
  const member = await open(gh, 'member@example.com')
  table = await openConq(member.page)
  await until(async () => (await table.locator('tr.data-table-group').count()) === 3 && (await table.locator('tbody tr[data-row-key]').count()) === 0, 'the outermost groups only')
  assert.deepEqual(await body(table), ['▸ State: Active 3 rows', '▸ State: New 1 row', '▸ State: (blank) 1 row'])
  assert.equal(await table.getByRole('combobox', { name: 'Filter Sites' }).inputValue(), 'Berlin', 'the filter for everyone, its row shown')
  // Open State: Active → its Assignee groups, still closed; open one → its row.
  await group(table, /State: Active/).click()
  await group(table, /Assignee: Rita Gomez/).first().waitFor()
  assert.equal(await group(table, /State: Active/).getAttribute('aria-expanded'), 'true')
  await group(table, /Assignee: Rita Gomez/).first().click()
  await table.locator('tbody tr[data-row-key]').first().waitFor()
  assert.deepEqual(await body(table), ['▾ State: Active 3 rows', '  ▸ Assignee: Omar Haddad 1 row', '  ▾ Assignee: Rita Gomez 1 row', 'Pump seal check', '  ▸ Assignee: (blank) 1 row', '▸ State: New 1 row', '▸ State: (blank) 1 row'])
  // Their own filter: Sites = Leeds — their own view, kept after a reload.
  await table.getByRole('combobox', { name: 'Filter Sites' }).selectOption('Leeds')
  await until(async () => (await body(table)).join('|').includes('State: Closed'), 'the Leeds rows')
  assert.deepEqual(await body(table), ['▾ State: Active 1 row', '  ▸ Assignee: Omar Haddad 1 row', '▸ State: Closed 1 row'], 'the groups of the Leeds rows; State: Active stays open as I left it')
  const reset = table.getByRole('button', { name: 'Reset layout' })
  await reset.waitFor()
  await member.page.reload()
  table = await openConq(member.page)
  await until(async () => await table.getByRole('combobox', { name: 'Filter Sites' }).inputValue() === 'Leeds', 'my own filter after a reload')
  // Reset layout: the view for everyone again — Berlin, State → Assignee, collapsed.
  await table.getByRole('button', { name: 'Reset layout' }).click()
  await until(async () => await table.getByRole('combobox', { name: 'Filter Sites' }).inputValue() === 'Berlin', 'the filter for everyone again')
  assert.deepEqual(await body(table), ['▸ State: Active 3 rows', '▸ State: New 1 row', '▸ State: (blank) 1 row'])
  assert.equal(await table.getByRole('button', { name: 'Reset layout' }).count(), 0)
  assert.deepEqual(member.errors, [])
  await member.context.close()
})

test('TC-UI-23: Expand all opens every level, Collapse all leaves the outermost group rows; each is disabled when there is nothing to do', async () => {
  const gh = fakeGitHub({ files: { 'access.json': serializeAccess(policy), 'on-demand/conq.json': JSON.stringify(conq) } })
  const member = await open(gh, 'member@example.com')
  const table = await openConq(member.page)
  const bar = table.getByRole('group', { name: 'Group and filter the table' })
  assert.equal(await bar.getByRole('button', { name: 'Expand all' }).count(), 0, 'no grouping: no Expand all')
  await bar.getByRole('combobox', { name: 'Group by' }).selectOption({ label: 'State' })
  await bar.getByRole('combobox', { name: 'Group level 2' }).selectOption({ label: 'Assignee' })
  const expand = bar.getByRole('button', { name: 'Expand all' }), collapse = bar.getByRole('button', { name: 'Collapse all' })
  await expand.waitFor()
  assert.equal(await expand.isDisabled(), true, 'all open: nothing to expand')
  assert.equal(await collapse.isDisabled(), false)
  await collapse.click()
  await until(async () => (await table.locator('tbody tr[data-row-key]').count()) === 0, 'every level closed')
  assert.deepEqual(await body(table), ['▸ State: Active 3 rows', '▸ State: Closed 1 row', '▸ State: New 2 rows', '▸ State: (blank) 1 row'])
  assert.equal(await collapse.isDisabled(), true, 'all closed: nothing to collapse')
  assert.equal(await expand.isDisabled(), false)
  // One group opened: both can act.
  await group(table, /State: New/).click()
  await group(table, /Assignee: Omar Haddad/).first().waitFor()
  assert.equal(await expand.isDisabled() || await collapse.isDisabled(), false)
  await expand.click()
  await until(async () => (await table.locator('tbody tr[data-row-key]').count()) === 7, 'every row again')
  assert.equal(await expand.isDisabled(), true)
  // Removing the grouping: the plain table, no Expand all.
  await bar.getByRole('combobox', { name: 'Group by' }).selectOption({ label: 'No grouping' })
  await until(async () => (await table.locator('tr.data-table-group').count()) === 0, 'no group rows')
  assert.equal(await expand.count(), 0)
  assert.deepEqual(member.errors, [])
  await member.context.close()
})

test('TC-OND-103: on a grouped and filtered On-Demand table a row opens in the drawer with Previous / Next in the order shown, a text filter works with the search, and Export writes the filtered rows in the order of the groups', async () => {
  const gh = fakeGitHub({ files: { 'access.json': serializeAccess(policy), 'on-demand/conq.json': JSON.stringify(conq) } })
  const member = await open(gh, 'member@example.com')
  const table = await openConq(member.page)
  const bar = table.getByRole('group', { name: 'Group and filter the table' })
  await bar.getByRole('combobox', { name: 'Group by' }).selectOption({ label: 'Sites' })
  // A Multi-select row is under each of its sites (Valve audit: Berlin and Leeds); the counts say so.
  await table.locator('tr.data-table-group').first().waitFor()
  assert.deepEqual((await body(table)).filter((line) => /^[▸▾]/.test(line)), ['▾ Sites: Berlin 5 rows', '▾ Sites: Leeds 2 rows', '▾ Sites: Lyon 2 rows'])
  // A text filter (contains, any case) with the search: Assignee "rita", then the search "seal".
  await bar.getByRole('button', { name: 'Filter by column' }).click()
  await table.getByRole('searchbox', { name: 'Filter Assignee' }).fill('rita')
  await until(async () => (await text(table.locator('.data-table-status'))).startsWith('3 of 7'), 'the Rita rows')
  assert.deepEqual(await body(table), ['▾ Sites: Berlin 3 rows', 'Pump seal check', 'Label review', 'Sensor drift', '▾ Sites: Lyon 1 row', 'Sensor drift'])
  // The row opens in the drawer; Previous / Next follow the rows shown, each once.
  await table.locator('tbody tr[data-row-key]', { hasText: 'Label review' }).click()
  const drawer = member.page.getByRole('dialog').filter({ hasText: 'CONQ-0003' })
  await drawer.waitFor()
  assert.match(await text(drawer), /2 of 3/)
  await drawer.getByRole('button', { name: 'Close', exact: true }).first().click()
  await drawer.waitFor({ state: 'detached' })
  const search = member.page.getByRole('searchbox', { name: 'Search CoNQ' })
  await search.fill('seal')
  await until(async () => (await text(table.locator('.data-table-status'))).startsWith('1 of 7'), 'search and filter together')
  await search.fill('')
  await until(async () => (await text(table.locator('.data-table-status'))).startsWith('3 of 7'), 'the filter alone again')
  // Export (CSV): the 3 filtered rows once each, in the order of the groups; Sites is a column of the file.
  await table.getByRole('button', { name: /^Export/ }).click()
  const [download] = await Promise.all([member.page.waitForEvent('download'), member.page.getByRole('menuitem', { name: 'CSV (.csv)' }).click()])
  const csv = (await readFile(await download.path(), 'utf8')).replace(/^﻿/, '').trim().split(/\r?\n/)
  assert.match(csv[0], /^ID,Key,Title,State,Assignee,Sites,/)
  assert.deepEqual(csv.slice(1).map((line) => line.split(',')[2]), ['Pump seal check', 'Label review', 'Sensor drift'])
  assert.deepEqual(member.errors, [])
  await member.context.close()
})

test('TC-UI-25: rows in a closed group are left out of Export and of Previous / Next (also from Edit), and come back when the group is opened', async () => {
  const gh = fakeGitHub({ files: { 'access.json': serializeAccess(policy), 'on-demand/conq.json': JSON.stringify(conq) } })
  const member = await open(gh, 'owner@example.com') // Edit needs the right to edit rows
  const table = await openConq(member.page)
  const bar = table.getByRole('group', { name: 'Group and filter the table' })
  await bar.getByRole('combobox', { name: 'Group by' }).selectOption({ label: 'State' })
  await group(table, /State: Active/).click()
  await until(async () => (await table.locator('tbody tr[data-row-key]').count()) === 4, 'State: Active closed')
  assert.deepEqual(await body(table), ['▸ State: Active 3 rows', '▾ State: Closed 1 row', 'Torque spec', '▾ State: New 2 rows', 'Label review', 'Hose routing', '▾ State: (blank) 1 row', 'Sensor drift'])
  assert.match(await text(table.locator('.data-table-status')), /^7 of 7 rows/, 'the count still holds every matching row')
  // Export says what it leaves out and writes only the rows shown.
  const exportButton = table.getByRole('button', { name: /^Export/ })
  assert.equal(await exportButton.getAttribute('title'), 'Exports the 4 rows shown (3 rows in closed groups left out)')
  const exportCsv = async () => {
    await exportButton.click()
    const [download] = await Promise.all([member.page.waitForEvent('download'), member.page.getByRole('menuitem', { name: 'CSV (.csv)' }).click()])
    return (await readFile(await download.path(), 'utf8')).replace(/^﻿/, '').trim().split(/\r?\n/).slice(1).map((line) => line.split(',')[2])
  }
  await exportButton.click()
  assert.equal(await text(member.page.getByRole('menu').getByRole('note')), 'Exports the 4 rows shown (3 rows in closed groups left out).')
  await exportButton.click()
  assert.deepEqual(await exportCsv(), ['Torque spec', 'Label review', 'Hose routing', 'Sensor drift'])
  // Previous / Next over the 4 rows shown, from a row click and from the row's Edit button.
  const drawer = member.page.locator('aside.drawer[role="dialog"]')
  await table.locator('tbody tr[data-row-key]', { hasText: 'Label review' }).click()
  await drawer.waitFor()
  await until(async () => /CONQ-0003/.test(await text(drawer)) && /2 of 4/.test(await text(drawer)), 'Label review, 2 of 4')
  await drawer.getByRole('button', { name: 'Next row' }).click()
  await until(async () => /CONQ-0007/.test(await text(drawer)) && /3 of 4/.test(await text(drawer)), 'Hose routing, 3 of 4')
  await drawer.getByRole('button', { name: 'Previous row' }).click()
  await drawer.getByRole('button', { name: 'Previous row' }).click()
  await until(async () => /CONQ-0004/.test(await text(drawer)) && /1 of 4/.test(await text(drawer)), 'Torque spec first: the Active rows skipped')
  await drawer.getByRole('button', { name: 'Close', exact: true }).first().click()
  await drawer.waitFor({ state: 'detached' })
  await table.getByRole('button', { name: /^Edit row Hose routing/ }).click()
  await drawer.waitFor()
  await until(async () => /3 of 4/.test(await text(drawer)), 'Edit: Previous / Next in the order shown')
  await drawer.getByRole('button', { name: 'Cancel' }).click()
  await member.page.keyboard.press('Escape')
  await drawer.waitFor({ state: 'detached' })
  // Opening the group brings its rows back into Export.
  await group(table, /State: Active/).click()
  await until(async () => (await table.locator('tbody tr[data-row-key]').count()) === 7, 'every row again')
  assert.equal(await exportButton.getAttribute('title'), null, 'nothing left out: no note')
  assert.deepEqual(await exportCsv(), ['Pump seal check', 'Valve audit', 'Gasket trial', 'Torque spec', 'Label review', 'Hose routing', 'Sensor drift'])
  assert.deepEqual(member.errors, [])
  await member.context.close()
})
