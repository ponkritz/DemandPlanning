import { useCallback, useEffect, useState } from 'react'
import { accessFile, canManageStreams, parseAccess, rightsFor, serializeAccess, type AccessPolicy, type Action, type Area } from './access'
import { guardAzureWrites } from './azureDevOps'
import { GitConflictError } from './gitStorage'
import type { GitStorage } from './useGitStorage'
import type { AzureWorkspace } from './useAzureWorkspace'
import { canViewAs, setViewAsGuard, viewAsLabel, viewAsRights, type ViewAs } from './viewAs'

// The last policy read from Git, kept in this browser so it still applies while Git storage is not connected here.
const cacheKey = 'demand-planning-access-v1'
function cachedPolicy() { try { const text = localStorage.getItem(cacheKey); return text ? parseAccess(text) : null } catch { return null } }
function cachePolicy(text: string | null) { try { if (text == null) localStorage.removeItem(cacheKey); else localStorage.setItem(cacheKey, text) } catch { /* storage unavailable */ } }

type PolicyState = { scope: string; policy: AccessPolicy | null; sha: string | null; error: string; loaded: boolean }

// The viewer's access: who they are (the email entered on the Time Writing connection, the same one new work is
// assigned to) and the roles policy in Git (access.json, or the copy cached in this browser from an earlier read).
// CON-101 (fail closed): until a policy is loaded everyone is read-only — every menu area, no action. Bootstrap: when
// Git storage read that no access.json exists (the read succeeded, the file is absent), the viewer may set up the
// first roles file (access.manage only). Without an email, the policy's default role applies. The email is typed in,
// not verified.
export function useAccess(git: GitStorage, azure: AzureWorkspace, viewAs: ViewAs | null = null) {
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
  // CON-101: Git storage confirmed that there is no access.json (not an error, not still loading).
  const bootstrap = Boolean(scope) && state.scope === scope && state.loaded && !state.error && !state.policy

  // The viewer's own rights decide who may use View as; while it is on, the page follows the person's or role's rights.
  const ownRights = rightsFor(current.policy, email, bootstrap)
  const active = viewAs && canViewAs(ownRights) ? viewAs : null
  const rights = active ? viewAsRights(current.policy, active) : ownRights
  const readOnly = !current.policy
  useEffect(() => { guardAzureWrites((permission) => rights.actions.has(permission), readOnly ? 'The app is read-only until the access roles (access.json) are loaded: connect Git storage in Admin → Data & sharing. Nothing was changed.' : undefined) })
  useEffect(() => { setViewAsGuard(active ? viewAsLabel(active) : ''); return () => setViewAsGuard('') }, [active])

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
    // CON-101: no roles file loaded, so the app is read-only; bootstrap: none exists yet, so the viewer may set one up.
    readOnly, bootstrap,
    rights, ownRights, canViewAs: canViewAs(ownRights), viewingAs: active,
    sees: (area: Area) => rights.areas.has(area),
    can: (action: Action) => rights.actions.has(action),
    // CON-93: the stream mapping and its query logic: Tool Owners (or, while none exists, those who manage access).
    canManageStreams: canManageStreams(current.policy, rights),
    reload: load, save,
  }
}
export type Access = ReturnType<typeof useAccess>
