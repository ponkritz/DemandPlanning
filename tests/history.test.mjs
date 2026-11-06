import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHistoryFile, featureChecks, groupOf, idOfCell, matchPeople, monthOfCell, parseHistoryFile, parseHistorySheet, pickHistorySheet, serializeHistory, streamsWithoutEpic, withHistory } from '../src/history.ts'
import { capacityModel } from '../src/capacity.ts'
import { personMonths } from '../src/dashboard.ts'

// Synthetic planning workbook rows (no company data): the TransformedData layout, one row per person × month × activity.
const header = ['Stream(Features)', 'Migration?', 'Epic No', 'Epic Name', 'Project / Release Title', 'Service/Project/Release', 'Project / Release Type', 'Current Milestone', 'QA/QE', 'Region', 'Month', 'Expected', 'Actual', 'Month(Date)', 'Total Working Hours', 'Role']
const row = (stream, epic, title, person, date, expected, actual) => [stream, '', epic, 'TBD', title, 'Release', '', '', person, 'BLR', '', expected, actual, date, '168', 'QE']
const sheet = [
  header,
  row('Projects - Alpha', '500', 'Alpha 1.0', 'Ana Costa', '2026-05-01', '10', '12'),
  row('CAPA', '', 'CAPA 12', 'Ben Ode', '2026-06-01', '', '8'),
  row('CAPA', '0', 'CAPA 13', 'Ben Ode', '2026-07-01', '5', ''),
  row('Projects - Alpha', '500', 'Alpha 1.0', 'Ana Costa', '2026-10-01', '10', '10'),
  row('Projects - Alpha', '500', 'Alpha 1.0', '#N/A', '2026-05-01', '4', '4'),
  row('Projects - Alpha', '500', 'Alpha 1.0', 'Cleo Dunn', '2026-05-01', '0', '0'),
  row('Projects - Alpha', '500', 'Alpha 1.0', 'Cleo Dunn', 'May', '3', '3'),
]

test('historical hours: the TransformedData sheet read before the cut-off; every other row listed with its reason (HIS-02, HIS-03)', () => {
  assert.equal(monthOfCell('2026-05-01'), '2026-05')
  assert.equal(monthOfCell('2026-05-01 00:00'), '2026-05')
  assert.equal(monthOfCell('01.09.2026'), '2026-09')
  assert.equal(monthOfCell('May'), undefined, 'a month name without a year is not a month')
  assert.equal(pickHistorySheet([{ name: 'Cover', rows: [['QE Capacity']] }, { name: 'TransformedData', rows: sheet }]).name, 'TransformedData')
  const parsed = parseHistorySheet(sheet, '2026-10')
  assert.deepEqual(parsed.rows, [
    { person: 'Ana Costa', month: '2026-05', epicId: 500, stream: 'Projects - Alpha', activity: 'Alpha 1.0', type: 'Release', planned: 10, actual: 12 },
    { person: 'Ben Ode', month: '2026-06', stream: 'CAPA', activity: 'CAPA 12', type: 'Release', actual: 8 },
    { person: 'Ben Ode', month: '2026-07', stream: 'CAPA', activity: 'CAPA 13', type: 'Release', planned: 5 },
  ])
  assert.deepEqual(parsed.skipped.map((entry) => [entry.row, entry.reason]), [[5, '2026-10: from the cut-off on, Azure DevOps counts'], [6, 'no person'], [7, 'no hours'], [8, 'no month (Month(Date) is not a date)']])
  assert.deepEqual(streamsWithoutEpic(parsed.rows), [{ stream: 'CAPA', count: 2 }])
  assert.throws(() => parseHistorySheet([['Name', 'Hours']]), /No header row/)
})

test('historical hours: Excel names matched to Azure DevOps names in any order; ambiguous or unknown names stay as written (HIS-06)', () => {
  const known = ['Costa, Ana <ana.costa@example.com>', 'Ode, Ben', 'Ode, Bea', 'Dunn, Cleo']
  assert.deepEqual(matchPeople(['Ana Costa', 'Ben Ode', 'Cleo', 'Ode', 'Dan Eve'], known), { 'Ana Costa': 'Costa, Ana <ana.costa@example.com>', 'Ben Ode': 'Ode, Ben', 'Cleo': 'Dunn, Cleo' })
})

