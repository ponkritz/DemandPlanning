import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { navigate, openPage, rolesFile, startApp, text } from './helpers.mjs'

// The chart grid (CHT-43…CHT-50) and the chart follow-ups (CHT-40…CHT-42) against a mocked GitHub, named after UAT
// case TC-CHT-37: on CoNQ's Insights tab the owner arranges the charts — the grid's lines and each chart's size shown,
// a chart dragged by its grip to the top (the others shift, saved to Git for everyone), another resized on the grid by
// its handle, a third moved with the keyboard; a viewer resizes a chart for themselves but cannot move one; at 390 px
// every chart is full width with no handle or grip. Grouped bars and an own colour (#rrggbb) are drawn in a chart.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const year = new Date().getUTCFullYear()
const columns = [
  { id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Complaint'] },
  { id: 'c2', name: 'Site', type: 'dropdown', options: ['Berlin', 'Leeds', 'Lyon'] },
  { id: 'c3', name: 'Cost (EUR)', type: 'number' },
  { id: 'c4', name: 'Found on', type: 'date' },
]
const rows = [['Rework', 'Berlin', '1200'], ['Rework', 'Berlin', '400'], ['Rework', 'Leeds', '450'], ['Scrap', 'Lyon', '600'], ['Scrap', 'Berlin', '300'], ['Complaint', 'Leeds', '500']]
  .map(([category, site, cost], index) => ({ id: `r${index + 1}`, seq: index + 1, cells: { c1: category, c2: site, c3: cost, c4: `${year}-0${1 + index}-10` } }))
const insights = [
  { id: 'i1', title: 'Cost by category', type: 'bar', category: 'c1', measure: 'sum', value: 'c3', sort: 'value' },
  { id: 'i2', title: 'Cost per month', type: 'line', category: 'c4', measure: 'sum', value: 'c3', sort: 'label' },
  { id: 'i3', title: 'Cost Pareto', type: 'pareto', category: 'c1', measure: 'sum', value: 'c3', sort: 'value' },
  // CHT-40: an Average side by side per site (stacked bars cannot show an Average).
  { id: 'i4', title: 'Average cost by site', type: 'bar', category: 'c1', second: 'c2', measure: 'average', value: 'c3', sort: 'label', options: { orientation: 'vertical', grouping: 'grouped' } },
]
// CHT-41: Berlin in an own colour, Leeds in palette colour 3.
const conq = () => ({ schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ', description: 'Cost of Non-Quality', keyPrefix: 'CONQ', columns, rows, insights, colors: { Berlin: '#7b2ff7', Leeds: 3 } })

const gitStorage = () => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'test-token')
}
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
async function open(role = 'Tool Owner', viewport = {}) {
  const files = { 'on-demand/conq.json': JSON.stringify(conq()) }
  const { page, context, errors } = await openPage(app, { init: gitStorage, width: 1440, ...viewport })
  const writes = await mockGitHub(context, files, role)
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, 'CoNQ')
  await page.getByRole('tab', { name: /^Insights/ }).click()
  for (const title of ['Cost per month', 'Average cost by site']) await panel(page, title).locator('svg[role="img"]').waitFor()
  return { page, context, errors, writes }
}
const panel = (page, title) => page.locator('.chart-panel', { has: page.locator('h2', { hasText: title }) })
const handle = (page, title) => page.getByRole('button', { name: new RegExp(`^Resize ${title}:`) })
const grip = (page, title) => page.getByRole('button', { name: new RegExp(`^Move ${title}`) })
const pageFile = (writes) => [...writes].reverse().find((write) => write.path === 'on-demand/conq.json')?.data
const gridOf = (writes, id) => pageFile(writes)?.insights?.find((entry) => entry.id === id)?.options?.grid
// Poll a condition (a save reaching the mocked Git, a layout after a re-render) until it holds, up to 30 s.
const until = async (check, what) => { for (const end = Date.now() + 30000; !(await check()) && Date.now() < end;) await new Promise((resolve) => setTimeout(resolve, 50)); assert.ok(await check(), what) }
const box = (locator) => locator.evaluate((element) => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } })
const realErrors = (errors) => errors.filter((entry) => !/401|Unauthorized/.test(entry))
// CHART_GRID_SHOTS=<folder>: screenshots for the review at 1440 and 390 px, light and dark (not taken otherwise).
const shots = process.env.CHART_GRID_SHOTS
async function shoot(page, name, widths = [1440, 390]) {
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  const size = page.viewportSize()
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 720 ? 2600 : 1700 })
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.locator('.chart-panel').first().waitFor()
      await page.screenshot({ path: `${shots}/${name}-${width}-${scheme}.png`, fullPage: true })
    }
  }
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' })
  await page.setViewportSize(size)
}

