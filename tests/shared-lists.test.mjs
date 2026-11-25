import test from 'node:test'
import assert from 'node:assert/strict'
import { attachLists, cleanItems, cleanSource, createList, diffEmpty, diffItems, editList, emptySharedLists, listCatalog, listNameProblem, listsBlock, listUsage, mergeSharedListsText, newListId, notInList, ownsAPage, parseSharedLists, refreshList, removeListBlock, resolveLists, serializeSharedLists, sharedListsFile, sourceConfig, sourceLabel, teamRef, upsertSharedList, valuesRef } from '../src/sharedLists.ts'
import { applyColumns, cellProblem, columnDrafts, columnEffects, columnTypeLabel, columnsError, currentValue, mergeOnDemandText, parseOnDemandPage, serializeOnDemandPage, upsertRow } from '../src/onDemand.ts'
import { applyOnDemandReplace, onDemandReplacePlan, replaceError } from '../src/replaceValues.ts'
import { applyUpload, planUpload, templateWorkbook } from '../src/bulkUpload.ts'
import { fetchTeamMembers, readTeamIdentities } from '../src/azureRead.ts'
import { mergeRowText, serializeRow } from '../src/rowFiles.ts'
import { defaultPolicy, parseAccess, rightsFor, serializeAccess } from '../src/access.ts'
import { fileLabel, pagesOfFile } from '../src/gitWatch.ts'
import { searchSettings } from '../src/adminOverview.ts'
import { privateGitWrites } from '../src/gitStorage.ts'
import { SaveQueue, writeQueuedText } from '../src/gitSaveQueue.ts'
import { fakeGitHub } from '../e2e/fakeGitHub.mjs'
import { readSharedListsCache, writeSharedListsCache } from '../src/sharedLists.ts'

// Built-in lists (LST-01…LST-14, CON-115; TC-LST-01…TC-LST-08). Synthetic people only (example.com).
const ana = { name: 'Ana Silva', id: 'a1a1a1a1-0000-4000-8000-00000000000a' }, ben = { name: 'Ben Okafor', id: 'b2b2b2b2-0000-4000-8000-00000000000b' }
const cara = { name: 'Cara Lund', id: 'c3c3c3c3-0000-4000-8000-00000000000c' }, dev = { name: 'Dev Rao', id: 'd4d4d4d4-0000-4000-8000-00000000000d' }
const source = { kind: 'azure-team', server: 'https://dev.azure.com/example', project: 'Project', team: 'QE Team' }
const fixed = { by: 'Tom Owner', random: () => 0.5, now: () => Date.UTC(2026, 10, 25, 9, 0, 0) }
const later = { ...fixed, now: () => Date.UTC(2026, 10, 26, 9, 0, 0) }
const qeList = () => createList(emptySharedLists(), { name: 'QE team', source, members: [ana, ben, cara] }, fixed)
const fileWith = (...lists) => ({ schema: 1, kind: 'shared-lists', lists })
const catalogOf = (file, values = []) => new Map(listCatalog(file, values).map((entry) => [entry.ref, entry]))

test('LST-02: cached team lists stay in their Git workspace (TC-LST-01)', () => {
  const oldFile = fileWith(qeList())
  const newFile = fileWith({ ...qeList(), items: [dev] })
  const oldWorkspace = 'example/old@main:access.json', newWorkspace = 'example/new@main:access.json'
  const entries = new Map([['demand-planning-shared-lists-v1', serializeSharedLists(oldFile)]])
  const storage = { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: (key) => entries.delete(key) }
  assert.equal(readSharedListsCache(oldWorkspace, storage), null, 'a cache with unknown origin is never loaded')
  writeSharedListsCache(oldWorkspace, serializeSharedLists(oldFile), storage)
  assert.equal(readSharedListsCache('', storage), null)
  assert.equal(readSharedListsCache(newWorkspace, storage), null)
  writeSharedListsCache(newWorkspace, serializeSharedLists(newFile), storage)
  writeSharedListsCache(oldWorkspace, null, storage)
  assert.equal(readSharedListsCache(oldWorkspace, storage), null)
  assert.deepEqual(readSharedListsCache(newWorkspace, storage), newFile)
})

