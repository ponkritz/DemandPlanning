import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { navigate, openPage, startApp, text } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'
import { buildReviewComment } from '../src/piReviewPost.ts'
import { builtInFormSetup, parsePiFormSetup, serializePiFormSetup } from '../src/piReviewSetup.ts'
import { serializeCustomStreams } from '../src/customStreams.ts'
import { piMonths } from '../src/piMeetingData.ts'

// The executive PI Review Meeting (PIR-51…PIR-62; TC-PIR-61 UAT) against a mocked GitHub (access.json, the PI Review
// form setup, a custom stream "Platform" over the Tools Epic) and a fake dev.azure.com dated around today (the Time
// Writing fetch with month Tasks, the iteration tree, the Discussions). Rita Gomez is the Scrum Master ("PI Review: set
// up the review form"). Synthetic data only; every step waits for what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })
const shots = process.env.PI_EXEC_SHOTS
const shot = async (target, name) => { if (!shots) return; mkdirSync(shots, { recursive: true }); await target.screenshot({ path: `${shots}/${name}.png` }) }

const dayFromToday = (offset) => { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset)).toISOString().slice(0, 10) }
const start = dayFromToday(-65), end = dayFromToday(25)
const months = piMonths({ start, end })
const monthTitle = (month) => `${new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))} | Time Writing`
const rita = { displayName: 'Rita Gomez', uniqueName: 'rita.gomez@example.com' }, ken = { displayName: 'Ken Ito', uniqueName: 'ken.ito@example.com' }
const raw = (id, type, title, iterationPath, parent, fields = {}) => ({ id, rev: 1, fields: { 'System.TeamProject': 'Project', 'System.WorkItemType': type, 'System.Title': title, 'System.State': 'Active', 'System.AreaPath': 'Project\\Quality', 'System.IterationPath': iterationPath, ...(parent ? { 'System.Parent': parent } : {}), 'System.AssignedTo': rita, 'System.CreatedDate': `${dayFromToday(-80)}T08:00:00Z`, ...fields } })
const pi = 'Project\\PI 2026.4'
// Tools #100: 201 closed in the PI (ad-hoc), 202 carried forward twice in a row, 220 open for 400 days (long-running,
// PIR-85: more than Tools' 12 months), 221 open for 300 days (below Tools' 12 months, above the default 6).
// Audits #110: 211, 212 (carried forward), 213.
const world = () => [
  raw(100, 'Epic', 'Tools', 'Project'), raw(110, 'Epic', 'Audits', 'Project'),
  raw(201, 'Feature', 'Lab rig upgrade', pi, 100, { 'System.State': 'Closed', 'Microsoft.VSTS.Common.ClosedDate': `${dayFromToday(-10)}T09:00:00Z`, 'System.Tags': 'ad-hoc' }),
  raw(202, 'Feature', 'Fixture library refresh', pi, 100),
  raw(211, 'Feature', 'Supplier audit pack', pi, 110, { 'System.AssignedTo': ken }), raw(212, 'Feature', 'Calibration plan', pi, 110), raw(213, 'Feature', 'Audit checklist', pi, 110),
  raw(220, 'Feature', 'Platform 3.0 qualification', 'Project', 100, { 'System.CreatedDate': `${dayFromToday(-400)}T08:00:00Z` }),
  raw(221, 'Feature', 'Legacy rig retirement', 'Project', 100, { 'System.CreatedDate': `${dayFromToday(-300)}T08:00:00Z` }),
  // Time Writing: Tools 40 h a month and 200 h in the PI's last month (a spike), Audits 20 h a month.
  ...months.flatMap((month, at) => [
    raw(900 + at * 2, 'Task', monthTitle(month), 'Project', 202, { 'Microsoft.VSTS.Scheduling.OriginalEstimate': 40, 'Microsoft.VSTS.Scheduling.CompletedWork': at === months.length - 1 ? 200 : 40 }),
    raw(901 + at * 2, 'Task', monthTitle(month), 'Project', 211, { 'System.AssignedTo': ken, 'Microsoft.VSTS.Scheduling.OriginalEstimate': 20, 'Microsoft.VSTS.Scheduling.CompletedWork': 20 }),
  ]),
]
const span = (from, to) => ({ startDate: `${from}T00:00:00Z`, finishDate: `${to}T00:00:00Z` })
const node = (path, children = [], attributes) => ({ name: path.split('\\').at(-1) || 'Project', path: `\\Project\\Iteration${path ? `\\${path}` : ''}`, ...(attributes ? { attributes } : {}), children })
const tree = () => node('', [
  node('PI 2026.3', [], span(dayFromToday(-160), dayFromToday(-66))),
  node('PI 2026.4', [node('PI 2026.4\\Sprint 1', [], span(start, dayFromToday(-30))), node('PI 2026.4\\Sprint 2', [], span(dayFromToday(-29), end))]),
  node('PI 2027.1', [], span(dayFromToday(26), dayFromToday(115))),
])
const review = (id, offset, form, author = rita, forPi = 'PI 2026.4') => ({ id, text: buildReviewComment({ struggles: 'None', move: 'No', moveReason: '', movePi: 'PI 2027.1', remarks: '', reviewedPi: forPi, ...form }), createdBy: author, createdDate: `${dayFromToday(offset)}T10:00:00Z` })
const comments = () => ({
  201: [review(11, -5, { learnings: 'Calibrate first', struggles: 'Vendor was late', mode: 'Discuss during Meeting' }, ken)],
  202: [review(21, -60, { learnings: 'Book early', mode: 'Offline Review', move: 'Yes', moveReason: 'Rig late' }, rita, 'PI 2026.3'), review(22, -4, { learnings: 'Book the rig', mode: 'Offline Review', move: 'Yes', moveReason: 'Rig late again' })],
  212: [review(31, -3, { learnings: 'Plan sooner', mode: 'Offline Review', move: 'Yes', moveReason: 'Waiting for the lab' })],
})
function fakeAzure(state) {
  return (route) => {
    const request = route.request(), url = new URL(request.url()), path = decodeURIComponent(url.pathname)
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/_apis/work/teamsettings/teamfieldvalues')) return json({ field: { referenceName: 'System.AreaPath' }, values: [{ value: 'Project\\Quality', includeChildren: true }] })
    if (path.endsWith('/_apis/work/backlogs/Microsoft.EpicCategory/workItems')) return json({ workItems: state.world.filter((item) => item.fields['System.WorkItemType'] === 'Epic').map((item) => ({ target: { id: item.id } })) })
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
const policy = () => { const value = defaultPolicy(); value.defaultRole = 'Team Member'; if (!value.roles['Scrum Master'].areas.includes('insights')) value.roles['Scrum Master'].areas.push('insights'); value.members = { 'rita.gomez@example.com': ['Scrum Master'] }; return serializeAccess(value) }
async function open(gh, more = []) {
  const state = { world: [...world(), ...more], comments: comments() }
  const profile = { id: 'tw-exec', url: 'https://dev.azure.com/example/Project/_backlogs/backlog/Team%20A/Features', reason: 'Time Writing', token: 'x'.repeat(52), role: 'time-tracking', creatorEmail: 'rita.gomez@example.com' }
  const { page, context, errors } = await openPage(app, { width: 1440, height: 900, scale: shots ? 2 : undefined, init: ({ connection }) => {
    localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify([connection]))
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', 'rita.gomez@example.com')
  }, initArg: { connection: profile } })
  await page.emulateMedia({ colorScheme: 'light' })
  await context.route('https://api.github.com/**', gh.route)
  await context.route('https://dev.azure.com/**', fakeAzure(state))
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, () => guide.getByRole('button', { name: 'Close', exact: true }).last().click())
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors }
}
const until = async (check, what) => { for (const end = Date.now() + 60000; Date.now() < end;) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 50)) } assert.fail(`timed out waiting for ${what}`) }
async function openFile(html, name) {
  const dir = mkdtempSync(join(tmpdir(), 'dph-exec-'))
  const path = join(dir, name)
  writeFileSync(path, html)
  const context = await app.browser.newContext({ viewport: { width: 1280, height: 800 }, ...(shots ? { deviceScaleFactor: 2 } : {}) })
  const requests = [], problems = []
  await context.route(/^(?!file:)/, (route) => { requests.push(route.request().url()); return route.abort() })
  const file = await context.newPage()
  const slowdown = Number(process.env.E2E_CPU_SLOWDOWN ?? 1)
  if (slowdown > 1) await (await context.newCDPSession(file)).send('Emulation.setCPUThrottlingRate', { rate: slowdown })
  file.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') problems.push(message.text()) })
  file.on('pageerror', (error) => problems.push(error.message))
  await file.goto(pathToFileURL(path).href)
  await file.locator('html.js').waitFor({ state: 'attached' })
  return { file, requests, problems, close: async () => { await context.close(); rmSync(dir, { recursive: true, force: true }) } }
}
const current = (file) => file.locator('.slide.current')

