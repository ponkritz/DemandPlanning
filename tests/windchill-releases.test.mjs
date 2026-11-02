import test from 'node:test'
import assert from 'node:assert/strict'
import { releaseFromDocumentName, releasesFromDocumentName, releaseFromLocation, releasesFromLocation, locationColumn, windchillReleases, windchillLocationsFile, documentNameColumn, parseExportDate, releaseMonth, releasesInMonth, windchillSupported } from '../src/windchillReleases.ts'

test('a document name splits at its first version: release name, release number, document name', () => {
  assert.deepEqual(releaseFromDocumentName('Remote Diagnostics 1.6 Verification Report'), { name: 'Remote Diagnostics', release: '1.6', raw: '1.6', document: 'Verification Report', span: 'Remote Diagnostics 1.6' })
  assert.deepEqual(releaseFromDocumentName('IntelliSpace Portal - v12.1 - Test Plan'), { name: 'IntelliSpace Portal', release: '12.1', raw: 'v12.1', document: 'Test Plan', span: 'IntelliSpace Portal - v12.1' })
  assert.deepEqual(releaseFromDocumentName('CareLink_R3.2_SRS'), { name: 'CareLink', release: '3.2', raw: 'R3.2', document: 'SRS', span: 'CareLink_R3.2' })
  assert.deepEqual(releaseFromDocumentName('Field Service Tool Release 5 Release Notes'), { name: 'Field Service Tool', release: '5', raw: 'Release 5', document: 'Release Notes', span: 'Field Service Tool Release 5' })
  assert.deepEqual(releaseFromDocumentName('Dose Viewer | 3.0.0.2 | DHF Index (v2)'), { name: 'Dose Viewer', release: '3.0.0.2', raw: '3.0.0.2', document: 'DHF Index (v2)', span: 'Dose Viewer | 3.0.0.2' }, 'a version in brackets is the document revision')
  assert.equal(releaseFromDocumentName('Quality Manual'), undefined, 'no version: no release')
  assert.equal(releaseFromDocumentName('2.1 Test Plan'), undefined, 'a version with no name before it: no release')
  assert.equal(releaseFromDocumentName('Plan for 2026 audits'), undefined, 'a lone number is not a version')
})

test('unique releases from an export: name + number, case and trailing zeros ignored; documents and latest date kept', () => {
  const rows = [
    { Number: 'D1', Name: 'Remote Diagnostics 1.6 Verification Report', 'Last Modified': '2026-09-02' },
    { Number: 'D2', Name: 'remote diagnostics 1.6.0 - Test Plan', 'Last Modified': '2026-10-01' },
    { Number: 'D3', Name: 'Remote Diagnostics 1.7 SRS', 'Last Modified': '2026-10-03' },
    { Number: 'D4', Name: 'CareLink_R3.2_SRS', 'Last Modified': '2026-08-01' },
    { Number: 'D5', Name: 'Quality Manual', 'Last Modified': '2026-08-01' },
  ]
  const { releases, unmatched, nameColumn, dateColumn } = windchillReleases(rows, ['Number', 'Name', 'Last Modified'])
  assert.equal(nameColumn, 'Name'); assert.equal(dateColumn, 'Last Modified')
  assert.deepEqual(releases.map((entry) => [entry.name, entry.release, entry.documents.length, entry.latest]), [['Remote Diagnostics', '1.7', 1, '2026-10-03'], ['Remote Diagnostics', '1.6', 2, '2026-10-01'], ['CareLink', '3.2', 1, '2026-08-01']], 'newest first by the latest date')
  assert.deepEqual(releases[1].documents.map((entry) => entry.name), ['Verification Report', 'Test Plan'])
  assert.deepEqual(unmatched, ['Quality Manual'])
  assert.equal(documentNameColumn(['Number', 'Organization Name', 'Document Name']), 'Document Name')
})

