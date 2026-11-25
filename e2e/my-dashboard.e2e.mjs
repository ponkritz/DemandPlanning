import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { editorTab, loadSample, menuOf, navigate, openPage, reloadWithSample, rolesFile, startApp, text } from './helpers.mjs'

// My dashboard as the person's own dashboard (MYD-14…MYD-24) against a mocked GitHub and the synthetic sample: the
// default My dashboard looks as before; ＋ Add block… adds a bar of Azure DevOps work by state, a KPI of this month's
// releases, a capacity utilization line and a narrative; a block moved and resized; a reload keeps them; another person
// does not see them; a role without Team insights sees "Not available for your role." on the capacity block; Reset
// restores the default (TC-MYD-07, UAT).
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const signIn = (email) => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'test-token')
  localStorage.setItem('demand-planning-work-email-v1', email)
  localStorage.setItem('demand-planning-my-name-v1', 'Ana Costa')
}
// The data repository: files by path (text), access.json with everyone in `role`, every write recorded.
async function mockGitHub(context, files, role) {
  const writes = []
  await context.route('https://dev.azure.com/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await context.route('https://api.github.com/**', (route) => {
    const request = route.request(), url = new URL(request.url())
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/repos/example/storage') return json({ visibility: 'private', permissions: { push: true } })
    if (url.pathname === '/repos/example/storage/commits') return json([])
    // GIT-25: the branch exists (as in a real repository), so a 404 of a file means it is missing.
    if (url.pathname === '/repos/example/storage/branches/main') return json({ name: 'main' })
    const match = /^\/repos\/example\/storage\/contents\/(.*)$/.exec(url.pathname)
    if (!match) return json({ message: 'Not Found' }, 404)
    const path = decodeURIComponent(match[1])
    if (request.method() === 'PUT') {
      if (path === '.demand-planning-write-check') return json({ message: 'Invalid request' }, 422)
      const body = JSON.parse(request.postData())
      files[path] = Buffer.from(body.content, 'base64').toString()
      writes.push({ path, message: body.message })
      return json({ content: { sha: `v${writes.length}` }, commit: { html_url: `https://github.com/example/storage/commit/v${writes.length}` } })
    }
    if (path === 'access.json') return json(rolesFile(role))
    if (files[path] != null) return json({ type: 'file', encoding: 'base64', content: Buffer.from(files[path]).toString('base64'), sha: `s${files[path].length}` })
    return json({ message: 'Not Found' }, 404)
  })
  return writes
}
async function open(email, files, role) {
  const { page, context, errors } = await openPage(app, { init: signIn, initArg: email })
  const writes = await mockGitHub(context, files, role)
  // The sample's Azure DevOps fetch is refused here (401): close the guide whenever it opens.
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, async () => { await guide.getByRole('button', { name: 'Close', exact: true }).last().click() })
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await loadSample(page)
  await navigate(page, 'My dashboard')
  await page.locator('.content').getByRole('heading', { name: /^My hours · / }).waitFor()
  return { page, context, errors, writes }
}
const sections = (page) => page.locator('.content .layout-section').evaluateAll((list) => list.map((entry) => entry.getAttribute('data-section')))
const panel = (page, title) => page.locator('.content .dsh-block', { has: page.locator('h2', { hasText: title }) })
const tile = (page, title) => page.locator('.content .my-dash-tile', { has: page.locator('span', { hasText: title }) })
const quiet = (errors) => errors.filter((entry) => !/401|Unauthorized/.test(entry))
const month = new Date().toISOString().slice(0, 7)

// Adds a block through the block pop-up: title, type, data source and any further choices.
async function addBlock(page, { title, type, source, more }) {
  await page.getByRole('button', { name: '＋ Add block…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a block' })
  await dialog.waitFor()
  await dialog.getByLabel('Title').fill(title)
  await dialog.getByRole('radio', { name: type, exact: true }).check()
  const pick = dialog.getByLabel('Data source')
  const label = await pick.locator('option', { hasText: source }).first().textContent()
  await pick.selectOption({ label })
  if (more) await more(dialog)
  await dialog.getByRole('button', { name: 'Add block' }).click()
  await dialog.waitFor({ state: 'detached' })
}