test('LST-02: team-list saves and retries require verified private storage (TC-LST-01)', async () => {
  const target = { owner: 'example', repo: 'storage', branch: 'main', path: sharedListsFile }
  const github = fakeGitHub({ owner: target.owner, repo: target.repo })
  const queue = new SaveQueue()
  const text = serializeSharedLists(fileWith(qeList()))
  let visibility = 'private'
  let conflicting = true
  let submittedWrites = 0
  const send = privateGitWrites(target, 'synthetic', async (url, init) => {
    if (url === 'https://api.github.com/repos/example/storage') return Response.json({ visibility })
    if (init?.method === 'PUT') {
      submittedWrites += 1
      if (conflicting) return Response.json({ message: 'Conflict' }, { status: 409 })
    }
    return github.fetch(url, init)
  })
  const change = { text, base: null, at: '2026-11-25T09:00:00Z', message: 'Save team list', merge: mergeSharedListsText }
  const save = () => writeQueuedText(target, 'synthetic', change, send)
  await assert.rejects(queue.enqueue(target.path, change.at, save), /kept changing in Git/)
  assert.equal(queue.state(target.path).failed, 1)
  conflicting = false
  submittedWrites = 0
  visibility = 'public'
  await queue.retry(target.path)
  visibility = 'internal'
  await assert.rejects(save(), /private Git data repository/)
  assert.equal(submittedWrites, 0)
  assert.equal(github.read(target.path), null)
  visibility = 'private'
  await save()
  assert.equal(submittedWrites, 1)
  assert.equal(github.read(target.path), text)
})
const page = (rows = []) => ({ schema: 1, kind: 'on-demand-page', id: 'audits', name: 'Audits', description: '', keyPrefix: 'AUD', columns: [{ id: 'c1', name: 'Auditor', type: 'dropdown', options: ['Ana Silva', 'Ben Okafor', 'Cara Lund'], required: false, list: 'team:qe-team' }, { id: 'c2', name: 'Reviewers', type: 'multi', options: [], required: false, list: 'team:qe-team' }, { id: 'c3', name: 'Note', type: 'text', options: [], required: false }], rows, insights: [] })

test('LST-02, LST-04: the shared lists file — round trip, items cleaned, broken files refused as a whole (TC-LST-01)', () => {
  const list = qeList()
  assert.equal(list.id, 'qe-team')
  assert.deepEqual(list.items.map((item) => item.name), ['Ana Silva', 'Ben Okafor', 'Cara Lund'])
  assert.equal(list.refreshedBy, 'Tom Owner')
  assert.deepEqual(list.log.map((entry) => [entry.action, entry.added.length]), [['created', 3]])
  const text = serializeSharedLists(fileWith(list))
  assert.deepEqual(parseSharedLists(text), fileWith(list))
  assert.equal(serializeSharedLists(parseSharedLists(text)), text)
  // Items: the identity id only when it is a GUID (lower case), each id once, names without an id once, no email ever,
  // sorted by name; two people with the same name and their own ids stay two.
  assert.deepEqual(cleanItems([{ name: ' Zoe  Park ', id: 'E5E5E5E5-0000-4000-8000-00000000000E' }, { name: 'Zoe Park', id: 'e5e5e5e5-0000-4000-8000-00000000000e' }, { name: 'Zoe Park', id: 'f6f6f6f6-0000-4000-8000-00000000000f', email: 'zoe.park@example.com' }, { name: 'Guest', id: 'not-a-guid' }, { name: 'guest' }, { name: '' }, 'x']), [{ name: 'Guest' }, { name: 'Zoe Park', id: 'e5e5e5e5-0000-4000-8000-00000000000e' }, { name: 'Zoe Park', id: 'f6f6f6f6-0000-4000-8000-00000000000f' }])
  assert.throws(() => parseSharedLists('{'), /not valid JSON/)
  assert.throws(() => parseSharedLists('{"schema":1,"kind":"other","lists":[]}'), /not a shared lists file/)
  assert.throws(() => parseSharedLists(JSON.stringify(fileWith({ ...list, id: 'Bad Id' }))), /no valid id/)
  assert.throws(() => parseSharedLists(JSON.stringify(fileWith({ ...list, source: { ...source, server: 'http://dev.azure.com/example' } }))), /no valid source/)
  assert.throws(() => parseSharedLists(JSON.stringify(fileWith(list, { ...list, id: 'other' }))), /twice/)
  // A source: https only, no credentials; the on-prem collection is kept; the PAT is never part of it.
  assert.equal(cleanSource({ ...source, server: 'https://user:pw@dev.azure.com/example' }), null)
  assert.deepEqual(sourceConfig({ ...source, server: 'https://tfs.example.com/tfs/DefaultCollection' }), { organization: 'DefaultCollection', project: 'Project', team: 'QE Team', baseUrl: 'https://tfs.example.com/tfs/DefaultCollection' })
  assert.deepEqual(sourceConfig(source), { organization: 'example', project: 'Project', team: 'QE Team' })
  assert.equal(sourceLabel(source), 'dev.azure.com/example · Project · QE Team')
  assert.doesNotMatch(text, /token|pat/i)
  assert.equal(listNameProblem(fileWith(list), 'qe TEAM'), 'A list named “qe TEAM” exists.')
  assert.equal(newListId('QE team', ['qe-team']), 'qe-team-2')
})

