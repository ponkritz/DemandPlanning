import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { addCustomStream, changeCustomStream, customStreamDefs, customStreamProblem, parseCustomStreams, removeCustomStream, ruleOf, ruleOptions, serializeCustomStreams } from '../src/customStreams.ts'
import { allStreams, releaseMenuEntries, defaultStreams, exportForStream, isEcpExport, profileForStream, setCustomStreams, streamNamedBy, streamOfProfile, streamsVersion, windchillOptionsForView, windchillStreamExports } from '../src/streams.ts'
import { defaultStreamReleases } from '../src/releaseOverview.ts'
import { releaseRegister } from '../src/releaseSource.ts'
import { windchillReleases } from '../src/windchillReleases.ts'
import { otherMenuViews } from '../src/backlogViews.ts'

// STR-01…06: custom streams added by the Tool Owner in the shared setup (custom-streams.json).
const file = (streams) => JSON.stringify({ schema: 1, kind: 'custom-streams', streams })
const doc = (id, areaPath, title, approvalDate = '2026-10-05T10:00:00Z') => ({ key: `o/p/${id}`, id, title, workItemType: 'Document', state: 'Approved', assignedTo: '', areaPath, iterationPath: 'DHP', tags: '', url: '', organization: 'o', project: 'p', syncedAt: '', approvalDate })
const source = (connectionId, items) => ({ connectionId, name: connectionId, role: 'reference', organization: 'o', project: 'p', query: 'q', fetchedAt: '2026-10-20T00:00:00Z', items })
afterEach(() => setCustomStreams([]))

