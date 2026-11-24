import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { editorTab, infoText, navigate, openPage, rolesFile, startApp, text } from './helpers.mjs'

// Chart elements (CHT-26…CHT-35) and KPI cards (CHT-36…CHT-39) against a mocked GitHub: on CoNQ's Insights tab the owner
// sets a pie's data labels to Outside End with Value and Percentage, and a bar chart's legend Right, a major horizontal
// gridline, a data table and a linear trendline — saved to Git (TC-CHT-29, UAT); a viewer sees them and switches the
// data labels for themselves (TC-CHT-30); KPI charts as a row of cards, the value never cut, the pop-up's preview beside
// the form without overlapping it, and no chart type above a chart (TC-CHT-31).
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const year = new Date().getUTCFullYear()
const columns = [
  { id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Complaint', 'Label', 'Seal', 'Late', 'Damage'] },
  { id: 'c2', name: 'Sites', type: 'multi', options: ['Berlin', 'Leeds', 'Lyon'] },
  { id: 'c3', name: 'Cost (EUR)', type: 'number' },
  { id: 'c4', name: 'Found on', type: 'date' },
  { id: 'c5', name: 'Budget spent for fixing the issue/defect? [EUROS]', type: 'currency', currency: 'EUR' },
]
// Count by category: Rework 3, Scrap 2, Complaint 2, Label 1, Seal 1, Late 1, Damage 1 (11 rows).
const rows = [
  ['Rework', ['Berlin', 'Lyon'], '1200'], ['Rework', ['Berlin'], '450'], ['Rework', ['Leeds'], '300'], ['Scrap', ['Leeds'], '600'], ['Scrap', ['Berlin'], '400'],
  ['Complaint', ['Lyon'], '500'], ['Complaint', ['Berlin'], '200'], ['Label', ['Leeds'], '350'], ['Seal', ['Berlin'], '250'], ['Late', ['Lyon'], '150'], ['Damage', ['Berlin'], '100'],
].map(([category, sites, cost], index) => ({ id: `r${index + 1}`, seq: index + 1, cells: { c1: category, c2: sites, c3: cost, c4: `${year}-0${1 + index % 9}-10`, c5: `${Number(cost) * 2755}.55 EUR` } }))
const conq = (insights = []) => ({ schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ', description: 'Cost of Non-Quality', keyPrefix: 'CONQ', columns, rows, insights })

const gitStorage = () => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'test-token')
}
async function mockGitHub(context, files, role = 'Tool Owner') {
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
      writes.push({ path, data: JSON.parse(files[path]) })
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
async function open(files, role, width = 1300) {
  const { page, context, errors } = await openPage(app, { init: gitStorage })
  const writes = await mockGitHub(context, files, role)
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, 'CoNQ')
  await page.getByRole('tab', { name: /^Insights/ }).click()
  if (width !== 1300) await page.setViewportSize({ width, height: 900 })
  return { page, context, errors, writes }
}
const panel = (page, title) => page.locator('.od-insight', { has: page.locator('h2', { hasText: title }) })
const until = async (check, what) => { for (const end = Date.now() + 30000; Date.now() < end;) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 50)) } assert.fail(`timed out waiting for ${what}`) }
const pieSetup = { id: 'i1', title: 'Issues by category', type: 'pie', category: 'c1', measure: 'count', sort: 'value' }
const barSetup = { id: 'i2', title: 'Cost by category', type: 'bar', category: 'c1', measure: 'sum', value: 'c3', sort: 'value' }
const owned = {
  i1: { elements: { labels: true, position: 'outsideEnd', content: ['value', 'percent'] } },
  i2: { elements: { gridlines: ['majorH', 'majorV'], dataTable: true, legend: 'right', trendline: 'linear' } },
}

