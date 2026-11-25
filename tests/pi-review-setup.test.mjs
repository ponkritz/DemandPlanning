import test from 'node:test'
import assert from 'node:assert/strict'
import { buildReviewComment, emptyReviewForm, formSetupProblems, readBackReview, reviewFormFrom, reviewFormProblems, myReviewOf } from '../src/piReviewPost.ts'
import { reviewSplit, reviewFooter } from '../src/piReview.ts'
import { builtInFormSetup, fieldDrafts, fieldsOf, formSetupBlock, maxFormFields, mergePiFormText, parsePiFormSetup, piFormFile, serializePiFormSetup, setupChanges, setupProblems } from '../src/piReviewSetup.ts'
import { columnsError } from '../src/onDemand.ts'
import { defaultPolicy, parseAccess, rightsFor, serializeAccess } from '../src/access.ts'
import { fileLabel, pagesOfFile } from '../src/gitWatch.ts'

// PI Review form setup (PIR-19…PIR-24, CON-114). Synthetic data only.
const form = { learnings: 'Book the rig early', struggles: 'Vendor late', move: 'Yes', moveReason: 'two stories left', movePi: 'PI 26.5', mode: 'Offline Review', remarks: 'Thanks team' }
// A setup the Scrum Master changed: Learnings relabelled with its own heading, Struggles removed, two fields added (a
// paragraph and a Dropdown with a default), Move to next PI defaulting to Yes and moved last.
function changed() {
  const setup = builtInFormSetup()
  const [learnings, , move, review, remarks] = setup.fields
  setup.fields = [
    { ...learnings, label: 'What we learned', heading: 'Lessons of this PI' },
    { id: 'f-1', label: 'Customer impact', heading: 'Customer impact', type: 'longtext', options: [], required: true, defaultValue: '', help: 'Who noticed what.' },
    { id: 'f-2', label: 'Confidence', heading: 'Confidence in the plan', type: 'dropdown', options: ['High', 'Medium', 'Low'], required: false, defaultValue: 'Medium', help: '' },
    review, remarks, { ...move, defaultValue: 'Yes' },
  ]
  return setup
}

test('PIR-19: without a setup the built-in form gives exactly the comment of PIR-14, and every split is the same (TC-PIR-19)', () => {
  const builtIn = builtInFormSetup()
  assert.equal(buildReviewComment(form, builtIn), buildReviewComment(form))
  assert.equal(buildReviewComment(form), ['Learnings :', 'Book the rig early', 'Struggles :', 'Vendor late', 'Whether the feature needs to be shifted to PI 26.5 : Yes - two stories left', 'Advise to discuss the Feature during the Review meeting : Offline Review', 'Additional Remarks :', 'Thanks team', reviewFooter].join('\n'))
  const older = 'Struggles of the Feature: lab late\nLearnings - book early\nWhether the feature needs to be shifted to PI 26.4 Partly, docs'
  assert.deepEqual(reviewSplit(older, builtIn), reviewSplit(older))
  assert.deepEqual(emptyReviewForm('PI 26.5', builtIn), emptyReviewForm('PI 26.5'))
  assert.equal(emptyReviewForm('PI 26.5').move, 'No', 'Move to next PI = No pre-selected')
  assert.deepEqual(formSetupProblems(builtIn), [])
  assert.equal(serializePiFormSetup(parsePiFormSetup(serializePiFormSetup(builtIn))), serializePiFormSetup(builtIn))
})

