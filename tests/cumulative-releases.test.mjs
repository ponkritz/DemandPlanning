import test from 'node:test'
import assert from 'node:assert/strict'
import { completedOf, completedRows, cumulativeYear, defaultSwitches, monthCounts, readSwitches, windchillLinesOf, yearMonthsOf } from '../src/cumulativeReleases.ts'
import { completedCount, defaultStreamReleases } from '../src/releaseOverview.ts'
import { windchillSupported } from '../src/windchillReleases.ts'
import { periodComparison, periodStreams } from '../src/pulsePeriods.ts'

// QV-68, QV-69: Pulse Check → Year, the Completed releases of the year cumulative per stream — every month counted as
// its Month tab counts it (the same functions), December's running total the sum of the twelve Month tabs. Synthetic data.
const doc = (id, areaPath, title, approvalDate, fields) => ({ key: `o/p/${id}`, id, title, workItemType: 'Document', state: 'Approved', assignedTo: '', areaPath, iterationPath: 'DHP', tags: '', url: '', organization: 'o', project: 'p', syncedAt: '', approvalDate, ...(fields ? { fields } : {}) })
const dp = (id, name, release, ddt) => doc(id, `DHP\\${name}`, `${name} ${release}`, undefined, { PsName: name, Release: release, 'Custom.DDTDate': `${ddt}T00:00:00Z`, 'Custom.DDTStatus': 'Done' })
const source = (connectionId, items) => ({ connectionId, name: connectionId, role: 'reference', organization: 'o', project: 'p', query: 'q', fetchedAt: '2026-11-20T00:00:00Z', items })
const state = {
  azureSources: [
    source('dp', [dp(1, 'DoseNav', '2.1', '2026-03-10'), dp(2, 'DoseNav', '2.2', '2026-07-02'), dp(3, 'Vista', '1.0', '2026-07-20')]),
    source('tv', [doc(4, 'DHP\\Tool Validations\\Minitab', 'Minitab Validation Report', '2026-02-05T10:00:00Z'), doc(5, 'DHP\\Tool Validations\\Polarion', 'Polarion Validation Report', '2026-05-06T10:00:00Z'), doc(6, 'DHP\\Tool Validations\\Minitab', 'Minitab Validation Plan', '2026-02-07T10:00:00Z')]),
  ],
  // QV-58: CP without data, two Completed releases entered for April.
  releaseSourceSettings: { countOverrides: { CP: { '2026-04': { completed: 2 } } } },
}
const profiles = [{ id: 'dp', reason: 'DP', role: 'reference' }, { id: 'tv', reason: 'Tool Validations', role: 'reference' }, { id: 'ped', reason: 'Releases (Pedestal)', role: 'release-source' }]
// S&S IT: Remote Diagnostics 1.6 has documents dated in September and October (counted in both Month tabs), 1.7 in October.
const columns = ['Name', 'Location', 'Last Modified']
const windchill = { views: [{ id: 'w1', name: 'S&S IT', exportFile: 'sns.csv', columns }], sources: [{ viewId: 'w1', columns, rows: [
  { Name: 'Report', Location: '/Products/Remote Diagnostics/1.6/DHF', 'Last Modified': '2026-09-02' },
  { Name: 'Plan', Location: '/Products/Remote Diagnostics/1.6/DHF', 'Last Modified': '2026-10-01' },
  { Name: 'SRS', Location: '/Products/Remote Diagnostics/1.7/DHF', 'Last Modified': '2026-10-03' },
] }] }
const months = yearMonthsOf(2026)
// The Month tab's numbers: the Releases line of each Azure stream (completedCount) and each export's Supported line.
const monthTab = (month) => {
  const counts = new Map()
  for (const stream of defaultStreamReleases(state, profiles, month)) counts.set(stream.name, completedCount(stream))
  const rows = windchill.sources[0].rows
  counts.set('S&S IT', windchillSupported(rows, columns, month).length)
  return counts
}

