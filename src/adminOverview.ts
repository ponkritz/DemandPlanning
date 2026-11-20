import type { SetupStep } from './setupGuide'
import type { SettingsTab } from './settingsTabs'

// ADM-01 Admin → Overview: setup health at a glance — the open Get started steps and the shared-setup checks — each
// with a link to the setting that fixes it; nothing is changed here.
export type HealthTone = 'ok' | 'todo' | 'warn' | 'info'
export interface HealthItem { id: string; title: string; detail: string; tone: HealthTone; fix?: { tab: SettingsTab; section?: string; label: string } }
export interface AdminFacts { policy: boolean; toolOwner: boolean; epicSetups: number; sharedFeatureSetups: number; ioccBulkEpic: boolean; unsaved: boolean; gitConnected: boolean; gitReadOnly: boolean }

export function adminHealth(steps: SetupStep[], facts: AdminFacts): HealthItem[] {
  const fromSteps: HealthItem[] = steps.filter((step) => step.state !== 'done').map((step) => ({ id: `step:${step.id}`, title: step.title, detail: step.why, tone: step.required ? 'todo' : 'info', ...(step.tab ? { fix: { tab: step.tab, ...(step.section ? { section: step.section } : {}), label: 'Open' } } : {}) }))
  const checks: HealthItem[] = []
  if (facts.unsaved) checks.push({ id: 'unsaved', title: 'Shared changes not yet in Git', detail: 'The planning data has changes made here that others do not see until they are saved to Git (Save to Git, below or on any shared page).', tone: 'warn' })
  if (facts.gitConnected && facts.gitReadOnly) checks.push({ id: 'readonly', title: 'Git token can read but not save', detail: 'Shared setup can be viewed but not changed from this computer.', tone: 'info', fix: { tab: 'storage', section: 'git', label: 'Git storage' } })
  if (!facts.policy) checks.push({ id: 'access', title: 'No access roles yet', detail: 'Without access.json everyone sees every page and may do everything.', tone: 'info', fix: { tab: 'resources', section: 'rights', label: 'Role rights' } })
  else if (!facts.toolOwner) checks.push({ id: 'toolowner', title: 'No Tool Owner', detail: 'Nobody holds the Tool Owner role: those who manage access change the stream mapping until one is named (CON-93).', tone: 'warn', fix: { tab: 'resources', section: 'rights', label: 'Role rights' } })
  if (!facts.ioccBulkEpic) checks.push({ id: 'iocc-epic', title: 'IOCC bulk creation Epic not chosen', detail: 'IOCC Create Features needs the Epic its Features go under.', tone: 'info', fix: { tab: 'options', section: 'bulk', label: 'Bulk creation Epics' } })
  if (!facts.epicSetups) checks.push({ id: 'epic-setup', title: 'No Epic setup yet', detail: 'Optional: the extra fields (Program, Platform…) new Features carry per Epic.', tone: 'info', fix: { tab: 'epics', section: 'setup', label: 'Epic setup' } })
  if (!facts.sharedFeatureSetups) checks.push({ id: 'feature-setup', title: 'No shared Feature setup yet', detail: 'Optional: the User Stories, DoD and estimate new Features get per Epic.', tone: 'info', fix: { tab: 'epics', section: 'setup', label: 'Feature setup' } })
  const order: Record<HealthTone, number> = { todo: 0, warn: 1, info: 2, ok: 3 }
  return [...fromSteps, ...checks].sort((a, b) => order[a.tone] - order[b.tone])
}

