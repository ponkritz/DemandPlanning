import test from 'node:test'
import assert from 'node:assert/strict'
import { builtInFormSetup, defaultReviewStart, isReviewStartDay, mergePiFormText, parsePiFormSetup, serializePiFormSetup, setupProblems } from '../src/piReviewSetup.ts'
import { cutoffNote, notBeforeStart, piCutoff, piOptionsFrom, reviewStartOf, shownFrom } from '../src/piReviewStart.ts'
import { clearDiscussions, commentsFrom, discussionOf, discussionsFrom, latestComment, setDiscussion, setDiscussionsFrom } from '../src/piReview.ts'
import { myReviewOf, nextPiOf, reviewCountOf, reviewPeriodOf } from '../src/piReviewPost.ts'

// PIR-33: "PI Review starts from" (default 21 Sep 2026). Synthetic data only.
const it = (path, start, finish) => ({ name: path.split('\\').at(-1), path, ...(start ? { attributes: { startDate: `${start}T00:00:00Z`, finishDate: `${finish}T00:00:00Z` } } : {}) })
// A tree as the team has it: PI 26.3 ends the day before the start, PI 26.4 starts on it (its dates from its Sprints),
// PI 26.2 and PI 27.1 without dates.
const tree = [
  it('Q\\PI 26.2'),
  it('Q\\PI 26.3', '2026-06-22', '2026-09-20'),
  it('Q\\PI 26.4'), it('Q\\PI 26.4\\Sprint 1', '2026-09-21', '2026-10-04'), it('Q\\PI 26.4\\Sprint 6', '2026-12-07', '2026-12-20'),
  it('Q\\PI 27.1'),
]
const options = ['Q\\PI 27.1', 'Q\\PI 26.4', 'Q\\PI 26.3', 'Q\\PI 26.2']
const comment = (id, date, text = 'Feature Review for PI 26.4\nLearnings of PI 26.4:\n- book the rig early\nStruggles of PI 26.4:\n- vendor late\nWhether the feature needs to be shifted to PI 27.1 : No', author = 'Rita Gomez') => ({ id, date, text, author })

test('PIR-33: the start date is part of the PI Review form setup — 21 Sep 2026 by default, older files without it stay valid, a bad date is refused, saved and merged (TC-PIR-34)', () => {
  assert.equal(defaultReviewStart, '2026-09-21')
  assert.equal(reviewStartOf(undefined), '2026-09-21')
  assert.equal(reviewStartOf(builtInFormSetup()), '2026-09-21')
  // An older file (written before PIR-33) has no reviewStart: still read, the default applies, and it is written back without one.
  const older = serializePiFormSetup(builtInFormSetup())
  assert.doesNotMatch(older, /reviewStart/)
  assert.equal(parsePiFormSetup(older).reviewStart, undefined)
  assert.equal(reviewStartOf(parsePiFormSetup(older)), '2026-09-21')
  // Set: kept, read back, used.
  const set = { ...builtInFormSetup(), reviewStart: '2026-10-05' }
  const text = serializePiFormSetup(set)
  assert.match(text, /"reviewStart": "2026-10-05"/)
  assert.equal(reviewStartOf(parsePiFormSetup(text)), '2026-10-05')
  // Not a real day, another format, a number: the file is refused as a whole with the reason (the strict reader).
  for (const bad of ['2026-02-30', '21-09-2026', '2026-9-21', 20260921, '1999-12-31', '2026-09-21T00:00:00Z']) {
    assert.throws(() => parsePiFormSetup(JSON.stringify({ ...JSON.parse(older), reviewStart: bad })), /reviewStart \(PI Review starts from\) is not a date/)
    assert.equal(isReviewStartDay(bad), false)
  }
  assert.match(setupProblems({ ...builtInFormSetup(), reviewStart: '2026-13-01' }).join(' '), /PI Review starts from: “2026-13-01” is not a date/)
  // GIT-17: two saves meanwhile — the side that changed the date wins; both changed it: the later save.
  const base = serializePiFormSetup(builtInFormSetup())
  const mineDate = serializePiFormSetup({ ...builtInFormSetup(), reviewStart: '2026-10-05' })
  const theirsField = serializePiFormSetup({ ...builtInFormSetup(), fields: builtInFormSetup().fields.map((field) => field.id === 'remarks' ? { ...field, label: 'Remarks' } : field) })
  const merged = parsePiFormSetup(mergePiFormText(base, mineDate, theirsField, false))
  assert.equal(merged.reviewStart, '2026-10-05')
  assert.equal(merged.fields.find((field) => field.id === 'remarks').label, 'Remarks')
  const theirsDate = serializePiFormSetup({ ...builtInFormSetup(), reviewStart: '2026-11-02' })
  assert.equal(parsePiFormSetup(mergePiFormText(base, mineDate, theirsDate, true)).reviewStart, '2026-10-05')
  assert.equal(parsePiFormSetup(mergePiFormText(base, mineDate, theirsDate, false)).reviewStart, '2026-11-02')
})

