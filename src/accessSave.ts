import { accessChangeProblem, accessFile, serializeAccess, type AccessPolicy } from './access.ts'
import { GitConflictError } from './gitStorage.ts'

// CON-131, CON-132 (AR-002, AR-003): the one way access.json is saved. Every writer (Role rights, the People drawer, the
// bulk Set access role…, Access for emails not in Azure DevOps) passes the same rule (accessChangeProblem) against the
// policy the change was made from (base), and the write carries the version (blob sha) of that policy: when someone
// else saved access.json since, Git refuses the write and nothing of theirs is overwritten.
export type AccessBase = { policy: AccessPolicy | null; sha: string | null }
export type AccessWrite = (text: string, sha: string | null, commitMessage: string) => Promise<{ sha: string; commitUrl?: string }>
export const accessConflictText = `Not saved: someone else saved ${accessFile} in Git after you started this change, so it was not written over theirs. Your change is kept here: choose Reload from Git to see theirs, then make your change again.`

export async function saveAccessChecked(write: AccessWrite, base: AccessBase, after: AccessPolicy, email: string, message: string) {
  const problem = accessChangeProblem(base.policy, after, email)
  if (problem) throw new Error(problem)
  try { return await write(serializeAccess(after), base.sha, message || `Update ${accessFile}`) } catch (failure) {
    if (failure instanceof GitConflictError) throw new Error(accessConflictText)
    throw failure
  }
}

// CON-133 (AR-001): CON-93 also inside Git storage — the shared stream mapping (azure-views.json) and the data files of
// its connections are written only while the viewer may change the stream mapping (canManageStreams). useAccess sets
// it; fail closed: until a policy is loaded nobody may.
let streamsAllowed = false
export function setStreamsGuard(allowed: boolean) { streamsAllowed = allowed }
export const streamsBlockedText = 'Not saved: only a Tool Owner (“Change the stream mapping”) can change the shared stream mapping in Git (CON-93). Nothing was changed in Git.'
export function assertCanManageStreams() { if (!streamsAllowed) throw new Error(streamsBlockedText) }