test('TC-CHT-37: the owner arranges the charts on the grid — drags one to the top (the others shift, saved to Git), resizes one with the grid lines shown, moves one with the keyboard; grouped bars and an own colour are drawn', async () => {
  const { page, context, errors, writes } = await open()
  // CHT-40, CHT-41: the grouped columns — one per site with rows, side by side; Berlin in its own colour, Leeds in
  // palette colour 3 (Rework: Berlin and Leeds, Scrap: Berlin and Lyon, Complaint: Leeds = 5 columns).
  const grouped = panel(page, 'Average cost by site')
  assert.equal(await grouped.locator('path.viz-bar').count(), 5)
  assert.equal(await grouped.locator('path.viz-bar[fill="#7b2ff7"]').count(), 2)
  assert.equal(await grouped.locator('path.viz-bar[fill="var(--viz-series-3)"]').count(), 2)
  assert.match(await grouped.locator('svg[role="img"] title').first().textContent(), /Rework \(Berlin 800, Leeds 450, Lyon —\)/)
  const [first, second] = await grouped.locator('path.viz-bar').evaluateAll((paths) => paths.slice(0, 2).map((path) => { const rect = path.getBBox(); return { x: rect.x, width: rect.width, bottom: rect.y + rect.height } }))
  assert.ok(first.x + first.width <= second.x + 0.5 && Math.abs(first.bottom - second.bottom) < 0.5, 'side by side from the same base')
  await shoot(page, 'grouped-rgb')

  // CHT-44: nobody arranged anything — the four charts two by two at half width, as before.
  const grid = page.locator('.od-insights.chart-grid')
  await until(async () => (await grid.getAttribute('data-cols')) === '12', 'the 12-column grid')
  const [a, b] = [await box(panel(page, 'Cost by category')), await box(panel(page, 'Cost per month'))]
  assert.ok(Math.abs(a.top - b.top) < 2 && a.right < b.left, 'side by side')
  assert.equal(await page.locator('.chart-grid-lines').count(), 0, 'no grid lines outside Arrange mode')
  assert.equal(await page.locator('.chart-move-grip').count(), 0)

  // Arrange charts: the grid's lines and each chart's size; a grip on each chart.
  await page.getByRole('button', { name: 'Arrange charts' }).click()
  await page.locator('.chart-grid-lines').waitFor()
  assert.equal(await page.locator('.chart-move-grip').count(), 4)
  assert.equal(await text(panel(page, 'Cost Pareto').locator('.chart-size-tag')), '6 × 8')

  // CHT-47: drag Cost Pareto (under Cost by category) by its grip to the top left — the others shift down while dragging.
  const pareto = panel(page, 'Cost Pareto')
  await grip(page, 'Cost Pareto').scrollIntoViewIfNeeded()
  const from = await box(grip(page, 'Cost Pareto'))
  const target = await box(panel(page, 'Cost by category'))
  const start = await box(pareto)
  await page.mouse.move(from.left + 6, from.top + 6)
  await page.mouse.down()
  await page.mouse.move(from.left + 6 - (start.left - target.left), from.top + 6 - (start.top - target.top) - 10, { steps: 10 })
  await until(async () => (await box(pareto)).top < (await box(panel(page, 'Cost by category'))).top, 'Cost by category moved out of the way while dragging')
  await pareto.locator('.chart-resize-outline', { hasText: '6 × 8' }).waitFor()
  if (shots) { mkdirSync(shots, { recursive: true }); for (const scheme of ['light', 'dark']) { await page.emulateMedia({ colorScheme: scheme }); await page.screenshot({ path: `${shots}/drag-in-progress-1440-${scheme}.png` }) } await page.emulateMedia({ colorScheme: 'light' }) }
  await page.mouse.up()
  await until(() => gridOf(writes, 'i3')?.y === 0 && gridOf(writes, 'i3')?.x === 0, 'the new layout saved to Git')
  assert.match(writes[writes.length - 1].message, /move the chart Cost Pareto \(column 1, row 1\)/)
  // Every chart's place for everyone; nothing overlaps; Cost by category now under Cost Pareto.
  const layout = Object.fromEntries(pageFile(writes).insights.map((entry) => [entry.id, entry.options.grid]))
  assert.deepEqual(layout.i3, { x: 0, y: 0, w: 6, h: 8 })
  assert.equal(layout.i1.x, 0)
  assert.ok(layout.i1.y >= 8, `Cost by category below: ${JSON.stringify(layout)}`)
  await shoot(page, 'arrange-grid', [1440])

  // CHT-43, CHT-49: resize Cost per month by its handle two columns narrower — the lines and the size while dragging.
  const line = panel(page, 'Cost per month')
  await handle(page, 'Cost per month').scrollIntoViewIfNeeded()
  const corner = await box(handle(page, 'Cost per month'))
  const all = await box(grid)
  const column = (all.width - 11 * 18) / 12 + 18
  await page.mouse.move(corner.left + 8, corner.top + 8)
  await page.mouse.down()
  await page.mouse.move(corner.left + 8 - 2 * column, corner.top + 8, { steps: 8 })
  await line.locator('.chart-resize-outline', { hasText: '4 × 8 (width ⅓, height Medium)' }).waitFor()
  assert.ok(await page.locator('.chart-grid-lines').isVisible(), 'grid lines while dragging')
  await page.mouse.up()
  await until(() => gridOf(writes, 'i2')?.w === 4, 'the size saved for everyone')
  assert.equal(pageFile(writes).insights.find((entry) => entry.id === 'i2').options.size, 'third', 'the nearest preset for older apps')

  // CHT-47: the keyboard — focus Cost per month's grip, → one column, Enter keeps; announced.
  const was = gridOf(writes, 'i2')
  await grip(page, 'Cost per month').focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await until(() => gridOf(writes, 'i2')?.x === was.x + 1, 'moved one column to the right')
  await until(async () => /Cost per month: moved to column \d+, row \d+, saved for everyone/.test(await text(page.locator('.od-insights + [aria-live="polite"]'))), 'announced')
  // Shift + arrows on the handle move too (Escape cancels).
  await handle(page, 'Cost per month').focus()
  await page.keyboard.press('Shift+ArrowLeft')
  await until(async () => /column \d+, row \d+$/.test(await text(page.locator('.od-insights + [aria-live="polite"]'))), 'a move announced')
  await page.keyboard.press('Escape')
  await until(async () => /not moved/.test(await text(page.locator('.od-insights + [aria-live="polite"]'))), 'cancelled')

  await page.getByRole('button', { name: 'Done arranging' }).click()
  await page.locator('.chart-grid-lines').waitFor({ state: 'detached' })
  assert.equal(await page.locator('.chart-move-grip').count(), 0)
  assert.deepEqual(realErrors(errors), [])
  await context.close()
})

