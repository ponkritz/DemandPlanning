import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { navigate, openPage, startApp, text } from './helpers.mjs'
import { buildReviewComment } from '../src/piReviewPost.ts'
import { commentHtml } from '../src/azureClient.ts'
import { defaultPolicy, serializeAccess } from '../src/access.ts'

// PI Review, the review form (PIR-13…PIR-18, PIR-24, PIR-25, CON-113; TC-PIR-16 UAT, TC-PIR-17, TC-PIR-18 UAT,
// TC-PIR-25, TC-PIR-26 UAT): against a fake
// dev.azure.com that also accepts a comment POST (recording its body, then listing it in the Discussion) and the Close
// PATCH. Rita Gomez is a Team Member and the assignee of Features 201 and 205; Feature 202 is Ben Okafor's; Lena Berg
// is a People Manager (a lead) with no Feature of her own. Synthetic data only; every step waits for what it needs,
// never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const rita = { displayName: 'Rita Gomez', uniqueName: 'rita.gomez@example.com' }, ben = { displayName: 'Ben Okafor', uniqueName: 'ben.okafor@example.com' }
const profile = (email) => ({ id: 'tw-pir', url: 'https://dev.azure.com/example/Project/_backlogs/backlog/Team%20A/Features', reason: 'Time Writing', token: 'x'.repeat(52), role: 'time-tracking', creatorEmail: email })
const raw = (id, type, title, iterationPath, parent, assignee = rita, state = 'Active') => ({ id, rev: 1, fields: { 'System.TeamProject': 'Project', 'System.WorkItemType': type, 'System.Title': title, 'System.State': state, 'System.AreaPath': 'Project\\Quality', 'System.IterationPath': iterationPath, ...(parent ? { 'System.Parent': parent } : {}), 'System.AssignedTo': assignee } })
const world = () => [
  raw(100, 'Epic', 'DP releases', 'Project'),
  raw(201, 'Feature', 'DP 4.2 release review', 'Project\\PI 2026.4', 100),
  raw(202, 'Feature', 'CP template update', 'Project\\PI 2026.4', 100, ben),
  raw(205, 'Feature', 'Lab rig upgrade', 'Project\\PI 2026.4', 100),
]
const dated = (name, path, start, finish) => ({ name, path, attributes: { startDate: `${start}T00:00:00Z`, finishDate: `${finish}T00:00:00Z` } })
const node = (path, children = [], attributes) => ({ name: path.split('\\').at(-1) || 'Project', path: `\\Project\\Iteration${path ? `\\${path}` : ''}`, ...(attributes ? { attributes } : {}), children })

// The fake dev.azure.com: the Time Writing fetch, the iterations (PI 2026.4 current, PI 2026.5 next), the Discussions,
// a comment POST (failing once with 500 when failNextPost is set) and the state PATCH. `log` lists the writes in order.
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
    if (path.endsWith('/_apis/wit/classificationnodes/iterations')) return json(state.tree ?? node('', [node('PI 2026.4', [node('PI 2026.4\\Sprint 2', [], { startDate: '2000-01-01T00:00:00Z', finishDate: '2099-12-31T00:00:00Z' })]), node('PI 2026.5')]))
    const patch = /\/_apis\/wit\/workitems\/(\d+)$/.exec(path)
    if (patch && request.method() === 'PATCH') {
      const item = state.world.find((entry) => entry.id === Number(patch[1]))
      for (const op of JSON.parse(request.postData() ?? '[]')) if (op.path === '/fields/System.State') item.fields['System.State'] = op.value
      state.log.push(`PATCH ${item.id} ${item.fields['System.State']}`)
      return json(item)
    }
    const comments = /\/_apis\/wit\/workItems\/(\d+)\/comments$/.exec(path)
    if (comments) {
      const id = Number(comments[1]), list = state.comments[id] ??= []
      if (request.method() === 'POST') {
        if (state.failNextPost) { state.failNextPost = false; state.log.push(`POST ${id} failed`); return json({ message: 'Service unavailable' }, 500) }
        const body = JSON.parse(request.postData() ?? '{}')
        state.posts.push({ id, body })
        state.log.push(`POST ${id}`)
        const comment = { id: 900 + state.posts.length, text: body.text, createdBy: rita, createdDate: new Date(Date.UTC(2026, 10, 25, 9, state.posts.length)).toISOString() }
        list.unshift(comment)
        return json(comment)
      }
      return json({ comments: list, count: list.length })
    }
    return json({ value: [] })
  }
}

