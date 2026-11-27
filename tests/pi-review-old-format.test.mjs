import test from 'node:test'
import assert from 'node:assert/strict'
import { convertBlock, convertTargetOf, isOldFormat, oldFormatComments, oldFormatForm, oldFormatOf, oldFormatSearch, plainLines, searchComments } from '../src/piReviewOldFormat.ts'
import { buildReviewComment, emptyReviewForm, reviewFormProblems } from '../src/piReviewPost.ts'
import { isReviewFor, latestReviewFor, reviewHeadingIn } from '../src/piReview.ts'
import { builtInFormSetup } from '../src/piReviewSetup.ts'
import { commentText } from '../src/workItemEdit.ts'

// PIR-75…PIR-78 (temporary, LIM-235): the old-format comments — "Struggles / Learnings / Moving to next PI" without the
// heading "Feature Review for PI …" — found, flagged, converted by their author only. Synthetic data only.
const setup = builtInFormSetup()
const rita = { email: 'rita.gomez@example.com', name: 'Rita Gomez' }

test('PIR-75: an old-format comment has at least two of Struggles, Learnings and Moving to next PI — tolerant of case, plural, Move / Moving / Moved, a colon, "of PI x", bullets and any order (TC-PIR-75)', () => {
  const variants = [
    'Struggles: test rig late\nLearnings: book the rig early\nMoving to next PI: Yes, docs pending',
    'STRUGGLE\n- rig late\nLEARNING\n- book early',
    'learnings of PI 26.4: calibrate\nstruggles for PI 26.4: parts late',
    '1. Moved to next PI - No\n2. Struggles - none',
    '- **Learnings:** book early\n- **Move to next PI:** Partly, vendor',
    '# Learnings\nbook early\n# Struggles\nlate parts',
    'Struggles: late parts. Learnings: book early. Moving to next PI: No',
    'Moving to the next PI: Yes\nLearning: none',
  ]
  for (const text of variants) assert.ok(oldFormatOf(text), text)
  assert.equal(oldFormatSearch, true, 'the temporary switch is on')
  assert.deepEqual(oldFormatOf(variants[0]).sections, ['struggles', 'learnings', 'move'])
  assert.deepEqual(oldFormatOf('# Learnings\nbook early\n# Struggles\nlate parts').sections, ['struggles', 'learnings'], 'any order')
})

test('PIR-75: Azure DevOps HTML (<div>, <b>, <br>, &nbsp;, lists) is read as text (TC-PIR-75)', () => {
  const html = '<div><b>Struggles:</b>&nbsp;rig late</div><div><b>Learning</b></div><ul><li>book early</li><li>calibrate</li></ul><div>Moved to next PI&nbsp;-&nbsp;No - all done</div>'
  const old = oldFormatOf(html)
  assert.deepEqual([old.struggles, old.learnings, old.moveValue, old.moveReason], ['rig late', 'book early\ncalibrate', 'No', 'all done'])
  assert.ok(oldFormatOf('<p>Struggles:<br>late parts<br>Learnings:<br>book early</p>'))
  assert.ok(oldFormatOf('<ol><li>Struggles: late</li><li>Learnings: early</li></ol>'))
  assert.ok(oldFormatOf('Struggles: late\nLearnings​: early'), 'non-breaking spaces and zero-width marks')
  // As read from Azure DevOps (commentText) the same.
  assert.deepEqual(oldFormatOf(commentText(html)).learnings, 'book early\ncalibrate')
  assert.equal(plainLines('<div>a&nbsp;&nbsp; b</div>').trim(), 'a b')
})

