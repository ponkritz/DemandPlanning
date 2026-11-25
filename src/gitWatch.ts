// GIT-15: picking up what others save to Git while the app is open. Every shared file the app reads or writes is
// remembered with the version (blob sha) it has; a check lists the folders of those files (one call per folder, no
// file contents) and names the files whose version in Git is no longer the one remembered.

export type SeenVersions = Record<string, string | null>
export interface FolderEntry { path: string; sha: string }

export const watchIntervalMs = 5 * 60 * 1000
// A check when the window comes back is skipped when the last one is more recent than this.
export const watchFocusGapMs = 60 * 1000

export const folderOf = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
export const watchedFolders = (seen: SeenVersions) => [...new Set(Object.keys(seen).map(folderOf))].sort()

// The files whose version differs: changed, created (remembered as missing, now there) or removed. A folder that was
// not listed (its listing failed) says nothing about its files.
export function changedFiles(seen: SeenVersions, listings: Record<string, FolderEntry[]>): string[] {
  return Object.keys(seen).filter((path) => {
    const listing = listings[folderOf(path)]
    if (!listing) return false
    const now = listing.find((entry) => entry.path === path)?.sha ?? null
    return now !== seen[path]
  }).sort()
}

// Names people know the shared files by, for the banner.
const fileNames: [RegExp, string][] = [
  [/(^|\/)access\.json$/, 'Access'],
  [/(^|\/)feature-setup\.json$/, 'Feature setup'],
  [/(^|\/)epic-setup\.json$/, 'Epic setup'],
  [/(^|\/)feature-setup\/[^/]+\.json$/, 'Your Feature setup'],
  [/(^|\/)qe-mapping\.json$/, 'QE Mapping'],
  [/(^|\/)azure-views\.json$/, 'Stream mapping and connections'],
  [/(^|\/)custom-streams\.json$/, 'Custom streams'],
  [/(^|\/)monthly-pack-setup\.json$/, 'Monthly pack setup'],
  [/(^|\/)monthly-pack\/(\d{4}-\d{2})\.json$/, 'Monthly pack $2'],
  [/(^|\/)personal-views-defaults\.json$/, 'Default views'],
  [/(^|\/)personal-views\/[^/]+\.json$/, 'Your views'],
  [/(^|\/)history-hours\.json$/, 'Historical hours'],
  [/(^|\/)kpi-tracker\.json$/, 'KPI tracker'],
  [/(^|\/)tool-validations\.json$/, 'Tool Validations master list'],
  [/(^|\/)pi-review-form\.json$/, 'PI Review form'],
  [/(^|\/)on-demand\/([a-z0-9-]+)\.json$/, 'On-Demand page $2'],
  [/(^|\/)on-demand\/([a-z0-9-]+)\/(?:page\.json|rows)$/, 'On-Demand page $2'],
  [/(^|\/)row-locks\.json$/, 'Row lock timeout'],
  [/(^|\/)menu-layout\.json$/, 'Pages & menu'],
  [/(^|\/)dashboards\/([a-z0-9-]+)\.json$/, 'Dashboard $2'],
]
export function fileLabel(path: string, planningPath: string) {
  if (path === planningPath) return 'Planning data (capacity, calculation profiles, resources, table defaults)'
  for (const [pattern, label] of fileNames) { const match = pattern.exec(path); if (match) return label.replace('$2', match[2] ?? '') }
  return path
}

// ---- GIT-18: which versions are this window's own, and which page shows a newer file ----------------------------
// KB-82: the check used to compare a folder listing with the one version last remembered per file. A read that came
// back with the version before this window's own save (a read still on its way while the save ran, or GitHub answering
// for a moment with the version before the commit), a listing made while a save of this window was still on its way
// (its commit in Git, its answer not back yet — the notice set after the save had cleared it while planning data was
// being reloaded), or a listing that still showed the version before the save, made the window's own commit count as
// "saved by someone else". Now every version this window wrote — and the version each save replaced — is its own, a
// file with a save of this window on its way is left to the next check, and only a version that is none of these is newer.
export interface WatchState { seen: SeenVersions; own: Record<string, (string | null)[]>; busy: Record<string, number> }
export const emptyWatch = (): WatchState => ({ seen: {}, own: {}, busy: {} })
const ownKept = 20
// A version this window wrote (and the one it replaced): never "newer data" when a listing shows it later.
export function rememberOwn(state: WatchState, path: string, version: string | null, replaced?: string | null) {
  const list = (state.own[path] ?? []).filter((entry) => entry !== version && entry !== replaced)
  state.own[path] = [...list, ...(replaced !== undefined ? [replaced] : []), version].slice(-ownKept)
  state.seen[path] = version
}
export const beginSave = (state: WatchState, path: string) => { state.busy[path] = (state.busy[path] ?? 0) + 1 }
export const endSave = (state: WatchState, path: string) => { const left = (state.busy[path] ?? 1) - 1; if (left > 0) state.busy[path] = left; else delete state.busy[path] }
// The files with a newer version in Git than the one here, saved by someone else (or in another window): changed,
// created or removed; not one this window wrote or replaced, not one with a save of this window on its way.
export function newerFiles(state: WatchState, listings: Record<string, FolderEntry[]>): { path: string; sha: string | null }[] {
  return changedFiles(state.seen, listings).flatMap((path) => {
    if (state.busy[path]) return []
    const now = listings[folderOf(path)]?.find((entry) => entry.path === path)?.sha ?? null
    return (state.own[path] ?? []).includes(now) ? [] : [{ path, sha: now }]
  })
}

