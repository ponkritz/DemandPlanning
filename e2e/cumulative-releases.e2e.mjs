import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fixture, infoText, loadSample, navigate, openPage, startApp, text, toggleFilter } from './helpers.mjs'

// Pulse Check → Year: the Completed releases of the year, cumulative per stream (QV-68, QV-69; TC-QV-49 UAT). The
// synthetic sample read by DP, IOCC, Content and Tool Validations and the S&S IT Windchill export imported; the chart's
// lines, the All streams line and the month sums, the switches remembered after a reload, the table below with its
// Export, the Streams not counted filter. Synthetic data only; every step waits for what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const query = "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.State] = 'Approved'"
const view = (name) => ({ id: name.toLowerCase().replace(/\W+/g, '-'), url: `https://azure.example.com/tfs/Collection/${encodeURIComponent(name)}`, baseUrl: 'https://azure.example.com/tfs', token: 'e2e-token-0123456789', reason: name, viewName: name, role: 'release-source', query, showInMenu: true })
const profiles = [{ id: 'tw', url: 'https://dev.azure.com/example-org/Example%20Project/_backlogs/backlog/Team%20A/Epics', token: '', reason: 'QMS-0025', role: 'time-tracking', showInMenu: true }, ...['DP', 'IOCC', 'Content', 'Tool Validations'].map(view)]
const title = /^Completed releases · \d{4}, cumulative/

