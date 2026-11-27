import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { cachedRoles, navigate, openPage, startApp } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'

// TC-CON-103 (CON-141, AR-005): Restore from Git with a PAT typed for the restore. The shared setup in the mocked GitHub
// (e2e/fakeGitHub.mjs) names connections on two servers; the PAT is used only for the server chosen next to it, saved
// as that server's PAT only, and the connection on the other server is restored without a PAT and says so. Synthetic
// hosts and data only; every step waits for what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const alpha = 'https://alpha.example.invalid/tfs', beta = 'https://beta.example.invalid/tfs'
const view = (id, name, server) => ({ id, reason: name, viewName: name, role: 'release-source', showInMenu: false, url: `${server}/Coll/Project`, baseUrl: server, query: `SELECT [System.Id] FROM WorkItems WHERE [System.Title] = '${name}'` })
const serverPats = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('demand-planning-server-pats-v1') ?? '{}'))

test('TC-CON-103: a PAT typed for Restore from Git is used only for the server chosen for it', async () => {
  // The shared setup another computer saved: one stream connection on each server (taken over here at start, no PAT).
  const setup = { schema: 1, kind: 'azure-devops-views', views: [view('alpha-view', 'IOCC', alpha), view('beta-view', 'Content', beta)] }
  const gh = fakeGitHub({ files: { 'access.json': cachedRoles('Tool Owner'), 'azure-views.json': JSON.stringify(setup) } })
  const { page, context, errors } = await openPage(app, { roles: true, init: () => {
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
  } })
  await context.route('https://api.github.com/**', gh.route)
  for (const host of ['https://dev.azure.com/**', `${alpha}/**`, `${beta}/**`]) await context.route(host, (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, () => guide.getByRole('button', { name: 'Close', exact: true }).last().click())
  await page.reload()
  await page.locator('.sidebar nav').waitFor()

  await navigate(page, 'Data & history')
  await page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'Connections in Git' }).click()
  const panel = page.locator('.panel', { has: page.locator('h2', { hasText: /^Views in Git/ }) })
  await panel.waitFor()
  await panel.getByLabel('PAT for restored connections (optional)').fill('alpha-only-pat')
  const server = panel.getByRole('combobox', { name: 'Server of the PAT for restored connections' })
  assert.equal(await server.inputValue(), '', 'no server chosen to begin with')

  // Without a server the restore stops and lists the servers of the file; nothing is saved.
  await panel.getByRole('button', { name: 'Restore from Git' }).click()
  await panel.locator('.notice', { hasText: 'The connections in Git are on 2 servers. Choose the server of the PAT next to it' }).waitFor()
  await server.locator('option', { hasText: beta }).waitFor({ state: 'attached' })
  assert.deepEqual(await server.locator('option').allTextContents(), ['Choose the server…', alpha, beta])
  assert.deepEqual(await serverPats(page), {}, 'no PAT saved yet')

  // With the server chosen: only that server gets the PAT; the other connection says it has none.
  await server.selectOption(alpha)
  page.once('dialog', (dialog) => { assert.match(dialog.message(), /The PAT entered is used only for connections on https:\/\/alpha\.example\.invalid\/tfs\./); void dialog.accept() })
  await panel.getByRole('button', { name: 'Restore from Git' }).click()
  await panel.locator('.notice', { hasText: 'No PAT here for: Content' }).waitFor()
  assert.deepEqual(await serverPats(page), { [alpha]: 'alpha-only-pat' }, 'saved as the chosen server\'s PAT only')
  const tokens = await page.evaluate(() => Object.fromEntries(JSON.parse(localStorage.getItem('demand-planning-azure-connection-profiles-v1') ?? '[]').map((profile) => [profile.id, profile.token ?? ''])))
  assert.equal(tokens['beta-view'], '', 'the other server\'s connection has no PAT')
  assert.equal(await panel.getByLabel('PAT for restored connections (optional)').inputValue(), '', 'the field is cleared')
  assert.deepEqual(errors, [])
  await context.close()
})
