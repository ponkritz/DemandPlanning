import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDelimited, parseWindchillExport } from '../src/windchillExport.ts'
import { windchillCell } from '../src/windchillViews.ts'

test('Windchill export (CSV): header found below a title line, quoted cells, columns kept as in the file', () => {
  assert.deepEqual(parseDelimited('a,"b,c","d ""e"""\r\n1,"2\n3",4', ','), [['a', 'b,c', 'd "e"'], ['1', '2\n3', '4']])
  const csv = '﻿Search Results\r\nNumber,Name,State,Last Modified,Organization Name,Number\r\nDHF-1,"Plan, v2",Released,2026-02-01,GSS_BST,x\r\nDHF-2,Spec,Released,2026-03-01,GSS_BST,\r\n\r\n'
  const { columns, rows } = parseWindchillExport(csv)
  assert.deepEqual(columns, ['Number', 'Name', 'State', 'Last Modified', 'Organization Name', 'Number (2)'], 'a repeated column name gets a suffix')
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], { Number: 'DHF-1', Name: 'Plan, v2', State: 'Released', 'Last Modified': '2026-02-01', 'Organization Name': 'GSS_BST', 'Number (2)': 'x' })
  assert.equal(windchillCell(rows[0], 'Last Modified'), '2026-02-01')
  assert.equal(windchillCell({ 'State/Value': 'Released' }, 'State/Value'), 'Released', 'export columns with "/" are read by name')
  assert.equal(windchillCell({ State: { Value: 'RELEASED' } }, 'State/Value'), 'RELEASED', 'search results still follow the path')
  assert.deepEqual(parseWindchillExport('Number;Name\nA;Alpha\n').rows, [{ Number: 'A', Name: 'Alpha' }], 'semicolon-separated')
  assert.deepEqual(parseWindchillExport('Number\tName\nA\tAlpha\n').rows, [{ Number: 'A', Name: 'Alpha' }], 'tab-separated')
  assert.throws(() => parseWindchillExport('PK\u0003\u0004...'), /Excel file/)
  assert.throws(() => parseWindchillExport('<html><body>x</body></html>'), /web page/)
  assert.throws(() => parseWindchillExport('Number,Name\n'), /no results/)
  assert.throws(() => parseWindchillExport('just one line'), /No header row/)
})
