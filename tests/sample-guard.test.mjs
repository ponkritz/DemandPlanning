import test from 'node:test'
import assert from 'node:assert/strict'
import { guardSampleWrites, requestAzure } from '../src/azureDevOps.ts'

test('OI-10: with the synthetic sample loaded, every write to Azure DevOps is refused before anything is sent (TC-SMP-02)', async () => {
  const config = { organization: 'example-org', project: 'Quality', team: 'Team A', pat: 'synthetic-test-token' }
  const sent = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (...args) => { sent.push(args); return new Response('{}', { status: 500 }) }
  try {
    guardSampleWrites(() => true)
    for (const request of [
      { ...config, operation: 'create-child', workItemType: 'Task', validateOnly: true, feature: { parentId: 1, title: 'December 2026 | F', description: '', acceptanceCriteria: '', areaPath: 'Quality', assignedTo: 'a@example.invalid' } },
      { ...config, operation: 'update-time-writing-effort', workItemId: 5, planHours: 4 },
      { ...config, operation: 'update-work-item', workItemId: 5, state: 'Closed' },
    ]) await assert.rejects(requestAzure(request), /Synthetic sample data is loaded: nothing is written/, request.operation)
    assert.equal(sent.length, 0, 'nothing was sent')
  } finally { guardSampleWrites(() => false); globalThis.fetch = realFetch }
})
