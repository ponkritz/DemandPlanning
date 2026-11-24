import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { navigate, openPage, rolesFile, startApp, text } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'

// GIT-18 (TC-GIT-11, UAT): newer data in Git is shown per page. Against a mocked GitHub whose versions are the content's
// hash, as GitHub's are: after the viewer's own save no notice appears (KB-82); a commit by someone else to CoNQ's file
// shows the notice on CoNQ only (not on Home or another page), with who saved it and when (a commit made outside the app:
// its GitHub author, GIT-22), and Load the newer data
// shows the new row without reloading the app. The checks run every 5 minutes: the page's clock is moved on.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const email = 'qe.lead@example.com'
const signIn = (work) => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'test-token')
  localStorage.setItem('demand-planning-work-email-v1', work)
}
const version = (content) => createHash('sha1').update(content).digest('hex')
const row = (id, seq, category) => ({ id, key: `CONQ-2611${20 + seq}-K7Q${seq}`, seq, addedBy: 'ana@example.com', addedAt: '2026-11-20T08:00:00.000Z', cells: { c1: category } })
const conqFile = (rows) => JSON.stringify({ schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ', description: 'Cost of Non-Quality', keyPrefix: 'CONQ', columns: [{ id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Complaint'] }], rows })
const supplierFile = (issue) => JSON.stringify({ schema: 1, kind: 'on-demand-page', id: 'supplier-issues', name: 'Supplier issues', description: '', keyPrefix: 'SUPPLIER', columns: [{ id: 'c1', name: 'Issue', type: 'text' }], rows: [{ id: 's1', key: 'SUPPLIER-261120-AB2C', seq: 1, cells: { c1: issue } }] })

// The data repository: files by path; listings and reads give each file's version, a save returns the new one.
async function mockGitHub(context, files) {
  const writes = [], commits = [], waiting = []
  await context.route('https://dev.azure.com/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await context.route('https://api.github.com/**', (route) => {
    const request = route.request(), url = new URL(request.url())
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/repos/example/storage') return json({ visibility: 'private', permissions: { push: true } })
    if (url.pathname === '/repos/example/storage/commits') {
      const path = url.searchParams.get('path')
      commits.push(path)
      for (const waiter of waiting.filter((entry) => entry.path === path)) { waiting.splice(waiting.indexOf(waiter), 1); waiter.resolve() }
      return json(path === 'on-demand/conq.json' ? [{ sha: 'c'.repeat(40), commit: { message: 'CoNQ: add row', author: { name: 'Ben Example', date: '2026-11-23T10:15:00Z' } } }] : [])
    }
    const match = /^\/repos\/example\/storage\/contents\/(.*)$/.exec(url.pathname)
    if (!match) return json({ message: 'Not Found' }, 404)
    const path = decodeURIComponent(match[1])
    if (request.method() === 'PUT') {
      if (path === '.demand-planning-write-check') return json({ message: 'Invalid request' }, 422)
      const body = JSON.parse(request.postData())
      files[path] = Buffer.from(body.content, 'base64').toString()
      writes.push({ path, data: JSON.parse(files[path]) })
      return json({ content: { sha: version(files[path]) }, commit: { html_url: `https://github.com/example/storage/commit/${writes.length}` } })
    }
    if (path === 'access.json') return json(rolesFile('Tool Owner'))
    const folder = Object.keys(files).filter((file) => path === '' ? !file.includes('/') : file.startsWith(`${path}/`))
    if (path === '' || folder.length) return json([...folder.map((file) => ({ type: 'file', name: file.slice(path ? path.length + 1 : 0), path: file, sha: version(files[file]) })), ...(path === '' ? [{ type: 'file', name: 'access.json', path: 'access.json', sha: 'roles' }] : [])])
    if (files[path] != null) return json({ type: 'file', encoding: 'base64', content: Buffer.from(files[path]).toString('base64'), sha: version(files[path]) })
    return json({ message: 'Not Found' }, 404)
  })
  // Resolves when the history of `path` is read (who saved it and when): the check found it newer.
  const commitRead = (path) => new Promise((resolve) => { waiting.push({ path, resolve }) })
  return { writes, commitRead }
}

