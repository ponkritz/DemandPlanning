import { useMemo, useRef, useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { buildWorkItemTree, type WorkItemNode } from '../azureHierarchy'
import { addChildWorkItem, completeFeatureFromSetup, createFeatureFromSetup, updateAzureTimeWritingEffort, createAzureReleaseHierarchy, completeReleaseHierarchy, currentIndiaMonth, releaseHierarchyTitles, HierarchyCreationError, featureDescription, readAzureIterations, currentIterationPairs, futureIterationPairs, type AzureIteration, type AzureConfig, type FeatureInput } from '../azureDevOps'
import { Modal } from './ui'
import { BacklogTable } from './BacklogTable'
import { PersonPicker } from './PersonPicker'
import { AssigneeConfirm } from './AssigneeConfirm'
import { assignablePeople } from '../myWork'
import { fillTitle, missingValues, setupFor, titleValues, type FeatureSetupFile } from '../featureSetup'

// readOnly: a backlog view from another connection — no Feature creation or child completion, nothing written to Azure.
// assign: who is creating (their email) and whether they may assign new work to someone else. New Features and their
// children, and User Stories / Tasks added here, are assigned to the person chosen, else to the creator; never blank.
export function AzureWorkItemTree({ items, config, onCreated, savedPat = '', creatorEmail = '', onSavePat, readOnly = false, tabs, assign, featureSetup }: { items: AzureWorkItem[]; config: AzureConfig; onCreated?: (items: AzureWorkItem[]) => void; savedPat?: string; creatorEmail?: string; onSavePat?: (pat: string) => void; readOnly?: boolean; tabs?: React.ReactNode; assign?: { me: string; canChoose: boolean }; featureSetup?: FeatureSetupFile | null }) {
  const me = (assign?.me || creatorEmail).trim().toLowerCase(), canChoose = Boolean(assign?.canChoose)
  const people = useMemo(() => assignablePeople(items), [items])
  const [assigneeName, setAssigneeName] = useState('')
  const assignee = canChoose && assigneeName ? people.find((person) => person.name === assigneeName)?.email ?? '' : me
  const [childOf, setChildOf] = useState<AzureWorkItem | null>(null)
  const [childTitle, setChildTitle] = useState('')
  const [childIteration, setChildIteration] = useState('')
  const [childBusy, setChildBusy] = useState(false)
  const [childError, setChildError] = useState('')
  const [state, setState] = useState<string[]>(['New', 'Active'])
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [expandAll, setExpandAll] = useState(false)
  const [parent, setParent] = useState<AzureWorkItem | null>(null)
  const [title, setTitle] = useState('')
  const [releaseKind, setReleaseKind] = useState<'PU' | 'Release'>('PU')
  const [milestones, setMilestones] = useState<string[]>(['SFV', 'DT', 'IQOQ'])
  const [resumeFeature, setResumeFeature] = useState<AzureWorkItem | null>(null)
  const [resultText, setResultText] = useState('')
  const [partialError, setPartialError] = useState('')
  const [description, setDescription] = useState(featureDescription('PU'))
  const [taskOriginalEstimate, setTaskOriginalEstimate] = useState('')
  const [taskCompletedWork, setTaskCompletedWork] = useState('')
  const [iterationPath, setIterationPath] = useState('')
  const [sprintPath, setSprintPath] = useState('')
  const [iterationChoices, setIterationChoices] = useState<AzureIteration[]>([])
  const [iterationLoading, setIterationLoading] = useState(false)
  const [pat, setPat] = useState('')
  const [creating, setCreating] = useState(false)
  const submitting = useRef(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<AzureWorkItem | null>(null)
  const scoped = useMemo(() => items.filter((item) => item.state.trim().toLowerCase() !== 'removed' && item.organization.toLowerCase() === config.organization.toLowerCase() && item.project.toLowerCase() === config.project.toLowerCase()), [items, config.organization, config.project])
  const epics = scoped.filter((item) => item.workItemType === 'Epic').sort((a, b) => a.id - b.id)
  const tree = useMemo(() => buildWorkItemTree(scoped, state, search), [scoped, state, search])
  // Search reveals matches; state filtering alone must not expand thousands of fetched records.
  const filtering = Boolean(search.trim())
  const states = [...new Set(['New', 'Active', 'Closed', ...scoped.map((item) => item.state)])].filter(Boolean)
  const pairs = currentIterationPairs(iterationChoices)
  const futurePairs = futureIterationPairs(iterationChoices)
  const selectablePairs = [...pairs, ...futurePairs]
  const availableMilestones = releaseKind === 'PU' ? ['SFV', 'DT', 'IQOQ'] : ['PRD', 'SFV', 'DT', 'IQOQ']
  const monthLabel = currentIndiaMonth()
  let plan
  try { plan = releaseHierarchyTitles(title.trim(), releaseKind, monthLabel) } catch { plan = null }
  // The Epic's own setup (Settings → Feature setup), if any: its optional User Stories replace the PU / Full Release
  // milestones (all ticked by default) and its Task defaults apply.
  const epicSetup = setupFor(featureSetup ?? null, parent?.id ?? resumeFeature?.parentId)
  const [skipStories, setSkipStories] = useState<number[]>([])
  const values = titleValues(title, monthLabel)
  const filled = (template: string) => missingValues(template, values).length ? `${template} (needs “Program | Service | vRelease”)` : fillTitle(template, values)

  function openEditor(epic: AzureWorkItem) { setAssigneeName(''); setSkipStories([]); setParent(epic); setResumeFeature(null); setTitle(''); setTaskOriginalEstimate(''); setTaskCompletedWork(''); setIterationPath(''); setSprintPath(''); setIterationChoices([]); setReleaseKind('PU'); setMilestones(['SFV', 'DT', 'IQOQ']); setDescription(featureDescription('PU')); setPat(savedPat); setError(''); setPartialError(''); setResult(null); if (savedPat) void loadIterations(savedPat) }
  function openResume(item: AzureWorkItem) { setSkipStories([]); setAssigneeName(canChoose ? people.find((person) => person.email === item.assignedToEmail && person.email !== me)?.name ?? '' : ''); setParent(null); setResumeFeature(item); setTitle(item.title); setIterationPath(''); setSprintPath(''); setIterationChoices([]); setReleaseKind('PU'); setMilestones(['SFV', 'DT', 'IQOQ']); setPat(savedPat); setError(''); setPartialError(''); setResult(null); if (savedPat) void loadIterations(savedPat) }
  function closeEditor() { if (submitting.current) return; setParent(null); setResumeFeature(null); setPat(''); setError('') }
  function setKind(kind: 'PU' | 'Release') { setReleaseKind(kind); setMilestones(kind === 'PU' ? ['SFV', 'DT', 'IQOQ'] : ['PRD', 'SFV', 'DT', 'IQOQ']); setDescription(featureDescription(kind)) }
  function toggle(key: string) {
    if (expandAll) {
      const next = new Set<string>()
      const visit = (nodes: WorkItemNode[]) => { for (const node of nodes) { if (node.item.key !== key) next.add(node.item.key); visit(node.children) } }
      visit(tree); setExpanded(next); setExpandAll(false)
    } else setExpanded((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })
  }

  // ＋ User Story under a Feature, ＋ Task under a User Story: title, iteration (default the parent's) and who it is for.
  const childType = childOf?.workItemType === 'Feature' ? 'User Story' : 'Task'
  function openChild(item: AzureWorkItem) { setChildOf(item); setChildTitle(''); setChildIteration(item.iterationPath); setChildError('') }
  async function addChild(email: string) {
    if (!childOf || childBusy) return
    const token = pat || savedPat
    if (!token.trim()) { setChildError('Add the PAT of the Time Writing connection first.'); return }
    setChildBusy(true); setChildError('')
    try {
      const created = await addChildWorkItem(config, token, childOf.id, childType, childTitle, email, childIteration)
      onCreated?.([childOf, created]); setExpanded((current) => new Set([...current, childOf.key]))
      setResult(created); setResultText(`${childType} created and verified, assigned to ${email}.`); setChildOf(null)
    } catch (failure) { setChildError(failure instanceof Error ? failure.message : `Unable to create the ${childType}.`) }
    finally { setChildBusy(false) }
  }

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
    try { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assignee)) throw new Error(me ? 'Choose who the Feature and its children are assigned to.' : 'Configure the Feature creator email in Azure DevOps settings before creating a Feature.'); feature = { parentId: parent?.id ?? 0, title: title.trim(), description: String(data.get('description') ?? ''), acceptanceCriteria: String(data.get('acceptance') ?? ''), areaPath: String(data.get('areaPath') ?? ''), iterationPath, assignedTo: assignee, storyIterationPath: sprintPath, targetDate: String(data.get('targetDate') ?? ''), taskOriginalEstimate: parseHours(taskOriginalEstimate, 'Original Estimate'), taskCompletedWork: parseHours(taskCompletedWork, 'Completed Work') } }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Invalid Task effort.'); submitting.current = false; setCreating(false); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assignee)) { setError('Choose who the work is assigned to.'); submitting.current = false; setCreating(false); return }
    try {
      onSavePat?.(token)
      const choices = await readAzureIterations(config, token)
      const fresh = [...currentIterationPairs(choices), ...futureIterationPairs(choices)]
      if (!fresh.some((pair) => pair.pi.path === iterationPath && pair.sprint.path === sprintPath)) throw new Error('The selected PI/Sprint is no longer current. Reload the schedule and review it before creating. No write was attempted.')
      let bundle
      if (epicSetup) {
        const children = { stories: epicSetup.stories.filter((_, index) => !skipStories.includes(index)), task: { ...epicSetup.task, ...(feature.taskOriginalEstimate != null ? { originalEstimate: feature.taskOriginalEstimate } : {}) } }
        bundle = resumeFeature ? await completeFeatureFromSetup(config, token, resumeFeature.id, children, monthLabel, undefined, sprintPath, assignee) : await createFeatureFromSetup(config, token, feature, children, monthLabel)
        const task = bundle.items.find((item) => item.workItemType === 'Task')
        if (task && feature.taskCompletedWork != null) { const updated = await updateAzureTimeWritingEffort(config, token, task.id, undefined, feature.taskCompletedWork); bundle = { ...bundle, items: bundle.items.map((item) => item.id === task.id ? updated : item) } }
      } else bundle = resumeFeature ? await completeReleaseHierarchy(config, token, resumeFeature.id, releaseKind, milestones, monthLabel, undefined, sprintPath, assignee) : await createAzureReleaseHierarchy(config, token, feature, releaseKind, milestones, monthLabel)
      onCreated?.(parent ? [parent, ...bundle.items] : bundle.items)
      setResult(bundle.feature); setResultText(`Hierarchy complete: ${epicSetup ? `${epicSetup.stories.length - skipStories.length} optional` : milestones.length} ${epicSetup ? 'User Stories' : 'milestone stories'}, Time Writing story and ${monthLabel} task verified.`); setParent(null); setResumeFeature(null); setExpanded((current) => new Set([...current, bundle.feature.key, ...bundle.items.filter((item) => item.workItemType === 'User Story').map((item) => item.key), ...(parent ? [parent.key] : [])]))
    } catch (failure) {
      const detail = failure instanceof Error ? failure.message : 'Unable to create the hierarchy.'
      if (failure instanceof HierarchyCreationError && failure.createdItems.length) {
        onCreated?.(parent ? [parent, ...failure.createdItems] : failure.createdItems)
        setPartialError(detail); setParent(null); setResumeFeature(null)
      } else setError(detail)
    }
    finally { submitting.current = false; setCreating(false) }
  }

  return <>
    <div className="panel-heading backlog-heading"><div><p className="muted">{epics.length} Epics · {scoped.length} work items · Epic → Feature → User Story → Task</p></div>{readOnly ? <span className="pill">Read only</span> : <button className="primary" disabled={!epics.length} onClick={() => openEditor(epics[0])}>＋ New Feature</button>}</div>
    <div className="tree-controls"><div className="button-row" role="group" aria-label="Work item states (multi-select)">{[...states, 'All'].map((value) => <button key={value} className={state.includes(value) ? 'primary' : 'ghost'} aria-pressed={state.includes(value)} onClick={() => setState((current) => value === 'All' ? ['All'] : current.includes(value) ? current.filter((item) => item !== value && item !== 'All') : [...current.filter((item) => item !== 'All'), value])}>{value}</button>)}</div><input aria-label="Search work-item tree" placeholder="Search ID, title, type or assignee" value={search} onChange={(event) => setSearch(event.target.value)} /><button className="ghost" onClick={() => { setExpandAll(!expandAll); setExpanded(new Set()) }}>{expandAll ? 'Collapse all' : 'Expand all'}</button></div>
    <p className="muted tree-help">Select multiple states. Default: New + Active. Matching children retain their ancestors as context, even when the parent has another state. All Epics remain available in the New Feature selector.</p>
    {result && <div className="notice success" role="status"><a href={result.url} target="_blank" rel="noreferrer">{result.workItemType} #{result.id}: {result.title}</a> — {resultText}</div>}
    {partialError && <div className="notice error" role="alert">{partialError}</div>}
    <BacklogTable key={`${config.organization}/${config.project}/${config.team}`} scope={`${config.organization}/${config.project}/${config.team}`} tree={tree} expanded={expanded} expandAll={expandAll} searching={filtering} onToggle={toggle} onExpand={(value) => { setExpandAll(value); setExpanded(new Set()) }} onNewFeature={readOnly ? undefined : openEditor} onComplete={readOnly ? undefined : openResume} onAddChild={readOnly ? undefined : openChild} tabs={tabs} />
    {(parent || resumeFeature) && <Modal title={resumeFeature ? 'Complete Feature children' : 'Add Feature under an Epic'} eyebrow="AZURE DEVOPS WRITE" onClose={closeEditor}><form onSubmit={create}>
      <p className="muted">{resumeFeature ? 'Completes missing children without recreating the Feature.' : `Creates one real Feature and its selected children in ${config.organization} / ${config.project}.`} Review the hierarchy below. Project validation runs before each save.</p>
      {parent && <label>Parent Epic<select disabled={creating} value={parent.key} onChange={(event) => setParent(epics.find((item) => item.key === event.target.value) ?? null)}>{epics.map((epic) => <option value={epic.key} key={epic.key}>#{epic.id} · {epic.title} ({epic.state})</option>)}</select></label>}
      <label>Feature title<input name="title" required maxLength={255} value={title} onChange={(event) => setTitle(event.target.value)} disabled={creating || Boolean(resumeFeature)} placeholder="Program | Service | vRelease" autoFocus /></label>
      {parent && <><label>Area Path<input name="areaPath" key={parent.key} defaultValue={parent.areaPath} required disabled={creating} /></label>
      </>}
      <div className="iteration-picker"><button type="button" className="ghost" onClick={() => void loadIterations()} disabled={creating || iterationLoading}>{iterationLoading ? 'Loading PI / Sprint schedule…' : 'Load current & future PI / Sprint schedule'}</button><label>PI / Sprint schedule<select required value={sprintPath} onChange={(event) => { const pair = selectablePairs.find((value) => value.sprint.path === event.target.value); setSprintPath(pair?.sprint.path ?? ''); setIterationPath(pair?.pi.path ?? '') }} disabled={creating || iterationLoading}><option value="">Select a dated PI → Sprint</option>{pairs.length > 0 && <optgroup label="Current PI / Sprint">{pairs.map((pair) => <option key={pair.sprint.path} value={pair.sprint.path}>{pair.pi.path} → {pair.sprint.name} ({pair.sprint.attributes?.startDate?.slice(0, 10)} — {pair.sprint.attributes?.finishDate?.slice(0, 10)})</option>)}</optgroup>}{futurePairs.length > 0 && <optgroup label="Future PI / Sprint">{futurePairs.map((pair) => <option key={pair.sprint.path} value={pair.sprint.path}>{pair.pi.path} → {pair.sprint.name} ({pair.sprint.attributes?.startDate?.slice(0, 10)} — {pair.sprint.attributes?.finishDate?.slice(0, 10)})</option>)}</optgroup>}</select></label></div>
      <p className="muted">Current date uses India time; date boundaries are inclusive. Current and all future dated schedules are available. Feature → {resumeFeature ? resumeFeature.iterationPath : iterationPath || 'selected PI'}. User Stories → {sprintPath || 'selected Sprint'}. Time Writing task → {config.project}. Existing Features are not moved during child completion.</p>
      {!epicSetup && <label>Release classification<select value={releaseKind} disabled={creating} onChange={(event) => setKind(event.target.value as 'PU' | 'Release')}><option value="PU">PU</option><option value="Release">Full Release</option></select></label>}
      {parent && <><label>Description<textarea name="description" maxLength={100000} value={description} onChange={(event) => setDescription(event.target.value)} disabled={creating} /></label><label>Acceptance criteria<textarea name="acceptance" maxLength={100000} disabled={creating} /></label>
      <div className="form-row"><label>Feature assigned to<input readOnly value={assignee || 'Configure creator email in Azure DevOps settings'} /></label><label>Target date (optional)<input name="targetDate" type="date" disabled={creating} /></label></div></>}
      {parent && <div className="form-row"><label>Time Writing Task — Original Estimate (hours)<input type="number" min="0" max="1000000" step="0.25" value={taskOriginalEstimate} onChange={(event) => setTaskOriginalEstimate(event.target.value)} disabled={creating} placeholder={epicSetup?.task.originalEstimate != null ? `${epicSetup.task.originalEstimate} (Epic setup)` : "Optional"} /></label><label>Time Writing Task — Completed Work (hours)<input type="number" min="0" max="1000000" step="0.25" value={taskCompletedWork} onChange={(event) => setTaskCompletedWork(event.target.value)} disabled={creating} placeholder="Optional" /></label></div>}
      {canChoose ? <label>Assigned to (Feature and all its new children)<PersonPicker label="Assigned to" value={assigneeName} people={people.filter((person) => person.email !== me).map((person) => person.name)} onChange={setAssigneeName} meLabel={me ? `Me (${me})` : 'Choose a person…'} /></label>
        : <p className="muted">Assigned to: {me || 'configure the creator email'} (you).</p>}
      {epicSetup ? <>
        <fieldset className="milestone-choices" disabled={creating}><legend>Optional User Stories (setup of Epic #{epicSetup.epicId})</legend>
          {epicSetup.stories.length ? <><div className="button-row"><button type="button" className="text-button" onClick={() => setSkipStories([])}>Select all</button><button type="button" className="text-button" onClick={() => setSkipStories(epicSetup.stories.map((_, index) => index))}>Skip all</button></div>
            {epicSetup.stories.map((story, index) => <label className="checkbox-label" key={index}><input type="checkbox" checked={!skipStories.includes(index)} onChange={(event) => setSkipStories((now) => event.target.checked ? now.filter((value) => value !== index) : [...now, index])} />{filled(story.title)}</label>)}</> : <p className="muted">This Epic's setup has no optional User Stories.</p>}
        </fieldset>
        <div className="hierarchy-plan"><strong>Always included</strong><p>“{title.trim() || '{feature}'} - Time Writing” User Story in the selected Sprint and the Task “{filled(epicSetup.task.title)}”{epicSetup.task.description ? ' with the setup’s Description' : ''}: Original Estimate {taskOriginalEstimate.trim() || epicSetup.task.originalEstimate || 'none'} h, assigned to {epicSetup.task.assignedTo || assignee || 'the person chosen above'}, Area Path {epicSetup.task.areaPath || 'of the Time Writing story'}, Iteration {epicSetup.task.iterationPath || config.project}. The Feature and every new User Story are assigned to {assignee || 'the person chosen above'}.</p></div>
      </> : <>
      <fieldset className="milestone-choices" disabled={creating}><legend>Optional milestone User Stories</legend><div className="button-row"><button type="button" className="text-button" onClick={() => setMilestones(availableMilestones)}>Select all</button><button type="button" className="text-button" onClick={() => setMilestones([])}>Skip all milestones</button></div>{availableMilestones.map((milestone) => <label className="checkbox-label" key={milestone}><input type="checkbox" checked={milestones.includes(milestone)} onChange={(event) => setMilestones((current) => event.target.checked ? [...current, milestone] : current.filter((value) => value !== milestone))} />{milestone} review of deliverables</label>)}</fieldset>
      <div className="hierarchy-plan"><strong>Always included</strong><p>Time Writing User Story in the selected Sprint and one task for {monthLabel}. Task iteration: {config.project}. The Feature and every new User Story and Task are assigned to {assignee || 'the person chosen above'}.</p>{plan ? <ul>{plan.reviews.filter((review) => milestones.includes(review.milestone)).map((review) => <li key={review.milestone}>{review.title}</li>)}<li>{plan.timeWriting}<ul><li>{plan.task}</li></ul></li></ul> : <p>Enter Program | Service | vRelease to preview the exact titles.</p>}</div>
      </>}
      <label>PAT — Work Items: Read &amp; Write<input type="password" required autoComplete="off" value={pat} onChange={(event) => { setPat(event.target.value); setIterationChoices([]); setIterationPath(''); setSprintPath('') }} disabled={creating} /></label>
      <p className="muted">The configured PAT is reused and saved separately in this browser. No state, priority, notification setting or project rule is overridden.</p>
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="ghost" onClick={closeEditor} disabled={creating}>Cancel</button><button className="primary" disabled={creating || iterationLoading || (epicSetup ? !title.trim() : !plan) || !sprintPath}>{creating ? 'Creating and verifying hierarchy…' : resumeFeature ? 'Complete missing children' : 'Create Feature and children'}</button></div>
    </form></Modal>}
    {childOf && <AssigneeConfirm title={`Add a ${childType} under #${childOf.id}`} people={people} me={me} initial={childOf.assignedToEmail ?? ''} canChoose={canChoose} busy={childBusy} confirmLabel={`Create ${childType}`}
      summary={<>Creates a {childType} under {childOf.workItemType} #{childOf.id} “{childOf.title}” in {config.organization} / {config.project}, in its Area Path. Project validation runs before saving.</>}
      onCancel={() => setChildOf(null)} onConfirm={(email) => { if (childTitle.trim()) void addChild(email); else setChildError('Enter a title.') }}>
      <label>{childType} title<input required maxLength={255} value={childTitle} onChange={(event) => setChildTitle(event.target.value)} disabled={childBusy} autoFocus /></label>
      <label>Iteration Path<input value={childIteration} onChange={(event) => setChildIteration(event.target.value)} disabled={childBusy} /></label>
      {childError && <div className="notice error" role="alert">{childError}</div>}
    </AssigneeConfirm>}
  </>
}
