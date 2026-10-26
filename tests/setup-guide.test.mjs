import test from 'node:test'
import assert from 'node:assert/strict'
import { requiredOpen, setupSteps } from '../src/setupGuide.ts'

const streams = (ready) => ['DP', 'CP', 'IOCC', 'Content', 'Tool Validations'].map((name, index) => ({ name, connected: index < ready }))
const base = { gitConnected: false, gitReadOnly: false, timeWriting: false, email: '', pat: false, fetched: false, sample: false, canManage: false, streams: streams(0) }
const states = (facts) => Object.fromEntries(setupSteps(facts).map((step) => [step.id, step.state]))

test('a first-time user: Git first, the rest waits for the step it depends on', () => {
  assert.deepEqual(states(base), { git: 'todo', timewriting: 'todo', pat: 'blocked', fetch: 'blocked', region: 'blocked', streams: 'blocked' })
  assert.equal(requiredOpen(setupSteps(base)), 4)
  assert.deepEqual(setupSteps(base).filter((step) => step.required).map((step) => step.id), ['git', 'timewriting', 'pat', 'fetch'])
})

test('partly set up: Git and the connection done, the PAT is next, then Fetch', () => {
  const facts = { ...base, gitConnected: true, timeWriting: true, email: 'ana@example.com' }
  assert.deepEqual(states(facts), { git: 'done', timewriting: 'done', pat: 'todo', fetch: 'blocked', region: 'blocked', streams: 'blocked' })
  assert.deepEqual(states({ ...facts, pat: true }), { git: 'done', timewriting: 'done', pat: 'done', fetch: 'todo', region: 'blocked', streams: 'todo' })
  assert.match(setupSteps({ ...facts, pat: true, sample: true }).find((step) => step.id === 'fetch').why, /Sample data/)
  assert.ok(setupSteps({ ...base, gitConnected: true, gitReadOnly: true }).find((step) => step.id === 'git').how.some((line) => /read but not save/.test(line)))
})

test('fully set up: nothing required left; region and streams follow the facts and who may change them', () => {
  const facts = { ...base, gitConnected: true, timeWriting: true, email: 'ana@example.com', pat: true, fetched: true, region: 'India', streams: streams(5) }
  assert.equal(requiredOpen(setupSteps(facts)), 0)
  assert.deepEqual(states(facts), { git: 'done', timewriting: 'done', pat: 'done', fetch: 'done', region: 'done', streams: 'done' })
  const noRegion = setupSteps({ ...facts, region: undefined }).find((step) => step.id === 'region')
  assert.deepEqual([noRegion.state, noRegion.tab, /Ask your People Manager/.test(noRegion.how[0])], ['todo', undefined, true], 'without the right to manage, the step says whom to ask')
  assert.equal(setupSteps({ ...facts, region: undefined, canManage: true }).find((step) => step.id === 'region').tab, 'resources')
  assert.match(setupSteps({ ...facts, streams: streams(2) }).find((step) => step.id === 'streams').why, /2 of 5 ready/)
})
