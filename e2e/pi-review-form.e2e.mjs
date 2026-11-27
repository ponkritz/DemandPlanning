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
// PIR-84: the Discussion requests (reads and writes) are counted while in flight (inFlight, most); with state.gate set the
// writes wait for it (held: how many wait), so a test sees how many run at once.
function fakeAzure(state) {
  const handle = answer(state)
  return async (route) => {
    const request = route.request(), counted = /\/comments(?:\/\d+)?$/.test(new URL(request.url()).pathname)
    if (!counted) return handle(route)
    state.inFlight = (state.inFlight ?? 0) + 1
    state.most = Math.max(state.most ?? 0, state.inFlight)
    try {
      if (state.gate && request.method() !== 'GET') { state.held = (state.held ?? 0) + 1; await state.gate; state.held -= 1 }
      return await handle(route)
    } finally { state.inFlight -= 1 }
  }
}
function answer(state) {
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
        // PIR-84: the next post to these Features fails with 503 (once each).
        if (state.unavailable?.includes(id)) { state.unavailable = state.unavailable.filter((entry) => entry !== id); state.log.push(`POST ${id} 503`); return json({ message: 'Service unavailable' }, 503) }
        const body = JSON.parse(request.postData() ?? '{}')
        state.posts.push({ id, body })
        state.log.push(`POST ${id}`)
        const comment = { id: 900 + state.posts.length, text: body.text, createdBy: rita, createdDate: new Date(Date.UTC(2026, 10, 25, 9, state.posts.length)).toISOString() }
        list.unshift(comment)
        return json(comment)
      }
      // PIR-35: each Discussion read (a GET of its comments), by Feature, to count the requests.
      state.reads.push(id)
      // PIR-36: a Discussion that cannot be read (failRead lists the Features).
      if (state.failRead?.includes(id)) return json({ message: 'Service unavailable' }, 503)
      // KB-155: hold — the reads wait for it (the screenshots of "Reading N Discussions…").
      if (state.hold) return state.hold.then(() => json({ comments: list, count: list.length }))
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
  const state = { tree, team, world: items, comments: comments ?? { 201: [{ id: 5, text: '<div><b>Feature Review for PI 2026.4</b></div><div>Struggles: test rig late</div><div>Learnings: book the rig early</div><div>Move to next PI: Partly - waiting for vendor</div>', createdBy: ben, createdDate: '2026-11-21T14:30:00Z' }] }, posts: [], edits: [], reads: [], log: [], failNextPost: false, failNextEdit: false }
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
// A row by its key (PI Review) or by its ID (My PI Review, whose rows do not open; its first column is the tick box,
// PIR-36, so the ID is the second).
const rowOf = (page, key) => /^\d+$/.test(key) ? page.locator('.pir-table tbody tr').filter({ has: page.locator('td:nth-child(2)', { hasText: new RegExp(`^${key}$`) }) }) : page.locator(`.pir-table tr[data-row-key="${key}"]`)
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
  const other = page.getByRole('button', { name: 'Review Feature 202' })
  assert.equal(await other.isDisabled(), true)
  assert.match(await other.getAttribute('title'), /^Only the Feature’s assignee \(Ben Okafor\), the Product Owner of its Epic or a lead with “PI Review: post the review of a Feature” can post its review/)
  assert.match(await text(page.locator('.table-panel > .write-blocked')), /You can post the review of the Features assigned to you \(rita\.gomez@example\.com\)/)
  // PIR-13: Write review… in the drawer — prefilled from the latest review (Partly → No, said so), the next PI filled in.
  await page.locator('.pir-table tr[data-row-key="example/project/201"] td').nth(1).click()
  const drawer = page.locator('aside.drawer[role="dialog"]', { has: page.getByRole('heading', { name: 'Feature #201', exact: true }) })
  await drawer.getByRole('heading', { name: 'Discussion (1)' }).waitFor()
  await drawer.getByRole('button', { name: 'Review Feature 201' }).click()
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
  assert.match(help, /^Posting adds a new comment to the Feature’s Discussion, headed “Feature Review for” the reviewed PI \(e\.g\. “Feature Review for PI 26\.4”\): only a comment with that heading counts as the PI review, for that PI only\. PI Review reads the newest one, so a correction is posted as a new review\./)
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
  // PIR-48: the Preview starts with the review heading, as the comment does.
  assert.equal(await text(dialog.locator('.pir-review-comment > .pir-review-heading')), 'Feature Review for PI 2026.4')
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
  assert.ok(state.posts[0].body.text.startsWith('<p>Feature Review for PI 2026.4</p><ul>'), 'PIR-48: the Discussion POST starts with the heading')
  assert.ok(!state.posts[0].body.text.includes('<b>') && state.posts[0].body.text.includes('&lt;b&gt;calendar&lt;/b&gt;'), 'no user markup sent: escaped')
  const latest = drawer.getByRole('region', { name: 'Latest review' })
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
  assert.deepEqual(await table.locator('tbody tr td:nth-child(2)').allInnerTexts(), ['201', '205'], 'mine only: not Ben’s 202')
  // PIR-24: a Team Member sees only their own Features — Person disabled with the reason shown; nothing to reset.
  assert.equal(await page.getByRole('combobox', { name: 'Person' }).isDisabled(), true)
  assert.match(await text(page.locator('.pir-filters .write-blocked')), /^You see your own Features: showing another person’s needs “PI Review: post the review of a Feature”/)
  assert.equal(await page.getByRole('button', { name: 'Reset filters' }).isDisabled(), true)
  await page.getByRole('button', { name: 'Review Feature 205' }).click()
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
  assert.match(await tipOf(page, review.getByRole('button', { name: 'ⓘ How to fill in' })), /^Posted as a new comment in the Feature’s Discussion before the items close, headed “Feature Review for PI 2026\.4” \(it counts for that PI only\)\./)
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
  assert.ok(state.posts[0].body.text.startsWith('<p>Feature Review for PI 2026.4</p>'), 'PIR-48: the Close pop-up’s review is headed too')
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
  assert.deepEqual(await page.locator('.pir-table tbody tr td:nth-child(2)').allInnerTexts(), ['202'], 'Ben’s Feature only')
  assert.equal(await cell(page, '202', 'Their review'), 'Not reviewed')
  if (shots) { mkdirSync(shots, { recursive: true }); await page.emulateMedia({ colorScheme: 'light' }); await page.screenshot({ path: `${shots}/my-pi-review-person-1440-light.png` }) }
  // CON-113: a lead may write the review of another person's Feature; PIR-25: Moves to from the iteration dates.
  await page.getByRole('button', { name: 'Review Feature 202' }).click()
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
  await page.getByRole('button', { name: 'Review Feature 205' }).click()
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
  await page.getByRole('button', { name: 'Review Feature 205' }).click()
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

