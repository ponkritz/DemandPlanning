import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { cachedRoles, navigate, openPage, startApp, text } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'

// Create Feature from one DP release follows the DP bulk rules (DPF-17; TC-DPF-18, UAT) and a User Story's Sprint
// comes from its "Sprint from" milestone date (EPS-10; TC-EPS-09, UAT). Against a mocked GitHub, a mocked on-prem DP
// query (azure.example.com, read only) and a mocked dev.azure.com that records every create, with Sprints dated around
// today (a past one, the current one, a future one), so the case holds whenever it runs. A Tool Owner sets "Sprint
// from PRD" on a story in Setup per Epic (saved to Git; the other story already has "Sprint from SFV"); then the same
// DP release is created once by DP Create Features and once by Create Feature on its row (each in a fresh project),
// and the create bodies are compared: title, parent, Start and Target dates, assignee, Time Writing months and each
// story's Iteration Path (SFV in the future Sprint holding the DRfH Date; PRD, whose date is in a past Sprint, in the
// default Sprint with a note). Synthetic data only; every step waits for what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const shots = process.env.E2E_SHOTS
const shot = async (page, name, locator) => { if (!shots) return; mkdirSync(shots, { recursive: true }); await (locator ?? page).screenshot({ path: `${shots}/${name}.png` }) }

