import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { menuOf, navigate, startApp, text } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'

// Replace… (QEM-13, OND-100…OND-102; TC-QEM-10 and TC-OND-98, UAT): a QE who leaves hands their releases over to one
// person — on QE Mapping and on an On-Demand Table page, "Alex Example" is replaced with "Sam Example" in the QE column:
// the preview counts the rows, Replace saves to the mocked GitHub (e2e/fakeGitHub.mjs) at once. Synthetic data only;
// every step waits for what it needs, never for a time. REPLACE_SHOTS=<folder> saves the screenshots (1440 px, light, scale 2).
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const lead = 'lead@example.com'
const policy = () => { const value = defaultPolicy(); value.defaultRole = 'Team Member'; value.members = { [lead]: ['Tool Owner'] }; return serializeAccess(value) }
const qeMapping = () => JSON.stringify({ schema: 1, kind: 'qe-mapping', sheets: [{ id: 's1', name: 'Resources', columns: [{ id: 'c1', name: 'Platform' }, { id: 'c2', name: 'QE Name' }], rows: [
  { id: 'r1', cells: { c1: 'Alpha Platform', c2: 'Alex Example' } },
  { id: 'r2', cells: { c1: 'Beta Platform', c2: 'Kim Example' } },
  { id: 'r3', cells: { c1: 'Gamma Platform', c2: 'alex example ' } },
  { id: 'r4', cells: { c1: 'Delta Platform', c2: 'Sam Example' } },
] }] })
// The Feature setup names the QE Mapping's QE column (EPS), so Replace… preselects it.
const featureSetup = () => JSON.stringify({ schema: 1, kind: 'feature-setup', epics: [{ epicId: 900001, epicTitle: 'Example Epic', featureDoD: 'Done when reviewed.', stories: [], qeColumns: { matchColumn: 'Platform', qeColumn: 'QE Name' } }] })
const layout = () => JSON.stringify({ schema: 1, kind: 'menu-layout', groups: {}, pages: { 'qe-releases': { type: 'table', group: 'on-demand', order: 1, icon: '▦', owners: [] } } })
const releases = () => JSON.stringify({
  schema: 1, kind: 'on-demand-page', id: 'qe-releases', name: 'QE releases', description: 'Releases and their QE', keyPrefix: 'QER',
  columns: [{ id: 'c1', name: 'Release', type: 'text', options: [], required: true }, { id: 'c2', name: 'QE', type: 'text', options: [], required: false }],
  rows: [
    { id: 'r1', key: 'QER-261120-K7Q2', seq: 1, addedBy: 'ana@example.com', addedAt: '2026-11-20T08:00:00.000Z', cells: { c1: 'Example 1.0', c2: 'Alex Example' } },
    { id: 'r2', key: 'QER-261120-M3P4', seq: 2, addedBy: 'ana@example.com', addedAt: '2026-11-20T08:05:00.000Z', cells: { c1: 'Example 1.1', c2: 'Kim Example' } },
    { id: 'r3', key: 'QER-261120-N4Q5', seq: 3, addedBy: 'ana@example.com', addedAt: '2026-11-20T08:10:00.000Z', cells: { c1: 'Example 2.0', c2: 'ALEX EXAMPLE' } },
  ],
  insights: [],
})
const repository = () => fakeGitHub({ files: { 'access.json': policy(), 'menu-layout.json': layout(), 'qe-mapping.json': qeMapping(), 'feature-setup.json': featureSetup(), 'on-demand/qe-releases.json': releases() } })
const shots = process.env.REPLACE_SHOTS

async function open(gh) {
  const context = await app.browser.newContext({ viewport: { width: shots ? 1440 : 1300, height: 1000 }, deviceScaleFactor: shots ? 2 : 1 })
  await context.addInitScript((work) => {
    localStorage.setItem('demand-planning-setup-guide-v1', 'dismissed')
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', work)
  }, lead)
  await context.route('https://dev.azure.com/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await context.route('https://api.github.com/**', gh.route)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const slowdown = Number(process.env.E2E_CPU_SLOWDOWN ?? 1)
  if (slowdown > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: slowdown })
  // The guide that opens when Azure DevOps cannot be read is closed whenever it shows.
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, () => guide.getByRole('button', { name: 'Close', exact: true }).last().click())
  await page.goto(app.url)
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors }
}
const until = async (check, what) => { for (let i = 0; i < 400; i++) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 50)) } throw new Error(`Timed out waiting for ${what}`) }
async function shoot(page, name) {
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.screenshot({ path: `${shots}/${name}-1440-light.png` })
}