test('historical hours: the Git file keeps known shapes only (HIS-04)', () => {
  const file = buildHistoryFile({ rows: parseHistorySheet(sheet, '2026-10').rows, cutoff: '2026-10', source: 'plan.xlsx', sheet: 'TransformedData', importedBy: 'lead@example.com', streamEpics: { CAPA: 600 }, people: { 'Ana Costa': 'Costa, Ana' } }, '2026-11-05T10:00:00Z')
  assert.deepEqual(parseHistoryFile(serializeHistory(file)), file, 'a round trip keeps everything')
  assert.equal(parseHistoryFile('{"schema":1,"kind":"history-hours","cutoff":"Oct","rows":[]}'), null, 'a bad cut-off: no history')
  assert.equal(parseHistoryFile('not json'), null)
  const planted = parseHistoryFile(JSON.stringify({ ...file, rows: [...file.rows, { person: '', month: '2026-05', actual: 5 }, { person: 'X', month: '2026-05', actual: 1e9 }, 'row'], streamEpics: { CAPA: 'six hundred' }, people: { 'Ana Costa': 7 } }))
  assert.equal(planted.rows.length, 4, 'rows without a person dropped; absurd hours dropped from the row')
  assert.equal(planted.rows[3].actual, undefined)
  assert.deepEqual([planted.streamEpics, planted.people], [{}, {}])
})

test('historical hours in the reports: before the cut-off the history only, from it Azure DevOps only; real Epics and mapped streams used (HIS-05, HIS-07)', () => {
  const base = { organization: 'org', project: 'Quality', state: 'Active', areaPath: 'Quality', iterationPath: 'Quality', tags: '', url: '', syncedAt: '' }
  const item = (id, workItemType, title, extra = {}) => ({ ...base, key: `org/quality/${id}`, id, workItemType, title, assignedTo: '', ...extra })
  const ado = [
    item(500, 'Epic', 'Alpha stream'), item(600, 'Epic', 'CAPA stream'),
    item(501, 'Feature', 'Alpha 1.0', { parentId: 500 }),
    item(502, 'Task', 'May 2026 | Alpha', { parentId: 501, assignedTo: 'Costa, Ana', originalEstimate: 99, completedWork: 99 }),
    item(503, 'Task', 'October 2026 | Alpha', { parentId: 501, assignedTo: 'Costa, Ana', originalEstimate: 20, completedWork: 18 }),
  ]
  const file = buildHistoryFile({ rows: parseHistorySheet(sheet, '2026-10').rows, cutoff: '2026-10', source: 'plan.xlsx', sheet: 'TransformedData', importedBy: '', streamEpics: { CAPA: 600 }, people: { 'Ana Costa': 'Costa, Ana' } })
  const merged = withHistory(ado, file)
  assert.equal(withHistory(ado, file), merged, 'worked out once per data set')
  assert.deepEqual(merged.leftOut, { tasks: 1, hours: 99 }, 'the Azure DevOps May Task (test data) is not counted')
  assert.deepEqual(merged.added, { rows: 3, hours: 20, people: 2 })
  assert.ok(merged.items.filter((entry) => entry.id < 0).every((entry) => entry.organization === 'history' && entry.state === 'Closed'), 'read-only stand-ins with negative IDs')
  const may = capacityModel(merged.items, '2026-05')
  assert.deepEqual(may.people.map((person) => [person.name, person.work, person.planned]), [['Costa, Ana', 12, 10]], 'May: the history under the Azure DevOps name, not the 99h test Task')
  assert.deepEqual(may.streams.map((stream) => [stream.title, stream.work]), [['Alpha stream', 12]], 'Epic No 500 is the real Epic')
  const june = capacityModel(merged.items, '2026-06')
  assert.deepEqual(june.people.map((person) => [person.name, person.work]), [['Ben Ode', 8]], 'a leaver keeps the Excel name')
  assert.deepEqual(june.streams.map((stream) => stream.title), ['CAPA stream'], 'the CAPA stream mapped to its Epic')
  const october = capacityModel(merged.items, '2026-10')
  assert.deepEqual(october.people.map((person) => [person.name, person.work]), [['Costa, Ana', 18]], 'from the cut-off: Azure DevOps only')
  const rows = personMonths(merged.items, ['2026-05', '2026-06', '2026-07'], '2026-11-05')
  assert.deepEqual(rows.map((entry) => [entry.month, entry.person, entry.actual, entry.plan]), [['2026-05', 'Costa, Ana', 12, 10], ['2026-06', 'Ben Ode', 8, 0], ['2026-07', 'Ben Ode', 0, 5]])
  // Unmapped stream: its own stand-in Epic named after the stream.
  const own = withHistory(ado, { ...file, streamEpics: {} })
  assert.deepEqual(capacityModel(own.items, '2026-06').streams.map((stream) => stream.title), ['CAPA'])
  assert.equal(withHistory(ado, null).items, ado, 'no history: the Azure DevOps items unchanged')
})

