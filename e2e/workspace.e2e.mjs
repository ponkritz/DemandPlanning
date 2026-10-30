import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { loadSample, navigate, openPage, startApp, text } from './helpers.mjs'

// Insights workspace, hidden for now (WSP-07, TC-WSP-07): the menu does not offer it and the Dashboard is unchanged.
// The end-to-end scenario of the page itself (TC-WSP-06) returns with the page; see this file's Git history.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

test('TC-WSP-07: the Insights workspace is hidden from the menu; Data Insights keeps the Dashboard and Pulse Check', async () => {
  const { page, context, errors } = await openPage(app)
  await loadSample(page)
  const menu = await text(page.locator('.sidebar nav'))
  assert.doesNotMatch(menu, /Insights workspace/, 'no menu entry')
  assert.match(menu, /Dashboard.*Pulse Check/, 'the other Data Insights pages stay')
  await navigate(page, 'Dashboard')
  assert.match(await text(page.locator('.content')), /Planned utilization.*Summary.*Insights.*Months.*People.*Streams.*Definitions/, 'the Dashboard keeps its six tabs')
  assert.deepEqual(errors, [])
  await context.close()
})