test('PIR-19, PIR-20: the configured form — order, headings, an added paragraph and Dropdown, the Move default — is written and read back; older comments keep their columns (TC-PIR-20)', () => {
  const setup = changed()
  assert.deepEqual(formSetupProblems(setup), [])
  const start = emptyReviewForm('PI 26.5', setup)
  assert.equal(start.move, 'Yes', 'the configured default')
  assert.deepEqual(start.extra, { 'f-1': '', 'f-2': 'Medium' })
  const filled = { ...start, learnings: 'Book early', mode: 'Discuss during Meeting', extra: { 'f-1': 'Two sites waited\n- one escalation', 'f-2': 'High' } }
  const text = buildReviewComment(filled, setup)
  assert.equal(text, ['Lessons of this PI :', 'Book early', 'Customer impact :', 'Two sites waited', '- one escalation', 'Confidence in the plan : High', 'Advise to discuss the Feature during the Review meeting : Discuss during Meeting', 'Whether the feature needs to be shifted to PI 26.5 : Yes', reviewFooter].join('\n'))
  const back = readBackReview(text, setup)
  assert.equal(back.learnings, 'Book early')
  assert.deepEqual(back.extra, { 'f-1': 'Two sites waited\none escalation', 'f-2': 'High' })
  assert.equal(back.moveValue, 'Yes'); assert.equal(back.movePi, 'PI 26.5'); assert.equal(back.reviewMode, 'Discuss during Meeting')
  assert.deepEqual(reviewFormProblems(filled, { setup }), [])
  // The built-in headings and the earlier formats (PIR-08, PIR-12) are still read with the setup in use.
  const older = reviewSplit('Learnings: book the rig early\nStruggles: lab late\nWhether the feature needs to be shifted to PI 26.4 : No', setup)
  assert.equal(older.learnings, 'book the rig early'); assert.equal(older.struggles, 'lab late'); assert.equal(older.moveValue, 'No'); assert.equal(older.movePi, 'PI 26.4')
  // Without the setup the added headings are not known: their text runs into the field before.
  assert.equal(reviewSplit(text).extra, undefined)
  // PIR-17: my latest review is found with the setup's headings too.
  assert.equal(myReviewOf([{ id: 1, author: 'Ana Costa', text, date: '2026-11-21T10:00:00Z' }], 'Ana Costa', setup)?.split.extra?.['f-2'], 'High')
})

test('PIR-20: the form checks follow the setup — a required added field, a Dropdown answer, a removed field; the prefill takes the added fields (TC-PIR-20)', () => {
  const setup = changed()
  const start = emptyReviewForm('PI 26.5', setup)
  const problems = reviewFormProblems({ ...start, learnings: 'x', mode: 'Offline Review' }, { setup })
  assert.deepEqual(problems, ['Enter the Customer impact (write “None” when there are none).'])
  assert.deepEqual(reviewFormProblems({ ...start, learnings: 'x', mode: 'Offline Review' }, { setup, optionalTexts: true }), [], 'the Close pop-up: every paragraph optional')
  assert.match(reviewFormProblems({ ...start, learnings: 'x', mode: 'Offline Review', extra: { 'f-1': 'y', 'f-2': 'Maybe' } }, { setup }).join(' '), /Choose Confidence: High or Medium or Low/)
  // Struggles was removed: not asked, not written.
  assert.ok(!buildReviewComment({ ...start, struggles: 'not shown' }, setup).includes('Struggles'))
  const prefilled = reviewFormFrom(reviewSplit('Lessons of this PI : a\nCustomer impact : b\nConfidence in the plan : low\nWhether the feature needs to be shifted to PI 26.5 : No', setup), 'PI 26.5', setup)
  assert.equal(prefilled.learnings, 'a'); assert.deepEqual(prefilled.extra, { 'f-1': 'b', 'f-2': 'Low' }); assert.equal(prefilled.move, 'No')
})

