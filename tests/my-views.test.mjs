import test from 'node:test'
import assert from 'node:assert/strict'
import { myViewServers, newMyView, withoutMyViews } from '../src/myViews.ts'
import { viewsFile, removeAllConnections } from '../src/viewDefinitions.ts'
import { profilesForStream, defaultStreams, streamOfProfile } from '../src/streams.ts'
import { listAzureConnectionProfiles, saveAzureConnectionProfile } from '../src/azureCredentials.ts'
import { resolveSettings, settingsLabel, settingsPagesFor } from '../src/settingsTabs.ts'

const memory = () => { const data = new Map(); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) } }

test('My views: on a server with a PAT, never named after a stream, never a stream connection, never in Git, kept when the shared setup is reset (SET-17, TC-SET-07)', () => {
  const tw = { id: 'tw', url: 'https://dev.azure.com/Org/Project', reason: 'Time Writing', role: 'time-tracking' }
  const onPrem = { id: 'dp', url: 'https://tfs.example.com/tfs/Coll/Proj', baseUrl: 'https://tfs.example.com/tfs/Coll', reason: 'DP', role: 'release-source' }
  const servers = myViewServers([tw, onPrem], (key) => key === 'https://dev.azure.com/org' || key === 'https://tfs.example.com/tfs/coll')
  assert.deepEqual(servers.map((server) => [server.base, server.onPrem]), [['https://dev.azure.com/Org', false], ['https://tfs.example.com/tfs/Coll', true]])
  assert.deepEqual(myViewServers([tw], () => false), [], 'only servers with a PAT')
  const input = { name: 'My bugs', server: servers[1], project: 'Proj', query: 'SELECT [System.Id] FROM WorkItems' }
  assert.match(newMyView({ ...input, name: 'DP' }, [tw, onPrem], 'my-1'), /names the stream DP/)
  assert.match(newMyView({ ...input, name: 'Time Writing' }, [tw, onPrem], 'my-1'), /already exists/)
  assert.match(newMyView({ ...input, server: undefined }, [tw], 'my-1'), /Choose a server/)
  assert.match(newMyView({ ...input, query: 'DELETE x' }, [tw], 'my-1'), /WIQL/)
  const view = newMyView(input, [tw, onPrem], 'my-1')
  assert.deepEqual(view, { id: 'my-1', url: 'https://tfs.example.com/tfs/Coll/Proj', reason: 'My bugs', viewName: 'My bugs', role: 'reference', showInMenu: true, query: 'SELECT [System.Id] FROM WorkItems', mine: true, token: '', baseUrl: 'https://tfs.example.com/tfs/Coll' })
  assert.match(newMyView({ ...input, name: 'Again' }, [tw, onPrem, view], 'my-2'), /already reads this project with this query/)

  // A view named like a stream is never matched to it, and never written to the shared setup.
  const sneaky = { ...view, id: 'my-3', reason: 'CP extra', viewName: 'CP extra' }
  const cp = defaultStreams.find((stream) => stream.name === 'CP')
  assert.deepEqual(profilesForStream(cp, [sneaky]), [])
  assert.equal(streamOfProfile(sneaky), undefined)
  assert.deepEqual(viewsFile([tw, view]).views.map((entry) => entry.id), ['tw'])

  // Stored and listed with the flag; a reset of the shared setup keeps it.
  const storage = memory()
  saveAzureConnectionProfile({ ...tw, token: 'pat' }, storage)
  saveAzureConnectionProfile(view, storage)
  assert.equal(listAzureConnectionProfiles(storage).find((entry) => entry.id === 'my-1').mine, true)
  assert.deepEqual(removeAllConnections(storage).map((entry) => entry.id), ['tw'])
  assert.deepEqual(listAzureConnectionProfiles(storage).map((entry) => entry.id), ['my-1'])

  // Their data is left out of what goes to backups.
  const state = { azureSources: [{ connectionId: 'my-1', items: [] }, { connectionId: 'dp', items: [] }] }
  assert.deepEqual(withoutMyViews(state, new Set(['my-1'])).azureSources.map((source) => source.connectionId), ['dp'])
  assert.equal(withoutMyViews(state, new Set()), state, 'unchanged without My views')
})

test('Admin and My settings: the pages, and older links opening where they moved (SET-15, TC-SET-06)', () => {
  assert.deepEqual(settingsPagesFor(() => true).map((page) => page.label), ['Overview', 'Streams', 'Stream options', 'Epic & Feature setup', 'PI Review Setup', 'People & roles', 'Capacity & time', 'Reports', 'Data & sharing', 'Pages & menu', 'History'])
  assert.deepEqual(settingsPagesFor(() => false).map((page) => page.label), ['Overview', 'Streams', 'Stream options', 'Epic & Feature setup', 'People & roles', 'Data & sharing', 'Pages & menu'])
  assert.deepEqual(resolveSettings('connections', 'servers'), { tab: 'my', section: 'servers' })
  assert.deepEqual(resolveSettings('connections', 'email'), { tab: 'my', section: 'email' })
  assert.deepEqual(resolveSettings('connections', 'mapping'), { tab: 'connections', section: 'mapping' })
  assert.deepEqual(resolveSettings('connections', 'views'), { tab: 'storage', section: 'views' })
  assert.deepEqual(resolveSettings('tables'), { tab: 'look', section: 'tables' }, 'SET-18: Table and chart defaults moved to Look & feel')
  assert.deepEqual(resolveSettings('pack', 'tables'), { tab: 'look', section: 'tables' })
  assert.deepEqual(resolveSettings('history'), { tab: 'capacity', section: 'history' })
  assert.deepEqual(resolveSettings('access'), { tab: 'resources', section: 'rights' })
  assert.deepEqual(resolveSettings('storage', 'git'), { tab: 'storage', section: 'git' })
  assert.equal(settingsLabel('my'), 'My settings')
  assert.equal(settingsLabel('tables'), 'Look & feel')
  assert.equal(settingsLabel('look'), 'Look & feel')
  assert.deepEqual(resolveSettings('masters'), { tab: 'epics', section: 'setup' }, 'Master data is replaced by the Epic setup (EPS-01)')
  assert.equal(settingsLabel('masters'), 'Epic & Feature setup')
  assert.deepEqual(resolveSettings('features'), { tab: 'epics', section: 'setup' }, 'EPS-08: Feature setup is a section of Epic & Feature setup')
  assert.deepEqual(resolveSettings('epics', 'all'), { tab: 'epics', section: 'setup' }, 'CON-97: the old sections open Setup per Epic')
})
