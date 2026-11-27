import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { navigate, openPage, startApp, text } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'
import { buildReviewComment } from '../src/piReviewPost.ts'
import { builtInFormSetup, serializePiFormSetup } from '../src/piReviewSetup.ts'

// KB-140 (TC-PIR-62, TC-PIR-63): My PI Review reads my Features' Discussions when it opens — also when the shared "PI
// Review starts from" date (PIR-33) arrives from Git while that read is under way, as it does on every start of the app:
// the page starts reading with the date this browser knows, the date in Git (earlier here) comes later and the page reads
// again; a read started with the old date that answers last must not overwrite the new one. Then a Discussion that could
// not be read shows "Not read" with Retry. A mocked GitHub (access.json, pi-review-form.json held until the first read is
// sent) and a fake dev.azure.com (the Time Writing fetch, an iteration tree around today, Discussions whose first answers
// are held until the second read has answered). Synthetic data only; every step waits for what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })
const shots = process.env.MY_PIR_READ_SHOTS
const shot = async (target, name) => { if (!shots) return; mkdirSync(shots, { recursive: true }); await target.screenshot({ path: `${shots}/${name}.png` }) }

const dayFromToday = (offset) => { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset)).toISOString().slice(0, 10) }
// The date in Git: 200 days ago, before this browser's default (21 Sep 2026) and before the review of 201 (150 days ago).
const gitStart = dayFromToday(-200)
const rita = { displayName: 'Rita Gomez', uniqueName: 'rita.gomez@example.com' }
const raw = (id, type, title, iterationPath, parent) => ({ id, rev: 1, fields: { 'System.TeamProject': 'Project', 'System.WorkItemType': type, 'System.Title': title, 'System.State': 'Active', 'System.AreaPath': 'Project\\Quality', 'System.IterationPath': iterationPath, ...(parent ? { 'System.Parent': parent } : {}), 'System.AssignedTo': rita } })
const world = [raw(100, 'Epic', 'DP releases', 'Project'), raw(201, 'Feature', 'Lab rig upgrade', 'Project\\PI 2026.4', 100), raw(202, 'Feature', 'Supplier audit pack', 'Project\\PI 2026.4', 100), raw(203, 'Feature', 'Fixture library refresh', 'Project\\PI 2026.4', 100), raw(204, 'Feature', 'Gauge study', 'Project\\PI 2026.4', 100)]
const span = (from, to) => ({ startDate: `${from}T00:00:00Z`, finishDate: `${to}T00:00:00Z` })
const node = (path, children = [], attributes) => ({ name: path.split('\\').at(-1) || 'Project', path: `\\Project\\Iteration${path ? `\\${path}` : ''}`, ...(attributes ? { attributes } : {}), children })
const tree = node('', [node('PI 2026.4', [node('PI 2026.4\\Sprint 1', [], span(dayFromToday(-210), dayFromToday(-100))), node('PI 2026.4\\Sprint 2', [], span(dayFromToday(-99), dayFromToday(25)))]), node('PI 2027.1', [], span(dayFromToday(26), dayFromToday(115)))])
const review = (id, offset) => ({ id, text: buildReviewComment({ learnings: 'Calibrate first', struggles: 'None', move: 'No', moveReason: '', movePi: 'PI 2027.1', mode: 'Offline Review', remarks: '', reviewedPi: 'PI 2026.4' }), createdBy: rita, createdDate: `${dayFromToday(offset)}T10:00:00Z` })
const policy = () => { const value = defaultPolicy(); value.defaultRole = 'Team Member'; value.members = { 'rita.gomez@example.com': ['Scrum Master'] }; return serializeAccess(value) }
const until = async (check, what) => { for (const end = Date.now() + 60000; Date.now() < end;) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 50)) } assert.fail(`timed out waiting for ${what}`) }