test('clubbed names: every name + version pair is a part, whatever the delimiters; the rest is the document name', () => {
  const pairs = (text) => releasesFromDocumentName(text).map((entry) => `${entry.name} ${entry.release} | ${entry.document}`)
  assert.deepEqual(pairs('Service1_rel1.0_Service2_rel2.3_Test Plan'), ['Service1 1.0 | Test Plan', 'Service2 2.3 | Test Plan'])
  assert.deepEqual(pairs('Service1_rel1_service2_rel2'), ['Service1 1 | ', 'service2 2 | '])
  assert.deepEqual(pairs('Remote Diagnostics 1.6 - CareLink v3.2 ; Verification Report'), ['Remote Diagnostics 1.6 | Verification Report', 'CareLink 3.2 | Verification Report'])
  assert.deepEqual(pairs('Field Tool|R2.1|Portal|R4.0.1|SRS'), ['Field Tool 2.1 | SRS', 'Portal 4.0.1 | SRS'])
  assert.deepEqual(pairs('Viewer 1.6 & 1.7 SRS'), ['Viewer 1.6 | SRS', 'Viewer 1.7 | SRS'], 'a version with no name before it keeps the previous name')
  assert.deepEqual(pairs('Viewer_1.6_and_2.0_Test Report'), ['Viewer 1.6 | Test Report', 'Viewer 2.0 | Test Report'])
  assert.deepEqual(pairs('Service2 rel2 + Service3 Release 3 DHF Index (v4)'), ['Service2 2 | DHF Index (v4)', 'Service3 3 | DHF Index (v4)'])
  assert.equal(releasesFromDocumentName('Ser 1 Rel1_Ser2 Rel2_Test Plan')[0].span, 'Ser 1 Rel1_Ser2 Rel2', 'the span is the clubbed text as written')
})

test('a clubbed name is one release, kept as written and counted once; a part written on its own is another release', () => {
  const rows = [
    { Name: 'Ser 1 Rel1_Ser2 Rel2_Test Plan', Modified: '2026-10-02' },
    { Name: 'Ser 1 Rel1 _ Ser2 Rel2 - SRS', Modified: '2026-10-05' },
    { Name: 'Ser 1 Rel1 Verification Report', Modified: '2026-09-01' },
  ]
  const { releases, clubbed } = windchillReleases(rows, ['Name', 'Modified'])
  assert.equal(clubbed, 1, 'one clubbed release, however many documents')
  assert.deepEqual(releases.map((entry) => [entry.name, entry.release, entry.clubbed, entry.documents.map((doc) => doc.name), entry.latest]), [
    ['Ser 1 Rel1_Ser2 Rel2', '1 + 2', true, ['Test Plan', 'SRS'], '2026-10-05'],
    ['Ser 1', '1', false, ['Verification Report'], '2026-09-01'],
  ], 'spacing and delimiter variants of the same clubbed text merge; the single part stays its own release')
  assert.deepEqual(releases[0].parts.map((part) => `${part.name} ${part.release}`), ['Ser 1 1', 'Ser2 2'])
})

