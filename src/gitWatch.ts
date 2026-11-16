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
  [/(^|\/)feature-setup\/[^/]+\.json$/, 'Your Feature setup'],
  [/(^|\/)qe-mapping\.json$/, 'QE Mapping'],
  [/(^|\/)azure-views\.json$/, 'Stream mapping and connections'],
  [/(^|\/)monthly-pack-setup\.json$/, 'Monthly pack setup'],
  [/(^|\/)monthly-pack\/(\d{4}-\d{2})\.json$/, 'Monthly pack $2'],
  [/(^|\/)personal-views-defaults\.json$/, 'Default views'],
  [/(^|\/)personal-views\/[^/]+\.json$/, 'Your views'],
  [/(^|\/)history-hours\.json$/, 'Historical hours'],
]
export function fileLabel(path: string, planningPath: string) {
  if (path === planningPath) return 'Planning data (capacity, calculation profiles, resources, table defaults)'
  for (const [pattern, label] of fileNames) { const match = pattern.exec(path); if (match) return label.replace('$2', match[2] ?? '') }
  return path
}