// Everyone is a Team Member; Team Members are also given Team insights (PI Review) here — an Admin's choice in Role
// rights — so the assignee rule is shown on PI Review itself.
const teamMembersSeePiReview = () => { const policy = defaultPolicy(); policy.defaultRole = 'Team Member'; policy.roles['Team Member'].areas.push('insights'); return serializeAccess(policy) }
// PIR-25: an iteration tree with PI dates — PI 2026.4 (6 Jul – 4 Oct 2026, current by its Sprint), PI 2027.2 and PI 2027.1
// listed out of order; PI 2027.1 starts first after PI 2026.4 ends.
const span = (start, finish) => ({ startDate: `${start}T00:00:00Z`, finishDate: `${finish}T00:00:00Z` })
const datedTree = () => node('', [node('PI 2027.2', [], span('2027-01-04', '2027-04-04')), node('PI 2026.4', [node('PI 2026.4\\Sprint 2', [], span('2000-01-01', '2099-12-31'))], span('2026-07-06', '2026-10-04')), node('PI 2027.1', [], span('2026-10-05', '2027-01-03'))])
// Lena Berg is a People Manager (a lead: "PI Review: post the review of a Feature"); everyone else a Team Member.
const withLead = () => { const policy = JSON.parse(teamMembersSeePiReview()); policy.members['lena.berg@example.com'] = ['People Manager']; return JSON.stringify(policy) }
async function open({ email = 'rita.gomez@example.com', width = 1300, height = 1000, scale, roles = teamMembersSeePiReview(), tree } = {}) {
  const state = { tree, world: world(), comments: { 201: [{ id: 5, text: '<div>Struggles: test rig late</div><div>Learnings: book the rig early</div><div>Move to next PI: Partly - waiting for vendor</div>', createdBy: ben, createdDate: '2026-11-21T14:30:00Z' }] }, posts: [], log: [], failNextPost: false }
  const { page, context, errors } = await openPage(app, { width, height, scale, init: ([connection, mail, roles]) => {
    localStorage.setItem('demand-planning-access-v1', roles)
    localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify([connection]))
    localStorage.setItem('demand-planning-work-email-v1', mail)
  }, initArg: [profile(email), email, roles] })
  await context.route('https://dev.azure.com/**', fakeAzure(state))
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, () => guide.getByRole('button', { name: 'Close', exact: true }).last().click())
  await page.reload()
  return { page, context, errors, state }
}
async function cell(page, key, label) {
  const headings = await page.locator('.pir-table thead th').evaluateAll((cells) => cells.map((th) => (th.querySelector('.sort-button')?.textContent ?? th.textContent ?? '').replace(/[▴▾]/g, '').trim()))
  const at = headings.indexOf(label)
  assert.ok(at >= 0, `column ${label} in ${headings.join(' | ')}`)
  return text(rowOf(page, key).locator('td').nth(at))
}
// A row by its key (PI Review) or by its ID (My PI Review, whose rows do not open).
const rowOf = (page, key) => /^\d+$/.test(key) ? page.locator('.pir-table tbody tr').filter({ has: page.locator('td:first-child', { hasText: new RegExp(`^${key}$`) }) }) : page.locator(`.pir-table tr[data-row-key="${key}"]`)
const rowKeys = (page) => page.locator('.pir-table tbody tr[data-row-key]').evaluateAll((rows) => rows.map((row) => row.dataset.rowKey))
async function jobDone(page, label, detail) {
  await page.locator('.jobs-button').click()
  const panel = page.getByRole('dialog', { name: 'Background jobs' })
  await panel.locator('li.job', { hasText: label }).filter({ hasText: detail }).first().waitFor()
  await panel.getByRole('button', { name: 'Close', exact: true }).click()
}
const shots = process.env.PI_REVIEW_SHOTS

