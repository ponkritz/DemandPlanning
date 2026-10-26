import test from 'node:test'
import assert from 'node:assert/strict'
import { formatDate } from '../src/format.ts'
import { queryLayout, pickFields, cellValue, columnName, formatCell, sortItems, viewSummary, viewCsv, defaultViewColumns } from '../src/queryView.ts'

const base = { organization: 'o', project: 'p', state: 'Active', assignedTo: 'Ana', areaPath: 'p\\DP', iterationPath: 'p\\S1', tags: '', url: 'u', syncedAt: '' }
const item = (id, extra = {}) => ({ ...base, key: `o/p/${id}`, id, workItemType: 'User Story', title: `Item ${id}`, ...extra })

test('query layout: SELECT columns in order, ORDER BY with direction; ID-only or no query uses defaults', () => {
  const wiql = 'SELECT [System.Id], [System.Title], [Custom.AuthorApprovalDate], [System.State]\nFROM WorkItems WHERE [System.TeamProject] = @project ORDER BY [Custom.AuthorApprovalDate] DESC, [System.Id]'
  assert.deepEqual(queryLayout(wiql), { columns: ['System.Id', 'System.Title', 'Custom.AuthorApprovalDate', 'System.State'], orderBy: [{ ref: 'Custom.AuthorApprovalDate', desc: true }, { ref: 'System.Id', desc: false }], unresolved: [] })
  assert.deepEqual(queryLayout('SELECT [System.Id] FROM WorkItems WHERE [System.State] <> \'Removed\'').columns, defaultViewColumns)
  assert.deepEqual(queryLayout(undefined), { columns: defaultViewColumns, orderBy: [], unresolved: [] })
})

test('fields: identities become display names; standard columns fall back to the mapped item; names readable', () => {
  assert.deepEqual(pickFields({ 'System.AssignedTo': { displayName: 'Ana Costa', uniqueName: 'ana@x' }, 'Custom.Docs': 14, 'System.Title': 'T', other: 'x' }, ['System.AssignedTo', 'Custom.Docs', 'System.Title', 'Missing']), { 'System.AssignedTo': 'Ana Costa', 'Custom.Docs': 14, 'System.Title': 'T' })
  const row = item(7, { fields: { 'Custom.Docs': 3 } })
  assert.equal(cellValue(row, 'Custom.Docs'), 3); assert.equal(cellValue(row, 'System.Title'), 'Item 7'); assert.equal(cellValue(row, 'Custom.Unknown'), undefined)
  assert.equal(columnName('Custom.AuthorApprovalDate'), 'Author Approval Date'); assert.equal(columnName('Custom.X', { 'Custom.X': 'Azure Name' }), 'Azure Name'); assert.equal(columnName('System.AssignedTo'), 'Assigned To')
  assert.equal(formatCell('2026-10-12T00:00:00Z'), formatDate('2026-10-12T00:00:00Z'), 'dates as long dates in the viewer’s time zone'); assert.equal(formatCell(true), 'Yes'); assert.equal(formatCell(undefined), '')
})

test('sorting follows the query order; blanks last; numbers numeric', () => {
  const rows = [item(1, { fields: { n: 10 } }), item(2, { fields: { n: 9 } }), item(3)]
  assert.deepEqual(sortItems(rows, [{ ref: 'n', desc: false }]).map((row) => row.id), [2, 1, 3])
  assert.deepEqual(sortItems(rows, [{ ref: 'n', desc: true }]).map((row) => row.id), [3, 1, 2])
  assert.equal(sortItems(rows, []), rows)
})

test('summary: counts by state, type and person; overdue open items; changed this week; CSV export', () => {
  const rows = [
    item(1, { state: 'Active', targetDate: '2026-10-01', changedDate: '2026-10-19T10:00:00Z' }),
    item(2, { state: 'Closed', targetDate: '2026-10-01', assignedTo: '' }),
    item(3, { state: 'Active', workItemType: 'Bug', changedDate: '2026-09-01T10:00:00Z' }),
  ]
  const summary = viewSummary(rows, '2026-10-20')
  assert.deepEqual(summary.byState, [['Active', 2], ['Closed', 1]]); assert.deepEqual(summary.byType, [['User Story', 2], ['Bug', 1]])
  assert.deepEqual(summary.byPerson, [['Ana', 2], ['Unassigned', 1]]); assert.equal(summary.overdue, 1); assert.equal(summary.changedThisWeek, 1)
  assert.equal(viewCsv([item(5, { title: 'A, "b"' })], [{ ref: 'System.Id', name: 'ID' }, { ref: 'System.Title', name: 'Title' }]), 'ID,Title\r\n5,"A, ""b"""')
})

