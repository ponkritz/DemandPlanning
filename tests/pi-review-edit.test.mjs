import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { buildReviewComment, discussionReadBlock, editTargetOf, isOwnComment, ownFeatures, ownReadBlock, ownReviewOf, readDiscussionInto, reviewCountOf, reviewPeriodOf, updateReview } from '../src/piReviewPost.ts'
import { discussionOf } from '../src/piReview.ts'
import { guardAzureWrites, readDiscussion, requestAzure, shownDateOf } from '../src/azureDevOps.ts'

// PIR-34: Edit review… in My PI Review — the comment it edits (the viewer's own review that counts for the chosen PI),
// the update-comment write (web and desktop proxy) and its checks. Synthetic data only.
const require = createRequire(import.meta.url)
const config = { organization: 'org', project: 'Quality', team: 'T' }
const form = (learnings, reviewedPi = 'PI 26.4') => ({ learnings, struggles: 'None', move: 'No', moveReason: '', movePi: 'PI 27.1', mode: 'Offline Review', remarks: '', reviewedPi })
const review = (id, date, learnings, author = 'Rita Gomez', authorEmail = 'rita.gomez@example.com', reviewedPi) => ({ id, date, text: buildReviewComment(form(learnings, reviewedPi)).replace(/<[^>]+>/g, '\n'), author, ...(authorEmail ? { authorEmail } : {}) })
const it = (path, start, finish) => ({ name: path.split('\\').at(-1), path, attributes: { startDate: `${start}T00:00:00Z`, finishDate: `${finish}T00:00:00Z` } })
const tree = [it('Q\\PI 26.3', '2026-06-22', '2026-09-20'), it('Q\\PI 26.4', '2026-09-21', '2026-12-20')]
const counts = (feature = { state: 'Active' }) => (entry) => reviewCountOf(entry, feature, reviewPeriodOf('Q\\PI 26.4', tree)).counts
const rita = { email: 'rita.gomez@example.com', name: 'Rita Gomez' }

test('PIR-34: a comment is the viewer’s own by the author’s email when Azure DevOps gives it, else by the display name (TC-PIR-35)', () => {
  assert.equal(isOwnComment({ author: 'Rita Gomez', authorEmail: 'Rita.Gomez@example.com' }, rita), true)
  // Same display name, another person's email: not mine (two people with one name).
  assert.equal(isOwnComment({ author: 'Rita Gomez', authorEmail: 'rita.gomez2@example.com' }, rita), false)
  // No author email: by the name, letter case and spaces ignored.
  assert.equal(isOwnComment({ author: ' rita  gomez ' }, rita), true)
  assert.equal(isOwnComment({ author: 'Ben Okafor' }, rita), false)
  // My email unknown: by the name.
  assert.equal(isOwnComment({ author: 'Rita Gomez', authorEmail: 'rita.gomez@example.com' }, { name: 'Rita Gomez' }), true)
  assert.equal(isOwnComment({ author: 'Rita Gomez' }, {}), false, 'nothing known about me: never mine')
})

test('PIR-34: Edit review… edits only my newest review comment, and only when it counts for the chosen PI — never someone else’s (TC-PIR-35)', () => {
  const mine = review(11, '2026-10-05T10:00:00Z', 'Calibrate first')
  const bens = review(12, '2026-11-01T10:00:00Z', 'Ben’s view', 'Ben Okafor', 'ben.okafor@example.com')
  const chat = { id: 13, date: '2026-11-02T10:00:00Z', text: 'Thanks!', author: 'Rita Gomez', authorEmail: 'rita.gomez@example.com' }
  // The newest own comment with the review headings — Ben's newer review and my plain chat comment are skipped.
  assert.equal(editTargetOf([chat, bens, mine], rita, counts()).comment.id, 11)
  // Only Ben's review: nothing to edit for me (a lead viewing Ben gets no Edit either: the page never asks for him).
  assert.equal(editTargetOf([bens], rita, counts()), undefined)
  assert.equal(editTargetOf([bens], { email: 'ben.okafor@example.com', name: 'Ben Okafor' }, counts()).comment.id, 12)
  // My newest review is for PI 26.3 (its heading names it): not editable for PI 26.4 — Write review… posts a new one;
  // an older review of mine for PI 26.4 is not picked either (the newest review is the one the page shows).
  const older = review(9, '2026-09-25T10:00:00Z', 'Old')
  const other = review(10, '2026-10-10T10:00:00Z', 'For the last PI', 'Rita Gomez', 'rita.gomez@example.com', 'PI 26.3')
  assert.equal(editTargetOf([other, older], rita, counts()), undefined)
  // Two comments of mine at the same time: the higher ID.
  assert.equal(editTargetOf([review(20, '2026-10-05T10:00:00Z', 'A'), review(21, '2026-10-05T10:00:00Z', 'B')], rita, counts()).comment.id, 21)
})

