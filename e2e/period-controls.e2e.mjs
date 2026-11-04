import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { navigate, openPage, startApp } from './helpers.mjs'

let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })
const period = (month) => ({ controlVersion: 2, month, planningDeadline: `${month}-05T23:59:59.999`, actualsDeadline: '2030-11-05T23:59:59.999', planningLocked: false, actualsLocked: false, updatedAt: '', updatedBy: '' })
const config = { owner: 'synthetic', repo: 'period-data', branch: 'main', path: 'planning-data.json' }

async function connect(page, fixture, { writable = true } = {}) {
  page.setDefaultTimeout(15_000)
  await page.route('https://api.github.com/**', async (route) => {
    const request = route.request(), url = new URL(request.url())
    if (url.pathname === '/repos/synthetic/period-data') return route.fulfill({ json: { permissions: { push: writable } } })
    if (url.pathname.endsWith('/.demand-planning-write-check')) return route.fulfill({ status: writable ? 422 : 403, json: {} })
    if (!url.pathname.endsWith('/planning-data.json')) return route.fulfill({ status: 404, json: {} })
    if (request.method() === 'PUT') {
      if (fixture.deny) return route.fulfill({ status: 403, json: {} })
      const body = request.postDataJSON()
      if (body.sha !== String(fixture.version)) return route.fulfill({ status: 409, json: {} })
      fixture.data = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'))
      fixture.version += 1; fixture.writes += 1
      return route.fulfill({ json: { content: { sha: String(fixture.version) }, commit: { html_url: 'https://github.com/synthetic/period-data/commit/example' } } })
    }
    return route.fulfill({ json: { type: 'file', encoding: 'base64', sha: String(fixture.version), content: Buffer.from(JSON.stringify(fixture.data)).toString('base64') } })
  })
  await page.evaluate((config) => { localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify(config)); localStorage.setItem('demand-planning-git-token-v1', 'synthetic-period-token') }, config)
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
}
async function controls(page, month) {
  page.setDefaultTimeout(15_000)
  await navigate(page, 'Capacity & periods')
  await page.locator('input[type=month]').fill(month)
  await page.getByRole('tab', { name: 'Period control', exact: true }).click()
  await page.getByRole('button', { name: 'Save month controls', exact: true }).waitFor()
}
const fixture = () => ({ data: { schema: 1, baselineRules: [], releaseScopes: [], resourceProfiles: {}, periods: [period('2030-10')] }, version: 1, writes: 0, deny: false })

