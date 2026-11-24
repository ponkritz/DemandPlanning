import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { menuOf, navigate, openPage, rolesFile, startApp, text } from './helpers.mjs'

// Publish standalone HTML… in a browser (OND-73…OND-77) against a mocked GitHub, with showSaveFilePicker replaced by a
// stub that keeps what is written: the Tool Owner confirms the pop-up, picks the file, and the file written holds the
// rows (not the hidden one), the charts as SVG, no external address, and its own sort and search work offline
// (TC-OND-63, UAT); in Sample and for a person who is not an owner the action is disabled with the reason (TC-OND-64).
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const columns = [
  { id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Complaint'] },
  { id: 'c2', name: 'Cost', type: 'currency', currency: 'EUR' },
  { id: 'c3', name: 'Note', type: 'text' },
]
const rows = [['Scrap', '1200 EUR', 'Wrong label <b>x</b>'], ['Rework', '80 EUR', 'Late batch'], ['Complaint', '450 EUR', 'https://example.com/not-a-link'], ['Scrap', '5 EUR', 'Hidden secret']]
  .map(([c1, c2, c3], index) => ({ id: `r${index + 1}`, seq: index + 1, key: `CONQ-260101-AAA${index + 2}`, cells: { c1, c2, c3 }, ...(index === 3 ? { hidden: { by: 'ana@example.com', at: '2026-04-01T10:00:00.000Z' } } : {}) }))
const insights = [
  { id: 'i1', title: 'Cost by category', type: 'bar', category: 'c1', measure: 'sum', value: 'c2', sort: 'value' },
  { id: 'i2', title: 'Rows', type: 'kpi', category: '', measure: 'count', sort: 'value' },
]
const conq = { schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ', description: 'Cost of Non-Quality', keyPrefix: 'CONQ', columns, rows, insights }

const init = () => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'test-token')
  localStorage.setItem('demand-planning-work-email-v1', 'ana@example.com')
  // The File System Access API: a file handle whose writes are kept for the test.
  window.__written = []
  window.showSaveFilePicker = async (options) => {
    window.__picker = options
    return { kind: 'file', name: options.suggestedName, queryPermission: async () => 'granted', requestPermission: async () => 'granted',
      createWritable: async () => { const parts = []; return { write: async (data) => { parts.push(typeof data === 'string' ? data : await data.text()) }, close: async () => { window.__written.push(parts.join('')) } } } }
  }
}
async function open(role) {
  const { page, context, errors } = await openPage(app, { init })
  const writes = []
  await context.route('https://dev.azure.com/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await context.route('https://api.github.com/**', (route) => {
    const request = route.request(), url = new URL(request.url())
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/repos/example/storage') return json({ visibility: 'private', permissions: { push: true } })
    if (url.pathname === '/repos/example/storage/commits') return json([])
    if (request.method() !== 'GET') { if (!url.pathname.endsWith('/.demand-planning-write-check')) writes.push(url.pathname); return json({ message: 'Invalid request' }, 422) }
    if (url.pathname.endsWith('/contents/access.json')) return json(rolesFile(typeof role === 'function' ? role() : role))
    if (url.pathname.endsWith('/contents/on-demand')) return json([{ type: 'file', name: 'conq.json', path: 'on-demand/conq.json', sha: 's1' }])
    if (url.pathname.endsWith('/contents/on-demand/conq.json')) return json({ type: 'file', encoding: 'base64', content: Buffer.from(JSON.stringify(conq)).toString('base64'), sha: 's1' })
    return json({ message: 'Not Found' }, 404)
  })
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, 'CoNQ')
  await page.locator('code.od-key', { hasText: 'CONQ-0003' }).waitFor()
  return { page, context, errors, writes }
}