test('Location: the release is read from the deepest folder that holds a version, in one folder or in name/version folders (CON-72)', () => {
  const read = (location) => { const found = releaseFromLocation(location); return found ? `${found.name} ${found.release} @ ${found.folder}` : undefined }
  assert.equal(read('/Products/Remote Diagnostics 1.6/DHF'), 'Remote Diagnostics 1.6 @ Products/Remote Diagnostics 1.6')
  assert.equal(read('/Products/Remote Diagnostics/1.7/Design Inputs'), 'Remote Diagnostics 1.7 @ Products/Remote Diagnostics/1.7')
  assert.equal(read('/Products/CareLink/R3.2/DHF'), 'CareLink R3.2 @ Products/CareLink/R3.2', 'the number is kept as the folder writes it')
  assert.equal(read('\\Products\\IntelliSpace Portal - v12.1\\Test Reports'), 'IntelliSpace Portal v12.1 @ Products/IntelliSpace Portal - v12.1')
  assert.equal(read('/Products/Viewer 2.0/Patches/2.0.3/DHF'), 'Patches 2.0.3 @ Products/Viewer 2.0/Patches/2.0.3', 'the deepest version wins, with the folder above it as the name')
  assert.deepEqual(releasesFromLocation('/Products/Ser 1 Rel1_Ser2 Rel2/DHF').map((entry) => [entry.name, entry.release, entry.clubbed, entry.parts.map((part) => `${part.name} ${part.release}`)]), [['Ser 1 Rel1_Ser2 Rel2', 'Rel1 + Rel2', true, ['Ser 1 Rel1', 'Ser2 Rel2']]], 'a clubbed folder is one release as written, numbers as written')
  assert.deepEqual(releasesFromLocation('/Products/Viewer 1.6 & 1.7/SRS').map((entry) => `${entry.name} | ${entry.release}`), ['Viewer 1.6 & 1.7 | 1.6 + 1.7'])
  assert.deepEqual(releasesFromLocation('/Products/Viewer 1.6.0/DHF').map((entry) => entry.release), ['1.6.0'])
  assert.equal(read('/Quality/Manuals'), undefined)
  assert.equal(read(''), undefined)
  assert.equal(locationColumn(['Number', 'Name', 'Location']), 'Location')
  assert.equal(locationColumn(['Number', 'Folder Path']), 'Folder Path')
  assert.equal(locationColumn(['Number', 'Name']), undefined)
})

test('Location source: unique releases and unique locations of an export, with the names as fallback', () => {
  const rows = [
    { Number: 'D1', Name: 'Verification Report', Location: '/Products/Remote Diagnostics 1.6/DHF', 'Last Modified': '2026-09-02' },
    { Number: 'D2', Name: 'Test Plan', Location: '/Products/Remote Diagnostics 1.6/DHF', 'Last Modified': '2026-10-01' },
    { Number: 'D3', Name: 'SRS', Location: '/Products/Remote Diagnostics/1.7/Design Inputs', 'Last Modified': '2026-10-03' },
    { Number: 'D4', Name: 'CareLink_R3.2_SRS', Location: '/Products/CareLink/R3.2/DHF', 'Last Modified': '2026-08-01' },
    { Number: 'D5', Name: 'Quality Manual', Location: '/Quality/Manuals', 'Last Modified': '2026-08-01' },
  ]
  const columns = ['Number', 'Name', 'Location', 'Last Modified']
  const result = windchillReleases(rows, columns)
  assert.equal(result.source, 'location'); assert.equal(result.locationColumn, 'Location')
  assert.deepEqual(result.releases.map((entry) => [entry.name, entry.release, entry.documents.map((doc) => doc.name), entry.locations]), [
    ['Remote Diagnostics', '1.7', ['SRS'], ['/Products/Remote Diagnostics/1.7/Design Inputs']],
    ['Remote Diagnostics', '1.6', ['Verification Report', 'Test Plan'], ['/Products/Remote Diagnostics 1.6/DHF']],
    ['CareLink', 'R3.2', ['CareLink_R3.2_SRS'], ['/Products/CareLink/R3.2/DHF']],
  ])
  assert.deepEqual(result.unmatched, ['/Quality/Manuals'])
  assert.deepEqual(result.locations.map((entry) => [entry.location, entry.count, entry.releases.map((release) => release.release)]), [['/Products/Remote Diagnostics 1.6/DHF', 2, ['1.6']], ['/Products/CareLink/R3.2/DHF', 1, ['R3.2']], ['/Products/Remote Diagnostics/1.7/Design Inputs', 1, ['1.7']], ['/Quality/Manuals', 1, []]])
  const byName = windchillReleases(rows, columns, { source: 'name' })
  assert.equal(byName.source, 'name')
  assert.deepEqual(byName.releases.map((entry) => `${entry.name} ${entry.release}`), ['CareLink 3.2'])
  assert.equal(windchillReleases(rows, ['Number', 'Name', 'Last Modified']).source, 'name', 'no Location column: the names are used')
  const file = windchillLocationsFile({ id: 'ssit', name: 'S&S IT' }, result, rows.length, '2026-10-27T06:30:00.000Z')
  assert.deepEqual(Object.keys(file), ['schema', 'kind', 'viewId', 'export', 'column', 'generatedAt', 'documents', 'locations', 'releases'])
  assert.equal(file.kind, 'windchill-locations'); assert.equal(file.documents, 5); assert.equal(file.locations.length, 4)
  assert.deepEqual(file.releases[1], { name: 'Remote Diagnostics', release: '1.6', documents: 2, locations: ['/Products/Remote Diagnostics 1.6/DHF'] })
  assert.equal(JSON.stringify(file).includes('"row"'), false, 'the analysis file holds no document rows')
})