test('LST-06: Refresh — the difference by identity id (added, removed, renamed), one log entry, nothing else changed (TC-LST-02)', () => {
  const list = qeList()
  const members = [ana, { name: 'Ben Okafor-Smith', id: 'B2B2B2B2-0000-4000-8000-00000000000B' }, dev]
  const diff = diffItems(list.items, cleanItems(members))
  assert.deepEqual(diff.added.map((item) => item.name), ['Dev Rao'])
  assert.deepEqual(diff.removed.map((item) => item.name), ['Cara Lund'])
  assert.deepEqual(diff.renamed, [{ from: 'Ben Okafor', to: 'Ben Okafor-Smith', id: 'b2b2b2b2-0000-4000-8000-00000000000b' }])
  assert.equal(diff.kept, 1)
  assert.ok(diffEmpty(diffItems(list.items, list.items)))
  const next = refreshList(list, members, later)
  assert.deepEqual(next.items.map((item) => item.name), ['Ana Silva', 'Ben Okafor-Smith', 'Dev Rao'])
  assert.equal(next.refreshedAt, '2026-11-26T09:00:00.000Z')
  assert.deepEqual(next.log.at(-1), { id: next.log.at(-1).id, at: '2026-11-26T09:00:00.000Z', by: 'Tom Owner', action: 'refreshed', added: ['Dev Rao'], removed: ['Cara Lund'], renamed: ['Ben Okafor → Ben Okafor-Smith'] })
  assert.equal(next.createdAt, list.createdAt)
  // LST-07: Edit — renamed or another team, logged; unchanged gives the same list.
  const edited = editList(next, { name: 'QE people', source: { ...source, team: 'QE Team 2' } }, later)
  assert.match(edited.log.at(-1).note, /renamed from “QE team”; source was dev\.azure\.com\/example · Project · QE Team/)
  assert.equal(editList(next, { name: next.name, source: next.source }, later), next)
})

test('LST-02: two saves meanwhile are merged by list, the log of both kept (GIT-17) (TC-LST-01)', () => {
  const base = fileWith(qeList())
  const mine = upsertSharedList(base, refreshList(base.lists[0], [ana, ben, cara, dev], later))
  const other = createList(base, { name: 'Leads', source: { ...source, team: 'Leads' }, members: [ana] }, fixed)
  const theirs = upsertSharedList(base, other)
  const merged = parseSharedLists(mergeSharedListsText(serializeSharedLists(base), serializeSharedLists(mine), serializeSharedLists(theirs), true))
  assert.deepEqual(merged.lists.map((list) => list.name), ['Leads', 'QE team'])
  assert.equal(merged.lists[1].items.length, 4)
  // Both refreshed the same list: the later save's items, both log entries.
  const theirsRefresh = upsertSharedList(base, refreshList(base.lists[0], [ana], { ...fixed, random: () => 0.1, now: () => Date.UTC(2026, 10, 25, 12) }))
  const both = parseSharedLists(mergeSharedListsText(serializeSharedLists(base), serializeSharedLists(mine), serializeSharedLists(theirsRefresh), true))
  assert.equal(both.lists[0].items.length, 4)
  assert.deepEqual(both.lists[0].log.map((entry) => entry.action), ['created', 'refreshed', 'refreshed'])
})

