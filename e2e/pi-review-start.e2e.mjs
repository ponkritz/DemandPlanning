import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { navigate, openPage, startApp, text } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'
import { buildReviewComment } from '../src/piReviewPost.ts'
import { builtInFormSetup, parsePiFormSetup, serializePiFormSetup } from '../src/piReviewSetup.ts'

// "PI Review starts from" (PIR-33; TC-PIR-34 UAT): against a mocked GitHub (access.json and pi-review-form.json with the
// start date) and a fake dev.azure.com (the Time Writing fetch, an iteration tree dated around today, the Discussions).
// The start date is 65 days ago and the PIs are dated around it, so the scenario does not depend on the clock: PI 2026.2
// without dates, PI 2026.3 ending the day before the start, PI 2026.4 (today's PI, dated by its Sprints) starting on it,
// PI 2027.1 after it. Rita Gomez is the Scrum Master and the assignee of Features 201 and 202; a PI 2026.3 choice is
// remembered from before. Synthetic data only; every step waits for what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })
const shots = process.env.PI_START_SHOTS
const shot = async (target, name) => { if (!shots) return; mkdirSync(shots, { recursive: true }); await target.screenshot({ path: `${shots}/${name}.png` }) }

const dayFromToday = (offset) => { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset)).toISOString().slice(0, 10) }
const start = dayFromToday(-65)
const rita = { displayName: 'Rita Gomez', uniqueName: 'rita.gomez@example.com' }
const raw = (id, type, title, iterationPath, parent, assignee = rita) => ({ id, rev: 1, fields: { 'System.TeamProject': 'Project', 'System.WorkItemType': type, 'System.Title': title, 'System.State': 'Active', 'System.AreaPath': 'Project\\Quality', 'System.IterationPath': iterationPath, ...(parent ? { 'System.Parent': parent } : {}), 'System.AssignedTo': assignee } })
const world = () => [raw(100, 'Epic', 'DP releases', 'Project'), raw(201, 'Feature', 'Lab rig upgrade', 'Project\\PI 2026.4', 100), raw(202, 'Feature', 'Supplier audit pack', 'Project\\PI 2026.4', 100), raw(203, 'Feature', 'Fixture library refresh', 'Project\\PI 2026.3', 100)]
const span = (from, to) => ({ startDate: `${from}T00:00:00Z`, finishDate: `${to}T00:00:00Z` })
const node = (path, children = [], attributes) => ({ name: path.split('\\').at(-1) || 'Project', path: `\\Project\\Iteration${path ? `\\${path}` : ''}`, ...(attributes ? { attributes } : {}), children })
const tree = () => node('', [
  node('PI 2026.2'),
  node('PI 2026.3', [], span(dayFromToday(-160), dayFromToday(-66))),
  node('PI 2026.4', [node('PI 2026.4\\Sprint 1', [], span(start, dayFromToday(-30))), node('PI 2026.4\\Sprint 2', [], span(dayFromToday(-29), dayFromToday(25)))]),
  node('PI 2027.1', [], span(dayFromToday(26), dayFromToday(115))),
])
const review = (id, offset, learnings, author = rita) => ({ id, text: buildReviewComment({ learnings, struggles: 'None', move: 'No', moveReason: '', movePi: 'PI 2027.1', mode: 'Offline Review', remarks: '', reviewedPi: 'PI 2026.4' }), createdBy: author, createdDate: `${dayFromToday(offset)}T10:00:00Z` })
// 201: Rita's review after the start, and an older one (before it); 202: only a review before the start.
const comments = () => ({ 201: [review(12, -5, 'Calibrate first'), review(11, -80, 'An old learning')], 202: [review(21, -70, 'Audit early')] })
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
    if (path.endsWith('/_apis/work/teamsettings/iterations')) return json({ value: [] })
    if (path.endsWith('/_apis/wit/classificationnodes/iterations')) return json(tree())
    if (/\/teams\/[^/]+\/members/.test(path)) return json({ value: [] })
    const found = /\/_apis\/wit\/workItems\/(\d+)\/comments$/.exec(path)
    if (found) { const list = state.comments[Number(found[1])] ?? []; return json({ comments: list, count: list.length }) }
    return json({ value: [] })
  }
}
const policy = () => { const value = defaultPolicy(); value.defaultRole = 'Team Member'; value.roles['Team Member'].areas.push('insights'); if (!value.roles['Scrum Master'].areas.includes('insights')) value.roles['Scrum Master'].areas.push('insights'); value.members = { 'rita.gomez@example.com': ['Scrum Master'] }; return serializeAccess(value) }
async function open(gh) {
  const state = { world: world(), comments: comments() }
  const profile = { id: 'tw-pir', url: 'https://dev.azure.com/example/Project/_backlogs/backlog/Team%20A/Features', reason: 'Time Writing', token: 'x'.repeat(52), role: 'time-tracking', creatorEmail: 'rita.gomez@example.com' }
  const { page, context, errors } = await openPage(app, { width: 1440, height: 900, scale: shots ? 2 : undefined, init: ({ connection }) => {
    localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify([connection]))
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', 'rita.gomez@example.com')
    // A PI chosen before the start date, remembered in this browser (PI Review and My PI Review).
    localStorage.setItem('demand-planning-pi-review-pi-v1', 'Project\\PI 2026.3')
    localStorage.setItem('demand-planning-my-pi-review-pi-v1', 'Project\\PI 2026.3')
  }, initArg: { connection: profile } })
  await page.emulateMedia({ colorScheme: 'light' })
  await context.route('https://api.github.com/**', gh.route)
  await context.route('https://dev.azure.com/**', fakeAzure(state))
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, () => guide.getByRole('button', { name: 'Close', exact: true }).last().click())
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors, state }
}
const until = async (check, what) => { for (const end = Date.now() + 60000; Date.now() < end;) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 50)) } assert.fail(`timed out waiting for ${what}`) }
async function cell(page, key, label) {
  const headings = await page.locator('.pir-table thead th').evaluateAll((cells) => cells.map((th) => (th.querySelector('.sort-button')?.textContent ?? th.textContent ?? '').replace(/[▴▾]/g, '').trim()))
  const at = headings.indexOf(label)
  assert.ok(at >= 0, `column ${label} in ${headings.join(' | ')}`)
  return text(page.locator(`.pir-table tr[data-row-key="${key}"] td`).nth(at))
}
const piSelect = (page) => page.getByLabel('PI', { exact: true })
const optionsOf = async (page) => piSelect(page).locator('option').allInnerTexts()

