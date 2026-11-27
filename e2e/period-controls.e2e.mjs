import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { expect } from 'playwright/test'
import { openPage, openSection, startApp } from './helpers.mjs'

let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

async function controls(page, month) {
  page.setDefaultTimeout(15_000)
  await openSection(page, 'Capacity & time', 'Month locks')
  await page.locator('input[type=month]').fill(month)
  const monthLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`))
  await page.getByLabel(`Planning last day to update of ${monthLabel}`, { exact: true }).waitFor()
}

test('TC-SET-02: each selected month has independent plan and actual lock dates which persist in this browser', async () => {
  const { page, context, errors } = await openPage(app, { roles: true })
  try {
    await controls(page, '2030-11')
    const plan = page.getByLabel('Planning last day to update of November 2030', { exact: true })
    const actual = page.getByLabel('Actuals last day to update of November 2030', { exact: true })
    assert.equal(await plan.inputValue(), '2030-11-05')
    assert.equal(await actual.inputValue(), '2030-12-04')
    await plan.fill('2030-11-09')
    await actual.fill('2030-12-08')
    const planCard = page.locator('.control-card').filter({ has: plan })
    const actualCard = page.locator('.control-card').filter({ has: actual })
    await planCard.getByRole('button', { name: 'Lock now', exact: true }).click()
    await planCard.getByText('Locked', { exact: true }).waitFor()
    await actualCard.getByText('Open', { exact: true }).waitFor()
    // Poll the resolved IndexedDB read: a Promise itself is truthy before the transaction commits.
    await expect.poll(() => page.evaluate(() => new Promise((resolve) => {
      const open = indexedDB.open('demand-planning-data-v1')
      open.onerror = () => resolve(false)
      open.onsuccess = () => {
        const db = open.result
        const transaction = db.transaction('snapshots')
        const read = transaction.objectStore('snapshots').get('current')
        transaction.oncomplete = () => {
          db.close()
          const lock = read.result?.capacitySettings?.monthLocks?.['2030-11']
          resolve(lock?.planOn === '2030-11-09' && lock?.actualsOn === '2030-12-08' && lock?.planLocked === true)
        }
        transaction.onabort = () => { db.close(); resolve(false) }
      }
    })), { timeout: 15_000 }).toBe(true)

    await page.locator('input[type=month]').fill('2030-12')
    await page.getByLabel('Planning last day to update of December 2030', { exact: true }).waitFor()
    assert.equal(await page.getByLabel('Planning last day to update of December 2030', { exact: true }).inputValue(), '2030-12-05')
    assert.equal(await page.getByLabel('Actuals last day to update of December 2030', { exact: true }).inputValue(), '2031-01-04')

    await page.reload()
    await controls(page, '2030-11')
    assert.equal(await plan.inputValue(), '2030-11-09')
    assert.equal(await actual.inputValue(), '2030-12-08')
    await planCard.getByRole('button', { name: 'Undo early lock', exact: true }).click()
    await planCard.getByText('Open', { exact: true }).waitFor()
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('TC-SET-02: month locks can be returned independently to their configured defaults', async () => {
  const { page, context, errors } = await openPage(app, { roles: true })
  try {
    await controls(page, '2030-11')
    const plan = page.getByLabel('Planning last day to update of November 2030', { exact: true })
    const actual = page.getByLabel('Actuals last day to update of November 2030', { exact: true })
    await plan.fill('2030-11-11')
    await actual.fill('2030-12-12')
    await page.locator('.control-card').filter({ has: plan }).getByRole('button', { name: 'Use default', exact: true }).click()
    assert.equal(await plan.inputValue(), '2030-11-05')
    assert.equal(await actual.inputValue(), '2030-12-12')
    await page.locator('.control-card').filter({ has: actual }).getByRole('button', { name: 'Use default', exact: true }).click()
    assert.equal(await actual.inputValue(), '2030-12-04')
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})
