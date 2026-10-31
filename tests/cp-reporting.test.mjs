import test from 'node:test'
import assert from 'node:assert/strict'
import { cpMonthReport, cpNameIndex, cpReleaseName, cpSignatures, cpTitleVersion, cpVersionKey, defaultCpReportingSettings, fieldReader } from '../src/cpReporting.ts'

// A synthetic CP_Release_Folder tree (no company data): Release containers, folders and documents, with approver slots.
// The query's columns map display names to reference names (here "Custom.DocType" for "Type").
const slots = 3
const columns = [{ ref: 'Custom.DocType', name: 'Type' }, { ref: 'Custom.AuthorApprovalDate', name: 'Author Approval Date' }, ...Array.from({ length: slots }, (_, index) => [
  { ref: `Custom.ApproverName${index + 1}`, name: `ApproverName${index + 1}` }, { ref: `Custom.ApproverFunction${index + 1}`, name: `ApproverFunction${index + 1}` }, { ref: `Custom.ApproverApprovalDate${index + 1}`, name: `ApproverApprovalDate${index + 1}` },
]).flat()]
const item = (id, parentId, workItemType, title, extra = {}) => ({ key: `o/p/${id}`, id, parentId, workItemType, title, state: extra.state ?? 'Approved', assignedTo: '', areaPath: 'DHP.Vault\\Dev\\ClinicalPlatform', iterationPath: 'DHP.Vault', tags: '', url: `https://x/${id}`, organization: 'o', project: 'p', syncedAt: '', fields: extra.fields ?? {} })
const signed = (...entries) => Object.fromEntries(entries.flatMap(([slot, name, role, date]) => [[`Custom.ApproverName${slot}`, name], [`Custom.ApproverFunction${slot}`, role], [`Custom.ApproverApprovalDate${slot}`, date]]))
const qa = (date, slot = 1) => [slot, 'Ana Costa', 'QAQE for Software', date]
const doc = (id, parentId, title, date, extra = {}) => item(id, parentId, extra.workItemType ?? 'Document', title, { state: extra.state, fields: { 'Custom.DocType': extra.type ?? 'Test Report', ...(date ? signed(qa(date)) : {}), ...(extra.fields ?? {}) } })

function tree() {
  const items = [
    // Release 26.2: an ordinary signed document in an asset folder (supports, does not complete).
    item(100, undefined, 'Release', 'Release 26.2 ClinicalPlatform'), item(101, 100, 'Folder', 'Plans'), doc(102, 101, 'Verification Plan', '2026-10-20T09:00:00Z', { state: 'InReview' }),
    // Release 26.5: main Release Notes (Release → Reports → Release Notes) signed in October; an asset's Release Notes too.
    item(200, undefined, 'Release', 'Release 26.5 ClinicalPlatform'), item(201, 200, 'Folder', 'Reports'), doc(202, 201, 'Release Notes 26.5', '2026-10-16T16:34:23Z', { type: 'Release Notes' }),
    item(203, 200, 'Folder', 'Asset B'), item(204, 203, 'Folder', 'Reports'), doc(205, 204, 'Asset B Release Notes', '2026-10-05T10:00:00Z', { type: 'Release Notes' }),
    // Release 26.6 (Cupid): twelve asset folders, each with a signed document, two signatures on one: one release.
    item(300, undefined, 'Release', 'Release 26.6 ClinicalPlatform'),
    ...Array.from({ length: 12 }, (_, index) => [item(310 + index, 300, 'Folder', `Asset ${index + 1}`), doc(330 + index, 310 + index, `Asset ${index + 1} SRS`, '2026-10-10T08:00:00Z')]).flat(),
    // Release 26.7: only an asset's Release Notes signed: supported, not completed.
    item(400, undefined, 'Release', 'Release 26.7 ClinicalPlatform'), item(401, 400, 'Folder', 'Asset C'), doc(402, 401, 'Asset C Release Notes', '2026-10-11T08:00:00Z', { type: 'Release Notes' }),
    // Carpo patch release: main Release Notes signed on the last evening of October (UTC).
    item(500, undefined, 'Release', 'Release 22.8.5.4 Carpo MLD Clinical Platform'), item(501, 500, 'Folder', 'Report'), doc(502, 501, 'Release Notes', '2026-10-30T12:42:24Z', { type: 'Release Notes' }),
    // Release 26.8: QA/QE signature on 1 November only; a non-QA/QE approval in October; mixed slots.
    item(600, undefined, 'Release', 'Release 26.8 ClinicalPlatform'), item(601, 600, 'Folder', 'Plans'),
    doc(602, 601, 'Test Plan', undefined, { fields: signed([1, 'Ben Okafor', 'Q&R Lead', '2026-10-12T08:00:00Z'], [2, 'Ana Costa', 'QAQE for Software', ''], qa('2026-11-01T08:00:00Z', 3)) }),
    // Shared work: Clinical Platform Global, reported apart.
    item(614437, undefined, 'Release', 'Clinical Platform Global'), item(614440, 614437, 'Folder', 'Plans'), doc(614495, 614440, 'Verification Plan', '2026-10-27T08:00:00Z'),
    // Data issues: a document whose Parent is not in the data set, a dated slot without a role, a QA/QE approval on a Folder.
    doc(700, 999999, 'Lost Document', '2026-10-03T08:00:00Z'),
    doc(701, 101, 'Risk Analysis', undefined, { fields: signed([1, 'Cy Dee', '', '2026-10-04T08:00:00Z']) }),
    item(702, 101, 'Folder', 'Odd folder', { fields: signed(qa('2026-10-04T08:00:00Z')) }),
    // An Artifact Review child of a document: never counted again, not an exception.
    item(703, 102, 'Artifact Review', 'Review comments', { fields: signed(qa('2026-10-21T08:00:00Z')) }),
  ]
  return items
}

