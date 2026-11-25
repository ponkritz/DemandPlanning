import test from 'node:test'
import assert from 'node:assert/strict'
import { buildReviewComment, emptyReviewForm, escapeHtml, formSetupProblems, myReviewOf, noneChoice, otherPiHint, paragraphItems, prefilledOtherPi, reviewCountOf, reviewPeriodOf, withNoTexts, nextPi, nextPiOf, pisPerYear, otherPersonBlock, personOf, piDates, piText, postReview, readBackReview, reviewFormFrom, reviewFormProblems, reviewPageBlock, reviewPostBlock, reviewSummary, piPeriods, leftOutNote } from '../src/piReviewPost.ts'
import { reviewModeOf, reviewSplit, splitReviewComment, reviewFooter } from '../src/piReview.ts'
import { piPathOf } from '../src/myWork.ts'
import { builtInFormSetup } from '../src/piReviewSetup.ts'
import { formatDate } from '../src/format.ts'
import { guardAzureWrites, requestAzure, reviewPostAllowed } from '../src/azureDevOps.ts'
import { safeCommentHtml } from '../src/azureClient.ts'
import { commentText } from '../src/workItemEdit.ts'
import { defaultPolicy, parseAccess, rightsFor, serializeAccess } from '../src/access.ts'

// PI Review, the review form (PIR-13…PIR-18, CON-113). Synthetic data only.
const config = { organization: 'org', project: 'Quality', team: 'T' }
const form = { learnings: 'Book the rig early\n* share <the> calendar & more\n2) plan the docs', struggles: 'Vendor late', move: 'Yes', moveReason: 'two stories left\n- docs pending', movePi: 'PI 26.5', mode: 'Discuss during Meeting', remarks: 'Thanks <b>team</b>' }

test('PIR-14: the comment as a nested bullet list — a paragraph’s lines as nested bullets (numbered lines as a numbered list), choices on one bullet, the Move reason nested, the footer after the list (TC-PIR-13)', () => {
  assert.equal(buildReviewComment(form), '<ul>'
    + '<li>Learnings:<ol><li>Book the rig early</li><li>share &lt;the&gt; calendar &amp; more</li><li>plan the docs</li></ol></li>'
    + '<li>Struggles:<ul><li>Vendor late</li></ul></li>'
    + '<li>Whether the feature needs to be shifted to PI 26.5 : Yes<ul><li>two stories left</li><li>docs pending</li></ul></li>'
    + '<li>Advise to discuss the Feature during the Review meeting : Discuss during Meeting</li>'
    + '<li>Additional Remarks:<ul><li>Thanks &lt;b&gt;team&lt;/b&gt;</li></ul></li>'
    + `</ul><p>${reviewFooter}</p>`)
  // A leading "- ", "* " or "•" typed is dropped; without a numbered line the field is a bulleted list.
  assert.deepEqual(paragraphItems('  a  \n\n• b\n+ c\n– d\n*  e'), { items: ['a', 'b', 'c', 'd', 'e'], numbered: false })
  assert.deepEqual(paragraphItems('1. a\n2) b\n- c'), { items: ['a', 'b', 'c'], numbered: true })
  // PIR-28: the reviewed PI in the Learnings and Struggles headings, no space before their colon.
  assert.match(buildReviewComment({ ...form, reviewedPi: 'PI 26.4' }), /^<ul><li>Learnings of PI 26\.4:<ol>.*<li>Struggles of PI 26\.4:<ul>/)
  // Optional parts left out: no remarks, no reason; empty texts (the Close flow) leave their heading out.
  const short = buildReviewComment({ ...emptyReviewForm('PI 26.5'), mode: 'Offline Review' })
  assert.equal(short, `<ul><li>Whether the feature needs to be shifted to PI 26.5 : No</li><li>Advise to discuss the Feature during the Review meeting : Offline Review</li></ul><p>${reviewFooter}</p>`)
  assert.ok(safeCommentHtml(buildReviewComment(form)) && safeCommentHtml(short))
})

