import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMonthlyPack, capacityLine, defaultPackSetup, emptyNotes, epicDescendants, kpiValue, packSlides, parsePackNotes, parsePackSetup, sameMonthLastYear, serializePackNotes, serializePackSetup, slideText, supportedLine, yearMonths, yoyLine } from '../src/monthlyPack.ts'
import { writePptx } from '../src/pptx.ts'

const item = (id, type, state, extra = {}) => ({ key: `o/p/${id}`, id, organization: 'o', project: 'p', title: `Item ${id}`, workItemType: type, state, assignedTo: '', areaPath: 'P', iterationPath: 'P', tags: '', url: '', syncedAt: '', ...extra })

test('setup and notes files: parse, clean and serialise (PCK-01, PCK-02)', () => {
  const setup = parsePackSetup(serializePackSetup(defaultPackSetup))
  assert.deepEqual(setup, defaultPackSetup, 'the default setup round-trips')
  const cleaned = parsePackSetup(JSON.stringify({ schema: 1, lines: [{ id: 'bad id!', label: '', streams: ['DP', 'DP', ''], epicIds: [5, 5, -1, 'x'] }, { id: 'a', label: 'A' }, { id: 'a', label: 'Dup' }], kpis: [{ id: 'k', label: 'K', epicId: 7, metric: 'nope' }] }))
  assert.deepEqual(cleaned.lines, [{ id: 'line-1', label: 'Line 1', streams: ['DP'], epicIds: [5] }, { id: 'a', label: 'A', streams: [], epicIds: [] }], 'ids repaired, duplicates and bad values dropped')
  assert.deepEqual(cleaned.kpis, [{ id: 'k', label: 'K', epicId: 7, metric: 'manual' }], 'an unknown metric becomes manual')
  assert.throws(() => parsePackSetup('{"schema":2}'), /schema 1/)
  const notes = parsePackNotes(serializePackNotes({ ...emptyNotes('2026-10'), text: { summary: 'All good\r\nSecond', risks: '  ' }, kpiValues: { teds: '99%', 'bad key!': 'x' } }), '2026-10')
  assert.deepEqual(notes, { schema: 1, month: '2026-10', text: { summary: 'All good\nSecond' }, kpiValues: { teds: '99%' } }, 'blank text and bad keys are dropped, CRLF normalised')
})

test('Epic counts: descendants without Tasks, open / closed in month / closed YTD / closed share (PCK-04)', () => {
  const items = [
    item(1, 'Epic', 'Active'), item(2, 'Feature', 'Closed', { parentId: 1, closedDate: '2026-10-05T00:00:00Z' }), item(3, 'User Story', 'Active', { parentId: 2 }), item(4, 'Task', 'Closed', { parentId: 3 }),
    item(5, 'Bug', 'Done', { parentId: 1, changedDate: '2026-03-02T00:00:00Z' }), item(6, 'Feature', 'Removed', { parentId: 1 }), item(7, 'Feature', 'New', { parentId: 9 }),
  ]
  assert.deepEqual(epicDescendants(items, [1]).map((entry) => entry.id), [2, 3, 5], 'Tasks, Removed items and other Epics left out')
  const util = { month: 107.5, ytd: 103.2, qeMonth: 111.9 }
  const value = (metric, typed) => kpiValue({ id: 'k', label: 'K', epicId: 1, metric }, items, '2026-10', util, typed, 'UTC')
  assert.deepEqual([value('open'), value('closed-month'), value('closed-ytd'), value('percent-closed')], ['1', '1', '2', '67%'])
  assert.deepEqual([value('utilization-month'), value('utilization-ytd'), value('manual', '99%'), value('manual')], ['107.5%', '103.2%', '99%', ''])
  assert.equal(kpiValue({ id: 'k', label: 'K', metric: 'open' }, items, '2026-10', util, 'typed'), 'typed', 'an Epic metric without an Epic shows the typed value')
  assert.deepEqual([yearMonths('2026-03'), sameMonthLastYear('2026-10')], [['2026-01', '2026-02', '2026-03'], '2025-10'])
})

