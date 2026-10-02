import type { Activity, Baseline, DemandClassification, MonthlyEffort, PeriodControl, UserRole } from './domain'

export const monthKey = (date: string | Date) => {
  const value = typeof date === 'string' ? new Date(date) : date
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`
}

export const hasElevatedRole = (role: UserRole) => ['Owner', 'Admin', 'ProcessOwner'].includes(role)

export function effectivePlanningOpen(period: PeriodControl, on = new Date()) {
  if (!period.planningLocked) return true
  return Boolean(period.planningExtendedUntil && new Date(period.planningExtendedUntil) >= on)
}

export function effectiveActualsOpen(period: PeriodControl, on = new Date()) {
  if (!period.actualsLocked) return true
  return Boolean(period.actualsExtendedUntil && new Date(period.actualsExtendedUntil) >= on)
}

export function classifyDemand(activityCreatedAt: string, period: PeriodControl): DemandClassification {
  const created = new Date(activityCreatedAt)
  const deadline = new Date(period.planningExtendedUntil || period.planningDeadline)
  return period.planningLocked && created > deadline ? 'Ad-hoc' : 'Planned'
}

export function findBaseline(activity: Activity, month: string, baselines: Baseline[]) {
  const periodStart = new Date(`${month}-01T00:00:00`)
  return baselines
    .filter((baseline) => baseline.active && baseline.activityType === activity.type && baseline.band === activity.band && baseline.complexity === activity.complexity)
    .filter((baseline) => new Date(baseline.effectiveFrom) <= periodStart && (!baseline.effectiveTo || new Date(baseline.effectiveTo) >= periodStart))
    .sort((a, b) => b.version - a.version)[0]
}

export function variancePercent(effort: MonthlyEffort) {
  const comparison = effort.baselineHours ?? effort.plannedHours
  if (!comparison || effort.actualHours == null) return null
  return ((effort.actualHours - comparison) / comparison) * 100
}

export function isVarianceFlagged(effort: MonthlyEffort) {
  const variance = variancePercent(effort)
  return variance !== null && Math.abs(variance) > 25
}

export function capacityUtilization(actualHours: number, monthlyCapacity: number) {
  if (monthlyCapacity <= 0) return 0
  return (actualHours / monthlyCapacity) * 100
}
