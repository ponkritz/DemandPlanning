import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeBase64, encodeBase64 } from '../src/gitStorage.ts'
import { GitQueueError, maxSaveTries, mergeHistoryText, mergeKeyed, mergeKpiTrackerText, mergeViewsBackupText, mergeViewsDefaultsText, SaveQueue, saveStamp, stampMessage, stampOf, writeQueuedBinary, writeQueuedText } from '../src/gitSaveQueue.ts'

// GIT-17 (design defaults review, decision 8): saves to the shared files that used to be last-writer-wins are queued with
// their time (to the second), written in that order as their own commits, and merged into the latest file in Git.
const config = { owner: 'acme', repo: 'data', branch: 'main', path: 'planning-data.json' }
const at = (path) => ({ ...config, path })
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0) })

// A small GitHub: files with a version id and a commit list; `meddle` runs before a write (someone else saving).
function fakeGitHub(files = {}) {
  let next = 1
  const sha = () => (next++).toString(16).padStart(40, '0')
  const state = { files: {}, commits: [], puts: 0, meddle: null }
  const put = (path, content, message, date = '2026-11-23T09:00:00Z') => { const version = sha(); state.files[path] = { content, sha: version }; state.commits.push({ path, sha: version, message, date }); return version }
  for (const [path, text] of Object.entries(files)) put(path, encodeBase64(text), `seed ${path}`)
  state.put = put
  state.text = (path) => state.files[path] ? decodeBase64(state.files[path].content) : null
  state.fetch = async (url, init = {}) => {
    const { pathname, searchParams } = new URL(url)
    if (pathname.endsWith('/commits')) {
      const path = searchParams.get('path')
      const list = state.commits.filter((entry) => entry.path === path).reverse().slice(0, Number(searchParams.get('per_page')))
      return json(200, list.map((entry) => ({ sha: entry.sha, commit: { message: entry.message, committer: { date: entry.date } } })))
    }
    const path = decodeURIComponent(pathname.replace('/repos/acme/data/contents/', ''))
    const file = state.files[path]
    if (!init.method) return file ? json(200, { type: 'file', encoding: 'base64', content: file.content, sha: file.sha }) : json(404, {})
    const body = JSON.parse(init.body)
    if (state.meddle) state.meddle(path)
    const current = state.files[path]
    if ((current?.sha ?? undefined) !== body.sha) return json(409, {})
    if (init.method === 'DELETE') { delete state.files[path]; state.commits.push({ path, sha: sha(), message: body.message, date: '2026-11-23T09:00:00Z' }); return json(200, {}) }
    state.puts += 1
    const version = put(path, body.content, body.message)
    return json(200, { content: { sha: version }, commit: { html_url: `https://github.com/acme/data/commit/${version}` } })
  }
  return state
}
const views = (sections) => `${JSON.stringify({ schema: 1, kind: 'personal-views', sections, menu: { pinned: [], hidden: [] }, filters: {} }, null, 2)}\n`
const row = (person, month, actual, extra = {}) => ({ person, month, stream: 'CP', activity: 'Testing', ...extra, actual })
const history = (rows, extra = {}) => `${JSON.stringify({ schema: 1, kind: 'history-hours', cutoff: '2026-10', source: 'plan.xlsx', sheet: 'TransformedData', importedAt: '2026-11-01T08:00:00.000Z', importedBy: 'Ann', ...extra, rows, streamEpics: {}, people: {} })}\n`

test('GIT-17: the save time is to the second and travels in the commit message', () => {
  assert.equal(saveStamp(new Date('2026-11-23T10:15:03.789Z')), '2026-11-23T10:15:03Z')
  assert.equal(stampMessage(' Default views from ann@x.com ', '2026-11-23T10:15:03Z'), 'Default views from ann@x.com [saved 2026-11-23T10:15:03Z]')
  assert.equal(stampOf('Default views [saved 2026-11-23T10:15:03Z]', '2026-11-23T11:00:00Z'), '2026-11-23T10:15:03Z')
  assert.equal(stampOf('An older commit without a stamp', '2026-11-23T11:00:00Z'), '2026-11-23T11:00:00Z', 'else the commit date')
  assert.equal(stampOf('nothing', ''), null)
})

test('GIT-17: merging by key keeps both sides; the later time wins only for an entry both changed', () => {
  const base = { a: 1, b: 2, c: 3 }
  assert.deepEqual(mergeKeyed(base, { a: 10, b: 2, c: 3, d: 4 }, { a: 1, b: 20, c: 3, e: 5 }, true), { a: 10, b: 20, c: 3, d: 4, e: 5 })
  assert.deepEqual(mergeKeyed(base, { a: 10, b: 2, c: 3 }, { a: 11, b: 2, c: 3 }, true).a, 10, 'mine is later')
  assert.deepEqual(mergeKeyed(base, { a: 10, b: 2, c: 3 }, { a: 11, b: 2, c: 3 }, false).a, 11, 'theirs is later')
  assert.deepEqual(mergeKeyed(base, { a: 1, b: 2 }, { a: 1, b: 2, c: 3 }, true), { a: 1, b: 2 }, 'removed here, unchanged there: removed')
  assert.deepEqual(mergeKeyed(base, { a: 1, b: 2 }, { a: 1, b: 2, c: 30 }, true), { a: 1, b: 2, c: 30 }, 'a change wins over a removal')
  assert.deepEqual(mergeKeyed(null, { a: 1 }, { b: 2 }, true), { a: 1, b: 2 }, 'never read here: both kept')
  assert.equal(Object.getPrototypeOf(mergeKeyed(null, JSON.parse('{"__proto__":{"x":1}}'), {}, true)), Object.prototype)
})