test('CP release reporting: Supported and Completed per Release container from QA/QE signatures (TC-QV-25)', () => {
  const read = cpSignatures(tree(), columns, defaultCpReportingSettings, 'UTC')
  const october = cpMonthReport(read, '2026-10', undefined)
  const ids = (rows) => rows.map((row) => row.container.id).sort((a, b) => a - b)
  assert.deepEqual(ids(october.rows), [100, 200, 300, 400, 500], 'five releases supported; 26.8 (QA/QE only in November) and the shared container not')
  assert.equal(october.supported, 5)
  assert.deepEqual(ids(october.rows.filter((row) => row.completed)), [200, 500], 'main Release Notes in Reports / Report complete the release; an asset Release Notes does not')
  assert.equal(october.completed, 2)
  const cupid = october.rows.find((row) => row.container.id === 300)
  assert.deepEqual([cupid.supported, cupid.signedDocuments], [true, 12], 'twelve asset folders, one release, twelve signed documents')
  assert.equal(october.rows.find((row) => row.container.id === 100).signedDocuments, 1, 'an InReview document with a QA/QE signature counts; its Artifact Review child does not count again')
  assert.equal(october.rows.find((row) => row.container.id === 200).releaseNotesDate, '2026-10-16T16:34:23Z')
  assert.deepEqual(october.shared.map((row) => [row.container.id, row.signedDocuments, row.container.excluded.startsWith('Clinical Platform Global')]), [[614437, 1, true]], 'shared work reported apart')
  assert.equal(october.signedDocuments, 1 + 2 + 12 + 1 + 1, 'distinct signed documents of the counted releases')
  const november = cpMonthReport(read, '2026-11', undefined)
  assert.deepEqual([november.supported, november.completed, november.rows[0].container.id], [1, 0, 600], 'the QA/QE slot (3) dated in November counts in November only; the Q&R Lead approval never counts')
  // Data issues: listed with the IDs, never silently dropped.
  const kinds = Object.fromEntries(read.issues.map((issue) => [issue.kind, issue.ids]))
  assert.deepEqual(kinds['missing-parent'], [700])
  assert.deepEqual(kinds['slot-incomplete'], [701])
  assert.deepEqual(kinds['qaqe-on-other-type'], [702], 'a QA/QE approval on a Folder is an exception; on an Artifact Review it is not')
})