test('historical hours: a Feature ID of a Feature in the data wins over Epic No and stream; disagreements and unknown Features listed (HIS-10)', () => {
  const head = ['QA/QE', 'Month(Date)', 'Epic No', 'Stream(Features)', 'Project / Release Title', 'Expected', 'Actual', 'Feature ID']
  const parsed = parseHistorySheet([head, ['Ana Costa', '2026-05-01', '500', 'Alpha', 'Alpha 1.0', '4', '6', '701'], ['Ana Costa', '2026-06-01', '500', 'Alpha', 'Alpha 2.0', '', '3', '999'], ['Ben Ode', '2026-06-01', '', 'CAPA', 'CAPA 1', '', '2', '702']], '2026-10')
  assert.deepEqual(parsed.rows.map((row) => [row.featureId, row.epicId]), [[701, 500], [999, 500], [702, undefined]])
  const base = { organization: 'org', project: 'Quality', state: 'Active', areaPath: '', iterationPath: '', tags: '', url: '', syncedAt: '', assignedTo: '' }
  const item = (id, workItemType, title, parentId) => ({ ...base, key: `org/q/${id}`, id, workItemType, title, ...(parentId ? { parentId } : {}) })
  const ado = [item(500, 'Epic', 'Alpha stream'), item(600, 'Epic', 'Beta stream'), item(601, 'Epic', 'CAPA stream'), item(701, 'Feature', 'Alpha 1.0 (in Azure DevOps)', 600), item(702, 'Feature', 'CAPA work', 601)]
  assert.deepEqual(featureChecks(parsed.rows, ado), { missing: [999], conflicts: [{ featureId: 701, epicNo: 500, epicOfFeature: 600 }] })
  const file = buildHistoryFile({ rows: parsed.rows, cutoff: '2026-10', source: 'plan.xlsx', sheet: 'TransformedData', importedBy: '', streamEpics: {}, people: {} })
  assert.deepEqual(parseHistoryFile(serializeHistory(file)).rows.map((row) => row.featureId), [701, 999, 702], 'the Feature ID is kept in Git')
  const merged = withHistory(ado, file).items
  assert.deepEqual(capacityModel(merged, '2026-05').streams.map((stream) => [stream.title, stream.work]), [['Beta stream', 6]], 'the Feature\'s Epic, not Epic No 500')
  assert.deepEqual(capacityModel(merged, '2026-06').streams.map((stream) => [stream.title, stream.work]).sort(), [['Alpha stream', 3], ['CAPA stream', 2]], 'unknown Feature 999: Epic No 500; Feature 702: its Epic, no stream mapping needed')
  assert.equal(merged.filter((entry) => entry.parentId === 701 && entry.id < 0).length, 1, 'the history Task sits under the real Feature')
})