test('Location: a clubbed folder is one release counted once; numbers written differently stay different releases', () => {
  const rows = [
    { Name: 'Test Plan', Location: '/Products/Ser 1 Rel1_Ser2 Rel2/DHF' },
    { Name: 'SRS', Location: '/Products/Ser 1 Rel1 _ Ser2 Rel2/DHF' },
    { Name: 'Report', Location: '/Products/Ser 1/Rel1/DHF' },
    { Name: 'Plan', Location: '/Products/Ser 1 1.0/DHF' },
  ]
  const { releases, clubbed } = windchillReleases(rows, ['Name', 'Location'])
  assert.equal(clubbed, 1)
  assert.deepEqual(releases.map((entry) => [entry.name, entry.release, entry.clubbed, entry.documents.map((doc) => doc.name)]), [['Ser 1', 'Rel1', false, ['Report']], ['Ser 1', '1.0', false, ['Plan']], ['Ser 1 Rel1_Ser2 Rel2', 'Rel1 + Rel2', true, ['Test Plan', 'SRS']]], 'no date column: by name, then by number')
})

test('export dates are read in the formats Windchill writes, and the list is newest first with unreadable dates last', () => {
  const iso = (text) => { const at = parseExportDate(text); return at === undefined ? undefined : new Date(at).toISOString() }
  assert.equal(iso('2026-10-01'), '2026-10-01T00:00:00.000Z')
  assert.equal(iso('2026-10-01T09:15:00Z'), '2026-10-01T09:15:00.000Z')
  assert.equal(iso('27-Oct-2026'), '2026-10-27T00:00:00.000Z')
  assert.equal(iso('27 Oct 2026 09:15'), '2026-10-27T09:15:00.000Z')
  assert.equal(iso('Oct 27, 2026'), '2026-10-27T00:00:00.000Z')
  assert.equal(iso('27.10.2026'), '2026-10-27T00:00:00.000Z')
  assert.equal(iso('27/10/2026'), '2026-10-27T00:00:00.000Z', 'a part above 12 is the day')
  assert.equal(iso('10/27/2026 1:05 PM'), '2026-10-27T13:05:00.000Z')
  assert.equal(iso('9/5/2026'), '2026-09-05T00:00:00.000Z', 'both could be the month: month/day/year is assumed')
  assert.equal(iso('Quality'), undefined); assert.equal(iso('31/02/2026'), undefined); assert.equal(iso(''), undefined)
  const rows = [
    { Name: 'A 1.0 Plan', 'Last Modified': '9/5/2026' },
    { Name: 'B 2.0 Plan', 'Last Modified': '10/27/2026 9:15 AM' },
    { Name: 'C 3.0 Plan', 'Last Modified': 'n/a' },
    { Name: 'D 4.0 Plan', 'Last Modified': '27-Sep-2026' },
    { Name: 'D 4.0 Report', 'Last Modified': '3-Oct-2026' },
  ]
  const { releases } = windchillReleases(rows, ['Name', 'Last Modified'])
  assert.deepEqual(releases.map((entry) => `${entry.name} ${entry.release} ${entry.latest}`), ['B 2.0 10/27/2026 9:15 AM', 'D 4.0 3-Oct-2026', 'A 1.0 9/5/2026', 'C 3.0 n/a'], 'by date value, not by text; D keeps its later document date')
})

