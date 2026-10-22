import type { BaselineRule, ReleaseScope } from './baseline'
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
  source: 'Manual' | 'TFS' | 'Windchill'
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
  azureWorkItems?: AzureWorkItem[]
  azureBacklogScope?: { organization: string; project: string; team: string; itemKeys: string[]; areaPaths: string[]; fetchedAt: string; sample?: boolean }
  capacitySettings?: { absenceEpicId?: number; hoursPerDay?: number; overloadedAt?: number; availableBelow?: number }
  baselineRules?: BaselineRule[]
  releaseScopes?: ReleaseScope[]
  resourceProfiles?: Record<string, { region?: string; role?: string; reportsTo?: string; peopleManager?: boolean }>
  releaseSource?: { organization: string; project: string; query: string; fetchedAt: string; items: AzureWorkItem[]; columns?: { ref: string; name: string }[]; orderBy?: { ref: string; desc: boolean }[]; unresolved?: string[] }
  releaseSourceSettings?: { streamSegment?: number; releasePattern?: string; approvalDateField?: string; matchThreshold?: number }
  releasePlans?: ReleasePlan[]
  // Read-only snapshots from additional Azure connections (backlog views, document sources such as Vault, reference data).
  // Windchill views' last results (Settings → Windchill views), fetched from the desktop app or loaded from Git.
  windchillSources?: { viewId: string; name: string; fetchedAt: string; query: string; columns: string[]; rows: Record<string, unknown>[]; next?: string; fromGit?: boolean }[]
  azureSources?: { connectionId: string; name: string; role: 'documents' | 'reference' | 'backlog-view' | 'release-source'; fromGit?: boolean; organization: string; project: string; query: string; fetchedAt: string; items: AzureWorkItem[]; columns?: { ref: string; name: string }[]; orderBy?: { ref: string; desc: boolean }[]; unresolved?: string[] }[]
}

export interface AzureWorkItem {
  key: string
  id: number
  organization: string
  project: string
  title: string
  description?: string
  storyPoints?: number
  originalEstimate?: number
  completedWork?: number
  remainingWork?: number
  createdDate?: string
  createdBy?: string
  workItemType: string
  state: string
  assignedTo: string
  assignedToEmail?: string
  areaPath: string
  iterationPath: string
  parentId?: number
  targetDate?: string
  closedDate?: string
  changedDate?: string
  changedBy?: string
  approvalDate?: string
  // Values of the connection query's selected columns (read-only views), keyed by field reference name.
  fields?: Record<string, string | number | boolean | null>
  tags: string
  url: string
  syncedAt: string
}

// Release planning record (TFS / Windchill / manual): milestone dates per release, kept beside the Azure data.
export type ReleaseMilestone = 'PRD' | 'SFV' | 'DT' | 'PR' | 'Design Review'
export interface ReleasePlan {
  id: string
  source: 'TFS' | 'Windchill' | 'Manual'
  program: string
  title: string
  type: 'Release' | 'PU'
  stream?: string
  milestones: Partial<Record<ReleaseMilestone, string | undefined>>
  updatedAt: string
  sample?: boolean
}
