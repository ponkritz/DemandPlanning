import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dpBulkDateDefaults, dpBulkDatesOf, dpDateColumns, dpDateLabel, dpRowDates, dpTaskMonths, normalizeDpBulkDates, utcDay } from '../src/dpBulkDates.ts'
import { normalizeReleaseSourceSettings } from '../src/releaseSource.ts'
import { planningData, parsePlanning, serializePlanning } from '../src/gitStorage.ts'
import { createFeatureWithMonthTasks, HierarchyCreationError } from '../src/azureDevOps.ts'

// DP bulk creation dates (DPF-13…DPF-16; TC-DPF-12…TC-DPF-15). Synthetic data only.
const row = (fields) => ({ id: 1, fields })

test('DPF-13: the date columns are set in the shared settings, kept by field name; older files use DRPE Date and DDT Date (TC-DPF-12)', () => {
  assert.deepEqual(dpBulkDateDefaults, { start: 'DRPEDate', target: 'DDTDate' })
  assert.deepEqual(dpBulkDatesOf(undefined), { start: 'DRPEDate', target: 'DDTDate' }, 'no setting: the defaults')
  assert.deepEqual(normalizeReleaseSourceSettings({ bulkEpics: { DP: 15000 } }).dpBulkDates, undefined, 'a file without the setting')
  assert.deepEqual(normalizeDpBulkDates({ start: 'Custom.DRfHDate', target: 'DDTDate' }), { start: 'DRfHDate' }, 'kept by its last part; a default is not stored')
  assert.deepEqual(normalizeDpBulkDates({ start: 'bad name!', target: 42 }), undefined, 'anything else is left out')
  assert.deepEqual(normalizeDpBulkDates({ start: 'x'.repeat(121) }), undefined, 'at most 120 characters')
  assert.deepEqual(normalizeDpBulkDates(['DRPEDate']), undefined)
  const settings = normalizeReleaseSourceSettings({ bulkEpics: { DP: 15000 }, dpBulkDates: { start: 'DRPCDate', target: 'Custom.TargetDate' } })
  assert.deepEqual(dpBulkDatesOf(settings.dpBulkDates), { start: 'DRPCDate', target: 'TargetDate' })
  // Saved with the bulk creation Epics in the planning data and read back.
  const file = parsePlanning(serializePlanning(planningData({ baselineRules: [], releaseScopes: [], resourceProfiles: {}, capacitySettings: undefined, releaseSourceSettings: settings })))
  assert.deepEqual(file.releaseSourceSettings.dpBulkDates, { start: 'DRPCDate', target: 'TargetDate' })
  assert.deepEqual(file.releaseSourceSettings.bulkEpics, { DP: 15000 })
})

test('DPF-13: the date columns offered — the query’s …Date columns by field name (prefix allowed), the DP milestone dates always (TC-DPF-12)', () => {
  const columns = [{ ref: 'System.Id', name: 'ID' }, { ref: 'Custom.DRPEDate', name: 'DRPEDate' }, { ref: 'Custom.DDTDate', name: 'DDTDate' }, { ref: 'System.CreatedDate', name: 'Created Date' }, { ref: 'Custom.DDTStatus', name: 'DDTStatus' }]
  assert.deepEqual(dpDateColumns(columns).map((option) => option.field), ['DRPEDate', 'DDTDate', 'CreatedDate', 'DRPCDate', 'DRfHDate'])
  assert.deepEqual(dpDateColumns(undefined).map((option) => option.field), ['DRPEDate', 'DRPCDate', 'DRfHDate', 'DDTDate'], 'before a fetch')
  assert.equal(dpDateLabel('DRPEDate'), 'DRPE Date (RPE)')
  assert.equal(dpDateLabel('Custom.DDTDate'), 'DDT Date (DT)')
  assert.equal(dpDateLabel('CreatedDate'), 'Created Date')
})

test('DPF-14: a date column’s value is read as a date only, its UTC day (TC-DPF-13)', () => {
  assert.equal(utcDay('2027-03-15'), '2027-03-15')
  assert.equal(utcDay('2027-03-15T00:00:00Z'), '2027-03-15')
  assert.equal(utcDay('2027-03-15T23:30:00.000Z'), '2027-03-15')
  assert.equal(utcDay('2027-03-16T02:00:00+05:30'), '2027-03-15', 'the UTC day of an instant with an offset')
  assert.equal(utcDay('2027-02-30'), undefined, 'no such day')
  assert.equal(utcDay('3/15/2027'), undefined, 'a local format is not read')
  assert.equal(utcDay('soon'), undefined)
  assert.equal(utcDay(''), undefined)
  // The field is matched by its name with a prefix (Custom.DRPEDate), as the DP milestones are.
  const dates = dpRowDates(row({ 'Custom.DRPEDate': '2026-12-01T00:00:00Z', 'Custom.DDTDate': '2027-03-15T00:00:00Z' }), dpBulkDateDefaults)
  assert.deepEqual(dates, { start: '2026-12-01', target: '2027-03-15', notes: [], error: '', fieldNotes: {} })
  const other = dpRowDates(row({ 'Custom.DRPCDate': '2027-01-10', DDTDate: '2027-02-01' }), { start: 'DRPCDate', target: 'DDTDate' })
  assert.deepEqual([other.start, other.target], ['2027-01-10', '2027-02-01'], 'the mapped columns are read')
})

