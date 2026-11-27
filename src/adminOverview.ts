import { chooseSetup, type FeatureSetupFile } from './featureSetup.ts'
import type { SetupStep } from './setupGuide'
import type { SettingsTab } from './settingsTabs'

// ADM-01 Admin → Overview: setup health at a glance — the open Get started steps and the shared-setup checks — each
// with a link to the setting that fixes it; nothing is changed here.
export type HealthTone = 'ok' | 'todo' | 'warn' | 'info'
export interface HealthItem { id: string; title: string; detail: string; tone: HealthTone; fix?: { tab: SettingsTab; section?: string; label: string } }
export interface AdminFacts { policy: boolean; toolOwner: boolean; epicSetups: number; sharedFeatureSetups: number; bulkEpicsUnset?: string[]; unsaved: boolean; gitConnected: boolean; gitReadOnly: boolean; bulkWithoutSetup?: { stream: string; epicId: number }[]; withoutDoD?: number[] }

// ADM-05: gaps in the shared Feature setup that others meet — a DP or IOCC bulk creation Epic without a shared Feature
// setup (Create Features skips every row: dpBulk.ts), and shared setups whose Feature DoD resolves to nothing (own, All
// Epics) so new Features under that Epic start without one. Only the shared file counts: others do not have my own.
export function setupGaps(shared: FeatureSetupFile | null | undefined, bulkEpics: { stream: string; epicId?: number }[]): Pick<AdminFacts, 'bulkWithoutSetup' | 'withoutDoD'> {
  const setups = { personal: null, shared: shared ?? null }
  const bulkWithoutSetup = bulkEpics.filter((entry): entry is { stream: string; epicId: number } => entry.epicId != null && !chooseSetup(setups, entry.epicId).setup)
  const withoutDoD = (shared?.epics ?? []).map((entry) => entry.epicId).filter((epicId) => !(chooseSetup(setups, epicId).setup?.featureDoD ?? '').trim()).sort((a, b) => a - b)
  return { bulkWithoutSetup, withoutDoD }
}
const ids = (list: number[]) => list.map((id) => `#${id}`).join(', ')

export function adminHealth(steps: SetupStep[], facts: AdminFacts): HealthItem[] {
  const fromSteps: HealthItem[] = steps.filter((step) => step.state !== 'done').map((step) => ({ id: `step:${step.id}`, title: step.title, detail: step.why, tone: step.required ? 'todo' : 'info', ...(step.tab ? { fix: { tab: step.tab, ...(step.section ? { section: step.section } : {}), label: 'Open' } } : {}) }))
  const checks: HealthItem[] = []
  if (facts.unsaved) checks.push({ id: 'unsaved', title: 'Shared changes not yet in Git', detail: 'The planning data has changes made here that others do not see until they are saved to Git (Save to Git, below or on any shared page).', tone: 'warn' })
  if (facts.gitConnected && facts.gitReadOnly) checks.push({ id: 'readonly', title: 'Git token can read but not save', detail: 'Shared setup can be viewed but not changed from this computer.', tone: 'info', fix: { tab: 'storage', section: 'git', label: 'Git storage' } })
  if (!facts.policy) checks.push({ id: 'access', title: 'No access roles yet', detail: 'Without access.json the app is read-only: everyone sees every page, nobody can make changes (CON-101).', tone: 'warn', fix: { tab: 'resources', section: 'rights', label: 'Role rights' } })
  else if (!facts.toolOwner) checks.push({ id: 'toolowner', title: 'No Tool Owner', detail: 'Nobody holds the Tool Owner role: those who manage access change the stream mapping until one is named (CON-93).', tone: 'warn', fix: { tab: 'resources', section: 'rights', label: 'Role rights' } })
  for (const gap of facts.bulkWithoutSetup ?? []) checks.push({ id: `bulk-setup:${gap.stream}`, title: `${gap.stream} bulk creation Epic #${gap.epicId} has no Feature setup`, detail: `${gap.stream} Create Features skips every row until Epic #${gap.epicId} has a shared Feature setup (or All Epics sets one).`, tone: 'warn', fix: { tab: 'epics', section: 'setup', label: 'Setup per Epic' } })
  if (facts.withoutDoD?.length) checks.push({ id: 'no-dod', title: `Setup per Epic without Acceptance Criteria (Feature DoD): ${ids(facts.withoutDoD)}`, detail: 'New Features under these Epics start without Acceptance Criteria (Feature DoD); fill it in the setup (or in All Epics).', tone: 'warn', fix: { tab: 'epics', section: 'setup', label: 'Setup per Epic' } })
  // ADM-05, QV-59: no bulk creation Epic is built in — each bulk stream (DP, IOCC, Content) without one mapped is listed.
  for (const stream of facts.bulkEpicsUnset ?? []) checks.push({ id: `bulk-epic:${stream}`, title: `${stream} bulk creation Epic is not set`, detail: `${stream} Create Features is disabled until the Epic its Features go under is mapped (shared, saved to Git, or your own).`, tone: 'warn', fix: { tab: 'connections', section: 'bulk', label: 'Bulk creation' } })
  if (!facts.epicSetups) checks.push({ id: 'epic-setup', title: 'No Epic setup yet', detail: 'Optional: the extra fields (Program, Platform…) new Features carry per Epic.', tone: 'info', fix: { tab: 'epics', section: 'setup', label: 'Setup per Epic' } })
  if (!facts.sharedFeatureSetups) checks.push({ id: 'feature-setup', title: 'No shared Feature setup yet', detail: 'Optional: the User Stories, DoD and estimate new Features get per Epic.', tone: 'info', fix: { tab: 'epics', section: 'setup', label: 'Setup per Epic' } })
  const order: Record<HealthTone, number> = { todo: 0, warn: 1, info: 2, ok: 3 }
  return [...fromSteps, ...checks].sort((a, b) => order[a.tone] - order[b.tone])
}

