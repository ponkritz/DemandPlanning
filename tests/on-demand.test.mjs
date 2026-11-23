import test from 'node:test'
import assert from 'node:assert/strict'
import { applyColumns, cellProblem, cellSortValue, columnDrafts, columnEffects, columnsError, conqPage, emptyPage, filterRows, mergeOnDemandText, newId, onDemandPath, pageIdFor, pageIdOfFile, parseOnDemandPage, removeRow, renamePage, rowError, serializeOnDemandPage, tableCsv, upsertRow } from '../src/onDemand.ts'
import { defaultPolicy, parseAccess, rightsFor, serializeAccess, writeBlockedReason } from '../src/access.ts'
import { fileLabel } from '../src/gitWatch.ts'

const columns = [
  { id: 'c1', name: 'Topic', type: 'text', options: [], required: true },
  { id: 'c2', name: 'Cost (EUR)', type: 'number', options: [], required: false },
  { id: 'c3', name: 'Found on', type: 'date', options: [], required: false },
  { id: 'c4', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Complaint'], required: false },
  { id: 'c5', name: 'Sites', type: 'multi', options: ['Berlin', 'Leeds', 'Lyon'], required: false },
]
const page = () => ({ ...conqPage(), columns: structuredClone(columns), rows: [
  { id: 'r1', key: 'CONQ-261102-AAA2', seq: 1, cells: { c1: 'Label misprint', c2: '1200', c3: '2026-11-02', c4: 'Rework', c5: ['Berlin', 'Lyon'] } },
  { id: 'r2', key: 'CONQ-261109-AAA3', seq: 2, cells: { c1: 'Late delivery', c4: 'Complaint', c5: ['Leeds'] } },
] })

test('OND-08: an On-Demand page file is validated when read back from Git — unknown types, bad ids and values cleaned, a file that is not a page refused (TC-OND-02)', () => {
  const file = page()
  assert.deepEqual(parseOnDemandPage(serializeOnDemandPage(file), 'conq'), file, 'round trip')
  assert.equal(conqPage().name, 'CoNQ'); assert.equal(conqPage().description, 'Cost of Non-Quality')
  const raw = JSON.stringify({ kind: 'on-demand-page', id: 'other', name: '  Waste   log ', columns: [
    { id: 'c1', name: 'A', type: 'formula' }, { id: 'c1', name: 'twice' }, { id: '../x', name: 'bad id' },
    { id: 'c2', name: 'Pick', type: 'dropdown', options: ['x', 'x', '', 3] }, { id: 'c3', name: 'Many', type: 'multi', options: ['a', 'b'] }, null,
  ], rows: [
    { id: 'r1', cells: { c1: 42, c2: ['x', 'y'], c3: 'a', unknown: 'dropped', c9: 'gone' } }, { id: 'r1', cells: { c1: 'duplicate id' } }, { cells: {} }, { id: 'r2', cells: { c1: { evil: true }, c3: [1, '', 'b'] } },
  ] })
  const read = parseOnDemandPage(raw, 'waste')
  assert.equal(read.id, 'waste', 'the file name wins over the id inside')
  assert.equal(read.name, 'Waste log')
  assert.deepEqual(read.columns, [{ id: 'c1', name: 'A', type: 'text', options: [], required: false }, { id: 'c2', name: 'Pick', type: 'dropdown', options: ['x', '3'], required: false }, { id: 'c3', name: 'Many', type: 'multi', options: ['a', 'b'], required: false }])
  assert.deepEqual(read.rows, [{ id: 'r1', cells: { c1: '42', c2: 'x, y', c3: ['a'] } }, { id: 'r2', cells: { c3: ['1', 'b'] } }])
  assert.throws(() => parseOnDemandPage('{'), /not valid JSON/)
  assert.throws(() => parseOnDemandPage('{"kind":"qe-mapping","columns":[],"rows":[]}', 'x'), /not an On-Demand page/)
  assert.throws(() => parseOnDemandPage('{"kind":"on-demand-page","id":"../../x","columns":[],"rows":[]}'), /no valid id/)
  assert.equal(pageIdOfFile('conq.json'), 'conq'); assert.equal(pageIdOfFile('../conq.json'), null); assert.equal(pageIdOfFile('README.md'), null)
  assert.equal(onDemandPath('conq'), 'on-demand/conq.json')
  assert.equal(fileLabel('data/on-demand/conq.json', 'data/planning-data.json'), 'On-Demand page conq')
  const big = { ...emptyPage('big', 'Big'), columns: [columns[0]], rows: Array.from({ length: 4000 }, (_, i) => ({ id: `r${i}`, cells: { c1: 'x'.repeat(250) } })) }
  assert.throws(() => serializeOnDemandPage(big), /too large to save to Git/)
})

test('OND-04: rows — required fields, numbers and dates checked; values cleaned; search, sort values and CSV (TC-OND-03)', () => {
  const file = page()
  assert.match(rowError(file.columns, { c2: '5' }), /Fill in “Topic”: it is required/)
  assert.match(rowError(file.columns, { c1: 'x', c2: 'abc' }), /“Cost \(EUR\)” is not a number/)
  assert.match(rowError(file.columns, { c1: 'x', c3: '2026-02-30' }), /“Found on” is not a date/)
  assert.equal(rowError(file.columns, { c1: 'x', c5: [] }), '')
  assert.match(rowError(columns.map((column) => ({ ...column, required: false })), {}), /at least one field/)
  const added = upsertRow(file, { id: 'r3', cells: { c1: '  Scrap batch ', c5: ['Lyon', 'Lyon', ''], c4: '' } })
  const { key: newKey, addedBy, addedAt, log, ...addedRow } = added.rows[2]
  assert.deepEqual(addedRow, { id: 'r3', cells: { c1: 'Scrap batch', c5: ['Lyon'] } })
  assert.equal(addedBy, 'unknown', 'OND-20: no one known — “unknown”')
  assert.match(addedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  assert.deepEqual(log.map((entry) => [entry.added, entry.by, entry.changes]), [[true, 'unknown', [{ column: 'c1', from: '', to: 'Scrap batch' }, { column: 'c5', from: '', to: 'Lyon' }]]])
  assert.match(newKey, /^CONQ-\d{6}-[2-9A-HJKMNP-Z]{4}$/, 'OND-18: a new row gets its key at once')
  assert.equal(upsertRow(added, { id: 'r3', cells: { c1: 'Scrap' } }).rows[2].key, newKey, 'an edit keeps the key')
  assert.deepEqual(upsertRow(added, { id: 'r3', cells: { c1: 'Scrap', c4: 'Scrap' } }).rows[2].cells, { c1: 'Scrap', c4: 'Scrap' }, 'an edit replaces the row')
  assert.deepEqual(removeRow(added, 'r1').rows.map((row) => row.id), ['r2', 'r3'])
  assert.deepEqual(filterRows(file, 'leeds complaint').map((row) => row.id), ['r2'])
  assert.equal(cellSortValue(file.columns[1], '1200'), 1200)
  assert.equal(tableCsv(file).split('\r\n')[0], 'ID,Key,Topic,Cost (EUR),Found on,Category,Sites,Added by,Added on,Last updated by,Last updated on')
  assert.equal(tableCsv(file).split('\r\n')[1], 'CONQ-0001,CONQ-261102-AAA2,Label misprint,1200,2026-11-02,Rework,"Berlin, Lyon",,,,', 'rows from before keep Added by / on empty')
  assert.deepEqual(filterRows(file, 'conq-261109').map((row) => row.id), ['r2'], 'search finds the key')
  assert.notEqual(newId('r'), newId('r'), 'ids two people add at the same time do not collide')
  assert.equal(pageIdFor('Cost of Scrap & Rework', ['cost-of-scrap-rework']), 'cost-of-scrap-rework-2')
  assert.equal(renamePage(file, ' CoNQ 2026 ', 'Cost of Non-Quality').name, 'CoNQ 2026')
  assert.throws(() => renamePage(file, ' ', ''), /Give the page a name/)
})

test('OND-06: changing a column type or removing an option keeps the values and says so first; a renamed option follows in every row (TC-OND-04)', () => {
  const file = page()
  const drafts = columnDrafts(file.columns)
  assert.deepEqual(columnEffects(file, drafts), [], 'nothing changed: nothing to ask')
  // Category: Rework renamed, Complaint removed; Sites becomes a Dropdown; Cost becomes a Date; Found on is removed.
  drafts[3].options = [{ label: 'Scrap', was: 'Scrap' }, { label: 'Re-work', was: 'Rework' }, { label: 'Audit' }]
  drafts[4].type = 'dropdown'
  drafts[1].type = 'date'
  const next = drafts.filter((draft) => draft.id !== 'c3')
  const effects = columnEffects(file, next)
  assert.deepEqual(effects, [
    '“Cost (EUR)” changes from Number to Date: its 1 value is kept; 1 does not fit and is shown as “not a date” until changed.',
    '“Found on” is removed with its 1 value.',
    'Option “Rework” of “Category” is renamed “Re-work” in 1 row.',
    'Option “Complaint” of “Category” is removed: 1 row keeps it, shown as “not in the list” until changed.',
    '“Sites” changes from Multi-select to Dropdown (one value): its 2 values are kept; 1 row with several choices keeps them as one text; 1 does not fit and is shown as “not in the list” until changed.',
  ])
  const applied = applyColumns(file, next)
  assert.deepEqual(applied.columns.map((column) => [column.id, column.type, column.options]), [['c1', 'text', []], ['c2', 'date', []], ['c4', 'dropdown', ['Scrap', 'Re-work', 'Audit']], ['c5', 'dropdown', ['Berlin', 'Leeds', 'Lyon']]])
  assert.deepEqual(applied.rows[0].cells, { c1: 'Label misprint', c2: '1200', c4: 'Re-work', c5: 'Berlin, Lyon' })
  assert.deepEqual(applied.rows[1].cells, { c1: 'Late delivery', c4: 'Complaint', c5: 'Leeds' })
  assert.equal(cellProblem(applied.columns[2], 'Complaint'), 'not in the list')
  assert.equal(cellProblem(applied.columns[1], '1200'), 'not a date')
  // Back to Multi-select: one text becomes a list of one.
  const back = columnDrafts(applied.columns); back[3].type = 'multi'
  assert.deepEqual(applyColumns(applied, back).rows[1].cells.c5, ['Leeds'])
  // A new column gets a fresh id; the editor's checks.
  const withNew = applyColumns(file, [...columnDrafts(file.columns), { id: 'tmp', name: 'Owner', type: 'text', required: false, options: [], isNew: true }], () => 'c9')
  assert.equal(withNew.columns.at(-1).id, 'c9')
  assert.match(columnsError([...columnDrafts(file.columns), { id: 'x', name: 'topic', type: 'text', required: false, options: [] }]), /two columns named “Topic”/)
  assert.match(columnsError([{ id: 'x', name: 'Pick', type: 'multi', required: false, options: [] }]), /add at least one option/)
  assert.match(columnsError([{ id: 'x', name: 'Pick', type: 'dropdown', required: false, options: [{ label: 'a' }, { label: 'A ' }] }]), /option “a” twice/)
  assert.match(columnsError([{ id: 'x', name: ' ', type: 'text', required: false, options: [] }]), /needs a name/)
})

test('OND-09: two saves of a page are merged — rows and columns by id, the later save wins where both changed the same entry, a removed row stays removed unless changed later (TC-OND-05)', () => {
  const base = page()
  const baseText = serializeOnDemandPage(base)
  // Mine (later): edits r1, adds r3, removes r2, renames the page.
  const mine = { ...base, name: 'CoNQ 2026', rows: [{ id: 'r1', cells: { ...base.rows[0].cells, c2: '1500' } }, { id: 'r3', cells: { c1: 'Mine' } }] }
  // Theirs (earlier, already in Git): edits r1 too, adds r4 and a column, edits r2's sites.
  const theirs = { ...base, columns: [...base.columns, { id: 'c6', name: 'Owner', type: 'text', options: [], required: false }], rows: [{ id: 'r1', cells: { ...base.rows[0].cells, c2: '999' } }, { id: 'r2', cells: { ...base.rows[1].cells, c5: ['Leeds', 'Lyon'] } }, { id: 'r4', cells: { c1: 'Theirs', c6: 'Ana' } }] }
  const later = parseOnDemandPage(mergeOnDemandText(baseText, serializeOnDemandPage(mine), serializeOnDemandPage(theirs), true), 'conq')
  assert.equal(later.name, 'CoNQ 2026')
  assert.deepEqual(later.columns.map((column) => column.id), ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'], 'their new column is kept')
  assert.deepEqual(later.rows.map((row) => row.id), ['r1', 'r4', 'r3'], 'r2 removed by the later save stays removed')
  assert.equal(later.rows[0].cells.c2, '1500', 'both changed r1: the later save wins')
  // The other way round: their change of r2 is later than my removal, so r2 comes back with it.
  const earlier = parseOnDemandPage(mergeOnDemandText(baseText, serializeOnDemandPage(mine), serializeOnDemandPage(theirs), false), 'conq')
  assert.deepEqual(earlier.rows.map((row) => row.id), ['r1', 'r2', 'r4', 'r3'])
  assert.equal(earlier.rows[0].cells.c2, '999')
  assert.deepEqual(earlier.rows[1].cells.c5, ['Leeds', 'Lyon'])
  // A removed row nobody changed stays removed; an unchanged side takes the other's change.
  const untouched = { ...base, rows: [base.rows[0]] }
  assert.deepEqual(parseOnDemandPage(mergeOnDemandText(baseText, serializeOnDemandPage(untouched), serializeOnDemandPage({ ...base, columns: theirs.columns }), true), 'conq').rows.map((row) => row.id), ['r1'])
  // A column removed here drops its values from their rows too; column order follows the save that changed it.
  const reordered = { ...base, columns: [base.columns[1], base.columns[0], ...base.columns.slice(2, 4)] }
  const merged = parseOnDemandPage(mergeOnDemandText(baseText, serializeOnDemandPage(reordered), serializeOnDemandPage(theirs), true), 'conq')
  assert.deepEqual(merged.columns.map((column) => column.id), ['c2', 'c1', 'c3', 'c4', 'c6'])
  assert.equal(merged.rows.find((row) => row.id === 'r1').cells.c5, undefined)
  // Without a base (never read here) both sides' rows stay; an unreadable side keeps mine.
  assert.deepEqual(parseOnDemandPage(mergeOnDemandText(null, serializeOnDemandPage(mine), serializeOnDemandPage(theirs), true), 'conq').rows.map((row) => row.id), ['r1', 'r2', 'r4', 'r3'])
  assert.equal(mergeOnDemandText(baseText, 'mine', '{', true), 'mine')
})

test('CON-103: the On-Demand rights — area for every role, setup and data editing for Tool Owner and Admin; an older access.json gets them as the starting matrix does (TC-OND-06)', () => {
  const policy = defaultPolicy('lead@example.com')
  for (const role of Object.keys(policy.roles)) assert.ok(policy.roles[role].areas.includes('ondemand'), `${role} sees On-Demand`)
  const admin = rightsFor(policy, 'lead@example.com'), member = rightsFor(policy, 'x@example.com')
  assert.ok(admin.actions.has('ondemand.setup') && admin.actions.has('ondemand.edit'))
  assert.ok(!member.actions.has('ondemand.setup') && !member.actions.has('ondemand.edit') && member.areas.has('ondemand'))
  assert.match(serializeAccess(policy), /"permissions": 5/)
  // A file saved before (permissions 3): every role it lists sees the area; Tool Owner and Admin get both rights.
  const v3 = JSON.parse(serializeAccess(policy))
  v3.permissions = 3
  for (const rights of Object.values(v3.roles)) { rights.areas = rights.areas.filter((key) => key !== 'ondemand'); rights.actions = rights.actions.filter((key) => !key.startsWith('ondemand.')) }
  delete v3.roles['Product Owner']
  const read = parseAccess(JSON.stringify(v3))
  for (const role of ['Tool Owner', 'Admin', 'People Manager', 'Scrum Master', 'Team Member']) assert.ok(read.roles[role].areas.includes('ondemand'), role)
  assert.deepEqual(read.roles['Product Owner'], { areas: [], actions: [] }, 'a role missing from the file still has no rights')
  assert.ok(read.roles.Admin.actions.includes('ondemand.setup') && read.roles.Admin.actions.includes('ondemand.edit') && read.roles['Tool Owner'].actions.includes('ondemand.edit'))
  assert.ok(!read.roles['Team Member'].actions.some((key) => key.startsWith('ondemand.')))
  // Saved again (permissions 5), a right set to Not set stays so.
  read.roles.Admin.actions = read.roles.Admin.actions.filter((key) => key !== 'ondemand.edit')
  read.roles['Team Member'].areas = read.roles['Team Member'].areas.filter((key) => key !== 'ondemand')
  const again = parseAccess(serializeAccess(read))
  assert.ok(!again.roles.Admin.actions.includes('ondemand.edit') && !again.roles['Team Member'].areas.includes('ondemand'))
  // An older file without the split permissions (only settings.manage): the same.
  const old = parseAccess(JSON.stringify({ schema: 1, defaultRole: null, roles: { Admin: { areas: [], actions: ['settings.manage'] }, 'Team Member': { areas: ['overview'], actions: [] } }, members: {} }))
  assert.ok(old.roles.Admin.actions.includes('ondemand.setup') && old.roles['Team Member'].areas.includes('ondemand') && !old.roles['Team Member'].actions.includes('ondemand.edit'))
  // CON-101: no roles file — the area is shown, nothing may be changed, and the reason says so for Git.
  const none = rightsFor(null, 'lead@example.com')
  assert.ok(none.areas.has('ondemand') && !none.actions.has('ondemand.edit'))
  assert.equal(writeBlockedReason(true, ['ondemand.edit'], 'on this page'), 'Read only: the access roles are not loaded yet, so nothing can be changed on this page.')
  assert.match(writeBlockedReason(false, ['ondemand.edit'], 'on this page'), /Your role does not allow “Edit On-Demand data \(rows\)”/)
})

test('OND-18: every row has a unique key from the moment it is added — prefix, date, 4 random characters; unique after two saves merge; old rows keyed on save; the prefix fixed once used (TC-OND-15)', async () => {
  const { newRowKey, withRowKeys, setKeyPrefix, prefixFor, rowKeyPattern } = await import('../src/onDemand.ts')
  const day = () => Date.parse('2026-11-23T10:00:00Z')
  assert.equal(newRowKey('CONQ', new Set(), () => 0, day), 'CONQ-261123-2222')
  assert.equal(newRowKey('CONQ', new Set(['CONQ-261123-2222']), (() => { let n = 0; return () => (n++ < 4 ? 0 : 0.999) })(), day), 'CONQ-261123-ZZZZ', 'a key already on the page is never given again')
  assert.match(newRowKey('CONQ', new Set()), rowKeyPattern)
  assert.equal(prefixFor('CoNQ'), 'CONQ'); assert.equal(prefixFor('Scrap & rework log'), 'SCRAPREW'); assert.equal(prefixFor('—'), 'ROW')
  // Two people add a row each at the same time and get the same key (forced here); after the merge both rows stay and
  // every key in the file is unique.
  const base = serializeOnDemandPage(page())
  const same = { key: 'CONQ-261123-K7Q2' }
  const mine = serializeOnDemandPage({ ...page(), rows: [...page().rows, { id: 'rMine', ...same, cells: { c1: 'Mine' } }] })
  const theirs = serializeOnDemandPage({ ...page(), rows: [...page().rows, { id: 'rTheirs', ...same, cells: { c1: 'Theirs' } }] })
  const merged = parseOnDemandPage(mergeOnDemandText(base, mine, theirs, true), 'conq')
  assert.deepEqual(merged.rows.map((row) => row.id).sort(), ['r1', 'r2', 'rMine', 'rTheirs'])
  const keys = merged.rows.map((row) => row.key)
  assert.equal(new Set(keys).size, 4, 'keys unique after the merge')
  assert.ok(keys.every((key) => rowKeyPattern.test(key)))
  assert.ok(keys.includes('CONQ-261123-K7Q2'), 'one of the two keeps it; only the second gets a new one')
  // Rows from before keys get one on the next save, in their order; keys already there do not change.
  const old = { ...page(), rows: [{ id: 'o1', cells: { c1: 'Old' } }, page().rows[0]] }
  const saved = parseOnDemandPage(serializeOnDemandPage(old), 'conq')
  assert.match(saved.rows[0].key, rowKeyPattern)
  assert.equal(saved.rows[1].key, 'CONQ-261102-AAA2')
  assert.deepEqual(withRowKeys(page()), page(), 'a page whose rows all have keys is left as it is')
  // A duplicate key in a file is dropped on reading (and replaced on the next save).
  const dup = parseOnDemandPage(JSON.stringify({ kind: 'on-demand-page', id: 'conq', name: 'CoNQ', columns, rows: [{ id: 'a', key: 'CONQ-261123-K7Q2', cells: { c1: 'x' } }, { id: 'b', key: 'CONQ-261123-K7Q2', cells: { c1: 'y' } }, { id: 'c', key: 'bad key', cells: { c1: 'z' } }] }), 'conq')
  assert.deepEqual(dup.rows.map((row) => row.key), ['CONQ-261123-K7Q2', undefined, undefined])
  // The prefix: set per page, 1–8 letters or digits, fixed once a row has a key; kept in the file and merged with the name.
  const fresh = { ...emptyPage('waste', 'Waste log') }
  assert.equal(fresh.keyPrefix, 'WASTELOG')
  assert.equal(setKeyPrefix(fresh, ' wst ').keyPrefix, 'WST')
  assert.throws(() => setKeyPrefix(fresh, 'TOO-LONG-1'), /1 to 8 letters/)
  assert.throws(() => setKeyPrefix(page(), 'NEW'), /cannot change: rows already have keys/)
  assert.equal(JSON.parse(serializeOnDemandPage(setKeyPrefix(fresh, 'WST'))).keyPrefix, 'WST')
  assert.equal(parseOnDemandPage(JSON.stringify({ kind: 'on-demand-page', id: 'x', name: 'Odd name', columns: [], rows: [] }), 'x').keyPrefix, 'ODDNAME', 'a file without a prefix takes it from the name')
})