test('query columns are read with or without square brackets, in any mix', () => {
  assert.deepEqual(queryLayout('SELECT System.Id, System.Title, Microsoft.VSTS.Common.Priority FROM WorkItems WHERE System.TeamProject = @project').columns, ['System.Id', 'System.Title', 'Microsoft.VSTS.Common.Priority'])
  assert.deepEqual(queryLayout('﻿select [System.Id],\r\n\tSystem.Title from workitems where [System.State] <> \'Closed\' ORDER BY System.State DESC, [System.Id] asc'), { columns: ['System.Id', 'System.Title'], orderBy: [{ ref: 'System.State', desc: true }, { ref: 'System.Id', desc: false }], unresolved: [] })
  assert.deepEqual(queryLayout('SELECT System.Id FROM WorkItems WHERE System.TeamProject = @project').columns, defaultViewColumns)
})

test('SELECT entries mix reference names and field names, in any letter case, and resolve to the server spelling', () => {
  const names = { 'System.Id': 'ID', 'System.Title': 'Title', 'System.AssignedTo': 'Assigned To', 'System.State': 'State', 'Custom.ReleaseDate': 'Release Date' }
  const wiql = 'SELECT [System.Id], Title, [Assigned To], [system.state], [Release Date], [custom.releasedate]​ FROM WorkItems WHERE [System.TeamProject] = @project ORDER BY [Release Date] DESC, ID'
  assert.deepEqual(queryLayout(wiql, names), { columns: ['System.Id', 'System.Title', 'System.AssignedTo', 'System.State', 'Custom.ReleaseDate'], orderBy: [{ ref: 'Custom.ReleaseDate', desc: true }, { ref: 'System.Id', desc: false }], unresolved: [] })
  // Without the project's field list, common field names still resolve; unknown names are reported, not guessed.
  assert.deepEqual(queryLayout('SELECT ID, Title, [Assigned To], [Work Item Type], [Release Date] FROM WorkItems WHERE x = 1'), { columns: ['System.Id', 'System.Title', 'System.AssignedTo', 'System.WorkItemType'], orderBy: [], unresolved: ['Release Date'] })
})

test('values are found whatever the letter case of the reference', () => {
  assert.deepEqual(pickFields({ 'System.Title': 'A', 'Custom.ReleaseDate': '2026-10-01T00:00:00Z' }, ['system.title', 'CUSTOM.RELEASEDATE']), { 'system.title': 'A', 'CUSTOM.RELEASEDATE': '2026-10-01T00:00:00Z' })
  assert.equal(cellValue({ id: 1, title: 'T', state: 'Active' }, 'system.state'), 'Active')
})

import { withReleaseColumns, releaseRef, releaseNameRef } from '../src/queryView.ts'
test('read-only views get Name and Release columns from the paths, after the ID', () => {
  const item = { id: 1, title: 'T', state: 'Active', workItemType: 'Document', areaPath: 'DHP\\DoseNav\\Release 2.1.0', iterationPath: '' }
  const columns = [{ ref: 'System.Id', name: 'ID' }, { ref: 'System.Title', name: 'Title' }]
  const make = (ref) => ({ ref, name: columnName(ref) })
  assert.deepEqual(withReleaseColumns(columns, [item], make).map((column) => column.name), ['ID', 'Name', 'Release', 'Title'])
  assert.deepEqual([cellValue(item, releaseNameRef), cellValue(item, releaseRef)], ['DoseNav', '2.1.0'])
  assert.equal(withReleaseColumns(columns, [{ ...item, areaPath: 'DHP\\Team' }], make), columns, 'no release in any path: columns unchanged')
})

import { visibleColumns, hiddenColumnsKey } from '../src/queryView.ts'
test('column chooser: hidden columns left out in the query order, never all of them, remembered per view', () => {
  const columns = [{ ref: 'System.Id' }, { ref: 'System.Title' }, { ref: 'Custom.ReleaseDate' }, { ref: 'System.State' }]
  assert.deepEqual(visibleColumns(columns, []).map((column) => column.ref), ['System.Id', 'System.Title', 'Custom.ReleaseDate', 'System.State'])
  assert.deepEqual(visibleColumns(columns, ['System.Title', 'System.State']).map((column) => column.ref), ['System.Id', 'Custom.ReleaseDate'])
  assert.deepEqual(visibleColumns(columns, columns.map((column) => column.ref)).map((column) => column.ref), ['System.Id'], 'with every column hidden the first one stays')
  assert.deepEqual(visibleColumns(columns, ['Unknown.Field']).length, 4, 'a column no longer in the query is ignored')
  assert.notEqual(hiddenColumnsKey('DP'), hiddenColumnsKey('CP'))
})