test('TC-MYD-07: My dashboard with blocks of my own from every data source — added, moved, resized, kept, private, per role, reset', async () => {
  const files = {}
  const { page, context, errors, writes } = await open('ana.costa@example.com', files, 'Tool Owner')
  const content = page.locator('.content')
  // MYD-14: the default My dashboard looks as before — its sections in their order, no block of my own.
  assert.deepEqual(await sections(page), ['hours', 'work', 'streams', 'releasecounts', 'signed'])
  assert.match(await text(content), /My hours.*Planned.*Recorded.*Utilization.*My open work.*Ready to close.*My streams and releases.*Release counts.*Signed by me/s)
  assert.equal(await content.locator('.dsh-block').count(), 0)

  // MYD-16: a bar of Azure DevOps work by state (not filtered by the period).
  await addBlock(page, { title: 'Work by state', type: 'Bar chart', source: 'Azure DevOps work', more: async (dialog) => {
    await dialog.getByLabel('Categories by').selectOption({ label: 'State (Dropdown)' })
    await dialog.getByLabel('Period filter on').selectOption({ value: '' })
  } })
  await panel(page, 'Work by state').locator('svg').first().waitFor()
  // MYD-17: a KPI of the releases of this month, counted as Pulse Check counts them.
  await addBlock(page, { title: 'Releases this month', type: 'KPI tile', source: 'Releases per stream', more: async (dialog) => {
    await editorTab(dialog, 'Filters') // CHT-70: the filters are on their own tab
    await dialog.getByRole('button', { name: '＋ Add filter' }).click()
    await dialog.getByLabel('Filter 1 column').selectOption({ label: 'Month' })
    await dialog.getByLabel('Filter 1 from month').fill(month)
    await dialog.getByLabel('Filter 1 to month').fill(month)
  } })
  await tile(page, 'Releases this month').locator('strong', { hasText: /^\d+$/ }).waitFor()
  // MYD-18: a capacity utilization line — the Average of Utilization % per month.
  await addBlock(page, { title: 'Utilization by month', type: 'Line chart', source: 'Capacity and utilization', more: async (dialog) => {
    await dialog.getByLabel('Measure').selectOption({ value: 'average' })
    await dialog.getByLabel('Of the Number column').selectOption({ label: 'Utilization %' })
  } })
  await panel(page, 'Utilization by month').locator('svg').first().waitFor()
  // MYD-24: a narrative over the Azure DevOps work.
  await addBlock(page, { title: 'Work summary', type: 'Narrative (text)', source: 'Azure DevOps work', more: async (dialog) => { await dialog.getByLabel('Period filter on').selectOption({ value: '' }) } })
  await panel(page, 'Work summary').locator('p, li').first().waitFor()
  assert.deepEqual(await sections(page), ['hours', 'work', 'streams', 'releasecounts', 'signed'], 'the sections stay; the blocks come after them')

  // MYD-14: move the bar above Signed by me and make it full width, in Customize.
  await content.getByRole('button', { name: 'Customize' }).click()
  await content.getByRole('button', { name: 'Move Work by state up' }).click()
  await content.getByLabel('Width of Work by state').selectOption('full')
  await content.getByRole('button', { name: 'Done' }).click()
  const order = async () => content.locator('.my-dash-grid > *').evaluateAll((list) => list.map((entry) => entry.getAttribute('data-section') ?? (entry.querySelector('h2')?.textContent ?? '').replace(/ⓘ.*$/s, '').trim()))
  assert.deepEqual((await order()).slice(0, 6), ['hours', 'work', 'streams', 'releasecounts', 'Work by state', 'signed'])
  await panel(page, 'Work by state').and(page.locator('.chart-w-full')).waitFor()
  // A block's ⋯ menu moves it too.
  const menu = await menuOf(page, 'Utilization by month')
  await menu.getByRole('menuitem', { name: 'Move down' }).click()
  assert.deepEqual((await order()).slice(-2), ['Work summary', 'Utilization by month'])

  // MYD-23: kept with my personal views — in this browser at once (with the synthetic sample loaded nothing is written
  // to Git; with live data the same file goes to personal-views/<email>.json).
  const kept = await page.evaluate(() => localStorage.getItem('demand-planning-views-v1:ana.costa@example.com'))
  assert.match(kept, /"my-dashboard"/)
  assert.match(kept, /Utilization by month/)
  assert.equal(writes.filter((write) => write.path.startsWith('personal-views/')).length, 0, 'nothing written while the sample is loaded')
  // … and a reload keeps them.
  await reloadWithSample(page)
  await navigate(page, 'My dashboard')
  await panel(page, 'Utilization by month').locator('svg').first().waitFor()
  assert.deepEqual((await order()).slice(0, 6), ['hours', 'work', 'streams', 'releasecounts', 'Work by state', 'signed'], 'kept after a reload')
  assert.equal(await tile(page, 'Releases this month').count(), 1)
  assert.deepEqual(quiet(errors), [])

  // Another person does not see them, even with Ana's file in Git: their own, default My dashboard.
  files['personal-views/ana.costa@example.com.json'] = kept
  const other = await open('ben.jones@example.com', files, 'Tool Owner')
  assert.deepEqual(await sections(other.page), ['hours', 'work', 'streams', 'releasecounts', 'signed'])
  assert.equal(await other.page.locator('.content .dsh-block').count(), 0, 'no block of Ana’s')
  assert.equal(await other.page.getByText('Releases this month').count(), 0)
  assert.deepEqual(quiet(other.errors), [])
  await other.context.close()

  // MYD-15: a role without Team insights sees "Not available for your role." on the capacity block (fail closed).
  files['personal-views/team.member@example.com.json'] = kept
  const member = await open('team.member@example.com', files, 'Team Member')
  await panel(member.page, 'Utilization by month').locator('.notice', { hasText: 'Not available for your role.' }).waitFor()
  assert.equal(await panel(member.page, 'Utilization by month').locator('svg').count(), 0, 'no capacity figures shown')
  assert.deepEqual(quiet(member.errors), [])
  await member.context.close()

  // MYD-14: Reset to the default My dashboard.
  await content.getByRole('button', { name: 'Customize' }).click()
  await content.getByRole('button', { name: 'Reset to the default My dashboard' }).click()
  await content.getByRole('button', { name: 'Done' }).click()
  await content.locator('.dsh-block').first().waitFor({ state: 'detached' })
  assert.deepEqual(await sections(page), ['hours', 'work', 'streams', 'releasecounts', 'signed'])
  assert.equal(await tile(page, 'Releases this month').count(), 0)
  assert.deepEqual(quiet(errors), [])
  await context.close()
})
