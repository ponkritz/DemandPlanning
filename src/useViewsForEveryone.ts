import { useContext } from 'react'
import { runInBackground } from './backgroundJobs'
import { parseViewMeta, viewMetaKey, type ViewMeta } from './personalViews'
import { ChartSizeEnvContext } from './useChartSize'

// UI-20…UI-23 Save view for everyone. A Tool Owner (the right "Table, chart and page defaults", layout.defaults) saves
// how a table or a page's filters look as the view everyone starts with: one entry per table or page in the shared
// views defaults in Git (personal-views-defaults.json, as Column options → Save for everyone, BKL-47), with who saved it
// and when beside it. The save is queued (GIT-17) and its result listed under Background jobs. Fail closed: without the
// right, Git storage that can be written, or with the synthetic sample or View as, nothing is offered.
export function useViewsForEveryone() {
  const env = useContext(ChartSizeEnvContext)
  const views = env.views
  const canSave = Boolean(env.canSetDefault && !env.viewOnly && views?.saveDefaults)
  const everyone = (key: string): unknown => views?.sharedFilter?.(key)
  const meta = (key: string): ViewMeta | undefined => parseViewMeta(views?.sharedFilter?.(viewMetaKey(key)))
  // Started as a background job (one per entry at a time); after runs once the save is in Git.
  const save = (key: string, value: unknown, what: string, after?: () => void) => {
    if (!canSave || !views) return false
    const by = views.who || 'a Tool Owner'
    return runInBackground(`views-for-everyone:${key}`, `Save view for everyone · ${what}`, async () => {
      const saved = await views.saveDefaults({ [key]: value, [viewMetaKey(key)]: { by, at: new Date().toISOString() } }, `View for everyone: ${what} (${by})`)
      after?.()
      return { text: `${what}: saved as the view for everyone${saved.merged ? ' (merged with a change by someone else)' : ''}. People who did not change it see it; people with their own view keep theirs.` }
    })
  }
  const clear = (key: string, what: string, after?: () => void) => {
    if (!canSave || !views) return false
    return runInBackground(`views-for-everyone:${key}`, `Clear the view for everyone · ${what}`, async () => {
      await views.saveDefaults({ [key]: undefined, [viewMetaKey(key)]: undefined }, `View for everyone cleared: ${what} (${views.who || 'a Tool Owner'})`)
      after?.()
      return { text: `${what}: the view for everyone is cleared; people without their own view see the built-in one.` }
    })
  }
  return { views, canSave, everyone, meta, save, clear }
}
export type ViewsForEveryone = ReturnType<typeof useViewsForEveryone>
