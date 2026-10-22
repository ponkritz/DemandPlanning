import { useCallback, useEffect, useState } from 'react'
import { featureSetupFile, parseFeatureSetup, serializeFeatureSetup, type FeatureSetupFile } from './featureSetup'
import { GitConflictError } from './gitStorage'
import type { GitStorage } from './useGitStorage'

// The per-Epic Feature setup from Git (feature-setup.json), read at start; the last one read is kept in this browser so
// the New Feature dialog can use it while Git is not connected. Saved only with a token that can write.
const cacheKey = 'demand-planning-feature-setup-v1'
function cached() { try { const text = localStorage.getItem(cacheKey); return text ? parseFeatureSetup(text) : null } catch { return null } }
function remember(file: FeatureSetupFile | null) { try { if (file) localStorage.setItem(cacheKey, serializeFeatureSetup(file)); else localStorage.removeItem(cacheKey) } catch { /* this visit only */ } }

export function useFeatureSetup(git: GitStorage) {
  const scope = git.accessScope
  const { readFeatureSetup } = git
  const [state, setState] = useState<{ scope: string; file: FeatureSetupFile | null; sha: string | null; error: string }>(() => ({ scope: '', file: cached(), sha: null, error: '' }))
  const load = useCallback(async () => {
    if (!scope) return
    try {
      const read = await readFeatureSetup()
      const file = read.text == null ? null : parseFeatureSetup(read.text)
      remember(file)
      setState({ scope, file, sha: read.sha, error: '' })
    } catch (failure) { setState((current) => ({ ...current, scope, error: failure instanceof Error ? failure.message : String(failure) })) }
  }, [scope, readFeatureSetup])
  const gitLoading = git.status === 'loading'
  useEffect(() => { if (scope && !gitLoading) void Promise.resolve().then(load) }, [scope, gitLoading, load])

  async function save(file: FeatureSetupFile, message: string) {
    try {
      const result = await git.writeFeatureSetup(serializeFeatureSetup(file), state.scope === scope ? state.sha : null, message || `Update ${featureSetupFile}`)
      const saved = parseFeatureSetup(serializeFeatureSetup(file))
      remember(saved); setState({ scope, file: saved, sha: result.sha, error: '' })
      return result
    } catch (failure) {
      if (failure instanceof GitConflictError) throw new Error(`${featureSetupFile} was changed in Git since it was loaded. Reload it and make your change again.`)
      throw failure
    }
  }
  return { file: state.file, error: state.error, loaded: state.scope === scope, reload: load, save, history: git.featureSetupHistory }
}
export type FeatureSetup = ReturnType<typeof useFeatureSetup>