test('LST-08, LST-09, LST-11: a built-in list column — choices from the list, a renamed person by identity id, a removed one kept and marked (TC-LST-03)', () => {
  const list = qeList()
  const file = fileWith(list)
  const catalog = catalogOf(file, [{ id: 'sites', name: 'Sites', values: ['Lab A', 'Lab B'] }])
  assert.deepEqual([...catalog.keys()], ['team:qe-team', 'values:sites'])
  assert.equal(columnTypeLabel({ type: 'dropdown', list: 'team:qe-team' }), 'Dropdown (built-in list)')
  assert.equal(columnTypeLabel({ type: 'multi', list: '' }), 'Multi-select (built-in list)')
  // A row picked in the drawer: the value is the name, the key the identity id (attached items, upsertRow).
  let saved = upsertRow(attachLists(page(), catalog), { id: 'r1', cells: { c1: 'Ben Okafor', c2: ['Ana Silva', 'Cara Lund'] } }, fixed)
  assert.deepEqual(saved.rows[0].refs, { c1: ['b2b2b2b2-0000-4000-8000-00000000000b'], c2: ['a1a1a1a1-0000-4000-8000-00000000000a', 'c3c3c3c3-0000-4000-8000-00000000000c'] })
  assert.equal(saved.columns[0].items, catalog.get('team:qe-team').items, 'attached, not written')
  const text = serializeOnDemandPage(saved)
  assert.doesNotMatch(text, /"items"/)
  assert.match(text, /"list": "team:qe-team"/)
  const read = parseOnDemandPage(text, 'audits')
  assert.deepEqual(read.rows[0].refs, saved.rows[0].refs)
  assert.equal(read.columns[0].list, 'team:qe-team')
  // Refreshed: Ben renamed (same identity id), Cara removed.
  const after = fileWith(refreshList(list, [ana, { name: 'Ben Okafor-Smith', id: 'b2b2b2b2-0000-4000-8000-00000000000b' }, dev], later))
  const shown = resolveLists(read, catalogOf(after))
  assert.deepEqual(shown.columns[0].options, ['Ana Silva', 'Ben Okafor-Smith', 'Dev Rao'])
  assert.equal(shown.rows[0].cells.c1, 'Ben Okafor-Smith')
  assert.deepEqual(shown.rows[0].cells.c2, ['Ana Silva', 'Cara Lund'])
  assert.equal(cellProblem(shown.columns[1], shown.rows[0].cells.c2), 'not in the list')
  assert.equal(cellProblem(shown.columns[0], shown.rows[0].cells.c1), '')
  assert.equal(notInList(shown, 'c2'), 1)
  assert.equal(read.rows[0].cells.c1, 'Ben Okafor', 'the file is not changed by showing it')
  // Saved again (another field): the new name is written, the removed person keeps her key.
  const resaved = upsertRow(attachLists(read, catalogOf(after)), { id: 'r1', cells: { ...shown.rows[0].cells, c3: 'checked' } }, later)
  assert.deepEqual(resaved.rows[0].cells.c1, 'Ben Okafor-Smith')
  assert.deepEqual(resaved.rows[0].refs, { c1: ['b2b2b2b2-0000-4000-8000-00000000000b'], c2: ['a1a1a1a1-0000-4000-8000-00000000000a', 'c3c3c3c3-0000-4000-8000-00000000000c'] })
  // The list not found: the options last saved, marked.
  const missing = resolveLists(read, new Map())
  assert.equal(missing.columns[0].listMissing, true)
  assert.deepEqual(missing.columns[0].options, ['Ana Silva', 'Ben Okafor', 'Cara Lund'])
  // Keys only for list columns, one per value, identity ids only (an email is refused).
  const bad = parseOnDemandPage(JSON.stringify({ ...JSON.parse(text), rows: [{ id: 'r1', cells: { c1: 'Ben Okafor', c2: ['Ana Silva'], c3: 'x' }, refs: { c1: ['ben.okafor@example.com'], c2: ['a1a1a1a1-0000-4000-8000-00000000000a', 'b2b2b2b2-0000-4000-8000-00000000000b'], c3: ['c3c3c3c3-0000-4000-8000-00000000000c'] } }] }), 'audits')
  assert.equal(bad.rows[0].refs, undefined)
  // A Value list as the source: names only, no keys.
  const values = upsertRow(attachLists({ ...page(), columns: [{ id: 'c1', name: 'Site', type: 'dropdown', options: [], required: false, list: 'values:sites' }] }, catalog), { id: 'r2', cells: { c1: 'Lab B' } }, fixed)
  assert.equal(values.rows[0].refs, undefined)
  assert.deepEqual(resolveLists(values, catalog).columns[0].options, ['Lab A', 'Lab B'])
  assert.deepEqual(listUsage([page()], teamRef('qe-team')), ['Audits: Auditor', 'Audits: Reviewers'])
  assert.equal(valuesRef('sites'), 'values:sites')
})

