import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { choiceKey, cleanMyStoryTemplate, emptyMyStoryTemplates, findChoice, fromTemplate, loadMyStoryTemplates, maxMyStoryTemplates, maxMyTemplatePeople, myStoryTemplatesKey, myTemplatesBlocked, myTemplatesOf, newMyTemplateId, parseMyStoryTemplates, saveMyStoryTemplates, secretIn, serializeMyStoryTemplates, templateChoices, withMyTemplates } from '../src/myStoryTemplates.ts'
import { emptyEpicSetup } from '../src/epicSetup.ts'

const memory = () => { const data = new Map(); return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) } }
const mine = (id, title, extra = {}) => ({ id, title, description: `${title} details`, epics: [], classes: [], ...extra })
const shared = (id, title, extra = {}) => ({ id, title, description: `${title} shared`, epics: [], classes: [], ...extra })
const tia = 'tia.member@example.com', tom = 'tom.owner@example.com'
const pat = 'abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrst'

test('STT-06: my templates are read strictly — schema, people by work email, ids, sizes; anything else gives none (TC-STT-05)', () => {
  for (const raw of [null, '', 'not json', '[]', '{"schema":2,"kind":"my-story-templates","people":{}}', '{"schema":1,"kind":"epic-setup","people":{}}', '{"schema":1,"kind":"my-story-templates","people":[]}']) assert.deepEqual(parseMyStoryTemplates(raw), emptyMyStoryTemplates(), `${raw} → empty`)
  const raw = JSON.stringify({ schema: 1, kind: 'my-story-templates', people: {
    ' TIA.Member@Example.com ': [mine('m-b', ' B story '), mine('m-a', 'A twice'), mine('m-a', 'A story', { epics: [5, '5', -1], classes: ['Major', 'major'] }), mine('t-shared', 'Shared id'), mine('m-x', '  '), { id: 'm-c', title: 'C', description: 'x'.repeat(30000) }],
    'not an email': [mine('m-z', 'Z')], [tom]: 'nope',
  }, extra: 'ignored' })
  const file = parseMyStoryTemplates(raw)
  assert.deepEqual(Object.keys(file.people), [tia], 'keyed by the lower-case work email; invalid owners and lists dropped')
  assert.deepEqual(myTemplatesOf(file, tia).map((item) => [item.id, item.title]), [['m-a', 'A story'], ['m-b', 'B story'], ['m-c', 'C']], 'sorted by title, an id once (the last), personal ids only, a title required')
  assert.deepEqual(myTemplatesOf(file, tia)[0], { id: 'm-a', title: 'A story', description: 'A story details', epics: [5], classes: ['Major'] }, 'the same fields as a shared template, cleaned the same way')
  assert.equal(myTemplatesOf(file, tia)[2].description.length, 20000, 'a description is cut at 20,000 characters')
  assert.deepEqual(myTemplatesOf(file, tom), [], 'another person: none'); assert.deepEqual(myTemplatesOf(file, ''), [], 'no email: none')
  assert.deepEqual(parseMyStoryTemplates(serializeMyStoryTemplates(file)), file, 'serialize and read back give the same file')
  const many = { schema: 1, kind: 'my-story-templates', people: Object.fromEntries(Array.from({ length: 30 }, (_, n) => [`p${n}@example.com`, Array.from({ length: 120 }, (_, m) => mine(`m-${m}`, `T ${m}`))])) }
  const capped = parseMyStoryTemplates(JSON.stringify(many))
  assert.equal(Object.keys(capped.people).length, maxMyTemplatePeople); assert.equal(capped.people['p0@example.com'].length, maxMyStoryTemplates)
})

