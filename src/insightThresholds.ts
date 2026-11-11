// CAP-47 Insight thresholds: the limits the Team overview insights use (forecast, plan accuracy, stream momentum,
// resilience, unusual months, plan health, persistent overload, concentration). Set in Settings → Capacity & periods →
// Insight thresholds by roles that manage shared settings and shared in Git; without them the built-in values apply.
export interface InsightThresholds {
  forecastOnTrack: number; accuracyReliable: number; accuracyBias: number
  momentumMonths: number; momentumChange: number; momentumMinHours: number
  resilienceSinglePoint: number; resilienceSpecialist: number
  unusualChange: number; unusualMinHours: number; unusualMinMonths: number
  healthGreen: number; healthAmber: number; persistentMonths: number; concentrationTop: number
}
export type ThresholdKey = keyof InsightThresholds
export const defaultInsightThresholds: InsightThresholds = {
  forecastOnTrack: 10, accuracyReliable: 15, accuracyBias: 20,
  momentumMonths: 3, momentumChange: 20, momentumMinHours: 8,
  resilienceSinglePoint: 80, resilienceSpecialist: 90,
  unusualChange: 50, unusualMinHours: 8, unusualMinMonths: 3,
  healthGreen: 75, healthAmber: 50, persistentMonths: 3, concentrationTop: 20,
}
// Label, unit and allowed range (whole numbers for months) of each threshold, in the order shown in Settings.
export const thresholdFields: { key: ThresholdKey; group: string; label: string; unit: '%' | 'h' | 'months' | 'points'; min: number; max: number }[] = [
  { key: 'forecastOnTrack', group: 'Month-end forecast', label: 'On track within ± of the plan', unit: '%', min: 1, max: 100 },
  { key: 'accuracyReliable', group: 'Plan accuracy', label: 'Reliable at an error of at most', unit: '%', min: 1, max: 100 },
  { key: 'accuracyBias', group: 'Plan accuracy', label: 'Under-records / over-runs at a bias of ±', unit: '%', min: 1, max: 100 },
  { key: 'momentumMonths', group: 'Stream momentum', label: 'Months in each window compared', unit: 'months', min: 1, max: 6 },
  { key: 'momentumChange', group: 'Stream momentum', label: 'Rising / falling at a change of', unit: '%', min: 1, max: 500 },
  { key: 'momentumMinHours', group: 'Stream momentum', label: 'And at least', unit: 'h', min: 0, max: 1000 },
  { key: 'resilienceSinglePoint', group: 'Resilience', label: 'A stream rests on one person at', unit: '%', min: 50, max: 100 },
  { key: 'resilienceSpecialist', group: 'Resilience', label: 'A person is a specialist at', unit: '%', min: 50, max: 100 },
  { key: 'unusualChange', group: 'Unusual months', label: 'Differs from the typical month by', unit: '%', min: 1, max: 500 },
  { key: 'unusualMinHours', group: 'Unusual months', label: 'And by at least', unit: 'h', min: 0, max: 1000 },
  { key: 'unusualMinMonths', group: 'Unusual months', label: 'Elapsed months with data needed', unit: 'months', min: 2, max: 12 },
  { key: 'healthGreen', group: 'Plan health', label: 'Green from', unit: 'points', min: 1, max: 100 },
  { key: 'healthAmber', group: 'Plan health', label: 'Amber from', unit: 'points', min: 0, max: 99 },
  { key: 'persistentMonths', group: 'Persistent overload', label: 'Overloaded in consecutive elapsed months', unit: 'months', min: 2, max: 12 },
  { key: 'concentrationTop', group: 'Concentration', label: 'Top share of people', unit: '%', min: 1, max: 100 },
]
const fieldOf = Object.fromEntries(thresholdFields.map((field) => [field.key, field])) as Record<ThresholdKey, typeof thresholdFields[number]>
export const validThreshold = (key: ThresholdKey, value: number) => Number.isFinite(value) && value >= fieldOf[key].min && value <= fieldOf[key].max && (fieldOf[key].unit !== 'months' || Number.isInteger(value))
// Read from the shared app data: each value checked against its range; a missing or wrong one takes the built-in value;
// amber must stay below green. Undefined when every value is the built-in one (nothing stored).
export function normalizeInsightThresholds(value: unknown): InsightThresholds | undefined {
  if (!value || typeof value !== 'object') return undefined
  const input = value as Record<string, unknown>
  const result = Object.fromEntries(thresholdFields.map(({ key }) => { const number = Number(input[key]); return [key, input[key] != null && input[key] !== '' && validThreshold(key, number) ? number : defaultInsightThresholds[key]] })) as unknown as InsightThresholds
  if (result.healthAmber >= result.healthGreen) { result.healthAmber = defaultInsightThresholds.healthAmber; result.healthGreen = defaultInsightThresholds.healthGreen }
  return thresholdFields.every(({ key }) => result[key] === defaultInsightThresholds[key]) ? undefined : result
}
export const thresholdsOf = (settings: { insightThresholds?: InsightThresholds }) => settings.insightThresholds ?? defaultInsightThresholds
