import test from 'node:test'
import assert from 'node:assert/strict'
import { addMonths, addSource, aggregate, azureFieldOptions, azureInputs, azureLock, completionDated, dueFromText, azureValue, cleanDays, dayOf, daysLeftText, defaultValidityMonths, dueFromLabel, dueOf, editOf, editProblem, emptyFile, entryState, expiryRows, guessMapping, inputsFromRows, listReason, mappingFor, markMerged, mergeSource, mergeToolValidationsText, monthsOf, nameKey, openToolTab, toolTabs, ownersReason, parseToolValidations, removeSource, removeTool, saveTool, serializeToolValidations, setMapping, setTeam, sourceProblem, streamSourceId, toolKey, toolValidationsFile, addTab, addTabReason, customTabKey, customToolTabs, maxCustomTabs, moveTab, removeTab, renameTab, tabNameProblem, validityOf, bandCounts, bandFor, bandLabel, bandShort, bandsOf, defaultHighlights, highlightColours, highlightsProblem, maxHighlights, setHighlights, sortBands, categoryLabel, categoryOf, categoryProblem, feedsMasterList, setCategory, sourceCategories, guessAzureFields, noField, mapped } from '../src/toolValidations.ts'
import { pagesOfFile, fileLabel } from '../src/gitWatch.ts'

// TVL-01…TVL-13: the Tool Validations master list (tool-validations.json in Git), its sources, merges and expiry view.
const at = '2026-11-24T10:00:00Z'
const tool = (name, version, extra = {}) => ({ name, version, manual: [], sources: { stream: { inSource: true } }, addedAt: at, ...extra })
const fileWith = (tools, extra = {}) => JSON.stringify({ schema: 1, kind: 'tool-validations', defaultDays: 60, owners: [], sources: [{ id: 'stream', kind: 'stream', name: 'Tool Validations', mapping: { periodUnit: 'months', confirmed: false } }], tools, ...extra })
const doc = (id, areaPath, iterationPath, title, fields = {}, approvalDate) => ({ key: `o/p/${id}`, id, title, workItemType: 'Document', state: 'Approved', assignedTo: '', areaPath, iterationPath, tags: '', url: '', organization: 'o', project: 'p', syncedAt: '', fields, ...(approvalDate ? { approvalDate } : {}) })

test('TVL-02: the master list read from Git — round trip, each source and tool checked on its own, a broken file refused whole (TC-TVL-01)', () => {
  const empty = parseToolValidations(null)
  assert.deepEqual(empty.file, emptyFile(), 'no file yet: an empty list with the Tool Validations query as its source')
  assert.equal(empty.file.defaultDays, 60, 'team default 60 days')
  assert.throws(() => parseToolValidations('{nope'), /not valid JSON/)
  assert.throws(() => parseToolValidations(JSON.stringify({ schema: 2, kind: 'tool-validations' })), /not a Tool Validations master list/)
  assert.throws(() => parseToolValidations(JSON.stringify({ schema: 1, kind: 'custom-streams' })), /not a Tool Validations master list/)
  const text = fileWith([
    tool('Minitab', '21', { validationDate: '2025-01-15', validityMonths: 24, notes: 'Annual check' }),
    tool('minitab', 'v21.0'),
    tool('LabVIEW', '2020', { dueDate: '2026-02-30' }),
    tool('Python', '3.11', { validityMonths: 0 }),
    tool('', '1'),
    tool('JMP', '17', { sources: { stream: { inSource: false }, unknown: { inSource: true } }, addedAt: 'yesterday' }),
    tool('Excel', '', { sources: {}, validationDate: '2026-01-01', manual: ['validationDate', 'nonsense'] }),
  ], { defaultDays: 5000, owners: ['Diya.Sharma@example.com', 'not an email'], sources: [{ id: 'stream', kind: 'stream', name: 'Tool Validations', mapping: { name: '@tool-name', periodUnit: 'years', confirmed: true } }, { id: 'wc', kind: 'windchill', name: 'Tools export', ref: 'view-1', mapping: {} }, { id: 'Bad Id', kind: 'windchill', name: 'x', ref: 'y' }, { id: 'odd', kind: 'formula', name: 'x', ref: 'y' }, { id: 'wc', kind: 'ondemand', name: 'twice', ref: 'p' }] })
  const { file, refused } = parseToolValidations(text)
  assert.deepEqual(file.tools.map((entry) => `${entry.name} ${entry.version}`), ['Excel ', 'Minitab 21'], 'sorted by name; the bad ones refused')
  assert.deepEqual(refused.map((entry) => entry.reason), [
    'its id is missing or not lower-case letters, digits and hyphens', 'unknown kind “formula”', 'the id “wc” is used twice',
    'the same tool and version is listed twice', 'due date “2026-02-30” is not a date (YYYY-MM-DD)', 'validity period “0” is not a whole number of months from 1 to 600', 'no tool name (1 to 200 characters with a letter or digit)', 'no time it was added (addedAt)',
  ])
  assert.equal(file.defaultDays, 60, 'a team default out of range is not used')
  assert.deepEqual(file.owners, ['diya.sharma@example.com'], 'co-owners are work emails, lower case')
  assert.deepEqual(file.sources.map((source) => source.id), ['stream', 'wc'])
  assert.equal(file.sources[0].mapping.periodUnit, 'years')
  assert.deepEqual(file.tools[0].manual, ['validationDate'], 'unknown hand-changed fields are dropped')
  // Round trip: what is written reads back the same, the key is worked out (never stored).
  const again = parseToolValidations(serializeToolValidations(file))
  assert.deepEqual(again.file, file)
  assert.equal(serializeToolValidations(again.file), serializeToolValidations(file))
  assert.ok(!serializeToolValidations(file).includes('"key"'))
  assert.equal(toolValidationsFile, 'tool-validations.json')
})

test('TVL-03: the same tool is the same name (case, spaces and punctuation ignored) and version; other versions are other entries (TC-TVL-02)', () => {
  assert.equal(nameKey('Mini-Tab  Pro'), nameKey('minitab pro'))
  assert.equal(toolKey('LabVIEW', 'v2020.0'), toolKey('lab view', '2020'))
  assert.notEqual(toolKey('LabVIEW', '2020'), toolKey('LabVIEW', '2021'))
  assert.notEqual(toolKey('LabVIEW', ''), toolKey('LabVIEW', '2020'), 'no version is a version of its own')
  const merged = aggregate([{ name: 'Minitab', version: '21', validationDate: '2025-01-15', validityMonths: 12 }, { name: 'MINITAB', version: '21.0', validationDate: '2025-03-01', validityMonths: 24, dueDate: '2027-01-01' }, { name: 'Minitab', version: '22' }])
  assert.equal(merged.size, 2)
  assert.deepEqual(merged.get(toolKey('minitab', '21')), { name: 'Minitab', version: '21', validationDate: '2025-03-01', validityMonths: 24, dueDate: '2027-01-01' }, 'the latest dates; the period of the latest validation')
})

test('TVL-04, TVL-05: a source merged in — new tools appended, values updated (not those changed by hand), a tool gone from its source kept as “not in source now”; nothing changed gives the same file (TC-TVL-02)', () => {
  let file = parseToolValidations(fileWith([])).file
  const first = mergeSource(file, streamSourceId, [{ name: 'Minitab', version: '21', validationDate: '2025-01-15' }, { name: 'LabVIEW', version: '2020', dueDate: '2026-11-14' }], at, 'Diya Sharma')
  assert.deepEqual([first.added, first.updated, first.gone], [['Minitab', 'LabVIEW'], [], []])
  file = first.file
  assert.equal(file.tools.find((entry) => entry.name === 'Minitab').addedBy, 'Diya Sharma')
  assert.equal(mergeSource(file, streamSourceId, [{ name: 'minitab', version: '21.0', validationDate: '2025-01-15' }, { name: 'LabVIEW', version: '2020', dueDate: '2026-11-14' }], at).file, file, 'the same data: the same file, nothing to save')
  // A tool of the Tool Validations query is not changed by hand (TVL-30); LabVIEW leaves the query and stays, marked; a new tool comes.
  assert.equal(saveTool(file, { ...editOf(file.tools.find((entry) => entry.name === 'Minitab')), validationDate: '2025-02-01' }, at, 'Diya Sharma', toolKey('Minitab', '21')), file, 'refused: the same file')
  file = saveTool(file, { name: 'Excel Validator', version: '2', validationDate: '2025-02-01', validityMonths: '', dueDate: '', notes: '' }, at, 'Diya Sharma')
  const second = mergeSource(file, streamSourceId, [{ name: 'Minitab', version: '21', validationDate: '2025-06-01', validityMonths: 24 }, { name: 'Python', version: '3.11' }], at)
  assert.deepEqual([second.added, second.updated, second.gone], [['Python'], ['Minitab'], ['LabVIEW']])
  const minitab = second.file.tools.find((entry) => entry.name === 'Minitab')
  assert.equal(minitab.validationDate, '2025-06-01', 'follows the source')
  assert.equal(minitab.validityMonths, 24, 'follows the source')
  const labview = second.file.tools.find((entry) => entry.name === 'LabVIEW')
  assert.equal(entryState(labview), 'gone', 'not in source now — still listed')
  assert.equal(labview.dueDate, '2026-11-14', 'its dates are kept')
  // Another source holding the same tool links the same entry.
  const withSource = addSource(second.file, { kind: 'windchill', name: 'Tools export', ref: 'view-1', mapping: guessMapping('windchill', [['Tool', 'Tool'], ['Version', 'Version']]) })
  const third = mergeSource(withSource, 'tools-export', [{ name: 'lab-view', version: '2020' }, { name: 'Excel Validator', version: '2', validationDate: '2025-06-01' }], at)
  assert.deepEqual(third.added, [])
  assert.equal(third.file.tools.find((entry) => entry.name === 'Excel Validator').validationDate, '2025-02-01', 'a date changed by hand is kept when a source other than Azure DevOps is read')
  assert.equal(entryState(third.file.tools.find((entry) => entry.name === 'LabVIEW')), 'in-source', 'in a source again')
  assert.deepEqual(Object.keys(third.file.tools.find((entry) => entry.name === 'LabVIEW').sources), ['stream', 'tools-export'])
  const marked = markMerged(third.file, 'tools-export', at, 'Diya Sharma')
  assert.equal(marked.sources.find((source) => source.id === 'tools-export').mergedAt, at)
  // A removed source takes its links, not its tools.
  const removed = removeSource(marked, 'tools-export')
  assert.equal(removed.tools.length, marked.tools.length)
  assert.equal(entryState(removed.tools.find((entry) => entry.name === 'LabVIEW')), 'gone')
  assert.equal(removeSource(marked, streamSourceId), marked, 'the Tool Validations query cannot be removed')
  assert.equal(sourceProblem(marked, 'windchill', 'view-1', 'Again'), 'This one is already a source.')
})