// PIR-49, PIR-50 (TC-PIR-27, TC-PIR-51): a review counts for the PI its heading "Feature Review for PI …" names only —
// not by its date. The iteration tree dated around today, so the scenario does not depend on the clock: PI 2026.3 ended
// 101 days ago; PI 2026.4 (dated by its Sprints only) runs from 100 days ago to 30 days ahead; PI 2026.5 follows. Rita's
// Features in PI 2026.4: 301 reviewed 10 days ago, headed for PI 2026.4; 302 reviewed 150 days ago, headed for PI
// 2026.3; 303 Closed, with an older review (no heading) written in PI 2026.4 after its Closed Date.
const dayFromToday = (offset) => { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset)).toISOString().slice(0, 10) }
const relativeTree = () => node('', [
  node('PI 2026.3', [], span(dayFromToday(-200), dayFromToday(-101))),
  node('PI 2026.4', [node('PI 2026.4\\Sprint 1', [], span(dayFromToday(-100), dayFromToday(-50))), node('PI 2026.4\\Sprint 2', [], span(dayFromToday(-49), dayFromToday(30)))]),
  node('PI 2026.5', [], span(dayFromToday(31), dayFromToday(120))),
])
const ritaReview = (id, offset, learnings, reviewedPi = 'PI 2026.4') => ({ id, text: buildReviewComment({ learnings, struggles: 'None', move: 'No', moveReason: '', movePi: 'PI 2026.5', mode: 'Offline Review', remarks: '', reviewedPi }), createdBy: rita, createdDate: `${dayFromToday(offset)}T10:00:00Z` })
// An older review, posted before the heading existed: the same fields, no "Feature Review for PI …" heading.
const oldReview = (id, offset, learnings) => ({ ...ritaReview(id, offset, learnings), text: ritaReview(id, offset, learnings).text.replace(/^<p>Feature Review for PI [^<]+<\/p>/, '') })
const periodWorld = () => [
  raw(100, 'Epic', 'DP releases', 'Project'),
  raw(301, 'Feature', 'Sample rig calibration', 'Project\\PI 2026.4', 100),
  raw(302, 'Feature', 'Supplier audit pack', 'Project\\PI 2026.4', 100),
  { ...raw(303, 'Feature', 'Lab bench move', 'Project\\PI 2026.4', 100, rita, 'Closed'), fields: { ...raw(303, 'Feature', 'Lab bench move', 'Project\\PI 2026.4', 100, rita, 'Closed').fields, 'Microsoft.VSTS.Common.ClosedDate': `${dayFromToday(-20)}T16:00:00Z` } },
]
const status = async (page, id) => text(rowOf(page, id).locator('td').nth(4))