test('TC-CHT-29: the owner sets a pie’s data labels to Outside End with value and percentage, and a bar chart’s legend, gridlines, data table and trendline — saved to Git', async () => {
  const files = { 'on-demand/conq.json': JSON.stringify(conq([pieSetup, barSetup])) }
  const { page, context, errors, writes } = await open(files)
  const edit = async (title) => {
    await page.getByRole('button', { name: `More actions: ${title}`, exact: true }).click()
    await page.getByRole('menuitem', { name: 'Edit…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit the chart or table' })
    await dialog.waitFor()
    await editorTab(dialog, 'Elements')
    return { dialog, elements: dialog.getByRole('group', { name: /^Chart elements/ }) }
  }
  // The pie: only what a pie takes (no axes, gridlines, data table or trendline), Excel's four positions.
  let { dialog, elements } = await edit('Issues by category')
  assert.equal(await elements.getByRole('group', { name: 'Axes' }).count(), 0)
  assert.equal(await elements.getByRole('combobox', { name: 'Trendline' }).count(), 0)
  assert.deepEqual(await elements.getByRole('combobox', { name: 'Label position' }).locator('option').allTextContents(), ['Center (as before)', 'Inside End', 'Outside End', 'Best Fit'])
  await elements.getByRole('combobox', { name: 'Data labels' }).selectOption('on')
  await elements.getByRole('combobox', { name: 'Label position' }).selectOption('outsideEnd')
  await elements.getByRole('checkbox', { name: 'Value', exact: true }).check()
  // The preview shows them at once: outside the ring with leader lines.
  const preview = dialog.getByRole('region', { name: 'Preview' })
  await preview.locator('polyline.viz-leader').first().waitFor()
  assert.ok((await preview.locator('.viz-data-labels text').allTextContents()).includes('3, 27%'))
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })

  // The bar chart: legend Right, a major horizontal gridline too, a data table and a linear trendline.
  ;({ dialog, elements } = await edit('Cost by category'))
  await elements.getByRole('combobox', { name: 'Legend' }).selectOption('right')
  await elements.getByRole('checkbox', { name: 'Major horizontal' }).check()
  await elements.getByRole('checkbox', { name: /^Data table/ }).check()
  await elements.getByRole('combobox', { name: 'Trendline' }).selectOption('linear')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })

  // Drawn for the owner…
  const pie = panel(page, 'Issues by category'), bar = panel(page, 'Cost by category')
  await pie.locator('polyline.viz-leader').first().waitFor()
  assert.equal(await pie.locator('polyline.viz-leader').count(), 6, 'one leader line per slice (5 + Other)')
  await bar.locator('.viz-legend-side-right .viz-legend').waitFor()
  assert.match(await text(bar.locator('.viz-legend-side-right .viz-legend')), /Sum of Cost \(EUR\).*Linear \(Sum of Cost \(EUR\)\)/)
  assert.equal(await bar.locator('.viz-toolbar .viz-legend').count(), 0, 'not above the chart any more')
  assert.equal(await bar.locator('line.viz-trendline').count(), 1)
  const table = bar.getByRole('region', { name: 'Data table: Cost by category' })
  assert.deepEqual(await table.locator('thead th[scope="col"]').allTextContents(), ['Series', 'Rework', 'Scrap', 'Complaint', 'Label', 'Seal', 'Late', 'Damage'])
  assert.equal(await text(table.locator('tbody th[scope="row"]')), 'Sum of Cost (EUR)')
  assert.equal(await text(table.locator('tbody td').first()), '1,950')
  // … and saved to Git, written only with what differs from the default.
  const saved = () => writes.filter((write) => write.path === 'on-demand/conq.json').at(-1)?.data
  await until(() => saved()?.insights?.[1]?.options?.elements?.trendline === 'linear', 'the bar chart’s elements in Git')
  assert.deepEqual(saved().insights.map((entry) => entry.options), [owned.i1, owned.i2])
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