test('TVL-06: validation date, validity period (months) and due date — an explicit due date wins; else validation date + period (TC-TVL-03)', () => {
  assert.equal(addMonths('2025-01-31', 1), '2025-02-28')
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29')
  assert.equal(addMonths('2025-03-15', 24), '2027-03-15')
  assert.deepEqual(dueOf({ validationDate: '2025-03-15', validityMonths: 24, manual: [] }), { due: '2027-03-15', from: 'calculated' })
  assert.deepEqual(dueOf({ validationDate: '2025-03-15', validityMonths: 24, dueDate: '2026-01-01', manual: [] }), { due: '2026-01-01', from: 'source' })
  assert.deepEqual(dueOf({ dueDate: '2026-01-01', manual: ['dueDate'] }), { due: '2026-01-01', from: 'entered' })
  assert.deepEqual(dueOf({ manual: [] }), { from: 'none' }, 'no validation date and no due date: no due date')
  assert.deepEqual(dueOf({ validityMonths: 12, manual: ['validityMonths'] }), { from: 'none' }, 'a period without a validation date: still no due date')
  assert.deepEqual(['24', '2 years', '2y', '18 mo', '1.5 years', '0', '700', 'soon', ''].map((value) => monthsOf(value)), [24, 24, 24, 18, 18, undefined, undefined, undefined, undefined])
  assert.equal(monthsOf('2', 'years'), 24, 'a plain number in the source unit')
  assert.deepEqual(['2026-10-05T22:30:00-05:00', '2026-10-05', '27-Oct-2026', 'Oct 27, 2026', '27.10.2026', '10/27/2026', 'next week', 42].map(dayOf), ['2026-10-06', '2026-10-05', '2026-10-27', '2026-10-27', '2026-10-27', '2026-10-27', undefined, undefined])
})

test('TVL-06: no validity period — the due date is the validation date + 24 months (default); an explicit period or due date wins (TC-TVL-20)', () => {
  assert.equal(defaultValidityMonths, 24)
  assert.deepEqual(dueOf({ validationDate: '2025-03-15', manual: [] }), { due: '2027-03-15', from: 'default' })
  assert.equal(dueFromLabel.default, 'validation date + 24 months (default)')
  assert.deepEqual(dueOf({ validationDate: '2025-01-31', manual: [] }), { due: '2027-01-31', from: 'default' }, 'month end')
  assert.deepEqual(dueOf({ validationDate: '2024-02-29', manual: [] }), { due: '2026-02-28', from: 'default' }, '29 Feb + 24 months: 28 Feb')
  assert.deepEqual(dueOf({ validationDate: '2025-03-15', validityMonths: 12, manual: [] }), { due: '2026-03-15', from: 'calculated' }, 'a period from a source wins')
  assert.deepEqual(dueOf({ validationDate: '2025-03-15', validityMonths: 36, manual: ['validityMonths'] }), { due: '2028-03-15', from: 'calculated' }, 'a period entered by hand wins')
  assert.deepEqual(dueOf({ validationDate: '2025-03-15', dueDate: '2025-09-30', manual: [] }), { due: '2025-09-30', from: 'source' }, 'a due date from a source wins')
  assert.deepEqual(dueOf({ validationDate: '2025-03-15', dueDate: '2025-10-31', manual: ['dueDate'] }), { due: '2025-10-31', from: 'entered' }, 'a due date entered by hand wins')
  assert.deepEqual([validityOf({ validationDate: '2025-03-15' }), validityOf({ validationDate: '2025-03-15', validityMonths: 18 }), validityOf({ validationDate: '2025-03-15', dueDate: '2026-01-01' }), validityOf({})], [{ months: 24, defaulted: true }, { months: 18, defaulted: false }, { defaulted: false }, { defaulted: false }], 'the default only where it gives the due date')
  // The expiry list uses it: a tool with only a validation date is overdue, due soon or later — no longer "No due date".
  const entry = (name, extra) => ({ key: toolKey(name, ''), name, version: '', manual: [], sources: {}, addedAt: at, ...extra })
  const tools = [entry('Old', { validationDate: '2024-10-01' }), entry('Soon', { validationDate: '2024-12-10' }), entry('Fresh', { validationDate: '2026-01-15' }), entry('Undated', {})]
  const rows = expiryRows(tools, '2026-11-24', 60)
  assert.deepEqual(rows.map((row) => `${row.entry.name}:${row.status}:${row.due ?? '-'}:${row.from}`), ['Old:overdue:2026-10-01:default', 'Soon:due:2026-12-10:default', 'Undated:none:-:none'], 'Fresh (due 2028-01-15) is later: on the Master list only')
  // Applied when reading, never written: the file keeps the entry without a period.
  const file = parseToolValidations(JSON.stringify({ schema: 1, kind: 'tool-validations', defaultDays: 60, owners: [], sources: [{ id: 'stream', kind: 'stream', name: 'Tool Validations', mapping: { periodUnit: 'months', confirmed: false } }], tools: [{ name: 'Old', version: '', validationDate: '2024-10-01', sources: {}, addedAt: at }] })).file
  assert.equal(JSON.parse(serializeToolValidations(file)).tools[0].validityMonths, undefined)
})

test('TVL-08, TVL-09: the expiry view — overdue first, then due within N days with days left, then no due date; later ones left out; N 1 to 730 (TC-TVL-03)', () => {
  const entry = (name, extra) => ({ key: toolKey(name, ''), name, version: '', manual: [], sources: {}, addedAt: at, ...extra })
  const tools = [entry('Later', { dueDate: '2027-06-01' }), entry('Nothing', {}), entry('Soon', { validationDate: '2025-01-10', validityMonths: 23 }), entry('Late', { dueDate: '2026-11-20' }), entry('Today', { dueDate: '2026-11-24' })]
  const rows = expiryRows(tools, '2026-11-24', 60)
  assert.deepEqual(rows.map((row) => `${row.entry.name}:${row.status}:${row.days ?? '-'}`), ['Late:overdue:-4', 'Today:due:0', 'Soon:due:16', 'Nothing:none:-'])
  assert.deepEqual(rows.map(daysLeftText), ['4 days overdue', 'Due today', '16 days left', ''])
  assert.deepEqual(expiryRows(tools, '2026-11-24', 10).map((row) => row.entry.name), ['Late', 'Today', 'Nothing'], 'a shorter window')
  assert.deepEqual(['60', 1, 730, 0, 731, 2.5, 'x', undefined].map(cleanDays), [60, 1, 730, undefined, undefined, undefined, undefined, undefined])
  const team = setTeam(parseToolValidations(null).file, 30, ['Diya.Sharma@example.com', 'nope'])
  assert.equal(team.defaultDays, 30)
  assert.deepEqual(team.owners, ['diya.sharma@example.com'])
})