test('PIR-75: near-misses are not old-format — one heading, words in a sentence, a review with the heading, empty (TC-PIR-75)', () => {
  for (const text of [
    'Struggles: only this one heading',
    'We had struggles and learnings this PI, moving to next PI is likely.',
    'The learning curve was steep; struggles with the rig.',
    'Moving to next PI: Yes',
    'Issues: late\nLessons learnt: early',
    'Strugglesome: x\nLearningsy: y',
    '', '   ', undefined,
  ]) assert.equal(oldFormatOf(text), undefined, String(text))
  // A comment headed "Feature Review for PI 26.4" is a review (PIR-49), never old-format — whatever it holds.
  const review = 'Feature Review for PI 26.4\nStruggles: a\nLearnings: b\nMoving to next PI: No'
  assert.ok(reviewHeadingIn(review))
  assert.equal(oldFormatOf(review), undefined)
  assert.equal(oldFormatOf(commentText(buildReviewComment({ ...emptyReviewForm('PI 26.5'), learnings: 'x', struggles: 'y', move: 'No', mode: 'Offline Review', reviewedPi: 'PI 26.4' }))), undefined)
})

test('PIR-75, PIR-49: an old-format comment does NOT count as a review — the heading rule stays strict (TC-PIR-75)', () => {
  const old = { id: 1, text: 'Struggles: late\nLearnings: early\nMoving to next PI: No', author: 'Rita Gomez', date: '2026-10-01T10:00:00Z' }
  assert.equal(isReviewFor(old, 'PI 26.4'), false)
  assert.equal(latestReviewFor([old], 'PI 26.4'), undefined)
  assert.equal(isOldFormat(old), true)
  // Newest first; a plain comment is not listed.
  const newer = { ...old, id: 2, date: '2026-11-01T10:00:00Z' }, chat = { ...old, id: 3, text: 'Thanks!', date: '2026-11-02T10:00:00Z' }
  assert.deepEqual(oldFormatComments([old, chat, newer]).map((comment) => comment.id), [2, 1])
  assert.deepEqual(oldFormatComments(undefined), [])
})

test('PIR-76: Convert… prefills the form — Struggles, Learnings, Move (+ reason) mapped; the rest to Additional Remarks; the result posts with the heading and counts (TC-PIR-76)', () => {
  const base = { ...emptyReviewForm('PI 26.5', setup), reviewedPi: 'PI 26.4' }
  const yes = oldFormatForm(oldFormatOf('Hello team,\nStruggles:\n- rig late\n- parts\nLearnings: book early\nMoving to next PI: Yes - docs pending\nRemarks: thanks QA'), base, setup)
  assert.deepEqual([yes.struggles, yes.learnings, yes.move, yes.moveReason, yes.remarks, yes.reviewedPi, yes.movePi], ['rig late\nparts', 'book early', 'Yes', 'docs pending', 'Hello team,\nthanks QA', 'PI 26.4', 'PI 26.5'])
  // No with a reason: the reason (not posted with No) is kept in Additional Remarks.
  const no = oldFormatForm(oldFormatOf('Struggles: none\nMoving to next PI: No, all done'), base, setup)
  assert.deepEqual([no.move, no.moveReason, no.remarks], ['No', '', 'Why it does not move — all done'])
  // Partly or no answer: Move is left to choose (the form asks Yes or No), the text kept in Additional Remarks.
  const partly = oldFormatForm(oldFormatOf('Struggles: x\nMove to next PI: Partly, vendor'), base, setup)
  assert.deepEqual([partly.move, partly.remarks], ['', 'Partly — vendor'])
  assert.match(reviewFormProblems({ ...partly, mode: 'Offline Review', learnings: 'None' }, { setup }).join(' '), /Choose whether the Feature moves/)
  const unanswered = oldFormatForm(oldFormatOf('Struggles: x\nLearnings: y\nMoving to next PI: depends on the vendor'), base, setup)
  assert.deepEqual([unanswered.move, unanswered.remarks], ['', 'depends on the vendor'])
  // Saved, it is a review for the reviewed PI chosen (the heading first) — and no longer old-format.
  const html = buildReviewComment({ ...yes, mode: 'Offline Review' }, setup)
  assert.deepEqual(reviewFormProblems({ ...yes, mode: 'Offline Review' }, { setup }), [])
  assert.match(commentText(html), /^Feature Review for PI 26\.4/)
  assert.equal(isReviewFor({ text: commentText(html) }, 'PI 26.4'), true)
  assert.equal(oldFormatOf(commentText(html)), undefined)
  // A setup without Additional Remarks: the rest goes to Learnings; one without Struggles: its text to the remarks.
  const noRemarks = { ...setup, fields: setup.fields.filter((field) => field.id !== 'remarks') }
  assert.equal(oldFormatForm(oldFormatOf('Intro\nStruggles: x\nLearnings: y'), base, noRemarks).learnings, 'y\nIntro')
  const noStruggles = { ...setup, fields: setup.fields.filter((field) => field.id !== 'struggles') }
  assert.equal(oldFormatForm(oldFormatOf('Struggles: x\nLearnings: y'), base, noStruggles).remarks, 'Struggles — x')
})