test('historical hours: holidays, leave and trainings under their Features count for the row\'s own person only (HIS-12)', () => {
  const base = { organization: 'org', project: 'Quality', state: 'Active', areaPath: '', iterationPath: '', tags: '', url: '', syncedAt: '', assignedTo: '' }
  const item = (id, workItemType, title, parentId) => ({ ...base, key: `org/q/${id}`, id, workItemType, title, ...(parentId ? { parentId } : {}) })
  // Team Holidays and Training (the absence Epic) with a regional holiday Feature, a leave Feature and a training Feature.
  const ado = [item(37778, 'Epic', 'Team Holidays and Training'), item(800, 'Feature', 'Public Holidays - India', 37778), item(801, 'Feature', 'PTO', 37778), item(802, 'Feature', 'QE Training', 37778), item(500, 'Epic', 'Alpha stream')]
  const head = ['QA/QE', 'Month(Date)', 'Epic No', 'Stream(Features)', 'Project / Release Title', 'Expected', 'Actual', 'Feature ID']
  const rows = [head,
    ['Ana Costa', '2026-08-01', '', 'Holidays', 'Independence Day', '', '8', '800'],
    ['Ben Ode', '2026-08-01', '', 'Holidays', 'Independence Day', '', '8', '800'],
    ['Ana Costa', '2026-08-01', '', 'PTO', 'PTO', '', '16', '801'],
    ['Ben Ode', '2026-08-01', '', 'Training', 'QE Training', '', '4', '802'],
    ['Ana Costa', '2026-08-01', '500', 'Alpha', 'Alpha 1.0', '100', '100', ''],
    ['Ben Ode', '2026-08-01', '500', 'Alpha', 'Alpha 1.0', '100', '100', ''],
  ]
  const file = buildHistoryFile({ rows: parseHistorySheet(rows, '2026-10').rows, cutoff: '2026-10', source: 'plan.xlsx', sheet: 'TransformedData', importedBy: '', streamEpics: {}, people: {} })
  const settings = { absenceEpicId: 37778, hoursPerDay: 8, overloadedAt: 100, availableBelow: 80, npraHoursPerMonth: 20, profiles: { 'Ana Costa': { region: 'India' }, 'Ben Ode': { region: 'India' } } }
  const august = capacityModel(withHistory(ado, file).items, '2026-08', settings)
  const person = (name) => august.people.find((entry) => entry.name === name)
  assert.equal(person('Ana Costa').absenceByKind['Public holiday'], 8, 'her own 8h holiday, not 16h for the two rows together')
  assert.equal(person('Ben Ode').absenceByKind['Public holiday'], 8)
  assert.equal(person('Ana Costa').absenceByKind.PTO, 16, 'leave under the absence Epic is absence')
  assert.equal(person('Ben Ode').npra, 4, 'training under the absence Epic is training (NPRA)')
  assert.deepEqual([person('Ana Costa').work, person('Ben Ode').work], [100, 100], 'leave, holidays and training are not work')
  assert.deepEqual(august.sharedTime, [], 'nothing spread over the region')
})

