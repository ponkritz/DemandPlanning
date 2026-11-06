import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { loadSample, navigate, openPage, startApp, text } from './helpers.mjs'

// New User Story under a Feature (BKL-19, TC-BKL-10): the form opens from a Feature row of the Backlogs, laid out like
// New Feature with the Azure DevOps User Story fields. Nothing is written: the sample has no Azure DevOps connection.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

test('TC-BKL-10: ＋ User Story on a Feature opens the New User Story form with the Feature as parent and the story fields', async () => {
  const { page, context, errors } = await openPage(app)
  await loadSample(page)
  await navigate(page, 'QMS-0025')
  await page.getByRole('button', { name: 'Expand all backlog items' }).click()
  const row = page.locator('.backlog-table tr', { has: page.getByRole('button', { name: '＋ User Story' }) }).first()
  const featureId = /#?(\d+)/.exec(await text(row))?.[1]
  await row.getByRole('button', { name: '＋ User Story' }).click()
  const form = page.locator('form.nf-form')
  await form.waitFor()
  const content = await text(form)
  assert.match(content, /Under Feature.*Assigned to.*Sprint.*Story Points.*Priority.*Description.*Acceptance criteria.*More fields/)
  assert.doesNotMatch(content, /Area|State/, 'the Area Path is the Feature’s and State is New: neither is shown')
  assert.ok((await form.getByLabel('Under Feature').locator('option:checked').innerText()).includes(`#${featureId}`), 'the Feature the row belongs to is the parent')
  assert.equal(await form.getByLabel('Priority').inputValue(), '2', 'Azure’s default Priority')
  await form.getByText(/More fields/).click()
  assert.equal(await form.getByLabel('Value area').inputValue(), 'Business', 'Azure’s default Value area')
  assert.equal(await form.getByRole('button', { name: 'Save' }).isDisabled(), true, 'no title and no Sprint yet: nothing can be saved')
  await form.getByRole('button', { name: 'Cancel' }).click()
  assert.equal(await page.locator('form.nf-form').count(), 0)
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-BKL-11: Edit on a Feature, User Story and Task row opens the Edit form, which reads the item fresh from Azure DevOps first', async () => {
  const { page, context, errors } = await openPage(app)
  await loadSample(page)
  await navigate(page, 'QMS-0025')
  await page.getByRole('button', { name: 'Expand all backlog items' }).click()
  for (const type of ['Feature', 'User Story', 'Task']) {
    const row = page.locator('.backlog-table tbody tr').filter({ has: page.locator('td', { hasText: new RegExp(`^${type}$`) }) }).filter({ has: page.getByRole('button', { name: 'Edit', exact: true }) }).first()
    await row.getByRole('button', { name: 'Edit', exact: true }).click()
    const form = page.locator('form.edit-form')
    await form.waitFor()
    assert.match(await text(page.locator('.modal').first()), new RegExp(`EDIT · AZURE DEVOPS WRITE ${type} #\\d+`), `${type}: the form names the item`)
    assert.match(await text(form), /PAT — Work Items: Read & Write/, 'without a token the item is not read, and nothing can be saved')
    assert.equal(await form.getByRole('button', { name: 'Save' }).isDisabled(), true)
    await form.getByRole('button', { name: 'Cancel' }).click()
  }
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-BKL-12: QMS-0025 opens filtered to the person browsing; clearing the filter shows everyone; rows offer ＋ Time Writing Task', async () => {
  const { page, context, errors } = await openPage(app, { init: () => { localStorage.setItem('demand-planning-work-email-v1', 'nobody@example.com') } })
  await loadSample(page)
  await navigate(page, 'QMS-0025')
  const mine = page.getByRole('button', { name: 'Assigned to me ✕' })
  await mine.waitFor()
  assert.equal(await mine.getAttribute('aria-pressed'), 'true', 'filtered by default')
  assert.equal(await page.locator('.backlog-table tbody tr').count(), 0, 'nothing in the sample is assigned to this email')
  await mine.click()
  await page.getByRole('button', { name: 'Show only mine' }).waitFor()
  assert.ok(await page.locator('.backlog-table tbody tr').count() > 0, 'cleared: everyone’s work')
  await page.getByRole('button', { name: 'Expand all backlog items' }).click()
  assert.ok(await page.getByRole('button', { name: '＋ Time Writing Task' }).count() > 0, 'Feature and Story rows offer ＋ Time Writing Task')
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-BKL-13: New Feature opens with the Parent Epic blank; every Epic is offered', async () => {
  const { page, context, errors } = await openPage(app)
  await loadSample(page)
  await navigate(page, 'QMS-0025')
  await page.getByRole('button', { name: '＋ New Feature' }).first().click()
  const form = page.locator('form.nf-form')
  await form.waitFor()
  const epic = form.getByLabel('Parent Epic')
  assert.equal(await epic.inputValue(), '', 'no Epic is chosen when the form opens')
  assert.equal(await epic.locator('option:checked').innerText(), 'Choose the parent Epic…')
  assert.ok(await epic.locator('option').count() > 1, 'the Epics are offered')
  await form.getByRole('button', { name: 'Cancel' }).click()
  assert.equal(await page.locator('form.nf-form').count(), 0)
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-BKL-15: New Feature offers your own User Story (title and description) under the new Feature', async () => {
  const { page, context, errors } = await openPage(app)
  await loadSample(page)
  await navigate(page, 'QMS-0025')
  await page.getByRole('button', { name: '＋ New Feature' }).first().click()
  const form = page.locator('form.nf-form')
  await form.waitFor()
  const own = form.locator('fieldset.nf-own-story')
  assert.match(await text(own.locator('legend')), /Your own User Story/)
  await own.getByRole('textbox', { name: /^User Story title/ }).fill('Write the plan')
  await own.getByRole('textbox', { name: /^User Story description/ }).fill('Why and what')
  await form.getByRole('button', { name: 'Cancel' }).click()
  assert.deepEqual(errors, [])
  await context.close()
})
