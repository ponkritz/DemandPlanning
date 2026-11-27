import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { navigate, openPage, startApp, text, toggleFilter } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'

// EPS-11, PIR-68…PIR-71 (TC-PIR-68, UAT): the Product Owner of an Epic. The Tool Owner sets Rita Gomez as the Product
// Owner of the Epic "DP releases" in Admin → Feature & PI setup → Setup per Epic (saved to a mocked GitHub with the Epic
// setup); the Product Owner filter of PI Review narrows the rows; the meeting file shows her name (never her email). Then
// Rita — a Team Member without "PI Review: post the review of a Feature" — opens My PI Review → My Epics (as Product
// Owner) and posts the review of a Feature of her Epic assigned to someone else (the Discussion POST checked). A fake
// dev.azure.com dated around today. Synthetic data only; every step waits for what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })
const shots = process.env.EPIC_PO_SHOTS
const shot = async (target, name) => { if (!shots) return; mkdirSync(shots, { recursive: true }); await target.screenshot({ path: `${shots}/${name}.png` }) }

const dayFromToday = (offset) => { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset)).toISOString().slice(0, 10) }
const rita = { displayName: 'Rita Gomez', uniqueName: 'rita.gomez@example.com' }, ken = { displayName: 'Ken Ito', uniqueName: 'ken.ito@example.com' }
const raw = (id, type, title, iterationPath, parent, assignee = rita) => ({ id, rev: 1, fields: { 'System.TeamProject': 'Project', 'System.WorkItemType': type, 'System.Title': title, 'System.State': 'Active', 'System.AreaPath': 'Project\\Quality', 'System.IterationPath': iterationPath, ...(parent ? { 'System.Parent': parent } : {}), 'System.AssignedTo': assignee } })
const world = () => [
  raw(100, 'Epic', 'DP releases', 'Project'), raw(110, 'Epic', 'Supplier audits', 'Project'),
  raw(201, 'Feature', 'Lab rig upgrade', 'Project\\PI 2026.4', 100), raw(202, 'Feature', 'Fixture library refresh', 'Project\\PI 2026.4', 100, ken),
  raw(203, 'Feature', 'Gauge study', 'Project\\PI 2026.4', 100), raw(204, 'Feature', 'Supplier audit pack', 'Project\\PI 2026.4', 110, ken),
]
const span = (from, to) => ({ startDate: `${from}T00:00:00Z`, finishDate: `${to}T00:00:00Z` })
const node = (path, children = [], attributes) => ({ name: path.split('\\').at(-1) || 'Project', path: `\\Project\\Iteration${path ? `\\${path}` : ''}`, ...(attributes ? { attributes } : {}), children })
const tree = () => node('', [node('PI 2026.4', [node('PI 2026.4\\Sprint 1', [], span(dayFromToday(-60), dayFromToday(-30))), node('PI 2026.4\\Sprint 2', [], span(dayFromToday(-29), dayFromToday(25)))]), node('PI 2027.1', [], span(dayFromToday(26), dayFromToday(115)))])
function fakeAzure(state) {
  return (route) => {
    const request = route.request(), path = decodeURIComponent(new URL(request.url()).pathname)
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/_apis/work/teamsettings/teamfieldvalues')) return json({ field: { referenceName: 'System.AreaPath' }, values: [{ value: 'Project\\Quality', includeChildren: true }] })
    if (path.endsWith('/_apis/work/backlogs/Microsoft.EpicCategory/workItems')) return json({ workItems: [{ target: { id: 100 } }, { target: { id: 110 } }] })
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
    if (found) {
      const id = Number(found[1]), list = state.comments[id] ??= []
      if (request.method() === 'POST') {
        const body = JSON.parse(request.postData() ?? '{}')
        state.posts.push({ id, body })
        const comment = { id: 900 + state.posts.length, text: body.text, createdBy: rita, createdDate: new Date().toISOString() }
        list.unshift(comment)
        return json(comment)
      }
      return json({ comments: list, count: list.length })
    }
    return json({ value: [] })
  }
}
// Everyone is a Team Member (with PI Review shown); the Tool Owner sets up the Epics.
const policy = () => { const value = defaultPolicy(); value.defaultRole = 'Team Member'; value.roles['Team Member'].areas.push('insights'); value.members = { 'owner@example.com': ['Tool Owner'] }; return serializeAccess(value) }
async function open(gh, email) {
  const state = { world: world(), comments: {}, posts: [] }
  const profile = { id: 'tw-po', url: 'https://dev.azure.com/example/Project/_backlogs/backlog/Team%20A/Features', reason: 'Time Writing', token: 'x'.repeat(52), role: 'time-tracking', creatorEmail: email }
  const { page, context, errors } = await openPage(app, { width: 1440, height: 900, scale: shots ? 2 : undefined, init: ({ connection, mail }) => {
    localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify([connection]))
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', mail)
  }, initArg: { connection: profile, mail: email } })
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
const rowKeys = (page) => page.locator('.pir-table tbody tr[data-row-key]').evaluateAll((rows) => rows.map((row) => row.dataset.rowKey))
const rowOf = (page, id) => page.locator('.pir-table tbody tr').filter({ has: page.locator('td:nth-child(2)', { hasText: new RegExp(`^${id}$`) }) })

