import test from 'node:test'
import assert from 'node:assert/strict'
import { beginSave, changedFiles, changesForPage, emptyWatch, endSave, fileLabel, folderOf, newerFiles, pageMatches, pagesOfFile, rememberOwn, watchedFolders } from '../src/gitWatch.ts'
import { lastCommit, saverOf, saverTag, setCommitSaver, signMessage, writeTextFile } from '../src/gitStorage.ts'
import { accessChangedText, defaultPolicy, rightsChanges, rightsFor } from '../src/access.ts'
import { stampMessage, stampOf } from '../src/gitSaveQueue.ts'

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
  assert.deepEqual(pagesOfFile('data/access.json', plan), { pages: ['admin:resources'], quiet: 'access', loader: 'access' }, 'GIT-23: the roles quietly, the notice on People & roles only')
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

test('GIT-22: every commit the app writes names the app user — display name and work email — and the notice shows them; a commit made outside the app shows its GitHub author (TC-GIT-14)', async () => {
  assert.equal(saverTag({ name: 'Rita Gomez', email: 'Rita.Gomez@Example.com' }), '[by Rita Gomez <rita.gomez@example.com>]')
  assert.equal(saverTag({ email: 'rita.gomez@example.com' }), '[by rita.gomez@example.com]', 'without a name: the work email')
  assert.equal(saverTag({ name: 'Rita [x] <y>' }), '[by Rita x y]', 'brackets cannot break the tag')
  assert.equal(saverTag({ email: 'not an email' }), '', 'nothing known: no tag')
  const message = signMessage(stampMessage('CoNQ: add row CONQ-0003', '2026-11-23T10:15:00Z'), saverTag({ name: 'Rita Gomez', email: 'rita.gomez@example.com' }))
  assert.equal(message, 'CoNQ: add row CONQ-0003 [saved 2026-11-23T10:15:00Z] [by Rita Gomez <rita.gomez@example.com>]', 'after the [saved …] stamp (GIT-17)')
  assert.equal(signMessage(message, '[by Someone]'), message, 'signed once')
  assert.equal(stampOf(message), '2026-11-23T10:15:00Z', 'the save time is still read')
  assert.deepEqual(saverOf(message), { name: 'Rita Gomez', email: 'rita.gomez@example.com' })
  assert.deepEqual(saverOf('Update access.json [by ana@example.com]'), { email: 'ana@example.com' })
  assert.equal(saverOf('Edit on github.com'), null, 'made outside the app')
  // A destination must affirmatively be private before identifying an app user.
  const sent = []
  const targetConfig = { owner: 'o', repo: 'r', branch: 'main', path: 'access.json' }
  for (const visibility of ['private', 'public', 'internal', null]) {
    const fetchImpl = async (url, init) => {
      if (url === 'https://api.github.com/repos/o/r') {
        assert.equal(init.cache, 'no-store')
        return Response.json({ visibility }, { status: visibility ? 200 : 403 })
      }
      sent.push(JSON.parse(init.body))
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { html_url: 'https://github.com/x' } })
    }
    setCommitSaver({ name: 'Rita Gomez', email: 'rita.gomez@example.com' })
    try { await writeTextFile(targetConfig, 'secret-token', '{}', null, 'Update access.json', fetchImpl) } finally { setCommitSaver({}) }
  }
  assert.deepEqual(sent.map(({ message }) => message), [
    'Update access.json [by Rita Gomez <rita.gomez@example.com>]',
    'Update access.json', 'Update access.json', 'Update access.json',
  ])
  assert.doesNotMatch(JSON.stringify(sent), /secret-token/)
  // The notice: the app user from the message, else the GitHub author.
  const commits = (text, author) => async () => new Response(JSON.stringify([{ commit: { message: text, author: { name: author, date: '2026-11-23T10:15:00Z' } } }]), { status: 200 })
  const target = { owner: 'o', repo: 'r', branch: 'main', path: 'on-demand/conq.json' }
  assert.deepEqual(await lastCommit(target, 't', commits(message, 'rita-gh')), { by: 'Rita Gomez', at: '2026-11-23T10:15:00Z', inApp: true })
  assert.deepEqual(await lastCommit(target, 't', commits('Edit on github.com', 'Ben Example')), { by: 'Ben Example', at: '2026-11-23T10:15:00Z' })
})

test('GIT-23: a newer access.json loaded quietly — what changed in the viewer\'s own rights, in words (TC-GIT-15)', () => {
  const policy = defaultPolicy(); policy.defaultRole = 'Team Member'
  const before = rightsFor(policy, 'ana@example.com')
  const granted = structuredClone(policy); granted.roles['Team Member'].actions.push('ondemand.edit'); granted.roles['Team Member'].areas.push('qemapping')
  const changes = rightsChanges(before, rightsFor(granted, 'ana@example.com'))
  assert.deepEqual(changes, ['you now see QE Mapping', 'you can now edit On-Demand data (rows)'])
  assert.equal(accessChangedText('Rita Gomez', changes), 'Your access was changed by Rita Gomez: you now see QE Mapping; you can now edit On-Demand data (rows).')
  const owner = structuredClone(policy); owner.members['ana@example.com'] = ['Tool Owner']
  const removed = structuredClone(owner); removed.roles['Tool Owner'].actions = removed.roles['Tool Owner'].actions.filter((action) => action !== 'ondemand.setup')
  assert.deepEqual(rightsChanges(rightsFor(owner, 'ana@example.com'), rightsFor(removed, 'ana@example.com')), ['“Set up On-Demand pages (pages, columns, options)” removed'])
  assert.deepEqual(rightsChanges(before, rightsFor(structuredClone(policy), 'ana@example.com')), [], 'the same rights: nothing to say')
  assert.deepEqual(rightsChanges(rightsFor(null, 'ana@example.com'), before), [], 'the first load after fail closed is not a change')
  assert.match(accessChangedText('', ['a', 'b', 'c', 'd', 'e', 'f']), /^Your access was changed by someone else: a; b; c; d; and 2 more\.$/)
})
