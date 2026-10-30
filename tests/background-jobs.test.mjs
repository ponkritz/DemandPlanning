import test from 'node:test'
import assert from 'node:assert/strict'
import { clearFinishedJobs, isRunning, listJobs, resetJobs, runInBackground, runningCount, subscribeJobs } from '../src/backgroundJobs.ts'

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

test('background jobs: run, report progress and the result; the same job is not started twice', async () => {
  resetJobs()
  let finish
  const seen = []
  const stop = subscribeJobs(() => seen.push(listJobs()[0]?.detail))
  const work = (progress) => new Promise((resolve) => { progress('Feature 1 of 2…'); finish = resolve })
  assert.equal(runInBackground('bulk:tasks', 'Create tasks', work), true)
  assert.equal(runInBackground('bulk:tasks', 'Create tasks', work), false, 'a second click while it runs does nothing')
  assert.equal(isRunning('bulk:tasks'), true)
  assert.equal(runningCount(), 1)
  assert.equal(listJobs()[0].detail, 'Feature 1 of 2…')
  finish({ text: '2 tasks created.' })
  await settle()
  assert.deepEqual([listJobs()[0].state, listJobs()[0].detail, isRunning('bulk:tasks')], ['done', '2 tasks created.', false])
  assert.ok(listJobs()[0].finished >= listJobs()[0].started)
  assert.ok(seen.includes('Feature 1 of 2…'), 'listeners hear the progress')
  assert.equal(runInBackground('bulk:tasks', 'Create tasks', async () => ({ text: 'again' })), true, 'it can run again once finished')
  stop()
})

test('background jobs: a failed result or a thrown error marks the job; Clear finished keeps the running ones', async () => {
  resetJobs()
  runInBackground('a', 'Partly done', async () => ({ text: '1 of 2 saved', failed: true }))
  runInBackground('b', 'Throws', async () => { throw new Error('The selected PI/Sprint is no longer current.') })
  let release
  runInBackground('c', 'Still running', () => new Promise((resolve) => { release = resolve }))
  await settle()
  const byKey = Object.fromEntries(listJobs().map((job) => [job.key, [job.state, job.detail]]))
  assert.deepEqual(byKey, { a: ['error', '1 of 2 saved'], b: ['error', 'The selected PI/Sprint is no longer current.'], c: ['running', 'Starting…'] })
  clearFinishedJobs()
  assert.deepEqual(listJobs().map((job) => job.key), ['c'])
  release({ text: 'ok' })
  await settle()
  resetJobs()
})