test('TC-CHT-30: a viewer sees the owner’s chart elements and switches the data labels for themselves; charts without elements are drawn as before', async () => {
  const files = { 'on-demand/conq.json': JSON.stringify(conq([
    { ...pieSetup, options: owned.i1 }, { ...barSetup, options: owned.i2 },
    { ...barSetup, id: 'i3', title: 'Plain bar' }, { ...barSetup, id: 'i4', title: 'Same bar, defaults written', options: { elements: { legend: 'top', gridlines: ['majorV'], position: 'outsideEnd', content: ['value'] } } },
  ])) }
  const { page, context, errors, writes } = await open(files, 'Team Member')
  const pie = panel(page, 'Issues by category'), bar = panel(page, 'Cost by category')
  await pie.locator('polyline.viz-leader').first().waitFor()
  assert.equal(await pie.getByRole('checkbox', { name: 'Data labels' }).isChecked(), true, 'the owner turned them on for everyone')
  assert.equal(await bar.getByRole('checkbox', { name: 'Data labels' }).isChecked(), false, 'not set by the owner: the viewer’s default')
  assert.equal(await bar.locator('line.viz-trendline').count(), 1)
  assert.equal(await bar.getByRole('region', { name: 'Data table: Cost by category' }).count(), 1)
  // The viewer switches the pie's labels off for themselves — kept after a reload, never written.
  await pie.getByRole('checkbox', { name: 'Data labels' }).uncheck()
  await pie.locator('polyline.viz-leader').first().waitFor({ state: 'detached' })
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, 'CoNQ')
  await page.getByRole('tab', { name: /^Insights/ }).click()
  await panel(page, 'Issues by category').locator('svg[role="img"]').waitFor()
  assert.equal(await panel(page, 'Issues by category').getByRole('checkbox', { name: 'Data labels' }).isChecked(), false)
  assert.equal(await panel(page, 'Issues by category').locator('polyline.viz-leader').count(), 0)
  // The owner's position and contents come back when the viewer turns them on again.
  await panel(page, 'Issues by category').getByRole('checkbox', { name: 'Data labels' }).check()
  await panel(page, 'Issues by category').locator('polyline.viz-leader').first().waitFor()
  // A chart whose elements are all at their defaults is drawn exactly as the chart without them.
  const markup = (title) => panel(page, title).locator('.viz-root').evaluate((root) => root.outerHTML.replace(/(id|aria-labelledby|aria-describedby)="[^"]*"/g, '').replace(/Same bar, defaults written|Plain bar/g, 'T'))
  await panel(page, 'Plain bar').locator('svg[role="img"]').waitFor()
  assert.equal(await markup('Same bar, defaults written'), await markup('Plain bar'))
  // On a phone the side legend goes under the chart, which keeps to the panel's width.
  await page.setViewportSize({ width: 390, height: 900 })
  const fits = () => bar.evaluate((element) => { const svg = element.querySelector('.viz-plot svg').getBoundingClientRect(), box = element.getBoundingClientRect(); return svg.right <= box.right + 0.5 })
  await until(fits, 'the chart to fit the panel at 390 px')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true)
  assert.equal(writes.length, 0, 'nothing is written')
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

test('TC-CHT-31: KPI charts are a row of cards — the value never cut, the pop-up’s preview beside the form, no chart type above a chart', async () => {
  const kpis = [
    { id: 'k1', title: 'CoNQ KPI', type: 'kpi', category: '', measure: 'sum', value: 'c5', sort: 'value', filters: [{ column: 'c1', values: ['Rework', 'Scrap', 'Complaint', 'Label', 'Seal', 'Late', 'Damage'] }] },
    { id: 'k2', title: 'Rows', type: 'kpi', category: '', measure: 'count', sort: 'value' },
  ]
  const files = { 'on-demand/conq.json': JSON.stringify(conq([kpis[0], barSetup, kpis[1]])) }
  const { page, context, errors, writes } = await open(files)
  const cards = page.locator('.od-kpi-card')
  await cards.nth(1).waitFor()
  assert.deepEqual(await cards.locator('h2').evaluateAll((list) => list.map((heading) => heading.firstChild.textContent)), ['CoNQ KPI', 'Rows'], 'in the charts’ order, above them')
  assert.equal(await page.locator('.od-insights .od-insight.panel').count(), 1, 'only the bar chart is a panel')
  // No chart type above a chart or card (CHT-39): the type is the first line of ⓘ.
  assert.equal(await page.locator('.od-insights .od-insight .eyebrow').count(), 0)
  assert.match(await infoText(page, panel(page, 'Cost by category')), /^Type: Bar \/ column\./)
  // KB-84: the whole number is visible at every width, the caption at most two lines.
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 })
    // Wait for the layout to settle at the new width before measuring (no fixed waits).
    await page.waitForFunction((w) => window.innerWidth === w && [...document.querySelectorAll('.od-kpi-card')].every((card) => card.getBoundingClientRect().width >= 180), width)
    const value = cards.first().locator('.od-kpi strong')
    assert.equal(await value.getAttribute('title'), '12,397,506.05 EUR')
    const box = await value.evaluate((element) => ({ cut: element.scrollWidth > element.clientWidth + 1, card: element.closest('article').getBoundingClientRect().width }))
    assert.equal(box.cut, false, `${width} px: the value is not cut`)
    assert.ok(box.card >= 180, `${width} px: the card is at least 180 px wide`)
    const caption = cards.first().locator('.od-kpi-caption')
    assert.ok(await caption.evaluate((element) => element.getBoundingClientRect().height <= 2 * parseFloat(getComputedStyle(element).lineHeight) + 1), `${width} px: two lines`)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${width} px: no sideways scroll`)
  }
  // KB-85, KB-86: the pop-up — the form and the preview never overlap; the preview shows the card, not a long subtitle.
  for (const width of [1440, 1280, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.getByRole('button', { name: 'More actions: CoNQ KPI', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Edit…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit the chart or table' })
    await dialog.waitFor()
    const preview = dialog.getByRole('region', { name: 'Preview' })
    await preview.locator('.od-kpi strong').waitFor()
    const layout = await dialog.evaluate((box) => {
      const form = box.querySelector('.od-insight-fields').getBoundingClientRect(), shown = box.querySelector('.od-insight-preview').getBoundingClientRect()
      const out = [...box.querySelectorAll('.od-insight-fields *')].filter((element) => element.getBoundingClientRect().right > form.right + 1).length
      const value = box.querySelector('.od-insight-preview .od-kpi strong')
      return { overlap: form.right > shown.left + 1 && form.bottom > shown.top + 1 && shown.bottom > form.top + 1, out, cut: value.scrollWidth > value.clientWidth + 1 }
    })
    assert.deepEqual(layout, { overlap: false, out: 0, cut: false }, `${width} px`)
    assert.equal(await preview.locator('.muted').count(), 0, 'no subtitle repeating ⓘ')
    assert.equal(await preview.getByText('Filtered').count(), 1, 'its own filters narrow it')
    if (width === 390) {
      // Show as: Panel keeps the old look.
      await editorTab(dialog, 'Format')
      await dialog.getByRole('combobox', { name: 'Show as' }).selectOption('panel')
      await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    } else await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dialog.waitFor({ state: 'detached' })
  }
  await panel(page, 'CoNQ KPI').locator('.panel-heading').waitFor()
  assert.equal(await cards.count(), 1)
  const saved = () => writes.filter((write) => write.path === 'on-demand/conq.json').at(-1)?.data
  await until(() => saved()?.insights?.[0]?.options?.view === 'panel', 'Show as Panel in Git')
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})
