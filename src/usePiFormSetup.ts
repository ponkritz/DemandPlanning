import { useCallback, useEffect, useState } from 'react'
import { recordJob } from './backgroundJobs'
import { outcomeText } from './gitSaveQueue'
import { formSetupProblems } from './piReviewPost'
import { builtInSetup, parsePiFormSetup, piFormFile, serializePiFormSetup, type PiFormSetup } from './piReviewSetup'
import { setDiscussionsFrom } from './piReview'
import { reviewStartOf } from './piReviewStart'
import type { GitStorage } from './useGitStorage'

// PIR-19: the PI Review form setup from Git (pi-review-form.json), read when Git storage is connected; the last good file
// read is kept in this browser so the form is the same while Git cannot be reached. No file: the built-in form. A file
// that cannot be used as a whole — not a setup, or one whose comment would not be read back (formSetupProblems) — is
// refused with the reason and the form in use stays as it was (the strict reader). Saved queued and merged (GIT-17) by
// the roles with "PI Review: set up the review form" (CON-114); the result goes to Background jobs (UI-STANDARDS §8).
const cacheKey = 'demand-planning-pi-review-form-v1'
// The strict reader: the file's shape, then the read-back of a review written with it.
export function readPiFormSetup(text: string): PiFormSetup {
  const setup = parsePiFormSetup(text)
  const problems = formSetupProblems(setup)
  if (problems.length) throw new Error(`${piFormFile} cannot be used: ${problems.join(' ')}`)
  return setup
}
function cached(): PiFormSetup | null { try { const text = localStorage.getItem(cacheKey); return text ? readPiFormSetup(text) : null } catch { return null } }
function remember(text: string | null) { try { if (text) localStorage.setItem(cacheKey, text); else localStorage.removeItem(cacheKey) } catch { /* this visit only */ } }

export function usePiFormSetup(git: GitStorage) {
  const scope = git.accessScope
  const { readPiForm } = git
  // file: the setup in Git (null: none, the built-in form applies).
  const [state, setState] = useState<{ scope: string; file: PiFormSetup | null; error: string; loaded: boolean }>(() => ({ scope: '', file: cached(), error: '', loaded: false }))
  const load = useCallback(async () => {
    if (!scope) return
    try {
      const read = await readPiForm()
      const file = read.text == null ? null : readPiFormSetup(read.text)
      remember(read.text)
      setState({ scope, file, error: '', loaded: true })
    } catch (failure) { setState((current) => ({ ...current, scope, loaded: true, error: failure instanceof Error ? failure.message : String(failure) })) }
  }, [scope, readPiForm])
  const gitLoading = git.status === 'loading'
  useEffect(() => { if (scope && !gitLoading) void Promise.resolve().then(load) }, [scope, gitLoading, load])
  const fresh = state.scope === scope && Boolean(scope)

  // PIR-22: a change saved to Git — the version written (merged with a save by someone else meanwhile) is the one in use.
  const save = useCallback(async (next: PiFormSetup, message: string) => {
    const label = 'PI Review form · Save to Git'
    try {
      const result = await git.writePiForm(serializePiFormSetup(next), message)
      const file = readPiFormSetup(result.text)
      remember(result.text)
      setState((current) => ({ ...current, file, error: '' }))
      recordJob('pi-review-form', label, { text: `${outcomeText(result)} ${message}.` })
      return result
    } catch (failure) {
      recordJob('pi-review-form', label, { text: failure instanceof Error ? failure.message : String(failure), failed: true })
      throw failure
    }
  }, [git])

  // PIR-33: the Discussions are read with the setup's "PI Review starts from" (a change reads them again).
  const setup = state.file ?? builtInSetup
  useEffect(() => { setDiscussionsFrom(reviewStartOf(setup)) }, [setup])

  return {
    // The form in use: the file in Git, else the built-in form.
    setup, file: state.file, error: fresh ? state.error : '', loaded: fresh && state.loaded, connected: Boolean(scope),
    save, reload: load, history: git.piFormHistory, queue: git.queueState(piFormFile), retry: () => git.retryQueued(piFormFile),
  }
}
export type PiFormStore = ReturnType<typeof usePiFormSetup>