test('TC-PIR-16: the Feature’s assignee writes its review — prefilled, previewed, posted as a new comment, and read back into the table; another Feature is disabled with the reason', async () => {
  const { page, context, errors, state } = await open(shots ? { width: 1440, height: 900, scale: 2 } : {})
  await navigate(page, 'PI Review')
  await page.locator('.pir-table tr[data-row-key="example/project/205"]').waitFor()
  // PIR-16: the Assigned to filter and the search over the columns shown.
  await page.getByRole('button', { name: /^Assigned to:/ }).click()
  await page.getByRole('listbox', { name: 'Assigned to' }).getByRole('checkbox', { name: 'Ben Okafor', exact: true }).check()
  await page.locator('.pir-table tr[data-row-key="example/project/201"]').waitFor({ state: 'detached' })
  assert.deepEqual(await rowKeys(page), ['example/project/202'])
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await page.getByRole('searchbox', { name: 'Search Features' }).fill('active rita lab')
  await page.locator('.pir-table tr[data-row-key="example/project/201"]').waitFor({ state: 'detached' })
  await page.getByRole('searchbox', { name: 'Search Features' }).fill('Lab rig')
  assert.deepEqual(await rowKeys(page), ['example/project/205'])
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await page.locator('.pir-table tr[data-row-key="example/project/201"]').waitFor()
  // CON-113: a Team Member who is not the assignee sees Write review… disabled with the reason; the note says why.
  const other = page.getByRole('button', { name: 'Write review of Feature 202' })
  assert.equal(await other.isDisabled(), true)
  assert.match(await other.getAttribute('title'), /^Only the Feature’s assignee \(Ben Okafor\) or a lead with “PI Review: post the review of a Feature” can post its review/)
  assert.match(await text(page.locator('.table-panel > .write-blocked')), /You can post the review of the Features assigned to you \(rita\.gomez@example\.com\)/)
  // PIR-13: Write review… in the drawer — prefilled from the latest review (Partly → No, said so), the next PI filled in.
  await page.locator('.pir-table tr[data-row-key="example/project/201"] td').nth(1).click()
  const drawer = page.locator('aside.drawer[role="dialog"]', { has: page.getByRole('heading', { name: 'Feature #201', exact: true }) })
  await drawer.getByRole('heading', { name: 'Discussion (1)' }).waitFor()
  await drawer.getByRole('button', { name: 'Write review…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Review of Feature #201' })
  await dialog.waitFor()
  assert.equal(await dialog.getByRole('textbox', { name: /^Learnings/ }).inputValue(), 'book the rig early')
  assert.equal(await dialog.getByRole('textbox', { name: /^Struggles/ }).inputValue(), 'test rig late')
  assert.equal(await dialog.getByRole('radio', { name: 'No', exact: true }).isChecked(), true)
  assert.match(await text(dialog), /The latest review said Partly: choose Yes or No/)
  assert.equal(await dialog.getByRole('textbox', { name: /^Moves to/ }).inputValue(), 'PI 2026.5')
  assert.equal(await dialog.getByRole('textbox', { name: /^Reason/ }).inputValue(), 'waiting for vendor')
  // Required: the Review meeting advice has no default.
  await dialog.getByRole('button', { name: 'Post to Azure DevOps' }).click()
  assert.match(await text(dialog.locator('.notice.error')), /Choose whether to discuss the Feature during the Review meeting/)
  await dialog.getByRole('textbox', { name: /^Learnings/ }).fill('Book the rig early\n- share the <b>calendar</b> & plan\n1. align with the vendor')
  await dialog.getByRole('radio', { name: 'Yes', exact: true }).check()
  await dialog.getByRole('radio', { name: 'Discuss during Meeting' }).check()
  await dialog.getByRole('textbox', { name: /^Additional Remarks/ }).fill('Thanks to the lab team')
  const form = { learnings: 'Book the rig early\n- share the <b>calendar</b> & plan\n1. align with the vendor', struggles: 'test rig late', move: 'Yes', moveReason: 'waiting for vendor', movePi: 'PI 2026.5', mode: 'Discuss during Meeting', remarks: 'Thanks to the lab team' }
  const expected = buildReviewComment(form)
  assert.equal(await dialog.locator('.pir-review-preview pre').innerText(), expected)
  if (shots) { mkdirSync(shots, { recursive: true }); await page.emulateMedia({ colorScheme: 'light' }); await page.screenshot({ path: `${shots}/pi-review-form-1440-light.png` }) }
  await dialog.getByRole('button', { name: 'Post to Azure DevOps' }).click()
  const confirm = page.getByRole('dialog', { name: 'Post the review to Feature #201?' })
  assert.match(await text(confirm), /Move to next PI Yes \(to PI 2026\.5\), Discuss during Meeting/)
  await confirm.getByRole('button', { name: 'Post review to #201' }).click()
  await dialog.waitFor({ state: 'detached' })
  // PIR-13: the post runs as a Background jobs entry, then the Discussion is read again (the drawer shows it).
  await drawer.getByRole('heading', { name: 'Discussion (2)' }).waitFor()
  assert.equal(state.posts.length, 1)
  assert.deepEqual(state.posts[0], { id: 201, body: { text: commentHtml(expected) } })
  assert.ok(!state.posts[0].body.text.includes('<b>'), 'no user markup sent')
  const latest = drawer.getByRole('region', { name: 'Latest comment' })
  assert.deepEqual(await latest.locator('dd').allInnerTexts(), ['test rig late', 'Book the rig early\nshare the <b>calendar</b> & plan\nalign with the vendor', 'Yes — waiting for vendor · to PI 2026.5', 'Discuss during Meeting', 'Thanks to the lab team'])
  await page.keyboard.press('Escape')
  await drawer.waitFor({ state: 'detached' })
  await jobDone(page, 'Post review · #201', 'Posted to the Discussion of #201 and read back')
  assert.equal(await cell(page, 'example/project/201', 'Move to Next PI'), 'Yes — waiting for vendor · to PI 2026.5')
  assert.equal(await cell(page, 'example/project/201', 'Review mode'), 'Discuss during Meeting')
  assert.equal(await cell(page, 'example/project/201', 'Additional Remarks'), 'Thanks to the lab team')
  // PIR-15: the Review mode filter.
  await page.getByRole('button', { name: /^Review mode:/ }).click()
  await page.getByRole('listbox', { name: 'Review mode' }).getByRole('checkbox', { name: 'Discuss during Meeting', exact: true }).check()
  await page.locator('.pir-table tr[data-row-key="example/project/205"]').waitFor({ state: 'detached' })
  assert.deepEqual(await rowKeys(page), ['example/project/201'])
  await page.keyboard.press('Escape')
  if (shots) { await page.locator('.pir-table .data-table-scroll').evaluate((box) => { box.scrollLeft = box.scrollWidth }); await page.screenshot({ path: `${shots}/pi-review-columns-1440-light.png` }) }
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-PIR-17: My PI Review lists my Features of the current PI with my review status, and Write review… posts from there', async () => {
  const { page, context, errors, state } = await open()
  await navigate(page, 'My PI Review')
  await page.locator('.pir-filters .pill', { hasText: 'Current PI' }).waitFor()
  assert.equal(await page.getByLabel('PI', { exact: true }).inputValue(), 'Project\\PI 2026.4')
  const table = page.locator('.pir-table')
  await rowOf(page, '205').locator('.pill', { hasText: 'Not reviewed' }).waitFor()
  await rowOf(page, '201').locator('.pill', { hasText: 'Not reviewed' }).waitFor()
  assert.deepEqual(await table.locator('tbody tr td:first-child').allInnerTexts(), ['201', '205'], 'mine only: not Ben’s 202')
  // PIR-24: a Team Member sees only their own Features — Person disabled with the reason shown; nothing to reset.
  assert.equal(await page.getByRole('combobox', { name: 'Person' }).isDisabled(), true)
  assert.match(await text(page.locator('.pir-filters .write-blocked')), /^You see your own Features: showing another person’s needs “PI Review: post the review of a Feature”/)
  assert.equal(await page.getByRole('button', { name: 'Reset filters' }).isDisabled(), true)
  await page.getByRole('button', { name: 'Write review of Feature 205' }).click()
  const dialog = page.getByRole('dialog', { name: 'Review of Feature #205' })
  await dialog.getByRole('textbox', { name: /^Learnings/ }).fill('None')
  await dialog.getByRole('textbox', { name: /^Struggles/ }).fill('Parts late')
  await dialog.getByRole('radio', { name: 'Offline Review' }).check()
  await dialog.getByRole('button', { name: 'Post to Azure DevOps' }).click()
  await page.getByRole('dialog', { name: 'Post the review to Feature #205?' }).getByRole('button', { name: 'Post review to #205' }).click()
  await jobDone(page, 'Post review · #205', 'Posted to the Discussion of #205 and read back')
  await rowOf(page, '205').locator('.pill', { hasText: /^Reviewed$/ }).waitFor()
  assert.equal(await cell(page, '205', 'Move to Next PI'), 'No · to PI 2026.5')
  assert.equal(await cell(page, '205', 'Review mode'), 'Offline Review')
  assert.notEqual(await cell(page, '205', 'Date of my review'), '—')
  assert.match(await text(page.locator('.data-table-status')), /^1 of 2 reviewed$/)
  assert.deepEqual(state.posts.map((post) => post.id), [205])
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-PIR-18: closing a Feature asks its review — Move pre-selected No, the advice required — posts it first and closes only once it is posted', async () => {
  const { page, context, errors, state } = await open()
  state.failNextPost = true
  await navigate(page, 'My Tasks [Board]')
  const row = page.locator('.content tr', { hasText: 'Lab rig upgrade' }).first()
  await row.getByRole('button', { name: /^Close/ }).click()
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('list', { name: 'Items to close' }) })
  const review = dialog.getByRole('region', { name: 'PI review' })
  await review.waitFor()
  assert.equal(await review.getByRole('radio', { name: 'No', exact: true }).isChecked(), true, 'Move to next PI pre-selected No')
  assert.equal(await review.getByRole('textbox', { name: /^Moves to/ }).inputValue(), 'PI 2026.5')
  const go = dialog.getByRole('button', { name: /^Post review and close 1 item$/ })
  await go.click()
  assert.match(await text(dialog.locator('.notice.error').first()), /Review meeting/)
  assert.deepEqual(state.log, [], 'nothing posted or closed before the advice is chosen')
  await review.getByRole('radio', { name: 'Offline Review' }).check()
  // The post fails: nothing is closed; Close without the review is offered.
  await go.click()
  await dialog.locator('.notice.error', { hasText: 'The review was not posted' }).waitFor()
  assert.deepEqual(state.log, ['POST 205 failed'])
  assert.equal(await dialog.getByRole('button', { name: 'Close without the review' }).isVisible(), true)
  // Again: posted first, then closed.
  await go.click()
  await dialog.waitFor({ state: 'detached' })
  await page.locator('.content').getByText('Closed #205.').first().waitFor()
  assert.deepEqual(state.log, ['POST 205 failed', 'POST 205', 'PATCH 205 Closed'])
  assert.equal(state.posts[0].body.text, commentHtml(buildReviewComment({ learnings: '', struggles: '', move: 'No', moveReason: '', movePi: 'PI 2026.5', mode: 'Offline Review', remarks: '' })))
  await jobDone(page, 'Post review · #205', 'Posted to the Discussion of #205 before closing it')
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-PIR-26: a lead chooses another person and a PI in My PI Review and sees only that person’s Features; TC-PIR-25: the review form takes the next PI from the Azure DevOps dates', async () => {
  const { page, context, errors, state } = await open({ email: 'lena.berg@example.com', roles: withLead(), tree: datedTree(), ...(shots ? { width: 1440, height: 900, scale: 2 } : {}) })
  await navigate(page, 'My PI Review')
  await page.locator('.pir-filters .pill', { hasText: 'Current PI' }).waitFor()
  assert.equal(await page.getByLabel('PI', { exact: true }).inputValue(), 'Project\\PI 2026.4')
  // PIR-24: the PI list is PI Review's (the iteration tree and the data), the current PI first chosen.
  assert.deepEqual(await page.getByLabel('PI', { exact: true }).locator('option').allInnerTexts(), ['PI 2027.2', 'PI 2027.1', 'PI 2026.4 (current)'])
  await page.locator('.pir-table').getByText('No Features assigned to you in PI 2026.4.').waitFor()
  // A lead may choose another person: only that person's Features (by their work email), their review status.
  const person = page.getByRole('combobox', { name: 'Person' })
  assert.equal(await person.isDisabled(), false)
  assert.equal(await page.locator('.pir-filters .write-blocked').count(), 0)
  await person.click()
  assert.deepEqual(await page.getByRole('listbox').getByRole('option').allInnerTexts(), ['Me (lena.berg@example.com)', 'Ben Okafor', 'Rita Gomez'])
  await page.getByRole('listbox').getByRole('option', { name: 'Ben Okafor', exact: true }).click()
  await page.getByRole('heading', { name: 'Features of Ben Okafor' }).waitFor()
  await rowOf(page, '202').locator('.pill', { hasText: 'Not reviewed' }).waitFor()
  assert.deepEqual(await page.locator('.pir-table tbody tr td:first-child').allInnerTexts(), ['202'], 'Ben’s Feature only')
  assert.equal(await cell(page, '202', 'Their review'), 'Not reviewed')
  if (shots) { mkdirSync(shots, { recursive: true }); await page.emulateMedia({ colorScheme: 'light' }); await page.screenshot({ path: `${shots}/my-pi-review-person-1440-light.png` }) }
  // CON-113: a lead may write the review of another person's Feature; PIR-25: Moves to from the iteration dates.
  await page.getByRole('button', { name: 'Write review of Feature 202' }).click()
  const dialog = page.getByRole('dialog', { name: 'Review of Feature #202' })
  await dialog.waitFor()
  assert.equal(await dialog.getByRole('textbox', { name: /^Moves to/ }).inputValue(), 'PI 2027.1')
  assert.match(await text(dialog.locator('.pir-next-pi')), /^The next PI after PI 2026\.4\. From Azure DevOps iteration dates: PI 2027\.1 starts .+, after PI 2026\.4 ends .+\. Change it if needed\.$/)
  if (shots) await page.screenshot({ path: `${shots}/review-form-next-pi-from-dates-1440-light.png` })
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await dialog.waitFor({ state: 'detached' })
  // Another PI: no Feature of Ben's there. Reset filters: back to me and the current PI.
  await page.getByLabel('PI', { exact: true }).selectOption('Project\\PI 2027.1')
  await page.locator('.pir-table').getByText('No Features assigned to Ben Okafor in PI 2027.1.').waitFor()
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await page.getByRole('heading', { name: 'My Features' }).waitFor()
  assert.equal(await page.getByLabel('PI', { exact: true }).inputValue(), 'Project\\PI 2026.4')
  assert.equal(await page.getByRole('button', { name: 'Reset filters' }).isDisabled(), true)
  assert.deepEqual(state.posts, [], 'nothing posted')
  assert.deepEqual(errors, [])
  await context.close()
})