test('LST-08: Set up columns — the list is chosen instead of options, its names kept as the options; keys follow the column (TC-LST-04)', () => {
  const base = { ...page(), columns: [{ id: 'c3', name: 'Owner', type: 'text', options: [], required: false }], rows: [{ id: 'r1', cells: { c3: 'Ana Silva' } }] }
  const drafts = columnDrafts(base.columns)
  assert.equal(columnsError([{ ...drafts[0], type: 'dropdown', list: '' }]), '“Owner” is a Dropdown (built-in list) column: choose its list.')
  const chosen = [{ ...drafts[0], type: 'dropdown', list: 'team:qe-team', options: ['Ana Silva', 'Ben Okafor'].map((label) => ({ label, was: label })) }]
  assert.equal(columnsError(chosen), '')
  assert.deepEqual(columnEffects(base, chosen), ['“Owner” changes from Text to Dropdown (one value): its 1 value is kept.', '“Owner” takes its choices from a built-in list: its 1 value is kept; a value not in the list is shown as “not in the list” until changed.'])
  const applied = applyColumns(base, chosen)
  assert.deepEqual(applied.columns[0], { id: 'c3', name: 'Owner', type: 'dropdown', required: false, options: ['Ana Silva', 'Ben Okafor'], list: 'team:qe-team' })
  // Keys stay while the column keeps its list and type; another list or type drops them.
  const keyed = { ...applied, rows: [{ ...applied.rows[0], refs: { c3: ['a1a1a1a1-0000-4000-8000-00000000000a'] } }] }
  assert.deepEqual(applyColumns(keyed, columnDrafts(keyed.columns)).rows[0].refs, { c3: ['a1a1a1a1-0000-4000-8000-00000000000a'] })
  assert.equal(applyColumns(keyed, [{ ...columnDrafts(keyed.columns)[0], list: 'values:sites' }]).rows[0].refs, undefined)
  assert.equal(applyColumns(keyed, [{ ...columnDrafts(keyed.columns)[0], list: undefined }]).columns[0].list, undefined)
  // An older page file: a Dropdown with options and no list reads as before.
  assert.equal(parseOnDemandPage(JSON.stringify({ ...page(), columns: [{ id: 'c1', name: 'A', type: 'text', list: 'team:qe-team' }, { id: 'c2', name: 'B', type: 'dropdown', options: ['X'], list: 'bad ref' }] }), 'audits').columns.map((column) => column.list).join(), ',')
})