// ADM-03 Search settings (Ctrl K): every settings page and section by name and by what it affects.
export interface SettingsEntry { tab: SettingsTab; section?: string; label: string; page: string; words: string }
export const settingsIndex: SettingsEntry[] = [
  { tab: 'home', page: 'Overview', label: 'Overview', words: 'health to-do setup problems unsaved publish' },
  { tab: 'my', section: 'email', page: 'My settings', label: 'Your work email', words: 'me identity assigned' },
  { tab: 'my', section: 'servers', page: 'My settings', label: 'Servers and PATs', words: 'token pat azure devops server password' },
  { tab: 'my', section: 'myviews', page: 'My settings', label: 'My views', words: 'personal query wiql other views' },
  { tab: 'my', section: 'patterns', page: 'My settings', label: 'My naming patterns', words: 'release names iocc content tool validations personal' },
  { tab: 'connections', section: 'mapping', page: 'Streams', label: 'Stream mapping', words: 'dp cp iocc content tool validations query server project data sets naming patterns tool owner' },
  { tab: 'options', section: 'epics', page: 'Stream options', label: 'Epics to match Features in', words: 'feature matching board epics dp cp iocc content' },
  { tab: 'options', section: 'bulk', page: 'Stream options', label: 'Bulk creation Epics', words: 'create features bulk epic dp iocc content' },
  { tab: 'options', section: 'counts', page: 'Stream options', label: 'Release counts', words: 'completed supported placeholders entered counts' },
  { tab: 'epics', section: 'setup', page: 'Epic & Feature setup', label: 'Feature setup', words: 'user stories dod estimate all epics inherit new feature task time writing' },
  { tab: 'epics', section: 'setup', page: 'Epic & Feature setup', label: 'Setup per Epic', words: 'list every epic all epics defaults overview' },
  { tab: 'epics', section: 'setup', page: 'Epic & Feature setup', label: 'Feature fields per Epic', words: 'program platform title pattern master data fields copy to epics' },
  { tab: 'epics', section: 'lists', page: 'Epic & Feature setup', label: 'Value lists', words: 'drop-down dropdown master data values' },
  { tab: 'resources', section: 'people', page: 'People & roles', label: 'People', words: 'region role reports to joined left team' },
  { tab: 'resources', section: 'capacity-roles', page: 'People & roles', label: 'Capacity roles', words: 'qe lead manager counted capacity' },
  { tab: 'resources', section: 'rights', page: 'People & roles', label: 'Role rights', words: 'access permissions allow deny tool owner admin scrum master check access' },
  { tab: 'capacity', section: 'capacity', page: 'Capacity & time', label: 'Capacity and absence', words: 'hours per day overloaded npra absence epic' },
  { tab: 'capacity', section: 'profiles', page: 'Capacity & time', label: 'Calculation profiles', words: 'utilization figures profile' },
  { tab: 'capacity', section: 'rules', page: 'Capacity & time', label: 'Bucket rules', words: 'words tags buckets' },
  { tab: 'capacity', section: 'insights', page: 'Capacity & time', label: 'Insight thresholds', words: 'on track thresholds' },
  { tab: 'capacity', section: 'time', page: 'Capacity & time', label: 'Holidays and common activities', words: 'holiday leave training region' },
  { tab: 'capacity', section: 'period', page: 'Capacity & time', label: 'Period control', words: 'lock month plan actuals' },
  { tab: 'capacity', section: 'history', page: 'Capacity & time', label: 'Historical hours', words: 'import excel history' },
  { tab: 'pack', section: 'pack', page: 'Reports', label: 'Monthly pack', words: 'pptx slides kpi template' },
  { tab: 'pack', section: 'tables', page: 'Reports', label: 'Table and chart defaults', words: 'export csv excel columns data labels' },
  { tab: 'storage', section: 'git', page: 'Data & sharing', label: 'Git storage', words: 'github token repository' },
  { tab: 'storage', section: 'shared', page: 'Data & sharing', label: 'Shared setup in Git', words: 'backup clean up connections' },
  { tab: 'storage', section: 'sharepoint', page: 'Data & sharing', label: 'SharePoint', words: 'microsoft graph snapshot' },
  { tab: 'storage', section: 'views', page: 'Data & sharing', label: 'Other views', words: 'connections queries backlog' },
  { tab: 'storage', section: 'sample', page: 'Data & sharing', label: 'Synthetic sample', words: 'demo test data' },
  { tab: 'audit', page: 'History', label: 'History', words: 'audit changes who when' },
]
export function searchSettings(query: string, entries: SettingsEntry[] = settingsIndex): SettingsEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return entries
  const scored = entries.map((entry) => { const label = entry.label.toLowerCase(), all = `${label} ${entry.page.toLowerCase()} ${entry.words}`; return { entry, ok: words.every((word) => all.includes(word)), score: words.filter((word) => label.includes(word)).length } })
  return scored.filter((item) => item.ok).sort((a, b) => b.score - a.score).map((item) => item.entry)
}
