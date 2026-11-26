import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { navigate, openPage, startApp, text } from './helpers.mjs'
import { buildReviewComment } from '../src/piReviewPost.ts'
import { defaultPolicy, serializeAccess } from '../src/access.ts'
import { builtInFormSetup, serializePiFormSetup } from '../src/piReviewSetup.ts'

// PI Review, the review form (PIR-13…PIR-18, PIR-24, PIR-25, PIR-32, CON-113; TC-PIR-16 UAT, TC-PIR-17, TC-PIR-18 UAT,
// TC-PIR-25, TC-PIR-26 UAT, TC-PIR-32, TC-PIR-33): against a fake
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
    if (path.endsWith('/_apis/work/teamsettings/iterations')) return json({ value: state.team ?? [dated('Sprint 2', 'Project\\PI 2026.4\\Sprint 2', '2000-01-01', '2099-12-31')] })
    if (path.endsWith('/_apis/wit/classificationnodes/iterations')) return json(state.tree ?? node('', [node('PI 2026.4', [node('PI 2026.4\\Sprint 2', [], { startDate: '2000-01-01T00:00:00Z', finishDate: '2099-12-31T00:00:00Z' })]), node('PI 2026.5')]))
    const patch = /\/_apis\/wit\/workitems\/(\d+)$/.exec(path)
    if (patch && request.method() === 'PATCH') {
      const item = state.world.find((entry) => entry.id === Number(patch[1]))
      for (const op of JSON.parse(request.postData() ?? '[]')) if (op.path === '/fields/System.State') item.fields['System.State'] = op.value
      state.log.push(`PATCH ${item.id} ${item.fields['System.State']}`)
      return json(item)
    }
    // PIR-34: Edit review… — the update of one comment (PATCH …/comments/{id}), recorded; failNextEdit refuses the next one.
    const edit = /\/_apis\/wit\/workItems\/(\d+)\/comments\/(\d+)$/.exec(path)
    if (edit && request.method() === 'PATCH') {
      const id = Number(edit[1]), commentId = Number(edit[2]), found = (state.comments[id] ?? []).find((entry) => entry.id === commentId)
      if (state.failNextEdit) { state.failNextEdit = false; state.log.push(`PATCH comment ${commentId} failed`); return json({ message: 'The comment could not be updated' }, 500) }
      if (!found) return json({ message: 'Not found' }, 404)
      const body = JSON.parse(request.postData() ?? '{}')
      state.edits.push({ id, commentId, body })
      state.log.push(`PATCH comment ${commentId}`)
      Object.assign(found, { text: body.text, modifiedDate: new Date().toISOString() })
      return json(found)
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
      // PIR-35: each Discussion read (a GET of its comments), by Feature, to count the requests.
      state.reads.push(id)
      return json({ comments: list, count: list.length })
    }
    return json({ value: [] })
  }
}

