import test from 'node:test'
import assert from 'node:assert/strict'
import { changedFiles, fileLabel, folderOf, watchedFolders } from '../src/gitWatch.ts'

test('GIT-15: a check names the shared files whose version in Git is not the one loaded here', () => {
  const seen = { 'planning-data.json': 'a1', 'qe-mapping.json': 'b1', 'monthly-pack/2026-10.json': 'c1', 'monthly-pack-setup.json': null, 'access.json': 'd1' }
  assert.deepEqual(watchedFolders(seen), ['', 'monthly-pack'], 'one listing per folder')
  assert.equal(folderOf('data/planning-data.json'), 'data')
  const listings = {
    '': [{ path: 'planning-data.json', sha: 'a2' }, { path: 'qe-mapping.json', sha: 'b1' }, { path: 'monthly-pack-setup.json', sha: 'e1' }],
    'monthly-pack': [{ path: 'monthly-pack/2026-10.json', sha: 'c1' }],
  }
  assert.deepEqual(changedFiles(seen, listings), ['access.json', 'monthly-pack-setup.json', 'planning-data.json'], 'changed, created and removed files; unchanged ones not')
  assert.deepEqual(changedFiles(seen, { '': listings[''] }), ['access.json', 'monthly-pack-setup.json', 'planning-data.json'], 'a folder that could not be listed says nothing')
  assert.deepEqual(changedFiles({ 'planning-data.json': 'a1' }, { '': [{ path: 'planning-data.json', sha: 'a1' }] }), [])
})

test('GIT-15: the banner names the shared files as people know them', () => {
  assert.match(fileLabel('planning-data.json', 'planning-data.json'), /^Planning data/)
  assert.equal(fileLabel('qe-mapping.json', 'planning-data.json'), 'QE Mapping')
  assert.equal(fileLabel('data/monthly-pack/2026-10.json', 'data/planning-data.json'), 'Monthly pack 2026-10')
  assert.equal(fileLabel('azure-views.json', 'planning-data.json'), 'Stream mapping and connections')
  assert.equal(fileLabel('other.json', 'planning-data.json'), 'other.json')
})