test('TC-PIR-61: the Scrum Master sets up the meeting presentation (a low-contrast colour refused, saved to Git) and conducts the meeting — the executive slides in order, the footer with n / N, a table re-sorted by keyboard', async () => {
  const gh = fakeGitHub({ files: { 'access.json': policy(), 'pi-review-form.json': serializePiFormSetup({ ...builtInFormSetup(), reviewStart: start }), 'custom-streams.json': serializeCustomStreams([{ name: 'Platform', rule: 'dp', fuzzy: false, epics: [100] }]) } })
  const { page, context, errors } = await open(gh)
  // The data first (PI Review), so the setup names the Epics.
  await navigate(page, 'PI Review')
  await page.locator('.pir-table tr[data-row-key="example/project/213"]').waitFor()

  // Admin → Feature & PI setup → PI Review form → Meeting presentation.
  await navigate(page, 'Feature & PI setup')
  const tab = page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'PI Review form' })
  if (await tab.count()) await tab.click()
  const panel = page.locator('article.pir-meeting-setup')
  await panel.getByText('None ticked (the Releases slide says “No release-based streams chosen”)').waitFor()
  await panel.getByRole('button', { name: 'Edit meeting presentation…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit the meeting presentation' })
  await dialog.getByLabel('Footer text', { exact: true }).fill('Confidential · {team} · PI {PI}')
  await dialog.getByLabel('Team name', { exact: true }).fill('Quality')
  await dialog.getByLabel('Title slide', { exact: true }).selectOption('dark')
  await dialog.getByLabel('Order Epics by').selectOption('features')
  await dialog.getByRole('checkbox', { name: 'Platform' }).check()
  // PIR-85: the limits are months — the default row (6) and Tools' own 12.
  const limits = dialog.getByRole('table', { name: 'Long-running after (months) per Epic' })
  assert.equal(await limits.getByLabel('Long-running after, default').inputValue(), '6')
  await limits.getByLabel('Long-running after, Tools (#100)').fill('12')
  // WCAG AA: a light orange is refused with the reason; Save to Git does not save it.
  await dialog.getByLabel('Accent colour', { exact: true }).fill('#f2a600')
  await dialog.locator('.notice', { hasText: /contrast with white is 2\.\d\d:1, below the 4\.5:1 of WCAG AA/ }).waitFor()
  await dialog.getByRole('button', { name: 'Save to Git' }).click()
  await dialog.getByText('Fix the problems above first.').waitFor()
  await dialog.getByLabel('Accent colour', { exact: true }).fill('#1b5e20')
  await until(async () => (await dialog.locator('.notice').count()) === 0, 'the contrast notice to go')
  await dialog.getByRole('img', { name: 'Title slide preview' }).getByText('Confidential · Quality · PI 26.4').waitFor()
  await shot(dialog, 'pi-exec-6-settings-editor')
  await dialog.getByRole('button', { name: 'Save to Git' }).click()
  await dialog.waitFor({ state: 'hidden' })
  await until(() => /"schema": 2/.test(gh.read('pi-review-form.json') ?? ''), 'the settings in Git')
  const saved = parsePiFormSetup(gh.read('pi-review-form.json')).meeting
  assert.deepEqual({ ...saved }, { ...saved, streams: ['Platform'], longRunningMonths: { 100: 12 }, epicOrder: 'features', footer: 'Confidential · {team} · PI {PI}', team: 'Quality', accent: '#1b5e20', titleTheme: 'dark' })
  await panel.getByText('Number of Features (most first)').waitFor()
  await panel.getByText('6 months by default; Tools (#100): 12 months').waitFor()
  await shot(panel, 'pi-exec-5-settings-panel')

  // Conduct the meeting.
  await navigate(page, 'PI Review')
  await page.locator('.pir-table tr[data-row-key="example/project/213"]').waitFor()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Conduct PI Meeting', exact: true }).click()])
  const name = download.suggestedFilename()
  const html = readFileSync(await download.path(), 'utf8')
  assert.doesNotMatch(html, /@example\.com|https?:/)
  const { file, requests, problems, close } = await openFile(html, name)
  const total = await file.locator('.slide').count()
  const titles = []
  for (let at = 0; at < total; at += 1) titles.push(await text(file.locator('.slide').nth(at).locator('h1, h2').first()))
  assert.deepEqual(titles.slice(0, 15), [
    'PI Review Meeting — PI 2026.4', 'Summary', 'Summary by Epic', 'Executive summary', 'Review completion per Epic', 'PI-over-PI trend: PI 2026.3 → PI 2026.4',
    'Repeat carry-overs', 'Topics for discussion', 'Releases in the PI', 'Hours per Epic', 'Utilization',
    'Actual hours (team, by month)', 'Features closed (by sprint)', 'Ad-hoc Features added (by sprint)', 'Long-running Features',
  ])
  assert.equal(titles[15], '#201 Lab rig upgrade', 'then Discuss during Meeting')
  // The title slide: dark, the accent colour; the footer text and n / N on every slide.
  assert.match(await current(file).getAttribute('class'), /slide-title dark/)
  for (let at = 0; at < total; at += 1) {
    const footer = file.locator('.slide').nth(at).locator('footer')
    assert.equal(await text(footer.locator('.footer-text')), 'Confidential · Quality · PI 2026.4')
    assert.equal(await text(footer.locator('.slide-number')), `${at + 1} / ${total}`)
  }
  await shot(file, 'pi-exec-1-title-slide')
  const go = async (title) => { const at = titles.indexOf(title); await file.keyboard.press('Home'); await file.locator('#counter', { hasText: `1 / ${total}` }).waitFor(); for (let step = 0; step < at; step += 1) await file.keyboard.press('ArrowRight'); await file.locator('#counter', { hasText: `${at + 1} / ${total}` }).waitFor() }
  // Executive summary: Audits (3 Features) before Tools (2) — Order Epics by Number of Features.
  await go('Executive summary')
  const rows = current(file).locator('table.sortable tbody tr td:first-child')
  assert.deepEqual(await rows.allInnerTexts(), ['Audits', 'Tools'])
  assert.match(await text(current(file).locator('.tiles')), /Closed in the PI 1 .*Carried forward 2 2 to PI 2027\.1.*Ad-hoc Features covered 1/)
  await shot(file, 'pi-exec-2-executive-summary')
  // Re-sort by keyboard: Tab to the Epic ID header, Enter sorts ascending, Enter again descending (aria-sort follows).
  const header = current(file).locator('table.sortable th', { hasText: 'Epic ID' })
  await header.locator('button').focus()
  await file.keyboard.press('Enter')
  await until(async () => (await header.getAttribute('aria-sort')) === 'ascending', 'ascending')
  assert.deepEqual(await rows.allInnerTexts(), ['Tools', 'Audits'])
  await file.keyboard.press('Enter')
  await until(async () => (await header.getAttribute('aria-sort')) === 'descending', 'descending')
  assert.deepEqual(await rows.allInnerTexts(), ['Audits', 'Tools'])
  assert.equal(await text(file.locator('#counter')), `${titles.indexOf('Executive summary') + 1} / ${total}`, 'Enter on a header does not change the slide')
  // Review completion: the Not reviewed number opens the list.
  await go('Review completion per Epic')
  await current(file).locator('button.goto').first().click()
  await file.locator('.slide.current h2', { hasText: 'Features not reviewed' }).waitFor()
  // Repeat carry-overs: 202, two PIs in a row.
  await go('Repeat carry-overs')
  assert.match(await text(current(file)), /202 Fixture library refresh Tools 2 PI 2026\.3 → PI 2026\.4/)
  // Topics for discussion: Ken Ito raised them.
  await go('Topics for discussion')
  assert.match(await text(current(file)), /#201 Lab rig upgrade Learning Calibrate first Ken Ito/)
  // Releases of Platform: no Release Details data, said so.
  await go('Releases in the PI')
  assert.match(await text(current(file)), /Platform — No Release Details data/)
  // Hours per Epic and Utilization from the Time Writing month Tasks.
  await go('Hours per Epic')
  const tools = 40 * (months.length - 1) + 200, audits = 20 * months.length
  assert.match(await text(current(file)), new RegExp(`Tools #100 ${tools} h ${Math.round(tools / (tools + audits) * 1000) / 10} %`))
  await shot(file, 'pi-exec-3-hours')
  await go('Utilization')
  assert.match(await text(current(file)), /Team utilization \d+(\.\d)? %/)
  // The hours trend: the last month is a spike, labelled and listed with its top contributors.
  await go('Actual hours (team, by month)')
  assert.match(await text(current(file)), /Rule: a spike is a point above 1\.5 × the PI’s average/)
  assert.match(await text(current(file)), /Tools 200 h, Audits 20 h/)
  assert.equal(await current(file).locator('svg circle[r="7"]').count(), 1)
  await shot(file, 'pi-exec-4-trends-spike')
  // Long-running (PIR-85): 220 (open for 400 days; Tools' limit 12 months), not 221 (300 days).
  await go('Long-running Features')
  assert.match(await text(current(file)), /Not Closed \/ Done and created more than N months ago \(N per Epic, set in PI setup\)/)
  assert.match(await text(current(file)), /220 Platform 3\.0 qualification Tools Active .* 12 months /)
  assert.doesNotMatch(await text(current(file)), /Legacy rig retirement/)
  await shot(file, 'pi-exec-7-long-running')
  assert.deepEqual(requests, [], 'no request leaves the file')
  assert.deepEqual(problems, [])
  await close()
  assert.deepEqual(errors, [])
  await context.close()
})

