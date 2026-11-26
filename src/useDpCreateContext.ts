import { chooseSetup, withLinkedStories, type FeatureSetups } from './featureSetup'
import { classificationOf, epicFieldsFor } from './epicSetup'
import { useEpicSetupFile } from './useEpicSetup'
import { useQeSource } from './useQeSource'
import { useBulkEpic, useDpBulkDates } from './useStreamEpics'
import type { DpCreateContext } from './dpCreatePlan'

// DPF-17: the settings DP Create Features (bulk) and the New Feature form from a DP release both read — the DP bulk
// creation Epic (QV-59: mine, else shared; 0 when none is set), its Feature setup (the shared one first, STT-02 linked
// stories), its QE page (DPF-02), its Release Classification (DPF-07) and Epic setup fields (EPS-03), and the DP date
// columns (DPF-13).
export function useDpCreateContext(featureSetup: FeatureSetups | null | undefined): DpCreateContext {
  const epicId = useBulkEpic('DP').epicId ?? 0
  const epicFile = useEpicSetupFile()
  const setup = withLinkedStories(chooseSetup(featureSetup, epicId, true).setup, epicFile?.storyTemplates)
  const qe = useQeSource(setup)
  const epicFields = epicFieldsFor(epicFile, epicId)
  const dateColumns = useDpBulkDates()
  return { epicId, setup, qe, classes: classificationOf(epicFile, epicId), ...(epicFields ? { epicFields } : {}), dateColumns }
}