test('STR-05: the file read from Git — round trip, each stream checked on its own (unknown rule, CP, built-in names refused with why), a broken file refused whole (TC-STR-02)', () => {
  const entries = [{ name: 'Labeling', rule: 'title', fuzzy: false }, { name: 'Recalls', rule: 'iocc', fuzzy: true, aliases: ['RCL', 'rcl', 'Recalls'], epics: [12, '12', -3, 'x', 40] }, { name: 'Field Actions', rule: 'windchill-project', fuzzy: true, epics: [5] }]
  const parsed = parseCustomStreams(file(entries))
  assert.deepEqual(parsed.refused, [])
  assert.deepEqual(parsed.streams, [
    { name: 'Labeling', rule: 'title', fuzzy: false },
    { name: 'Recalls', rule: 'iocc', fuzzy: true, aliases: ['RCL'], epics: [12, 40] },
    { name: 'Field Actions', rule: 'windchill-project', fuzzy: false },
  ], 'aliases cleaned (no duplicate, not the name), Epics only positive IDs and only where the rule has them, no fuzzy match for Windchill')
  assert.deepEqual(parseCustomStreams(serializeCustomStreams(parsed.streams)).streams, parsed.streams, 'serialize → parse keeps every stream')
  assert.match(serializeCustomStreams(parsed.streams), /^\{\n  "schema": 1,\n  "kind": "custom-streams",/)

  const mixed = parseCustomStreams(file([{ name: 'Labeling', rule: 'title' }, { name: 'Tree', rule: 'cp' }, { name: 'Odd', rule: 'formula' }, { name: 'dp', rule: 'title' }, { name: 'Q R E', rule: 'windchill' }, { name: 'Pedestal', rule: 'dp' }, { name: 'labeling', rule: 'tool' }, { name: 'X', rule: 'title' }, 'text', { name: 'Ok', rule: 'tool', aliases: ['Content'] }]))
  assert.deepEqual(mixed.streams.map((entry) => entry.name), ['Labeling'])
  assert.deepEqual(mixed.refused.map((entry) => entry.name), ['Tree', 'Odd', 'dp', 'Q R E', 'Pedestal', 'labeling', 'X', '(unnamed)', 'Ok'])
  const reason = (name) => mixed.refused.find((entry) => entry.name === name).reason
  assert.match(reason('Tree'), /CP’s release-folder tree rule cannot be used by a custom stream/)
  assert.match(reason('Odd'), /unknown release rule “formula”\. The rules are dp, iocc, title, tool, windchill, windchill-project\./)
  assert.match(reason('dp'), /is the name of the built-in stream or page “DP”: choose another name/)
  assert.match(reason('Q R E'), /built-in stream or page “QRE”/, 'an earlier name of a built-in stream too')
  assert.match(reason('Pedestal'), /built-in data set “Pedestal”/)
  assert.match(reason('labeling'), /clashes with the custom stream “Labeling”/)
  assert.match(reason('X'), /2 to 40 characters/)
  assert.match(reason('Ok'), /earlier name “Content” is the built-in “Content”/)

  assert.deepEqual(parseCustomStreams(null), { streams: [], refused: [] }, 'no file in Git: no custom streams')
  assert.throws(() => parseCustomStreams('{ nope'), /custom-streams\.json in Git is not valid JSON: the custom streams were not changed/)
  assert.throws(() => parseCustomStreams(JSON.stringify({ schema: 1, kind: 'azure-devops-views', views: [] })), /not a custom streams file \(schema 1\)/)
})

test('STR-01, STR-06: add, rename (the old name kept as an earlier name) and remove; the offered rules by plain names (TC-STR-03)', () => {
  assert.deepEqual(ruleOptions.map((option) => option.label), [
    'Like DP — release from Area/Iteration path', 'Like IOCC — grouped by area, name from title', 'Like Content — each document is a release by its title',
    'Like Tool Validations — one per tool', 'Like S&S IT — Windchill path', 'Like ECP — Windchill projects',
  ])
  assert.ok(ruleOptions.every((option) => option.example && option.gives), 'each with an example')
  let list = addCustomStream([], { name: 'Labeling', rule: 'title', fuzzy: false })
  assert.throws(() => addCustomStream(list, { name: 'LABELING', rule: 'tool', fuzzy: false }), /clashes with the custom stream “Labeling”/)
  assert.throws(() => addCustomStream(list, { name: 'Tool Validations', rule: 'tool', fuzzy: false }), /built-in stream/)
  list = changeCustomStream(list, 'Labeling', { name: 'Labels', rule: 'title', fuzzy: true })
  assert.deepEqual(list, [{ name: 'Labels', rule: 'title', fuzzy: true, aliases: ['Labeling'] }])
  assert.throws(() => changeCustomStream(list, 'Nope', { name: 'X1', rule: 'title', fuzzy: false }), /is not a custom stream/)
  assert.deepEqual(removeCustomStream(list, 'labels'), [])
  assert.equal(customStreamProblem({ name: '', rule: 'title' }), 'Give the stream a name.')
  assert.deepEqual(customStreamDefs([{ name: 'Field Actions', rule: 'windchill-project', fuzzy: false }]), [{ name: 'Field Actions', source: 'windchill', rule: 'path', fuzzy: false, custom: true, project: true }])
  assert.equal(ruleOf({ source: 'windchill', rule: 'path', project: true }).key, 'windchill-project')
})

test('STR-02: allStreams — the built-in streams then the custom ones; a connection goes to the stream with the longest name (TC-STR-01)', () => {
  assert.equal(allStreams(), defaultStreams, 'no custom stream: the built-in list')
  const before = streamsVersion()
  setCustomStreams(customStreamDefs([{ name: 'DP Labels', rule: 'title', fuzzy: false }, { name: 'Labeling', rule: 'title', fuzzy: false, aliases: ['Labelling'] }]))
  assert.ok(streamsVersion() > before, 'a change is announced')
  assert.deepEqual(allStreams().map((stream) => stream.name), ['DP', 'CP', 'IOCC', 'Content', 'Tool Validations', 'S&S IT', 'ECP', 'DP Labels', 'Labeling'])
  const profiles = [{ id: 'dp', reason: 'DP', role: 'release-source' }, { id: 'dpl', reason: 'x', viewName: 'DP Labels [Approved]', role: 'release-source' }, { id: 'old', reason: 'Labelling', role: 'release-source' }]
  assert.equal(streamOfProfile(profiles[1]).name, 'DP Labels', 'the longer name wins over DP')
  assert.equal(profileForStream(allStreams()[0], profiles).id, 'dp', 'DP keeps only its own connection')
  assert.equal(profileForStream(allStreams()[7], profiles).id, 'dpl')
  assert.equal(profileForStream(allStreams()[8], profiles).id, 'old', 'a connection named after an earlier name')
  assert.equal(streamNamedBy(['Labeling export']).name, 'Labeling')
  const views = [{ id: 'dpl', name: 'DP Labels [Approved]', readOnly: true }, { id: 'mine', name: 'Something else', readOnly: true }]
  assert.deepEqual(otherMenuViews(views, profiles, []).azure.map((view) => view.id), ['mine'], 'a custom stream’s view sits under Release Details, not Other views')
  setCustomStreams([])
  assert.deepEqual(otherMenuViews(views, profiles, []).azure.map((view) => view.id), ['dpl', 'mine'], 'removed: its connection is kept, under Other views')
})

test('STR-03: a custom stream “Like IOCC” reads its documents into releases grouped by the Area Path after its name, with Completed and Supported (TC-STR-04)', () => {
  setCustomStreams(customStreamDefs([{ name: 'Labeling', rule: 'iocc', fuzzy: true }]))
  const items = [
    doc(1, 'DHP.Vault\\Labeling\\Mobile\\Docs', 'Mobile Label Set Release 2.3.1 - Release Plan', '2026-10-02T10:00:00Z'),
    doc(2, 'DHP.Vault\\Labeling\\Mobile\\Docs', 'Mobile Label Set Release 2.3.1 - Release Notes', '2026-10-12T10:00:00Z'),
    doc(3, 'DHP.Vault\\Labeling\\Mobile\\Docs', 'Mobile Label Set Release 2.3.1 Verification Report', '2026-10-14T10:00:00Z'),
    doc(4, 'DHP.Vault\\Labeling\\Core', 'Core IFU v4.0 Release Plan', '2026-10-20T10:00:00Z'),
    doc(5, 'DHP.Vault\\Labeling\\Core', 'Core IFU v3.9 Release Notes', '2026-09-20T10:00:00Z'),
  ]
  const register = releaseRegister(items, [], { rule: 'iocc', area: ['Labeling'] })
  assert.deepEqual(register.map((entry) => `${entry.group}|${entry.name}|${entry.release}|${entry.documents}`).sort(), ['Core|Core IFU|3.9|1', 'Core|Core IFU|4.0|1', 'Mobile|Mobile Label Set|2.3.1|3'])
  const profiles = [{ id: 'lab', reason: 'Labeling', viewName: 'Labeling', role: 'release-source' }]
  const streams = defaultStreamReleases({ azureSources: [source('lab', items)] }, profiles, '2026-10', 'UTC')
  const labeling = streams.find((stream) => stream.name === 'Labeling')
  assert.ok(labeling, 'listed after the built-in streams')
  assert.equal(streams.at(-1), labeling)
  assert.deepEqual(labeling.releases.map((entry) => `${entry.type} ${entry.name} ${entry.release}`), ['Mobile Mobile Label Set 2.3.1'], 'Completed: Release Notes or Verification Report signed in the month')
  assert.equal(labeling.supported, 2, 'Supported: the Mobile release and the Core IFU 4.0 plan, each once')
  assert.deepEqual(streams.filter((stream) => stream.notSetUp).map((stream) => stream.name), ['DP', 'CP', 'IOCC', 'Content', 'Tool Validations'])
  // Without the custom stream the IOCC rule finds no "IOCC" segment: nothing is read, and the stream is gone.
  setCustomStreams([])
  assert.equal(releaseRegister(items, [], { rule: 'iocc' }).length, 0)
  assert.equal(defaultStreamReleases({ azureSources: [source('lab', items)] }, profiles, '2026-10', 'UTC').some((stream) => stream.name === 'Labeling'), false)
})

test('STR-03: a custom Windchill stream — “Like S&S IT” has its export, “Like ECP” its exports read by project; ECP keeps its own (TC-STR-05)', () => {
  setCustomStreams(customStreamDefs([{ name: 'Service Docs', rule: 'windchill', fuzzy: false }, { name: 'Field Actions', rule: 'windchill-project', fuzzy: false }]))
  const views = [
    { id: 'ss', name: 'S&S IT', exportFile: 'ss.csv' },
    { id: 'svc', name: 'Service Docs export', exportFile: 'svc.csv' },
    { id: 'ecp1', name: 'ECP - Type 1', exportFile: 'e1.csv', logic: 'ecp', projectLevel: 2 },
    { id: 'fa1', name: 'Field Actions - EU', exportFile: 'fa1.csv', logic: 'ecp', projectLevel: 3 },
    { id: 'fa2', name: 'Field Actions - US', exportFile: 'fa2.csv' },
    { id: 'other', name: 'Something', exportFile: 'o.csv' },
  ]
  assert.deepEqual(windchillStreamExports(views).map((entry) => `${entry.stream.name}:${entry.name}:${entry.view?.id ?? '-'}`), ['S&S IT:S&S IT:ss', 'ECP:ECP - Type 1:ecp1', 'Service Docs:Service Docs:svc', 'Field Actions:Field Actions - EU:fa1', 'Field Actions:Field Actions - US:fa2'])
  assert.equal(exportForStream(allStreams().find((stream) => stream.name === 'Service Docs'), views).id, 'svc')
  assert.ok(isEcpExport(views[4]), 'an export named after a stream “Like ECP” is read by project')
  assert.deepEqual(windchillOptionsForView(views[4]), { project: true, projectLevel: 2 })
  assert.deepEqual(otherMenuViews([], [], views).windchill.map((view) => view.id), ['other'])
  // The custom S&S IT-like stream reads releases from its export as S&S IT does.
  const rows = [{ Name: 'Service Tool 3.1 Verification Report', Location: '/Products/Service Tool/Release 3.1', 'Last Modified': '2026-10-02' }, { Name: 'Service Tool 3.1 Test Plan', Location: '/Products/Service Tool/Release 3.1', 'Last Modified': '2026-10-03' }]
  assert.deepEqual(windchillReleases(rows, ['Name', 'Location', 'Last Modified'], windchillOptionsForView(views[1])).releases.map((entry) => `${entry.name}|${entry.release}|${entry.documents.length}`), ['Service Tool|Release 3.1|2'])
  setCustomStreams([])
  assert.deepEqual(windchillStreamExports(views).map((entry) => entry.view?.id ?? '-'), ['ss', 'ecp1', 'fa1'], 'without them, the ECP-logic export goes back to ECP')
})

test('NAV-52: Release Details is one list — every stream A–Z (case ignored), built-in and custom, Azure and Windchill alike; "＋ ECP export" after them (TC-NAV-52)', () => {
  setCustomStreams(customStreamDefs([{ name: 'labeling', rule: 'title', fuzzy: false }, { name: 'Field Actions', rule: 'windchill-project', fuzzy: false }]))
  const views = [
    { id: 'ss', name: 'S&S IT', exportFile: 'ss.csv' },
    { id: 'ecp1', name: 'ECP - Type 1', exportFile: 'e1.csv', logic: 'ecp', projectLevel: 2 },
    { id: 'ecp2', name: 'ECP - Type 2', exportFile: 'e2.csv', logic: 'ecp', projectLevel: 3 },
  ]
  const shown = (entries) => entries.map((entry) => `${entry.kind}:${entry.label}${entry.kind === 'windchill' ? `:${entry.view?.id ?? '+'}` : ''}`)
  assert.deepEqual(shown(releaseMenuEntries(views)), ['azure:Content', 'azure:CP', 'azure:DP', 'windchill:ECP - Type 1:ecp1', 'windchill:ECP - Type 2:ecp2', 'windchill:Field Actions:+', 'azure:IOCC', 'azure:labeling', 'windchill:S&S IT:ss', 'azure:Tool Validations', 'add-export:ECP export'])
  // Without exports: each Windchill stream is listed by its name (＋, not imported yet) and nothing is added after them.
  setCustomStreams([])
  assert.deepEqual(shown(releaseMenuEntries([])), ['azure:Content', 'azure:CP', 'azure:DP', 'windchill:ECP:+', 'azure:IOCC', 'windchill:S&S IT:+', 'azure:Tool Validations'])
})

import * as customStreamsModule from '../src/customStreams.ts'
import { readTextFile as readGitText } from '../src/gitStorage.ts'
// GIT-25 (KB-92): a repository the token cannot read (GitHub answers 404 for everything) keeps the custom streams cached
// in this browser; only a file really missing in a readable repository clears them.
test('GIT-25: the cached custom streams stay when the repository cannot be read; a missing file in a readable one clears them (TC-GIT-18)', async () => {
  const { readCustomStreamsInto, cachedCustomStreams, customStreamsCacheKey } = customStreamsModule
  const data = new Map(), storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) }
  const text = serializeCustomStreams([{ name: 'Lab Systems', rule: 'iocc', fuzzy: false }])
  storage.setItem(customStreamsCacheKey, text)
  const notFound = (readable) => async (url) => ({ ok: readable && url.includes('/branches/'), status: readable && url.includes('/branches/') ? 200 : 404, json: async () => ({}) })
  const locked = { owner: 'example-org', repo: 'streams-locked', branch: 'main', path: 'custom-streams.json' }
  await assert.rejects(readCustomStreamsInto(() => readGitText(locked, 't', notFound(false)), storage), /cannot access it/)
  assert.equal(storage.getItem(customStreamsCacheKey), text, 'the cache is kept')
  assert.deepEqual(cachedCustomStreams(storage).map((entry) => entry.name), ['Lab Systems'])
  const open = { ...locked, repo: 'streams-open' }
  const read = await readCustomStreamsInto(() => readGitText(open, 't', notFound(true)), storage)
  assert.deepEqual([read.streams, read.sha, storage.getItem(customStreamsCacheKey)], [[], null, null], 'a file deleted in a readable repository: no custom streams')
  const hook = readFileSync(new URL('../src/useCustomStreams.ts', import.meta.url), 'utf8')
  assert.match(hook, /readCustomStreamsInto\(readCustomStreams\)/, 'the hook reads through it')
})