test('TC-GIT-11: newer data in Git shows on the page that uses it — never after your own save; on CoNQ only when someone else changed CoNQ; Load the newer data shows it without reloading the app', async () => {
  const files = { 'on-demand/conq.json': conqFile([row('r1', 1, 'Scrap'), row('r2', 2, 'Rework')]), 'on-demand/supplier-issues.json': supplierFile('Late delivery') }
  const { page, context, errors } = await openPage(app, { init: signIn, initArg: email })
  const { writes, commitRead } = await mockGitHub(context, files)
  await page.clock.install()
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, 'CoNQ')
  const rows = page.locator('.od-panel table tbody tr')
  await rows.filter({ hasText: 'CONQ-0002' }).waitFor()
  const notice = page.locator('.page-git-notice')

  // Your own save: a row changed in the drawer and saved to Git at once.
  await rows.filter({ hasText: 'CONQ-0001' }).locator('td', { hasText: 'Scrap' }).click()
  const drawer = page.locator('aside.drawer[role="dialog"]')
  await drawer.getByRole('button', { name: 'Edit', exact: true }).click()
  await drawer.getByLabel('Category', { exact: true }).selectOption('Complaint')
  await drawer.getByRole('button', { name: 'Save to Git' }).click()
  await drawer.locator('.od-row-values').waitFor()
  assert.equal(writes.filter((write) => write.path === 'on-demand/conq.json').length, 1)
  await page.keyboard.press('Escape')
  await drawer.waitFor({ state: 'detached' })
  // Meanwhile someone else changes Supplier issues; the next check (5 minutes on) finds it.
  files['on-demand/supplier-issues.json'] = supplierFile('Late delivery, second time')
  await page.clock.fastForward('05:01')
  // The check has run once Supplier issues shows its notice …
  await navigate(page, 'Supplier issues')
  await notice.waitFor()
  assert.match(await text(notice), /^Newer data in Git for Supplier issues: Supplier issues — saved by someone else\. Load the newer data$/)
  // … and your own save raised none: not on CoNQ, not on Home.
  await navigate(page, 'CoNQ')
  await rows.filter({ hasText: 'CONQ-0002' }).waitFor()
  assert.equal(await notice.count(), 0, 'your own save is not newer data (KB-82)')
  await navigate(page, 'Home')
  assert.equal(await notice.count(), 0)

  // Someone else adds a row to CoNQ while you are on Home: nothing shows on Home.
  files['on-demand/conq.json'] = conqFile([...JSON.parse(files['on-demand/conq.json']).rows, row('r3', 3, 'Rework')])
  const read = commitRead('on-demand/conq.json')
  await page.clock.fastForward('05:01')
  await read
  await navigate(page, 'Supplier issues')
  await notice.waitFor()
  assert.doesNotMatch(await text(notice), /CoNQ/, 'Supplier issues shows its own file only')
  await navigate(page, 'Home')
  assert.equal(await notice.count(), 0, 'nothing on Home')
  // On CoNQ: the notice names the page, who saved it and when.
  await page.evaluate(() => { window.__notReloaded = true })
  await navigate(page, 'CoNQ')
  await notice.waitFor()
  assert.match(await text(notice), /^Newer data in Git for CoNQ: CoNQ — saved by Ben Example on .+\. Load the newer data$/)
  assert.equal(await rows.filter({ hasText: 'CONQ-0003' }).count(), 0)
  // Load the newer data: CoNQ is read again — the new row shows, the notice goes, the app is not reloaded.
  await notice.getByRole('button', { name: 'Load the newer data' }).click()
  await rows.filter({ hasText: 'CONQ-0003' }).waitFor()
  await notice.waitFor({ state: 'detached' })
  assert.equal(await page.evaluate(() => window.__notReloaded), true, 'no full reload')
  assert.equal(await page.locator('.jobs-panel', { hasText: 'Newer data' }).count(), 0, 'not a Background jobs entry')
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

// GIT-22, GIT-23 (TC-GIT-14, TC-GIT-15): against one mocked GitHub shared by two people (e2e/fakeGitHub.mjs). The Tool
// Owner's save is signed with the app user, so Cleo's notice names them, not the GitHub account; a newer access.json is
// loaded quietly on Cleo's page — her rights change in place and an info line says who changed what — while the Tool
// Owner on People & roles gets the notice.
const tool = 'tool.owner@example.com', cleo = 'cleo@example.com'
const policy = (rowsForTeam = false) => { const value = defaultPolicy(); value.defaultRole = 'Team Member'; value.members = { [tool]: ['Tool Owner'], [cleo]: ['Team Member'] }; if (rowsForTeam) value.roles['Team Member'].actions.push('ondemand.edit'); return serializeAccess(value) }
async function person(gh, work) {
  const context = await app.browser.newContext({ viewport: { width: 1300, height: 1000 } })
  await context.clock.install()
  await context.addInitScript(signIn, work)
  await context.addInitScript(() => { localStorage.setItem('demand-planning-setup-guide-v1', 'dismissed') })
  await context.route('https://dev.azure.com/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await context.route('https://api.github.com/**', gh.route)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const slowdown = Number(process.env.E2E_CPU_SLOWDOWN ?? 1)
  if (slowdown > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: slowdown })
  await page.goto(app.url)
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors }
}
// The open-app check runs every 5 minutes: the clock is moved on until the locator shows.
async function checkUntil(page, locator) {
  for (let i = 0; i < 6; i++) {
    await page.clock.fastForward('05:01')
    if (await locator.waitFor({ timeout: 3000 }).then(() => true, () => false)) return
  }
  throw new Error('The open-app check never showed the change')
}

