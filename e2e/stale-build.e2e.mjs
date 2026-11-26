import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { openPage, startApp, text } from './helpers.mjs'

// TC-UPD-03 (UPD-07): a newer build was deployed while the page was open, so a view's code (a lazily loaded chunk) is
// gone from the server. The page says so — not the data message — and "Load the new version" loads the app from a fresh
// address (a new _dp_refresh), never the browser's cached page that would ask for the old code again. Every step waits
// for what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

test('TC-UPD-03: a view whose code is gone after a newer deploy offers Load the new version, which loads from a fresh address', async () => {
  const { page, context } = await openPage(app, { roles: true })
  await page.locator('.sidebar nav').waitFor()
  // The old chunk of Snapshots is no longer on the server (as after a deploy).
  const gone = /\/assets\/SnapshotsPage-[^/]+\.js(\?.*)?$/
  await page.route(gone, (route) => route.fulfill({ status: 404, contentType: 'text/html', body: 'Not found' }))
  await page.locator('.sidebar nav button', { hasText: 'Snapshots' }).first().click()
  const alert = page.getByRole('alert').filter({ hasText: 'A newer version of the app was published.' })
  await alert.waitFor()
  assert.doesNotMatch(await text(alert), /a loaded work item holds a value/, 'not the data message')
  const before = new URL(page.url()).searchParams.get('_dp_refresh')
  // The server has the new build: Load the new version opens it from a fresh address.
  await page.unroute(gone)
  await Promise.all([page.waitForURL((url) => url.searchParams.has('_dp_refresh') && url.searchParams.get('_dp_refresh') !== before), alert.getByRole('button', { name: 'Load the new version' }).click()])
  await page.locator('.sidebar nav').waitFor()
  assert.equal(await page.getByRole('alert').filter({ hasText: 'A newer version of the app was published.' }).count(), 0)
  await context.close()
})
