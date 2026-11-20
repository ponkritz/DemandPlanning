import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { epicSetupFile, parseEpicSetup, serializeEpicSetup, type EpicSetupFile } from './epicSetup'
import { GitConflictError } from './gitStorage'
import type { GitStorage } from './useGitStorage'

// EPS-01: the shared Epic setup from Git (epic-setup.json), read at start; the last one read is kept in this browser
// so New Feature and bulk creation use it while Git is not connected. Saved only with a token that can write; a
// concurrent change is refused.
const cacheKey = 'demand-planning-epic-setup-v1'
function cached() { try { const text = localStorage.getItem(cacheKey); return text ? parseEpicSetup(text) : null } catch { return null } }
function remember(file: EpicSetupFile | null) { try { if (file) localStorage.setItem(cacheKey, serializeEpicSetup(file)); else localStorage.removeItem(cacheKey) } catch { /* this visit only */ } }

export function useEpicSetup(git: GitStorage) {
  const scope = git.accessScope
  const { readEpicSetup } = git
  const [state, setState] = useState<{ scope: string; file: EpicSetupFile | null; sha: string | null; error: string }>(() => ({ scope: '', file: cached(), sha: null, error: '' }))
  const load = useCallback(async () => {
    if (!scope) return
    try {
      const read = await readEpicSetup()
      const file = read.text == null ? null : parseEpicSetup(read.text)
      remember(file)
      setState({ scope, file, sha: read.sha, error: '' })
    } catch (failure) { setState((current) => ({ ...current, scope, error: failure instanceof Error ? failure.message : String(failure) })) }
  }, [scope, readEpicSetup])
  const gitLoading = git.status === 'loading'
  useEffect(() => { if (scope && !gitLoading) void Promise.resolve().then(load) }, [scope, gitLoading, load])
  const fresh = state.scope === scope
  // One unsaved draft for both sections (Fields per Epic, Value lists), kept while switching between them.
  const [draft, setDraft] = useState<EpicSetupFile | null>(null)
  async function save(file: EpicSetupFile, message: string) {
    try {
      const result = await git.writeEpicSetup(serializeEpicSetup(file), fresh ? state.sha : null, message || `Update ${epicSetupFile}`)
      const saved = parseEpicSetup(serializeEpicSetup(file))
      remember(saved); setState({ scope, file: saved, sha: result.sha, error: '' }); setDraft(null)
      return result
    } catch (failure) {
      if (failure instanceof GitConflictError) throw new Error(`${epicSetupFile} was changed in Git since it was loaded. Reload it and make your change again.`)
      throw failure
    }
  }
  return { file: state.file, draft, setDraft, error: state.error, loaded: fresh, reload: load, save, history: git.epicSetupHistory }
}
export type EpicSetupStore = ReturnType<typeof useEpicSetup>

// The Epic setup for New Feature and bulk creation deep in the page tree.
export const EpicSetupContext = createContext<EpicSetupFile | null>(null)
export const useEpicSetupFile = () => useContext(EpicSetupContext)