// Everyone is a Team Member; Team Members are also given Team insights (PI Review) here — an Admin's choice in Role
// rights — so the assignee rule is shown on PI Review itself.
const teamMembersSeePiReview = () => { const policy = defaultPolicy(); policy.defaultRole = 'Team Member'; policy.roles['Team Member'].areas.push('insights'); return serializeAccess(policy) }
// PIR-25: an iteration tree with PI dates around today, so the scenario does not depend on the clock — PI 2026.4 (60 days
// ago to 30 days ahead: today's PI; current by its Sprint), PI 2027.2 and PI 2027.1 listed out of order; PI 2027.1
// starts first after today's PI.
const span = (start, finish) => ({ startDate: `${start}T00:00:00Z`, finishDate: `${finish}T00:00:00Z` })
const datedTree = () => node('', [node('PI 2027.2', [], span(dayFromToday(61), dayFromToday(150))), node('PI 2026.4', [node('PI 2026.4\\Sprint 2', [], span('2000-01-01', '2099-12-31'))], span(dayFromToday(-60), dayFromToday(30))), node('PI 2027.1', [], span(dayFromToday(31), dayFromToday(60)))])
// Lena Berg is a People Manager (a lead: "PI Review: post the review of a Feature"); everyone else a Team Member.
const withLead = () => { const policy = JSON.parse(teamMembersSeePiReview()); policy.members['lena.berg@example.com'] = ['People Manager']; return JSON.stringify(policy) }
// PIR-33: start — "PI Review starts from", as the last form setup read from Git kept in this browser (no Git here).
async function open({ email = 'rita.gomez@example.com', width = 1300, height = 1000, scale, roles = teamMembersSeePiReview(), tree, team, world: items = world(), comments, start } = {}) {
  const state = { tree, team, world: items, comments: comments ?? { 201: [{ id: 5, text: '<div>Struggles: test rig late</div><div>Learnings: book the rig early</div><div>Move to next PI: Partly - waiting for vendor</div>', createdBy: ben, createdDate: '2026-11-21T14:30:00Z' }] }, posts: [], edits: [], reads: [], log: [], failNextPost: false, failNextEdit: false }
  const { page, context, errors } = await openPage(app, { width, height, scale, init: ([connection, mail, roles, setup]) => {
    if (setup) localStorage.setItem('demand-planning-pi-review-form-v1', setup)
    localStorage.setItem('demand-planning-access-v1', roles)
    localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify([connection]))
    localStorage.setItem('demand-planning-work-email-v1', mail)
  }, initArg: [profile(email), email, roles, start ? serializePiFormSetup({ ...builtInFormSetup(), reviewStart: start }) : ''] })
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
// PIR-32: the text of an ⓘ of the form (the button by its accessible name), opened by pointing at it and closed by
// pointing away — Escape would close the pop-up itself.
async function tipOf(page, button) {
  await page.mouse.move(0, 0)
  await button.hover()
  const tip = page.getByRole('tooltip')
  await tip.waitFor()
  const value = await text(tip)
  await page.mouse.move(0, 0)
  await tip.waitFor({ state: 'detached' })
  return value
}

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
  await drawer.getByRole('button', { name: 'Write review of Feature 201' }).click()
  const dialog = page.getByRole('dialog', { name: 'Review of Feature #201' })
  await dialog.waitFor()
  assert.equal(await dialog.getByRole('textbox', { name: /^Learnings/ }).inputValue(), 'book the rig early')
  assert.equal(await dialog.getByRole('textbox', { name: /^Struggles/ }).inputValue(), 'test rig late')
  assert.equal(await dialog.getByRole('radio', { name: 'No', exact: true }).isChecked(), true)
  assert.match(await text(dialog), /The latest review said Partly: choose Yes or No/)
  // PIR-13: with No, Moves to and the Reason are hidden (the reason read from the latest review is kept); Yes shows them.
  assert.equal(await dialog.getByRole('textbox', { name: /^Moves to/ }).count(), 0)
  assert.equal(await dialog.getByRole('textbox', { name: /^Reason/ }).count(), 0)
  // PIR-32: the help is behind "ⓘ How to fill in" (what posting does, the default, the paragraphs' help) and the
  // Preview's ⓘ — not on the form.
  const help = await tipOf(page, dialog.getByRole('button', { name: 'ⓘ How to fill in' }))
  assert.match(help, /^Posting adds a new comment to the Feature’s Discussion; PI Review reads the newest, so a correction is posted as a new review\./)
  assert.match(help, /Move to next PI: Move to next PI is pre-selected No\. With Yes, Moves to \(the next PI\) and the Reason/)
  assert.match(help, /Learnings: One point per line; start a line with - or 1\. for a list\./)
  assert.match(help, /Additional Remarks: Anything else for the review\./)
  assert.match(await tipOf(page, dialog.getByRole('button', { name: 'About the preview' })), /^The comment posted, as you, to the Feature’s Discussion in Azure DevOps/)
  assert.doesNotMatch(await text(dialog), /One point per line|Posting adds a new comment|The comment posted, as you|pre-selected No\./)
  await dialog.getByRole('radio', { name: 'Yes', exact: true }).check()
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
  // PIR-14, PIR-28: the Preview is the bulleted list as Azure DevOps shows it, the reviewed PI in the headings.
  const expected = buildReviewComment({ ...form, reviewedPi: 'PI 2026.4' })
  assert.deepEqual(await dialog.locator('.pir-review-comment > ul > li').evaluateAll((items) => items.map((item) => [item.firstChild.textContent, item.querySelector('ol, ul')?.tagName ?? '', [...item.querySelectorAll('li')].map((entry) => entry.textContent)])), [
    ['Learnings of PI 2026.4:', 'OL', ['Book the rig early', 'share the <b>calendar</b> & plan', 'align with the vendor']], ['Struggles of PI 2026.4:', 'UL', ['test rig late']],
    ['Whether the feature needs to be shifted to PI 2026.5 : Yes', 'UL', ['waiting for vendor']], ['Advise to discuss the Feature during the Review meeting : Discuss during Meeting', '', []], ['Additional Remarks:', 'UL', ['Thanks to the lab team']],
  ])
  if (shots) { mkdirSync(shots, { recursive: true }); await page.emulateMedia({ colorScheme: 'light' }); await page.screenshot({ path: `${shots}/pi-review-form-1440-light.png` }) }
  await dialog.getByRole('button', { name: 'Post to Azure DevOps' }).click()
  const confirm = page.getByRole('dialog', { name: 'Post the review to Feature #201?' })
  assert.match(await text(confirm), /Move to next PI Yes \(to PI 2026\.5\), Discuss during Meeting/)
  await confirm.getByRole('button', { name: 'Post review to #201' }).click()
  await dialog.waitFor({ state: 'detached' })
  // PIR-13: the post runs as a Background jobs entry, then the Discussion is read again (the drawer shows it).
  await drawer.getByRole('heading', { name: 'Discussion (2)' }).waitFor()
  assert.equal(state.posts.length, 1)
  assert.deepEqual(state.posts[0], { id: 201, body: { text: expected } })
  assert.ok(!state.posts[0].body.text.includes('<b>') && state.posts[0].body.text.includes('&lt;b&gt;calendar&lt;/b&gt;'), 'no user markup sent: escaped')
  const latest = drawer.getByRole('region', { name: 'Latest comment' })
  assert.deepEqual(await latest.locator('dd').allInnerTexts(), ['test rig late', 'Book the rig early\nshare the <b>calendar</b> & plan\nalign with the vendor', 'Yes — waiting for vendor · to PI 2026.5', 'Discuss during Meeting', 'Thanks to the lab team'])
  await page.keyboard.press('Escape')
  await drawer.waitFor({ state: 'detached' })
  await jobDone(page, 'Post review · #201', 'Posted to the Discussion of #201 and read back')
  assert.equal(await cell(page, 'example/project/201', 'Move to Next PI'), 'Yes — waiting for vendor · to PI 2026.5')
  assert.equal(await cell(page, 'example/project/201', 'Review mode'), 'Discuss during Meeting')
  assert.equal(await cell(page, 'example/project/201', 'Additional Remarks'), 'Thanks to the lab team')
  assert.equal(await cell(page, 'example/project/201', 'Reviewed PI'), 'PI 2026.4', 'PIR-28: from the headings')
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
  // PIR-13, PIR-25: with No, Moves to is hidden, but the Move heading names the next PI by today's PI: until the
  // iterations are read the PI number (PI 2027.1 after PI 2026.4), then the tree (today's PI 2026.4, its undated PI 2026.5).
  await review.locator('.pir-review-comment', { hasText: 'shifted to PI 2026.5 : No' }).waitFor()
  assert.equal(await review.getByRole('textbox', { name: /^Moves to/ }).count(), 0)
  assert.match(await tipOf(page, review.getByRole('button', { name: 'ⓘ How to fill in' })), /^Posted as a new comment in the Feature’s Discussion before the items close\./)
  assert.equal(await review.getByRole('checkbox', { name: 'No learnings or struggles' }).isChecked(), false, 'PIR-27: in the Close pop-up too, not ticked')
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
  assert.equal(state.posts[0].body.text, buildReviewComment({ learnings: '', struggles: '', move: 'No', moveReason: '', movePi: 'PI 2026.5', mode: 'Offline Review', remarks: '', reviewedPi: 'PI 2026.4' }))
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
  // PIR-13: Move pre-selected No — no Moves to and no Reason; the heading still names the next PI (by today's PI).
  assert.equal(await dialog.getByRole('textbox', { name: /^Moves to/ }).count(), 0)
  await dialog.locator('.pir-review-comment', { hasText: 'shifted to PI 2027.1 : No' }).waitFor()
  if (shots) await page.screenshot({ path: `${shots}/review-form-move-no-1440-light.png` })
  await dialog.getByRole('radio', { name: 'Yes', exact: true }).check()
  assert.equal(await dialog.getByRole('textbox', { name: /^Moves to/ }).inputValue(), 'PI 2027.1')
  assert.match(await text(dialog.locator('.pir-next-pi')), /^From the Azure DevOps dates\./)
  const info = dialog.getByRole('button', { name: 'Where the next PI comes from' })
  assert.match(await tipOf(page, info), /^The PI after today’s PI \(the Feature’s PI is PI 2026\.4\)\. From Azure DevOps iteration dates: today \(.+\) is in PI 2026\.4 \(.+ – .+\); the next PI is PI 2027\.1, starting .+\. Change it if needed\.$/)
  if (shots) { await page.screenshot({ path: `${shots}/review-form-move-yes-1440-light.png` }); await info.focus(); await page.getByRole('tooltip').waitFor(); await page.screenshot({ path: `${shots}/review-form-next-pi-from-dates-1440-light.png` }); await info.blur(); await page.getByRole('tooltip').waitFor({ state: 'detached' }) }
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

