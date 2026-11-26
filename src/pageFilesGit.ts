import { deleteFile, fileCommits, GitConflictError, listEntries, readTextFile, siblingConfig, writeTextFile, type Fetch, type GitConfig } from './gitStorage.ts'
import { GitQueueError, latestStamp, maxSaveTries, stampMessage, type Merge, type QueuedOutcome } from './gitSaveQueue.ts'
import { commitFiles, readTree, type CommitFile } from './gitTrees.ts'
import { contested, dashboardFilePath, dashboardsFolder, gitBlobSha, pageEntryOf, pageFilesFolder, type CopySet, type PageFolder, pageStem, parseStem, resolvePages, stemFilePath, stemFolderPath, updateMarker, updateMarkerPath, updateMarkerStem, type PageLocation } from './pageFiles.ts'
import { isMovedMarker, movedMarker, parseCounter, serializeCounter } from './rowFiles.ts'

// OND-120…OND-131, OND-133: the Git side of page file names — where each page is (the folder listed), a page saved to
// the file of its name (a page created from this version on moved in the same commit when its name changes; a page of
// the form before kept by its id), a row-file page's folder moved, row files a save wrote to a folder someone renamed
// meanwhile brought into the page's folder, a page's every file deleted. Paths are relative to the folder of the
// planning data (siblingConfig); `ref` is a branch or a commit.

const at = (config: GitConfig, path: string, ref = config.branch): GitConfig => ({ ...siblingConfig(config, path), branch: ref })
const rebase = (config: GitConfig, files: Record<string, CommitFile>) => Object.fromEntries(Object.entries(files).map(([path, file]) => [siblingConfig(config, path).path, file]))
// A read of a page's file: a marker left where the page was (OND-121, OND-32) counts as no file there.
async function readPageText(target: GitConfig, token: string, fetchImpl: Fetch) { const read = await readTextFile(target, token, fetchImpl); return isMovedMarker(read.text) ? { text: null, sha: null } : read }
const nameOf = (text: string | null): string | null => { if (!text) return null; try { const value = JSON.parse(text) as { name?: unknown }; return typeof value.name === 'string' ? value.name : null } catch { return null } }

// ---- where the pages are (OND-122, OND-123) ----
// The folder listed once; the markers known by their version (no read); for an id with two or more candidates the
// latest commit of each is read (rare: an older copy) to take the newer. update: the update marker's version, if any.
export interface PageListing { locations: PageLocation[]; update: { sha: string } | null }
async function resolveFolder(config: GitConfig, token: string, folder: PageFolder, fetchImpl: Fetch, ref: string) {
  const entries = await listEntries(at(config, folder, ref), token, fetchImpl)
  const ids = folder === pageFilesFolder ? [...new Set(entries.flatMap((entry) => { const page = pageEntryOf(entry); return page ? [page.id] : [] }))] : []
  const markerShas = new Set(await Promise.all(ids.map((id) => gitBlobSha(movedMarker(id)))))
  const dates: Record<string, string> = {}
  for (const path of contested(entries, markerShas, folder)) {
    const file = entries.find((entry) => `${folder}/${entry.name}` === path)?.type === 'dir' ? `${path}/page.json` : path
    try { const [last] = await fileCommits(at(config, file, ref), token, 1, fetchImpl); if (last) dates[path] = last.date } catch { /* the named form wins */ }
  }
  return { entries, locations: resolvePages(entries, markerShas, dates, folder) }
}
export async function listPages(config: GitConfig, token: string, fetchImpl: Fetch = fetch, ref = config.branch): Promise<PageListing> {
  const { entries, locations } = await resolveFolder(config, token, pageFilesFolder, fetchImpl, ref)
  const marker = entries.find((entry) => entry.type === 'file' && entry.name === `${updateMarkerStem}.json`)
  return { locations, update: marker ? { sha: marker.sha } : null }
}
// OND-134: the Dashboard blocks files in dashboards/, by page id (both forms; an older copy flagged as for the pages).
export const listDashboards = async (config: GitConfig, token: string, fetchImpl: Fetch = fetch, ref = config.branch) => (await resolveFolder(config, token, dashboardsFolder, fetchImpl, ref)).locations
export const locate = async (config: GitConfig, token: string, id: string, fetchImpl: Fetch = fetch, ref = config.branch) => (await listPages(config, token, fetchImpl, ref)).locations.find((location) => location.id === id) ?? null

