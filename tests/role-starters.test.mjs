import test from 'node:test'
import assert from 'node:assert/strict'
import { forgetAzureConnectionProfile, listAzureConnectionProfiles, saveAzureConnectionProfile } from '../src/azureCredentials.ts'
import { applyStarters, appliedStarters, emptyStarters, parseStarters, serializeStarters, starterCopy, starterProblem, startersBlocked, startersFor, withStarter, withoutStarter } from '../src/roleStarters.ts'

// SET-21…SET-25 (TC-SET-11, TC-SET-12): starter views per access role, copied once into each person's My views.
// Synthetic data only.
const memory = () => { const data = new Map(); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) } }
const repo = 'example/storage@main:azure-views.json'
const starter = (id, name, roles, extra = {}) => ({ id, name, server: 'https://tfs.example.invalid/Coll', onPrem: true, project: 'Project', query: `SELECT [System.Id] FROM WorkItems WHERE [System.Title] = '${name}'`, roles, ...extra })
const bugs = starter('starter-bugs', 'Open bugs', ['Team Member']), leads = starter('starter-leads', 'Lead queue', ['Scrum Master', 'Admin'])

test('SET-21, SET-22: the starter views file — checked like a My view, roles only from the access roles, never a PAT (TC-SET-11)', () => {
  assert.equal(starterProblem(bugs), '')
  assert.match(starterProblem({ ...bugs, name: 'DP' }), /names the stream DP/)
  assert.match(starterProblem({ ...bugs, roles: [] }), /at least one access role/)
  assert.match(starterProblem({ ...bugs, query: 'nothing' }), /WIQL/)
  assert.match(starterProblem({ ...bugs, id: 'starter-other' }, [bugs]), /already exists/)
  const file = withStarter(withStarter(emptyStarters(), bugs), { ...leads, token: 'synthetic-pat', creatorEmail: 'someone@example.com' })
  const text = serializeStarters(file)
  assert.equal(text.includes('synthetic-pat'), false, 'no PAT')
  assert.equal(text.includes('someone@example.com'), false, 'no connection email')
  const back = parseStarters(text)
  assert.deepEqual(back.views.map((view) => [view.id, view.roles]), [['starter-bugs', ['Team Member']], ['starter-leads', ['Admin', 'Scrum Master']]])
  // A wrong entry is left out, an unknown role dropped; a file that is not one is refused as a whole.
  const mixed = JSON.parse(text); mixed.views.push({ id: '../x', name: 'Bad' }, { ...bugs, id: 'starter-x', name: 'Other', roles: ['Team Member', 'Pirate'] })
  assert.deepEqual(parseStarters(JSON.stringify(mixed)).views.map((view) => [view.id, view.roles]).at(-1), ['starter-x', ['Team Member']])
  assert.equal(parseStarters(JSON.stringify(mixed)).views.length, 3)
  assert.throws(() => parseStarters('{"schema":1}'), /not a starter views file/)
  assert.deepEqual(withoutStarter(file, 'starter-bugs').views.map((view) => view.id), ['starter-leads'])
  // Role matching: a person's own roles (any one of them).
  assert.deepEqual(startersFor(file, ['Team Member']).map((view) => view.id), ['starter-bugs'])
  assert.deepEqual(startersFor(file, ['Scrum Master', 'Team Member']).map((view) => view.id).sort(), ['starter-bugs', 'starter-leads'])
  assert.deepEqual(startersFor(file, ['Product Owner']), [])
})

test('SET-23: a starter view is copied once into My views — a deleted copy does not come back, a new starter arrives later, a role taken away keeps the copy (TC-SET-11)', () => {
  const storage = memory()
  const file = withStarter(emptyStarters(), bugs)
  const first = applyStarters(file, ['Team Member'], repo, 'Ana@Example.com', storage)
  assert.deepEqual(first.copied, ['Open bugs'])
  const copy = listAzureConnectionProfiles(storage).find((profile) => profile.id === 'my-starter-bugs')
  assert.ok(copy?.mine, 'a My view of the person')
  assert.equal(copy.query, bugs.query)
  assert.deepEqual(appliedStarters(repo, 'ana@example.com', storage), ['starter-bugs'])
  // Applied again: nothing more.
  assert.deepEqual(applyStarters(file, ['Team Member'], repo, 'ana@example.com', storage).copied, [])
  // The person deletes it: it does not come back.
  forgetAzureConnectionProfile('my-starter-bugs', storage)
  assert.deepEqual(applyStarters(file, ['Team Member'], repo, 'ana@example.com', storage).copied, [])
  assert.equal(listAzureConnectionProfiles(storage).length, 0)
  // A starter added later arrives at the next sync; a changed starter does not change the copy (LIM-158).
  const later = withStarter(withStarter(file, { ...bugs, query: 'SELECT [System.Id] FROM WorkItems WHERE changed = 1' }), starter('starter-new', 'New queue', ['Team Member']))
  assert.deepEqual(applyStarters(later, ['Team Member'], repo, 'ana@example.com', storage).copied, ['New queue'])
  // Another person on the same computer gets their own copies; a role taken away keeps the copy made.
  assert.deepEqual(applyStarters(later, ['Admin'], repo, 'ana@example.com', storage).copied, [])
  assert.ok(listAzureConnectionProfiles(storage).some((profile) => profile.id === 'my-starter-new'))
  // A view of the same name already here is not copied again (recorded as applied).
  const other = memory()
  saveAzureConnectionProfile({ ...starterCopy(bugs), id: 'my-own', token: '' }, other)
  assert.deepEqual(applyStarters(file, ['Team Member'], repo, 'ben@example.com', other), { copied: [], ids: [], already: ['Open bugs'] })
  // No work email: no starters.
  assert.deepEqual(applyStarters(file, ['Team Member'], repo, '', memory()).copied, [])
})

test('SET-24: why no starter views are copied — View as, sample, no Git, no work email (TC-SET-12)', () => {
  const ok = { email: 'ana@example.com', connected: true, isSample: false, viewingAs: false }
  assert.equal(startersBlocked(ok), '')
  assert.match(startersBlocked({ ...ok, email: '' }), /need your work email/)
  assert.match(startersBlocked({ ...ok, connected: false }), /connect Git storage/)
  assert.match(startersBlocked({ ...ok, isSample: true }), /synthetic sample/)
  assert.match(startersBlocked({ ...ok, viewingAs: true }), /viewing as someone else/)
})