// PIR-25 (TC-PIR-32; product owner, 25 Nov 2026: "The next PI is 27.1, not 26.5"): the iteration tree holds PI 2026.4
// only (current by its Sprint) and a PI without a number; no later PI is known, so the PI number rolls the year over.
const lastPiTree = () => node('', [node('PI 2026.4', [node('PI 2026.4\\Sprint 2', [], span('2000-01-01', '2099-12-31'))]), node('PI Planning')])
test('TC-PIR-32: the last PI of the year — no later PI in Azure DevOps, the review form moves to PI 2027.1 and says why', async () => {
  const { page, context, errors, state } = await open({ tree: lastPiTree(), ...(shots ? { width: 1440, height: 900, scale: 2 } : {}) })
  await navigate(page, 'My PI Review')
  await page.locator('.pir-filters .pill', { hasText: 'Current PI' }).waitFor()
  await page.getByRole('button', { name: 'Write review of Feature 205' }).click()
  const dialog = page.getByRole('dialog', { name: 'Review of Feature #205' })
  await dialog.waitFor()
  await dialog.getByRole('radio', { name: 'Yes', exact: true }).check()
  assert.equal(await dialog.getByRole('textbox', { name: /^Moves to/ }).inputValue(), 'PI 2027.1')
  assert.match(await text(dialog.locator('.pir-next-pi.pir-next-pi-warn')), /^No later PI has dates in Azure DevOps — by the PI number; check it\./, 'a warning')
  assert.match(await tipOf(page, dialog.getByRole('button', { name: 'Where the next PI comes from' })), /^The PI after today’s PI \(the Feature’s PI is PI 2026\.4\)\. From Azure DevOps iteration dates: today \(.+\) is in PI 2026\.4 \(.+ – .+\), but no later PI has dates: worked out from the PI number — PI 2026\.4 is the last PI of its year \(4 a year\), so the next is PI 2027\.1\. Left out \(no PI number in the name\): PI Planning\. Change it if needed\.$/)
  if (shots) { mkdirSync(shots, { recursive: true }); await page.emulateMedia({ colorScheme: 'light' }); await page.screenshot({ path: `${shots}/review-form-next-pi-rollover-1440-light.png` }) }
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await dialog.waitFor({ state: 'detached' })
  assert.deepEqual(state.posts, [], 'nothing posted')
  assert.deepEqual(errors, [])
  await context.close()
})

