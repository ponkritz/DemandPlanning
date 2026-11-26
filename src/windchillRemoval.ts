import { fileSha, siblingConfig, type Fetch, type GitConfig } from './gitStorage.ts'
import { commitFiles } from './gitTrees.ts'
import { windchillFolder } from './windchillSnapshots.ts'
import { windchillAnalysisFolder } from './windchillReleases.ts'

// CON-118: the Git side of Delete this export… on a Windchill export's page under Other views. An export lives in Git as
// its results with its setup (windchill-data/<id>.json, GIT: pushWindchill) and, once its Locations were analysed, that
// analysis (windchill-analysis/<id>-locations.json). Delete removes the ones that exist in ONE commit (their history
// stays in GitHub); nothing else is touched, and no path is taken from a file — only from the export's own ID.
const idPattern = /^[A-Za-z0-9_-]{1,120}$/
export const windchillExportPaths = (id: string) => {
  if (!idPattern.test(id)) throw new Error('Unknown Windchill export.')
  return [`${windchillFolder}/${id}.json`, `${windchillAnalysisFolder}/${id}-locations.json`]
}
const at = (config: GitConfig, path: string, ref = config.branch): GitConfig => ({ ...siblingConfig(config, path), branch: ref })

// The files of the export that are in Git now (what the confirmation lists).
export async function windchillExportFiles(config: GitConfig, token: string, id: string, fetchImpl: Fetch = fetch) {
  const found: string[] = []
  for (const path of windchillExportPaths(id)) if (await fileSha(at(config, path), token, fetchImpl)) found.push(siblingConfig(config, path).path)
  return found
}

// Deletes them as one commit, made from the repository as it is at that commit (a file deleted meanwhile is left out).
// No commit when none is left. Returns the paths deleted and the commit's link.
export async function deleteWindchillExportInGit(config: GitConfig, token: string, id: string, name: string, fetchImpl: Fetch = fetch): Promise<{ deleted: string[]; commitUrl?: string }> {
  let deleted: string[] = []
  const present = async (ref: string) => {
    const out: string[] = []
    for (const path of windchillExportPaths(id)) if (await fileSha(at(config, path, ref), token, fetchImpl)) out.push(siblingConfig(config, path).path)
    return out
  }
  if (!(await present(config.branch)).length) return { deleted }
  const result = await commitFiles({ ...config, path: '' }, token, async (commit) => {
    deleted = await present(commit)
    return { files: Object.fromEntries(deleted.map((path) => [path, null])), message: `Delete Windchill export: ${name}` }
  }, fetchImpl)
  return { deleted, commitUrl: result.commitUrl }
}
