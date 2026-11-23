import test from 'node:test'
import assert from 'node:assert/strict'
import { beginSave, changedFiles, changesForPage, emptyWatch, endSave, fileLabel, folderOf, newerFiles, pageMatches, pagesOfFile, rememberOwn, watchedFolders } from '../src/gitWatch.ts'

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

test('KB-82, GIT-19: this window\'s own saves never count as newer data saved by someone else; another person\'s save does', () => {
  const path = 'on-demand/conq.json'
  const listing = (sha) => ({ 'on-demand': [{ path, sha }] })
  // The page was read (v1), then this window saved a row (v2 over v1).
  const state = emptyWatch()
  state.seen[path] = 'v1'
  rememberOwn(state, path, 'v2', 'v1')
  assert.deepEqual(newerFiles(state, listing('v2')), [], 'Git has the version saved here')
  // The false notice of KB-82: a read still on its way while the save ran (or GitHub answering for a moment with the
  // version before the commit) leaves the version before the save as the one "seen" here …
  state.seen[path] = 'v1'
  assert.deepEqual(changedFiles(state.seen, listing('v2')), [path], 'the old comparison named the own save v2 as newer data')
  assert.deepEqual(newerFiles(state, listing('v2')), [], 'now v2 is this window\'s own save')
  // … and a listing that still shows the version the save replaced is not newer either.
  state.seen[path] = 'v2'
  assert.deepEqual(changedFiles(state.seen, listing('v1')), [path], 'the old comparison named a listing still showing v1')
  assert.deepEqual(newerFiles(state, listing('v1')), [], 'now v1 is the version the own save replaced')
  // A save of this window on its way (its commit in Git, its answer not back yet): left to the next check.
  beginSave(state, path)
  assert.deepEqual(newerFiles(state, listing('v3')), [], 'not while a save of this window is on its way')
  endSave(state, path)
  // Another person's save: named, with the version now in Git.
  assert.deepEqual(newerFiles(state, listing('v3')), [{ path, sha: 'v3' }])
  // A page removed here: Git without the file is the own removal, not someone else's.
  rememberOwn(state, path, null, 'v3')
  assert.deepEqual(newerFiles(state, { 'on-demand': [] }), [])
})

test('GIT-18: each shared file is shown on the pages that use it; the menu and the views are loaded quietly', () => {
  const plan = 'data/planning-data.json'
  const reading = (id) => id === 'conq' ? ['quality-dash'] : []
  assert.deepEqual(pagesOfFile('data/on-demand/conq.json', plan, reading), { pages: ['ondemand:conq', 'ondemand:quality-dash', 'admin:pages'], loader: 'ondemand:conq' }, 'the page, the dashboards reading it, Pages & menu')
  assert.deepEqual(pagesOfFile('data/dashboards/quality-dash.json', plan).pages, ['ondemand:quality-dash'])
  assert.equal(pagesOfFile('data/menu-layout.json', plan).quiet, 'menu')
  assert.equal(pagesOfFile('data/personal-views/ana@example.com.json', plan).quiet, 'views')
  assert.equal(pagesOfFile('data/personal-views-defaults.json', plan).quiet, 'views')
  assert.deepEqual(pagesOfFile('data/qe-mapping.json', plan).pages, ['qemapping', 'board'])
  assert.deepEqual(pagesOfFile('data/access.json', plan).pages, ['*'])
  assert.deepEqual(pagesOfFile(plan, plan), { pages: ['baselines', 'admin:*'], quiet: 'planning', loader: 'planning' })
  assert.ok(pagesOfFile('data/custom-streams.json', plan).pages.includes('admin:connections'))
  assert.deepEqual(pagesOfFile('data/monthly-pack/2026-10.json', plan).pages, ['pulse', 'admin:pack'])
  assert.equal(pagesOfFile('data/kpi-tracker.json', plan).loader, 'remount')
  assert.deepEqual(pagesOfFile('data/unknown.json', plan), { pages: ['*'], loader: 'reload' }, 'a file not mapped: every page, full reload')
  assert.ok(pageMatches(['admin:*'], 'admin:capacity') && pageMatches(['*'], 'home') && !pageMatches(['ondemand:conq'], 'home'))
  const changes = [{ path: 'data/on-demand/conq.json' }, { path: 'data/menu-layout.json' }, { path: 'data/on-demand/other.json' }]
  const target = (path) => pagesOfFile(path, plan, reading)
  const quiet = (entry) => entry.quiet === 'menu' || entry.quiet === 'views'
  assert.deepEqual(changesForPage(changes, 'ondemand:conq', target, quiet).map((entry) => entry.path), ['data/on-demand/conq.json'], 'only CoNQ\'s file on CoNQ')
  assert.deepEqual(changesForPage(changes, 'home', target, quiet), [], 'nothing on Home')
  assert.deepEqual(changesForPage(changes, 'ondemand:quality-dash', target, quiet).map((entry) => entry.path), ['data/on-demand/conq.json'], 'a dashboard reading CoNQ')
  assert.equal(changesForPage(changes, 'admin:pages', target, quiet).length, 2, 'Pages & menu lists both pages; the menu layout is loaded quietly')
})