// PIR-86…PIR-90 (TC-PIR-92 UAT): the presenting teams. Synthetic teams "Quality Tools (QTL)" (Tools #100) and "Platform
// Services (PLS)" (Audits #110); Plans #120 with Feature 231 belongs to no team (Other Features). Git starts with a
// malformed team (no Epics): it is left out with a visible note, and the save writes only the teams shown.
test('TC-PIR-92: the Scrum Master sets up the presenting teams (an Epic of another team cannot be ticked, the order changed, Save to Git) and conducts the meeting — the Agenda after the title, one section per team in order, Other Features last', async () => {
  const form = { ...JSON.parse(serializePiFormSetup({ ...builtInFormSetup(), reviewStart: start })), schema: 2, meeting: { teams: [{ name: 'Lab Systems', epics: [] }] } }
  const gh = fakeGitHub({ files: { 'access.json': policy(), 'pi-review-form.json': `${JSON.stringify(form, null, 2)}\n` } })
  const { page, context, errors } = await open(gh, [raw(120, 'Epic', 'Plans', 'Project'), raw(231, 'Feature', 'Capacity plan', pi, 120)])
  await navigate(page, 'PI Review')
  await page.locator('.pir-table tr[data-row-key="example/project/231"]').waitFor()

  // Admin → Feature & PI setup → PI Review form → Meeting presentation: the malformed team is named in a note.
  await navigate(page, 'Feature & PI setup')
  const tab = page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'PI Review form' })
  if (await tab.count()) await tab.click()
  const panel = page.locator('article.pir-meeting-setup')
  await panel.locator('.notice', { hasText: 'Presenting team 1: Lab Systems: choose at least one Epic — left out.' }).waitFor()
  await panel.getByText('None (no Agenda slide; the Features by Epic, as before)').waitFor()
  await panel.getByRole('button', { name: 'Edit presenting teams…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit the presenting teams' })
  assert.equal(await dialog.getByLabel('Agenda sentence', { exact: true }).inputValue(), 'The following teams will present the Features they have been working on during PI {PI}')
  await dialog.getByText('No presenting teams: the meeting has no Agenda slide').waitFor()
  // ＋ Add team… twice; the second team's picker refuses Audits (in Platform Services) with the reason.
  const addTeam = async (name, short, epic, refused) => {
    await dialog.getByRole('button', { name: '＋ Add team…' }).click()
    const one = page.getByRole('dialog', { name: 'Add a presenting team' })
    await one.getByLabel('Name', { exact: true }).fill(name)
    await one.getByLabel('Short name', { exact: true }).fill(short)
    await one.getByRole('button', { name: 'Epics: None' }).click()
    if (refused) {
      const taken = one.getByRole('checkbox', { name: new RegExp(`^${refused.epic.replace(/[()#]/g, '\\$&')}`) })
      assert.equal(await taken.isDisabled(), true)
      await one.locator('.multi-option-disabled', { hasText: refused.why }).waitFor()
    }
    await one.getByRole('checkbox', { name: epic }).check()
    await one.getByRole('button', { name: new RegExp(`^Epics: ${epic.replace(/[()#]/g, '\\$&')}`) }).click()
    await one.getByRole('button', { name: 'Add team', exact: true }).click()
    await one.waitFor({ state: 'hidden' })
  }
  await addTeam('Platform Services', 'PLS', 'Audits (#110)')
  await addTeam('Quality Tools', 'QTL', 'Tools (#100)', { epic: 'Audits (#110)', why: 'in Platform Services (PLS) (an Epic belongs to one team only)' })
  const table = dialog.getByRole('table', { name: 'Presenting teams' })
  const names = () => table.locator('tbody tr td:nth-child(2)').allInnerTexts()
  assert.deepEqual(await names(), ['Platform Services', 'Quality Tools'])
  // ↑ moves Quality Tools first.
  await table.getByRole('button', { name: 'Move Quality Tools up' }).click()
  await until(async () => (await names()).join('|') === 'Quality Tools|Platform Services', 'the new order')
  await shot(dialog, 'pi-teams-1-editor')
  await dialog.getByRole('button', { name: 'Save to Git' }).click()
  await dialog.waitFor({ state: 'hidden' })
  await until(() => /Quality Tools/.test(gh.read('pi-review-form.json') ?? ''), 'the teams in Git')
  const saved = JSON.parse(gh.read('pi-review-form.json'))
  assert.equal(saved.schema, 2)
  assert.deepEqual(saved.meeting.teams, [{ name: 'Quality Tools', short: 'QTL', epics: [100] }, { name: 'Platform Services', short: 'PLS', epics: [110] }], 'the malformed team is gone')
  await panel.getByText('1. Quality Tools (QTL) (1 Epic) · 2. Platform Services (PLS) (1 Epic)').waitFor()
  assert.equal(await panel.locator('.notice', { hasText: 'Presenting team 1' }).count(), 0)
  await shot(panel, 'pi-teams-2-panel')

  // Conduct the meeting.
  await navigate(page, 'PI Review')
  await page.locator('.pir-table tr[data-row-key="example/project/231"]').waitFor()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Conduct PI Meeting', exact: true }).click()])
  const html = readFileSync(await download.path(), 'utf8')
  const { file, requests, problems, close } = await openFile(html, download.suggestedFilename())
  const total = await file.locator('.slide').count()
  const titles = []
  for (let at = 0; at < total; at += 1) titles.push(await text(file.locator('.slide').nth(at).locator('h1, h2').first()))
  assert.deepEqual(titles.slice(0, 3), ['PI Review Meeting — PI 2026.4', 'Agenda', 'Summary'])
  const from = titles.indexOf('Long-running Features')
  assert.ok(from > 2, 'the executive slides before the team sections')
  assert.deepEqual(titles.slice(from + 1), [
    'Quality Tools', '#201 Lab rig upgrade', '#202 Fixture library refresh',
    'Platform Services', '#212 Calibration plan',
    'Other Features',
    'Features not reviewed', 'Learnings', 'Struggles',
  ])
  // The Agenda: the sentence for this PI and the teams in their order, "Name (SHORT)".
  await file.keyboard.press('ArrowRight')
  await file.locator('#counter', { hasText: `2 / ${total}` }).waitFor()
  assert.equal(await text(current(file).locator('p.big')), 'The following teams will present the Features they have been working on during PI 2026.4')
  assert.deepEqual(await current(file).locator('ul.agenda li').allInnerTexts(), ['Quality Tools (QTL)', 'Platform Services (PLS)'])
  await shot(file, 'pi-teams-3-agenda')
  // A divider: the team, its short name, its Features in the PI; the team's slides name it in the eyebrow.
  const go = async (title) => { const at = titles.indexOf(title); await file.keyboard.press('Home'); await file.locator('#counter', { hasText: `1 / ${total}` }).waitFor(); for (let step = 0; step < at; step += 1) await file.keyboard.press('ArrowRight'); await file.locator('#counter', { hasText: `${at + 1} / ${total}` }).waitFor() }
  await go('Platform Services')
  assert.equal(await text(current(file).locator('.eyebrow')), 'PRESENTING TEAM · 2 OF 2')
  assert.match(await text(current(file)), /PLS.*Features in the PI 3 Reviewed 1 2 not reviewed — in “Features not reviewed”.*Epics: Audits \(#110\)/)
  await shot(file, 'pi-teams-4-divider')
  await go('#201 Lab rig upgrade')
  assert.equal(await text(current(file).locator('.eyebrow')), 'QTL · DISCUSS DURING MEETING · 1 OF 1')
  await go('Other Features')
  assert.match(await text(current(file)), /Features in the PI 1 Reviewed 0 1 not reviewed/)
  assert.deepEqual(requests, [], 'no request leaves the file')
  assert.deepEqual(problems, [])
  await close()
  assert.deepEqual(errors, [])
  await context.close()
})
