import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeBase64, encodeBase64, GitConflictError, historyUrl, parsePlanning, planningData, readPlanningFile, serializePlanning, validateGitConfig, defaultGitRepository, writePlanningFile, loadGitConfig, saveGitConfig } from '../src/gitStorage.ts'

const config = { owner: 'acme', repo: 'demand-planning-data', branch: 'main', path: 'planning-data.json' }
const state = { baselineRules: [{ stream: 'CP', types: {}, items: [{ label: 'Documents', hoursPerUnit: 2, baseUnits: 14, driver: 'assets', unitsPerDriver: 11 }] }], releaseScopes: [{ release: 'CP | Care Pathways | v3.1', stream: 'CP', history: [{ at: '2026-10-01T10:00:00Z', drivers: { assets: 10 }, reason: 'Initial' }] }], resourceProfiles: { 'Zoë Müller': { region: 'Netherlands', role: 'QE' }, 'Arjun Rao': { region: 'India', role: 'Lead', peopleManager: true } } }
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

test('config validation and browser persistence', () => {
  assert.deepEqual(validateGitConfig({ owner: ' acme ', repo: 'demand-planning-data.git', branch: '', path: '/planning-data.json' }), config)
  assert.throws(() => validateGitConfig({ owner: '', repo: 'x' }), /owner/)
  assert.throws(() => validateGitConfig({ owner: 'a', repo: 'b', path: '../secrets.json' }), /path/)
  assert.throws(() => validateGitConfig({ owner: 'a', repo: 'b', path: 'data.txt' }), /\.json/)
  const store = new Map(); const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) }
  saveGitConfig(config, storage); assert.deepEqual(loadGitConfig(storage), config)
  assert.equal(historyUrl(config), 'https://github.com/acme/demand-planning-data/commits/main/planning-data.json')
})

test('planning data serialises stably and round-trips, including non-ASCII names', () => {
  const data = planningData(state)
  assert.deepEqual(Object.keys(data.resourceProfiles), ['Arjun Rao', 'Zoë Müller'], 'profiles sorted for clean diffs')
  const text = serializePlanning(data)
  assert.deepEqual(parsePlanning(text), data)
  assert.equal(serializePlanning(planningData(parsePlanning(text))), text, 'loading then saving does not change the file')
  assert.equal(decodeBase64(encodeBase64(text)), text)
  assert.throws(() => parsePlanning('{'), /not valid JSON/)
  assert.throws(() => parsePlanning('{"schema":2}'), /schema 1/)
})

test('read: existing file, missing file in an accessible repo, inaccessible repo', async () => {
  const text = serializePlanning(planningData(state))
  const ok = await readPlanningFile(config, 't', async (url, init) => {
    assert.equal(url, 'https://api.github.com/repos/acme/demand-planning-data/contents/planning-data.json?ref=main')
    assert.equal(init.headers.Authorization, 'Bearer t')
    return response(200, { type: 'file', encoding: 'base64', sha: 'abc', content: encodeBase64(text).replace(/(.{60})/g, '$1\n') })
  })
  assert.equal(ok.sha, 'abc'); assert.deepEqual(ok.data, planningData(state))
  const missing = await readPlanningFile(config, 't', async (url) => url.includes('/contents/') ? response(404, {}) : response(200, { name: 'main' }))
  assert.deepEqual(missing, { data: null, sha: null })
  await assert.rejects(readPlanningFile(config, 't', async () => response(404, {})), /not found, or the token cannot access it/)
  await assert.rejects(readPlanningFile(config, 'bad', async () => response(401, {})), /rejected the token/)
})

test('write: one commit with the loaded sha; a concurrent change is a conflict', async () => {
  const data = planningData(state)
  let sent
  const result = await writePlanningFile(config, 't', data, 'abc', 'CP v3.1: 2 assets scoped in', async (url, init) => { sent = { url, init, body: JSON.parse(init.body) }; return response(200, { content: { sha: 'def' }, commit: { html_url: 'https://github.com/acme/demand-planning-data/commit/123' } }) })
  assert.equal(sent.init.method, 'PUT')
  assert.deepEqual([sent.body.message, sent.body.sha, sent.body.branch], ['CP v3.1: 2 assets scoped in', 'abc', 'main'])
  assert.equal(decodeBase64(sent.body.content), serializePlanning(data))
  assert.deepEqual(result, { sha: 'def', commitUrl: 'https://github.com/acme/demand-planning-data/commit/123' })
  const created = await writePlanningFile(config, 't', data, null, '', async (_url, init) => { sent = JSON.parse(init.body); return response(201, { content: { sha: 'new' } }) })
  assert.equal('sha' in sent, false, 'creating the file sends no sha'); assert.equal(sent.message, 'Update planning data'); assert.equal(created.sha, 'new')
  await assert.rejects(writePlanningFile(config, 't', data, 'old', 'x', async () => response(409, {})), GitConflictError)
})

