import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { menuOf, navigate, openPage, rolesFile, startApp, text } from './helpers.mjs'

// Export PDF… of the Insights tab in a browser (OND-68…OND-72) against a mocked GitHub: the pop-up (a selection of a
// chart and a KPI card, Letter portrait, the footer's date and time), then the print view with only those, the footer
// "CoNQ · Exported {date, time, zone}" and the @page rule, and the browser's print dialog opened once (window.print is
// replaced by a counter); Close returns to the page (TC-OND-58, UAT).
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const columns = [
  { id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Complaint'] },
  { id: 'c2', name: 'Cost', type: 'number' },
]
const rows = [['Scrap', '100'], ['Rework', '250'], ['Complaint', '75'], ['Scrap', '40']]
  .map(([category, cost], index) => ({ id: `r${index + 1}`, seq: index + 1, key: `CONQ-260101-AAA${index + 2}`, cells: { c1: category, c2: cost } }))
const insights = [
  { id: 'i1', title: 'Cost by category', type: 'bar', category: 'c1', measure: 'sum', value: 'c2', sort: 'value' },
  { id: 'i2', title: 'Rows', type: 'kpi', category: '', measure: 'count', sort: 'value' },
  { id: 'i3', title: 'Share by category', type: 'pie', category: 'c1', measure: 'count', sort: 'value' },
]
const conq = { schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ', description: 'Cost of Non-Quality', keyPrefix: 'CONQ', columns, rows, insights }

const init = () => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'test-token')
  // The browser's print dialog is replaced by a counter (it would block the test).
  window.print = () => { window.__printed = (window.__printed ?? 0) + 1 }
}
async function mockGitHub(context, files) {
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
    if (request.method() !== 'GET') return json({ message: 'Invalid request' }, 422)
    if (path === 'access.json') return json(rolesFile('Tool Owner'))
    const folder = Object.keys(files).filter((file) => file.startsWith(`${path}/`))
    if (folder.length) return json(folder.map((file) => ({ type: 'file', name: file.slice(path.length + 1), path: file, sha: `s${files[file].length}` })))
    if (files[path] != null) return json({ type: 'file', encoding: 'base64', content: Buffer.from(files[path]).toString('base64'), sha: `s${files[path].length}` })
    return json({ message: 'Not Found' }, 404)
  })
}

test('TC-OND-58: Export PDF of the Insights in a browser — the pop-up, a print view with the chosen charts and the footer, the print dialog opened', async () => {
  const { page, context, errors } = await openPage(app, { init })
  await mockGitHub(context, { 'on-demand/conq.json': JSON.stringify(conq) })
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, 'CoNQ')
  await page.getByRole('tab', { name: /^Insights/ }).click()
  await page.locator('.od-insight', { hasText: 'Cost by category' }).locator('svg[role="img"]').waitFor()

  const menu = await menuOf(page, 'Insights')
  await menu.getByRole('menuitem', { name: 'Export PDF…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export PDF' })
  await dialog.waitFor()
  // OND-69: the defaults — all charts, filters on, A4 landscape, date and time ticked.
  assert.equal(await dialog.getByRole('radio', { name: 'All (3)' }).isChecked(), true)
  assert.equal(await dialog.getByRole('checkbox', { name: 'Include the active filters' }).isChecked(), true)
  assert.equal(await dialog.getByLabel('Page size').inputValue(), 'A4')
  assert.equal(await dialog.getByRole('radio', { name: 'Landscape' }).isChecked(), true)
  assert.equal(await dialog.getByRole('checkbox', { name: 'Date of export' }).isChecked(), true)
  assert.equal(await dialog.getByRole('checkbox', { name: 'Time of export' }).isChecked(), true)
  // A selection: the bar chart and the KPI card, not the pie; Letter portrait.
  await dialog.getByRole('radio', { name: 'A selection' }).check()
  await dialog.getByRole('checkbox', { name: 'Share by category' }).uncheck()
  await dialog.getByLabel('Page size').selectOption('Letter')
  await dialog.getByRole('radio', { name: 'Portrait' }).check()
  await dialog.getByRole('button', { name: 'Export PDF' }).click()

  // The print view, then the print dialog once the charts are drawn.
  const view = page.getByRole('dialog', { name: 'Print view of CoNQ' })
  await view.waitFor()
  await page.waitForFunction(() => window.__printed === 1)
  assert.deepEqual(await view.locator('[data-print-item]').evaluateAll((list) => list.map((item) => item.getAttribute('data-print-item'))), ['i2', 'i1'], 'the card first, then the chart; not the pie')
  assert.equal(await view.locator('[data-print-item="i1"] svg[role="img"]').count(), 1, 'the chart as SVG')
  assert.equal(await text(view.locator('[data-print-item="i2"] .od-kpi strong')), '4')
  assert.match(await text(view.locator('.print-footer > span').first()), /^CoNQ · Exported \d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} \S+$/)
  const rule = await view.locator('style').textContent()
  assert.match(rule, /^@page \{ size: Letter portrait; margin: 12mm 12mm 16mm;/)
  const numbered = await page.evaluate(() => typeof window.CSSMarginRule !== 'undefined')
  if (numbered) assert.match(rule, /@bottom-right \{ content: "Page " counter\(page\) " of " counter\(pages\);/)
  // Printed in the light theme, only the sheet: the app itself is hidden in print.
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light')
  await page.emulateMedia({ media: 'print' })
  assert.equal(await page.locator('#root').isVisible(), false)
  assert.equal(await view.locator('.print-toolbar').isVisible(), false)
  await page.emulateMedia({ media: 'screen' })

  await view.getByRole('button', { name: 'Close' }).click()
  await view.waitFor({ state: 'detached' })
  assert.equal(await page.evaluate(() => document.body.classList.contains('printing')), false)
  assert.deepEqual(errors, [])
  await context.close()
})