test('LST-10: Replace in a built-in list column — only a value of the list, found by its current name, keys follow (TC-LST-05)', () => {
  const catalog = catalogOf(fileWith(qeList()))
  let file = upsertRow(attachLists(page(), catalog), { id: 'r1', key: 'AUD-261125-AAAA', cells: { c1: 'Ben Okafor' } }, fixed)
  file = upsertRow(file, { id: 'r2', key: 'AUD-261125-BBBB', cells: { c1: 'Cara Lund' } }, fixed)
  const shown = resolveLists(file, catalog)
  assert.match(replaceError(shown.columns[0], 'Ben Okafor', 'Zed Unknown'), /not in the built-in list of Auditor/)
  assert.equal(replaceError(shown.columns[0], 'Ben Okafor', 'Ana Silva'), '')
  const done = applyOnDemandReplace(attachLists(file, catalog), 'c1', 'Ben Okafor', 'Ana Silva', { by: 'Tom Owner' })
  assert.equal(done.changed, 1)
  assert.equal(done.page.rows[0].cells.c1, 'Ana Silva')
  assert.deepEqual(done.page.rows[0].refs, { c1: ['a1a1a1a1-0000-4000-8000-00000000000a'] })
  assert.deepEqual(done.page.rows[1].refs, { c1: ['c3c3c3c3-0000-4000-8000-00000000000c'] })
  // A renamed person is found by the name the list has now.
  const renamed = catalogOf(fileWith(refreshList(qeList(), [ana, { name: 'Ben Okafor-Smith', id: 'b2b2b2b2-0000-4000-8000-00000000000b' }, cara], later)))
  const plan = onDemandReplacePlan(attachLists(file, renamed), 'c1', 'Ben Okafor-Smith', 'Cara Lund')
  assert.deepEqual(plan.changes.map((change) => change.id), ['r1'])
  assert.equal(currentValue(attachLists(file, renamed).columns[0], file.rows[0]), 'Ben Okafor-Smith')
})

test('LST-10: bulk upload — the template lists the list as it is now; an upload takes its names and keys them (TC-LST-06)', () => {
  const catalog = catalogOf(fileWith(qeList()))
  const shown = resolveLists(page(), catalog)
  const [sheet] = templateWorkbook(shown)
  const auditor = sheet.validations.find((entry) => entry.sqref.startsWith('B2'))
  assert.deepEqual(auditor.items, ['Ana Silva', 'Ben Okafor', 'Cara Lund'])
  assert.equal(auditor.strict, true)
  assert.match(sheet.validations.find((entry) => entry.sqref === 'B1').prompt, /Choose one value of the built-in list\./)
  const plan = planUpload(shown, { name: 'Audits', rows: [['Row ID', 'Auditor', 'Reviewers', 'Note'], ['', 'Ana Silva', 'Ben Okafor; Cara Lund', 'n'], ['', 'Zed Unknown', '', '']] })
  assert.equal(plan.added.length, 1)
  assert.match(plan.errors[0].message, /not an option of Auditor/)
  const done = applyUpload(attachLists(page(), catalog), plan, { by: 'Tom Owner', fileName: 'audits.xlsx' })
  assert.deepEqual(done.page.rows[0].refs, { c1: ['a1a1a1a1-0000-4000-8000-00000000000a'], c2: ['b2b2b2b2-0000-4000-8000-00000000000b', 'c3c3c3c3-0000-4000-8000-00000000000c'] })
})

test('LST-02, OND-34: row files and page merges keep a value with its keys (TC-LST-01)', () => {
  const row = (cells, refs) => serializeRow({ id: 'r1', key: 'AUD-261125-AAAA', seq: 1, cells, ...(refs ? { refs } : {}) })
  const base = row({ c1: 'Ana Silva', c3: 'a' }, { c1: ['a1a1a1a1-0000-4000-8000-00000000000a'] })
  const mine = row({ c1: 'Ben Okafor', c3: 'a' }, { c1: ['b2b2b2b2-0000-4000-8000-00000000000b'] })
  const theirs = row({ c1: 'Ana Silva', c3: 'b' }, { c1: ['a1a1a1a1-0000-4000-8000-00000000000a'] })
  const merged = JSON.parse(mergeRowText(base, mine, theirs, false))
  assert.deepEqual(merged.cells, { c1: 'Ben Okafor', c3: 'b' })
  assert.deepEqual(merged.refs, { c1: ['b2b2b2b2-0000-4000-8000-00000000000b'] })
  const catalog = catalogOf(fileWith(qeList()))
  const start = upsertRow(attachLists(page(), catalog), { id: 'r1', cells: { c1: 'Ana Silva' } }, fixed)
  const a = upsertRow(attachLists(start, catalog), { id: 'r1', cells: { c1: 'Cara Lund' } }, later)
  const pageMerged = parseOnDemandPage(mergeOnDemandText(serializeOnDemandPage(start), serializeOnDemandPage(a), serializeOnDemandPage(start), true), 'audits')
  assert.deepEqual(pageMerged.rows[0].refs, { c1: ['c3c3c3c3-0000-4000-8000-00000000000c'] })
})

