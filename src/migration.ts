import type { ActivityStatus, ActivityType } from './domain'

export const transformedDataHeaders = [
  'Stream(Features)', 'Project / Release Title', 'Service/Project/Release', 'Project / Release Type',
  'Current Milestone', 'Supporting Team member', 'Column1', 'Region', 'Month', 'Expected', 'Actual',
  'Month(Date)', 'Total Working Hours', 'Standard Hours (Meetings + Break)', 'Total Working Hrs - Break',
  'Regional Holiday Hours', 'Role',
] as const

export type TransformedHeader = (typeof transformedDataHeaders)[number]
export type TransformedRow = Record<TransformedHeader, string>

export interface MigrationPreviewRow {
  sourceRow: number; raw: TransformedRow; name: string; resourceName: string; type: ActivityType
  status: ActivityStatus; month: string; plannedHours: number | null; actualHours: number | null
  warnings: string[]; errors: string[]
}

export function parseTransformedCsv(text: string) {
  return parseTransformedMatrix(parseCsv(text))
}

export function parseTransformedMatrix(source: ReadonlyArray<ReadonlyArray<unknown>>) {
  const matrix = source.map((row) => row.map(stringifyCell))
  if (!matrix.length) return { rows: [] as MigrationPreviewRow[], missingHeaders: [...transformedDataHeaders], extraHeaders: [] as string[] }
  const headers = matrix[0].map(normalizeHeader)
  const missingHeaders = transformedDataHeaders.filter((header) => !headers.includes(header))
  const extraHeaders = headers.filter((header) => header && !transformedDataHeaders.includes(header as TransformedHeader))
  const rows = matrix.slice(1).filter((row) => row.some((value) => value.trim())).map((values, index) => {
    const raw = Object.fromEntries(transformedDataHeaders.map((header) => [header, values[headers.indexOf(header)]?.trim() ?? ''])) as TransformedRow
    return mapPreview(raw, index + 2)
  })
  return { rows, missingHeaders, extraHeaders }
}

export function isTransformedDataSheet(source: ReadonlyArray<ReadonlyArray<unknown>>) {
  const headers = (source[0] ?? []).map(stringifyCell).map(normalizeHeader)
  return headers.includes('Project / Release Title') && headers.includes('Month(Date)') && headers.includes('Expected') && headers.includes('Actual')
}

function mapPreview(raw: TransformedRow, sourceRow: number): MigrationPreviewRow {
  const name = raw['Project / Release Title'].trim()
  const resourceName = raw['Supporting Team member'].trim()
  const month = toMonthKey(raw['Month(Date)'])
  const plannedHours = toNumber(raw.Expected)
  const actualHours = toNumber(raw.Actual)
  const errors: string[] = []
  const warnings: string[] = []
  if (!name) errors.push('Missing Project / Release Title')
  if (!month) errors.push('Invalid Month(Date)')
  if (raw.Expected && plannedHours === null) errors.push('Expected is not numeric')
  if (raw.Actual && actualHours === null) errors.push('Actual is not numeric')
  if (!resourceName) warnings.push('No Supporting Team member; activity will be unassigned')
  const type = inferActivityType(raw)
  if (!raw['Service/Project/Release'] && type === 'Other') warnings.push('Review inferred activity type')
  return { sourceRow, raw, name, resourceName, type, status: inferStatus(raw['Current Milestone']), month, plannedHours, actualHours, warnings, errors }
}

export function inferActivityType(raw: TransformedRow): ActivityType {
  const category = raw['Service/Project/Release'].toLowerCase()
  const releaseType = raw['Project / Release Type'].toLowerCase()
  const stream = raw['Stream(Features)'].toLowerCase()
  if (category === 'release') return 'Release'
  if (category === 'project' || category === 'project catalyst') return 'Project'
  if (releaseType.includes('training')) return 'Learning'
  if (releaseType.includes('improvement') || releaseType.includes('continuous')) return 'Improvement'
  if (category === 'service' || category === 'tool validation' || stream.includes('other activities')) return 'BAU'
  return 'Other'
}

export function inferStatus(milestone: string): ActivityStatus {
  const value = milestone.toLowerCase()
  if (/complete|closed|exit/.test(value)) return 'Completed'
  if (/risk|delay|block|hold/.test(value)) return 'At Risk'
  if (/yet to start|upcoming|not started/.test(value)) return 'Not Started'
  if (/ongoing|on-going|kicked|started|iq|oq|prd|sfv|sver|dt|rpe/.test(value)) return 'In Progress'
  return 'Not Started'
}

export function toMonthKey(value: string) {
  const trimmed = value.trim()
  const iso = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(trimmed)
  if (iso) return `${iso[1]}-${iso[2]}`
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed)
  if (!slash) return ''
  const month = Number(slash[1])
  return month >= 1 && month <= 12 ? `${slash[3]}-${String(month).padStart(2, '0')}` : ''
}

export function toNumber(value: string) {
  if (!value.trim()) return null
  const parsed = Number(value.replaceAll(',', '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeHeader(value: string) { return value.replace(/^\uFEFF/, '').trim() }

function stringifyCell(value: unknown) {
  if (value == null) return ''
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  return String(value)
}

function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1 }
      else if (character === '"') quoted = false
      else field += character
    } else if (character === '"') quoted = true
    else if (character === ',') { row.push(field); field = '' }
    else if (character === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = '' }
    else field += character
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row) }
  return rows
}
