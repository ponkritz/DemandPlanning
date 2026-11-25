import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultPi, epicOf, isNoneText, latestComment, moveLabel, oneLine, piFeatures, piOptions, readDiscussions, reviewKeywords, reviewSentences, reviewSplit, splitByKeywords, splitReviewComment } from '../src/piReview.ts'
import { continuationTokenProblem, guardAzureWrites, rateLimitMessage, rateLimitWait, readComments, readDiscussion, requestAzure } from '../src/azureDevOps.ts'
import { commentText } from '../src/workItemEdit.ts'
guardAzureWrites(() => true)

// PI Review, release 1 (PIR-01…PIR-06). Synthetic data only.
const config = { organization: 'org', project: 'Quality', team: 'T' }
const item = (id, workItemType, iterationPath, extra = {}) => ({ key: `org/quality/${id}`, id, organization: 'org', project: 'Quality', title: `Item ${id}`, workItemType, state: 'Active', assignedTo: 'Ana', areaPath: 'Quality', iterationPath, tags: '', url: '', ...extra })
const iteration = (path, startDate, finishDate) => ({ name: path.split('\\').at(-1), path, ...(startDate ? { attributes: { startDate: `${startDate}T00:00:00Z`, finishDate: `${finishDate}T00:00:00Z` } } : {}), teamConfigured: true })
const now = new Date('2026-11-24T12:00:00Z')

test('PIR-02: the PI list merges the iterations and the fetched items, ignoring case, newest first (TC-PIR-01)', () => {
  const iterations = [iteration('Quality'), iteration('Quality\\PI 2026.4'), iteration('Quality\\PI 2026.4\\Sprint 2'), iteration('Quality\\PI 2026.10')]
  const items = [item(1, 'Feature', 'quality\\pi 2026.4\\Sprint 1'), item(2, 'Feature', 'Quality\\PI 2025.3'), item(3, 'Task', 'Quality')]
  assert.deepEqual(piOptions(iterations, items), ['Quality\\PI 2026.10', 'Quality\\PI 2026.4', 'Quality\\PI 2025.3'])
  assert.deepEqual(piOptions([], items), ['quality\\pi 2026.4', 'Quality\\PI 2025.3'], 'offline: from the fetched items only')
})

test('PIR-02: the default PI is the current one (UTC); overlapping PIs choose nothing; without iterations the latest PI with Features, said (TC-PIR-01)', () => {
  const items = [item(1, 'Feature', 'Quality\\PI 2026.3\\Sprint 1'), item(2, 'Feature', 'Quality\\PI 2026.4'), item(3, 'Feature', 'Quality\\PI 2027.1', { state: 'Removed' }), item(4, 'User Story', 'Quality\\PI 2027.2\\Sprint 1')]
  const tree = [iteration('Quality\\PI 2026.4'), iteration('Quality\\PI 2026.4\\Sprint 2', '2026-11-16', '2026-11-29'), iteration('Quality\\PI 2026.3'), iteration('Quality\\PI 2026.3\\Sprint 6', '2026-10-01', '2026-10-14')]
  assert.deepEqual(defaultPi(tree, items, now), { pi: 'Quality\\PI 2026.4', why: 'current', note: '' })
  // The day is decided in UTC: 23:30 on 29 Nov in UTC is still in Sprint 2.
  assert.equal(defaultPi(tree, items, new Date('2026-11-29T23:30:00Z')).why, 'current')
  const overlap = defaultPi([...tree, iteration('Quality\\PI 2027.1'), iteration('Quality\\PI 2027.1\\Sprint 1', '2026-11-20', '2026-12-03')], items, now)
  assert.equal(overlap.pi, '')
  assert.equal(overlap.why, 'overlap')
  assert.match(overlap.note, /2 PIs are current at the same time \(PI 2026\.4, PI 2027\.1\): choose the PI to review\./)
  const offline = defaultPi(null, items, now, 'Could not load iteration paths.')
  assert.deepEqual([offline.pi, offline.why], ['Quality\\PI 2026.4', 'fallback'], 'the latest PI with a Feature (not Removed, not a story)')
  assert.match(offline.note, /^The PIs could not be read from Azure DevOps \(Could not load iteration paths\): showing the latest PI with Features, PI 2026\.4\.$/)
  const noDates = defaultPi([iteration('Quality\\PI 2026.4')], items, now)
  assert.equal(noDates.why, 'fallback')
  assert.match(noDates.note, /^No PI has Sprint dates covering today/)
  assert.equal(defaultPi(null, [], now).why, 'none')
})

