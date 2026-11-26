import test from 'node:test'
import assert from 'node:assert/strict'
import { canCollapseAll, canExpandAll, compareGroupValues, filterTableRows, groupedOrder, groupKeys, groupLines, groupTree, isGroupOpen, matchesColumnFilter, shownValues, toggleGroup, visibleRows } from '../src/tableGroups.ts'
import { chooseTableView, fitTableView, parseTableView, readOwnView, shareableView, startOwnView, writeOwnView } from '../src/tableViews.ts'

// Synthetic rows of an On-Demand Table page: State (Dropdown), Assignee (Text), Sites (Multi-select), Due (Date as shown).
const rows = [
  { id: 'r1', State: 'Active', Assignee: 'Rita Gomez', Sites: ['Berlin', 'Leeds'], Due: '2026-11-10' },
  { id: 'r2', State: 'New', Assignee: 'Omar Haddad', Sites: ['Leeds'], Due: '2026-12-01' },
  { id: 'r3', State: 'Active', Assignee: '', Sites: [], Due: '' },
  { id: 'r4', State: '', Assignee: 'Rita Gomez', Sites: ['Lyon'], Due: '2026-11-10' },
  { id: 'r5', State: 'Active', Assignee: 'Omar Haddad', Sites: ['Berlin'], Due: '2026-11-03' },
  { id: 'r6', State: 'Closed', Assignee: 'Rita Gomez', Sites: ['Lyon', 'Berlin'], Due: '2026-10-20' },
]
const valueOf = (row, id) => row[id]
const shape = (groups) => groups.map((group) => [group.value, group.rows.map((row) => row.id), shape(group.children)])

test('UI-25: Group by nests up to four columns, outermost first, values in natural order with (blank) last and a count each (TC-UI-21)', () => {
  const tree = groupTree(rows, ['State', 'Assignee'], valueOf)
  assert.deepEqual(shape(tree), [
    ['Active', ['r1', 'r3', 'r5'], [['Omar Haddad', ['r5'], []], ['Rita Gomez', ['r1'], []], ['', ['r3'], []]]],
    ['Closed', ['r6'], [['Rita Gomez', ['r6'], []]]],
    ['New', ['r2'], [['Omar Haddad', ['r2'], []]]],
    ['', ['r4'], [['Rita Gomez', ['r4'], []]]],
  ], 'State, then Assignee; the empty State and the empty Assignee come last')
  assert.equal(tree[0].depth, 0)
  assert.equal(tree[0].children[0].depth, 1)
  assert.equal(tree[0].children[0].columnId, 'Assignee')
  // Each group's key is its path, unique across levels: two "Rita Gomez" groups under different States stay apart.
  const keys = groupKeys(tree)
  assert.equal(new Set(keys).size, keys.length)
  assert.equal(keys.length, 4 + 6)
  assert.deepEqual(['10', '2', '', 'b', 'A'].sort(compareGroupValues), ['2', '10', 'A', 'b', ''], 'natural order, any case, blank last')
  // The rows keep the table's order inside each group (sort within groups).
  const reversed = groupTree([...rows].reverse(), ['State'], valueOf)
  assert.deepEqual(reversed[0].rows.map((row) => row.id), ['r5', 'r3', 'r1'])
  assert.deepEqual(groupTree(rows, [], valueOf), [], 'no columns: no groups')
})

test('UI-25: a Multi-select row is in the group of each of its values; the counts of a level can add up to more than the rows (TC-UI-21)', () => {
  const tree = groupTree(rows, ['Sites'], valueOf)
  assert.deepEqual(tree.map((group) => [group.value, group.rows.length]), [['Berlin', 3], ['Leeds', 2], ['Lyon', 2], ['', 1]])
  assert.equal(tree.reduce((sum, group) => sum + group.rows.length, 0), 8, '6 rows, 8 places')
  // A value repeated in one cell counts once; Export and Previous / Next list every row once, where it first appears.
  assert.deepEqual(groupTree([{ id: 'x', Sites: ['Lyon', 'Lyon'] }], ['Sites'], valueOf)[0].rows.length, 1)
  assert.deepEqual(groupedOrder(tree).map((row) => row.id), ['r1', 'r5', 'r6', 'r2', 'r4', 'r3'])
  assert.deepEqual(groupedOrder(groupTree(rows, ['State', 'Assignee'], valueOf)).map((row) => row.id), ['r5', 'r1', 'r3', 'r6', 'r2', 'r4'], 'in the order of the groups')
  assert.deepEqual(shownValues(['  Berlin ', '', 'Leeds']), ['Berlin', 'Leeds'])
  assert.deepEqual(shownValues(undefined), [])
})