test('TVL-07: each source is read with its field mapping — the guesses until it is saved (TC-TVL-04)', () => {
  const items = [
    doc(1, 'DHP\\Tool Validations\\Minitab', 'DHP\\Release 21', 'Minitab 21 Validation Plan', { 'Microsoft.VSTS.Scheduling.DueDate': '2027-01-15T00:00:00Z', 'Custom.ValidityPeriod': '2 years', 'Custom.AuthorApprovalDate': '2025-01-15T09:00:00Z' }),
    doc(2, 'DHP\\Tool Validations\\Minitab', 'DHP\\Release 21', 'Minitab 21 Validation Report', { 'Custom.AuthorApprovalDate': '2025-02-01T09:00:00Z' }),
    doc(3, 'DHP', 'DHP', 'Python 3.11 Validation Report', {}),
  ]
  const options = azureFieldOptions(items)
  assert.deepEqual(options.slice(0, 4).map(([key]) => key), ['@tool-name', '@tool-version', '@title', '@approval'])
  const guessed = guessMapping('stream', options)
  assert.deepEqual(guessed, { name: '@tool-name', version: '@tool-version', validationDate: '@completion', validityPeriod: 'Custom.ValidityPeriod', dueDate: 'Microsoft.VSTS.Scheduling.DueDate', id: 'System.Id', periodUnit: 'months', confirmed: false })
  assert.deepEqual(guessMapping('azure', options.filter(([key]) => key !== 'Microsoft.VSTS.Scheduling.DueDate').concat([['Microsoft.VSTS.Scheduling.TargetDate', 'Microsoft.VSTS.Scheduling.TargetDate']])).dueDate, 'Microsoft.VSTS.Scheduling.TargetDate', 'else the Target Date')
  assert.equal(azureValue(items[0], '@tool-name'), 'Minitab')
  assert.equal(azureValue(items[0], '@tool-version'), '21')
  const inputs = inputsFromRows(items, { ...guessed, validationDate: '@approval' }, (item, field) => azureValue(item, field))
  assert.deepEqual([...aggregate(inputs).values()], [
    { name: 'Minitab', version: '21', validationDate: '2025-02-01', validityMonths: 24, dueDate: '2027-01-15', id: 2 },
    { name: 'Python', version: '3.11', id: 3 },
  ], 'TVL-34: the ID of the row with the latest validation date')
  // A Windchill export or a page: the columns whose names fit.
  const columns = [['Number', 'Number'], ['Tool Name', 'Tool Name'], ['Version', 'Version'], ['Validation Date', 'Validation Date'], ['Validity (years)', 'Validity (years)'], ['Next Validation Due', 'Next Validation Due']]
  assert.deepEqual(guessMapping('windchill', columns), { name: 'Tool Name', version: 'Version', validationDate: 'Validation Date', validityPeriod: 'Validity (years)', dueDate: 'Next Validation Due', periodUnit: 'months', confirmed: false })
  // Saved: the mapping is used as saved, guesses no longer.
  const file = setMapping(parseToolValidations(null).file, streamSourceId, { name: '@title', periodUnit: 'years', confirmed: false })
  assert.deepEqual(mappingFor(file.sources[0], options), { name: '@title', periodUnit: 'years', confirmed: true, id: 'System.Id' }, 'TVL-34: a mapping saved before ID, Used by, Validated and Type guesses those')
})

test('TVL-10, TVL-11: tools added, corrected and removed by hand; only the Tool Owner and the co-owners, never without the roles (TC-TVL-06)', () => {
  let file = parseToolValidations(null).file
  const form = { name: 'Excel Validator', version: '2.0', validationDate: '', validityMonths: '', dueDate: '2026-12-01', notes: 'Spreadsheet checks' }
  assert.equal(editProblem(file, { ...form, name: '  ' }), 'Enter the tool name (1 to 200 characters with a letter or digit).')
  assert.equal(editProblem(file, { ...form, validityMonths: '0' }), 'The validity period is a whole number of months from 1 to 600.')
  file = saveTool(file, form, at, 'Diya Sharma')
  assert.equal(editProblem(file, { ...form, name: 'excel-validator', version: 'v2' }), 'This tool and version is already in the master list.')
  const added = file.tools[0]
  assert.deepEqual([added.name, added.version, added.dueDate, added.manual, added.notes, entryState(added), added.addedBy], ['Excel Validator', '2.0', '2026-12-01', ['dueDate'], 'Spreadsheet checks', 'manual', 'Diya Sharma'])
  assert.equal(dueOf(added).from, 'entered')
  // Emptying a field changed by hand gives it back to the sources.
  file = saveTool(file, { ...editOf(added), dueDate: '' }, at, 'Diya Sharma', added.key)
  assert.deepEqual(file.tools[0].manual, [])
  assert.equal(file.tools[0].changedBy, 'Diya Sharma')
  assert.equal(removeTool(file, added.key).tools.length, 0)
  // Rights: fail closed, the Tool Owner, the co-owners.
  const owned = setTeam(file, 60, ['co.owner@example.com'])
  assert.match(listReason({ email: 'co.owner@example.com', readOnly: true, manager: false }, owned), /access roles are not loaded/)
  assert.equal(listReason({ email: 'Co.Owner@example.com', readOnly: false, manager: false }, owned), '')
  assert.equal(listReason({ email: 'boss@example.com', readOnly: false, manager: true }, owned), '')
  assert.match(listReason({ email: 'someone@example.com', readOnly: false, manager: false }, owned), /^Only a Tool Owner .* or a co-owner of the Tool Validations list can change it\./)
  assert.match(ownersReason({ readOnly: false, manager: false }), /^Only a Tool Owner/)
  assert.equal(ownersReason({ readOnly: false, manager: true }), '')
})

test('GIT-17, TVL-02: two saves of the master list are merged — tools by tool, sources by id, co-owners as sets; the file is mapped for “Newer data in Git” (TC-TVL-01)', () => {
  const base = serializeToolValidations(parseToolValidations(fileWith([tool('Minitab', '21', { sources: {} })], { owners: ['a@example.com'] })).file)
  const mine = serializeToolValidations(saveTool(setTeam(parseToolValidations(base).file, 45, ['a@example.com', 'b@example.com']), { name: 'JMP', version: '17', validationDate: '', validityMonths: '', dueDate: '', notes: '' }, at, 'me'))
  const theirs = serializeToolValidations(saveTool(setTeam(parseToolValidations(base).file, 60, []), { ...editOf(parseToolValidations(base).file.tools[0]), notes: 'checked' }, at, 'them', toolKey('Minitab', '21')))
  const merged = parseToolValidations(mergeToolValidationsText(base, mine, theirs, true)).file
  assert.deepEqual(merged.tools.map((entry) => `${entry.name}:${entry.notes ?? ''}`), ['JMP:', 'Minitab:checked'], 'both changes kept')
  assert.deepEqual(merged.owners, ['b@example.com'], 'a removed by them, b added by me')
  assert.equal(merged.defaultDays, 45, 'both changed: the later save wins')
  assert.equal(mergeToolValidationsText(base, mine, '{broken', true), mine, 'an unreadable file in Git is not merged into')
  assert.deepEqual(pagesOfFile('tool-validations.json', 'planning-data.json'), { pages: ['board'], loader: 'toolValidations' })
  assert.equal(fileLabel('tool-validations.json', 'planning-data.json'), 'Tool Validations master list')
})

test('TVL-14: the tabs — Expiry list first, Master list, Tool List [TFS], Validation Documents [TFS] (two queries only), then one per other source in the order added, Setup last; a removed source loses its tab; the tabs remembered before (Azure too) open where their content is now — unknown ones on the Expiry list; room for later tabs before Setup (TC-TVL-09)', () => {
  let file = parseToolValidations(null).file
  assert.deepEqual(toolTabs(file).map((tab) => tab.label), ['Expiry list', 'Master list', 'Tool List [TFS]', 'Validation Documents [TFS]', 'Setup'], 'the two queries are two tabs; no Azure tab; Setup is always there')
  assert.deepEqual(toolTabs(file, [], false).map((tab) => tab.label), ['Expiry list', 'Master list', 'Tool List [TFS]', 'Setup'], 'one query: Tool List [TFS] only')
  file = addSource(file, { kind: 'windchill', name: 'Windchill tools', ref: 'wc-1', mapping: guessMapping('windchill', []) })
  file = addSource(file, { kind: 'ondemand', name: 'Tool register', ref: 'tool-register', mapping: guessMapping('ondemand', []) })
  file = addSource(file, { kind: 'azure', name: 'Lab tools', ref: 'lab', mapping: guessMapping('azure', []) })
  const tabs = toolTabs(file)
  assert.deepEqual(tabs.map((tab) => tab.label), ['Expiry list', 'Master list', 'Tool List [TFS]', 'Validation Documents [TFS]', 'Windchill tools', 'Tool register', 'Lab tools', 'Setup'], 'in the order added, Setup last')
  assert.deepEqual(tabs.map((tab) => tab.key), ['tool-expiry', 'tool-master', 'tool-tfs-tools', 'tool-tfs-documents', 'tool-source:windchill-tools', 'tool-source:tool-register', 'tool-source:lab-tools', 'tool-setup'])
  assert.equal(tabs[5].source.ref, 'tool-register')
  const keys = tabs.map((tab) => tab.key)
  assert.equal(openToolTab('', keys), 'tool-expiry', 'nothing remembered: the Expiry list')
  assert.equal(openToolTab('tool-source:tool-register', keys), 'tool-source:tool-register', 'the last tab, remembered')
  assert.equal(openToolTab('tool-setup', keys), 'tool-setup', 'Setup, remembered')
  for (const [old, now] of [['main', 'tool-tfs-tools'], ['raw', 'tool-tfs-tools'], ['tool-azure', 'tool-tfs-tools'], ['tool-tfs-documents', 'tool-tfs-documents'], ['tool-expiry', 'tool-expiry'], ['tool-master', 'tool-master'], ['tool-setup', 'tool-setup']]) assert.equal(openToolTab(old, keys), now, `the old tab ${old}`)
  assert.equal(openToolTab('tool-tfs-documents', toolTabs(file, [], false).map((tab) => tab.key)), 'tool-expiry', 'Validation Documents [TFS] remembered, one query now: the Expiry list')
  const fewer = toolTabs(removeSource(file, 'tool-register')).map((tab) => tab.key)
  assert.deepEqual(fewer, ['tool-expiry', 'tool-master', 'tool-tfs-tools', 'tool-tfs-documents', 'tool-source:windchill-tools', 'tool-source:lab-tools', 'tool-setup'], 'the removed source loses its tab')
  assert.equal(openToolTab('tool-source:tool-register', fewer), 'tool-expiry', 'a remembered tab that is gone: the Expiry list')
  assert.equal(openToolTab('something-else', fewer), 'tool-expiry')
  assert.deepEqual(toolTabs(file, [{ key: 'tool-page:checklist', label: 'Checklist' }]).map((tab) => tab.key).slice(-3), ['tool-source:lab-tools', 'tool-page:checklist', 'tool-setup'], 'later tabs go after the sources, before Setup')
  assert.equal(toolTabs(file).filter((tab) => tab.label === 'Setup').length, 1, 'one Setup tab')
})

