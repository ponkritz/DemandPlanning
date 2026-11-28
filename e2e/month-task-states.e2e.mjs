import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { cachedRoles, loadSample, navigate, openPage, startApp, text } from './helpers.mjs'

// Month Task states (ACT-23…ACT-27; TC-ACT-18…TC-ACT-22, TC-ACT-20 UAT). Against a mocked dev.azure.com that records
// every PATCH: at start the app fetches the Time Writing connection and the background job "Month Task states" closes
// the signed-in person's own Month Task of a past month whose Actuals are locked, and the one under a Closed Feature,
// with their own Time Writing stories (another person's Task is never written); on Time Writing the tile "Features
// Working on" counts the Features with a Month Task, and saving hours on a New Month Task sets the Task, its Time
// Writing story and its New Feature to Active (each PATCH body checked). With the synthetic sample, and with an
// on-premises Time Writing connection, nothing is written. Synthetic data only; every step waits for what it needs.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const shots = process.env.E2E_SHOTS
const shot = async (page, name) => { if (!shots) return; mkdirSync(shots, { recursive: true }); await page.screenshot({ path: `${shots}/${name}.png` }) }

const now = new Date()
const label = (months) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const me = 'lead@example.com', other = 'ben.okafor@example.com'
const raw = (id, type, title, parent, state, who = me, fields = {}) => ({ id, rev: 1, fields: { 'System.TeamProject': 'Quality', 'System.WorkItemType': type, 'System.Title': title, 'System.State': state, 'System.AreaPath': 'Quality', 'System.IterationPath': 'Quality\\PI 1', ...(parent ? { 'System.Parent': parent } : {}), 'System.AssignedTo': { displayName: who === me ? 'Lea Lead' : 'Ben Okafor', uniqueName: who }, ...fields } })
// Two months ago is locked for Actuals (the 4th of last month has passed); this month is open.
const worldOf = () => [
  raw(100, 'Epic', 'Quality stream', undefined, 'Active'),
  raw(200, 'Feature', 'Core platform', 100, 'New'), raw(201, 'User Story', 'Core platform - Time Writing', 200, 'New'), raw(202, 'Task', `${label(0)} | Core platform`, 201, 'New'),
  raw(300, 'Feature', 'Lab tools', 100, 'Active'), raw(301, 'User Story', 'Lab tools - Time Writing', 300, 'Active'), raw(302, 'Task', `${label(-2)} | Lab tools`, 301, 'Active', me, { 'Microsoft.VSTS.Scheduling.CompletedWork': 12 }),
  raw(401, 'User Story', 'Lab tools - Time Writing (Ben)', 300, 'Active', other), raw(402, 'Task', `${label(-2)} | Lab tools`, 401, 'Active', other),
  raw(500, 'Feature', 'Retired reports', 100, 'Closed'), raw(501, 'User Story', 'Retired reports - Time Writing', 500, 'Active'), raw(502, 'Task', `${label(0)} | Retired reports`, 501, 'Active'),
]
function fakeAzure(world = worldOf()) {
  const patches = [], writes = []
  let reads = 0
  const route = (route) => {
    const request = route.request(), url = new URL(request.url()), path = decodeURIComponent(url.pathname)
    reads += 1
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/_apis/work/teamsettings/teamfieldvalues')) return json({ field: { referenceName: 'System.AreaPath' }, values: [{ value: 'Quality', includeChildren: true }] })
    if (path.endsWith('/_apis/work/backlogs/Microsoft.EpicCategory/workItems')) return json({ workItems: [{ target: { id: 100 } }] })
    if (path.endsWith('/_apis/wit/workitemsbatch')) { const ids = JSON.parse(request.postData() ?? '{}').ids ?? []; return json({ value: world.filter((item) => ids.includes(item.id)) }) }
    if (path.endsWith('/_apis/wit/wiql')) {
      const query = JSON.parse(request.postData() ?? '{}').query ?? ''
      const one = /\[System\.Parent\] = (\d+)/.exec(query), many = /\[System\.Parent\] IN \(([\d,\s]+)\)/.exec(query)
      const parents = one ? [Number(one[1])] : (many?.[1] ?? '').split(',').map(Number), after = Number(/\[System\.Id\] > (\d+)/.exec(query)?.[1] ?? 0)
      return json({ workItems: world.filter((item) => parents.includes(item.fields['System.Parent']) && item.id > after).map((item) => ({ id: item.id })) })
    }
    const update = /\/_apis\/wit\/workitems\/(\d+)$/.exec(path)
    if (update && request.method() === 'PATCH') {
      const item = world.find((entry) => entry.id === Number(update[1])), body = JSON.parse(request.postData() ?? '[]')
      patches.push({ id: item.id, host: url.hostname, body })
      for (const entry of body.filter((op) => op.op === 'test')) {
        if (entry.path.startsWith('/fields/') && item.fields[entry.path.slice(8)] !== entry.value) return json({ message: 'Stale state' }, 409)
      }
      for (const entry of body) if (entry.op === 'add' && entry.path?.startsWith('/fields/')) item.fields[entry.path.slice(8)] = entry.value
      item.rev += 1
      return json(item)
    }
    if (update && request.method() === 'GET') {
      const item = world.find((entry) => entry.id === Number(update[1]))
      return item ? json(item) : json({}, 404)
    }
    if (!['GET'].includes(request.method()) && !/\/_apis\/wit\/(wiql|workitemsbatch)$/.test(path)) writes.push(`${request.method()} ${path}`)
    return json({ value: [] })
  }
  return { route, patches, writes, world, get reads() { return reads } }
}
// The State each PATCH set, as "id:State", and the fields of the other PATCHes (the hours).
const states = (patches) => patches.flatMap((patch) => patch.body.filter((entry) => entry.op === 'add' && entry.path === '/fields/System.State').map((entry) => `${patch.id}:${entry.value}`))

