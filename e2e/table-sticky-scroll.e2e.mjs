import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { loadSample, navigate, openPage, startApp } from './helpers.mjs'

// UI-24 (TC-UI-18, UAT): a wide table keeps its horizontal scroll bar at the bottom of the screen, right above the
// sticky footer, while its own bottom is out of view — PI Review's Features table with the synthetic sample, wider than
// the page. The bar and the table move together both ways, the bar follows a column hidden, goes when the table's
// bottom (with its own bar) comes into view, and is hidden from screen readers and the Tab order. Every step waits for
// what it needs (a condition in the page), never for a time, so it also holds on a slow CPU (E2E_CPU_SLOWDOWN=4).
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const state = (page) => page.evaluate(() => {
  const box = document.querySelector('.pir-table .data-table-scroll'), bar = document.querySelector('.pir-table .data-table-hscroll'), footer = document.querySelector('.app-footer')
  const rect = (element) => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, width: r.width } }
  return { shown: !bar.hidden, bar: rect(bar), box: rect(box), footer: rect(footer), tableLeft: box.scrollLeft, barLeft: bar.scrollLeft, scrollWidth: box.scrollWidth, clientWidth: box.clientWidth, spacer: bar.firstElementChild.getBoundingClientRect().width, innerHeight: window.innerHeight }
})
// Waits until the PI Review table and its sticky bar are in the given condition (a function of state()).
const until = (page, condition, arg) => page.waitForFunction(condition, arg)
const barShown = () => { const bar = document.querySelector('.pir-table .data-table-hscroll'); return Boolean(bar && !bar.hidden && bar.getBoundingClientRect().height > 0) }
const barHidden = () => { const bar = document.querySelector('.pir-table .data-table-hscroll'); return Boolean(bar && bar.hidden) }
const inSync = (min) => { const box = document.querySelector('.pir-table .data-table-scroll'), bar = document.querySelector('.pir-table .data-table-hscroll'); return box.scrollLeft >= min && Math.abs(box.scrollLeft - bar.scrollLeft) < 1 }
const bringTableIntoView = (page, top) => page.evaluate((y) => window.scrollTo(0, document.querySelector('.pir-table .data-table-scroll').getBoundingClientRect().top + window.scrollY - y), top)