test('TVL-15, TVL-16: the owners’ tabs in tool-validations.json — validated strictly (page id, name, page type; twice refused), written only when there are some; after the source tabs and before Setup, in their order; add, rename, move ← →, remove (TC-TVL-10)', () => {
  const tab = (pageId, name, kind = 'table') => ({ pageId, name, kind })
  const read = parseToolValidations(fileWith([], { tabs: [tab('checklist', 'Checklist'), tab('tool-dash', 'Tool dashboard', 'dashboard'), tab('Bad Id', 'Bad'), tab('notes', '', 'table'), tab('notes', 'Notes', 'release'), tab('checklist', 'Again'), tab('other', 'checklist', 'table-insights'), 'nope'] }))
  assert.deepEqual(read.file.tabs, [tab('checklist', 'Checklist'), tab('tool-dash', 'Tool dashboard', 'dashboard')])
  assert.deepEqual(read.refused.map((entry) => `${entry.name}: ${entry.reason}`), [
    'Tab “Bad”: its page id is missing or not lower-case letters, digits and hyphens',
    'Tab “”: its name is missing or longer than 40 characters',
    'Tab “Notes”: unknown page type “release”',
    'Tab “Again”: the page “checklist” is a tab twice',
    'Tab “checklist”: another tab has this name',
    'Tab “?”: not an object',
  ])
  assert.ok(!serializeToolValidations(parseToolValidations(fileWith([])).file).includes('"tabs"'), 'a file without tabs is written as before')
  const text = serializeToolValidations(read.file)
  assert.deepEqual(JSON.parse(text).tabs, [tab('checklist', 'Checklist'), tab('tool-dash', 'Tool dashboard', 'dashboard')], 'written in their order')
  assert.deepEqual(parseToolValidations(text).file.tabs, read.file.tabs, 'round trip')
  // TVL-15: the tab row — Expiry list · Master list · Tool List [TFS] · Validation Documents [TFS] · source tabs · the owners' tabs · Setup.
  let file = addSource(read.file, { kind: 'windchill', name: 'Windchill tools', ref: 'wc-1', mapping: guessMapping('windchill', []) })
  assert.deepEqual(toolTabs(file, customToolTabs(file)).map((entry) => entry.label), ['Expiry list', 'Master list', 'Tool List [TFS]', 'Validation Documents [TFS]', 'Windchill tools', 'Checklist', 'Tool dashboard', 'Setup'])
  assert.equal(customToolTabs(file)[1].key, customTabKey('tool-dash'))
  assert.equal(customToolTabs(file)[1].custom.kind, 'dashboard')
  assert.equal(openToolTab(customTabKey('tool-dash'), toolTabs(file, customToolTabs(file)).map((entry) => entry.key)), 'tool-tab:tool-dash', 'a remembered owners’ tab opens')
  assert.equal(openToolTab(customTabKey('gone'), toolTabs(file, customToolTabs(file)).map((entry) => entry.key)), 'tool-expiry', 'a removed one opens the Expiry list')
  // Names: 1 to 40 characters, not the name of another tab of the page (fixed tabs, sources, owners' tabs; case ignored).
  assert.equal(tabNameProblem(file, 'Open items'), '')
  for (const name of ['expiry list', 'SETUP', 'tool list [tfs]', 'Validation Documents [TFS]', 'windchill tools', 'checklist']) assert.match(tabNameProblem(file, name), /already has a tab named/, name)
  assert.equal(tabNameProblem(file, 'Checklist', 'checklist'), '', 'its own name when renamed')
  assert.match(tabNameProblem(file, ' '), /Enter a tab name of up to 40 characters/)
  assert.match(tabNameProblem(file, 'x'.repeat(41)), /up to 40/)
  // Add (last), rename, move, remove.
  file = addTab(file, tab('open-items', '  Open   items '))
  assert.deepEqual(file.tabs.map((entry) => entry.name), ['Checklist', 'Tool dashboard', 'Open items'])
  file = moveTab(file, 'open-items', -1)
  assert.deepEqual(file.tabs.map((entry) => entry.pageId), ['checklist', 'open-items', 'tool-dash'])
  assert.equal(moveTab(file, 'checklist', -1), file, 'the first cannot move left')
  assert.equal(moveTab(file, 'tool-dash', 1), file, 'the last cannot move right')
  file = renameTab(file, 'checklist', 'Release checklist')
  assert.equal(file.tabs[0].name, 'Release checklist')
  file = removeTab(file, 'open-items')
  assert.deepEqual(file.tabs.map((entry) => entry.pageId), ['checklist', 'tool-dash'])
  assert.equal(addTabReason(file), '')
  let full = file
  for (let index = file.tabs.length; index < maxCustomTabs; index++) full = addTab(full, tab(`t${index}`, `Tab ${index}`))
  assert.match(addTabReason(full), /^At most 10 tabs/)
  const eleven = JSON.parse(serializeToolValidations(full)); eleven.tabs.push(tab('t-more', 'One more'))
  assert.match(parseToolValidations(JSON.stringify(eleven)).refused[0].reason, /more than 10 tabs/)
})

test('GIT-17, TVL-16: two saves of the tabs merged — by page id, a rename and an add both kept, a removal kept, the order of the save that moved them (TC-TVL-10)', () => {
  const tab = (pageId, name, kind = 'table') => ({ pageId, name, kind })
  const base = serializeToolValidations(parseToolValidations(fileWith([], { tabs: [tab('a', 'A'), tab('b', 'B'), tab('c', 'C')] })).file)
  const file = parseToolValidations(base).file
  // Mine: B renamed and D added; theirs: C removed and A moved after B.
  const mine = serializeToolValidations(addTab(renameTab(file, 'b', 'Bee'), tab('d', 'D', 'dashboard')))
  const theirs = serializeToolValidations(moveTab(removeTab(file, 'c'), 'a', 1))
  const merged = parseToolValidations(mergeToolValidationsText(base, mine, theirs, false)).file
  assert.deepEqual(merged.tabs.map((entry) => `${entry.pageId}:${entry.name}`), ['b:Bee', 'a:A', 'd:D'], 'theirs is later: their order; my rename and my new tab kept (after the others); their removal kept')
  const mineLater = parseToolValidations(mergeToolValidationsText(base, mine, theirs, true)).file
  assert.deepEqual(mineLater.tabs.map((entry) => entry.pageId), ['a', 'b', 'd'], 'mine is later: my order; C stays removed')
  // Only one side touched the tabs: its change is taken, the other side's tools kept.
  const tools = serializeToolValidations(saveTool(file, { name: 'JMP', version: '17', validationDate: '', validityMonths: '', dueDate: '', notes: '' }, at, 'me'))
  const both = parseToolValidations(mergeToolValidationsText(base, tools, theirs, true)).file
  assert.deepEqual([both.tabs.map((entry) => entry.pageId), both.tools.map((entry) => entry.name)], [['b', 'a'], ['JMP']])
  // A file read without tabs merged with a save that added one: the added tab stays.
  const older = serializeToolValidations(parseToolValidations(fileWith([])).file)
  const added = serializeToolValidations(addTab(parseToolValidations(older).file, tab('x', 'X')))
  assert.deepEqual(parseToolValidations(mergeToolValidationsText(older, older, added, true)).file.tabs.map((entry) => entry.pageId), ['x'])
})

test('TVL-24: the hidden pages that can be made a tab again — hidden from the menu, not a tab yet, no sample pages; a page made a tab leaves the list (TC-TVL-21)', async () => {
  const { emptyLayout, placePage } = await import('../src/menuLayout.ts')
  const { hiddenPageChoices } = await import('../src/toolValidations.ts')
  let layout = emptyLayout()
  layout = placePage(layout, 'old-actions', { type: 'table', hidden: true })
  layout = placePage(layout, 'old-dash', { type: 'dashboard', hidden: true })
  layout = placePage(layout, 'in-menu', { type: 'table' })
  layout = placePage(layout, 'tab-page', { type: 'table', hidden: true })
  layout = placePage(layout, 'sample-page', { type: 'table', hidden: true })
  const pages = [
    { id: 'old-dash', name: 'Tool dashboard', rows: [] }, { id: 'old-actions', name: 'Actions', rows: [{}, {}] },
    { id: 'in-menu', name: 'In the menu', rows: [] }, { id: 'tab-page', name: 'Checklist', rows: [] }, { id: 'sample-page', name: 'Sample', rows: [], sample: true },
    { id: 'never-placed', name: 'Never placed', rows: [] },
  ]
  let file = addTab(parseToolValidations(fileWith([])).file, { pageId: 'tab-page', name: 'Checklist', kind: 'table' })
  assert.deepEqual(hiddenPageChoices(pages, layout, file), [{ id: 'old-actions', name: 'Actions', kind: 'table', rows: 2 }, { id: 'old-dash', name: 'Tool dashboard', kind: 'dashboard', rows: 0 }], 'hidden, not a tab, not a sample page, by name')
  file = addTab(file, { pageId: 'old-actions', name: 'Actions', kind: 'table' })
  assert.deepEqual(hiddenPageChoices(pages, layout, file).map((choice) => choice.id), ['old-dash'], 'once a tab, it leaves the list')
  assert.deepEqual(file.tabs.map((tab) => tab.pageId), ['tab-page', 'old-actions'], 'added as the last of the owners’ tabs')
})