// ADM-03, SET-28 Search settings (Ctrl K): every settings page and section by name and by what it affects, one entry per
// setting (AR-080: keyed by its name; the former Feature setup and Feature fields per Epic are words of Setup per Epic).
// Old page names are among the words, so they still find the new place.
export interface SettingsEntry { tab: SettingsTab; section?: string; label: string; page: string; words: string }
export const settingsIndex: SettingsEntry[] = [
  { tab: 'home', page: 'Overview', label: 'Overview', words: 'health to-do setup problems unsaved publish latest changes' },
  { tab: 'my', section: 'email', page: 'My settings', label: 'Your work email', words: 'me identity assigned' },
  { tab: 'my', section: 'servers', page: 'My settings', label: 'Servers and PATs', words: 'token pat azure devops server password' },
  { tab: 'my', section: 'myviews', page: 'My settings', label: 'My views', words: 'personal query wiql other views starter views' },
  { tab: 'my', section: 'bulk', page: 'My settings', label: 'My bulk creation Epics', words: 'mine my own create features bulk epic dp iocc content' },
  { tab: 'my', section: 'patterns', page: 'My settings', label: 'My naming patterns', words: 'release names iocc content tool validations personal' },
  { tab: 'my', section: 'usage', page: 'My settings', label: 'My page usage', words: 'usage statistics counts visits analytics pages opened' },
  { tab: 'connections', section: 'mapping', page: 'Streams', label: 'Stream mapping', words: 'dp cp iocc content tool validations query server project data sets naming patterns tool owner epics to match features in feature matching board epics stream options' },
  { tab: 'connections', section: 'counts', page: 'Streams', label: 'Release counts', words: 'completed supported placeholders entered counts stream options' },
  { tab: 'connections', section: 'bulk', page: 'Streams', label: 'Bulk creation', words: 'bulk creation epics shared create features bulk epic dp iocc content start date target date drpe ddt stream options' },
  { tab: 'epics', section: 'setup', page: 'Feature & PI setup', label: 'Setup per Epic', words: 'feature setup user stories dod estimate all epics inherit new feature task time writing list every epic defaults overview feature fields per epic program platform title pattern master data fields copy to epics epic & feature setup' },
  { tab: 'epics', section: 'lists', page: 'Feature & PI setup', label: 'Lists', words: 'value lists drop-down dropdown master data values team lists from azure devops built-in list team members qe list people refresh on-demand column' },
  { tab: 'epics', section: 'templates', page: 'Feature & PI setup', label: 'User Story templates', words: 'story stories template reuse library tag' },
  { tab: 'epics', section: 'pireview', page: 'Feature & PI setup', label: 'PI Review form', words: 'pi review setup form gear fields headings learnings struggles move to next pi review meeting remarks comment scrum master start date' },
  { tab: 'resources', section: 'people', page: 'People & access', label: 'People', words: 'region role reports to joined left team status access bulk default time tracking started people & roles' },
  { tab: 'resources', section: 'tree', page: 'People & access', label: 'Team tree', words: 'reporting lines manager reports to org chart' },
  { tab: 'resources', section: 'rights', page: 'People & access', label: 'Role rights', words: 'access permissions allow deny tool owner admin scrum master check access emails not in azure devops leaver give access by email' },
  { tab: 'capacity', section: 'capacity', page: 'Capacity & time', label: 'Capacity', words: 'capacity and absence hours per day overloaded has capacity npra absence epic who counts capacity of the month regional holidays capacity roles qe lead manager counted' },
  { tab: 'capacity', section: 'profiles', page: 'Capacity & time', label: 'Calculation profiles', words: 'utilization figures profile' },
  { tab: 'capacity', section: 'classification', page: 'Capacity & time', label: 'Hour classification', words: 'bucket rules words tags buckets holidays and common activities holiday leave training region' },
  { tab: 'capacity', section: 'thresholds', page: 'Capacity & time', label: 'Thresholds', words: 'insight thresholds on track' },
  { tab: 'capacity', section: 'locks', page: 'Capacity & time', label: 'Month locks', words: 'period control lock month plan actuals' },
  { tab: 'pages', section: 'menu', page: 'Pages & reports', label: 'Menu groups & pages', words: 'page builder add page menu group co-owner owner table insights on-demand row locks pages & menu' },
  { tab: 'pages', section: 'pack', page: 'Pages & reports', label: 'Monthly pack', words: 'pptx slides kpi template reports' },
  { tab: 'pages', section: 'tables', page: 'Pages & reports', label: 'Table & chart defaults', words: 'table and chart defaults export csv excel columns data labels' },
  { tab: 'look', section: 'layout', page: 'Look & feel', label: 'Page layout', words: 'margins border width padding' },
  { tab: 'look', section: 'theme', page: 'Look & feel', label: 'Theme and zoom', words: 'dark light zoom' },
  { tab: 'look', section: 'start', page: 'Look & feel', label: 'Start view and menu', words: 'tiles classic home customize menu' },
  { tab: 'storage', section: 'git', page: 'Data & history', label: 'Git storage', words: 'github token repository load everything from git data & sharing' },
  { tab: 'storage', section: 'views', page: 'Data & history', label: 'Other views', words: 'connections queries backlog read-only sources by type starter views per role' },
  { tab: 'storage', section: 'shared', page: 'Data & history', label: 'Connections in Git', words: 'shared setup in git backup clean up connections' },
  { tab: 'storage', section: 'history', page: 'Data & history', label: 'Historical hours', words: 'import excel history workbook' },
  { tab: 'storage', section: 'changes', page: 'Data & history', label: 'Changes', words: 'history audit changes who when' },
  { tab: 'storage', section: 'sample', page: 'Data & history', label: 'Demo data', words: 'synthetic sample demo test data reset synthetic mvp data' },
]
export function searchSettings(query: string, entries: SettingsEntry[] = settingsIndex): SettingsEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return entries
  const scored = entries.map((entry) => { const label = entry.label.toLowerCase(), all = `${label} ${entry.page.toLowerCase()} ${entry.words}`; return { entry, ok: words.every((word) => all.includes(word)), score: words.filter((word) => label.includes(word)).length } })
  return scored.filter((item) => item.ok).sort((a, b) => b.score - a.score).map((item) => item.entry)
}
