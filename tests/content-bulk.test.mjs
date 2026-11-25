import test from 'node:test'
import assert from 'node:assert/strict'
import * as contentModule from '../src/contentBulk.ts'
import { boardPeople, contentBulk, contentPlan, personEmail } from '../src/contentBulk.ts'

test('CNB-01: Content bulk Features — under the mapped Content bulk Epic (none built in), the DoD, one Review of Deliverables story, 4 h; a 100% Feature match is never created, a closer one is named (BLK-01)', () => {
  assert.equal('contentEpicId' in contentModule, false, 'QV-59: no Content Epic is built in')
  assert.deepEqual(contentBulk, { featureDoD: 'All Documents are approved', taskEstimate: 4 }, 'DPF-09: no Release Classification')
  const releases = [{ key: 'a', name: 'Clinical Library v7' }, { key: 'b', name: 'Atlas' }, { key: 'c', name: '' }, { key: 'd', name: 'Lexicon' }]
  const hits = { b: { item: { id: 7 }, score: 100 }, d: { item: { id: 8 }, score: 91 } }
  const plan = contentPlan(releases, (release) => release.name ? `Content | ${release.name}` : '', (release) => hits[release.key])
  assert.deepEqual(plan.map((line) => [line.title, line.skip, line.note]), [['Content | Clinical Library v7', '', ''], ['Content | Atlas', 'Feature #7 on QMS-0025 matches it 100%', ''], ['', 'no title', ''], ['Content | Lexicon', '', 'a similar Feature #8 (91%) exists']])
})

test('CNB-02: the pop-up assigns to one person — a name on the board, "Name <email>" or an email', () => {
  const board = [{ assignedTo: 'Asha Rao <asha@x.com>', assignedToEmail: 'Asha@x.com' }, { assignedTo: 'Ben Ito', assignedToEmail: 'ben@x.com' }, { assignedTo: 'Asha Rao', assignedToEmail: 'asha@x.com' }, { assignedTo: 'Nobody' }]
  const people = boardPeople(board)
  assert.deepEqual(people, [{ name: 'Asha Rao', email: 'asha@x.com' }, { name: 'Ben Ito', email: 'ben@x.com' }], 'each person once, by name')
  assert.equal(personEmail('asha rao', people), 'asha@x.com')
  assert.equal(personEmail('Cara <Cara@Y.com>', people), 'cara@y.com')
  assert.equal(personEmail('dev@z.org', people), 'dev@z.org')
  assert.equal(personEmail('Someone', people), '')
})