test('TVL-25: the list’s co-owners written as co-owners of each tab page — merged with those added by hand, only those the list wrote taken off again; kept in menu-layout.json, merged as sets (TC-TVL-22)', async () => {
  const { emptyLayout, mergeMenuLayoutText, parseMenuLayout, placePage, serializeMenuLayout, withListOwners, pageRights, canBuildDashboard } = await import('../src/menuLayout.ts')
  const { tabOwnerCounts, tabOwnersBehind, tabOwnersLayout } = await import('../src/toolValidations.ts')
  let layout = emptyLayout()
  layout = placePage(layout, 'checklist', { type: 'table', hidden: true, owners: ['hand@x.com'] })
  layout = placePage(layout, 'tool-dash', { type: 'dashboard', hidden: true })
  layout = placePage(layout, 'other', { type: 'table', owners: ['z@x.com'] })
  let file = setTeam(parseToolValidations(fileWith([])).file, 60, ['ana@x.com', 'ben@x.com', 'hand@x.com'])
  file = addTab(addTab(file, { pageId: 'checklist', name: 'Checklist', kind: 'table' }), { pageId: 'tool-dash', name: 'Tool dashboard', kind: 'dashboard' })
  assert.deepEqual(tabOwnersBehind(layout, file).map((tab) => tab.pageId), ['checklist', 'tool-dash'], 'both pages not in line yet')
  layout = tabOwnersLayout(layout, file)
  assert.deepEqual(layout.pages.checklist.owners, ['hand@x.com', 'ana@x.com', 'ben@x.com'], 'the list’s co-owners added; the one added by hand kept')
  assert.deepEqual(layout.pages.checklist.ownersFromList, ['ana@x.com', 'ben@x.com'], 'an owner already there by hand stays “by hand”')
  assert.deepEqual([layout.pages['tool-dash'].owners, layout.pages['tool-dash'].ownersFromList], [['ana@x.com', 'ben@x.com', 'hand@x.com'], ['ana@x.com', 'ben@x.com', 'hand@x.com']])
  assert.deepEqual(layout.pages.other.owners, ['z@x.com'], 'a page that is not a tab is not touched')
  assert.deepEqual(tabOwnersBehind(layout, file), [], 'in line')
  assert.deepEqual(tabOwnerCounts(layout, 'checklist'), { fromList: 2, byHand: 1 })
  // The rights of the page (PGB-10) follow: a list co-owner may set up the Table and build the dashboard anywhere.
  const viewer = (email) => ({ email, can: () => false, readOnly: false, manager: false })
  assert.deepEqual(pageRights(viewer('ben@x.com'), layout, 'checklist'), { setup: true, rows: true, owner: true })
  assert.equal(canBuildDashboard(viewer('ben@x.com'), layout, 'tool-dash'), true)
  // Someone adds a co-owner to the page by hand; the list loses Ben and Hand and gains Cy.
  layout = placePage(layout, 'checklist', { owners: [...layout.pages.checklist.owners, 'dee@x.com'] })
  assert.deepEqual(layout.pages.checklist.ownersFromList, ['ana@x.com', 'ben@x.com'], 'a page save keeps what the list wrote')
  file = setTeam(file, 60, ['ana@x.com', 'cy@x.com'])
  layout = tabOwnersLayout(layout, file)
  assert.deepEqual(layout.pages.checklist.owners, ['hand@x.com', 'ana@x.com', 'dee@x.com', 'cy@x.com'], 'Ben (written by the list) removed; Hand and Dee (by hand) stay; Cy added')
  assert.deepEqual(layout.pages['tool-dash'].owners, ['ana@x.com', 'cy@x.com'], 'on the dashboard page Hand came from the list and goes')
  assert.equal(pageRights(viewer('ben@x.com'), layout, 'checklist').owner, false, 'Ben has no page rights any more')
  // The tab removed (page kept): every owner the list wrote is taken off, those by hand stay.
  const off = withListOwners(layout, 'checklist', [])
  assert.deepEqual([off.pages.checklist.owners, off.pages.checklist.ownersFromList], [['hand@x.com', 'dee@x.com'], undefined])
  assert.equal(withListOwners(layout, 'missing', ['a@x.com']), layout, 'a page without a place is left alone')
  // The file: ownersFromList written only when there are some, only those still owners; a layout without them unchanged.
  const text = serializeMenuLayout(layout)
  assert.deepEqual(parseMenuLayout(text).pages.checklist.ownersFromList, ['ana@x.com', 'cy@x.com'])
  assert.ok(!serializeMenuLayout(placePage(emptyLayout(), 'p', { owners: ['a@x.com'] })).includes('ownersFromList'))
  const odd = JSON.parse(text); odd.pages.checklist.ownersFromList = ['ana@x.com', 'stranger@x.com', 'not an email']
  assert.deepEqual(parseMenuLayout(JSON.stringify(odd)).pages.checklist.ownersFromList, ['ana@x.com'], 'only owners of the page')
  // GIT-17: merged as sets — the list's sync on one side, an owner added by hand on the other.
  const base = text
  const mine = serializeMenuLayout(tabOwnersLayout(parseMenuLayout(base), setTeam(file, 60, ['ana@x.com'])))
  const theirs = serializeMenuLayout(placePage(parseMenuLayout(base), 'checklist', { owners: [...parseMenuLayout(base).pages.checklist.owners, 'eve@x.com'] }))
  const merged = parseMenuLayout(mergeMenuLayoutText(base, mine, theirs, true)).pages.checklist
  assert.deepEqual([merged.owners.sort(), merged.ownersFromList], [['ana@x.com', 'dee@x.com', 'eve@x.com', 'hand@x.com'], ['ana@x.com']], 'Cy (written by the list) removed, Eve (by hand) kept')
})

test('TVL-27, TVL-28: due date highlights — the narrowest band that holds a tool wins, an overdue tool in the first band, no due date never; the default bands until saved, an empty list none (TC-TVL-24)', () => {
  const today = '2026-11-24'
  const bands = [{ days: 90, colour: 'yellow' }, { days: 0, colour: 'red' }, { days: 30, colour: 'amber' }]
  assert.deepEqual(sortBands(bands).map((band) => band.days), [0, 30, 90], 'sorted by days')
  assert.equal(bandFor(bands, '2026-11-14', today).colour, 'red', 'overdue: the band with the fewest days')
  assert.equal(bandFor(bands, today, today).colour, 'red', 'due today: days 0')
  assert.equal(bandFor(bands, '2026-11-25', today).colour, 'amber', 'tomorrow: within 30 days')
  assert.equal(bandFor(bands, '2026-12-24', today).colour, 'amber', '30 days left: within 30 days (≤)')
  assert.equal(bandFor(bands, '2026-12-25', today).colour, 'yellow', '31 days left: within 90 days')
  assert.equal(bandFor(bands, '2027-02-22', today).colour, 'yellow', '90 days left')
  assert.equal(bandFor(bands, '2027-02-23', today), undefined, 'later than every band: not highlighted')
  assert.equal(bandFor(bands, undefined, today), undefined, 'no due date: never highlighted')
  assert.equal(bandFor([{ days: 30, colour: 'blue' }], '2026-10-01', today).colour, 'blue', 'without a 0 band an overdue tool is in the first band')
  assert.equal(bandFor([], '2026-10-01', today), undefined, 'no bands: nothing highlighted')
  assert.deepEqual([bandLabel({ days: 0 }), bandLabel({ days: 1 }), bandLabel({ days: 30 }), bandShort({ days: 0 }), bandShort({ days: 30 })], ['Overdue or due today', 'Due within 1 day', 'Due within 30 days', 'Overdue / today', '≤ 30 days'])
  const tools = [tool('A', '1', { dueDate: '2026-11-01' }), tool('B', '1', { dueDate: '2026-12-01' }), tool('C', '1', { validationDate: '2025-01-15', validityMonths: 24 }), tool('D', '1'), tool('E', '1', { dueDate: '2030-01-01' })]
  assert.deepEqual(bandCounts(bands, tools, today).map(({ band, count }) => `${band.days}:${count}`), ['0:1', '30:1', '90:1'], 'C is due 2027-01-15 (validation date + period): within 90 days')
  // TVL-06 with TVL-28: a tool with only a validation date is banded by its default due date (validation date + 24 months).
  const defaulted = tool('F', '1', { validationDate: '2024-12-01' })
  assert.deepEqual(dueOf(defaulted), { due: '2026-12-01', from: 'default' })
  assert.equal(bandFor(bands, dueOf(defaulted).due, today).colour, 'amber', 'due 2026-12-01 (default): within 30 days')
  assert.deepEqual(bandCounts(bands, [...tools, defaulted], today).map(({ band, count }) => `${band.days}:${count}`), ['0:1', '30:2', '90:1'], 'the defaulted due date counted in its band')

  // The file: no `highlights` → the defaults, not written; saved → written sorted; an empty list → none, written as [].
  const plain = parseToolValidations(fileWith([])).file
  assert.equal(plain.highlights, undefined)
  assert.deepEqual(bandsOf(plain), defaultHighlights)
  assert.deepEqual(defaultHighlights, [{ days: 0, colour: 'red' }, { days: 30, colour: 'amber' }, { days: 90, colour: 'yellow' }])
  assert.equal('highlights' in JSON.parse(serializeToolValidations(plain)), false, 'a file without bands stays as it was')
  const saved = setHighlights(plain, [{ days: 60, colour: 'orange' }, { days: 7, colour: 'red' }])
  const round = parseToolValidations(serializeToolValidations(saved))
  assert.deepEqual(round.file.highlights, [{ days: 7, colour: 'red' }, { days: 60, colour: 'orange' }])
  assert.deepEqual(round.refused, [])
  const none = parseToolValidations(serializeToolValidations(setHighlights(plain, []))).file
  assert.deepEqual([none.highlights, bandsOf(none), JSON.parse(serializeToolValidations(none)).highlights], [[], [], []], 'every band removed: no highlighting, kept as []')

  // The strict reader: a bad band, an unknown colour, the same days twice or more than 10 refused with why; the others used.
  const bad = parseToolValidations(fileWith([], { highlights: [{ days: 30, colour: 'amber' }, { days: -1, colour: 'red' }, { days: 1.5, colour: 'red' }, { days: 4000, colour: 'red' }, { days: 10, colour: '#ff0000' }, { days: 30, colour: 'red' }, 'x'] }))
  assert.deepEqual(bad.file.highlights, [{ days: 30, colour: 'amber' }])
  assert.deepEqual(bad.refused.map((entry) => `${entry.name}: ${entry.reason}`), [
    'Highlight “-1 days”: days “-1” is not a whole number from 0 to 3650',
    'Highlight “1.5 days”: days “1.5” is not a whole number from 0 to 3650',
    'Highlight “4000 days”: days “4000” is not a whole number from 0 to 3650',
    'Highlight “10 days”: unknown colour “#ff0000”',
    'Highlight “30 days”: 30 days is a band twice',
    'Highlight “? days”: not an object',
  ])
  const eleven = parseToolValidations(fileWith([], { highlights: Array.from({ length: 11 }, (_, index) => ({ days: index * 10, colour: 'grey' })) }))
  assert.equal(eleven.file.highlights.length, maxHighlights)
  assert.match(eleven.refused[0].reason, /more than 10 bands/)
  assert.match(parseToolValidations(fileWith([], { highlights: 'red' })).refused[0].reason, /not a list of bands/)

  // The Setup pop-up's check.
  assert.equal(highlightsProblem([{ days: '0', colour: 'red' }, { days: '30', colour: 'amber' }]), '')
  assert.match(highlightsProblem([{ days: '', colour: 'red' }]), /whole number from 0 to 3650/)
  assert.match(highlightsProblem([{ days: '-5', colour: 'red' }]), /whole number from 0 to 3650/)
  assert.match(highlightsProblem([{ days: '5', colour: 'pink' }]), /Choose a colour/)
  assert.match(highlightsProblem([{ days: '5', colour: 'red' }, { days: 5, colour: 'blue' }]), /Two bands have 5 days/)
  assert.match(highlightsProblem(Array.from({ length: 11 }, (_, index) => ({ days: index, colour: 'red' }))), /At most 10 bands/)
  assert.equal(highlightColours.length, 8)
})

