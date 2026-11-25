import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import { GitConflictError } from './gitStorage'
import { cachedCustomStreams, customStreamDefs, customStreamsFile, parseCustomStreams, readCustomStreamsInto, rememberCustomStreams, serializeCustomStreams, type CustomStreamEntry } from './customStreams'
import { setCustomStreams, streamsVersion, subscribeStreams } from './streams'
import type { GitStorage } from './useGitStorage'

// STR-01, STR-05: the custom streams from Git (custom-streams.json), read when Git storage is connected and made the
// app's streams (streams.ts setCustomStreams); the last good file read is kept in this browser, so the menu and the
// Release pages of custom streams are there at the next start before Git answers and while it cannot be reached.
// Saved only by the Tool Owner (streams.manage) with a token that can write; a concurrent change is refused.
// GIT-25: a repository that cannot be read throws (readCustomStreamsInto), so the cached streams are kept and the error shown.
const cached = () => cachedCustomStreams()
const remember = (text: string | null) => rememberCustomStreams(text)
// At start, before any render: the streams of the last visit.
if (typeof localStorage !== 'undefined') setCustomStreams(customStreamDefs(cached()))

export interface CustomStreamsStore { entries: CustomStreamEntry[]; refused: { name: string; reason: string }[]; error: string; loaded: boolean; save: (entries: CustomStreamEntry[], message: string) => Promise<{ commitUrl?: string }>; reload: () => Promise<void>; history: string }
export function useCustomStreams(git: GitStorage): CustomStreamsStore {
  const scope = git.accessScope
  const { readCustomStreams } = git
  const [state, setState] = useState<{ scope: string; entries: CustomStreamEntry[]; refused: { name: string; reason: string }[]; sha: string | null; error: string; loaded: boolean }>(() => ({ scope: '', entries: cached(), refused: [], sha: null, error: '', loaded: false }))
  const apply = (entries: CustomStreamEntry[]) => setCustomStreams(customStreamDefs(entries))
  const load = useCallback(async () => {
    if (!scope) return
    try {
      // STR-05: a file that cannot be read as a whole keeps the streams in use; refused entries are listed with why.
      const parsed = await readCustomStreamsInto(readCustomStreams)
      apply(parsed.streams)
      setState({ scope, entries: parsed.streams, refused: parsed.refused, sha: parsed.sha, error: '', loaded: true })
    } catch (failure) { setState((current) => ({ ...current, scope, loaded: true, error: failure instanceof Error ? failure.message : String(failure) })) }
  }, [scope, readCustomStreams])
  const gitLoading = git.status === 'loading'
  useEffect(() => { if (scope && !gitLoading) void Promise.resolve().then(load) }, [scope, gitLoading, load])
  const fresh = state.scope === scope
  async function save(entries: CustomStreamEntry[], message: string) {
    const text = serializeCustomStreams(entries)
    try {
      const result = await git.writeCustomStreams(text, fresh ? state.sha : null, message || `Update ${customStreamsFile}`)
      const parsed = parseCustomStreams(text)
      remember(text); apply(parsed.streams)
      setState({ scope, entries: parsed.streams, refused: [], sha: result.sha, error: '', loaded: true })
      return result
    } catch (failure) {
      if (failure instanceof GitConflictError) throw new Error(`${customStreamsFile} was changed in Git since it was loaded. Reload it and make your change again.`)
      throw failure
    }
  }
  return { entries: state.entries, refused: state.refused, error: state.error, loaded: fresh && state.loaded, save, reload: load, history: git.customStreamsHistory }
}

// The store for the Settings panel, provided once by the app; without a provider, nothing can be saved.
export const CustomStreamsContext = createContext<CustomStreamsStore | null>(null)
export const useCustomStreamsStore = () => useContext(CustomStreamsContext)
// Redraw when the custom streams change (the menu, Pulse Check, the Release pages).
export const useStreamsVersion = () => useSyncExternalStore(subscribeStreams, streamsVersion)
