import { useCallback, useEffect, useState } from 'react'
import { accessFile, parseAccess, rightsFor, serializeAccess, type AccessPolicy, type Action, type Area } from './access'
import { guardAzureWrites, readAzureIdentity, type AzureIdentity } from './azureDevOps'
import { GitConflictError } from './gitStorage'
import type { GitStorage } from './useGitStorage'
import type { AzureWorkspace } from './useAzureWorkspace'

// The last policy read from Git, kept in this browser so it still applies while Git storage is not connected here.
const cacheKey = 'demand-planning-access-v1'
function cachedPolicy() { try { const text = localStorage.getItem(cacheKey); return text ? parseAccess(text) : null } catch { return null } }
function cachePolicy(text: string | null) { try { if (text == null) localStorage.removeItem(cacheKey); else localStorage.setItem(cacheKey, text) } catch { /* storage unavailable */ } }

type PolicyState = { scope: string; policy: AccessPolicy | null; sha: string | null; error: string; loaded: boolean }

// The viewer's access: who they are (the email Azure DevOps reports for the Time Writing PAT) and the roles policy in
// Git (access.json). Without Git storage or without the file, nothing is restricted. While the identity is unknown,
// the policy's default role applies.
export function useAccess(git: GitStorage, azure: AzureWorkspace) {
  const { config, pat, isSample } = azure
  // The connection as plain values: the config object is rebuilt on every render.
  const organization = config?.organization ?? '', project = config?.project ?? '', team = config?.team ?? '', baseUrl = config?.baseUrl, apiVersion = config?.apiVersion
  const patKey = config && pat.trim() && !isSample ? `${organization}|${baseUrl ?? ''}|${pat.trim()}` : ''
  const [identity, setIdentity] = useState<{ key: string; value: AzureIdentity | null; error: string }>({ key: '', value: null, error: '' })
  useEffect(() => {
    if (!patKey) return
    let active = true
    readAzureIdentity({ organization, project, team, ...(baseUrl ? { baseUrl } : {}), ...(apiVersion ? { apiVersion } : {}) }, pat).then((value) => { if (active) setIdentity({ key: patKey, value, error: '' }) }, (failure) => { if (active) setIdentity({ key: patKey, value: null, error: failure instanceof Error ? failure.message : String(failure) }) })
    return () => { active = false }
  }, [patKey, organization, project, team, baseUrl, apiVersion, pat])
  const me = identity.key === patKey ? identity : { value: null, error: '' }

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
  }, [scope, readAccess])
  const gitLoading = git.status === 'loading'
  useEffect(() => { if (scope && !gitLoading) void Promise.resolve().then(load) }, [scope, gitLoading, load])
  const [cached] = useState(cachedPolicy)
  const current = state.scope === scope && scope ? state : { policy: cached, sha: null, error: '', loaded: !scope }

  const email = me.value?.email ?? ''
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
    email, name: me.value?.name ?? '', identityError: me.error,
    policy: current.policy, loaded: current.loaded, error: current.error, path: git.accessPath, history: git.accessHistory,
    rights,
    sees: (area: Area) => rights.areas.has(area),
    can: (action: Action) => rights.actions.has(action),
    reload: load, save,
  }
}
export type Access = ReturnType<typeof useAccess>
