import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseSetup, missingDoD, parseFeatureSetup, publishSetup, serializeFeatureSetup, setupsMissingDoD } from '../src/featureSetup.ts'

const entry = (epicId, extra = {}) => ({ epicId, epicTitle: `Epic ${epicId}`, featureDoD: `DoD ${epicId}`, stories: [{ title: `Story ${epicId}`, description: '' }], timeWritingStory: { title: '{feature} - Time Writing', description: '', assignedTo: '', areaPath: '', iterationPath: '' }, task: { title: '{month} | {feature}', description: '', assignedTo: '', areaPath: '', iterationPath: '', originalEstimate: epicId }, ...extra })

test('Feature setup layers: Mine → Epic (shared) → All Epics → Built in, per field (CON-95, TC-CON-59)', () => {
  const shared = parseFeatureSetup(JSON.stringify({ schema: 1, kind: 'feature-setup', defaults: { featureDoD: 'All DoD', stories: [{ title: 'All story' }, { title: '' }], originalEstimate: 4, junk: 1 }, epics: [entry(1, { inherits: ['stories', 'estimate', 'nonsense'] }), entry(2), entry(3, { inherits: ['featureDoD', 'stories', 'estimate'] })] }))
  assert.deepEqual(shared.defaults, { featureDoD: 'All DoD', stories: [{ title: 'All story', description: '' }], originalEstimate: 4 })
  assert.deepEqual(shared.epics[0].inherits, ['stories', 'estimate'])
  const personal = parseFeatureSetup(JSON.stringify({ schema: 1, kind: 'feature-setup', epics: [entry(1, { featureDoD: 'My DoD', inherits: ['stories'] })] }))
  const setups = { shared, personal }
  // Epic 1: DoD mine; stories inherited by mine and by the shared Epic → All Epics; estimate set by mine.
  const one = chooseSetup(setups, 1)
  assert.equal(one.source, 'personal')
  assert.equal(one.setup.featureDoD, 'My DoD')
  assert.deepEqual(one.setup.stories.map((story) => story.title), ['All story'])
  assert.equal(one.setup.task.originalEstimate, 1)
  assert.deepEqual(one.origin, { featureDoD: 'mine', stories: 'all', estimate: 'mine' })
  assert.equal(one.setup.inherits, undefined, 'the resolved setup carries no inherits')
  // The shared view of Epic 1 (preferShared): its own DoD, All Epics' stories and estimate.
  assert.deepEqual(chooseSetup(setups, 1, true).origin, { featureDoD: 'epic', stories: 'all', estimate: 'all' })
  assert.equal(chooseSetup(setups, 1, true).setup.task.originalEstimate, 4)
  // Epic 2 sets everything: unchanged from before.
  assert.deepEqual(chooseSetup(setups, 2).setup, entry(2))
  // Epic 3 inherits everything; without All Epics nothing is set (DPF-09: no built-in DoD, no stories, no estimate).
  const bare = chooseSetup({ shared: { ...shared, defaults: undefined }, personal: null }, 3)
  assert.deepEqual([bare.setup.featureDoD, bare.setup.stories, bare.setup.task.originalEstimate, bare.origin], ['', [], undefined, { featureDoD: 'builtin', stories: 'builtin', estimate: 'builtin' }])
  // CON-97: an Epic without a setup of its own uses All Epics when All Epics has anything set…
  const none = chooseSetup(setups, 99)
  assert.deepEqual([none.source, none.setup.featureDoD, none.setup.stories.map((story) => story.title), none.setup.task.originalEstimate], ['defaults', 'All DoD', ['All story'], 4])
  assert.deepEqual(none.origin, { featureDoD: 'all', stories: 'all', estimate: 'all' })
  // …and keeps the built-in milestones while All Epics is empty.
  assert.deepEqual(chooseSetup({ shared: { ...shared, defaults: undefined }, personal: null }, 99), {})
})

test('Feature setup layers: round trip, DoD rules and Enable for everyone keep the defaults (CON-95, TC-CON-59)', () => {
  const file = { schema: 1, kind: 'feature-setup', defaults: { featureDoD: 'All DoD' }, epics: [entry(3, { featureDoD: '', inherits: ['featureDoD'] })] }
  const parsed = parseFeatureSetup(serializeFeatureSetup(file))
  assert.deepEqual(parseFeatureSetup(serializeFeatureSetup(parsed)), parsed)
  assert.equal(missingDoD(parsed.epics[0]), false, 'an inherited DoD is not missing')
  assert.deepEqual(setupsMissingDoD(parsed, null), [])
  assert.deepEqual(setupsMissingDoD({ ...parsed, epics: [entry(4, { featureDoD: '' })] }, null), [4])
  assert.deepEqual(publishSetup(parsed, entry(5)).defaults, { featureDoD: 'All DoD' })
  assert.equal(parseFeatureSetup(JSON.stringify({ schema: 1, kind: 'feature-setup', defaults: { featureDoD: ' ' }, epics: [] })).defaults, undefined, 'empty defaults are dropped')
})