test('GIT-17, TVL-27: two saves of the highlight bands merged as one value — the later save wins; a save that did not touch them keeps the other one’s (TC-TVL-24)', () => {
  const base = serializeToolValidations(parseToolValidations(fileWith([tool('Minitab', '21')])).file)
  const file = parseToolValidations(base).file
  const mine = serializeToolValidations(setHighlights(file, [{ days: 14, colour: 'red' }]))
  const theirs = serializeToolValidations(setHighlights(file, [{ days: 45, colour: 'blue' }]))
  assert.deepEqual(parseToolValidations(mergeToolValidationsText(base, mine, theirs, true)).file.highlights, [{ days: 14, colour: 'red' }], 'mine is later')
  assert.deepEqual(parseToolValidations(mergeToolValidationsText(base, mine, theirs, false)).file.highlights, [{ days: 45, colour: 'blue' }], 'theirs is later')
  const tools = serializeToolValidations(saveTool(file, { name: 'JMP', version: '17', validationDate: '', validityMonths: '', dueDate: '', notes: '' }, at, 'me'))
  const both = parseToolValidations(mergeToolValidationsText(base, tools, theirs, true)).file
  assert.deepEqual([both.highlights, both.tools.map((entry) => entry.name)], [[{ days: 45, colour: 'blue' }], ['JMP', 'Minitab']], 'only they changed the bands: theirs kept, my tool kept')
  const cleared = serializeToolValidations(setHighlights(file, []))
  assert.deepEqual(parseToolValidations(mergeToolValidationsText(base, cleared, tools, true)).file.highlights, [], 'every band removed stays removed')
  assert.equal(parseToolValidations(mergeToolValidationsText(base, tools, base, true)).file.highlights, undefined, 'nobody set them: still the defaults')
})

// TVL-29, TVL-30: tools from Azure DevOps — dated by the completion date, changed only there.
const item = (id, title, areaPath, dates = {}, fields = {}) => ({ ...doc(id, areaPath, 'DHP\\Release 1', title, fields), ...dates })
const withSources = (tools) => parseToolValidations(fileWith(tools, { sources: [
  { id: 'stream', kind: 'stream', name: 'Tool Validations', mapping: { periodUnit: 'months', confirmed: false } },
  { id: 'other-query', kind: 'azure', name: 'Lab tools query', ref: 'conn-2', mapping: { name: '@title', periodUnit: 'months', confirmed: true } },
  { id: 'tools-export', kind: 'windchill', name: 'Tools export', ref: 'view-1', mapping: { name: 'Tool', periodUnit: 'months', confirmed: true } },
] })).file

test('TVL-29: a tool from Azure DevOps takes the completion date as its validation date — a mapped Validation date wins; due = + 24 months unless the source gives a period or a due date (TC-TVL-26)', () => {
  const items = [
    item(1, 'Minitab 21 Validation', 'DHP\\Tool Validations\\Minitab', { changedDate: '2025-03-10T08:00:00Z', closedDate: '2025-01-05T08:00:00Z' }, { 'Custom.ValidatedOn': '2024-12-01' }),
    item(2, 'Python 3.11 Validation', 'DHP\\Tool Validations\\Python', { changedDate: '2025-04-20T08:00:00Z' }, { 'Custom.Period': '12', 'Microsoft.VSTS.Scheduling.DueDate': '2026-01-31T00:00:00Z' }),
  ]
  const options = azureFieldOptions(items)
  assert.ok(options.some(([key]) => key === '@completion'), 'the completion date is offered as a field')
  const guessed = guessMapping('stream', options)
  assert.equal(guessed.validationDate, '@completion', 'the guess for an Azure DevOps source: the completion date')
  // The default completion field: Changed Date.
  const read = azureInputs(items, { ...guessed, dueDate: undefined }, [], undefined)
  assert.deepEqual(read.map((input) => [input.name, input.validationDate]), [['Minitab', '2025-03-10'], ['Python', '2025-04-20']])
  assert.deepEqual(dueOf({ ...read[0], manual: [] }), { due: '2027-03-10', from: 'default' }, 'completion date + 24 months')
  assert.equal(dueFromText('default', true), 'completion date + 24 months (default)')
  assert.equal(dueFromText('calculated', true), 'completion date + validity period')
  assert.equal(dueFromText('default', false), 'validation date + 24 months (default)')
  // The field chosen in Stream mapping (TVL-20) reaches the read; an empty Validation date mapping reads it too.
  assert.equal(azureInputs(items, { ...guessed, validationDate: undefined }, [], 'Microsoft.VSTS.Common.ClosedDate')[0].validationDate, '2025-01-05')
  // A mapped Validation date wins — decided per source: a row without it has no validation date.
  const mapped = azureInputs(items, { ...guessed, validationDate: 'Custom.ValidatedOn', dueDate: undefined }, [], undefined)
  assert.deepEqual(mapped.map((input) => input.validationDate), ['2024-12-01', undefined])
  // A period or a due date of the source still wins over the default.
  const sourced = azureInputs(items, { ...guessed, validityPeriod: 'Custom.Period' }, [], undefined)
  assert.deepEqual(dueOf({ ...sourced[1], manual: [] }), { due: '2026-01-31', from: 'source' })
  assert.deepEqual(dueOf({ ...azureInputs(items, { ...guessed, validityPeriod: 'Custom.Period', dueDate: undefined }, [], undefined)[1], manual: [] }), { due: '2026-04-20', from: 'calculated' })
  // Appended to the master list as source values are (written to the file), and shown as the completion date.
  let file = mergeSource(withSources([]), streamSourceId, read, at).file
  const minitab = file.tools.find((entry) => entry.name === 'Minitab')
  assert.equal(minitab.validationDate, '2025-03-10')
  assert.match(serializeToolValidations(file), /"validationDate": "2025-03-10"/)
  assert.equal(completionDated(file, minitab), true)
  // A later edit of the work item (Changed Date) moves the date, and the due date with it.
  file = mergeSource(file, streamSourceId, azureInputs([{ ...items[0], changedDate: '2025-09-01T08:00:00Z' }, items[1]], { ...guessed, dueDate: undefined }, [], undefined), at).file
  assert.equal(dueOf(file.tools.find((entry) => entry.name === 'Minitab')).due, '2027-09-01')
  // Not the completion date: a source mapping another field, a Windchill export, a date entered by hand.
  assert.equal(completionDated(setMapping(file, streamSourceId, { ...guessed, validationDate: 'Custom.ValidatedOn' }), minitab), false)
  assert.equal(completionDated(file, { ...minitab, sources: { 'tools-export': { inSource: true } } }), false)
  assert.equal(completionDated(file, { ...minitab, manual: ['validationDate'] }), false)
})

