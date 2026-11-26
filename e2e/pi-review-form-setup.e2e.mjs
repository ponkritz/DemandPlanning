import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { navigate, openPage, profileItem, startApp, text } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'
import { buildReviewComment, emptyReviewForm } from '../src/piReviewPost.ts'
import { builtInFormSetup, parsePiFormSetup, serializePiFormSetup } from '../src/piReviewSetup.ts'

// PI Review form setup (PIR-19…PIR-22, PIR-24, PIR-29…PIR-31, CON-114; TC-PIR-23 UAT, TC-PIR-24, TC-PIR-31 UAT): against a
// mocked GitHub (access.json, the shared pi-review-form.json) and a fake dev.azure.com (the Time Writing fetch, the
// iterations, the Discussions and a comment POST). Rita Gomez is the Scrum Master and the assignee of Feature 205; Pia
// Patel is a People Manager; Tom Owner the Tool Owner (Feature 206); Tia Member a Team Member (Feature 207). The Scrum
// Master opens Admin → PI Review Setup from the menu, adds a field and changes the Move default (the shared column-list
// editor of the On-Demand pages); a colliding heading is refused; the form and the posted comment follow the setup. The
// People Manager has no PI Review Setup (menu, Search settings, gear), and PI Review shows the added field as a column.
// The ⚙ PI Review Setup button in My PI Review and PI Review: shown to the Tool Owner and the Scrum Master — in View as
// too, then read only — not to the Team Member or the People Manager.
// Synthetic data only; every step waits for what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })
const shots = process.env.PI_FORM_SHOTS
const shot = async (page, name) => { if (!shots) return; mkdirSync(shots, { recursive: true }); await page.screenshot({ path: `${shots}/${name}.png` }) }