async function openApp(profile, world, roles = true, accessFile) {
  const azure = fakeAzure(world)
  const opened = await openPage(app, { width: 1440, height: 900, scale: shots ? 2 : undefined, roles, init: ({ list, email, accessFile }) => {
    if (accessFile) localStorage.setItem('demand-planning-access-v1', accessFile)
    localStorage.setItem('demand-planning-work-email-v1', email)
    localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify(list))
  }, initArg: { list: [profile], email: me, accessFile } })
  await opened.context.route('https://dev.azure.com/**', azure.route)
  await opened.context.route('https://azure.example.com/**', azure.route)
  const dialog = opened.page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await opened.page.addLocatorHandler(dialog, () => dialog.getByRole('button', { name: 'Close', exact: true }).last().click())
  await opened.page.reload()
  await opened.page.locator('.sidebar nav').waitFor()
  return { ...opened, azure }
}
async function jobsPanel(page) {
  await page.locator('.jobs-button').click()
  const panel = page.getByRole('dialog', { name: 'Background jobs' })
  await panel.waitFor()
  return panel
}
const tile = (page) => page.locator('article', { has: page.locator('span', { hasText: /^Features Working on$/ }) }).first()
const cloud = { id: 'tw', url: 'https://dev.azure.com/example/Quality/_backlogs/backlog/Team%20A/Epics', token: 'x'.repeat(52), reason: 'Time Writing', role: 'time-tracking', showInMenu: true, creatorEmail: me }