test('PIR-14 (SM-183): every text the person typed is escaped — <script>, &, quotes and <b> — only the app’s own list tags are raw; the transport refuses any other markup (TC-PIR-13)', () => {
  const nasty = { ...form, learnings: '<script>alert(1)</script>\n"quoted" & \'single\'', struggles: '<b>bold</b> <img src=x onerror=alert(1)>', remarks: '</li></ul><p onclick="x">' }
  const html = buildReviewComment(nasty)
  assert.ok(!/<(?!\/?(?:ul|ol|li|p)>)|"|'/.test(html), html)
  assert.match(html, /<li>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/li><li>&quot;quoted&quot; &amp; &#39;single&#39;<\/li>/)
  assert.match(html, /<li>&lt;b&gt;bold&lt;\/b&gt; &lt;img src=x onerror=alert\(1\)&gt;<\/li>/)
  assert.ok(safeCommentHtml(html))
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
  // The allowlist of the web transport (and, the same, the desktop proxy): no attributes, no other tags, no raw quotes.
  for (const bad of ['<ul class="x"><li>a</li></ul>', '<script>x</script>', '<li>a & b</li>', '<p>"x"</p>', '<b>x</b>', '<li>&nbsp;</li>', '<img src=x>']) assert.equal(safeCommentHtml(bad), false, bad)
  // Read back exactly as typed.
  const back = readBackReview(html)
  assert.equal(back.learnings, '<script>alert(1)</script>\n"quoted" & \'single\'')
  assert.equal(back.struggles, '<b>bold</b> <img src=x onerror=alert(1)>')
})

test('PIR-14: round trip — the HTML built → commentText (as the read path) → splitReviewComment gives back every field; the footer lands nowhere (TC-PIR-13)', () => {
  const back = splitReviewComment(commentText(buildReviewComment(form)))
  assert.deepEqual(back, {
    learnings: 'Book the rig early\nshare <the> calendar & more\nplan the docs', struggles: 'Vendor late',
    move: 'Yes\ntwo stories left\ndocs pending', moveValue: 'Yes', moveRest: 'two stories left\ndocs pending', movePi: 'PI 26.5',
    review: 'Discuss during Meeting', reviewMode: 'Discuss during Meeting', remarks: 'Thanks <b>team</b>',
  })
  assert.deepEqual(readBackReview(buildReviewComment(form)).from, 'Headings')
  assert.deepEqual(reviewFormProblems(form), [])
  assert.deepEqual(reviewFormProblems({ ...form, reviewedPi: 'PI 2026.4' }), [])
  const no = readBackReview(buildReviewComment({ ...form, move: 'No', moveReason: '', mode: 'Offline Review', remarks: '' }))
  assert.deepEqual([no.moveValue, no.moveRest, no.reviewMode, no.remarks], ['No', '', 'Offline Review', undefined])
  // PIR-28: the reviewed PI comes back from the headings.
  const pi = readBackReview(buildReviewComment({ ...form, reviewedPi: 'PI 26.4' }))
  assert.deepEqual([pi.reviewedPi, pi.learnings.split('\n')[0], pi.struggles], ['PI 26.4', 'Book the rig early', 'Vendor late'])
})

test('PIR-14, PIR-28: a review written by hand in Azure DevOps in the product owner’s bullet layout is read into the same fields (TC-PIR-13)', () => {
  // As Azure DevOps stores it: the nested list inside the item, or (its editor) as a sibling of the item; divs, spans, nbsp.
  const nested = '<ul><li>Learnings :<ul><li>New WoW Working</li></ul></li><li>Struggles :<ul><li>None</li></ul></li><li>Whether the feature needs to be shifted to PI 27.1 : Yes</li><li>Advise to discuss the Feature during the Review meeting : Offline Review</li></ul>'
  const sibling = '<div><ul><li><span>Learnings of PI 26.4:</span></li><ul><li>New WoW&nbsp;Working</li></ul><li>Struggles of PI 26.4:</li><ul><li>None</li></ul><li>Whether the feature needs to be shifted to PI 27.1 : Yes</li><li>Advise to discuss the Feature during the Review meeting : Offline Review</li></ul></div>'
  for (const html of [nested, sibling]) {
    const split = splitReviewComment(commentText(html))
    assert.deepEqual([split.learnings, split.struggles, split.moveValue, split.movePi, split.reviewMode], ['New WoW Working', 'None', 'Yes', 'PI 27.1', 'Offline Review'], html)
  }
  assert.equal(splitReviewComment(commentText(nested)).reviewedPi, undefined)
  assert.equal(splitReviewComment(commentText(sibling)).reviewedPi, 'PI 26.4')
  // The variants: "for", a space before the colon, any PI number, "the PI".
  for (const [text, pi] of [['Learnings for PI 2026.4 :\nA\nStruggles for PI 2026.4:\nB', 'PI 2026.4'], ['Struggles of the PI 27.1:\nB\nLearnings of PI 27.1 :\nA', 'PI 27.1']]) {
    const split = splitReviewComment(text)
    assert.deepEqual([split.learnings, split.struggles, split.reviewedPi], ['A', 'B', pi], text)
  }
})

test('PIR-13: the form checks — required fields, the PI, and a line PI Review would read back differently (TC-PIR-14)', () => {
  assert.deepEqual(reviewFormProblems({ ...emptyReviewForm('PI 26.5') }).length, 3, 'Learnings, Struggles and the Review meeting advice')
  assert.equal(emptyReviewForm().move, 'No', 'Move to next PI pre-selected No (UI-STANDARDS §12 exception)')
  assert.match(reviewFormProblems({ ...form, move: '' }).join(' '), /Yes or No/)
  assert.match(reviewFormProblems({ ...form, move: 'Partly' }).join(' '), /Yes or No/, 'Partly is never offered')
  assert.match(reviewFormProblems({ ...form, movePi: '26.5' }).join(' '), /PI 26\.5/)
  assert.match(reviewFormProblems({ ...form, mode: '' }).join(' '), /Review meeting/)
  assert.match(reviewFormProblems({ ...form, learnings: 'No issues: all fine' }).join(' '), /read Learnings, Struggles back differently/)
  assert.match(reviewFormProblems({ ...form, remarks: 'Next PI: maybe' }).join(' '), /back differently/)
  // PIR-18: in the Close flow the texts are optional; Move and the advice are not.
  assert.deepEqual(reviewFormProblems({ ...emptyReviewForm('PI 26.5'), mode: 'Offline Review' }, { optionalTexts: true }), [])
  assert.equal(reviewFormProblems({ ...emptyReviewForm('PI 26.5') }, { optionalTexts: true }).length, 1)
})

test('PIR-13: the next PI after the reviewed one — the next later PI in the list, else by the number with the year rollover (TC-PIR-13)', () => {
  assert.equal(nextPi('Q\\PI 26.4', ['Q\\PI 27.1', 'Q\\PI 26.4', 'Q\\PI 26.3', 'Q\\PI 26.10']), 'PI 26.10')
  assert.equal(nextPi('Q\\PI 26.4', ['Q\\PI 26.4', 'Q\\PI 26.3']), 'PI 27.1', 'PIR-25: not PI 26.5')
  assert.equal(nextPi('Q\\PI 2026.9', ['Q\\PI 2025.10']), 'PI 2026.10', 'ten PIs a year known')
  assert.equal(nextPi('Q\\Program Increment', []), '')
  assert.deepEqual([piText('pi26.5'), piText('PI 26.5 '), piText('26.5')], ['PI 26.5', 'PI 26.5', ''])
})

// PIR-25 (product owner, 25 Nov 2026: "The next PI is 27.1, not 26.5"): the number fallback rolls the year over.
test('PIR-25: the number fallback — the last PI of a year rolls over to the next year’s first, in both year formats; mid-year adds one (TC-PIR-32)', () => {
  assert.equal(nextPi('Q\\PI 26.4', []), 'PI 27.1')
  assert.equal(nextPi('Q\\PI 2026.4', []), 'PI 2027.1')
  assert.equal(nextPi('Q\\PI 26.2', []), 'PI 26.3')
  assert.equal(nextPi('Q\\PI 2026.3', ['Q\\PI 2026.1']), 'PI 2026.4')
  assert.equal(nextPi('Q\\PI 09.4', []), 'PI 10.1', 'the year keeps its digits')
  // The PIs in a year: the highest last number known, at least 4.
  assert.deepEqual([pisPerYear([]), pisPerYear(['Q\\PI 26.1', 'Q\\PI 26.2']), pisPerYear(['Q\\PI 25.6', 'Q\\PI 26.2', 'Q\\PI Planning', 'Q\\PI 7'])], [4, 4, 6])
  assert.equal(nextPi('Q\\PI 26.4', ['Q\\PI 25.6']), 'PI 26.5', 'six PIs a year known: mid-year')
  assert.equal(nextPi('Q\\PI 26.6', ['Q\\PI 25.6']), 'PI 27.1')
  assert.equal(nextPi('Q\\PI 7', []), 'PI 8', 'a single number adds one')
  // Without the iterations today's PI is not known: the reviewed PI's number, said so (a warning).
  const none = nextPiOf('Q\\PI 26.4', null, ['Q\\PI 26.3', 'Q\\PI 26.4'], { today: autumn })
  assert.deepEqual(none, { pi: 'PI 27.1', source: 'number', note: 'The PI dates are not read from Azure DevOps here, so today’s PI is not known. Used instead: PI 26.4, the reviewed PI — worked out from the PI number — PI 26.4 is the last PI of its year (4 a year), so the next is PI 27.1.', short: 'PI dates missing in Azure DevOps — check this PI.', missing: true })
  // Today's PI found, no later PI dated or in the tree: today's PI's number rolls over.
  const rollover = nextPiOf('Q\\PI 2026.3', [it('Q\\PI 2026.3', '2026-07-06', '2026-10-04'), it('Q\\PI 2026.4\\Sprint 1', '2026-10-05', '2027-01-03')], [], { today: autumn })
  assert.deepEqual([rollover.pi, rollover.source, rollover.missing], ['PI 2027.1', 'number', true])
  assert.match(rollover.note, /^From Azure DevOps iteration dates: today \(.+\) is in PI 2026\.4 \(.+ – .+\), but no later PI has dates: worked out from the PI number — PI 2026\.4 is the last PI of its year \(4 a year\), so the next is PI 2027\.1\.$/)
  const mid = nextPiOf('Q\\PI 26.2', [it('Q\\PI 26.1', '2026-01-05', '2026-03-29'), it('Q\\PI 26.2', '2026-03-30', '2026-06-28')], [], { today: new Date('2026-05-01T12:00:00Z') })
  assert.equal(mid.pi, 'PI 26.3')
  assert.match(mid.note, /but no later PI has dates: worked out from the PI number — the next after PI 26\.2 is PI 26\.3\.$/)
})

// PIR-25 (product owner's photo of real data, 25 Nov 2026): PI names — "PI 26.4", "PI 2026.4", "PI26.4", "PI-26.4",
// "PI.26.4", "Program Increment 27.1", any Unicode space, zero-width characters, full-width digits, other dots and text
// before or after the number; a year node ("2026\PI 26.4") is no PI; the same PI in two subtrees is one PI; "PI 26.2.1"
// is a Sprint of PI 26.2; a name without a PI number is never chosen and the note names at most five.
test('PIR-25: PI names — spaces, dots and decorations around the number; year nodes, two subtrees and Sprint names; left out at most five (TC-PIR-32)', () => {
  assert.deepEqual(['Q\\PI 26.4\\Sprint 1', 'Q\\PI 2026.4', 'Q\\PI26.4\\Sprint 2', 'Q\\PI 27.1', 'Q\\Program Increment 27.1', 'Q\\Pipeline\\Sprint 1', 'Q\\API2', 'Q\\2026\\PI 26.4\\Sprint 3', 'Q\\2026'].map(piPathOf),
    ['Q\\PI 26.4', 'Q\\PI 2026.4', 'Q\\PI26.4', 'Q\\PI 27.1', 'Q\\Program Increment 27.1', undefined, undefined, 'Q\\2026\\PI 26.4', undefined])
  const names = ['PI26.4', 'PI-26.4', 'PI.26.4', 'PI_26.4', 'Program Increment 27.1', 'PI 25.1', 'PI 25.1', 'PI  25.1', 'PI​ 25.1', 'ＰＩ ２５．１', 'PI 25․1', 'PI 25.1 (Jan–Mar)', 'PI 25.1 - Q1', 'Release PI 25.1', 'PI 26.4 (draft)', 'PI 26.2.1']
  assert.deepEqual(names.map(piText), ['PI 26.4', 'PI 26.4', 'PI 26.4', 'PI 26.4', 'PI 27.1', 'PI 25.1', 'PI 25.1', 'PI 25.1', 'PI 25.1', 'PI 25.1', 'PI 25.1', 'PI 25.1', 'PI 25.1', 'PI 25.1', 'PI 26.4', 'PI 26.2.1'])
  assert.deepEqual(['PI Planning', 'PI Q4 2026', 'API2', 'PI 26.4x', '2026', ''].map(piText), ['', '', '', '', '', ''])
  // The real tree's shape: year nodes, the same PIs in a second subtree (Team B), names with a non-breaking space or a
  // dot, a Sprint named after its PI, PI 26.4 dated by its Sprints.
  const real = [it('P\\2025'), it('P\\2025\\PI 25.1', '2025-01-06', '2025-04-06'), it('P\\Team B\\2025\\PI 25.1', '2025-01-01', '2025-04-01'), it('P\\2025\\PI.25.2', '2025-04-07', '2025-07-06'),
    it('P\\2026'), it('P\\2026\\PI 26.2'), it('P\\Sprints\\PI 26.2.1', '2026-04-06', '2026-04-19'), it('P\\2026\\PI 26.4'), it('P\\2026\\PI 26.4\\Sprint 1', '2026-10-05', '2026-10-18'), it('P\\2026\\PI 26.4\\Sprint 6', '2026-12-21', '2027-01-03'),
    it('P\\2027\\PI 27.1', '2027-01-04', '2027-04-04'), it('P\\Team B\\2027\\PI 27.1', '2027-01-04', '2027-04-04'), it('P\\2027\\PI 27.2 (Apr–Jun)', '2027-04-05', '2027-07-04')]
  const periods = piPeriods(real)
  assert.deepEqual(periods.dated.map((entry) => [entry.pi, entry.start, entry.finish]), [['PI 25.1', '2025-01-01', '2025-04-06'], ['PI 25.2', '2025-04-07', '2025-07-06'], ['PI 26.2', '2026-04-06', '2026-04-19'], ['PI 26.4', '2026-10-05', '2027-01-03'], ['PI 27.1', '2027-01-04', '2027-04-04'], ['PI 27.2', '2027-04-05', '2027-07-04']])
  assert.deepEqual([periods.undated, periods.unnamed], [[], []], 'no year node, no Sprint name, nothing left out')
  const next = nextPiOf('P\\2026\\PI 26.4', real, [], { today: autumn })
  assert.deepEqual([next.pi, next.source, next.missing], ['PI 27.1', 'dates', false])
  assert.doesNotMatch(next.note, /Left out/)
  // Names without a number: never chosen, each once, at most five named.
  const unnamed = [it('Q\\PI 26.4', '2026-10-05', '2027-01-03'), ...['PI Planning', 'PI Alpha', 'PI Beta', 'PI Gamma', 'PI Delta', 'PI Epsilon', 'PI Planning'].map((name) => it(`Q\\${name}`, '2027-01-04', '2027-01-05')), it('Q\\PI 27.1', '2027-01-06', '2027-04-04')]
  const named = nextPiOf('Q\\PI 26.4', unnamed, [], { today: autumn })
  assert.equal(named.pi, 'PI 27.1')
  assert.match(named.note, / Left out \(no PI number in the name\): PI Planning, PI Alpha, PI Beta, PI Gamma, PI Delta and 1 more\.$/)
  assert.equal(leftOutNote(['PI 25.1', 'PI 25.2', 'Q\\2026']), ' Left out (no PI number in the name): Q\\2026.', 'never a name that has a PI number')
  // PI 26.4 and PI 2026.4 are the same PI.
  assert.equal(nextPiOf('Q\\PI 26.4', [it('Q\\PI 2026.4', '2026-10-05', '2027-01-03'), it('Q\\PI 2027.1', '2027-01-04', '2027-04-04')], [], { today: autumn }).pi, 'PI 2027.1')
})

test('PIR-13: the form starts from the latest review split by headings; Partly starts at No (TC-PIR-14)', () => {
  const split = reviewSplit(commentText(buildReviewComment(form)))
  assert.deepEqual(reviewFormFrom(split, 'PI 99.1'), { ...form, learnings: 'Book the rig early\nshare <the> calendar & more\nplan the docs', moveReason: 'two stories left\ndocs pending' })
  assert.equal(reviewFormFrom(reviewSplit('Move to next PI: Partly - docs'), 'PI 26.5').move, 'No')
  assert.deepEqual(reviewFormFrom(reviewSplit('We were blocked by the vendor.'), 'PI 26.5'), emptyReviewForm('PI 26.5'), 'keywords only: not prefilled')
})

test('PIR-15: the Review meeting and Additional Remarks headings and their short forms (TC-PIR-15)', () => {
  const full = splitReviewComment('Struggles: rig\nAdvise to discuss the Feature during the Review meeting?\nOffline\nAdditional Remarks (If Any): none really')
  assert.deepEqual([full.review, full.reviewMode, full.remarks], ['Offline', 'Offline Review', 'none really'])
  assert.equal(splitReviewComment('Review meeting: yes').reviewMode, 'Discuss during Meeting')
  assert.equal(splitReviewComment('Discuss in meeting - Discuss during Meeting').reviewMode, 'Discuss during Meeting')
  assert.equal(splitReviewComment('Remarks:\nthanks').remarks, 'thanks')
  assert.equal(splitReviewComment('Learnings: a. Additional comments: b').remarks, 'b')
  assert.deepEqual([reviewModeOf('in the meeting please'), reviewModeOf('no'), reviewModeOf('maybe')], ['Discuss during Meeting', 'Offline Review', undefined])
  assert.deepEqual(splitReviewComment('We will discuss in the review meeting tomorrow.'), {}, 'in a sentence: no heading')
  assert.equal(splitReviewComment(`Learnings: a\n${reviewFooter}`).learnings, 'a', 'the footer is dropped')
})

const viewer = (actions, extra = {}) => ({ can: (key) => actions.includes(key), readOnly: false, viewingAs: '', email: 'ana@example.com', isSample: false, config, pat: 'p', ...extra })
const feature = (email) => ({ id: 7, key: 'org/quality/7', assignedTo: email ? 'Ana' : 'Ben', ...(email ? { assignedToEmail: email } : {}) })
test('CON-113: who may post — the assignee (with Add a comment), a lead (PI Review: post), nobody else; the page reasons (TC-CON-70)', async () => {
  assert.equal(reviewPostBlock(viewer(['work.comment']), feature('ana@example.com')), '', 'the assignee')
  assert.equal(reviewPostBlock(viewer(['pireview.post']), feature('ben@example.com')), '', 'a lead, on any Feature')
  assert.match(reviewPostBlock(viewer(['work.comment']), feature('ben@example.com')), /Only the Feature’s assignee \(Ana\) or a lead/)
  assert.match(reviewPostBlock(viewer([]), feature('ana@example.com')), /does not allow “Add a comment”/)
  assert.match(reviewPostBlock(viewer(['work.comment'], { email: '' }), feature('ana@example.com')), /enter your work email/)
  assert.match(reviewPageBlock(viewer(['pireview.post'], { readOnly: true })), /access roles are not loaded/)
  assert.match(reviewPageBlock(viewer(['pireview.post'], { viewingAs: 'the role Team Member' })), /Read only while viewing as the role Team Member/)
  assert.match(reviewPageBlock(viewer(['pireview.post'], { isSample: true })), /Synthetic sample data/)
  assert.match(reviewPageBlock(viewer(['pireview.post'], { pat: '' })), /with its PAT/)
  assert.match(reviewPageBlock(viewer(['pireview.post'], { config: { ...config, baseUrl: 'https://tfs.example.com/tfs/Coll' } })), /dev\.azure\.com\) only/)
  // The guard every write passes: refused before sending unless the rights allow it (the writer's email from useAccess).
  const can = (list) => (key) => list.includes(key)
  assert.equal(reviewPostAllowed('Ana@Example.com', can(['work.comment']), 'ana@example.com'), true)
  assert.equal(reviewPostAllowed('', can(['work.comment']), ''), false, 'no email on either side: not the assignee')
  assert.equal(reviewPostAllowed('ben@example.com', can(['work.comment']), 'ana@example.com'), false)
  assert.equal(reviewPostAllowed('ben@example.com', can(['pireview.post']), 'ana@example.com'), true)
  const original = globalThis.fetch, sent = []
  globalThis.window = {}
  try {
    globalThis.fetch = async (url, init) => { sent.push({ url, body: init.body }); return new Response('{"id":91}', { status: 200, headers: { 'content-type': 'application/json' } }) }
    guardAzureWrites(can(['work.comment']), undefined, 'ana@example.com')
    await assert.rejects(postReview(config, 'p', { id: 7, assignedToEmail: 'ben@example.com' }, buildReviewComment(form)), /Only the Feature’s assignee or a lead/)
    assert.equal(sent.length, 0, 'nothing sent')
    assert.equal(await postReview(config, 'p', { id: 7, assignedToEmail: 'ana@example.com' }, buildReviewComment(form)), 91)
    assert.equal(sent[0].url, 'https://dev.azure.com/org/Quality/_apis/wit/workItems/7/comments?api-version=7.1-preview.4')
    assert.deepEqual(JSON.parse(sent[0].body), { text: buildReviewComment(form) }, 'the app-built list HTML, sent as it is')
    // SM-183: markup the app does not build is refused before anything is sent; a plain comment is still escaped.
    await assert.rejects(postReview(config, 'p', { id: 7, assignedToEmail: 'ana@example.com' }, '<ul><li onclick="x">A</li></ul>'), /markup the app does not send/)
    await assert.rejects(requestAzure({ ...config, pat: 'p', operation: 'add-comment', workItemId: 7, comment: '<ul><li>A</li></ul>', htmlComment: true }), /markup the app does not send/, 'only a PI Review post')
    assert.equal(sent.length, 1)
    await assert.rejects(requestAzure({ ...config, pat: 'p', operation: 'comments', workItemId: 7, reviewOf: 'x' }), /Invalid PI Review post/)
    guardAzureWrites(can([]), 'read only', '')
    await assert.rejects(postReview(config, 'p', { id: 7, assignedToEmail: 'ana@example.com' }, '<p>x</p>'), /read only/)
    // 401 / 403 / 429 on the post say why.
    guardAzureWrites(can(['pireview.post']))
    for (const [status, reason] of [[401, /PAT was rejected/], [403, /Access denied.*Read & Write/], [429, /\(429\)\. Retry after 5 s\. The comment was not added/]]) {
      globalThis.fetch = async () => new Response('{}', { status, headers: { 'content-type': 'application/json', 'Retry-After': '5' } })
      await assert.rejects(postReview(config, 'p', { id: 7 }, '<p>x</p>'), reason)
    }
  } finally { delete globalThis.window; globalThis.fetch = original; guardAzureWrites(() => true) }
})

test('CON-113: “PI Review: post the review of a Feature” (permissions 7) — Tool Owner, Admin and People Manager in the starting matrix and for an older file (TC-CON-70)', () => {
  const policy = defaultPolicy()
  for (const role of ['Tool Owner', 'Admin', 'People Manager']) assert.ok(policy.roles[role].actions.includes('pireview.post'), role)
  for (const role of ['Product Owner', 'Scrum Master', 'Team Member']) assert.ok(!policy.roles[role].actions.includes('pireview.post'), role)
  assert.match(serializeAccess(policy), /"permissions": 8/)
  const v6 = JSON.parse(serializeAccess(policy)); v6.permissions = 6
  for (const rights of Object.values(v6.roles)) rights.actions = rights.actions.filter((key) => key !== 'pireview.post')
  const read = parseAccess(JSON.stringify(v6))
  assert.ok(read.roles['People Manager'].actions.includes('pireview.post') && read.roles.Admin.actions.includes('pireview.post'))
  assert.ok(!read.roles['Team Member'].actions.includes('pireview.post'))
  read.roles['People Manager'].actions = read.roles['People Manager'].actions.filter((key) => key !== 'pireview.post')
  assert.ok(!parseAccess(serializeAccess(read)).roles['People Manager'].actions.includes('pireview.post'), 'saved again: Not set stays')
  assert.equal(rightsFor(null, 'x@example.com').actions.has('pireview.post'), false)
})

test('PIR-17: my latest review — the newest comment I wrote with the review headings (TC-PIR-17)', () => {
  const comments = [
    { id: 3, author: 'Ben Okafor', text: 'Learnings: theirs', date: '2026-11-23T10:00:00Z' },
    { id: 2, author: 'ana costa', text: 'Thanks all', date: '2026-11-22T10:00:00Z' },
    { id: 1, author: 'Ana Costa', text: commentText(buildReviewComment(form)), date: '2026-11-21T10:00:00Z' },
  ]
  assert.equal(myReviewOf(comments, 'Ana Costa')?.comment.id, 1)
  assert.equal(myReviewOf(comments, 'Ana Costa')?.split.moveValue, 'Yes')
  assert.equal(myReviewOf(comments, 'Cleo'), undefined)
  assert.equal(myReviewOf(comments, undefined), undefined)
})

// PIR-25: the next PI from the Azure DevOps iteration tree by its dates (synthetic iterations). Product owner, 25 Nov
// 2026: always from today's PI, never from the reviewed PI — `today` is injected.
const it = (path, start, finish) => ({ name: path.split('\\').at(-1), path, ...(start ? { attributes: { startDate: `${start}T00:00:00Z`, finishDate: `${finish}T00:00:00Z` } } : {}) })
const autumn = new Date('2026-11-25T23:30:00Z')
const piTreeDated = [it('Q'), it('Q\\PI 26.3', '2026-07-06', '2026-10-04'), it('Q\\PI 26.4', '2026-10-05', '2027-01-03'), it('Q\\PI 27.2', '2027-04-05', '2027-07-04'), it('Q\\PI 27.1', '2027-01-04', '2027-04-04'), it('Q\\PI 26.5')]
test('PIR-25: the next PI is the dated PI starting next after today’s PI — whatever PI is reviewed (TC-PIR-25)', () => {
  const expected = { pi: 'PI 27.1', source: 'dates', note: `From Azure DevOps iteration dates: today (${formatDate('2026-11-25')}) is in PI 26.4 (${formatDate('2026-10-05')} – ${formatDate('2027-01-03')}); the next PI is PI 27.1, starting ${formatDate('2027-01-04')}.`, short: 'From the Azure DevOps dates.', missing: false }
  assert.deepEqual(nextPiOf('Q\\PI 26.4', piTreeDated, ['Q\\PI 26.4', 'Q\\PI 26.5'], { today: autumn }), expected, 'the reviewed PI is today’s PI; PI 26.5 (undated, the next number) is not chosen')
  assert.deepEqual(nextPiOf('Q\\PI 26.3', piTreeDated, [], { today: autumn }), expected, 'a reviewed PI older than today’s PI')
  assert.deepEqual(nextPiOf('Q\\PI 27.2', piTreeDated, [], { today: autumn }), expected, 'a reviewed PI newer than today')
  assert.deepEqual(nextPiOf('Q\\Big Room PI', piTreeDated, [], { today: autumn }), expected, 'a reviewed PI without a number')
  assert.deepEqual(nextPiOf('', piTreeDated, [], { today: autumn }), expected, 'no reviewed PI')
  // The product owner's example: a Feature of PI 26.4 reviewed on 10 Jan 2027 (in PI 27.1) gets PI 27.2.
  assert.equal(nextPiOf('Q\\PI 26.4', piTreeDated, [], { today: new Date('2027-01-10T08:00:00Z') }).pi, 'PI 27.2')
  // An unsorted tree in other letter case gives the same answer; today is taken in UTC.
  assert.equal(nextPiOf('q\\pi 26.4', [...piTreeDated].reverse(), [], { today: new Date('2027-01-03T23:59:00Z') }).pi, 'PI 27.1')
  assert.equal(nextPiOf('Q\\PI 26.4', piTreeDated, [], { today: new Date('2027-01-04T00:00:00Z') }).pi, 'PI 27.2')
})

test('PIR-25: dated only by its Sprints — a PI takes the span of the dated iterations under it; its own dates win (TC-PIR-25)', () => {
  const tree = [it('Q\\PI 26.4'), it('Q\\PI 26.4\\Sprint 1', '2026-07-01', '2026-07-14'), it('Q\\PI 26.4\\Sprint 6', '2026-09-16', '2026-09-30'), it('Q\\PI 26.5'), it('Q\\PI 26.5\\Sprint 1', '2026-10-01', '2026-10-14')]
  assert.deepEqual(piDates(tree).get('q\\pi 26.4'), { path: 'Q\\PI 26.4', start: '2026-07-01', finish: '2026-09-30' })
  const next = nextPiOf('Q\\PI 26.4', tree, [], { today: new Date('2026-08-01T12:00:00Z') })
  assert.deepEqual([next.pi, next.source], ['PI 26.5', 'dates'])
  assert.deepEqual(piDates([it('Q\\PI 26.4\\Sprint 1', '2000-01-01', '2099-12-31'), it('Q\\PI 26.4', '2026-07-01', '2026-09-30')]).get('q\\pi 26.4'), { path: 'Q\\PI 26.4', start: '2026-07-01', finish: '2026-09-30' })
  assert.deepEqual(piPeriods([it('Q\\PI 26.4\\Sprint 1', '2000-01-01', '2099-12-31'), it('Q\\PI 26.4', '2026-07-01', '2026-09-30')]).dated, [{ pi: 'PI 26.4', parts: [26, 4], start: '2026-07-01', finish: '2026-09-30' }])
})

test('PIR-25: overlapping dates — the earliest start after today’s PI’s start, said so (TC-PIR-25)', () => {
  const tree = [it('Q\\PI 26.4', '2026-07-01', '2026-09-30'), it('Q\\PI 26.6', '2026-12-01', '2027-02-28'), it('Q\\PI 26.5', '2026-09-20', '2026-12-15'), it('Q\\PI 26.3', '2026-06-01', '2026-06-30')]
  const next = nextPiOf('Q\\PI 26.3', tree, [], { today: new Date('2026-08-15T12:00:00Z') })
  assert.equal(next.pi, 'PI 26.5', 'the overlapping PI, not the first one starting after PI 26.4 ends')
  assert.match(next.note, /^From Azure DevOps iteration dates: today \(.+\) is in PI 26\.4 \(.+ – .+\); the next PI is PI 26\.5, starting .+ while PI 26\.4 runs until .+ \(the PIs overlap\)\.$/)
  // The same start: the lower PI number first.
  assert.equal(nextPiOf('Q\\PI 26.4', [it('Q\\PI 26.4', '2026-07-01', '2026-09-30'), it('Q\\PI 27.2', '2026-10-01', '2026-12-31'), it('Q\\PI 27.1', '2026-10-01', '2026-12-31')], [], { today: new Date('2026-08-15T12:00:00Z') }).pi, 'PI 27.1')
})

// PIR-25: today's PI not found by the dates — never silently: the note says the dates were missing and what was used,
// the short line is a warning (missing), and Moves to stays editable.
test('PIR-25: today in no PI, today in two PIs, an undated tree — the fallbacks, said so (TC-PIR-32)', () => {
  const gap = [it('Q\\PI 26.3', '2026-04-01', '2026-06-30'), it('Q\\PI 26.4', '2026-07-01', '2026-09-30'), it('Q\\PI 26.5'), it('Q\\PI 27.1', '2027-01-04', '2027-03-31')]
  const none = nextPiOf('Q\\PI 26.3', gap, [], { today: autumn })
  assert.deepEqual(none, { pi: 'PI 26.5', source: 'number', note: `The PI dates are missing: no PI in Azure DevOps has dates covering today (${formatDate('2026-11-25')}). Used instead: PI 26.4, the latest PI that ended before today (${formatDate('2026-09-30')}) — PI 26.5 is the next PI by number in the Azure DevOps iteration tree (it has no dates).`, short: 'PI dates missing in Azure DevOps — check this PI.', missing: true })
  // No undated PI after it: the number rollover from it (the dated PI 27.1 is not chosen by number).
  const rolled = nextPiOf('Q\\PI 26.3', gap.filter((entry) => entry.path !== 'Q\\PI 26.5'), [], { today: autumn })
  assert.equal(rolled.pi, 'PI 27.1')
  assert.match(rolled.note, /Used instead: PI 26\.4, the latest PI that ended before today \(.+\) — worked out from the PI number — PI 26\.4 is the last PI of its year \(4 a year\), so the next is PI 27\.1\.$/)
  // Two PIs current today.
  const two = nextPiOf('Q\\PI 26.4', [it('Q\\PI 26.3', '2026-07-06', '2026-10-04'), it('Q\\PI 26.4', '2026-10-05', '2027-01-03'), it('Q\\PI 26.9', '2026-11-01', '2026-11-30'), it('Q\\PI 26.5')], [], { today: autumn })
  assert.deepEqual([two.pi, two.source, two.missing], ['PI 26.5', 'number', true])
  assert.match(two.note, /^The PI dates do not decide: 2 PIs have dates covering today \(.+\) — PI 26\.4, PI 26\.9\. Used instead: PI 26\.3, the latest PI that ended before today/)
  // An undated tree: only the reviewed PI is known.
  const undated = nextPiOf('Q\\PI 26.4', [it('Q\\PI 26.4'), it('Q\\PI 26.5'), it('Q\\PI 26.4\\Sprint 1')], ['Q\\PI 26.4'], { today: autumn })
  assert.deepEqual(undated, { pi: 'PI 26.5', source: 'number', note: 'The PI dates are missing: no PI in the Azure DevOps iteration tree has dates. Used instead: PI 26.4, the reviewed PI — PI 26.5 is the next PI by number in the Azure DevOps iteration tree (it has no dates).', short: 'PI dates missing in Azure DevOps — check this PI.', missing: true })
  assert.deepEqual(nextPiOf('', [it('Q\\PI 26.4')], [], { today: autumn }), { pi: '', source: 'number', note: 'The PI dates are missing: no PI in the Azure DevOps iteration tree has dates, and no PI is known to work it out from.', short: 'PI dates missing in Azure DevOps — check this PI.', missing: true })
  // Without the iterations: still being read, or not read.
  const reading = nextPiOf('Q\\PI 26.4', null, ['Q\\PI 26.4', 'Q\\PI 26.5'], { reading: true, today: autumn })
  assert.deepEqual([reading.pi, reading.short], ['PI 26.5', 'PI dates still being read — by the PI number for now.'])
  assert.match(reading.note, /^The PI dates are still being read from Azure DevOps, so today’s PI is not known yet\. Used instead: PI 26\.4, the reviewed PI — PI 26\.5 is the next PI by number in the PI list\.$/)
  // Unreadable dates count as none; nothing known gives nothing.
  assert.equal(nextPiOf('Q\\PI 26.4', [{ name: 'PI 26.4', path: 'Q\\PI 26.4', attributes: { startDate: 'soon', finishDate: '' } }], [], { today: autumn }).missing, true)
  assert.deepEqual(nextPiOf('', null, [], { today: autumn }), { pi: '', source: 'number', note: 'The PI dates are not read from Azure DevOps here, so today’s PI is not known, and no PI is known to work it out from.', short: 'PI dates missing in Azure DevOps — check this PI.', missing: true })
})

// PIR-25: today's PI without a later dated PI — the next undated PI by number in the tree after it.
test('PIR-25: no later PI with dates — the next PI by number among the undated PIs in the tree after today’s PI (TC-PIR-32)', () => {
  const sprints = [it('Q\\PI 26.3', '2026-04-01', '2026-06-30'), it('Q\\PI 26.4'), it('Q\\PI 26.4\\Sprint 1', '2026-07-01', '2026-07-14'), it('Q\\PI 26.4\\Sprint 6', '2026-09-16', '2026-09-30')]
  const summer = new Date('2026-08-01T12:00:00Z')
  const future = nextPiOf('Q\\PI 26.3', [...sprints, it('Q\\PI 27.2'), it('Q\\PI 27.1'), it('Q\\PI 27.1\\Sprint 1')], [], { today: summer })
  assert.deepEqual([future.pi, future.source, future.missing], ['PI 27.1', 'number', true])
  assert.match(future.note, /^From Azure DevOps iteration dates: today \(.+\) is in PI 26\.4 \(.+\), but no later PI has dates: PI 27\.1 is the next PI by number in the Azure DevOps iteration tree \(it has no dates\)\.$/)
  // A future PI dated only by its Sprints is found by the dates.
  const bySprints = nextPiOf('Q\\PI 26.4', [...sprints, it('Q\\PI 27.1'), it('Q\\PI 27.1\\Sprint 1', '2026-10-05', '2026-10-18')], [], { today: summer })
  assert.deepEqual([bySprints.pi, bySprints.source], ['PI 27.1', 'dates'])
  assert.match(bySprints.note, /the next PI is PI 27\.1, starting .+\.$/)
})

// PIR-13 (product owner, 25 Nov 2026: "When I select No, it should not show the next PI"): with No the Reason is not
// posted (kept in the form) and Moves to is not checked; the heading still names the next PI.
test('PIR-13: Move to next PI = No — the reason kept but not posted, Moves to not asked; the heading names the next PI (TC-PIR-14)', () => {
  const no = { ...form, move: 'No', moveReason: 'typed while Yes', movePi: 'PI 27.1', reviewedPi: 'PI 26.4' }
  const html = buildReviewComment(no)
  assert.match(html, /<li>Whether the feature needs to be shifted to PI 27\.1 : No<\/li>/)
  assert.doesNotMatch(html, /typed while Yes/)
  assert.deepEqual(reviewFormProblems(no), [])
  assert.deepEqual(reviewFormProblems({ ...no, movePi: '' }), [], 'Moves to is hidden with No: not checked')
  assert.match(buildReviewComment({ ...no, movePi: '' }), /shifted to the next PI : No/)
  assert.deepEqual(reviewFormProblems({ ...no, move: 'Yes', movePi: '' }), ['Enter the PI it moves to as “PI” and its number, e.g. PI 26.5.'])
  assert.match(buildReviewComment({ ...no, move: 'Yes' }), /shifted to PI 27\.1 : Yes<ul><li>typed while Yes<\/li><\/ul>/)
  assert.equal(reviewSummary(no), 'Move to next PI No, Discuss during Meeting')
  assert.equal(reviewSummary({ ...no, move: 'Yes' }), 'Move to next PI Yes (to PI 27.1), Discuss during Meeting')
})

// PIR-24: My PI Review's Person filter.
test('PIR-24: who may show another person — a lead with “PI Review: post the review of a Feature”; the person matched by email where known (TC-PIR-26)', () => {
  const lead = { can: (action) => action === 'pireview.post' }, member = { can: (action) => action === 'work.comment' }
  assert.equal(otherPersonBlock(lead), '')
  assert.match(otherPersonBlock(member), /^You see your own Features: showing another person’s needs “PI Review: post the review of a Feature”/)
  const items = [{ assignedTo: 'Ben Okafor', assignedToEmail: '' }, { assignedTo: 'ben okafor', assignedToEmail: 'Ben.Okafor@example.com' }, { assignedTo: 'Rita Gomez', assignedToEmail: 'rita.gomez@example.com' }]
  assert.deepEqual(personOf(items, 'Ben Okafor '), { name: 'Ben Okafor', email: 'ben.okafor@example.com' })
  assert.deepEqual(personOf(items, 'Ada Lin'), { name: 'Ada Lin' }, 'by name when no email is known')
})

// PIR-26, PIR-28: when a review counts as Reviewed for the PI chosen in the PI filter (synthetic iterations and dates).
const piTree = [it('Q'), it('Q\\PI 26.3', '2026-04-06', '2026-07-05'), it('Q\\PI 26.4'), it('Q\\PI 26.4\\Sprint 1', '2026-07-06', '2026-08-16'), it('Q\\PI 26.4\\Sprint 2', '2026-08-17', '2026-10-04'), it('Q\\PI 27.1', '2026-10-05', '2027-01-03')]
const active = { state: 'Active' }
test('PIR-26: a review counts when it is dated within the chosen PI’s dates (its own, else its Sprints’), in UTC; a review from another PI does not, named by that PI (TC-PIR-27)', () => {
  const p264 = reviewPeriodOf('Q\\PI 26.4', piTree)
  assert.deepEqual([p264.start, p264.finish, p264.note], ['2026-07-06', '2026-10-04', ''], 'PI 26.4 dated by its Sprints only')
  // Inside the chosen PI (first and last day included).
  for (const date of ['2026-07-06T00:00:00Z', '2026-09-01T12:00:00Z', '2026-10-04T23:59:59Z']) assert.deepEqual(reviewCountOf({ date }, active, p264), { counts: true, why: 'pi' }, date)
  // Before it: Not reviewed, named by the PI whose dates cover it; after it likewise; outside every PI: another PI.
  assert.deepEqual(reviewCountOf({ date: '2026-06-12T10:00:00Z' }, active, p264), { counts: false, why: 'other', otherPi: 'PI 26.3' })
  assert.deepEqual(reviewCountOf({ date: '2026-11-20T10:00:00Z' }, active, p264), { counts: false, why: 'other', otherPi: 'PI 27.1' })
  assert.deepEqual(reviewCountOf({ date: '2025-01-10T10:00:00Z' }, active, p264), { counts: false, why: 'other', otherPi: '' })
  assert.equal(otherPiHint('2026-06-12T10:00:00Z', reviewCountOf({ date: '2026-06-12T10:00:00Z' }, active, p264)), `Last review ${formatDate('2026-06-12T10:00:00Z')} (PI 26.3)`)
  assert.match(otherPiHint('2025-01-10T10:00:00Z', reviewCountOf({ date: '2025-01-10T10:00:00Z' }, active, p264)), /\(another PI\)$/)
  // UTC: 23:30 on 5 July at UTC−2 is 6 July in UTC — inside PI 26.4.
  assert.equal(reviewCountOf({ date: '2026-07-05T23:30:00-02:00' }, active, p264).counts, true)
  assert.equal(reviewCountOf({ date: '2026-07-06T00:30:00+02:00' }, active, p264).counts, false, '5 July 22:30 UTC')
  // Choosing another PI recomputes: the same review counts for PI 26.3, not for PI 26.4.
  assert.equal(reviewCountOf({ date: '2026-06-12T10:00:00Z' }, active, reviewPeriodOf('Q\\PI 26.3', piTree)).counts, true)
  // An unreadable date never counts against dates.
  assert.equal(reviewCountOf({ date: 'yesterday' }, active, p264).counts, false)
})

test('PIR-26: a Closed Feature — a review on or after its Closed Date counts, also from an earlier PI; one before it does not (TC-PIR-27)', () => {
  const p271 = reviewPeriodOf('q\\pi 27.1', piTree)
  const closed = { state: 'Closed', closedDate: '2026-09-20T15:02:11Z' }
  // The review of the Close pop-up is posted seconds before the Feature closes: the same UTC day counts.
  assert.deepEqual(reviewCountOf({ date: '2026-09-20T15:02:05Z' }, closed, p271), { counts: true, why: 'closed' })
  assert.deepEqual(reviewCountOf({ date: '2026-09-25T08:00:00Z' }, closed, p271), { counts: true, why: 'closed' })
  assert.deepEqual(reviewCountOf({ date: '2026-09-19T23:59:00Z' }, closed, p271), { counts: false, why: 'other', otherPi: 'PI 26.4' })
  // Not Closed now (reopened, Resolved): the Closed Date does not help.
  assert.equal(reviewCountOf({ date: '2026-09-25T08:00:00Z' }, { ...closed, state: 'Active' }, p271).counts, false)
  assert.equal(reviewCountOf({ date: '2026-09-25T08:00:00Z' }, { ...closed, state: 'Resolved' }, p271).counts, false)
  assert.equal(reviewCountOf({ date: '2026-09-25T08:00:00Z' }, { state: 'Closed' }, p271).counts, false, 'no Closed Date')
})

test('PIR-26: no dates — the chosen PI without dates, or the iterations not read: every review counts, and the note says so (TC-PIR-27)', () => {
  const undated = reviewPeriodOf('Q\\PI 26.5', [...piTree, it('Q\\PI 26.5')])
  assert.equal(undated.start, undefined)
  assert.match(undated.note, /^PI 26\.5 has no dates in Azure DevOps .*every review comment counts as Reviewed, whatever its date\.$/)
  assert.deepEqual(reviewCountOf({ date: '2020-01-01T00:00:00Z' }, active, undated), { counts: true, why: 'any' })
  assert.match(reviewPeriodOf('Q\\PI 26.4', null, { problem: 'the Time Writing connection has no PAT here' }).note, /could not be read from Azure DevOps \(the Time Writing connection has no PAT here\): every review/)
  assert.equal(reviewPeriodOf('Q\\PI 26.4', null, { reading: true }).note, '', 'still reading: nothing said yet')
  assert.equal(reviewCountOf({ date: '2020-01-01T00:00:00Z' }, active, reviewPeriodOf('Q\\PI 26.4', null)).counts, true)
})

test('PIR-28: a review whose headings name a PI counts for that PI whatever its date, not for another one (unless the closed rule applies); without one, the dates decide (TC-PIR-29)', () => {
  const p264 = reviewPeriodOf('Q\\PI 26.4', piTree)
  // Written late, after PI 26.4 ended, but its headings say PI 26.4.
  assert.deepEqual(reviewCountOf({ date: '2026-11-20T10:00:00Z', reviewedPi: 'PI 26.4' }, active, p264), { counts: true, why: 'heading' })
  // Dated inside PI 26.4 but written for PI 26.3.
  assert.deepEqual(reviewCountOf({ date: '2026-07-10T10:00:00Z', reviewedPi: 'PI 26.3' }, active, p264), { counts: false, why: 'other', otherPi: 'PI 26.3' })
  assert.equal(reviewCountOf({ date: '2026-09-25T08:00:00Z', reviewedPi: 'PI 26.3' }, { state: 'Closed', closedDate: '2026-09-20T00:00:00Z' }, p264).why, 'closed')
  // Also when the chosen PI has no dates.
  assert.equal(reviewCountOf({ date: '2020-01-01T00:00:00Z', reviewedPi: 'PI 26.3' }, active, reviewPeriodOf('Q\\PI 26.5', [])).counts, false)
  assert.equal(reviewCountOf({ date: '2020-01-01T00:00:00Z', reviewedPi: 'pi 26.5' }, active, reviewPeriodOf('Q\\PI 26.5', [])).counts, true)
  // Read from the comment as posted.
  const split = readBackReview(buildReviewComment({ ...form, reviewedPi: 'PI 26.4' }))
  assert.equal(reviewCountOf({ date: '2026-11-20T10:00:00Z', reviewedPi: split.reviewedPi }, active, p264).counts, true)
})

test('PIR-26: Write review… keeps the latest review as the prefill and says when it was written for another PI (TC-PIR-27)', () => {
  const comment = { date: '2026-06-12T10:00:00Z' }
  assert.equal(prefilledOtherPi(comment, {}, active, 'Q\\PI 26.4', { list: piTree }), 'PI 26.3')
  assert.equal(prefilledOtherPi(comment, {}, active, 'Q\\PI 26.3', { list: piTree }), '', 'in the reviewed PI: no label')
  assert.equal(prefilledOtherPi(comment, { reviewedPi: 'PI 26.4' }, active, 'Q\\PI 26.4', { list: piTree }), '', 'its headings name the reviewed PI')
  assert.equal(prefilledOtherPi({ date: '2025-01-01T00:00:00Z' }, {}, active, 'Q\\PI 26.4', { list: piTree }), 'another PI')
  assert.equal(prefilledOtherPi(comment, {}, active, 'Q\\PI 26.4', { list: null, reading: true }), '', 'while the iterations are read')
  // The prefill itself is unchanged: the latest review split by headings.
  assert.equal(reviewFormFrom(reviewSplit(commentText(buildReviewComment(form))), 'PI 26.5').struggles, 'Vendor late')
})

// PIR-27: "No learnings or struggles".
test('PIR-27: “No learnings or struggles” sets both to None (written under both headings, read back as None), untick restores what was typed; one field removed or both (TC-PIR-28)', () => {
  const builtIn = builtInFormSetup()
  assert.deepEqual(noneChoice(builtIn), { label: 'No learnings or struggles', help: 'Sets Learnings and Struggles to “None”.', fields: ['learnings', 'struggles'] })
  const typed = { ...form, learnings: 'half a thought', struggles: '', reviewedPi: 'PI 27.1' }
  const ticked = withNoTexts(typed, builtIn, true)
  assert.deepEqual([ticked.learnings, ticked.struggles], ['None', 'None'])
  assert.match(buildReviewComment(ticked), /^<ul><li>Learnings of PI 27\.1:<ul><li>None<\/li><\/ul><\/li><li>Struggles of PI 27\.1:<ul><li>None<\/li><\/ul><\/li>/, 'the “◦ None” nested bullets')
  const back = readBackReview(buildReviewComment(ticked))
  assert.deepEqual([back.learnings, back.struggles], ['None', 'None'], 'read back as None, shown as None')
  assert.deepEqual(reviewFormProblems(ticked), [], 'passes the form checks and the read-back check')
  assert.deepEqual(withNoTexts(withNoTexts(ticked, builtIn, true), builtIn, false), typed, 'unticking restores what was typed (ticking twice changes nothing)')
  // One removed: only the other, said in the label; both removed: no tick box.
  const noStruggles = builtInFormSetup(); noStruggles.fields = noStruggles.fields.filter((field) => field.id !== 'struggles')
  assert.equal(noneChoice(noStruggles).label, 'No learnings (sets only Learnings: Struggles is not in this form)')
  const one = withNoTexts(typed, noStruggles, true)
  assert.deepEqual([one.learnings, one.struggles], ['None', ''])
  assert.deepEqual(formSetupProblems(noStruggles), [])
  const noLearnings = builtInFormSetup(); noLearnings.fields = noLearnings.fields.filter((field) => field.id !== 'learnings')
  assert.equal(noneChoice(noLearnings).label, 'No struggles (sets only Struggles: Learnings is not in this form)')
  const neither = builtInFormSetup(); neither.fields = neither.fields.filter((field) => field.id !== 'learnings' && field.id !== 'struggles')
  assert.equal(noneChoice(neither), null)
  assert.equal(withNoTexts(typed, neither, true), typed)
  // Relabelled: the label follows ("Lessons" → "No lessons or struggles").
  const relabelled = builtInFormSetup(); relabelled.fields[0].label = 'Lessons'
  assert.equal(noneChoice(relabelled).label, 'No lessons or struggles')
  // A comment written by hand with "None" reads None too.
  assert.equal(splitReviewComment('Learnings:\nNone\nStruggles : None').struggles, 'None')
})
