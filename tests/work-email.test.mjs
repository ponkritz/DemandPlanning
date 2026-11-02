import test from 'node:test'
import assert from 'node:assert/strict'
import { initialWorkEmail, readWorkEmail, saveWorkEmail, workEmailKey } from '../src/workEmail.ts'
import { saveAzureConnectionProfile, loadAzureConnectionProfile } from '../src/azureCredentials.ts'
import { syncViewsFromGit, parseViews } from '../src/viewDefinitions.ts'

const memory = () => { const data = new Map(); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key), data } }
const tw = { id: 'tw', url: 'https://dev.azure.com/org/QMS', reason: 'Time Writing', viewName: 'QMS-0025', role: 'time-tracking', showInMenu: true }
const dp = { id: 'dp', url: 'https://tfs.example.com/tfs/Coll/DHP', baseUrl: 'https://tfs.example.com/tfs', reason: 'DP', viewName: 'DP', role: 'release-source', query: 'SELECT [System.Id] FROM WorkItems' }

test('your work email is its own setting: saved and read, never taken from the first connection or changed by a Git sync (TC-CON-50)', () => {
  const storage = memory()
  // The stream connections come first, as after a sync from Git; none carries the email.
  saveAzureConnectionProfile({ ...dp, token: 'pat' }, storage)
  saveAzureConnectionProfile({ ...tw, token: 'pat', creatorEmail: 'me@example.com' }, storage)
  assert.equal(readWorkEmail(storage), '', 'nothing set yet')
  assert.equal(saveWorkEmail(' Me@Example.com ', storage), 'me@example.com')
  assert.equal(readWorkEmail(storage), 'me@example.com')
  assert.throws(() => saveWorkEmail('not-an-email', storage), /valid work email/)
  // A sync from Git (which never carries emails) and the connection losing its email leave the setting alone.
  syncViewsFromGit(parseViews(JSON.stringify({ schema: 1, kind: 'azure-devops-views', views: [dp, { ...tw, viewName: 'QMS-0025 board' }] })), storage)
  saveAzureConnectionProfile({ ...loadAzureConnectionProfile('tw', storage), creatorEmail: undefined }, storage)
  assert.equal(readWorkEmail(storage), 'me@example.com')
  assert.equal(initialWorkEmail(storage), 'me@example.com')
  saveWorkEmail('', storage)
  assert.equal(storage.data.has(workEmailKey), false, 'an empty email removes the setting')
})

test('first start: the email on the Time Writing connection becomes the setting only after the shared-email clean-up ran (TC-CON-50)', () => {
  const before = memory()
  saveAzureConnectionProfile({ ...dp, token: 'pat' }, before)
  saveAzureConnectionProfile({ ...tw, token: 'pat', creatorEmail: 'me@example.com' }, before)
  assert.equal(initialWorkEmail(before), '', 'the clean-up has not run here: the email could be another person’s, so it is not taken over')
  before.setItem('demand-planning-shared-email-cleared-v1', '2026-11-02T00:00:00Z')
  assert.equal(initialWorkEmail(before), 'me@example.com', 'taken from the Time Writing connection, not from DP (the first one)')
  assert.equal(readWorkEmail(before), 'me@example.com', 'and kept as the setting')
  const none = memory(); none.setItem('demand-planning-shared-email-cleared-v1', 'x')
  saveAzureConnectionProfile({ ...tw, token: 'pat' }, none)
  assert.equal(initialWorkEmail(none), '')
})