// OND-121: the update marker written once (never replaced by an older app version's).
export async function ensureUpdateMarker(config: GitConfig, token: string, minVersion: string, fetchImpl: Fetch = fetch): Promise<boolean> {
  const target = at(config, updateMarkerPath)
  if ((await readTextFile(target, token, fetchImpl)).text != null) return false
  try { await writeTextFile(target, token, updateMarker(minVersion), null, `On-Demand: page files are named after the page from app version ${minVersion}`, fetchImpl); return true }
  catch (failure) { if (failure instanceof GitConflictError) return false; throw failure }
}

// ---- a page kept in one file (OND-124) ----
// The queued, merged save of GIT-17 for a page file whose name follows the page: the page is found where it is now (a
// file renamed by someone else since it was read here is found again by listing the folder), the change merged into
// the latest content, and written — to the same file when the page's name stays or the page is of the form before
// (OND-133: kept by its id for good, only the title changes), else moved: the old file deleted and the new one created
// in ONE commit, from the commit it is made on (a save or a rename made meanwhile is merged first; nothing is
// overwritten). A new page is created at "<name>--<id>".
export interface TextChange { text: string; base: string | null; at: string; message: string; merge: Merge }
export interface PageSaved extends QueuedOutcome { text: string; replaced: string | null; stem: string; fromStem: string | null; dashboard?: { from: string; to: string } }
class Relocate extends Error {}
export async function writePageFile(config: GitConfig, token: string, id: string, change: TextChange, knownStem: string | null, fetchImpl: Fetch = fetch, tries = maxSaveTries): Promise<PageSaved> {
  let stem = knownStem, listed = false
  for (let attempt = 1; attempt <= tries + 1; attempt++) {
    let latest: { text: string | null; sha: string | null } = stem ? await readPageText(at(config, stemFilePath(stem)), token, fetchImpl) : { text: null, sha: null }
    if (latest.text == null && !listed) {
      listed = true
      const found = await locate(config, token, id, fetchImpl)
      if (found && !found.rows && found.stem !== stem) { stem = found.stem; latest = await readPageText(at(config, stemFilePath(stem)), token, fetchImpl) }
    }
    let next = change.text
    if (latest.text != null && latest.text !== change.base && latest.text !== change.text) {
      const theirs = stem ? await latestStamp(at(config, stemFilePath(stem)), token, fetchImpl) : null
      next = change.merge(change.base, change.text, latest.text, !theirs || change.at >= theirs)
    }
    const merged = next !== change.text
    const before = nameOf(latest.text), after = nameOf(next) ?? ''
    const target = latest.text == null || !stem ? pageStem(after, id) : before !== after && parseStem(stem)?.named ? pageStem(after, id) : stem
    if (latest.text === next && target === stem) return { sha: latest.sha, commitUrl: '', merged, unchanged: true, keptNewer: false, text: next, replaced: latest.sha, stem, fromStem: stem }
    try {
      if (latest.text == null || !stem || target === stem) {
        const written = await writeTextFile(at(config, stemFilePath(target)), token, next, latest.text == null ? null : latest.sha, stampMessage(change.message, change.at), fetchImpl)
        return { ...written, merged, unchanged: false, keptNewer: false, text: next, replaced: latest.sha, stem: target, fromStem: latest.text == null ? null : stem }
      }
      const from = stem
      let text = next, to = target
      let dashboard: { from: string; to: string } | undefined
      const done = await commitFiles(at(config, ''), token, async (commit) => {
        // At the commit it is made on: the file still where it was read (else found again), merged with a save made meanwhile.
        const now = await readPageText(at(config, stemFilePath(from), commit), token, fetchImpl)
        if (now.text == null) throw new Relocate('moved')
        text = now.text === latest.text ? next : change.merge(change.base, change.text, now.text, true)
        to = nameOf(now.text) !== nameOf(text) ? pageStem(nameOf(text) ?? '', id) : from
        const files: Record<string, CommitFile> = { [stemFilePath(to)]: text }
        dashboard = undefined
        if (to !== from) {
          files[stemFilePath(from)] = null
          // OND-134: the page's Dashboard blocks file of the same name moves in the same commit (by its version).
          for (const entry of await listEntries(at(config, dashboardsFolder, commit), token, fetchImpl)) {
            const found = pageEntryOf(entry, dashboardsFolder)
            if (found?.id === id && found.stem === from) { files[found.path] = null; files[dashboardFilePath(to)] = { sha: found.sha }; dashboard = { from: found.path, to: dashboardFilePath(to) } }
          }
        }
        return { files: rebase(config, files), message: stampMessage(change.message, change.at) }
      }, fetchImpl)
      return { sha: await gitBlobSha(text), commitUrl: done.commitUrl, merged: text !== change.text, unchanged: false, keptNewer: false, text, replaced: latest.sha, stem: to, fromStem: from, ...(dashboard ? { dashboard } : {}) }
    } catch (failure) {
      if (failure instanceof Relocate) { listed = false; stem = (await locate(config, token, id, fetchImpl))?.stem ?? null; continue }
      if (!(failure instanceof GitConflictError)) throw failure
      // Created meanwhile (or renamed): found again on the next try.
      listed = false
    }
  }
  throw new GitQueueError(`${stem ? stemFilePath(stem) : `${pageFilesFolder}/…--${id}.json`} kept changing in Git while saving (${tries} tries). Your change is kept here and not lost: choose Retry to save it again.`)
}

