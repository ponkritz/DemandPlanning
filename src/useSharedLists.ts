import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import { recordJob } from './backgroundJobs'
import { outcomeText } from './gitSaveQueue'
import { parseSharedLists, readSharedListsCache, serializeSharedLists, sharedListsFile, writeSharedListsCache, type CatalogEntry, type SharedListsFile } from './sharedLists'
import type { GitStorage } from './useGitStorage'

// LST-02: the built-in lists from Git (shared-lists.json), read when Git storage is connected; the last good file read is
// kept for this Git workspace so the columns keep their lists while Git cannot be reached. A file that cannot be used as a whole
// is refused with the reason and the lists in use stay as they were (the strict reader). Saved queued and merged (GIT-17)
// by the holders of "Manage built-in lists" and page co-owners (CON-115, LST-12); the result goes to Background jobs.
type ListsState = { file: SharedListsFile | null; error: string; loaded: boolean }

export function useSharedLists(git: GitStorage) {
  const scope = git.accessScope
  const { readSharedLists } = git
  const [states, setStates] = useState<Record<string, ListsState>>({})
  const cached = useMemo(() => readSharedListsCache(scope), [scope])
  const state = states[scope]
  const load = useCallback(async () => {
    if (!scope) return
    try {
      const read = await readSharedLists()
      const file = read.text == null ? null : parseSharedLists(read.text)
      writeSharedListsCache(scope, read.text)
      setStates((current) => ({ ...current, [scope]: { file, error: '', loaded: true } }))
    } catch (failure) {
      const error = failure instanceof Error ? failure.message : String(failure)
      setStates((current) => ({ ...current, [scope]: { file: current[scope] ? current[scope].file : cached, error, loaded: true } }))
    }
  }, [scope, readSharedLists, cached])
  const gitLoading = git.status === 'loading'
  useEffect(() => { if (scope && !gitLoading) void Promise.resolve().then(load) }, [scope, gitLoading, load])

  // LST-06, LST-07: a change saved to Git — the version written (merged with a save by someone else meanwhile) is used.
  const save = useCallback(async (next: SharedListsFile, message: string) => {
    if (!scope) throw new Error('Connect Git storage first.')
    const label = 'Built-in lists · Save to Git'
    try {
      const result = await git.writeSharedLists(serializeSharedLists(next), message)
      const file = parseSharedLists(result.text)
      writeSharedListsCache(scope, result.text)
      setStates((current) => ({ ...current, [scope]: { file, error: '', loaded: true } }))
      recordJob('shared-lists', label, { text: `${outcomeText(result)} ${message}.` })
      return file
    } catch (failure) {
      recordJob('shared-lists', label, { text: failure instanceof Error ? failure.message : String(failure), failed: true })
      throw failure
    }
  }, [git, scope])

  return {
    file: state ? state.file : cached, error: state?.error ?? '', loaded: state?.loaded ?? false, connected: Boolean(scope),
    save, reload: load, history: git.sharedListsHistory, queue: git.queueState(sharedListsFile), retry: () => git.retryQueued(sharedListsFile),
  }
}
export type SharedListsStore = ReturnType<typeof useSharedLists>
// LST-08: the lists a column can use (team lists and the Epic setup's Value lists), for the column editor.
export const ListCatalogContext = createContext<CatalogEntry[]>([])
