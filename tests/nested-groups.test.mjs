import test from 'node:test'
import assert from 'node:assert/strict'
import { nestGroups, nestedKeys } from '../src/nestedGroups.ts'

test('nested groups: type, then name, then version; blank last; keys unique per path (QV-37)', () => {
  const releases = [
    { group: 'Mobile', name: 'IOCC Mobile', release: '2.10' }, { group: 'Mobile', name: 'IOCC Mobile', release: '2.9' },
    { group: 'Core', name: 'Gateway', release: '5.0' }, { group: '', name: 'Loose', release: '' }, { group: 'Mobile', name: 'Viewer', release: '1.0' },
  ]
  const levels = [{ id: 'type', label: 'Type of Release', value: (r) => r.group }, { id: 'name', label: 'Name', value: (r) => r.name }, { id: 'release', label: 'Release', value: (r) => r.release }]
  const shape = (groups) => groups.map((group) => [group.value, group.depth, group.items.length, shape(group.children)])
  assert.deepEqual(shape(nestGroups(releases, levels.slice(0, 2))), [
    ['Core', 0, 1, [['Gateway', 1, 1, []]]],
    ['Mobile', 0, 3, [['IOCC Mobile', 1, 2, []], ['Viewer', 1, 1, []]]],
    ['', 0, 1, [['Loose', 1, 1, []]]],
  ])
  const three = nestGroups(releases, levels)
  assert.deepEqual(three[1].children[0].children.map((group) => group.value), ['2.9', '2.10'], 'versions in number order')
  const keys = nestedKeys(three)
  assert.equal(new Set(keys).size, keys.length, 'every group has its own key')
  assert.deepEqual(nestGroups(releases, []), [])
})
