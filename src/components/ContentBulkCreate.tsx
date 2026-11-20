import { useEffect, useState } from 'react'
import { QePick } from './QePick'
import { epicFieldsFor, withEpicFields } from '../epicSetup'
import { useEpicSetupFile } from '../useEpicSetup'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { ReleaseEntry } from '../releaseSource'
import type { BoardHit } from '../dpBoardMatch'
import { boardPeople, contentBulk, contentPlan, personEmail } from '../contentBulk'
import { useBulkEpic } from '../useStreamEpics'
import { createFeatureFromSetup, currentIndiaMonth, currentIterationPairs, futureIterationPairs, readAzureIterations, withFeatureDoD, HierarchyCreationError, type AzureIteration } from '../azureDevOps'
import { runInBackground } from '../backgroundJobs'
import { adhocAfterLock } from '../planningLock'
import { Modal, Notice } from './ui'

// CNB-01…02: Create Features for the selected Content releases — the pop-up asks for the one person they are all
// assigned to, lists each Feature (or why it is skipped) and creates them one after another as a background job.
export function ContentBulkCreate({ releases, featureTitle, featureMatch, azure, onClose }: { releases: ReleaseEntry[]; featureTitle: (release: ReleaseEntry) => string; featureMatch: (release: ReleaseEntry) => BoardHit | undefined; azure: AzureWorkspace; onClose: () => void }) {
  // QV-59: the Content bulk Epic — mine, else shared, else built in (22919).
  const contentEpicId = useBulkEpic('Content').epicId ?? 0
  const rawPlan = contentPlan(releases, featureTitle, featureMatch)
  // EPS-03: the Epic setup's fields of the bulk Epic.
  const plan = withEpicFields(rawPlan, epicFieldsFor(useEpicSetupFile(), contentEpicId), (line) => line.release.items)
  const people = boardPeople(azure.items)
  const [person, setPerson] = useState('')
  const email = personEmail(person, people)
  // DPF-06: each release's person — the one chosen for all, or the one picked on its row.
  const [picks, setPicks] = useState<Record<string, string>>({})
  const ownerOf = (line: { release: { key: string } }) => picks[line.release.key] || email
  const ready = plan.filter((line) => !line.skip)
  const epic = azure.items.find((item) => item.id === contentEpicId && item.workItemType === 'Epic')
  const [pairs, setPairs] = useState<{ pi: AzureIteration; sprint: AzureIteration }[] | null>(null)
  const [choice, setChoice] = useState(0)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!azure.config || !azure.pat) return
    let active = true
    readAzureIterations(azure.config, azure.pat).then((options) => { if (active) { const current = currentIterationPairs(options); setPairs(current.length ? current : futureIterationPairs(options)) } })
      .catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : 'Unable to load the PI / Sprint.') })
    return () => { active = false }
  }, [azure.config, azure.pat])
  const pair = pairs?.[choice]
  const blocked = azure.isSample ? 'Synthetic sample data is loaded: creating in Azure DevOps is disabled.' : !azure.config || !azure.pat ? 'Connect the QMS-0025 Time Writing connection with a PAT first (My settings → Servers and PATs).' : !epic ? `Epic #${contentEpicId} is not on the loaded QMS-0025 board: load the board first.` : !pair ? (error || 'Loading the PI / Sprint…') : !ready.length ? 'None of the selected releases can be created (see the reasons).' : ready.some((line) => !ownerOf(line)) ? 'Choose who the Features are assigned to (a name on QMS-0025, or an email), for all or on each row.' : ''

  function create() {
    if (blocked || !azure.config || !epic || !pair) return
    const config = azure.config, token = azure.pat, month = currentIndiaMonth(), adhoc = adhocAfterLock(month)
    const started = runInBackground(`content-bulk:${ready.map((line) => line.release.key).join(',')}`, `Create ${ready.length} Content Feature${ready.length === 1 ? '' : 's'}`, async (progress) => {
      const done: string[] = [], failed: string[] = []
      for (const [index, line] of ready.entries()) {
        progress(`${index + 1} of ${ready.length}: ${line.title}…`)
        const owner = ownerOf(line)
        try {
          const feature = { parentId: epic.id, title: line.title, description: withFeatureDoD(contentBulk.featureDoD, '', contentBulk.classification, line.fieldLines), acceptanceCriteria: '', areaPath: epic.areaPath, iterationPath: pair.pi.path, storyIterationPath: pair.sprint.path, assignedTo: owner }
          const bundle = await createFeatureFromSetup(config, token, feature, { stories: [], reviewStory: true, task: { title: '{month} | {feature}', description: '', originalEstimate: contentBulk.taskEstimate, assignedTo: owner, areaPath: '', iterationPath: '' } }, month, undefined, adhoc)
          azure.featureCreated([epic, ...bundle.items])
          done.push(`#${bundle.feature.id} ${line.title} → ${owner}${line.warned.length ? ` (empty: ${line.warned.join(', ')})` : ''}`)
        } catch (failure) {
          if (failure instanceof HierarchyCreationError && failure.createdItems.length) azure.featureCreated([epic, ...failure.createdItems])
          failed.push(`${line.title}: ${failure instanceof Error ? failure.message : 'failed'}`)
        }
      }
      return { text: `${done.length} of ${ready.length} Content Features created${done.length ? `: ${done.join('; ')}` : ''}.${failed.length ? ` Not created: ${failed.join('; ')}` : ''}`, failed: failed.length > 0 }
    })
    if (!started) { setError('These Features are already being created (see the top bar).'); return }
    onClose()
  }

  return <Modal eyebrow="CONTENT RELEASES" wide title={`Create Features for ${releases.length} Content release${releases.length === 1 ? '' : 's'}`} onClose={onClose}>
    <div className="dp-bulk">
      <label className="content-assignee">Assign all the Features to<input list="content-bulk-people" aria-label="Assign all the Features to" value={person} placeholder="Type a name or an email" autoFocus onChange={(event) => setPerson(event.target.value)} /></label>
      <datalist id="content-bulk-people">{people.map((entry) => <option key={entry.email} value={entry.name}>{entry.email}</option>)}</datalist>
      {person.trim() && <small className={email ? 'muted' : 'warning-text'}>{email ? `→ ${email}` : 'Not a name on QMS-0025: type their email.'}</small>}
      <p className="muted">Under Epic #{contentEpicId}{epic ? ` “${epic.title}”` : ''}, each with Release Classification {contentBulk.classification}, the DoD “{contentBulk.featureDoD}”, the User Story “Review of Deliverables - &lt;Feature title&gt;” in the current Sprint and the Time Writing story with its month Task ({contentBulk.taskEstimate} h Original Estimate), all assigned to that person.</p>
      <div className="azure-table"><table>
        <thead><tr><th scope="col">Feature title</th><th scope="col">Assigned to</th><th scope="col">Result</th></tr></thead>
        <tbody>{plan.map((line) => <tr key={line.release.key} className={line.skip ? 'muted' : undefined}><td>{line.title}</td><td>{line.skip ? '—' : <QePick label={line.title} email={ownerOf(line)} people={people} onPick={(picked) => setPicks((current) => ({ ...current, [line.release.key]: picked }))} />}</td><td>{line.skip ? <span className="warning-text">Skipped: {line.skip}</span> : <>Will be created{line.note && <small className="warning-text"> — {line.note}</small>}{line.warned.length > 0 && <small className="warning-text"> — empty {line.warned.join(', ')}</small>}</>}</td></tr>)}</tbody>
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
