import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { cachedRoles, navigate, openPage, startApp, text } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'

// DP bulk creation dates (DPF-13…DPF-16; TC-DPF-16, UAT) and the full-size bulk pop-up (UI-30; TC-UI-26), against a
// mocked GitHub, a mocked on-prem DP query (azure.example.com, read only) and a mocked dev.azure.com that records
// every create. A Tool Owner sets Admin → Streams → Bulk creation → DP bulk creation dates (saved to Git
// at once); then DP Create Features on two releases sends Start date = DRPE Date and Target date = DDT Date in the
// Feature's create body, with one Time Writing Task per Feature (Current month only, the default) or one per month
// from Start to Target (Every month …). The dates are set from today, so the months hold whenever the test runs.
// Synthetic data only; every step waits for what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const shots = process.env.E2E_SHOTS
const shot = async (page, name, locator) => { if (!shots) return; mkdirSync(shots, { recursive: true }); await (locator ?? page).screenshot({ path: `${shots}/${name}.png` }) }

// Dates around today (UTC): month offsets from the current month.
const now = new Date()
const day = (months, date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, date)).toISOString().slice(0, 10)
const short = (months) => label(months).slice(0, 3) + label(months).slice(-5)
const label = (months) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
// Viewer 4.2: RPE next month, DT two months on → 3 months. Archive 2.1: RPE last month (past), DT next month → this
// month and next, 2 months. Monitor 1.0: RPE after DT → skipped. Lab 3.0: no DDT Date → created without a Target date.
// Scanner 5.0: no DRPE Date → created without a Start date; ticked, its months start in the current month.
const releases = [
  { id: 501, name: 'Viewer', release: '4.2', program: 'Imaging', start: day(1, 1), target: day(3, 15) },
  { id: 502, name: 'Archive', release: '2.1', program: 'Imaging', start: day(-1, 5), target: day(1, 20) },
  { id: 503, name: 'Monitor', release: '1.0', program: 'Care', start: day(4, 1), target: day(2, 1) },
  { id: 504, name: 'Lab', release: '3.0', program: 'Care', start: day(0, 2) },
  { id: 505, name: 'Scanner', release: '5.0', program: 'Care', target: day(2, 10) },
]
const dpRaw = (entry) => ({ id: entry.id, rev: 1, fields: { 'System.TeamProject': 'DP', 'System.WorkItemType': 'Release', 'System.Title': `${entry.name} ${entry.release}`, 'System.State': 'Active', 'System.AreaPath': 'DP', 'System.IterationPath': 'DP', 'Custom.PsName': entry.name, 'Custom.Release': entry.release, 'Custom.SourceProgram': entry.program, ...(entry.start ? { 'Custom.DRPEDate': `${entry.start}T00:00:00Z` } : {}), 'Custom.DRPCDate': `${day(0, 10)}T00:00:00Z`, ...(entry.target ? { 'Custom.DDTDate': `${entry.target}T00:00:00Z` } : {}), 'Custom.DDTStatus': 'Planned' } })
const dpQuery = 'SELECT [System.Id], [System.Title], [Custom.PsName], [Custom.Release], [Custom.SourceProgram], [Custom.DRPEDate], [Custom.DRPCDate], [Custom.DDTDate], [Custom.DDTStatus] FROM WorkItems WHERE [System.WorkItemType] = \'Release\''
const dpFields = [['System.Id', 'ID'], ['System.Title', 'Title'], ['Custom.PsName', 'PsName'], ['Custom.Release', 'Release'], ['Custom.SourceProgram', 'SourceProgram'], ['Custom.DRPEDate', 'DRPEDate'], ['Custom.DRPCDate', 'DRPCDate'], ['Custom.DDTDate', 'DDTDate'], ['Custom.DDTStatus', 'DDTStatus']]
// The on-prem DP query: read only (any write is answered 405 and recorded).
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

