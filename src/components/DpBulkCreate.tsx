import { useEffect, useState } from 'react'
import type { AzureWorkItem } from '../domain'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { FeatureSetups } from '../featureSetup'
import { chooseSetup } from '../featureSetup'
import { useBulkEpic } from '../useStreamEpics'
import type { QeMappingFile } from '../qeMapping'
import { bulkPlan, dpTypeLabel } from '../dpBulk'
import type { BoardHit } from '../dpBoardMatch'
import { createFeatureFromSetup, currentIndiaMonth, currentIterationPairs, futureIterationPairs, readAzureIterations, withFeatureDoD, HierarchyCreationError, type AzureIteration } from '../azureDevOps'
import { runInBackground } from '../backgroundJobs'
import { adhocAfterLock } from '../planningLock'
import { Modal, Notice } from './ui'

// DPF-04: Create Features for the selected DP releases — under Epic 13946, each titled Program | Service | Release, with
// the DoD and default User Stories of its release type (Release or PU set, Feature setup → Epic 13946), the Release
// Classification (Major, Minor, MLD, Platform Update), the Time Writing story and month Task, all assigned to the QE from
// the QE Mapping, in the PI / Sprint chosen. One after another as a background job; releases that cannot be created
// are listed with the reason and skipped.
export function DpBulkCreate({ rows, azure, featureSetup, qeMapping, featureMatch, onClose }: { rows: AzureWorkItem[]; azure: AzureWorkspace; featureSetup?: FeatureSetups | null; qeMapping?: QeMappingFile | null; featureMatch: (row: AzureWorkItem) => BoardHit | undefined; onClose: () => void }) {
  // QV-59: the DP bulk Epic — mine, else shared, else built in (13946).
  const dpEpicId = useBulkEpic('DP').epicId ?? 0
  const setup = chooseSetup(featureSetup, dpEpicId, true).setup
  const plan = bulkPlan(rows, { setup, qeMapping, board: azure.items, featureMatch })
  const ready = plan.filter((line) => !line.skip)
  const epic = azure.items.find((item) => item.id === dpEpicId && item.workItemType === 'Epic')
  const [pairs, setPairs] = useState<{ pi: AzureIteration; sprint: AzureIteration }[] | null>(null)
  const [choice, setChoice] = useState(0)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!azure.config || !azure.pat) return
    let active = true
    readAzureIterations(azure.config, azure.pat).then((options) => {
      if (!active) return
      const current = currentIterationPairs(options)
      setPairs(current.length ? current : futureIterationPairs(options))
    }).catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : 'Unable to load the PI / Sprint.') })
    return () => { active = false }
  }, [azure.config, azure.pat])
  const pair = pairs?.[choice]
  const blocked = azure.isSample ? 'Synthetic sample data is loaded: creating in Azure DevOps is disabled.' : !azure.config || !azure.pat ? 'Connect the QMS-0025 Time Writing connection with a PAT first (Settings → Azure DevOps).' : !epic ? `Epic #${dpEpicId} is not on the loaded QMS-0025 board: load the board first.` : !pair ? (error || 'Loading the PI / Sprint…') : !ready.length ? 'None of the selected releases can be created (see the reasons).' : ''

  function create() {
    if (blocked || !azure.config || !epic || !pair) return
    const config = azure.config, token = azure.pat, month = currentIndiaMonth(), adhoc = adhocAfterLock(month)
    const started = runInBackground(`dp-bulk:${ready.map((line) => line.row.id).join(',')}`, `Create ${ready.length} DP Feature${ready.length === 1 ? '' : 's'}`, async (progress) => {
      const done: string[] = [], failed: string[] = []
      for (const [index, line] of ready.entries()) {
        progress(`${index + 1} of ${ready.length}: ${line.title}…`)
        try {
          const feature = { parentId: epic.id, title: line.title, description: withFeatureDoD(line.set!.featureDoD, '', line.type), acceptanceCriteria: '', areaPath: epic.areaPath, iterationPath: pair.pi.path, storyIterationPath: pair.sprint.path, assignedTo: line.email }
          const bundle = await createFeatureFromSetup(config, token, feature, { stories: line.set!.stories, reviewStory: false, ...(setup?.timeWritingStory ? { timeWritingStory: setup.timeWritingStory } : {}), task: { ...(setup?.task ?? { title: '{month} | {feature}', description: '', assignedTo: '', areaPath: '', iterationPath: '' }), assignedTo: line.email } }, month, undefined, adhoc)
          azure.featureCreated([epic, ...bundle.items])
          done.push(`#${bundle.feature.id} ${line.title} → ${line.qe}`)
        } catch (failure) {
          if (failure instanceof HierarchyCreationError && failure.createdItems.length) azure.featureCreated([epic, ...failure.createdItems])
          failed.push(`${line.title}: ${failure instanceof Error ? failure.message : 'failed'}`)
        }
      }
      return { text: `${done.length} of ${ready.length} Features created${done.length ? `: ${done.join('; ')}` : ''}.${failed.length ? ` Not created: ${failed.join('; ')}` : ''}`, failed: failed.length > 0 }
    })
    if (!started) { setError('These Features are already being created (see the top bar).'); return }
    onClose()
  }

  return <Modal eyebrow="DP RELEASES" wide title={`Create Features for ${rows.length} DP release${rows.length === 1 ? '' : 's'}`} onClose={onClose}>
    <div className="dp-bulk">
      <p className="muted">Under Epic #{dpEpicId}{epic ? ` “${epic.title}”` : ''}: each Feature gets the DoD and default User Stories of its release type (Feature setup → Epic {dpEpicId}), its Time Writing story and month Task, all assigned to the QE from the QE Mapping.</p>
      <div className="azure-table"><table>
        <thead><tr><th scope="col">Feature title</th><th scope="col">Type</th><th scope="col">User Stories</th><th scope="col">QE</th><th scope="col">Result</th></tr></thead>
        <tbody>{plan.map((line) => <tr key={line.row.id} className={line.skip ? 'muted' : undefined}>
          <td>{line.title}</td>
          <td>{line.type ? `${dpTypeLabel(line.type)} (${line.set === undefined ? '' : line.type === 'Major' || line.type === 'Minor' ? 'Release set' : 'PU set'})` : '—'}</td>
          <td>{line.set ? line.set.stories.map((story) => story.title.split(' :')[0]).join(', ') || 'none' : '—'}</td>
          <td>{line.qe || '—'}{line.email && <small className="muted"> {line.email}</small>}</td>
          <td>{line.skip ? <span className="warning-text">Skipped: {line.skip}</span> : <>Will be created{line.note && <small className="warning-text"> — {line.note}</small>}</>}</td>
        </tr>)}</tbody>
      </table></div>
      {pairs && pairs.length > 1 && <label className="inline-select">PI / Sprint<select aria-label="PI / Sprint" value={choice} onChange={(event) => setChoice(Number(event.target.value))}>{pairs.map((entry, index) => <option key={entry.sprint.path} value={index}>{entry.pi.name} / {entry.sprint.name}</option>)}</select></label>}
      {pair && pairs?.length === 1 && <p className="muted">PI / Sprint: {pair.pi.name} / {pair.sprint.name}</p>}
      {blocked && <Notice tone={error ? 'error' : 'info'}>{blocked}</Notice>}
      <div className="button-row">
        <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="primary" disabled={Boolean(blocked)} onClick={create}>Create {ready.length} Feature{ready.length === 1 ? '' : 's'}</button>
      </div>
    </div>
  </Modal>
}