test('historical hours: All, All-BLR, All-NL and All-US rows apply to everyone in that group (HIS-13)', () => {
  assert.deepEqual(['All', 'All-BLR', 'all - nl', 'All-US', 'All India', 'Allan Poe', 'All-XYZ'].map(groupOf), ['everyone', 'India', 'Netherlands', 'US', 'India', undefined, undefined])
  const base = { organization: 'org', project: 'Quality', state: 'Active', areaPath: '', iterationPath: '', tags: '', url: '', syncedAt: '', assignedTo: '' }
  const item = (id, workItemType, title, parentId) => ({ ...base, key: `org/q/${id}`, id, workItemType, title, ...(parentId ? { parentId } : {}) })
  const ado = [item(37778, 'Epic', 'Team Holidays and Training'), item(500, 'Epic', 'Alpha stream'), item(900, 'Epic', 'Common activities')]
  const head = ['QA/QE', 'Month(Date)', 'Epic No', 'Stream(Features)', 'Project / Release Title', 'Expected', 'Actual']
  const parsed = parseHistorySheet([head,
    ['All-BLR', '2026-08-01', '37778', 'Holidays', 'Independence Day', '8', '8'],
    ['All-NL', '2026-08-01', '37778', 'Holidays', 'Bevrijdingsdag', '8', '8'],
    ['All', '2026-08-01', '900', 'Town hall', 'Town hall', '2', '2'],
    ['All-XYZ', '2026-08-01', '900', 'Town hall', 'Town hall', '2', '2'],
    ['Ana Costa', '2026-08-01', '500', 'Alpha', 'Alpha 1.0', '100', '100'],
    ['Ben Ode', '2026-08-01', '500', 'Alpha', 'Alpha 1.0', '100', '100'],
    ['Cleo Dunn', '2026-08-01', '500', 'Alpha', 'Alpha 1.0', '100', '100'],
  ], '2026-10')
  assert.deepEqual(parsed.skipped.map((entry) => entry.reason), ['unknown group "All-XYZ" (use All, All-BLR, All-NL or All-US)'])
  const file = buildHistoryFile({ rows: parsed.rows, cutoff: '2026-10', source: 'plan.xlsx', sheet: 'TransformedData', importedBy: '', streamEpics: {}, people: {} })
  const merged = withHistory(ado, file)
  assert.equal(merged.added.people, 3, 'groups are not people')
  const settings = { absenceEpicId: 37778, hoursPerDay: 8, overloadedAt: 100, availableBelow: 80, npraHoursPerMonth: 20, profiles: { 'Ana Costa': { region: 'India' }, 'Ben Ode': { region: 'India' }, 'Cleo Dunn': { region: 'Netherlands' } } }
  const august = capacityModel(merged.items, '2026-08', settings)
  const person = (name) => august.people.find((entry) => entry.name === name)
  assert.deepEqual(august.people.map((entry) => entry.name).sort(), ['Ana Costa', 'Ben Ode', 'Cleo Dunn'], 'no person called All-BLR')
  assert.deepEqual(['Ana Costa', 'Ben Ode', 'Cleo Dunn'].map((name) => person(name).absenceByKind['Public holiday']), [8, 8, 8], 'BLR holiday for each India person, NL holiday for the Netherlands person')
  assert.deepEqual(['Ana Costa', 'Ben Ode', 'Cleo Dunn'].map((name) => person(name).reserved), [2, 2, 2], '"All": the town hall for everyone')
  assert.deepEqual(['Ana Costa', 'Ben Ode', 'Cleo Dunn'].map((name) => person(name).work), [100, 100, 100])
})

test('historical hours: Epic No / Feature No cells written as Excel writes them are read; others are reported, never silently ignored (HIS-14)', () => {
  assert.deepEqual(['37753', '37753.0', '#37753', ' 37753 ', '37753, 37754', '37753/37754', '', '0', 'TBD', 'N/A'].map((value) => idOfCell(value).id), [37753, 37753, 37753, 37753, 37753, 37753, undefined, undefined, undefined, undefined])
  assert.equal(idOfCell('Feature 37753').unreadable, true)
  assert.equal(idOfCell('I1-10015604 - IEX Data').unreadable, true)
  const head = ['QA/QE', 'Month(Date)', 'Epic No', 'Stream (Features)', 'Project / Release Title', 'Expected', 'Actual', 'Feature No']
  const parsed = parseHistorySheet([head,
    ['Ana Costa', '2026-05-01', '500.0', 'Alpha', 'Alpha 1.0', '4', '6', '#701'],
    ['Ana Costa', '2026-06-01', 'TBD', 'Beta', 'Beta 2.0', '', '3', 'see Jira'],
  ], '2026-10')
  assert.deepEqual(parsed.rows.map((row) => [row.featureId, row.epicId, row.stream]), [[701, 500, 'Alpha'], [undefined, undefined, 'Beta']], '"Stream (Features)" is the stream, "Feature No" the Feature')
  assert.deepEqual(parsed.unreadable, [{ row: 3, column: 'Feature No', value: 'see Jira' }])
})

