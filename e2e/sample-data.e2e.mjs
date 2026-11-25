import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { navigate, openPage, rolesFile, startApp, text } from './helpers.mjs'

// Live | Sample on a table page (OND-63…OND-67) against a mocked GitHub: the Tool Owner switches CoNQ to Sample — the
// banner, 50 made-up rows on the Data tab and in the Insights charts, every change disabled with the reason, nothing
// written to Git, the choice kept after a reload; Live shows the real rows again (TC-OND-54, UAT).
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const columns = [
  { id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Complaint'] },
  { id: 'c2', name: 'Cost', type: 'currency', currency: 'EUR' },
  { id: 'c3', name: 'Found on', type: 'date' },
]
const rows = [['Scrap', '100 EUR', '2026-01-10'], ['Rework', '250 EUR', '2026-02-10'], ['Complaint', '75 EUR', '2026-03-10']]
  .map(([category, cost, date], index) => ({ id: `r${index + 1}`, seq: index + 1, key: `CONQ-260101-AAA${index + 2}`, cells: { c1: category, c2: cost, c3: date } }))
const insights = [
  { id: 'i1', title: 'Cost by category', type: 'bar', category: 'c1', measure: 'sum', value: 'c2', sort: 'value' },
  { id: 'i2', title: 'Rows', type: 'kpi', category: '', measure: 'count', sort: 'value' },
]
const conq = { schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ', description: 'Cost of Non-Quality', keyPrefix: 'CONQ', columns, rows, insights }

const gitStorage = () => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'test-token')
}
async function mockGitHub(context, files) {
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
    if (request.method() === 'PUT' || request.method() === 'DELETE') {
      if (path === '.demand-planning-write-check') return json({ message: 'Invalid request' }, 422)
      writes.push({ path, method: request.method() })
      const body = JSON.parse(request.postData() ?? '{}')
      if (body.content) files[path] = Buffer.from(body.content, 'base64').toString()
      return json({ content: { sha: `v${writes.length}` }, commit: { html_url: `https://github.com/example/storage/commit/v${writes.length}` } })
    }
    if (path === 'access.json') return json(rolesFile('Tool Owner'))
    const folder = Object.keys(files).filter((file) => file.startsWith(`${path}/`))
    if (folder.length) return json(folder.map((file) => ({ type: 'file', name: file.slice(path.length + 1), path: file, sha: `s${files[file].length}` })))
    if (files[path] != null) return json({ type: 'file', encoding: 'base64', content: Buffer.from(files[path]).toString('base64'), sha: `s${files[path].length}` })
    return json({ message: 'Not Found' }, 404)
  })
  return writes
}

const toggle = (page) => page.getByRole('group', { name: 'Data shown on CoNQ' })
const status = (page) => page.locator('.on-demand-page .data-table-status').first()
const panel = (page, title) => page.locator('.od-insight', { has: page.locator('h2', { hasText: title }) })

test('TC-OND-54: Sample on CoNQ — the banner, 50 made-up rows in the table and the charts, changes disabled with the reason, nothing written to Git, the choice kept after a reload', async () => {
  const files = { 'on-demand/conq.json': JSON.stringify(conq) }
  const { page, context, errors } = await openPage(app, { init: gitStorage })
  const writes = await mockGitHub(context, files)
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, 'CoNQ')
  await page.locator('code.od-key', { hasText: 'CONQ-0003' }).waitFor()
  // OND-63: Live is the default.
  assert.equal(await toggle(page).getByRole('button', { name: 'Live' }).getAttribute('aria-pressed'), 'true')
  assert.equal(await page.locator('.od-sample-banner').count(), 0)

  await toggle(page).getByRole('button', { name: 'Sample' }).click()
  // OND-65: the banner; OND-64: 50 rows, SAMPLE-0001…
  await page.locator('.od-sample-banner', { hasText: 'Sample data — nothing is saved.' }).waitFor()
  await page.locator('code.od-key', { hasText: 'SAMPLE-0001' }).first().waitFor()
  assert.match(await text(status(page)), /^50 of 50 rows$/)
  assert.equal(await page.locator('code.od-key', { hasText: 'CONQ-0001' }).count(), 0, 'the real rows are not shown')
  // OND-66: Edit, Hide, ＋ Add row and Set up columns… disabled with the reason (CON-102).
  const edit = page.getByRole('button', { name: /^Edit row / }).first()
  assert.equal(await edit.isDisabled(), true)
  assert.match(await edit.getAttribute('title'), /^Sample data is shown: nothing is saved\. Switch CoNQ to Live to change it\.$/)
  assert.equal(await page.getByRole('button', { name: '＋ Add row' }).isDisabled(), true)
  assert.equal(await page.getByRole('button', { name: 'Set up columns…' }).isDisabled(), true)
  assert.equal(await page.getByRole('button', { name: /^Hide row / }).first().isDisabled(), true)

  // The Insights: the same charts over the sample rows; adding a chart is disabled.
  await page.getByRole('tab', { name: /^Insights/ }).click()
  await panel(page, 'Cost by category').locator('svg[role="img"]').waitFor()
  assert.equal(await text(page.locator('.od-kpi-card', { hasText: 'Rows' }).locator('.od-kpi strong')), '50')
  assert.equal(await page.getByRole('button', { name: '＋ Add chart / table' }).isDisabled(), true)
  assert.equal(await page.locator('.od-sample-banner').count(), 1, 'the banner on the Insights tab too')

  // Nothing of the page was written to Git.
  assert.equal(writes.filter((write) => write.path.startsWith('on-demand/')).length, 0)

  // The choice is kept after a reload.
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, 'CoNQ')
  await page.locator('.od-sample-banner').waitFor()
  assert.equal(await toggle(page).getByRole('button', { name: 'Sample' }).getAttribute('aria-pressed'), 'true')

  // Live again: the real rows and charts.
  await toggle(page).getByRole('button', { name: 'Live' }).click()
  await page.locator('.od-sample-banner').waitFor({ state: 'detached' })
  await page.getByRole('tab', { name: /^Data/ }).click()
  await page.locator('code.od-key', { hasText: 'CONQ-0003' }).waitFor()
  assert.match(await text(status(page)), /^3 of 3 rows$/)
  assert.equal(writes.filter((write) => write.path.startsWith('on-demand/')).length, 0)
  assert.deepEqual(errors, [])
  await context.close()
})
