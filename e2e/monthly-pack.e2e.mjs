import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadSample, navigate, openPage, startApp, text } from './helpers.mjs'

// Monthly pack scenarios of the UAT (TC-PCK-04), automated against the built web app with the synthetic sample.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const previousMonthName = () => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) }
const previousMonthKey = () => { const now = new Date(); const at = new Date(now.getFullYear(), now.getMonth() - 1, 1); return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}` }

test('TC-PCK-04: Pulse Check → Monthly pack shows both slides for the month before the header month, with the generated lines, and downloads them as .pptx', async () => {
  const { page, context, errors } = await openPage(app)
  await loadSample(page)
  await navigate(page, 'Pulse Check')
  const tab = page.getByRole('tab', { name: /^Monthly pack/ })
  assert.equal(await text(tab), `Monthly pack · ${previousMonthName()}`, 'the tab names the month before the header month')
  await tab.click()
  const panel = page.locator('.pack-panel')
  await panel.waitFor()
  const body = await text(panel)
  assert.match(body, /2x2 .*Actions\/Deliverables Realized.*Observations, Challenges & Risks.*Focus Areas for Next Months.*Support Requested \/ Topics to Highlight/, 'the 2x2 boxes')
  assert.match(body, /Performance Pulse update .*Summary.*Overall status.*Key takeaways.*Key next steps.*Decision required.*Risks.*Proposed mitigation.*Leadership support requested.*KPI Pulse/, 'the Performance Pulse boxes')
  assert.match(body, /Capacity: \d+(\.\d+)?% utilization \(\w+\)/, 'the capacity line from the sample bookings')
  assert.match(body, /Actual utilization was \d+(\.\d+)?% in /, 'the Summary sentence')
  assert.match(body, /Utilization \(YTD\) Calculated \d+(\.\d+)?%; type to override/, 'the utilisation KPI row: calculated, and can be overridden (PCK-07)')
  assert.match(body, /Synthetic sample data is loaded: the text cannot be saved\./)
  assert.ok(await panel.getByLabel(/^Focus areas for next months for /).isDisabled(), 'the text is read-only without a Git token that can save')
  assert.equal(await panel.locator('textarea').count(), 10, 'one text box per typed slide box; Overall status is chosen (PCK-08)')
  assert.deepEqual(await panel.getByLabel(/^Overall status for /).locator('option').allInnerTexts(), ['On Track (default)', 'On Track', 'At Risk', 'Off Track'])
  assert.match(body, /Performance Pulse update .*2x2 /, 'page 1 the Performance Pulse, page 2 the 2x2 (PCK-01)')
  const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download .pptx' }).click()])
  assert.equal(download.suggestedFilename(), `pulse-check-${previousMonthKey()}.pptx`)
  const bytes = readFileSync(await download.path())
  assert.equal(bytes.subarray(0, 2).toString('latin1'), 'PK', 'a zip')
  const content = bytes.toString('latin1')
  for (const part of ['ppt/presentation.xml', 'ppt/slides/slide1.xml', 'ppt/slides/slide2.xml', 'ppt/slideMasters/slideMaster1.xml']) assert.ok(content.includes(part), part)
  assert.ok(bytes.toString('utf8').includes('<a:t>Actions/Deliverables Realized</a:t>') && bytes.toString('utf8').includes('<a:t>KPI Pulse</a:t>'), 'the boxes are in the slides')
  // Settings → Monthly pack lists the default slide lines and KPI rows (read-only with the sample).
  await navigate(page, 'Settings')
  await page.getByRole('tab', { name: 'Monthly pack' }).click()
  const setup = await text(page.locator('.admin-section', { hasText: 'Monthly pack setup' }))
  for (const line of ['Serviceability', 'Digital Platform', 'Clinical Platform', 'IOCC', 'PPU', 'Content', 'Tool validation', 'Utilization (YTD)', 'Overall CAPA Health']) assert.ok(setup.includes(line) || await page.locator(`input[value="${line}"]`).count() === 1, line)
  assert.deepEqual(errors, [])
  await context.close()
})
