import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { navigate, openPage, startApp, text } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'

// My User Story templates (STT-04…STT-07; TC-STT-04 UAT, TC-STT-06): a Team Member sees the shared User Story templates
// read only (SET-31), creates a template of her own under My templates (this browser only), and uses it — labelled
// "Mine", after the shared ones — to create a User Story under a Feature with the New User Story form; the create body
// sent to the mocked dev.azure.com carries its title ({feature} filled) and description. Another person on the same
// browser (another work email) sees neither the template in My templates nor in the picker, while the shared one stays.
// Against a mocked GitHub (access.json, epic-setup.json) and a mocked dev.azure.com; synthetic data only; every step
// waits for what it needs, never for a time. MY_TEMPLATES_SHOTS=<folder> saves the screenshots (1440 px, light, scale 2).
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })
const shots = process.env.MY_TEMPLATES_SHOTS
const shoot = async (locator, name) => { if (!shots) return; mkdirSync(shots, { recursive: true }); await locator.screenshot({ path: `${shots}/${name}.png` }) }

const member = 'tia.member@example.com', other = 'omar.other@example.com', lead = 'tom.owner@example.com'
const policy = () => { const value = defaultPolicy(); value.defaultRole = 'Team Member'; value.members = { [lead]: ['Tool Owner'], [member]: ['Team Member'], [other]: ['Team Member'] }; return serializeAccess(value) }
const epicSetup = { schema: 1, kind: 'epic-setup', lists: [], epics: [], storyTemplates: [{ id: 't-sfv', title: 'SFV : Review of Deliverables', description: 'Shared review steps', epics: [], classes: [] }] }

const now = new Date()
const at = (days) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10)
const sprints = [['Sprint 1', at(-50), at(-11)], ['Sprint 2', at(-10), at(10)], ['Sprint 3', at(11), at(60)]]
const raw = (id, type, title, parent, who = member) => ({ id, rev: 1, fields: { 'System.TeamProject': 'Quality', 'System.WorkItemType': type, 'System.Title': title, 'System.State': 'Active', 'System.AreaPath': 'Quality\\Team A', 'System.IterationPath': 'Quality\\PI 1', ...(parent ? { 'System.Parent': parent } : {}), 'System.AssignedTo': { displayName: who, uniqueName: who } } })
const node = (path, children = [], attributes) => ({ name: path.split('\\').at(-1) || 'Quality', path: `\\Quality\\Iteration${path ? `\\${path}` : ''}`, ...(attributes ? { attributes } : {}), children })
// dev.azure.com: Epic #100 with Feature #200 "Viewer 4.2"; Sprints around today; every create recorded with its body.
function fakeAzure() {
  const world = [raw(100, 'Epic', 'Imaging releases'), raw(200, 'Feature', 'Viewer 4.2', 100)]
  const creates = []
  let next = 1000
  const route = (route) => {
    const request = route.request(), url = new URL(request.url()), path = decodeURIComponent(url.pathname)
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/_apis/work/teamsettings/teamfieldvalues')) return json({ field: { referenceName: 'System.AreaPath' }, values: [{ value: 'Quality\\Team A', includeChildren: true }] })
    if (path.endsWith('/_apis/work/backlogs/Microsoft.EpicCategory/workItems')) return json({ workItems: [{ target: { id: 100 } }] })
    if (path.endsWith('/_apis/wit/workitemsbatch')) { const ids = JSON.parse(request.postData() ?? '{}').ids ?? []; return json({ value: world.filter((item) => ids.includes(item.id)) }) }
    if (path.endsWith('/_apis/wit/wiql')) {
      const query = JSON.parse(request.postData() ?? '{}').query ?? ''
      const one = /\[System\.Parent\] = (\d+)/.exec(query), many = /\[System\.Parent\] IN \(([\d,\s]+)\)/.exec(query)
      const parents = one ? [Number(one[1])] : (many?.[1] ?? '').split(',').map(Number), after = Number(/\[System\.Id\] > (\d+)/.exec(query)?.[1] ?? 0)
      return json({ workItems: world.filter((item) => parents.includes(item.fields['System.Parent']) && item.id > after).map((item) => ({ id: item.id })) })
    }
    if (path.endsWith('/_apis/work/teamsettings/iterations')) return json({ value: sprints.map(([name, start, finish]) => ({ name, path: `Quality\\PI 1\\${name}`, attributes: { startDate: `${start}T00:00:00Z`, finishDate: `${finish}T00:00:00Z` } })) })
    if (path.endsWith('/_apis/wit/classificationnodes/iterations')) return json(node('', [node('PI 1', sprints.map(([name, start, finish]) => node(`PI 1\\${name}`, [], { startDate: `${start}T00:00:00Z`, finishDate: `${finish}T00:00:00Z` })))]))
    const create = /\/_apis\/wit\/workitems\/\$(.+)$/.exec(path)
    if (create && request.method() === 'POST') {
      const type = create[1], patch = JSON.parse(request.postData() ?? '[]')
      const fields = Object.fromEntries(patch.filter((entry) => entry.path.startsWith('/fields/')).map((entry) => [entry.path.slice(8), entry.value]))
      const parent = Number(/\/workItems\/(\d+)$/.exec(patch.find((entry) => entry.path === '/relations/-')?.value?.url ?? '')?.[1] ?? 0)
      if (url.searchParams.get('validateOnly') === 'true') return json({ id: 0, fields: {} })
      const item = { id: ++next, rev: 1, fields: { 'System.TeamProject': 'Quality', 'System.WorkItemType': type, 'System.State': 'New', ...fields, 'System.Parent': parent, 'System.AssignedTo': { displayName: fields['System.AssignedTo'], uniqueName: fields['System.AssignedTo'] } } }
      world.push(item); creates.push({ host: url.host, type, fields, parent, id: item.id })
      return json(item)
    }
    return json({ value: [] })
  }
  return { route, creates }
}