test('PIR-33: the PI pickers leave out the PIs that ended before the date — by their Azure DevOps dates (own, else their Sprints’), an undated PI by its number; PI 26.4 is the first shown (TC-PIR-34)', () => {
  const cutoff = piCutoff('2026-09-21', tree, options)
  assert.equal(cutoff.how, 'dates')
  const { shown, hidden } = piOptionsFrom(options, cutoff)
  assert.deepEqual(shown, ['Q\\PI 27.1', 'Q\\PI 26.4'])
  assert.deepEqual(hidden, ['Q\\PI 26.3', 'Q\\PI 26.2'])
  // The same PI in the other year format, a Sprint's path, a name without a PI number.
  assert.equal(shownFrom('Other\\PI 2026.4', cutoff), true)
  assert.equal(shownFrom('Other\\PI 2026.3', cutoff), false)
  assert.equal(shownFrom('Q\\PI 26.3\\Sprint 6', cutoff), false)
  assert.equal(shownFrom('Q\\PI 26.4\\Sprint 2', cutoff), true)
  assert.equal(shownFrom('Q\\PI Planning', cutoff), true)
  // A PI that ends on the start day is still offered (ended before = finished on an earlier day).
  assert.equal(shownFrom('Q\\PI 26.3', piCutoff('2026-09-20', tree, options)), true)
  // A later date hides PI 26.4 too, an undated PI 27.1 (number above the last ended PI) stays.
  assert.deepEqual(piOptionsFrom(options, piCutoff('2027-01-04', tree, options)).shown, ['Q\\PI 27.1'])
  // No PI has dates (no PAT, sample data): by the number of the date's place in its year — 21 Sep 2026 is PI 26.3 of 4.
  const undated = piCutoff('2026-09-21', null, options)
  assert.equal(undated.how, 'quarter')
  assert.deepEqual(piOptionsFrom(options, undated).shown, ['Q\\PI 27.1', 'Q\\PI 26.4', 'Q\\PI 26.3'])
  assert.deepEqual(piOptionsFrom(['Q\\PI 2026.4', 'Q\\PI 2026.2'], piCutoff('2026-09-21', [])).shown, ['Q\\PI 2026.4'])
  assert.match(cutoffNote(cutoff), /^PI Review starts from (?:21 Sep\w* 2026|September 21, 2026): PIs that ended before it are not offered \(by their dates in Azure DevOps.*comments written before it are ignored/)
})

test('PIR-33: comments before the date are ignored — the latest review, the Reviewed status and the prefill use only those on or after it (UTC days) (TC-PIR-34)', () => {
  const comments = [
    comment(5, '2026-10-02T09:00:00Z', 'Thanks'),
    comment(4, '2026-09-21T00:30:00+02:00'), // 20 Sep 22:30 UTC: before
    comment(3, '2026-09-20T23:30:00-02:00'), // 21 Sep 01:30 UTC: on the day
    comment(2, '2026-06-30T10:00:00Z'),
    comment(1, 'not a date'),
  ]
  const kept = commentsFrom(comments, '2026-09-21')
  assert.deepEqual(kept.comments.map((entry) => entry.id), [5, 3])
  assert.equal(kept.ignored, 3)
  assert.deepEqual(commentsFrom(comments, '').comments.map((entry) => entry.id), [5, 4, 3, 2, 1])
  // The latest review: the newest of those kept.
  assert.equal(latestComment(kept.comments).id, 5)
  // Only an old review (June, PI 26.3): none is found — the Feature is Not reviewed and the form starts empty.
  const old = commentsFrom([comment(7, '2026-06-30T10:00:00Z', 'Feature Review for PI 26.4\nLearnings of PI 26.4:\n- old\nStruggles of PI 26.4:\n- old')], '2026-09-21')
  assert.equal(myReviewOf(old.comments, 'Rita Gomez'), undefined)
  // A review on or after the date counts for PI 26.4 (its heading names it) — PIR-49: the start date still applies.
  const mine = myReviewOf(kept.comments, 'Rita Gomez')
  assert.equal(mine.comment.id, 3)
  assert.equal(reviewCountOf({ reviewedPi: mine.split.reviewedPi }, reviewPeriodOf('Q\\PI 26.4')).counts, true)
})

test('PIR-33: the Discussions are kept with the date they were read for; a new date forgets them so they are read again (TC-PIR-34)', () => {
  setDiscussionsFrom('2026-09-21')
  assert.equal(discussionsFrom(), '2026-09-21')
  setDiscussion('example/project/1', { state: 'done', comments: [], capped: false, readAt: '2026-11-25T10:00:00Z', from: '2026-09-21', ignored: 2 })
  setDiscussionsFrom('2026-09-21')
  assert.ok(discussionOf('example/project/1'))
  setDiscussionsFrom('2026-10-05')
  assert.equal(discussionOf('example/project/1'), undefined)
  setDiscussionsFrom('2026-09-21')
  clearDiscussions()
})

test('PIR-33: the next PI is never suggested before the date — the Close pop-up of an old Feature without dates leaves Moves to empty and says why (TC-PIR-34)', () => {
  const today = new Date('2026-11-25T12:00:00Z')
  // With dates: today's PI 26.4 → PI 27.1, after the date: unchanged.
  const fromDates = nextPiOf('Q\\PI 26.2', tree, options, { today })
  assert.equal(notBeforeStart(fromDates, piCutoff('2026-09-21', tree, options)), fromDates)
  // Without the iterations, a Feature of PI 26.1 closed: by number PI 26.2 — before the date, so not suggested.
  const old = nextPiOf('Q\\PI 26.1', null, ['Q\\PI 26.1'], { today })
  assert.equal(old.pi, 'PI 26.2')
  const guarded = notBeforeStart(old, piCutoff('2026-09-21', null, ['Q\\PI 26.1']))
  assert.equal(guarded.pi, '')
  assert.equal(guarded.missing, true)
  assert.match(guarded.note, /PI 26\.2 is before PI Review starts \((?:21 Sep\w* 2026|September 21, 2026)\), so it is not suggested: choose the PI\.$/)
  assert.equal(guarded.short, 'The next PI would be before PI Review starts — choose the PI.')
})