// ---- a page kept as row files (OND-124, OND-129) ----
// Every file under a folder at a commit, as paths below it ("page.json", "rows/K.json") with their versions.
export async function folderFiles(config: GitConfig, token: string, stem: string, ref: string, fetchImpl: Fetch = fetch): Promise<{ file: string; sha: string }[]> {
  const out: { file: string; sha: string }[] = []
  const entries = await listEntries(at(config, stemFolderPath(stem), ref), token, fetchImpl)
  const walk = async (prefix: string, sha: string) => { for (const entry of await readTree(config, token, sha, fetchImpl)) { if (entry.type === 'blob') out.push({ file: `${prefix}/${entry.name}`, sha: entry.sha }); else if (entry.type === 'tree') await walk(`${prefix}/${entry.name}`, entry.sha) } }
  for (const entry of entries) { if (entry.type === 'file') out.push({ file: entry.name, sha: entry.sha }); else await walk(entry.name, entry.sha) }
  return out
}
// The name (and description, columns …) of a row-file page saved: page.json merged with a save made meanwhile; when
// the name of a page kept under its name changes (not one of the form before, OND-133), the whole folder moves to
// "<new name>--<id>" in the same commit (every file by its version, none
// read or sent again). From the commit it is made on: a folder renamed meanwhile is found again there.
export async function saveRowHead(config: GitConfig, token: string, id: string, change: TextChange, fetchImpl: Fetch = fetch): Promise<{ commit: string; commitUrl: string; text: string; stem: string; fromStem: string; merged: boolean }> {
  let result = { text: change.text, stem: '', fromStem: '' }
  const done = await commitFiles(at(config, ''), token, async (commit) => {
    const where = await locate(config, token, id, fetchImpl, commit)
    if (!where?.rows) throw new Error(`The page ${id} is no longer in Git as row files.`)
    const headPath = `${stemFolderPath(where.stem)}/page.json`
    const now = await readTextFile(at(config, headPath, commit), token, fetchImpl)
    if (now.text == null) throw new Error(`${headPath} is not in Git.`)
    let text = change.text
    if (now.text !== change.base && now.text !== change.text) {
      const theirs = await latestStamp(at(config, headPath, commit), token, fetchImpl).catch(() => null)
      text = change.merge(change.base, change.text, now.text, !theirs || change.at >= theirs)
    }
    const to = nameOf(now.text) !== nameOf(text) && parseStem(where.stem)?.named ? pageStem(nameOf(text) ?? '', id) : where.stem
    const files: Record<string, CommitFile> = {}
    if (to === where.stem) files[headPath] = text
    else for (const { file, sha } of await folderFiles(config, token, where.stem, commit, fetchImpl)) { files[`${stemFolderPath(where.stem)}/${file}`] = null; files[`${stemFolderPath(to)}/${file}`] = file === 'page.json' ? text : { sha } }
    result = { text, stem: to, fromStem: where.stem }
    return { files: rebase(config, files), message: stampMessage(change.message, change.at) }
  }, fetchImpl)
  return { ...done, ...result, merged: result.text !== change.text }
}
// OND-129: a row save written to the folder it was found in while someone renamed the folder meanwhile leaves files at
// the old name (a row, the counter) without page.json: they are brought into the page's folder in one commit — a row
// file replaces the copy that moved with the rename (it is the later save), the counter takes the higher number. A
// folder that holds page.json is a copy of its own (OND-123), never touched. false when there was nothing to bring.
export async function bringStrays(config: GitConfig, token: string, fromStem: string, toStem: string, message: string, fetchImpl: Fetch = fetch): Promise<boolean> {
  if (fromStem === toStem) return false
  let moved = false
  const head = await listEntries(at(config, stemFolderPath(fromStem)), token, fetchImpl)
  if (!head.length || head.some((entry) => entry.name === 'page.json')) return false
  await commitFiles(at(config, ''), token, async (commit) => {
    const files: Record<string, CommitFile> = {}
    const strays = await folderFiles(config, token, fromStem, commit, fetchImpl)
    if (strays.some((entry) => entry.file === 'page.json')) throw new Error(`${stemFolderPath(fromStem)}/ is a copy of the page of its own.`)
    for (const { file, sha } of strays) {
      files[`${stemFolderPath(fromStem)}/${file}`] = null
      if (file === 'counter.json') {
        const mine = parseCounter((await readTextFile(at(config, `${stemFolderPath(fromStem)}/counter.json`, commit), token, fetchImpl)).text) ?? 1
        const theirs = parseCounter((await readTextFile(at(config, `${stemFolderPath(toStem)}/counter.json`, commit), token, fetchImpl)).text) ?? 1
        files[`${stemFolderPath(toStem)}/counter.json`] = serializeCounter(Math.max(mine, theirs))
      } else files[`${stemFolderPath(toStem)}/${file}`] = { sha }
    }
    moved = strays.length > 0
    return { files: rebase(config, files), message }
  }, fetchImpl)
  return moved
}