test('PIR-34: the edit is sent as update-comment — PATCH …/comments/{id} with the app-built HTML, the review’s rights and checks; nothing sent otherwise (TC-PIR-35)', async () => {
  const can = (list) => (key) => list.includes(key)
  const original = globalThis.fetch, sent = []
  globalThis.window = {}
  try {
    globalThis.fetch = async (url, init) => { sent.push({ url, method: init.method, body: init.body }); return new Response('{"id":11}', { status: 200, headers: { 'content-type': 'application/json' } }) }
    guardAzureWrites(can(['work.comment']), undefined, 'rita.gomez@example.com')
    const html = buildReviewComment(form('<b>Calibrate</b> & "first"'))
    assert.equal(await updateReview(config, 'p', { id: 7, assignedToEmail: 'rita.gomez@example.com' }, 11, html), 11)
    assert.equal(sent[0].url, 'https://dev.azure.com/org/Quality/_apis/wit/workItems/7/comments/11?api-version=7.1-preview.4')
    assert.equal(sent[0].method, 'PATCH')
    assert.deepEqual(JSON.parse(sent[0].body), { text: html })
    // Someone else's Feature without the lead right; markup the app does not build; an update without a comment id or
    // outside a PI review; a comment id on another operation — all refused before anything is sent.
    await assert.rejects(updateReview(config, 'p', { id: 7, assignedToEmail: 'ben.okafor@example.com' }, 11, html), /Only the Feature’s assignee or a lead/)
    await assert.rejects(updateReview(config, 'p', { id: 7, assignedToEmail: 'rita.gomez@example.com' }, 11, '<ul><li onclick="x">A</li></ul>'), /markup the app does not send/)
    await assert.rejects(updateReview(config, 'p', { id: 7, assignedToEmail: 'rita.gomez@example.com' }, 0, html), /Only a PI review can be edited/)
    await assert.rejects(requestAzure({ ...config, pat: 'p', operation: 'update-comment', workItemId: 7, commentId: 11, comment: 'plain' }), /Only a PI review can be edited/)
    await assert.rejects(requestAzure({ ...config, pat: 'p', operation: 'add-comment', workItemId: 7, commentId: 11, comment: 'x' }), /Invalid comment/)
    await assert.rejects(updateReview({ ...config, baseUrl: 'https://tfs.example.com/tfs/Coll' }, 'p', { id: 7, assignedToEmail: 'rita.gomez@example.com' }, 11, html), /dev\.azure\.com\) only/)
    assert.equal(sent.length, 1, 'only the allowed edit was sent')
    // A refusal by Azure DevOps (e.g. not the author) says so; the caller offers "Post as a new review instead".
    globalThis.fetch = async () => new Response('{"message":"Only the author can edit"}', { status: 400, headers: { 'content-type': 'application/json' } })
    await assert.rejects(updateReview(config, 'p', { id: 7, assignedToEmail: 'rita.gomez@example.com' }, 11, html), /did not update the comment \(400\): Only the author can edit/)
  } finally { delete globalThis.window; globalThis.fetch = original; guardAzureWrites(() => true) }
})

test('PIR-34 (SM-192): the desktop proxy sends update-comment as PATCH to the fixed comment address, only with the review HTML allowlist and a comment id; dev.azure.com only (TC-PIR-35)', async () => {
  const { azureCommentsRequest, requestAzureDevOps } = require('../electron/azure-devops.cjs')
  const base = { organization: 'org', project: 'Quality', team: 'T', pat: 'p', workItemId: 7, operation: 'update-comment', commentId: 11, reviewOf: 'rita.gomez@example.com', htmlComment: true }
  const html = buildReviewComment(form('<script>x</script> & "q"'))
  const request = azureCommentsRequest({ ...base, comment: html })
  assert.equal(request.url, 'https://dev.azure.com/org/Quality/_apis/wit/workItems/7/comments/11?api-version=7.1-preview.4')
  assert.equal(request.options.method, 'PATCH')
  assert.equal(JSON.parse(request.options.body).text, html)
  assert.throws(() => azureCommentsRequest({ ...base, comment: '<img src=x>' }), /markup the app does not send/)
  assert.throws(() => azureCommentsRequest({ ...base, comment: html, htmlComment: undefined }), /Only a PI review can be edited/)
  assert.throws(() => azureCommentsRequest({ ...base, comment: html, commentId: -1 }), /Only a PI review can be edited/)
  assert.throws(() => azureCommentsRequest({ ...base, operation: 'add-comment', comment: html }), /Invalid comment/)
  await assert.rejects(requestAzureDevOps({ ...base, baseUrl: 'https://tfs.example.com/tfs/Coll', comment: html }, async () => { throw new Error('not sent') }), /dev\.azure\.com\) only/)
})