test('CP release reporting: slots, roles, dates and month boundaries (TC-QV-25)', () => {
  const field = fieldReader(columns)
  assert.equal(field({ fields: { 'Custom.DocType': ' Release Notes ' } }, 'Type'), 'Release Notes', 'display name through the query columns')
  assert.equal(fieldReader(undefined)({ fields: { 'X.ApproverName12': 'A' } }, 'ApproverName12'), 'A', 'reference name ending without columns')
  // Slots discovered from the data: a 21st slot counts too.
  const extra = [item(1, undefined, 'Release', 'Release 27.1 ClinicalPlatform'), item(2, 1, 'Folder', 'Plans'), item(3, 2, 'Document', 'Plan', { fields: { 'Custom.ApproverName21': 'Ana Costa', 'Custom.ApproverFunction21': ' qa/qe ', 'Custom.ApproverApprovalDate21': '2026-10-31T23:30:00Z' } })]
  assert.equal(cpSignatures(extra, [], defaultCpReportingSettings, 'UTC').signatures[0].slot, 21, 'slot 21; role trimmed, case ignored')
  assert.equal(cpSignatures(extra, [], defaultCpReportingSettings, 'UTC').signatures[0].month, '2026-10', '31 October 23:30 UTC is October')
  assert.equal(cpSignatures(extra, [], defaultCpReportingSettings, 'Asia/Kolkata').signatures[0].month, '2026-11', 'in the viewer’s time zone it is 1 November')
  assert.equal(cpSignatures(extra, [], { ...defaultCpReportingSettings, roles: ['QAQE for Software'] }, 'UTC').signatures.length, 0, 'only roles on the allowlist; no substring match')
})

test('CP release names: version from the title, Content from the CP_Releases data set, never deciding the count (TC-QV-25)', () => {
  assert.deepEqual(['Release 26.2 ClinicalPlatform', 'Release 22.8.5.4 Carpo MLD Clinical Platform', 'Helene PU Clinical Platform 25.5.2.0', 'Clinical Platform Global', 'Upgrade (needs 3.4) ClinicalPlatform'].map(cpTitleVersion), ['26.2', '22.8.5.4', '25.5.2.0', undefined, undefined])
  assert.deepEqual([cpVersionKey('26.2'), cpVersionKey('26.2.0.1'), cpVersionKey('25.6.1'), cpVersionKey('26.2', false)], ['26.2.0.0', '26.2.0.1', '25.6.1.0', '26.2'])
  const rel = (id, release, content) => ({ id, fields: { 'Custom.Release': release, 'Custom.Content': content ?? '' } })
  const cpReleases = [rel(1, '26.2.0.0', 'Setebos'), rel(2, '26.2.0.0', 'Setebos'), rel(3, '26.5.0.0', 'Stephano'), ...Array.from({ length: 10 }, (_, index) => rel(10 + index, '26.6.0.0', '')), rel(30, '26.6.0.0', ' cupid '), rel(31, '26.6.0.0', 'Cupid'), rel(40, '26.9.0.0', 'Io'), rel(41, '26.9.0.0', 'Europa'), rel(50, '25.9.0.0', 'Cupid'), rel(60, 'n/a', 'X')]
  const names = cpNameIndex(cpReleases, [{ ref: 'Custom.Release', name: 'Release' }, { ref: 'Custom.Content', name: 'Content' }])
  assert.deepEqual(names.exceptions, [60], 'an unreadable Release is an enrichment exception')
  const name = (title, index = names) => cpReleaseName({ id: 1, title }, index)
  assert.deepEqual([name('Release 26.2 ClinicalPlatform').displayLabel, name('Release 26.2 ClinicalPlatform').supportingCPReleaseIds], ['Setebos 26.2', [1, 2]])
  assert.equal(name('Release 26.5 ClinicalPlatform').displayLabel, 'Stephano 26.5')
  const cupid = name('Release 26.6 ClinicalPlatform')
  assert.deepEqual([cupid.name, cupid.nameStatus, cupid.warnings.length], ['cupid', 'resolved_from_content', 1], 'Cupid and CUPID with spaces are one name; a source spelling kept; blanks warned')
  assert.equal(name('Release 26.9 ClinicalPlatform').nameStatus, 'conflicting_names', 'two names: no automatic choice')
  assert.equal(name('Release 26.2.0.1 ClinicalPlatform').nameStatus, 'name_unavailable', '26.2.0.1 is not 26.2.0.0')
  assert.equal(name('Release 25.9 ClinicalPlatform').displayLabel, 'Cupid 25.9', 'the same codename at another version stays its own version')
  const carpo = name('Release 22.8.5.4 Carpo MLD Clinical Platform')
  assert.deepEqual([carpo.nameStatus, carpo.displayLabel], ['candidate_from_title', 'Carpo 22.8.5.4'], 'a title candidate, pending review, full patch version kept')
  assert.equal(cpReleaseName({ id: 1, title: 'Release 26.2 ClinicalPlatform' }, undefined).nameStatus, 'enrichment_not_supplied', 'no CP_Releases data set: counts still work')
  assert.equal(name('Clinical Platform Global').nameStatus, 'version_unavailable')
  // Names never change the counting: the same report with and without names.
  const read = cpSignatures(tree(), columns, defaultCpReportingSettings, 'UTC')
  assert.deepEqual([cpMonthReport(read, '2026-10', names).supported, cpMonthReport(read, '2026-10', names).completed], [cpMonthReport(read, '2026-10').supported, cpMonthReport(read, '2026-10').completed])
})

