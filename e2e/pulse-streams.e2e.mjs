import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { fixture, infoText, navigate, openPage, startApp, text, toggleFilter } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'

// Pulse Check's Streams filter (QV-66, QV-67; TC-QV-47 UAT, TC-QV-48): a stream left out is shown greyed and marked
// "Not counted", and every release total of the page ignores it — the Month tabs and the Quarter view with its Change;
// the Tool Owner saves the choice as the team default in the shared views defaults in Git, another person sees it,
// changes it for themselves and goes back with "Use the view for everyone"; a person without the right gets no Save
// option. Synthetic data only; every step waits for what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const filterLabel = 'Streams not counted'

test('TC-QV-47: Pulse Check — S&S IT not counted: greyed and marked, left out of the Supported total, the Windchill exports table and the Quarter total and Change', async () => {
  const { page, context, errors } = await openPage(app, { roles: true })
  await navigate(page, 'Import Windchill export')
  await page.getByLabel(/name/i).first().fill('S&S IT').catch(() => {})
  await page.locator('input[type=file]').first().setInputFiles(fixture('windchill-export.csv'))
  await page.locator('.panel').filter({ has: page.locator('h2, h3', { hasText: /^Releases/ }) }).first().waitFor()
  await navigate(page, 'Pulse Check')
  await page.locator('header.topbar input[type=month]').fill('2026-11')
  await page.getByRole('tab', { name: /^Releases ·/ }).click()
  const supported = page.locator('.supported-summary')
  await supported.waitFor()
  assert.match(await text(supported), /October 2026 · 4 supported releases/)
  assert.match(await text(page.getByRole('button', { name: new RegExp(`^${filterLabel}: `) })), /None — every stream counts/)

  // Leave S&S IT out: still listed, greyed and marked; the total ignores it.
  await toggleFilter(page, filterLabel, 'S&S IT')
  await supported.getByText('October 2026 · 0 supported releases').waitFor()
  const line = supported.locator('li.not-counted', { hasText: 'S&S IT [4]' })
  await line.waitFor()
  assert.match(await text(line), /^Not counted S&S IT \[4\]/)
  assert.match(await infoText(page, supported), /Not counted \(Streams filter\): S&S IT\./, 'ⓘ names the stream not counted')
  const exportsPanel = page.locator('.panel').filter({ has: page.locator('h2', { hasText: /^Windchill exports/ }) }).first()
  assert.match(await text(exportsPanel), /2 streams · 1 not counted/)
  const row = exportsPanel.locator('tbody tr.not-counted', { hasText: 'S&S IT' })
  await row.waitFor()
  assert.match(await text(row), /Not counted/)
  // The export of the table says which stream was not counted.
  const download = page.waitForEvent('download')
  const exportButton = exportsPanel.getByRole('button', { name: /^Export/ }).first()
  const menu = /▾/.test(await exportButton.innerText())
  await exportButton.click()
  if (menu) await page.getByRole('menuitem', { name: 'CSV (.csv)' }).click()
  const { readFileSync } = await import('node:fs')
  const csv = readFileSync(await (await download).path(), 'utf8').replace(/\r\n/g, '\n')
  assert.match(csv, /Counted/)
  assert.match(csv, /S&S IT.*Not counted/)

  // The Quarter view: the same choice; the stream greyed, the total, tile and Change without it.
  await page.locator('.pulse-period select').first().selectOption('quarter')
  const releases = page.locator('.panel').filter({ has: page.locator('h2', { hasText: /^Releases · Q4 2026 vs Q3 2026/ }) }).first()
  await releases.waitFor()
  const greyed = releases.locator('tbody tr.not-counted', { hasText: 'S&S IT' })
  await greyed.waitFor()
  const counts = await greyed.locator('td').allInnerTexts()
  assert.ok(Number(counts[1]) > 0, `S&S IT still shows its releases: ${counts.join(' | ')}`)
  const total = releases.locator('tr.matrix-total')
  assert.match(await text(total), /^Total 0 0 ±0/, 'the total leaves S&S IT out in both quarters')
  const tile = page.locator('.metric-grid article', { hasText: /Releases · Q4 2026/ })
  assert.match(await text(tile), /Releases · Q4 2026 0/)
  assert.match(await infoText(page, releases), /Not counted \(Streams filter\): S&S IT\. The tiles, the total and the Change leave them out in both periods\./)
  const work = page.locator('.panel').filter({ has: page.locator('h2', { hasText: /^Work closed and opened · Q4 2026/ }) }).first()
  assert.match(await infoText(page, work), /Every Epic counts here: the Streams filter applies to the release counts only\./)
  // Counted again: the total follows.
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await releases.locator('tbody tr.not-counted').waitFor({ state: 'detached' })
  assert.doesNotMatch(await text(total), /^Total 0 0/)
  await page.locator('.pulse-period select').first().selectOption('month')
  assert.deepEqual(errors, [])
  await context.close()
})

