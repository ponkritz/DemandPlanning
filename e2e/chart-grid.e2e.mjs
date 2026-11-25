import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { editorTab, navigate, openPage, rolesFile, startApp, text } from './helpers.mjs'

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
const conq = (list = insights) => ({ schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ', description: 'Cost of Non-Quality', keyPrefix: 'CONQ', columns, rows, insights: list, colors: { Berlin: '#7b2ff7', Leeds: 3 } })

const gitStorage = () => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'test-token')
}
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
    if (path === 'access.json') return json(rolesFile(role))
    const folder = Object.keys(files).filter((file) => file.startsWith(`${path}/`))
    if (folder.length) return json(folder.map((file) => ({ type: 'file', name: file.slice(path.length + 1), path: file, sha: `s${files[file].length}` })))
    if (files[path] != null) return json({ type: 'file', encoding: 'base64', content: Buffer.from(files[path]).toString('base64'), sha: `s${files[path].length}` })
    return json({ message: 'Not Found' }, 404)
  })
  return writes
}
async function open(role = 'Tool Owner', viewport = {}, list = insights) {
  const files = { 'on-demand/conq.json': JSON.stringify(conq(list)) }
  const { page, context, errors } = await openPage(app, { init: gitStorage, width: 1440, ...viewport })
  const writes = await mockGitHub(context, files, role)
  // The start fetch (Azure DevOps answers 401 here) may open the setup guide at any moment: close it whenever it appears.
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, async () => { await guide.getByRole('button', { name: 'Close', exact: true }).last().click() })
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, 'CoNQ')
  await page.getByRole('tab', { name: /^Insights/ }).click()
  for (const entry of list.filter((item) => item.type !== 'kpi')) await panel(page, entry.title).locator('svg[role="img"]').first().waitFor()
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
  await editorTab(dialog, 'Format')
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

// CHT-51…CHT-56, KB-88, KB-89: two KPI cards above a bar chart of three bars and a line chart.
const withCards = [
  { id: 'k1', title: 'CoNQ KPI [euros] — cost of non-quality over all sites and categories', type: 'kpi', category: '', measure: 'sum', value: 'c3', sort: 'value', filters: [{ column: 'c1', values: ['Rework', 'Scrap', 'Complaint'] }] },
  { id: 'k2', title: 'Time Delay [days] due to CoNQ Issues', type: 'kpi', category: '', measure: 'count', sort: 'value' },
  insights[0], insights[1],
]
const card = (page, id) => page.locator('.od-kpi-card').nth(id === 'k1' ? 0 : 1)
// KB-88: every item of the open menu is inside the window and on top (the element at its centre is the item).
async function menuVisible(page, label) {
  await page.getByRole('button', { name: `More actions: ${label}`, exact: true }).click()
  const menu = page.getByRole('menu', { name: label, exact: true })
  await menu.waitFor()
  const items = await menu.getByRole('menuitem').evaluateAll((list) => list.map((item) => {
    const rect = item.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
    const hit = document.elementFromPoint(x, y)
    return { text: item.textContent, inside: rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth, top: hit === item || item.contains(hit) }
  }))
  return { menu, items }
}

