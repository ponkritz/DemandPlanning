import test from 'node:test'
import assert from 'node:assert/strict'
import { deleteFileAt, fileSha, readTextFile } from '../src/gitStorage.ts'
import { isRetiredFile, staleQeLine, retiredCopyName, retiredDeleteBlock, retiredDeleteMessage, retiredFiles, retiredNotice } from '../src/retiredData.ts'
import { pageGroups, pages } from '../src/pages/registry.ts'
import { loadUsage, usageKey } from '../src/usageCounts.ts'
import { fakeGitHub } from '../e2e/fakeGitHub.mjs'

// NAV-54, GIT-28: QE Mapping removed — the page is gone from the app, and the Tool Owner deletes its data file
// (qe-mapping.json) from the Git data repository once, after Download a copy. Synthetic data only.

test('NAV-54: QE Mapping is no longer a page — not in the menu, Data & governance or Ctrl K; a remembered visit to it is not counted (TC-NAV-54)', () => {
  assert.equal(pages.some((page) => page.id === 'qemapping' || /qe mapping/i.test(page.label)), false, 'not in the registry the menu, Home, pins and Ctrl K are built from')
  assert.deepEqual(pages.filter((page) => page.group === 'Data & governance').map((page) => page.label), ['Baselines', 'Snapshots', 'Backlog Health', 'Documentation'])
  assert.ok(pageGroups.includes('Data & governance'))
  const stored = { [usageKey]: JSON.stringify({ enabled: true, counts: { qemapping: 4, board: 2 } }) }
  const usage = loadUsage({ getItem: (key) => stored[key] ?? null })
  assert.deepEqual(usage.counts, { board: 2 }, 'a count kept for the removed page is dropped')
})

test('GIT-28: only the retired files can be deleted this way; the notice, the copy and the commit name them (TC-GIT-23)', () => {
  assert.deepEqual(retiredFiles, [{ name: 'qe-mapping.json', label: 'QE Mapping' }])
  assert.ok(isRetiredFile('qe-mapping.json'))
  for (const name of ['planning-data.json', 'access.json', '../qe-mapping.json', 'data/qe-mapping.json', 'QE-MAPPING.JSON']) assert.equal(isRetiredFile(name), false, name)
  assert.equal(retiredNotice(retiredFiles[0]), 'qe-mapping.json is no longer used by the app — Delete it from Git')
  assert.equal(retiredCopyName(retiredFiles[0], new Date('2026-11-25T10:00:00Z')), 'qe-mapping-copy-2026-11-25.json')
  assert.equal(retiredDeleteMessage(retiredFiles[0]), 'Delete qe-mapping.json: no longer used by the app (QE Mapping removed)')
  assert.equal(staleQeLine([]), '', 'every bulk Epic has its QE page')
  assert.equal(staleQeLine(['Epic #13946 (DP)']), 'Set the QE page in each bulk Epic\'s Feature setup first: Epic #13946 (DP) still uses the old QE Mapping columns only.')
  assert.equal(staleQeLine(['Epic #13946 (DP)', 'Epic #21000 (IOCC)']), 'Set the QE page in each bulk Epic\'s Feature setup first: Epic #13946 (DP), Epic #21000 (IOCC) still use the old QE Mapping columns only.')
})

test('GIT-28: Delete it from Git is blocked without Git, in View as, with the synthetic sample, with a read-only token, for anyone but the Tool Owner and before Download a copy (TC-GIT-23)', () => {
  const ready = { connected: true, viewingAs: false, isSample: false, readOnly: false, toolOwner: true, downloaded: true }
  assert.equal(retiredDeleteBlock(ready), '')
  assert.equal(retiredDeleteBlock({ ...ready, connected: false }), 'Connect Git storage first.')
  assert.equal(retiredDeleteBlock({ ...ready, viewingAs: true }), 'View as is read only: nothing is deleted.')
  assert.equal(retiredDeleteBlock({ ...ready, isSample: true }), 'Synthetic sample data is loaded: nothing is deleted from Git.')
  assert.equal(retiredDeleteBlock({ ...ready, readOnly: true }), 'Your Git token is read-only: it cannot delete files.')
  assert.equal(retiredDeleteBlock({ ...ready, toolOwner: false }), 'Only the Tool Owner deletes it.', 'an Admin sees the notice but cannot delete')
  assert.equal(retiredDeleteBlock({ ...ready, downloaded: false }), 'Download a copy first.')
  assert.equal(retiredDeleteBlock({ ...ready, viewingAs: true, downloaded: false }), 'View as is read only: nothing is deleted.', 'the first reason is given')
})

test('GIT-28: the file is deleted in one commit at the version downloaded; a file changed since is not deleted (TC-GIT-23)', async () => {
  const mapping = JSON.stringify({ schema: 1, kind: 'qe-mapping', sheets: [{ id: 's1', name: 'Map', columns: [{ id: 'c1', name: 'Platform' }], rows: [{ id: 'r1', cells: { c1: 'Example Platform' } }] }] })
  const gh = fakeGitHub({ files: { 'planning-data.json': '{}', 'qe-mapping.json': mapping } })
  const config = { owner: 'example', repo: 'storage', branch: 'main', path: 'qe-mapping.json' }
  assert.ok(await fileSha(config, 't', gh.fetch), 'the notice is shown while the file exists')
  const copy = await readTextFile(config, 't', gh.fetch)
  assert.equal(copy.text, mapping, 'Download a copy: the file as it is in Git')
  // Someone changes it after the copy: the delete of the downloaded version is refused, nothing is deleted.
  const changed = await readTextFile(config, 't', gh.fetch)
  await gh.fetch('https://api.github.com/repos/example/storage/contents/qe-mapping.json', { method: 'PUT', body: JSON.stringify({ message: 'edit', content: Buffer.from(`${mapping}\n`).toString('base64'), sha: changed.sha, branch: 'main' }) })
  const writes = gh.writes.length
  assert.equal(await deleteFileAt(config, 't', copy.sha, retiredDeleteMessage(retiredFiles[0]), gh.fetch), false, 'changed since the copy')
  assert.equal(gh.writes.length, writes, 'no commit')
  // A fresh copy, then the delete: one commit that removes only that file.
  const fresh = await readTextFile(config, 't', gh.fetch)
  assert.equal(await deleteFileAt(config, 't', fresh.sha, retiredDeleteMessage(retiredFiles[0]), gh.fetch), true)
  assert.equal(gh.writes.length, writes + 1, 'one commit')
  assert.deepEqual(gh.writes.at(-1).paths, ['qe-mapping.json'])
  assert.match(gh.writes.at(-1).message, /^Delete qe-mapping\.json: no longer used by the app \(QE Mapping removed\)/)
  assert.equal(await fileSha(config, 't', gh.fetch), null, 'gone: the notice is no longer shown')
  assert.equal(gh.read('planning-data.json'), '{}', 'nothing else changed')
})
