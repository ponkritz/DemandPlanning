import { useCallback, useEffect, useState } from 'react'
import { GitConflictError } from './gitStorage'
import { defaultPackSetup, emptyNotes, monthlyPackNotesPath, monthlyPackSetupFile, parsePackNotes, parsePackSetup, serializePackNotes, serializePackSetup, type MonthlyPackNotes, type MonthlyPackSetup } from './monthlyPack'
import type { GitStorage } from './useGitStorage'

// The Monthly pack's shared setup (monthly-pack-setup.json, read at start and kept in this browser) and the text of
// the month shown (monthly-pack/<month>.json, read when the month is chosen). Saved only with a token that can write;
// a concurrent change is refused.
const setupKey = 'demand-planning-monthly-pack-setup-v1'
function cachedSetup() { try { const text = localStorage.getItem(setupKey); return text ? parsePackSetup(text) : null } catch { return null } }
function rememberSetup(text: string | null) { try { if (text) localStorage.setItem(setupKey, text); else localStorage.removeItem(setupKey) } catch { /* this visit only */ } }

export function useMonthlyPack(git: GitStorage, month: string) {
  const scope = git.accessScope
  const { readMonthlyPack } = git
  const [setupState, setSetupState] = useState<{ scope: string; setup: MonthlyPackSetup | null; sha: string | null; error: string; loaded: boolean }>(() => ({ scope: '', setup: cachedSetup(), sha: null, error: '', loaded: false }))
  const [notesState, setNotesState] = useState<{ scope: string; month: string; notes: MonthlyPackNotes; sha: string | null; error: string; loaded: boolean }>({ scope: '', month: '', notes: emptyNotes(month), sha: null, error: '', loaded: false })
  const loadSetup = useCallback(async () => {
    if (!scope) return
    try {
      const read = await readMonthlyPack(monthlyPackSetupFile)
      const setup = read.text == null ? null : parsePackSetup(read.text)
      rememberSetup(read.text)
      setSetupState({ scope, setup, sha: read.sha, error: '', loaded: true })
    } catch (failure) { setSetupState((current) => ({ ...current, scope, loaded: true, error: failure instanceof Error ? failure.message : String(failure) })) }
  }, [scope, readMonthlyPack])
  const loadNotes = useCallback(async () => {
    if (!scope || !month) return
    try {
      const read = await readMonthlyPack(monthlyPackNotesPath(month))
      setNotesState({ scope, month, notes: read.text == null ? emptyNotes(month) : parsePackNotes(read.text, month), sha: read.sha, error: '', loaded: true })
    } catch (failure) { setNotesState({ scope, month, notes: emptyNotes(month), sha: null, error: failure instanceof Error ? failure.message : String(failure), loaded: true }) }
  }, [scope, month, readMonthlyPack])
  const gitLoading = git.status === 'loading'
  useEffect(() => { if (scope && !gitLoading) void Promise.resolve().then(loadSetup) }, [scope, gitLoading, loadSetup])
  useEffect(() => { if (scope && !gitLoading) void Promise.resolve().then(loadNotes) }, [scope, gitLoading, loadNotes])
  const setupFresh = setupState.scope === scope, notesFresh = notesState.scope === scope && notesState.month === month

  function conflict(failure: unknown, name: string): never {
    if (failure instanceof GitConflictError) throw new Error(`${name} was changed in Git since it was loaded. Reload it and make your change again.`)
    throw failure
  }
  async function saveSetup(setup: MonthlyPackSetup, message: string) {
    const text = serializePackSetup(setup)
    try {
      const result = await git.writeMonthlyPack(monthlyPackSetupFile, text, setupFresh ? setupState.sha : null, message || `Update ${monthlyPackSetupFile}`)
      rememberSetup(text); setSetupState({ scope, setup: parsePackSetup(text), sha: result.sha, error: '', loaded: true })
      return result
    } catch (failure) { return conflict(failure, monthlyPackSetupFile) }
  }
  async function saveNotes(notes: MonthlyPackNotes, message: string) {
    const path = monthlyPackNotesPath(notes.month), text = serializePackNotes(notes)
    try {
      const result = await git.writeMonthlyPack(path, text, notesFresh ? notesState.sha : null, message || `Monthly pack ${notes.month}`)
      setNotesState({ scope, month: notes.month, notes: parsePackNotes(text, notes.month), sha: result.sha, error: '', loaded: true })
      return result
    } catch (failure) { return conflict(failure, path) }
  }
  return {
    setup: setupState.setup ?? defaultPackSetup, hasSetup: Boolean(setupState.setup), setupError: setupState.error, setupLoaded: setupFresh && setupState.loaded, saveSetup, reloadSetup: loadSetup, setupHistory: git.monthlyPackHistory(monthlyPackSetupFile),
    notes: notesFresh ? notesState.notes : emptyNotes(month), notesError: notesFresh ? notesState.error : '', notesLoaded: notesFresh && notesState.loaded, saveNotes, reloadNotes: loadNotes, notesHistory: git.monthlyPackHistory(monthlyPackNotesPath(month)),
  }
}
export type MonthlyPackStore = ReturnType<typeof useMonthlyPack>
