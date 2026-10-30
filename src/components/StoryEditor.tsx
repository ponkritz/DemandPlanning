import { useEffect, useMemo, useRef, useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { createUserStory, readAzureIterations, currentIterationPairs, futureIterationPairs, validStoryPoints, storyPriorities, storyRisks, storyValueAreas, type AzureIteration, type AzureConfig } from '../azureDevOps'
import { Modal } from './ui'
import { PersonPicker } from './PersonPicker'
import { assignablePeople } from '../myWork'
import { runInBackground } from '../backgroundJobs'

// ＋ User Story under a Feature, laid out like New Feature (Backlogs and Assigned to Me): the parent Feature (can be
// changed) and the title on top, a strip with Assigned to, State, Area and PI → Sprint, then Description and Acceptance
// criteria, with Planning (Story Points, Priority, Risk) and Classification (Value area) beside them, as in Azure DevOps. Save runs as a background job: the form closes and the top bar shows the result.
export interface StoryEditorResult { story: AzureWorkItem; feature: AzureWorkItem; text: string }
export function StoryEditor({ feature: initial, items, config, savedPat = '', me, canChoose, onSavePat, onCreated, onDone, onFailed, onClose }: { feature: AzureWorkItem; items: AzureWorkItem[]; config: AzureConfig; savedPat?: string; me: string; canChoose: boolean; onSavePat?: (pat: string) => void; onCreated?: (items: AzureWorkItem[]) => void; onDone: (result: StoryEditorResult) => void; onFailed?: (text: string) => void; onClose: () => void }) {
  const people = useMemo(() => assignablePeople(items), [items])
  // Features of this project (not Removed or Closed), with the one the form was opened on always listed.
  const features = useMemo(() => {
    const list = items.filter((item) => item.workItemType === 'Feature' && !['removed', 'closed'].includes(item.state.trim().toLowerCase()) && item.organization.toLowerCase() === config.organization.toLowerCase() && item.project.toLowerCase() === config.project.toLowerCase())
    return (list.some((item) => item.key === initial.key) ? list : [initial, ...list]).sort((a, b) => a.id - b.id)
  }, [items, config.organization, config.project, initial])
  const [feature, setFeature] = useState(initial)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [acceptance, setAcceptance] = useState('')
  const [storyPoints, setStoryPoints] = useState('')
  // Azure's defaults for a new User Story: Priority 2, Value area Business, no Risk.
  const [priority, setPriority] = useState(2)
  const [risk, setRisk] = useState('')
  const [valueArea, setValueArea] = useState('Business')
  const [assigneeName, setAssigneeName] = useState('')
  const assignee = canChoose && assigneeName ? people.find((person) => person.name === assigneeName)?.email ?? '' : me
  const [sprintPath, setSprintPath] = useState('')
  const [iterationChoices, setIterationChoices] = useState<AzureIteration[]>([])
  const [iterationLoading, setIterationLoading] = useState(false)
  const [pat, setPat] = useState(savedPat)
  const [showPat, setShowPat] = useState(!savedPat)
  const [error, setError] = useState('')
  const submitting = useRef(false)
  const pairs = currentIterationPairs(iterationChoices), futurePairs = futureIterationPairs(iterationChoices)
  const pairLabel = (pair: { pi: AzureIteration; sprint: AzureIteration }) => `${pair.pi.name} → ${pair.sprint.name} (${pair.sprint.attributes?.startDate?.slice(5, 10)} – ${pair.sprint.attributes?.finishDate?.slice(5, 10)})`
  // The saved PAT loads the PI / Sprint schedule as soon as the form opens; one current Sprint is chosen for you.
  useEffect(() => { if (savedPat) void loadIterations(savedPat) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadIterations(token = pat || savedPat) {
    setError(''); setIterationLoading(true)
    try {
      const options = await readAzureIterations(config, token)
      setIterationChoices(options)
      const current = currentIterationPairs(options), future = futureIterationPairs(options)
      if (current.length === 1) setSprintPath(current[0].sprint.path)
      else if (!current.length && future.length === 1) setSprintPath(future[0].sprint.path)
      else { setSprintPath(''); setError(current.length ? 'Several current PI/Sprint branches overlap. Select the correct team schedule below.' : future.length ? 'No current dated Sprint was found. Select one future PI/Sprint below.' : 'No current or future dated PI → Sprint pair found. Check start/finish dates and nesting in Azure Project settings, then reload.') }
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to load iteration paths.') }
    finally { setIterationLoading(false) }
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    const token = pat || savedPat
    const points = storyPoints.trim() ? Number(storyPoints) : undefined
    if (points != null && !validStoryPoints(points)) { setError('Story Points must be a number from 0 to 1,000.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assignee)) { setError(me ? 'Choose who the User Story is assigned to.' : 'Set your work email (Feature creator email on the Time Writing connection) first.'); return }
    if (!token.trim()) { setError('Enter a Work Items (Read & Write) PAT.'); return }
    submitting.current = true
    onSavePat?.(token)
    const input = { parentId: feature.id, title: title.trim(), description, acceptanceCriteria: acceptance, iterationPath: sprintPath, assignedTo: assignee, ...(points != null ? { storyPoints: points } : {}), priority, ...(risk ? { risk } : {}), valueArea }
    const started = runInBackground(`story:${feature.id}:${input.title.toLowerCase()}`, `New User Story “${input.title}”`, async (progress) => {
      try {
        progress('Checking the PI / Sprint…')
        const choices = await readAzureIterations(config, token)
        if (![...currentIterationPairs(choices), ...futureIterationPairs(choices)].some((pair) => pair.sprint.path === input.iterationPath)) throw new Error('The selected PI/Sprint is no longer current. Reload the schedule and review it before creating. No write was attempted.')
        progress('Creating the User Story…')
        const story = await createUserStory(config, token, input)
        onCreated?.([feature, story])
        const text = `created under Feature #${feature.id} and verified, assigned to ${input.assignedTo}.`
        onDone({ story, feature, text })
        return { text: `User Story #${story.id} “${story.title}” ${text}` }
      } catch (failure) {
        const text = failure instanceof Error ? failure.message : 'Unable to create the User Story.'
        onFailed?.(text)
        return { text, failed: true }
      }
    })
    submitting.current = false
    if (!started) { setError('This User Story is already being created in the background (see the top bar).'); return }
    onClose()
  }

  return <Modal title="New User Story" eyebrow="AZURE DEVOPS WRITE" onClose={onClose}><form onSubmit={save} className="nf-form">
    <div className="nf-head">
      <span className="nf-type nf-type-story">USER STORY</span>
      <div className="nf-headmain">
        <div className="nf-top nf-top-one">
          <label>Parent Feature<select value={feature.key} onChange={(event) => setFeature(features.find((item) => item.key === event.target.value) ?? feature)}>{features.map((item) => <option value={item.key} key={item.key}>#{item.id} · {item.title}</option>)}</select></label>
        </div>
        <input className="nf-title" aria-label="User Story title" required maxLength={255} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="User Story title" autoFocus />
      </div>
    </div>
    <div className="nf-strip">
      <label>Assigned to{canChoose ? <PersonPicker label="Assigned to" value={assigneeName} people={people.filter((person) => person.email !== me).map((person) => person.name)} onChange={setAssigneeName} meLabel={me ? `Me (${me})` : 'Choose a person…'} /> : <span className="nf-value" title={me}>{me || 'Set your work email in Settings'}</span>}</label>
      <label>State<span className="nf-value">New</span></label>
      <label>Area<span className="nf-value" title={feature.areaPath}>{feature.areaPath.split('\\').pop()}</span></label>
      <label>Iteration (PI → Sprint)<select aria-label="PI / Sprint schedule" required value={sprintPath} onChange={(event) => setSprintPath(event.target.value)} disabled={iterationLoading}><option value="">{iterationLoading ? 'Loading the schedule…' : pairs.length + futurePairs.length ? 'Select a PI → Sprint' : 'Load the schedule ↻'}</option>{pairs.length > 0 && <optgroup label="Current">{pairs.map((pair) => <option key={pair.sprint.path} value={pair.sprint.path}>{pairLabel(pair)}</option>)}</optgroup>}{futurePairs.length > 0 && <optgroup label="Future">{futurePairs.map((pair) => <option key={pair.sprint.path} value={pair.sprint.path}>{pairLabel(pair)}</option>)}</optgroup>}</select>
        <button type="button" className="text-button" onClick={() => void loadIterations()} disabled={iterationLoading || !(pat || savedPat)} title="Reload the current and future PI / Sprint schedule">↻ Reload</button></label>
    </div>
    <div className="nf-body">
      <div className="nf-main">
        <label>Description<textarea maxLength={100000} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label>Acceptance criteria<textarea maxLength={100000} rows={3} value={acceptance} onChange={(event) => setAcceptance(event.target.value)} /></label>
      </div>
      <div className="nf-side">
        <h4>Planning</h4>
        <label>Story Points<input type="number" min="0" max="1000" step="any" value={storyPoints} onChange={(event) => setStoryPoints(event.target.value)} placeholder="Optional" /></label>
        <label>Priority<select value={priority} onChange={(event) => setPriority(Number(event.target.value))}>{storyPriorities.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Risk<select value={risk} onChange={(event) => setRisk(event.target.value)}><option value="">(not set)</option>{storyRisks.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <h4>Classification</h4>
        <label>Value area<select value={valueArea} onChange={(event) => setValueArea(event.target.value)}>{storyValueAreas.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      </div>
    </div>
    {showPat ? <label>PAT — Work Items: Read &amp; Write<input type="password" required autoComplete="off" value={pat} onChange={(event) => { setPat(event.target.value); setIterationChoices([]); setSprintPath('') }} /><small>Saved in this browser only. Enter it, then ↻ Reload the schedule.</small></label>
      : <p className="muted nf-pat">Using your saved Azure DevOps token. <button type="button" className="text-button" onClick={() => setShowPat(true)}>Use another token</button></p>}
    {error && <div className="notice error" role="alert">{error}</div>}
    <div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button className="primary" disabled={iterationLoading || !title.trim() || !sprintPath}>Save</button></div>
  </form></Modal>
}