test('the header month filter keeps the releases whose latest date falls in that month (CON-73)', () => {
  const rows = [
    { Name: 'A 1.0 Plan', 'Last Modified': '2026-10-03' },
    { Name: 'A 1.0 Report', 'Last Modified': '2026-08-20' },
    { Name: 'B 2.0 Plan', 'Last Modified': '27-Sep-2026 09:15' },
    { Name: 'C 3.0 Plan', 'Last Modified': 'n/a' },
  ]
  const { releases } = windchillReleases(rows, ['Name', 'Last Modified'])
  assert.deepEqual(releases.map((entry) => [`${entry.name} ${entry.release}`, releaseMonth(entry)]), [['A 1.0', '2026-10'], ['B 2.0', '2026-09'], ['C 3.0', undefined]], 'the month comes from the latest document, A is October not August')
  assert.deepEqual(releasesInMonth(releases, '2026-10').map((entry) => entry.name), ['A'])
  assert.deepEqual(releasesInMonth(releases, '2026-09').map((entry) => entry.name), ['B'])
  assert.deepEqual(releasesInMonth(releases, '2026-08'), [], 'A moved to October with its newer document')
  assert.deepEqual(releasesInMonth(releases, '2026-11'), [])
})

test('Pulse Check Supported line: the export\'s releases with the latest date in the month, "name number", newest first (QV-33)', () => {
  const rows = [
    { Name: 'Plan', Location: '/Products/RTS 3.0.0.1_CC 3.0.0.1/DHF', 'Last Modified': '2026-10-06' },
    { Name: 'SRS', Location: '/Products/Remote Diagnostics/1.7/DHF', 'Last Modified': '2026-10-03' },
    { Name: 'Report', Location: '/Products/CareLink/R3.2/DHF', 'Last Modified': '2026-08-01' },
  ]
  const columns = ['Name', 'Location', 'Last Modified']
  assert.deepEqual(windchillSupported(rows, columns, '2026-10'), ['RTS 3.0.0.1_CC 3.0.0.1 3.0.0.1 + 3.0.0.1', 'Remote Diagnostics 1.7'])
  assert.deepEqual(windchillSupported(rows, columns, '2026-08'), ['CareLink R3.2'])
  assert.deepEqual(windchillSupported(rows, columns, '2026-09'), [])
})