test('PIR-03: the Features of a PI — Removed and absence-Epic Features left out; the toggle adds Features with User Stories in the PI (TC-PIR-02)', () => {
  const items = [
    item(10, 'Epic', 'Quality', { title: 'Absence' }), item(11, 'Epic', 'Quality', { title: 'DP' }),
    item(20, 'Feature', 'Quality\\PI 2026.4', { parentId: 11 }), item(21, 'Feature', 'Quality\\pi 2026.4\\Sprint 2', { parentId: 11 }),
    item(22, 'Feature', 'Quality\\PI 2026.4', { parentId: 11, state: 'Removed' }), item(23, 'Feature', 'Quality\\PI 2026.4', { parentId: 10 }),
    item(24, 'Feature', 'Quality\\PI 2026.3', { parentId: 11 }), item(30, 'User Story', 'Quality\\PI 2026.4\\Sprint 1', { parentId: 24 }),
    item(25, 'Feature', 'Quality\\PI 2026.3', { parentId: 11 }), item(31, 'User Story', 'Quality\\PI 2026.4\\Sprint 1', { parentId: 25, state: 'Removed' }),
  ]
  assert.deepEqual(piFeatures(items, 'Quality\\PI 2026.4', { absenceEpicId: 10 }).map((entry) => entry.id), [20, 21])
  assert.deepEqual(piFeatures(items, 'Quality\\PI 2026.4', { absenceEpicId: 10, withStories: true }).map((entry) => entry.id), [20, 21, 24], 'a Removed story does not bring its Feature')
  assert.deepEqual(piFeatures(items, '', {}), [])
  assert.equal(epicOf(items, items[2]).title, 'DP')
})

// A fake Comments API: pages of `size`, the token naming the next offset.
function pagedComments(all, size = 2) {
  const calls = []
  const transport = async (request) => {
    calls.push(request)
    assert.equal(request.operation, 'comments')
    const at = request.continuationToken ? Number(request.continuationToken.replace('page-', '')) : 0
    const page = all.slice(at, at + size)
    return { comments: page, count: page.length, ...(at + size < all.length ? { continuationToken: `page-${at + size}` } : {}) }
  }
  return { transport, calls }
}
const comment = (id, text, date, extra = {}) => ({ id, text, createdBy: { displayName: `Person ${id}` }, createdDate: date, ...extra })

test('PIR-05, BKL-20: the Discussion is read page by page with the continuation token, deleted comments dropped, newest first, as plain text (TC-PIR-03)', async () => {
  const all = [comment(5, '<div>Last <a href="#" data-vss-mention="version:2.0,abc">@Ana Costa</a> please</div>', '2026-11-05T10:00:00Z'), comment(4, 'gone', '2026-11-04T10:00:00Z', { isDeleted: true }),
    comment(3, '<p>See <img src="https://dev.azure.com/x.png"> here</p><script>alert(1)</script>', '2026-11-03T10:00:00Z'), comment(2, '<b>Blocked</b> by &lt;tool&gt;', '2026-11-02T10:00:00Z'), comment(1, 'First', '2026-11-01T10:00:00Z')]
  const { transport, calls } = pagedComments(all)
  const result = await readDiscussion(config, 'pat', 7, transport)
  assert.deepEqual(calls.map((call) => call.continuationToken), [undefined, 'page-2', 'page-4'], 'three pages, the token passed back as given')
  assert.equal(result.capped, false)
  assert.deepEqual(result.comments.map((entry) => [entry.id, entry.author, entry.text]), [[5, 'Person 5', 'Last @Ana Costa please'], [3, 'Person 3', 'See [image] here'], [2, 'Person 2', 'Blocked by <tool>'], [1, 'Person 1', 'First']])
  assert.ok(result.comments.every((entry) => !/[<>]script|<img|<a /.test(entry.text)), 'no markup is kept')
  // The Edit form (BKL-20) reads every page too.
  assert.equal((await readComments(config, 'pat', 7, pagedComments(all).transport)).length, 4)
})

