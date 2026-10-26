import { useCallback, useEffect, useState } from 'react'
import { GitConflictError } from './gitStorage'
import { parseQeMapping, qeMappingFile, serializeQeMapping, type QeMappingFile } from './qeMapping'
import type { GitStorage } from './useGitStorage'

// The QE Mapping table from Git (qe-mapping.json), read when Git is connected; the last one read is kept in this
// browser so the page shows it while Git is not connected. Saved only with a token that can write; a concurrent
// change is refused.
const cacheKey = 'demand-planning-qe-mapping-v1'
function cached() { try { const text = localStorage.getItem(cacheKey); return text ? parseQeMapping(text) : null } catch { return null } }
function remember(text: string | null) { try { if (text) localStorage.setItem(cacheKey, text); else localStorage.removeItem(cacheKey) } catch { /* too large or blocked: this visit only */ } }

export function useQeMapping(git: GitStorage) {
  const scope = git.accessScope
  const { readQeMapping } = git
  const [state, setState] = useState<{ scope: string; file: QeMappingFile | null; sha: string | null; error: string; loaded: boolean }>(() => ({ scope: '', file: cached(), sha: null, error: '', loaded: false }))
  const load = useCallback(async () => {
    if (!scope) return
    try {
      const read = await readQeMapping()
      const file = read.text == null ? null : parseQeMapping(read.text)
      remember(read.text)
      setState({ scope, file, sha: read.sha, error: '', loaded: true })
    } catch (failure) { setState((current) => ({ ...current, scope, loaded: true, error: failure instanceof Error ? failure.message : String(failure) })) }
  }, [scope, readQeMapping])
  const gitLoading = git.status === 'loading'
  useEffect(() => { if (scope && !gitLoading) void Promise.resolve().then(load) }, [scope, gitLoading, load])
  const fresh = state.scope === scope

  async function save(file: QeMappingFile, message: string) {
    const text = serializeQeMapping(file)
    try {
      const result = await git.writeQeMapping(text, fresh ? state.sha : null, message || `Update ${qeMappingFile}`)
      remember(text)
      setState({ scope, file: parseQeMapping(text), sha: result.sha, error: '', loaded: true })
      return result
    } catch (failure) {
      if (failure instanceof GitConflictError) throw new Error(`${qeMappingFile} was changed in Git since it was loaded. Reload it and make your change again.`)
      throw failure
    }
  }
  return { file: state.file, error: state.error, loaded: fresh && state.loaded, reload: load, save, history: git.qeMappingHistory }
}
export type QeMappingStore = ReturnType<typeof useQeMapping>