test('QV-68: each month counts as its Month tab; December’s running total per stream is the sum of the twelve Month tabs (TC-QV-49)', () => {
  const perMonth = months.map((month) => completedOf(state, profiles, windchill, month))
  for (const [index, month] of months.entries()) {
    const tab = monthTab(month)
    for (const entry of perMonth[index]) if (tab.has(entry.name)) assert.equal(entry.completed, tab.get(entry.name), `${entry.name} ${month}`)
  }
  const year = cumulativeYear(months, perMonth, '2027-01-10')
  assert.equal(year.elapsed, 12)
  const sums = new Map()
  for (const month of months) for (const [name, count] of monthTab(month)) sums.set(name, (sums.get(name) ?? 0) + count)
  for (const line of year.streams) assert.equal(line.cumulative[11], sums.get(line.name) ?? 0, `${line.name}: December = the sum of the Month tabs`)
  const by = (name) => year.streams.find((line) => line.name === name)
  assert.deepEqual(by('DP').cumulative, [0, 0, 1, 1, 1, 1, 3, 3, 3, 3, 3, 3], 'DP: Completed Releases by DDT month, a running total')
  assert.deepEqual(by('Tool Validations').monthly, [0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], 'Tool Validations: one per tool in the month (QV-64)')
  assert.deepEqual(by('CP').monthly.slice(3, 4), [2], 'CP: the counts an Admin entered (QV-58)')
  assert.deepEqual(by('S&S IT').monthly.slice(8, 10), [1, 2], 'S&S IT: the releases dated in each month')
  assert.deepEqual(year.streams.map((line) => line.name).slice(0, 5), ['DP', 'CP', 'IOCC', 'Content', 'Tool Validations'], 'the default order')
  // All streams: each month's sum and its running total.
  assert.deepEqual(year.total.monthly, months.map((_, index) => year.streams.reduce((sum, line) => sum + line.monthly[index], 0)))
  assert.equal(year.total.cumulative[11], [...sums.values()].reduce((sum, value) => sum + value, 0))
})

test('QV-68: the Year row counts each release once — the same for DP and Tool Validations; S&S IT’s release in two months and entered counts only in the chart (TC-QV-49)', () => {
  const year = cumulativeYear(months, months.map((month) => completedOf(state, profiles, windchill, month)), '2027-01-10')
  const rows = periodComparison(periodStreams(months.map((month) => defaultStreamReleases(state, profiles, month)), months.map((month) => windchillLinesOf(windchill, month))), [])
  const row = (name) => rows.find((entry) => entry.name === name)?.releases ?? 0
  const december = (name) => year.streams.find((line) => line.name === name).cumulative[11]
  assert.equal(december('DP'), row('DP'))
  assert.equal(december('Tool Validations'), row('Tool Validations'))
  assert.deepEqual([december('S&S IT'), row('S&S IT')], [3, 2], 'Remote Diagnostics 1.6 counts in September and October here, once in the Year row')
  assert.deepEqual([december('CP'), row('CP')], [2, 0], 'entered counts are in the Month tabs, not in the Year row')
})

test('QV-68: the lines stop at the current month; a stream not counted has no line and stays out of the sums (TC-QV-49)', () => {
  const perMonth = months.map((month) => month > '2026-11' ? [] : completedOf(state, profiles, windchill, month))
  const year = cumulativeYear(months, perMonth, '2026-11-24', ['s&s it'])
  assert.equal(year.elapsed, 11)
  assert.equal(year.total.cumulative[11], null, 'December is empty')
  assert.ok(year.streams.every((line) => line.cumulative[11] === null && line.monthly[11] === null && line.cumulative[10] !== null))
  assert.equal(year.streams.some((line) => line.name === 'S&S IT'), false)
  assert.deepEqual(year.excluded, ['S&S IT'], 'named in the streams’ spelling for ⓘ')
  assert.equal(year.total.cumulative[10], 3 + 2 + 2, 'DP 3, Tool Validations 2, CP 2 — S&S IT left out')
  // A year before the current one has all twelve months; one after it none.
  assert.equal(cumulativeYear(yearMonthsOf(2025), [], '2026-11-24').elapsed, 12)
  assert.equal(cumulativeYear(yearMonthsOf(2027), [], '2026-11-24').total.cumulative.every((value) => value === null), true)
  // monthCounts: the Azure streams then the Windchill lines.
  assert.deepEqual(monthCounts([{ name: 'DP', releases: [{}, {}] }], [{ name: 'S&S IT', releases: ['a'] }]), [{ name: 'DP', completed: 2 }, { name: 'S&S IT', completed: 1 }])
})

test('QV-69: the switches — per stream and Month sum on, All streams off by default; only booleans read (TC-QV-49)', () => {
  assert.deepEqual(defaultSwitches, { streams: true, all: false, sums: true })
  assert.deepEqual(readSwitches({ all: true, sums: false, extra: 'x' }), { streams: true, all: true, sums: false })
  assert.deepEqual(readSwitches({ streams: 'yes' }), defaultSwitches)
  for (const value of [null, 'x', [], 3]) assert.equal(readSwitches(value), undefined)
})

test('MYD-25: Completed releases rows — one per stream and month up to the current one, with Counted in Pulse Check (TC-MYD-10)', () => {
  const rows = completedRows(['2026-10', '2026-11', '2026-12'], (month) => completedOf(state, profiles, windchill, month), '2026-11-24', ['CP'])
  assert.equal(rows.some((row) => row.month === '2026-12'), false, 'no month after the current one')
  assert.deepEqual(rows.filter((row) => row.stream === 'S&S IT').map((row) => [row.month, row.completed]), [['2026-10', 2], ['2026-11', 0]], 'a month without any is 0')
  assert.equal(rows.find((row) => row.stream === 'CP').counted, false)
  assert.equal(rows.find((row) => row.stream === 'DP').counted, true)
})
