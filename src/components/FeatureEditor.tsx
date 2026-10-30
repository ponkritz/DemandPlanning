import { useEffect, useMemo, useRef, useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { completeFeatureFromSetup, createFeatureFromSetup, updateAzureTimeWritingEffort, createAzureReleaseHierarchy, completeReleaseHierarchy, currentIndiaMonth, releaseHierarchyTitles, HierarchyCreationError, featureDoD, withFeatureDoD, releaseClassifications, readAzureIterations, currentIterationPairs, futureIterationPairs, type AzureIteration, type AzureConfig, type FeatureInput } from '../azureDevOps'
import { Modal, Info } from './ui'
import { PersonPicker } from './PersonPicker'
import { assignablePeople } from '../myWork'
import { runInBackground } from '../backgroundJobs'
import { adhocAfterLock } from '../planningLock'
import { chooseSetup, defaultDoDFor, fieldKey, fieldLines, fieldPlaceholders, fieldTitle, fieldsFromItems, fieldsFromTitle, fillTitle, missingValues, reviewStoryTitle, setupFor, titleValues, type FeatureSetups } from '../featureSetup'

// The "Add Feature under an Epic" / "Complete Feature children" modal, shared by the QMS-0025 board and Assigned to
// Me. mode.parent: create a Feature (the Epic can still be changed) with its children; mode.resume: add the missing
// children of an existing Feature. The Feature and every new child are assigned to the person chosen, else to me.
// initialTitle: the Feature title to start from (Release Details: "Program | Service | vRelease" of the release).
// releaseItems: the on-prem work items of that release; they fill the Epic setup's title fields (their source field).
export type FeatureEditorMode = { parent: AzureWorkItem; resume?: undefined } | { resume: AzureWorkItem; parent?: undefined }
export interface FeatureEditorResult { feature: AzureWorkItem; items: AzureWorkItem[]; text: string; parent?: AzureWorkItem }
export function FeatureEditor({ mode, items, config, savedPat = '', me, canChoose, featureSetup, initialTitle = '', releaseItems, onSavePat, onCreated, onDone, onPartial, onClose }: { mode: FeatureEditorMode; initialTitle?: string; releaseItems?: AzureWorkItem[]; items: AzureWorkItem[]; config: AzureConfig; savedPat?: string; me: string; canChoose: boolean; featureSetup?: FeatureSetups | null; onSavePat?: (pat: string) => void; onCreated?: (items: AzureWorkItem[]) => void; onDone: (result: FeatureEditorResult) => void; onPartial: (text: string, items: AzureWorkItem[], parent?: AzureWorkItem) => void; onClose: () => void }) {
  const people = useMemo(() => assignablePeople(items), [items])
  const resumeFeature = mode.resume ?? null
  const scoped = useMemo(() => items.filter((item) => item.state.trim().toLowerCase() !== 'removed' && item.organization.toLowerCase() === config.organization.toLowerCase() && item.project.toLowerCase() === config.project.toLowerCase()), [items, config.organization, config.project])
  const epics = scoped.filter((item) => item.workItemType === 'Epic').sort((a, b) => a.id - b.id)
  const [parent, setParent] = useState<AzureWorkItem | null>(mode.parent ?? null)
  const [assigneeName, setAssigneeName] = useState(() => resumeFeature && canChoose ? people.find((person) => person.email === resumeFeature.assignedToEmail && person.email !== me)?.name ?? '' : '')
  const assignee = canChoose && assigneeName ? people.find((person) => person.name === assigneeName)?.email ?? '' : me
  const [titleText, setTitleText] = useState(resumeFeature?.title ?? initialTitle)
  // With title fields in the Epic's setup the title follows them until it is typed over.
  const [titleTyped, setTitleTyped] = useState(Boolean(resumeFeature))
  const [typedFields, setTypedFields] = useState<Record<string, string>>({})
  const [milestones, setMilestones] = useState<string[]>(['SFV', 'DT', 'IQOQ'])
  // Without an Epic setup: a PRD milestone story makes it a Full Release (its milestones and default DoD), else a PU.
  const releaseKind: 'PU' | 'Release' = milestones.includes('PRD') ? 'Release' : 'PU'
  // The Feature DoD is mandatory: it starts from the Epic's setup, else the PU / Full Release default, until typed.
  const [dodText, setDodText] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  // Optional; written into the Description as "Release Classification : …" even when left blank.
  const [releaseClassification, setReleaseClassification] = useState('')
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
  const availableMilestones = ['PRD', 'SFV', 'DT', 'IQOQ']
  const monthLabel = currentIndiaMonth()
  // Planning of the month has locked (Settings → periods): the new Time Writing Task is tagged ad-hoc.
  const lateTask = adhocAfterLock(monthLabel)
  // The Epic's own setup (Settings → Feature setup), if any: its optional User Stories replace the PU / Full Release
  // milestones (all ticked by default) and its Task defaults apply.
  // My own setup of the Epic first, else the shared one; the switch below picks the shared one instead.
  const [preferShared, setPreferShared] = useState(false)
  const epicId = parent?.id ?? resumeFeature?.parentId
  const { setup: epicSetup, source: setupSource } = chooseSetup(featureSetup, epicId, preferShared)
  const titleFields = resumeFeature ? [] : epicSetup?.titleFields ?? []
  const bothSetups = Boolean(setupFor(featureSetup?.personal ?? null, epicId) && setupFor(featureSetup?.shared ?? null, epicId))
  // Title fields in the other setup of the Epic (mine vs shared) only: say so, with a switch, instead of hiding them.
  const otherSetup = bothSetups ? chooseSetup(featureSetup, epicId, !preferShared).setup : undefined
  const fieldsElsewhere = !resumeFeature && !titleFields.length && Boolean(otherSetup?.titleFields?.length)
  const fromRelease = releaseItems?.length ? fieldsFromItems(titleFields, releaseItems) : [], fromTitle = fieldsFromTitle(titleFields, initialTitle)
  const fieldValues = titleFields.map((field, index) => typedFields[fieldKey(field.label)] ?? (fromRelease[index] || fromTitle[index] || ''))
  const title = titleFields.length && !titleTyped ? fieldTitle(fieldValues) : titleText
  const setTitle = (value: string) => { setTitleText(value); setTitleTyped(true) }
  let plan
  try { plan = releaseHierarchyTitles(title.trim(), releaseKind, monthLabel) } catch { plan = null }
  const [skipStories, setSkipStories] = useState<number[]>([])
  // The built-in "Review of Deliverables - <Feature>" story: optional, in the Sprint chosen. It and the milestone /
  // optional stories exclude each other: ticking one side clears the other. By default the stories are ticked and it
  // is not, unless there are no stories to tick.
  const [reviewChoice, setReviewChoice] = useState<boolean | null>(null)
  const reviewStory = reviewChoice ?? (epicSetup ? epicSetup.stories.length === 0 : availableMilestones.length === 0)
  const chooseReview = (checked: boolean) => { setReviewChoice(checked); if (checked) { setSkipStories(epicSetup ? epicSetup.stories.map((_, index) => index) : []); setMilestones([]) } }
  const storiesChosen = (count: number) => { if (count > 0) setReviewChoice(false) }
  const dod = dodText ?? (epicSetup ? epicSetup.featureDoD.trim() || defaultDoDFor(epicSetup) : featureDoD(releaseKind))
  const needsDoD = Boolean(parent) && !resumeFeature
  const values = { ...titleValues(title, monthLabel, titleFields), ...(titleFields.length ? fieldPlaceholders(titleFields, fieldValues) : {}) }
  const filled = (template: string) => { const missing = missingValues(template, values); return missing.length ? `${template} (needs ${titleFields.length ? missing.map((key) => titleFields.find((field) => fieldKey(field.label) === key)?.label ?? key).join(', ') : '“Program | Service | vRelease”'})` : fillTitle(template, values) }
  // The saved PAT loads the PI / Sprint schedule as soon as the editor opens.
  useEffect(() => { if (savedPat) void loadIterations(savedPat) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  function closeEditor() { if (submitting.current) return; onClose() }

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
    try { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assignee)) throw new Error(me ? 'Choose who the Feature and its children are assigned to.' : 'Configure the Feature creator email in Azure DevOps settings before creating a Feature.'); feature = { parentId: parent?.id ?? 0, title: title.trim(), description: needsDoD ? withFeatureDoD(dod, String(data.get('description') ?? ''), releaseClassification, fieldLines(titleFields, fieldValues)) : '', acceptanceCriteria: String(data.get('acceptance') ?? ''), areaPath: String(data.get('areaPath') ?? ''), iterationPath, assignedTo: assignee, storyIterationPath: sprintPath, targetDate: String(data.get('targetDate') ?? ''), taskOriginalEstimate: parseHours(taskOriginalEstimate, 'Original Estimate'), taskCompletedWork: parseHours(taskCompletedWork, 'Completed Work') } }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Invalid Task effort.'); submitting.current = false; setCreating(false); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assignee)) { setError('Choose who the work is assigned to.'); submitting.current = false; setCreating(false); return }
    onSavePat?.(token)
    // The writes run as a background job: the form closes at once and the top bar shows progress and the result.
    const label = resumeFeature ? `Complete children of #${resumeFeature.id}` : `New Feature “${feature.title}”`
    const started = runInBackground(`feature:${resumeFeature ? resumeFeature.id : `${parent?.id}:${feature.title.toLowerCase()}`}`, label, async (progress) => {
    try {
      progress('Checking the PI / Sprint…')
      const choices = await readAzureIterations(config, token)
      const fresh = [...currentIterationPairs(choices), ...futureIterationPairs(choices)]
      if (!fresh.some((pair) => pair.pi.path === iterationPath && pair.sprint.path === sprintPath)) throw new Error('The selected PI/Sprint is no longer current. Reload the schedule and review it before creating. No write was attempted.')
      progress('Creating the Feature and its children…')
      // Checked again at Save: the lock may have passed while the form was open.
      const adhoc = adhocAfterLock(monthLabel)
      let bundle
      if (epicSetup) {
        const children = { stories: epicSetup.stories.filter((_, index) => !skipStories.includes(index)), reviewStory, titleFields: epicSetup.titleFields, ...(titleFields.length ? { fieldValues } : {}), timeWritingStory: epicSetup.timeWritingStory, task: { ...epicSetup.task, ...(feature.taskOriginalEstimate != null ? { originalEstimate: feature.taskOriginalEstimate } : {}) } }
        bundle = resumeFeature ? await completeFeatureFromSetup(config, token, resumeFeature.id, children, monthLabel, undefined, sprintPath, assignee, adhoc) : await createFeatureFromSetup(config, token, feature, children, monthLabel, undefined, adhoc)
        const task = bundle.items.find((item) => item.workItemType === 'Task')
        if (task && feature.taskCompletedWork != null) { const updated = await updateAzureTimeWritingEffort(config, token, task.id, undefined, feature.taskCompletedWork); bundle = { ...bundle, items: bundle.items.map((item) => item.id === task.id ? updated : item) } }
      } else bundle = resumeFeature ? await completeReleaseHierarchy(config, token, resumeFeature.id, releaseKind, milestones, monthLabel, undefined, sprintPath, assignee, reviewStory, adhoc) : await createAzureReleaseHierarchy(config, token, feature, releaseKind, milestones, monthLabel, undefined, reviewStory, adhoc)
      onCreated?.(parent ? [parent, ...bundle.items] : bundle.items)
      const doneText = `Hierarchy complete: ${epicSetup ? `${epicSetup.stories.length - skipStories.length} optional` : milestones.length} ${epicSetup ? 'User Stories' : 'milestone stories'}, ${reviewStory ? 'Review of Deliverables story, ' : ''}Time Writing story and ${monthLabel} task verified${adhoc ? ' (a new Task is tagged ad-hoc: planning is locked)' : ''}.`
      onDone({ feature: bundle.feature, items: bundle.items, parent: parent ?? undefined, text: doneText })
      return { text: `#${bundle.feature.id} “${bundle.feature.title}”: ${doneText}` }
    } catch (failure) {
      const detail = failure instanceof Error ? failure.message : 'Unable to create the hierarchy.'
      if (failure instanceof HierarchyCreationError && failure.createdItems.length) {
        onCreated?.(parent ? [parent, ...failure.createdItems] : failure.createdItems)
        onPartial(detail, failure.createdItems, parent ?? undefined)
        return { text: `${detail} ${failure.createdItems.length} item(s) were created; Complete Feature children adds the rest.`, failed: true }
      }
      return { text: `${detail} Nothing was created.`, failed: true }
    }
    })
    submitting.current = false; setCreating(false)
    if (!started) { setError('This Feature is already being created in the background (see the top bar).'); return }
    onClose()
  }

  // Azure-like layout: the title on top, a header strip (Assigned to, State, Area, Iteration), the DoD as the body,
  // Planning and Time Writing on the side, and the children folded into one summary that opens to change them.
  // The saved PAT is used silently; the field shows only when none is saved (or on "Use another token").
  const [showPat, setShowPat] = useState(!savedPat)
  const childCount = epicSetup ? epicSetup.stories.length - skipStories.length + (reviewStory ? 1 : 0) + 2 : milestones.length + (reviewStory ? 1 : 0) + 2
  const pairLabel = (pair: { pi: AzureIteration; sprint: AzureIteration }) => `${pair.pi.name} → ${pair.sprint.name} (${pair.sprint.attributes?.startDate?.slice(5, 10)} – ${pair.sprint.attributes?.finishDate?.slice(5, 10)})`
  return <Modal title={resumeFeature ? 'Complete Feature children' : 'New Feature'} eyebrow="AZURE DEVOPS WRITE" onClose={closeEditor}><form onSubmit={create} className="nf-form">
      <div className="nf-head">
        <span className="nf-type">FEATURE</span>
        <div className="nf-headmain">
          {parent && <div className="nf-top">
            <label>Parent Epic<select disabled={creating} value={parent.key} onChange={(event) => setParent(epics.find((item) => item.key === event.target.value) ?? null)}>{epics.map((epic) => <option value={epic.key} key={epic.key}>#{epic.id} · {epic.title}</option>)}</select></label>
            <label>Release Classification<select value={releaseClassification} disabled={creating} onChange={(event) => setReleaseClassification(event.target.value)}><option value="">(not set)</option>{releaseClassifications.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
          </div>}
          <input className="nf-title" aria-label="Feature title" name="title" required maxLength={255} value={title} onChange={(event) => setTitle(event.target.value)} disabled={creating || Boolean(resumeFeature)} placeholder={titleFields.length ? titleFields.map((field) => field.label).join(' | ') : 'Program | Service | vRelease'} autoFocus />
          {fieldsElsewhere && <p className="muted">The {setupSource === 'personal' ? 'shared' : 'your own'} setup of this Epic has title fields ({otherSetup!.titleFields!.map((field) => field.label).join(', ')}); this form uses {setupSource === 'personal' ? 'your own' : 'the shared'} setup. <button type="button" className="text-button" disabled={creating} onClick={() => { setPreferShared(!preferShared); setSkipStories([]); setReviewChoice(null); setDodText(null) }}>{setupSource === 'personal' ? 'Use the shared setup' : 'Use my own setup'}</button></p>}
          {titleFields.length > 0 && <div className="nf-fields">{titleFields.map((field, index) => <label key={field.label}>{field.label}<input value={fieldValues[index]} maxLength={255} disabled={creating} onChange={(event) => { setTypedFields((current) => ({ ...current, [fieldKey(field.label)]: event.target.value })); setTitleTyped(false) }} placeholder={field.source ? `On-prem: ${field.source}` : 'Optional'} /></label>)}</div>}
        </div>
      </div>
      <div className="nf-strip">
        <label>Assigned to{canChoose ? <PersonPicker label="Assigned to" value={assigneeName} people={people.filter((person) => person.email !== me).map((person) => person.name)} onChange={setAssigneeName} meLabel={me ? `Me (${me})` : 'Choose a person…'} /> : <span className="nf-value" title={me}>{me || 'Set your work email in Settings'}</span>}</label>
        <label>State<span className="nf-value">{resumeFeature ? resumeFeature.state : 'New'}</span></label>
        <label>Area{parent ? <input name="areaPath" key={parent.key} value={parent.areaPath} readOnly title={parent.areaPath} /> : <span className="nf-value" title={resumeFeature?.areaPath}>{resumeFeature?.areaPath.split('\\').pop()}</span>}</label>
        <label>Iteration (PI → Sprint)<select aria-label="PI / Sprint schedule" required value={sprintPath} onChange={(event) => { const pair = selectablePairs.find((value) => value.sprint.path === event.target.value); setSprintPath(pair?.sprint.path ?? ''); setIterationPath(pair?.pi.path ?? '') }} disabled={creating || iterationLoading}><option value="">{iterationLoading ? 'Loading the schedule…' : selectablePairs.length ? 'Select a PI → Sprint' : 'Load the schedule ↻'}</option>{pairs.length > 0 && <optgroup label="Current">{pairs.map((pair) => <option key={pair.sprint.path} value={pair.sprint.path}>{pairLabel(pair)}</option>)}</optgroup>}{futurePairs.length > 0 && <optgroup label="Future">{futurePairs.map((pair) => <option key={pair.sprint.path} value={pair.sprint.path}>{pairLabel(pair)}</option>)}</optgroup>}</select>
          <button type="button" className="text-button" onClick={() => void loadIterations()} disabled={creating || iterationLoading || !(pat || savedPat)} title="Reload the current and future PI / Sprint schedule">↻ Reload</button></label>
      </div>
      <div className="nf-body">
        <div className="nf-main">
          {parent && <><label>Feature DoD (Definition of Done) — required<textarea required maxLength={100000} rows={4} value={dod} onChange={(event) => setDodText(event.target.value)} disabled={creating} placeholder="e.g. IQOQ finished and Checklist uploaded into the Feature." /><small>{dodText == null && epicSetup?.featureDoD.trim() ? `From the ${setupSource === 'personal' ? 'your own' : 'shared'} setup of Epic #${epicSetup.epicId}. ` : ''}Saved at the top of the Description.</small></label>
            <details className="nf-more"><summary>Description and acceptance criteria (optional)</summary>
              <label>Description<textarea name="description" maxLength={100000} value={description} onChange={(event) => setDescription(event.target.value)} disabled={creating} /></label>
              <label>Acceptance criteria<textarea name="acceptance" maxLength={100000} disabled={creating} /></label>
            </details></>}
          {resumeFeature && <p className="muted">Adds the missing children of #{resumeFeature.id} without recreating the Feature. Existing children with the same title are reused.</p>}
        </div>
        <div className="nf-side">
          <h4>Planning</h4>
          {parent && <label>Target date<input name="targetDate" type="date" disabled={creating} /></label>}
          {parent && <><h4>Time Writing ({monthLabel})</h4>
            {lateTask && <p className="muted adhoc-note">Planning for {monthLabel} is locked: the new Task is tagged <code>ad-hoc</code>.</p>}
            <label>Original Estimate (h)<input type="number" min="0" max="1000000" step="0.25" value={taskOriginalEstimate} onChange={(event) => setTaskOriginalEstimate(event.target.value)} disabled={creating} placeholder={epicSetup?.task.originalEstimate != null ? `${epicSetup.task.originalEstimate} (setup)` : 'Optional'} /></label>
            <label>Completed Work (h)<input type="number" min="0" max="1000000" step="0.25" value={taskCompletedWork} onChange={(event) => setTaskCompletedWork(event.target.value)} disabled={creating} placeholder="Optional" /></label></>}
        </div>
      </div>
      <section className="nf-children"><h4><strong>Child work items</strong> · {childCount} will be created or checked{epicSetup ? ` · ${setupSource === 'personal' ? 'your' : 'shared'} setup of Epic #${epicSetup.epicId}` : ''}</h4>
        {epicSetup && bothSetups && <p className="muted setup-source"><button type="button" className="text-button" disabled={creating} onClick={() => { setPreferShared(!preferShared); setSkipStories([]); setReviewChoice(null); setDodText(null) }}>{preferShared ? 'Use my own setup instead' : 'Use the shared setup instead'}</button></p>}
        {epicSetup ? <>
          <fieldset className="milestone-choices" disabled={creating}><legend>Optional User Stories</legend>
            {epicSetup.stories.length > 0 && <div className="button-row"><button type="button" className="text-button" onClick={() => { setSkipStories([]); storiesChosen(epicSetup.stories.length) }}>Select all</button><button type="button" className="text-button" onClick={() => { setSkipStories(epicSetup.stories.map((_, index) => index)); setReviewChoice(false) }}>Deselect all</button></div>}
            {epicSetup.stories.map((story, index) => <label className="checkbox-label" key={index}><input type="checkbox" checked={!skipStories.includes(index)} onChange={(event) => { setSkipStories((now) => event.target.checked ? now.filter((value) => value !== index) : [...now, index]); if (event.target.checked) setReviewChoice(false) }} />{filled(story.title)}</label>)}
            <label className="checkbox-label"><input type="checkbox" checked={reviewStory} onChange={(event) => chooseReview(event.target.checked)} />{reviewStoryTitle(title.trim() || '{feature}')} <small className="muted">(built-in, in the Sprint)</small></label>
          </fieldset>
          <p className="muted nf-always">Always: “{filled(epicSetup.timeWritingStory.title)}” at {epicSetup.timeWritingStory.iterationPath || `${config.project} (project root)`}, with the Task “{filled(epicSetup.task.title)}”.</p>
        </> : <>
          <fieldset className="milestone-choices" disabled={creating}><legend>Optional milestone User Stories</legend><div className="button-row"><button type="button" className="text-button" onClick={() => { setMilestones(availableMilestones); storiesChosen(availableMilestones.length) }}>Select all</button><button type="button" className="text-button" onClick={() => { setMilestones([]); setReviewChoice(false) }}>Deselect all</button></div>{availableMilestones.map((milestone) => <label className="checkbox-label" key={milestone}><input type="checkbox" checked={milestones.includes(milestone)} onChange={(event) => { setMilestones((current) => event.target.checked ? availableMilestones.filter((value) => value === milestone || current.includes(value)) : current.filter((value) => value !== milestone)); if (event.target.checked) setReviewChoice(false) }} />{milestone} review of deliverables</label>)}
            <label className="checkbox-label"><input type="checkbox" checked={reviewStory} onChange={(event) => chooseReview(event.target.checked)} />{reviewStoryTitle(title.trim() || '{feature}')} <small className="muted">(built-in, in the Sprint)</small></label></fieldset>
          <p className="muted nf-always">Always: {plan ? <>“{plan.timeWriting}” at {config.project} (project root), with the Task “{plan.task}”.</> : 'the Time Writing User Story and this month’s Task (enter Program | Service | vRelease to see the titles).'}</p>
        </>}
        <p className="info-line"><Info label="Paths and assignment">Feature → {resumeFeature ? resumeFeature.iterationPath : iterationPath || 'the PI chosen'}. Optional User Stories → {sprintPath || 'the Sprint chosen'}. Time Writing story and Task → {epicSetup?.timeWritingStory.iterationPath || config.project}, never the Sprint. Every new item is assigned to {assignee || 'the person chosen'}. Current date uses India time.</Info></p>
      </section>
      {showPat ? <label>PAT — Work Items: Read &amp; Write<input type="password" required autoComplete="off" value={pat} onChange={(event) => { setPat(event.target.value); setIterationChoices([]); setIterationPath(''); setSprintPath('') }} disabled={creating} /><small>Saved in this browser only. Enter it, then ↻ Reload the schedule.</small></label>
        : <p className="muted nf-pat">Using your saved Azure DevOps token. <button type="button" className="text-button" disabled={creating} onClick={() => setShowPat(true)}>Use another token</button></p>}
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="ghost" onClick={closeEditor} disabled={creating}>Cancel</button><button className="primary" title={needsDoD && !dod.trim() ? 'Enter the Feature DoD first' : undefined} disabled={creating || iterationLoading || (needsDoD && !dod.trim()) || (epicSetup ? !title.trim() : !plan) || !sprintPath}>{creating ? 'Creating and verifying…' : resumeFeature ? 'Complete missing children' : 'Save'}</button></div>
    </form></Modal>
}
