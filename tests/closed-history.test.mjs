import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { finishedStates, isFinishedState } from '../src/workStates.ts'
import { closedDateFromUpdates, fillClosedDates } from '../src/closedHistory.ts'
import { mapAzureWorkItem } from '../src/azureRead.ts'

const require = createRequire(import.meta.url)
const { azureReadRequest } = require('../electron/azure-devops.cjs')
const config = { organization: 'org', project: 'Quality', team: 'Team', apiVersion: '7.1' }

test('Owner decision 10: finished is Closed, Resolved, Completed or Done — not Removed, Cut, Active (TC-FET-11)', () => {
  assert.deepEqual([...finishedStates], ['closed', 'resolved', 'completed', 'done'])
  assert.deepEqual(['Closed', ' resolved ', 'Completed', 'DONE', 'Removed', 'Cut', 'Active', '', undefined].map(isFinishedState), [true, true, true, true, false, false, false, false, false])
})

test('Owner decision 10: a finished item without a Closed Date takes its State Change Date, else Resolved Date (TC-FET-11)', () => {
  const map = (fields) => mapAzureWorkItem({ id: 1, fields: { 'System.Title': 'x', ...fields } }, config)
  assert.equal(map({ 'System.State': 'Closed', 'Microsoft.VSTS.Common.ClosedDate': '2026-10-03T08:00:00Z', 'Microsoft.VSTS.Common.StateChangeDate': '2026-11-01T08:00:00Z' }).closedDate, '2026-10-03T08:00:00Z', 'the Closed Date wins')
  const resolved = map({ 'System.State': 'Resolved', 'Microsoft.VSTS.Common.StateChangeDate': '2026-10-20T08:00:00Z', 'System.ChangedDate': '2026-11-15T08:00:00Z' })
  assert.deepEqual([resolved.closedDate, resolved.closedDateFrom], ['2026-10-20T08:00:00Z', 'state-change'], 'the day it was finished, not its last change')
  assert.deepEqual([map({ 'System.State': 'Resolved', 'Microsoft.VSTS.Common.ResolvedDate': '2026-10-21T08:00:00Z' }).closedDateFrom], ['resolved'])
  assert.equal(map({ 'System.State': 'Active', 'Microsoft.VSTS.Common.StateChangeDate': '2026-10-20T08:00:00Z' }).closedDate, undefined, 'an open item has no close date')
})

test('Owner decision 10: the history gives the change that moved the item into a finished state, the last such one (TC-FET-11)', () => {
  const change = (from, to, when) => ({ fields: { 'System.State': { oldValue: from, newValue: to }, 'System.ChangedDate': { newValue: when } } })
  assert.equal(closedDateFromUpdates([change(undefined, 'New', '2026-09-01T00:00:00Z'), change('New', 'Active', '2026-09-05T00:00:00Z'), change('Active', 'Resolved', '2026-10-10T00:00:00Z'), change('Resolved', 'Closed', '2026-10-12T00:00:00Z')]), '2026-10-10T00:00:00Z', 'Resolved → Closed is not a new finish')
  assert.equal(closedDateFromUpdates([change('Active', 'Done', '2026-08-01T00:00:00Z'), change('Done', 'Active', '2026-08-03T00:00:00Z'), change('Active', 'Done', '2026-09-30T00:00:00Z')]), '2026-09-30T00:00:00Z', 'reopened and finished again: the last finish')
  assert.equal(closedDateFromUpdates([{ fields: { 'System.Title': { newValue: 'x' } } }]), undefined)
})

test('Owner decision 10: history is read only for finished items without a date, at most the limit, and kept per revision (TC-FET-11)', async () => {
  const item = (id, state, extra = {}) => ({ key: `org/quality/${id}`, id, state, changedDate: '2026-11-01T00:00:00Z', ...extra })
  const items = [item(1, 'Closed', { closedDate: '2026-10-01T00:00:00Z' }), item(2, 'Active'), item(3, 'Completed'), item(4, 'Done'), item(5, 'Resolved')]
  const data = new Map()
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
  const reads = []
  const read = async (operation, extra) => { reads.push([operation, extra.workItemId]); if (extra.workItemId === 4) throw new Error('403'); return { value: [{ fields: { 'System.State': { oldValue: 'Active', newValue: 'Completed' }, 'System.ChangedDate': { newValue: `2026-10-0${extra.workItemId}T00:00:00Z` } } }] } }
  const out = await fillClosedDates(items, read, { limit: 2, storage })
  assert.deepEqual(reads, [['updates', 3], ['updates', 4]], 'only finished items without a date; the limit stops the rest')
  assert.deepEqual(out.map((entry) => [entry.id, entry.closedDate ?? null, entry.closedDateFrom ?? null]), [[1, '2026-10-01T00:00:00Z', null], [2, null, null], [3, '2026-10-03T00:00:00Z', 'history'], [4, null, null], [5, null, null]], 'a failed read leaves the item as it was')
  reads.length = 0
  const again = await fillClosedDates(items, read, { limit: 2, storage })
  assert.deepEqual(reads.map(([, id]) => id), [4, 5], 'item 3 comes from the cache; the others are read now')
  assert.equal(again.find((entry) => entry.id === 3).closedDate, '2026-10-03T00:00:00Z')
})

test('Owner decision 10: the desktop proxy reads a work item\'s history with one GET, nothing else (TC-FET-11)', () => {
  const request = azureReadRequest({ ...config, pat: 'pat', operation: 'updates', workItemId: 42 })
  assert.match(request.url, /\/_apis\/wit\/workItems\/42\/updates\?api-version=7\.1&\$top=200$/)
  assert.equal(request.options.method, 'GET')
  assert.throws(() => azureReadRequest({ ...config, pat: 'pat', operation: 'updates', workItemId: 0 }), /Invalid work item/)
})