test('TC-CHT-41: KPI cards — the ⋯ menu is never clipped, the header in one row; the owner resizes a card in Arrange charts (saved to Git), the number grows with it', async () => {
  const { page, context, errors, writes } = await open('Tool Owner', {}, withCards)
  await card(page, 'k2').waitFor()
  const grid = page.locator('.od-insights.chart-grid')
  await until(async () => (await grid.getAttribute('data-cols')) === '12', 'the 12-column grid')
  // CHT-51: the cards on the grid, 3 of 12 columns each, side by side above the charts.
  const [one, two, bar] = [await box(card(page, 'k1')), await box(card(page, 'k2')), await box(panel(page, 'Cost by category'))]
  const all = await box(grid), column = (all.width - 11 * 18) / 12
  assert.ok(Math.abs(one.top - two.top) < 2 && one.right < two.left, 'side by side')
  assert.ok(Math.abs(one.width - (3 * column + 2 * 18)) < 2, `3 columns wide: ${one.width}`)
  assert.ok(bar.top > one.bottom, 'the charts below the cards')
  // CHT-53: the header in one row — the title at most two lines with ⓘ beside it, Filtered and ⋯ on the right.
  const head = await card(page, 'k1').evaluate((element) => {
    const title = element.querySelector('.od-kpi-title'), info = element.querySelector('h2 .info-button'), more = element.querySelector('.view-actions .ghost'), pill = element.querySelector('.chart-filtered')
    const [t, i, m, p] = [title, info, more, pill].map((node) => node.getBoundingClientRect())
    return { lines: Math.round(t.height / parseFloat(getComputedStyle(title).lineHeight)), tooltip: title.getAttribute('title'), infoBeside: i.left >= t.right - 1 && i.top < t.bottom, oneRow: Math.abs(m.top + m.height / 2 - (p.top + p.height / 2)) < 4 && p.right <= m.left + 1 }
  })
  assert.ok(head.lines <= 2, `the title takes at most two lines: ${head.lines}`)
  assert.equal(head.tooltip, withCards[0].title)
  assert.ok(head.infoBeside && head.oneRow, JSON.stringify(head))

  // KB-88: the cards' and a chart's ⋯ menus — every item fully visible and on top.
  for (const [label, width] of [[withCards[0].title, 1440], ['Cost per month', 1440], [withCards[1].title, 1024]]) {
    await page.setViewportSize({ width, height: 900 })
    const { menu, items } = await menuVisible(page, label)
    assert.deepEqual(items.map((item) => item.text), ['Move up', 'Move down', 'Edit…', 'Size…', 'Remove…'])
    assert.ok(items.every((item) => item.inside && item.top), `${label} at ${width}: ${JSON.stringify(items)}`)
    if (shots && label === withCards[0].title) { mkdirSync(shots, { recursive: true }); for (const scheme of ['light', 'dark']) { await page.emulateMedia({ colorScheme: scheme }); await page.screenshot({ path: `${shots}/kpi-menu-${width}-${scheme}.png` }) } await page.emulateMedia({ colorScheme: 'light' }) }
    await page.keyboard.press('Escape')
    await menu.waitFor({ state: 'detached' })
  }
  // Near the bottom of the window the menu opens above its ⋯, and its items can be clicked (Size… opens its pop-up).
  await page.setViewportSize({ width: 1440, height: 420 })
  await page.getByRole('button', { name: `More actions: ${withCards[1].title}`, exact: true }).evaluate((element) => window.scrollBy(0, element.getBoundingClientRect().bottom - window.innerHeight + 8))
  const low = await menuVisible(page, withCards[1].title)
  assert.ok(low.items.every((item) => item.inside && item.top), `flipped up: ${JSON.stringify(low.items)}`)
  await low.menu.getByRole('menuitem', { name: 'Size…' }).click()
  const sizing = page.getByRole('dialog', { name: /^Size of Time Delay/ })
  await sizing.waitFor()
  assert.deepEqual(await sizing.getByLabel('Width', { exact: true }).locator('option').allInnerTexts(), ['2 of 12 columns', '3 of 12 columns', 'One third (⅓)', 'Half (½)', 'Two thirds (⅔)', 'Full width'])
  await sizing.getByRole('button', { name: 'Cancel' }).click()
  await sizing.waitFor({ state: 'detached' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(() => window.scrollTo(0, 0))

  // CHT-52: Arrange charts — the card's handle: → and ↓ (4 × 4), Enter keeps; saved for everyone with every place.
  await page.getByRole('button', { name: 'Arrange charts' }).click()
  await page.locator('.chart-grid-lines').waitFor()
  const before = await box(card(page, 'k1'))
  await card(page, 'k1').locator('.chart-resize-handle').focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await until(() => gridOf(writes, 'k1')?.w === 4 && gridOf(writes, 'k1')?.h === 4, 'the card’s size saved to Git')
  assert.deepEqual(gridOf(writes, 'k2'), { x: 4, y: 0, w: 3, h: 3 }, 'the next card moves to the right in the row, saved with it')
  assert.ok(['i1', 'i2'].every((id) => gridOf(writes, id)?.y >= 4), 'the charts stay below the cards')
  await page.getByRole('button', { name: 'Done arranging' }).click()
  await page.locator('.chart-grid-lines').waitFor({ state: 'detached' })
  await until(async () => { const after = await box(card(page, 'k1')); return after.width > before.width + column && after.height > before.height + 40 }, 'the card wider and taller')
  // CHT-54: the number grows with the card and is never cut.
  const sizes = await page.locator('.od-kpi-card .od-kpi strong').evaluateAll((list) => list.map((value) => ({ size: parseFloat(getComputedStyle(value).fontSize), cut: value.scrollWidth > value.clientWidth + 1 })))
  assert.ok(sizes[0].size > sizes[1].size && sizes.every((entry) => !entry.cut), JSON.stringify(sizes))
  await shoot(page, 'kpi-cards-resized')
  assert.deepEqual(realErrors(errors), [])
  await context.close()
})

test('TC-CHT-41: a viewer resizes a KPI card for themselves (not written), Reset to default; at 390 px the cards are full width without a handle', async () => {
  const { page, context, errors, writes } = await open('Team Member', {}, withCards)
  await card(page, 'k2').waitFor()
  assert.equal(await page.getByRole('button', { name: `More actions: ${withCards[1].title}` }).count(), 0, 'no ⋯ for a viewer')
  const before = await box(card(page, 'k2'))
  await card(page, 'k2').locator('.chart-resize-handle').focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await card(page, 'k2').locator('.chart-size-note', { hasText: 'Size: yours' }).waitFor()
  const after = await box(card(page, 'k2'))
  assert.ok(after.width > before.width + 100 && after.height > before.height + 40, `${JSON.stringify(before)} → ${JSON.stringify(after)}`)
  assert.equal(writes.filter((write) => write.path === 'on-demand/conq.json').length, 0, 'nothing written to the page')
  await card(page, 'k2').getByRole('button', { name: /^Reset .* to the default size$/ }).click()
  await until(async () => Math.abs((await box(card(page, 'k2'))).width - before.width) < 2, 'back to the owners’ size')
  await page.setViewportSize({ width: 390, height: 844 })
  await until(async () => (await page.locator('.od-insights.chart-grid').getAttribute('data-cols')) === '1', 'one column')
  const all = await box(page.locator('.od-insights'))
  for (const id of ['k1', 'k2']) {
    const shown = await box(card(page, id))
    assert.ok(Math.abs(shown.width - all.width) < 2, `${id} full width`)
    assert.equal(await card(page, id).locator('.chart-resize-handle').isVisible(), false)
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'no sideways scroll')
  assert.deepEqual(realErrors(errors), [])
  await context.close()
})

test('TC-CHT-42: charts in one grid row line up, a resized height shows; the owner matches the heights of a row (Arrange charts and Size…)', async () => {
  const { page, context, errors, writes } = await open('Tool Owner', {}, withCards)
  const [bar, line] = [panel(page, 'Cost by category'), panel(page, 'Cost per month')]
  // KB-89: by default the two charts of a row are as tall as each other — the bar chart of three bars too.
  await until(async () => Math.abs((await box(bar)).height - (await box(line)).height) < 2, 'the same height by default')
  const start = (await box(bar)).height
  // Arrange charts: the bar chart two rows taller with the keyboard — the panel shows it; then Match heights in this row.
  await page.getByRole('button', { name: 'Arrange charts' }).click()
  await page.locator('.chart-grid-lines').waitFor()
  await handle(page, 'Cost by category').focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await until(() => gridOf(writes, 'i1')?.h === 10, 'the height saved')
  await until(async () => (await box(bar)).height > start + 80, 'the bar chart two rows taller')
  await page.getByRole('button', { name: 'More actions: Cost per month', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Match heights in this row' }).click()
  await until(() => gridOf(writes, 'i2')?.h === 10, 'Cost per month as tall as Cost by category, saved')
  assert.match(writes[writes.length - 1].message, /match the heights in the row of Cost per month \(10 rows\)/)
  await page.getByRole('button', { name: 'Done arranging' }).click()
  await page.locator('.chart-grid-lines').waitFor({ state: 'detached' })
  await until(async () => Math.abs((await box(bar)).height - (await box(line)).height) < 2 && (await box(line)).height > start + 80, 'both taller, the same height')
  // Size… with "Same height as the other charts in its row": both Small.
  await page.getByRole('button', { name: 'More actions: Cost by category', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Size…' }).click()
  const sizing = page.getByRole('dialog', { name: 'Size of Cost by category' })
  await sizing.getByLabel('Height', { exact: true }).selectOption('small')
  await sizing.getByRole('checkbox', { name: /Same height as the other charts in its row/ }).check()
  await sizing.getByRole('button', { name: 'Save to Git' }).click()
  await sizing.waitFor({ state: 'detached' })
  await until(() => gridOf(writes, 'i1')?.h === 6 && gridOf(writes, 'i2')?.h === 6, 'both 6 rows in Git')
  await until(async () => Math.abs((await box(bar)).height - (await box(line)).height) < 2 && (await box(bar)).height < start - 40, 'both lower, the same height')
  assert.deepEqual(realErrors(errors), [])
  await context.close()
})
