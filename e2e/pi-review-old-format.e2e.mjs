import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { navigate, openPage, startApp, text } from './helpers.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'
import { serializeEpicSetup } from '../src/epicSetup.ts'
import { fakeGitHub } from './fakeGitHub.mjs'

// PIR-75…PIR-78 (temporary, LIM-235; TC-PIR-79 UAT): reviews written in the old format — "Struggles / Learnings / Moving
// to next PI" without the heading "Feature Review for PI …" — are found and flagged, never counted; their author
// converts them on My PI Review (the review form prefilled, saved as an UPDATE of the same comment, which then counts);
// another person's old-format comment shows the author-only reason; PI Review's Old format filter and Search Discussions…
// find them. Against a fake dev.azure.com (the Time Writing fetch, the iterations, the Discussions, the comment PATCH).
// Rita Gomez is a Team Member and the assignee of Features 201 and 205; Ben Okafor wrote the old-format comment on 205.
// Synthetic data only; every step waits for what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })
const shots = process.env.OLD_FORMAT_SHOTS

const rita = { displayName: 'Rita Gomez', uniqueName: 'rita.gomez@example.com' }, ben = { displayName: 'Ben Okafor', uniqueName: 'ben.okafor@example.com' }
const profile = { id: 'tw-pir', url: 'https://dev.azure.com/example/Project/_backlogs/backlog/Team%20A/Features', reason: 'Time Writing', token: 'x'.repeat(52), role: 'time-tracking', creatorEmail: 'rita.gomez@example.com' }
const raw = (id, type, title, iterationPath, parent, assignee = rita) => ({ id, rev: 1, fields: { 'System.TeamProject': 'Project', 'System.WorkItemType': type, 'System.Title': title, 'System.State': 'Active', 'System.AreaPath': 'Project\\Quality', 'System.IterationPath': iterationPath, ...(parent ? { 'System.Parent': parent } : {}), 'System.AssignedTo': assignee } })
const world = [raw(100, 'Epic', 'DP releases', 'Project'), raw(201, 'Feature', 'DP 4.2 release review', 'Project\\PI 2026.4', 100), raw(202, 'Feature', 'CP template update', 'Project\\PI 2026.4', 100, ben), raw(205, 'Feature', 'Lab rig upgrade', 'Project\\PI 2026.4', 100)]
const node = (path, children = [], attributes) => ({ name: path.split('\\').at(-1) || 'Project', path: `\\Project\\Iteration${path ? `\\${path}` : ''}`, ...(attributes ? { attributes } : {}), children })
const tree = node('', [node('PI 2026.4', [node('PI 2026.4\\Sprint 2', [], { startDate: '2000-01-01T00:00:00Z', finishDate: '2099-12-31T00:00:00Z' })]), node('PI 2026.5')])
// Rita's old-format review of 201, as Azure DevOps stores it (HTML); Ben's on Rita's 205; a plain comment on 202.
const ritaOld = '<div><b>Struggles:</b>&nbsp;test rig late</div><div><b>Learnings</b></div><ul><li>book the rig early</li></ul><div>Moving to next PI: No - nothing left</div>'
const comments = () => ({
  201: [{ id: 51, text: ritaOld, createdBy: rita, createdDate: '2026-11-10T09:00:00Z' }],
  205: [{ id: 52, text: '<div>Struggle: supplier slow</div><div>Moved to next PI - Yes, waiting for parts</div>', createdBy: ben, createdDate: '2026-11-12T09:00:00Z' }],
  202: [{ id: 53, text: 'Thanks, the template is updated.', createdBy: ben, createdDate: '2026-11-13T09:00:00Z' }],
})
function fakeAzure(state) {
  return (route) => {
    const request = route.request(), path = decodeURIComponent(new URL(request.url()).pathname)
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/_apis/work/teamsettings/teamfieldvalues')) return json({ field: { referenceName: 'System.AreaPath' }, values: [{ value: 'Project\\Quality', includeChildren: true }] })
    if (path.endsWith('/_apis/work/backlogs/Microsoft.EpicCategory/workItems')) return json({ workItems: [{ target: { id: 100 } }] })
    if (path.endsWith('/_apis/wit/workitemsbatch')) { const ids = JSON.parse(request.postData() ?? '{}').ids ?? []; return json({ value: world.filter((item) => ids.includes(item.id)) }) }
    if (path.endsWith('/_apis/wit/wiql')) {
      const query = JSON.parse(request.postData() ?? '{}').query ?? ''
      const parents = (/\[System\.Parent\] IN \(([\d,]+)\)/.exec(query)?.[1] ?? '').split(',').map(Number), after = Number(/\[System\.Id\] > (\d+)/.exec(query)?.[1] ?? 0)
      return json({ workItems: world.filter((item) => parents.includes(item.fields['System.Parent']) && item.id > after).map((item) => ({ id: item.id })) })
    }
    if (path.endsWith('/_apis/wit/classificationnodes/iterations')) return json(tree)
    const edit = /\/_apis\/wit\/workItems\/(\d+)\/comments\/(\d+)$/.exec(path)
    if (edit && request.method() === 'PATCH') {
      const id = Number(edit[1]), commentId = Number(edit[2]), found = (state.comments[id] ?? []).find((entry) => entry.id === commentId)
      if (!found) return json({ message: 'Not found' }, 404)
      const body = JSON.parse(request.postData() ?? '{}')
      state.edits.push({ id, commentId, body })
      Object.assign(found, { text: body.text, modifiedDate: new Date().toISOString() })
      return json(found)
    }
    const list = /\/_apis\/wit\/workItems\/(\d+)\/comments$/.exec(path)
    if (list) {
      if (request.method() !== 'GET') { state.posts.push(Number(list[1])); return json({ message: 'not expected' }, 500) }
      const entries = state.comments[Number(list[1])] ?? []
      return json({ comments: entries, count: entries.length })
    }
    return json({ value: [] })
  }
}
// Team Members also have Team insights (PI Review) here, an Admin's choice in Role rights.
const roles = () => { const policy = defaultPolicy(); policy.defaultRole = 'Team Member'; policy.roles['Team Member'].areas.push('insights'); return serializeAccess(policy) }
async function open() {
  const state = { comments: comments(), edits: [], posts: [] }
  const { page, context, errors } = await openPage(app, { width: 1440, height: 900, scale: shots ? 2 : undefined, init: ([connection, roles]) => {
    localStorage.setItem('demand-planning-access-v1', roles)
    localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify([connection]))
    localStorage.setItem('demand-planning-work-email-v1', 'rita.gomez@example.com')
  }, initArg: [profile, roles()] })
  await page.emulateMedia({ colorScheme: 'light' })
  await context.route('https://dev.azure.com/**', fakeAzure(state))
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, () => guide.getByRole('button', { name: 'Close', exact: true }).last().click())
  await page.reload()
  return { page, context, errors, state }
}
const myRow = (page, id) => page.locator('.pir-table tbody tr').filter({ has: page.locator('td:nth-child(2)', { hasText: new RegExp(`^${id}$`) }) })
const shot = async (target, name) => { if (!shots) return; mkdirSync(shots, { recursive: true }); await target.screenshot({ path: `${shots}/${name}.png` }) }
async function jobDone(page, label, detail) {
  await page.locator('.jobs-button').click()
  const panel = page.getByRole('dialog', { name: 'Background jobs' })
  await panel.locator('li.job', { hasText: label }).filter({ hasText: detail }).first().waitFor()
  await panel.getByRole('button', { name: 'Close', exact: true }).click()
}

