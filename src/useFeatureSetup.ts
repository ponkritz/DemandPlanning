import { useCallback, useEffect, useState } from 'react'
import { featureSetupFile, parseFeatureSetup, personalSetupPath, publishSetup, serializeFeatureSetup, type EpicSetup, type FeatureSetupFile, type FeatureSetups } from './featureSetup'
import { GitConflictError } from './gitStorage'
import type { GitStorage } from './useGitStorage'

// The Feature setup in two layers, both from Git and read at start: the shared one (feature-setup.json, for everyone)
// and my own (feature-setup/<my email>.json). The last ones read are kept in this browser so the New Feature dialog can
// use them while Git is not connected. Saved only with a token that can write; a concurrent change is refused.
const sharedKey = 'demand-planning-feature-setup-v1'
const personalKey = (email: string) => `demand-planning-feature-setup-mine-v1:${email}`
function cached(key: string) { try { const text = localStorage.getItem(key); return text ? parseFeatureSetup(text) : null } catch { return null } }
function remember(key: string, file: FeatureSetupFile | null) { try { if (file) localStorage.setItem(key, serializeFeatureSetup(file)); else localStorage.removeItem(key) } catch { /* this visit only */ } }
interface Layer { file: FeatureSetupFile | null; sha: string | null }

export function useFeatureSetup(git: GitStorage, myEmail: string) {
  const scope = git.accessScope
  const email = personalSetupPath(myEmail) ? myEmail.trim().toLowerCase() : ''
  const { readFeatureSetup, readPersonalFeatureSetup } = git
  const [state, setState] = useState<{ scope: string; email: string; shared: Layer; personal: Layer; error: string }>(() => ({ scope: '', email, shared: { file: cached(sharedKey), sha: null }, personal: { file: email ? cached(personalKey(email)) : null, sha: null }, error: '' }))
  const load = useCallback(async () => {
    if (!scope) return
    try {
      const read = await readFeatureSetup()
      const shared = read.text == null ? null : parseFeatureSetup(read.text)
      remember(sharedKey, shared)
      let personal: Layer = { file: null, sha: null }
      if (email) {
        const mine = await readPersonalFeatureSetup(email)
        personal = { file: mine.text == null ? null : parseFeatureSetup(mine.text), sha: mine.sha }
        remember(personalKey(email), personal.file)
      }
      setState({ scope, email, shared: { file: shared, sha: read.sha }, personal, error: '' })
    } catch (failure) { setState((current) => ({ ...current, scope, error: failure instanceof Error ? failure.message : String(failure) })) }
  }, [scope, email, readFeatureSetup, readPersonalFeatureSetup])
  const gitLoading = git.status === 'loading'
  useEffect(() => { if (scope && !gitLoading) void Promise.resolve().then(load) }, [scope, gitLoading, load])
  const fresh = state.scope === scope
  const personal = state.email === email ? state.personal : { file: email ? cached(personalKey(email)) : null, sha: null }

  function conflict(failure: unknown, name: string): never {
    if (failure instanceof GitConflictError) throw new Error(`${name} was changed in Git since it was loaded. Reload it and make your change again.`)
    throw failure
  }
  async function saveShared(file: FeatureSetupFile, message: string) {
    try {
      const result = await git.writeFeatureSetup(serializeFeatureSetup(file), fresh ? state.shared.sha : null, message || `Update ${featureSetupFile}`)
      const saved = parseFeatureSetup(serializeFeatureSetup(file))
      remember(sharedKey, saved); setState((current) => ({ ...current, scope, shared: { file: saved, sha: result.sha }, error: '' }))
      return result
    } catch (failure) { return conflict(failure, featureSetupFile) }
  }
  async function savePersonal(file: FeatureSetupFile, message: string) {
    if (!email) throw new Error('Set your email on the Time Writing connection to keep your own Feature setup.')
    try {
      const result = await git.writePersonalFeatureSetup(email, serializeFeatureSetup(file), fresh && state.email === email ? personal.sha : null, message || `Update my Feature setup (${email})`)
      const saved = parseFeatureSetup(serializeFeatureSetup(file))
      remember(personalKey(email), saved); setState((current) => ({ ...current, scope, email, personal: { file: saved, sha: result.sha }, error: '' }))
      return result
    } catch (failure) { return conflict(failure, personalSetupPath(email)) }
  }
  // Enable for everyone: my setup of an Epic replaces that Epic's entry in the shared file.
  const enableForEveryone = (entry: EpicSetup) => saveShared(publishSetup(state.shared.file, entry), `Enable ${email || 'my'} Feature setup of Epic #${entry.epicId} for everyone`)
  const setups: FeatureSetups = { shared: state.shared.file, personal: personal.file }
  return { setups, shared: state.shared.file, personal: personal.file, email, error: state.error, loaded: fresh, reload: load, saveShared, savePersonal, enableForEveryone, history: git.featureSetupHistory }
}
export type FeatureSetup = ReturnType<typeof useFeatureSetup>
