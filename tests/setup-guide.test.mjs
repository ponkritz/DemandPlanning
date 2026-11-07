import test from 'node:test'
import assert from 'node:assert/strict'
import { requiredOpen, setupSteps } from '../src/setupGuide.ts'

const streams = (ready) => ['DP', 'CP', 'IOCC', 'Content', 'Tool Validations'].map((name, index) => ({ name, connected: index < ready }))
const base = { gitConnected: false, gitReadOnly: false, timeWriting: false, email: '', pat: false, fetched: false, sample: false, canManage: false, streams: streams(0) }
const states = (facts) => Object.fromEntries(setupSteps(facts).map((step) => [step.id, step.state]))

test('a first-time user: Git first, then the connection and token, then the email (read from the token), then Fetch', () => {
  assert.deepEqual(states(base), { git: 'todo', pat: 'todo', email: 'blocked', fetch: 'blocked', region: 'blocked', streams: 'blocked' })
  assert.equal(requiredOpen(setupSteps(base)), 4)
  assert.deepEqual(setupSteps(base).filter((step) => step.required).map((step) => step.id), ['git', 'pat', 'email', 'fetch'])
  // NAV-39: the email step offers Detect from my token next to typing it; the PAT field only with a Time Writing connection.
  const email = setupSteps({ ...base, timeWriting: true, pat: true }).find((step) => step.id === 'email')
  assert.deepEqual([email.state, email.input, email.action], ['todo', 'email', 'detect-email'])
  assert.equal(setupSteps(base).find((step) => step.id === 'pat').input, undefined)
  assert.equal(setupSteps({ ...base, timeWriting: true }).find((step) => step.id === 'pat').input, 'pat')
})

test('partly set up: Git and the connection done, the PAT is next, then the email, then Fetch', () => {
  const facts = { ...base, gitConnected: true, timeWriting: true }
  assert.deepEqual(states(facts), { git: 'done', pat: 'todo', email: 'blocked', fetch: 'blocked', region: 'blocked', streams: 'blocked' })
  assert.deepEqual(states({ ...facts, pat: true }), { git: 'done', pat: 'done', email: 'todo', fetch: 'blocked', region: 'blocked', streams: 'todo' })
  assert.deepEqual(states({ ...facts, pat: true, email: 'ana@example.com' }), { git: 'done', pat: 'done', email: 'done', fetch: 'todo', region: 'blocked', streams: 'todo' })
  assert.match(setupSteps({ ...facts, pat: true, email: 'ana@example.com', sample: true }).find((step) => step.id === 'fetch').why, /Sample data/)
  assert.ok(setupSteps({ ...base, gitConnected: true, gitReadOnly: true }).find((step) => step.id === 'git').how.some((line) => /read but not save/.test(line)))
})

test('fully set up: nothing required left; region and streams follow the facts and who may change them', () => {
  const facts = { ...base, gitConnected: true, timeWriting: true, email: 'ana@example.com', pat: true, fetched: true, region: 'India', streams: streams(5) }
  assert.equal(requiredOpen(setupSteps(facts)), 0)
  assert.deepEqual(states(facts), { git: 'done', pat: 'done', email: 'done', fetch: 'done', region: 'done', streams: 'done' })
  const noRegion = setupSteps({ ...facts, region: undefined }).find((step) => step.id === 'region')
  assert.deepEqual([noRegion.state, noRegion.tab, /Ask your People Manager/.test(noRegion.how[0])], ['todo', undefined, true], 'without the right to manage, the step says whom to ask')
  assert.equal(setupSteps({ ...facts, region: undefined, canManage: true }).find((step) => step.id === 'region').tab, 'resources')
  assert.match(setupSteps({ ...facts, streams: streams(2) }).find((step) => step.id === 'streams').why, /2 of 5 ready/)
})