test('TC-GIT-14: the notice names the app user who saved, not the GitHub account; TC-GIT-15: a change of the access roles is loaded quietly — the rights change in place with an info line, the notice only on People & roles', async () => {
  const gh = fakeGitHub({ files: { 'access.json': policy(), 'on-demand/conq.json': conqFile([row('r1', 1, 'Scrap'), row('r2', 2, 'Rework')]) } })
  const owner = await person(gh, tool)
  const c = await person(gh, cleo)
  for (const { page } of [owner, c]) { await navigate(page, 'CoNQ'); await page.locator('.od-panel table tbody tr', { hasText: 'CONQ-0002' }).waitFor() }
  const addRow = c.page.getByRole('button', { name: '＋ Add row' })
  assert.equal(await addRow.isDisabled(), true, 'a Team Member may not edit rows yet')

  // The Tool Owner changes a row: the commit names the app user after the [saved …] stamp (GIT-22).
  await owner.page.locator('.od-panel table tbody tr', { hasText: 'CONQ-0001' }).locator('td', { hasText: 'Scrap' }).click()
  const drawer = owner.page.locator('aside.drawer[role="dialog"]')
  await drawer.getByRole('button', { name: 'Edit', exact: true }).click()
  await drawer.getByLabel('Category', { exact: true }).selectOption('Complaint')
  await drawer.getByRole('button', { name: 'Save to Git' }).click()
  await drawer.locator('.od-row-values').waitFor()
  const saved = gh.writes.filter((write) => write.paths.includes('on-demand/conq.json')).at(-1)
  assert.match(saved.message, / \[saved \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ\] \[by tool\.owner@example\.com\]$/)
  assert.doesNotMatch(saved.message, /test-token/)
  await owner.page.keyboard.press('Escape')
  // Cleo's notice names the Tool Owner as the app knows them (the mocked GitHub's author is "someone").
  const notice = c.page.locator('.page-git-notice')
  await checkUntil(c.page, notice)
  assert.match(await text(notice), /^Newer data in Git for CoNQ: CoNQ — saved by tool\.owner@example\.com on .+\. Load the newer data$/)

  // An Admin gives Team Members "Edit On-Demand data (rows)" in another app; the Tool Owner is on People & roles.
  await navigate(owner.page, 'People & roles')
  gh.put('access.json', policy(true), 'main', 'Update access.json [saved 2026-11-23T10:15:00Z] [by Rita Gomez <rita.gomez@example.com>]')
  // Cleo, on CoNQ: no Access notice; her rights change in place and the info line says who changed what.
  const note = c.page.locator('.access-changed-note')
  await checkUntil(c.page, note)
  assert.equal(await text(note), 'Your access was changed by Rita Gomez: you can now edit On-Demand data (rows). Dismiss')
  assert.doesNotMatch(await text(notice), /Access/, 'the roles are not a notice on CoNQ')
  assert.equal(await addRow.isDisabled(), false, 'the rights updated in place')
  assert.equal(await c.page.locator('.jobs-panel', { hasText: 'Your access' }).count(), 0, 'not a Background jobs entry')
  // Once: gone on the next page.
  await navigate(c.page, 'Home')
  assert.equal(await note.count(), 0)
  // The Tool Owner on People & roles (where roles may be being edited): the notice, naming Rita Gomez.
  const roles = owner.page.locator('.page-git-notice')
  await checkUntil(owner.page, roles)
  assert.match(await text(roles), /^Newer data in Git for People & roles: Access — saved by Rita Gomez on .+\. Load the newer data$/)
  for (const { errors } of [owner, c]) assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await owner.context.close(); await c.context.close()
})