// PIR-25 (TC-PIR-32): no PI is dated over today — PI 2026.3 ended 10 days ago; PI 2026.4 and PI 2026.5 have no dates:
// the warning under Moves to, and the ⓘ says the dates were missing and what was used; Moves to stays editable.
const gapTree = () => node('', [node('PI 2026.3', [], span(dayFromToday(-100), dayFromToday(-10))), node('PI 2026.4'), node('PI 2026.5')])
test('TC-PIR-32: no PI dated over today — Moves to from the number after the latest PI that ended, with a warning', async () => {
  const { page, context, errors, state } = await open({ tree: gapTree(), team: [], ...(shots ? { width: 1440, height: 900, scale: 2 } : {}) })
  await navigate(page, 'My PI Review')
  await page.getByLabel('PI', { exact: true }).selectOption('Project\\PI 2026.4')
  await page.getByRole('button', { name: 'Write review of Feature 205' }).click()
  const dialog = page.getByRole('dialog', { name: 'Review of Feature #205' })
  await dialog.getByRole('radio', { name: 'Yes', exact: true }).check()
  const moves = dialog.getByRole('textbox', { name: /^Moves to/ })
  await dialog.locator('.pir-next-pi-warn', { hasText: 'PI dates missing in Azure DevOps — check this PI.' }).waitFor()
  assert.equal(await moves.inputValue(), 'PI 2026.4')
  assert.match(await tipOf(page, dialog.getByRole('button', { name: 'Where the next PI comes from' })), /^The PI after today’s PI \(the Feature’s PI is PI 2026\.4\)\. The PI dates are missing: no PI in Azure DevOps has dates covering today \(.+\)\. Used instead: PI 2026\.3, the latest PI that ended before today \(.+\) — PI 2026\.4 is the next PI by number in the Azure DevOps iteration tree \(it has no dates\)\. Change it if needed\.$/)
  if (shots) { mkdirSync(shots, { recursive: true }); await page.emulateMedia({ colorScheme: 'light' }); await page.screenshot({ path: `${shots}/review-form-next-pi-dates-missing-1440-light.png` }) }
  await moves.fill('PI 2026.5')
  await dialog.locator('.pir-review-comment', { hasText: 'shifted to PI 2026.5 : Yes' }).waitFor()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await dialog.waitFor({ state: 'detached' })
  assert.deepEqual(state.posts, [], 'nothing posted')
  assert.deepEqual(errors, [])
  await context.close()
})

// PIR-26, PIR-28 (TC-PIR-27): the iteration tree dated around today, so the scenario does not depend on the clock —
// PI 2026.3 ended 101 days ago; PI 2026.4 (dated by its Sprints only) runs from 100 days ago to 30 days ahead; PI
// 2026.5 follows. Rita's Features in PI 2026.4: 301 reviewed 10 days ago; 302 reviewed 150 days ago (in PI 2026.3); 303
// Closed 105 days ago and reviewed the day after (in PI 2026.3, after its Closed Date).
const dayFromToday = (offset) => { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset)).toISOString().slice(0, 10) }
const relativeTree = () => node('', [
  node('PI 2026.3', [], span(dayFromToday(-200), dayFromToday(-101))),
  node('PI 2026.4', [node('PI 2026.4\\Sprint 1', [], span(dayFromToday(-100), dayFromToday(-50))), node('PI 2026.4\\Sprint 2', [], span(dayFromToday(-49), dayFromToday(30)))]),
  node('PI 2026.5', [], span(dayFromToday(31), dayFromToday(120))),
])
const ritaReview = (id, offset, learnings) => ({ id, text: buildReviewComment({ learnings, struggles: 'None', move: 'No', moveReason: '', movePi: 'PI 2026.5', mode: 'Offline Review', remarks: '' }), createdBy: rita, createdDate: `${dayFromToday(offset)}T10:00:00Z` })
const periodWorld = () => [
  raw(100, 'Epic', 'DP releases', 'Project'),
  raw(301, 'Feature', 'Sample rig calibration', 'Project\\PI 2026.4', 100),
  raw(302, 'Feature', 'Supplier audit pack', 'Project\\PI 2026.4', 100),
  { ...raw(303, 'Feature', 'Lab bench move', 'Project\\PI 2026.4', 100, rita, 'Closed'), fields: { ...raw(303, 'Feature', 'Lab bench move', 'Project\\PI 2026.4', 100, rita, 'Closed').fields, 'Microsoft.VSTS.Common.ClosedDate': `${dayFromToday(-105)}T16:00:00Z` } },
]
const status = async (page, id) => text(rowOf(page, id).locator('td').nth(3))