// dev.azure.com: the QMS-0025 project with the DP bulk Epic #100 and a QE assigned a Task; creates are kept and recorded.
const twRaw = (id, type, title, parent, extra = {}) => ({ id, rev: 1, fields: { 'System.TeamProject': 'Quality', 'System.WorkItemType': type, 'System.Title': title, 'System.State': 'Active', 'System.AreaPath': 'Quality\\DP', 'System.IterationPath': 'Quality\\PI 2026.4', ...(parent ? { 'System.Parent': parent } : {}), 'System.AssignedTo': { displayName: 'Rita Gomez', uniqueName: 'rita.gomez@example.com' }, ...extra } })
const dated = (name, path, start, finish) => ({ name, path, attributes: { startDate: `${start}T00:00:00Z`, finishDate: `${finish}T00:00:00Z` } })
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
    if (path.endsWith('/_apis/work/teamsettings/iterations')) return json({ value: [dated('Sprint 2', 'Quality\\PI 2026.4\\Sprint 2', '2000-01-01', '2099-12-31')] })
    if (path.endsWith('/_apis/wit/classificationnodes/iterations')) return json(node('', [node('PI 2026.4', [node('PI 2026.4\\Sprint 2', [], { startDate: '2000-01-01T00:00:00Z', finishDate: '2099-12-31T00:00:00Z' })])]))
    const create = /\/_apis\/wit\/workitems\/\$(.+)$/.exec(path)
    if (create && request.method() === 'POST') {
      const type = create[1], patch = JSON.parse(request.postData() ?? '[]')
      const fields = Object.fromEntries(patch.filter((entry) => entry.path.startsWith('/fields/')).map((entry) => [entry.path.slice(8), entry.value]))
      const parent = Number(/\/workItems\/(\d+)$/.exec(patch.find((entry) => entry.path === '/relations/-')?.value?.url ?? '')?.[1] ?? 0)
      if (url.searchParams.get('validateOnly') === 'true') return json({ id: 0, fields: {} })
      const item = { id: ++next, rev: 1, fields: { 'System.TeamProject': 'Quality', 'System.WorkItemType': type, 'System.State': 'New', 'System.IterationPath': 'Quality', ...fields, 'System.Parent': parent, 'System.AssignedTo': { displayName: fields['System.AssignedTo'], uniqueName: fields['System.AssignedTo'] } } }
      world.push(item); creates.push({ type, fields, parent })
      return json(item)
    }
    const update = /\/_apis\/wit\/workitems\/(\d+)$/.exec(path)
    if (update && request.method() === 'PATCH') { const item = world.find((entry) => entry.id === Number(update[1])); for (const entry of JSON.parse(request.postData() ?? '[]')) if (entry.path?.startsWith('/fields/')) item.fields[entry.path.slice(8)] = entry.value; return json(item) }
    return json({ value: [] })
  }
  return { route, creates }
}

const featureSetup = { schema: 1, kind: 'feature-setup', epics: [{ epicId: 100, epicTitle: 'DP releases', featureDoD: 'DT is finished.', stories: [], task: { title: '{month} | {feature}', description: '', assignedTo: '', areaPath: '', iterationPath: '' } }] }
const profiles = [
  { id: 'tw', url: 'https://dev.azure.com/example/Quality/_backlogs/backlog/Team%20A/Epics', token: 'x'.repeat(52), reason: 'QMS-0025', role: 'time-tracking', showInMenu: true, creatorEmail: 'lead@example.com' },
  { id: 'dp', url: 'https://azure.example.com/tfs/Collection/DP', baseUrl: 'https://azure.example.com/tfs', token: 'e2e-token-0123456789', reason: 'DP', viewName: 'DP', role: 'release-source', query: dpQuery, showInMenu: true },
]

