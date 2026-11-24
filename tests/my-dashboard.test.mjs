import test from 'node:test'
import assert from 'node:assert/strict'
import { arrangeMyItems, emptyMyDashboard, maxMyBlocks, myBlankBlock, myDashboardKey, myDashboardOut, mySections, parseMyDashboard, withBlock, withoutBlock } from '../src/myDashboard.ts'
import { fieldsDataset, capacityFields, capacitySource, releaseFields, releasesSource, azureWorkFields, azureWorkSource } from '../src/dashboardSources.ts'
import { emptyViews, parseViews, serializeViews, withDefaults } from '../src/personalViews.ts'

// MYD-14, MYD-23: My dashboard's personal layout — the built-in sections as default blocks, blocks of my own over the
// registry's sources, kept as my own personal views entry; Reset gives the default back.
const capacity = fieldsDataset(capacitySource, 'Capacity and utilization', 'as in Team overview', 'n', capacityFields, [])
const releases = fieldsDataset(releasesSource, 'Releases per stream', 'as in Pulse Check', 'n', releaseFields, [])
const work = fieldsDataset(azureWorkSource, 'Azure DevOps work', 'k', 'n', azureWorkFields, [])
const bar = { ...myBlankBlock(work, 'b1', 'bar'), title: 'Work by state', category: 'aw-state' }
const line = { ...myBlankBlock(capacity, 'b2', 'line'), title: 'Utilization', measure: 'average', value: 'cp-util' }

test('MYD-14: the default My dashboard is the built-in sections in their order; blocks of my own come after them, moved and hidden like sections (TC-MYD-09)', () => {
  assert.deepEqual(mySections.map((section) => section.id), ['hours', 'work', 'streams', 'releasecounts', 'signed'])
  const none = arrangeMyItems(emptyMyDashboard(), undefined)
  assert.deepEqual(none.shown, ['hours', 'work', 'streams', 'releasecounts', 'signed'], 'the default looks as before')
  const mine = withBlock(withBlock(emptyMyDashboard(), bar), line)
  assert.deepEqual(arrangeMyItems(mine, undefined).order, ['hours', 'work', 'streams', 'releasecounts', 'signed', 'b1', 'b2'])
  // An earlier Customize (MYD-06) keeps its order; the blocks follow their neighbours.
  assert.deepEqual(arrangeMyItems(mine, { order: ['streams', 'hours', 'b2', 'work', 'releasecounts', 'signed'], hidden: ['work'] }).shown, ['streams', 'hours', 'b2', 'releasecounts', 'signed', 'b1'])
  // Removing a block takes it out of the order; a section is only hidden.
  const removed = withoutBlock(mine, { order: ['b1', 'hours', 'work', 'streams', 'releasecounts', 'signed', 'b2'], hidden: ['b1'] }, 'b1')
  assert.deepEqual([removed.dashboard.blocks.map((block) => block.id), removed.layout.order, removed.layout.hidden], [['b2'], ['hours', 'work', 'streams', 'releasecounts', 'signed', 'b2'], []])
  // New blocks take each source's natural measure and period.
  assert.deepEqual([myBlankBlock(capacity, 'x', 'kpi').measure, myBlankBlock(capacity, 'x', 'kpi').value, myBlankBlock(capacity, 'x', 'kpi').period], ['sum', 'cp-available', 'cp-month'])
  assert.deepEqual([myBlankBlock(releases, 'y', 'kpi').measure, myBlankBlock(releases, 'y', 'kpi').period], ['count', 'rl-month'])
  assert.deepEqual([myBlankBlock(work, 'z', 'bar').period, myBlankBlock(work, 'z', 'bar').category], ['', 'aw-state'], 'the Azure work by State, not filtered by the period unless chosen')
  // At most 20 blocks of my own.
  let full = emptyMyDashboard()
  for (let at = 0; at < maxMyBlocks; at++) full = withBlock(full, { ...bar, id: `b${at + 10}` })
  assert.throws(() => withBlock(full, { ...bar, id: 'one-more' }), /at most 20 blocks/)
})

test('MYD-23: the layout is kept as my own personal views entry, validated when read; unknown sources dropped; the shared defaults never carry it (TC-MYD-09)', () => {
  const mine = { ...withBlock(withBlock(emptyMyDashboard(), bar), line), sizes: { hours: { w: 6, h: 4 } } }
  const out = myDashboardOut(mine)
  const views = parseViews(serializeViews({ ...emptyViews(), sections: { mydash: { order: ['b2', 'hours'], hidden: [] } }, filters: { [myDashboardKey]: out } }))
  const read = parseMyDashboard(views.filters[myDashboardKey])
  assert.deepEqual(read.dropped, [])
  assert.deepEqual(read.dashboard.blocks.map((block) => [block.id, block.title, block.source]), [['b1', 'Work by state', azureWorkSource], ['b2', 'Utilization', capacitySource]])
  assert.deepEqual(read.dashboard.sizes, { hours: { w: 6, h: 4 } })
  // Planted entries: an unknown source, a section's id as a block, a size for something else, a bad size.
  const planted = parseMyDashboard({ blocks: [...out.blocks, { ...bar, id: 'b3', source: 'secret:all' }, { ...bar, id: 'hours' }], sizes: { b1: { w: 3, h: 3 }, signed: { w: 99, h: 1 }, work: 'big' } })
  assert.deepEqual(planted.dashboard.blocks.map((block) => block.id), ['b1', 'b2'])
  assert.match(planted.dropped.join(' '), /no known data source/)
  assert.deepEqual(planted.dashboard.sizes, { signed: { w: 12, h: 4 } }, 'clamped to the grid; sections only')
  assert.deepEqual(parseMyDashboard('nonsense').dashboard, emptyMyDashboard())
  assert.deepEqual(parseMyDashboard(undefined).dashboard, emptyMyDashboard(), 'Reset: no entry is the default My dashboard')
  // Too large for a personal views entry (20,000 characters): refused with the reason.
  assert.throws(() => myDashboardOut({ ...mine, blocks: Array.from({ length: 19 }, (_, at) => ({ ...line, id: `n${at}`, narrative: { sentences: [], rules: Array.from({ length: 8 }, () => ({ when: 'x'.repeat(100) })) } })) }), /too large/)
  // Use as default for everyone writes sections and menu only (MYD-09): my blocks never reach the defaults, and my
  // own entry wins over any default of the same key.
  const defaults = { ...emptyViews(), filters: { [myDashboardKey]: { blocks: [{ ...bar, id: 'planted', title: 'Planted' }] } } }
  assert.equal(withDefaults(views, defaults).filters[myDashboardKey], views.filters[myDashboardKey])
})
