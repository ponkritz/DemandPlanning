import { useEffect, useState } from 'react'
import { ClassPick, QePick } from './QePick'
import { boardPeople } from '../contentBulk'
import type { AzureWorkItem } from '../domain'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { FeatureSetups } from '../featureSetup'
import { bulkEpicMissing } from '../bulkEpics'
import { useDpCreateContext } from '../useDpCreateContext'
import { dpCreateLines, dpStorySprints, storySprintText, withStorySprints } from '../dpCreatePlan'
import type { BoardHit } from '../dpBoardMatch'
import { createFeatureWithMonthTasks, utcMonthLabel, currentIterationPairs, futureIterationPairs, readAzureIterations, withFeatureDoD, HierarchyCreationError, type AzureIteration } from '../azureDevOps'
import { runInBackground } from '../backgroundJobs'
import { adhocAfterLock } from '../planningLock'
import { Modal, Notice } from './ui'
import { dpDateLabel, manyMonthTasks } from '../dpBulkDates'

// DPF-04: Create Features for the selected DP releases — under the DP bulk creation Epic (QV-59), each titled Program |
// Service | Release, with the DoD and default User Stories of its release type (that Epic's Feature setup), the Release
// Classification (the Epic’s list, detected from the release number by its rules, DPF-11), the Time Writing story and month Task, all assigned to the QE from
// the QE page, in the PI / Sprint chosen. One after another as a background job; releases that cannot be created
// are listed with the reason and skipped.
// DPF-13…DPF-16: each Feature gets its Start date and Target date from the DP query's date columns mapped in Admin →
// Stream options → Bulk creation Epics (DRPE Date and DDT Date by default), shown per row; a missing date is left
// empty with a note, a Start date after the Target date skips the row with the reason. The Time Writing Tasks are the
// current month's only (as before), or — with the optional tick box — every month from the Start date's month to the
// Target date's month (never before the current month, New Feature's rule; the row says when it starts later).
// The pop-up is full size (UI-30): its list scrolls between the fixed header and actions.
export function DpBulkCreate({ rows, azure, featureSetup, featureMatch, onClose }: { rows: AzureWorkItem[]; azure: AzureWorkspace; featureSetup?: FeatureSetups | null; featureMatch: (row: AzureWorkItem) => BoardHit | undefined; onClose: () => void }) {
  // DPF-17: the same settings and rules as the New Feature form from a DP release (dpCreatePlan): the DP bulk Epic
  // (QV-59; 0: not set, Create is blocked), its setup, QE page (DPF-02), Release Classification (DPF-07, DPF-08) and
  // Epic setup fields (EPS-03), the dates (DPF-14, DPF-15) and the Time Writing months (DPF-16).
  const context = useDpCreateContext(featureSetup)
  const { epicId: dpEpicId, setup, classes, dateColumns } = context
  // DPF-06: the QE picked per release in the pop-up (email by release), in place of the QE page's.
  const [picks, setPicks] = useState<Record<string, string>>({})
  const people = boardPeople(azure.items)
  const [classPicks, setClassPicks] = useState<Record<string, string>>({})
  // DPF-16: optional, not ticked by default — unticked keeps one Task for the current month, as before.
  const [fromStart, setFromStart] = useState(false)
  const currentMonth = utcMonthLabel()
  // EPS-10: the iteration tree, for the Sprint of each User Story from its milestone date.
  const [iterations, setIterations] = useState<AzureIteration[] | null>(null)
  const lines = dpCreateLines(rows, context, { board: azure.items, featureMatch, classPicks, qePicks: picks, people, fromStart, currentMonth })
    .map((line) => ({ ...line, sprints: dpStorySprints(line.set?.stories ?? [], line.row, iterations) }))
  const ready = lines.filter((line) => !line.skip)
  const taskTotal = ready.reduce((sum, line) => sum + line.months.length, 0)
  const epic = azure.items.find((item) => item.id === dpEpicId && item.workItemType === 'Epic')
  const [pairs, setPairs] = useState<{ pi: AzureIteration; sprint: AzureIteration }[] | null>(null)
  const [choice, setChoice] = useState(0)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!azure.config || !azure.pat) return
    let active = true
    readAzureIterations(azure.config, azure.pat).then((options) => {
      if (!active) return
      setIterations(options)
      const current = currentIterationPairs(options)
      setPairs(current.length ? current : futureIterationPairs(options))
    }).catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : 'Unable to load the PI / Sprint.') })
    return () => { active = false }
  }, [azure.config, azure.pat])
  const pair = pairs?.[choice]
  const blocked = azure.isSample ? 'Synthetic sample data is loaded: creating in Azure DevOps is disabled.' : !azure.config || !azure.pat ? 'Connect the QMS-0025 Time Writing connection with a PAT first (My settings → Servers and PATs).' : !dpEpicId ? bulkEpicMissing('DP') : !epic ? `Epic #${dpEpicId} is not on the loaded QMS-0025 board: load the board first.` : !pair ? (error || 'Loading the PI / Sprint…') : !ready.length ? 'None of the selected releases can be created (see the reasons).' : ''

  function create() {
    if (blocked || !azure.config || !epic || !pair) return
    const config = azure.config, token = azure.pat
    const started = runInBackground(`dp-bulk:${ready.map((line) => line.row.id).join(',')}`, `Create ${ready.length} DP Feature${ready.length === 1 ? '' : 's'}`, async (progress) => {
      const done: string[] = [], failed: string[] = []
      for (const [index, line] of ready.entries()) {
        progress(`${index + 1} of ${ready.length}: ${line.title}…`)
        try {
          const feature = { parentId: epic.id, title: line.title, description: withFeatureDoD(line.set!.featureDoD, '', undefined, line.fieldLines), acceptanceCriteria: '', areaPath: epic.areaPath, iterationPath: pair.pi.path, storyIterationPath: pair.sprint.path, assignedTo: line.email, ...(line.dates.start ? { startDate: line.dates.start } : {}), ...(line.dates.target ? { targetDate: line.dates.target } : {}) }
          // DPF-16: the Time Writing months chosen (current month only, or Start to Target), each Task ad-hoc after its lock.
          const bundle = await createFeatureWithMonthTasks(config, token, feature, { stories: withStorySprints(line.set!.stories, line.sprints), reviewStory: false, ...(setup?.timeWritingStory ? { timeWritingStory: setup.timeWritingStory } : {}), task: { ...(setup?.task ?? { title: '{month} | {feature}', description: '', assignedTo: '', areaPath: '', iterationPath: '' }), assignedTo: line.email } }, line.months, adhocAfterLock)
          azure.featureCreated([epic, ...bundle.items])
          done.push(`#${bundle.feature.id} ${line.title} → ${line.qe}${line.months.length > 1 ? ` (${line.months.length} month Tasks)` : ''}${line.warned.length ? ` (empty: ${line.warned.join(', ')})` : ''}`)
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

  const monthsText = (months: string[]) => months.length === 1 ? months[0] : `${months.length}: ${months[0]} – ${months[months.length - 1]}`
  const startLabel = dpDateLabel(dateColumns.start), targetLabel = dpDateLabel(dateColumns.target)
  return <Modal eyebrow="DP RELEASES" full title={`Create Features for ${rows.length} DP release${rows.length === 1 ? '' : 's'}`} onClose={onClose}>
    <div className="dp-bulk">
      <p className="muted">Under Epic #{dpEpicId}{epic ? ` “${epic.title}”` : ''}: each Feature gets the DoD and User Stories of the {classes.label} chosen on its row (Admin → Epic &amp; Feature setup → Epic {dpEpicId}; a value without its own set uses the Epic’s default), its Time Writing story and month Task, all assigned to the QE from the QE page (or the person chosen on its row). <strong>Start date</strong> from the {startLabel}, <strong>Target date</strong> from the {targetLabel} (Admin → Stream options → Bulk creation Epics → DP bulk creation dates).</p>
      <div className="dp-bulk-months">
        <label className="check"><input type="checkbox" checked={fromStart} onChange={(event) => setFromStart(event.target.checked)} aria-describedby="dp-bulk-months-help" />Create Time Writing month Tasks from the Start date to the Target date</label>
        <small id="dp-bulk-months-help" className="muted">{fromStart ? 'One Task per month from the Start date’s month to the Target date’s month; a month before this one cannot get a new Task, so such a row starts in the current month (see its Time Writing Tasks).' : `Not ticked: one Time Writing Task per Feature, for ${currentMonth}, as before.`} {ready.length > 0 && <strong>{taskTotal} Time Writing Task{taskTotal === 1 ? '' : 's'} in all.</strong>}</small>
      </div>
      <div className="azure-table modal-scroll"><table aria-label="DP releases to create">
        <thead><tr><th scope="col">Release name</th><th scope="col">Version</th>{classes.values.length > 0 && <th scope="col">{classes.label}</th>}<th scope="col">Feature title</th><th scope="col">User Stories</th><th scope="col" title={`From ${startLabel}`}>Start date</th><th scope="col" title={`From ${targetLabel}`}>Target date</th><th scope="col">Time Writing Tasks</th><th scope="col">QE</th><th scope="col">Result</th></tr></thead>
        <tbody>{lines.map((line) => <tr key={line.row.id} className={line.skip ? 'muted' : undefined}>
          <td>{line.name}</td>
          <td>{line.version || '—'}</td>
          {classes.values.length > 0 && <td><ClassPick label={line.title} field={classes.label} values={classes.values} value={line.classification} detected={line.detected} version={line.version} onPick={(value) => setClassPicks((current) => ({ ...current, [String(line.row.id)]: value }))} /></td>}
          <td>{line.title}</td>
          <td>{line.set ? line.set.stories.map((story) => story.title.split(' :')[0]).join(', ') || 'none' : '—'}{storySprintText(line.sprints) && <small className="muted dp-story-sprints">{storySprintText(line.sprints)}</small>}{line.sprints.filter((entry) => entry.note).map((entry) => <small key={entry.note} className="warning-text">{entry.note}</small>)}</td>
          <td className="nowrap">{line.dates.start ?? <span className="warning-text">—</span>}</td>
          <td className="nowrap">{line.dates.target ?? <span className="warning-text">—</span>}</td>
          <td>{line.months.length ? <>{monthsText(line.months)}{line.monthsNote && <small className="muted">{line.monthsNote}</small>}{line.months.length > manyMonthTasks && <small className="warning-text">{line.months.length} month Tasks: check the Target date</small>}</> : '—'}</td>
          <td>{line.baseSkip ? (line.qe || '—') : <QePick label={line.title} email={line.email} mapped={line.mappedQe} people={people} onPick={(email) => setPicks((current) => ({ ...current, [String(line.row.id)]: email }))} />}</td>
          <td>{line.skip ? <span className="warning-text">Skipped: {line.skip}</span> : <>Will be created{line.note && <small className="warning-text"> — {line.note}</small>}{line.warned.length > 0 && <small className="warning-text"> — empty {line.warned.join(', ')}</small>}{line.dates.notes.map((note) => <small key={note} className="warning-text"> — {note}</small>)}</>}</td>
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