test('PIR-21, PIR-22: the setup checks — empty and duplicate headings, a heading colliding with another field, {PI}, the limits, the shared column checks (TC-PIR-21)', () => {
  const problems = (change) => { const setup = changed(); change(setup.fields); return setupProblems(setup).join(' ') }
  assert.match(problems((fields) => { fields[1].heading = '' }), /Customer impact: enter the heading/)
  assert.match(problems((fields) => { fields[2].heading = 'customer  IMPACT' }), /is also the heading of Customer impact/)
  assert.match(problems((fields) => { fields[1].heading = 'Issues' }), /“Issues” is already read as Struggles/)
  assert.match(problems((fields) => { fields[0].heading = 'What went wrong' }), /already read as Struggles/)
  assert.match(problems((fields) => { fields[1].heading = 'Impact: customers' }), /must start with a letter and hold no colon/)
  assert.match(problems((fields) => { fields[5].heading = 'Moves to the next PI' }), /must contain \{PI\} once/)
  assert.match(problems((fields) => { fields[1].heading = 'Impact in {PI}' }), /only the Move to next PI heading may contain \{PI\}/)
  assert.match(problems((fields) => { fields.splice(5, 1) }), /Move to next PI cannot be removed/)
  assert.match(problems((fields) => { fields[5].options = ['Yes', 'No', 'Partly'] }), /always Yes \/ No and required/)
  assert.match(problems((fields) => { fields[0].type = 'dropdown'; fields[0].options = ['a', 'b'] }), /keeps its type \(Long text\)/)
  assert.match(problems((fields) => { fields[2].options = ['High'] ; fields[2].defaultValue = '' }), /needs at least two options/)
  assert.match(problems((fields) => { fields[2].defaultValue = 'Unknown' }), /the default “Unknown” is not one of its options/)
  assert.match(problems((fields) => { fields[1].label = '' }), /Every field needs a name/, 'the shared On-Demand check, worded for fields')
  assert.match(problems((fields) => { fields[2].options = ['High', 'high'] }), /has the option “High” twice/)
  assert.match(problems((fields) => { for (let index = 0; fields.length <= maxFormFields; index += 1) fields.push({ id: `f-${10 + index}`, label: `Extra ${index}`, heading: `Extra ${index}`, type: 'longtext', options: [], required: false, defaultValue: '', help: '' }) }), new RegExp(`at most ${maxFormFields}`))
  assert.equal(columnsError(fieldDrafts(changed().fields), 'field'), '')
  assert.equal(columnsError([{ id: 'c1', name: '', type: 'text', required: false, options: [] }]), 'Every column needs a name.', 'the On-Demand wording unchanged')
  // The fields go through the shared editor's drafts and back unchanged.
  const setup = changed()
  assert.deepEqual(fieldsOf(fieldDrafts(setup.fields), Object.fromEntries(setup.fields.map((field) => [field.id, { heading: field.heading, defaultValue: field.defaultValue }]))), setup.fields)
})

test('PIR-19: the strict reader refuses a file that is not a usable setup; the merge keeps both saves (TC-PIR-22)', () => {
  assert.throws(() => parsePiFormSetup('{'), /not valid JSON/)
  assert.throws(() => parsePiFormSetup('{"schema":1,"kind":"other","fields":[]}'), /not a PI Review form setup/)
  assert.throws(() => parsePiFormSetup(JSON.stringify({ schema: 1, kind: 'pi-review-form', fields: [{ id: 'move', type: 'text' }] })), /no id or no type/)
  const bad = changed(); bad.fields[1].heading = 'Struggles'
  assert.throws(() => parsePiFormSetup(serializePiFormSetup(bad)), new RegExp(`${piFormFile} cannot be used: .*already read as Struggles`))
  const base = serializePiFormSetup(builtInFormSetup())
  const mine = builtInFormSetup(); mine.fields.push({ id: 'f-1', label: 'Customer impact', heading: 'Customer impact', type: 'longtext', options: [], required: false, defaultValue: '', help: '' })
  const theirs = builtInFormSetup(); theirs.fields[0].label = 'What we learned'; theirs.fields.push({ id: 'f-2', label: 'Owner', heading: 'Owner', type: 'longtext', options: [], required: false, defaultValue: '', help: '' })
  const merged = parsePiFormSetup(mergePiFormText(base, serializePiFormSetup(mine), serializePiFormSetup(theirs), true))
  assert.deepEqual(merged.fields.map((field) => field.id), ['learnings', 'struggles', 'move', 'review', 'remarks', 'f-1', 'f-2'])
  assert.equal(merged.fields[0].label, 'What we learned')
  // Both added the same heading: not a valid setup, so the later save is kept.
  const clash = builtInFormSetup(); clash.fields.push({ id: 'f-3', label: 'Owner too', heading: 'Owner', type: 'longtext', options: [], required: false, defaultValue: '', help: '' })
  assert.equal(mergePiFormText(base, serializePiFormSetup(clash), serializePiFormSetup(theirs), true), serializePiFormSetup(clash))
  assert.deepEqual(setupChanges(builtInFormSetup(), changed()), ['added Customer impact', 'added Confidence', 'removed Struggles', 'changed What we learned', 'changed Move to next PI', 'new order'])
})