test('UI-27: groups open and close one by one; Expand all / Collapse all, each only when there is something to do; Collapse all leaves the outermost rows (TC-UI-23)', () => {
  const tree = groupTree(rows, ['State', 'Assignee'], valueOf)
  const keys = groupKeys(tree)
  const open = { closed: false, flipped: [] }
  const lines = (state, limit) => groupLines(tree, (key) => isGroupOpen(state, key), limit).map((line) => line.kind === 'group' ? `${'  '.repeat(line.group.depth)}${line.open ? '▾' : '▸'} ${line.group.value || '(blank)'} ${line.group.rows.length}` : `${line.row.id}`)
  assert.equal(lines(open).length, 10 + 6, 'all open: every group row and every row')
  assert.equal(canExpandAll(open, keys), false, 'Expand all: nothing to do')
  assert.equal(canCollapseAll(open, keys), true)
  const closed = { closed: true, flipped: [] }
  assert.deepEqual(lines(closed), ['▸ Active 3', '▸ Closed 1', '▸ New 1', '▸ (blank) 1'], 'Collapse all / Start collapsed: only the outermost groups')
  assert.equal(canCollapseAll(closed, keys), false, 'Collapse all: nothing to do')
  assert.equal(canExpandAll(closed, keys), true)
  // Opening "Active" shows its sub-groups, still closed; opening one of them shows its rows.
  const active = toggleGroup(closed, tree[0].key)
  assert.deepEqual(lines(active).slice(0, 5), ['▾ Active 3', '  ▸ Omar Haddad 1', '  ▸ Rita Gomez 1', '  ▸ (blank) 1', '▸ Closed 1'])
  const rita = toggleGroup(active, tree[0].children[1].key)
  assert.deepEqual(lines(rita).slice(0, 4), ['▾ Active 3', '  ▸ Omar Haddad 1', '  ▾ Rita Gomez 1', 'r1'])
  assert.equal(canCollapseAll(rita, keys) && canExpandAll(rita, keys), true, 'some open, some closed: both')
  assert.deepEqual(toggleGroup(rita, tree[0].children[1].key), active, 'a second click closes it again')
  // "Show more": at most `limit` rows in all, group rows not counted.
  assert.deepEqual(lines(open, 2), ['▾ Active 3', '  ▾ Omar Haddad 1', 'r5', '  ▾ Rita Gomez 1', 'r1'])
})

