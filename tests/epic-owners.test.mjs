import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanProductOwner, copyEpicFields, parseEpicSetup, productOwnerOf, serializeEpicSetup, withoutEpicFields, withProductOwner } from '../src/epicSetup.ts'
import { epicIdOf, featureOwner, keepsOwner, meetingOwners, noOwnerKey, offeredOwners, ownedEpics, ownedFeatures, ownerName, ownerOptions, ownerStreamKeys, sameOwnerEmail, streamOwners } from '../src/epicOwners.ts'
import { isEpicOwner, postReview, reviewPostBlock } from '../src/piReviewPost.ts'
import { guardAzureWrites, guardEpicOwners, reviewPostAllowed } from '../src/azureDevOps.ts'
import { meetingSlides } from '../src/piMeeting.ts'
import { buildReviewComment } from '../src/piReviewPost.ts'

// EPS-11, PIR-68…PIR-71: the Product Owner of an Epic — synthetic people and Epics only.
const rita = { email: 'rita.gomez@example.com', name: 'Rita Gomez' }, ben = { email: 'ben.okafor@example.com', name: 'Ben Okafor' }
const file = (epics) => ({ schema: 1, kind: 'epic-setup', lists: [], epics })
const setup = file([
  { epicId: 100, epicTitle: 'Tools', fields: [{ label: 'Program', type: 'text', ifEmpty: 'optional', into: 'title' }], productOwner: rita },
  { epicId: 110, epicTitle: 'Audits', fields: [], productOwner: ben },
  { epicId: 120, epicTitle: 'Labs', fields: [{ label: 'Site', type: 'text', ifEmpty: 'optional', into: 'description' }] },
])
const base = { organization: 'o', project: 'p', state: 'Active', assignedTo: 'Ana Silva', assignedToEmail: 'ana.silva@example.com', areaPath: 'p', iterationPath: 'p\\PI 26.4', tags: '', url: '', syncedAt: '' }
const wi = (id, workItemType, extra = {}) => ({ ...base, key: `o/p/${id}`, id, workItemType, title: `${workItemType} ${id}`, ...extra })
const items = [wi(100, 'Epic'), wi(110, 'Epic'), wi(120, 'Epic'), wi(201, 'Feature', { parentId: 100 }), wi(202, 'Feature', { parentId: 110 }), wi(203, 'Feature', { parentId: 120 }), wi(204, 'Feature'), wi(301, 'User Story', { parentId: 201 })]

test('EPS-11: the Product Owner is read strictly, saved with the Epic setup and an older file loads unchanged (TC-EPS-10)', () => {
  const read = parseEpicSetup(serializeEpicSetup(setup))
  assert.deepEqual(productOwnerOf(read, 100), rita)
  assert.deepEqual(productOwnerOf(read, 110), ben, 'an Epic with only a Product Owner is kept')
  assert.equal(productOwnerOf(read, 120), undefined)
  const older = '{"schema":1,"kind":"epic-setup","lists":[],"epics":[{"epicId":120,"epicTitle":"Labs","fields":[{"label":"Site","type":"text","ifEmpty":"optional","into":"description"}]}]}'
  assert.equal(serializeEpicSetup(parseEpicSetup(older)), serializeEpicSetup(JSON.parse(older)), 'a file saved before the setting reads and writes the same')
  assert.doesNotMatch(serializeEpicSetup(parseEpicSetup(older)), /productOwner/)
  assert.deepEqual(cleanProductOwner({ email: ' Rita.Gomez@Example.com ', name: '  Rita   Gomez ' }), rita, 'email in lower case, the name tidied')
  assert.deepEqual(cleanProductOwner({ email: 'rita.gomez@example.com' }), { email: 'rita.gomez@example.com', name: 'rita.gomez' }, 'no name: the email’s name part')
  for (const bad of [null, 'rita@example.com', { email: 'not an email' }, { email: 'a b@example.com' }, { email: 7 }, { name: 'Rita' }]) assert.equal(cleanProductOwner(bad), undefined, JSON.stringify(bad))
  assert.equal(productOwnerOf(parseEpicSetup(JSON.stringify(file([{ epicId: 130, epicTitle: 'X', fields: [], productOwner: { email: '<script>' } }]))), 130), undefined)
})

