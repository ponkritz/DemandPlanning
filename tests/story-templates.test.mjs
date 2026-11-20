import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanStoryTemplate, emptyEpicSetup, newStoryTemplateId, parseEpicSetup, serializeEpicSetup, templatesFor, upsertStoryTemplate } from '../src/epicSetup.ts'
import { cleanSetup, parseFeatureSetup, serializeFeatureSetup, templateUses, withLinkedStories } from '../src/featureSetup.ts'

const template = (id, title, extra = {}) => ({ id, title, description: `${title} details`, epics: [], classes: [], ...extra })

test('STT-01: a User Story template is cleaned and kept with the Epic setup (TC-STT-01)', () => {
  assert.deepEqual(cleanStoryTemplate({ id: 't-sfv', title: ' SFV review ', description: ' Check it ', epics: [5, '5', 0, 'x', 7], classes: [' Major ', 'major', '', 'Hotfix'] }), { id: 't-sfv', title: 'SFV review', description: 'Check it', epics: [5, 7], classes: ['Major', 'Hotfix'] })
  assert.equal(cleanStoryTemplate({ id: 'T SFV', title: 'x' }), null, 'an id must be lower-case letters, digits and hyphens')
  assert.equal(cleanStoryTemplate({ id: 't-1', title: '  ' }), null, 'a title is required')
  const file = upsertStoryTemplate(upsertStoryTemplate(emptyEpicSetup(), template('t-b', 'B story')), template('t-a', 'A story', { epics: [9] }))
  const saved = parseEpicSetup(serializeEpicSetup(file))
  assert.deepEqual(saved.storyTemplates.map((item) => item.id), ['t-a', 't-b'], 'sorted by title, kept through Save and Load')
  assert.equal(parseEpicSetup(serializeEpicSetup(emptyEpicSetup())).storyTemplates, undefined, 'no templates: nothing written')
  assert.equal(newStoryTemplateId(saved, 'A story!'), 't-a-story'); assert.equal(newStoryTemplateId({ ...saved, storyTemplates: [template('t-a-story', 'x')] }, 'A story'), 't-a-story-2')
})

test('STT-01: the templates offered follow their Epic and Release Classification tags (TC-STT-01)', () => {
  const file = { ...emptyEpicSetup(), storyTemplates: [template('t-any', 'Any'), template('t-epic', 'Epic 5', { epics: [5] }), template('t-hot', 'Hotfix', { classes: ['Hotfix'] }), template('t-both', 'Epic 5 Hotfix', { epics: [5], classes: ['hotfix'] }), template('t-other', 'Epic 6', { epics: [6] })] }
  assert.deepEqual(templatesFor(file, 5).map((item) => item.id), ['t-any', 't-epic'], 'the Epic default: templates without value tags')
  assert.deepEqual(templatesFor(file, 5, 'HOTFIX').map((item) => item.id), ['t-any', 't-epic', 't-hot', 't-both'], 'a value: also its tagged ones, any case')
  assert.deepEqual(templatesFor(file, 6, 'Major').map((item) => item.id), ['t-any', 't-other'])
})

test('STT-02: a linked story takes the template’s current title and description everywhere; a removed one keeps its copy (TC-STT-02)', () => {
  const setup = cleanSetup({ epicId: 5, featureDoD: 'x', stories: [{ title: 'Old', description: 'old', templateId: 't-sfv' }, { title: 'Own', description: '' }, { title: 'Gone', description: 'copy', templateId: 't-gone' }, { title: 'Bad', templateId: 'Bad Id' }],
    classSets: { Hotfix: { featureDoD: '', stories: [{ title: 'Old', templateId: 't-sfv' }] } }, releaseTypes: { release: { featureDoD: 'R', stories: [{ title: 'Old', templateId: 't-sfv' }] }, pu: { featureDoD: 'P', stories: [] } } })
  assert.deepEqual(setup.stories.map((story) => story.templateId), ['t-sfv', undefined, 't-gone', undefined], 'a malformed link is dropped')
  const linked = withLinkedStories(setup, [template('t-sfv', 'SFV : Review ({service})')])
  assert.deepEqual(linked.stories.map((story) => [story.title, story.description]), [['SFV : Review ({service})', 'SFV : Review ({service}) details'], ['Own', ''], ['Gone', 'copy'], ['Bad', '']])
  assert.equal(linked.classSets.Hotfix.stories[0].title, 'SFV : Review ({service})'); assert.equal(linked.releaseTypes.release.stories[0].title, 'SFV : Review ({service})')
  assert.equal(setup.stories[0].title, 'Old', 'the saved setup is not changed')
  assert.equal(withLinkedStories(setup, []), setup); assert.equal(withLinkedStories(undefined, [template('t', 'x')]), undefined)
  const file = { schema: 1, kind: 'feature-setup', defaults: { stories: [{ title: 'D', description: '', templateId: 't-sfv' }] }, epics: [setup] }
  assert.equal(parseFeatureSetup(serializeFeatureSetup(file)).epics[0].stories[0].templateId, 't-sfv', 'the link is saved')
  assert.equal(templateUses(parseFeatureSetup(serializeFeatureSetup(file)), 't-sfv'), 4, 'Epic stories, a value set, an old Release set and All Epics')
})