test('UI-26: Filter by column keeps rows whose value as shown contains the text in any case; a pick-list value matches exactly; filters add up (TC-UI-22)', () => {
  assert.equal(matchesColumnFilter(['Rita Gomez'], 'gom'), true, 'contains, any case (UI-26)')
  assert.equal(matchesColumnFilter(['Rita Gomez'], '  '), true, 'an empty filter keeps everything')
  assert.equal(matchesColumnFilter([], 'x'), false, 'an empty cell does not contain text')
  assert.equal(matchesColumnFilter(['Reopened'], 'open', ['Open', 'Reopened']), false, 'a pick-list value: exactly (any case)')
  assert.equal(matchesColumnFilter(['Open'], 'OPEN', ['Open', 'Reopened']), true)
  assert.equal(matchesColumnFilter(['Reopened'], 'reop', ['Open', 'Reopened']), true, 'text that is not a value of the list: contains')
  assert.equal(matchesColumnFilter(['Berlin', 'Leeds'], 'Leeds', ['Berlin', 'Leeds', 'Lyon']), true, 'a Multi-select: any of its values')
  const ids = (list) => list.map((row) => row.id)
  assert.deepEqual(ids(filterTableRows(rows, { Assignee: 'rita' }, valueOf)), ['r1', 'r4', 'r6'])
  assert.deepEqual(ids(filterTableRows(rows, { Assignee: 'rita', Sites: 'Berlin' }, valueOf, (id) => id === 'Sites' ? ['Berlin', 'Leeds', 'Lyon'] : undefined)), ['r1', 'r6'], 'both filters')
  assert.deepEqual(ids(filterTableRows(rows, { Due: '2026-11' }, valueOf)), ['r1', 'r4', 'r5'], 'a date as shown')
  assert.equal(filterTableRows(rows, {}, valueOf), rows, 'no filter: the same rows')
  assert.equal(filterTableRows(rows, { State: ' ' }, valueOf), rows, 'a blank filter is no filter')
  // With grouping: the groups and their counts are those of the filtered rows.
  const grouped = groupTree(filterTableRows(rows, { Assignee: 'rita' }, valueOf), ['State'], valueOf)
  assert.deepEqual(grouped.map((group) => [group.value, group.rows.length]), [['Active', 1], ['Closed', 1], ['', 1]])
})

const memory = (entries = {}) => { const map = new Map(Object.entries(entries)); return { map, getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key) } }
const everyone = { order: ['State', 'Assignee'], groupBy: ['State', 'Assignee'], filters: { Sites: 'Berlin' }, startCollapsed: true }

test('UI-28: grouping, column filters and Start collapsed in the view: for everyone, my own wins, Reset, Start collapsed only for everyone (TC-UI-24)', () => {
  assert.deepEqual(parseTableView({ ...everyone, sort: { id: 'Due', desc: true } }), { ...everyone, sort: { id: 'Due', desc: true } }, 'kept as saved')
  assert.deepEqual(chooseTableView(undefined, everyone), { view: everyone, source: 'everyone' }, 'first time: the view for everyone, collapsed')
  // My first change starts my own view from it; "Start collapsed" is not copied (it stays the view for everyone's).
  const mine = startOwnView(everyone, '2026-11-25T09:00:00.000Z', { filters: { Sites: 'Lyon' } })
  assert.deepEqual(mine, { order: ['State', 'Assignee'], groupBy: ['State', 'Assignee'], filters: { Sites: 'Lyon' }, base: '2026-11-25T09:00:00.000Z' })
  const chosen = chooseTableView(mine, everyone)
  assert.equal(chosen.source, 'own')
  assert.deepEqual(chosen.view.filters, { Sites: 'Lyon' }, 'my own filter wins')
  assert.equal(chosen.view.startCollapsed, true, 'the groups still start as the view for everyone says')
  assert.equal(chooseTableView({ ...mine, startCollapsed: true }, { ...everyone, startCollapsed: undefined }).view.startCollapsed, undefined, 'an own view cannot make it start collapsed')
  // My own "no grouping" and "no filters" win too (kept as [] and {}).
  const none = parseTableView({ groupBy: [], filters: {} })
  assert.deepEqual(none, { groupBy: [], filters: {} })
  assert.deepEqual(chooseTableView(none, everyone).view.groupBy, [])
  assert.deepEqual(chooseTableView(none, everyone).view.filters, {})
  // Reset: no own view any more → the view for everyone again.
  const storage = memory()
  writeOwnView('on-demand:conq', mine, storage)
  assert.deepEqual(readOwnView('on-demand:conq', storage).filters, { Sites: 'Lyon' }, 'kept in this browser')
  writeOwnView('on-demand:conq', undefined, storage)
  assert.equal(readOwnView('on-demand:conq', storage), undefined)
  assert.deepEqual(chooseTableView(readOwnView('on-demand:conq', storage), everyone).view, everyone)
  assert.equal(shareableView({ ...everyone, base: 'x' }).base, undefined)
})