async function openApp(gh, { width = 1440, height = 900, scale } = {}) {
  const azure = fakeAzure(), dpWrites = []
  const opened = await openPage(app, { width, height, scale, roles: true, init: ({ list }) => {
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

// Release Details → DP: fetch the query, show all months, tick every release and open Create Features.
async function openBulk(page) {
  await page.locator('.sidebar nav button').filter({ hasText: /(^|[^A-Za-z])DP$/ }).first().click()
  await page.locator('.page-loading').waitFor({ state: 'detached' })
  const fetch = page.getByRole('button', { name: /^(Fetch|Refresh) from Azure$/ }).first()
  await fetch.click()
  await page.getByRole('radiogroup', { name: 'Show' }).getByRole('radio', { name: 'All months' }).click()
  const table = page.locator('.panel', { has: page.locator('h2', { hasText: /^Releases/ }) }).first()
  await table.locator('tbody tr', { hasText: 'Viewer' }).first().waitFor()
  await table.getByRole('button', { name: 'Select all shown', exact: true }).click()
  await table.getByRole('button', { name: 'Create Features (5)' }).click()
  const dialog = page.getByRole('dialog').filter({ hasText: 'Create Features for 5 DP releases' })
  await dialog.locator('tbody tr').first().waitFor()
  return dialog
}
const rowOf = (dialog, name) => dialog.locator('tbody tr', { hasText: name }).first()
const cellsOf = async (dialog) => {
  const headers = (await dialog.locator('thead th').allTextContents()).map((header) => header.trim())
  return async (name, column) => (await rowOf(dialog, name).locator('td').nth(headers.indexOf(column)).innerText()).replace(/\s+/g, ' ').trim()
}
// Picks the QE on every row that will be created (no QE page in this test) and waits for Create to be enabled.
async function pickQes(dialog, count) {
  for (const name of ['Viewer', 'Archive', 'Lab', 'Scanner']) await rowOf(dialog, name).getByRole('combobox').last().selectOption('rita.gomez@example.com')
  await dialog.getByRole('button', { name: `Create ${count} Features` }).and(dialog.locator(':enabled')).waitFor()
}
async function finished(page, made) {
  const jobs = page.locator('.jobs-button')
  await jobs.waitFor()
  await jobs.click()
  const panel = page.getByRole('dialog', { name: 'Background jobs' })
  await panel.getByText(`${made} of ${made} Features created`).waitFor()
  return text(panel)
}

test('TC-DPF-16: the Tool Owner maps the DP dates (saved to Git); DP Create Features sets Start = DRPE Date and Target = DDT Date, one Time Writing Task per Feature unticked, or one per month from the Start date’s month to the Target month ticked', async () => {
  const gh = fakeGitHub({ files: { 'access.json': cachedRoles('Tool Owner'), 'feature-setup.json': `${JSON.stringify(featureSetup, null, 2)}\n` } })
  const first = await openApp(gh, { scale: shots ? 2 : undefined })
  let page = first.page
  // (1) The mapping: defaults shown; Start from DRPC Date saved to Git, then back to DRPE Date (the default is not stored).
  await navigate(page, /Streams$/)
  await page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'Bulk creation' }).click()
  const panel = page.locator('.dp-bulk-dates')
  await panel.waitFor()
  assert.match(await text(panel.locator('.settings-summary')), /Start date from DRPE Date \(RPE\) — default Target date from DDT Date \(DT\) — default/i)
  const edit = async (start) => {
    await panel.getByRole('button', { name: 'Edit dates…' }).click()
    const dialog = page.getByRole('dialog', { name: 'DP bulk creation dates' })
    await dialog.getByLabel('Start date from').selectOption(start)
    assert.equal(await dialog.getByLabel('Target date from').inputValue(), 'DDTDate')
    await shot(page, 'dp-bulk-dates-mapping', dialog)
    await dialog.getByRole('button', { name: 'Save to Git' }).click()
    await panel.locator('.notice', { hasText: 'Saved to example/storage · planning-data.json' }).waitFor()
  }
  await edit('DRPCDate')
  assert.deepEqual(JSON.parse(gh.read('planning-data.json')).releaseSourceSettings.dpBulkDates, { start: 'DRPCDate' }, 'committed to Git with the bulk creation Epics')
  assert.match(await text(panel.locator('.settings-summary')), /Start date from DRPC Date \(PRD\) Target date from DDT Date \(DT\) — default/i)
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, /Streams$/)
  await page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'Bulk creation' }).click()
  await panel.waitFor()
  await edit('DRPEDate')
  await panel.locator('.settings-summary', { hasText: 'DRPE Date (RPE) — default' }).waitFor()
  assert.equal(JSON.parse(gh.read('planning-data.json')).releaseSourceSettings?.dpBulkDates, undefined, 'the defaults are not stored')
  await shot(page, 'dp-bulk-dates-setting', panel)

  // (2) DP Create Features: the dates per row, the notes, the skipped row, and Current month only by default.
  let dialog = await openBulk(page)
  const cell = await cellsOf(dialog)
  assert.equal(await cell('Viewer', 'Start date'), releases[0].start)
  assert.equal(await cell('Viewer', 'Target date'), releases[0].target)
  assert.equal(await cell('Lab', 'Target date'), '—')
  assert.match(await cell('Monitor', 'Result'), new RegExp(`Skipped: the Start date ${releases[2].start} \\(DRPE Date\\) is after the Target date ${releases[2].target} \\(DDT Date\\)`))
  const tick = dialog.getByRole('checkbox', { name: 'Create Time Writing month Tasks from the Start date to the Target date' })
  assert.equal(await tick.isChecked(), false, 'optional, not ticked by default')
  assert.match(await text(dialog.locator('.dp-bulk-months')), new RegExp(`Not ticked: one Time Writing Task per Feature, for ${label(0)}, as before\\.`))
  assert.equal(await cell('Viewer', 'Time Writing Tasks'), label(0))
  // UI-30: the full-size pop-up at 1440×900 — at least 90% of the window, the header and actions visible while the list scrolls.
  const box = await dialog.boundingBox()
  assert.ok(box.width >= 0.9 * 1440 && box.height >= 0.9 * 900, `full size: ${box.width}×${box.height}`)
  assert.ok(box.x > 0 && box.y > 0, 'a margin around it: still a pop-up')
  const list = dialog.locator('.modal-scroll')
  assert.ok(await list.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), 'the date columns fit without scrolling sideways at 1440 px')
  // A long list: a tall block after the table, then scrolled to its end.
  await list.evaluate((element) => { const filler = document.createElement('div'); filler.className = 'e2e-filler'; filler.style.height = '2000px'; element.append(filler); element.scrollTop = element.scrollHeight })
  assert.ok(await list.evaluate((element) => element.scrollTop > 0), 'the list scrolls')
  for (const part of [dialog.locator('.modal-heading h2'), dialog.getByRole('button', { name: 'Close' }), dialog.getByRole('button', { name: 'Cancel' }), dialog.getByRole('button', { name: /^Create \d+ Features?$/ })]) {
    const at = await part.boundingBox()
    assert.ok(at && at.y >= box.y && at.y + at.height <= box.y + box.height, 'header and actions stay in view while the list scrolls')
  }
  await list.evaluate((element) => { element.querySelector('.e2e-filler')?.remove(); element.scrollTop = 0 })
  await pickQes(dialog, 4)
  assert.match(await cell('Scanner', 'Result'), /no DRPE Date — Start date left empty/)
  assert.match(await cell('Lab', 'Result'), /Will be created .*no DDT Date — Target date left empty/)
  await shot(page, 'dp-bulk-dates-popup', page)
  await dialog.getByRole('button', { name: 'Create 4 Features' }).click()
  await finished(page, 4)
  let features = first.azure.creates.filter((entry) => entry.type === 'Feature')
  const byTitle = (name) => features.find((entry) => entry.fields['System.Title'].includes(name))
  assert.equal(byTitle('Viewer').fields['Microsoft.VSTS.Scheduling.StartDate'], `${releases[0].start}T00:00:00Z`, 'StartDate = DRPE Date')
  assert.equal(byTitle('Viewer').fields['Microsoft.VSTS.Scheduling.TargetDate'], `${releases[0].target}T00:00:00Z`, 'TargetDate = DDT Date')
  assert.equal(byTitle('Archive').fields['Microsoft.VSTS.Scheduling.StartDate'], `${releases[1].start}T00:00:00Z`)
  assert.equal(byTitle('Lab').fields['Microsoft.VSTS.Scheduling.TargetDate'], undefined, 'no DDT Date: no Target date')
  assert.equal(byTitle('Monitor'), undefined, 'Start after Target: not created')
  let tasks = first.azure.creates.filter((entry) => entry.type === 'Task')
  assert.equal(tasks.length, 4, 'not ticked: one Task per Feature')
  assert.equal(byTitle('Scanner').fields['Microsoft.VSTS.Scheduling.StartDate'], undefined, 'no DRPE Date: no Start date')
  assert.ok(tasks.every((entry) => entry.fields['System.Title'].startsWith(`${label(0)} | `)))
  assert.deepEqual(first.dpWrites, [], 'nothing written to the on-prem server')
  assert.deepEqual(first.errors, [])
  await first.context.close()

  // (3) A fresh project, the box ticked: Viewer 3 (from its Start month, next month), Archive 2 (Start last month: from
  // this month, said on the row), Lab 1 (no Target date), Scanner 3 (no Start date: from this month) = 9 Tasks.
  const second = await openApp(gh, { scale: shots ? 2 : undefined })
  page = second.page
  dialog = await openBulk(page)
  await dialog.getByRole('checkbox', { name: 'Create Time Writing month Tasks from the Start date to the Target date' }).check()
  const cell2 = await cellsOf(dialog)
  assert.equal(await cell2('Viewer', 'Time Writing Tasks'), `3: ${label(1)} – ${label(3)}`, 'from the Start date’s month, not the current month')
  assert.equal(await cell2('Archive', 'Time Writing Tasks'), `2: ${label(0)} – ${label(1)} from ${short(0)} (Start ${short(-1)} is before this month)`)
  assert.equal(await cell2('Lab', 'Time Writing Tasks'), `${label(0)} no Target date: first month only`)
  assert.equal(await cell2('Scanner', 'Time Writing Tasks'), `3: ${label(0)} – ${label(2)} from ${short(0)} (no Start date)`)
  await pickQes(dialog, 4)
  assert.match(await text(dialog.locator('.dp-bulk-months')), /9 Time Writing Tasks in all\./)
  await shot(page, 'dp-bulk-dates-popup-ticked', page)
  await dialog.getByRole('button', { name: 'Create 4 Features' }).click()
  assert.match(await finished(page, 4), /Viewer.*\(3 month Tasks\)/)
  features = second.azure.creates.filter((entry) => entry.type === 'Feature')
  tasks = second.azure.creates.filter((entry) => entry.type === 'Task')
  const taskMonths = (name) => { const feature = features.find((entry) => entry.fields['System.Title'].includes(name)); return tasks.filter((entry) => entry.fields['System.Title'].endsWith(feature.fields['System.Title'])).map((entry) => entry.fields['System.Title'].split(' | ')[0]) }
  assert.deepEqual(taskMonths('Viewer'), [label(1), label(2), label(3)], 'from the DRPE month to the DDT month')
  assert.deepEqual(taskMonths('Archive'), [label(0), label(1)], 'a Start date in an earlier month: from the current month')
  assert.deepEqual(taskMonths('Lab'), [label(0)])
  assert.deepEqual(taskMonths('Scanner'), [label(0), label(1), label(2)], 'no Start date: from the current month')
  assert.equal(tasks.length, 9)
  assert.deepEqual(second.dpWrites, [])
  assert.deepEqual(second.errors, [])
  await second.context.close()
})
