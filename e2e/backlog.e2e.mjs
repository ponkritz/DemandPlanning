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
