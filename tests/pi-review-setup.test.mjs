import test from 'node:test'
import assert from 'node:assert/strict'
import { buildReviewComment, emptyReviewForm, formSetupProblems, readBackReview, reviewFormFrom, reviewFormProblems, myReviewOf } from '../src/piReviewPost.ts'
import { reviewSplit, reviewFooter } from '../src/piReview.ts'
import { commentText } from '../src/workItemEdit.ts'
import { builtInFormSetup, fieldDrafts, fieldsOf, formSetupBlock, maxFormFields, mergePiFormText, parsePiFormSetup, piFormFile, serializePiFormSetup, setupChanges, setupGearLabel, setupProblems, showsSetupGear } from '../src/piReviewSetup.ts'
import { columnsError } from '../src/onDemand.ts'
import { defaultPolicy, parseAccess, rightsFor, serializeAccess } from '../src/access.ts'
import { fileLabel, pagesOfFile } from '../src/gitWatch.ts'
import { resolveSettings, settingsLabel, settingsPagesFor, shownSettingsTab } from '../src/settingsTabs.ts'
import { searchSettings } from '../src/adminOverview.ts'

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
  assert.equal(buildReviewComment(form), `<ul><li>Learnings:<ul><li>Book the rig early</li></ul></li><li>Struggles:<ul><li>Vendor late</li></ul></li><li>Whether the feature needs to be shifted to PI 26.5 : Yes<ul><li>two stories left</li></ul></li><li>Advise to discuss the Feature during the Review meeting : Offline Review</li><li>Additional Remarks:<ul><li>Thanks team</li></ul></li></ul><p>${reviewFooter}</p>`)
  // PIR-28: the built-in Learnings and Struggles headings name the reviewed PI.
  assert.deepEqual(builtIn.fields.slice(0, 2).map((field) => field.heading), ['Learnings of {REVIEWED PI}', 'Struggles of {REVIEWED PI}'])
  assert.match(buildReviewComment({ ...form, reviewedPi: 'PI 26.4' }), /^<ul><li>Learnings of PI 26\.4:<ul><li>Book the rig early<\/li><\/ul><\/li><li>Struggles of PI 26\.4:/)
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
  const html = buildReviewComment(filled, setup)
  assert.equal(html, `<ul><li>Lessons of this PI:<ul><li>Book early</li></ul></li><li>Customer impact:<ul><li>Two sites waited</li><li>one escalation</li></ul></li><li>Confidence in the plan : High</li><li>Advise to discuss the Feature during the Review meeting : Discuss during Meeting</li><li>Whether the feature needs to be shifted to PI 26.5 : Yes</li></ul><p>${reviewFooter}</p>`)
  const text = commentText(html)
  const back = readBackReview(html, setup)
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
  // PIR-28: {REVIEWED PI} — at most once in a heading, with words besides it; allowed in any field's heading.
  assert.match(problems((fields) => { fields[1].heading = 'Impact {REVIEWED PI} and {REVIEWED PI}' }), /\{REVIEWED PI\} \(the reviewed PI\) once only/)
  assert.match(problems((fields) => { fields[1].heading = 'of {REVIEWED PI}' }), /needs words besides \{REVIEWED PI\}/)
  assert.equal(problems((fields) => { fields[1].heading = 'Customer impact in {REVIEWED PI}' }), '')
  assert.equal(problems((fields) => { fields[0].heading = 'Lessons of {REVIEWED PI}' }), '')
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