test('TC-PIR-79: my old-format comment is flagged on My PI Review, Convert… prefills the form and Save updates the same comment headed “Feature Review for PI” — then Reviewed; another person’s shows the author-only reason; PI Review’s Old format filter and Search Discussions… find them', async () => {
  const { page, context, errors, state } = await open()
  await navigate(page, 'My PI Review')
  // TC-PIR-75, TC-PIR-77: both my Features have an old-format comment — flagged, still Not reviewed.
  await myRow(page, '201').locator('.pill', { hasText: 'Old format — convert' }).waitFor()
  await myRow(page, '205').locator('.pill', { hasText: 'Old format — convert' }).waitFor()
  assert.equal(await text(myRow(page, '201').locator('.pill').first()), 'Not reviewed', 'an old-format comment is no review')
  const filter = page.getByRole('group', { name: 'Show Features' })
  assert.equal(await text(filter.getByRole('button', { name: /^Old format/ })), 'Old format (2)')
  // Mine: Convert… enabled; Ben's comment on my Feature: disabled, only its author can convert it.
  const convert = page.getByRole('button', { name: 'Convert old-format comment of Feature 201' })
  assert.equal(await convert.isDisabled(), false)
  const bens = page.getByRole('button', { name: 'Convert old-format comment of Feature 205' })
  assert.equal(await bens.isDisabled(), true)
  assert.match(await bens.getAttribute('title'), /^Only Ben Okafor can convert their comment/)
  await shot(page.locator('.pir-table'), 'old-format-my-pi-review')

  // TC-PIR-76: Convert… opens the review form prefilled from the old comment, the reviewed PI the page's.
  await convert.click()
  const dialog = page.getByRole('dialog', { name: 'Convert old-format comment of Feature #201' })
  await dialog.waitFor()
  assert.equal(await dialog.getByRole('textbox', { name: /^Struggles/ }).inputValue(), 'test rig late')
  assert.equal(await dialog.getByRole('textbox', { name: /^Learnings/ }).inputValue(), 'book the rig early')
  assert.equal(await dialog.getByRole('radio', { name: 'No', exact: true }).isChecked(), true)
  assert.equal(await dialog.getByRole('textbox', { name: /^Additional Remarks/ }).inputValue(), 'Why it does not move — nothing left')
  assert.equal(await text(dialog.getByRole('combobox', { name: 'Reviewed PI' }).locator('option:checked')), 'PI 2026.4')
  assert.match(await text(dialog.locator('.pir-review-heading')), /^Feature Review for PI 2026\.4$/)
  await dialog.getByRole('radio', { name: 'Offline Review' }).check()
  await shot(page, 'old-format-convert-form')
  await dialog.getByRole('button', { name: 'Save to Azure DevOps' }).click()
  await page.getByRole('dialog', { name: 'Save the converted review of Feature #201?' }).getByRole('button', { name: 'Save review to #201' }).click()
  await jobDone(page, 'Convert review · #201', 'Converted the old-format comment of #201 and read back')
  // The same comment updated (PATCH …/comments/51), headed “Feature Review for PI 2026.4”; nothing posted.
  assert.deepEqual(state.edits.map((entry) => [entry.id, entry.commentId]), [[201, 51]])
  assert.match(state.edits[0].body.text, /^<p>Feature Review for PI 2026\.4<\/p>/)
  assert.match(state.edits[0].body.text, /<li>test rig late<\/li>/)
  assert.deepEqual(state.posts, [])
  await myRow(page, '201').locator('.pill', { hasText: /^Reviewed$/ }).waitFor()
  assert.equal(await myRow(page, '201').locator('.pill', { hasText: 'Old format — convert' }).count(), 0)
  assert.equal(await text(filter.getByRole('button', { name: /^Old format/ })), 'Old format (1)')
  await filter.getByRole('button', { name: /^Old format/ }).click()
  await myRow(page, '201').waitFor({ state: 'detached' })
  assert.equal(await myRow(page, '205').count(), 1)
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await myRow(page, '201').waitFor()

  // TC-PIR-77, TC-PIR-78: PI Review — the Old format filter keeps the Feature with Ben's comment, its author named.
  await navigate(page, 'PI Review')
  await page.locator('.pir-table tr[data-row-key="example/project/205"]').waitFor()
  await page.getByRole('button', { name: '↻ Read all Discussions' }).click()
  await page.locator('.pir-table tr[data-row-key="example/project/205"] .pill', { hasText: 'Old format — convert' }).waitFor()
  await page.getByRole('button', { name: /^Old format:/ }).click()
  await page.getByRole('listbox', { name: 'Old format' }).getByRole('checkbox', { name: 'Old format — convert', exact: true }).check()
  await page.locator('.pir-table tr[data-row-key="example/project/201"]').waitFor({ state: 'detached' })
  assert.deepEqual(await page.locator('.pir-table tbody tr[data-row-key]').evaluateAll((rows) => rows.map((row) => row.dataset.rowKey)), ['example/project/205'])
  assert.match(await text(page.locator('.pir-table tr[data-row-key="example/project/205"] .pir-old-format')), /Old format — convert Ben Okafor/)
  await page.keyboard.press('Escape')
  await page.getByRole('listbox', { name: 'Old format' }).waitFor({ state: 'detached' })
  // The drawer lists the old-format comment with the author-only reason for Rita.
  await page.locator('.pir-table tr[data-row-key="example/project/205"] td').nth(2).click()
  const drawer = page.locator('.pir-drawer')
  const olds = drawer.getByRole('region', { name: 'Old-format comments' })
  await olds.waitFor()
  assert.match(await text(olds), /Ben Okafor/)
  assert.match(await text(olds), /Only Ben Okafor can convert their comment/)
  assert.equal(await olds.getByRole('button', { name: 'Convert old-format comment of Feature 205' }).isDisabled(), true)
  await drawer.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Reset filters' }).click()

  // Search Discussions…: every word typed, the old-format comment flagged; the converted one no longer is.
  await page.getByRole('button', { name: 'Search Discussions…' }).click()
  const search = page.getByRole('dialog', { name: 'Search Discussions' })
  await search.waitFor()
  assert.match(await text(search.locator('.pir-search-note')), /All 3 Discussions of the PI are read/)
  await search.getByRole('searchbox', { name: 'Search Discussions' }).fill('struggle')
  await search.locator('tr[data-row-key="example/project/205|52"]').waitFor()
  const hit = search.locator('tr[data-row-key="example/project/205|52"]')
  assert.match(await text(hit), /205 Lab rig upgrade Ben Okafor .* Old format — convert/)
  const converted = search.locator('tr[data-row-key="example/project/201|51"]')
  assert.equal(await converted.locator('.pill').count(), 0, 'the converted comment is a review now')
  await search.getByRole('searchbox', { name: 'Search Discussions' }).fill('template updated')
  await search.locator('tr[data-row-key="example/project/202|53"]').waitFor()
  assert.equal(await search.locator('tbody tr[data-row-key]').count(), 1)
  await search.getByRole('searchbox', { name: 'Search Discussions' }).fill('struggle')
  await hit.waitFor()
  await shot(search, 'old-format-search')
  await hit.locator('td').nth(1).click()
  await page.locator('.pir-drawer').getByRole('region', { name: 'Old-format comments' }).waitFor()
  assert.deepEqual(errors, [])
  await context.close()
})

