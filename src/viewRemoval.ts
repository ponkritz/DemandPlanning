import { deleteFile, fileSha, GitConflictError, readTextFile, siblingConfig, writeTextFile, type Fetch, type GitConfig } from './gitStorage.ts'
import { snapshotFileName, snapshotFolder } from './gitSnapshots.ts'
import { parseViews, parseViewRemovals, removalBackupName, serializeViewRemovals, serializeViews, viewsBackupFolder, viewsFile, viewsRemovedPath, withRemoval, withoutRemoval, type RemovalMode, type ViewRemoval } from './viewDefinitions.ts'
import type { AzureConnectionProfileSummary } from './azureCredentials.ts'

// CON-109…CON-112: the Git side of the Tool Owner's Remove / Delete for everyone of a shared view, and of its Restore.
// Every file sits next to the planning data file (siblingConfig). Nothing here reads or writes a PAT.
const viewsPath = 'azure-views.json'

export async function readRemovals(config: GitConfig, token: string, fetchImpl: Fetch = fetch) {
  const file = await readTextFile(siblingConfig(config, viewsRemovedPath), token, fetchImpl)
  return { removals: parseViewRemovals(file.text), sha: file.sha }
}
// The data files in Git of a shared view that exist (its on-prem data, azure-data/<id>.json): what Delete deletes.
export async function viewDataFiles(config: GitConfig, token: string, id: string, fetchImpl: Fetch = fetch) {
  const target = siblingConfig(config, `${snapshotFolder}/${snapshotFileName(id)}`)
  return (await fileSha(target, token, fetchImpl)) ? [target.path] : []
}
// A save of the markers that lost a race with another commit reads them again and tries once more.
async function saveRemovals(config: GitConfig, token: string, change: (removals: ViewRemoval[]) => ViewRemoval[] | null, message: string, fetchImpl: Fetch) {
  const marker = siblingConfig(config, viewsRemovedPath)
  const once = async () => { const current = await readRemovals(config, token, fetchImpl); const next = change(current.removals); if (!next) return false; await writeTextFile(marker, token, serializeViewRemovals(next), current.sha, message, fetchImpl); return true }
  try { return await once() } catch (error) { if (!(error instanceof GitConflictError)) throw error; return once() }
}

// In this order, so a failure part-way never loses the view: (1) a backup of its definition (views-file format, never a
// PAT or email) as a new file in azure-views-backups/, (2) the removal marker in azure-views-removed.json — from then
// on every computer leaves the view out and removes it at its next start —, (3) the shared setup (azure-views.json)
// without it, (4) Delete only: its data files in Git.
export async function removeViewInGit(config: GitConfig, token: string, view: AzureConnectionProfileSummary, mode: RemovalMode, by: string, fetchImpl: Fetch = fetch, now = new Date()) {
  if (view.mine) throw new Error('A personal view (My views) is not part of the shared setup.')
  const name = view.viewName || view.reason, verb = mode === 'delete' ? 'Delete' : 'Remove'
  const files = mode === 'delete' ? await viewDataFiles(config, token, view.id, fetchImpl) : []
  const backup = siblingConfig(config, `${viewsBackupFolder}/${removalBackupName(view.id, now)}`)
  await writeTextFile(backup, token, serializeViews(viewsFile([view])), await fileSha(backup, token, fetchImpl), `Backup before ${verb.toLowerCase()} for everyone: ${name}`, fetchImpl)
  const entry: ViewRemoval = { id: view.id, name, by, at: now.toISOString(), mode, backup: backup.path, ...(files.length ? { files } : {}), view }
  await saveRemovals(config, token, (removals) => withRemoval(removals, entry), `${verb} shared view for everyone: ${name}`, fetchImpl)
  const setup = siblingConfig(config, viewsPath)
  const current = await readTextFile(setup, token, fetchImpl)
  if (current.text) {
    const inGit = parseViews(current.text)
    if (inGit.some((item) => item.id === view.id)) await writeTextFile(setup, token, serializeViews(viewsFile(inGit.filter((item) => item.id !== view.id))), current.sha, `${verb} shared view for everyone: ${name}`, fetchImpl)
  }
  const deleted: string[] = []
  for (const path of files) if (await deleteFile({ ...config, path }, token, `${verb} shared view for everyone: ${name} (its data)`, fetchImpl)) deleted.push(path)
  return { backup: backup.path, deleted, entry }
}
// Restore (CON-112): the marker goes, so the view comes back for everyone; false when it had none.
export const clearRemovalInGit = (config: GitConfig, token: string, id: string, name: string, fetchImpl: Fetch = fetch) =>
  saveRemovals(config, token, (removals) => removals.some((entry) => entry.id === id) ? withoutRemoval(removals, id) : null, `Restore shared view for everyone: ${name}`, fetchImpl)
