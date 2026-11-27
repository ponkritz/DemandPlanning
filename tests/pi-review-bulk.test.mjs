import test from 'node:test'
import assert from 'node:assert/strict'
import { bulkBlock, bulkSummary, bulkTargets, composeRow, failedJobs, nextPiFor, oldFormatStays, ownReviewIn, rowProblems, rowResultOf, rowStartOf, runBulkReview, sameReviewText, samePiProblem, startBulkForm } from '../src/piReviewBulk.ts'
import { rateLimitWait } from '../src/azureClient.ts'
import { commentText } from '../src/workItemEdit.ts'
import { buildReviewComment, emptyReviewForm, postReview, updateReview } from '../src/piReviewPost.ts'
import { builtInFormSetup } from '../src/piReviewSetup.ts'

// PIR-36, PIR-37: one PI review for several Features in My PI Review — which rows can be ticked, the form and the comment
// (the same as the single form's), and the job: a new comment or my review replaced per Feature, a failure on one not
// stopping the others. Synthetic data only.
const config = { organization: 'org', project: 'Quality', team: 'T' }
const feature = (id, iterationPath = 'Q\\PI 26.4') => ({ key: `org/quality/${id}`, id, title: `Feature ${id}`, type: 'Feature', state: 'Active', assignedTo: 'Rita Gomez', assignedToEmail: 'rita.gomez@example.com', iterationPath })
const it = (path, start, finish) => ({ name: path.split('\\').at(-1), path, attributes: { startDate: `${start}T00:00:00Z`, finishDate: `${finish}T00:00:00Z` } })
const tree = [it('Q\\PI 26.3', '2026-06-22', '2026-09-20'), it('Q\\PI 26.4', '2026-09-21', '2026-12-20'), it('Q\\PI 27.1', '2026-12-21', '2027-03-21')]
const today = new Date('2026-11-25T12:00:00Z')
const done = { state: 'done', comments: [], capped: false, readAt: '2026-11-25T10:00:00Z' }

test('PIR-36: a row can be ticked only when Write review… could post it and whether my review is there is known — each other row says why (TC-PIR-38)', () => {
  assert.equal(bulkBlock('', { discussion: done }), '')
  // The rights and the page's reasons of Write review… come first, word for word (View as, sample data, not the assignee…).
  assert.equal(bulkBlock('Read only while viewing as Ben Okafor: nothing is posted to Azure DevOps. Exit View as to post a review.', { discussion: done }), 'Read only while viewing as Ben Okafor: nothing is posted to Azure DevOps. Exit View as to post a review.')
  assert.equal(bulkBlock('', { discussion: done, busy: 'Feature #7 is in the running job.' }), 'Feature #7 is in the running job.')
  // PIR-49: which review is mine for the PI goes by its heading — the PI dates are no longer waited for.
  assert.equal(bulkBlock('', { discussion: done }), '')
  assert.match(bulkBlock('', { discussion: undefined }), /Discussion is still being read/)
  assert.match(bulkBlock('', { discussion: { state: 'loading' } }), /Discussion is still being read/)
  assert.equal(bulkBlock('', { discussion: { state: 'error', error: 'Azure DevOps refused the PAT (401).' } }), 'Its Discussion could not be read (Azure DevOps refused the PAT (401)), so whether your review is there is not known.')
  assert.match(bulkBlock('', { discussion: { ...done, capped: true } }), /could not be read in full/)
})