// A newer file as the page notice names it: who saved it and when (from its latest commit, when known), and whether it
// was saved in another window of this browser.
export interface RemoteChange { path: string; sha: string | null; by?: string; at?: string; otherWindow?: boolean }

// GIT-18: the pages that show each shared file. A page key is a built-in page's id ('qemapping', 'pulse' …), an Admin
// page 'admin:<tab>', or an added page 'ondemand:<page id>' (Table, Table + Insights and On-Demand Dashboard alike).
// '*' is every page; 'admin:*' every Admin page. quiet: loaded without a notice when nothing of it is unsaved here — the
// menu layout (the menu is refreshed), the default and own views, the access roles away from People & roles (GIT-23)
// and the planning data as before (GIT-15).
// loader: how the newer file is loaded without reloading the app ('reload': only a full reload can).
export interface FilePages { pages: string[]; quiet?: 'menu' | 'views' | 'planning' | 'access' | 'piForm'; loader: string }
const reportPages = ['mydash', 'overview', 'pulse', 'capactual', 'planover']
const featurePages = ['board', 'windchill', 'mywork', 'activities', 'admin:epics']
const releasePages = ['board', 'windchill', 'home', 'admin:connections', 'admin:options']
export function pagesOfFile(path: string, planningPath: string, dashboardsReading: (pageId: string) => string[] = () => []): FilePages {
  const folder = folderOf(planningPath)
  const name = folder && path.startsWith(`${folder}/`) ? path.slice(folder.length + 1) : path
  if (path === planningPath) return { pages: ['baselines', 'admin:*'], quiet: 'planning', loader: 'planning' }
  // OND-31: a row-file page's page.json and rows folder are the page's data; its locks (OND-35, on the branch `locks`, or
  // in the folder locks/ of the data branch) never raise a notice.
  if (/^locks\//.test(name)) return { pages: [], loader: 'none' }
  if (name === 'row-locks.json') return { pages: ['admin:pages'], loader: 'rowLocks' }
  const onDemand = /^on-demand\/([a-z0-9-]+)(?:\.json|\/page\.json|\/rows)$/.exec(name)
  if (onDemand) return { pages: [`ondemand:${onDemand[1]}`, ...dashboardsReading(onDemand[1]).map((id) => `ondemand:${id}`), 'admin:pages'], loader: `ondemand:${onDemand[1]}` }
  const dashboard = /^dashboards\/([a-z0-9-]+)\.json$/.exec(name)
  if (dashboard) return { pages: [`ondemand:${dashboard[1]}`], loader: 'remount' }
  if (name === 'menu-layout.json') return { pages: ['admin:pages'], quiet: 'menu', loader: 'menu' }
  if (name === 'personal-views-defaults.json' || /^personal-views\/[^/]+\.json$/.test(name)) return { pages: ['admin:my', 'admin:look'], quiet: 'views', loader: 'views' }
  // GIT-23: the roles are loaded quietly on every page (rights update in place); only Admin → People & roles, where
  // someone may be editing them, shows the notice.
  if (name === 'access.json') return { pages: ['admin:resources'], quiet: 'access', loader: 'access' }
  if (name === 'qe-mapping.json') return { pages: ['qemapping', 'board'], loader: 'qemapping' }
  if (name === 'feature-setup.json' || /^feature-setup\/[^/]+\.json$/.test(name)) return { pages: featurePages, loader: 'featureSetup' }
  if (name === 'epic-setup.json') return { pages: featurePages, loader: 'epicSetup' }
  if (name === 'custom-streams.json') return { pages: releasePages, loader: 'customStreams' }
  if (name === 'azure-views.json') return { pages: ['admin:connections', 'admin:options'], loader: 'connections' }
  if (name === 'monthly-pack-setup.json' || /^monthly-pack\/\d{4}-\d{2}\.json$/.test(name)) return { pages: ['pulse', 'admin:pack'], loader: 'monthlyPack' }
  if (name === 'history-hours.json') return { pages: [...reportPages, 'admin:history', 'admin:capacity'], loader: 'history' }
  if (name === 'kpi-tracker.json') return { pages: ['kpitracker'], loader: 'remount' }
  // TVL-02: the Tool Validations master list is shown on its Release page (a read-only view of the board page).
  if (name === 'tool-validations.json') return { pages: ['board'], loader: 'toolValidations' }
  // PIR-19: the PI Review form setup is loaded quietly on every page (the form, the comment and the split follow it);
  // only Admin → PI Review Setup (PIR-29), where someone may be editing it, shows the notice.
  if (name === 'pi-review-form.json') return { pages: ['admin:pireview'], quiet: 'piForm', loader: 'piForm' }
  // A file this build does not map: every page, and only a full reload loads it.
  return { pages: ['*'], loader: 'reload' }
}
export const pageMatches = (patterns: string[], key: string) => patterns.some((pattern) => pattern === '*' || pattern === key || (pattern.endsWith(':*') && key.startsWith(pattern.slice(0, -1))))
// The newer files the page in use shows: those of its data that are not loaded quietly.
export function changesForPage<T extends { path: string }>(changes: T[], key: string, targetOf: (path: string) => FilePages, quiet: (target: FilePages) => boolean): T[] {
  return changes.filter((change) => { const target = targetOf(change.path); return !quiet(target) && pageMatches(target.pages, key) })
}