test('PIR-77: only the comment’s author can convert it — the others see “Only <author> can convert their comment”; then the page and review rights (TC-PIR-77)', () => {
  const viewer = { can: (action) => action === 'work.comment', readOnly: false, viewingAs: '', email: 'rita.gomez@example.com', isSample: false, config: { organization: 'example', project: 'Project', team: 'T' }, pat: 'p' }
  const feature = { assignedTo: 'Rita Gomez', assignedToEmail: 'rita.gomez@example.com' }
  const mine = { author: 'Rita Gomez', authorEmail: 'rita.gomez@example.com' }, bens = { author: 'Ben Okafor', authorEmail: 'ben.okafor@example.com' }
  assert.equal(convertBlock(viewer, feature, mine, rita), '')
  assert.match(convertBlock(viewer, feature, bens, rita), /^Only Ben Okafor can convert their comment/)
  // A lead (every review right) still cannot convert Ben's comment.
  assert.match(convertBlock({ ...viewer, can: () => true }, feature, bens, rita), /^Only Ben Okafor can convert/)
  // Never in View as, never with the sample, never on premises.
  assert.match(convertBlock({ ...viewer, viewingAs: 'Ben Okafor' }, feature, mine, rita), /viewing as Ben Okafor/)
  assert.match(convertBlock({ ...viewer, isSample: true }, feature, mine, rita), /sample data/)
  assert.match(convertBlock({ ...viewer, config: { organization: '', project: 'P', team: 'T', baseUrl: 'https://tfs.example.com/tfs/Collection' } }, feature, mine, rita), /on premises|dev\.azure\.com/)
  // My own comment on another person's Feature without the lead right: the review rights decide (CON-113).
  assert.match(convertBlock(viewer, { assignedTo: 'Ben Okafor', assignedToEmail: 'ben.okafor@example.com' }, mine, rita), /^Only the Feature’s assignee/)
  // PIR-70, PIR-71: the Product Owner of the Feature's Epic (My Epics) converts their own comment on a Feature of
  // another assignee; still never another person's comment.
  const owner = { ...viewer, epicOwnerOf: () => ({ email: 'rita.gomez@example.com', name: 'Rita Gomez' }) }
  assert.equal(convertBlock(owner, { assignedTo: 'Ben Okafor', assignedToEmail: 'ben.okafor@example.com', id: 9, parentId: 100, workItemType: 'Feature' }, mine, rita), '')
  assert.match(convertBlock(owner, { assignedTo: 'Ben Okafor', assignedToEmail: 'ben.okafor@example.com' }, bens, rita), /^Only Ben Okafor can convert/)
  // The comment Convert… works on: my newest old-format comment, else the newest one.
  const old = (id, date, author, authorEmail) => ({ id, date, author, authorEmail, text: 'Struggles: a\nLearnings: b' })
  const list = [old(1, '2026-10-01T10:00:00Z', 'Rita Gomez', 'rita.gomez@example.com'), old(2, '2026-11-01T10:00:00Z', 'Ben Okafor', 'ben.okafor@example.com')]
  assert.equal(convertTargetOf(list, rita).id, 1)
  assert.equal(convertTargetOf(list, { email: 'lena.berg@example.com', name: 'Lena Berg' }).id, 2)
  assert.equal(convertTargetOf([], rita), undefined)
})

