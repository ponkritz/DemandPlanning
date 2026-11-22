import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeViews, removedFromGit } from '../src/viewDefinitions.ts'
import { fileCommits, readTextAt } from '../src/gitStorage.ts'

const view = (id, viewName, query = '', extra = {}) => ({ id, reason: viewName, viewName, role: 'release-source', url: 'https://tfs.example.invalid/DHPCollection/DHP.Vault', query, ...extra })
const cpTree = view('cp-tree', 'CP', 'SELECT [System.Id] FROM WorkItemLinks WHERE 1=1')
const cpNames = view('cp-names', 'CP Releases', 'SELECT [System.Id] FROM WorkItems WHERE [System.Title] CONTAINS "Release"')
const dp = view('dp', 'DP', 'SELECT [System.Id] FROM WorkItems WHERE 2=2')

test('CON-98: sharing merges with the setup in Git — a connection only in Git stays; only named ones are removed (TC-CON-61)', () => {
  assert.deepEqual(mergeViews([cpTree, cpNames], [cpTree, dp]).map((entry) => entry.id), ['cp-tree', 'cp-names', 'dp'], 'CP Releases is kept although this computer does not have it')
  const edited = { ...cpTree, viewName: 'CP tree' }
  assert.equal(mergeViews([cpTree], [edited])[0].viewName, 'CP tree', 'this computer’s version wins for the same connection')
  assert.deepEqual(mergeViews([cpTree, cpNames], [cpTree], ['cp-names']).map((entry) => entry.id), ['cp-tree'], 'an explicit removal takes it out')
  assert.deepEqual(mergeViews([], [cpTree, { ...dp, mine: true }]).map((entry) => entry.id), ['cp-tree'], 'personal views are never shared')
})

test('CON-99: connections in older versions of the shared setup that are gone now are found once, newest version first (TC-CON-61)', () => {
  const versions = [
    { sha: 'a'.repeat(40), date: '2026-11-18T10:00:00Z', message: 'Stream mapping: CP Releases', views: [cpTree, { ...cpNames, viewName: 'CP Releases (old)' }, dp] },
    { sha: 'b'.repeat(40), date: '2026-11-19T10:00:00Z', message: 'Stream mapping: CP Releases', views: [cpTree, cpNames, dp] },
    { sha: 'c'.repeat(40), date: '2026-11-20T10:00:00Z', message: 'Stream mapping: DP', views: [cpTree, dp] },
  ]
  const found = removedFromGit(versions, [cpTree, dp], [cpTree, dp])
  assert.deepEqual(found.map((entry) => [entry.view.id, entry.view.viewName, entry.message, entry.sha[0]]), [['cp-names', 'CP Releases', 'Stream mapping: CP Releases', 'b']], 'as it was in the newest version that had it')
  assert.deepEqual(removedFromGit(versions, [cpTree, dp], [cpTree, dp, cpNames]), [], 'not offered when it is here')
  assert.deepEqual(removedFromGit(versions, [cpTree, dp], [cpTree, dp, { ...cpNames, id: 'other-id' }]), [], 'nor when a connection here reads the same server, project, role and query')
  assert.deepEqual(removedFromGit([{ ...versions[1], views: [{ ...cpNames, mine: true }] }], [], []), [], 'personal views are never offered')
})

test('CON-99: the history of the shared setup is read from GitHub — commits of the file, then the file at a commit; nothing is written', async () => {
  const config = { owner: 'example', repo: 'storage', branch: 'main', path: 'data/azure-views.json' }
  const calls = []
  const fetchImpl = async (url, options = {}) => {
    calls.push([options.method ?? 'GET', String(url)])
    if (String(url).includes('/commits?')) return new Response(JSON.stringify([{ sha: 'b'.repeat(40), commit: { message: 'Stream mapping: CP\nmore', committer: { date: '2026-11-19T10:00:00Z' } } }, { sha: 'not-a-sha', commit: {} }]), { status: 200 })
    return new Response(JSON.stringify({ type: 'file', encoding: 'base64', content: Buffer.from('{"x":1}').toString('base64') }), { status: 200 })
  }
  assert.deepEqual(await fileCommits(config, 'token', 30, fetchImpl), [{ sha: 'b'.repeat(40), date: '2026-11-19T10:00:00Z', message: 'Stream mapping: CP' }], 'malformed entries are skipped; only the first line of the message')
  assert.match(calls[0][1], /\/repos\/example\/storage\/commits\?path=data%2Fazure-views\.json&sha=main&per_page=30$/)
  assert.equal(await readTextAt(config, 'token', 'b'.repeat(40), fetchImpl), '{"x":1}')
  assert.match(calls[1][1], /\/contents\/data\/azure-views\.json\?ref=b{40}$/)
  await assert.rejects(readTextAt(config, 'token', 'main', fetchImpl), /Unknown version/, 'only a commit id')
  assert.ok(calls.every(([method]) => method === 'GET'), 'read only')
})