test('PIR-05: the Discussion read stops at the cap (1,000 by default) and says so; a repeated token stops the loop (TC-PIR-03)', async () => {
  const many = Array.from({ length: 9 }, (_, index) => comment(index + 1, `c${index + 1}`, `2026-11-${String(index + 1).padStart(2, '0')}T10:00:00Z`))
  const capped = await readDiscussion(config, 'pat', 7, pagedComments(many, 2).transport, 5)
  assert.equal(capped.capped, true)
  assert.equal(capped.comments.length, 5)
  const exact = await readDiscussion(config, 'pat', 7, pagedComments(many.slice(0, 4), 2).transport, 4)
  assert.equal(exact.capped, false, 'no more pages: not capped')
  let calls = 0
  const loop = await readDiscussion(config, 'pat', 7, async () => { calls += 1; return { comments: [comment(calls, 'x', '2026-11-01T10:00:00Z')], continuationToken: 'same' } })
  assert.equal(calls, 2, 'the same token twice ends the read')
  assert.equal(loop.comments.length, 2)
  await assert.rejects(readDiscussion(config, 'pat', 7, async () => ({})), /did not return the Discussion/)
  assert.equal(commentText('<a data-vss-mention="version:2.0,1">Ben</a>'), '@Ben')
})

test('DSK-11, PIR-05: the web transport sends the page token URL-encoded on the read only, at most 2,048 characters; 429 names Retry-After (TC-PIR-05)', async () => {
  assert.equal(continuationTokenProblem({ operation: 'comments', continuationToken: 'abc' }), '')
  assert.match(continuationTokenProblem({ operation: 'add-comment', continuationToken: 'abc' }), /only when reading the Discussion/)
  assert.match(continuationTokenProblem({ operation: 'comments', continuationToken: 'x'.repeat(2049) }), /Invalid/)
  assert.match(continuationTokenProblem({ operation: 'comments', continuationToken: '' }), /Invalid/)
  const original = globalThis.fetch
  const sent = []
  globalThis.window = {}
  try {
    globalThis.fetch = async (url) => { sent.push(url); return new Response('{"comments":[]}', { status: 200, headers: { 'content-type': 'application/json' } }) }
    await requestAzure({ ...config, pat: 'p', operation: 'comments', workItemId: 7, continuationToken: 'a b&c=d/../x' })
    assert.equal(sent[0], 'https://dev.azure.com/org/Quality/_apis/wit/workItems/7/comments?api-version=7.1-preview.4&order=desc&$top=200&continuationToken=a%20b%26c%3Dd%2F..%2Fx')
    await assert.rejects(requestAzure({ ...config, pat: 'p', operation: 'items', ids: [1], continuationToken: 'x' }), /only when reading the Discussion/)
    await assert.rejects(requestAzure({ ...config, pat: 'p', operation: 'comments', workItemId: 7, continuationToken: 'x'.repeat(2049) }), /Invalid Discussion page token/)
    globalThis.fetch = async () => new Response('{}', { status: 429, headers: { 'content-type': 'application/json', 'Retry-After': '7' } })
    await assert.rejects(requestAzure({ ...config, pat: 'p', operation: 'comments', workItemId: 7 }), /\(429\)\. Retry after 7 s\./)
  } finally { delete globalThis.window; globalThis.fetch = original }
  assert.equal(rateLimitWait(new Error(rateLimitMessage('12'))), 12)
  assert.equal(rateLimitWait(new Error(rateLimitMessage(null))), 0)
  assert.equal(rateLimitWait(new Error('Azure DevOps returned 500.')), null)
})

