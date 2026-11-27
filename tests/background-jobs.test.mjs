import test from 'node:test'
import assert from 'node:assert/strict'
import { clearFinishedJobs, isRunning, listJobs, resetJobs, runInBackground, runJobAction, runningCount, subscribeJobs } from '../src/backgroundJobs.ts'

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

import { recordJob } from '../src/backgroundJobs.ts'
test('QV-63: an instant result is a finished entry — done or to check — without blocking a job of the same key (TC-QV-44)', async () => {
  resetJobs()
  let release
  runInBackground('windchill:a', 'Fetch from Windchill · S&S IT', () => new Promise((resolve) => { release = resolve }))
  const id = recordJob('windchill:a', 'Import Windchill export · S&S IT', { text: '12 results imported from sit.csv.' }, () => 1000)
  assert.equal(typeof id, 'number')
  recordJob('windchill:b', 'Import Windchill export · ECP', { text: 'The file is not a Windchill export.', failed: true }, () => 2000)
  const [failed, done, running] = listJobs()
  assert.deepEqual([failed.label, failed.state, failed.detail, failed.started, failed.finished], ['Import Windchill export · ECP', 'error', 'The file is not a Windchill export.', 2000, 2000], 'newest first; a failure needs a look')
  assert.deepEqual([done.state, done.detail, done.started, done.finished], ['done', '12 results imported from sit.csv.', 1000, 1000])
  assert.equal(running.state, 'running', 'the running job with the same key is untouched')
  assert.equal(isRunning('windchill:a'), true)
  assert.equal(runningCount(), 1, 'a finished entry is never counted as running')
  clearFinishedJobs()
  assert.deepEqual(listJobs().map((job) => job.label), ['Fetch from Windchill · S&S IT'], 'Clear finished removes the recorded entries too')
  release({ text: 'ok' })
  await settle()
  for (let index = 0; index < 25; index += 1) recordJob(`k${index}`, `Entry ${index}`, { text: 'ok' })
  assert.equal(listJobs().length, 20, 'the list keeps the 20 newest entries')
  resetJobs()
})

test('PIR-84: a finished job offers its follow-up (Retry failed) once — taken off the entry when it runs (TC-PIR-84)', async () => {
  resetJobs()
  let runs = 0
  runInBackground('pireview:bulk', 'PI review for 3 Features', async () => ({ text: 'Posted 2 · Replaced 0 · Failed 1 (#203).', failed: true, action: { label: 'Retry failed (1)', run: () => { runs += 1 } } }))
  await settle()
  const job = listJobs()[0]
  assert.deepEqual([job.state, job.action?.label], ['error', 'Retry failed (1)'])
  runJobAction(job.id)
  runJobAction(job.id)
  assert.equal(runs, 1, 'once, however often it is pressed')
  assert.equal(listJobs()[0].action, undefined)
  resetJobs()
})
