// Single source for navigation labels, header text and grouping so the sidebar and page header always agree.
export type Page = 'home' | 'mydash' | 'activities' | 'planover' | 'capactual' | 'overview' | 'pulse' | 'pireview' | 'mywork' | 'bulk' | 'mypireview' | 'baselines' | 'board' | 'health' | 'windchill' | 'brite' | 'snapshots' | 'kpitracker' | 'ondemand' | 'admin' | 'docs'
export type PageGroup = 'Home' | 'Data Insights' | 'My Work' | 'Testing' | 'I&D Board' | 'Release Details' | 'Other views' | 'On-Demand' | 'Data & governance' | 'Settings'

// hidden: kept in the build but not offered in the menu.
export interface PageMeta { id: Page; label: string; icon: string; group: PageGroup; detail: string; usesMonth: boolean; hidden?: boolean }

export const pages: PageMeta[] = [
  // NAV-42: Home is above the menu groups (not in pageGroups): the start page, open to everyone.
  { id: 'home', label: 'Home', icon: '⌂', group: 'Home', detail: 'Every area of the app as a tile: open an area, or jump straight to one of its pages.', usesMonth: false },
  { id: 'mydash', label: 'My dashboard', icon: '◐', group: 'Data Insights', detail: 'Your hours against your capacity, your open work and your streams and releases.', usesMonth: true },
  { id: 'overview', label: 'Team overview', icon: '▦', group: 'Data Insights', detail: 'The team at a glance: six headline tiles, each opening its analysis — capacity and workload, streams, plan quality — for a period and filters.', usesMonth: false },
  { id: 'pulse', label: 'Pulse Check', icon: '◔', group: 'Data Insights', detail: 'Last month’s releases and analysis, ongoing activities, and the current month’s releases.', usesMonth: true },
  { id: 'pireview', label: 'PI Review', icon: '◈', group: 'Data Insights', detail: 'The Features of a PI and their Discussions, read from Azure DevOps.', usesMonth: false },
  { id: 'kpitracker', label: 'KPI tracker', icon: '◫', group: 'Data Insights', detail: 'The team’s KPI tracker from SharePoint, read only: read live in the desktop app, with the copy saved in Git when SharePoint cannot be reached.', usesMonth: false, hidden: true },
  { id: 'activities', label: 'Time Writing', icon: '✎', group: 'My Work', detail: 'Your activities for the month: add this month’s tasks, enter planned and actual hours, and see what is left before the deadline.', usesMonth: true },
  { id: 'planover', label: 'Planning Overview', icon: '▥', group: 'Testing', detail: 'The team’s month at a glance: workload against capacity, delivery against Target dates, baseline and capacity exceptions, health per Epic.', usesMonth: true },
  { id: 'capactual', label: 'Capacity vs Actual', icon: '◑', group: 'Testing', detail: 'What the team had — capacity after leave and holidays — against the hours it booked: tiles, 12 months, each person and where the hours went.', usesMonth: true },
  { id: 'mywork', label: 'My Tasks [Board]', icon: '◉', group: 'My Work', detail: 'Your pending Azure DevOps items; finish them with Resolved or Closed.', usesMonth: false },
  { id: 'bulk', label: 'Sprint check', icon: '⇉', group: 'My Work', detail: 'Move your User Stories from past Sprints to the current one, and check the states of your Features and User Stories.', usesMonth: false },
  // PIR-17: the Features assigned to me in a PI and my review of each (Write review…).
  { id: 'mypireview', label: 'My PI Review', icon: '◈', group: 'My Work', detail: 'The Features assigned to you in a PI and whether you have written their PI review; write it here.', usesMonth: false },
  // NAV-53: the Time Writing backlog (QMS-0025) is the last entry of My Work (product owner, 25 Nov 2026; before: I&D Board).
  { id: 'board', label: 'Backlogs', icon: '▤', group: 'My Work', detail: 'Plan and track the team’s work in an expandable Epic → Feature → User Story → Task backlog.', usesMonth: false },
  { id: 'baselines', label: 'Baselines', icon: '⌁', group: 'Data & governance', detail: 'Release baselines from estimation rules and scope, against booked hours; plus the monthly task plan check.', usesMonth: true },
  { id: 'windchill', label: 'Import Windchill export', icon: '◇', group: 'Release Details', detail: 'A Windchill search exported to CSV and imported here: its results with the file’s columns, and its releases for the chosen month.', usesMonth: true },
  { id: 'brite', label: 'BRITE', icon: '◇', group: 'Release Details', detail: 'BRITE releases (planned): the exports and their rules are still to be defined.', usesMonth: false },
  // OND-01: one entry for every On-Demand page (CoNQ first); the menu lists each page by its name under On-Demand.
  { id: 'ondemand', label: 'On-Demand', icon: '▦', group: 'On-Demand', detail: 'Blank tables the team sets up itself — CoNQ (Cost of Non-Quality) and the pages added there: columns of text, numbers, dates, drop-downs and multi-selects, rows added and edited here, shared through Git.', usesMonth: false },
  { id: 'snapshots', label: 'Snapshots', icon: '▣', group: 'Data & governance', detail: 'Save point-in-time app data to Git for LTE and PI Review; manage browser backups.', usesMonth: true },
  // NAV-53: Backlog Health is in Data & governance, before Documentation (product owner, 25 Nov 2026; before: I&D Board).
  { id: 'health', label: 'Backlog Health', icon: '◎', group: 'Data & governance', detail: 'What the Scrum Master needs from the backlog, for everyone in Time Writing: open work in Sprints that have ended, Features without DoD, unassigned work; each list as CSV.', usesMonth: false },
  { id: 'admin', label: 'Settings', icon: '⚙', group: 'Settings', detail: 'Azure DevOps connections, Git storage, capacity, periods, resources, master data and audit.', usesMonth: true },
  { id: 'docs', label: 'Documentation', icon: '☰', group: 'Data & governance', detail: 'Requirements, test plan and the other project documents of this build.', usesMonth: false },
]