test('TC-QEM-10: on QE Mapping, Replace… hands Alex Example’s rows over to Sam Example — preview count, Replace, saved to Git', async () => {
  const gh = repository()
  const { page, context, errors } = await open(gh)
  await navigate(page, 'QE Mapping')
  await page.locator('.qe-table tbody tr', { hasText: 'Delta Platform' }).waitFor()
  await page.getByRole('button', { name: 'Replace…', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Replace a value' })
  await dialog.waitFor()
  assert.equal(await text(dialog.locator('.eyebrow')), 'QE MAPPING · RESOURCES')
  const column = dialog.getByLabel('Column', { exact: true })
  await until(async () => await column.inputValue() !== '', 'the QE column from the Feature setup')
  assert.equal(await column.locator('option:checked').innerText(), 'QE Name', 'preselected from the Feature setup')
  const find = dialog.getByLabel('Find', { exact: true })
  assert.deepEqual((await find.locator('option').allInnerTexts()).map((entry) => entry.trim()), ['— Choose a value —', 'Alex Example (2 rows)', 'Kim Example (1 row)', 'Sam Example (1 row)', 'Another value (type it)…'])
  await find.selectOption('Alex Example')
  const replace = dialog.getByRole('button', { name: 'Replace', exact: true })
  assert.equal(await replace.isDisabled(), true, 'no new value yet')
  await dialog.getByLabel('Replace with', { exact: true }).fill('Sam Example')
  const preview = dialog.getByRole('status', { name: 'Preview' })
  await preview.getByText('2 rows will change').waitFor()
  assert.match(await text(preview), /Row 1 · Alpha Platform Alex Example Sam Example Row 3 · Gamma Platform alex example Sam Example/)
  await shoot(page, 'replace-qe-mapping')
  await replace.click()
  await dialog.waitFor({ state: 'detached' })
  await page.locator('.notice.success', { hasText: 'Replaced “Alex Example” with “Sam Example” in QE Name: 2 rows of Resources.' }).waitFor()
  const saved = JSON.parse(gh.read('qe-mapping.json'))
  assert.deepEqual(saved.sheets[0].rows.map((row) => row.cells.c2), ['Sam Example', 'Kim Example', 'Sam Example', 'Sam Example'])
  assert.ok(gh.writes.some((entry) => entry.message.includes('QE Mapping: replace “Alex Example” with “Sam Example” in QE Name (Resources, 2 rows)')), `the commit names the change: ${gh.writes.map((entry) => entry.message).join(' | ')}`)
  assert.equal(await page.locator('.qe-table tbody tr', { hasText: 'Alex Example' }).count(), 0)
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-OND-98: on an On-Demand Table page, Replace… in the ⋯ menu replaces the QE in every row — preview, Replace, saved to Git with a History entry per row', async () => {
  const gh = repository()
  const { page, context, errors } = await open(gh)
  await navigate(page, 'QE releases')
  await page.locator('.od-panel table tbody tr', { hasText: 'QER-0003' }).waitFor()
  const menu = await menuOf(page, 'page QE releases')
  await menu.getByRole('menuitem', { name: 'Replace…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Replace a value' })
  await dialog.waitFor()
  assert.equal(await text(dialog.locator('.eyebrow')), 'ON-DEMAND · QE RELEASES')
  await dialog.getByLabel('Column', { exact: true }).selectOption({ label: 'QE' })
  const find = dialog.getByLabel('Find', { exact: true })
  await find.locator('option', { hasText: 'Alex Example (2 rows)' }).waitFor({ state: 'attached' })
  await find.selectOption('Alex Example')
  await dialog.getByLabel('Replace with', { exact: true }).fill('Sam Example')
  const preview = dialog.getByRole('status', { name: 'Preview' })
  await preview.getByText('2 rows will change').waitFor()
  assert.match(await text(preview), /QER-0001 Alex Example Sam Example QER-0003 ALEX EXAMPLE Sam Example/)
  await shoot(page, 'replace-on-demand-table')
  await dialog.getByRole('button', { name: 'Replace', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  await until(() => (gh.read('on-demand/qe-releases.json') ?? '').includes('Replaced “Alex Example” with “Sam Example” in QE'), 'the replace saved to Git')
  const saved = JSON.parse(gh.read('on-demand/qe-releases.json'))
  assert.deepEqual(saved.rows.map((row) => row.cells.c2), ['Sam Example', 'Kim Example', 'Sam Example'])
  assert.deepEqual(saved.rows.map((row) => (row.log ?? []).at(-1)?.comment ?? ''), ['Replaced “Alex Example” with “Sam Example” in QE', '', 'Replaced “Alex Example” with “Sam Example” in QE'])
  assert.equal(saved.rows[0].log.at(-1).by, lead)
  await page.locator('.od-panel table tbody tr', { hasText: 'QER-0003' }).filter({ hasText: 'Sam Example' }).waitFor()
  // The result is in Background jobs.
  await page.locator('.jobs-button').click()
  const jobs = page.getByRole('dialog', { name: 'Background jobs' })
  await jobs.getByText('Replace · QE releases · QE').waitFor()
  assert.match(await text(jobs), /Replaced “Alex Example” with “Sam Example” in QE: 2 rows/)
  assert.deepEqual(errors, [])
  await context.close()
})
