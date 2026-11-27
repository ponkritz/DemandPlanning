import { useEffect, useState } from 'react'
import { ClassPick, QePick } from './QePick'
import { boardPeople } from '../contentBulk'
import { classificationOf, epicFieldsFor, withEpicFields } from '../epicSetup'
import { useEpicSetupFile } from '../useEpicSetup'
import type { ReleaseEntry } from '../releaseSource'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { FeatureSetups } from '../featureSetup'
import { chooseSetup, withLinkedStories } from '../featureSetup'
import { useBulkEpic } from '../useStreamEpics'
import { bulkEpicMissing } from '../bulkEpics'
import { useQeSource } from '../useQeSource'
import { ioccPlan, pickQe } from '../dpBulk'
import type { BoardHit } from '../dpBoardMatch'
import { createFeatureFromSetup, utcMonthLabel, currentIterationPairs, futureIterationPairs, readAzureIterations, withFeatureDoD, HierarchyCreationError, type AzureIteration } from '../azureDevOps'
import { runInBackground } from '../backgroundJobs'
import { adhocAfterLock } from '../planningLock'
import { Modal, Notice } from './ui'

// QV-59: Create Features for the selected IOCC releases by the DP rules — under the IOCC bulk Epic (mine, else shared;
// Admin → Streams → Bulk creation), each with the DoD and default User Stories of its release type
// (Release or PU set, Feature setup of that Epic), the Release Classification, the Time Writing story and month Task,
// all assigned to the QE from the QE page (by the release name), in the PI / Sprint chosen; a background job.
export function IoccBulkCreate({ releases, azure, featureSetup, featureTitle, featureMatch, onClose }: { releases: ReleaseEntry[]; azure: AzureWorkspace; featureSetup?: FeatureSetups | null; featureTitle: (release: ReleaseEntry) => string; featureMatch: (release: ReleaseEntry) => BoardHit | undefined; onClose: () => void }) {
  const epicId = useBulkEpic('IOCC').epicId ?? 0
  const unlinked = epicId ? chooseSetup(featureSetup, epicId, true).setup : undefined
  const epicFile = useEpicSetupFile()
  // STT-02: stories linked to a User Story template take its current title and description.
  const setup = withLinkedStories(unlinked, epicFile?.storyTemplates)
  // DPF-02: the QE page of the bulk Epic's setup.
  const qe = useQeSource(setup)
  // DPF-06: the QE picked per release in the pop-up (email by release), in place of the QE page's.
  const [picks, setPicks] = useState<Record<string, string>>({})
  const people = boardPeople(azure.items)
  // DPF-08: the Release Classification per row, from the Epic's list (prefilled from the release number), decides
  // the DoD and User Stories (DPF-07).
  const classes = classificationOf(epicFile, epicId)
  const [classPicks, setClassPicks] = useState<Record<string, string>>({})
  const mappedPlan = ioccPlan(releases, { setup, qe, board: azure.items, featureTitle, featureMatch, epicId, classes: classPicks, classValues: classes.values, classRules: classes.rules })
  const rawPlan = pickQe(mappedPlan, picks, (line) => line.release.key, people)
  // EPS-03: the Epic setup's fields of the bulk Epic.
  const plan = withEpicFields(rawPlan, epicFieldsFor(epicFile, epicId), (line) => line.release.items, { index: classes.fieldIndex, of: (line) => line.classification })
  const ready = plan.filter((line) => !line.skip)
  const epic = azure.items.find((item) => item.id === epicId && item.workItemType === 'Epic')
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
  const blocked = azure.isSample ? 'Synthetic sample data is loaded: creating in Azure DevOps is disabled.' : !azure.config || !azure.pat ? 'Connect the QMS-0025 Time Writing connection with a PAT first (My settings → Servers and PATs).' : !epicId ? bulkEpicMissing('IOCC') : !epic ? `Epic #${epicId} is not on the loaded QMS-0025 board: load the board first.` : !pair ? (error || 'Loading the PI / Sprint…') : !ready.length ? 'None of the selected releases can be created (see the reasons).' : ''

  function create() {
    if (blocked || !azure.config || !epic || !pair) return
    const config = azure.config, token = azure.pat, month = utcMonthLabel(), adhoc = adhocAfterLock(month)
    const started = runInBackground(`iocc-bulk:${ready.map((line) => line.release.key).join(',')}`, `Create ${ready.length} IOCC Feature${ready.length === 1 ? '' : 's'}`, async (progress) => {
      const done: string[] = [], failed: string[] = []
      for (const [index, line] of ready.entries()) {
        progress(`${index + 1} of ${ready.length}: ${line.title}…`)
        try {
          const feature = { parentId: epic.id, title: line.title, description: withFeatureDoD(line.set!.featureDoD, '', undefined, line.fieldLines), acceptanceCriteria: '', areaPath: epic.areaPath, iterationPath: pair.pi.path, storyIterationPath: pair.sprint.path, assignedTo: line.email }
          const bundle = await createFeatureFromSetup(config, token, feature, { stories: line.set!.stories, reviewStory: false, ...(setup?.timeWritingStory ? { timeWritingStory: setup.timeWritingStory } : {}), task: { ...(setup?.task ?? { title: '{month} | {feature}', description: '', assignedTo: '', areaPath: '', iterationPath: '' }), assignedTo: line.email } }, month, undefined, adhoc)
          azure.featureCreated([epic, ...bundle.items])
          done.push(`#${bundle.feature.id} ${line.title} → ${line.qe}${line.warned.length ? ` (empty: ${line.warned.join(', ')})` : ''}`)
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

  // UI-30: full size like the DP pop-up — only the list scrolls between the fixed header and actions.
  return <Modal eyebrow="IOCC RELEASES" full title={`Create Features for ${releases.length} IOCC release${releases.length === 1 ? '' : 's'}`} onClose={onClose}>
    <div className="dp-bulk">
      <p className="muted">Under Epic #{epicId}{epic ? ` “${epic.title}”` : ''}: each Feature gets {setup ? <>the DoD and User Stories of the {classes.label} chosen on its row (Admin → Feature &amp; PI setup → Epic #{epicId}; a value without its own set uses the Epic’s default)</> : <>DP's built-in Release / PU sets (Epic #{epicId || '—'} has no Feature setup)</>}, its Time Writing story and month Task, all assigned to the person chosen on its row.</p>
      <div className="azure-table modal-scroll"><table aria-label="IOCC releases to create">
        <thead><tr><th scope="col">Release name</th><th scope="col">Version</th>{classes.values.length > 0 && <th scope="col">{classes.label}</th>}<th scope="col">Feature title</th><th scope="col">User Stories</th><th scope="col">QE</th><th scope="col">Result</th></tr></thead>
        <tbody>{plan.map((line) => <tr key={line.release.key} className={line.skip ? 'muted' : undefined}>
          <td>{line.release.name}</td>
          <td>{line.release.release || '—'}</td>
          {classes.values.length > 0 && <td><ClassPick label={line.title} field={classes.label} values={classes.values} value={line.classification} detected={line.detected} version={line.release.release} onPick={(value) => setClassPicks((current) => ({ ...current, [line.release.key]: value }))} /></td>}
          <td>{line.title}</td>
          <td>{line.set ? line.set.stories.map((story) => story.title.split(' :')[0]).join(', ') || 'none' : '—'}</td>
          <td>{line.baseSkip ? (line.qe || '—') : <QePick label={line.title} email={line.email} mapped={mappedPlan.find((entry) => entry.release.key === line.release.key)?.qe} people={people} onPick={(email) => setPicks((current) => ({ ...current, [line.release.key]: email }))} />}</td>
          <td>{line.skip ? <span className="warning-text">Skipped: {line.skip}</span> : <>Will be created{line.note && <small className="warning-text"> — {line.note}</small>}{line.warned.length > 0 && <small className="warning-text"> — empty {line.warned.join(', ')}</small>}</>}</td>
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