test('TC-CHT-37: a viewer resizes a chart on the grid for themselves but cannot move one; at 390 px every chart is full width without handle or grip', async () => {
  const { page, context, errors, writes } = await open('Team Member')
  assert.equal(await page.getByRole('button', { name: 'Arrange charts' }).count(), 0)
  assert.equal(await page.locator('.chart-move-grip').count(), 0)
  // The keyboard on the handle: ↓ ↓ two rows taller (6 × 10), Enter keeps — for this viewer only.
  await handle(page, 'Cost Pareto').focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await panel(page, 'Cost Pareto').locator('.chart-resize-outline', { hasText: '6 × 10' }).waitFor()
  assert.ok(await page.locator('.chart-grid-lines').isVisible(), 'grid lines while resizing')
  // Shift + arrows do not move anything for a viewer.
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Enter')
  await panel(page, 'Cost Pareto').locator('.chart-size-note', { hasText: 'Size: yours' }).waitFor()
  const pareto = await box(panel(page, 'Cost Pareto')), first = await box(panel(page, 'Cost by category'))
  assert.ok(Math.abs(pareto.left - first.left) < 2, 'still in its place')
  assert.ok(pareto.height > first.height + 80, `two rows taller: ${pareto.height} against ${first.height}`)
  assert.equal(writes.filter((write) => write.path === 'on-demand/conq.json').length, 0, 'nothing written to the page')

  // CHT-46: a phone — one column, every chart full width, no handle and no grip; no sideways scroll.
  await page.setViewportSize({ width: 390, height: 844 })
  await until(async () => (await page.locator('.od-insights.chart-grid').getAttribute('data-cols')) === '1', 'one column')
  const all = await box(page.locator('.od-insights'))
  for (const title of ['Cost by category', 'Cost per month', 'Cost Pareto', 'Average cost by site']) {
    const shown = await box(panel(page, title))
    assert.ok(Math.abs(shown.width - all.width) < 2, `${title} full width: ${shown.width} of ${all.width}`)
    assert.equal(await handle(page, title).isVisible(), false, `${title}: no handle`)
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'no sideways scroll')
  assert.deepEqual(realErrors(errors), [])
  await context.close()
})

test('TC-CHT-33: the owner picks an own colour with the hex field — the contrast warning for a pale colour, a wrong value refused', async () => {
  const { page, context, errors, writes } = await open()
  await page.getByRole('button', { name: 'More actions: Average cost by site' }).click()
  await page.getByRole('menuitem', { name: 'Edit…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit the chart or table' })
  assert.equal(await dialog.getByLabel('Series', { exact: true }).inputValue(), 'grouped')
  assert.equal(await dialog.getByLabel('Colour of Berlin', { exact: true }).inputValue(), 'custom')
  const hex = dialog.getByLabel('#rrggbb for Lyon')
  await dialog.getByLabel('Colour of Lyon', { exact: true }).selectOption('custom')
  await hex.fill('blue')
  await dialog.getByText('Type a colour as #rrggbb').waitFor()
  await hex.fill('#FFFF66')
  await dialog.getByText(/Low contrast against the chart background in the light theme/).waitFor()
  await dialog.locator('.od-insight-preview path.viz-bar[fill="#ffff66"]').first().waitFor()
  await shoot(page, 'colour-picker', [1440, 390])
  await dialog.getByLabel('#rrggbb for Lyon').waitFor()
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  await until(() => pageFile(writes)?.colors?.Lyon === '#ffff66', 'the own colour saved to Git')
  assert.deepEqual(pageFile(writes).colors, { Berlin: '#7b2ff7', Leeds: 3, Lyon: '#ffff66' })
  assert.deepEqual(realErrors(errors), [])
  await context.close()
})
