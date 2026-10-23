import test from 'node:test'
import assert from 'node:assert/strict'
import { IDBFactory } from 'fake-indexeddb'
import { indexedStateRepository, loadBrowserState, createStateWriter, validateBackup, legacyStateKey } from '../src/browserState.ts'

const emptyState = () => ({ schemaVersion: 1, people: [], activities: [], efforts: [], baselines: [], periods: [], releases: [], audits: [], snapshots: [], masters: [] })
const legacy = (value) => { const entries = new Map(value === null ? [] : [[legacyStateKey, value]]); return { entries, getItem: (key) => entries.get(key) ?? null } }

test('IndexedDB persists a backlog larger than typical localStorage budgets and reads it after reopening', async () => {
  const repository = indexedStateRepository(new IDBFactory())
  assert.equal(await repository.read(), undefined)
  const state = { ...emptyState(), azureWorkItems: Array.from({ length: 14000 }, (_, index) => ({ key: `example/project/${index + 1}`, id: index + 1, organization: 'example', project: 'project', title: `Synthetic ${index}`, state: 'New', workItemType: 'Feature', assignedTo: '', areaPath: 'project', iterationPath: 'project', tags: '', url: 'https://example.invalid', syncedAt: '2026-10-16T00:00:00Z', description: 'Synthetic description '.repeat(40) })) }
  assert.ok(JSON.stringify(state).length > 10 * 1024 * 1024)
  await repository.write(state)
  const saved = validateBackup(await repository.read())
  assert.equal(saved.azureWorkItems.length, 14000)
  assert.equal(saved.azureWorkItems[13999].description, state.azureWorkItems[13999].description)
  assert.equal(state.azureWorkItems[0].title, 'Synthetic 0')
})

test('legacy snapshot migrates only into an empty database and remains untouched as rollback copy', async () => {
  const repository = indexedStateRepository(new IDBFactory())
  const state = { ...emptyState(), people: [{ id: 'example', name: 'Synthetic resource' }] }
  const storage = legacy(JSON.stringify(state))
  const first = await loadBrowserState(repository, storage, emptyState())
  assert.equal(first.source, 'migrated')
  assert.deepEqual(first.state, state)
  assert.equal(storage.getItem(legacyStateKey), JSON.stringify(state))
  const updated = { ...state, people: [{ id: 'new', name: 'Newer saved resource' }] }
  await repository.write(updated)
  const second = await loadBrowserState(repository, storage, emptyState())
  assert.equal(second.source, 'indexeddb')
  assert.deepEqual(second.state, updated)
})

test('database read failure never falls back to a seed or writes over unread data', async () => {
  let writes = 0, legacyReads = 0
  const repository = { read: async () => { throw new Error('Blocked database') }, write: async () => { writes++ } }
  await assert.rejects(loadBrowserState(repository, { getItem: () => { legacyReads++; return null } }, emptyState()), /Blocked/)
  assert.equal(writes, 0)
  assert.equal(legacyReads, 0)
})

test('invalid saved data and failed migration preserve the old data rather than silently seeding', async () => {
  const storage = legacy('{broken')
  let writes = 0
  const repository = { read: async () => undefined, write: async () => { writes++; throw new Error('Quota exceeded') } }
  await assert.rejects(loadBrowserState(repository, storage, emptyState()))
  assert.equal(writes, 0)
  storage.entries.set(legacyStateKey, JSON.stringify(emptyState()))
  await assert.rejects(loadBrowserState(repository, storage, emptyState()), /Quota/)
  assert.equal(storage.getItem(legacyStateKey), JSON.stringify(emptyState()))
  assert.equal(writes, 1)
})

test('first run returns a seed without any startup write; hydration decides when it may be saved', async () => {
  let writes = 0
  const repository = { read: async () => undefined, write: async () => { writes++ } }
  const result = await loadBrowserState(repository, legacy(null), emptyState())
  assert.equal(result.source, 'new')
  assert.equal(writes, 0)
})

test('serialized saves cannot complete out of order and later retry recovers after a failed write', async () => {
  const completed = []
  let unblock
  const gate = new Promise((resolve) => { unblock = resolve })
  let count = 0
  const write = createStateWriter({ read: async () => undefined, write: async (state) => {
    count++
    if (count === 1) { await gate; throw new Error('First save aborted') }
    completed.push(state.people[0].name)
  } })
  const state = { ...emptyState(), people: [{ name: 'Second revision' }] }
  const first = write(emptyState())
  const failed = assert.rejects(first, /aborted/)
  const second = write(state)
  state.people[0].name = 'External mutation'
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(count, 1)
  unblock()
  await failed; await second
  assert.deepEqual(completed, ['Second revision'])
})

test('aborted IndexedDB transaction is not reported as a committed save', async () => {
  const factory = new IDBFactory()
  const repository = indexedStateRepository(factory)
  await repository.write(emptyState())
  const wrapped = { open: (...args) => {
    const request = factory.open(...args)
    request.addEventListener('success', () => {
      const db = request.result, original = db.transaction.bind(db)
      db.transaction = (...transactionArgs) => { const transaction = original(...transactionArgs); if (transactionArgs[1] === 'readwrite') queueMicrotask(() => transaction.abort()); return transaction }
    })
    return request
  } }
  await assert.rejects(indexedStateRepository(wrapped).write({ ...emptyState(), people: [{ name: 'Not committed' }] }), /abort|failed/i)
  assert.deepEqual(await repository.read(), emptyState())
})

test('backup validation rejects unsupported schemas, malformed arrays and invalid Azure records', () => {
  assert.deepEqual(validateBackup(emptyState()), emptyState())
  assert.throws(() => validateBackup({ ...emptyState(), schemaVersion: 99 }))
  assert.throws(() => validateBackup({ ...emptyState(), activities: {} }))
  assert.throws(() => validateBackup({ ...emptyState(), people: [null] }))
  assert.throws(() => validateBackup({ ...emptyState(), azureWorkItems: [{ id: 1 }] }))
  const item = { key: 'o/p/1', id: 1, organization: 'o', project: 'p', title: 't', workItemType: 'Document', state: 'Approved', assignedTo: '', areaPath: 'p', iterationPath: 'p', tags: '', url: '', syncedAt: '2026-10-20T10:00:00Z' }
  const view = { connectionId: 'dp', name: 'DP', role: 'release-source', organization: 'o', project: 'p', query: '', fetchedAt: '2026-10-20T10:00:00Z', items: [item] }
  assert.doesNotThrow(() => validateBackup({ ...emptyState(), azureSources: [view] }))
  assert.throws(() => validateBackup({ ...emptyState(), azureSources: [{ ...view, items: [null] }] }), /view data/)
  assert.throws(() => validateBackup({ ...emptyState(), azureSources: [{ ...view, items: [{ id: 1 }] }] }), /view data/)
  assert.throws(() => validateBackup({ ...emptyState(), azureSources: [{ ...view, fetchedAt: 'yesterday' }] }), /view data/)
})