test('the pack: releases per line, supported counts, YoY from last year, capacity lines and slide text (PCK-03, PCK-05)', () => {
  const streams = { '2026-10': [{ name: 'DP', releases: ['DoseNav 2.1.0'], supported: 3 }, { name: 'IOCC', releases: ['Gateway 5.0 (Core)'], supported: 1 }, { name: 'S&S IT', releases: ['CareLink 3.2'], supported: 1 }], '2026-09': [{ name: 'DP', releases: [], supported: 2 }], '2025-10': [{ name: 'DP', releases: [], supported: 2 }], '2025-04': [{ name: 'IOCC', releases: [], supported: 2 }] }
  const items = [item(1, 'Epic', 'Active'), item(2, 'Feature', 'Closed', { parentId: 1, closedDate: '2026-10-09T00:00:00Z', title: 'PPU rollout' }), item(3, 'Feature', 'Closed', { parentId: 1, closedDate: '2025-02-09T00:00:00Z' })]
  const setup = { ...defaultPackSetup, lines: defaultPackSetup.lines.map((line) => line.id === 'ppu' ? { ...line, epicIds: [1] } : line) }
  const notes = { ...emptyNotes('2026-10'), text: { focusAreas: 'Agent governance\nDashboard releases' }, kpiValues: { teds: '99%' } }
  const pack = buildMonthlyPack({ month: '2026-10', setup, notes, items, streamsOf: (month) => streams[month] ?? [], utilization: { month: 107.5, ytd: 104.1, qeMonth: 111.9 }, timeZone: 'UTC' })
  const line = (id) => pack.lines.find((entry) => entry.id === id)
  assert.deepEqual([line('dp').releases, line('dp').supported, line('dp').ytd, line('dp').lastYtd, line('dp').change], [['DoseNav 2.1.0'], 3, 5, 2, 150], 'DP: October + September this year vs. October last year')
  assert.deepEqual([line('ppu').releases, line('ppu').supported, line('ppu').ytd, line('ppu').lastYtd], [['PPU rollout'], 1, 1, 1], 'an Epic-mapped line counts the Features closed under it')
  assert.deepEqual([line('iocc').ytd, line('iocc').lastYtd, line('iocc').change], [1, 2, -50])
  assert.deepEqual(pack.overall, { supported: 6, ytd: 8, lastYtd: 5, change: 60 })
  assert.equal(capacityLine(pack), 'Capacity: 107.5% utilization (Oct) – QE – 111.9% (Oct)')
  assert.equal(yoyLine(pack), 'YoY support change of +60% overall – with +150% in Digital Platform, -50% in IOCC, 0% in PPU (Oct YTD vs. last year)')
  assert.equal(supportedLine(pack), 'Serviceability = 1; Digital Platform = 3; IOCC = 1; PPU = 1')
  assert.deepEqual(pack.kpis.map((row) => [row.label, row.value, row.manual]).slice(0, 2), [['Utilization (YTD)', '104.1%', false], ['TEDs Compliance', '99%', true]])
  const [first, second] = packSlides(pack)
  assert.deepEqual(first.boxes.map((box) => box.title), ['Actions/Deliverables Realized', 'Observations, Challenges & Risks', 'Focus Areas for Next Months', 'Support Requested / Topics to Highlight'])
  assert.deepEqual(first.boxes[0].lines, ['Serviceability - CareLink 3.2', 'Digital Platform - DoseNav 2.1.0', 'IOCC - Gateway 5.0 (Core)', 'PPU - PPU rollout'])
  assert.deepEqual(first.boxes[2].lines, ['Agent governance', 'Dashboard releases'], 'typed text fills a box')
  assert.ok(second.boxes.find((box) => box.key === 'risks').lines[0].startsWith('Overload: 107.5%'), 'overload above 100% is a risk line')
  assert.match(slideText(second), /Performance Pulse update — October 2026 Update\n\nSummary\n• Actual utilization was 107\.5% in October 2026\./)
  assert.match(slideText(second), /KPI Pulse\n• Utilization \(YTD\): 104\.1%\n• TEDs Compliance: 99%\n• AI-augmented productivity \(YTD\): —/)
})

test('the .pptx writer: a zip with the presentation parts, one slide per input, text escaped (PCK-06)', () => {
  const bytes = writePptx([{ title: 'A & B', subtitle: 'Sub', columns: 2, rows: 1, boxes: [{ title: 'Box <1>', lines: ['x "y" z'], col: 0, row: 0 }] }, { title: 'Two', columns: 1, rows: 1, boxes: [] }])
  const content = new TextDecoder('latin1').decode(bytes)
  assert.equal(bytes[0] * 256 + bytes[1], 0x504b, 'starts with the zip signature')
  for (const part of ['[Content_Types].xml', 'ppt/presentation.xml', 'ppt/slideMasters/slideMaster1.xml', 'ppt/slideLayouts/slideLayout1.xml', 'ppt/theme/theme1.xml', 'ppt/slides/slide1.xml', 'ppt/slides/slide2.xml', 'ppt/slides/_rels/slide2.xml.rels']) assert.ok(content.includes(part), part)
  assert.ok(!content.includes('ppt/slides/slide3.xml'))
  assert.ok(content.includes('<a:t>A &amp; B</a:t>') && content.includes('<a:t>Box &lt;1&gt;</a:t>') && content.includes('<a:t>x &quot;y&quot; z</a:t>'), 'XML special characters are escaped')
  assert.ok(content.includes('<p:sldSz cx="12192000" cy="6858000"/>'), '16:9')
})

import { packUtilization, rowsUtilization } from '../src/packInputs.ts'
import { sampleDataset, sampleProfiles } from '../src/sampleData.ts'
import { capacityContext } from '../src/capacity.ts'
import { personMonths } from '../src/dashboard.ts'
test('the utilisation from person-month rows equals the capacity model pass used by the pack (PCK-04, WSP-02)', () => {
  const config = { organization: 'o', project: 'p', team: 't' }
  const sample = sampleDataset(config, '2026-10')
  const settings = capacityContext({ resourceProfiles: sampleProfiles })
  const months = Array.from({ length: 10 }, (_, index) => `2026-${String(index + 1).padStart(2, '0')}`)
  const rows = personMonths(sample.items, months, '2026-10-29', settings)
  const fromRows = rowsUtilization(rows, '2026-10', settings), fromModel = packUtilization(sample.items, '2026-10', settings)
  assert.ok(fromModel.month != null && fromModel.ytd != null && fromModel.qeMonth != null, 'the sample has bookings')
  for (const key of ['month', 'ytd', 'qeMonth']) assert.ok(Math.abs(fromRows[key] - fromModel[key]) <= 0.1, `${key}: ${fromRows[key]} vs ${fromModel[key]}`)
})