test('TC-PIR-27: My PI Review counts a review for the chosen PI — in its dates or at close — and shows a review for another PI as Not reviewed with its date and PI; choosing another PI recomputes it', async () => {
  const { page, context, errors, state } = await open({ tree: relativeTree(), world: periodWorld(), comments: { 301: [ritaReview(11, -10, 'Calibrate first')], 302: [ritaReview(12, -150, 'Audit early')], 303: [ritaReview(13, -104, 'Move benches at night')] }, start: dayFromToday(-250), ...(shots ? { width: 1440, height: 900, scale: 2 } : {}) })
  await navigate(page, 'My PI Review')
  await page.locator('.pir-filters .pill', { hasText: 'Current PI' }).waitFor()
  assert.equal(await page.getByLabel('PI', { exact: true }).inputValue(), 'Project\\PI 2026.4')
  await rowOf(page, '303').locator('.pill', { hasText: /^Reviewed$/ }).waitFor()
  await rowOf(page, '302').locator('.pill', { hasText: 'Not reviewed' }).waitFor()
  assert.equal(await status(page, '301'), 'Reviewed', 'dated within PI 2026.4 (its Sprints’ dates)')
  assert.match(await status(page, '302'), /^Not reviewed Last review .+ \(PI 2026\.3\)$/, 'an earlier PI’s review, named')
  assert.match(await status(page, '303'), /^Reviewed At close \(.+\)$/, 'Closed, reviewed on or after its Closed Date')
  assert.match(await text(page.locator('.data-table-status')), /^2 of 3 reviewed$/)
  assert.equal(await page.locator('.content .notice').filter({ hasText: 'every review comment counts' }).count(), 0, 'the PI has dates: no fallback note')
  if (shots) { mkdirSync(shots, { recursive: true }); await page.emulateMedia({ colorScheme: 'light' }); await page.screenshot({ path: `${shots}/my-pi-review-reviewed-in-pi-2026-4-1440-light.png` }) }
  // Write review… on 302: still prefilled from the latest review, labelled as written for PI 2026.3.
  await page.getByRole('button', { name: 'Write review of Feature 302' }).click()
  const dialog = page.getByRole('dialog', { name: 'Review of Feature #302' })
  assert.match(await text(dialog.locator('.pir-review-note')), /^Prefilled from the latest review comment \(Rita Gomez, .+\), written for PI 2026\.3: check it before posting\./)
  assert.equal(await dialog.getByRole('textbox', { name: /^Learnings/ }).inputValue(), 'Audit early')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await dialog.waitFor({ state: 'detached' })
  // The Feature 301 is carried over to PI 2026.5 in Azure DevOps; fetched again, PI 2026.5 chosen: the same review now
  // belongs to another PI — Not reviewed, "(PI 2026.4)".
  state.world.find((item) => item.id === 301).fields['System.IterationPath'] = 'Project\\PI 2026.5'
  await page.locator('.fetch-time-writing').click()
  await page.getByLabel('PI', { exact: true }).selectOption('Project\\PI 2026.5')
  await rowOf(page, '301').locator('.pill', { hasText: 'Not reviewed' }).waitFor()
  assert.match(await status(page, '301'), /^Not reviewed Last review .+ \(PI 2026\.4\)$/)
  assert.match(await text(page.locator('.data-table-status')), /^0 of 1 reviewed$/)
  if (shots) await page.screenshot({ path: `${shots}/my-pi-review-same-feature-not-reviewed-in-pi-2026-5-1440-light.png` })
  assert.deepEqual(state.posts, [], 'nothing posted')
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-PIR-27: the chosen PI has no dates — every review counts, and the page says so', async () => {
  const { page, context, errors } = await open({ tree: node('', [node('PI 2026.4', [node('PI 2026.4\\Sprint 2')])]), team: [], world: periodWorld(), comments: { 302: [ritaReview(12, -150, 'Audit early')] }, start: dayFromToday(-250) })
  await navigate(page, 'My PI Review')
  await page.getByLabel('PI', { exact: true }).selectOption('Project\\PI 2026.4')
  await rowOf(page, '302').locator('.pill', { hasText: /^Reviewed$/ }).waitFor()
  assert.match(await text(page.locator('.content .notice').filter({ hasText: 'every review comment counts' })), /^PI 2026\.4 has no dates in Azure DevOps \(neither its own nor its Sprints’\): every review comment counts as Reviewed, whatever its date\.$/)
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-PIR-28: “No learnings or struggles” — not ticked; ticked it writes None under both headings and disables both; unticked it restores what was typed; posted and read back as None', async () => {
  const { page, context, errors, state } = await open(shots ? { width: 1440, height: 900, scale: 2 } : {})
  await navigate(page, 'My PI Review')
  await page.getByRole('button', { name: 'Write review of Feature 205' }).click()
  const dialog = page.getByRole('dialog', { name: 'Review of Feature #205' })
  const none = dialog.getByRole('checkbox', { name: 'No learnings or struggles' })
  const learnings = dialog.getByRole('textbox', { name: /^Learnings/ }), struggles = dialog.getByRole('textbox', { name: /^Struggles/ })
  assert.equal(await none.isChecked(), false, 'not pre-ticked (UI-STANDARDS §12)')
  await learnings.fill('A first thought')
  await none.check()
  assert.deepEqual([await learnings.inputValue(), await struggles.inputValue(), await learnings.isDisabled(), await struggles.isDisabled()], ['None', 'None', true, true])
  await dialog.getByRole('radio', { name: 'Offline Review' }).check()
  // The Preview shows the bulleted list as it will look in Azure DevOps: the reviewed PI in the headings, "None" nested.
  const preview = dialog.locator('.pir-review-comment')
  assert.deepEqual(await preview.locator(':scope > ul > li').evaluateAll((items) => items.map((item) => [item.firstChild.textContent, [...item.querySelectorAll('li')].map((entry) => entry.textContent)])), [
    ['Learnings of PI 2026.4:', ['None']], ['Struggles of PI 2026.4:', ['None']], ['Whether the feature needs to be shifted to PI 2026.5 : No', []], ['Advise to discuss the Feature during the Review meeting : Offline Review', []],
  ])
  if (shots) { mkdirSync(shots, { recursive: true }); await page.emulateMedia({ colorScheme: 'light' }); await page.screenshot({ path: `${shots}/review-form-no-learnings-or-struggles-1440-light.png` }) }
  await none.uncheck()
  assert.deepEqual([await learnings.inputValue(), await struggles.inputValue(), await learnings.isDisabled()], ['A first thought', '', false], 'what was typed comes back')
  await struggles.fill('Parts late\n- the supplier\n- the customs')
  // PIR-13: the Reason is asked with Yes; back to No it is hidden, kept, and not posted.
  await dialog.getByRole('radio', { name: 'Yes', exact: true }).check()
  await dialog.getByRole('textbox', { name: /^Reason/ }).fill('1. two stories left\n2. docs pending')
  await dialog.locator('.pir-review-comment ol', { hasText: 'docs pending' }).waitFor()
  if (shots) await dialog.locator('.pir-review-preview').screenshot({ path: `${shots}/review-form-preview-bullets-1440-light.png` })
  await dialog.getByRole('radio', { name: 'No', exact: true }).check()
  assert.equal(await dialog.getByRole('textbox', { name: /^Reason/ }).count(), 0)
  assert.equal(await dialog.locator('.pir-review-comment ol').count(), 0, 'the reason is not in the Preview with No')
  await dialog.getByRole('radio', { name: 'Yes', exact: true }).check()
  assert.equal(await dialog.getByRole('textbox', { name: /^Reason/ }).inputValue(), '1. two stories left\n2. docs pending', 'kept while hidden')
  await dialog.getByRole('radio', { name: 'No', exact: true }).check()
  await none.check()
  await dialog.getByRole('button', { name: 'Post to Azure DevOps' }).click()
  await page.getByRole('dialog', { name: 'Post the review to Feature #205?' }).getByRole('button', { name: 'Post review to #205' }).click()
  await jobDone(page, 'Post review · #205', 'Posted to the Discussion of #205 and read back')
  const expected = buildReviewComment({ learnings: 'None', struggles: 'None', move: 'No', moveReason: '1. two stories left\n2. docs pending', movePi: 'PI 2026.5', mode: 'Offline Review', remarks: '', reviewedPi: 'PI 2026.4' })
  assert.deepEqual(state.posts, [{ id: 205, body: { text: expected } }], 'the list HTML as built')
  assert.match(expected, /^<ul><li>Learnings of PI 2026\.4:<ul><li>None<\/li><\/ul><\/li><li>Struggles of PI 2026\.4:<ul><li>None<\/li><\/ul><\/li><li>Whether the feature needs to be shifted to PI 2026\.5 : No<\/li>/)
  await rowOf(page, '205').locator('.pill', { hasText: /^Reviewed$/ }).waitFor()
  // PI Review shows None in both columns, and the reviewed PI from the headings.
  await navigate(page, 'PI Review')
  await page.locator('.pir-table tr[data-row-key="example/project/205"]').waitFor()
  assert.deepEqual([await cell(page, 'example/project/205', 'Learnings'), await cell(page, 'example/project/205', 'Struggles'), await cell(page, 'example/project/205', 'Reviewed PI')], ['None', 'None', 'PI 2026.4'])
  assert.deepEqual(errors, [])
  await context.close()
})