test('release streams: DP\'s Pedestal and DHFI data sets count, and the missing ones are named', () => {
  const facts = { ...base, gitConnected: true, timeWriting: true, email: 'ana@example.com', pat: true, fetched: true, region: 'India', streams: streams(5) }
  const step = (dataSets) => setupSteps({ ...facts, dataSets }).find((entry) => entry.id === 'streams')
  const missingDhfi = step([{ name: 'Pedestal', connected: true }, { name: 'DHFI', connected: false }])
  assert.equal(missingDhfi.state, 'todo', 'all five streams ready is not enough without DHFI')
  assert.match(missingDhfi.why, /6 of 7 ready; missing: DHFI/)
  assert.equal(step([{ name: 'Pedestal', connected: true }, { name: 'DHFI', connected: true }]).state, 'done')
})

import { detectWorkEmail } from '../src/azureDevOps.ts'
test('NAV-39: the work email is read from the token owner\'s work items (@Me): Assigned To first, then Created By, then Changed By', async () => {
  const config = { organization: 'org', project: 'Quality', team: 'T' }
  const calls = []
  const world = { 'System.AssignedTo': [], 'System.CreatedBy': [7], 'System.ChangedBy': [9] }
  const transport = async (request) => {
    calls.push(request)
    if (request.operation === 'query') { assert.match(request.query, /^SELECT \[System\.Id\] FROM WorkItems WHERE \[System\.\w+\] = @Me/); const field = /\[(System\.\w+)\] = @Me/.exec(request.query)[1]; return { workItems: world[field].map((id) => ({ id })) } }
    if (request.operation === 'items') return { value: [{ id: request.ids[0], fields: { 'System.CreatedBy': { displayName: 'Ana Costa', uniqueName: 'Ana.Costa@Example.com' }, 'System.ChangedBy': 'Ben <ben@example.com>' } }] }
    throw new Error(`unexpected ${request.operation}`)
  }
  assert.deepEqual(await detectWorkEmail(config, 'pat', transport), { email: 'ana.costa@example.com', name: 'Ana Costa', via: 'Created By' })
  assert.ok(calls.every((call) => call.operation === 'query' || call.operation === 'items'), 'read only')
  world['System.CreatedBy'] = []
  assert.deepEqual(await detectWorkEmail(config, 'pat', transport), { email: 'ben@example.com', name: 'Ben', via: 'Changed By' }, 'the "Name <email>" form is read too')
  world['System.ChangedBy'] = []
  assert.equal(await detectWorkEmail(config, 'pat', transport), null, 'no work item yet: nothing found')
  await assert.rejects(detectWorkEmail(config, ' ', transport), /token/)
})

import { normalizeSetupLinks, parsePlanning, planningData, serializePlanning } from '../src/gitStorage.ts'
test('NAV-40: the token links are https only, shared in the planning data and kept through a round trip', () => {
  assert.deepEqual(normalizeSetupLinks({ github: 'https://github.com/settings/tokens', azure: 'http://dev.azure.com/x', tfs: 'not a link', other: 'https://x' }), { github: 'https://github.com/settings/tokens' })
  assert.equal(normalizeSetupLinks({ github: '' }), undefined)
  const data = planningData({ baselineRules: [], releaseScopes: [], resourceProfiles: {}, setupLinks: { tfs: 'https://tfs.example.com/APAC/_usersSettings/tokens' } })
  assert.deepEqual(parsePlanning(serializePlanning(data)).setupLinks, { tfs: 'https://tfs.example.com/APAC/_usersSettings/tokens' })
  assert.equal('setupLinks' in planningData({ baselineRules: [], releaseScopes: [], resourceProfiles: {} }), false, 'no links: nothing written')
  const steps = setupSteps(base)
  assert.deepEqual(steps.map((step) => step.link ?? ''), ['github', 'azure', '', '', '', 'tfs'])
  assert.equal(steps.at(-1).title, 'TFS APAC settings [DP/CP/IOCC/Content]')
})