const rita = { displayName: 'Rita Gomez', uniqueName: 'rita.gomez@example.com' }
const raw = (id, type, title, iterationPath, parent, assignee = rita) => ({ id, rev: 1, fields: { 'System.TeamProject': 'Project', 'System.WorkItemType': type, 'System.Title': title, 'System.State': 'Active', 'System.AreaPath': 'Project\\Quality', 'System.IterationPath': iterationPath, ...(parent ? { 'System.Parent': parent } : {}), 'System.AssignedTo': assignee } })
const tom = { displayName: 'Tom Owner', uniqueName: 'tom.owner@example.com' }, tia = { displayName: 'Tia Member', uniqueName: 'tia.member@example.com' }
const world = () => [raw(100, 'Epic', 'DP releases', 'Project'), raw(205, 'Feature', 'Lab rig upgrade', 'Project\\PI 2026.4', 100), raw(206, 'Feature', 'Fixture library refresh', 'Project\\PI 2026.4', 100, tom), raw(207, 'Feature', 'Sample tracking labels', 'Project\\PI 2026.4', 100, tia)]
const dated = (name, path, start, finish) => ({ name, path, attributes: { startDate: `${start}T00:00:00Z`, finishDate: `${finish}T00:00:00Z` } })
const node = (path, children = [], attributes) => ({ name: path.split('\\').at(-1) || 'Project', path: `\\Project\\Iteration${path ? `\\${path}` : ''}`, ...(attributes ? { attributes } : {}), children })
function fakeAzure(state) {
  return (route) => {
    const request = route.request(), url = new URL(request.url()), path = decodeURIComponent(url.pathname)
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/_apis/work/teamsettings/teamfieldvalues')) return json({ field: { referenceName: 'System.AreaPath' }, values: [{ value: 'Project\\Quality', includeChildren: true }] })
    if (path.endsWith('/_apis/work/backlogs/Microsoft.EpicCategory/workItems')) return json({ workItems: [{ target: { id: 100 } }] })
    if (path.endsWith('/_apis/wit/workitemsbatch')) { const ids = JSON.parse(request.postData() ?? '{}').ids ?? []; return json({ value: state.world.filter((item) => ids.includes(item.id)) }) }
    if (path.endsWith('/_apis/wit/wiql')) {
      const query = JSON.parse(request.postData() ?? '{}').query ?? ''
      const parents = (/\[System\.Parent\] IN \(([\d,]+)\)/.exec(query)?.[1] ?? '').split(',').map(Number), after = Number(/\[System\.Id\] > (\d+)/.exec(query)?.[1] ?? 0)
      return json({ workItems: state.world.filter((item) => parents.includes(item.fields['System.Parent']) && item.id > after).map((item) => ({ id: item.id })) })
    }
    if (path.endsWith('/_apis/work/teamsettings/iterations')) return json({ value: [dated('Sprint 2', 'Project\\PI 2026.4\\Sprint 2', '2000-01-01', '2099-12-31')] })
    if (path.endsWith('/_apis/wit/classificationnodes/iterations')) return json(node('', [node('PI 2026.4', [node('PI 2026.4\\Sprint 2', [], { startDate: '2000-01-01T00:00:00Z', finishDate: '2099-12-31T00:00:00Z' })]), node('PI 2026.5')]))
    if (/\/teams\/[^/]+\/members/.test(path)) return json({ value: [] })
    const comments = /\/_apis\/wit\/workItems\/(\d+)\/comments$/.exec(path)
    if (comments) {
      const id = Number(comments[1]), list = state.comments[id] ??= []
      if (request.method() === 'POST') {
        const body = JSON.parse(request.postData() ?? '{}')
        state.posts.push({ id, body })
        const comment = { id: 900 + state.posts.length, text: body.text, createdBy: rita, createdDate: new Date(Date.UTC(2026, 10, 25, 9, state.posts.length)).toISOString() }
        list.unshift(comment)
        return json(comment)
      }
      return json({ comments: list, count: list.length })
    }
    return json({ value: [] })
  }
}
const policy = () => { const value = defaultPolicy(); value.defaultRole = 'Team Member'; value.members = { 'rita.gomez@example.com': ['Scrum Master'], 'pia.patel@example.com': ['People Manager'], 'tom.owner@example.com': ['Tool Owner'], 'tia.member@example.com': ['Team Member'] }; return serializeAccess(value) }
async function open(gh, email, { comments = {} } = {}) {
  const state = { world: world(), comments, posts: [] }
  const profile = { id: 'tw-pir', url: 'https://dev.azure.com/example/Project/_backlogs/backlog/Team%20A/Features', reason: 'Time Writing', token: 'x'.repeat(52), role: 'time-tracking', creatorEmail: email }
  const { page, context, errors } = await openPage(app, { width: 1440, height: 900, scale: shots ? 2 : undefined, init: ({ connection, who }) => {
    localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify([connection]))
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', who)
  }, initArg: { connection: profile, who: email } })
  await page.emulateMedia({ colorScheme: 'light' })
  await context.route('https://api.github.com/**', gh.route)
  await context.route('https://dev.azure.com/**', fakeAzure(state))
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, () => guide.getByRole('button', { name: 'Close', exact: true }).last().click())
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors, state }
}
// PIR-29: Admin → PI Review Setup, from the menu.
async function openSetup(page) {
  await navigate(page, 'PI Review Setup')
  assert.equal(await text(page.locator('header.topbar h1')), 'PI Review Setup')
  const panel = page.locator('article.pir-setup')
  await panel.waitFor()
  return panel
}
// PIR-30: ⚙ PI Review Setup in the page header (an icon-only button named by its aria-label).
const gear = (page) => page.locator('.page-toolbar').getByRole('button', { name: 'PI Review Setup', exact: true })
const until = async (check, what) => { for (const end = Date.now() + 60000; Date.now() < end;) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 50)) } assert.fail(`timed out waiting for ${what}`) }