test('PIR-06: Read all Discussions — 3 at a time; a 429 waits (at most 60 s) and retries once; a second 429 stops with the rest unread (TC-PIR-04)', async () => {
  const ids = Array.from({ length: 10 }, (_, index) => index + 1)
  let running = 0, peak = 0
  const waits = []
  const ok = await readDiscussions(ids, async (id) => { running += 1; peak = Math.max(peak, running); await new Promise((resolve) => setTimeout(resolve, 2)); running -= 1; return id }, { rateWait: rateLimitWait, sleep: async (ms) => { waits.push(ms) } })
  assert.equal(peak, 3, 'never more than 3 at a time')
  assert.deepEqual(ok, { read: 10, failed: 0, unread: [], stopped: '' })
  // One 429 for #2 (Retry-After 120 s → capped at 60 s), then it works.
  const tried = new Map(), results = [], progress = []
  const once = await readDiscussions(ids.slice(0, 4), async (id) => { tried.set(id, (tried.get(id) ?? 0) + 1); if (id === 2 && tried.get(id) === 1) throw new Error(rateLimitMessage('120')); return id }, { rateWait: rateLimitWait, sleep: async (ms) => { waits.push(ms) }, onResult: (id) => results.push(id), onProgress: (done, total) => progress.push(`${done} of ${total}`) })
  assert.deepEqual(once, { read: 4, failed: 0, unread: [], stopped: '' })
  assert.deepEqual(waits, [60000])
  assert.deepEqual(results.toSorted(), [1, 2, 3, 4])
  assert.equal(progress.at(-1), '4 of 4')
  // #3 keeps answering 429: the read stops; what was read is kept, the rest is unread (resumable).
  const kept = []
  const stopped = await readDiscussions(ids, async (id) => { if (id === 3) throw new Error(rateLimitMessage('1')); await new Promise((resolve) => setTimeout(resolve, 1)); return id }, { rateWait: rateLimitWait, sleep: async () => {}, onResult: (id) => kept.push(id) })
  assert.equal(stopped.stopped, 'rate-limit')
  assert.ok(stopped.unread.includes(3) && stopped.unread.length >= 1)
  assert.equal(stopped.read + stopped.unread.length, ids.length, 'every Feature is either read or left for the next run')
  assert.deepEqual(kept.toSorted((a, b) => a - b), ids.filter((id) => !stopped.unread.includes(id)))
  // Another error is kept for that Feature and the read goes on; a rejected PAT stops it.
  const errors = []
  const mixed = await readDiscussions([1, 2, 3], async (id) => { if (id === 2) throw new Error('Azure DevOps did not return the Discussion (500).'); return id }, { rateWait: rateLimitWait, onError: (id) => errors.push(id) })
  assert.deepEqual([mixed.read, mixed.failed, mixed.stopped, errors], [2, 1, '', [2]])
  const denied = await readDiscussions([1, 2, 3, 4, 5], async () => { throw new Error('The PAT was rejected or has expired. Check your PAT.') }, { rateWait: rateLimitWait, concurrency: 1 })
  assert.deepEqual([denied.stopped, denied.read, denied.unread], ['access', 0, [1, 2, 3, 4, 5]])
})

// PI Review columns (PIR-07…PIR-10). Synthetic comments only.
test('PIR-07: the latest comment is the newest by date and time, whoever wrote it; the same time: the higher ID (TC-PIR-07)', () => {
  const comment = (id, date, author = 'Ana') => ({ id, text: `c${id}`, author, date })
  assert.equal(latestComment([comment(1, '2026-11-02T09:00:00Z'), comment(2, '2026-11-20T08:59:00Z', 'Ben'), comment(3, '2026-11-20T08:00:00Z')]).id, 2, 'not the first in the list, nor by author')
  assert.equal(latestComment([comment(5, '2026-11-20T09:00:00+01:00'), comment(4, '2026-11-20T08:30:00Z')]).id, 4, 'offsets compared as instants')
  assert.equal(latestComment([comment(7, '2026-11-20T09:00:00Z'), comment(8, '2026-11-20T09:00:00Z')]).id, 8)
  assert.equal(latestComment([comment(9, 'not a date'), comment(1, '2020-01-01T00:00:00Z')]).id, 1, 'an unreadable date counts as oldest')
  assert.equal(latestComment([]), undefined)
})