test('TVL-30: a tool from Azure DevOps cannot be edited (but its notes) or removed here — Remove allowed once it is not in the source; hand and Windchill tools unchanged; a hand-added duplicate is refused (TC-TVL-27)', () => {
  let file = withSources([
    tool('Minitab', '21', { validationDate: '2025-03-10' }),
    tool('LabVIEW', '2020', { sources: { 'other-query': { inSource: true } } }),
    tool('JMP', '17', { sources: { 'tools-export': { inSource: true } } }),
    tool('Excel', '', { sources: {}, dueDate: '2099-01-01', manual: ['dueDate'] }),
  ])
  const find = (name) => file.tools.find((entry) => entry.name === name)
  assert.deepEqual(azureLock(file, find('Minitab')), { edit: 'Comes from Azure DevOps (Tool Validations query): change it there.', remove: 'Comes from Azure DevOps (Tool Validations query): change it there; it can be removed here once Azure DevOps no longer returns it.' })
  assert.equal(azureLock(file, find('LabVIEW')).edit, 'Comes from Azure DevOps (Lab tools query): change it there.', 'another Azure DevOps query too')
  assert.deepEqual(azureLock(file, find('JMP')), { edit: '', remove: '' }, 'a Windchill tool is unchanged')
  assert.deepEqual(azureLock(file, find('Excel')), { edit: '', remove: '' }, 'a tool added by hand is unchanged')
  // The logic refuses, not only the buttons.
  const minitab = find('Minitab')
  assert.equal(editProblem(file, { ...editOf(minitab), dueDate: '2099-01-01', notes: 'mine' }, minitab.key), 'Comes from Azure DevOps (Tool Validations query): change it there.')
  assert.equal(saveTool(file, { ...editOf(minitab), dueDate: '2099-01-01' }, at, 'me', minitab.key), file)
  for (const change of [{ validationDate: '2020-01-01' }, { validityMonths: '36' }, { name: 'Minitab Pro' }, { version: '22' }]) {
    assert.match(editProblem(file, { ...editOf(minitab), ...change, notes: 'mine' }, minitab.key), /^Comes from Azure DevOps/, JSON.stringify(change))
    assert.equal(saveTool(file, { ...editOf(minitab), ...change, notes: 'mine' }, at, 'me', minitab.key), file, JSON.stringify(change))
  }
  // Its notes are changed here (the product owner's answer): only the notes, with who and when.
  assert.equal(editProblem(file, { ...editOf(minitab), notes: 'Re-check the macro library' }, minitab.key), '')
  const noted = saveTool(file, { ...editOf(minitab), notes: '  Re-check the macro library ' }, at, 'Diya Sharma', minitab.key).tools.find((entry) => entry.name === 'Minitab')
  assert.deepEqual([noted.notes, noted.validationDate, noted.manual, noted.changedBy, noted.sources], ['Re-check the macro library', '2025-03-10', [], 'Diya Sharma', { stream: { inSource: true } }])
  assert.equal(saveTool(file, { ...editOf(minitab), notes: '' }, at, 'me', minitab.key), file, 'no change: the same file')
  assert.equal(removeTool(file, minitab.key), file)
  assert.equal(removeTool(file, find('LabVIEW').key), file)
  assert.equal(saveTool(file, { ...editOf(find('JMP')), notes: 'checked' }, at, 'me', find('JMP').key).tools.find((entry) => entry.name === 'JMP').notes, 'checked')
  assert.equal(removeTool(file, find('Excel').key).tools.length, 3)
  // Added by hand with the name and version of an Azure DevOps tool: matched (TVL-03), refused — never a second entry.
  const twin = { name: 'mini-tab', version: 'v21.0', validationDate: '', validityMonths: '', dueDate: '2099-01-01', notes: '' }
  assert.equal(editProblem(file, twin), 'This tool and version is already in the master list. Comes from Azure DevOps (Tool Validations query): change it there.')
  assert.equal(saveTool(file, twin, at, 'me'), file)
  // Gone from the query: Remove allowed (normal rights), Edit still locked.
  file = mergeSource(file, streamSourceId, [{ name: 'Excel', version: '', validationDate: '2025-01-01' }], at).file
  assert.equal(entryState(find('Minitab')), 'gone')
  assert.deepEqual(azureLock(file, find('Minitab')), { edit: 'Comes from Azure DevOps (Tool Validations query): change it there.', remove: '' })
  assert.equal(removeTool(file, find('Minitab').key).tools.some((entry) => entry.name === 'Minitab'), false)
  // A tool added by hand that the query brings later: the query's values replace the hand ones, and it is locked.
  const excel = find('Excel')
  assert.deepEqual([excel.validationDate, excel.dueDate, excel.manual], ['2025-01-01', undefined, []], 'the due date entered by hand cannot hide the expiry')
  assert.deepEqual(dueOf(excel), { due: '2027-01-01', from: 'default' })
  assert.match(azureLock(file, excel).edit, /^Comes from Azure DevOps/)
})

// TVL-32: the category of a source — Tool List (feeds the master list) or Validation Documents (its own tab only).
const register = (extra = {}) => ({ id: 'register', kind: 'ondemand', name: 'Register', ref: 'page-1', mapping: { periodUnit: 'months', confirmed: true, name: 'c-tool' }, ...extra })
const withCategorySources = (sources, tools = []) => JSON.stringify({ schema: 1, kind: 'tool-validations', defaultDays: 60, owners: [], sources: [{ id: 'stream', kind: 'stream', name: 'Tool Validations', mapping: { periodUnit: 'months', confirmed: false } }, ...sources], tools })

test('TVL-32: the category of a source read and written — "tools" or "documents"; none reads as Tool List; an unknown value refused; the Tool Validations query always a Tool List (TC-TVL-29)', () => {
  assert.deepEqual(sourceCategories.map((entry) => [entry.key, entry.label]), [['tools', 'Tool List'], ['documents', 'Validation Documents']])
  const parsed = parseToolValidations(withCategorySources([register(), register({ id: 'docs', name: 'Docs', ref: 'page-2', category: 'documents' }), register({ id: 'list', name: 'List', ref: 'page-3', category: 'tools' })]))
  assert.deepEqual(parsed.refused, [])
  assert.deepEqual(parsed.file.sources.map((source) => [source.id, source.category, categoryOf(source), feedsMasterList(source)]), [['stream', undefined, 'tools', true], ['register', undefined, 'tools', true], ['docs', 'documents', 'documents', false], ['list', 'tools', 'tools', true]], 'no category: a Tool List, as before')
  const written = JSON.parse(serializeToolValidations(parsed.file))
  assert.deepEqual(written.sources.map((source) => source.category), [undefined, undefined, 'documents', 'tools'], 'written only when set — a file from before TVL-32 stays as it was')
  assert.deepEqual(Object.keys(written.sources[2]).slice(0, 4), ['id', 'kind', 'name', 'category'])
  assert.equal(serializeToolValidations(parseToolValidations(serializeToolValidations(parsed.file)).file), serializeToolValidations(parsed.file), 'round trip')
  const strict = parseToolValidations(withCategorySources([register({ category: 'signed' }), register({ id: 'other', name: 'Other', ref: 'page-4', category: 7 })]))
  assert.deepEqual(strict.refused.map((entry) => entry.name), ['Source “Register”', 'Source “Other”'])
  assert.match(strict.refused[0].reason, /^unknown category “signed”/)
  assert.deepEqual(strict.file.sources.map((source) => source.id), ['stream'], 'a source with an unknown category is not used')
  const stream = parseToolValidations(JSON.stringify({ schema: 1, kind: 'tool-validations', sources: [{ id: 'stream', kind: 'stream', name: 'Tool Validations', category: 'documents', mapping: {} }], tools: [] }))
  assert.match(stream.refused[0].reason, /always a Tool List/)
  assert.deepEqual([categoryLabel('tools'), categoryLabel('documents'), categoryProblem(''), categoryProblem('documents')], ['Tool List', 'Validation Documents', 'Choose the category: Tool List or Validation Documents.', ''])
  const added = addSource(emptyFile(), { kind: 'ondemand', name: 'Signed register', ref: 'page-9', mapping: { periodUnit: 'months', confirmed: false }, category: 'documents' })
  assert.equal(added.sources[1].category, 'documents', 'the category asked when the source is added is stored')
})

