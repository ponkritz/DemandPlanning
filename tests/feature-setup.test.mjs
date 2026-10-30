import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseSetup, emptySetup, personalSetupPath, publishSetup, removeSetup, editSetup, sharedSetupRows, setupsMissingDoD, builtinSetup, parseFeatureSetup, serializeFeatureSetup, featureDoD, defaultDoDFor, fillMissingDoD, cleanTitleFields, fieldKey, fieldLines, fieldTitle, fieldsFromItems, fieldsFromTitle, fieldPlaceholders, fillTitle, missingValues, titleValues, setupFor } from '../src/featureSetup.ts'

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
    assert.equal(built.review, 'Review of Deliverables - DP | RSGMS | v3.0.0.2', 'the built-in review story is not part of the editable setup')
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

test('all shared setups: by Epic number, with stories, Time Writing story, Task and whether mine replaces it', () => {
  const later = { ...emptySetup(37810, 'Later'), stories: [{ title: 'SFV : Review', description: '' }, { title: 'DT', description: '' }], task: { ...emptySetup(1).task, title: '{month} | {feature}', originalEstimate: 4 } }
  const earlier = emptySetup(13946, 'Earlier')
  const rows = sharedSetupRows({ shared: file(later, earlier), personal: file(emptySetup(37810)) })
  assert.deepEqual(rows.map((row) => row.epicId), [13946, 37810])
  assert.deepEqual(rows[1], { epicId: 37810, epicTitle: 'Later', featureDoD: '', stories: ['SFV : Review', 'DT'], timeWritingStory: '{feature} - Time Writing', storyAreaPath: '', storyIterationPath: '', task: '{month} | {feature}', originalEstimate: 4, mineInstead: true })
  assert.equal(rows[0].mineInstead, false)
  assert.equal('originalEstimate' in rows[0], false)
  assert.deepEqual(sharedSetupRows({ shared: null, personal: null }), [])
  assert.deepEqual(sharedSetupRows(null), [])
})

test('editing in the list: change one Epic in a copy, remove one, leave Epics without a setup alone', () => {
  const shared = file({ ...emptySetup(13946, 'A'), stories: [{ title: 'SFV', description: 'keep' }] }, emptySetup(37810, 'B'))
  const edited = editSetup(shared, 13946, (entry) => { entry.stories[0].title = 'SFV : Review'; entry.stories.push({ title: 'DT', description: '' }); entry.task.originalEstimate = 6 })
  assert.deepEqual(edited.epics[0].stories, [{ title: 'SFV : Review', description: 'keep' }, { title: 'DT', description: '' }])
  assert.equal(edited.epics[0].task.originalEstimate, 6)
  assert.equal(shared.epics[0].stories[0].title, 'SFV', 'the original is unchanged')
  assert.equal(editSetup(shared, 99, () => { throw new Error('not called') }), shared)
  const legacy = file({ ...emptySetup(5), timeWritingStory: undefined })
  assert.equal(editSetup(legacy, 5, (entry) => { entry.timeWritingStory.title = 'TW' }).epics[0].timeWritingStory.title, 'TW', 'an entry without a Time Writing story gets the default to edit')
  assert.deepEqual(removeSetup(shared, 13946).epics.map((entry) => entry.epicId), [37810])
  assert.equal(shared.epics.length, 2)
})

test('Feature DoD in a setup: kept through save, built-in defaults, and required for new or changed setups', () => {
  const withDoD = { ...emptySetup(13946, 'A'), featureDoD: ' IQOQ finished ' }
  assert.equal(parseFeatureSetup(serializeFeatureSetup(file(withDoD))).epics[0].featureDoD, 'IQOQ finished')
  assert.equal(parseFeatureSetup(JSON.stringify(file({ epicId: 5, stories: [], task: {} }))).epics[0].featureDoD, '', 'older files read without one')
  assert.equal(builtinSetup(1, '', 'PU').featureDoD, featureDoD('PU'))
  assert.equal(builtinSetup(1, '', 'Release').featureDoD, 'IQOQ finished and Checklist uploaded into the Feature.')
  const legacy = emptySetup(37810, 'Old')
  const saved = file(legacy, withDoD)
  assert.deepEqual(setupsMissingDoD(saved, saved), [], 'unchanged older setups without a DoD do not block saving')
  assert.deepEqual(setupsMissingDoD(file(legacy, withDoD, emptySetup(99)), saved), [99], 'a new setup needs one')
  assert.deepEqual(setupsMissingDoD(file({ ...legacy, stories: [{ title: 'X', description: '' }] }, withDoD), saved), [37810], 'so does a changed one')
  assert.deepEqual(setupsMissingDoD(file({ ...legacy, featureDoD: 'Done' }, withDoD), saved), [])
})