test('PIR-08: the three headings split the comment, in any order, inline or on their own lines (TC-PIR-08)', () => {
  assert.deepEqual(splitReviewComment('Struggles: test rig late Learnings: book the rig early Move to next PI: Yes, waiting for vendor'),
    { struggles: 'test rig late', learnings: 'book the rig early', move: 'Yes, waiting for vendor', moveValue: 'Yes', moveRest: 'waiting for vendor' })
  assert.deepEqual(splitReviewComment('Intro line is in no section.\nMove to Next PI: No\nLEARNINGS: one\n  two  \n\nStruggles: none worth noting'),
    { move: 'No', moveValue: 'No', moveRest: '', learnings: 'one\ntwo', struggles: 'none worth noting' })
  // Bullets, numbers, # and bold before; a colon, a dash or the end of the line after; singular and plural.
  assert.deepEqual(splitReviewComment('- **Struggle:** the rig\n2. learning - book early\n## Moved to the next PI\npartly. vendor'),
    { struggles: 'the rig', learnings: 'book early', move: 'partly. vendor', moveValue: 'Partly', moveRest: 'vendor' })
  assert.deepEqual(splitReviewComment('Struggles\nrig\nNext PI: y'), { struggles: 'rig', move: 'y', moveValue: 'Yes', moveRest: '' })
  assert.deepEqual(splitReviewComment('Move to the next PI?: n — scope cut'), { move: 'n — scope cut', moveValue: 'No', moveRest: 'scope cut' })
  // Missing sections stay out; an empty section is left out; a heading given twice is joined.
  assert.deepEqual(splitReviewComment('Learnings: only this'), { learnings: 'only this' })
  assert.deepEqual(splitReviewComment('Struggles:\nLearnings: x\nStruggles: b'), { learnings: 'x', struggles: 'b' })
  assert.deepEqual(splitReviewComment('Struggle: a\nstruggles: b'), { struggles: 'a\nb' })
  assert.deepEqual(splitReviewComment('Learnings:\n- book the rig\n* share the calendar\n• -3 h saved'), { learnings: 'book the rig\nshare the calendar\n-3 h saved' }, 'a leading bullet of a line dropped')
})

test('PIR-08: a heading word inside a sentence is not taken; no headings give an empty result (TC-PIR-08)', () => {
  assert.deepEqual(splitReviewComment('We had struggles with the rig and some learnings too. Next PI we try again.'), {})
  assert.deepEqual(splitReviewComment('Struggles with the rig were big\nLearning-curve was steep'), {}, 'at a line start but no colon, dash and space, or line end')
  assert.deepEqual(splitReviewComment('Planned for next PI: maybe\nLearnings: x'), { learnings: 'x' }, 'the bare "Next PI" counts at a line start only')
  assert.deepEqual(splitReviewComment('Mylearnings: x'), {}, 'not inside a word')
  assert.deepEqual(splitReviewComment(''), {})
  assert.deepEqual(splitReviewComment(undefined), {})
})

test('PIR-08: Move to next PI — Yes / No / Partly (or Y / N) normalized with the rest after a dash; other text as written (TC-PIR-08)', () => {
  const move = (text) => { const split = splitReviewComment(`Move to next PI: ${text}`); return [split.moveValue, moveLabel(split)] }
  assert.deepEqual(move('Yes - waiting for vendor'), ['Yes', 'Yes — waiting for vendor'])
  assert.deepEqual(move('YES'), ['Yes', 'Yes'])
  assert.deepEqual(move('no.'), ['No', 'No'])
  assert.deepEqual(move('Partially, the docs only'), ['Partly', 'Partly — the docs only'])
  assert.deepEqual(move('Y'), ['Yes', 'Yes'])
  assert.deepEqual(move('N/A'), [undefined, 'N/A'])
  assert.deepEqual(move('Not decided'), [undefined, 'Not decided'])
  assert.deepEqual(move('Nothing moves'), [undefined, 'Nothing moves'])
  assert.equal(moveLabel({}), '')
  assert.equal(oneLine('one\n\n two \nthree'), 'one · two · three')
})