test('TC-PIR-68: the Tool Owner sets an Epic’s Product Owner; PI Review filters by it and the meeting names her; the Product Owner (a Team Member) posts the review of a Feature of her Epic assigned to someone else from My PI Review → My Epics', async () => {
  const gh = fakeGitHub({ files: { 'access.json': policy() } })

  // 1. The Tool Owner: Admin → Feature & PI setup → Setup per Epic → DP releases → Product Owner Rita Gomez, Save to Git.
  const owner = await open(gh, 'owner@example.com')
  await navigate(owner.page, 'Feature & PI setup')
  await owner.page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'Setup per Epic' }).click()
  await owner.page.locator('.efe-epics button', { hasText: '#100' }).click()
  const field = owner.page.getByRole('combobox', { name: 'Product Owner' })
  await field.click()
  await field.fill('Rita')
  await owner.page.getByRole('option', { name: /^Rita Gomez/ }).click()
  await owner.page.getByRole('region', { name: 'Unsaved changes' }).getByRole('button', { name: 'Save to Git' }).click()
  await until(() => /"productOwner"/.test(gh.read('epic-setup.json') ?? ''), 'the Epic setup saved to Git')
  const saved = JSON.parse(gh.read('epic-setup.json'))
  assert.deepEqual(saved.epics.find((entry) => entry.epicId === 100).productOwner, { email: 'rita.gomez@example.com', name: 'Rita Gomez' }, 'stored by work email, with the name')
  await owner.page.locator('.efe-epics button', { hasText: '#100' }).filter({ hasText: 'PO Rita Gomez' }).waitFor()
  await shot(owner.page.locator('.efe'), 'epic-po-setup-per-epic-1440-light')

  // 2. PI Review: the Product Owner filter keeps the Features of Rita's Epic; the column names her.
  await navigate(owner.page, 'PI Review')
  await owner.page.locator('.pir-table tr[data-row-key="example/project/204"]').waitFor()
  await toggleFilter(owner.page, 'Product Owner', 'Rita Gomez')
  await owner.page.locator('.pir-table tr[data-row-key="example/project/204"]').waitFor({ state: 'detached' })
  assert.deepEqual(await rowKeys(owner.page), ['example/project/201', 'example/project/202', 'example/project/203'])
  assert.match(await text(owner.page.locator('.pir-table thead')), /Product Owner/i)
  // The meeting file: the Product Owner's name in the per-Epic tables and the Features not reviewed, never her email.
  const [download] = await Promise.all([owner.page.waitForEvent('download'), owner.page.getByRole('button', { name: 'Conduct PI Meeting', exact: true }).click()])
  const html = readFileSync(await download.path(), 'utf8')
  assert.match(html, /Product Owner/)
  assert.match(html, /Rita Gomez/)
  assert.match(html, /aria-label="Features not reviewed"[\s\S]*?Product Owner/, 'the Features not reviewed table has the column')
  assert.doesNotMatch(html, /rita\.gomez@example\.com/, 'never the email')
  // The filter is remembered on the page.
  await navigate(owner.page, 'My PI Review')
  await navigate(owner.page, 'PI Review')
  await owner.page.locator('.pir-table tr[data-row-key="example/project/201"]').waitFor()
  assert.match(await text(owner.page.getByRole('button', { name: /^Product Owner: / })), /Rita Gomez/)
  assert.deepEqual(owner.errors, [])
  await owner.context.close()

  // 3. Rita, a Team Member: My PI Review → My Epics (as Product Owner) lists her Epic's Features, also Ken's.
  const po = await open(gh, 'rita.gomez@example.com')
  await navigate(po.page, 'My PI Review')
  await rowOf(po.page, '201').waitFor()
  assert.equal(await rowOf(po.page, '202').count(), 0, 'assigned to me: not Ken’s')
  await po.page.getByRole('radio', { name: 'My Epics (as Product Owner)' }).click()
  await rowOf(po.page, '202').waitFor()
  assert.equal(await rowOf(po.page, '204').count(), 0, 'not another Epic’s Feature')
  await po.page.locator('.table-panel h2', { hasText: /^Features of my Epics \(as Product Owner\)/ }).waitFor()
  await rowOf(po.page, '202').locator('.pill', { hasText: /^Not reviewed$/ }).waitFor()
  await shot(po.page.locator('main'), 'epic-po-my-epics-1440-light')
  // She posts the review of Ken's Feature 202 (no lead right): the Discussion POST, headed for the PI.
  const write = po.page.getByRole('button', { name: 'Review Feature 202' })
  assert.equal(await write.isDisabled(), false, 'the Product Owner may post')
  await write.click()
  const dialog = po.page.getByRole('dialog', { name: 'Review of Feature #202' })
  await dialog.waitFor()
  await dialog.getByRole('textbox', { name: /^Learnings/ }).fill('Order the fixtures early')
  await dialog.getByRole('textbox', { name: /^Struggles/ }).fill('Supplier delay')
  await dialog.getByRole('radio', { name: 'Offline Review' }).check()
  await dialog.getByRole('button', { name: 'Post to Azure DevOps' }).click()
  await po.page.getByRole('dialog', { name: 'Post the review to Feature #202?' }).getByRole('button', { name: 'Post review to #202' }).click()
  await dialog.waitFor({ state: 'detached' })
  await until(() => po.state.posts.length === 1, 'the Discussion POST')
  assert.equal(po.state.posts[0].id, 202)
  assert.ok(po.state.posts[0].body.text.startsWith('<p>Feature Review for PI 2026.4</p><ul>'), 'the review heading first')
  assert.match(po.state.posts[0].body.text, /Order the fixtures early/)
  await rowOf(po.page, '202').locator('.pill', { hasText: /^Reviewed$/ }).waitFor()
  // A Feature of another Epic stays closed to her on PI Review.
  await navigate(po.page, 'PI Review')
  await po.page.locator('.pir-table tr[data-row-key="example/project/204"]').waitFor()
  assert.equal(await po.page.getByRole('button', { name: 'Review Feature 204' }).isDisabled(), true)
  assert.equal(await po.page.getByRole('button', { name: 'Edit review of Feature 202' }).isDisabled(), false, 'her own review: Edit review…')
  assert.deepEqual(po.errors, [])
  await po.context.close()
})
