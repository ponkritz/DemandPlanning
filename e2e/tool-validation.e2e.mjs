import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'
import { navigate, openPage, startApp } from './helpers.mjs'

let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })
const root = 'tool-validation/demandplanning'
const bytes = Buffer.from([80, 75, 3, 4, 0, 255, 12, 33])
const config = { owner: 'synthetic', repo: 'private-docs', branch: 'main', path: 'planning-data.json' }

async function configure(page) {
  await page.evaluate((config) => {
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify(config))
    localStorage.setItem('demand-planning-git-token-v1', 'synthetic-read-only-token')
    localStorage.setItem('demand-planning-setup-guide-v1', 'dismissed')
  }, config)
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
}

async function exercise(page, nativeDownload) {
  page.setDefaultTimeout(15_000)
  let denied = false
  const calls = []
  await page.route('https://api.github.com/**', async (route) => {
    const request = route.request(), url = new URL(request.url())
    assert.equal(request.method(), 'GET')
    assert.equal(request.headers().authorization, 'Bearer synthetic-read-only-token')
    assert.ok(!url.href.includes('synthetic-read-only-token'))
    calls.push(url.pathname)
    if (url.pathname === '/repos/synthetic/private-docs') return route.fulfill({ json: { permissions: { push: false } } })
    const path = decodeURIComponent(url.pathname.split('/contents/')[1] ?? '')
    if (!path.startsWith(root)) return route.fulfill({ status: 404, json: {} })
    if (denied) return route.fulfill({ status: 403, json: { message: 'Denied' } })
    if (request.headers().accept === 'application/vnd.github.raw+json') return route.fulfill({ body: bytes, contentType: 'application/octet-stream' })
    const names = path === `${root}/blank-templates` ? ['Example.docx'] : path === `${root}/records` ? ['Draft.md'] : []
    return route.fulfill({ json: names.map((name) => ({ type: 'file', name, path: `${path}/${name}`, sha: 'a'.repeat(40), size: bytes.length })) })
  })
  await configure(page)
  await navigate(page, 'Documentation')
  await page.getByRole('button', { name: 'Tool Validation Package', exact: true }).click()
  await page.getByRole('button', { name: 'Load documents', exact: true }).click()
  await page.getByRole('button', { name: 'Download Example.docx', exact: true }).waitFor()
  assert.match(await page.locator('.content').innerText(), /Blank templates/)
  assert.match(await page.locator('.content').innerText(), /Draft records/)
  await page.getByRole('textbox', { name: 'Find document' }).fill('Example')
  assert.equal(await page.getByRole('button', { name: 'Download Draft.md', exact: true }).count(), 0)
  const clickDownload = () => page.getByRole('button', { name: 'Download Example.docx', exact: true }).click()
  if (nativeDownload) await nativeDownload(clickDownload)
  else {
    const [download] = await Promise.all([page.waitForEvent('download'), clickDownload()])
    assert.equal(download.suggestedFilename(), 'Example.docx')
    assert.deepEqual(readFileSync(await download.path()), bytes)
  }
  denied = true
  await page.getByRole('button', { name: 'Refresh documents', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Contents: Read' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Download Example.docx', exact: true }).count(), 0)
  assert.ok(calls.some((path) => path.endsWith('/blank-templates/Example.docx')))
  await page.getByRole('button', { name: 'Connection settings', exact: true }).click()
  await page.getByRole('button', { name: 'Change connection…', exact: true }).waitFor()
}

test('TC-DOC-04: Web shows configuration guidance then downloads private originals with a read-only PAT', async () => {
  const { page, context, errors } = await openPage(app)
  try {
    await navigate(page, 'Documentation')
    await page.getByRole('button', { name: 'Tool Validation Package', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: 'Load documents', exact: true }).isDisabled(), true)
    assert.match(await page.locator('.content').innerText(), /Configure your GitHub PAT/)
    await exercise(page)
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('TC-DOC-04: Windows Desktop downloads the same private original through the shared UI', { skip: process.platform !== 'win32', timeout: 90_000 }, async () => {
  const profile = mkdtempSync(join(tmpdir(), 'demand-validation-e2e-'))
  const require = createRequire(import.meta.url)
  let desktop
  try {
    desktop = await _electron.launch({ executablePath: require('electron'), args: ['.', `--user-data-dir=${profile}`], cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, VITE_DEV_SERVER_URL: app.url } })
    const page = await desktop.firstWindow({ timeout: 20_000 })
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((window) => { window.webContents.setBackgroundThrottling(false); window.hide() }))
    await desktop.evaluate(({ session }, output) => {
      session.defaultSession.on('will-download', (_event, item) => {
        item.setSavePath(output)
        item.once('done', (_event, state) => { globalThis.validationDownload = { state, name: item.getFilename(), path: item.getSavePath() } })
      })
    }, join(profile, 'download.docx'))
    await page.locator('.sidebar nav').waitFor()
    await exercise(page, async (click) => {
      await click()
      const deadline = Date.now() + 15_000
      let result
      while (!result && Date.now() < deadline) {
        result = await desktop.evaluate(() => globalThis.validationDownload)
        if (!result) await new Promise((resolve) => setTimeout(resolve, 100))
      }
      assert.equal(result?.state, 'completed', 'Electron native download completed')
      assert.equal(result.name, 'Example.docx')
      assert.deepEqual(readFileSync(result.path), bytes)
    })
  } finally {
    if (desktop) await desktop.close()
    rmSync(profile, { recursive: true, force: true })
  }
})