// PI Review, looser split (PIR-08 synonyms, PIR-11 keyword fallback). Synthetic comments only.
test('PIR-08: every synonym heading is taken at a line start, with a colon, a dash and a space, or the line end (TC-PIR-08)', () => {
  const synonyms = {
    struggles: ['Struggles', 'Challenges', 'Issues', 'Problems', 'Blockers', 'Impediments', 'Risks', 'Pain points', 'What went wrong', 'What didn\'t go well', 'What didn’t go well', 'What did not go well'],
    learnings: ['Learnings', 'Learning', 'Lessons', 'Lesson', 'Lessons learnt', 'Lessons learned', 'Takeaways', 'Take-aways', 'What went well', 'Went well', 'Improvements', 'Improve', 'Next time'],
    move: ['Move to next PI', 'Spill over', 'Spillover', 'Spill-over', 'Carry over', 'Carryover', 'Carry-over', 'Next PI', 'Moving to next PI', 'Moving to the next PI', 'Continue in next PI'],
  }
  for (const [section, words] of Object.entries(synonyms)) for (const word of words) {
    for (const form of [`${word}: the text`, `- **${word}** – the text`, `## ${word}\nthe text`, `1. ${word.toUpperCase()} - the text`]) {
      assert.equal(splitReviewComment(`Intro\n${form}`)[section], 'the text', `${section} from ${JSON.stringify(form)}`)
      assert.equal(reviewSplit(`Intro\n${form}`).from, 'Headings')
    }
  }
  // Synonyms of one section are joined; the Yes / No / Partly normalisation is the same for the Move synonyms.
  assert.deepEqual(splitReviewComment('Challenges: rig late\nLessons learnt: book early\nRisks: vendor\nSpill-over: Yes - docs'),
    { struggles: 'rig late\nvendor', learnings: 'book early', move: 'Yes - docs', moveValue: 'Yes', moveRest: 'docs' })
  assert.deepEqual(splitReviewComment('What went well: demo\nWhat didn\'t go well: rig\nCarry over — partly, docs'),
    { learnings: 'demo', struggles: 'rig', move: 'partly, docs', moveValue: 'Partly', moveRest: 'docs' })
})

test('PIR-08: inline forms — a colon after any heading word inside a line, a dash and a space after Struggle / Learning / Lesson (TC-PIR-08)', () => {
  assert.deepEqual(splitReviewComment('Demo fine, a learning – book the rig early; struggle - the vendor'), { learnings: 'book the rig early;', struggles: 'the vendor' })
  assert.deepEqual(splitReviewComment('Review done. lesson: share the calendar'), { learnings: 'share the calendar' })
  assert.deepEqual(splitReviewComment('Review done. Lessons learned — share the calendar'), { learnings: 'share the calendar' })
  assert.deepEqual(splitReviewComment('Two points. Blockers: the rig. Takeaways: book early. Carry over: no'), { struggles: 'the rig.', learnings: 'book early.', move: 'no', moveValue: 'No', moveRest: '' })
  // Plain sentences without a colon or a dash are not headings; the line-start-only words need a line start.
  assert.deepEqual(splitReviewComment('We had issues with the rig and lessons for the team'), {})
  assert.deepEqual(splitReviewComment('There were risks - one was the vendor'), {}, 'a dash inside a line only after Struggle / Learning / Lesson')
  assert.deepEqual(splitReviewComment('Learning-curve was steep\nthe lesson-plan is ready'), {}, 'a dash without a space')
  assert.deepEqual(splitReviewComment('We need to improve: x\nIt went well: y\nPlanned for next PI: z\nSee you next time: w'), {}, 'Improve, Went well, Next PI and Next time only at a line start')
  assert.deepEqual(splitReviewComment('Mylessons: x\nnonissues: y'), {}, 'not inside a word')
})

