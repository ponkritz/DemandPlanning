export type UserRole = 'Owner' | 'Admin' | 'ProcessOwner' | 'Contributor' | 'Viewer'
export type ActivityStatus = 'Not Started' | 'In Progress' | 'On Track' | 'At Risk' | 'Completed' | 'On Hold'
export type ActivityType = 'Project' | 'Release' | 'BAU' | 'Improvement' | 'Learning' | 'Other'
export type ResourceBand = 'Junior' | 'Senior' | 'Not Applicable'
export type Complexity = 'Low' | 'Medium' | 'High'
export type DemandClassification = 'Planned' | 'Ad-hoc'

export interface PersonRef {
  id: string
  name: string
  email: string
  role: UserRole
  active: boolean
  region?: string
  discipline?: string
}

export interface Activity {
  id: string
  name: string
  type: ActivityType
  processOwnerId: string
  resourceId?: string
  status: ActivityStatus
  startDate: string
  endDate: string
  band: ResourceBand
  complexity: Complexity
  featureCount?: number
  bugCount?: number
  stream?: string
  sourceCategory?: string
  releaseType?: string
  currentMilestone?: string
  sourceNote?: string
  region?: string
  discipline?: string
  source: 'Manual' | 'Migration' | 'TFS' | 'Windchill'
  createdAt: string
  createdBy: string
}

export interface MonthlyEffort {
  id: string
  activityId: string
  month: string
  classification: DemandClassification
  plannedHours: number | null
  actualHours: number | null
  baselineHours: number | null
  totalWorkingHours?: number | null
  standardHours?: number | null
  netWorkingHours?: number | null
  regionalHolidayHours?: number | null
  notes: string
  learnings: string
  struggles: string
  updatedAt: string
  updatedBy: string
}

export interface Baseline {
  id: string
  activityType: ActivityType
  band: ResourceBand
  complexity: Complexity
  hours: number
  effectiveFrom: string
  effectiveTo?: string
  active: boolean
  reason: string
  version: number
}

export interface PeriodControl {
  month: string
  planningDeadline: string
  actualsDeadline: string
  planningLocked: boolean
  actualsLocked: boolean
  planningExtendedUntil?: string
  actualsExtendedUntil?: string
  extensionReason?: string
  updatedAt: string
  updatedBy: string
}

export interface ReleaseRecord {
  id: string
  releaseName: string
  releaseType: string
  sourceSystem: 'TFS' | 'Windchill' | 'Manual'
  plannedClosure: string
  actualClosure?: string
  milestone: string
  featureCount: number
  bugCount: number
  uploadedAt: string
}

export interface AuditEvent {
  id: string
  timestamp: string
  actor: string
  action: string
  entity: string
  entityId: string
  detail: string
}

export interface Snapshot {
  id: string
  title: string
  type: 'LTE' | 'PI Review' | 'Monthly Pack'
  month: string
  createdAt: string
  createdBy: string
  payload: string
}

export interface MasterValue {
  id: string
  type: 'Activity Type' | 'Status' | 'Resource Band' | 'Complexity' | 'Release Type'
  value: string
  sortOrder: number
  active: boolean
}

export interface AppState {
  schemaVersion: number
  people: PersonRef[]
  activities: Activity[]
  efforts: MonthlyEffort[]
  baselines: Baseline[]
  periods: PeriodControl[]
  releases: ReleaseRecord[]
  audits: AuditEvent[]
  snapshots: Snapshot[]
  masters: MasterValue[]
}
