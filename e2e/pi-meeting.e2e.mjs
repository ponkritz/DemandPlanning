import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadSample, navigate, openPage, startApp, text } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'
import { buildReviewComment } from '../src/piReviewPost.ts'
import { builtInFormSetup, serializePiFormSetup } from '../src/piReviewSetup.ts'

// Conduct PI Meeting (PIR-40…PIR-47; TC-PIR-46 UAT, TC-PIR-47) against a mocked GitHub (access.json, pi-review-form.json
// with the start date, the meetings written) and a fake dev.azure.com dated around today (the Time Writing fetch, the
// iteration tree, the Discussions). Rita Gomez is the Scrum Master ("PI Review: set up the review form"); Ken Ito is a
// Team Member. Synthetic data only; every step waits for what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })
const shots = process.env.PI_MEETING_SHOTS
const shot = async (target, name) => { if (!shots) return; mkdirSync(shots, { recursive: true }); await target.screenshot({ path: `${shots}/${name}.png` }) }

const dayFromToday = (offset) => { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset)).toISOString().slice(0, 10) }
const start = dayFromToday(-65)
const rita = { displayName: 'Rita Gomez', uniqueName: 'rita.gomez@example.com' }, ken = { displayName: 'Ken Ito', uniqueName: 'ken.ito@example.com' }
const raw = (id, type, title, iterationPath, parent, assignee = rita) => ({ id, rev: 1, fields: { 'System.TeamProject': 'Project', 'System.WorkItemType': type, 'System.Title': title, 'System.State': 'Active', 'System.AreaPath': 'Project\\Quality', 'System.IterationPath': iterationPath, ...(parent ? { 'System.Parent': parent } : {}), 'System.AssignedTo': assignee } })
const world = () => [raw(100, 'Epic', 'DP releases', 'Project'), raw(201, 'Feature', 'Lab rig upgrade', 'Project\\PI 2026.4', 100), raw(202, 'Feature', 'Supplier audit pack', 'Project\\PI 2026.4', 100, ken), raw(203, 'Feature', 'Fixture library refresh', 'Project\\PI 2026.4', 100)]
const span = (from, to) => ({ startDate: `${from}T00:00:00Z`, finishDate: `${to}T00:00:00Z` })
const node = (path, children = [], attributes) => ({ name: path.split('\\').at(-1) || 'Project', path: `\\Project\\Iteration${path ? `\\${path}` : ''}`, ...(attributes ? { attributes } : {}), children })
const tree = () => node('', [
  node('PI 2026.3', [], span(dayFromToday(-160), dayFromToday(-66))),
  node('PI 2026.4', [node('PI 2026.4\\Sprint 1', [], span(start, dayFromToday(-30))), node('PI 2026.4\\Sprint 2', [], span(dayFromToday(-29), dayFromToday(25)))]),
  node('PI 2027.1', [], span(dayFromToday(26), dayFromToday(115))),
])
// A comment that tries to run code: it must stay text on the slides.
const hostile = '<script>window.__ran = 1</script> and "</script><img src=x onerror=window.__ran=2>"'
const review = (id, offset, form, author = rita) => ({ id, text: buildReviewComment({ struggles: 'None', move: 'No', moveReason: '', movePi: 'PI 2027.1', remarks: '', reviewedPi: 'PI 2026.4', ...form }), createdBy: author, createdDate: `${dayFromToday(offset)}T10:00:00Z` })
// 201: to discuss in the meeting; 202: Offline Review, with the hostile text; 203: only a review before the start date.
const comments = () => ({
  201: [review(12, -5, { learnings: 'Calibrate first', struggles: 'Vendor was late', mode: 'Discuss during Meeting', move: 'Yes', moveReason: 'Waiting for the vendor' })],
  202: [review(21, -4, { learnings: hostile, mode: 'Offline Review' }, ken)],
  203: [review(31, -80, { learnings: 'An old learning', mode: 'Offline Review' })],
})
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
    if (found) { state.reads.push(Number(found[1])); const list = state.comments[Number(found[1])] ?? []; return json({ comments: list, count: list.length }) }
    return json({ value: [] })
  }
}
const policy = () => { const value = defaultPolicy(); value.defaultRole = 'Team Member'; value.roles['Team Member'].areas.push('insights'); if (!value.roles['Scrum Master'].areas.includes('insights')) value.roles['Scrum Master'].areas.push('insights'); value.members = { 'rita.gomez@example.com': ['Scrum Master'] }; return serializeAccess(value) }
async function open(gh, email = 'rita.gomez@example.com') {
  const state = { world: world(), comments: comments(), reads: [] }
  const profile = { id: 'tw-pim', url: 'https://dev.azure.com/example/Project/_backlogs/backlog/Team%20A/Features', reason: 'Time Writing', token: 'x'.repeat(52), role: 'time-tracking', creatorEmail: email }
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
// The file on its own, from file:// in a fresh context: every request that is not the file itself refused and recorded.
async function openFile(html, name) {
  const dir = mkdtempSync(join(tmpdir(), 'dph-meeting-'))
  const path = join(dir, name)
  writeFileSync(path, html)
  const context = await app.browser.newContext({ viewport: { width: 1280, height: 800 }, ...(shots ? { deviceScaleFactor: 2 } : {}) })
  const requests = [], problems = []
  await context.route(/^(?!file:)/, (route) => { requests.push(route.request().url()); return route.abort() })
  const file = await context.newPage()
  const slowdown = Number(process.env.E2E_CPU_SLOWDOWN ?? 1)
  if (slowdown > 1) await (await context.newCDPSession(file)).send('Emulation.setCPUThrottlingRate', { rate: slowdown })
  file.on('request', (request) => { if (!request.url().startsWith('file:')) requests.push(request.url()) })
  file.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') problems.push(message.text()) })
  file.on('pageerror', (error) => problems.push(error.message))
  file.on('dialog', (dialog) => { problems.push(`dialog: ${dialog.message()}`); return dialog.dismiss() })
  await file.goto(pathToFileURL(path).href)
  await file.locator('html.js').waitFor({ state: 'attached' })
  return { file, requests, problems, close: async () => { await context.close(); rmSync(dir, { recursive: true, force: true }) } }
}
const current = (file) => file.locator('.slide.current')

test('TC-PIR-46: the Scrum Master conducts the PI meeting — the file is downloaded and kept in Git, opens offline and steps through with the keyboard; the saved meeting is listed with Open and Download', async () => {
  const gh = fakeGitHub({ files: { 'access.json': policy(), 'pi-review-form.json': serializePiFormSetup({ ...builtInFormSetup(), reviewStart: start }) } })
  const { page, context, errors, state } = await open(gh)
  await navigate(page, 'PI Review')
  await page.locator('.pir-table tr[data-row-key="example/project/203"]').waitFor()
  const panel = page.locator('article.table-panel', { has: page.getByRole('heading', { name: 'PI Review Meetings' }) })
  await panel.getByText('No saved PI Review Meeting of PI 2026.4 yet.').waitFor()
  const button = page.getByRole('button', { name: 'Conduct PI Meeting', exact: true })
  assert.equal(await button.isDisabled(), false)
  await shot(page, 'pi-meeting-1-pi-review-button')
  // Build: the Discussions not read yet are read first (all three), then the file is downloaded and saved to Git.
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()])
  const name = download.suggestedFilename()
  assert.match(name, /^PI-Review-Meeting-PI-2026\.4-\d{4}-\d{2}-\d{2}-\d{4}\.html$/)
  assert.deepEqual([...state.reads].sort(), [201, 202, 203])
  const html = readFileSync(await download.path(), 'utf8')
  const path = `pi-review/meetings/PI-2026.4/${name}`
  await until(() => gh.read(path) != null, 'the copy in Git')
  assert.equal(gh.read(path), html, 'the copy in Git is the downloaded file')
  assert.match(gh.writes.find((write) => write.paths.includes(path)).message, /^PI Review Meeting — PI 2026\.4 \(built .+\) \[by Rita Gomez <rita\.gomez@example\.com>\]$/)
  await panel.locator('.notice', { hasText: `Saved to Git as ${path}.` }).waitFor()
  await panel.getByRole('button', { name: `Open ${name}` }).waitFor()
  // The file holds display names only.
  assert.doesNotMatch(html, /@example\.com|https?:/)
  await shot(panel, 'pi-meeting-2-saved-meetings')

  // The file on its own, offline: no request leaves it, nothing in it runs but its navigation.
  const { file, requests, problems, close } = await openFile(html, name)
  assert.match(await file.title(), /^PI Review Meeting — PI 2026\.4 · .+$/)
  const total = await file.locator('.slide').count()
  assert.equal(await text(current(file).locator('h1')), 'PI Review Meeting — PI 2026.4')
  assert.match(await text(current(file)), /Built .+ by Rita Gomez/)
  assert.equal(await text(file.locator('#counter')), `1 / ${total}`)
  if (shots) await shot(file, 'pi-meeting-3-title-slide')
  const titles = []
  for (let at = 0; at < total; at += 1) {
    titles.push(await text(current(file).locator('h1, h2').first()))
    if (at < total - 1) { await file.keyboard.press('ArrowRight'); await file.locator('#counter', { hasText: `${at + 2} / ${total}` }).waitFor() }
  }
  // PIR-51…PIR-57: the executive slides after the Summary (their content: pi-meeting-executive.e2e.mjs, TC-PIR-61).
  const executive = ['Executive summary', 'Review completion per Epic', 'PI-over-PI trend: PI 2026.3 → PI 2026.4', 'Repeat carry-overs', 'Topics for discussion', 'Releases in the PI', 'Hours per Epic', 'Utilization', 'Actual hours (team, by month)', 'Features closed (by sprint)', 'Ad-hoc Features added (by sprint)', 'Long-running Features']
  assert.deepEqual(titles, ['PI Review Meeting — PI 2026.4', 'Summary', ...executive, '#201 Lab rig upgrade', '#202 Supplier audit pack', 'Features not reviewed', 'Learnings', 'Struggles'])
  const rigAt = titles.indexOf('#201 Lab rig upgrade') + 1
  // Home and End, ← back, the overview with O (Escape closes it), a click on a slide in it.
  await file.keyboard.press('Home')
  await file.locator('#counter', { hasText: `1 / ${total}` }).waitFor()
  await file.keyboard.press('End')
  await file.locator('#counter', { hasText: `${total} / ${total}` }).waitFor()
  await file.keyboard.press('ArrowLeft')
  await file.locator('#counter', { hasText: `${total - 1} / ${total}` }).waitFor()
  await file.keyboard.press('o')
  const overview = file.getByRole('navigation', { name: 'Slide overview' })
  await overview.waitFor()
  assert.deepEqual((await overview.locator('button').allInnerTexts()).map((entry) => entry.replace(/^\d+\s*/, '').trim()), titles)
  await file.keyboard.press('Escape')
  await overview.waitFor({ state: 'hidden' })
  await file.keyboard.press('o')
  await overview.getByRole('button', { name: /Lab rig upgrade/ }).click()
  await file.locator('#counter', { hasText: `${rigAt} / ${total}` }).waitFor()
  // Discuss during Meeting: the Feature's facts and its review.
  const rig = (await text(current(file))).toLowerCase()
  for (const part of ['DISCUSS DURING MEETING · 1 OF 1', 'Epic DP releases', 'Assigned to Rita Gomez', 'State Active', 'Learnings Calibrate first', 'Struggles Vendor was late', 'Discuss during Meeting', 'Review by Rita Gomez']) assert.ok(rig.includes(part.toLowerCase()), `${part} in ${rig}`)
  assert.match(rig, /move to next pi yes — waiting for the vendor · to pi 2027\.1/)
  if (shots) await shot(file, 'pi-meeting-4-feature-slide')
  // The hostile comment is text: shown as written, never run.
  await file.keyboard.press('ArrowRight')
  await file.locator('#counter', { hasText: `${rigAt + 1} / ${total}` }).waitFor()
  assert.ok((await text(current(file))).includes(hostile.replace(/\s+/g, ' ')), 'the comment as written')
  assert.equal(await file.evaluate(() => window.__ran), undefined)
  // 203's only review is before the start date: listed as not reviewed.
  await file.keyboard.press('ArrowRight')
  assert.match(await text(current(file)), /203 Fixture library refresh DP releases Rita Gomez No review headed for this PI since/)
  // Print: every slide, one a page.
  await file.emulateMedia({ media: 'print' })
  assert.equal(await file.locator('.slide:visible').count(), total)
  assert.equal(await file.locator('.slide').first().evaluate((element) => getComputedStyle(element).breakAfter), 'page')
  assert.deepEqual(requests, [], 'no request leaves the file')
  assert.deepEqual(problems, [])
  await close()

  // Open from the list: a new tab with the file; Download: the same file again.
  const [tab] = await Promise.all([context.waitForEvent('page'), panel.getByRole('button', { name: `Open ${name}` }).click()])
  await tab.waitForURL(/^blob:/)
  await tab.locator('.slide h1', { hasText: 'PI Review Meeting — PI 2026.4' }).waitFor()
  // In the app's tab the app's own policy applies too, so the file's script does not run there: every slide shows, one
  // after another (to read or print); presenting with the keyboard is from the downloaded file (LIM-170).
  assert.equal(await tab.evaluate(() => document.documentElement.classList.contains('js')), false)
  assert.equal(await tab.locator('.slide:visible').count(), total)
  await tab.close()
  const [again] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: `Download ${name}` }).click()])
  assert.equal(again.suggestedFilename(), name)
  assert.equal(readFileSync(await again.path(), 'utf8'), html)
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-PIR-47: a Team Member does not see Conduct PI Meeting; with the synthetic sample the meeting is downloaded and the page says why it is not saved to Git', async () => {
  const gh = fakeGitHub({ files: { 'access.json': policy() } })
  const member = await open(gh, 'ken.ito@example.com')
  await navigate(member.page, 'PI Review')
  await member.page.locator('.pir-table tr[data-row-key="example/project/201"]').waitFor()
  await member.page.getByRole('heading', { name: 'PI Review Meetings' }).waitFor()
  assert.equal(await member.page.getByRole('button', { name: 'Conduct PI Meeting' }).count(), 0)
  assert.deepEqual(member.errors, [])
  await member.context.close()

  // The synthetic sample (a Tool Owner): downloaded only, the reason on the page and in the job; nothing written to Git.
  const { page, context, errors } = await openPage(app, { roles: 'Tool Owner' })
  await loadSample(page)
  await navigate(page, 'PI Review')
  const panel = page.locator('article.table-panel', { has: page.getByRole('heading', { name: 'PI Review Meetings' }) })
  await panel.getByText('Synthetic sample data is loaded: the meeting is downloaded only, not saved to Git.').waitFor()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Conduct PI Meeting', exact: true }).click()])
  assert.match(download.suggestedFilename(), /^PI-Review-Meeting-PI-.+-\d{4}-\d{2}-\d{2}-\d{4}\.html$/)
  await panel.locator('.notice', { hasText: /^Downloaded PI-Review-Meeting-PI-.+ \(\d+ slides\)\..* Synthetic sample data is loaded: the meeting is downloaded only, not saved to Git\.$/ }).waitFor()
  const html = readFileSync(await download.path(), 'utf8')
  assert.match(html, /<h1>PI Review Meeting — PI /)
  assert.deepEqual(errors, [])
  await context.close()
})
