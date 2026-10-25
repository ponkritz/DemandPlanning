// Single source for navigation labels, header text and grouping so the sidebar and page header always agree.
export type Page = 'overview' | 'pulse' | 'pireview' | 'mywork' | 'bulk' | 'monthly' | 'baselines' | 'board' | 'health' | 'windchill' | 'snapshots' | 'qemapping' | 'admin' | 'docs'
export type PageGroup = 'Data Insights' | 'My Work' | 'I&D Board' | 'Release Details' | 'Data & governance'

export interface PageMeta { id: Page; label: string; icon: string; group: PageGroup; detail: string; usesMonth: boolean }

export const pages: PageMeta[] = [
  { id: 'overview', label: 'Dashboard', icon: '▦', group: 'Data Insights', detail: 'Demand, capacity and the decisions ahead: utilization, overload, rebalancing, region and role, trends, people and streams for a period and filters.', usesMonth: false },
  { id: 'pulse', label: 'Pulse Check', icon: '◔', group: 'Data Insights', detail: 'Last month’s releases and analysis, ongoing activities, and the current month’s releases.', usesMonth: true },
  { id: 'pireview', label: 'PI Review', icon: '◈', group: 'Data Insights', detail: 'PI summary for the PI Review (planned).', usesMonth: false },
  { id: 'mywork', label: 'Assigned to Me', icon: '◉', group: 'My Work', detail: 'Your pending Azure DevOps items; finish them with Resolved or Closed.', usesMonth: false },
  { id: 'monthly', label: 'Monthly Time Writing', icon: '◫', group: 'My Work', detail: 'Selected-month Tasks are the source for Azure Original Estimate and Completed Work.', usesMonth: true },
  { id: 'bulk', label: 'Bulk actions', icon: '⇉', group: 'My Work', detail: 'Move your User Stories from past Sprints to the current one, and add this month’s Time Writing story and task for your Features.', usesMonth: false },
  { id: 'baselines', label: 'Baselines', icon: '⌁', group: 'Data & governance', detail: 'Release baselines from estimation rules and scope, against booked hours; plus the monthly task plan check.', usesMonth: true },
  { id: 'board', label: 'Backlogs', icon: '▤', group: 'I&D Board', detail: 'Plan and track the team’s work in an expandable Epic → Feature → User Story → Task backlog.', usesMonth: false },
  { id: 'health', label: 'Backlog Health', icon: '◎', group: 'I&D Board', detail: 'What the Scrum Master needs from the backlog, for everyone in Time Writing: open work in Sprints that have ended, Features without DoD, unassigned work; each list as CSV.', usesMonth: false },
  { id: 'windchill', label: 'Import Windchill export', icon: '◇', group: 'Release Details', detail: 'A Windchill search exported to CSV and imported here: its results with the file’s columns.', usesMonth: false },
  { id: 'qemapping', label: 'QE Mapping', icon: '⇄', group: 'Data & governance', detail: 'QE mapping (planned).', usesMonth: false },
  { id: 'snapshots', label: 'Snapshots', icon: '▣', group: 'Data & governance', detail: 'Save point-in-time app data to SharePoint for LTE and PI Review; manage browser backups.', usesMonth: true },
  { id: 'admin', label: 'Settings', icon: '⚙', group: 'Data & governance', detail: 'Azure DevOps connections, Git and SharePoint storage, capacity, periods, resources, master data and audit.', usesMonth: true },
  { id: 'docs', label: 'Documentation', icon: '☰', group: 'Data & governance', detail: 'Requirements, test plan and the other project documents of this build.', usesMonth: false },
]

// The Azure DevOps views are split: cloud ones under I&D Board, on-prem (Azure DevOps Server) ones under Release Details
// with the Windchill exports.
export const pageGroups: PageGroup[] = ['Data Insights', 'My Work', 'I&D Board', 'Release Details', 'Data & governance']
export const pageMeta = (id: Page) => pages.find((page) => page.id === id)!
