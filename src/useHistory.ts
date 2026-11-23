import { useCallback, useEffect, useState } from 'react'
import { parseHistoryFile, serializeHistory, type HistoryFile } from './history'
import type { GitStorage } from './useGitStorage'

// The imported historical hours (HIS-04): read from the Git data repository when Git storage is connected, saved or
// removed from Admin → Capacity & time → Historical hours. Without Git storage there is no history (it is shared team data).
export function useHistory(git: GitStorage) {
  const [file, setFile] = useState<HistoryFile | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [note, setNote] = useState('')
  const { connected, readHistory } = git
  const read = useCallback(async () => {
    try {
      const found = await readHistory()
      return { file: parseHistoryFile(found.text), note: found.text && !parseHistoryFile(found.text) ? 'The historical hours file in Git could not be read; it is ignored.' : '' }
    } catch (failure) { return { note: `Historical hours were not read from Git: ${failure instanceof Error ? failure.message : String(failure)}` } }
  }, [readHistory])
  const apply = (result: Awaited<ReturnType<typeof read>>) => { if ('file' in result) { setFile(result.file ?? null) } setNote(result.note); setLoaded(true) }
  useEffect(() => {
    if (!connected) return
    let active = true
    void (async () => { const result = await read(); if (active) apply(result) })()
    return () => { active = false }
  }, [connected, read])
  const reload = async () => apply(await read())
  // GIT-17: queued with its time and merged into the latest file in Git when someone else saved in between (both kept).
  const save = async (next: HistoryFile, message: string) => {
    const saved = await git.writeHistory(serializeHistory(next), message)
    setFile(saved.merged ? parseHistoryFile(saved.text) ?? next : next)
    return saved
  }
  const remove = async (message: string) => { await git.removeHistory(message); setFile(null) }
  // Without Git storage there is no history, whatever was read before.
  return { file: connected ? file : null, loaded: connected ? loaded : true, note: connected ? note : '', reload, save, remove }
}
export type HistoryStore = ReturnType<typeof useHistory>