test('DPF-14: a missing or unreadable date leaves that date empty with a note and does not stop the row (TC-DPF-13)', () => {
  const noTarget = dpRowDates(row({ DRPEDate: '2026-12-01' }), dpBulkDateDefaults)
  assert.deepEqual(noTarget, { start: '2026-12-01', notes: ['no DDT Date — Target date left empty'], error: '', fieldNotes: { target: 'No DDT Date on this release' } })
  const none = dpRowDates(row({ DRPEDate: 'TBD' }), dpBulkDateDefaults)
  assert.deepEqual(none.notes, ['DRPE Date “TBD” is not a date — Start date left empty', 'no DDT Date — Target date left empty'])
  assert.equal(none.error, '')
  assert.equal('start' in none || 'target' in none, false)
})

test('DPF-15: a Start date after the Target date is an error for the row, with the reason (TC-DPF-14)', () => {
  const late = dpRowDates(row({ DRPEDate: '2027-05-01', DDTDate: '2027-03-01' }), dpBulkDateDefaults)
  assert.equal(late.error, 'the Start date 2027-05-01 (DRPE Date) is after the Target date 2027-03-01 (DDT Date)')
  assert.equal(dpRowDates(row({ DRPEDate: '2027-03-01', DDTDate: '2027-03-01' }), dpBulkDateDefaults).error, '', 'the same day is fine')
})

test('DPF-16: Time Writing Tasks — unticked the current month only; ticked every month from the Start date’s month to the Target month, never before this month, each exception said (TC-DPF-15)', () => {
  const now = 'November 2026'
  assert.deepEqual(dpTaskMonths(false, { start: '2026-12-01', target: '2027-02-20' }, now), { months: ['November 2026'], note: '' }, 'not ticked (the default): as before')
  assert.deepEqual(dpTaskMonths(true, { start: '2026-12-01', target: '2027-02-20' }, now), { months: ['December 2026', 'January 2027', 'February 2027'], note: '' }, 'from the Start date’s month, not the current month')
  assert.deepEqual(dpTaskMonths(true, { start: '2026-11-03', target: '2027-01-10' }, now), { months: ['November 2026', 'December 2026', 'January 2027'], note: '' })
  assert.deepEqual(dpTaskMonths(true, { start: '2026-09-10', target: '2027-01-20' }, now), { months: ['November 2026', 'December 2026', 'January 2027'], note: 'from Nov 2026 (Start Sep 2026 is before this month)' }, 'a past month cannot get a new Task (New Feature’s rule): from this month, said on the row')
  assert.deepEqual(dpTaskMonths(true, { target: '2027-01-31' }, now), { months: ['November 2026', 'December 2026', 'January 2027'], note: 'from Nov 2026 (no Start date)' }, 'no Start date: the current month')
  assert.deepEqual(dpTaskMonths(true, { start: '2026-12-01' }, now), { months: ['December 2026'], note: 'no Target date: first month only' })
  assert.deepEqual(dpTaskMonths(true, { start: '2025-01-01', target: '2025-06-30' }, now), { months: ['November 2026'], note: 'from Nov 2026 (Start Jan 2025 is before this month); Target Jun 2025 is already past: first month only' })
  assert.deepEqual(dpTaskMonths(true, {}, now).months, ['November 2026'])
})