test('TC-PIR-62: My PI Review reads the Discussions again when "PI Review starts from" comes from Git during the read — an older read answering last does not overwrite it; TC-PIR-63: a Discussion not read shows Retry', async () => {
  const gh = fakeGitHub({ files: { 'access.json': policy(), 'pi-review-form.json': serializePiFormSetup({ ...builtInFormSetup(), reviewStart: gitStart }) } })
  // The first round of Discussion reads (with this browser's date) is held until the second round has answered.
  const held = [], answered = new Set(), calls = []
  let releaseForm, fail204 = true
  const formHeld = new Promise((resolve) => { releaseForm = resolve })
  const profile = { id: 'tw-pir', url: 'https://dev.azure.com/example/Project/_backlogs/backlog/Team%20A/Features', reason: 'Time Writing', token: 'x'.repeat(52), role: 'time-tracking', creatorEmail: 'rita.gomez@example.com' }
  const { page, context, errors } = await openPage(app, { width: 1440, height: 900, scale: shots ? 2 : undefined, init: ({ connection }) => {
    localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify([connection]))
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', 'rita.gomez@example.com')
  }, initArg: { connection: profile } })
  await page.emulateMedia({ colorScheme: 'light' })
  await context.route('https://api.github.com/**', async (route) => { if (/pi-review-form\.json/.test(route.request().url())) await formHeld; return gh.route(route) })
  await context.route('https://dev.azure.com/**', async (route) => {
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
    const found = /\/_apis\/wit\/workItems\/(\d+)\/comments$/.exec(path)
    if (found) {
      const id = Number(found[1]), body = { comments: id === 201 ? [review(11, -150)] : [], count: id === 201 ? 1 : 0 }
      calls.push(id)
      // 204: Azure DevOps fails its read until the scenario lets it answer.
      if (id === 204) return fail204 ? json({ message: 'The service is busy.' }, 503) : json(body)
      // The first read of each Feature: sent before the date came from Git, answered last.
      if (calls.filter((entry) => entry === id).length === 1) { releaseForm(); await new Promise((resolve) => held.push(resolve)) }
      answered.add(id)
      return json(body)
    }
    return json({ value: [] })
  })
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, 'My PI Review')
  const row = (id) => page.locator('.pir-table tbody tr').filter({ has: page.locator('td:nth-child(2)', { hasText: new RegExp(`^${id}$`) }) })
  await row('201').waitFor()
  // The date came from Git: the page reads again with it — 201's review (after the Git date, before the browser's) counts.
  await row('201').locator('.pill', { hasText: /^Reviewed$/ }).waitFor()
  await until(async () => [201, 202, 203].every((id) => answered.has(id)), 'the second read answered')
  // Now the first read (with the old date) answers: the page keeps the read with the date in use.
  for (const release of held.splice(0)) release()
  await until(async () => calls.filter((id) => id !== 204).length >= 6 && calls.filter((id) => id === 204).length >= 2, 'the first read answered')
  await page.getByRole('button', { name: 'Edit review of Feature 201' }).waitFor()
  await until(async () => /^1 of 4 reviewed$/.test(await text(page.locator('.data-table-status'))), 'the status line')
  assert.equal(await text(row('201').locator('.pill').first()), 'Reviewed', 'a read with the old date does not overwrite the new one')
  assert.equal(await text(row('202').locator('.pill').first()), 'Not reviewed')

  // TC-PIR-63: 204 could not be read — Not read with Retry; Retry reads it again.
  const retry = page.getByRole('button', { name: 'Read the Discussion of Feature 204 again' })
  await retry.waitFor()
  assert.equal(await text(row('204').locator('.pill').first()), 'Not read')
  assert.match(await retry.getAttribute('title'), /did not return the Discussion \(503\)/)
  await shot(page.locator('.pir-table'), 'my-pi-review-retry-1440-light')
  fail204 = false
  await retry.click()
  await row('204').locator('.pill', { hasText: /^Not reviewed$/ }).waitFor()
  assert.equal(await retry.count(), 0)
  // Back from PI Review: nothing is read again, the rows keep what was read.
  const before = calls.length
  await navigate(page, 'PI Review')
  await page.locator('.pir-table').waitFor()
  await navigate(page, 'My PI Review')
  await row('201').locator('.pill', { hasText: /^Reviewed$/ }).waitFor()
  assert.equal(calls.length, before)
  assert.deepEqual(errors, [])
  await shot(page.locator('.pir-table'), 'my-pi-review-read-1440-light')
  await context.close()
})