test('PIR-11: without any heading, sentences with keywords are suggested for each column (TC-PIR-10)', () => {
  const text = 'We were blocked by the vendor for two Sprints. Next time we book the rig at PI planning!\n- The docs slipped, we learned to review earlier.\nSpill over to next PI — partly, the docs.'
  assert.deepEqual(reviewSplit(text), {
    struggles: 'We were blocked by the vendor for two Sprints.\nThe docs slipped, we learned to review earlier.',
    learnings: 'Next time we book the rig at PI planning!\nThe docs slipped, we learned to review earlier.',
    move: 'Spill over to next PI — partly, the docs.', moveValue: 'Partly', moveRest: 'the docs.', from: 'Keywords',
  }, 'a sentence with keywords of two columns goes to both')
  assert.deepEqual(reviewSentences('One. Two! Three?\n\n- Four'), ['One.', 'Two!', 'Three?', 'Four'])
  // Each column on its own, plurals, wildcards, case and the curly apostrophe.
  const one = (sentence) => { const split = splitByKeywords(sentence); return ['struggles', 'learnings', 'move'].filter((section) => split[section]) }
  for (const sentence of ['Escalated to the vendor', 'Two ISSUES with the rig', 'We couldn’t finish the docs', 'Dependencies on lab A', 'Waiting for the rig', 'The challenge was the rig', 'Delivered late']) assert.deepEqual(one(sentence), ['struggles'], sentence)
  for (const sentence of ['A lesson for the team', 'We recommend booking early', 'The demo went well', 'Improvements in the reviews', 'Better to book early', 'Key takeaways from the demo']) assert.deepEqual(one(sentence), ['learnings'], sentence)
  for (const sentence of ['Carry over the docs', 'The docs spilled', 'We continue in PI 2027.1', 'Moving to the new lab', 'Planned for next PI']) assert.deepEqual(one(sentence), ['move'], sentence)
  // Whole words only.
  assert.deepEqual(one('Plateau reached later than planned, the blockchain demo'), [])
  assert.deepEqual(reviewSplit('Ready for review'), { from: 'None' })
  assert.deepEqual(reviewSplit(''), { from: 'None' })
  assert.deepEqual(reviewSplit(undefined), { from: 'None' })
  // The list is one exported, built-in list.
  assert.ok(reviewKeywords.struggles.includes('blocked') && reviewKeywords.learnings.includes('next time') && reviewKeywords.move.includes('carry over'))
})

test('PIR-11: a negation before a keyword is not taken; the Move value only when it clearly follows the move phrase (TC-PIR-10)', () => {
  assert.deepEqual(reviewSplit('No blockers. No issues at all. Not blocked. It wasn’t late. Without major delays. We had no real problem.'), { from: 'None' })
  assert.deepEqual(splitByKeywords('No blocker, but the rig was late.'), { struggles: 'No blocker, but the rig was late.' }, 'another keyword in the sentence still counts')
  assert.deepEqual(splitByKeywords('No idea why we were delayed.'), { struggles: 'No idea why we were delayed.' }, 'the negation too far before')
  const move = (sentence) => { const split = splitByKeywords(sentence); return [split.moveValue, moveLabel(split)] }
  assert.deepEqual(move('Carry over to next PI: yes, the docs.'), ['Yes', 'Yes — the docs.'])
  assert.deepEqual(move('Spill over - no.'), ['No', 'No'])
  assert.deepEqual(move('Move to next PI no longer needed.'), [undefined, 'Move to next PI no longer needed.'], '"no" followed by a word gives no value')
  assert.deepEqual(move('Yes, the docs carry over.'), [undefined, 'Yes, the docs carry over.'], 'a value before the phrase gives none')
  assert.deepEqual(move('We carry over the docs. Then next PI - no.'), [undefined, 'We carry over the docs.\nThen next PI - no.'], 'two Move sentences give no value')
})

test('PIR-08, PIR-11: headings take priority over keywords; Split from is Headings, Keywords or None (TC-PIR-10)', () => {
  const both = 'We were blocked by the vendor.\nLearnings: book early'
  assert.deepEqual(reviewSplit(both), { learnings: 'book early', from: 'Headings' }, 'a heading anywhere: no keyword suggestion')
  assert.deepEqual(reviewSplit('Struggles:'), { from: 'Headings' }, 'an empty heading still counts as headings')
  assert.equal(reviewSplit('We were blocked by the vendor.').from, 'Keywords')
  assert.equal(reviewSplit('Ready for review').from, 'None')
  assert.deepEqual(splitReviewComment('We were blocked by the vendor.'), {}, 'the heading split alone stays empty')
})