test('CON-114, PIR-23: who may change the form setup, and why not (TC-CON-71)', () => {
  const policy = defaultPolicy()
  for (const role of ['Tool Owner', 'Scrum Master']) assert.ok(policy.roles[role].actions.includes('pireview.setup'), role)
  for (const role of ['Admin', 'Product Owner', 'People Manager', 'Team Member']) assert.ok(!policy.roles[role].actions.includes('pireview.setup'), role)
  assert.match(serializeAccess(policy), /"permissions": 8/)
  // A file written before permissions 8: Scrum Master and Tool Owner get it as the starting matrix does; saved again, a
  // cell set to Not set stays so.
  const v7 = JSON.parse(serializeAccess(policy)); v7.permissions = 7
  for (const rights of Object.values(v7.roles)) rights.actions = rights.actions.filter((key) => key !== 'pireview.setup')
  const read = parseAccess(JSON.stringify(v7))
  assert.ok(read.roles['Scrum Master'].actions.includes('pireview.setup') && read.roles['Tool Owner'].actions.includes('pireview.setup'))
  assert.ok(!read.roles.Admin.actions.includes('pireview.setup') && !read.roles['Team Member'].actions.includes('pireview.setup'))
  read.roles['Scrum Master'].actions = read.roles['Scrum Master'].actions.filter((key) => key !== 'pireview.setup')
  assert.ok(!parseAccess(serializeAccess(read)).roles['Scrum Master'].actions.includes('pireview.setup'), 'saved again: Not set stays')
  assert.equal(rightsFor(null, 'x@example.com').actions.has('pireview.setup'), false)
  const can = (...allowed) => (action) => allowed.includes(action)
  const git = { connected: true, readOnly: false, isSample: false }, ready = { loaded: true, error: '' }
  const viewer = { viewingAs: '', readOnly: false, can: can('pireview.setup') }
  assert.equal(formSetupBlock(viewer, git, ready), '')
  assert.match(formSetupBlock({ ...viewer, viewingAs: 'the role Team Member' }, git, ready), /^Read only while viewing as the role Team Member/)
  assert.match(formSetupBlock({ ...viewer, readOnly: true }, git, ready), /access roles are not loaded yet/)
  assert.match(formSetupBlock({ ...viewer, can: can() }, git, ready), /Your role does not allow “PI Review: set up the review form.*Scrum Masters and Tool Owners set up the form/)
  assert.match(formSetupBlock(viewer, { ...git, isSample: true }, ready), /Synthetic sample data/)
  assert.match(formSetupBlock(viewer, { ...git, connected: false }, ready), /Connect Git storage/)
  assert.match(formSetupBlock(viewer, { ...git, readOnly: true }, ready), /can read but not save/)
  assert.match(formSetupBlock(viewer, git, { loaded: true, error: 'broken' }), /could not be read from Git.*broken/)
  assert.match(formSetupBlock(viewer, git, { loaded: false, error: '' }), /still being read/)
})

test('PIR-19: a newer form setup in Git is loaded quietly, except on Admin → Epic & Feature setup (TC-PIR-22)', () => {
  assert.deepEqual(pagesOfFile('data/pi-review-form.json', 'data/planning-data.json'), { pages: ['admin:epics'], quiet: 'piForm', loader: 'piForm' })
  assert.equal(fileLabel('data/pi-review-form.json', 'data/planning-data.json'), 'PI Review form')
})