test('GIT-17 / HIS-04: two history imports both survive; the later one wins for the same row and the import details', () => {
  const base = history([row('Ann', '2026-01', 5), row('Bob', '2026-01', 6)])
  const mine = history([row('Ann', '2026-01', 7), row('Bob', '2026-01', 6), row('Cem', '2026-02', 3)], { importedAt: '2026-11-23T10:00:05.000Z', importedBy: 'Dee', source: 'mine.xlsx' })
  const theirs = history([row('Ann', '2026-01', 9), row('Eva', '2026-03', 2)], { importedAt: '2026-11-23T10:00:07.000Z', importedBy: 'Fay', source: 'theirs.xlsx' })
  const merged = JSON.parse(mergeHistoryText(base, mine, theirs, false))
  assert.equal(merged.source, 'theirs.xlsx', 'the later import details')
  assert.deepEqual(merged.rows.map((entry) => `${entry.person} ${entry.month} ${entry.actual}`).sort(), ['Ann 2026-01 9', 'Cem 2026-02 3', 'Eva 2026-03 2'], 'Bob removed there, Cem and Eva kept, Ann from the later import')
  const later = JSON.parse(mergeHistoryText(base, mine, history([row('Ann', '2026-01', 9), row('Bob', '2026-01', 6), row('Gus', '2026-11', 1)], { cutoff: '2026-12' }), true))
  assert.equal(later.cutoff, '2026-10'); assert.equal(later.rows.some((entry) => entry.person === 'Gus'), false, 'rows from the cut-off on are left out')
  assert.deepEqual(later.rows.find((entry) => entry.person === 'Ann').actual, 7)
})

test('GIT-17: default views by page, the KPI tracker by sheet and backups by connection id', () => {
  const merged = JSON.parse(mergeViewsDefaultsText(views({}), views({ dashboard: { order: ['a'], hidden: [] } }), views({ release: { order: ['b'], hidden: [] } }), true))
  assert.deepEqual(Object.keys(merged.sections).sort(), ['dashboard', 'release'])
  const tracker = (readAt, sheets) => `${JSON.stringify({ schema: 1, fileUrl: 'https://x.sharepoint.com/a.xlsx', fileName: 'a.xlsx', readAt, readBy: 'Ann', sheets })}\n`
  const kpi = JSON.parse(mergeKpiTrackerText(null, tracker('2026-11-23T10:00:05Z', [{ name: 'Q1', rows: [['1']] }]), tracker('2026-11-23T10:00:07Z', [{ name: 'Q1', rows: [['2']] }, { name: 'Q2', rows: [['3']] }]), false))
  assert.deepEqual(kpi.sheets, [{ name: 'Q1', rows: [['2']] }, { name: 'Q2', rows: [['3']] }]); assert.equal(kpi.readAt, '2026-11-23T10:00:07Z')
  const backup = (ids) => `${JSON.stringify({ schema: 1, kind: 'azure-devops-views', views: ids.map((id) => ({ id, reason: id, url: 'https://dev.azure.com/o' })) }, null, 2)}\n`
  assert.deepEqual(JSON.parse(mergeViewsBackupText(null, backup(['b', 'c']), backup(['a', 'b']), true)).views.map((view) => view.id), ['a', 'b', 'c'])
})

test('GIT-17: two saves with different times are both written, in the order of their time, each as its own commit', async () => {
  const path = 'personal-views-defaults.json', base = views({})
  const github = fakeGitHub({ [path]: base })
  const queue = new SaveQueue()
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const order = []
  // A save already running holds the queue; the two saves made meanwhile are queued out of order.
  const first = queue.enqueue(path, '2026-11-23T10:00:01Z', async () => { await gate; order.push('first') })
  const save = (time, page) => queue.enqueue(path, time, async () => { order.push(time); return writeQueuedText(at(path), 't', { text: views({ [page]: { order: [page], hidden: [] } }), base, at: time, message: `Default views ${page}`, merge: mergeViewsDefaultsText }, github.fetch) })
  const later = save('2026-11-23T10:00:07Z', 'release')
  const earlier = save('2026-11-23T10:00:05Z', 'dashboard')
  assert.deepEqual(queue.state(path), { waiting: 3, failed: 0, error: '' })
  release(); await first
  const [one, two] = await Promise.all([earlier, later])
  assert.deepEqual(order, ['first', '2026-11-23T10:00:05Z', '2026-11-23T10:00:07Z'])
  assert.equal(one.merged, false); assert.equal(two.merged, true, 'the second save is merged into the first')
  assert.deepEqual(Object.keys(JSON.parse(github.text(path)).sections).sort(), ['dashboard', 'release'], 'both saves are in Git')
  assert.deepEqual(github.commits.filter((entry) => entry.path === path).slice(1).map((entry) => entry.message), ['Default views dashboard [saved 2026-11-23T10:00:05Z]', 'Default views release [saved 2026-11-23T10:00:07Z]'])
  assert.deepEqual(queue.state(path), { waiting: 0, failed: 0, error: '' })
})