test("PIR-12: the team's two formats — Learnings : / Struggles : and … of the Feature, the Move question with any PI number (TC-PIR-12)", () => {
  const first = splitReviewComment('Learnings :\n- Start reviews earlier\n- Keep the vendor in the loop\nStruggles :\n1. Waiting for vendor documents\n2. Test rig booked late\nWhether the feature needs to be be shifted to PI 26.4\nYes - two stories left')
  assert.deepEqual([first.learnings, first.struggles, first.moveValue, first.movePi], ['Start reviews earlier\nKeep the vendor in the loop', 'Waiting for vendor documents\nTest rig booked late', 'Yes', 'PI 26.4'])
  assert.equal(moveLabel(first), 'Yes — two stories left · to PI 26.4')
  const second = splitReviewComment('Learnings of the Feature\n• Early alignment helped\nStruggles of the Feature\n• Lab access delayed\nWhether the feature needs to be shifted to PI 26.4 : No')
  assert.deepEqual([second.learnings, second.struggles, second.moveValue, second.movePi], ['Early alignment helped', 'Lab access delayed', 'No', 'PI 26.4'])
  // Any PI number; the answer after a "?" on the next line, after a dash, or after a space when it starts with Yes / No / Partly.
  assert.deepEqual([splitReviewComment('Struggles :\n- B\nWhether the feature needs to be shifted to PI 27.1?\nNo').movePi, splitReviewComment('Struggles :\n- B\nWhether the feature needs to be shifted to PI 27.1?\nNo').moveValue], ['PI 27.1', 'No'])
  assert.equal(splitReviewComment('Struggles of the Feature\n1) B\nWhether the feature needs to be shifted to PI 26.4 - Partly').moveValue, 'Partly')
  const space = splitReviewComment('Learnings of the Feature\n- A\nWhether the feature needs to be shifted to PI 26.4 Yes, docs pending')
  assert.deepEqual([space.learnings, space.moveValue, space.moveRest], ['A', 'Yes', 'docs pending'])
  // In a sentence it is no heading.
  assert.deepEqual(splitReviewComment('We discussed whether the feature needs to be shifted to PI 26.4 in the meeting.'), {})
})

// PIR-12 (product owner's photo of real data, 25 Nov 2026; synthetic copies of the two comments): "PI.26.4" in the Move
// question, a dash after any heading (also "Feature-" without a space before it), "Nil" read as none; the tight
// "Learning-… , Struggle-…" form when both are there.
test('PIR-12: hand-written reviews — "PI.26.4" and a dash after the Move question, "Nil" as none, "Learning-… Struggle-…" (TC-PIR-12)', () => {
  const written = '<div>Learnings of the Feature - New cell qualification supporting business in addressing a CAPA with concept of DOE matrix run plan</div><div>Struggles of the Feature- Nil</div><div>Whether the Feature needs to be shifted to PI.26.4 - Yes to be shifted to continue the platform support activities</div>'
  const split = reviewSplit(commentText(written))
  assert.deepEqual(split, { learnings: 'New cell qualification supporting business in addressing a CAPA with concept of DOE matrix run plan', struggles: 'Nil', move: 'Yes to be shifted to continue the platform support activities', movePi: 'PI 26.4', moveValue: 'Yes', moveRest: 'to be shifted to continue the platform support activities', from: 'Headings' })
  assert.equal(isNoneText(split.struggles), true, 'Nil is none, like None')
  assert.deepEqual(['None', 'nil', 'Nill.', 'N/A', 'NA', 'Nil issues', 'Nothing'].map(isNoneText), [true, true, true, true, true, false, false])
  assert.equal(moveLabel(split), 'Yes — to be shifted to continue the platform support activities · to PI 26.4')
  // Every spelling of the PI in the Move question and in a {REVIEWED PI} heading.
  for (const pi of ['PI 26.4', 'PI26.4', 'PI-26.4', 'PI.26.4']) {
    assert.equal(splitReviewComment(`Whether the feature needs to be shifted to ${pi}: No`).movePi, 'PI 26.4', pi)
    assert.deepEqual(splitReviewComment(`Learnings of ${pi}: a\nStruggles of ${pi} - b`), { learnings: 'a', struggles: 'b', reviewedPi: 'PI 26.4' }, pi)
  }
  // The short form, both sections on one line.
  assert.deepEqual(reviewSplit('Learning-good exposure, Struggle-long list CRs, Ageing of CRs.'), { learnings: 'good exposure', struggles: 'long list CRs, Ageing of CRs.', from: 'Headings' })
  assert.deepEqual(splitReviewComment('Learnings-a; Struggles– b'), { learnings: 'a', struggles: 'b' })
  // Alone, a dash without a space is a word ("Learning-curve"), not a heading.
  assert.deepEqual(splitReviewComment('Learning-curve was steep'), {})
})
