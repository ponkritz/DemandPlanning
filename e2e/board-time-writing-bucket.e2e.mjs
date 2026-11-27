import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { loadSample, navigate, openPage, startApp } from './helpers.mjs'

// TC-ATM-25 (ATM-31, ATM-32): on My Tasks [Board] the Time Writing User Stories have their own bucket,
// "Auto Time Writing US"; one opens with + to its Month Tasks, highlighted and marked "expanded" (the synthetic sample).
// Every step waits for what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const chipCount = async (chip) => Number(/(\d+)\s*$/.exec((await chip.innerText()).trim())?.[1] ?? NaN)

test('TC-ATM-25: My Tasks [Board] lists the Time Writing User Stories in "Auto Time Writing US" and highlights one when expanded', async () => {
  const { page, context } = await openPage(app, { roles: true, init: () => { localStorage.setItem('demand-planning-my-name-v1', 'Chen Wei') } })
  await loadSample(page)
  await navigate(page, 'My Tasks [Board]')
  const bucket = page.locator('.chip-row button.chip', { hasText: 'Auto Time Writing US' })
  await bucket.waitFor()
  const stories = page.locator('.chip-row button.chip', { hasText: /^User Story \d+$/ })
  const all = page.getByRole('button', { name: 'All', exact: true }).first()
  const timeWriting = await chipCount(bucket)
  assert.ok(timeWriting > 0, 'Chen Wei has Time Writing User Stories in the sample')
  await bucket.click()
  assert.equal(await bucket.getAttribute('aria-pressed'), 'true')
  // Only Time Writing User Stories in this bucket, as many as its chip says.
  const rows = page.locator('.work-table tbody tr:not(.work-child)')
  await page.locator('.work-table .work-tw-tag').first().waitFor()
  assert.equal(await rows.count(), timeWriting)
  assert.equal(await page.locator('.work-table tbody tr:not(.work-child) .work-tw-tag').count(), timeWriting, 'every row is named Auto Time Writing US')
  // The User Story bucket no longer holds them.
  await stories.click()
  await page.locator('.chip-row button.chip[aria-pressed="true"]', { hasText: /^User Story/ }).waitFor()
  assert.equal(await page.locator('.work-table tbody tr .work-tw-tag').count(), 0, 'User Story lists no Time Writing story')
  // Expand one in its own bucket: the row is highlighted and marked expanded, its Month Tasks follow.
  await bucket.click()
  const toggle = page.locator('button.work-toggle[aria-label^="Expand Auto Time Writing US"]').first()
  await toggle.waitFor()
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
  const id = /#(\d+)/.exec(await toggle.getAttribute('aria-label'))[1]
  assert.equal(await page.locator('.work-table tr.work-tw-open').count(), 0, 'nothing highlighted while collapsed')
  await toggle.click()
  const open = page.locator(`button.work-toggle[aria-label^="Collapse Auto Time Writing US #${id}:"]`)
  await open.waitFor()
  assert.equal(await open.getAttribute('aria-expanded'), 'true')
  assert.equal((await open.innerText()).trim(), '−')
  const row = page.locator('.work-table tr.work-tw-open')
  await row.waitFor()
  assert.match(await row.locator('.work-tw-tag').innerText(), /Auto Time Writing US · expanded/)
  assert.ok(await page.locator('.work-table tr.work-tw-child').count() > 0, 'its Month Tasks are shown, highlighted with it')
  const background = await row.locator('td').first().evaluate((cell) => getComputedStyle(cell).backgroundColor)
  const plain = await page.locator('.work-table tbody tr:not(.work-tw-open):not(.work-tw-child) td').first().evaluate((cell) => getComputedStyle(cell).backgroundColor)
  assert.notEqual(background, plain, 'the expanded story is highlighted')
  // − collapses it and the highlight goes; All lists the Time Writing stories with everything else.
  await open.click()
  await page.locator('.work-table tr.work-tw-open').waitFor({ state: 'detached' })
  await all.click()
  await page.locator('.chip-row button.chip[aria-pressed="true"]', { hasText: 'All' }).waitFor()
  assert.equal(await page.locator('.work-table tbody tr:not(.work-child) .work-tw-tag').count(), timeWriting)
  await context.close()
})