test('EPS-11: one Product Owner per Epic — set, changed, removed; Copy to Epics and removing the fields keep each Epic’s own (TC-EPS-10)', () => {
  const set = withProductOwner(setup, 120, 'Labs', ben)
  assert.deepEqual(productOwnerOf(set, 120), ben)
  assert.equal(set.epics.find((entry) => entry.epicId === 120).fields.length, 1, 'the fields are kept')
  assert.deepEqual(productOwnerOf(withProductOwner(set, 120, 'Labs', rita), 120), rita, 'one Product Owner: the new one replaces the old')
  const none = withProductOwner(setup, 110, 'Audits', undefined)
  assert.equal(none.epics.some((entry) => entry.epicId === 110), false, 'an entry left empty is removed')
  assert.deepEqual(withProductOwner(file([]), 140, 'New Epic', rita).epics, [{ epicId: 140, epicTitle: 'New Epic', fields: [], productOwner: rita }])
  const copied = copyEpicFields(setup, 100, [{ id: 110, title: 'Audits' }, { id: 120, title: 'Labs' }])
  assert.deepEqual(productOwnerOf(copied, 110), ben, 'the target keeps its own Product Owner')
  assert.equal(productOwnerOf(copied, 120), undefined, 'the source’s Product Owner is not copied')
  assert.equal(copied.epics.find((entry) => entry.epicId === 120).fields[0].label, 'Program')
  const bare = withoutEpicFields(setup, 100)
  assert.deepEqual(bare.epics.find((entry) => entry.epicId === 100), { epicId: 100, epicTitle: 'Tools', fields: [], productOwner: rita })
  assert.equal(withoutEpicFields(setup, 120).epics.some((entry) => entry.epicId === 120), false)
})

test('PIR-70: the Product Owner is matched by work email (any case), never by name; the Epic of a Feature or a story (TC-PIR-65)', () => {
  assert.equal(sameOwnerEmail('Rita.Gomez@example.com ', 'rita.gomez@example.com'), true)
  assert.equal(sameOwnerEmail('', ''), false)
  assert.equal(sameOwnerEmail('Rita Gomez', 'rita.gomez@example.com'), false)
  assert.equal(epicIdOf(items, items.find((item) => item.id === 301)), 100, 'a story: the Epic above its Feature')
  assert.equal(epicIdOf(items, items.find((item) => item.id === 110)), 110, 'an Epic is its own')
  assert.equal(epicIdOf(items, items.find((item) => item.id === 204)), undefined)
  assert.deepEqual(featureOwner(setup, items, items.find((item) => item.id === 201)), rita)
  assert.equal(featureOwner(setup, items, items.find((item) => item.id === 203)), undefined)
  assert.deepEqual(ownedEpics(setup, 'RITA.GOMEZ@example.com'), [100])
  assert.deepEqual(ownedEpics(setup, ''), [])
  assert.deepEqual(ownedFeatures(setup, items, items.filter((item) => item.workItemType === 'Feature'), 'ben.okafor@example.com').map((item) => item.id), [202])
  assert.deepEqual(ownedFeatures(setup, items, items, 'nobody@example.com'), [])
  assert.equal(ownerName(rita), 'Rita Gomez')
  assert.equal(ownerName({ email: 'x@example.com', name: 'x@example.com' }), '—', 'never an email')
})