test('PIR-34: an edited comment keeps its createdDate — it stays in its place and counts for the same PI; the author’s email is read when Azure DevOps gives one (TC-PIR-35)', async () => {
  const transport = async () => ({ comments: [
    { id: 11, text: '<p>Learnings: x</p>', createdBy: { displayName: 'Rita Gomez', uniqueName: 'Rita.Gomez@example.com' }, createdDate: '2026-10-05T10:00:00Z', modifiedDate: '2026-11-20T08:00:00Z' },
    { id: 12, text: 'Thanks', createdBy: { displayName: 'Build Service', uniqueName: 'Build\\Service' }, createdDate: '2026-11-01T10:00:00Z', modifiedDate: '2026-11-01T10:00:00Z' },
  ] })
  const { comments } = await readDiscussion({ ...config, pat: 'p' }, 'p', 7, transport)
  assert.deepEqual(comments.map((entry) => [entry.id, entry.date, entry.authorEmail, entry.edited]), [[12, '2026-11-01T10:00:00Z', undefined, undefined], [11, '2026-10-05T10:00:00Z', 'rita.gomez@example.com', true]])
})

test('PIR-34: PI Review offers Edit review… by the same rule — my own newest review that counts for the chosen PI, never a lead’s Edit on another person’s review, none while the PI dates are read (TC-PIR-36)', () => {
  const period = reviewPeriodOf('Q\\PI 26.4', tree)
  const ritas = review(11, '2026-10-05T10:00:00Z', 'Calibrate first')
  const lenas = review(12, '2026-11-01T10:00:00Z', 'Lead’s view', 'Lena Berg', 'lena.berg@example.com')
  const lena = { email: 'lena.berg@example.com', name: 'Lena Berg' }
  // Rita's Feature with Rita's review and a newer one by Lena (a lead): Rita edits hers, Lena edits only hers.
  assert.equal(ownReviewOf([lenas, ritas], { state: 'Active' }, period, rita).comment.id, 11)
  assert.equal(ownReviewOf([lenas, ritas], { state: 'Active' }, period, lena).comment.id, 12)
  assert.equal(ownReviewOf([ritas], { state: 'Active' }, period, lena), undefined, 'a lead gets no Edit on Rita’s review')
  // Not read yet, or the PI dates still being read: no Edit (Write review… is offered).
  assert.equal(ownReviewOf(undefined, { state: 'Active' }, period, rita), undefined)
  assert.equal(ownReviewOf([ritas], { state: 'Active' }, null, rita), undefined)
  // A review for another PI does not count, so no Edit; Closed and reviewed after its Closed Date counts.
  assert.equal(ownReviewOf([review(13, '2026-07-01T10:00:00Z', 'Old', 'Rita Gomez', 'rita.gomez@example.com', 'PI 26.3')], { state: 'Active' }, period, rita), undefined)
  assert.equal(ownReviewOf([review(14, '2027-01-10T10:00:00Z', 'At close', 'Rita Gomez', 'rita.gomez@example.com', 'PI 26.3')], { state: 'Closed', closedDate: '2027-01-09T16:00:00Z' }, period, rita).comment.id, 14)
})

// PIR-35: PI Review reads my own Features' Discussions when it opens — which Features are mine, when it does not read,
// and a Discussion being read already is not requested again. Synthetic data only.
test('PIR-35: my own Features are those assigned to me — by my work email where the Feature has one, else by my name; nobody else’s (TC-PIR-37)', () => {
  const features = [
    { id: 201, assignedTo: 'Rita Gomez', assignedToEmail: 'rita.gomez@example.com' },
    { id: 202, assignedTo: 'Ben Okafor', assignedToEmail: 'ben.okafor@example.com' },
    // Same display name, another person's email: not mine.
    { id: 203, assignedTo: 'Rita Gomez', assignedToEmail: 'rita.gomez2@example.com' },
    // No email on the Feature (cached data): by the name, letter case and spaces ignored.
    { id: 204, assignedTo: ' rita gomez ' },
    { id: 205, assignedTo: '' },
  ]
  assert.deepEqual(ownFeatures(features, rita).map((item) => item.id), [201, 204])
  assert.deepEqual(ownFeatures(features, { email: 'rita.gomez@example.com' }).map((item) => item.id), [201])
  assert.deepEqual(ownFeatures(features, { name: 'Rita Gomez' }).map((item) => item.id), [201, 203, 204])
  assert.deepEqual(ownFeatures(features, {}), [], 'nothing known about me: none')
  assert.deepEqual(ownFeatures(features, undefined), [])
})