test('ECP: each release is the second Location folder, "<project number> <project name>", with everything under it (TC-CON-51)', async () => {
  const { projectFromLocation, windchillReleases, windchillSupported } = await import('../src/windchillReleases.ts')
  const { windchillOptionsFor, exportForStream, defaultStreams } = await import('../src/streams.ts')
  const { windchillFeatureTitle } = await import('../src/dpBoardMatch.ts')
  assert.deepEqual(projectFromLocation('Projects/123456 Patient Monitor Upgrade/Design Phase/Reports'), { name: 'Patient Monitor Upgrade', release: '123456', folder: 'Projects/123456 Patient Monitor Upgrade', clubbed: false, parts: [{ name: 'Patient Monitor Upgrade', release: '123456', raw: '123456 Patient Monitor Upgrade' }], project: true }, 'Parent folder/Project number Project name/Phase')
  assert.equal(projectFromLocation('/Projects/PJ-1234 Patient Monitor Upgrade/DHF').release, 'PJ-1234', 'a leading "/" does not count')
  assert.equal(projectFromLocation('/Projects/PJ-1234 Patient Monitor Upgrade/DHF').folder, '/Projects/PJ-1234 Patient Monitor Upgrade')
  assert.equal(projectFromLocation('Projects/pj_77 - On-Demand Fix/DHF').release, 'PJ-77', 'PJ written in any case, with "_" or "-", one form')
  assert.deepEqual([projectFromLocation('Other/Programs/PJ-5 Deep/DHF').release, projectFromLocation('Other/Programs/PJ-5 Deep/DHF').name], ['', 'Programs'], 'the second folder only: a project folder deeper down is under it')
  assert.deepEqual([projectFromLocation('Products/Lab Automation/DHF').release, projectFromLocation('Products/Lab Automation/DHF').name], ['', 'Lab Automation'], 'no number: the name alone')
  assert.equal(projectFromLocation('Products'), undefined, 'no second folder, no release')
  assert.deepEqual(windchillOptionsFor('ECP export'), { project: true })
  assert.deepEqual(windchillOptionsFor('QRE'), { project: true }, 'an export still named QRE is read as ECP')
  assert.deepEqual(windchillOptionsFor('S&S IT'), {})
  const ecp = defaultStreams.find((stream) => stream.name === 'ECP')
  assert.equal(exportForStream(ecp, [{ id: 'q', name: 'QRE', exportFile: 'x.csv' }])?.id, 'q', 'an export imported as QRE stays the ECP page')
  assert.equal(exportForStream(ecp, [{ id: 'q', name: 'QRE', exportFile: 'x.csv' }, { id: 'e', name: 'ECP', exportFile: 'y.csv' }])?.id, 'e', 'one named ECP comes first')
  const columns = ['Name', 'Location', 'Last Modified']
  const rows = [
    { Name: 'Plan.docx', Location: 'Projects/123456 Patient Monitor Upgrade/Design', 'Last Modified': '2026-10-03 10:00' },
    { Name: 'Report.docx', Location: 'Projects/123456 Patient Monitor Upgrade/Verification', 'Last Modified': '2026-10-20 10:00' },
    { Name: 'Spec.docx', Location: 'Projects/PJ-0099 Scanner Service/Design', 'Last Modified': '2026-09-12 09:00' },
    { Name: 'Deep.docx', Location: 'Projects/123456 Patient Monitor Upgrade/Design/Sub/Deeper', 'Last Modified': '2026-10-05 10:00' },
    { Name: 'Other.docx', Location: 'Projects/Lab Automation/Design', 'Last Modified': '2026-10-07 10:00' },
  ]
  const result = windchillReleases(rows, columns, { project: true })
  assert.deepEqual(result.releases.map((entry) => [entry.release, entry.name, entry.documents.length]), [['123456', 'Patient Monitor Upgrade', 3], ['', 'Lab Automation', 1], ['PJ-0099', 'Scanner Service', 1]], 'one project per second folder, with every document under it; newest first')
  assert.deepEqual(windchillSupported(rows, columns, '2026-10', { project: true }), ['123456 Patient Monitor Upgrade', 'Lab Automation'], 'Pulse Check: number + name of the projects whose latest date is in the month')
  assert.equal(windchillFeatureTitle('ECP', result.releases[0]), 'ECP | 123456 Patient Monitor Upgrade', 'number + name, never "v123456"')
  assert.equal(windchillFeatureTitle('ECP', result.releases[1]), 'ECP | Lab Automation')
  assert.equal(windchillFeatureTitle('ECP', result.releases[2]), 'ECP | PJ-0099 Scanner Service')
})