import { canWrite } from '../src/gitStorage.ts'
test('write check: read-only tokens are told apart without writing anything', async () => {
  const config = { owner: 'o', repo: 'r', branch: 'main', path: 'planning-data.json' }
  const run = async (push, probeStatus) => {
    const calls = []
    const result = await canWrite(config, 't', async (url, init = {}) => {
      calls.push([init.method ?? 'GET', url, init.body])
      return url.endsWith('/repos/o/r') ? Response.json({ permissions: { push } }) : new Response('{}', { status: probeStatus })
    })
    return { result, calls }
  }
  const noPush = await run(false, 422)
  assert.equal(noPush.result, false, 'no write permission on the repository')
  assert.equal(noPush.calls.length, 1, 'no probe needed')
  const fineGrainedReadOnly = await run(true, 403)
  assert.equal(fineGrainedReadOnly.result, false, 'the user may write, but this token may not')
  assert.deepEqual(fineGrainedReadOnly.calls[1], ['PUT', 'https://api.github.com/repos/o/r/contents/.demand-planning-write-check', '{}'], 'the probe carries no content, so nothing can be written')
  assert.equal((await run(true, 422)).result, true, 'an incomplete write is rejected only after the token is allowed to write')
  assert.equal((await run(true, 500)).result, null, 'unknown')
  assert.equal(await canWrite(config, 't', async () => new Response('', { status: 401 })), null)
})

import { deleteFile } from '../src/gitStorage.ts'
test('delete: the file as it is now, one commit; a missing file is not an error', async () => {
  const calls = []
  const target = { ...config, path: 'azure-data/tw.json' }
  const done = await deleteFile(target, 't', 'Remove data of replaced connection', async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : undefined })
    return init.method === 'DELETE' ? response(200, {}) : response(200, { sha: 'cur' })
  })
  assert.equal(done, true)
  assert.deepEqual(calls.map((call) => call.method), ['GET', 'DELETE'])
  assert.match(calls[1].url, /\/contents\/azure-data\/tw\.json$/)
  assert.deepEqual(calls[1].body, { message: 'Remove data of replaced connection', sha: 'cur', branch: 'main' })
  assert.equal(await deleteFile(target, 't', 'x', async () => response(404, {})), false)
  await assert.rejects(deleteFile(target, 't', 'x', async (_url, init = {}) => init.method === 'DELETE' ? response(403, {}) : response(200, { sha: 'cur' })), /refused to delete/)
})

test('capacity settings, holidays and common activities travel in the Git planning file', () => {
  const capacitySettings = { absenceEpicId: 37778, hoursPerDay: 8, overloadedAt: 100, availableBelow: 80, sharedTime: [{ id: 900, kind: 'activity', scope: 'everyone', label: 'PI Planning' }, { id: 60, kind: 'holiday', scope: 'India' }] }
  const data = planningData({ ...state, capacitySettings })
  assert.deepEqual(data.capacitySettings.sharedTime.map((rule) => rule.id), [60, 900], 'mappings sorted by ID for clean diffs')
  const text = serializePlanning(data)
  assert.deepEqual(parsePlanning(text), data)
  assert.equal(serializePlanning(planningData(parsePlanning(text))), text, 'loading then saving does not change the file')
  const old = serializePlanning(planningData(state))
  assert.equal('capacitySettings' in parsePlanning(old), false, 'an older file without capacity settings leaves this browser\'s settings alone')
  assert.notEqual(serializePlanning(planningData({ ...state, capacitySettings })), old, 'a local mapping makes the data differ from an older file, so Save to Git is offered')
  assert.deepEqual(parsePlanning(serializePlanning({ ...data, capacitySettings: { ...capacitySettings, sharedTime: [{ id: 'x', kind: 'party', scope: 'Mars' }] } })).capacitySettings.sharedTime, undefined, 'invalid mappings in the file are dropped')
})

test('the default data repository is a valid config: ponkritz/DemandPlanningStorage, main, planning-data.json (GIT-13)', () => {
  assert.deepEqual(validateGitConfig(defaultGitRepository), { owner: 'ponkritz', repo: 'DemandPlanningStorage', branch: 'main', path: 'planning-data.json' })
})