test('TC-PIR-34: PI Review starts from a date — the PI picker starts at PI 2026.4, a remembered older PI falls back to the current one, comments before the date are ignored; the Scrum Master changes the date in PI Review Setup', async () => {
  const gh = fakeGitHub({ files: { 'access.json': policy(), 'pi-review-form.json': serializePiFormSetup({ ...builtInFormSetup(), reviewStart: start }) } })
  const { page, context, errors } = await open(gh)
  // PI Review: PI 2026.2 (no dates, an older number) and PI 2026.3 (ended the day before) are not offered; the remembered
  // PI 2026.3 falls back to today's PI, without a fallback warning.
  await navigate(page, 'PI Review')
  await page.locator('.pir-filters .pill', { hasText: 'Current PI' }).waitFor()
  assert.deepEqual(await optionsOf(page), ['PI 2027.1', 'PI 2026.4 (current)'])
  assert.equal(await piSelect(page).inputValue(), 'Project\\PI 2026.4')
  assert.equal(await page.locator('.content .notice').count(), 0)
  await page.locator('.pir-table tr[data-row-key="example/project/201"]').waitFor()
  // The Discussions: the comments before the date are ignored — the latest review is the newer one; 202 has none.
  await page.getByRole('button', { name: '↻ Read all Discussions' }).click()
  await until(async () => await cell(page, 'example/project/202', 'Comments') === '0', 'the Discussions read')
  assert.equal(await cell(page, 'example/project/201', 'Comments'), '1')
  assert.equal(await cell(page, 'example/project/201', 'Learnings'), 'Calibrate first')
  assert.equal(await cell(page, 'example/project/202', 'Learnings'), '')
  if (shots) {
    // The PI picker, its options shown as a list for the screenshot.
    await piSelect(page).evaluate((select) => { select.size = select.options.length })
    await shot(page.locator('.pir-filters'), 'pi-picker-starts-at-pi-2026-4-1440-light')
    await piSelect(page).evaluate((select) => { select.removeAttribute('size') })
  }
  await page.locator('.pir-table tr[data-row-key="example/project/202"] td').nth(1).click()
  const drawer = page.locator('aside.drawer[role="dialog"]', { has: page.getByRole('heading', { name: 'Feature #202', exact: true }) })
  await drawer.waitFor()
  await drawer.getByText('No comments since').waitFor()
  assert.match(await text(drawer.locator('.pir-discussion')), /1 older comment \(before .+, when PI Review starts\) is ignored\./)
  await page.keyboard.press('Escape')
  await drawer.waitFor({ state: 'detached' })
  // My PI Review: the same PI list; 201 Reviewed (the newer review), 202 Not reviewed (its review is before the date).
  await navigate(page, 'My PI Review')
  await page.locator('.pir-filters .pill', { hasText: 'Current PI' }).waitFor()
  assert.deepEqual(await optionsOf(page), ['PI 2027.1', 'PI 2026.4 (current)'])
  const row = (id) => page.locator('.pir-table tbody tr').filter({ has: page.locator('td:first-child', { hasText: new RegExp(`^${id}$`) }) })
  await row('201').locator('.pill', { hasText: /^Reviewed$/ }).waitFor()
  assert.equal(await text(row('202').locator('td').nth(3)), 'Not reviewed')
  assert.match(await text(page.locator('.data-table-status')), /^1 of 2 reviewed$/)
  // Write review… on 202: not prefilled from the review before the date.
  await page.getByRole('button', { name: 'Write review of Feature 202' }).click()
  const dialog = page.getByRole('dialog', { name: 'Review of Feature #202' })
  assert.equal(await dialog.getByRole('textbox', { name: /^Learnings/ }).inputValue(), '')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await dialog.waitFor({ state: 'detached' })
  // PI Review Setup: the date is shown; the Scrum Master moves it back before PI 2026.3 and saves it to Git.
  await navigate(page, 'PI Review Setup')
  const panel = page.locator('article.pir-start')
  await panel.waitFor()
  await until(async () => !/\(the default\)/.test(await text(panel)), 'the date from Git')
  await shot(page, 'pi-review-setup-start-date-1440-light')
  await panel.getByRole('button', { name: 'Edit start date…' }).click()
  const editor = page.getByRole('dialog', { name: 'PI Review starts from' })
  assert.equal(await editor.getByLabel('PI Review starts from').inputValue(), start)
  const earlier = dayFromToday(-170)
  await editor.getByLabel('PI Review starts from').fill(earlier)
  await editor.getByRole('button', { name: 'Save to Git' }).click()
  await editor.waitFor({ state: 'detached' })
  await until(() => parsePiFormSetup(gh.read('pi-review-form.json')).reviewStart === earlier, 'the date saved to Git')
  assert.equal(parsePiFormSetup(gh.read('pi-review-form.json')).fields.length, 5, 'the form fields kept')
  // PI Review offers PI 2026.3 and PI 2026.2 again; the older comment of 201 is read again and counted.
  await navigate(page, 'PI Review')
  await until(async () => (await optionsOf(page)).length === 4, 'the older PIs offered')
  assert.deepEqual(await optionsOf(page), ['PI 2027.1', 'PI 2026.4 (current)', 'PI 2026.3', 'PI 2026.2'])
  // The remembered PI 2026.3 is offered again, so it is chosen; back to PI 2026.4.
  assert.equal(await piSelect(page).inputValue(), 'Project\\PI 2026.3')
  await piSelect(page).selectOption('Project\\PI 2026.4')
  await page.locator('.pir-table tr[data-row-key="example/project/201"]').waitFor()
  await page.getByRole('button', { name: '↻ Read all Discussions' }).click()
  await until(async () => await cell(page, 'example/project/201', 'Comments') === '2', 'the Discussions read again')
  assert.deepEqual(errors, [])
  await context.close()
})
