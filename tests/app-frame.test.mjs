import test from 'node:test'
import assert from 'node:assert/strict'
import { selfOf } from '../src/myWork.ts'
import { fetchAllOrder } from '../src/fetchOrder.ts'

test('NAV-47: My dashboard always shows you — your work email, else the name you chose before an email; never the Person picked on other pages (TC-NAV-47)', () => {
  assert.deepEqual(selfOf('ana@x.com', 'Ana Costa', 'Fatima Zahra'), { email: 'ana@x.com', name: 'Ana Costa' }, 'the email wins over a person picked')
  assert.deepEqual(selfOf('ana@x.com', undefined, ''), { email: 'ana@x.com' })
  assert.deepEqual(selfOf('', undefined, 'Ben Okafor'), { name: 'Ben Okafor' }, 'no email yet: the name chosen as yours')
  assert.deepEqual(selfOf('', undefined, ''), {}, 'not known: My dashboard asks who you are')
  assert.deepEqual(selfOf('ana@x.com', 'Ana Costa', '', { name: 'Chen Wei', email: 'chen@x.com' }), { name: 'Chen Wei', email: 'chen@x.com' }, 'View as a person: theirs')
})

test('FET-22: Refresh fetches the Time Writing connection first, then the read-only ones; a duplicate Time Writing connection is left out (TC-FET-10)', () => {
  const profiles = [{ id: 'dp', role: 'release-source' }, { id: 'old', role: 'time-tracking' }, { id: 'tw', role: 'time-tracking' }, { id: 'docs', role: 'documents' }]
  assert.deepEqual(fetchAllOrder(profiles, 'tw').map((profile) => profile.id), ['tw', 'dp', 'docs'])
  assert.deepEqual(fetchAllOrder(profiles, 'dp').map((profile) => profile.id), ['dp', 'docs'], 'an id that is not a Time Writing connection adds nothing first')
  assert.deepEqual(fetchAllOrder(profiles, undefined).map((profile) => profile.id), ['dp', 'docs'])
  assert.deepEqual(fetchAllOrder([{ id: 'norole' }, { id: 'dp', role: 'release-source' }], 'norole').map((profile) => profile.id), ['norole', 'dp'], 'CON-100: a connection without a role counts as read-only')
})