test('STT-06: text that looks like a PAT or token is never kept or saved (TC-STT-05)', () => {
  assert.equal(secretIn(`token ${pat} here`), 'an Azure DevOps PAT')
  assert.equal(secretIn('ghp_abcdefghijklmnopqrstuvwxyz0123456789'), 'a GitHub token')
  assert.equal(secretIn('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload'), 'a Bearer token')
  assert.equal(secretIn('-----BEGIN RSA PRIVATE KEY-----'), 'a private key')
  assert.equal(secretIn('SFV : Review of Deliverables ({service} {version}) — check the plan'), '', 'ordinary text passes')
  assert.equal(cleanMyStoryTemplate(mine('m-s', 'Story', { description: `use ${pat}` })), null, 'read back: dropped')
  assert.throws(() => withMyTemplates(emptyMyStoryTemplates(), tia, [mine('m-s', 'Story', { description: `PAT ${pat}` })]), /looks like an Azure DevOps PAT\. Never put a PAT or a token in a template\./)
  assert.throws(() => withMyTemplates(emptyMyStoryTemplates(), tia, [mine('m-s', 'Story', { classes: ['ghp_abcdefghijklmnopqrstuvwxyz0123456789'] })]), /GitHub token/)
})

test('STT-05, STT-06: saving my list changes mine only; limits and the owner are checked; stored under the versioned key (TC-STT-05)', () => {
  const storage = memory()
  assert.deepEqual(loadMyStoryTemplates(storage), emptyMyStoryTemplates())
  let file = withMyTemplates(emptyMyStoryTemplates(), tom, [mine('m-tom', 'Tom story')])
  file = withMyTemplates(file, tia, [mine('m-tia', 'Tia story')])
  saveMyStoryTemplates(file, storage)
  assert.deepEqual([...storage.data.keys()], [myStoryTemplatesKey]); assert.equal(myStoryTemplatesKey, 'demand-planning-my-story-templates-v1')
  const back = loadMyStoryTemplates(storage)
  assert.deepEqual(myTemplatesOf(back, tia).map((item) => item.title), ['Tia story']); assert.deepEqual(myTemplatesOf(back, tom).map((item) => item.title), ['Tom story'], 'the other person untouched')
  file = withMyTemplates(back, tia, [])
  assert.deepEqual(Object.keys(file.people), [tom], 'removing my last one removes me only')
  saveMyStoryTemplates(withMyTemplates(file, tom, []), storage)
  assert.equal(storage.getItem(myStoryTemplatesKey), null, 'nothing left: the key is removed')
  assert.throws(() => withMyTemplates(emptyMyStoryTemplates(), '', [mine('m-a', 'A')]), /Set your work email/)
  assert.throws(() => withMyTemplates(emptyMyStoryTemplates(), tia, [mine('m-a', ' ')]), /needs a title/)
  assert.throws(() => withMyTemplates(emptyMyStoryTemplates(), tia, Array.from({ length: 101 }, (_, n) => mine(`m-${n}`, `T ${n}`))), /up to 100 templates/)
  assert.throws(() => withMyTemplates(emptyMyStoryTemplates(), tia, [mine('m-a', 'A', { description: 'x'.repeat(20001) })]), /up to 20,000 characters/)
  assert.throws(() => withMyTemplates(emptyMyStoryTemplates(), tia, [mine('m-a', 'A'), mine('t-a', 'Shared id')]), /could not be kept/, 'a non-personal id is refused, not silently dropped')
  const crowded = { schema: 1, kind: 'my-story-templates', people: Object.fromEntries(Array.from({ length: 20 }, (_, n) => [`p${n}@example.com`, [mine('m-a', 'A')]])) }
  assert.throws(() => withMyTemplates(crowded, tia, [mine('m-a', 'A')]), /templates for 20 people/)
  assert.throws(() => saveMyStoryTemplates(file, { setItem: () => { throw new Error('QuotaExceededError') }, removeItem: () => undefined }), /storage is full or blocked/)
  assert.equal(newMyTemplateId([mine('m-sfv-review', 'x')], 'SFV review!'), 'm-sfv-review-2'); assert.equal(newMyTemplateId([], '***'), 'm-story')
})