test('PIR-36: the ticked Features become targets — my review of the chosen PI to replace where I have one; one form for one PI, started as the single form starts (TC-PIR-38)', () => {
  const items = [feature(201), feature(202), feature(205)]
  const targets = bulkTargets(items, (item) => item.id === 202 ? { comment: { id: 41, date: '2026-11-20T10:00:00Z' } } : undefined)
  assert.deepEqual(targets.map((target) => [target.item.id, target.replace?.commentId]), [[201, undefined], [202, 41], [205, undefined]])
  const writing = startBulkForm(targets, 'Q\\PI 26.4', items, builtInFormSetup(), { list: tree }, today)
  assert.equal(writing.problem, '')
  // Moves to by the same rule as the single form (today's PI 26.4 → PI 27.1 from the dates); the form setup's defaults,
  // never prefilled from one Feature's comment; the headings name the reviewed PI.
  assert.deepEqual(writing.next, nextPiFor('Q\\PI 26.4', items, builtInFormSetup(), { list: tree }, today))
  assert.equal(writing.next.pi, 'PI 27.1')
  assert.deepEqual(writing.initial, { ...emptyReviewForm('PI 27.1'), reviewedPi: 'PI 26.4' })
  assert.equal(writing.initial.move, 'No', 'No pre-selected, as the single form')
  // Features of different PIs: one comment cannot name both — the pop-up says so and does not post.
  assert.match(startBulkForm(bulkTargets([feature(1), feature(2, 'Q\\PI 26.3')], () => undefined), '', items, builtInFormSetup(), { list: tree }, today).problem, /^The ticked Features are in different PIs \(PI 26\.4, PI 26\.3\)/)
  assert.equal(samePiProblem([{ id: 1, pi: 'Q\\PI 26.4' }, { id: 2, pi: 'q\\pi 26.4' }]), '')
})

// The writes the review writer gives the job, with a fake Azure DevOps: each Feature's Discussion as it is now (my own
// review comment ID or none), posts and edits through the real postReview / updateReview with a recording transport.
// gate: a promise each write waits for (to hold writes in flight); inFlight / most: the requests under way.
function fakeWrites({ own = {}, failPost = [], failRead = [], failReread = [], busy = [], gate, limited = {} } = {}) {
  const sent = [], reads = [], counter = { inFlight: 0, most: 0 }
  const track = async (work) => { counter.inFlight += 1; counter.most = Math.max(counter.most, counter.inFlight); try { return await work() } finally { counter.inFlight -= 1 } }
  const transport = (request) => track(async () => {
    if (gate) await gate.promise
    sent.push({ id: request.workItemId, operation: request.operation, commentId: request.commentId, text: request.comment })
    if (limited[request.workItemId] > 0) { limited[request.workItemId] -= 1; throw new Error('Azure DevOps is limiting requests (429). Retry after 1 s. The comment was not added: post it again later.') }
    if (request.operation === 'add-comment' && failPost.includes(request.workItemId)) throw new Error('Azure DevOps did not add the comment (503): Service unavailable')
    return { id: request.commentId ?? 900 + sent.length }
  })
  return { sent, reads, counter, writes: {
    busy: (item) => busy.includes(item.id) ? `A review of #${item.id} is being written already.` : '',
    ownNow: (item) => track(async () => { reads.push(item.id); if (failRead.includes(item.id)) throw new Error('Network error'); const comment = own[item.id]; return typeof comment === 'number' ? { id: comment, date: '2026-11-20T10:00:00Z' } : comment }),
    post: (item, _form, text) => postReview({ ...config, baseUrl: 'https://dev.azure.com/org' }, 'p', item, text, transport),
    edit: (item, commentId, _form, text) => updateReview(config, 'p', item, commentId, text, transport),
    reread: (item) => track(async () => { reads.push(item.id); if (failReread.includes(item.id)) throw new Error('Network error') }),
  } }
}
const form = { ...emptyReviewForm('PI 27.1'), learnings: 'Book the rig early', struggles: 'Parts late', mode: 'Offline Review', reviewedPi: 'PI 26.4' }
const jobOf = (target, values = form) => ({ target, form: values, text: buildReviewComment(values, builtInFormSetup()) })
const noSleep = { rateWait: rateLimitWait, sleep: async () => undefined }