// PIR-71, PIR-77: in My PI Review → My Epics (as Product Owner) — Rita is the Product Owner of Epic 100 (epic-setup.json
// in a mocked GitHub) — she converts her own old-format comment on Ben's Feature 202; Ben's comment on 205 stays
// author-only.
test('TC-PIR-79: Convert… also works in My Epics (as Product Owner), still author-only', async () => {
  const gh = fakeGitHub({ files: { 'access.json': roles(), 'epic-setup.json': serializeEpicSetup({ schema: 1, kind: 'epic-setup', lists: [], epics: [{ epicId: 100, epicTitle: 'DP releases', fields: [], productOwner: { email: 'rita.gomez@example.com', name: 'Rita Gomez' } }] }) } })
  const state = { comments: { ...comments(), 202: [{ id: 54, text: 'Struggles: template owners busy\nLearnings: ask early\nMoving to next PI: No', createdBy: rita, createdDate: '2026-11-14T09:00:00Z' }] }, edits: [], posts: [] }
  const { page, context, errors } = await openPage(app, { width: 1440, height: 900, init: ([connection]) => {
    localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify([connection]))
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', 'rita.gomez@example.com')
  }, initArg: [profile] })
  await context.route('https://api.github.com/**', gh.route)
  await context.route('https://dev.azure.com/**', fakeAzure(state))
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, () => guide.getByRole('button', { name: 'Close', exact: true }).last().click())
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, 'My PI Review')
  await myRow(page, '201').waitFor()
  await page.getByRole('radio', { name: 'My Epics (as Product Owner)' }).click()
  await myRow(page, '202').locator('.pill', { hasText: 'Old format — convert' }).waitFor()
  const convert = page.getByRole('button', { name: 'Convert old-format comment of Feature 202' })
  assert.equal(await convert.isDisabled(), false, 'her own comment, on a Feature of her Epic')
  assert.match(await page.getByRole('button', { name: 'Convert old-format comment of Feature 205' }).getAttribute('title'), /^Only Ben Okafor can convert their comment/)
  await convert.click()
  const dialog = page.getByRole('dialog', { name: 'Convert old-format comment of Feature #202' })
  assert.equal(await dialog.getByRole('textbox', { name: /^Struggles/ }).inputValue(), 'template owners busy')
  await dialog.getByRole('radio', { name: 'Offline Review' }).check()
  await dialog.getByRole('button', { name: 'Save to Azure DevOps' }).click()
  await page.getByRole('dialog', { name: 'Save the converted review of Feature #202?' }).getByRole('button', { name: 'Save review to #202' }).click()
  await until(() => state.edits.length === 1, 'the comment PATCH')
  assert.deepEqual([state.edits[0].id, state.edits[0].commentId], [202, 54])
  assert.match(state.edits[0].body.text, /^<p>Feature Review for PI 2026\.4<\/p>/)
  assert.deepEqual(state.posts, [])
  await myRow(page, '202').locator('.pill', { hasText: /^Reviewed$/ }).waitFor()
  assert.deepEqual(errors, [])
  await context.close()
})
const until = async (check, what) => { for (const end = Date.now() + 60000; Date.now() < end;) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 50)) } assert.fail(`timed out waiting for ${what}`) }