test('CON-115, LST-12: who may change the lists — the right (Tool Owner, Admin, Scrum Master), page co-owners, fail closed (TC-LST-07)', () => {
  const policy = defaultPolicy()
  for (const role of ['Tool Owner', 'Admin', 'Scrum Master']) assert.ok(policy.roles[role].actions.includes('lists.manage'), role)
  for (const role of ['Product Owner', 'People Manager', 'Team Member']) assert.ok(!policy.roles[role].actions.includes('lists.manage'), role)
  assert.match(serializeAccess(policy), /"permissions": 9/)
  // A file written before permissions 9: the starting matrix for the roles it lists; saved again, Not set stays.
  const v8 = JSON.parse(serializeAccess(policy)); v8.permissions = 8
  for (const rights of Object.values(v8.roles)) rights.actions = rights.actions.filter((key) => key !== 'lists.manage')
  const read = parseAccess(JSON.stringify(v8))
  assert.ok(read.roles['Scrum Master'].actions.includes('lists.manage') && read.roles.Admin.actions.includes('lists.manage'))
  assert.ok(!read.roles['Team Member'].actions.includes('lists.manage'))
  read.roles.Admin.actions = read.roles.Admin.actions.filter((key) => key !== 'lists.manage')
  assert.ok(!parseAccess(serializeAccess(read)).roles.Admin.actions.includes('lists.manage'), 'saved again: Not set stays')
  assert.equal(rightsFor(null, 'x@example.com').actions.has('lists.manage'), false)
  const can = (allowed) => (action) => allowed.includes(action)
  const git = { connected: true, readOnly: false, isSample: false }, ready = { loaded: true, error: '' }
  const viewer = (allowed, extra = {}) => ({ email: 'pia@example.com', viewingAs: '', readOnly: false, can: can(allowed), ...extra })
  assert.equal(listsBlock(viewer(['lists.manage']), false, git, ready), '')
  assert.match(listsBlock(viewer([]), false, git, ready), /Manage built-in lists.*Co-owners of an On-Demand page/)
  assert.equal(listsBlock(viewer([]), true, git, ready), '', 'a page co-owner creates and refreshes lists')
  assert.match(removeListBlock(viewer([]), git, ready, []), /page co-owner cannot remove/)
  assert.equal(removeListBlock(viewer(['lists.manage']), git, ready, []), '')
  assert.match(removeListBlock(viewer(['lists.manage']), git, ready, ['Audits: Auditor']), /Used by Audits: Auditor/)
  assert.match(listsBlock(viewer(['lists.manage'], { viewingAs: 'Team Member' }), true, git, ready), /viewing as Team Member/)
  assert.match(listsBlock(viewer(['lists.manage'], { readOnly: true }), false, git, ready), /Read only: the access roles are not loaded/)
  assert.match(listsBlock(viewer(['lists.manage']), false, { ...git, isSample: true }, ready), /Synthetic sample/)
  assert.match(listsBlock(viewer(['lists.manage']), false, { ...git, connected: false }, ready), /Connect Git storage/)
  assert.match(listsBlock(viewer(['lists.manage']), false, git, { loaded: true, error: 'broken' }), /could not be read from Git/)
  const layout = { schema: 1, kind: 'menu-layout', groups: { 'g-qa': { name: 'QA', order: 1, acceptsPages: true, owners: ['gina@example.com'] } }, pages: { audits: { type: 'table', group: 'ondemand', order: 0, icon: '', owners: ['pia@example.com'] } } }
  assert.ok(ownsAPage(layout, 'PIA@example.com'))
  assert.ok(ownsAPage(layout, 'gina@example.com'))
  assert.ok(!ownsAPage(layout, 'tia@example.com'))
  assert.ok(!ownsAPage({ ...layout, groups: { 'g-qa': { ...layout.groups['g-qa'], acceptsPages: false } } }, 'gina@example.com'), 'a group co-owner only while the group takes pages')
})