// PIR-34: Rita's own review of Feature 205, written in PI 2026.4 (after PI Review starts).
const ritaOwnReview = () => ({ id: 41, text: buildReviewComment({ learnings: 'Calibrate first', struggles: 'Parts late', move: 'No', moveReason: '', movePi: 'PI 2026.5', mode: 'Offline Review', remarks: '', reviewedPi: 'PI 2026.4' }), createdBy: rita, createdDate: '2026-11-20T10:00:00Z' })
test('TC-PIR-35: Edit review… changes my own review in place — prefilled, saved as an update of the same comment, read back into the table; a failed edit offers Post as a new review instead; no Edit without my review', async () => {
  const { page, context, errors, state } = await open({ comments: { 205: [ritaOwnReview()] }, ...(shots ? { width: 1440, height: 900, scale: 2 } : {}) })
  await navigate(page, 'My PI Review')
  await rowOf(page, '205').locator('.pill', { hasText: /^Reviewed$/ }).waitFor()
  // My reviewed Feature has Edit review… in place of Write review…; my Feature without a review has none.
  const edit = page.getByRole('button', { name: 'Edit review of Feature 205' })
  assert.equal(await edit.isDisabled(), false)
  assert.equal(await page.getByRole('button', { name: 'Edit review of Feature 201' }).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Write review of Feature 205' }).count(), 0, 'one action per row')
  assert.equal(await page.getByRole('button', { name: 'Write review of Feature 201' }).count(), 1)
  await edit.click()
  const dialog = page.getByRole('dialog', { name: 'Edit review of Feature #205' })
  await dialog.waitFor()
  assert.match(await text(dialog.locator('.pir-review-note')), /^Editing your review comment of .+\.$/)
  assert.equal(await dialog.getByRole('textbox', { name: /^Learnings/ }).inputValue(), 'Calibrate first')
  assert.equal(await dialog.getByRole('radio', { name: 'Offline Review' }).isChecked(), true)
  await dialog.getByRole('textbox', { name: /^Learnings/ }).fill('Calibrate first\n- book the rig early')
  await dialog.getByRole('radio', { name: 'Discuss during Meeting' }).check()
  if (shots) { mkdirSync(shots, { recursive: true }); await page.emulateMedia({ colorScheme: 'light' }); await page.screenshot({ path: `${shots}/my-pi-review-edit-review-form-1440-light.png` }) }
  await dialog.getByRole('button', { name: 'Save to Azure DevOps' }).click()
  await page.getByRole('dialog', { name: 'Save the edited review of Feature #205?' }).getByRole('button', { name: 'Save review to #205' }).click()
  await jobDone(page, 'Edit review · #205', 'Edited the review of #205 and read back')
  await until(async () => await cell(page, '205', 'Review mode') === 'Discuss during Meeting', 'the edited review in the table')
  assert.deepEqual(state.edits.map((entry) => [entry.id, entry.commentId]), [[205, 41]], 'the same comment updated')
  assert.match(state.edits[0].body.text, /<li>book the rig early<\/li>/)
  assert.deepEqual(state.posts, [], 'no new comment')
  assert.match(await text(rowOf(page, '205').locator('td').nth(3)), /^Reviewed$/, 'its date stays: it still counts for PI 2026.4')
  if (shots) await page.screenshot({ path: `${shots}/my-pi-review-edit-review-button-1440-light.png` })
  // A failed edit: the form opens again with what was typed, the error and Post as a new review instead.
  state.failNextEdit = true
  await edit.click()
  await dialog.getByRole('textbox', { name: /^Struggles/ }).fill('Parts late\n- customs')
  await dialog.getByRole('button', { name: 'Save to Azure DevOps' }).click()
  await page.getByRole('dialog', { name: 'Save the edited review of Feature #205?' }).getByRole('button', { name: 'Save review to #205' }).click()
  await dialog.locator('.notice', { hasText: 'The review was not edited' }).waitFor()
  assert.equal(await dialog.getByRole('textbox', { name: /^Struggles/ }).inputValue(), 'Parts late\n- customs')
  await dialog.getByRole('button', { name: 'Post as a new review instead' }).click()
  await page.getByRole('dialog', { name: 'Post the review to Feature #205?' }).getByRole('button', { name: 'Post review to #205' }).click()
  await jobDone(page, 'Post review · #205', 'Posted to the Discussion of #205 and read back')
  assert.deepEqual(state.posts.map((post) => post.id), [205])
  assert.equal(state.edits.length, 1)
  assert.deepEqual(errors, [])
  await context.close()
})
const until = async (check, what) => { for (const end = Date.now() + 60000; Date.now() < end;) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 50)) } assert.fail(`timed out waiting for ${what}`) }

