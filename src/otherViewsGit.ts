import { GitConflictError, privateGitWrites, readTextFile, siblingConfig, writeTextFile, type Fetch, type GitConfig } from './gitStorage.ts'
import { retryTransient } from './gitSaveQueue.ts'
import { parseViews, serializeViews, viewsFile } from './viewDefinitions.ts'
import { assignOtherView, mergeOwnOtherViews, migrateOtherViews, otherViewsPath, parseOwnOtherViews, parseUnassigned, serializeOwnOtherViews, serializeUnassigned, unassignedOtherViewsPath, type OtherView } from './otherViews.ts'
import type { AzureConnectionProfileSummary } from './azureCredentials.ts'

// CON-119…CON-124: the Git side of the Other views — the move of the shared setup's Other views to the unassigned list,
// an admin's Assign and a person's save of their own file. Every file sits next to the planning data (siblingConfig).
// Each write is made with the version just read; a write that lost a race with another commit reads again and tries
// again (two computers moving at once end with the same result), and a network or server failure is tried once more
// after a pause (GIT-27, retryTransient). Nothing here reads or writes a PAT.
const setupPath = 'azure-views.json'
async function withConflictRetry<T>(run: () => Promise<T>, path: string): Promise<T> {
  return retryTransient(async () => {
    for (let attempt = 0; ; attempt += 1) {
      try { return await run() } catch (error) { if (!(error instanceof GitConflictError) || attempt >= 2) throw error }
    }
  }, path)
}

// CON-121: moves the Other views of azure-views.json to other-views/unassigned.json — first the list (so a failure
// part-way never loses a view), then the shared setup without them. Returns the names moved and the setup's version
// before and after this computer's write (after: null when it wrote nothing), so the forced load (GIT-29) does not take
// this computer's own write for someone else's.
export async function migrateOtherViewsInGit(config: GitConfig, token: string, removedIds: string[] = [], fetchImpl: typeof fetch = fetch) {
  const setupTarget = siblingConfig(config, setupPath), listTarget = siblingConfig(config, unassignedOtherViewsPath)
  const send = privateGitWrites(config, token, fetchImpl)
  return withConflictRetry(async () => {
    const setup = await readTextFile(setupTarget, token, fetchImpl)
    if (setup.text == null) return { moved: [] as string[], before: setup.sha, after: null as string | null }
    const views = parseViews(setup.text)
    const list = await readTextFile(listTarget, token, fetchImpl)
    const step = migrateOtherViews(views, parseUnassigned(list.text), removedIds)
    if (!step.setupChanged) return { moved: [] as string[], before: setup.sha, after: null as string | null }
    const message = step.moved.length ? `Move ${step.moved.length} Other view${step.moved.length === 1 ? '' : 's'} from the shared setup to the unassigned list: ${step.moved.join(', ')}` : 'Take Other views already moved or assigned out of the shared setup'
    if (step.unassignedChanged) await writeTextFile(listTarget, token, serializeUnassigned(step.unassigned), list.sha, message, send)
    const written = await writeTextFile(setupTarget, token, serializeViews(viewsFile(step.setup)), setup.sha, message, send)
    return { moved: step.moved, before: setup.sha, after: written.sha as string | null }
  }, setupTarget.path)
}

export async function readUnassigned(config: GitConfig, token: string, fetchImpl: Fetch = fetch) {
  const file = await readTextFile(siblingConfig(config, unassignedOtherViewsPath), token, fetchImpl)
  return { ...parseUnassigned(file.text), sha: file.sha }
}
export async function readOwnOtherViews(config: GitConfig, token: string, email: string, fetchImpl: Fetch = fetch) {
  const path = otherViewsPath(email)
  if (!path) throw new Error('Set your work email (My settings) to keep your own Other views.')
  const file = await readTextFile(siblingConfig(config, path), token, fetchImpl)
  return { views: parseOwnOtherViews(file.text, email), sha: file.sha, path }
}

// CON-120: this person's Other views saved to their file, merged with what is there (removed: the ids taken out).
export async function saveOwnOtherViewsInGit(config: GitConfig, token: string, email: string, here: AzureConnectionProfileSummary[], removed: string[], message: string, fetchImpl: typeof fetch = fetch): Promise<{ views: OtherView[]; changed: boolean; sha: string | null; path: string }> {
  const path = otherViewsPath(email)
  if (!path) throw new Error('Set your work email (My settings) to keep your own Other views.')
  const target = siblingConfig(config, path)
  const send = privateGitWrites(config, token, fetchImpl)
  return withConflictRetry(async () => {
    const file = await readTextFile(target, token, fetchImpl)
    const views = mergeOwnOtherViews(parseOwnOtherViews(file.text, email), here, email, removed)
    const text = serializeOwnOtherViews(email, views)
    if (file.text === text) return { views, changed: false, sha: file.sha, path: target.path }
    const written = await writeTextFile(target, token, text, file.sha, message, send)
    return { views, changed: true, sha: written.sha as string | null, path: target.path }
  }, target.path)
}

// CON-122: an admin assigns an unassigned view to a person — first into the person's file (so a failure part-way never
// loses the view; assigning again finds it there), then out of the unassigned list with its id recorded as assigned.
export async function assignOtherViewInGit(config: GitConfig, token: string, id: string, email: string, by: string, fetchImpl: typeof fetch = fetch, now = new Date()) {
  const path = otherViewsPath(email)
  if (!path) throw new Error('Enter the work email of the person to assign the view to.')
  const listTarget = siblingConfig(config, unassignedOtherViewsPath), ownerTarget = siblingConfig(config, path)
  const send = privateGitWrites(config, token, fetchImpl)
  const at = now.toISOString()
  return withConflictRetry(async () => {
    const list = await readTextFile(listTarget, token, fetchImpl)
    const owner = await readTextFile(ownerTarget, token, fetchImpl)
    const step = assignOtherView(parseUnassigned(list.text), parseOwnOtherViews(owner.text, email), id, email, by, at)
    const name = step.view.viewName || step.view.reason
    await writeTextFile(ownerTarget, token, serializeOwnOtherViews(email, step.owner), owner.sha, `Assign Other view ${name} to ${email}`, send)
    await writeTextFile(listTarget, token, serializeUnassigned(step.unassigned), list.sha, `Assign Other view ${name} to ${email}`, send)
    return { view: step.view, paths: [ownerTarget.path, listTarget.path] }
  }, listTarget.path)
}
