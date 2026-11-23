// UI-17: data labels on every chart. The shared default comes from My settings → Look & feel → Table and chart defaults; each chart's
// own Data labels box overrides it on this computer (kept per chart).
const labelsKey = 'demand-planning-chart-labels-v1'
export function readChartLabels(storage: Pick<Storage, 'getItem'> = localStorage): Record<string, boolean> {
  try {
    const raw = JSON.parse(storage.getItem(labelsKey) ?? '{}') as unknown
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === 'boolean')) as Record<string, boolean> : {}
  } catch { return {} }
}
export function saveChartLabel(chart: string, on: boolean, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  try { storage.setItem(labelsKey, JSON.stringify({ ...readChartLabels(storage), [chart]: on })) } catch { /* this visit only */ }
}
// The chart's own choice, else the shared default.
export const chartLabelsOn = (own: Record<string, boolean>, chart: string, shared: boolean) => own[chart] ?? shared