// ---- a page deleted (OND-10, PGB-20, OND-130) ----
// Every file and folder of the page's id — its file or folder in either form, an older copy, the marker — as ONE commit,
// from the folder as it is at that commit. false when the page has nothing in Git (deleted meanwhile).
class Nothing extends Error {}
export async function removePage(config: GitConfig, token: string, id: string, message: string, fetchImpl: Fetch = fetch, folder: PageFolder = pageFilesFolder): Promise<boolean> {
  // A page kept in one file and nothing else of its id (the usual case): that file deleted, as before.
  const own = (await listEntries(at(config, folder), token, fetchImpl)).flatMap((entry) => { const page = pageEntryOf(entry, folder); return page?.id === id ? [page] : [] })
  if (!own.length) return false
  if (own.length === 1 && own[0].kind === 'file') return deleteFile(at(config, own[0].path), token, message, fetchImpl)
  try {
    await commitFiles(at(config, ''), token, async (commit) => {
      const files: Record<string, CommitFile> = {}
      for (const entry of await listEntries(at(config, folder, commit), token, fetchImpl)) {
        const page = pageEntryOf(entry, folder)
        if (!page || page.id !== id) continue
        if (page.kind === 'file') files[page.path] = null
        else for (const { file } of await folderFiles(config, token, page.stem, commit, fetchImpl)) files[`${page.path}/${file}`] = null
      }
      if (!Object.keys(files).length) throw new Nothing('nothing')
      return { files: rebase(config, files), message }
    }, fetchImpl)
    return true
  } catch (failure) { if (failure instanceof Nothing) return false; throw failure }
}

// ---- the Dashboard blocks file (OND-134) ----
// Where a page's blocks file is when the save runs: listed, else named as the page's own file (pageStem; a page from
// before: its id). The write itself is the queued, merged save of GIT-17 (gitSaveQueue.writeQueuedText).
export async function dashboardTarget(config: GitConfig, token: string, id: string, pageStemNow: string | null, fetchImpl: Fetch = fetch): Promise<string> {
  const found = (await listDashboards(config, token, fetchImpl)).find((location) => location.id === id)
  return found ? found.path : dashboardFilePath(pageStemNow ?? id)
}

// ---- Delete older copy (OND-135) ----
// The older copies of a page (OND-123) — its file or folder, its Dashboard blocks file — deleted in ONE commit, from
// the repository as it is at that commit: only a path that is still an older copy there is deleted (never the copy
// the reader reads, never one that became the newer meanwhile). Nothing left to delete: an error, nothing written.
export async function removeOlderCopies(config: GitConfig, token: string, id: string, sets: CopySet[], message: string, fetchImpl: Fetch = fetch): Promise<{ commit: string; commitUrl: string; deleted: string[] }> {
  let deleted: string[] = []
  const done = await commitFiles(at(config, ''), token, async (commit) => {
    const files: Record<string, CommitFile> = {}
    deleted = []
    for (const set of sets) {
      const where = (await resolveFolder(config, token, set.folder, fetchImpl, commit)).locations.find((location) => location.id === id)
      for (const path of set.older) {
        if (!where?.others.includes(path) || where.path === path) continue
        if (path.endsWith('/')) { const stem = path.slice(set.folder.length + 1, -1); for (const { file } of await folderFiles(config, token, stem, commit, fetchImpl)) files[`${path}${file}`] = null }
        else files[path] = null
        deleted.push(path)
      }
    }
    if (!deleted.length) throw new Error('The older copy is no longer in Git (deleted or changed meanwhile): nothing was deleted. Reload from Git.')
    return { files: rebase(config, files), message }
  }, fetchImpl)
  return { ...done, deleted }
}