test('TC-OND-63: the Tool Owner publishes CoNQ as a standalone HTML file — the confirmation, the file picked, the rows and charts written without external addresses, sort and search working offline', async () => {
  const { page, context, errors, writes } = await open('Tool Owner')
  await (await menuOf(page, 'page CoNQ')).getByRole('menuitem', { name: 'Publish standalone HTML…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Publish standalone HTML' })
  await dialog.waitFor()
  assert.match(await text(dialog.locator('.publish-warning')), /^This file contains every row of CoNQ\. Anyone who receives it can read them\. \(3 rows; 1 hidden row left out,/)
  await dialog.getByText('Not chosen yet: Publish now asks where to save it').waitFor()
  await dialog.getByRole('button', { name: 'Publish now' }).click()
  await dialog.waitFor({ state: 'detached' })
  await page.waitForFunction(() => window.__written.length === 1)
  assert.equal(await page.evaluate(() => window.__picker.suggestedName), 'CoNQ.html')
  const html = await page.evaluate(() => window.__written[0])

  // OND-74, OND-77: the rows (not the hidden one), escaped; the charts as SVG; no address the file could load.
  assert.match(html, /^<!doctype html>/)
  for (const id of ['CONQ-0001', 'CONQ-0002', 'CONQ-0003']) assert.ok(html.includes(`<td data-sort="${id.slice(-1)}">${id}</td>`), id)
  assert.doesNotMatch(html, /CONQ-0004|Hidden secret/)
  assert.ok(html.includes('Wrong label &lt;b&gt;x&lt;/b&gt;'))
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none';/)
  assert.match(html, /<figure class="half"><h2>Cost by category<\/h2>.*<svg [^>]*role="img"/s)
  assert.match(html, /<div class="card"><div class="muted">Rows<\/div><strong>3<\/strong>/)
  assert.match(html, /<p>Published by .* on \d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} \S+<\/p>/)
  assert.deepEqual(html.match(/https?:\/\/[^<\s]*/g), ['https://example.com/not-a-link'], 'the only address is a row’s text')
  assert.equal(writes.length, 0, 'nothing written to Git')

  // The file on its own: no request, search and sort work.
  const file = await context.newPage()
  const requests = []
  file.on('request', (request) => { if (!request.url().startsWith('data:') && request.url() !== 'about:blank') requests.push(request.url()) })
  await file.setContent(html)
  await file.locator('#count', { hasText: '3 of 3 rows' }).waitFor()
  await file.getByRole('searchbox', { name: 'Search all columns' }).fill('rework')
  await file.locator('#count', { hasText: '1 of 3 rows' }).waitFor()
  await file.getByRole('searchbox', { name: 'Search all columns' }).fill('')
  await file.getByRole('button', { name: 'Cost' }).click()
  assert.deepEqual(await file.locator('#rows tbody tr').evaluateAll((list) => list.map((row) => row.cells[0].textContent)), ['CONQ-0002', 'CONQ-0003', 'CONQ-0001'], 'by amount, ascending')
  await file.getByRole('button', { name: 'Cost' }).click()
  assert.equal(await file.locator('#rows thead th').nth(3).getAttribute('aria-sort'), 'descending')
  assert.deepEqual(requests, [])

  // The next publish overwrites the same file without asking again.
  await (await menuOf(page, 'page CoNQ')).getByRole('menuitem', { name: 'Publish standalone HTML…' }).click()
  await dialog.getByText('CoNQ.html').first().waitFor()
  await dialog.getByRole('button', { name: 'Publish now' }).click()
  await page.waitForFunction(() => window.__written.length === 2)
  assert.equal(await page.evaluate(() => window.__picker.suggestedName), 'CoNQ.html')
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-OND-64: Publish standalone HTML… is disabled with the reason in Sample and for a person who is not an owner of the page', async () => {
  const owner = await open('Tool Owner')
  await owner.page.getByRole('group', { name: 'Data shown on CoNQ' }).getByRole('button', { name: 'Sample' }).click()
  await owner.page.locator('.od-sample-banner').waitFor()
  let item = (await menuOf(owner.page, 'page CoNQ')).getByRole('menuitem', { name: 'Publish standalone HTML…' })
  assert.equal(await item.isDisabled(), true)
  assert.equal(await item.getAttribute('title'), 'Switch CoNQ to Live to publish: sample rows are never published.')
  await owner.context.close()

  const member = await open('Team Member')
  item = (await menuOf(member.page, 'page CoNQ')).getByRole('menuitem', { name: 'Publish standalone HTML…' })
  assert.equal(await item.isDisabled(), true)
  assert.equal(await item.getAttribute('title'), 'Only the Tool Owner and the co-owners of CoNQ publish it as a standalone HTML file.')
  await member.context.close()
})

