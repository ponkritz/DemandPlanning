// Single source for navigation labels, header text and grouping so the sidebar and page header always agree.
export type Page = 'mydash' | 'activities' | 'planover' | 'capactual' | 'overview' | 'pulse' | 'pireview' | 'mywork' | 'bulk' | 'baselines' | 'board' | 'health' | 'windchill' | 'brite' | 'snapshots' | 'qemapping' | 'admin' | 'docs'
export type PageGroup = 'Data Insights' | 'My Work' | 'Testing' | 'I&D Board' | 'Release Details' | 'Other views' | 'Data & governance' | 'Settings'

// hidden: kept in the build but not offered in the menu.
export interface PageMeta { id: Page; label: string; icon: string; group: PageGroup; detail: string; usesMonth: boolean; hidden?: boolean }

export const pages: PageMeta[] = [
  { id: 'mydash', label: 'My dashboard', icon: '◐', group: 'Data Insights', detail: 'Your hours against your capacity, your open work and your streams and releases.', usesMonth: true },
  { id: 'overview', label: 'Team overview', icon: '▦', group: 'Data Insights', detail: 'The team at a glance: six headline tiles, each opening its analysis — capacity and workload, streams, plan quality — for a period and filters.', usesMonth: false },
  { id: 'pulse', label: 'Pulse Check', icon: '◔', group: 'Data Insights', detail: 'Last month’s releases and analysis, ongoing activities, and the current month’s releases.', usesMonth: true },
  { id: 'pireview', label: 'PI Review', icon: '◈', group: 'Data Insights', detail: 'PI summary for the PI Review (planned).', usesMonth: false },
  { id: 'activities', label: 'My Activities', icon: '✎', group: 'My Work', detail: 'Your activities for the month: add this month’s tasks, enter planned and actual hours, and see what is left before the deadline.', usesMonth: true },
  { id: 'planover', label: 'Planning Overview', icon: '▥', group: 'Testing', detail: 'The team’s month at a glance: workload against capacity, delivery against Target dates, baseline and capacity exceptions, health per Epic.', usesMonth: true },
  { id: 'capactual', label: 'Capacity vs Actual', icon: '◑', group: 'Testing', detail: 'What the team had — capacity after leave and holidays — against the hours it booked: tiles, 12 months, each person and where the hours went.', usesMonth: true },
  { id: 'mywork', label: 'Assigned to Me', icon: '◉', group: 'My Work', detail: 'Your pending Azure DevOps items; finish them with Resolved or Closed.', usesMonth: false },
  { id: 'bulk', label: 'Sprint check', icon: '⇉', group: 'My Work', detail: 'Move your User Stories from past Sprints to the current one, and check the states of your Features and User Stories.', usesMonth: false },
  { id: 'baselines', label: 'Baselines', icon: '⌁', group: 'Data & governance', detail: 'Release baselines from estimation rules and scope, against booked hours; plus the monthly task plan check.', usesMonth: true },
  { id: 'board', label: 'Backlogs', icon: '▤', group: 'I&D Board', detail: 'Plan and track the team’s work in an expandable Epic → Feature → User Story → Task backlog.', usesMonth: false },
  { id: 'health', label: 'Backlog Health', icon: '◎', group: 'I&D Board', detail: 'What the Scrum Master needs from the backlog, for everyone in Time Writing: open work in Sprints that have ended, Features without DoD, unassigned work; each list as CSV.', usesMonth: false },
  { id: 'windchill', label: 'Import Windchill export', icon: '◇', group: 'Release Details', detail: 'A Windchill search exported to CSV and imported here: its results with the file’s columns, and its releases for the chosen month.', usesMonth: true },
  { id: 'brite', label: 'BRITE', icon: '◇', group: 'Release Details', detail: 'BRITE releases (planned): the exports and their rules are still to be defined.', usesMonth: false },
  { id: 'qemapping', label: 'QE Mapping', icon: '⇄', group: 'Data & governance', detail: 'QE mapping (planned).', usesMonth: false },
  { id: 'snapshots', label: 'Snapshots', icon: '▣', group: 'Data & governance', detail: 'Save point-in-time app data to SharePoint for LTE and PI Review; manage browser backups.', usesMonth: true },
  { id: 'admin', label: 'Settings', icon: '⚙', group: 'Settings', detail: 'Azure DevOps connections, Git and SharePoint storage, capacity, periods, resources, master data and audit.', usesMonth: true },
  { id: 'docs', label: 'Documentation', icon: '☰', group: 'Data & governance', detail: 'Requirements, test plan and the other project documents of this build.', usesMonth: false },
]

// The Azure DevOps views are split: cloud ones under I&D Board, on-prem (Azure DevOps Server) ones under Release Details
// with the Windchill exports.
// Settings is a group of its own: one menu entry per Settings page (SET-14).
// Testing (ACT-01): pages being tried out before they replace others; shown only to the Admin role.
export const pageGroups: PageGroup[] = ['Data Insights', 'My Work', 'Testing', 'I&D Board', 'Release Details', 'Other views', 'Data & governance', 'Settings']
export const pageMeta = (id: Page) => pages.find((page) => page.id === id)!