test('TC-QV-49: Pulse Check → Year — Completed releases cumulative per stream, the All streams line and month sums, switches remembered, the table and its Export, streams not counted left out', async () => {
  const { page, context, errors } = await openPage(app, { roles: true, init: (list) => { localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify(list)) }, initArg: profiles })
  await context.route(/azure\.example\.com|dev\.azure\.com/, (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  for (const name of ['Get started', 'Could not fetch from Azure DevOps']) {
    const dialog = page.getByRole('dialog').filter({ hasText: name })
    await page.addLocatorHandler(dialog, () => dialog.getByRole('button', { name: 'Close', exact: true }).last().click())
  }
  await loadSample(page)
  await navigate(page, 'Import Windchill export')
  await page.getByLabel(/name/i).first().fill('S&S IT').catch(() => {})
  await page.locator('input[type=file]').first().setInputFiles(fixture('windchill-export.csv'))
  await page.locator('.panel').filter({ has: page.locator('h2, h3', { hasText: /^Releases/ }) }).first().waitFor()
  await navigate(page, 'Pulse Check')
  await page.locator('header.topbar input[type=month]').fill('2026-11')
  // The Month tab of October: S&S IT's releases dated in the month (its Supported line).
  await page.getByRole('tab', { name: /^Releases ·/ }).click()
  await page.locator('.supported-summary li', { hasText: 'S&S IT [4]' }).waitFor()

  // Year: the panel after the period table, only in the Year view.
  const select = page.locator('.pulse-period select').first()
  await select.selectOption('quarter')
  await page.locator('.panel h2', { hasText: /^Releases · Q4 2026/ }).waitFor()
  assert.equal(await page.locator('.panel h2', { hasText: title }).count(), 0, 'not in the Quarter view')
  await select.selectOption('year')
  const panel = page.locator('.panel').filter({ has: page.locator('h2', { hasText: title }) }).first()
  await panel.waitFor()
  const year = (await text(panel.locator('h2').first())).match(/· (\d{4}),/)[1]
  const legend = panel.locator('.viz-legend')
  await legend.getByText('S&S IT', { exact: true }).waitFor()
  for (const name of ['DP', 'Tool Validations', 'Month sum']) await legend.getByText(name, { exact: true }).waitFor()
  assert.equal(await legend.getByText('All streams (cumulative)').count(), 0, 'All streams off by default')
  assert.equal(await panel.locator('svg.viz-fixed path[stroke]').count() >= 5, true, 'a line per stream')

  // The table below: each month's count per stream, the month total and the running total; later months empty.
  const table = panel.locator('table').last()
  const headers = (await table.locator('thead th').allTextContents()).map((header) => header.replace(/[▴▾▲▼↑↓]/g, '').trim())
  assert.equal(headers[0], 'Month')
  assert.deepEqual(headers.slice(-2), ['Month total', 'Cumulative total'])
  const column = headers.indexOf('S&S IT')
  assert.ok(column > 0, `S&S IT has a column: ${headers.join(' | ')}`)
  const cells = async (month) => table.locator('tbody tr', { hasText: `${month} ${year}` }).first().locator('td').allInnerTexts()
  if (year === '2026') {
    assert.equal((await cells('October'))[column].trim(), '4', 'October as its Month tab counts it')
    assert.equal((await cells('September'))[column].trim(), '1')
  }
  const rows = await table.locator('tbody tr').count()
  assert.equal(rows, 12, 'January to December')
  const december = await cells('December')
  if (year === '2026') assert.deepEqual(december.slice(1).map((cell) => cell.trim()), Array(december.length - 1).fill(''), 'December is still to come: empty')
  // December's (or the current month's) running total of S&S IT is the sum of its months; the Year row counts each
  // release once (Remote Diagnostics 1.6 is dated in September and October), and ⓘ says so.
  let sum = 0
  for (const at of ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']) sum += Number((await cells(at))[column].trim() || 0)
  const releases = page.locator('.panel').filter({ has: page.locator('h2', { hasText: new RegExp(`^Releases · ${year} vs`) }) }).first()
  const yearRow = Number((await releases.locator('tbody tr', { hasText: 'S&S IT' }).first().locator('td').allInnerTexts())[1])
  assert.ok(sum >= yearRow, `the month sums (${sum}) are at least the Year row (${yearRow})`)
  if (year === '2026') assert.ok(sum > yearRow, 'a release in two months counts in both')
  const info = await infoText(page, panel)
  assert.match(info, /The Year row above counts each release once over the year/)
  assert.match(info, /A month counts as its Month tab does/)
  // The chart's Table view lists the running totals: its last filled month equals the sum.
  await panel.getByRole('button', { name: 'Table', exact: true }).click()
  const chartTable = panel.locator('.viz-table')
  await chartTable.waitFor()
  const chartHeaders = await chartTable.locator('thead th').allTextContents()
  const filled = (await chartTable.locator('tbody tr').allInnerTexts()).map((row) => row.split('\t')).filter((row) => row[chartHeaders.indexOf('S&S IT')]?.trim() !== '—')
  assert.equal(Number(filled[filled.length - 1][chartHeaders.indexOf('S&S IT')]), sum)
  await panel.getByRole('button', { name: 'Chart', exact: true }).click()
  await panel.locator('svg.viz-fixed').waitFor()

  // Export: the table as CSV, with the totals.
  const download = page.waitForEvent('download')
  const exportButton = panel.getByRole('button', { name: /^Export/ }).first()
  const menu = /▾/.test(await exportButton.innerText())
  await exportButton.click()
  if (menu) await page.getByRole('menuitem', { name: 'CSV (.csv)' }).click()
  const csv = readFileSync(await (await download).path(), 'utf8').replace(/\r\n/g, '\n')
  assert.match(csv, /Month total/)
  assert.match(csv, /Cumulative total/)
  assert.match(csv, /S&S IT/)

  // Switches: lines per stream off, All streams on — remembered after a reload.
  await panel.getByRole('checkbox', { name: 'Per stream', exact: true }).uncheck()
  await panel.getByRole('checkbox', { name: 'All streams', exact: true }).check()
  await legend.getByText('All streams (cumulative)').waitFor()
  await legend.getByText('S&S IT', { exact: true }).waitFor({ state: 'detached' })
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, 'Pulse Check')
  const again = page.locator('.panel').filter({ has: page.locator('h2', { hasText: title }) }).first()
  await again.waitFor()
  await again.locator('.viz-legend').getByText('All streams (cumulative)').waitFor()
  assert.equal(await again.getByRole('checkbox', { name: 'Per stream', exact: true }).isChecked(), false)
  assert.equal(await again.getByRole('checkbox', { name: 'All streams', exact: true }).isChecked(), true)
  assert.equal(await again.getByRole('checkbox', { name: 'Month sum', exact: true }).isChecked(), true)
  await again.getByRole('checkbox', { name: 'Per stream', exact: true }).check()
  await again.locator('.viz-legend').getByText('DP', { exact: true }).waitFor()

  // Streams not counted: S&S IT has no line and no column, the sums leave it out, ⓘ names it.
  const totalBefore = await text(again.locator('.record-count').first())
  await toggleFilter(page, 'Streams not counted', 'S&S IT')
  await again.locator('.viz-legend').getByText('S&S IT', { exact: true }).waitFor({ state: 'detached' })
  const after = (await again.locator('table').last().locator('thead th').allTextContents()).map((header) => header.replace(/[▴▾▲▼↑↓]/g, '').trim())
  assert.equal(after.includes('S&S IT'), false)
  assert.match(await infoText(page, again), /Not counted \(Streams filter\): S&S IT\. They have no line and are not in the sums\./)
  assert.notEqual(await text(again.locator('.record-count').first()), totalBefore, 'the total without S&S IT')
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await again.locator('.viz-legend').getByText('S&S IT', { exact: true }).waitFor()
  await select.selectOption('month')
  assert.deepEqual(errors, [])
  await context.close()
})