test('TC-OND-64: losing permission after the live read prevents the final HTML write', async () => {
  let publishing = false
  let checks = 0
  const { page, context, writes } = await open(() => publishing && ++checks >= 2 ? 'Team Member' : 'Tool Owner')
  try {
    await (await menuOf(page, 'page CoNQ')).getByRole('menuitem', { name: 'Publish standalone HTML…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Publish standalone HTML' })
    await dialog.getByText('Not chosen yet: Publish now asks where to save it').waitFor()
    publishing = true
    await dialog.getByRole('button', { name: 'Publish now' }).click()
    await page.locator('.jobs-failed').click()
    await page.getByRole('dialog', { name: 'Background jobs' }).getByText('Only the Tool Owner and the co-owners of CoNQ publish it as a standalone HTML file.').waitFor()
    assert.ok(checks >= 2, 'roles were fetched again before writing')
    assert.equal(await page.evaluate(() => window.__written.length), 0)
    assert.deepEqual(writes, [])
  } finally { await context.close() }
})

test('TC-OND-65: a scheduled publish that is due at the start but cannot write its file warns on the page, with Publish standalone HTML… to fix it', async () => {
  // A daily schedule set two days ago that never ran, and no file this browser can write to (none chosen here).
  const setAt = new Date(Date.now() - 2 * 86_400_000).toISOString()
  const { page, context, errors } = await openPage(app, { init: (value) => {
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', 'ana@example.com')
    const scope = JSON.stringify(['example/storage@main:access.json', 'ana@example.com', 'conq'])
    localStorage.setItem('demand-planning-publish-schedule-v2', JSON.stringify({ [scope]: { mode: 'daily', day: 1, time: '00:00', setAt: value } }))
    window.showSaveFilePicker = async () => { throw new DOMException('Not now', 'AbortError') }
  }, initArg: setAt })
  await context.route('https://dev.azure.com/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await context.route('https://api.github.com/**', (route) => {
    const url = new URL(route.request().url())
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/repos/example/storage') return json({ visibility: 'private', permissions: { push: true } })
    if (url.pathname === '/repos/example/storage/commits') return json([])
    if (route.request().method() !== 'GET') return json({ message: 'Invalid request' }, 422)
    if (url.pathname.endsWith('/contents/access.json')) return json(rolesFile('Tool Owner'))
    if (url.pathname.endsWith('/contents/on-demand')) return json([{ type: 'file', name: 'conq.json', path: 'on-demand/conq.json', sha: 's1' }])
    if (url.pathname.endsWith('/contents/on-demand/conq.json')) return json({ type: 'file', encoding: 'base64', content: Buffer.from(JSON.stringify(conq)).toString('base64'), sha: 's1' })
    return json({ message: 'Not Found' }, 404)
  })
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, 'CoNQ')
  const warning = page.locator('.od-publish-failed')
  await warning.waitFor()
  assert.match(await text(warning), /^The scheduled publish of CoNQ at .+ failed: No file is chosen for this page yet: choose Publish now to pick one\. Publish standalone HTML…$/)
  // It ran once: its last run is recorded on this computer.
  const stored = await page.evaluate(() => {
    const scope = JSON.stringify(['example/storage@main:access.json', 'ana@example.com', 'conq'])
    return JSON.parse(localStorage.getItem('demand-planning-publish-schedule-v2'))[scope]
  })
  assert.equal(stored.lastOk, false)
  assert.ok(Date.parse(stored.lastRun) > Date.parse(setAt))
  assert.deepEqual(errors, [])
  await context.close()
})