test('TC-UI-18: a wide table’s horizontal scroll bar stays above the footer while the table’s bottom is out of view, moves with the table both ways and goes when the bottom shows', async () => {
  const { page, context, errors } = await openPage(app, { width: 1440, height: 800 })
  await loadSample(page)
  await navigate(page, 'PI Review')
  await page.locator('.pir-table tbody tr').nth(5).waitFor()
  await bringTableIntoView(page, 400)

  // With the table partly visible below the toolbar, its bottom is still below the footer.
  await until(page, barShown)
  let now = await state(page)
  assert.ok(now.scrollWidth > now.clientWidth + 100, `the table is wider than its box (${now.scrollWidth} > ${now.clientWidth})`)
  assert.ok(now.box.bottom > now.footer.top, 'the table’s own bottom is below the footer')
  assert.ok(Math.abs(now.bar.bottom - now.footer.top) <= 1, `the bar ends where the footer starts (${now.bar.bottom} vs ${now.footer.top})`)
  assert.ok(Math.abs(now.bar.left - now.box.left) <= 2 && Math.abs(now.bar.width - now.clientWidth) <= 2, 'the bar is in line with the table and as wide')
  assert.ok(Math.abs(now.spacer - now.scrollWidth) <= 1, 'the bar scrolls as far as the table')
  const bar = page.locator('.pir-table .data-table-hscroll')
  assert.equal(await bar.getAttribute('aria-hidden'), 'true', 'hidden from screen readers')
  assert.equal(await bar.getAttribute('tabindex'), '-1', 'not in the Tab order')

  // The page scrolled down a little (the table's top near the top of the window), still with its bottom out of view.
  await bringTableIntoView(page, 150)
  await until(page, () => { const box = document.querySelector('.pir-table .data-table-scroll').getBoundingClientRect(), bar = document.querySelector('.pir-table .data-table-hscroll'); return Math.abs(box.top - 150) <= 2 && !bar.hidden })

  // The bar moves the table: a sideways wheel (trackpad) over the bar.
  const barBox = await bar.boundingBox()
  await page.mouse.move(barBox.x + barBox.width / 2, barBox.y + barBox.height / 2)
  await page.mouse.wheel(400, 0)
  await until(page, inSync, 100)

  // The table moves the bar: a sideways wheel over the table, back to the start.
  const tableBox = await page.locator('.pir-table .data-table-scroll').boundingBox()
  await page.mouse.move(tableBox.x + tableBox.width / 2, tableBox.y + 60)
  await page.mouse.wheel(-2000, 0)
  await until(page, () => { const box = document.querySelector('.pir-table .data-table-scroll'), bar = document.querySelector('.pir-table .data-table-hscroll'); return box.scrollLeft === 0 && bar.scrollLeft === 0 })

  // The keyboard: → on a focused row scrolls the table, and the bar with it.
  await page.locator('.pir-table tbody tr').first().focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await until(page, inSync, 20)
  await page.mouse.move(5, 5)

  // A column hidden: the bar follows the new width.
  await page.locator('.pir-table').getByRole('button', { name: /^Columns/ }).click()
  const before = (await state(page)).scrollWidth
  await page.locator('.pir-table .column-chooser-list input[type="checkbox"]:checked').last().uncheck()
  await until(page, (width) => { const box = document.querySelector('.pir-table .data-table-scroll'), bar = document.querySelector('.pir-table .data-table-hscroll'); return box.scrollWidth < width && Math.abs(bar.firstElementChild.getBoundingClientRect().width - box.scrollWidth) <= 1 }, before)
  await page.locator('.pir-table').getByRole('button', { name: /^Columns/ }).click()

  // The table's bottom in view: the sticky bar goes, so the table's own bar is the only one.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await until(page, barHidden)
  now = await state(page)
  assert.ok(now.box.bottom <= now.footer.top + 1, 'the table’s own bottom is in view above the footer')
  // Back to the partially visible table: it comes back.
  await bringTableIntoView(page, 400)
  await until(page, barShown)

  // The window made narrower and lower: the bar follows the table's new width and stays right above the footer.
  await page.setViewportSize({ width: 1200, height: 600 })
  await bringTableIntoView(page, 150)
  await until(page, () => {
    const box = document.querySelector('.pir-table .data-table-scroll'), bar = document.querySelector('.pir-table .data-table-hscroll'), footer = document.querySelector('.app-footer'), rect = bar.getBoundingClientRect()
    return !bar.hidden && Math.abs(rect.bottom - footer.getBoundingClientRect().top) <= 1 && Math.abs(rect.width - box.clientWidth) <= 1
  })
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-UI-18: at phone width the footer scrolls with the page, so the bar sits at the bottom of the window', async () => {
  const { page, context, errors } = await openPage(app, { width: 520, height: 800 })
  await loadSample(page)
  await page.getByRole('button', { name: 'Open menu' }).click()
  await page.locator('.sidebar nav button', { hasText: 'PI Review' }).first().click()
  await page.locator('.page-loading').waitFor({ state: 'detached' })
  await page.locator('.pir-table tbody tr').nth(5).waitFor()
  // The page scrolled until the table's top is near the top of the window (the toolbar above it is taller on a phone).
  await page.evaluate(() => window.scrollTo(0, document.querySelector('.pir-table .data-table-scroll').getBoundingClientRect().top + window.scrollY - 150))
  await until(page, () => { const bar = document.querySelector('.pir-table .data-table-hscroll'); return Boolean(bar && !bar.hidden && Math.abs(bar.getBoundingClientRect().bottom - window.innerHeight) <= 1) })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'no horizontal page scroll')
  assert.deepEqual(errors, [])
  await context.close()
})
