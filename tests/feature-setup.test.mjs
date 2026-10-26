import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseSetup, emptySetup, personalSetupPath, publishSetup } from '../src/featureSetup.ts'

const file = (...epics) => ({ schema: 1, kind: 'feature-setup', epics })
const withStory = (epicId, title) => ({ ...emptySetup(epicId, `Epic ${epicId}`), stories: [{ title, description: '' }] })

test('personal setup path: one file per email, lower case, unsafe characters replaced; none without an email', () => {
  assert.equal(personalSetupPath('Ana.Costa@Example.com'), 'feature-setup/ana.costa@example.com.json')
  assert.equal(personalSetupPath(' ana+qa@x.org '), 'feature-setup/ana+qa@x.org.json')
  assert.equal(personalSetupPath('o\'neil@x.org'), 'feature-setup/o_neil@x.org.json')
  assert.equal(personalSetupPath(''), '')
  assert.equal(personalSetupPath('not an email'), '')
  assert.equal(personalSetupPath('../../etc@x.org'), 'feature-setup/____etc@x.org.json', 'no path traversal: slashes and runs of dots are replaced')
})

test('my own setup of an Epic wins for me; the shared one otherwise; preferShared switches when both exist', () => {
  const setups = { shared: file(withStory(1, 'Shared SFV'), withStory(2, 'Shared only')), personal: file(withStory(1, 'My SFV'), withStory(3, 'Mine only')) }
  assert.deepEqual([chooseSetup(setups, 1).source, chooseSetup(setups, 1).setup.stories[0].title], ['personal', 'My SFV'])
  assert.deepEqual([chooseSetup(setups, 1, true).source, chooseSetup(setups, 1, true).setup.stories[0].title], ['shared', 'Shared SFV'])
  assert.equal(chooseSetup(setups, 2).source, 'shared')
  assert.equal(chooseSetup(setups, 3, true).source, 'personal', 'no shared one: mine stays even when preferring shared')
  assert.deepEqual(chooseSetup(setups, 4), {}, 'neither: built-in PU / Full Release milestones')
  assert.deepEqual(chooseSetup(null, 1), {})
})

test('enable for everyone replaces only that Epic in the shared setup, as a copy', () => {
  const mine = withStory(1, 'My SFV')
  const shared = publishSetup(file(withStory(2, 'Other'), withStory(1, 'Old')), mine)
  assert.deepEqual(shared.epics.map((entry) => [entry.epicId, entry.stories[0].title]), [[1, 'My SFV'], [2, 'Other']])
  mine.stories[0].title = 'changed later'
  assert.equal(shared.epics[0].stories[0].title, 'My SFV', 'later edits to my setup do not change the shared one')
  assert.deepEqual(publishSetup(null, withStory(5, 'First')).epics.map((entry) => entry.epicId), [5])
})

test('built-in stories as a setup give exactly the titles of the built-in creation', async () => {
  const { builtinSetup, fillTitle, titleValues } = await import('../src/featureSetup.ts')
  const { releaseHierarchyTitles } = await import('../src/azureDevOps.ts')
  for (const kind of ['PU', 'Release']) {
    const setup = builtinSetup(13946, 'My Epic', kind)
    const values = titleValues('DP | RSGMS | v3.0.0.2', 'October 2026')
    const built = releaseHierarchyTitles('DP | RSGMS | v3.0.0.2', kind, 'October 2026')
    assert.deepEqual(setup.stories.map((story) => fillTitle(story.title, values)), built.reviews.map((review) => review.title))
    assert.equal(fillTitle(setup.timeWritingStory.title, values), built.timeWriting)
    assert.equal(fillTitle(setup.task.title, values), built.task)
    assert.equal(setup.epicId, 13946)
  }
  assert.equal(builtinSetup(1, '', 'Release').stories.length, 4, 'Full Release: PRD, SFV, DT, IQOQ')
})

test('copy a setup to another Epic: replaces the target, keeps the source, no-op without a source', async () => {
  const { copySetup } = await import('../src/featureSetup.ts')
  const source = file(withStory(5, 'Mine'), withStory(13946, 'Old'))
  const copied = copySetup(source, 5, 13946, 'Target Epic')
  assert.deepEqual(copied.epics.map((entry) => [entry.epicId, entry.stories[0].title, entry.epicTitle]), [[5, 'Mine', 'Epic 5'], [13946, 'Mine', 'Target Epic']])
  copied.epics[1].stories[0].title = 'edited'
  assert.equal(source.epics[0].stories[0].title, 'Mine', 'the copy is independent')
  assert.equal(copySetup(source, 99, 13946), source)
  assert.equal(copySetup(source, 5, 5), source)
})