test('TC-ACT-20: at start the background job Month Task states closes my Month Tasks of a locked month and under a Closed Feature, with my Time Writing stories — never another person\'s; TC-ACT-18: Features Working on counts the Features with my Month Task', async () => {
  const { page, context, errors, azure } = await openApp(cloud)
  const panel = await jobsPanel(page)
  const job = panel.locator('li.job', { hasText: 'Month Task states' })
  await job.getByText(/items? updated\./).waitFor()
  const detail = await text(job)
  assert.match(detail, /4 of 4 items updated\./)
  assert.match(detail, new RegExp(`Task #302 set to Closed \\(Active before\\), because the Actuals of \\d{4}-\\d{2} are locked\\.`))
  assert.match(detail, /Task #502 set to Closed \(Active before\), because its Feature #500 is Closed\./)
  assert.match(detail, /Time Writing story #301 set to Closed \(Active before\), because all its Tasks are Closed\./)
  assert.deepEqual(states(azure.patches).sort(), ['301:Closed', '302:Closed', '501:Closed', '502:Closed'], 'only my items; Ben\'s Task #402 and his story stay as they are, the Features are not closed')
  assert.ok(azure.patches.every((patch) => patch.host === 'dev.azure.com' && patch.body.length === 1 && patch.body[0].op === 'add'), 'each PATCH sets the State only')
  await shot(page, 'month-task-states-1-jobs')
  await panel.getByRole('button', { name: 'Close', exact: true }).click()
  // TC-ACT-18: this month, my Month Tasks are under Core platform and Retired reports — 2 Features.
  await navigate(page, 'Time Writing')
  const card = tile(page)
  await card.waitFor()
  assert.match(await text(card), new RegExp(`^Features Working on 2 Features with your ${label(0)} Time Writing Task$`))
  assert.equal(await page.locator('.metric-grid article > span', { hasText: /^Tasks$/ }).count(), 0, 'the tile is no longer called Tasks')
  // Nothing more is written while the page is used: the job ran once for these items.
  assert.equal(states(azure.patches).length, 4)
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-ACT-19: saving hours on a New Month Task sets the Task, its Time Writing story and its New Feature to Active (PATCH bodies checked)', async () => {
  const { page, context, errors, azure } = await openApp(cloud)
  const panel = await jobsPanel(page)
  await panel.locator('li.job', { hasText: 'Month Task states' }).getByText(/items? updated\./).waitFor()
  await panel.getByRole('button', { name: 'Close', exact: true }).click()
  const before = azure.patches.length
  await navigate(page, 'Time Writing')
  await page.getByLabel('Actual hours for Core platform').fill('6')
  await page.getByRole('button', { name: 'Save 1 activity' }).click()
  await page.locator('.act-message', { hasText: '1 updated' }).waitFor()
  const saved = azure.patches.slice(before)
  const hours = saved.find((patch) => patch.id === 202 && patch.body.some((entry) => entry.path === '/fields/Microsoft.VSTS.Scheduling.CompletedWork'))
  assert.ok(hours, 'the hours are written first')
  assert.equal(hours.body.find((entry) => entry.path === '/fields/Microsoft.VSTS.Scheduling.CompletedWork').value, 6)
  assert.deepEqual(states(saved), ['202:Active', '201:Active', '200:Active'], 'Task, Time Writing story, then the Feature — each from New')
  for (const patch of saved.filter((entry) => entry.body.some((op) => op.path === '/fields/System.State'))) assert.deepEqual(patch.body, [{ op: 'add', path: '/fields/System.State', value: 'Active' }])
  const message = await text(page.locator('.act-message'))
  assert.match(message, /Task #202 set to Active \(New before\), because hours were entered\./)
  assert.match(message, /Feature #200 set to Active \(New before\), because its Time Writing story is Active\./)
  await shot(page, 'month-task-states-2-saved')
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-ACT-20: with the synthetic sample, and with an on-premises Time Writing connection, nothing is written', async () => {
  // On-premises (read-only): the Time Writing connection is fetched with ⟳ Time Writing, and no State is written.
  const onPrem = { ...cloud, id: 'tw-onprem', url: 'https://azure.example.com/tfs/Collection/Quality/_backlogs/backlog/Team%20A/Epics', baseUrl: 'https://azure.example.com/tfs/Collection' }
  const first = await openApp(onPrem)
  await first.page.locator('.fetch-time-writing').click()
  await navigate(first.page, 'Time Writing')
  await first.page.getByText('Time Writing fetched from Azure DevOps and saved').first().waitFor()
  assert.ok(first.azure.reads > 0, 'the on-premises server was read')
  const panel = await jobsPanel(first.page)
  await panel.locator('li.job').first().waitFor()
  assert.equal(await panel.locator('li.job', { hasText: 'Month Task states' }).count(), 0, 'no Month Task states job on-premises')
  assert.deepEqual(first.azure.patches, [])
  assert.deepEqual(first.azure.writes, [])
  await first.context.close()
  // The synthetic sample: no job, and no request to Azure DevOps that changes anything.
  const { page, context, errors } = await openPage(app, { roles: true })
  const writes = []
  await context.route('https://dev.azure.com/**', (route) => { if (route.request().method() !== 'GET') writes.push(route.request().url()); return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }) })
  await loadSample(page)
  await navigate(page, 'Time Writing')
  await page.locator('main').getByText(/activities|Time Writing/).first().waitFor()
  if (await page.locator('.jobs-button').count()) { const list = await jobsPanel(page); assert.equal(await list.locator('li.job', { hasText: 'Month Task states' }).count(), 0, 'no Month Task states job with the sample') }
  assert.deepEqual(writes, [])
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-SCR-04: a user previews Feature states and applies only the eligible Feature updates', async () => {
  const world = [
    raw(100, 'Epic', 'Synthetic backlog', undefined, 'Active'),
    raw(200, 'Feature', 'Ready for activation', 100, 'New'),
    raw(201, 'User Story', 'Active review', 200, 'Active'),
    raw(202, 'User Story', 'Another active review', 200, 'Active'),
    raw(300, 'Feature', 'Reopen for active work', 100, 'Closed'),
    raw(301, 'User Story', 'Active review of closure', 300, 'Active'),
    raw(400, 'Feature', 'Pending review', 100, 'New'),
    raw(401, 'User Story', 'Pending story', 400, 'New'),
    raw(402, 'Task', 'Active task only', 401, 'Active'),
    raw(500, 'Feature', 'Story closed after review', 100, 'New'),
    raw(501, 'User Story', 'Pending closure', 500, 'Active'),
    raw(600, 'Feature', 'Feature with rejected transition', 100, 'New'),
    raw(601, 'User Story', 'Active review work', 600, 'Active'),
  ]
  const { page, context, errors, azure } = await openApp(cloud, world)
  try {
    await navigate(page, 'Backlog Health')
    const check = page.getByRole('button', { name: 'Check Feature states', exact: true })
    await check.click()
    const dialog = page.getByRole('dialog', { name: 'Check Feature states', exact: true })
    await dialog.getByText('#300 Reopen for active work', { exact: true }).waitFor()
    assert.equal(await dialog.getByText('#400 Pending review', { exact: true }).count(), 0)
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    assert.deepEqual(azure.patches, [], 'checking and cancelling sends no patches')
    await check.click()
    const apply = dialog.getByRole('button', { name: 'Set Features to Active', exact: true })
    await apply.waitFor()
    world.find((item) => item.id === 501).fields['System.State'] = 'Closed'
    await context.route(/\/workitems\/600\?/i, (route) => route.request().method() === 'PATCH'
      ? route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'Mock transition conflict' }) })
      : route.fallback())
    const updated = (id) => page.waitForResponse((response) => response.request().method() === 'PATCH' && new URL(response.url()).pathname.toLowerCase().endsWith(`/workitems/${id}`))
    await Promise.all([updated(200), updated(300), apply.click()])
    const result = page.getByText(/2 of 4 Features verified Active/)
    await result.waitFor()
    assert.match(await text(result), /#500.*skipped/)
    assert.match(await text(result), /#600/)
    assert.deepEqual(states(azure.patches).sort(), ['200:Active', '300:Active'])
    for (const patch of azure.patches) assert.deepEqual(patch.body, [
      { op: 'test', path: '/fields/System.State', value: patch.id === 200 ? 'New' : 'Closed' },
      { op: 'add', path: '/fields/System.State', value: 'Active' },
    ])
    await check.click()
    await apply.waitFor()
    assert.equal(await dialog.getByText('#200 Ready for activation', { exact: true }).count(), 0)
    assert.equal(await dialog.getByText('#300 Reopen for active work', { exact: true }).count(), 0)
    assert.deepEqual(azure.writes, [])
    assert.deepEqual(errors, [])
  } finally {
    await context.close()
  }
})

