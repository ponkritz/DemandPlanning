import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { defaultPolicy, parseAccess, serializeAccess, rightsFor, keepsManager } from '../src/access.ts'
import { readAzureIdentity, requestAzure, guardAzureWrites } from '../src/azureDevOps.ts'

test('access: no policy means no restrictions; members get the union of their roles, others the default role', () => {
  const open = rightsFor(null, 'anyone@example.com')
  assert.equal(open.restricted, false)
  assert.ok(open.areas.has('health') && open.actions.has('access.manage'))

  const policy = defaultPolicy('Lead@Example.com')
  policy.members['sm@example.com'] = ['Scrum Master']
  policy.members['pm@example.com'] = ['People Manager', 'Product Owner']
  const admin = rightsFor(policy, 'lead@example.com')
  assert.ok(admin.actions.has('access.manage') && admin.areas.has('health'), 'the first saver is Admin (email lower-cased)')
  const sm = rightsFor(policy, 'SM@example.com')
  assert.ok(sm.areas.has('health'), 'Scrum Master sees Backlog Health')
  assert.ok(!sm.actions.has('baselines.edit'))
  const member = rightsFor(policy, 'someone@example.com')
  assert.deepEqual(member.roles, ['Team Member'])
  assert.ok(!member.areas.has('health'), 'only the roles given Backlog Health see it')
  assert.ok(member.areas.has('mywork') && member.actions.has('azure.write'))
  const both = rightsFor(policy, 'pm@example.com')
  assert.ok(both.areas.has('health') && both.areas.has('snapshots') && both.actions.has('baselines.edit'), 'union of People Manager and Product Owner')
  assert.deepEqual(rightsFor(policy, '').roles, ['Team Member'], 'unknown identity: default role')
  policy.defaultRole = null
  assert.equal(rightsFor(policy, 'someone@example.com').areas.size, 0, 'no default role: nothing but Settings')
})

test('access file: round trip, unknown entries dropped, broken files refused, editor cannot lock themselves out', () => {
  const policy = defaultPolicy('lead@example.com')
  policy.members['sm@example.com'] = ['Scrum Master']
  assert.deepEqual(parseAccess(serializeAccess(policy)), policy)
  const parsed = parseAccess(JSON.stringify({ schema: 1, defaultRole: 'Guest', roles: { 'Scrum Master': { areas: ['health', 'nope'], actions: ['delete-all', 'azure.write'] } }, members: { 'not-an-email': ['Admin'], 'A@B.com': ['Scrum Master', 'Wizard'] } }))
  assert.equal(parsed.defaultRole, null)
  assert.deepEqual(parsed.roles['Scrum Master'], { areas: ['health'], actions: ['azure.write'] })
  assert.deepEqual(parsed.roles.Admin, { areas: [], actions: [] }, 'a role missing from the file has no rights')
  assert.deepEqual(parsed.members, { 'a@b.com': ['Scrum Master'] })
  assert.throws(() => parseAccess('{'), /not valid JSON/)
  assert.throws(() => parseAccess('{"schema":2,"roles":{},"members":{}}'), /not an access file/)
  assert.ok(keepsManager(policy, 'lead@example.com'))
  assert.ok(!keepsManager(policy, 'sm@example.com'))
  assert.ok(!keepsManager(policy, ''), 'an unknown editor cannot save')
})

test('identity: the email of the PAT owner from connectionData, at the organization or collection level', async () => {
  const config = { organization: 'example-org', project: 'Quality Project', team: 'Team A' }
  const seen = []
  const identity = await readAzureIdentity(config, ' pat ', async (request) => { seen.push(request); return { authenticatedUser: { providerDisplayName: 'Synthetic Person', properties: { Account: { $type: 'System.String', $value: 'Synthetic.Person@Example.com' } } } } })
  assert.deepEqual(identity, { email: 'synthetic.person@example.com', name: 'Synthetic Person' })
  assert.equal(seen[0].operation, 'identity')
  assert.equal(seen[0].pat, 'pat')
  await assert.rejects(readAzureIdentity(config, 'pat', async () => ({ authenticatedUser: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' } })), /did not return an email/)

  const { azureReadRequest, requestAzureDevOps } = createRequire(import.meta.url)('../electron/azure-devops.cjs')
  const cloud = azureReadRequest({ ...config, pat: 'p', operation: 'identity' })
  assert.equal(cloud.url, 'https://dev.azure.com/example-org/_apis/connectionData?api-version=7.1-preview')
  assert.equal(cloud.options.method, 'GET')
  assert.equal(cloud.options.body, undefined)
  const onPrem = azureReadRequest({ ...config, pat: 'p', operation: 'identity', baseUrl: 'https://tfs.example.com/tfs/Collection', apiVersion: '6.0' })
  assert.equal(onPrem.url, 'https://tfs.example.com/tfs/Collection/_apis/connectionData?api-version=6.0-preview')
  const urls = []
  await requestAzureDevOps({ ...config, pat: 'p', operation: 'identity', baseUrl: 'https://tfs.example.com/tfs/Collection' }, async (url) => {
    urls.push(url)
    return url.includes('7.1') ? new Response('{"message":"VssVersionOutOfRangeException: The requested REST API version 7.1 is out of range"}', { status: 400 }) : new Response('{"authenticatedUser":{}}', { status: 200, headers: { 'content-type': 'application/json' } })
  })
  assert.deepEqual(urls.map((url) => new URL(url).searchParams.get('api-version')), ['7.1-preview', '6.0-preview'], 'older servers: same fallback, still a preview version')
})

test('a role without Azure changes: write requests are refused before anything is sent', async () => {
  const sent = []
  const original = globalThis.fetch
  globalThis.window = {}
  globalThis.fetch = async (url) => { sent.push(url); return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }) }
  try {
    guardAzureWrites(() => false)
    await assert.rejects(requestAzure({ organization: 'o', project: 'p', team: 't', pat: 'x', operation: 'update-work-item', workItemId: 1, state: 'Closed' }), /role does not allow changes/)
    assert.equal(sent.length, 0)
    await requestAzure({ organization: 'o', project: 'p', team: 't', pat: 'x', operation: 'fields' })
    assert.equal(sent.length, 1, 'reads still work')
  } finally { guardAzureWrites(() => true); delete globalThis.window; globalThis.fetch = original }
})