test('TC-PIR-23: the Scrum Master changes the PI Review form in the shared column editor — a colliding heading refused, saved to Git; Write review… follows it and posts the new field', async () => {
  const gh = fakeGitHub({ files: { 'access.json': policy() } })
  const { page, context, errors, state } = await open(gh, 'rita.gomez@example.com')
  const panel = await openSetup(page)
  assert.match(await text(panel), /The built-in form \(no setup saved in Git yet\)/)
  assert.deepEqual(await panel.locator('tbody tr td:first-child strong').allInnerTexts(), ['Learnings', 'Struggles', 'Move to next PI', 'Advise to discuss the Feature during the Review meeting?', 'Additional Remarks'])
  assert.equal(await panel.locator('.write-blocked').count(), 0, 'the Scrum Master may edit')
  await shot(page, 'pi-review-setup-scrum-master')
  await panel.getByRole('button', { name: 'Edit form…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit the PI Review form' })
  await dialog.waitFor()
  // The shared editor: Move to next PI is locked (name, type, options, Required, remove); built-ins keep their type.
  assert.equal(await dialog.getByRole('textbox', { name: 'Field 3 name' }).isDisabled(), true)
  assert.equal(await dialog.getByRole('button', { name: 'Remove field Move to next PI' }).isDisabled(), true)
  assert.equal(await dialog.getByRole('combobox', { name: 'Field 1 type' }).isDisabled(), true)
  assert.deepEqual(await dialog.getByRole('combobox', { name: 'Field 1 type' }).locator('option').allInnerTexts(), ['Long text', 'Dropdown (one value)'])
  // Add a Dropdown field "Customer impact" with options, move it above Additional Remarks, and change the Move default.
  await dialog.getByRole('button', { name: '＋ Add field' }).click()
  await dialog.getByRole('textbox', { name: 'Field 6 name' }).fill('Customer impact')
  await dialog.getByRole('combobox', { name: 'Field 6 type' }).selectOption('dropdown')
  for (const [index, option] of ['None', 'Some sites', 'Many sites'].entries()) {
    await dialog.locator('li.od-column').nth(5).getByRole('button', { name: '＋ Add option' }).click()
    await dialog.getByRole('textbox', { name: `Customer impact option ${index + 1}` }).fill(option)
  }
  await dialog.getByRole('textbox', { name: 'Field 6 heading' }).fill('Issues')
  await dialog.getByRole('button', { name: 'Move Customer impact up' }).click()
  await dialog.getByRole('combobox', { name: 'Field 3 default' }).selectOption('Yes')
  await dialog.getByRole('button', { name: 'Save to Git' }).click()
  assert.match(await text(dialog.locator('.notice.error')), /“Issues” is already read as Struggles/)
  assert.equal(gh.read('pi-review-form.json'), null, 'nothing saved')
  await dialog.getByRole('textbox', { name: 'Field 5 heading' }).fill('Customer impact')
  await dialog.locator('li.od-column').nth(4).getByRole('checkbox', { name: 'Required' }).check()
  await dialog.locator('.pir-review-comment', { hasText: 'Customer impact : None' }).waitFor()
  assert.match(await dialog.locator('.pir-review-comment').innerText(), /Whether the feature needs to be shifted to PI 26\.5 : Yes/)
  assert.match(await dialog.locator('.pir-review-comment').innerText(), /Learnings of PI 26\.4:/, 'PIR-28: the sample names the reviewed PI')
  await shot(page, 'setup-editor-scrum-master')
  await dialog.getByRole('button', { name: 'Save to Git' }).click()
  await dialog.waitFor({ state: 'detached' })
  await until(() => gh.read('pi-review-form.json') !== null, 'the setup in Git')
  const saved = parsePiFormSetup(gh.read('pi-review-form.json'))
  assert.deepEqual(saved.fields.map((field) => field.label), ['Learnings', 'Struggles', 'Move to next PI', 'Advise to discuss the Feature during the Review meeting?', 'Customer impact', 'Additional Remarks'])
  assert.equal(saved.fields[2].defaultValue, 'Yes'); assert.equal(saved.fields[4].type, 'dropdown'); assert.equal(saved.changedBy, 'Rita Gomez')
  await panel.locator('tbody tr', { hasText: 'Customer impact' }).waitFor()
  assert.match(await text(panel), /Set up in Git \(pi-review-form\.json\)/)
  await shot(page, 'setup-summary-scrum-master')
  // My PI Review → Write review…: the added field, Move pre-selected Yes; the comment as the setup builds it. PIR-30:
  // the Scrum Master sees ⚙ PI Review Setup in the page header.
  await navigate(page, 'My PI Review')
  assert.equal(await gear(page).count(), 1, 'the Scrum Master sees the gear')
  await page.getByRole('button', { name: 'Review Feature 205' }).click()
  const review = page.getByRole('dialog', { name: 'Review of Feature #205' })
  await review.waitFor()
  assert.equal(await review.getByRole('radio', { name: 'Yes', exact: true }).isChecked(), true, 'the configured default')
  // PIR-32: the default is said in "ⓘ How to fill in" (the checked Yes shows it on the form).
  await page.mouse.move(0, 0)
  await review.getByRole('button', { name: 'ⓘ How to fill in' }).hover()
  assert.match(await text(page.getByRole('tooltip')), /Move to next PI is pre-selected Yes\./)
  await page.mouse.move(0, 0)
  await page.getByRole('tooltip').waitFor({ state: 'detached' })
  assert.doesNotMatch(await text(review), /pre-selected Yes/)
  await review.getByRole('textbox', { name: /^Learnings/ }).fill('Book the rig early')
  await review.getByRole('textbox', { name: /^Struggles/ }).fill('Parts late')
  await review.getByRole('radio', { name: 'Offline Review' }).check()
  await review.getByRole('button', { name: 'Post to Azure DevOps' }).click()
  assert.match(await text(review.locator('.notice.error')), /Choose Customer impact: None or Some sites or Many sites/)
  await review.getByRole('radio', { name: 'Some sites' }).check()
  const expected = buildReviewComment({ ...emptyReviewForm('PI 2026.5', saved), learnings: 'Book the rig early', struggles: 'Parts late', mode: 'Offline Review', extra: { 'f-6': 'Some sites' }, reviewedPi: 'PI 2026.4' }, saved)
  assert.deepEqual(await review.locator('.pir-review-comment > ul > li').evaluateAll((items) => items.map((item) => item.firstChild.textContent)), ['Learnings of PI 2026.4:', 'Struggles of PI 2026.4:', 'Whether the feature needs to be shifted to PI 2026.5 : Yes', 'Advise to discuss the Feature during the Review meeting : Offline Review', 'Customer impact : Some sites'])
  assert.match(expected, /<li>Customer impact : Some sites<\/li>/)
  await shot(page, 'review-form-after-change')
  await review.getByRole('button', { name: 'Post to Azure DevOps' }).click()
  await page.getByRole('dialog', { name: 'Post the review to Feature #205?' }).getByRole('button', { name: 'Post review to #205' }).click()
  await until(() => state.posts.length === 1, 'the comment POST')
  assert.deepEqual(state.posts[0], { id: 205, body: { text: expected } })
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-PIR-24: a People Manager has no PI Review Setup — not in the menu, Search settings or as a gear; PI Review reads the added field into a column of its own', async () => {
  const setup = builtInFormSetup()
  setup.fields.splice(4, 0, { id: 'f-6', label: 'Customer impact', heading: 'Customer impact', type: 'dropdown', options: ['None', 'Some sites'], required: true, defaultValue: '', help: '' })
  const gh = fakeGitHub({ files: { 'access.json': policy(), 'pi-review-form.json': serializePiFormSetup(setup) } })
  const comment = buildReviewComment({ ...emptyReviewForm('PI 2026.5', setup), learnings: 'a', struggles: 'b', mode: 'Offline Review', extra: { 'f-6': 'Some sites' } }, setup)
  const { page, context, errors } = await open(gh, 'pia.patel@example.com', { comments: { 205: [{ id: 7, text: comment, createdBy: rita, createdDate: '2026-11-21T14:30:00Z' }] } })
  // PIR-29: without "PI Review: set up the review form" the page is hidden — not in the Admin menu, not found by Search settings.
  await page.locator('.sidebar nav button', { hasText: 'Epic & Feature setup' }).waitFor()
  assert.equal(await page.locator('.sidebar nav button', { hasText: 'PI Review Setup' }).count(), 0, 'not in the menu')
  await page.keyboard.press('Control+k')
  const search = page.getByRole('dialog').filter({ hasText: 'Search settings' })
  await search.getByLabel('Search settings').fill('pi review form')
  await search.getByText(/No setting matches/).waitFor()
  await search.getByRole('button', { name: 'Close' }).click()
  // PI Review: Read all Discussions, then the Customer impact column.
  await navigate(page, 'PI Review')
  await page.locator('.pir-table tr[data-row-key="example/project/205"]').waitFor()
  await page.getByRole('button', { name: '↻ Read all Discussions' }).click()
  const headings = async () => page.locator('.pir-table thead th').evaluateAll((cells) => cells.map((th) => (th.querySelector('.sort-button')?.textContent ?? th.textContent ?? '').replace(/[▴▾]/g, '').trim()))
  await until(async () => (await text(page.locator('.pir-table tr[data-row-key="example/project/205"]'))).includes('Some sites'), 'the Customer impact cell')
  const columns = await headings()
  assert.ok(columns.indexOf('Customer impact') > columns.indexOf('Additional Remarks'), columns.join(' | '))
  assert.equal(await text(page.locator('.pir-table tr[data-row-key="example/project/205"] td').nth(columns.indexOf('Customer impact'))), 'Some sites')
  // PIR-30: no ⚙ for the People Manager (no "PI Review: set up the review form"), and the former Form setup is gone.
  assert.equal(await gear(page).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Form setup' }).count(), 0)
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-PIR-31: ⚙ PI Review Setup in My PI Review and PI Review — the Tool Owner opens the setup with it; in View as it follows the viewed role (read only); the Team Member has neither the gear nor the page', async () => {
  const gh = fakeGitHub({ files: { 'access.json': policy() } })
  const owner = await open(gh, 'tom.owner@example.com')
  let page = owner.page
  await navigate(page, 'My PI Review')
  await page.getByRole('button', { name: 'Review Feature 206' }).waitFor()
  const button = gear(page)
  assert.equal(await button.count(), 1, 'the Tool Owner sees the gear')
  assert.equal(await button.getAttribute('title'), 'PI Review Setup')
  await shot(page, 'my-pi-review-gear-tool-owner')
  await button.click()
  await page.locator('article.pir-setup').waitFor()
  assert.equal(await text(page.locator('header.topbar h1')), 'PI Review Setup')
  assert.equal(await page.getByRole('button', { name: 'Edit form…' }).isDisabled(), false, 'the Tool Owner may edit')
  // PI Review: the same gear replaces Form setup.
  await navigate(page, 'PI Review')
  await page.locator('.pir-table tr[data-row-key="example/project/206"]').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Form setup' }).count(), 0)
  await gear(page).click()
  await page.locator('article.pir-setup').waitFor()
  // View as the Scrum Master: the gear follows the viewed role (as the menu does); the page opens read only with the View as reason.
  await profileItem(page, 'View as…')
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'A role' }).check()
  await dialog.getByRole('combobox', { name: 'Role' }).selectOption('Scrum Master')
  await dialog.getByRole('button', { name: 'View as', exact: true }).click()
  await page.locator('.view-as-banner').waitFor()
  await navigate(page, 'My PI Review')
  await gear(page).waitFor()
  await shot(page, 'my-pi-review-gear-view-as-scrum-master')
  await gear(page).click()
  const viewed = page.locator('article.pir-setup')
  await viewed.waitFor()
  assert.equal(await viewed.getByRole('button', { name: 'Edit form…' }).isDisabled(), true)
  assert.match(await text(viewed.locator('.write-blocked')), /^Read only while viewing as the role Scrum Master/)
  assert.deepEqual(owner.errors, [])
  await owner.context.close()
  // The Team Member: no gear and no PI Review Setup in the menu.
  const member = await open(gh, 'tia.member@example.com')
  page = member.page
  await navigate(page, 'My PI Review')
  await page.getByRole('button', { name: 'Review Feature 207' }).waitFor()
  assert.equal(await gear(page).count(), 0, 'no gear for the Team Member')
  assert.equal(await page.locator('.sidebar nav button', { hasText: 'PI Review Setup' }).count(), 0, 'not in the menu')
  await shot(page, 'my-pi-review-no-gear-team-member')
  assert.deepEqual(member.errors, [])
  await member.context.close()
})
