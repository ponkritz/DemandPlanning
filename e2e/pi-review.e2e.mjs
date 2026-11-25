import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { navigate, openPage, startApp, text } from './helpers.mjs'

// PI Review, release 1 (PIR-01…PIR-06; TC-PIR-06, UAT): against a mocked Azure DevOps — the Time Writing fetch, the
// iterations (PI 2026.4 current) and the Comments API with two pages — the current PI is chosen, its Features listed,
// a Feature's Discussion read in the drawer as plain text from both pages, and Read all Discussions completes as a
// background job. Synthetic data only; every step waits for what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const profile = { id: 'tw-pir', url: 'https://dev.azure.com/example/Project/_backlogs/backlog/Team%20A/Features', reason: 'Time Writing', token: 'x'.repeat(52), role: 'time-tracking', creatorEmail: 'lead@example.com' }
const raw = (id, type, title, iterationPath, parent, state = 'Active') => ({ id, rev: 1, fields: { 'System.TeamProject': 'Project', 'System.WorkItemType': type, 'System.Title': title, 'System.State': state, 'System.AreaPath': 'Project\\Quality', 'System.IterationPath': iterationPath, ...(parent ? { 'System.Parent': parent } : {}), 'System.AssignedTo': { displayName: 'Rita Gomez', uniqueName: 'rita.gomez@example.com' } } })
export const piWorld = [
  raw(100, 'Epic', 'DP releases', 'Project'),
  raw(201, 'Feature', 'DP 4.2 release review', 'Project\\PI 2026.4', 100),
  raw(202, 'Feature', 'CP template update', 'Project\\PI 2026.4\\Sprint 2', 100, 'New'),
  raw(203, 'Feature', 'IOCC carry-over', 'Project\\PI 2026.3', 100),
  raw(301, 'User Story', 'Finish IOCC docs', 'Project\\PI 2026.4\\Sprint 2', 203),
]
const dated = (name, path, start, finish) => ({ name, path, attributes: { startDate: `${start}T00:00:00Z`, finishDate: `${finish}T00:00:00Z` } })
const node = (path, children = [], attributes) => ({ name: path.split('\\').at(-1) || 'Project', path: `\\Project\\Iteration${path ? `\\${path}` : ''}`, ...(attributes ? { attributes } : {}), children })
export const piToken = 'page 2/of+2=='
// The Discussion of Feature 201 in two pages (newest first), with a mention, an image, a script and a deleted comment.
const firstPage = [
  { id: 4, text: '<div>Blocked by the <b>test rig</b>, asked <a href="#" data-vss-mention="version:2.0,aa11">@Ana Costa</a> to help</div>', createdBy: { displayName: 'Rita Gomez' }, createdDate: '2026-11-20T09:00:00Z' },
  { id: 3, text: '<p>Lesson: book the rig early</p><script>window.hacked = true</script>', createdBy: { displayName: 'Ben Okafor' }, createdDate: '2026-11-18T09:00:00Z' },
]
const secondPage = [
  { id: 2, text: 'Gone', isDeleted: true, createdBy: { displayName: 'Ben Okafor' }, createdDate: '2026-11-10T09:00:00Z' },
  { id: 1, text: '<p>Screenshot <img src="https://example.invalid/x.png" onerror="window.hacked = true"> attached</p>', createdBy: { displayName: 'Ana Costa' }, createdDate: '2026-11-02T09:00:00Z' },
]

// A fake dev.azure.com for the Time Writing fetch, the iterations and the comments; `seen` records the comment URLs.
export function fakeAzure(seen = []) {
  return (route) => {
    const request = route.request(), url = new URL(request.url()), path = decodeURIComponent(url.pathname)
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/_apis/work/teamsettings/teamfieldvalues')) return json({ field: { referenceName: 'System.AreaPath' }, values: [{ value: 'Project\\Quality', includeChildren: true }] })
    if (path.endsWith('/_apis/work/backlogs/Microsoft.EpicCategory/workItems')) return json({ workItems: [{ target: { id: 100 } }] })
    if (path.endsWith('/_apis/wit/workitemsbatch')) { const ids = JSON.parse(request.postData() ?? '{}').ids ?? []; return json({ value: piWorld.filter((item) => ids.includes(item.id)) }) }
    if (path.endsWith('/_apis/wit/wiql')) {
      const query = JSON.parse(request.postData() ?? '{}').query ?? ''
      const parents = (/\[System\.Parent\] IN \(([\d,]+)\)/.exec(query)?.[1] ?? '').split(',').map(Number), after = Number(/\[System\.Id\] > (\d+)/.exec(query)?.[1] ?? 0)
      return json({ workItems: piWorld.filter((item) => parents.includes(item.fields['System.Parent']) && item.id > after).map((item) => ({ id: item.id })) })
    }
    if (path.endsWith('/_apis/work/teamsettings/iterations')) return json({ value: [dated('Sprint 2', 'Project\\PI 2026.4\\Sprint 2', '2000-01-01', '2099-12-31'), dated('Sprint 6', 'Project\\PI 2026.3\\Sprint 6', '2000-01-01', '2000-01-14')] })
    if (path.endsWith('/_apis/wit/classificationnodes/iterations')) return json(node('', [node('PI 2026.3', [node('PI 2026.3\\Sprint 6', [], { startDate: '2000-01-01T00:00:00Z', finishDate: '2000-01-14T00:00:00Z' })]), node('PI 2026.4', [node('PI 2026.4\\Sprint 2', [], { startDate: '2000-01-01T00:00:00Z', finishDate: '2099-12-31T00:00:00Z' })])]))
    const comments = /\/_apis\/wit\/workItems\/(\d+)\/comments$/.exec(path)
    if (comments) {
      seen.push(request.url())
      const token = url.searchParams.get('continuationToken')
      if (comments[1] === '201') return json(token === piToken ? { comments: secondPage, count: 2 } : { comments: firstPage, count: 2, continuationToken: piToken })
      if (comments[1] === '202') return json({ comments: [{ id: 9, text: 'Ready for review', createdBy: { displayName: 'Ana Costa' }, createdDate: '2026-11-19T09:00:00Z' }], count: 1 })
      return json({ comments: [], count: 0 })
    }
    return json({ value: [] })
  }
}

