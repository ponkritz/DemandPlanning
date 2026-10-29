import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { loadSample, navigate, openPage, startApp, text } from './helpers.mjs'

// Insights workspace scenarios of the UAT (TC-WSP-06), automated against the built web app with the synthetic sample.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

test('TC-WSP-06: the Insights workspace shows the KPI tiles, the exception queue, the timeline, the insight cards with evidence and the pack queue, and leaves the Dashboard as it was', async () => {
  const { page, context, errors } = await openPage(app)
  await loadSample(page)
  await navigate(page, 'Insights workspace')
  const content = page.locator('.content')
  await content.locator('.wsp-tiles').waitFor()
  const overview = await text(content)
  assert.match(overview, /Planned utilization · \w{3} \d{2} \d+(\.\d+)?% [−+]?\d+(\.\d+)? pp vs/, 'the utilisation tile with its change against the previous month')
  assert.match(overview, /Exceptions \d+ .*over 25% baseline · \d+ missing baseline · \d+ capacity risk/, 'the exceptions tile names the kinds')
  assert.match(overview, /Data completeness · \w{3} \d{2} \d+(\.\d+)?%/, 'the data completeness tile')
  assert.match(overview, /Workload and capacity trend .*Releases completed, cumulative/, 'the two charts')
  assert.match(overview, /Exception queue \(\d+\) .*Over 25% baseline .*Capacity risk/, 'the queue with its kind chips')
  assert.match(overview, /Timeline health · \d+ Features due by \d{4}-\d{2}-\d{2}/, 'the timeline from Feature target dates')
  // The kind chips filter the queue.
  await content.getByRole('button', { name: /^Capacity risk/ }).click()
  const queueRows = content.locator('.wsp-queue tbody tr')
  assert.ok(await queueRows.count() > 0, 'the sample has people planned over capacity')
  for (const row of await queueRows.allInnerTexts()) assert.match(row, /Capacity risk/)
  // The insight cards: each with its rule, its evidence and a pack button; the queue is kept per month.
  await content.getByRole('tab', { name: 'Insights & monthly pack' }).click()
  const cards = content.locator('.wsp-card')
  await cards.first().waitFor()
  assert.ok(await cards.count() >= 5, 'several findings for the month')
  const first = cards.first()
  assert.match(await text(first), /Planned utilization .* Filters: none · Checked: \d+ people/, 'the card names its filters and what it checked')
  await first.getByRole('button', { name: /^Source evidence/ }).click()
  assert.ok(await first.locator('table tbody tr').count() > 0, 'the evidence rows open on the card')
  await first.getByRole('button', { name: 'Add to monthly pack' }).click()
  assert.match(await text(content.locator('.wsp-side')), /1 queued for \w+ \d{4}/, 'the queue counts the card')
  assert.ok(await content.getByRole('button', { name: 'Save to monthly pack' }).isDisabled(), 'saving is refused with the sample')
  assert.match(await text(content.locator('.wsp-side')), /Monthly Performance Review.*Actions and Lessons Learned/, 'the presentation preview')
  await content.getByRole('button', { name: /^Remove: / }).click()
  assert.match(await text(content.locator('.wsp-side')), /0 queued/)
  // A suggested question jumps to the section with the evidence.
  await content.getByRole('button', { name: 'Which releases are most over baseline?' }).click()
  await content.locator('.wsp-queue').waitFor()
  assert.equal(await content.getByRole('tab', { name: 'Overview' }).getAttribute('aria-selected'), 'true')
  for (const row of await content.locator('.wsp-queue tbody tr').allInnerTexts()) assert.match(row, /Over 25% baseline/)
  // The Dashboard is unchanged beside it.
  await navigate(page, 'Dashboard')
  assert.match(await text(page.locator('.content')), /Planned utilization.*Summary.*Insights.*Months.*People.*Streams.*Definitions/, 'the Dashboard keeps its six tabs')
  assert.deepEqual(errors, [])
  await context.close()
})
