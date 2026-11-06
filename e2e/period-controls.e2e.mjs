import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { navigate, openPage, startApp } from './helpers.mjs'

let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

async function controls(page, month) {
  page.setDefaultTimeout(15_000)
  await navigate(page, 'Capacity & periods')
  await page.locator('input[type=month]').fill(month)
  await page.getByRole('tab', { name: 'Period control', exact: true }).click()
  const monthLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`))
  await page.getByLabel(`Planning last day to update of ${monthLabel}`, { exact: true }).waitFor()
}

test('TC-SET-02: each selected month has independent plan and actual lock dates which persist in this browser', async () => {
  const { page, context, errors } = await openPage(app)
  try {
    await controls(page, '2030-11')
    const plan = page.getByLabel('Planning last day to update of November 2030', { exact: true })
    const actual = page.getByLabel('Actuals last day to update of November 2030', { exact: true })
    assert.equal(await plan.inputValue(), '2030-11-05')
    assert.equal(await actual.inputValue(), '2030-12-04')
    await plan.fill('2030-11-09')
    await actual.fill('2030-12-08')
    await page.getByRole('button', { name: 'Lock now', exact: true }).first().click()
    await page.getByText('Locked', { exact: true }).first().waitFor()
    // Browser persistence is deliberately debounced to avoid an IndexedDB write for every keystroke.
    await page.waitForTimeout(750)

    await page.locator('input[type=month]').fill('2030-12')
    await page.getByLabel('Planning last day to update of December 2030', { exact: true }).waitFor()
    assert.equal(await page.getByLabel('Planning last day to update of December 2030', { exact: true }).inputValue(), '2030-12-05')
    assert.equal(await page.getByLabel('Actuals last day to update of December 2030', { exact: true }).inputValue(), '2031-01-04')

    await page.reload()
    await controls(page, '2030-11')
    assert.equal(await plan.inputValue(), '2030-11-09')
    assert.equal(await actual.inputValue(), '2030-12-08')
    await page.getByRole('button', { name: 'Undo early lock', exact: true }).first().waitFor()
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('TC-SET-02: month locks can be returned independently to their configured defaults', async () => {
  const { page, context, errors } = await openPage(app)
  try {
    await controls(page, '2030-11')
    const plan = page.getByLabel('Planning last day to update of November 2030', { exact: true })
    const actual = page.getByLabel('Actuals last day to update of November 2030', { exact: true })
    await plan.fill('2030-11-11')
    await actual.fill('2030-12-12')
    await page.getByRole('button', { name: 'Use default', exact: true }).first().click()
    assert.equal(await plan.inputValue(), '2030-11-05')
    await page.getByRole('button', { name: 'Use default', exact: true }).click()
    assert.equal(await actual.inputValue(), '2030-12-04')
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})
