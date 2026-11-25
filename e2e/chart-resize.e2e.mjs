import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { editorTab, loadSample, navigate, openPage, rolesFile, startApp, text } from './helpers.mjs'

// Chart sizes (CHT-15…CHT-22), long labels (CHT-23, KB-83) and axis titles (CHT-24) against a mocked GitHub: on CoNQ's
// Insights tab the owner sets a chart to ⅔ × Large with its own axis names in the Edit pop-up and another to ⅓ with
// the keyboard in Arrange sizes — saved to Git (TC-CHT-13, UAT); a viewer drags a chart's handle to Full (it snaps,
// is remembered after a reload, is not written to the page file, Reset to default restores it) and resizes another
// with the keyboard (TC-CHT-16); a Dashboard block is resized in Arrange blocks… (TC-CHT-15); on Team overview a
// viewer resizes a built-in chart and sees the size a Tool Owner saved for everyone (TC-CHT-19); at 390 px every chart
// is full width and no handle shows (TC-CHT-20); a long label stays inside the chart (TC-CHT-17). The page and chart
// ⋯ menus work with the keyboard (TC-OND-49).
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const year = new Date().getUTCFullYear()
const longLabel = 'Supplier delivered the wrong seal material for the Lyon filling line'
const columns = [
  { id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Complaint', longLabel] },
  { id: 'c3', name: 'Cost (EUR)', type: 'number' },
  { id: 'c4', name: 'Found on', type: 'date' },
]
const rows = [['Rework', '1200'], ['Rework', '450'], ['Scrap', '600'], ['Complaint', '500'], [longLabel, '350']]
  .map(([category, cost], index) => ({ id: `r${index + 1}`, seq: index + 1, cells: { c1: category, c3: cost, c4: `${year}-0${1 + index}-10` } }))
const insights = [
  { id: 'i1', title: 'Cost by category', type: 'bar', category: 'c1', measure: 'sum', value: 'c3', sort: 'value' },
  { id: 'i2', title: 'Cost per month', type: 'line', category: 'c4', measure: 'sum', value: 'c3', sort: 'label' },
  { id: 'i3', title: 'Cost Pareto', type: 'pareto', category: 'c1', measure: 'sum', value: 'c3', sort: 'value' },
]
const conq = (list = insights) => ({ schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ', description: 'Cost of Non-Quality', keyPrefix: 'CONQ', columns, rows, insights: list })

const gitStorage = () => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'test-token')
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
async function open(files, role, viewport = {}) {
  const { page, context, errors } = await openPage(app, { init: gitStorage, ...viewport })
  const writes = await mockGitHub(context, files, role)
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors, writes }
}
// CHART_RESIZE_SHOTS=<folder>: screenshots for the review at 1440 and 390 px, light and dark (not taken otherwise).
const shots = process.env.CHART_RESIZE_SHOTS
async function shoot(page, name, widths = [1440, 390]) {
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  const size = page.viewportSize()
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 720 ? 2400 : 1500 })
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.locator('.chart-panel').first().waitFor()
      await page.screenshot({ path: `${shots}/${name}-${width}-${scheme}.png` })
    }
  }
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' })
  await page.setViewportSize(size)
}
const insightsTab = (page) => page.getByRole('tab', { name: /^Insights/ })
const panel = (page, title) => page.locator('.chart-panel', { has: page.locator('h2', { hasText: title }) })
const handle = (page, title) => page.getByRole('button', { name: new RegExp(`^Resize ${title}:`) })
const pageFile = (writes) => [...writes].reverse().find((write) => write.path === 'on-demand/conq.json')?.data
async function openInsights(page) {
  await navigate(page, 'CoNQ')
  await insightsTab(page).click()
  await panel(page, 'Cost per month').locator('svg[role="img"]').waitFor()
}
// Poll a condition (a save reaching the mocked Git, a class after a re-render) until it holds, up to 30 s.
const until = async (check, what) => { for (const end = Date.now() + 30000; !(await check()) && Date.now() < end;) await new Promise((resolve) => setTimeout(resolve, 50)); assert.ok(await check(), what) }
const box = (locator) => locator.evaluate((element) => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width } })