test('CP Create Feature title: the release name and number only, found again by the board match (TC-QV-25)', async () => {
  const { releaseOnlyTitle } = await import('../src/releaseSource.ts')
  const { boardMatch, dpBoardCandidates } = await import('../src/dpBoardMatch.ts')
  assert.equal(releaseOnlyTitle('Cupid', '26.6'), 'Cupid | v26.6')
  assert.equal(releaseOnlyTitle('Release 26.6 ClinicalPlatform', ''), 'Release 26.6 ClinicalPlatform')
  const board = dpBoardCandidates([{ key: 'b/1', id: 1, title: 'Cupid | v26.6', workItemType: 'Feature', state: 'Active', url: '' }, { key: 'b/2', id: 2, title: 'Cupid | v25.9', workItemType: 'Feature', state: 'Active', url: '' }])
  const match = boardMatch({ names: ['Cupid', 'Release 26.6 ClinicalPlatform'], versions: ['26.6'], created: releaseOnlyTitle('Cupid', '26.6') }, board)
  assert.deepEqual([match.feature.item.id, match.feature.score], [1, 100], 'the created Feature is found; the 25.9 one is another release')
})

test('the CP menu entry: its tree-query connection, listed even when hidden from the menu (TC-QV-25)', async () => {
  const { defaultStreams, profileForStream, profilesForStream } = await import('../src/streams.ts')
  const { backlogViews, otherMenuViews } = await import('../src/backlogViews.ts')
  const cp = defaultStreams.find((stream) => stream.rule === 'cp')
  const releases = { id: 'cpr', reason: 'CP Releases', role: 'reference', query: "SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Release'", showInMenu: true }
  const tree = { id: 'cpt', reason: 'CP_Release_Folder', viewName: 'CP [Release Folder]', role: 'reference', query: "SELECT [System.Id] FROM WorkItemLinks WHERE [Source].[System.Id] > 0 MODE (Recursive)", showInMenu: false }
  const profiles = [releases, tree, { id: 'tw', reason: 'QMS-0025', role: 'time-tracking' }]
  assert.equal(profileForStream(cp, profiles).id, 'cpt', 'the tree query, not the first CP connection')
  assert.deepEqual(profilesForStream(cp, profiles).map((profile) => profile.id), ['cpr', 'cpt'])
  const views = backlogViews(profiles, 'tw')
  assert.ok(views.some((view) => view.id === 'cpt'), 'the CP tree is listed although Show in menu is off')
  assert.deepEqual(otherMenuViews(views, profiles, []).azure.map((view) => view.id), ['cpr'], 'the names connection stays under Other views (it is shown in the menu)')
  assert.equal(profileForStream(cp, [releases]).id, 'cpr', 'without a tree query, the first CP connection')
})