// Opens the app with the Time Writing connection, the mocked Azure DevOps, and PI Review open.
export async function openPiReview(options = {}) {
  const seen = []
  const { page, context, errors } = await openPage(app, { roles: 'Tool Owner', ...options, init: (connection) => {
    localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify([connection]))
    localStorage.setItem('demand-planning-work-email-v1', 'lead@example.com')
  }, initArg: profile })
  await context.route('https://dev.azure.com/**', fakeAzure(seen))
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, () => guide.getByRole('button', { name: 'Close', exact: true }).last().click())
  await page.reload()
  await navigate(page, 'PI Review')
  return { page, context, errors, seen }
}

const rowKeys = (page) => page.locator('.pir-table tbody tr[data-row-key]').evaluateAll((rows) => rows.map((row) => row.dataset.rowKey))

test('TC-PIR-06: the current PI is preselected, its Features listed, a Discussion read in the drawer as plain text from both pages, and Read all Discussions completes', async () => {
  const { page, context, errors, seen } = await openPiReview()
  // PIR-02: the current PI (the Sprint dates cover today) is chosen, with the Current PI chip; both PIs are offered, newest first.
  const select = page.getByLabel('PI', { exact: true })
  await page.locator('.pir-filters .pill', { hasText: 'Current PI' }).waitFor()
  assert.equal(await select.inputValue(), 'Project\\PI 2026.4')
  assert.deepEqual(await select.locator('option').allInnerTexts(), ['PI 2026.4 (current)', 'PI 2026.3'])
  // PIR-03, PIR-04: the PI's Features by ID; the toggle adds the Feature with a User Story in the PI.
  await page.locator('.pir-table tr[data-row-key="example/project/202"]').waitFor()
  assert.deepEqual(await rowKeys(page), ['example/project/201', 'example/project/202'])
  assert.match(await text(page.locator('.pir-table tr[data-row-key="example/project/201"]')), /^201 DP 4\.2 release review DP releases Active Rita Gomez — PI 2026\.4 —$/)
  assert.match(await text(page.locator('.data-table-status')), /^2 of 2 Features$/)
  await page.getByRole('checkbox', { name: 'Also Features with User Stories in this PI' }).check()
  await page.locator('.pir-table tr[data-row-key="example/project/203"]').waitFor()
  await page.getByRole('checkbox', { name: 'Also Features with User Stories in this PI' }).uncheck()
  await page.locator('.pir-table tr[data-row-key="example/project/203"]').waitFor({ state: 'detached' })
  // PIR-05: the drawer reads the whole Discussion — both pages, the token sent back URL-encoded — newest first, as text.
  await page.locator('.pir-table tr[data-row-key="example/project/201"] td').nth(1).click()
  const drawer = page.locator('aside.drawer[role="dialog"]', { has: page.getByRole('heading', { name: 'Feature #201', exact: true }) })
  await drawer.waitFor()
  const items = drawer.locator('.pir-comments > li')
  await drawer.getByRole('heading', { name: 'Discussion (3)' }).waitFor()
  assert.deepEqual(await items.locator('.pir-comment-text').allInnerTexts(), ['Blocked by the test rig, asked @Ana Costa to help', 'Lesson: book the rig early', 'Screenshot [image] attached'])
  assert.match(await text(items.first()), /^Rita Gomez /)
  assert.equal(await drawer.locator('.pir-comments img, .pir-comments script, .pir-comments a').count(), 0, 'no markup rendered')
  assert.equal(await page.evaluate(() => window.hacked), undefined)
  assert.ok(seen.some((url) => url.includes('/workItems/201/comments?') && url.includes(`continuationToken=${encodeURIComponent(piToken)}`)), `second page asked with the token: ${seen.join(' ')}`)
  assert.equal(await drawer.getByRole('link', { name: 'Open in Azure DevOps →' }).getAttribute('href'), 'https://dev.azure.com/example/Project/_workitems/edit/201')
  await page.keyboard.press('Escape')
  await drawer.waitFor({ state: 'detached' })
  assert.equal(await text(page.locator('.pir-table tr[data-row-key="example/project/201"] td').last()), '3')
  // PIR-06: Read all Discussions reads the rest as a background job; the Comments column fills in.
  await page.getByRole('button', { name: '↻ Read all Discussions' }).click()
  await page.locator('.jobs-button').click()
  const panel = page.getByRole('dialog', { name: 'Background jobs' })
  const job = panel.locator('li.job', { hasText: 'Reading Discussions · PI 2026.4' })
  await job.filter({ hasText: '1 of 1 read.' }).waitFor()
  await panel.getByRole('button', { name: 'Close', exact: true }).click()
  assert.equal(await text(page.locator('.pir-table tr[data-row-key="example/project/202"] td').last()), '1')
  assert.deepEqual(errors, [])
  await context.close()
})
