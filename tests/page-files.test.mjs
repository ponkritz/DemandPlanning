import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeGitHub } from '../e2e/fakeGitHub.mjs'
import { contested, copySets, dashboardFilePath, gitBlobSha, markerVersion, maxNameBytes, maxNameChars, olderThan, pageEntryOf, pageFileName, pageIdOfPath, pageStem, parseStem, resolvePages, stemFilePath, stemFolderPath, updateMarker, updateMarkerPath, updateMarkerStem } from '../src/pageFiles.ts'
import { bringStrays, dashboardTarget, ensureUpdateMarker, listDashboards, listPages, removeOlderCopies, removePage, saveRowHead, writePageFile } from '../src/pageFilesGit.ts'
import { retryTransient } from '../src/gitSaveQueue.ts'
import { privateGitWrites } from '../src/gitStorage.ts'
import { conqPage, mergeOnDemandText, pageIdFor, parseOnDemandPage, renamePage, serializeOnDemandPage, upsertRow } from '../src/onDemand.ts'
import { convertedFiles, movedMarker, serializeHead } from '../src/rowFiles.ts'
import { convertPage, loadRowPage } from '../src/rowPageGit.ts'
import { fileLabel, pagesOfFile } from '../src/gitWatch.ts'

// OND-120…OND-131, OND-133: On-Demand pages created from this version on are kept in Git under the page's name —
// "on-demand/<name>--<id>.json", the folder "on-demand/<name>--<id>/" for row files — the id staying the page's
// identity; a page of the form before ("on-demand/<id>.json") keeps its file for good, also when renamed. Synthetic data only; the GitHub of
// these tests is the fake one of the E2E suite (e2e/fakeGitHub.mjs), nothing leaves the process.
const config = { owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }
const columns = [{ id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework'], required: false }]
const conq = (rows = [], name = 'CoNQ') => ({ ...conqPage(), name, columns: structuredClone(columns), rows })
const text = (page) => serializeOnDemandPage(page)
const change = (page, base, message = 'save', at = '2026-11-25T10:00:00Z') => ({ text: text(page), base, at, message, merge: mergeOnDemandText })
const bytes = (value) => new TextEncoder().encode(value).length

test('TC-OND-123, TC-OND-125, TC-OND-128: named page mutations require verified private Git storage', async () => {
  const path = stemFilePath('CoNQ--conq')
  const original = text(conq())
  const gh = fakeGitHub({ files: { [path]: original } })
  let writes = 0
  const send = privateGitWrites(config, 'synthetic', async (url, init) => {
    if (url === 'https://api.github.com/repos/example/storage') return Response.json({ visibility: 'public' })
    if (init?.method && init.method !== 'GET') writes += 1
    return gh.fetch(url, init)
  })
  const refused = /private Git data repository/
  await assert.rejects(writePageFile(config, 'synthetic', 'conq', change(conq([], 'Renamed'), original), 'CoNQ--conq', send), refused)
  await assert.rejects(convertPage(config, 'synthetic', { id: 'conq', stem: 'CoNQ--conq' }, () => 'convert', send), refused)
  await assert.rejects(removePage(config, 'synthetic', 'conq', 'delete', send), refused)
  assert.equal(writes, 0)
  assert.equal(gh.read(path), original)
  assert.equal(gh.read(stemFilePath('Renamed--conq')), null)
})

test('OND-120: the name part of a file name is file-safe — characters refused by file systems and URLs, control characters, spaces, "--", dots, length, Windows device names (TC-OND-120)', () => {
  assert.equal(pageFileName('CoNQ'), 'CoNQ')
  assert.equal(pageFileName('Cost / quality: Q1 * "draft" <a> | b? \\ c'), 'Cost - quality- Q1 - -draft- -a- - b- - c')
  assert.equal(pageFileName('Tab\there\nnew\u0000line\u007fend\u2028x'), 'Tab here new-line-end x')
  assert.equal(pageFileName('  lots   of    space  '), 'lots of space')
  assert.equal(pageFileName('A--B---C'), 'A-B-C', 'never "--" inside the name: the id starts after the first "--"')
  assert.equal(pageFileName('..hidden.'), 'hidden', 'no dot at either end (no hidden file, no Windows trailing dot)')
  assert.equal(pageFileName('-x-'), 'x')
  for (const empty of ['', '   ', '...', '///', '--']) assert.equal(pageFileName(empty), 'Page', JSON.stringify(empty))
  // Windows device names are refused as a file's base name by Windows clones of the repository.
  for (const reserved of ['CON', 'prn', 'Aux', 'NUL', 'COM1', 'lpt9']) assert.equal(pageFileName(reserved), `_${reserved}`)
  assert.equal(pageFileName('Console'), 'Console')
  // Unicode: kept, in one normal form (NFC), so a name typed on macOS (NFD) and on Windows gives the same file.
  assert.equal(pageFileName('Café Qualität'), 'Café Qualität')
  assert.equal(pageFileName('Café'), pageFileName('Café'))
  assert.equal(pageFileName('Prüfmittel ✓ 品質'), 'Prüfmittel ✓ 品質')
  // Emoji are kept whole: the name is cut by characters (60) and bytes (120), never in the middle of one.
  const emoji = pageFileName('😀'.repeat(80))
  assert.equal(emoji, '😀'.repeat(30))
  assert.ok(bytes(emoji) <= maxNameBytes)
  assert.equal(pageFileName('👩‍🔬 Lab'), '👩‍🔬 Lab')
  // Very long names: at most 60 characters, no space or hyphen left at the cut.
  const long = pageFileName(`${'Quality '.repeat(20)}end`)
  assert.ok(Array.from(long).length <= maxNameChars && !/[ .-]$/.test(long), long)
  assert.ok(bytes(pageFileName('é'.repeat(200))) <= maxNameBytes)
  // The whole stem: name, "--", id — at most 120 bytes + 2 + 40, far below Git's 255 for a path part.
  assert.equal(pageStem('CoNQ', 'conq'), 'CoNQ--conq')
  assert.ok(bytes(`${pageStem('😀'.repeat(200), 'a'.repeat(40))}.json`) < 255)
  assert.throws(() => pageStem('X', '../x'), /Not a valid page id/)
})

test('OND-120: names that differ only by case, or are the same name, never share a file — the id tells them apart, also on a file system that ignores case (TC-OND-120)', () => {
  const ids = []
  for (const name of ['CoNQ', 'conq', 'CONQ', 'CoNQ']) ids.push(pageIdFor(name, ids))
  assert.deepEqual(ids, ['conq', 'conq-2', 'conq-3', 'conq-4'])
  const stems = ['CoNQ', 'conq', 'CONQ', 'CoNQ'].map((name, index) => pageStem(name, ids[index]))
  assert.deepEqual(stems, ['CoNQ--conq', 'conq--conq-2', 'CONQ--conq-3', 'CoNQ--conq-4'])
  assert.equal(new Set(stems.map((stem) => stem.toLowerCase())).size, 4, 'unique without case')
  // The update marker's name is never a page's id (createPage passes it as taken).
  assert.equal(pageIdFor('App update required', [updateMarkerStem]), 'app-update-required-2')
})

test('OND-122: a path read back gives the page id — the old form "<id>" and the named form "<name>--<id>", files and folders; anything else is not a page (TC-OND-121)', () => {
  assert.deepEqual(parseStem('conq'), { id: 'conq', named: false })
  assert.deepEqual(parseStem('CoNQ--conq'), { id: 'conq', named: true })
  assert.deepEqual(parseStem('Cost - quality- Q1--cost-quality-q1-2'), { id: 'cost-quality-q1-2', named: true })
  assert.deepEqual(parseStem('😀 Lab--lab'), { id: 'lab', named: true })
  assert.deepEqual(parseStem('a--b--c'), { id: 'b--c', named: true }, 'the id is everything after the first "--"')
  for (const bad of ['', 'CoNQ', 'CoNQ--', '--conq', 'CoNQ--Conq', 'x/y--z', '..--conq', 'CoNQ--../x', updateMarkerStem, 'a'.repeat(41)]) assert.equal(parseStem(bad), null, JSON.stringify(bad))
  // Round trip: every name's stem parses to its id.
  for (const name of ['CoNQ', 'Supplier issues', 'a/b', 'Ünïcödé', '😀', '', 'CON', 'x--y']) assert.equal(parseStem(pageStem(name, 'page-1'))?.id, 'page-1', name)
  assert.deepEqual(pageEntryOf({ name: 'CoNQ--conq.json', sha: 's', type: 'file' }), { id: 'conq', stem: 'CoNQ--conq', named: true, kind: 'file', sha: 's', path: 'on-demand/CoNQ--conq.json' })
  assert.deepEqual(pageEntryOf({ name: 'CoNQ--conq', sha: 't', type: 'dir' }), { id: 'conq', stem: 'CoNQ--conq', named: true, kind: 'dir', sha: 't', path: 'on-demand/CoNQ--conq' })
  assert.equal(pageEntryOf({ name: 'CoNQ--conq.txt', sha: 's', type: 'file' }), null)
  assert.equal(pageEntryOf({ name: 'app-update-required.json', sha: 's', type: 'file' }), null, 'the update marker is never a page')
  assert.deepEqual(pageIdOfPath('data/on-demand/CoNQ--conq.json'), { id: 'conq', stem: 'CoNQ--conq' })
  assert.deepEqual(pageIdOfPath('on-demand/CoNQ--conq/page.json'), { id: 'conq', stem: 'CoNQ--conq' })
  assert.deepEqual(pageIdOfPath('on-demand/conq/rows'), { id: 'conq', stem: 'conq' })
  assert.equal(pageIdOfPath('dashboards/conq.json'), null)
  assert.equal(stemFilePath('CoNQ--conq'), 'on-demand/CoNQ--conq.json')
  assert.equal(stemFolderPath('conq'), 'on-demand/conq')
  assert.throws(() => stemFilePath('../access'), /Not a valid page id or page file name/)
  // GIT-18: the watcher's notice names the page of either form and shows it on that page.
  assert.equal(fileLabel('on-demand/CoNQ--conq.json', 'planning-data.json'), 'On-Demand page conq')
  assert.equal(fileLabel('on-demand/CoNQ--conq/page.json', 'planning-data.json'), 'On-Demand page conq')
  assert.deepEqual(pagesOfFile('on-demand/Cost of quality--conq.json', 'planning-data.json'), { pages: ['ondemand:conq', 'admin:pages'], loader: 'ondemand:conq' })
  assert.deepEqual(pagesOfFile('on-demand/Cost of quality--conq/rows', 'planning-data.json').loader, 'ondemand:conq')
})

test('OND-123: the folder read — old and new forms side by side, a folder wins over files, markers are not pages, both forms present: the newer wins and the older is flagged (TC-OND-122)', async () => {
  const file = (name, sha = 'x') => ({ name, sha, type: 'file' }), dir = (name, sha = 'd') => ({ name, sha, type: 'dir' })
  // Only the old form, only the new form.
  assert.deepEqual(resolvePages([file('conq.json'), file('Supplier issues--supplier-issues.json'), file('notes.txt'), file('app-update-required.json')]), [
    { id: 'conq', stem: 'conq', rows: false, path: 'on-demand/conq.json', others: [] },
    { id: 'supplier-issues', stem: 'Supplier issues--supplier-issues', rows: false, path: 'on-demand/Supplier issues--supplier-issues.json', others: [] },
  ])
  // A marker (OND-32) next to a named file is not a copy (known by its version without reading it).
  const marker = await gitBlobSha(movedMarker('conq'))
  assert.deepEqual(resolvePages([file('conq.json', marker), file('CoNQ--conq.json')], new Set([marker])), [{ id: 'conq', stem: 'CoNQ--conq', rows: false, path: 'on-demand/CoNQ--conq.json', others: [] }])
  // Row files: the folder wins; the old-form file next to it is the marker of OND-32.
  assert.deepEqual(resolvePages([file('conq.json'), dir('CoNQ--conq')]), [{ id: 'conq', stem: 'CoNQ--conq', rows: true, path: 'on-demand/CoNQ--conq/', others: [] }])
  // Both forms are pages (an older app wrote the old one again): the newer by its latest commit wins …
  const both = [file('conq.json'), file('CoNQ--conq.json')]
  assert.deepEqual(contested(both), ['on-demand/conq.json', 'on-demand/CoNQ--conq.json'])
  assert.deepEqual(resolvePages(both, new Set(), { 'on-demand/conq.json': '2026-11-25T10:00:00Z', 'on-demand/CoNQ--conq.json': '2026-11-24T10:00:00Z' })[0], { id: 'conq', stem: 'conq', rows: false, path: 'on-demand/conq.json', others: ['on-demand/CoNQ--conq.json'] })
  // … else the named form; two names (a rename made outside the app): the newer, the other flagged.
  assert.deepEqual(resolvePages(both)[0].others, ['on-demand/conq.json'])
  assert.deepEqual(resolvePages([file('A--conq.json'), file('B--conq.json')], new Set(), { 'on-demand/A--conq.json': '2026-11-25T11:00:00Z', 'on-demand/B--conq.json': '2026-11-25T09:00:00Z' })[0].stem, 'A--conq')
  // Against the fake GitHub: the listing reads the commits only of the contested paths, and knows the markers.
  const gh = fakeGitHub({ files: { 'on-demand/conq.json': text(conq()), 'on-demand/team.json': movedMarker('team'), 'on-demand/Team--team.json': text({ ...conq(), id: 'team', name: 'Team' }) } })
  gh.put('on-demand/CoNQ--conq.json', text(conq([], 'CoNQ')), 'main', 'a newer copy')
  const listing = await listPages(config, 'token', gh.fetch)
  assert.deepEqual(listing.locations.map(({ id, stem, others }) => [id, stem, others]), [['conq', 'CoNQ--conq', ['on-demand/conq.json']], ['team', 'Team--team', []]])
  assert.equal(listing.update, null)
  assert.equal(gh.calls.filter((call) => call.startsWith('GET /repos/example/storage/commits')).length, 2, 'only the two copies of conq')
})

test('OND-124: a page saved — created at "<name>--<id>", saved in place while its name stays, moved in ONE commit when renamed (TC-OND-123)', async () => {
  const gh = fakeGitHub({ files: { 'on-demand/legacy.json': text({ ...conq(), id: 'legacy', name: 'Legacy' }) } })
  // A new page: its file is named after it.
  const created = await writePageFile(config, 'token', 'conq', change(conq(), null, 'Pages & menu: add CoNQ'), null, gh.fetch)
  assert.deepEqual([created.stem, created.fromStem], ['CoNQ--conq', null])
  assert.equal(parseOnDemandPage(gh.read('on-demand/CoNQ--conq.json'), 'conq').name, 'CoNQ')
  // Saved again with the same name: the same file (the contents API, one file).
  const row = upsertRow(conq(), { id: 'r1', cells: { c1: 'Scrap' } }, { by: 'ana@example.com' })
  const kept = await writePageFile(config, 'token', 'conq', change(row, created.text), 'CoNQ--conq', gh.fetch)
  assert.equal(kept.stem, 'CoNQ--conq')
  assert.deepEqual(gh.writes.at(-1).paths, ['on-demand/CoNQ--conq.json'])
  // Renamed: delete plus create in one commit (the Git Data API), the id inside unchanged.
  const renamed = await writePageFile(config, 'token', 'conq', change(renamePage(parseOnDemandPage(kept.text, 'conq'), 'Cost of quality', ''), kept.text, 'Pages & menu: rename CoNQ to Cost of quality'), 'CoNQ--conq', gh.fetch)
  assert.deepEqual([renamed.fromStem, renamed.stem], ['CoNQ--conq', 'Cost of quality--conq'])
  assert.deepEqual(gh.writes.at(-1).paths.sort(), ['on-demand/CoNQ--conq.json', 'on-demand/Cost of quality--conq.json'])
  assert.match(gh.writes.at(-1).message, /^Pages & menu: rename CoNQ to Cost of quality \[saved /)
  assert.equal(gh.read('on-demand/CoNQ--conq.json'), null)
  const moved = parseOnDemandPage(gh.read('on-demand/Cost of quality--conq.json'))
  assert.deepEqual([moved.id, moved.name, moved.rows.length], ['conq', 'Cost of quality', 1])
  assert.equal(renamed.sha, await gitBlobSha(renamed.text), 'the version is known without reading it back')
  // Another new page.
  const plain = await writePageFile(config, 'token', 'old', change({ ...conq(), id: 'old', name: 'Old' }, null), null, gh.fetch)
  assert.equal(plain.stem, 'Old--old')
})

test('OND-124, GIT-17: a save queued here while someone else renamed the page is merged into the moved file — nothing written under the old name; two renames at once end in one file (TC-OND-124)', async () => {
  const base = text(conq())
  const gh = fakeGitHub({ files: { 'on-demand/CoNQ--conq.json': base } })
  // Someone else renames CoNQ (a page kept under its name: their app moves it).
  await writePageFile(config, 'token', 'conq', change(renamePage(conq(), 'Cost of quality', 'Cost of Non-Quality'), base, 'rename'), 'CoNQ--conq', gh.fetch)
  // Here the page was read before the rename (stem "CoNQ--conq"); a row added is saved from that base.
  const mine = upsertRow(conq(), { id: 'r1', cells: { c1: 'Rework' } }, { by: 'ben@example.com' })
  const saved = await writePageFile(config, 'token', 'conq', change(mine, base, 'CoNQ: add row', '2026-11-25T10:05:00Z'), 'CoNQ--conq', gh.fetch)
  assert.equal(saved.stem, 'Cost of quality--conq', 'found again where it is')
  assert.equal(saved.merged, true)
  const page = parseOnDemandPage(gh.read('on-demand/Cost of quality--conq.json'))
  assert.deepEqual([page.name, page.rows.map((entry) => entry.cells.c1)], ['Cost of quality', ['Rework']], 'their name and my row')
  assert.equal(gh.read('on-demand/CoNQ--conq.json'), null, 'nothing under the old name')
  assert.equal(Object.keys(gh.files()).filter((path) => path.startsWith('on-demand/')).length, 1)
  // Two renames from the same base, one after the other (the second app still at the first name): one file, the later name.
  const now = gh.read('on-demand/Cost of quality--conq.json')
  await writePageFile(config, 'token', 'conq', change(renamePage(parseOnDemandPage(now), 'Quality cost', ''), now, 'rename A', '2026-11-25T10:06:00Z'), 'Cost of quality--conq', gh.fetch)
  await writePageFile(config, 'token', 'conq', change(renamePage(parseOnDemandPage(now), 'Scrap cost', ''), now, 'rename B', '2026-11-25T10:07:00Z'), 'Cost of quality--conq', gh.fetch)
  const left = Object.keys(gh.files()).filter((path) => path.startsWith('on-demand/'))
  assert.deepEqual(left, ['on-demand/Scrap cost--conq.json'])
  assert.equal(parseOnDemandPage(gh.read(left[0])).rows.length, 1, 'the row kept through both renames')
})

test('OND-124, OND-125: a row-file page renamed — the whole folder moves in one commit by the versions of its files; a converted named page keeps its name (TC-OND-125)', async () => {
  const gh = fakeGitHub({ files: {} })
  // A named page converted to row files: the folder of the same name; the marker at the old-form path.
  const page = upsertRow(upsertRow(conq(), { id: 'r1', cells: { c1: 'Scrap' } }, { by: 'ana@example.com' }), { id: 'r2', cells: { c1: 'Rework' } }, { by: 'ana@example.com' })
  await writePageFile(config, 'token', 'conq', change(page, null), null, gh.fetch)
  assert.equal(Object.keys(convertedFiles(page, 'CoNQ--conq').files).filter((path) => path.startsWith('on-demand/CoNQ--conq/rows/')).length, 2)
  await convertPage(config, 'token', { id: 'conq', stem: 'CoNQ--conq' }, () => 'convert', gh.fetch)
  assert.equal(gh.read('on-demand/CoNQ--conq.json'), null)
  assert.equal(gh.read('on-demand/conq.json'), movedMarker('conq'))
  const read = await loadRowPage(config, 'token', { id: 'conq', stem: 'CoNQ--conq' }, new Map(), gh.fetch)
  assert.equal(read.page.rows.length, 2)
  // Renamed: page.json merged and every file moved in one commit; rows not read or sent again (their versions).
  const before = gh.writes.length, batches = gh.calls.filter((call) => call === 'POST /graphql').length
  const done = await saveRowHead(config, 'token', 'conq', { text: serializeHead({ ...read.page, name: 'Cost of quality' }), base: read.headText, at: '2026-11-25T10:00:00Z', message: 'rename', merge: mergeOnDemandText }, gh.fetch)
  assert.deepEqual([done.fromStem, done.stem], ['CoNQ--conq', 'Cost of quality--conq'])
  assert.equal(gh.writes.length, before + 1, 'one commit')
  assert.equal(gh.calls.filter((call) => call === 'POST /graphql').length, batches, 'no row read for the move')
  assert.deepEqual(Object.keys(gh.files()).filter((path) => path.startsWith('on-demand/')).sort(), ['on-demand/Cost of quality--conq/counter.json', 'on-demand/Cost of quality--conq/page.json', ...Object.keys(read.rows).map((name) => `on-demand/Cost of quality--conq/rows/${name}`).sort(), 'on-demand/conq.json'].sort())
  const after = await loadRowPage(config, 'token', { id: 'conq', stem: 'Cost of quality--conq' }, new Map(), gh.fetch)
  assert.deepEqual([after.page.name, after.page.rows.length], ['Cost of quality', 2])
})

test('OND-129: a row saved to the folder someone renamed meanwhile is brought into the folder of the page in one commit — the row kept, the higher counter, a folder with page.json never touched (TC-OND-126)', async () => {
  const gh = fakeGitHub({ files: {
    'on-demand/Cost of quality--conq/page.json': serializeHead(conq()), 'on-demand/Cost of quality--conq/counter.json': '{"schema":1,"kind":"on-demand-counter","next":5}\n',
    // What a save wrote under the old name after the folder had moved: a row and the counter, no page.json.
    'on-demand/CoNQ--conq/rows/CONQ-261125-K7Q2.json': '{"id":"r9","key":"CONQ-261125-K7Q2","seq":7,"cells":{"c1":"Scrap"}}\n', 'on-demand/CoNQ--conq/counter.json': '{"schema":1,"kind":"on-demand-counter","next":8}\n',
  } })
  assert.equal(await bringStrays(config, 'token', 'CoNQ--conq', 'Cost of quality--conq', 'bring', gh.fetch), true)
  assert.deepEqual(Object.keys(gh.files()).sort(), ['on-demand/Cost of quality--conq/counter.json', 'on-demand/Cost of quality--conq/page.json', 'on-demand/Cost of quality--conq/rows/CONQ-261125-K7Q2.json'])
  assert.match(gh.read('on-demand/Cost of quality--conq/counter.json'), /"next":8/)
  assert.equal(gh.writes.at(-1).paths.length, 4, 'one commit')
  assert.equal(await bringStrays(config, 'token', 'CoNQ--conq', 'Cost of quality--conq', 'bring', gh.fetch), false, 'nothing left')
  const copy = fakeGitHub({ files: { 'on-demand/A--conq/page.json': serializeHead(conq()), 'on-demand/B--conq/page.json': serializeHead(conq()) } })
  assert.equal(await bringStrays(config, 'token', 'A--conq', 'B--conq', 'bring', copy.fetch), false, 'a copy of its own')
})

test('OND-133: a page of the form before keeps its file for good — renamed, only the title in it changes; saved, read and deleted where it is; a page of row files keeps its folder (TC-OND-132)', async () => {
  const gh = fakeGitHub({ files: {
    'on-demand/conq.json': text(conq()),
    'on-demand/log/page.json': serializeHead({ ...conq(), id: 'log', name: 'Log', keyPrefix: 'LOG' }), 'on-demand/log/counter.json': '{"schema":1,"kind":"on-demand-counter","next":2}\n', 'on-demand/log/rows/LOG-261125-K7Q2.json': '{"id":"r1","key":"LOG-261125-K7Q2","seq":1,"cells":{"c1":"Scrap"}}\n', 'on-demand/log.json': movedMarker('log'),
  } })
  // CoNQ renamed twice: the file stays on-demand/conq.json, one file per commit, the title changed inside.
  let now = gh.read('on-demand/conq.json')
  for (const name of ['Cost of quality', 'Scrap cost']) {
    const out = await writePageFile(config, 'token', 'conq', change(renamePage(parseOnDemandPage(now, 'conq'), name, ''), now, `rename to ${name}`), 'conq', gh.fetch)
    assert.deepEqual([out.fromStem, out.stem], ['conq', 'conq'])
    assert.deepEqual(gh.writes.at(-1).paths, ['on-demand/conq.json'])
    now = out.text
  }
  assert.deepEqual([parseOnDemandPage(gh.read('on-demand/conq.json')).id, parseOnDemandPage(gh.read('on-demand/conq.json')).name], ['conq', 'Scrap cost'])
  // A row-file page of the form before renamed: page.json only, the folder stays.
  const read = await loadRowPage(config, 'token', 'log', new Map(), gh.fetch)
  const done = await saveRowHead(config, 'token', 'log', { text: serializeHead({ ...read.page, name: 'Lab log' }), base: read.headText, at: '2026-11-25T10:00:00Z', message: 'rename', merge: mergeOnDemandText }, gh.fetch)
  assert.deepEqual([done.fromStem, done.stem], ['log', 'log'])
  assert.deepEqual(gh.writes.at(-1).paths, ['on-demand/log/page.json'])
  assert.deepEqual(Object.keys(gh.files()).filter((path) => path.startsWith('on-demand/')).sort(), ['on-demand/conq.json', 'on-demand/log.json', 'on-demand/log/counter.json', 'on-demand/log/page.json', 'on-demand/log/rows/LOG-261125-K7Q2.json'])
  // Read where they are; nothing more is written (no update marker for pages of the form before).
  const listing = await listPages(config, 'token', gh.fetch)
  assert.deepEqual(listing.locations.map(({ id, stem, rows, others }) => [id, stem, rows, others.length]), [['conq', 'conq', false, 0], ['log', 'log', true, 0]])
  assert.equal(gh.read(updateMarkerPath), null)
  // Deleted where it is.
  assert.equal(await removePage(config, 'token', 'conq', 'delete', gh.fetch), true)
  assert.equal(gh.read('on-demand/conq.json'), null)
})

test('OND-130, OND-121, OND-128: a page deleted takes every file of its id (both copies) in one commit; the update marker is written once; an app older than its version says so (TC-OND-128)', async () => {
  const gh = fakeGitHub({ files: { 'on-demand/conq.json': text(conq()), 'on-demand/CoNQ--conq.json': text(conq()), 'on-demand/other.json': text({ ...conq(), id: 'other', name: 'Other' }) } })
  const before = gh.writes.length
  assert.equal(await removePage(config, 'token', 'conq', 'Pages & menu: delete the page CoNQ', gh.fetch), true)
  assert.equal(gh.writes.length, before + 1)
  assert.deepEqual(Object.keys(gh.files()), ['on-demand/other.json'])
  assert.equal(await removePage(config, 'token', 'conq', 'again', gh.fetch), false)
  // One file only: deleted with the contents API, as before.
  assert.equal(await removePage(config, 'token', 'other', 'delete', gh.fetch), true)
  assert.deepEqual(gh.files(), {})
  assert.equal(await ensureUpdateMarker(config, 'token', '11.0.0', gh.fetch), true)
  assert.equal(await ensureUpdateMarker(config, 'token', '12.0.0', gh.fetch), false, 'never replaced')
  assert.equal(markerVersion(gh.read(updateMarkerPath)), '11.0.0')
  assert.equal(markerVersion(updateMarker('11.0.0')), '11.0.0')
  assert.equal(markerVersion('{"kind":"other"}'), null)
  assert.equal(olderThan('10.37.1', '11.0.0'), true)
  assert.equal(olderThan('11.0.0', '11.0.0'), false)
  assert.equal(olderThan('11.2.0', '11.10.0'), true)
  assert.equal(olderThan('12.0.0', '11.9.9'), false)
})

test('OND-135: the older copy is the one the reader does not read — by latest commit, else the named form; Delete older copy deletes exactly it (file or folder) in one commit, never the newer, and nothing once it is gone (TC-OND-134)', async () => {
  const file = (name, sha = 'x') => ({ name, sha, type: 'file' })
  // Choosing: the newer by its latest commit stays, the older is offered for deletion — whichever form it has.
  const byDate = resolvePages([file('conq.json'), file('CoNQ--conq.json')], new Set(), { 'on-demand/conq.json': '2026-11-25T10:00:00Z', 'on-demand/CoNQ--conq.json': '2026-11-24T10:00:00Z' })[0]
  assert.deepEqual(copySets(byDate, undefined), [{ folder: 'on-demand', keep: 'on-demand/conq.json', older: ['on-demand/CoNQ--conq.json'] }])
  const dash = resolvePages([file('conq.json'), file('CoNQ--conq.json')], new Set(), {}, 'dashboards')[0]
  assert.deepEqual(copySets(undefined, dash), [{ folder: 'dashboards', keep: 'dashboards/CoNQ--conq.json', older: ['dashboards/conq.json'] }])
  assert.deepEqual(copySets({ id: 'x', stem: 'x', rows: false, path: 'on-demand/x.json', others: [] }, undefined), [], 'one copy: nothing offered')
  // Against the fake GitHub: an older app wrote on-demand/conq.json again after the named file; its dashboard twice.
  const gh = fakeGitHub({ files: { 'on-demand/CoNQ--conq.json': text(conq()), 'dashboards/conq.json': '{"schema":1,"kind":"on-demand-dashboard","id":"conq","blocks":[]}\n' } })
  gh.put('on-demand/conq.json', text(conq([], 'CoNQ')), 'main', 'written again by an older app')
  gh.put('dashboards/CoNQ--conq.json', '{"schema":1,"kind":"on-demand-dashboard","id":"conq","blocks":[]}\n', 'main', 'the blocks, named')
  const page = (await listPages(config, 'token', gh.fetch)).locations[0], blocks = (await listDashboards(config, 'token', gh.fetch))[0]
  assert.deepEqual([page.path, page.others], ['on-demand/conq.json', ['on-demand/CoNQ--conq.json']], 'the newer (latest commit) is read')
  assert.deepEqual([blocks.path, blocks.others], ['dashboards/CoNQ--conq.json', ['dashboards/conq.json']])
  const sets = copySets(page, blocks)
  const before = gh.writes.length
  const done = await removeOlderCopies(config, 'token', 'conq', sets, 'Pages & menu: delete the older copy of CoNQ', gh.fetch)
  assert.deepEqual(done.deleted, ['on-demand/CoNQ--conq.json', 'dashboards/conq.json'])
  assert.equal(gh.writes.length, before + 1, 'one commit')
  assert.deepEqual(Object.keys(gh.files()).sort(), ['dashboards/CoNQ--conq.json', 'on-demand/conq.json'], 'the newer copies stay')
  await assert.rejects(removeOlderCopies(config, 'token', 'conq', sets, 'again', gh.fetch), /no longer in Git/)
  assert.equal(gh.writes.length, before + 1, 'nothing written')
  // A folder copy (row files) is deleted with every file in it; a path that became the newer meanwhile is never deleted.
  const rows = fakeGitHub({ files: { 'on-demand/Log--log/page.json': serializeHead({ ...conq(), id: 'log', name: 'Log' }), 'on-demand/Log--log/rows/LOG-261125-K7Q2.json': '{"id":"r1","key":"LOG-261125-K7Q2","seq":1,"cells":{}}\n' } })
  rows.put('on-demand/log/page.json', serializeHead({ ...conq(), id: 'log', name: 'Log' }), 'main', 'a newer copy')
  const where = (await listPages(config, 'token', rows.fetch)).locations[0]
  assert.deepEqual([where.path, where.others], ['on-demand/log/', ['on-demand/Log--log/']])
  assert.deepEqual((await removeOlderCopies(config, 'token', 'log', copySets(where, undefined), 'delete', rows.fetch)).deleted, ['on-demand/Log--log/'])
  assert.deepEqual(Object.keys(rows.files()), ['on-demand/log/page.json'])
  await assert.rejects(removeOlderCopies(config, 'token', 'log', [{ folder: 'on-demand', keep: 'on-demand/Log--log/', older: ['on-demand/log/'] }], 'wrong way round', rows.fetch), /no longer in Git/)
  assert.deepEqual(Object.keys(rows.files()), ['on-demand/log/page.json'], 'the copy that is read is never deleted')
})

test('OND-134: a Dashboard blocks file is named as its page — dashboards/<name>--<id>.json for a new page, dashboards/<id>.json kept for a page from before; moved with a rename in the same commit; read in both forms (TC-OND-135)', async () => {
  assert.equal(dashboardFilePath('Quality board--quality-board'), 'dashboards/Quality board--quality-board.json')
  assert.equal(dashboardFilePath('conq'), 'dashboards/conq.json')
  assert.throws(() => dashboardFilePath('../x'), /Not a valid page id/)
  assert.deepEqual(pageIdOfPath('dashboards/Quality board--quality-board.json', 'dashboards'), { id: 'quality-board', stem: 'Quality board--quality-board' })
  assert.deepEqual(pageIdOfPath('data/dashboards/board.json', 'dashboards'), { id: 'board', stem: 'board' })
  assert.equal(pageIdOfPath('dashboards/x/y.json', 'dashboards'), null)
  assert.equal(pageEntryOf({ name: 'Quality board--quality-board', sha: 'd', type: 'dir' }, 'dashboards'), null, 'only files are dashboards')
  assert.equal(fileLabel('dashboards/Quality board--quality-board.json', 'planning-data.json'), 'Dashboard quality-board')
  assert.deepEqual(pagesOfFile('dashboards/Quality board--quality-board.json', 'planning-data.json'), { pages: ['ondemand:quality-board'], loader: 'remount' })
  const blocks = '{"schema":1,"kind":"on-demand-dashboard","id":"quality-board","blocks":[]}\n'
  const gh = fakeGitHub({ files: { 'on-demand/Quality board--quality-board.json': text({ ...conq(), id: 'quality-board', name: 'Quality board' }), 'on-demand/board.json': text({ ...conq(), id: 'board', name: 'Board' }), 'dashboards/board.json': blocks } })
  // Where the first blocks are saved: named as the page (a new page), by id (a page from before), or where they are.
  assert.equal(await dashboardTarget(config, 'token', 'quality-board', 'Quality board--quality-board', gh.fetch), 'dashboards/Quality board--quality-board.json')
  assert.equal(await dashboardTarget(config, 'token', 'board', 'board', gh.fetch), 'dashboards/board.json')
  gh.put('dashboards/Quality board--quality-board.json', blocks)
  // A rename of the new page moves its blocks file in the same commit as the page file (by its version).
  const now = gh.read('on-demand/Quality board--quality-board.json')
  const out = await writePageFile(config, 'token', 'quality-board', change(renamePage(parseOnDemandPage(now), 'Quality wall', ''), now, 'rename'), 'Quality board--quality-board', gh.fetch)
  assert.deepEqual(out.dashboard, { from: 'dashboards/Quality board--quality-board.json', to: 'dashboards/Quality wall--quality-board.json' })
  assert.deepEqual(gh.writes.at(-1).paths.sort(), ['dashboards/Quality board--quality-board.json', 'dashboards/Quality wall--quality-board.json', 'on-demand/Quality board--quality-board.json', 'on-demand/Quality wall--quality-board.json'])
  assert.equal(gh.read('dashboards/Quality wall--quality-board.json'), blocks)
  // A page from before renamed: its blocks file stays dashboards/board.json.
  const old = gh.read('on-demand/board.json')
  const kept = await writePageFile(config, 'token', 'board', change(renamePage(parseOnDemandPage(old), 'Wall board', ''), old, 'rename'), 'board', gh.fetch)
  assert.equal(kept.dashboard, undefined)
  assert.deepEqual(gh.writes.at(-1).paths, ['on-demand/board.json'])
  assert.deepEqual((await listDashboards(config, 'token', gh.fetch)).map(({ id, path, others }) => [id, path, others.length]), [['board', 'dashboards/board.json', 0], ['quality-board', 'dashboards/Quality wall--quality-board.json', 0]])
  // Deleted with its page: every blocks file of the id.
  assert.equal(await removePage(config, 'token', 'quality-board', 'delete', gh.fetch, 'dashboards'), true)
  assert.equal(gh.read('dashboards/Quality wall--quality-board.json'), null)
})

test('GIT-27, OND-124: a page save GitHub answers with HTTP 500 is tried once more by itself and saved where its name says; twice a 500: the failure in plain words (TC-OND-123)', async () => {
  const gh = fakeGitHub({ files: {} })
  let fail = 1
  const flaky = async (url, init = {}) => (init.method === 'PUT' && fail-- > 0) ? new Response('{"message":"Server Error"}', { status: 500 }) : gh.fetch(url, init)
  const saved = await retryTransient(() => writePageFile(config, 'token', 'conq', change(conq(), null), null, flaky), 'on-demand/CoNQ--conq.json', 0, () => 0)
  assert.equal(saved.stem, 'CoNQ--conq')
  assert.equal(parseOnDemandPage(gh.read('on-demand/CoNQ--conq.json')).name, 'CoNQ')
  fail = 2
  await assert.rejects(retryTransient(() => writePageFile(config, 'token', 'other', change({ ...conq(), id: 'other', name: 'Other' }, null), null, flaky), 'on-demand/Other--other.json', 0, () => 0), /GitHub had a problem saving on-demand\/Other--other\.json \(HTTP 500\)\. Your change is kept here — press Retry/)
  assert.equal(gh.read('on-demand/Other--other.json'), null)
})