const profile = { id: 'tw', url: 'https://dev.azure.com/example/Quality/_backlogs/backlog/Team%20A/Epics', token: 'x'.repeat(52), reason: 'QMS-0025', role: 'time-tracking', showInMenu: true, creatorEmail: member }
async function openApp(gh, azure, email, context) {
  const opened = context ? { context, page: await context.newPage(), errors: [] } : await openPage(app, { width: 1440, height: 1000, scale: shots ? 2 : undefined, init: ({ list }) => {
    if (sessionStorage.getItem('e2e-started')) return
    sessionStorage.setItem('e2e-started', '1')
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify(list))
  }, initArg: { list: [profile] } })
  if (!context) {
    await opened.context.route('https://api.github.com/**', gh.route)
    await opened.context.route('https://dev.azure.com/**', azure.route)
  }
  const { page } = opened
  if (context) { page.on('pageerror', (error) => opened.errors.push(error.message)); await page.goto(app.url) }
  for (const title of ['Get started', 'Could not fetch from Azure DevOps']) {
    const dialog = page.getByRole('dialog').filter({ hasText: title })
    await page.addLocatorHandler(dialog, () => dialog.getByRole('button', { name: 'Close', exact: true }).last().click())
  }
  await page.evaluate((who) => localStorage.setItem('demand-planning-work-email-v1', who), email)
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  return opened
}
async function openTemplates(page) {
  await navigate(page, 'Feature & PI setup')
  await page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'User Story templates' }).click()
  const shared = page.locator('article.panel.story-templates'), mine = page.locator('article.panel.my-story-templates')
  await shared.locator('tbody tr', { hasText: 'SFV : Review of Deliverables' }).waitFor()
  await mine.waitFor()
  return { shared, mine }
}
async function newStoryForm(page) {
  await navigate(page, 'QMS-0025')
  const fetch = page.getByRole('button', { name: /^(Fetch|Refresh) from Azure$/ }).first()
  if (await fetch.count()) await fetch.click()
  // Everyone's work (the board opens filtered to the person browsing; the Feature is Tia's).
  const assigned = page.getByRole('button', { name: /^Assigned to:/ })
  await assigned.click()
  await page.getByRole('listbox', { name: 'Assigned to' }).getByRole('button', { name: 'All', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.locator('.backlog-table tbody tr', { hasText: 'Imaging releases' }).first().waitFor()
  await page.getByRole('button', { name: 'Expand all backlog items' }).click()
  const row = page.locator('.backlog-table tbody tr', { hasText: 'Viewer 4.2' }).filter({ has: page.getByRole('button', { name: '＋ User Story' }) }).first()
  await row.getByRole('button', { name: '＋ User Story' }).click()
  const form = page.locator('form.nf-form')
  await form.waitFor()
  return form
}
const groups = (select) => select.locator('optgroup').evaluateAll((list) => list.map((group) => [group.label, [...group.querySelectorAll('option')].map((option) => option.textContent)]))

test('TC-STT-04: a Team Member sees the shared templates read only, adds her own under My templates and creates a User Story from it (“Mine”); another person does not see it', async () => {
  const gh = fakeGitHub({ files: { 'access.json': policy(), 'epic-setup.json': `${JSON.stringify(epicSetup, null, 2)}\n` } })
  const azure = fakeAzure()
  const { page, context, errors } = await openApp(gh, azure, member)

  // (1) The shared templates: shown, read only with the reason; My templates: empty, ＋ New template… allowed.
  let { shared, mine } = await openTemplates(page)
  assert.match(await text(shared), /View only: your role is not allowed “Edit Epic setup value lists and User Story templates”\./)
  assert.equal(await shared.getByRole('button', { name: /New template/ }).count(), 0, 'no shared ＋ New template')
  assert.equal(await shared.getByRole('button', { name: /^Edit / }).count(), 0, 'no shared Edit')
  await mine.getByText('No templates of your own yet.').waitFor()
  await mine.getByRole('button', { name: '＋ New template…' }).click()
  const editor = page.getByRole('dialog', { name: 'New template' })
  assert.match(await text(editor), /MY TEMPLATES · ONLY YOU/)
  await editor.getByLabel('Template title').fill('Check the test plan of {feature}')
  // A PAT in the text is refused with the reason; the pop-up stays open.
  await editor.getByLabel('Template description').fill(`Token ${'abcdefghijklmnopqrstuvwxyz234567'.repeat(2).slice(0, 52)}`)
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await editor.getByText('looks like an Azure DevOps PAT', { exact: false }).waitFor()
  await editor.getByLabel('Template description').fill('Walk through the plan with the QE.')
  const footer = await editor.locator('.modal-actions button').allInnerTexts()
  assert.deepEqual(footer, ['Cancel', 'Save'], 'Cancel, then the main action')
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await editor.waitFor({ state: 'detached' })
  await mine.locator('tbody tr', { hasText: 'Check the test plan of {feature}' }).waitFor()
  assert.match(await text(mine), /Added “Check the test plan of \{feature\}” — in this browser only\./)
  await shoot(page.locator('.admin-page, main').first(), 'my-templates-section')
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('demand-planning-my-story-templates-v1')))
  assert.deepEqual(Object.keys(stored.people), [member], 'kept under my work email')
  assert.equal(stored.people[member][0].description, 'Walk through the plan with the QE.')
  assert.equal(gh.writes.length, 0, 'nothing written to Git')

  // (2) New User Story: the shared template, then mine under “Mine”; the pick fills the title ({feature}) and description.
  let form = await newStoryForm(page)
  let pick = form.getByLabel('Start from a template')
  assert.deepEqual(await groups(pick), [['Shared templates', ['SFV : Review of Deliverables']], ['Mine', ['Check the test plan of {feature}']]])
  await pick.selectOption({ label: 'Check the test plan of {feature}' })
  assert.equal(await form.getByLabel('User Story title').inputValue(), 'Check the test plan of Viewer 4.2')
  assert.equal(await form.locator('label', { hasText: /^Description/ }).locator('textarea').inputValue(), 'Walk through the plan with the QE.')
  const sprint = form.getByLabel('PI / Sprint schedule')
  await sprint.locator('option', { hasText: 'Sprint 2' }).waitFor({ state: 'attached' })
  await shoot(page.locator('.modal').first(), 'my-templates-new-user-story')
  await form.getByRole('button', { name: 'Save', exact: true }).and(form.locator(':enabled')).click()
  await form.waitFor({ state: 'detached' })
  for (let i = 0; i < 600 && !azure.creates.length; i++) await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(azure.creates.length, 1, 'one User Story created')
  const [story] = azure.creates
  assert.deepEqual([story.host, story.type, story.parent, story.fields['System.Title'], story.fields['System.AssignedTo']], ['dev.azure.com', 'User Story', 200, 'Check the test plan of Viewer 4.2', member])
  assert.match(story.fields['System.Description'], /Walk through the plan with the QE\./)
  assert.equal(story.fields['System.IterationPath'], 'Quality\\PI 1\\Sprint 2')
  assert.deepEqual(errors, [])

  // (3) Another person on the same browser (another work email): My templates empty, no “Mine” in the picker; the shared one stays.
  const second = await openApp(gh, azure, other, context)
  ;({ shared, mine } = await openTemplates(second.page))
  await mine.getByText('No templates of your own yet.').waitFor()
  assert.equal(await mine.locator('tbody tr').count(), 0)
  form = await newStoryForm(second.page)
  pick = form.getByLabel('Start from a template')
  assert.deepEqual(await groups(pick), [['Shared templates', ['SFV : Review of Deliverables']]], 'no “Mine” for another person')
  await form.getByRole('button', { name: 'Cancel' }).click()
  const kept = await second.page.evaluate(() => JSON.parse(localStorage.getItem('demand-planning-my-story-templates-v1')))
  assert.deepEqual(Object.keys(kept.people), [member], 'hers stay on this browser, untouched')
  assert.equal(gh.writes.length, 0, 'still nothing written to Git')
  assert.doesNotMatch(gh.read('epic-setup.json'), /Check the test plan/, 'the shared templates unchanged')
  assert.deepEqual(second.errors, [])
  await context.close()
})