test('GIT-17: a conflict at write time reads the file again, merges and saves both changes', async () => {
  const path = 'history-hours.json', base = history([row('Ann', '2026-01', 5)])
  const github = fakeGitHub({ [path]: base })
  github.meddle = () => { github.meddle = null; github.put(path, encodeBase64(history([row('Ann', '2026-01', 5), row('Bob', '2026-02', 4)])), 'Someone else [saved 2026-11-23T10:00:02Z]') }
  const result = await writeQueuedText(at(path), 't', { text: history([row('Ann', '2026-01', 8)]), base, at: '2026-11-23T10:00:09Z', message: 'Historical hours', merge: mergeHistoryText }, github.fetch)
  assert.equal(result.merged, true)
  assert.deepEqual(JSON.parse(github.text(path)).rows.map((entry) => `${entry.person} ${entry.actual}`).sort(), ['Ann 8', 'Bob 4'], 'my change and theirs')
  assert.equal(github.puts, 1, 'one commit for this save')
  const same = await writeQueuedText(at(path), 't', { text: github.text(path), base: github.text(path), at: '2026-11-23T10:00:10Z', message: 'Again', merge: mergeHistoryText }, github.fetch)
  assert.equal(same.unchanged, true); assert.equal(github.puts, 1, 'nothing to commit when Git already has it')
})

test('GIT-17: after the retries the save fails with a clear error and stays in the queue until Retry', async () => {
  const path = 'kpi-tracker.json'
  const github = fakeGitHub({ [path]: '{"schema":1,"sheets":[]}\n' })
  let n = 0
  github.meddle = () => { n += 1; github.put(path, encodeBase64(`{"schema":1,"sheets":[{"name":"S${n}","rows":[]}]}\n`), `Someone else ${n}`) }
  const queue = new SaveQueue()
  const run = () => writeQueuedText(at(path), 't', { text: '{"schema":1,"sheets":[{"name":"Mine","rows":[]}]}\n', base: null, at: '2026-11-23T10:00:09Z', message: 'KPI tracker', merge: mergeKpiTrackerText }, github.fetch)
  await assert.rejects(queue.enqueue(path, '2026-11-23T10:00:09Z', run), (error) => error instanceof GitQueueError && /kept changing in Git while saving \(3 tries\)\. Your change is kept here and not lost/.test(error.message))
  assert.equal(n, maxSaveTries)
  assert.equal(queue.state(path).failed, 1)
  github.meddle = null
  await queue.retry(path)
  assert.deepEqual(queue.state(path), { waiting: 0, failed: 0, error: '' })
  assert.deepEqual(JSON.parse(github.text(path)).sheets.map((sheet) => sheet.name).sort(), ['Mine', 'S3'], 'the kept change is saved at Retry, merged with the latest file (S3 replaced S1 and S2 there)')
})

test('GIT-17: the Monthly pack template is not merged: an older save never replaces a newer one', async () => {
  const path = 'monthly-pack-template.pptx'
  const github = fakeGitHub()
  github.put(path, 'AAAA', 'Monthly pack template [saved 2026-11-23T10:00:07Z]')
  const older = await writeQueuedBinary(at(path), 't', { bytes: new Uint8Array([1, 2]), at: '2026-11-23T10:00:05Z', message: 'Monthly pack template' }, github.fetch)
  assert.equal(older.keptNewer, true); assert.equal(github.files[path].content, 'AAAA', 'the newer template is kept'); assert.equal(github.puts, 0)
  const removal = await writeQueuedBinary(at(path), 't', { bytes: null, at: '2026-11-23T10:00:06Z', message: 'Remove Monthly pack template' }, github.fetch)
  assert.equal(removal.keptNewer, true); assert.ok(github.files[path], 'an older removal does not remove the newer template')
  const newer = await writeQueuedBinary(at(path), 't', { bytes: new Uint8Array([1, 2]), at: '2026-11-23T10:00:09Z', message: 'Monthly pack template' }, github.fetch)
  assert.equal(newer.keptNewer, false); assert.equal(github.files[path].content, 'AQI=')
  assert.equal(github.commits.at(-1).message, 'Monthly pack template [saved 2026-11-23T10:00:09Z]')
})