test('PIR-35: the automatic read is skipped with sample data, without a PAT, in View as and when who I am is not known — not for an on-premises server (reading is allowed there) (TC-PIR-37)', () => {
  const cloud = { organization: 'org', project: 'Quality' }, onPrem = { baseUrl: 'https://tfs.example.com/tfs/Collection', project: 'Quality' }
  const viewer = { isSample: false, config: cloud, pat: 'p', viewingAs: '' }
  assert.equal(ownReadBlock(viewer, rita), '')
  assert.equal(ownReadBlock({ ...viewer, config: onPrem }, rita), '', 'on premises: read only, but reading is allowed (as My PI Review)')
  assert.match(ownReadBlock({ ...viewer, isSample: true }, rita), /sample data/)
  assert.match(ownReadBlock({ ...viewer, pat: '  ' }, rita), /PAT/)
  assert.match(ownReadBlock({ ...viewer, config: null }, rita), /PAT/)
  assert.match(ownReadBlock({ ...viewer, viewingAs: 'Ben Okafor' }, rita), /Viewing as Ben Okafor/)
  assert.match(ownReadBlock(viewer, {}), /not known/)
  assert.match(ownReadBlock(viewer, undefined), /not known/)
  // My PI Review and PI Review give the same reason when the Discussions cannot be read at all.
  assert.equal(discussionReadBlock({ isSample: true, config: cloud, pat: 'p' }), ownReadBlock({ ...viewer, isSample: true }, rita))
})

test('PIR-35: a Discussion being read is not requested again — a second read waits for the same one; a fresh read (after a post or an edit) asks again (TC-PIR-37)', async () => {
  const sent = []
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const transport = async (request) => { sent.push(request.workItemId); await gate; return { comments: [{ id: 1, text: 'Learnings: x', createdBy: { displayName: 'Rita Gomez' }, createdDate: '2026-11-01T10:00:00Z' }] } }
  const item = { key: 'example/quality/9201', id: 9201 }
  const first = readDiscussionInto(config, 'p', item, { transport })
  const second = readDiscussionInto(config, 'p', item, { transport })
  assert.equal(discussionOf(item.key).state, 'loading')
  release()
  await Promise.all([first, second])
  assert.deepEqual(sent, [9201], 'one request for two reads')
  assert.equal(discussionOf(item.key).state, 'done')
  await readDiscussionInto(config, 'p', item, { transport, fresh: true })
  assert.deepEqual(sent, [9201, 9201], 'a fresh read asks again')
  // Once a read has finished, the next one (↻ Read again) asks again too.
  await readDiscussionInto(config, 'p', item, { transport })
  assert.equal(sent.length, 3)
})

test('PIR-38: a review shows when it was updated — the modifiedDate of an edited comment, else when it was written; which PI it counts for still goes by the written date (TC-PIR-40)', async () => {
  const transport = async () => ({ comments: [
    { id: 11, text: '<p>Learnings: x</p>', createdBy: { displayName: 'Rita Gomez', uniqueName: 'rita.gomez@example.com' }, createdDate: '2026-10-05T10:00:00Z', modifiedDate: '2026-11-20T08:00:00Z' },
    { id: 12, text: 'Thanks', createdBy: { displayName: 'Build Service' }, createdDate: '2026-11-01T10:00:00Z', modifiedDate: '2026-11-01T10:00:00Z' },
  ] })
  const { comments } = await readDiscussion({ ...config, pat: 'p' }, 'p', 7, transport)
  const [plain, edited] = comments
  assert.equal(edited.updated, '2026-11-20T08:00:00Z')
  assert.equal(shownDateOf(edited), '2026-11-20T08:00:00Z', 'edited: the updated date')
  assert.equal(edited.date, '2026-10-05T10:00:00Z', 'the written date is kept for which PI it counts for')
  assert.equal(plain.updated, undefined)
  assert.equal(shownDateOf(plain), '2026-11-01T10:00:00Z', 'not edited: the written date')
})