test('PIR-70: who may post a Feature’s review — assignee, lead, the Product Owner of its Epic, nobody else (TC-PIR-65)', async () => {
  const config = { organization: 'org', project: 'Quality', team: 'T' }
  const owners = (feature) => featureOwner(setup, items, items.find((item) => item.id === feature.id))
  const viewer = (email, actions, extra = {}) => ({ can: (key) => actions.includes(key), readOnly: false, viewingAs: '', email, isSample: false, config, pat: 'p', epicOwnerOf: owners, ...extra })
  const f201 = items.find((item) => item.id === 201), f202 = items.find((item) => item.id === 202)
  const table = [
    ['the assignee', viewer('ana.silva@example.com', ['work.comment']), f201, true],
    ['a lead', viewer('lee@example.com', ['pireview.post']), f201, true],
    ['the Product Owner of its Epic', viewer('Rita.Gomez@example.com', ['work.comment']), f201, true],
    ['the Product Owner of another Epic', viewer('rita.gomez@example.com', ['work.comment']), f202, false],
    ['someone else', viewer('lee@example.com', ['work.comment']), f201, false],
    ['the Product Owner without “Add a comment”', viewer('rita.gomez@example.com', []), f201, false],
    ['the Product Owner while viewing as someone', viewer('rita.gomez@example.com', ['work.comment'], { viewingAs: 'Ben Okafor' }), f201, false],
    ['the Product Owner with sample data', viewer('rita.gomez@example.com', ['work.comment'], { isSample: true }), f201, false],
    ['the Product Owner with the roles not loaded', viewer('rita.gomez@example.com', ['work.comment'], { readOnly: true }), f201, false],
    ['no Epic setup (no Product Owner known)', viewer('rita.gomez@example.com', ['work.comment'], { epicOwnerOf: undefined }), f201, false],
  ]
  for (const [who, person, feature, allowed] of table) assert.equal(reviewPostBlock(person, feature) === '', allowed, who)
  assert.equal(isEpicOwner(viewer('rita.gomez@example.com', ['work.comment']), f201), true)
  assert.match(reviewPostBlock(viewer('lee@example.com', ['work.comment']), f201), /Only the Feature’s assignee \(Ana Silva\), the Product Owner of its Epic or a lead/)
  // The guard every write passes: the Product Owner comes from the app (the Epic setup), never from the request.
  const can = (list) => (key) => list.includes(key)
  assert.equal(reviewPostAllowed('ana.silva@example.com', can(['work.comment']), 'rita.gomez@example.com', 'rita.gomez@example.com'), true)
  assert.equal(reviewPostAllowed('ana.silva@example.com', can(['work.comment']), 'rita.gomez@example.com', 'ben.okafor@example.com'), false)
  assert.equal(reviewPostAllowed('ana.silva@example.com', can([]), 'rita.gomez@example.com', 'rita.gomez@example.com'), false)
  assert.equal(reviewPostAllowed('ana.silva@example.com', can(['work.comment']), '', ''), false)
  const original = globalThis.fetch, sent = []
  globalThis.window = {}
  try {
    globalThis.fetch = async (url, init) => { sent.push({ url, body: init.body }); return new Response('{"id":92}', { status: 200, headers: { 'content-type': 'application/json' } }) }
    const html = buildReviewComment({ learnings: 'a', struggles: 'b', move: 'No', moveReason: '', movePi: 'PI 27.1', mode: 'Offline Review', remarks: '', reviewedPi: 'PI 26.4' })
    guardAzureWrites(can(['work.comment']), undefined, 'rita.gomez@example.com')
    guardEpicOwners(() => '')
    await assert.rejects(postReview(config, 'p', { id: 201, assignedToEmail: 'ana.silva@example.com' }, html), /the Product Owner of its Epic or a lead/)
    assert.equal(sent.length, 0, 'nothing sent while the Epic has no Product Owner known')
    const byId = new Map(items.map((item) => [item.id, item]))
    guardEpicOwners((id) => featureOwner(setup, items, byId.get(id), byId)?.email ?? '')
    assert.equal(await postReview(config, 'p', { id: 201, assignedToEmail: 'ana.silva@example.com' }, html), 92, 'the Product Owner posts on a Feature of their Epic')
    await assert.rejects(postReview(config, 'p', { id: 202, assignedToEmail: 'ana.silva@example.com' }, html), /the Product Owner of its Epic or a lead/, 'not on another Epic’s Feature')
    assert.equal(sent.length, 1)
  } finally { globalThis.fetch = original; delete globalThis.window; guardEpicOwners(() => ''); guardAzureWrites(() => false) }
})