test('TC-PIR-27: My PI Review counts a review for the PI its heading names — a review headed for another PI is Not reviewed with its date and PI; choosing another PI recomputes it', async () => {
  const { page, context, errors, state } = await open({ tree: relativeTree(), world: periodWorld(), comments: { 301: [ritaReview(11, -10, 'Calibrate first')], 302: [ritaReview(12, -150, 'Audit early', 'PI 2026.3')], 303: [oldReview(13, -15, 'Move benches at night')] }, start: dayFromToday(-250), ...(shots ? { width: 1440, height: 900, scale: 2 } : {}) })
  await navigate(page, 'My PI Review')
  await page.locator('.pir-filters .pill', { hasText: 'Current PI' }).waitFor()
  assert.equal(await page.getByLabel('PI', { exact: true }).inputValue(), 'Project\\PI 2026.4')
  await rowOf(page, '301').locator('.pill', { hasText: /^Reviewed$/ }).waitFor()
  await rowOf(page, '302').locator('.pill', { hasText: 'Not reviewed' }).waitFor()
  assert.equal(await status(page, '301'), 'Reviewed', 'headed “Feature Review for PI 2026.4”')
  assert.match(await status(page, '302'), /^Not reviewed Last review .+ \(PI 2026\.3\)$/, 'headed for PI 2026.3: named')
  // PIR-50: an older review without the heading — written in PI 2026.4, after the Feature closed — no longer counts.
  // PIR-75: it is flagged as an old-format comment to convert, still not counted.
  assert.equal(await status(page, '303'), 'Not reviewed Old format — convert')
  assert.match(await text(page.locator('.data-table-status')), /^1 of 3 reviewed$/)
  if (shots) { mkdirSync(shots, { recursive: true }); await page.emulateMedia({ colorScheme: 'light' }); await page.screenshot({ path: `${shots}/my-pi-review-reviewed-in-pi-2026-4-1440-light.png` }) }
  // Review… on 302: still prefilled from the latest review, labelled as written for PI 2026.3.
  await page.getByRole('button', { name: 'Review Feature 302' }).click()
  const dialog = page.getByRole('dialog', { name: 'Review of Feature #302' })
  assert.match(await text(dialog.locator('.pir-review-note')), /^Prefilled from the latest review comment \(Rita Gomez, .+\), written for PI 2026\.3: check it before posting\./)
  assert.equal(await dialog.getByRole('textbox', { name: /^Learnings/ }).inputValue(), 'Audit early')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await dialog.waitFor({ state: 'detached' })
  // The Feature 301 is carried over to PI 2026.5 in Azure DevOps; fetched again, PI 2026.5 chosen: its review is headed
  // for PI 2026.4 — Not reviewed, "(PI 2026.4)".
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

// PIR-49, PIR-50 (TC-PIR-51): the heading decides, not the PI's dates — without dates a review headed for the PI still
// counts and nothing says "every review counts"; an older review without the heading is Not reviewed until reviewed
// again, and the column's ⓘ says why. Reviewed again, the new comment is headed and counts.
test('TC-PIR-51: an older review without the “Feature Review for PI …” heading is Not reviewed; reviewed again it counts, whatever the PI dates', async () => {
  const { page, context, errors, state } = await open({ tree: node('', [node('PI 2026.4', [node('PI 2026.4\\Sprint 2')])]), team: [], world: periodWorld(), comments: { 301: [ritaReview(11, -10, 'Calibrate first')], 302: [oldReview(12, -5, 'Audit early')] }, start: dayFromToday(-250), ...(shots ? { width: 1440, height: 900, scale: 2 } : {}) })
  await navigate(page, 'My PI Review')
  await page.getByLabel('PI', { exact: true }).selectOption('Project\\PI 2026.4')
  await rowOf(page, '301').locator('.pill', { hasText: /^Reviewed$/ }).waitFor()
  await rowOf(page, '302').locator('.pill', { hasText: 'Not reviewed' }).waitFor()
  assert.equal(await status(page, '302'), 'Not reviewed Old format — convert', 'no heading: no review, no other PI named (PIR-75: flagged old-format)')
  assert.equal(await page.locator('.content .notice').filter({ hasText: 'every review comment counts' }).count(), 0, 'the dates no longer decide: no note')
  const hint = page.locator('.pir-table thead').getByRole('button', { name: 'About My review' })
  assert.match(await tipOf(page, hint), /a comment headed “Feature Review for PI 26\.4” counts for PI 26\.4 only.*Only comments headed “Feature Review for PI …” count as a PI review: a comment without that heading — older reviews included, whatever their date — does not, so its Feature shows as Not reviewed until it is reviewed again\./)
  if (shots) { mkdirSync(shots, { recursive: true }); await page.emulateMedia({ colorScheme: 'light' }); await page.screenshot({ path: `${shots}/my-pi-review-old-review-not-reviewed-1440-light.png` }) }
  // No Edit review… on the older comment: Review… posts a new, headed review — and then it counts.
  assert.equal(await page.getByRole('button', { name: 'Edit review of Feature 302' }).count(), 0)
  await page.getByRole('button', { name: 'Review Feature 302' }).click()
  const dialog = page.getByRole('dialog', { name: 'Review of Feature #302' })
  await dialog.getByRole('textbox', { name: /^Learnings/ }).fill('Audit early')
  await dialog.getByRole('textbox', { name: /^Struggles/ }).fill('None')
  await dialog.getByRole('radio', { name: 'Offline Review' }).check()
  await dialog.getByRole('button', { name: 'Post to Azure DevOps' }).click()
  await page.getByRole('dialog', { name: 'Post the review to Feature #302?' }).getByRole('button', { name: 'Post review to #302' }).click()
  await jobDone(page, 'Post review · #302', 'Posted to the Discussion of #302 and read back')
  assert.ok(state.posts[0].body.text.startsWith('<p>Feature Review for PI 2026.4</p>'), 'PIR-48: the POST body starts with the heading')
  await rowOf(page, '302').locator('.pill', { hasText: /^Reviewed$/ }).waitFor()
  assert.match(await text(page.locator('.data-table-status')), /^2 of 3 reviewed$/)
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-PIR-28: “No learnings or struggles” — not ticked; ticked it writes None under both headings and disables both; unticked it restores what was typed; posted and read back as None', async () => {
  const { page, context, errors, state } = await open(shots ? { width: 1440, height: 900, scale: 2 } : {})
  await navigate(page, 'My PI Review')
  await page.getByRole('button', { name: 'Review Feature 205' }).click()
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
  assert.match(expected, /^<p>Feature Review for PI 2026\.4<\/p><ul><li>Learnings of PI 2026\.4:<ul><li>None<\/li><\/ul><\/li><li>Struggles of PI 2026\.4:<ul><li>None<\/li><\/ul><\/li><li>Whether the feature needs to be shifted to PI 2026\.5 : No<\/li>/)
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
  assert.equal(await page.getByRole('button', { name: 'Review Feature 205' }).count(), 0, 'one action per row')
  assert.equal(await page.getByRole('button', { name: 'Review Feature 201' }).count(), 1)
  const writtenOn = await cell(page, '205', 'Date of my review')
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
  assert.match(await text(rowOf(page, '205').locator('td').nth(4)), /^Reviewed$/, 'its date stays: it still counts for PI 2026.4')
  // TC-PIR-40 (PIR-38): Date of my review shows when the review was updated; the written date is in its tooltip.
  await until(async () => await cell(page, '205', 'Date of my review') !== writtenOn, 'the updated date')
  assert.match(await rowOf(page, '205').locator('td span[title^="Written "]').getAttribute('title'), /^Written .+, updated .+$/)
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
  assert.equal(await page.getByRole('button', { name: 'Review Feature 205' }).count(), 0, 'one action per row')
  assert.equal(await page.getByRole('button', { name: 'Edit review of Feature 202' }).count(), 0, 'Lena’s review is not Rita’s')
  assert.equal(await page.getByRole('button', { name: 'Review Feature 202' }).isDisabled(), true)
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
  assert.equal(await lead.page.getByRole('button', { name: 'Review Feature 205' }).isDisabled(), false)
  assert.deepEqual(lead.errors, [])
  await lead.context.close()
})

// PIR-35: PI Review reads my own Features' Discussions when it opens — Rita sees Edit review… on her reviewed Feature
// without opening it; Ben's Feature 202 (with Lena's review) is not read until Read all Discussions; nothing is read twice.
test('TC-PIR-37: PI Review reads my own Features’ Discussions when it opens — Edit review… shows without opening the Feature; another person’s Feature is not read by itself, and nothing is read twice', async () => {
  const { page, context, errors, state } = await open({ comments: reviews(), ...(shots ? { width: 1440, height: 900, scale: 2 } : {}) })
  await navigate(page, 'PI Review')
  await page.getByRole('button', { name: 'Edit review of Feature 205' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Review Feature 205' }).count(), 0, 'one action per row')
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

// PIR-36, PIR-37: Rita ticks three of her Features — 205 with her own review of PI 2026.4 — and writes one review for
// them; Feature 207's Discussion cannot be read, so it cannot be ticked. Optional screenshots (E2E_SHOTS=<folder>, at
// E2E_SHOTS_WIDTH px, 1440 by default — run once more with 390 for a phone); the assertions never depend on them.
const bulkShots = process.env.E2E_SHOTS
const shotWidth = Number(process.env.E2E_SHOTS_WIDTH) || 1440
// PIR-84: the Result of each row of the grid (Post / Replace / Unchanged / Blocked).
const resultsOf = (list) => list.locator('tbody tr td.pir-bulk-result .pill').allInnerTexts()
const bulkWorld = () => [...world(), raw(206, 'Feature', 'Audit pack refresh', 'Project\\PI 2026.4', 100), raw(207, 'Feature', 'Sensor bench move', 'Project\\PI 2026.4', 100)]
async function bulkShot(page, name) {
  if (!bulkShots) return
  mkdirSync(bulkShots, { recursive: true })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.screenshot({ path: `${bulkShots}/${name}-${shotWidth}-light.png` })
}
test('TC-PIR-38: Write review for several Features — tick three (one with my review), one form, posted as ONE background job: two new comments, my review replaced on the third, all shown Reviewed', async () => {
  const { page, context, errors, state } = await open({ world: bulkWorld(), comments: { 205: [ritaOwnReview()] }, ...(bulkShots ? { width: shotWidth, height: shotWidth > 600 ? 900 : 844, scale: 2 } : {}) })
  state.failRead = [207]
  // At phone width the menu opens with ☰ first; the shots wait until it has slid away.
  if (shotWidth < 600) await page.getByRole('button', { name: 'Open menu' }).click()
  await navigate(page, 'My PI Review')
  if (shotWidth < 600) await until(async () => (await page.locator('.sidebar').boundingBox())?.x + (await page.locator('.sidebar').boundingBox())?.width <= 0, 'the menu closed')
  await rowOf(page, '205').locator('.pill', { hasText: /^Reviewed$/ }).waitFor()
  await rowOf(page, '206').locator('.pill', { hasText: 'Not reviewed' }).waitFor()
  await rowOf(page, '201').locator('.pill', { hasText: 'Not reviewed' }).waitFor()
  // A Feature whose Discussion could not be read cannot be ticked: the tick box is disabled with the reason.
  const blocked = page.getByRole('checkbox', { name: /^Select Feature 207 \(not possible: Its Discussion could not be read/ })
  await blocked.waitFor()
  assert.equal(await blocked.isDisabled(), true)
  assert.equal(await page.locator('.bulk-bar').count(), 0, 'no bar before a tick')
  for (const id of ['201', '205', '206']) await page.getByRole('checkbox', { name: `Select Feature ${id}`, exact: true }).check()
  const bar = page.getByRole('region', { name: 'Selected Features' })
  assert.match(await text(bar), /^3 selected\s*Update review for 3…\s*Clear selection$/)
  if (bulkShots) await bar.evaluate((box) => box.scrollIntoView({ block: 'center' }))
  await bulkShot(page, 'my-pi-review-bulk-selected')
  // Clear selection and the heading's tick box (it ticks only the rows that can be ticked: not 207).
  await bar.getByRole('button', { name: 'Clear selection' }).click()
  await bar.waitFor({ state: 'detached' })
  await page.getByRole('checkbox', { name: 'Select every row shown' }).check()
  assert.match(await text(bar), /^3 selected/)
  await bar.getByRole('button', { name: 'Update review for 3…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Review of 3 Features' })
  await dialog.waitFor()
  assert.match(await text(dialog.locator('.pir-review-note').first()), /^Each Feature below gets its own review \(PI 2026\.4\), as you \(your PAT\): 2 new · 1 unchanged \(not written\)\./)
  const list = dialog.getByRole('table', { name: 'Features to review' })
  assert.deepEqual(await list.locator('tbody tr td:first-child').allInnerTexts(), ['#201', '#205', '#206'])
  assert.deepEqual(await resultsOf(list), ['Post', 'Unchanged', 'Post'], 'my review untouched: nothing to write')
  assert.match(await text(list.locator('tbody tr').nth(1)), /Your review · /)
  // PIR-83: one text for all — the shared text instead of each Feature's own; the advice applied to all rows.
  assert.equal(await dialog.getByRole('textbox', { name: /^Learnings/ }).inputValue(), '')
  await dialog.getByRole('textbox', { name: /^Learnings/ }).fill('Book the rig early')
  await dialog.getByRole('textbox', { name: /^Struggles/ }).fill('Parts late')
  await dialog.getByRole('radiogroup', { name: 'Learnings: whose text' }).getByText('Use the shared text').click()
  assert.deepEqual(await resultsOf(list), ['Post', 'Replace', 'Post'])
  assert.deepEqual(await list.getByRole('combobox', { name: /^Move to next PI of #/ }).evaluateAll((boxes) => boxes.map((box) => box.value)), ['No', 'No', 'No'], 'No pre-selected, as the single form')
  await list.getByRole('combobox', { name: 'Review meeting for all' }).selectOption('Offline Review')
  await list.getByRole('button', { name: 'Apply Review meeting to all' }).click()
  await dialog.locator('.pir-review-preview', { hasText: 'Book the rig early' }).waitFor()
  if (bulkShots) await dialog.locator('.modal-scroll').evaluate((box) => { box.scrollTop = 0 })
  await bulkShot(page, 'my-pi-review-bulk-form')
  await dialog.getByRole('button', { name: 'Post to 3 Features' }).click()
  const confirm = page.getByRole('dialog', { name: 'Post the review to 3 Features?' })
  assert.match(await text(confirm), /A new comment in the Discussion of 2 Features: #201, #206\.\s*Your review comment replaced on 1 Feature: #205\./)
  await confirm.getByRole('button', { name: 'Post review to 3 Features' }).click()
  await dialog.waitFor({ state: 'detached' })
  assert.equal(await page.locator('.bulk-bar').count(), 0, 'the selection is cleared')
  await jobDone(page, 'PI review for 3 Features', 'Posted 2 (#201, #206) · Replaced 1 (#205) · Failed 0.')
  // Two new comments and one replaced — the same HTML the single form posts; nothing else written.
  const expected = buildReviewComment({ learnings: 'Book the rig early', struggles: 'Parts late', move: 'No', moveReason: '', movePi: 'PI 2026.5', mode: 'Offline Review', remarks: '', reviewedPi: 'PI 2026.4' })
  assert.deepEqual(state.posts.map((post) => post.id).sort(), [201, 206])
  assert.deepEqual(state.edits.map((entry) => [entry.id, entry.commentId]), [[205, 41]])
  for (const body of [...state.posts, ...state.edits].map((entry) => entry.body.text)) assert.equal(body, expected)
  for (const id of ['201', '205', '206']) await rowOf(page, id).locator('.pill', { hasText: /^Reviewed$/ }).waitFor()
  await until(async () => await cell(page, '205', 'Review mode') === 'Offline Review' && /^3 of 4 reviewed$/.test(await text(page.locator('.data-table-status'))), 'the table showing the new reviews')
  if (bulkShots) {
    await page.locator('.jobs-button').click()
    await page.getByRole('dialog', { name: 'Background jobs' }).waitFor()
    await bulkShot(page, 'my-pi-review-bulk-job-done')
  }
  assert.deepEqual(errors.filter((line) => !/503/.test(line)), [])
  await context.close()
})

// KB-155, PIR-80 (product owner, production: "in bulk update, if there is a comment already in place, it is not able to
// update"): Update review for (n) with every kind of comment already in place — my headed review of the PI (replaced),
// my review headed with the other label form "PI 26.4" (still mine for PI 2026.4: replaced), my older comment without
// the heading (not a review of the PI: a new comment), someone else's review (a new comment), a Feature in a Sprint
// below the PI — and the Discussion changed in Azure DevOps after the page read it (my review written there on #209,
// mine deleted on #208): the pop-up reads the ticked Features' Discussions again when it opens, so it replaces and
// posts by what Azure DevOps holds then, and nothing fails.
const bulkOwnReview = (id, reviewedPi, date) => ({ id, text: buildReviewComment({ learnings: 'Calibrate first', struggles: 'Parts late', move: 'No', moveReason: '', movePi: 'PI 2026.5', mode: 'Offline Review', remarks: '', reviewedPi }), createdBy: rita, createdDate: date })
const postingOf = async (list) => (await resultsOf(list)).map((value) => value === 'Replace' ? 'replace' : value === 'Post' ? 'New comment' : value)
async function bulkUpdate(page, ids, learnings, state) {
  for (const id of ids) await page.getByRole('checkbox', { name: `Select Feature ${id}`, exact: true }).check()
  const bar = page.getByRole('region', { name: 'Selected Features' })
  // Shots only: the reads held so the bar shows them under way.
  let release
  if (bulkShots && state) state.hold = new Promise((resolve) => { release = resolve })
  await bar.getByRole('button', { name: `Update review for ${ids.length}…` }).click()
  if (release) {
    await bar.getByRole('button', { name: `Reading ${ids.length} Discussions…` }).waitFor()
    await bulkShot(page, 'my-pi-review-bulk-reading')
    state.hold = undefined
    release()
  }
  const dialog = page.getByRole('dialog', { name: `Review of ${ids.length} Features` })
  await dialog.waitFor()
  const list = dialog.getByRole('table', { name: 'Features to review' })
  if (release) await bulkShot(page, 'my-pi-review-bulk-reread')
  // One text for all (PIR-83: Use the shared text), the advice applied to every row.
  await dialog.getByRole('textbox', { name: /^Learnings/ }).fill(learnings)
  await dialog.getByRole('textbox', { name: /^Struggles/ }).fill('Parts late')
  await dialog.getByRole('radiogroup', { name: 'Learnings: whose text' }).getByText('Use the shared text').click()
  await list.getByRole('combobox', { name: 'Review meeting for all' }).selectOption('Offline Review')
  await list.getByRole('button', { name: 'Apply Review meeting to all' }).click()
  const posting = await postingOf(list)
  await dialog.getByRole('button', { name: `Post to ${ids.length} Features` }).click()
  await page.getByRole('dialog', { name: `Post the review to ${ids.length} Features?` }).getByRole('button', { name: `Post review to ${ids.length} Features` }).click()
  await dialog.waitFor({ state: 'detached' })
  return posting
}
test('TC-PIR-80: Update review for (n) where comments are in place already — my headed review (either PI label form) replaced, my old-format comment and another person’s review get a new comment, a Discussion changed in Azure DevOps since the page read it is read again; none fails', async () => {
  const items = [...world(), raw(206, 'Feature', 'Audit pack refresh', 'Project\\PI 2026.4', 100), raw(207, 'Feature', 'Sensor bench move', 'Project\\PI 2026.4', 100), raw(208, 'Feature', 'Rig spares', 'Project\\PI 2026.4\\Sprint 2', 100), raw(209, 'Feature', 'Bench lights', 'Project\\PI 2026.4', 100)]
  const comments = {
    201: [bulkOwnReview(61, 'PI 2026.4', '2026-11-20T10:00:00Z')],
    205: [bulkOwnReview(62, 'PI 26.4', '2026-11-20T10:05:00Z')],
    206: [{ id: 63, text: '<div>Struggles: parts late</div><div>Learnings: calibrate first</div><div>Move to next PI: No</div>', createdBy: rita, createdDate: '2026-11-19T09:00:00Z' }],
    207: [{ ...bulkOwnReview(64, 'PI 2026.4', '2026-11-20T11:00:00Z'), createdBy: ben }],
    208: [bulkOwnReview(65, 'PI 2026.4', '2026-11-20T12:00:00Z')],
    209: [],
  }
  const ids = ['201', '205', '206', '207', '208', '209']
  const { page, context, errors, state } = await open({ world: items, comments, ...(bulkShots ? { width: shotWidth, height: 900, scale: 2 } : {}) })
  await navigate(page, 'My PI Review')
  for (const id of ['201', '205', '208']) await rowOf(page, id).locator('.pill', { hasText: /^Reviewed$/ }).waitFor()
  for (const id of ['206', '207', '209']) await rowOf(page, id).locator('.pill', { hasText: 'Not reviewed' }).waitFor()
  // In Azure DevOps meanwhile (another tab, Azure DevOps itself): my review written on #209, mine deleted on #208.
  state.comments[209].push(bulkOwnReview(66, 'PI 2026.4', '2026-11-25T08:00:00Z'))
  state.comments[208].length = 0
  assert.deepEqual(await bulkUpdate(page, ids, 'Book the rig early', state), ['replace', 'replace', 'New comment', 'New comment', 'New comment', 'replace'])
  await jobDone(page, 'PI review for 6 Features', 'Posted 3 (#206, #207, #208) · Replaced 3 (#201, #205, #209) · Failed 0.')
  // Writes run 3 at a time, so they reach Azure DevOps in any order.
  assert.deepEqual(state.edits.map((entry) => [entry.id, entry.commentId]).sort((x, y) => x[0] - y[0]), [[201, 61], [205, 62], [209, 66]])
  assert.deepEqual(state.posts.map((post) => post.id).sort(), [206, 207, 208])
  for (const id of ids) await rowOf(page, id).locator('.pill', { hasText: /^Reviewed$/ }).waitFor()
  // Again, in the same page load: every one now has my review of the PI — all six are replaced.
  assert.deepEqual(await bulkUpdate(page, ids, 'Book the rig earlier'), ids.map(() => 'replace'))
  await jobDone(page, 'PI review for 6 Features', 'Posted 0 · Replaced 6 (#201, #205, #206, #207, #208, #209) · Failed 0.')
  assert.equal(state.posts.length, 3)
  assert.deepEqual(errors, [])
  await context.close()
})

// PIR-82…PIR-84 (product owner, 26 Nov 2026: the bulk review redesign): five ticked Features — two with my review of the
// PI, one with my old-format comment, one with Ben's review, one with none. The grid starts each row from its review; the
// paragraphs once at the top (each Feature keeps its own, the shared text goes to the one without); Move to next PI and
// its Reason per row (each its own; the Reason optional with Yes), the advice applied to all, fill down from the active row and
// Ctrl+D; the Result column previews Unchanged (my review untouched) / Replace / Post. Saved: 3 writes at a time (the
// fake holds them to count), the untouched review not written, a 503 on one Feature not stopping the others, and Retry
// failed in Background jobs writing only that one, with the same comment. Screenshots with E2E_SHOTS (bulk-grid-*).
test('TC-PIR-84: Update review for 5 — the per-Feature grid starts from each review, own reasons per row, Apply to all and fill down, the preview (Unchanged / Replace / Post), 3 writes at a time, Retry failed after a 503', async () => {
  const items = [...world(), raw(206, 'Feature', 'Audit pack refresh', 'Project\\PI 2026.4', 100), raw(207, 'Feature', 'Sensor bench move', 'Project\\PI 2026.4', 100), raw(209, 'Feature', 'Bench lights', 'Project\\PI 2026.4', 100)]
  const comments = {
    201: [bulkOwnReview(61, 'PI 2026.4', '2026-11-20T10:00:00Z')],
    205: [bulkOwnReview(62, 'PI 2026.4', '2026-11-20T10:05:00Z')],
    206: [{ id: 63, text: '<div>Struggles: parts late</div><div>Learnings: calibrate the rig</div><div>Moving to next PI: No</div>', createdBy: rita, createdDate: '2026-11-19T09:00:00Z' }],
    207: [{ ...bulkOwnReview(64, 'PI 2026.4', '2026-11-20T11:00:00Z'), createdBy: ben }],
    209: [],
  }
  const ids = ['201', '205', '206', '207', '209']
  const { page, context, errors, state } = await open({ world: items, comments, ...(bulkShots ? { width: shotWidth, height: 900, scale: 2 } : {}) })
  await navigate(page, 'My PI Review')
  for (const id of ['201', '205']) await rowOf(page, id).locator('.pill', { hasText: /^Reviewed$/ }).waitFor()
  for (const id of ['206', '207', '209']) await rowOf(page, id).locator('.pill', { hasText: 'Not reviewed' }).waitFor()
  for (const id of ids) await page.getByRole('checkbox', { name: `Select Feature ${id}`, exact: true }).check()
  await page.getByRole('region', { name: 'Selected Features' }).getByRole('button', { name: 'Update review for 5…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Review of 5 Features' })
  await dialog.waitFor()
  const list = dialog.getByRole('table', { name: 'Features to review' })
  const rowById = (id) => list.locator('tbody tr').filter({ has: page.locator('td:first-child', { hasText: new RegExp(`^#${id}$`) }) })
  // PIR-83: each row starts from that Feature's review — mine, my old-format comment, Ben's, or the form's defaults.
  assert.deepEqual((await list.locator('tbody tr td:nth-child(3)').allInnerTexts()).map((value) => value.replace(/ · .*/, '')), ['Your review', 'Your review', 'Your old-format comment', 'Ben Okafor’s review', 'Form defaults'])
  const moves = () => list.getByRole('combobox', { name: /^Move to next PI of #/ }).evaluateAll((boxes) => boxes.map((box) => box.value))
  const advice = () => list.getByRole('combobox', { name: /^Review meeting of #/ }).evaluateAll((boxes) => boxes.map((box) => box.value))
  assert.deepEqual(await moves(), ['No', 'No', 'No', 'No', 'No'])
  assert.deepEqual(await advice(), ['Offline Review', 'Offline Review', '', 'Offline Review', ''], 'the advice of each review; none for the old format and the defaults')
  // The shared paragraphs: each Feature keeps its own (default, as four start from a comment) — the text goes to #209.
  assert.equal(await dialog.getByRole('radiogroup', { name: 'Learnings: whose text' }).getByRole('radio', { name: 'Keep each Feature’s own' }).isChecked(), true)
  assert.match(await text(dialog.locator('.pir-bulk-shared-field', { hasText: 'Learnings' }).first()), /4 Features keep their own Learnings; the text above goes to the other 1\./)
  assert.deepEqual(await resultsOf(list), ['Unchanged', 'Unchanged', 'Post', 'Post', 'Post'])
  assert.match(await text(rowById(206).locator('td.pir-bulk-result')), /New \(old-format comment stays — use Convert… to replace it\)/)
  assert.match(await text(rowById(207).locator('td.pir-bulk-result')), /New comment \(Ben Okafor’s review stays\)/)
  await dialog.getByRole('textbox', { name: /^Learnings/ }).fill('Book the rig early')
  await dialog.getByRole('textbox', { name: /^Struggles/ }).fill('Parts late')
  // Apply to all: the advice of the row "All Features" in every row (#201 already Offline Review: still unchanged).
  await list.getByRole('combobox', { name: 'Review meeting for all' }).selectOption('Offline Review')
  await list.getByRole('button', { name: 'Apply Review meeting to all' }).click()
  assert.deepEqual(await advice(), ids.map(() => 'Offline Review'))
  // Per row: Move to next PI Yes, each with its own reason.
  for (const [id, reason] of [['205', 'Vendor parts in January'], ['206', 'Audit left'], ['207', 'Bench move in January']]) {
    await list.getByRole('combobox', { name: `Move to next PI of #${id}` }).selectOption('Yes')
    await list.getByRole('textbox', { name: `Reason of #${id}` }).fill(reason)
  }
  // Fill down from the active row (#207, just typed in) to the rows below; Ctrl+D copies the row above (Move of #209).
  await list.getByRole('button', { name: 'Fill down Reason from #207' }).click()
  await list.getByRole('combobox', { name: 'Move to next PI of #209' }).press('Control+d')
  assert.deepEqual(await moves(), ['No', 'Yes', 'Yes', 'Yes', 'Yes'])
  assert.equal(await list.getByRole('textbox', { name: 'Reason of #209' }).inputValue(), 'Bench move in January')
  // The Reason is optional with Yes (as in the single form): an empty one is no problem.
  await list.getByRole('textbox', { name: 'Reason of #209' }).fill('')
  assert.equal(await dialog.locator('.notice', { hasText: 'Enter the Reason' }).count(), 0)
  await list.getByRole('textbox', { name: 'Reason of #209' }).fill('Two tests left')
  assert.deepEqual(await resultsOf(list), ['Unchanged', 'Replace', 'Post', 'Post', 'Post'])
  // The Preview shows the active row's comment.
  await rowById(209).locator('td:nth-child(2)').click()
  await dialog.locator('.pir-bulk-preview', { hasText: 'Two tests left' }).waitFor()
  assert.match(await text(dialog.locator('.pir-bulk-preview')), /Preview of #209[\s\S]*Feature Review for PI 2026\.4[\s\S]*Book the rig early/)
  if (bulkShots) await dialog.locator('.modal-scroll').evaluate((box) => { box.scrollTop = 0 })
  await bulkShot(page, 'bulk-grid-form')
  if (bulkShots) await dialog.locator('.pir-bulk-preview').evaluate((box) => box.scrollIntoView({ block: 'end' }))
  await bulkShot(page, 'bulk-grid-preview')
  await dialog.getByRole('button', { name: 'Post to 4 Features' }).click()
  const confirm = page.getByRole('dialog', { name: 'Post the review to 4 Features?' })
  assert.match(await text(confirm), /A new comment in the Discussion of 3 Features: #206, #207, #209\.\s*Your review comment replaced on 1 Feature: #205\.\s*Not written \(unchanged\): #201\./)
  // The writes are held to count them: three wait at once, the fourth only after one is answered.
  state.most = 0
  let release
  state.gate = new Promise((resolve) => { release = resolve })
  state.unavailable = [207]
  await confirm.getByRole('button', { name: 'Post review to 4 Features' }).click()
  await dialog.waitFor({ state: 'detached' })
  await until(async () => state.held === 3, 'three writes in flight')
  assert.equal(state.most, 3)
  state.gate = undefined
  release()
  await jobDone(page, 'PI review for 4 Features', 'Posted 2 (#206, #209) · Replaced 1 (#205) · Unchanged 1 (#201) not written · Failed 1 (#207). #207: Azure DevOps did not add the comment (503)')
  assert.ok(state.most <= 3, `at most 3 requests in flight (${state.most})`)
  // The bodies: each its own review — its own paragraphs or the shared text, its own reason; nothing for #201.
  const review = (values) => buildReviewComment({ learnings: 'Calibrate first', struggles: 'Parts late', move: 'Yes', moveReason: '', movePi: 'PI 2026.5', mode: 'Offline Review', remarks: '', reviewedPi: 'PI 2026.4', ...values })
  assert.deepEqual(state.edits.map((entry) => [entry.id, entry.commentId, entry.body.text]), [[205, 62, review({ moveReason: 'Vendor parts in January' })]])
  assert.deepEqual(state.posts.map((entry) => entry.id).sort(), [206, 209])
  assert.equal(state.posts.find((entry) => entry.id === 206).body.text, review({ learnings: 'calibrate the rig', struggles: 'parts late', moveReason: 'Audit left' }))
  assert.equal(state.posts.find((entry) => entry.id === 209).body.text, review({ learnings: 'Book the rig early', moveReason: 'Two tests left' }))
  assert.equal(state.log.filter((line) => line.startsWith('POST 201') || line.startsWith('PATCH comment 61')).length, 0)
  if (bulkShots) { await page.locator('.jobs-button').click(); await page.getByRole('dialog', { name: 'Background jobs' }).waitFor() }
  await bulkShot(page, 'bulk-grid-job')
  if (bulkShots) await page.getByRole('dialog', { name: 'Background jobs' }).getByRole('button', { name: 'Close', exact: true }).click()
  // Retry failed: only #207, with the same comment (Ben's text as its start, my reason).
  await page.locator('.jobs-button').click()
  const panel = page.getByRole('dialog', { name: 'Background jobs' })
  await panel.locator('li.job', { hasText: 'PI review for 4 Features' }).getByRole('button', { name: 'Retry failed (1)' }).click()
  await panel.getByRole('button', { name: 'Close', exact: true }).click()
  await jobDone(page, 'PI review for 1 Feature', 'Posted 1 (#207) · Replaced 0 · Failed 0.')
  assert.equal(state.posts.find((entry) => entry.id === 207).body.text, review({ moveReason: 'Bench move in January' }))
  assert.equal(state.posts.length, 3)
  for (const id of ids) await rowOf(page, id).locator('.pill', { hasText: /^Reviewed$/ }).waitFor()
  assert.deepEqual(errors.filter((line) => !/503/.test(line)), [])
  await context.close()
})