test('TVL-32: a Validation Documents source never adds to or updates the master list; changed to it, the tools it fed stay, "not in source now" (TC-TVL-29)', () => {
  const docs = parseToolValidations(withCategorySources([register({ category: 'documents' })], [tool('Minitab', '21', { validationDate: '2025-01-01' })])).file
  const result = mergeSource(docs, 'register', [{ name: 'Polyspace', version: 'R2024a', dueDate: '2027-01-01' }, { name: 'Minitab', version: '21', validationDate: '2026-02-01' }], at)
  assert.deepEqual([result.added, result.updated, result.gone], [[], [], []], 'nothing added, nothing updated')
  assert.equal(result.file, docs, 'the master list unchanged')
  // A Tool List source feeds it: Polyspace appended, Minitab linked.
  const list = parseToolValidations(withCategorySources([register()], [tool('Minitab', '21', { validationDate: '2025-01-01' })])).file
  const fed = mergeSource(list, 'register', [{ name: 'Polyspace', version: 'R2024a' }, { name: 'Minitab', version: '21' }], at)
  assert.deepEqual([fed.added, fed.updated], [['Polyspace'], ['Minitab']])
  // Changed to Validation Documents: its tools stay, marked not in source now for it; nothing deleted.
  const changed = setCategory(fed.file, 'register', 'documents', at)
  assert.deepEqual(changed.gone.sort(), ['Minitab', 'Polyspace'])
  assert.deepEqual(changed.file.tools.map((entry) => [entry.name, entry.sources.register]), [['Minitab', { inSource: false }], ['Polyspace', { inSource: false }]])
  assert.deepEqual(changed.file.tools.find((entry) => entry.name === 'Minitab').sources.stream, { inSource: true }, 'the links to other sources unchanged')
  assert.equal(entryState(changed.file.tools.find((entry) => entry.name === 'Polyspace')), 'gone', '"Not in source now"')
  assert.equal(changed.file.sources.find((source) => source.id === 'register').category, 'documents')
  // Back to Tool List: linked again at its next merge.
  const back = setCategory(changed.file, 'register', 'tools', at)
  assert.deepEqual([back.gone, back.file.sources.find((source) => source.id === 'register').category], [[], 'tools'])
  assert.deepEqual(mergeSource(back.file, 'register', [{ name: 'Polyspace', version: 'R2024a' }], at).file.tools.find((entry) => entry.name === 'Polyspace').sources.register, { inSource: true })
  assert.equal(setCategory(fed.file, streamSourceId, 'documents', at).file, fed.file, 'the Tool Validations query stays a Tool List')
  assert.equal(setCategory(changed.file, 'register', 'documents', at).file, changed.file, 'unchanged: the same file')
})

test('GIT-17, TVL-32: two saves merged — a category changed in one save and a tool added in the other both kept; both changed: the later save (TC-TVL-29)', () => {
  const base = withCategorySources([register()], [tool('Minitab', '21')])
  const mine = withCategorySources([register({ category: 'documents' })], [tool('Minitab', '21')])
  const theirs = withCategorySources([register()], [tool('Minitab', '21'), tool('JMP', '17')])
  const merged = parseToolValidations(mergeToolValidationsText(base, mine, theirs, true)).file
  assert.deepEqual([merged.sources.find((source) => source.id === 'register').category, merged.tools.map((entry) => entry.name)], ['documents', ['JMP', 'Minitab']])
  const theirsList = withCategorySources([register({ category: 'tools', name: 'Register list' })], [tool('Minitab', '21')])
  assert.equal(parseToolValidations(mergeToolValidationsText(base, mine, theirsList, false)).file.sources.find((source) => source.id === 'register').category, 'tools', 'the later save wins')
  assert.equal(parseToolValidations(mergeToolValidationsText(base, mine, theirsList, true)).file.sources.find((source) => source.id === 'register').category, 'documents')
})

test('TVL-34: ID, Used by, Validated and Type guessed by column name — System.Id, Source, State, Type (else the work item type); editable, None kept; Azure DevOps sources only (TC-TVL-32)', () => {
  const options = (...refs) => refs.map((ref) => [ref, ref])
  assert.deepEqual(guessAzureFields(options('System.Id', 'Custom.Source', 'System.State', 'Custom.Type', 'System.WorkItemType')), { id: 'System.Id', usedBy: 'Custom.Source', validated: 'System.State', type: 'Custom.Type' })
  assert.deepEqual(guessAzureFields(options('System.State', 'Custom.State', 'System.WorkItemType')), { id: 'System.Id', validated: 'Custom.State', type: 'System.WorkItemType' }, 'a custom column wins; no Type column: the work item type')
  assert.deepEqual(guessAzureFields([['Custom.UsedBySource', 'Source']]), { id: 'System.Id', usedBy: 'Custom.UsedBySource' }, 'by the column’s display name too')
  assert.deepEqual(guessAzureFields([]), { id: 'System.Id' })
  assert.equal(guessMapping('windchill', options('Source', 'State', 'Type')).usedBy, undefined, 'a Windchill export or a page gives none')
  // Read with the mapping: the work item's ID, the columns' values (spaces folded).
  const items = [doc(41, 'DHP\\Tool Validations\\Minitab', 'DHP\\Release 21', 'Minitab 21', { 'Custom.Source': '  Lab   A ', 'System.State': 'Validated', 'Custom.Type': 'Statistics' })]
  const mapping = guessMapping('stream', azureFieldOptions(items))
  assert.deepEqual(azureInputs(items, mapping).map(({ id, usedBy, validated, type }) => ({ id, usedBy, validated, type })), [{ id: 41, usedBy: 'Lab A', validated: 'Validated', type: 'Statistics' }])
  // None chosen in Edit mapping is saved as "@none" and read as not mapped; it is not guessed again.
  const file = setMapping(emptyFile(), streamSourceId, { ...mapping, type: noField })
  assert.equal(mappingFor(file.sources[0], azureFieldOptions(items)).type, noField)
  assert.equal(mapped(mappingFor(file.sources[0], azureFieldOptions(items)), 'type'), undefined)
  assert.equal(azureInputs(items, file.sources[0].mapping)[0].type, undefined)
  assert.deepEqual(parseToolValidations(serializeToolValidations(file)).file.sources[0].mapping, { ...mapping, type: noField, confirmed: true }, 'the mapping round trip')
})

test('TVL-34: the four values kept in tool-validations.json — read strictly, written, merged from Azure DevOps (Azure wins, a blank never clears) and in two saves (GIT-17) (TC-TVL-32)', () => {
  const read = parseToolValidations(fileWith([
    tool('Minitab', '21', { id: 41, usedBy: 'Lab A', validated: 'Validated', type: 'Statistics' }),
    tool('JMP', '17', { id: '42' }),
    tool('Bad', '1', { id: -3 }), tool('Worse', '1', { usedBy: 7 }), tool('Long', '1', { type: 'x'.repeat(201) }),
  ]))
  assert.deepEqual(read.file.tools.map(({ name, id, usedBy, validated, type }) => ({ name, id, usedBy, validated, type })), [{ name: 'JMP', id: 42, usedBy: undefined, validated: undefined, type: undefined }, { name: 'Minitab', id: 41, usedBy: 'Lab A', validated: 'Validated', type: 'Statistics' }])
  assert.deepEqual(read.refused.map((entry) => `${entry.name}: ${entry.reason}`), ['Bad: its ID “-3” is not an Azure DevOps work item ID', 'Worse: its Used by is not a text of 1 to 200 characters', 'Long: its Type is not a text of 1 to 200 characters'])
  const text = serializeToolValidations(read.file)
  assert.deepEqual(Object.keys(JSON.parse(text).tools.find((entry) => entry.name === 'Minitab')), ['name', 'version', 'id', 'usedBy', 'validated', 'type', 'sources', 'addedAt'], 'written after the dates, in a fixed order')
  assert.equal(serializeToolValidations(parseToolValidations(text).file), text, 'round trip')
  // Merged from the Tool Validations query: Azure DevOps wins; a blank does not clear; another kind of source gives none.
  const merged = mergeSource(read.file, streamSourceId, [{ name: 'Minitab', version: '21', id: 41, validated: 'Retired' }, { name: 'Python', version: '3.11', id: 43, type: 'Language' }], at).file
  assert.deepEqual(merged.tools.filter((entry) => entry.name !== 'JMP').map(({ name, id, usedBy, validated, type }) => ({ name, id, usedBy, validated, type })), [{ name: 'Minitab', id: 41, usedBy: 'Lab A', validated: 'Retired', type: 'Statistics' }, { name: 'Python', id: 43, usedBy: undefined, validated: undefined, type: 'Language' }])
  const withWindchill = addSource(merged, { kind: 'windchill', name: 'Windchill tools', ref: 'wc-1', mapping: guessMapping('windchill', []), category: 'tools' })
  const fromWindchill = mergeSource(withWindchill, 'windchill-tools', [{ name: 'Excel', version: '365', id: 99, type: 'Spreadsheet' }], at).file
  assert.deepEqual(['id', 'type'].map((key) => fromWindchill.tools.find((entry) => entry.name === 'Excel')[key]), [undefined, undefined], 'only Azure DevOps gives them')
  // A note saved by hand keeps them (TVL-30: the rest is locked).
  const noted = saveTool(merged, { ...editOf(merged.tools.find((entry) => entry.name === 'Minitab')), notes: 'checked' }, at, 'me', toolKey('Minitab', '21'))
  assert.equal(noted.tools.find((entry) => entry.name === 'Minitab').usedBy, 'Lab A')
  // GIT-17: one save brought the values, the other a note on another tool — both kept.
  const base = serializeToolValidations(parseToolValidations(fileWith([tool('Minitab', '21'), tool('JMP', '17')])).file)
  const mine = serializeToolValidations(mergeSource(parseToolValidations(base).file, streamSourceId, [{ name: 'Minitab', version: '21', id: 41, usedBy: 'Lab A' }, { name: 'JMP', version: '17' }], at).file)
  const theirs = serializeToolValidations(saveTool(parseToolValidations(base).file, { ...editOf(parseToolValidations(base).file.tools[0]), notes: 'checked' }, at, 'them', toolKey('JMP', '17')))
  const both = parseToolValidations(mergeToolValidationsText(base, mine, theirs, false)).file
  assert.deepEqual(both.tools.map((entry) => `${entry.name}:${entry.id ?? ''}:${entry.usedBy ?? ''}:${entry.notes ?? ''}`), ['JMP:::checked', 'Minitab:41:Lab A:'])
})