test('historical hours: the file is read with every month, so a later cut-off brings October back without uploading again (HIS-15)', () => {
  const head = ['QA/QE', 'Month(Date)', 'Epic No', 'Stream (Features)', 'Project / Release Title', 'Expected', 'Actual']
  const sheet = [head, ['Ana Costa', '2026-09-01', '500', 'Alpha', 'Alpha 1.0', '8', '8'], ['Ana Costa', '2026-10-01', '500', 'Alpha', 'Alpha 1.0', '6', '6']]
  const all = parseHistorySheet(sheet, '9999-12')
  assert.deepEqual(all.rows.map((row) => row.month), ['2026-09', '2026-10'], 'both months kept on reading')
  const cutoff = (month) => all.rows.filter((row) => row.month < month).map((row) => row.month)
  assert.deepEqual([cutoff('2026-10'), cutoff('2026-11')], [['2026-09'], ['2026-09', '2026-10']], 'October counts once the cut-off is November')
  const file = buildHistoryFile({ rows: all.rows.filter((row) => row.month < '2026-11'), cutoff: '2026-11', source: 'plan.xlsx', sheet: 'TransformedData', importedBy: '', streamEpics: {}, people: {} })
  assert.equal(withHistory([], file).added.rows, 2)
})

test('historical hours: a Tag column marks training / NPRA rows; the app\'s own tags cannot be set from it (TC-HIS-11)', async () => {
  const { tagOfCell } = await import('../src/history.ts')
  assert.equal(tagOfCell(' Training , NPRA '), 'Training; NPRA')
  assert.equal(tagOfCell('Shared: everyone; History import; Training'), 'Training', 'no group or import marker from the file')
  const base = { organization: 'org', project: 'Quality', state: 'Active', areaPath: '', iterationPath: '', tags: '', url: '', syncedAt: '', assignedTo: '' }
  const item = (id, workItemType, title, parentId) => ({ ...base, key: `org/q/${id}`, id, workItemType, title, ...(parentId ? { parentId } : {}) })
  // Leave and training in one Feature of the absence Epic: only the Tag tells them apart.
  const ado = [item(37778, 'Epic', 'Absence and Training'), item(810, 'Feature', 'Ana Costa', 37778)]
  const rows = [['QA/QE', 'Month(Date)', 'Epic No', 'Stream(Features)', 'Project / Release Title', 'Expected', 'Actual', 'Feature ID', 'Tag'],
    ['Ana Costa', '2026-08-01', '', 'Absence', 'PTO', '', '16', '810', ''],
    ['Ana Costa', '2026-08-01', '', 'Absence', 'White belt', '', '6', '810', 'Training'],
    ['Ana Costa', '2026-08-01', '', 'Absence', 'Town hall', '', '2', '810', 'NPRA'],
  ]
  const parsed = parseHistorySheet(rows, '2026-10').rows
  assert.deepEqual(parsed.map((entry) => entry.tag), [undefined, 'Training', 'NPRA'])
  const file = buildHistoryFile({ rows: parsed, cutoff: '2026-10', source: 'plan.xlsx', sheet: 'TransformedData', importedBy: '', streamEpics: {}, people: {} })
  assert.deepEqual(parseHistoryFile(serializeHistory(file)).rows.map((entry) => entry.tag), [undefined, 'Training', 'NPRA'], 'kept in history-hours.json')
  const settings = { absenceEpicId: 37778, hoursPerDay: 8, overloadedAt: 100, availableBelow: 80, npraHoursPerMonth: 20, profiles: { 'Ana Costa': { region: 'India' } } }
  const ana = capacityModel(withHistory(ado, file).items, '2026-08', settings).people.find((entry) => entry.name === 'Ana Costa')
  assert.deepEqual([ana.absence, ana.npra], [16, 8], 'PTO is absence; the tagged rows are training / NPRA')
})
