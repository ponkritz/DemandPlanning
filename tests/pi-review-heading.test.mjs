import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildReviewComment, editTargetOf, myReviewOf, ownReviewOf, readBackReview, reviewCountOf, reviewFormProblems, reviewHeadingFor, reviewPeriodOf } from '../src/piReviewPost.ts'
import { commentsFrom, isReviewFor, latestReviewFor, reviewComments, reviewHeadingIn, reviewHeadingNote, reviewHeadingOf, reviewSplit, samePiNumber, reviewFooter } from '../src/piReview.ts'
import { startBulkForm } from '../src/piReviewBulk.ts'
import { meetingFeatures } from '../src/piMeeting.ts'
import { builtInFormSetup } from '../src/piReviewSetup.ts'
import { commentText } from '../src/workItemEdit.ts'
import { safeCommentHtml } from '../src/azureClient.ts'

// PIR-48…PIR-50 (product owner, 26 Nov 2026): every PI review the app posts starts with "Feature Review for PI 26.4";
// only a comment with that heading is a PI review, for the PI it names only. Synthetic data only.
const form = { learnings: 'Book the rig early', struggles: 'Vendor late', move: 'No', moveReason: '', movePi: 'PI 27.1', mode: 'Offline Review', remarks: '', reviewedPi: 'PI 26.4' }
const comment = (id, date, text, author = 'Rita Gomez') => ({ id, date, text, author, authorEmail: 'rita.gomez@example.com' })
const rita = { email: 'rita.gomez@example.com', name: 'Rita Gomez' }
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('PIR-48: every review the app writes starts with “Feature Review for <reviewed PI>”, in the PI label the field headings use (TC-PIR-48)', () => {
  const html = buildReviewComment(form)
  assert.ok(html.startsWith('<p>Feature Review for PI 26.4</p><ul><li>Learnings of PI 26.4:'), html)
  assert.ok(html.endsWith(`<p>${reviewFooter}</p>`))
  assert.ok(safeCommentHtml(html), 'still only the app’s own <ul>, <ol>, <li> and <p> (SM-183)')
  assert.equal(reviewHeadingFor({ reviewedPi: 'Q\\PI 2026.4' }), 'Feature Review for PI 2026.4')
  assert.equal(reviewHeadingOf('PI 26.4'), 'Feature Review for PI 26.4')
  // Edit review… and the bulk "Update review for (n)" send the same built comment: its heading names the reviewed PI.
  const bulk = startBulkForm([{ item: { id: 7, key: 'k/7', iterationPath: 'Q\\PI 26.4', assignedTo: 'Rita Gomez', state: 'Active' } }], 'Q\\PI 26.4', [], builtInFormSetup())
  assert.equal(bulk.initial.reviewedPi, 'PI 26.4')
  assert.match(buildReviewComment({ ...bulk.initial, learnings: 'a', struggles: 'b', mode: 'Offline Review' }), /^<p>Feature Review for PI 26\.4<\/p>/)
  // Every writer posts buildReviewComment — the Review… / Edit review… pop-up, the bulk pop-up and the Close pop-up —
  // and nothing else builds the comment's HTML.
  assert.equal((source('src/pages/PiReviewForm.tsx').match(/buildReviewComment\(form, setup\)/g) ?? []).length, 1)
  // PIR-84: the bulk pop-up's rows each build theirs the same way (rowResultOf), for the preview and the post.
  assert.equal((source('src/piReviewBulk.ts').match(/buildReviewComment\(form, setup\)/g) ?? []).length, 1)
  assert.match(source('src/components/CloseItemsDialog.tsx'), /postAndAudit\(viewer\.env, reviewed, start\.form, buildReviewComment\(start\.form, setup\), start\.pi\)/)
  for (const file of ['src/pages/PiReviewForm.tsx', 'src/pages/BulkReviewDialog.tsx', 'src/components/CloseItemsDialog.tsx', 'src/piReviewWriter.ts', 'src/piReviewBulk.ts']) assert.doesNotMatch(source(file), /reviewCommentHtml\(/, file)
  // Without a reviewed PI there is no heading — the form refuses it, except the Close pop-up (LIM-200).
  assert.ok(buildReviewComment({ ...form, reviewedPi: '' }).startsWith('<ul>'))
  assert.match(reviewFormProblems({ ...form, reviewedPi: '' }).join(' '), /reviewed PI is not known/)
  assert.deepEqual(reviewFormProblems({ ...form, reviewedPi: '' }, { needsPi: false }), [])
  // Read back: the heading names the reviewed PI; the split reads the fields below it.
  const back = readBackReview(buildReviewComment(form))
  assert.deepEqual([back.reviewedPi, back.learnings, back.struggles, back.moveValue, back.reviewMode], ['PI 26.4', 'Book the rig early', 'Vendor late', 'No', 'Offline Review'])
})

test('PIR-49: the heading is matched tolerantly — letter case, spaces, Azure DevOps HTML (<div>, <b>, <br>, &nbsp;), bullets, bold, a trailing colon — but needs its words and a PI (TC-PIR-49)', () => {
  const variants = [
    'Feature Review for PI 26.4\nLearnings: a',
    '  feature   REVIEW  for  pi 26.4  \n\nLearnings: a',
    'Feature Review for PI 26.4:\nLearnings: a',
    'Feature Review for PI26.4',
    'Feature Review for PI-26.4 :',
    '**Feature Review for PI 26.4**',
    '- Feature Review for the PI 26.4',
    '# Feature Review for PI 26.4',
    '<div><b>Feature Review for PI 26.4</b><br></div><div>Learnings: a</div>',
    '<p>Feature&nbsp;Review for PI 26.4:</p><ul><li>Learnings of PI 26.4:<ul><li>a</li></ul></li></ul>',
    '<div><span style="font-weight:bold">Feature Review for PI 26.4</span></div>',
    '​Feature Review for PI 26.4',
    '\n\n<b>Feature Review for PI 26.4</b>',
  ]
  for (const text of variants) assert.equal(reviewHeadingIn(text)?.pi, 'PI 26.4', JSON.stringify(text))
  assert.equal(reviewHeadingIn('Feature Review for PI 2026.4')?.pi, 'PI 2026.4')
  // Text after the colon on the heading line belongs to the review.
  assert.equal(reviewSplit('Feature Review for PI 26.4: Learnings: share early').learnings, 'share early')
  // Not a heading: missing words or PI, a sentence, not the first line, another heading.
  for (const text of ['Feature Review', 'Feature Review for PI', 'Feature Review for PI Planning', 'Review for PI 26.4', 'Feature review PI 26.4', 'Feature Review for PI 26.4 was postponed', 'Thanks!\nFeature Review for PI 26.4', 'Learnings of PI 26.4:\n- a', 'Feature Review for API 26.4', 'Feature Review for PI 26.4x', '', undefined]) assert.equal(reviewHeadingIn(text), undefined, JSON.stringify(text))
  // Same PI by its numbers: PI 26.4 = PI 2026.4 = Q\PI 26.4; not PI 26.5 or PI 26.4.1.
  assert.equal(samePiNumber('PI 26.4', 'Q\\PI 2026.4'), true)
  assert.equal(samePiNumber('PI 26.4', 'PI 26.5'), false)
  assert.equal(samePiNumber('PI 26.4', 'PI 26.4.1'), false)
  assert.equal(samePiNumber('PI 26.4', 'PI Planning'), false)
})

test('PIR-49, PIR-50: only a comment headed for the chosen PI counts — the wrong PI and a comment without the heading are ignored, old reviews included (TC-PIR-50)', () => {
  const headed = comment(3, '2026-10-05T10:00:00Z', commentText(buildReviewComment(form)))
  const wrongPi = comment(4, '2026-10-20T10:00:00Z', commentText(buildReviewComment({ ...form, reviewedPi: 'PI 26.5' })))
  const old = comment(5, '2026-11-01T10:00:00Z', 'Learnings of PI 26.4:\n- an older review, no heading\nStruggles of PI 26.4:\n- none')
  const chat = comment(6, '2026-11-02T10:00:00Z', 'Thanks!')
  const all = [chat, old, wrongPi, headed]
  assert.deepEqual(reviewComments(all).map((entry) => entry.id), [4, 3])
  assert.equal(isReviewFor(headed, 'Q\\PI 26.4'), true)
  assert.equal(isReviewFor(wrongPi, 'Q\\PI 26.4'), false, 'Feature Review for PI 26.5 does not count for PI 26.4')
  assert.equal(isReviewFor(old, 'Q\\PI 26.4'), false, 'no heading: no review, even dated in the PI')
  // PI Review's columns and the drawer: the latest review for the chosen PI — older than the newest comments.
  assert.equal(latestReviewFor(all, 'Q\\PI 26.4').id, 3)
  assert.equal(latestReviewFor(all, 'Q\\PI 26.5').id, 4)
  assert.equal(latestReviewFor([chat, old], 'Q\\PI 26.4'), undefined, 'Not reviewed')
  // My PI Review: Reviewed only for the PI named; Edit review… only on my review for that PI.
  const period = reviewPeriodOf('Q\\PI 26.4')
  assert.equal(myReviewOf(all, 'Rita Gomez', undefined, 'Q\\PI 26.4').comment.id, 3)
  assert.equal(myReviewOf([chat, old], 'Rita Gomez'), undefined)
  assert.equal(reviewCountOf(myReviewOf([wrongPi], 'Rita Gomez').split, period).counts, false)
  assert.equal(ownReviewOf(all, period, rita).comment.id, 3)
  assert.equal(ownReviewOf([chat, old], period, rita), undefined)
  assert.equal(editTargetOf([wrongPi], rita, (review) => reviewCountOf(review, period).counts), undefined)
  // The PI Review Meeting: the same rule.
  const row = { item: { key: 'k/1', id: 1, title: 'F', state: 'Active', assignedTo: 'Rita Gomez', iterationPath: 'Q\\PI 26.4' } }
  const status = (comments, pi = 'PI 26.4') => meetingFeatures([row], () => ({ state: 'done', comments, capped: false, readAt: '' }), builtInFormSetup(), '2026-09-21', pi)[0].status
  assert.equal(status([chat, old, headed]), 'reviewed')
  assert.equal(status([chat, old]), 'none')
  assert.equal(status([wrongPi]), 'none')
  assert.equal(status([wrongPi], 'PI 26.5'), 'reviewed')
  // The pages say so where Not reviewed is explained.
  assert.match(reviewHeadingNote, /^Only comments headed “Feature Review for PI …” count as a PI review: .*older reviews included.*Not reviewed until it is reviewed again\.$/)
})

test('PIR-49, PIR-33: “PI Review starts from” still applies — a headed review written before the date is ignored (TC-PIR-50)', () => {
  const early = comment(1, '2026-09-20T22:30:00Z', commentText(buildReviewComment(form)))
  const late = comment(2, '2026-09-21T01:30:00Z', commentText(buildReviewComment(form)))
  const kept = commentsFrom([late, early], '2026-09-21')
  assert.deepEqual(kept.comments.map((entry) => entry.id), [2])
  assert.equal(latestReviewFor(commentsFrom([early], '2026-09-21').comments, 'PI 26.4'), undefined)
  assert.equal(latestReviewFor(kept.comments, 'PI 26.4').id, 2)
})

test('PIR-49 (SM-305): the heading match runs in linear time — a line of 30,000 spaces or tabs is matched at once (TC-PIR-49)', () => {
  const started = performance.now()
  for (const text of [' '.repeat(30000) + 'x', '\t'.repeat(30000) + '*' + '\t'.repeat(30000) + 'y', `Feature Review for PI 26.4${' '.repeat(30000)}x`, `- ${' '.repeat(30000)}**${' '.repeat(30000)}Feature`]) assert.equal(reviewHeadingIn(text), undefined)
  assert.equal(reviewHeadingIn(`${' '.repeat(30000)}Feature Review for PI 26.4${' '.repeat(30000)}`)?.pi, 'PI 26.4')
  assert.ok(performance.now() - started < 2000, `${Math.round(performance.now() - started)} ms`)
})
