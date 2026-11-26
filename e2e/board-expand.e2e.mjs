import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { loadSample, navigate, openPage, startApp } from './helpers.mjs'

// TC-BKL-39 (BKL-50): on My Tasks [Board] a Feature opens with a + and closes with a − (the synthetic sample).
// Every step waits for what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

test('TC-BKL-39: My Tasks [Board] expands a Feature with + and collapses it with −', async () => {
  // The sample person whose board has Features with items under them.
  const { page, context } = await openPage(app, { roles: true, init: () => { localStorage.setItem('demand-planning-my-name-v1', 'Chen Wei') } })
  await loadSample(page)
  await navigate(page, 'My Tasks [Board]')
  await page.getByRole('button', { name: 'All', exact: true }).first().click()
  const toggle = page.locator('button.work-toggle[aria-label^="Expand Feature"]').first()
  await toggle.waitFor()
  assert.equal((await toggle.innerText()).trim(), '+')
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
  const label = await toggle.getAttribute('aria-label')
  const id = /Feature #(\d+)/.exec(label)[1]
  await toggle.click()
  const open = page.locator(`button.work-toggle[aria-label^="Collapse Feature #${id}:"]`)
  await open.waitFor()
  assert.equal((await open.innerText()).trim(), '−')
  assert.equal(await open.getAttribute('aria-expanded'), 'true')
  await open.click()
  await page.locator(`button.work-toggle[aria-label^="Expand Feature #${id}:"]`).waitFor()
  await context.close()
})