// The Time Writing backlog is under My Work; the default streams' views (cloud or on-prem) under Release Details with the
// Windchill exports; every other view under Other views (NAV-32).
// I&D Board (NAV-53) has no page of its own since its two pages moved: it stays a built-in group of the page builder, so
// the pages added to it and its settings and co-owners (PGB-02, PGB-08) are kept, and its heading and Home tile are shown
// only while it holds an added page the viewer may open.
// Settings is a group of its own: one menu entry per Settings page (SET-14).
// Testing (ACT-01): pages being tried out before they replace others; shown only to the Admin role.
// On-Demand (OND-01): the pages the team sets up itself, each listed by its name.
export const pageGroups: PageGroup[] = ['Data Insights', 'My Work', 'Testing', 'I&D Board', 'Release Details', 'Other views', 'On-Demand', 'Data & governance', 'Settings']
export const pageMeta = (id: Page) => pages.find((page) => page.id === id)!

// The collapsed menu headings remembered in this browser (NAV-17, NAV-37): a heading's key is its name, except I&D Board's
// (NAV-53), whose key is new so that a state remembered while it held QMS-0025 and Backlog Health is forgotten with the
// removed sub-lists of Release Details (NAV-52); Expand all / Collapse all then see only the headings in the menu.
export const navKeyOf = (group: string) => group === 'I&D Board' ? 'group:i-d-board' : group
export const retiredNavKeys = ['release:ads', 'release:windchill', 'I&D Board']
export function readCollapsedNav(text: string | null): string[] {
  try { const saved = JSON.parse(text ?? '[]'); return Array.isArray(saved) ? [...new Set(saved.filter((key): key is string => typeof key === 'string' && !retiredNavKeys.includes(key)))] : [] } catch { return [] }
}