test('ECP setups: several ECP exports, each with its own name and project folder (2nd, 3rd…), listed on their own (TC-CON-55)', async () => {
  const { projectFromLocation, windchillReleases, windchillSupported } = await import('../src/windchillReleases.ts')
  const { windchillOptionsForView, windchillStreamExports, isEcpExport } = await import('../src/streams.ts')
  const { cleanSetup, loadWindchillViews } = await import('../src/windchillViews.ts')
  assert.deepEqual([projectFromLocation('Root/Programs/123456 Patient Monitor/Phase 2/Reports', 3).release, projectFromLocation('Root/Programs/123456 Patient Monitor/Phase 2/Reports', 3).name], ['123456', 'Patient Monitor'], 'type 2: project details in the 3rd folder')
  assert.equal(projectFromLocation('Root/Programs/123456 Patient Monitor/Phase', 3).folder, 'Root/Programs/123456 Patient Monitor')
  assert.equal(projectFromLocation('Root/Programs', 3), undefined, 'no 3rd folder, no project')
  const type1 = { id: 'a', name: 'ECP - Type 1', exportFile: 'a.csv', columns: [], logic: 'ecp', projectLevel: 2 }
  const type2 = { id: 'b', name: 'ECP - Type 2', exportFile: 'b.csv', columns: [], logic: 'ecp', projectLevel: 3 }
  const sns = { id: 'c', name: 'S&S IT', exportFile: 'c.csv', columns: [] }
  const legacy = { id: 'd', name: 'QRE', exportFile: 'd.csv', columns: [] }
  const plain = { id: 'e', name: 'Search Results', exportFile: 'e.csv', columns: [] }
  assert.deepEqual(windchillOptionsForView(type2), { project: true, projectLevel: 3 })
  assert.deepEqual(windchillOptionsForView(legacy), { project: true, projectLevel: 2 }, 'an export named QRE / ECP without a setup: ECP at the 2nd folder')
  assert.deepEqual(windchillOptionsForView({ ...legacy, logic: 'standard' }), {}, 'a setup chosen as Standard wins over the name')
  assert.equal(isEcpExport(plain), false)
  assert.deepEqual(windchillStreamExports([type1, sns, type2, legacy, plain]).map((entry) => [entry.stream.name, entry.name, entry.view?.id]), [['S&S IT', 'S&S IT', 'c'], ['ECP', 'ECP - Type 1', 'a'], ['ECP', 'ECP - Type 2', 'b'], ['ECP', 'QRE', 'd']], 'S&S IT, then every ECP export on its own; other exports are not streams')
  assert.deepEqual(windchillStreamExports([sns]).map((entry) => [entry.name, entry.view?.id]), [['S&S IT', 'c'], ['ECP', undefined]], 'no ECP export yet: one empty ECP entry')
  assert.deepEqual(cleanSetup({ id: 'x', logic: 'evil', projectLevel: 99 }), { id: 'x' }, 'unknown setup values are dropped')
  assert.deepEqual(cleanSetup({ id: 'x', logic: 'ecp', projectLevel: 3 }), { id: 'x', logic: 'ecp', projectLevel: 3 })
  const store = new Map([['demand-planning-windchill-views-v1', JSON.stringify([{ ...type2, entitySet: '', filters: [], showInMenu: true, projectLevel: '3; drop' }])]])
  assert.equal(loadWindchillViews({ getItem: (key) => store.get(key) ?? null })[0].projectLevel, undefined, 'a stored level that is not a known number is dropped')
  const rows = [
    { Name: 'A.docx', Location: 'Root/Programs/123456 Patient Monitor/Phase 1', 'Last Modified': '2026-10-03' },
    { Name: 'B.docx', Location: 'Root/Programs/123456 Patient Monitor/Phase 2/Reports', 'Last Modified': '2026-10-09' },
    { Name: 'C.docx', Location: 'Root/Programs/777 Scanner/Phase 1', 'Last Modified': '2026-09-01' },
  ]
  const columns = ['Name', 'Location', 'Last Modified']
  assert.deepEqual(windchillReleases(rows, columns, windchillOptionsForView(type2)).releases.map((entry) => [entry.release, entry.name, entry.documents.length]), [['123456', 'Patient Monitor', 2], ['777', 'Scanner', 1]])
  assert.deepEqual(windchillSupported(rows, columns, '2026-10', windchillOptionsForView(type2)), ['123456 Patient Monitor'])
  assert.deepEqual(windchillReleases(rows, columns, windchillOptionsForView(type1)).releases.map((entry) => entry.name), ['Programs'], 'the same rows read at the 2nd folder give the parent folder: the setup matters')
})