test('STT-07: View as and a missing work email block my templates, with the reason (TC-STT-06)', () => {
  assert.equal(myTemplatesBlocked({ email: tia, viewingAs: false }), '')
  assert.match(myTemplatesBlocked({ email: tia, viewingAs: true }), /^Viewing as someone else: personal templates are not shown/)
  assert.match(myTemplatesBlocked({ email: '', viewingAs: false }), /Set your work email/)
})

test('STT-07: the picker offers the shared templates unchanged (for the Epic first), then mine labelled Mine; a pick fills {feature} (TC-STT-06)', () => {
  const file = { ...emptyEpicSetup(), storyTemplates: [shared('t-z', 'Zeta any'), shared('t-e5', 'Epic 5 only', { epics: [5] }), shared('t-e6', 'Epic 6 only', { epics: [6] })] }
  const own = [mine('m-b', 'B mine'), mine('m-a', 'A mine for {feature}', { epics: [6] })]
  const choices = templateChoices(file, own, 5)
  assert.deepEqual(choices.fitting.map((item) => item.id), ['t-e5', 't-z'])
  assert.deepEqual(choices.other.map((item) => item.id), ['t-e6'])
  assert.deepEqual(choices.mine.map((item) => item.id), ['m-a', 'm-b'], 'all of mine, after the shared ones')
  assert.deepEqual(templateChoices(file, [], undefined).other.map((item) => item.id), ['t-e5', 't-e6', 't-z'], 'no Epic: every shared one, by title')
  assert.deepEqual(templateChoices(null, own).mine.length, 2, 'without the Epic setup: mine still offered')
  assert.equal(findChoice(choices, choiceKey('mine', 'm-a')).title, 'A mine for {feature}')
  assert.equal(findChoice(choices, choiceKey('shared', 't-e6')).id, 't-e6')
  assert.equal(findChoice(choices, choiceKey('mine', 't-e6')), undefined, 'a shared id is not found among mine'); assert.equal(findChoice(choices, 'other:t-z'), undefined)
  assert.deepEqual(fromTemplate(own[1], 'Viewer 4.2'), { title: 'A mine for Viewer 4.2', description: 'A mine for {feature} details' })
  assert.equal(fromTemplate(shared('t-s', 'SFV ({service})'), 'Viewer').title, 'SFV ({service})', 'other placeholders stay for the person')
})

test('STT-04…STT-07: My templates in the User Story templates section, offered in the New User Story form and Your own User Story, never in Git (TC-STT-04)', () => {
  const panel = readFileSync(new URL('../src/components/MyStoryTemplatesPanel.tsx', import.meta.url), 'utf8')
  assert.match(panel, /＋ New template…/); assert.match(panel, />Edit…</); assert.match(panel, />Remove…</)
  assert.match(panel, /<button type="button" className="ghost" onClick=\{\(\) => setRemoving\(null\)\}>Cancel<\/button><button className="danger-button">Remove template<\/button>/, 'remove asks first: Cancel, then the action')
  const admin = readFileSync(new URL('../src/pages/AdminPage.tsx', import.meta.url), 'utf8')
  assert.match(admin, /templates: <><StoryTemplatesPanel [^\n]*<MyStoryTemplatesPanel email=\{azure\.creatorEmail\} viewingAs=\{Boolean\(access\.viewingAs\)\}/, 'for everyone who sees the section, with or without the shared right')
  for (const file of ['StoryEditor.tsx', 'FeatureEditor.tsx']) assert.match(readFileSync(new URL(`../src/components/${file}`, import.meta.url), 'utf8'), /<StoryTemplatePick shared=\{epicFile\} mine=\{/, `${file}: the picker`)
  assert.match(readFileSync(new URL('../src/components/StoryTemplatePick.tsx', import.meta.url), 'utf8'), /<optgroup label="Mine">/)
  for (const file of ['gitStorage.ts', 'browserState.ts', 'store.ts']) assert.doesNotMatch(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), /my-story-templates|myStoryTemplates/, `${file}: not in Git or a backup`)
})