test('CON-114, PIR-31: who may change the form setup, and why not (TC-CON-71)', () => {
  const policy = defaultPolicy()
  for (const role of ['Tool Owner', 'Scrum Master']) assert.ok(policy.roles[role].actions.includes('pireview.setup'), role)
  for (const role of ['Admin', 'Product Owner', 'People Manager', 'Team Member']) assert.ok(!policy.roles[role].actions.includes('pireview.setup'), role)
  assert.match(serializeAccess(policy), /"permissions": 9/)
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

test('PIR-19, PIR-29: a newer form setup in Git is loaded quietly, except on Admin → PI Review Setup (TC-PIR-22)', () => {
  assert.deepEqual(pagesOfFile('data/pi-review-form.json', 'data/planning-data.json'), { pages: ['admin:pireview'], quiet: 'piForm', loader: 'piForm' })
  assert.equal(fileLabel('data/pi-review-form.json', 'data/planning-data.json'), 'PI Review form')
})

test('PIR-28: {REVIEWED PI} in the headings — written with the reviewed PI (or left out when none is known), read back, and the read-back check of the setup; a saved setup without it keeps its headings (TC-PIR-29)', () => {
  const setup = changed()
  setup.fields[1].heading = 'Customer impact in {REVIEWED PI}'
  assert.deepEqual(formSetupProblems(setup), [])
  const filled = { ...emptyReviewForm('PI 26.5', setup), learnings: 'a', mode: 'Offline Review', extra: { 'f-1': 'b', 'f-2': 'High' }, reviewedPi: 'PI 2026.4' }
  const html = buildReviewComment(filled, setup)
  assert.match(html, /<li>Customer impact in PI 2026\.4:<ul><li>b<\/li>/)
  const back = readBackReview(html, setup)
  assert.deepEqual([back.extra['f-1'], back.reviewedPi], ['b', 'PI 2026.4'])
  assert.deepEqual(reviewFormProblems(filled, { setup }), [])
  // Without a reviewed PI: "Customer impact:" and "Learnings:", still read into their fields.
  const none = buildReviewComment({ ...filled, reviewedPi: '' }, setup)
  assert.match(none, /<li>Customer impact:<ul>/)
  assert.equal(readBackReview(none, setup).extra['f-1'], 'b')
  assert.match(buildReviewComment({ ...emptyReviewForm('PI 26.5'), learnings: 'x', mode: 'Offline Review' }), /<li>Learnings:<ul><li>x/)
  // A file saved before {REVIEWED PI} keeps its headings as saved (nothing is rewritten).
  const old = builtInFormSetup(); old.fields[0].heading = 'Learnings'; old.fields[1].heading = 'Struggles'
  const read = parsePiFormSetup(serializePiFormSetup(old))
  assert.deepEqual(read.fields.slice(0, 2).map((field) => field.heading), ['Learnings', 'Struggles'])
  assert.match(buildReviewComment({ ...form, reviewedPi: 'PI 26.4' }, read), /^<ul><li>Learnings:<ul>/)
  // A custom heading "None" would swallow "No learnings or struggles": the setup's read-back check refuses it.
  const clash = builtInFormSetup(); clash.fields.push({ id: 'f-9', label: 'Nothing', heading: 'None', type: 'longtext', options: [], required: false, defaultValue: '', help: '' })
  assert.match(formSetupProblems(clash).join(' '), /would not be read back as written: .*Learnings/)
})

test('PIR-29: PI Review Setup is an Admin page of its own, only for the holders of “PI Review: set up the review form” (a Scrum Master, a Tool Owner); anyone else asking for it gets Streams; Search settings and the old section link (TC-PIR-30)', () => {
  const keys = (can) => settingsPagesFor(can).map((page) => page.key)
  assert.ok(!keys(() => false).includes('pireview'), 'hidden without the permission (and before the roles file is loaded)')
  assert.deepEqual(keys(() => true).slice(3, 5), ['epics', 'pireview'], 'next to Epic & Feature setup')
  const policy = defaultPolicy(); policy.members = { 'sm@example.com': ['Scrum Master'], 'to@example.com': ['Tool Owner'], 'tm@example.com': ['Team Member'], 'ad@example.com': ['Admin'], 'pm@example.com': ['People Manager'] }
  const sees = (p, email) => { const rights = rightsFor(p, email); return keys((key) => rights.actions.has(key)).includes('pireview') }
  assert.deepEqual(['sm', 'to', 'tm', 'ad', 'pm'].filter((who) => sees(policy, `${who}@example.com`)), ['sm', 'to'])
  const changed = parseAccess(serializeAccess(policy)); changed.roles['Team Member'].actions.push('pireview.setup')
  assert.equal(sees(changed, 'tm@example.com'), true, 'Role rights decide')
  assert.equal(settingsLabel('pireview'), 'PI Review Setup')
  // A remembered tab or an old link: the page for those who may see it, Streams for everyone else (as every hidden Admin page).
  const can = (...allowed) => (action) => allowed.includes(action)
  assert.equal(shownSettingsTab('pireview', can('pireview.setup')), 'pireview')
  assert.equal(shownSettingsTab('pireview', can()), 'connections')
  assert.equal(shownSettingsTab('audit', can()), 'connections')
  assert.equal(shownSettingsTab('my', can()), 'my')
  assert.deepEqual(resolveSettings('epics', 'pireview'), { tab: 'pireview' }, 'the former section opens the page')
  assert.equal(shownSettingsTab(resolveSettings('epics', 'pireview').tab, can()), 'connections')
  assert.deepEqual(resolveSettings('epics', 'lists'), { tab: 'epics', section: 'lists' })
  // Search settings lists only the pages the viewer may open (App filters it by settingsPagesFor).
  const found = searchSettings('pi review form')
  assert.equal(found[0]?.tab, 'pireview'); assert.equal(found[0]?.page, 'PI Review Setup'); assert.equal(found[0]?.section, undefined)
  assert.ok(!searchSettings('pi review').some((entry) => entry.tab === 'epics'), 'no longer a section of Epic & Feature setup')
  assert.ok(!found.some((entry) => keys(can()).includes(entry.tab)), 'nothing found without the permission')
})

test('PIR-30: the ⚙ PI Review Setup button — shown exactly when the page is in the menu: by the permission, not the role; in View as by the viewed role (TC-PIR-31)', () => {
  const can = (...allowed) => (action) => allowed.includes(action)
  assert.equal(setupGearLabel, 'PI Review Setup')
  assert.equal(showsSetupGear({ can: can('pireview.setup') }), true)
  assert.equal(showsSetupGear({ can: can() }), false, 'without the permission')
  // The starting matrix: Scrum Master and Tool Owner; Role rights changes count (a Team Member allowed, a Scrum Master denied).
  const policy = defaultPolicy(); policy.members = { 'sm@example.com': ['Scrum Master'], 'to@example.com': ['Tool Owner'], 'tm@example.com': ['Team Member'], 'ad@example.com': ['Admin'], 'pm@example.com': ['People Manager'] }
  const shows = (p, email) => { const rights = rightsFor(p, email); const has = (key) => rights.actions.has(key); assert.equal(showsSetupGear({ can: has }), settingsPagesFor(has).some((page) => page.key === 'pireview'), 'the gear and the menu agree'); return showsSetupGear({ can: has }) }
  assert.deepEqual(['sm', 'to', 'tm', 'ad', 'pm'].filter((who) => shows(policy, `${who}@example.com`)), ['sm', 'to'])
  const changed = parseAccess(serializeAccess(policy))
  changed.roles['Team Member'].actions.push('pireview.setup')
  changed.roles['Scrum Master'].actions = changed.roles['Scrum Master'].actions.filter((key) => key !== 'pireview.setup')
  assert.equal(shows(changed, 'tm@example.com'), true, 'a Team Member allowed in Role rights')
  assert.equal(shows(changed, 'sm@example.com'), false, 'a Scrum Master without it')
  assert.equal(shows(null, 'sm@example.com'), false, 'no roles file loaded (CON-101)')
  // View as: the viewed role's rights decide (an Admin viewing as the Scrum Master sees it); the page is then read only.
  const viewed = rightsFor(policy, 'sm@example.com')
  assert.equal(showsSetupGear({ can: (key) => viewed.actions.has(key) }), true)
  assert.match(formSetupBlock({ viewingAs: 'the role Scrum Master', readOnly: false, can: (key) => viewed.actions.has(key) }, { connected: true, readOnly: false, isSample: false }, { loaded: true, error: '' }), /^Read only while viewing as the role Scrum Master/)
})
