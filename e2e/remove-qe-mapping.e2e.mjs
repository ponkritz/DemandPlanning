import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { loadSample, navigate, startApp, text } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'

// QE Mapping removed (NAV-54, CON-117, MYD-30, GIT-28, EPS-09; TC-NAV-54, TC-MYD-15, TC-GIT-23, UAT): the menu, Home and a
// remembered pin no longer show it; a My dashboard block of its source says the source was removed and can be removed;
// the Tool Owner deletes qe-mapping.json from the mocked GitHub (e2e/fakeGitHub.mjs) in one commit after Download a copy.
// Synthetic data only; every step waits for what it needs, never for a time. REMOVE_QE_SHOTS=<folder> saves the
// screenshots (1440 px, light, scale 2).
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const lead = 'ana.costa@example.com'
const policy = () => { const value = defaultPolicy(); value.defaultRole = 'Team Member'; value.members = { [lead]: ['Tool Owner'] }; return serializeAccess(value) }
const mapping = () => JSON.stringify({ schema: 1, kind: 'qe-mapping', sheets: [{ id: 's1', name: 'Resources', columns: [{ id: 'c1', name: 'Platform' }, { id: 'c2', name: 'QE Name' }], rows: [
  { id: 'r1', cells: { c1: 'Example Platform', c2: 'Alex Example' } },
] }] })
// My personal views as an earlier version saved them: QE Mapping pinned, a block over the QE Mapping source.
const views = () => JSON.stringify({ schema: 1, kind: 'personal-views', sections: {}, menu: { pinned: ['qemapping', 'snapshots'], hidden: [] }, filters: {
  'my-dashboard': { blocks: [{ id: 'qe1', type: 'table', title: 'QEs per platform', source: 'qe:s1', columns: [] }], sizes: {} },
} })
// The DP bulk Epic's Feature setup still names only the old QE Mapping columns (no QE page yet, EPS-09).
const featureSetup = () => JSON.stringify({ schema: 1, kind: 'feature-setup', epics: [{ epicId: 15000, epicTitle: 'Example DP releases', featureDoD: 'Done when reviewed.', stories: [], qeColumns: { matchColumn: 'Platform', qeColumn: 'QE Name' } }] })
const repository = () => fakeGitHub({ files: { 'access.json': policy(), 'qe-mapping.json': mapping(), 'feature-setup.json': featureSetup(), [`personal-views/${lead}.json`]: views() } })
const shots = process.env.REMOVE_QE_SHOTS

async function open(gh) {
  const context = await app.browser.newContext({ viewport: { width: shots ? 1440 : 1300, height: 1000 }, deviceScaleFactor: shots ? 2 : 1, acceptDownloads: true })
  await context.addInitScript((work) => {
    localStorage.setItem('demand-planning-setup-guide-v1', 'dismissed')
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', work)
    localStorage.setItem('demand-planning-my-name-v1', 'Ana Costa')
    localStorage.setItem('demand-planning-bulk-epics-v1', JSON.stringify({ DP: 15000 }))
  }, lead)
  await context.route('https://dev.azure.com/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await context.route('https://api.github.com/**', gh.route)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const slowdown = Number(process.env.E2E_CPU_SLOWDOWN ?? 1)
  if (slowdown > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: slowdown })
  // The guide that opens when Azure DevOps cannot be read is closed whenever it shows.
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, () => guide.getByRole('button', { name: 'Close', exact: true }).last().click())
  await page.goto(app.url)
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors }
}
async function shoot(page, name) {
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.screenshot({ path: `${shots}/${name}-1440-light.png` })
}
const quiet = (errors) => errors.filter((entry) => !/401|Unauthorized/.test(entry))
const labels = async (page, heading) => (await page.locator('.sidebar nav .nav-section', { has: page.locator('.nav-group', { hasText: heading }) }).locator('.nav-items button').allInnerTexts()).map((entry) => entry.replace(/^\s*\S+\s*/u, '').replace(/\s+/g, ' ').trim())

test('TC-NAV-54: no QE Mapping in the menu, on Home or among the pins — a pin kept from an earlier version is left out', async () => {
  const gh = repository()
  const { page, context, errors } = await open(gh)
  // The pins come from the personal views in Git: Snapshots shows, the QE Mapping pin does not.
  await page.locator('.sidebar .nav-pinned button', { hasText: 'Snapshots' }).waitFor()
  assert.deepEqual(await labels(page, 'PINNED'), ['Snapshots'], 'the QE Mapping pin falls away')
  assert.deepEqual(await labels(page, 'DATA & GOVERNANCE'), ['Baselines', 'Snapshots', 'Backlog Health', 'Documentation'])
  assert.equal(await page.locator('.sidebar nav button', { hasText: 'QE Mapping' }).count(), 0)
  await shoot(page, 'menu-without-qe-mapping')
  await page.locator('.sidebar nav button', { hasText: 'Home' }).first().click()
  const titles = (await page.locator('.home-tile-title').allInnerTexts()).map((entry) => entry.trim())
  assert.ok(titles.includes('Snapshots & Documents') && !titles.includes('QE Mapping'), `no QE Mapping tile: ${titles.join(', ')}`)
  await page.getByLabel('Search pages').fill('qe mapping')
  assert.match(await text(page.locator('.home')), /Nothing matches “qe mapping”/)
  assert.deepEqual(quiet(errors), [])
  await context.close()
})