test('PIR-69: the Product Owner filter — the options, what it keeps, Team overview streams (TC-PIR-66)', () => {
  assert.deepEqual(ownerOptions(setup), [['ben.okafor@example.com', 'Ben Okafor'], ['rita.gomez@example.com', 'Rita Gomez'], [noOwnerKey, 'No Product Owner']])
  assert.deepEqual(ownerOptions(file([])), [], 'no Product Owner set: no filter')
  assert.equal(keepsOwner([], [undefined]), true, 'nothing chosen keeps every row')
  assert.equal(keepsOwner(['rita.gomez@example.com'], [rita]), true)
  assert.equal(keepsOwner(['rita.gomez@example.com'], [ben]), false)
  assert.equal(keepsOwner(['rita.gomez@example.com'], [undefined]), false)
  assert.equal(keepsOwner([noOwnerKey], [undefined]), true)
  assert.equal(keepsOwner([noOwnerKey], []), true, 'a release without a Feature: No Product Owner')
  assert.equal(keepsOwner(['ben.okafor@example.com'], [rita, ben]), true, 'one of several Features is enough')
  assert.deepEqual(offeredOwners(['gone@example.com', 'rita.gomez@example.com'], ownerOptions(setup)), ['rita.gomez@example.com'], 'a Product Owner no longer set drops out')
  assert.deepEqual(ownerStreamKeys(setup, items, ['o/p/100', 'o/p/110', 'o/p/120', 'unmapped'], ['rita.gomez@example.com']), ['o/p/100'])
  assert.deepEqual(ownerStreamKeys(setup, items, ['o/p/100', 'o/p/120', 'unmapped'], [noOwnerKey]), ['o/p/120', 'unmapped'])
  assert.equal(ownerStreamKeys(setup, items, ['o/p/100'], []), undefined)
})

// PIR-68: the meeting — the Product Owner's display name per Epic (never the email), columns within the 16:9 slide.
const feature = (id, epicId, epic, status = 'none') => ({ id, title: `Feature ${id}`, epic, epicId, assignedTo: 'Ana Silva <ana.silva@example.com>', state: 'Active', status })
const meeting = (owners) => ({ pi: 'PI 26.4', builtAt: '26 Nov 2026 10:00', builtBy: 'Lee', start: '2026-09-01', features: [feature(201, 100, 'Tools'), feature(202, 110, 'Audits'), feature(203, 120, 'Labs')], ...(owners ? { owners } : {}) })
const widths = (html) => [...html.matchAll(/<colgroup>(.*?)<\/colgroup>/g)].map((match) => [...match[1].matchAll(/class="w(\d+)"/g)].reduce((sum, entry) => sum + Number(entry[1]), 0))

test('PIR-68: the meeting shows each Epic’s Product Owner by name, never the email; the columns still fit the slide (TC-PIR-67)', () => {
  const owners = meetingOwners(setup)
  assert.deepEqual(owners, { 100: 'Rita Gomez', 110: 'Ben Okafor' })
  assert.deepEqual(streamOwners(setup, { DP: [110, 100], CP: [120] }), { DP: 'Rita Gomez, Ben Okafor' })
  const slides = meetingSlides(meeting(owners))
  const byKind = (kind) => slides.filter((slide) => slide.kind === kind).map((slide) => slide.body).join('\n')
  for (const kind of ['summary-epics', 'executive', 'completion', 'not-reviewed']) {
    const body = byKind(kind)
    assert.match(body, /Product Owner/, `${kind}: the column`)
    assert.match(body, /Rita Gomez/, `${kind}: the name`)
    assert.ok(widths(body).every((sum) => sum === 100), `${kind}: the widths add up to the slide (${widths(body)})`)
  }
  const all = slides.map((slide) => `${slide.eyebrow} ${slide.title} ${slide.body}`).join('\n')
  assert.doesNotMatch(all, /rita\.gomez@|ben\.okafor@/, 'no Product Owner email in the file')
  assert.match(byKind('not-reviewed'), /Labs<\/span><\/td><td><span[^>]*>—|Labs.*?—/s, 'an Epic without one: —')
  // Without Product Owners the slides are as before: no column.
  const before = meetingSlides(meeting())
  assert.doesNotMatch(before.map((slide) => slide.body).join('\n'), /Product Owner/)
  // A reviewed Feature: its Epic heading names the Product Owner too.
  const reviewed = { ...meeting(owners), features: [{ ...feature(201, 100, 'Tools', 'reviewed'), review: { author: 'Ana Silva', date: '1 Nov 2026', from: 'Headings', learnings: 'a', struggles: 'b', move: 'No', moveValue: 'No', movePi: '', mode: 'Offline Review', reviewMode: 'Offline Review', remarks: '', fields: [], text: 'x' } }] }
  const slide = meetingSlides(reviewed).find((entry) => entry.kind === 'reviewed')
  assert.match(slide.eyebrow, /^REVIEWED · TOOLS · PO RITA GOMEZ · 1 OF 1$/)
  assert.match(slide.body, /Product Owner/)
})