const now = new Date()
const at = (days) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10)
const day = (months, date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, date)).toISOString().slice(0, 10)
const label = (months) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayText = (iso) => `${Number(iso.slice(8, 10))} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
// Viewer 4.2: RPE next month, DT three months on, SFV in the future Sprint, PRD in the past Sprint.
const viewer = { id: 601, name: 'Viewer', release: '4.2', program: 'Imaging', start: day(1, 1), target: day(3, 15), sfv: at(20), prd: at(-40) }
const releases = [viewer, { id: 602, name: 'Lab', release: '3.0', program: 'Care', start: day(1, 2), sfv: at(20), prd: at(-40) }]
const dpRaw = (entry) => ({ id: entry.id, rev: 1, fields: { 'System.TeamProject': 'DP', 'System.WorkItemType': 'Release', 'System.Title': `${entry.name} ${entry.release}`, 'System.State': 'Active', 'System.AreaPath': 'DP', 'System.IterationPath': 'DP', 'Custom.PsName': entry.name, 'Custom.Release': entry.release, 'Custom.SourceProgram': entry.program, 'Custom.DRPEDate': `${entry.start}T00:00:00Z`, 'Custom.DRPCDate': `${entry.prd}T00:00:00Z`, 'Custom.DRfHDate': `${entry.sfv}T00:00:00Z`, ...(entry.target ? { 'Custom.DDTDate': `${entry.target}T00:00:00Z` } : {}), 'Custom.DDTStatus': 'Planned' } })
const dpQuery = 'SELECT [System.Id], [System.Title], [Custom.PsName], [Custom.Release], [Custom.SourceProgram], [Custom.DRPEDate], [Custom.DRPCDate], [Custom.DRfHDate], [Custom.DDTDate], [Custom.DDTStatus] FROM WorkItems WHERE [System.WorkItemType] = \'Release\''
const dpFields = [['System.Id', 'ID'], ['System.Title', 'Title'], ['Custom.PsName', 'PsName'], ['Custom.Release', 'Release'], ['Custom.SourceProgram', 'SourceProgram'], ['Custom.DRPEDate', 'DRPEDate'], ['Custom.DRPCDate', 'DRPCDate'], ['Custom.DRfHDate', 'DRfHDate'], ['Custom.DDTDate', 'DDTDate'], ['Custom.DDTStatus', 'DDTStatus']]
function fakeDp(writes) {
  return (route) => {
    const request = route.request(), path = decodeURIComponent(new URL(request.url()).pathname)
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/_apis/wit/fields')) return json({ value: dpFields.map(([referenceName, name]) => ({ referenceName, name })) })
    if (path.endsWith('/_apis/wit/wiql')) { const after = Number(/\[System\.Id\] > (\d+)/.exec(JSON.parse(request.postData() ?? '{}').query ?? '')?.[1] ?? 0); return json({ workItems: releases.filter((entry) => entry.id > after).map((entry) => ({ id: entry.id })) }) }
    if (path.endsWith('/_apis/wit/workitemsbatch')) { const ids = JSON.parse(request.postData() ?? '{}').ids ?? []; return json({ value: releases.filter((entry) => ids.includes(entry.id)).map(dpRaw) }) }
    if (request.method() !== 'GET') writes.push(`${request.method()} ${path}`)
    return json({ value: [] })
  }
}

// dev.azure.com: Epic #100 (the DP bulk Epic) and Sprints 1 (past), 2 (current) and 3 (future, holding the DRfH Date).
const sprints = [['Sprint 1', at(-50), at(-11)], ['Sprint 2', at(-10), at(10)], ['Sprint 3', at(11), at(60)]]
const twRaw = (id, type, title, parent) => ({ id, rev: 1, fields: { 'System.TeamProject': 'Quality', 'System.WorkItemType': type, 'System.Title': title, 'System.State': 'Active', 'System.AreaPath': 'Quality\\DP', 'System.IterationPath': 'Quality\\PI 1', ...(parent ? { 'System.Parent': parent } : {}), 'System.AssignedTo': { displayName: 'Rita Gomez', uniqueName: 'rita.gomez@example.com' } } })
const node = (path, children = [], attributes) => ({ name: path.split('\\').at(-1) || 'Quality', path: `\\Quality\\Iteration${path ? `\\${path}` : ''}`, ...(attributes ? { attributes } : {}), children })
function fakeAzure() {
  const world = [twRaw(100, 'Epic', 'DP releases'), twRaw(200, 'Feature', 'Team admin', 100), twRaw(201, 'User Story', 'Team admin - Time Writing', 200), twRaw(202, 'Task', 'Old month | Team admin', 201)]
  const creates = []
  let next = 1000
  const route = (route) => {
    const request = route.request(), url = new URL(request.url()), path = decodeURIComponent(url.pathname)
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/_apis/work/teamsettings/teamfieldvalues')) return json({ field: { referenceName: 'System.AreaPath' }, values: [{ value: 'Quality\\DP', includeChildren: true }] })
    if (path.endsWith('/_apis/work/backlogs/Microsoft.EpicCategory/workItems')) return json({ workItems: [{ target: { id: 100 } }] })
    if (path.endsWith('/_apis/wit/workitemsbatch')) { const ids = JSON.parse(request.postData() ?? '{}').ids ?? []; return json({ value: world.filter((item) => ids.includes(item.id)) }) }
    if (path.endsWith('/_apis/wit/wiql')) {
      const query = JSON.parse(request.postData() ?? '{}').query ?? ''
      const one = /\[System\.Parent\] = (\d+)/.exec(query), many = /\[System\.Parent\] IN \(([\d,\s]+)\)/.exec(query)
      const parents = one ? [Number(one[1])] : (many?.[1] ?? '').split(',').map(Number), after = Number(/\[System\.Id\] > (\d+)/.exec(query)?.[1] ?? 0)
      return json({ workItems: world.filter((item) => parents.includes(item.fields['System.Parent']) && item.id > after).map((item) => ({ id: item.id })) })
    }
    if (path.endsWith('/_apis/work/teamsettings/iterations')) return json({ value: sprints.map(([name, start, finish]) => ({ name, path: `Quality\\PI 1\\${name}`, attributes: { startDate: `${start}T00:00:00Z`, finishDate: `${finish}T00:00:00Z` } })) })
    if (path.endsWith('/_apis/wit/classificationnodes/iterations')) return json(node('', [node('PI 1', sprints.map(([name, start, finish]) => node(`PI 1\\${name}`, [], { startDate: `${start}T00:00:00Z`, finishDate: `${finish}T00:00:00Z` })))]))
    const create = /\/_apis\/wit\/workitems\/\$(.+)$/.exec(path)
    if (create && request.method() === 'POST') {
      const type = create[1], patch = JSON.parse(request.postData() ?? '[]')
      const fields = Object.fromEntries(patch.filter((entry) => entry.path.startsWith('/fields/')).map((entry) => [entry.path.slice(8), entry.value]))
      const parent = Number(/\/workItems\/(\d+)$/.exec(patch.find((entry) => entry.path === '/relations/-')?.value?.url ?? '')?.[1] ?? 0)
      if (url.searchParams.get('validateOnly') === 'true') return json({ id: 0, fields: {} })
      const item = { id: ++next, rev: 1, fields: { 'System.TeamProject': 'Quality', 'System.WorkItemType': type, 'System.State': 'New', 'System.IterationPath': 'Quality', ...fields, 'System.Parent': parent, 'System.AssignedTo': { displayName: fields['System.AssignedTo'], uniqueName: fields['System.AssignedTo'] } } }
      world.push(item); creates.push({ type, fields, parent, id: item.id })
      return json(item)
    }
    const update = /\/_apis\/wit\/workitems\/(\d+)$/.exec(path)
    if (update && request.method() === 'PATCH') { const item = world.find((entry) => entry.id === Number(update[1])); for (const entry of JSON.parse(request.postData() ?? '[]')) if (entry.path?.startsWith('/fields/')) item.fields[entry.path.slice(8)] = entry.value; return json(item) }
    return json({ value: [] })
  }
  return { route, creates }
}

const featureSetup = { schema: 1, kind: 'feature-setup', epics: [{ epicId: 100, epicTitle: 'DP releases', featureDoD: 'DT is finished.', stories: [{ title: 'SFV : Review', description: '', sprintFrom: 'DRfHDate' }, { title: 'PRD : Review', description: '' }], task: { title: '{month} | {feature}', description: '', assignedTo: '', areaPath: '', iterationPath: '' } }] }
const profiles = [
  { id: 'tw', url: 'https://dev.azure.com/example/Quality/_backlogs/backlog/Team%20A/Epics', token: 'x'.repeat(52), reason: 'QMS-0025', role: 'time-tracking', showInMenu: true, creatorEmail: 'lead@example.com' },
  { id: 'dp', url: 'https://azure.example.com/tfs/Collection/DP', baseUrl: 'https://azure.example.com/tfs', token: 'e2e-token-0123456789', reason: 'DP', viewName: 'DP', role: 'release-source', query: dpQuery, showInMenu: true },
]

async function openApp(gh) {
  const azure = fakeAzure(), dpWrites = []
  const opened = await openPage(app, { width: 1440, height: 900, scale: shots ? 2 : undefined, roles: true, init: ({ list }) => {
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', 'lead@example.com')
    localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify(list))
    localStorage.setItem('demand-planning-bulk-epics-v1', JSON.stringify({ DP: 100 }))
  }, initArg: { list: profiles } })
  await opened.context.route('https://api.github.com/**', gh.route)
  await opened.context.route('https://dev.azure.com/**', azure.route)
  await opened.context.route('https://azure.example.com/**', fakeDp(dpWrites))
  for (const title of ['Get started', 'Could not fetch from Azure DevOps']) {
    const dialog = opened.page.getByRole('dialog').filter({ hasText: title })
    await opened.page.addLocatorHandler(dialog, () => dialog.getByRole('button', { name: 'Close', exact: true }).last().click())
  }
  await opened.page.reload()
  await opened.page.locator('.sidebar nav').waitFor()
  return { ...opened, azure, dpWrites }
}

// Release Details → DP: fetch, All months, the Releases table.
async function openDp(page) {
  await page.locator('.sidebar nav button').filter({ hasText: /(^|[^A-Za-z])DP$/ }).first().click()
  await page.locator('.page-loading').waitFor({ state: 'detached' })
  await page.getByRole('button', { name: /^(Fetch|Refresh) from Azure$/ }).first().click()
  await page.getByRole('radiogroup', { name: 'Show' }).getByRole('radio', { name: 'All months' }).click()
  const table = page.locator('.panel', { has: page.locator('h2', { hasText: /^Releases/ }) }).first()
  await table.locator('tbody tr', { hasText: 'Viewer' }).first().waitFor()
  return table
}
async function finished(page, pattern) {
  const jobs = page.locator('.jobs-button')
  await jobs.waitFor()
  await jobs.click()
  const panel = page.getByRole('dialog', { name: 'Background jobs' })
  await panel.getByText(pattern).first().waitFor()
  return text(panel)
}
// What a run created for the Viewer release: the Feature's fields, its Task months and each story's Iteration Path.
function made(creates) {
  const feature = creates.find((entry) => entry.type === 'Feature')
  const stories = creates.filter((entry) => entry.type === 'User Story' && entry.parent === feature.id && !entry.fields['System.Title'].endsWith('Time Writing'))
  const f = feature.fields
  return {
    title: f['System.Title'], parent: feature.parent, start: f['Microsoft.VSTS.Scheduling.StartDate'], target: f['Microsoft.VSTS.Scheduling.TargetDate'], assignedTo: f['System.AssignedTo'], iteration: f['System.IterationPath'],
    months: creates.filter((entry) => entry.type === 'Task').map((entry) => entry.fields['System.Title'].split(' | ')[0]),
    stories: Object.fromEntries(stories.map((entry) => [entry.fields['System.Title'], entry.fields['System.IterationPath']])),
  }
}

test('TC-DPF-18: Create Feature on a DP release row starts like DP Create Features — the DP bulk Epic, Start = DRPE Date, Target = DDT Date, the optional month Tasks — and creates the same Feature as bulk; TC-EPS-09: each User Story in the Sprint of its “Sprint from” milestone date, else the default Sprint with a note', async () => {
  const gh = fakeGitHub({ files: { 'access.json': cachedRoles('Tool Owner'), 'feature-setup.json': `${JSON.stringify(featureSetup, null, 2)}\n` } })
  const first = await openApp(gh)
  let page = first.page

  // (1) Setup per Epic: story 2 gets "Sprint from" PRD, saved to Git; story 1 keeps SFV.
  await navigate(page, 'Epic & Feature setup')
  await page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'Setup per Epic' }).click()
  await page.locator('.efe-epics button', { hasText: '#100' }).click()
  const sfvPick = page.getByLabel('User Story 1 Sprint from')
  await sfvPick.waitFor()
  assert.equal(await sfvPick.inputValue(), 'DRfHDate')
  const prdPick = page.getByLabel('User Story 2 Sprint from')
  assert.equal(await prdPick.inputValue(), '', 'an older story: None')
  assert.deepEqual((await prdPick.locator('option').allTextContents()).slice(0, 5), ['None — the Sprint chosen', 'DRPE Date (RPE)', 'DRPC Date (PRD)', 'DRfH Date (SFV)', 'DDT Date (DT)'])
  await prdPick.selectOption('DRPCDate')
  await shot(page, 'sprint-from-setup', page.locator('.efe-section', { has: prdPick }))
  await page.getByRole('region', { name: 'Unsaved changes' }).getByRole('button', { name: 'Save to Git' }).click()
  await page.locator('.efe-main .notice', { hasText: 'Saved to Git.' }).waitFor()
  assert.deepEqual(JSON.parse(gh.read('feature-setup.json')).epics[0].stories.map((story) => story.sprintFrom), ['DRfHDate', 'DRPCDate'], 'saved with the stories')

  // (2) Bulk: the Viewer release, the box ticked, the QE picked (no QE page in this test).
  let table = await openDp(page)
  await table.getByRole('checkbox', { name: 'Select Viewer 4.2' }).check()
  await table.getByRole('button', { name: 'Create Features (1)' }).click()
  const bulk = page.getByRole('dialog').filter({ hasText: 'Create Features for 1 DP release' })
  await bulk.locator('tbody tr').first().waitFor()
  await bulk.getByRole('checkbox', { name: 'Create Time Writing month Tasks from the Start date to the Target date' }).check()
  await bulk.locator('tbody tr').first().getByRole('combobox').last().selectOption('rita.gomez@example.com')
  const stories = bulk.locator('tbody tr').first().locator('td').nth(3)
  await stories.locator('.dp-story-sprints', { hasText: 'SFV → Sprint 3' }).waitFor()
  assert.match(await text(stories), new RegExp(`SFV → Sprint 3 · PRD → default Sprint.*PRD ${dayText(viewer.prd)} is in a past Sprint — default Sprint`))
  await shot(page, 'dp-bulk-story-sprints', bulk)
  await bulk.getByRole('button', { name: 'Create 1 Feature' }).and(bulk.locator(':enabled')).click()
  await finished(page, '1 of 1 Features created')
  const byBulk = made(first.azure.creates)
  assert.deepEqual(first.dpWrites, [])
  assert.deepEqual(first.errors, [])
  await first.context.close()

  // (3) The single form on the Viewer row of a fresh project: prefilled as bulk.
  const second = await openApp(gh)
  page = second.page
  table = await openDp(page)
  await table.locator('tbody tr', { hasText: 'Viewer' }).first().getByRole('button', { name: 'Create Feature', exact: true }).click()
  const form = page.getByRole('dialog').filter({ hasText: 'New Feature' })
  const start = form.getByLabel('Start date', { exact: true }), target = form.getByLabel('Target date', { exact: true })
  await start.waitFor()
  assert.equal(await form.getByLabel('Parent Epic').inputValue(), (await form.getByLabel('Parent Epic').locator('option', { hasText: '#100 · DP releases' }).getAttribute('value')), 'the DP bulk creation Epic, as bulk')
  assert.match(await text(form.locator('.nf-top')), /The DP bulk creation Epic, as Create Features uses it\./)
  assert.equal(await form.getByLabel('Feature title').inputValue(), byBulk.title)
  assert.equal(await start.inputValue(), viewer.start, 'Start date = DRPE Date')
  assert.equal(await target.inputValue(), viewer.target, 'Target date = DDT Date')
  const line = form.locator('.nf-months')
  assert.match(await text(line), new RegExp(`Time Writing: one Task for ${label(0)}\\.`), 'not ticked: the current month only, as bulk')
  const tick = form.getByRole('checkbox', { name: 'Create Time Writing month Tasks from the Start date to the Target date' })
  assert.equal(await tick.isChecked(), false, 'optional, not ticked by default')
  await tick.check()
  await line.filter({ hasText: `3 month Tasks, ${label(1)} – ${label(3)}` }).waitFor()
  // Start after Target: the form's own check says what is wrong; the dates can still be changed.
  await start.fill(day(4, 1))
  await form.locator('.nf-months[role="alert"]', { hasText: 'The Target date is before the Start Date.' }).waitFor()
  assert.equal(await target.getAttribute('min'), day(4, 1), 'min on the Target date')
  await start.fill(viewer.start)
  await line.filter({ hasText: `3 month Tasks, ${label(1)} – ${label(3)}` }).waitFor()
  // No QE page here: the note says so, and the person picks the QE as on the bulk row.
  assert.match(await text(form.locator('.nf-strip')), /The QE page columns are not set \(Feature setup of the bulk Epic\): assigned to you unless you choose/, "bulk’s reason")
  await form.getByRole('combobox', { name: 'Assigned to' }).click()
  await form.getByRole('option', { name: 'Rita Gomez' }).click()
  await form.getByLabel('PI / Sprint schedule').and(form.locator(':enabled')).waitFor()
  await form.locator('select[aria-label="PI / Sprint schedule"] option:checked', { hasText: 'Sprint 2' }).waitFor({ state: 'attached' })
  await shot(page, 'dp-single-prefilled', page)
  // DoD, then the stories with their Sprints.
  await form.getByRole('button', { name: 'Continue' }).click()
  const storySection = form.getByRole('region', { name: 'Section 3: User Stories' })
  await storySection.locator('.nf-story-sprint', { hasText: 'SFV → Sprint 3' }).waitFor()
  assert.match(await text(storySection), new RegExp(`PRD ${dayText(viewer.prd)} is in a past Sprint — default Sprint`))
  await shot(page, 'dp-single-story-sprints', storySection)
  await form.getByRole('button', { name: 'Continue' }).click()
  await form.getByRole('button', { name: 'Save' }).and(form.locator(':enabled')).click()
  await finished(page, /Hierarchy complete/)
  const bySingle = made(second.azure.creates)
  assert.deepEqual(second.dpWrites, [])
  assert.deepEqual(second.errors, [])
  await second.context.close()

  // (4) The same Feature either way.
  assert.deepEqual(bySingle, byBulk)
  assert.equal(byBulk.parent, 100)
  assert.deepEqual([byBulk.start, byBulk.target], [`${viewer.start}T00:00:00Z`, `${viewer.target}T00:00:00Z`])
  assert.equal(byBulk.assignedTo, 'rita.gomez@example.com')
  assert.deepEqual(byBulk.months, [label(1), label(2), label(3)])
  assert.deepEqual(byBulk.stories, { 'SFV : Review': 'Quality\\PI 1\\Sprint 3', 'PRD : Review': 'Quality\\PI 1\\Sprint 2' }, 'SFV in the Sprint of the DRfH Date; PRD (past) in the default Sprint')
  assert.equal(byBulk.iteration, 'Quality\\PI 1', 'the Feature keeps its PI')
})