test('LST-02: newer lists in Git are loaded quietly; Search settings finds the team lists (TC-LST-08)', () => {
  assert.deepEqual(pagesOfFile('data/shared-lists.json', 'data/planning-data.json'), { pages: ['admin:epics'], quiet: 'lists', loader: 'sharedLists' })
  assert.equal(fileLabel(`data/${sharedListsFile}`), 'Built-in lists')
  assert.ok(searchSettings('qe list').some((entry) => entry.label === 'Team lists from Azure DevOps'))
})

test('LST-04, LST-15: keys from Azure DevOps — identity ids, no email in Git; two people with one display name stay two, told apart in the picker (TC-LST-11)', async () => {
  // The team read: identity.id kept (lower case), the email only for the screen; groups and bad ids left out.
  const transport = async () => ({ value: [
    { identity: { id: 'A1A1A1A1-0000-4000-8000-00000000000A', displayName: 'Sam Lee', uniqueName: 'sam.lee@example.com' } },
    { identity: { id: 'a1a1ffff-0000-4000-8000-000000000001', displayName: 'Sam Lee', uniqueName: 'sam.lee2@example.com' } },
    { identity: { id: 'not-a-guid', displayName: 'Guest' } },
    { identity: { id: 'c3c3c3c3-0000-4000-8000-00000000000c', displayName: 'QE Leads', isContainer: true } },
  ] })
  const config = { organization: 'example', project: 'Project', team: 'QE Team' }
  const read = await readTeamIdentities(config, 'x', transport)
  assert.deepEqual(read, [{ name: 'Sam Lee', id: 'a1a1a1a1-0000-4000-8000-00000000000a', email: 'sam.lee@example.com' }, { name: 'Sam Lee', id: 'a1a1ffff-0000-4000-8000-000000000001', email: 'sam.lee2@example.com' }, { name: 'Guest' }])
  assert.deepEqual(await fetchTeamMembers(config, 'x', transport), [{ name: 'Guest' }, { name: 'Sam Lee', email: 'sam.lee2@example.com' }], 'People & access reads as before (by name)')
  // Saved: names and ids only — no email, and who refreshed it by name only.
  const list = createList(emptySharedLists(), { name: 'QE team', source, members: read }, { ...fixed, by: 'tom.owner@example.com' })
  const text = serializeSharedLists(fileWith(list))
  assert.doesNotMatch(text, /@/)
  assert.equal(list.createdBy, 'someone')
  assert.equal(parseSharedLists(text).lists[0].items.length, 3)
  // The picker: the twins as "Sam Lee (#a1a1a…)", as many id characters as tell them apart; a single name stays as it is.
  const entry = listCatalog(fileWith(list))[0]
  assert.deepEqual(entry.items.map((item) => item.name), ['Guest', 'Sam Lee (#a1a1a)', 'Sam Lee (#a1a1f)'])
  const catalog = new Map([[entry.ref, entry]])
  const saved = upsertRow(attachLists(page(), catalog), { id: 'r1', cells: { c1: 'Sam Lee (#a1a1f)' } }, fixed)
  assert.deepEqual(saved.rows[0].refs, { c1: ['a1a1ffff-0000-4000-8000-000000000001'] })
  // One twin leaves: the other is shown by the plain name again, their row follows by the id.
  const alone = refreshList(list, read.filter((member) => member.id !== 'a1a1a1a1-0000-4000-8000-00000000000a'), later)
  const shown = resolveLists(parseOnDemandPage(serializeOnDemandPage(saved), 'audits'), catalogOf(fileWith(alone)))
  assert.equal(shown.rows[0].cells.c1, 'Sam Lee')
  assert.equal(cellProblem(shown.columns[0], shown.rows[0].cells.c1), '')
  assert.doesNotMatch(serializeOnDemandPage(saved), /sam\.lee/)
})