test('default Feature DoD for setups without one: Full Release with a PRD story, else PU; only missing ones are filled', () => {
  const release = { ...emptySetup(1), stories: [{ title: 'PRD : Review of Deliverables ({service} {version})', description: '' }] }
  const pu = { ...emptySetup(2), stories: [{ title: 'SFV : Review', description: '' }] }
  const done = { ...emptySetup(3), featureDoD: 'Own DoD' }
  assert.equal(defaultDoDFor(release), featureDoD('Release'))
  assert.equal(defaultDoDFor(pu), featureDoD('PU'))
  assert.equal(defaultDoDFor(emptySetup(4)), featureDoD('PU'))
  const source = file(release, pu, done)
  const { file: filled, filled: ids } = fillMissingDoD(source)
  assert.deepEqual(ids, [1, 2])
  assert.deepEqual(filled.epics.map((entry) => entry.featureDoD), [featureDoD('Release'), featureDoD('PU'), 'Own DoD'])
  assert.equal(source.epics[0].featureDoD, '', 'the original is unchanged')
  assert.equal(fillMissingDoD(filled).file, filled, 'nothing missing: the same file')
})

test('title fields per Epic: up to five, unique names, saved with the setup; title, Description lines, placeholders and on-prem values', () => {
  const cp = [{ label: 'Platform', source: 'Custom.Platform' }, { label: 'Release Name', source: 'ReleaseName' }, { label: 'Number', source: '' }]
  assert.deepEqual(cleanTitleFields([...cp, { label: ' platform ', source: '' }, { label: '', source: 'X' }, { label: 'Month', source: '' }, { label: 'A', source: '' }, { label: 'B', source: '' }, { label: 'C', source: '' }]).map((field) => field.label), ['Platform', 'Release Name', 'Number', 'A', 'B'], 'at most five; blank, repeated and built-in names dropped')
  const saved = parseFeatureSetup(serializeFeatureSetup(file({ ...emptySetup(7, 'CP'), featureDoD: 'DT finished', titleFields: cp })))
  assert.deepEqual(setupFor(saved, 7).titleFields, cp, 'kept through save')
  assert.equal(setupFor(parseFeatureSetup(serializeFeatureSetup(file({ ...emptySetup(8), featureDoD: 'x' }))), 8).titleFields, undefined, 'a setup without fields is written as before')
  assert.equal(fieldKey('Release Name'), 'releasename')
  assert.equal(fieldTitle(['CP 2', ' Atlas ', '4.1']), 'CP 2 | Atlas | 4.1')
  assert.equal(fieldTitle(['CP 2', '', '4.1']), 'CP 2 | 4.1', 'a blank field is left out of the title')
  assert.deepEqual(fieldLines(cp, ['CP 2', '', '4.1']), ['Platform : CP 2', 'Release Name :', 'Number : 4.1'], 'a blank field is still written')
  const values = { ...titleValues('CP 2 | Atlas | 4.1', 'October 2026', cp) }
  assert.equal(fillTitle('{Platform} - {Release Name} v{number} ({month})', values), 'CP 2 - Atlas v4.1 (October 2026)')
  assert.deepEqual(missingValues('{Release Name}', { ...values, ...fieldPlaceholders(cp, ['CP 2', '', '4.1']) }), ['releasename'])
  assert.equal(fillTitle('{unknown thing} {feature}', values), '{unknown thing} CP 2 | Atlas | 4.1', 'other text in braces is kept')
  assert.deepEqual(fieldsFromTitle(cp, 'CP 2 | Atlas | 4.1'), ['CP 2', 'Atlas', '4.1'])
  assert.deepEqual(fieldsFromTitle(cp, 'CP 2 | Atlas'), ['', '', ''], 'another number of parts fills nothing')
  const items = [{ fields: { 'Custom.Platform': '' } }, { fields: { 'Custom.Platform': 'CP 2', 'Custom.ReleaseName': 'Atlas' } }]
  assert.deepEqual(fieldsFromItems(cp, items), ['CP 2', 'Atlas', ''], 'first item with the field; a bare name finds Custom.ReleaseName; no source stays blank')
})
