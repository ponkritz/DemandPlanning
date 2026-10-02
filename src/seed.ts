import type { AppState } from './domain'

export const seedState: AppState = {
  schemaVersion: 1,
  people: [
    { id: 'u-owner', name: 'Application Owner', email: 'owner@example.invalid', role: 'Owner', active: true },
    { id: 'u-po-a', name: 'Process Owner A', email: 'po-a@example.invalid', role: 'ProcessOwner', active: true },
    { id: 'u-qe-01', name: 'QE 01', email: 'qe01@example.invalid', role: 'Contributor', active: true },
    { id: 'u-qe-02', name: 'QE 02', email: 'qe02@example.invalid', role: 'Contributor', active: true },
  ],
  activities: [
    { id: 'act-1', name: 'Release verification', type: 'Release', processOwnerId: 'u-po-a', resourceId: 'u-qe-01', status: 'On Track', startDate: '2026-10-01', endDate: '2026-10-24', band: 'Senior', complexity: 'High', featureCount: 14, bugCount: 7, source: 'Manual', createdAt: '2026-09-15T09:00:00.000Z', createdBy: 'u-owner' },
    { id: 'act-2', name: 'Planning event', type: 'Release', processOwnerId: 'u-po-a', resourceId: 'u-qe-02', status: 'At Risk', startDate: '2026-10-10', endDate: '2026-10-12', band: 'Senior', complexity: 'Medium', featureCount: 8, bugCount: 2, source: 'Manual', createdAt: '2026-10-03T09:00:00.000Z', createdBy: 'u-owner' },
    { id: 'act-3', name: 'Regression assessment', type: 'Project', processOwnerId: 'u-po-a', resourceId: 'u-qe-01', status: 'Completed', startDate: '2026-10-02', endDate: '2026-10-18', band: 'Junior', complexity: 'Medium', source: 'Manual', createdAt: '2026-09-18T09:00:00.000Z', createdBy: 'u-owner' },
    { id: 'act-4', name: 'Lessons learnt session', type: 'Learning', processOwnerId: 'u-po-a', resourceId: 'u-qe-02', status: 'On Track', startDate: '2026-10-20', endDate: '2026-10-20', band: 'Not Applicable', complexity: 'Low', source: 'Manual', createdAt: '2026-09-22T09:00:00.000Z', createdBy: 'u-owner' },
  ],
  efforts: [
    { id: 'eff-1', activityId: 'act-1', month: '2026-10', classification: 'Planned', plannedHours: 48, actualHours: 42, baselineHours: 48, notes: 'Verification progressing to plan.', learnings: '', struggles: '', updatedAt: '2026-10-21T09:00:00.000Z', updatedBy: 'u-qe-01' },
    { id: 'eff-2', activityId: 'act-2', month: '2026-10', classification: 'Ad-hoc', plannedHours: null, actualHours: 18, baselineHours: 32, notes: 'New release received after planning freeze.', learnings: 'Earlier intake signal would improve capacity planning.', struggles: 'Compressed review window.', updatedAt: '2026-10-18T09:00:00.000Z', updatedBy: 'u-qe-02' },
    { id: 'eff-3', activityId: 'act-3', month: '2026-10', classification: 'Planned', plannedHours: 32, actualHours: 42, baselineHours: 32, notes: 'Additional regression scope.', learnings: '', struggles: 'Late defect arrivals.', updatedAt: '2026-10-20T09:00:00.000Z', updatedBy: 'u-qe-01' },
    { id: 'eff-4', activityId: 'act-4', month: '2026-10', classification: 'Planned', plannedHours: 12, actualHours: 8, baselineHours: 8, notes: 'Session scheduled.', learnings: 'Reuse the milestone checklist.', struggles: '', updatedAt: '2026-10-20T09:00:00.000Z', updatedBy: 'u-qe-02' },
  ],
  baselines: [
    { id: 'base-1', activityType: 'Release', band: 'Senior', complexity: 'High', hours: 48, effectiveFrom: '2026-10-01', active: true, reason: 'Initial MVP baseline', version: 1 },
    { id: 'base-2', activityType: 'Release', band: 'Senior', complexity: 'Medium', hours: 32, effectiveFrom: '2026-10-01', active: true, reason: 'Initial MVP baseline', version: 1 },
    { id: 'base-3', activityType: 'Project', band: 'Junior', complexity: 'Medium', hours: 32, effectiveFrom: '2026-10-01', active: true, reason: 'Initial MVP baseline', version: 1 },
    { id: 'base-4', activityType: 'Learning', band: 'Not Applicable', complexity: 'Low', hours: 8, effectiveFrom: '2026-09-01', active: true, reason: 'Initial MVP baseline', version: 1 },
  ],
  periods: [
    { month: '2026-10', planningDeadline: '2026-09-30T23:59:59.000Z', actualsDeadline: '2026-11-05T23:59:59.000Z', planningLocked: true, actualsLocked: false, updatedAt: '2026-10-01T08:00:00.000Z', updatedBy: 'u-owner' },
  ],
  releases: [
    { id: 'rel-1', releaseName: 'Sample Release A', releaseType: 'Major', sourceSystem: 'TFS', plannedClosure: '2026-10-18', actualClosure: '2026-10-20', milestone: 'Verification complete', featureCount: 14, bugCount: 7, uploadedAt: '2026-10-20T10:00:00.000Z' },
  ],
  audits: [],
  snapshots: [],
  masters: [
    { id: 'm-1', type: 'Release Type', value: 'Major', sortOrder: 1, active: true },
    { id: 'm-2', type: 'Release Type', value: 'Minor', sortOrder: 2, active: true },
    { id: 'm-3', type: 'Release Type', value: 'Maintenance', sortOrder: 3, active: true },
  ],
}