// PIR-34 on PI Review: Rita edits her own review from the row and the drawer; Lena (a lead) sees Write review… on
// Rita's reviewed Feature and Edit review… only on the Feature she reviewed herself.
const lena = { displayName: 'Lena Berg', uniqueName: 'lena.berg@example.com' }
const reviews = () => ({ 205: [ritaOwnReview()], 202: [{ ...ritaOwnReview(), id: 43, createdBy: lena }] })
test('TC-PIR-36: PI Review offers Edit review… on my own review — in the row and the drawer, saved as an update of the same comment; a lead gets no Edit on another person’s review', async () => {
  const { page, context, errors, state } = await open({ comments: reviews(), ...(shots ? { width: 1440, height: 900, scale: 2 } : {}) })
  await navigate(page, 'PI Review')
  await rowOf(page, 'example/project/205').waitFor()
  await page.getByRole('button', { name: '↻ Read all Discussions' }).click()
  await page.getByRole('button', { name: 'Edit review of Feature 205' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Write review of Feature 205' }).count(), 0, 'one action per row')
  assert.equal(await page.getByRole('button', { name: 'Edit review of Feature 202' }).count(), 0, 'Lena’s review is not Rita’s')
  assert.equal(await page.getByRole('button', { name: 'Write review of Feature 202' }).isDisabled(), true)
  if (shots) { mkdirSync(shots, { recursive: true }); await page.emulateMedia({ colorScheme: 'light' }); await page.locator('.pir-table .data-table-scroll').evaluate((box) => { box.scrollLeft = box.scrollWidth }); await page.screenshot({ path: `${shots}/pi-review-edit-review-row-1440-light.png` }); await page.locator('.pir-table .data-table-scroll').evaluate((box) => { box.scrollLeft = 0 }) }
  // The drawer's footer offers the same Edit review….
  await rowOf(page, 'example/project/205').locator('td').nth(1).click()
  const drawer = page.locator('aside.drawer[role="dialog"]', { has: page.getByRole('heading', { name: 'Feature #205', exact: true }) })
  await drawer.getByRole('button', { name: 'Edit review of Feature 205' }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit review of Feature #205' })
  assert.equal(await dialog.getByRole('textbox', { name: /^Learnings/ }).inputValue(), 'Calibrate first')
  await dialog.getByRole('radio', { name: 'Discuss during Meeting' }).check()
  await dialog.getByRole('button', { name: 'Save to Azure DevOps' }).click()
  await page.getByRole('dialog', { name: 'Save the edited review of Feature #205?' }).getByRole('button', { name: 'Save review to #205' }).click()
  await dialog.waitFor({ state: 'detached' })
  await page.keyboard.press('Escape')
  await drawer.waitFor({ state: 'detached' })
  await jobDone(page, 'Edit review · #205', 'Edited the review of #205 and read back')
  await until(async () => await cell(page, 'example/project/205', 'Review mode') === 'Discuss during Meeting', 'the edited review in the table')
  assert.deepEqual(state.edits.map((entry) => [entry.id, entry.commentId]), [[205, 41]])
  assert.deepEqual(state.posts, [])
  assert.deepEqual(errors, [])
  await context.close()
  // Lena, a lead: Write review… (a new comment) on Rita's reviewed Feature; Edit review… on her own review of 202.
  const lead = await open({ email: 'lena.berg@example.com', roles: withLead(), comments: reviews() })
  await navigate(lead.page, 'PI Review')
  await rowOf(lead.page, 'example/project/205').waitFor()
  await lead.page.getByRole('button', { name: '↻ Read all Discussions' }).click()
  await lead.page.getByRole('button', { name: 'Edit review of Feature 202' }).waitFor()
  assert.equal(await lead.page.getByRole('button', { name: 'Edit review of Feature 205' }).count(), 0, 'no Edit on Rita’s review')
  assert.equal(await lead.page.getByRole('button', { name: 'Write review of Feature 205' }).isDisabled(), false)
  assert.deepEqual(lead.errors, [])
  await lead.context.close()
})

// PIR-35: PI Review reads my own Features' Discussions when it opens — Rita sees Edit review… on her reviewed Feature
// without opening it; Ben's Feature 202 (with Lena's review) is not read until Read all Discussions; nothing is read twice.
test('TC-PIR-37: PI Review reads my own Features’ Discussions when it opens — Edit review… shows without opening the Feature; another person’s Feature is not read by itself, and nothing is read twice', async () => {
  const { page, context, errors, state } = await open({ comments: reviews(), ...(shots ? { width: 1440, height: 900, scale: 2 } : {}) })
  await navigate(page, 'PI Review')
  await page.getByRole('button', { name: 'Edit review of Feature 205' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Write review of Feature 205' }).count(), 0, 'one action per row')
  // Rita's own Features (201, 205) were read, once each; Ben's 202 was not.
  await until(async () => state.reads.includes(201) && await cell(page, 'example/project/201', 'Comments') === '0', 'my Feature 201 read')
  assert.deepEqual([...state.reads].sort(), [201, 205])
  assert.equal(await cell(page, 'example/project/202', 'Comments'), '—', 'another person’s Feature is not read by itself')
  if (shots) { mkdirSync(shots, { recursive: true }); await page.emulateMedia({ colorScheme: 'light' }); await page.locator('.pir-table .data-table-scroll').evaluate((box) => { box.scrollLeft = box.scrollWidth }); await page.screenshot({ path: `${shots}/pi-review-own-read-1440-light.png` }); await page.locator('.pir-table .data-table-scroll').evaluate((box) => { box.scrollLeft = 0 }) }
  // The drawer reuses what was read: no new request for 205.
  await rowOf(page, 'example/project/205').locator('td').nth(1).click()
  const drawer = page.locator('aside.drawer[role="dialog"]', { has: page.getByRole('heading', { name: 'Feature #205', exact: true }) })
  await drawer.getByRole('button', { name: 'Edit review of Feature 205' }).waitFor()
  await page.keyboard.press('Escape')
  await drawer.waitFor({ state: 'detached' })
  // Read all Discussions reads only the one not read yet.
  await page.getByRole('button', { name: '↻ Read all Discussions' }).click()
  await jobDone(page, 'Reading Discussions · PI 2026.4', '1 of 1 read')
  assert.deepEqual([...state.reads].sort(), [201, 202, 205], 'each Discussion read once')
  assert.equal(await page.getByRole('button', { name: 'Edit review of Feature 202' }).count(), 0, 'Lena’s review is not Rita’s')
  assert.deepEqual(state.posts, [])
  assert.deepEqual(errors, [])
  await context.close()
  // Lena, a lead with no Feature of her own: nothing is read by itself.
  const lead = await open({ email: 'lena.berg@example.com', roles: withLead(), comments: reviews() })
  await navigate(lead.page, 'PI Review')
  await rowOf(lead.page, 'example/project/205').waitFor()
  // Opening her own reviewed Feature 202 reads it (Edit review… in the drawer); nothing else was read.
  await rowOf(lead.page, 'example/project/202').locator('td').nth(1).click()
  await lead.page.locator('aside.drawer[role="dialog"]').getByRole('button', { name: 'Edit review of Feature 202' }).waitFor()
  assert.deepEqual(lead.state.reads, [202])
  assert.equal(await cell(lead.page, 'example/project/205', 'Comments'), '—')
  assert.deepEqual(lead.errors, [])
  await lead.context.close()
})