test('UI-28: older views without grouping or filters keep working and take them from the view for everyone; removed columns are ignored (TC-UI-24)', () => {
  // A view saved before v10.38: no groupBy, filters or startCollapsed.
  const old = { order: ['Assignee', 'State'], hidden: ['Due'], widths: { State: 180 }, wrap: true, density: 'compact', sort: { id: 'State', desc: false } }
  assert.deepEqual(parseTableView(old), old, 'read as before')
  assert.deepEqual(chooseTableView(undefined, old), { view: old, source: 'everyone' })
  assert.deepEqual(chooseTableView(old, undefined), { view: old, source: 'own' }, 'an old own view, nothing for everyone: unchanged')
  const merged = chooseTableView(old, everyone).view
  assert.deepEqual(merged.order, old.order, 'my own columns stay mine')
  assert.deepEqual(merged.groupBy, everyone.groupBy, 'the grouping of the view for everyone')
  assert.deepEqual(merged.filters, everyone.filters, 'and its filters')
  assert.equal(merged.startCollapsed, true)
  // Bad shapes from Git or the browser are dropped; at most four levels; filters must be text.
  assert.deepEqual(parseTableView({ groupBy: ['a', 'b', 'c', 'd', 'e', 'a', 7], filters: { a: 'x', b: 3, c: '  ', '': 'y' }, startCollapsed: 'yes' }), { groupBy: ['a', 'b', 'c', 'd'], filters: { a: 'x' } })
  assert.equal(parseTableView({ filters: { a: 'x'.repeat(500) } }).filters.a.length, 200, 'a filter is at most 200 characters')
  assert.equal(parseTableView({ groupBy: 'State' }), undefined, 'not a list: nothing')
  // UI-22: a grouped or filtered column that was removed is ignored.
  const fitted = fitTableView({ ...everyone, groupBy: ['Gone', 'State'], filters: { Gone: 'x', Sites: 'Berlin' } }, ['State', 'Assignee', 'Sites'])
  assert.deepEqual(fitted.groupBy, ['State'])
  assert.deepEqual(fitted.filters, { Sites: 'Berlin' })
  assert.equal(fitted.startCollapsed, true)
})

test('UI-29: Export, “Select every row shown” and Previous / Next take only the rows visible — rows in closed groups left out until opened (TC-UI-25)', () => {
  const tree = groupTree(rows, ['State', 'Assignee'], valueOf)
  const ids = (list) => list.map((row) => row.id)
  const visible = (state) => ids(visibleRows(tree, (key) => isGroupOpen(state, key)))
  const open = { closed: false, flipped: [] }, closed = { closed: true, flipped: [] }
  assert.deepEqual(visible(open), ids(groupedOrder(tree)), 'all open: every row, in the order of the groups')
  assert.deepEqual(visible(closed), [], 'Collapse all / Start collapsed: no row visible')
  // State: Active opened, its sub-groups still closed: still nothing; Rita Gomez opened under it: her row.
  const active = toggleGroup(closed, tree[0].key)
  assert.deepEqual(visible(active), [])
  const rita = toggleGroup(active, tree[0].children[1].key)
  assert.deepEqual(visible(rita), ['r1'])
  // A sub-group open under a closed parent stays hidden.
  assert.deepEqual(visible(toggleGroup(rita, tree[0].key)), [], 'the parent closed again hides it')
  // One group closed among open ones: its rows only are left out (6 rows, State: Active's 3 closed → 3).
  assert.deepEqual(visible(toggleGroup(open, tree[0].key)), ['r6', 'r2', 'r4'])
  // A Multi-select row is visible while any of its groups is open, once, where it first shows.
  const sites = groupTree(rows, ['Sites'], valueOf)
  const berlinClosed = toggleGroup(open, sites[0].key)
  assert.deepEqual(ids(visibleRows(sites, (key) => isGroupOpen(berlinClosed, key))), ['r1', 'r2', 'r4', 'r6', 'r3'], 'Berlin closed: r1 still under Leeds, r6 under Lyon; r5 (Berlin only) left out')
})