test('TC-MYD-15: a My dashboard block of the removed QE Mapping says its data source was removed; Remove block… removes it', async () => {
  const gh = repository()
  const { page, context, errors } = await open(gh)
  await loadSample(page)
  await navigate(page, 'My dashboard')
  const block = page.locator('.content .dsh-block', { has: page.locator('h2', { hasText: 'QEs per platform' }) })
  await block.locator('.notice', { hasText: 'This block’s data source (QE Mapping) was removed.' }).waitFor()
  assert.equal(await block.locator('table, svg').count(), 0, 'no rows shown')
  await block.scrollIntoViewIfNeeded()
  await shoot(page, 'dashboard-block-removed-source')
  await block.getByRole('button', { name: 'Remove block…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Remove the block' })
  await dialog.getByRole('button', { name: 'Remove block' }).click()
  await dialog.waitFor({ state: 'detached' })
  await block.waitFor({ state: 'detached' })
  assert.deepEqual(quiet(errors), [])
  await context.close()
})

test('TC-GIT-23: the Tool Owner downloads a copy of qe-mapping.json, then deletes it from Git in one commit; the notice is gone', async () => {
  const gh = repository()
  const { page, context, errors } = await open(gh)
  await navigate(page, 'Data & sharing')
  await page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'Shared setup in Git' }).click()
  const notice = page.locator('.retired-file[data-file="qe-mapping.json"]')
  await notice.waitFor()
  assert.match(await text(notice), /qe-mapping\.json is no longer used by the app — Delete it from Git/)
  const remove = notice.getByRole('button', { name: 'Delete it from Git…' })
  assert.equal(await remove.isDisabled(), true, 'Download a copy first')
  assert.equal(await text(notice.locator('.write-blocked')), 'Download a copy first.')
  const [download] = await Promise.all([page.waitForEvent('download'), notice.getByRole('button', { name: 'Download a copy' }).click()])
  assert.match(download.suggestedFilename(), /^qe-mapping-copy-\d{4}-\d{2}-\d{2}\.json$/)
  assert.equal(readFileSync(await download.path(), 'utf8'), mapping(), 'the copy is the file as it is in Git')
  await notice.getByRole('button', { name: 'Download a copy again' }).waitFor()
  assert.equal(await remove.isDisabled(), false)
  await shoot(page, 'delete-notice')
  await remove.click()
  const dialog = page.getByRole('dialog', { name: 'Delete qe-mapping.json from Git' })
  await dialog.waitFor()
  assert.equal(await text(dialog.locator('.eyebrow')), 'GIT · SHARED SETUP')
  assert.match(await text(dialog), /One commit deletes qe-mapping\.json from the Git data repository/)
  await dialog.locator('.notice', { hasText: 'Set the QE page in each bulk Epic\'s Feature setup first: Epic #15000 (DP) still uses the old QE Mapping columns only.' }).waitFor()
  await shoot(page, 'delete-confirmation')
  const before = gh.writes.length
  await dialog.getByRole('button', { name: 'Delete from Git' }).click()
  await dialog.waitFor({ state: 'detached' })
  await page.locator('.notice.success', { hasText: 'qe-mapping.json was deleted from Git in one commit' }).waitFor()
  const deletes = gh.writes.slice(before).filter((entry) => entry.paths.includes('qe-mapping.json'))
  assert.equal(deletes.length, 1, 'one commit')
  assert.deepEqual(deletes[0].paths, ['qe-mapping.json'], 'only that file')
  assert.match(deletes[0].message, /^Delete qe-mapping\.json: no longer used by the app \(QE Mapping removed\)/)
  assert.equal(gh.read('qe-mapping.json'), null, 'gone from Git; its history stays')
  assert.equal(await notice.count(), 0, 'the notice is gone')
  // Shown only while the file exists: after a reload the section reads Git again and shows no notice.
  const read = page.waitForResponse((response) => new URL(response.url()).pathname === '/repos/example/storage/contents/qe-mapping.json' && response.status() === 404)
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, 'Data & sharing')
  await page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'Shared setup in Git' }).click()
  await page.locator('.panel', { has: page.locator('h2', { hasText: /^Views in Git/ }) }).waitFor()
  await read
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  assert.equal(await page.locator('.retired-file').count(), 0, 'no notice once the file is gone')
  assert.deepEqual(quiet(errors), [])
  await context.close()
})