test('PIR-78: Search finds the comments holding every word typed, newest first, with the Old format flag (TC-PIR-78)', () => {
  const comments = [
    { id: 1, text: 'Struggles: rig late\nLearnings: early', author: 'Rita Gomez', date: '2026-10-01T10:00:00Z' },
    { id: 2, text: 'Thanks for the rig update', author: 'Ben Okafor', date: '2026-11-01T10:00:00Z' },
  ]
  const entries = [{ item: { id: 201 }, comments }, { item: { id: 202 }, comments: [{ id: 3, text: 'No rig here', author: 'Lena Berg', date: '2026-09-25T10:00:00Z' }] }]
  assert.deepEqual(searchComments(entries, 'RIG').hits.map((hit) => [hit.item.id, hit.comment.id, hit.old]), [[201, 2, false], [201, 1, true], [202, 3, false]])
  assert.deepEqual(searchComments(entries, 'struggles rig').hits.map((hit) => hit.comment.id), [1], 'every word')
  assert.deepEqual(searchComments(entries, 'lena').hits.map((hit) => hit.comment.id), [3], 'by the author too')
  assert.deepEqual(searchComments(entries, '  ').hits, [])
  const many = searchComments(entries, 'rig', 2)
  assert.equal(many.hits.length, 2)
  assert.equal(many.more, true)
})

test('PIR-81: a sentence that says the Feature moves is the Move answer — "Feature needs to be shifted to PI.27.1" (TC-PIR-81)', async () => {
  const { oldFormatOf, moveSentenceOf } = await import('../src/piReviewOldFormat.ts')
  // The product owner's example (as Azure DevOps stores it).
  const old = oldFormatOf('<div>Struggles: No struggles,</div><div>Learnings: N/A</div><div>Feature needs to be shifted to PI.27.1</div>')
  assert.deepEqual(old?.sections, ['struggles', 'learnings', 'move'])
  assert.equal(old?.struggles, 'No struggles,')
  assert.equal(old?.learnings, 'N/A', 'the move sentence is taken out of Learnings')
  assert.equal(old?.moveValue, 'Yes')
  assert.equal(old?.moveReason, 'Feature needs to be shifted to PI.27.1')
  // Other ways of saying it.
  for (const line of ['To be moved to the next PI', 'Carried forward to PI 27.1', 'will be pushed to PI-2027.1', 'Spilled over into the next PI', 'feature shifted to pi.27.1']) assert.equal(moveSentenceOf(line)?.value, 'Yes', line)
  for (const line of ['Feature will not be shifted', 'No need to be moved', 'No shift', "won't be carried forward"]) assert.equal(moveSentenceOf(line)?.value, 'No', line)
  // A mere mention is not a move answer.
  for (const line of ['We shifted focus to testing', 'Moved the meeting to Monday', 'PI 27.1 planning was fine', 'Learnings: N/A']) assert.equal(moveSentenceOf(line), undefined, line)
  // Struggles + a move sentence is enough to flag (two of the three), and one heading alone is not.
  assert.equal(oldFormatOf('Struggles: none\nFeature needs to be shifted to PI.27.1')?.moveValue, 'Yes')
  assert.equal(oldFormatOf('Struggles: none'), undefined)
  // With the heading it is a review, not old format.
  assert.equal(oldFormatOf('<p>Feature Review for PI 26.4</p><div>Struggles: none</div><div>Learnings: N/A</div>'), undefined)
})