test('a bare field name finds its prefixed reference name ("SourceProgram" → Custom.SourceProgram), only when exactly one field ends with it', () => {
  const names = { 'System.Id': 'ID', 'System.Title': 'Title', 'Custom.SourceProgram': 'Source Program', 'Custom.Intent': 'Release Intent', 'Philips.Intent': 'Intent (Philips)', 'Custom.Year': 'Year' }
  const layout = queryLayout('SELECT [ID], [Title], [SourceProgram], [Intent], [Year] FROM WorkItems', names)
  assert.deepEqual(layout.columns, ['System.Id', 'System.Title', 'Custom.SourceProgram', 'Intent', 'Custom.Year'], 'Intent matches two fields, so it stays as written; Year is a display name')
  // When the field list could not be read, the column stays "SourceProgram" and the value is still found.
  const fields = { 'System.Id': 7, 'System.Title': 'RSGMS 3.0.0.2', 'Custom.SourceProgram': 'RSGMS', 'Custom.Year': '2026', 'Philips.Year': '2025' }
  assert.deepEqual(pickFields(fields, ['SourceProgram', 'Year', 'System.Title']), { SourceProgram: 'RSGMS', 'System.Title': 'RSGMS 3.0.0.2' }, 'an ambiguous bare name stays blank rather than guessing')
  assert.deepEqual(pickFields({ 'Custom.SourceProgram': 'X' }, ['Other.SourceProgram']), {}, 'a written prefix is never swapped for another')
})

test('rich-text values (Acceptance Criteria) show as text: tags removed, entities decoded, lines joined', async () => {
  const { formatCell, htmlToText } = await import('../src/queryView.ts')
  assert.equal(formatCell('<div><b>Given</b> a release&nbsp;is Done</div><div>When &lt;DDT&gt; &amp; DRfH<br>Then it counts</div>'), 'Given a release is Done · When <DDT> & DRfH · Then it counts')
  assert.equal(formatCell('<ul><li>One</li><li>Two &#8211; &#x2713;</li></ul><p></p>'), 'One · Two – ✓')
  assert.equal(htmlToText('<style>p{}</style><p>Only text</p>'), 'Only text')
  assert.equal(formatCell('Value <5> and a < b'), 'Value <5> and a < b', 'plain text with angle brackets stays as it is')
})

test('column order: saved order first, new query columns keep their place; move by drag or one step', async () => {
  const { orderColumns, moveColumnTo, moveColumnBy, viewCsv, extraColumnRef } = await import('../src/queryView.ts')
  const cols = ['A', 'B', 'C', 'D'].map((ref) => ({ ref, name: ref }))
  assert.deepEqual(orderColumns(cols, []).map((c) => c.ref), ['A', 'B', 'C', 'D'])
  assert.deepEqual(orderColumns(cols, ['C', 'A', 'B', 'D']).map((c) => c.ref), ['C', 'A', 'B', 'D'])
  assert.deepEqual(orderColumns(cols, ['C', 'A', 'X']).map((c) => c.ref), ['C', 'D', 'A', 'B'], 'unknown saved refs dropped; a column the order does not know goes right after the one it follows in the query (B after A, D after C)')
  assert.deepEqual(moveColumnTo(['A', 'B', 'C', 'D'], 'D', 'B'), ['A', 'D', 'B', 'C'])
  assert.deepEqual(moveColumnTo(['A', 'B', 'C', 'D'], 'A', 'C'), ['B', 'C', 'A', 'D'])
  assert.deepEqual(moveColumnBy(['A', 'B', 'C'], 'B', -1), ['B', 'A', 'C'])
  assert.deepEqual(moveColumnBy(['A', 'B', 'C'], 'C', 1), ['A', 'B', 'C'], 'the last stays last')
  const item = { key: 'k', id: 7, title: 'T', workItemType: 'Release', state: 'Active', fields: {} }
  assert.equal(viewCsv([item], [{ ref: extraColumnRef, name: 'Match' }, { ref: 'System.Id', name: 'ID' }], { text: () => 'Feature 1 (90%)' }), 'Match,ID\r\nFeature 1 (90%),7', 'the extra column is exported where it stands')
})
