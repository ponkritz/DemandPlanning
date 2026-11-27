import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { navigate, openPage, profileItem, startApp, text } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'

// TC-SET-11 (UAT): starter views per access role (SET-21…SET-25), against one mocked GitHub shared by two browsers. The
// admin adds a starter view for the Team Member role in Admin → Data & history → Other views; a Team Member opens the app
// and finds a copy among their own My views; they delete it, start again and it stays gone; they add a view of their own.
// Synthetic data only; every step waits for what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const shots = process.env.E2E_SHOTS
const profilesKey = 'demand-planning-azure-connection-profiles-v1'
const policy = defaultPolicy()
policy.defaultRole = 'Team Member'
policy.members = { 'admin@example.com': ['Admin'] }
const until = async (check, what) => { for (const end = Date.now() + 60000; Date.now() < end;) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 50)) } assert.fail(`timed out waiting for ${what}`) }
const ids = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]').map((entry) => entry.id).sort(), profilesKey)

// A person with Git storage connected, their Time Writing connection (a server for the views) and a PAT for it.
async function open(gh, email) {
  const tw = { id: `tw-${email.split('@')[0]}`, url: 'https://dev.azure.com/example/Project/_backlogs/backlog/Team%20A/Features', reason: 'Time Writing', token: 'x'.repeat(52), role: 'time-tracking', creatorEmail: email }
  const { page, context, errors } = await openPage(app, { width: 1440, height: 1000, ...(shots ? { scale: 2 } : {}), init: ({ profiles, who }) => {
    if (!localStorage.getItem('demand-planning-azure-connection-profiles-v1')) localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify(profiles))
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', who)
  }, initArg: { profiles: [tw], who: email } })
  await context.route('https://api.github.com/**', gh.route)
  await context.route('https://dev.azure.com/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, () => guide.getByRole('button', { name: 'Close', exact: true }).last().click())
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors }
}
// At 390 px the menu slides out of view first (waited for, not timed); `focus` is scrolled into view for the picture.
async function shot(page, name, focus) {
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  for (const [width, label] of [[1440, '1440'], [390, '390']]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    if (width === 390) await page.waitForFunction(() => { const bar = document.querySelector('.sidebar'); return !bar || bar.getBoundingClientRect().right <= 1 })
    if (focus) await focus.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${shots}/${name}-${label}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
}
async function myViews(page) {
  await profileItem(page, 'My settings')
  await page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'My views' }).click()
  return page.locator('.my-views')
}

test('TC-SET-11: the admin sets up a starter view for Team Members — a Team Member finds it in My views, deletes it and it stays gone, and adds their own', async () => {
  const gh = fakeGitHub({ files: { 'access.json': serializeAccess(policy) } })
  // The admin adds the starter view for the Team Member role.
  const admin = await open(gh, 'admin@example.com')
  await navigate(admin.page, 'Data & history')
  await admin.page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'Other views' }).click()
  const panel = admin.page.locator('.role-starter-views')
  await panel.getByText('No starter views yet.').waitFor()
  await panel.getByRole('button', { name: '＋ Add starter view' }).click()
  const form = admin.page.getByRole('form', { name: 'Starter view' })
  await form.getByLabel('Name').fill('Team open bugs')
  await form.getByLabel('Server').selectOption({ index: 1 })
  await form.getByLabel('Project').fill('Project')
  await form.getByLabel('Query (WIQL)').fill("SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Bug' AND [System.State] <> 'Closed'")
  await form.getByLabel('Team Member').check()
  await form.getByRole('button', { name: 'Save to Git' }).click()
  await panel.getByText(/“Team open bugs” saved for Team Member/).waitFor()
  const saved = JSON.parse(gh.read('other-views/role-starters.json'))
  assert.deepEqual(saved.views.map((view) => [view.name, view.roles, view.server, view.project]), [['Team open bugs', ['Team Member'], 'https://dev.azure.com/example', 'Project']])
  assert.equal(gh.read('other-views/role-starters.json').includes('x'.repeat(52)), false, 'no PAT in Git')
  await shot(admin.page, 'starter-views-admin', panel)
  // The admin's own role (Admin) has no starter view: nothing is copied for them.
  assert.equal((await ids(admin.page)).some((id) => id.startsWith('my-starter-')), false)

  // A Team Member opens the app: the starter view is among their My views.
  const member = await open(gh, 'tm@example.com')
  await until(async () => (await ids(member.page)).some((id) => id.startsWith('my-starter-')), 'the starter view copied into My views')
  const views = await myViews(member.page)
  const row = views.locator('tbody tr', { hasText: 'Team open bugs' })
  await row.waitFor()
  assert.match(await text(row), /Starter view for your role/)
  await shot(member.page, 'starter-views-my-views', views)
  // They delete it; after a new start it stays gone.
  await row.getByRole('button', { name: 'Delete…' }).click()
  const dialog = member.page.getByRole('dialog').filter({ hasText: 'Team open bugs' })
  await dialog.getByRole('button', { name: /^Delete/ }).last().click()
  await until(async () => !(await ids(member.page)).some((id) => id.startsWith('my-starter-')), 'the copy deleted')
  await member.page.reload()
  await member.page.locator('.sidebar nav').waitFor()
  // The start-up copy step has run (it records the starter as applied) and copied nothing.
  await until(() => member.page.evaluate(() => (localStorage.getItem('demand-planning-starter-views-applied-v1') ?? '').includes('starter-')), 'the start-up step')
  await myViews(member.page)
  await member.page.locator('.my-views').getByText('No views of your own yet.').waitFor()
  assert.equal((await ids(member.page)).some((id) => id.startsWith('my-starter-')), false, 'a deleted starter view does not come back')
  // They add a view of their own.
  const add = member.page.getByRole('form', { name: 'Add my view' })
  await add.getByLabel('Name').fill('My own queue')
  await add.getByLabel('Server (with your PAT)').selectOption({ index: 1 })
  await add.getByLabel('Project').fill('Project')
  await add.getByLabel('Query (WIQL)').fill("SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] = @Me")
  await add.getByRole('button', { name: 'Add my view' }).click()
  await member.page.locator('.my-views table', { hasText: 'My own queue' }).waitFor()
  for (const run of [admin, member]) assert.deepEqual(run.errors.filter((entry) => !/401|Unauthorized|Failed to fetch/.test(entry)), [])
  await admin.context.close(); await member.context.close()
})