test('TC-SET-02: month dates and independent overrides save centrally, survive reload and reach another browser', async () => {
  const shared = fixture()
  const first = await openPage(app), second = await openPage(app)
  try {
    await connect(first.page, shared)
    await controls(first.page, '2030-11')
    assert.equal(await first.page.getByLabel('Plan lock date', { exact: true }).inputValue(), '2030-11-05')
    assert.equal(await first.page.getByLabel('Actual lock date', { exact: true }).inputValue(), '2030-12-05')
    await first.page.getByLabel('Plan lock date', { exact: true }).fill('2030-11-09')
    await first.page.getByLabel('Actual lock date', { exact: true }).fill('2030-12-08')
    await first.page.getByLabel('Plan mode', { exact: true }).selectOption('unlocked')
    await first.page.getByLabel('Actual mode', { exact: true }).selectOption('locked')
    await first.page.getByLabel('Reason for change', { exact: true }).fill('Operational exception for November')
    await first.page.getByRole('button', { name: 'Save month controls', exact: true }).click()
    await first.page.getByRole('status').filter({ hasText: 'controls saved to synthetic/period-data' }).waitFor()
    assert.equal(shared.writes, 1)
    assert.deepEqual(shared.data.periods.find((entry) => entry.month === '2030-10'), period('2030-10'))
    const november = shared.data.periods.find((entry) => entry.month === '2030-11')
    assert.equal(november.planningOverride, 'unlocked'); assert.equal(november.actualsOverride, 'locked')
    assert.equal(november.extensionReason, 'Operational exception for November')
    await first.page.locator('input[type=month]').fill('2030-12')
    assert.equal(await first.page.getByLabel('Plan lock date', { exact: true }).inputValue(), '2030-12-05')
    assert.equal(await first.page.getByLabel('Actual lock date', { exact: true }).inputValue(), '2031-01-05')
    assert.equal(await first.page.getByLabel('Actual mode', { exact: true }).inputValue(), 'automatic')
    await first.page.reload()
    await controls(first.page, '2030-11')
    assert.equal(await first.page.getByLabel('Plan lock date', { exact: true }).inputValue(), '2030-11-09')
    assert.equal(await first.page.getByLabel('Actual lock date', { exact: true }).inputValue(), '2030-12-08')
    await navigate(first.page, 'Monthly Time Writing')
    await first.page.getByText('Planning open', { exact: true }).waitFor()
    await first.page.getByText('Actuals locked', { exact: true }).waitFor()
    await connect(second.page, shared)
    await controls(second.page, '2030-11')
    assert.equal(await second.page.getByLabel('Actual mode', { exact: true }).inputValue(), 'locked')
    assert.equal(await second.page.getByLabel('Plan mode', { exact: true }).inputValue(), 'unlocked')
    assert.deepEqual([...first.errors, ...second.errors], [])
  } finally { await first.context.close(); await second.context.close() }
})

test('TC-SET-02: failed and conflicting shared saves leave applied controls unchanged; read-only users cannot save', async () => {
  const shared = fixture(), viewer = await openPage(app), editor = await openPage(app)
  try {
    await connect(editor.page, shared)
    await controls(editor.page, '2030-11')
    await editor.page.getByLabel('Plan mode', { exact: true }).selectOption('locked')
    await editor.page.getByLabel('Reason for change', { exact: true }).fill('Test rejected save')
    shared.deny = true
    await editor.page.getByRole('button', { name: 'Save month controls', exact: true }).click()
    await editor.page.getByRole('alert').filter({ hasText: 'GitHub refused' }).waitFor()
    assert.equal(shared.writes, 0)
    await navigate(editor.page, 'Monthly Time Writing')
    await editor.page.getByText('Planning open', { exact: true }).waitFor()
    shared.deny = false
    await controls(editor.page, '2030-11')
    shared.data.periods.push({ ...period('2030-11'), planningOverride: 'locked', updatedBy: 'another-admin' })
    shared.version += 1
    await editor.page.getByLabel('Reason for change', { exact: true }).fill('Concurrent edit')
    await editor.page.getByRole('button', { name: 'Save month controls', exact: true }).click()
    await editor.page.getByRole('alert').filter({ hasText: 'changed since they were loaded' }).waitFor()
    assert.equal(shared.writes, 0)
    await connect(viewer.page, shared, { writable: false })
    await controls(viewer.page, '2030-11')
    await viewer.page.getByText('View only: your Git token cannot save these controls.', { exact: true }).waitFor()
    assert.equal(await viewer.page.getByLabel('Plan lock date', { exact: true }).isDisabled(), true)
    assert.deepEqual([...viewer.errors, ...editor.errors], [])
  } finally { await viewer.context.close(); await editor.context.close() }
})

test('TC-SET-02: local month controls persist across reload when Git is not configured', async () => {
  const { page, context, errors } = await openPage(app)
  try {
    await controls(page, '2030-11')
    await page.getByLabel('Actual mode', { exact: true }).selectOption('locked')
    await page.getByLabel('Reason for change', { exact: true }).fill('Local trial')
    await page.getByRole('button', { name: 'Save month controls', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'November 2030 controls saved in this browser.' }).waitFor()
    await page.reload()
    await controls(page, '2030-11')
    assert.equal(await page.getByLabel('Actual mode', { exact: true }).inputValue(), 'locked')
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})
