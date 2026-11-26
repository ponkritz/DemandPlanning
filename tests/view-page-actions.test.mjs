import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { exportDeleteBlocked, exportDeletedText, exportPageActions, myViewDeletedText, viewAsBlocked, viewPageActions } from '../src/viewPageActions.ts'
import { deleteWindchillExportInGit, windchillExportFiles, windchillExportPaths } from '../src/windchillRemoval.ts'
import { fakeGitHub } from '../e2e/fakeGitHub.mjs'

// SET-19, CON-116, CON-118 (TC-SET-09, TC-CON-72, TC-CON-74): the delete item in the ⋯ of a page under Other views,
// per viewer, and the Git side of Delete this export…. Synthetic data only.
const git = { connected: true, readOnly: false, isSample: false }
const keys = (actions) => actions.map((action) => [action.key, action.label, action.blocked])

test('SET-19: a view of your own offers Delete this view…, also without Git; disabled only in View as (TC-SET-09)', () => {
  assert.deepEqual(keys(viewPageActions({ other: true, mine: true, viewingAs: false })), [['delete-mine', 'Delete this view…', '']])
  const [viewAs] = viewPageActions({ other: true, mine: true, viewingAs: true })
  assert.equal(viewAs.blocked, viewAsBlocked)
  assert.equal(viewAs.title, viewAsBlocked, 'the reason is the tooltip')
  assert.equal(viewAs.danger, true)
  assert.match(myViewDeletedText('My open bugs'), /^Your view “My open bugs” was deleted from this browser.*PAT is kept.*nothing was changed in Azure DevOps or Git/)
})

test('CON-116: a shared view’s page has no delete item for anyone, nor has a page that is not an Other view (TC-CON-72)', () => {
  // viewPageActions has no input for a role: the Tool Owner and a Team Member get the same, nothing.
  assert.deepEqual(viewPageActions({ other: true, mine: false, viewingAs: false }), [])
  assert.deepEqual(viewPageActions({ other: false, mine: true, viewingAs: false }), [])
  const source = readFileSync(new URL('../src/components/OtherViewActions.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /RemoveViewForEveryone|removeViewForEveryone/, 'no Remove / Delete for everyone on the page')
})

test('CON-118: Delete this export… for whoever may import Windchill exports, with the blocks; nobody else sees it (TC-CON-74)', () => {
  const base = { other: true, canImport: true, viewingAs: false, isSample: false, git }
  assert.deepEqual(keys(exportPageActions(base)), [['delete-export', 'Delete this export…', '']])
  assert.deepEqual(exportPageActions({ ...base, canImport: false }), [], 'without “Import Windchill exports” no item')
  assert.deepEqual(exportPageActions({ ...base, other: false }), [], 'a Release Details stream export keeps Remove this export…')
  for (const [change, reason] of [
    [{ viewingAs: true }, /^Not while viewing as someone else/],
    [{ isSample: true }, /synthetic sample/],
    [{ git: { ...git, isSample: true } }, /synthetic sample/],
    [{ git: undefined }, /^Connect Git storage/],
    [{ git: { ...git, connected: false } }, /^Connect Git storage/],
    [{ git: { ...git, readOnly: true } }, /read-only/],
  ]) {
    const [action] = exportPageActions({ ...base, ...change })
    assert.match(action.blocked, reason, JSON.stringify(change))
    assert.equal(action.title, action.blocked)
    assert.equal(exportDeleteBlocked({ ...base, ...change }), action.blocked)
  }
  assert.match(exportDeletedText('Supplier export', ['windchill-data/wc-1.json']), /deleted here and in Git in one commit \(windchill-data\/wc-1\.json; the history stays in GitHub\)/)
  assert.match(exportDeletedText('Supplier export', []), /it had no files in Git/)
})

test('CON-118: the export’s files in Git are listed and deleted in ONE commit; other files stay; nothing to delete makes no commit (TC-CON-74)', async () => {
  const config = { owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }
  const gh = fakeGitHub({ files: { 'windchill-data/wc-1.json': '{}', 'windchill-analysis/wc-1-locations.json': '{}', 'windchill-data/wc-2.json': '{}', 'planning-data.json': '{}' } })
  assert.deepEqual(windchillExportPaths('wc-1'), ['windchill-data/wc-1.json', 'windchill-analysis/wc-1-locations.json'])
  assert.throws(() => windchillExportPaths('../planning-data'), /Unknown Windchill export/, 'no path from outside the export’s own ID')
  assert.deepEqual(await windchillExportFiles(config, 't', 'wc-1', gh.fetch), ['windchill-data/wc-1.json', 'windchill-analysis/wc-1-locations.json'])
  const before = gh.heads.main
  const done = await deleteWindchillExportInGit(config, 't', 'wc-1', 'Supplier export', gh.fetch)
  assert.deepEqual(done.deleted, ['windchill-data/wc-1.json', 'windchill-analysis/wc-1-locations.json'])
  assert.ok(done.commitUrl)
  assert.equal(gh.read('windchill-data/wc-1.json'), null)
  assert.equal(gh.read('windchill-analysis/wc-1-locations.json'), null)
  assert.equal(gh.read('windchill-data/wc-2.json'), '{}', 'another export stays')
  assert.equal(gh.read('planning-data.json'), '{}')
  const calls = gh.calls.filter((call) => /^PATCH .*\/git\/refs\/heads\/main/.test(call))
  assert.equal(calls.length, 1, 'one commit')
  assert.notEqual(gh.heads.main, before)
  // Only its results in Git (no Locations analysis): that one file; none: no commit at all.
  const head = gh.heads.main
  assert.deepEqual(await deleteWindchillExportInGit(config, 't', 'wc-3', 'Never in Git', gh.fetch), { deleted: [] })
  assert.equal(gh.heads.main, head, 'no commit')
  assert.deepEqual((await deleteWindchillExportInGit(config, 't', 'wc-2', 'Other export', gh.fetch)).deleted, ['windchill-data/wc-2.json'])
})

test('SET-19, CON-118: the page reuses the deletions — My views’ pop-up and code, the existing Windchill removal (no copy)', () => {
  const page = readFileSync(new URL('../src/components/OtherViewActions.tsx', import.meta.url), 'utf8')
  const myViews = readFileSync(new URL('../src/components/MyViewsPanel.tsx', import.meta.url), 'utf8')
  const exportDialog = readFileSync(new URL('../src/components/DeleteWindchillExport.tsx', import.meta.url), 'utf8')
  assert.match(page, /<DeleteMyView /)
  assert.match(myViews, /<DeleteMyView /)
  assert.doesNotMatch(myViews, /window\.confirm/, 'My views asks in the same pop-up as the page')
  assert.match(exportDialog, /windchill\.removeView\(view\.id\)/, 'the existing local removal of an export')
  assert.doesNotMatch(page + exportDialog, /forgetAzureConnectionProfile|saveWindchillViews/, 'the page does not delete on its own')
})