test('TC-CHT-13: the owner sets a chart to ⅔ × Large with its own axis names in the Edit pop-up and another to ⅓ with the keyboard in Arrange sizes — saved to Git; the page and chart ⋯ menus work with the keyboard', async () => {
  const files = { 'on-demand/conq.json': JSON.stringify(conq()) }
  const { page, context, errors, writes } = await open(files)
  await openInsights(page)
  // Existing look: nothing resized — on the 12-column grid (CHT-44) two half-width charts side by side and the third
  // under the first, as before; no size note.
  assert.equal(await page.locator('.od-insights.chart-grid').getAttribute('data-cols'), '12')
  assert.equal(await page.locator('.chart-size-note').count(), 0)
  {
    const all = await box(page.locator('.od-insights'))
    const [first, second, third] = [await box(panel(page, 'Cost by category')), await box(panel(page, 'Cost per month')), await box(panel(page, 'Cost Pareto'))]
    assert.ok(Math.abs(first.top - second.top) < 2 && first.right < second.left, 'two side by side')
    assert.ok(Math.abs(first.width - (all.width - 18) / 2) < 3 && Math.abs(second.width - first.width) < 2, `half width: ${first.width} of ${all.width}`)
    assert.ok(third.top > first.bottom && Math.abs(third.left - first.left) < 2, 'the third under the first')
  }

  // OND-61: the page's ⋯ menu with the keyboard — the first item focused, ↓ moves, Escape closes and returns to ⋯.
  const more = page.getByRole('button', { name: 'More actions: page CoNQ' })
  await more.focus()
  await page.keyboard.press('Enter')
  const menu = page.getByRole('menu', { name: 'page CoNQ' })
  await menu.waitFor()
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Rename page…')
  await page.keyboard.press('ArrowDown')
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Hide page')
  await page.keyboard.press('Escape')
  await menu.waitFor({ state: 'detached' })
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'More actions: page CoNQ')

  // The chart's ⋯ → Edit…: Format — Width ⅔, Height Large; Elements — the axis titles (placeholders: the automatic ones).
  await page.getByRole('button', { name: 'More actions: Cost by category' }).click()
  assert.deepEqual(await page.getByRole('menu', { name: 'Cost by category' }).getByRole('menuitem').allInnerTexts(), ['Move up', 'Move down', 'Edit…', 'Size…', 'Remove…'])
  await page.getByRole('menuitem', { name: 'Edit…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit the chart or table' })
  await editorTab(dialog, 'Elements')
  assert.equal(await dialog.getByLabel('X axis name').getAttribute('placeholder'), 'Sum of Cost (EUR)')
  assert.equal(await dialog.getByLabel('Y axis name').getAttribute('placeholder'), 'Category')
  await dialog.getByLabel('X axis name').fill('Cost of non-quality (EUR)')
  await editorTab(dialog, 'Format')
  await dialog.getByLabel('Width', { exact: true }).selectOption('twothirds')
  await dialog.getByLabel('Height', { exact: true }).selectOption('large')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  await until(() => pageFile(writes)?.insights?.[0]?.options?.size === 'twothirds', 'saved to Git')
  assert.deepEqual(pageFile(writes).insights[0].options, { xTitle: 'Cost of non-quality (EUR)', size: 'twothirds', height: 'large' })
  assert.equal(pageFile(writes).insights[1].options, undefined, 'the other charts are written as before')
  const bars = panel(page, 'Cost by category')
  await page.locator('.od-insights.chart-grid').waitFor()
  assert.match(await bars.getAttribute('class'), /chart-w-twothirds chart-h-large/)
  assert.match(await bars.locator('.viz-axis-titles').textContent(), /Cost of non-quality \(EUR\)/)
  // ⅔ of the grid (8 of 12 columns — the same width as ⅔ of the 6-column grid before), the height drawn larger (rows of 45 px instead of 30).
  const grid = await box(page.locator('.od-insights'))
  const wide = await box(bars)
  assert.ok(Math.abs(wide.width - (grid.width - 5 * 18) / 6 * 4 - 3 * 18) < 3, `⅔ wide: ${wide.width} of ${grid.width}`)
  // CHT-56: four bars spread their rows to about a column chart's height at Large (at least the 45 px of Large).
  assert.equal(await bars.locator('rect.viz-row-hit').first().getAttribute('height'), String(Math.min(Math.round(75 * 1.5), Math.floor((320 * 1.5 - 36) / await bars.locator('rect.viz-row-hit').count()))))

  // Arrange charts: the handle of Cost Pareto with the keyboard — ← ← two columns narrower (4 of 12, ⅓), Enter keeps;
  // saved for everyone with every chart's place on the grid (CHT-47) and the nearest presets for older apps (CHT-50).
  await page.getByRole('button', { name: 'Arrange charts' }).click()
  await page.locator('.chart-arrange-note').waitFor()
  await handle(page, 'Cost Pareto').focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await panel(page, 'Cost Pareto').locator('.chart-resize-outline', { hasText: '4 × 8 (width ⅓, height Medium)' }).waitFor()
  await page.keyboard.press('Enter')
  await until(() => pageFile(writes)?.insights?.[2]?.options?.size === 'third', 'the arranged size saved to Git')
  assert.match(writes[writes.length - 1].message, /size of the chart Cost Pareto \(4 × 8 \(width ⅓, height Medium\)\)/)
  assert.deepEqual(pageFile(writes).insights.map((entry) => entry.options?.grid), [{ x: 0, y: 0, w: 8, h: 12 }, { x: 0, y: 12, w: 6, h: 8 }, { x: 6, y: 12, w: 4, h: 8 }])
  await page.getByRole('button', { name: 'Done arranging' }).click()
  await shoot(page, 'insights-mixed-sizes')
  assert.match(await panel(page, 'Cost Pareto').getAttribute('class'), /chart-w-third/)
  assert.equal(await page.locator('.chart-size-note').count(), 0, 'the owners’ sizes are no one’s own size')
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

test('TC-CHT-16: a viewer drags a chart to Full — it snaps, is remembered after a reload, is not written to the page; Reset to default restores it; the keyboard resizes another', async () => {
  const sized = insights.map((entry) => entry.id === 'i1' ? { ...entry, options: { size: 'twothirds', height: 'large' } } : entry)
  const files = { 'on-demand/conq.json': JSON.stringify(conq(sized)) }
  const { page, context, errors, writes } = await open(files, 'Team Member')
  await openInsights(page)
  // A viewer has no chart menus — and every chart a handle.
  assert.equal(await page.getByRole('button', { name: /^More actions: Cost/ }).count(), 0)
  assert.equal(await page.locator('.chart-resize-handle').count(), 3)

  // Drag the handle of Cost per month (half) far to the right and a little down: the outline shows Full, then it snaps.
  const line = panel(page, 'Cost per month')
  await handle(page, 'Cost per month').scrollIntoViewIfNeeded()
  const grid = await box(page.locator('.od-insights'))
  const start = await box(handle(page, 'Cost per month'))
  await page.mouse.move(start.left + 8, start.top + 8)
  await page.mouse.down()
  await page.mouse.move(grid.right - 4, start.top + 4, { steps: 8 })
  await line.locator('.chart-resize-outline', { hasText: 'width Full, height Medium' }).waitFor()
  if (shots) { mkdirSync(shots, { recursive: true }); for (const scheme of ['light', 'dark']) { await page.emulateMedia({ colorScheme: scheme }); await page.screenshot({ path: `${shots}/drag-in-progress-1300-${scheme}.png` }) } await page.emulateMedia({ colorScheme: 'light' }) }
  await page.mouse.up()
  await line.locator('.chart-size-note', { hasText: 'Size: yours' }).waitFor()
  assert.match(await line.getAttribute('class'), /chart-w-full/)
  const full = await box(line)
  assert.ok(Math.abs(full.width - grid.width) < 2, `full width: ${full.width} of ${grid.width}`)
  assert.equal(writes.filter((write) => write.path === 'on-demand/conq.json').length, 0, 'not written to the page file')

  // Remembered for this viewer after a reload.
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await openInsights(page)
  await panel(page, 'Cost per month').locator('.chart-size-note', { hasText: 'Size: yours' }).waitFor()
  assert.match(await panel(page, 'Cost per month').getAttribute('class'), /chart-w-full/)
  // Reset to default: the owners' size (half) again.
  await page.getByRole('button', { name: 'Reset Cost per month to the default size' }).click()
  await until(async () => /chart-w-half/.test(await panel(page, 'Cost per month').getAttribute('class')), 'back to half width')
  assert.equal(await panel(page, 'Cost per month').locator('.chart-size-note').count(), 0)

  // The keyboard on Cost by category (the owners' ⅔ × Large = 8 × 12): ← ← shows 6 × 12 (½, Large), Escape cancels;
  // ← ← and ↑ × 4 then Enter keep 6 × 8 (½ × Medium) — one column or row per key (CHT-49).
  const bars = panel(page, 'Cost by category')
  await handle(page, 'Cost by category').focus()
  await page.keyboard.press('ArrowLeft')
  await bars.locator('.chart-resize-outline', { hasText: '7 × 12 (7 of 12 columns, 12 rows)' }).waitFor()
  await page.keyboard.press('ArrowLeft')
  await bars.locator('.chart-resize-outline', { hasText: 'width ½, height Large' }).waitFor()
  await page.keyboard.press('Escape')
  await bars.locator('.chart-resize-outline').waitFor({ state: 'detached' })
  assert.match(await bars.getAttribute('class'), /chart-w-twothirds/)
  for (const key of ['ArrowLeft', 'ArrowLeft', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp']) await page.keyboard.press(key)
  assert.equal(await handle(page, 'Cost by category').getAttribute('aria-label'), 'Resize Cost by category: 6 × 8 (width ½, height Medium)')
  await page.keyboard.press('Enter')
  await bars.locator('.chart-size-note', { hasText: 'Size: yours' }).waitFor()
  assert.match(await bars.getAttribute('class'), /chart-w-half chart-h-medium/)
  assert.match(await text(page.locator('.od-insights + [aria-live="polite"]')), /Cost by category: 6 × 8 \(width ½, height Medium\)/)

  // CHT-23 (KB-83): the long category label stays inside the chart, wrapped, with the full text as its tooltip.
  const chart = await box(bars.locator('svg[role="img"]'))
  const label = bars.locator('text.viz-row-label', { has: page.locator('title', { hasText: longLabel }) })
  const inside = await box(label)
  assert.ok(inside.left >= chart.left - 1 && inside.right <= chart.right + 1, `the label inside the chart: ${JSON.stringify(inside)} in ${JSON.stringify(chart)}`)
  assert.ok(await label.locator('tspan').count() >= 1)
  assert.equal(writes.filter((write) => write.path === 'on-demand/conq.json').length, 0, 'still nothing written to the page')
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

test('TC-CHT-15: a Dashboard block is resized in Arrange blocks… — saved to the dashboard file', async () => {
  const files = {
    'on-demand/conq.json': JSON.stringify(conq()),
    'on-demand/cost-dashboard.json': JSON.stringify({ schema: 1, kind: 'on-demand-page', id: 'cost-dashboard', name: 'Cost dashboard', description: '', keyPrefix: 'COSTD', columns: [], rows: [] }),
    'menu-layout.json': JSON.stringify({ schema: 1, kind: 'menu-layout', groups: {}, pages: { 'cost-dashboard': { type: 'dashboard', group: 'on-demand', order: 2, icon: '◔', owners: [] } } }),
    'dashboards/cost-dashboard.json': JSON.stringify({ schema: 1, kind: 'dashboard', id: 'cost-dashboard', tabs: [], filters: [], blocks: [
      { id: 'b1', title: 'Cost by category', type: 'bar', source: 'page:conq', category: 'c1', measure: 'sum', value: 'c3', sort: 'value' },
      { id: 'b2', title: 'Pareto of cost', type: 'pareto', source: 'page:conq', category: 'c1', measure: 'sum', value: 'c3', sort: 'value' },
    ] }),
  }
  const { page, context, errors, writes } = await open(files)
  await page.locator('.sidebar nav button', { hasText: 'Cost dashboard' }).click()
  await page.locator('header.topbar h1', { hasText: 'Cost dashboard' }).waitFor()
  await panel(page, 'Pareto of cost').locator('.viz-root').waitFor()
  await page.getByRole('button', { name: 'More actions: page Cost dashboard' }).click()
  await page.getByRole('menuitem', { name: 'Arrange blocks…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Arrange the blocks' })
  await dialog.getByLabel('Width of Pareto of cost').selectOption('third')
  const saved = () => [...writes].reverse().find((write) => write.path === 'dashboards/cost-dashboard.json')?.data
  await until(() => saved()?.blocks?.[1]?.options?.size === 'third', 'saved to the dashboard file')
  assert.equal(saved().blocks[0].options, undefined, 'the other block is written as before')
  await dialog.locator('.modal-actions').getByRole('button', { name: 'Close', exact: true }).click()
  await until(async () => /chart-w-third/.test(await panel(page, 'Pareto of cost').getAttribute('class')), 'the block at ⅓')
  await page.locator('.dsh-panels.chart-grid').waitFor()
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

test('TC-CHT-19: on Team overview someone resizes a built-in chart for themselves and sees the size a Tool Owner saved for everyone', async () => {
  // The views defaults as a Tool Owner saved them (Save size for everyone, read from Git into this browser).
  const init = () => localStorage.setItem('demand-planning-views-v1:defaults', JSON.stringify({ schema: 1, kind: 'personal-views', sections: {}, menu: { pinned: [], hidden: [] }, filters: { 'chart-size:overview:overrun-hours': { width: 'half', height: 'medium' } } }))
  const { page, context, errors } = await openPage(app, { roles: true, init })
  await loadSample(page)
  await navigate(page, 'Team overview')
  await page.getByRole('tab', { name: 'Streams' }).click()
  const mix = panel(page, 'Epic mix by month'), overrun = panel(page, 'Overrun hours')
  await mix.locator('svg[role="img"]').waitFor()
  // Everyone's size: Overrun hours at half width, in the grid; no "Size: yours" for it.
  await page.locator('div.chart-grid').waitFor()
  assert.match(await overrun.getAttribute('class'), /chart-w-half/)
  assert.equal(await overrun.locator('.chart-size-note').count(), 0)
  // Epic mix (full width, as before): the viewer makes it half (6 of 12 columns) for themselves with the keyboard.
  await handle(page, 'Epic mix by month').focus()
  for (let step = 0; step < 6; step++) await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Enter')
  await mix.locator('.chart-size-note', { hasText: 'Size: yours' }).waitFor()
  assert.match(await mix.getAttribute('class'), /chart-w-half/)
  // Sample data: nothing can be saved for everyone (as Column options, BKL-47).
  assert.equal(await page.getByRole('button', { name: 'Save size for everyone' }).count(), 0)
  const [a, b] = [await box(mix), await box(overrun)]
  assert.ok(Math.abs(a.top - b.top) < 2 && a.right < b.left, 'side by side')
  await shoot(page, 'team-overview-resized')
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

test('TC-CHT-20: at 390 px every chart is full width and no resize handle shows; the page does not scroll sideways', async () => {
  const sized = insights.map((entry) => ({ ...entry, options: { size: entry.id === 'i1' ? 'third' : 'twothirds', height: 'large' } }))
  const files = { 'on-demand/conq.json': JSON.stringify(conq(sized)) }
  const { page, context, errors } = await open(files, 'Team Member')
  await openInsights(page)
  await page.setViewportSize({ width: 390, height: 844 })
  const grid = await box(page.locator('.od-insights'))
  for (const title of ['Cost by category', 'Cost per month', 'Cost Pareto']) {
    const shown = await box(panel(page, title))
    assert.ok(Math.abs(shown.width - grid.width) < 2, `${title} full width: ${shown.width} of ${grid.width}`)
    assert.equal(await handle(page, title).isVisible(), false, `${title}: no handle`)
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'no sideways scroll')
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})
