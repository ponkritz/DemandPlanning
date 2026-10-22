import { useCallback, useEffect, useState } from 'react'
import { accessFile, parseAccess, rightsFor, serializeAccess, type AccessPolicy, type Action, type Area } from './access'
import { guardAzureWrites } from './azureDevOps'
import { GitConflictError } from './gitStorage'
import type { GitStorage } from './useGitStorage'
import type { AzureWorkspace } from './useAzureWorkspace'

// The last policy read from Git, kept in this browser so it still applies while Git storage is not connected here.
const cacheKey = 'demand-planning-access-v1'
function cachedPolicy() { try { const text = localStorage.getItem(cacheKey); return text ? parseAccess(text) : null } catch { return null } }
function cachePolicy(text: string | null) { try { if (text == null) localStorage.removeItem(cacheKey); else localStorage.setItem(cacheKey, text) } catch { /* storage unavailable */ } }

type PolicyState = { scope: string; policy: AccessPolicy | null; sha: string | null; error: string; loaded: boolean }

// The viewer's access: who they are (the email entered on the Time Writing connection, the same one new work is
// assigned to) and the roles policy in Git (access.json). Without Git storage or without the file, nothing is
// restricted. Without an email, the policy's default role applies. The email is typed in, not verified.
export function useAccess(git: GitStorage, azure: AzureWorkspace) {
  const email = azure.isSample ? '' : azure.creatorEmail.trim().toLowerCase()

  const scope = git.accessScope
  const { readAccess } = git
  const [state, setState] = useState<PolicyState>({ scope: '', policy: null, sha: null, error: '', loaded: false })
  const load = useCallback(async () => {
    if (!scope) return
    try {
      const file = await readAccess()
      const policy = file.text == null ? null : parseAccess(file.text)
      cachePolicy(policy ? serializeAccess(policy) : null)
      setState({ scope, policy, sha: file.sha, error: '', loaded: true })
    } catch (failure) {
      // A file that cannot be read or understood keeps the last policy in force.
      setState((current) => ({ ...current, scope, policy: current.scope === scope ? current.policy : cachedPolicy(), error: failure instanceof Error ? failure.message : String(failure), loaded: true }))
    }
  }, [scope, readAccess, setState])
  const gitLoading = git.status === 'loading'
  useEffect(() => { if (scope && !gitLoading) void Promise.resolve().then(load) }, [scope, gitLoading, load])
  const [cached] = useState(cachedPolicy)
  const current = state.scope === scope && scope ? state : { policy: cached, sha: null, error: '', loaded: !scope }

  const rights = rightsFor(current.policy, email)
  useEffect(() => { guardAzureWrites(() => rights.actions.has('azure.write')) })

  async function save(policy: AccessPolicy, message: string) {
    try {
      const result = await git.writeAccess(serializeAccess(policy), current.sha, message || `Update ${accessFile}`)
      cachePolicy(serializeAccess(policy))
      setState({ scope, policy: parseAccess(serializeAccess(policy)), sha: result.sha, error: '', loaded: true })
      return result
    } catch (failure) {
      if (failure instanceof GitConflictError) throw new Error(`${accessFile} was changed in Git since it was loaded. Reload it and make your change again.`)
      throw failure
    }
  }

  return {
    email,
    policy: current.policy, loaded: current.loaded, error: current.error, path: git.accessPath, history: git.accessHistory,
    rights,
    sees: (area: Area) => rights.areas.has(area),
    can: (action: Action) => rights.actions.has(action),
    reload: load, save,
  }
}
export type Access = ReturnType<typeof useAccess>