test('PIR-37: per Feature a new comment, or my review replaced — the very comment the single form builds from its answers (TC-PIR-39)', async () => {
  const { sent, reads, writes } = fakeWrites({ own: { 202: 41 } })
  const lines = []
  const outcomes = await runBulkReview([jobOf({ item: feature(201) }), jobOf({ item: feature(202), replace: { commentId: 41, date: '2026-11-20T10:00:00Z' } }), jobOf({ item: feature(205) })], writes, (line) => lines.push(line))
  assert.deepEqual(outcomes.map((entry) => [entry.item.id, entry.result]), [[201, 'posted'], [202, 'replaced'], [205, 'posted']])
  assert.deepEqual(sent.map((entry) => [entry.id, entry.operation, entry.commentId]).sort((a, b) => a[0] - b[0]), [[201, 'add-comment', undefined], [202, 'update-comment', 41], [205, 'add-comment', undefined]])
  for (const entry of sent) assert.equal(entry.text, buildReviewComment(form, builtInFormSetup()))
  // Read before each write (replace only the comment still mine) and again after it (the table's refresh).
  assert.deepEqual([...reads].sort(), [201, 201, 202, 202, 205, 205])
  assert.ok(lines.some((line) => /^\d of 3 done · replacing your review of #202…$/.test(line)), lines.join(' | '))
  assert.ok(lines.some((line) => /^\d of 3 done · posting the review of #205…$/.test(line)))
  assert.deepEqual(bulkSummary(outcomes), { text: 'Posted 2 (#201, #205) · Replaced 1 (#202) · Failed 0.', failed: false })
})

test('PIR-37: a failure on one Feature does not stop the others; a review changed since the pop-up opened is never overwritten nor posted twice (TC-PIR-39)', async () => {
  const { sent, writes } = fakeWrites({ own: { 203: 77, 204: 55 }, failPost: [201], failRead: [206], failReread: [207], busy: [208] })
  const targets = [
    { item: feature(201) }, // the post fails
    { item: feature(202) }, // posted
    { item: feature(203), replace: { commentId: 41, date: '2026-11-20T10:00:00Z' } }, // my review is another comment now
    { item: feature(204) }, // I have a review now (posted elsewhere meanwhile)
    { item: feature(205), replace: { commentId: 42, date: '2026-11-20T10:00:00Z' } }, // my review is gone
    { item: feature(206) }, // its Discussion cannot be read
    { item: feature(207) }, // posted, but not read back
    { item: feature(208) }, // a single post of it is running
  ]
  const outcomes = await runBulkReview(targets.map((target) => jobOf(target)), writes)
  assert.deepEqual(outcomes.map((entry) => [entry.item.id, entry.result]), [[201, 'failed'], [202, 'posted'], [203, 'failed'], [204, 'failed'], [205, 'failed'], [206, 'failed'], [207, 'posted'], [208, 'failed']])
  assert.deepEqual(sent.map((entry) => [entry.id, entry.operation]).sort((a, b) => a[0] - b[0]), [[201, 'add-comment'], [202, 'add-comment'], [207, 'add-comment']], 'nothing sent for 203…206 and 208')
  const why = Object.fromEntries(outcomes.map((entry) => [entry.item.id, entry.reason ?? entry.note]))
  assert.match(why[201], /^Azure DevOps did not add the comment \(503\)/)
  // KB-155: each reason says what happened and what to do.
  assert.equal(why[203], 'Your review of this PI was changed in Azure DevOps after the pop-up opened (it is another comment now). Nothing was changed: tick #203 again and use Update review… to replace it.')
  assert.equal(why[204], 'Your review of this PI was posted in Azure DevOps after the pop-up opened (it has your review of this PI now). Nothing was posted: tick #204 again and use Update review… to replace it.')
  assert.equal(why[205], 'Your review of this PI was deleted in Azure DevOps after the pop-up opened (it is no longer in its Discussion). Nothing was posted: tick #205 again and use Update review… to post it as a new comment.')
  assert.match(why[206], /^Its Discussion could not be read: Network error\. Nothing was posted\.$/)
  assert.match(why[207], /could not be read again/)
  assert.match(why[208], /being written already/)
  const summary = bulkSummary(outcomes)
  assert.equal(summary.failed, true)
  assert.match(summary.text, /^Posted 2 \(#202, #207\) · Replaced 0 · Failed 6 \(#201, #203, #204, #205, #206, #208\)\. #201: Azure DevOps did not add the comment/)
})

test('PIR-37: a review edited elsewhere under the same comment ID is never overwritten (TC-PIR-39)', async () => {
  const date = '2026-11-20T10:00:00Z', updated = '2026-11-21T10:00:00Z'
  const { sent, writes } = fakeWrites({ own: { 201: { id: 41, date, updated } } })
  const stale = await runBulkReview([jobOf({ item: feature(201), replace: { commentId: 41, date } })], writes, undefined, noSleep)
  assert.match(stale[0].reason, /Your review was edited in Azure DevOps since the pop-up opened/)
  assert.equal(sent.length, 0)
  const current = await runBulkReview([jobOf({ item: feature(201), replace: { commentId: 41, date: updated } })], writes, undefined, noSleep)
  assert.equal(current[0].result, 'replaced')
  assert.deepEqual(sent.map(({ operation, commentId }) => [operation, commentId]), [['update-comment', 41]])
})

// PIR-84: the run — 3 at a time, the outcomes in the rows' order, the rate-limit handling of the reads, Retry failed.
test('PIR-84: the writes run 3 at a time — never more requests in flight, the outcomes in the rows’ order, a failure not stopping the others; Retry failed re-runs only the failed rows with the same values (TC-PIR-84)', async () => {
  let open
  const gate = { promise: new Promise((resolve) => { open = resolve }) }
  const { sent, counter, writes } = fakeWrites({ failPost: [203], gate })
  const own = (id, reason) => jobOf({ item: feature(id) }, { ...form, move: 'Yes', moveReason: reason })
  const jobs = [own(201, 'Vendor parts in January'), own(202, 'Audit left'), own(203, 'Rig late'), own(204, 'Scope split'), own(205, 'Tests left')]
  const lines = []
  const running = runBulkReview(jobs, writes, (line) => lines.push(line), noSleep)
  // Three writes wait in flight (the reads before them have answered); the fourth row has not started.
  for (let turn = 0; turn < 200 && counter.inFlight < 3; turn += 1) await new Promise((resolve) => setImmediate(resolve))
  assert.equal(counter.inFlight, 3)
  open()
  const outcomes = await running
  assert.ok(counter.most <= 3, `at most 3 in flight (was ${counter.most})`)
  assert.equal(counter.most, 3, 'three at a time, not one after another')
  assert.deepEqual(outcomes.map((entry) => [entry.item.id, entry.result]), [[201, 'posted'], [202, 'posted'], [203, 'failed'], [204, 'posted'], [205, 'posted']])
  // Each row posts its own comment (its own reason).
  for (const job of jobs.filter((entry) => entry.target.item.id !== 203)) assert.equal(sent.find((entry) => entry.id === job.target.item.id)?.text, job.text)
  // The progress counts the rows done, "n of N done", rising as they finish.
  const counts = lines.map((line) => Number(/^(\d) of 5 done · /.exec(line)?.[1]))
  assert.ok(counts.every((count, at) => Number.isInteger(count) && (at === 0 || count >= counts[at - 1])), lines.join(' | '))
  assert.ok(counts.at(-1) >= 3)
  // Retry failed: only #203, with the very same comment.
  const again = failedJobs(jobs, outcomes)
  assert.deepEqual(again.map((job) => job.target.item.id), [203])
  assert.equal(again[0], jobs[2])
  const retry = fakeWrites()
  assert.deepEqual((await runBulkReview(again, retry.writes, undefined, noSleep)).map((entry) => [entry.item.id, entry.result]), [[203, 'posted']])
  assert.deepEqual(retry.sent.map((entry) => [entry.id, entry.text]), [[203, jobs[2].text]])
})

test('PIR-84: Azure DevOps asks to slow down (429) — the row waits for Retry-After and is written once; a second 429 stops the run and the rows not written fail, to be retried (TC-PIR-84)', async () => {
  const waits = []
  const once = fakeWrites({ limited: { 202: 1 } })
  const first = await runBulkReview([jobOf({ item: feature(201) }), jobOf({ item: feature(202) })], once.writes, undefined, { rateWait: rateLimitWait, sleep: async (ms) => { waits.push(ms) } })
  assert.deepEqual(first.map((entry) => entry.result), ['posted', 'posted'])
  assert.deepEqual(waits, [1000])
  assert.equal(once.sent.filter((entry) => entry.id === 202 && entry.operation === 'add-comment').length, 2, 'refused once (429, not added), then added')
  const twice = fakeWrites({ limited: { 202: 2 } })
  const stopped = await runBulkReview([jobOf({ item: feature(202) }), jobOf({ item: feature(203) }), jobOf({ item: feature(204) }), jobOf({ item: feature(205) })], twice.writes, undefined, { concurrency: 1, ...noSleep })
  assert.deepEqual(stopped.map((entry) => entry.result), ['failed', 'failed', 'failed', 'failed'])
  assert.match(stopped[0].reason, /asked to slow down \(429\) again, so the run stopped\. Use Retry failed/)
  assert.equal(twice.sent.filter((entry) => entry.id !== 202).length, 0, 'nothing more written once stopped')
})

// PIR-82…PIR-84: the rows of the grid.
const rita = { email: 'rita.gomez@example.com', name: 'Rita Gomez' }
const setup = builtInFormSetup()
const headed = (id, values, author = { author: 'Rita Gomez', authorEmail: 'rita.gomez@example.com' }, date = '2026-11-20T10:00:00Z') => ({ id, text: commentText(buildReviewComment({ ...emptyReviewForm('PI 27.1'), reviewedPi: 'PI 26.4', ...values }, setup)), date, ...author })
const read = (comments) => ({ ...done, comments })
const mineValues = { learnings: 'Calibrate first', struggles: 'Parts late', move: 'No', mode: 'Offline Review' }
function grid(discussions, others = false) {
  const items = Object.keys(discussions).map((id) => feature(Number(id)))
  return startBulkForm(items.map((item) => ({ item })), 'Q\\PI 26.4', items, setup, { list: tree }, today, (item, movePi) => rowStartOf(discussions[item.id], 'Q\\PI 26.4', rita, setup, movePi, others))
}

test('PIR-83: each row starts from that Feature’s review — mine (replaced), someone else’s (a new comment of mine), my old-format comment (a new comment, it stays), else the defaults; the shared fields default to Keep each Feature’s own (TC-PIR-83)', () => {
  const writing = grid({
    201: read([headed(61, mineValues)]),
    202: read([headed(62, { ...mineValues, learnings: 'Ben’s learning', move: 'Yes', moveReason: 'Vendor', movePi: 'PI 27.1', mode: 'Discuss during Meeting' }, { author: 'Ben Okafor', authorEmail: 'ben.okafor@example.com' })]),
    203: read([{ id: 63, text: 'Struggles: parts late\nLearnings: calibrate the rig\nFeature needs to be shifted to PI.27.1', date: '2026-11-19T09:00:00Z', author: 'Rita Gomez', authorEmail: 'rita.gomez@example.com' }]),
    204: read([]),
  })
  assert.deepEqual(writing.rows.map((row) => row.start.from), ['mine', 'other', 'old', 'none'])
  assert.deepEqual(writing.targets.map((target) => target.replace?.commentId), [61, undefined, undefined, undefined])
  assert.deepEqual(writing.rows.map((row) => row.values.move), ['No', 'Yes', 'Yes', 'No'])
  assert.equal(writing.rows[1].values.moveReason, 'Vendor')
  assert.equal(writing.rows[1].values.choices.review, 'Discuss during Meeting')
  assert.equal(writing.rows[2].start.form.learnings, 'calibrate the rig')
  assert.match(writing.rows[2].values.moveReason, /shifted to PI\.27\.1/)
  assert.equal(writing.rows[3].values.choices.review, '', 'the advice has no default')
  assert.deepEqual(writing.shared.modes, { learnings: 'own', struggles: 'own', remarks: 'own' })
  // Nobody has a review: the shared text goes to all.
  assert.deepEqual(grid({ 204: read([]), 205: read([]) }).shared.modes, { learnings: 'shared', struggles: 'shared', remarks: 'shared' })
  // A lead showing another person's Features: never mine — the row starts from the latest review and posts a new one.
  const lead = grid({ 201: read([headed(61, mineValues)]) }, true)
  assert.equal(lead.rows[0].start.from, 'other')
  assert.equal(lead.targets[0].replace, undefined)
})

test('PIR-82, PIR-83: a row’s review — its own paragraphs (Keep each Feature’s own) or the shared text (Use the shared text; a row without its own always), its own Move, Reason and advice (TC-PIR-82)', () => {
  const writing = grid({ 201: read([headed(61, mineValues)]), 204: read([]) })
  const shared = { ...writing.shared, form: { ...writing.shared.form, learnings: 'Shared learning', struggles: 'Shared struggle', remarks: 'Shared remark' } }
  const [mine, none] = writing.rows
  const own = composeRow(mine, shared, setup)
  assert.equal(own.learnings, 'Calibrate first', 'kept its own')
  assert.equal(own.remarks, 'Shared remark', 'its own is empty: the shared text')
  assert.equal(composeRow(none, shared, setup).learnings, 'Shared learning')
  const all = { ...shared, modes: { ...shared.modes, learnings: 'shared' } }
  assert.equal(composeRow(mine, all, setup).learnings, 'Shared learning')
  assert.equal(composeRow(mine, all, setup).struggles, 'Parts late', 'Struggles still its own')
  const yes = composeRow({ ...none, values: { ...none.values, move: 'Yes', moveReason: 'Audit left', choices: { review: 'Offline Review' } } }, shared, setup)
  assert.deepEqual([yes.move, yes.movePi, yes.moveReason, yes.mode, yes.reviewedPi], ['Yes', 'PI 27.1', 'Audit left', 'Offline Review', 'PI 26.4'])
  assert.match(buildReviewComment(yes, setup), /^<p>Feature Review for PI 26\.4<\/p>.*shifted to PI 27\.1 : Yes<ul><li>Audit left<\/li><\/ul>/)
})

test('PIR-82: per row, the Reason is optional with Yes (as the single form) but Moves to is checked; No needs none and its reason is not posted (TC-PIR-82)', () => {
  const base = { ...form, reviewedPi: 'PI 26.4' }
  assert.deepEqual(rowProblems({ ...base, move: 'No', moveReason: '' }, setup), [])
  assert.deepEqual(rowProblems({ ...base, move: 'Yes', moveReason: '  ' }, setup), [], 'Yes without a reason is allowed')
  assert.deepEqual(rowProblems({ ...base, move: 'Yes', moveReason: 'Vendor parts in January' }, setup), [])
  assert.match(rowProblems({ ...base, move: 'Yes', moveReason: 'x', movePi: 'next one' }, setup).join(' '), /Enter the PI it moves to/)
  assert.match(rowProblems({ ...base, move: 'No', mode: '' }, setup).join(' '), /Review meeting or review it offline/)
})

test('PIR-84: the preview of each row — Replace (my review changed), Unchanged (the comment equals mine: skipped), Post (none of mine; an old-format comment stays), Blocked (the reason); problems only for rows written (TC-PIR-84)', () => {
  const writing = grid({
    201: read([headed(61, mineValues)]),
    202: read([headed(62, mineValues)]),
    203: read([{ id: 63, text: 'Struggles: parts late\nLearnings: calibrate first\nMoving to next PI: No', date: '2026-11-19T09:00:00Z', author: 'Rita Gomez', authorEmail: 'rita.gomez@example.com' }]),
    204: read([]),
  })
  const shared = { ...writing.shared, form: { ...writing.shared.form, learnings: 'L', struggles: 'S' } }
  const [untouched, changed, old, none] = writing.rows
  assert.equal(rowResultOf(untouched, shared, setup).kind, 'unchanged')
  assert.deepEqual(rowResultOf(untouched, shared, setup).problems, [])
  const edited = { ...changed, values: { ...changed.values, move: 'Yes', moveReason: 'Vendor' } }
  assert.equal(rowResultOf(edited, shared, setup).kind, 'replace')
  assert.equal(rowResultOf(old, shared, setup).kind, 'post')
  assert.match(oldFormatStays, /^New \(old-format comment stays — use Convert… to replace it\)$/)
  assert.equal(rowResultOf(none, shared, setup).kind, 'post')
  assert.match(rowResultOf(none, shared, setup).problems.join(' '), /Review meeting/, 'the advice is still to choose')
  const blocked = rowResultOf(changed, shared, setup, 'Read only while viewing as Ben Okafor.')
  assert.deepEqual([blocked.kind, blocked.reason, blocked.problems], ['blocked', 'Read only while viewing as Ben Okafor.', []])
  // Unchanged compares the comment as Azure DevOps holds it, read as plain text (spaces and line breaks aside).
  assert.equal(sameReviewText(buildReviewComment({ ...form }, setup), commentText(buildReviewComment({ ...form }, setup)).replace(/\n/g, '\n\n  ')), true)
  assert.equal(sameReviewText(buildReviewComment({ ...form }, setup), commentText(buildReviewComment({ ...form, remarks: 'x' }, setup))), false)
  // The summary names what was not written.
  assert.equal(bulkSummary([{ item: feature(201), result: 'unchanged' }, { item: feature(202), result: 'replaced' }, { item: feature(204), result: 'blocked', reason: 'Read only.' }]).text, 'Posted 0 · Replaced 1 (#202) · Unchanged 1 (#201) not written · Blocked 1 (#204) · Failed 0. #204: Read only.')
})

// KB-155, PIR-80: the one comparison of the pop-up and of the job's check — my newest comment headed for the reviewed PI.
test('PIR-80: my review of the PI in a Discussion — headed for it in either label form, mine by email else by name; not an old-format comment, another PI or another person’s; none unread or for others (TC-PIR-80)', () => {
  const rita = { email: 'rita.gomez@example.com', name: 'Rita Gomez' }
  const review = (id, pi, date, author = { author: 'Rita Gomez', authorEmail: 'rita.gomez@example.com' }) => ({ id, text: buildReviewComment({ ...emptyReviewForm(), learnings: 'L', struggles: 'S', move: 'No', mode: 'Offline Review', reviewedPi: pi }), date, ...author })
  const read = (comments) => ({ ...done, comments })
  const headed = review(61, 'PI 2026.4', '2026-11-20T10:00:00Z'), short = review(62, 'PI 26.4', '2026-11-19T10:00:00Z')
  assert.equal(ownReviewIn(read([headed]), 'Q\\PI 26.4', rita)?.comment.id, 61)
  assert.equal(ownReviewIn(read([short]), 'Q\\PI 2026.4', rita)?.comment.id, 62, 'PI 26.4 is PI 2026.4')
  assert.equal(ownReviewIn(read([short, headed]), 'Q\\PI 26.4', rita)?.comment.id, 61, 'the newest of mine')
  // Not mine for the PI: an old-format comment without the heading, a review of another PI, someone else's review.
  assert.equal(ownReviewIn(read([{ id: 63, text: 'Struggles: parts late\nLearnings: calibrate first', date: '2026-11-21T10:00:00Z', author: 'Rita Gomez', authorEmail: 'rita.gomez@example.com' }]), 'Q\\PI 26.4', rita), undefined)
  assert.equal(ownReviewIn(read([review(64, 'PI 26.3', '2026-11-21T10:00:00Z')]), 'Q\\PI 26.4', rita), undefined)
  assert.equal(ownReviewIn(read([review(65, 'PI 26.4', '2026-11-21T10:00:00Z', { author: 'Ben Okafor', authorEmail: 'ben.okafor@example.com' })]), 'Q\\PI 26.4', rita), undefined)
  // By email where both are known (a different display name is still mine); by name without an email.
  assert.equal(ownReviewIn(read([review(66, 'PI 26.4', '2026-11-21T10:00:00Z', { author: 'Gomez, Rita', authorEmail: 'Rita.Gomez@example.com' })]), 'Q\\PI 26.4', rita)?.comment.id, 66)
  assert.equal(ownReviewIn(read([review(67, 'PI 26.4', '2026-11-21T10:00:00Z', { author: 'rita  gomez' })]), 'Q\\PI 26.4', { name: 'Rita Gomez' })?.comment.id, 67)
  // Nothing when the Discussion is not read (still reading, failed) or for a lead showing another person.
  assert.equal(ownReviewIn({ state: 'loading' }, 'Q\\PI 26.4', rita), undefined)
  assert.equal(ownReviewIn({ state: 'error', error: 'x' }, 'Q\\PI 26.4', rita), undefined)
  assert.equal(ownReviewIn(undefined, 'Q\\PI 26.4', rita), undefined)
  assert.equal(ownReviewIn(read([headed]), 'Q\\PI 26.4', rita, undefined, true), undefined)
})
