import test from 'node:test'
import assert from 'node:assert/strict'
import { formatHours, formatPercent, formatDate, formatDateTime, monthName, todayIso } from '../src/format.ts'
import { pages, pageGroups, pageMeta } from '../src/pages/registry.ts'

test('formatHours renders missing values as a dash and rounds to two decimals', () => {
  assert.equal(formatHours(null), '—'); assert.equal(formatHours(undefined), '—')
  assert.equal(formatHours(0), '0'); assert.equal(formatHours(8.125), '8.13'); assert.equal(formatHours(1234.5), (1234.5).toLocaleString())
})
test('formatPercent and formatDate keep dashes for missing data', () => {
  assert.equal(formatPercent(null), '—'); assert.equal(formatPercent(87.456), '87.5%'); assert.equal(formatPercent(50, 0), '50%')
  assert.equal(formatDate(undefined), '—'); assert.equal(formatDate(undefined, 'No target date'), 'No target date'); { const india = formatDate('2026-09-30T20:00:00Z', '—', 'Asia/Kolkata'), ny = formatDate('2026-09-30T20:00:00Z', '—', 'America/New_York'); assert.ok(india.includes('October') && /\b1\b/.test(india), india); assert.ok(ny.includes('September') && /\b30\b/.test(ny), ny) }
  assert.ok(formatDate('2026-10-31').includes('October') && formatDate('2026-10-31').includes('31'), 'a plain date stays that calendar date')
})
test('formatDateTime falls back on empty or unparsable input', () => {
  assert.equal(formatDateTime(undefined, 'Confirmed this session'), 'Confirmed this session'); assert.equal(formatDateTime('not a date'), '—')
  // In the viewer's time zone, with the zone named: the same instant reads differently per zone.
  { const india = formatDateTime('2026-10-16T21:00:00Z', '—', 'Asia/Kolkata'); assert.ok(/\b17\b/.test(india) && india.includes('Oct') && india.includes('02:30'), india) }
  { const ny = formatDateTime('2026-10-16T21:00:00Z', '—', 'America/New_York'); assert.ok(/\b16\b/.test(ny) && ny.includes('05:00'), ny) }
  assert.match(formatDateTime('2026-10-16T21:00:00Z', '—', 'UTC'), /UTC/)
  assert.equal(todayIso(new Date('2026-10-16T21:00:00Z'), 'Asia/Kolkata'), '2026-10-17')
  assert.equal(todayIso(new Date('2026-10-16T21:00:00Z'), 'America/New_York'), '2026-10-16')
})
test('monthName and todayIso use the month key format the app stores', () => {
  assert.equal(monthName('2026-10'), 'October 2026'); assert.match(todayIso(), /^\d{4}-\d{2}-\d{2}$/)
})
test('page registry has unique ids, known groups and header text for every page', () => {
  assert.equal(new Set(pages.map((page) => page.id)).size, pages.length)
  for (const page of pages) { assert.ok(pageGroups.includes(page.group), page.id); assert.ok(page.label.trim() && page.detail.trim(), page.id) }
  assert.equal(pageMeta('overview').label, 'Dashboard')
  assert.deepEqual(pages.filter((page) => page.usesMonth).map((page) => page.id), ['workspace', 'pulse', 'monthly', 'baselines', 'windchill', 'snapshots', 'admin'])
  assert.deepEqual(pages.filter((page) => page.group === 'Data Insights').map((page) => page.id), ['overview', 'workspace', 'pulse', 'pireview'])
  assert.deepEqual(pages.filter((page) => page.group === 'My Work').map((page) => page.label), ['Assigned to Me', 'Monthly Time Writing', 'Bulk actions'])
})
