import { useEffect, useMemo, useRef, useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { completeFeatureFromSetup, createFeatureFromSetup, updateAzureTimeWritingEffort, createAzureReleaseHierarchy, completeReleaseHierarchy, currentIndiaMonth, releaseHierarchyTitles, HierarchyCreationError, featureDoD, withFeatureDoD, readAzureIterations, currentIterationPairs, futureIterationPairs, type AzureIteration, type AzureConfig, type FeatureInput } from '../azureDevOps'
import { Modal, Info } from './ui'
import { PersonPicker } from './PersonPicker'
import { assignablePeople } from '../myWork'
import { chooseSetup, defaultDoDFor, fillTitle, missingValues, setupFor, titleValues, type FeatureSetups } from '../featureSetup'

// The "Add Feature under an Epic" / "Complete Feature children" modal, shared by the QMS-0025 board and Assigned to
// Me. mode.parent: create a Feature (the Epic can still be changed) with its children; mode.resume: add the missing
// children of an existing Feature. The Feature and every new child are assigned to the person chosen, else to me.
export type FeatureEditorMode = { parent: AzureWorkItem; resume?: undefined } | { resume: AzureWorkItem; parent?: undefined }
export interface FeatureEditorResult { feature: AzureWorkItem; items: AzureWorkItem[]; text: string; parent?: AzureWorkItem }
export function FeatureEditor({ mode, items, config, savedPat = '', me, canChoose, featureSetup, onSavePat, onCreated, onDone, onPartial, onClose }: { mode: FeatureEditorMode; items: AzureWorkItem[]; config: AzureConfig; savedPat?: string; me: string; canChoose: boolean; featureSetup?: FeatureSetups | null; onSavePat?: (pat: string) => void; onCreated?: (items: AzureWorkItem[]) => void; onDone: (result: FeatureEditorResult) => void; onPartial: (text: string, items: AzureWorkItem[], parent?: AzureWorkItem) => void; onClose: () => void }) {
  const people = useMemo(() => assignablePeople(items), [items])
  const resumeFeature = mode.resume ?? null
  const scoped = useMemo(() => items.filter((item) => item.state.trim().toLowerCase() !== 'removed' && item.organization.toLowerCase() === config.organization.toLowerCase() && item.project.toLowerCase() === config.project.toLowerCase()), [items, config.organization, config.project])
  const epics = scoped.filter((item) => item.workItemType === 'Epic').sort((a, b) => a.id - b.id)
  const [parent, setParent] = useState<AzureWorkItem | null>(mode.parent ?? null)
  const [assigneeName, setAssigneeName] = useState(() => resumeFeature && canChoose ? people.find((person) => person.email === resumeFeature.assignedToEmail && person.email !== me)?.name ?? '' : '')
  const assignee = canChoose && assigneeName ? people.find((person) => person.name === assigneeName)?.email ?? '' : me
  const [title, setTitle] = useState(resumeFeature?.title ?? '')
  const [releaseKind, setReleaseKind] = useState<'PU' | 'Release'>('PU')
  const [milestones, setMilestones] = useState<string[]>(['SFV', 'DT', 'IQOQ'])
  // The Feature DoD is mandatory: it starts from the Epic's setup, else the PU / Full Release default, until typed.
  const [dodText, setDodText] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [taskOriginalEstimate, setTaskOriginalEstimate] = useState('')
  const [taskCompletedWork, setTaskCompletedWork] = useState('')
  const [iterationPath, setIterationPath] = useState('')
  const [sprintPath, setSprintPath] = useState('')
  const [iterationChoices, setIterationChoices] = useState<AzureIteration[]>([])
  const [iterationLoading, setIterationLoading] = useState(false)
  const [pat, setPat] = useState(savedPat)
  const [creating, setCreating] = useState(false)
  const submitting = useRef(false)
  const [error, setError] = useState('')
  const pairs = currentIterationPairs(iterationChoices)
  const futurePairs = futureIterationPairs(iterationChoices)
  const selectablePairs = [...pairs, ...futurePairs]
  const availableMilestones = releaseKind === 'PU' ? ['SFV', 'DT', 'IQOQ'] : ['PRD', 'SFV', 'DT', 'IQOQ']
  const monthLabel = currentIndiaMonth()
  let plan
  try { plan = releaseHierarchyTitles(title.trim(), releaseKind, monthLabel) } catch { plan = null }
  // The Epic's own setup (Settings → Feature setup), if any: its optional User Stories replace the PU / Full Release
  // milestones (all ticked by default) and its Task defaults apply.
  // My own setup of the Epic first, else the shared one; the switch below picks the shared one instead.
  const [preferShared, setPreferShared] = useState(false)
  const epicId = parent?.id ?? resumeFeature?.parentId
  const { setup: epicSetup, source: setupSource } = chooseSetup(featureSetup, epicId, preferShared)
  const bothSetups = Boolean(setupFor(featureSetup?.personal ?? null, epicId) && setupFor(featureSetup?.shared ?? null, epicId))
  const [skipStories, setSkipStories] = useState<number[]>([])
  const dod = dodText ?? (epicSetup ? epicSetup.featureDoD.trim() || defaultDoDFor(epicSetup) : featureDoD(releaseKind))
  const needsDoD = Boolean(parent) && !resumeFeature
  const values = titleValues(title, monthLabel)
  const filled = (template: string) => missingValues(template, values).length ? `${template} (needs “Program | Service | vRelease”)` : fillTitle(template, values)
  // The saved PAT loads the PI / Sprint schedule as soon as the editor opens.
  useEffect(() => { if (savedPat) void loadIterations(savedPat) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  function closeEditor() { if (submitting.current) return; onClose() }
  function setKind(kind: 'PU' | 'Release') { setReleaseKind(kind); setMilestones(kind === 'PU' ? ['SFV', 'DT', 'IQOQ'] : ['PRD', 'SFV', 'DT', 'IQOQ']) }

  async function loadIterations(token = pat || savedPat) {
    setError(''); setIterationLoading(true)
    try {
      const options = await readAzureIterations(config, token)
      setIterationChoices(options)
      const current = currentIterationPairs(options), future = futureIterationPairs(options)
      if (current.length === 1) { setIterationPath(current[0].pi.path); setSprintPath(current[0].sprint.path) }
      else if (!current.length && future.length === 1) { setIterationPath(future[0].pi.path); setSprintPath(future[0].sprint.path) }
      else { setIterationPath(''); setSprintPath(''); setError(current.length ? 'Several current PI/Sprint branches overlap. Select the correct team schedule below.' : future.length ? 'No current dated Sprint was found. Select one future PI/Sprint below.' : 'No current or future dated PI → Sprint pair found. Check start/finish dates and nesting in Azure Project settings, then reload.') }
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to load iteration paths.') }
    finally { setIterationLoading(false) }
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if ((!parent && !resumeFeature) || submitting.current) return
    const data = new FormData(event.currentTarget)
    const token = pat; setError(''); submitting.current = true; setCreating(true)
    const parseHours = (value: string, label: string) => { if (!value.trim()) return undefined; const hours = Number(value); if (!Number.isFinite(hours) || hours < 0 || hours > 1000000) throw new Error(`${label} must be a number from 0 to 1,000,000.`); return hours }
    let feature: FeatureInput
    try { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assignee)) throw new Error(me ? 'Choose who the Feature and its children are assigned to.' : 'Configure the Feature creator email in Azure DevOps settings before creating a Feature.'); feature = { parentId: parent?.id ?? 0, title: title.trim(), description: needsDoD ? withFeatureDoD(dod, String(data.get('description') ?? '')) : '', acceptanceCriteria: String(data.get('acceptance') ?? ''), areaPath: String(data.get('areaPath') ?? ''), iterationPath, assignedTo: assignee, storyIterationPath: sprintPath, targetDate: String(data.get('targetDate') ?? ''), taskOriginalEstimate: parseHours(taskOriginalEstimate, 'Original Estimate'), taskCompletedWork: parseHours(taskCompletedWork, 'Completed Work') } }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Invalid Task effort.'); submitting.current = false; setCreating(false); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assignee)) { setError('Choose who the work is assigned to.'); submitting.current = false; setCreating(false); return }
    try {
      onSavePat?.(token)
      const choices = await readAzureIterations(config, token)
      const fresh = [...currentIterationPairs(choices), ...futureIterationPairs(choices)]
      if (!fresh.some((pair) => pair.pi.path === iterationPath && pair.sprint.path === sprintPath)) throw new Error('The selected PI/Sprint is no longer current. Reload the schedule and review it before creating. No write was attempted.')
      let bundle
      if (epicSetup) {
        const children = { stories: epicSetup.stories.filter((_, index) => !skipStories.includes(index)), timeWritingStory: epicSetup.timeWritingStory, task: { ...epicSetup.task, ...(feature.taskOriginalEstimate != null ? { originalEstimate: feature.taskOriginalEstimate } : {}) } }
        bundle = resumeFeature ? await completeFeatureFromSetup(config, token, resumeFeature.id, children, monthLabel, undefined, sprintPath, assignee) : await createFeatureFromSetup(config, token, feature, children, monthLabel)
        const task = bundle.items.find((item) => item.workItemType === 'Task')
        if (task && feature.taskCompletedWork != null) { const updated = await updateAzureTimeWritingEffort(config, token, task.id, undefined, feature.taskCompletedWork); bundle = { ...bundle, items: bundle.items.map((item) => item.id === task.id ? updated : item) } }
      } else bundle = resumeFeature ? await completeReleaseHierarchy(config, token, resumeFeature.id, releaseKind, milestones, monthLabel, undefined, sprintPath, assignee) : await createAzureReleaseHierarchy(config, token, feature, releaseKind, milestones, monthLabel)
      onCreated?.(parent ? [parent, ...bundle.items] : bundle.items)
      onDone({ feature: bundle.feature, items: bundle.items, parent: parent ?? undefined, text: `Hierarchy complete: ${epicSetup ? `${epicSetup.stories.length - skipStories.length} optional` : milestones.length} ${epicSetup ? 'User Stories' : 'milestone stories'}, Time Writing story and ${monthLabel} task verified.` })
    } catch (failure) {
      const detail = failure instanceof Error ? failure.message : 'Unable to create the hierarchy.'
      if (failure instanceof HierarchyCreationError && failure.createdItems.length) {
        onCreated?.(parent ? [parent, ...failure.createdItems] : failure.createdItems)
        onPartial(detail, failure.createdItems, parent ?? undefined)
      } else setError(detail)
    }
    finally { submitting.current = false; setCreating(false) }
  }

  return <Modal title={resumeFeature ? 'Complete Feature children' : 'Add Feature under an Epic'} eyebrow="AZURE DEVOPS WRITE" onClose={closeEditor}><form onSubmit={create}>
      <p className="muted">{resumeFeature ? 'Completes missing children without recreating the Feature.' : `Creates one real Feature and its selected children in ${config.organization} / ${config.project}.`} Review the hierarchy below. Project validation runs before each save.</p>
      {parent && <label>Parent Epic<select disabled={creating} value={parent.key} onChange={(event) => setParent(epics.find((item) => item.key === event.target.value) ?? null)}>{epics.map((epic) => <option value={epic.key} key={epic.key}>#{epic.id} · {epic.title} ({epic.state})</option>)}</select></label>}
      <label>Feature title<input name="title" required maxLength={255} value={title} onChange={(event) => setTitle(event.target.value)} disabled={creating || Boolean(resumeFeature)} placeholder="Program | Service | vRelease" autoFocus /></label>
      {parent && <><label>Area Path<input name="areaPath" key={parent.key} defaultValue={parent.areaPath} required disabled={creating} /></label>
      </>}
      <div className="iteration-picker"><button type="button" className="ghost" onClick={() => void loadIterations()} disabled={creating || iterationLoading}>{iterationLoading ? 'Loading PI / Sprint schedule…' : 'Load current & future PI / Sprint schedule'}</button><label>PI / Sprint schedule<select required value={sprintPath} onChange={(event) => { const pair = selectablePairs.find((value) => value.sprint.path === event.target.value); setSprintPath(pair?.sprint.path ?? ''); setIterationPath(pair?.pi.path ?? '') }} disabled={creating || iterationLoading}><option value="">Select a dated PI → Sprint</option>{pairs.length > 0 && <optgroup label="Current PI / Sprint">{pairs.map((pair) => <option key={pair.sprint.path} value={pair.sprint.path}>{pair.pi.path} → {pair.sprint.name} ({pair.sprint.attributes?.startDate?.slice(0, 10)} — {pair.sprint.attributes?.finishDate?.slice(0, 10)})</option>)}</optgroup>}{futurePairs.length > 0 && <optgroup label="Future PI / Sprint">{futurePairs.map((pair) => <option key={pair.sprint.path} value={pair.sprint.path}>{pair.pi.path} → {pair.sprint.name} ({pair.sprint.attributes?.startDate?.slice(0, 10)} — {pair.sprint.attributes?.finishDate?.slice(0, 10)})</option>)}</optgroup>}</select></label></div>
      <p className="info-line"><Info label="Dates and paths">Current date uses India time; date boundaries are inclusive. Current and all future dated schedules are available. Feature → {resumeFeature ? resumeFeature.iterationPath : iterationPath || 'selected PI'}. Optional User Stories → {sprintPath || 'selected Sprint'}. Time Writing User Story → {epicSetup?.timeWritingStory.iterationPath || config.project} (not the PI or Sprint). Time Writing task → {config.project}. Existing Features are not moved during child completion.</Info></p>
      {!epicSetup && <label>Release classification<select value={releaseKind} disabled={creating} onChange={(event) => setKind(event.target.value as 'PU' | 'Release')}><option value="PU">PU</option><option value="Release">Full Release</option></select></label>}
      {parent && <><label>Feature DoD (Definition of Done) — required<textarea required maxLength={100000} rows={2} value={dod} onChange={(event) => setDodText(event.target.value)} disabled={creating} placeholder="e.g. IQOQ finished and Checklist uploaded into the Feature." /><small>{dodText == null && epicSetup?.featureDoD.trim() ? `From the ${setupSource === 'personal' ? 'your own' : 'shared'} setup of Epic #${epicSetup.epicId}. ` : ''}Saved at the top of the Description as “Feature DoD: …”.</small></label><label>Description (optional)<textarea name="description" maxLength={100000} value={description} onChange={(event) => setDescription(event.target.value)} disabled={creating} /></label><label>Acceptance criteria<textarea name="acceptance" maxLength={100000} disabled={creating} /></label>
      <div className="form-row"><label>Feature assigned to<input readOnly value={assignee || 'Configure creator email in Azure DevOps settings'} /></label><label>Target date (optional)<input name="targetDate" type="date" disabled={creating} /></label></div></>}
      {parent && <div className="form-row"><label>Time Writing Task — Original Estimate (hours)<input type="number" min="0" max="1000000" step="0.25" value={taskOriginalEstimate} onChange={(event) => setTaskOriginalEstimate(event.target.value)} disabled={creating} placeholder={epicSetup?.task.originalEstimate != null ? `${epicSetup.task.originalEstimate} (Epic setup)` : "Optional"} /></label><label>Time Writing Task — Completed Work (hours)<input type="number" min="0" max="1000000" step="0.25" value={taskCompletedWork} onChange={(event) => setTaskCompletedWork(event.target.value)} disabled={creating} placeholder="Optional" /></label></div>}
      {canChoose ? <label>Assigned to (Feature and all its new children)<PersonPicker label="Assigned to" value={assigneeName} people={people.filter((person) => person.email !== me).map((person) => person.name)} onChange={setAssigneeName} meLabel={me ? `Me (${me})` : 'Choose a person…'} /></label>
        : <p className="muted">Assigned to: {me || 'configure the creator email'} (you).</p>}
      {epicSetup && <p className="muted setup-source">Using {setupSource === 'personal' ? 'your own' : 'the shared'} Feature setup of Epic #{epicSetup.epicId}.{bothSetups && <> <button type="button" className="text-button" disabled={creating} onClick={() => { setPreferShared(!preferShared); setSkipStories([]) }}>{preferShared ? 'Use my own setup' : 'Use the shared setup instead'}</button></>}</p>}
      {epicSetup ? <>
        <fieldset className="milestone-choices" disabled={creating}><legend>Optional User Stories (setup of Epic #{epicSetup.epicId})</legend>
          {epicSetup.stories.length ? <><div className="button-row"><button type="button" className="text-button" onClick={() => setSkipStories([])}>Select all</button><button type="button" className="text-button" onClick={() => setSkipStories(epicSetup.stories.map((_, index) => index))}>Skip all</button></div>
            {epicSetup.stories.map((story, index) => <label className="checkbox-label" key={index}><input type="checkbox" checked={!skipStories.includes(index)} onChange={(event) => setSkipStories((now) => event.target.checked ? now.filter((value) => value !== index) : [...now, index])} />{filled(story.title)}</label>)}</> : <p className="muted">This Epic's setup has no optional User Stories.</p>}
        </fieldset>
        <div className="hierarchy-plan"><strong>Always included</strong><p>User Story “{filled(epicSetup.timeWritingStory.title)}” in {epicSetup.timeWritingStory.iterationPath || `${config.project} (project root, not the Sprint)`}{epicSetup.timeWritingStory.assignedTo ? `, assigned to ${epicSetup.timeWritingStory.assignedTo}` : ''}{epicSetup.timeWritingStory.areaPath ? `, Area Path ${epicSetup.timeWritingStory.areaPath}` : ''}{epicSetup.timeWritingStory.description ? ' with the setup’s Description' : ''}, and the Task “{filled(epicSetup.task.title)}”{epicSetup.task.description ? ' with the setup’s Description' : ''}: Original Estimate {taskOriginalEstimate.trim() || epicSetup.task.originalEstimate || 'none'} h, assigned to {epicSetup.task.assignedTo || assignee || 'the person chosen above'}, Area Path {epicSetup.task.areaPath || 'of the Time Writing story'}, Iteration {epicSetup.task.iterationPath || config.project}. The Feature and the optional User Stories{epicSetup.timeWritingStory.assignedTo ? '' : ' and the Time Writing story'} are assigned to {assignee || 'the person chosen above'}.</p></div>
      </> : <>
      <fieldset className="milestone-choices" disabled={creating}><legend>Optional milestone User Stories</legend><div className="button-row"><button type="button" className="text-button" onClick={() => setMilestones(availableMilestones)}>Select all</button><button type="button" className="text-button" onClick={() => setMilestones([])}>Skip all milestones</button></div>{availableMilestones.map((milestone) => <label className="checkbox-label" key={milestone}><input type="checkbox" checked={milestones.includes(milestone)} onChange={(event) => setMilestones((current) => event.target.checked ? [...current, milestone] : current.filter((value) => value !== milestone))} />{milestone} review of deliverables</label>)}</fieldset>
      <div className="hierarchy-plan"><strong>Always included</strong><p>Time Writing User Story at the project root ({config.project}; not the PI or Sprint) and one task for {monthLabel}. Task iteration: {config.project}. The Feature and every new User Story and Task are assigned to {assignee || 'the person chosen above'}.</p>{plan ? <ul>{plan.reviews.filter((review) => milestones.includes(review.milestone)).map((review) => <li key={review.milestone}>{review.title}</li>)}<li>{plan.timeWriting}<ul><li>{plan.task}</li></ul></li></ul> : <p>Enter Program | Service | vRelease to preview the exact titles.</p>}</div>
      </>}
      <label>PAT — Work Items: Read &amp; Write<input type="password" required autoComplete="off" value={pat} onChange={(event) => { setPat(event.target.value); setIterationChoices([]); setIterationPath(''); setSprintPath('') }} disabled={creating} /></label>
      <p className="info-line"><Info label="What is sent">The configured PAT is reused and saved separately in this browser. No state, priority, notification setting or project rule is overridden.</Info></p>
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="ghost" onClick={closeEditor} disabled={creating}>Cancel</button><button className="primary" title={needsDoD && !dod.trim() ? 'Enter the Feature DoD first' : undefined} disabled={creating || iterationLoading || (needsDoD && !dod.trim()) || (epicSetup ? !title.trim() : !plan) || !sprintPath}>{creating ? 'Creating and verifying hierarchy…' : resumeFeature ? 'Complete missing children' : 'Create Feature and children'}</button></div>
    </form></Modal>
}
