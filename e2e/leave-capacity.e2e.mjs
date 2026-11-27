import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { navigate, openPage, startApp, text } from './helpers.mjs'

// Leave and capacity (CAP-63, CAP-64, ACT-28; TC-CAP-35 UAT, TC-ACT-23). Against a mocked dev.azure.com (read only:
// nothing is saved): the signed-in person has, this month, 40 h of leave planned (Original Estimate only, nothing
// recorded yet) under the absence Epic, an 8 h training under it and 40 h of project work planned. Time Writing shows
// Capacity = working days × 8 h − 40 h leave (the leave counts as soon as it is planned), "… contractual − 40h leave"
// with the rule in the hint, and Planned hours = 48 h (work + training, without the leave) as a share of that capacity.
// My dashboard shows the same Planned and Capacity. Synthetic data only; every step waits for what it needs.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const shots = process.env.E2E_SHOTS
const shot = async (page, name) => { if (!shots) return; mkdirSync(shots, { recursive: true }); await page.screenshot({ path: `${shots}/${name}.png` }) }

const now = new Date()
const label = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate()
const workingDays = Array.from({ length: last }, (_, day) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day + 1)).getUTCDay()).filter((day) => day > 0 && day < 6).length
const contractual = workingDays * 8, capacity = contractual - 40
const me = 'lead@example.com', absenceEpic = 37778
const raw = (id, type, title, parent, fields = {}) => ({ id, rev: 1, fields: { 'System.TeamProject': 'Quality', 'System.WorkItemType': type, 'System.Title': title, 'System.State': 'Active', 'System.AreaPath': 'Quality', 'System.IterationPath': 'Quality\\PI 1', ...(parent ? { 'System.Parent': parent } : {}), 'System.AssignedTo': { displayName: 'Lea Lead', uniqueName: me }, ...fields } })
const hours = (plan, done) => ({ ...(plan != null ? { 'Microsoft.VSTS.Scheduling.OriginalEstimate': plan } : {}), ...(done != null ? { 'Microsoft.VSTS.Scheduling.CompletedWork': done } : {}) })
const world = [
  raw(100, 'Epic', 'Quality stream'), raw(200, 'Feature', 'Core platform', 100), raw(201, 'User Story', 'Core platform - Time Writing', 200), raw(202, 'Task', `${label} | Core platform`, 201, hours(40)),
  raw(absenceEpic, 'Epic', 'Team Holidays and Training'), raw(300, 'Feature', 'Lea Lead - Leave and training', absenceEpic),
  raw(301, 'User Story', 'Lea Lead | PTO | Time Writing', 300), raw(302, 'Task', `${label} | Lea Lead | PTO`, 301, hours(40)),
  raw(311, 'User Story', 'Lea Lead | Training | Time Writing', 300), raw(312, 'Task', `${label} | Lea Lead | Training`, 311, hours(8)),
]
function route(route) {
  const request = route.request(), path = decodeURIComponent(new URL(request.url()).pathname)
  const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  if (path.endsWith('/_apis/work/teamsettings/teamfieldvalues')) return json({ field: { referenceName: 'System.AreaPath' }, values: [{ value: 'Quality', includeChildren: true }] })
  if (path.endsWith('/_apis/work/backlogs/Microsoft.EpicCategory/workItems')) return json({ workItems: [{ target: { id: 100 } }, { target: { id: absenceEpic } }] })
  if (path.endsWith('/_apis/wit/workitemsbatch')) { const ids = JSON.parse(request.postData() ?? '{}').ids ?? []; return json({ value: world.filter((item) => ids.includes(item.id)) }) }
  if (path.endsWith('/_apis/wit/wiql')) {
    const query = JSON.parse(request.postData() ?? '{}').query ?? ''
    const one = /\[System\.Parent\] = (\d+)/.exec(query), many = /\[System\.Parent\] IN \(([\d,\s]+)\)/.exec(query)
    const parents = one ? [Number(one[1])] : (many?.[1] ?? '').split(',').map(Number), after = Number(/\[System\.Id\] > (\d+)/.exec(query)?.[1] ?? 0)
    return json({ workItems: world.filter((item) => parents.includes(item.fields['System.Parent']) && item.id > after).map((item) => ({ id: item.id })) })
  }
  return json({ value: [] })
}
const cloud = { id: 'tw', url: 'https://dev.azure.com/example/Quality/_backlogs/backlog/Team%20A/Epics', token: 'x'.repeat(52), reason: 'Time Writing', role: 'time-tracking', showInMenu: true, creatorEmail: me }
const tile = (page, name) => page.locator('.metric-grid article', { has: page.locator('span', { hasText: new RegExp(`^${name}$`) }) }).first()

test('TC-CAP-35, TC-ACT-23: planned leave comes off the capacity at once and stays out of Planned hours on Time Writing and My dashboard', async () => {
  const { page, context, errors } = await openPage(app, { width: 1440, height: 900, scale: shots ? 2 : undefined, roles: true, init: ({ list, email }) => {
    localStorage.setItem('demand-planning-work-email-v1', email)
    localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify(list))
  }, initArg: { list: [cloud], email: me } })
  await context.route('https://dev.azure.com/**', route)
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, 'Time Writing')
  // SET-36: with the tiles shown, Time Writing's ⚙ (Month locks) sits in the "last day" tile, not at the top right.
  await page.locator('.act-tile-deadline').getByRole('button', { name: 'Settings for Time Writing', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Settings for Time Writing', exact: true }).count(), 1, 'one ⚙, in the tile')
  const capacityTile = tile(page, 'Capacity')
  await capacityTile.getByText(`${capacity}h`, { exact: true }).waitFor()
  assert.equal(await text(capacityTile), `Capacity ${capacity}h ${contractual}h contractual − 40h leave · leave and holidays: actual if recorded, else planned`, 'the leave counts as planned: no Completed Work yet')
  const planned = tile(page, 'Planned hours')
  assert.equal(await text(planned), `Planned hours 48${Math.round(48 / capacity * 100)}% Original Estimate without leave and holidays · % of capacity`, 'work 40 h + training 8 h; the 40 h leave is not in Planned')
  assert.match(await text(tile(page, 'Actual hours')), /^Actual hours — Completed Work without leave and holidays/, 'nothing recorded yet')
  await shot(page, 'leave-capacity-1-time-writing')
  // My dashboard: the same Planned and Capacity; ⓘ of My hours names what was taken off.
  await navigate(page, 'My dashboard')
  const plannedMetric = tile(page, 'Planned')
  await plannedMetric.getByText('48h', { exact: true }).waitFor()
  assert.equal(await text(plannedMetric), `Planned 48h Capacity ${capacity}h`)
  await shot(page, 'leave-capacity-2-my-dashboard')
  assert.deepEqual(errors, [])
  await context.close()
})