const policy = defaultPolicy()
policy.defaultRole = 'Team Member'
policy.members = { 'owner@example.com': ['Tool Owner'], 'manager@example.com': ['People Manager'] }
const defaultsFile = 'personal-views-defaults.json'
const until = async (check, what) => { for (const end = Date.now() + 60000; Date.now() < end;) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 50)) } assert.fail(`timed out waiting for ${what}`) }
const shared = (gh) => { const file = gh.read(defaultsFile); return file ? JSON.parse(file).filters ?? {} : {} }

// A person (by work email) with Git storage connected; Azure DevOps answers nothing, so the "Could not fetch from Azure
// DevOps" guide may appear and is closed whenever it does.
async function open(gh, email) {
  const profile = { id: 'tw', url: 'https://dev.azure.com/example/Project/_backlogs/backlog/Team%20A/Features', reason: 'Time Writing', token: 'x'.repeat(52), role: 'time-tracking', creatorEmail: email }
  const { page, context, errors } = await openPage(app, { init: ({ connection, who }) => {
    localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify([connection]))
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', who)
  }, initArg: { connection: profile, who: email } })
  await context.route('https://api.github.com/**', gh.route)
  await context.route('https://dev.azure.com/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, () => guide.getByRole('button', { name: 'Close', exact: true }).last().click())
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, 'Pulse Check')
  await page.getByRole('button', { name: new RegExp(`^${filterLabel}: `) }).waitFor()
  return { page, context, errors }
}
const filterButton = (page) => page.getByRole('button', { name: new RegExp(`^${filterLabel}: `) })
const filterValue = async (page) => await filterButton(page).getAttribute('aria-label') ?? ''
const viewLine = (page) => page.getByRole('group', { name: 'View for everyone: Pulse Check streams not counted' })

test('TC-QV-48: the Tool Owner saves the streams not counted as the team default; another person sees it, changes it for themselves and goes back to it', async () => {
  const gh = fakeGitHub({ files: { 'access.json': serializeAccess(policy) } })
  const owner = await open(gh, 'owner@example.com')
  await viewLine(owner.page).getByText('The built-in view').waitFor()
  await toggleFilter(owner.page, filterLabel, 'CP')
  await toggleFilter(owner.page, filterLabel, 'ECP')
  await viewLine(owner.page).getByRole('button', { name: 'Save view for everyone' }).click()
  await until(() => Boolean(shared(gh)['pulse-streams']), 'the team default written to Git')
  assert.deepEqual(shared(gh)['pulse-streams'], { excluded: ['CP', 'ECP'] })
  assert.equal(shared(gh)['by:pulse-streams'].by, 'owner@example.com', 'who saved it, and when')
  await viewLine(owner.page).getByText(/The view for everyone, saved by owner@example\.com/).waitFor()
  assert.deepEqual(owner.errors, [])
  await owner.context.close()

  // A People Manager (Pulse Check, but not the right): the team default first; no Save option.
  const member = await open(gh, 'manager@example.com')
  await until(async () => /2 selected/.test(await filterValue(member.page)), 'the team default on the filter')
  await member.page.locator('.release-summary li.not-counted', { hasText: 'CP' }).first().waitFor()
  await viewLine(member.page).getByText(/The view for everyone, saved by owner@example\.com/).waitFor()
  assert.equal(await member.page.getByRole('button', { name: 'Save view for everyone' }).count(), 0, 'no right: no Save option')
  // Their own choice: CP counted again — kept after a reload; "Use the view for everyone" goes back.
  await toggleFilter(member.page, filterLabel, 'CP')
  await viewLine(member.page).getByRole('button', { name: 'Use the view for everyone' }).waitFor()
  assert.match(await filterValue(member.page), /: ECP$/)
  await member.page.reload()
  await member.page.locator('.sidebar nav').waitFor()
  await navigate(member.page, 'Pulse Check')
  await until(async () => /: ECP$/.test(await filterValue(member.page)), 'their own choice after a reload')
  await viewLine(member.page).getByRole('button', { name: 'Use the view for everyone' }).click()
  await until(async () => /2 selected/.test(await filterValue(member.page)), 'the team default again')
  assert.deepEqual(member.errors, [])
  await member.context.close()
})