// A fake QMS-0025 project for the create path: the Epic, then whatever is created.
const config = { organization: 'example-org', project: 'Quality', team: 'Team A' }
const pat = 'synthetic-test-token'
function fakeProject(failOn) {
  const world = new Map([[10, { id: 10, fields: { 'System.Title': 'DP releases', 'System.WorkItemType': 'Epic', 'System.AreaPath': 'Quality\\DP', 'System.IterationPath': 'Quality', 'System.TeamProject': 'Quality' } }]])
  let next = 100
  const created = []
  const transport = async (request) => {
    if (request.operation === 'items') return { value: request.ids.map((id) => world.get(id)).filter(Boolean) }
    if (request.operation === 'iterations') return { value: [{ name: 'PI 1', path: 'Quality\\PI 1' }] }
    if (request.operation === 'query') { const parent = Number(/\[System\.Parent\] = (\d+)/.exec(request.query)[1]); return { workItems: [...world.values()].filter((entry) => entry.fields['System.Parent'] === parent).map((entry) => ({ id: entry.id })) } }
    if (request.operation === 'create-feature' || request.operation === 'create-child') {
      if (failOn && request.feature.title.startsWith(failOn)) throw new Error(`refused ${failOn}`)
      if (request.validateOnly) return {}
      const f = request.feature, id = ++next
      const item = { id, fields: { 'System.Title': f.title, 'System.WorkItemType': request.operation === 'create-feature' ? 'Feature' : request.workItemType, 'System.State': 'New', 'System.Parent': f.parentId, 'System.AreaPath': f.areaPath, 'System.IterationPath': f.iterationPath || 'Quality', 'System.TeamProject': 'Quality', 'System.AssignedTo': { uniqueName: f.assignedTo }, ...(f.startDate ? { 'Microsoft.VSTS.Scheduling.StartDate': `${f.startDate}T00:00:00Z` } : {}), ...(f.targetDate ? { 'Microsoft.VSTS.Scheduling.TargetDate': `${f.targetDate}T00:00:00Z` } : {}), ...(f.adhoc ? { 'System.Tags': 'ad-hoc' } : {}) } }
      world.set(id, item); created.push({ operation: request.operation, type: item.fields['System.WorkItemType'], feature: f })
      return item
    }
    if (request.operation === 'update-time-writing-effort') { const entry = world.get(request.workItemId); if (request.planHours != null) entry.fields['Microsoft.VSTS.Scheduling.OriginalEstimate'] = request.planHours; return entry }
    throw new Error(`unexpected ${request.operation}`)
  }
  return { transport, created }
}
const feature = { parentId: 10, title: 'Imaging | Viewer | v4.2', description: 'Feature DoD: DT done.', acceptanceCriteria: '', iterationPath: 'Quality\\PI 1', assignedTo: 'qe@example.com', startDate: '2026-12-01', targetDate: '2027-02-15' }
const setup = { stories: [], reviewStory: false, task: { title: '{month} | {feature}', description: '', originalEstimate: 4, assignedTo: '', areaPath: '', iterationPath: '' } }

test('DPF-16: a bulk Feature gets its dates and one Time Writing Task per chosen month, by New Feature’s path (TC-DPF-15)', async () => {
  const one = fakeProject()
  await createFeatureWithMonthTasks(config, pat, feature, setup, ['November 2026'], () => false, one.transport)
  const sent = one.created.find((entry) => entry.type === 'Feature').feature
  assert.deepEqual([sent.startDate, sent.targetDate], ['2026-12-01', '2027-02-15'], 'Start and Target dates on the Feature')
  assert.deepEqual(one.created.filter((entry) => entry.type === 'Task').map((entry) => entry.feature.title), ['November 2026 | Imaging | Viewer | v4.2'], 'current month only: one Task')
  const many = fakeProject()
  const { months } = dpTaskMonths(true, { start: feature.startDate, target: feature.targetDate }, 'November 2026')
  const result = await createFeatureWithMonthTasks(config, pat, feature, setup, months, (month) => month === 'December 2026', many.transport)
  const tasks = many.created.filter((entry) => entry.type === 'Task')
  assert.deepEqual(tasks.map((entry) => entry.feature.title.split(' | ')[0]), ['December 2026', 'January 2027', 'February 2027'], 'one Task per month from Start to Target')
  assert.deepEqual(tasks.map((entry) => entry.feature.adhoc === true), [true, false, false], 'a month whose planning has locked is tagged ad-hoc')
  assert.equal(many.created.filter((entry) => entry.type === 'User Story').length, 1, 'one Time Writing story for all the months')
  assert.equal(result.items.filter((item) => item.workItemType === 'Task').length, 3)
  await assert.rejects(createFeatureWithMonthTasks(config, pat, feature, setup, [], () => false, fakeProject().transport), /No Time Writing month/)
})

test('DPF-16: a later month failing keeps what was made and says how to add the rest (TC-DPF-15)', async () => {
  const failing = fakeProject('January 2027')
  await assert.rejects(createFeatureWithMonthTasks(config, pat, feature, setup, ['December 2026', 'January 2027', 'February 2027'], () => false, failing.transport), (failure) => failure instanceof HierarchyCreationError && /December 2026 Task exist\. refused January 2027.*＋ Time Writing Task/.test(failure.message) && failure.createdItems.some((item) => item.workItemType === 'Feature'))
})

test('UI-30: the DP and IOCC Create Features pop-ups are the full-size Modal, their list the part that scrolls (TC-UI-26)', () => {
  const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
  for (const file of ['components/DpBulkCreate.tsx', 'components/IoccBulkCreate.tsx']) {
    const source = read(file)
    assert.match(source, /<Modal eyebrow="(DP|IOCC) RELEASES" full /, `${file}: Modal full`)
    assert.match(source, /className="azure-table modal-scroll"/, `${file}: the list scrolls`)
  }
  assert.match(read('components/ui.tsx'), /full \? 'modal modal-full'/, 'one size added to the shared Modal')
  const css = read('fresh.css')
  assert.match(css, /\.modal-backdrop:has\(\.modal-full\)\{padding:20px\}/, 'a 20 px margin with the page dimmed behind')
  assert.match(css, /@media\(max-width:640px\)\{\.modal-backdrop:has\(\.modal-full\)\{padding:0\}/, 'the whole screen on a phone')
})