test('TC-SCR-04: a user without state-change rights can review but cannot activate Features', async () => {
  const world = [raw(100, 'Epic', 'Synthetic backlog', undefined, 'Active'), raw(200, 'Feature', 'Review locally', 100, 'New'), raw(201, 'User Story', 'First review', 200, 'Active')]
  const { page, context, errors, azure } = await openApp(cloud, world, false)
  try {
    await navigate(page, 'Backlog Health')
    await page.getByRole('button', { name: 'Check Feature states', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Check Feature states', exact: true })
    await dialog.getByText('#200 Review locally', { exact: true }).waitFor()
    assert.equal(await dialog.getByRole('button', { name: 'Set Features to Active', exact: true }).isDisabled(), true)
    assert.deepEqual(azure.patches, [])
    assert.deepEqual(azure.writes, [])
    assert.deepEqual(errors, [])
  } finally {
    await context.close()
  }
})

test('TC-ATM-26: Sprint check changes only the reviewed Feature after confirmation', async () => {
  const world = [
    raw(100, 'Epic', 'Synthetic backlog', undefined, 'Active'),
    raw(200, 'Feature', 'Ready to activate', 100, 'Closed'),
    raw(201, 'User Story', 'Active review', 200, 'Active', other),
    raw(202, 'User Story', 'Earlier review', 200, 'Closed'),
    raw(300, 'Feature', 'Ready to close', 100, 'New'),
    raw(301, 'User Story', 'Closed review', 300, 'Closed'),
    raw(302, 'User Story', 'Closed review by colleague', 300, 'Closed', other),
    raw(400, 'Feature', 'No stories', 100, 'New'),
  ]
  const policy = JSON.parse(cachedRoles('Scrum Master'))
  policy.roles['Scrum Master'].deny = ['work.comment', 'pireview.post']
  const { page, context, errors, azure } = await openApp(cloud, world, false, JSON.stringify(policy))
  try {
    await navigate(page, 'Sprint check')
    const table = page.getByRole('table', { name: 'State checks' })
    const activate = table.getByRole('row').filter({ hasText: 'Ready to activate' }).getByRole('button', { name: 'Set Feature to Active', exact: true })
    const close = table.getByRole('row').filter({ hasText: 'Ready to close' }).getByRole('button', { name: 'Close Feature', exact: true })
    await activate.waitFor()
    assert.equal(await table.getByRole('row').filter({ hasText: 'No stories' }).count(), 0)
    for (const [trigger, label, target] of [[activate, 'Set Feature to Active', 200], [close, 'Close Feature', 300]]) {
      const before = azure.patches.length
      await trigger.click()
      const dialog = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: label, exact: true }) })
      await dialog.waitFor()
      assert.match(await text(dialog), new RegExp(`#${target}\\b`))
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      assert.equal(azure.patches.length, before)
      await trigger.click()
      const saved = page.waitForResponse((response) => response.request().method() === 'PATCH' && new URL(response.url()).pathname.toLowerCase().endsWith(`/workitems/${target}`))
      await Promise.all([saved, dialog.getByRole('button', { name: label, exact: true }).click()])
      await trigger.waitFor({ state: 'detached' })
    }
    assert.deepEqual(states(azure.patches), ['200:Active', '300:Closed'])
    assert.deepEqual(azure.writes, [])
    assert.deepEqual(errors, [])
  } finally {
    await context.close()
  }
})
