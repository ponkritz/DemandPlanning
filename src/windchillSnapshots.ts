import type { AppState } from './domain'
import { isWindchillView, type WindchillView } from './windchillViews.ts'

// A Windchill view's last results saved to the Git data repository (windchill-data/<view>.json, next to the planning
// data) by the desktop app, so the web app — which cannot reach Windchill — can show them. Holds the view (its search)
// and the results; no credentials (Windchill uses Windows sign-on).
export type WindchillSource = NonNullable<AppState['windchillSources']>[number]
export interface WindchillSnapshotFile { schema: 1; kind: 'windchill-view-snapshot'; view: WindchillView; source: WindchillSource }
const kind = 'windchill-view-snapshot'
export const windchillFolder = 'windchill-data'

export function windchillSnapshotFile(view: WindchillView, source: WindchillSource): WindchillSnapshotFile {
  const { fromGit: _fromGit, ...rest } = source
  return { schema: 1, kind, view, source: rest }
}
export function parseWindchillSnapshot(text: string): WindchillSnapshotFile {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new Error('A Windchill snapshot in Git is not valid JSON.') }
  const file = raw as Partial<WindchillSnapshotFile>
  if (!file || file.schema !== 1 || file.kind !== kind || !isWindchillView(file.view) || !file.source || file.source.viewId !== file.view.id || !Array.isArray(file.source.rows) || typeof file.source.fetchedAt !== 'string') throw new Error('A file in windchill-data is not a Windchill view snapshot.')
  // Rows that are not plain objects (PT-07) would throw in windchillCell for everyone who loads the file: drop them.
  file.source.rows = file.source.rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row))
  return file as WindchillSnapshotFile
}
// Newer results replace older ones, per view.
export function applyWindchillSnapshots(sources: WindchillSource[] | undefined, files: WindchillSnapshotFile[]) {
  const next = [...(sources ?? [])]
  const applied: string[] = []
  for (const file of files) {
    const index = next.findIndex((entry) => entry.viewId === file.source.viewId)
    if (index >= 0 && Date.parse(next[index].fetchedAt) >= Date.parse(file.source.fetchedAt)) continue
    const entry = { ...file.source, fromGit: true }
    if (index >= 0) next[index] = entry; else next.push(entry)
    applied.push(file.view.name)
  }
  return { sources: next, applied }
}
export async function windchillDigest(source: WindchillSource) {
  const { fetchedAt: _fetchedAt, fromGit: _fromGit, ...data } = source
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(data))))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
