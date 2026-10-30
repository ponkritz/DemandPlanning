import { useEffect, useMemo, useRef, useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { addComment, editWorkItem, readAzureIterations, readComments, readWorkItemForEdit, currentIterationPairs, futureIterationPairs, updateAzureWorkItem, validStoryPoints, storyPriorities, storyRisks, storyValueAreas, type AzureConfig, type AzureIteration, type WorkItemComment } from '../azureDevOps'
import { editLocks, isAdhocTask, joinDoD, splitDoD, statesFor, type WorkItemEdit } from '../workItemEdit'
import { actualsLockedNow, planningLockedNow } from '../planningLock'
import { isTimeWritingStory } from '../azureInsights'
import { Modal } from './ui'
import { PersonPicker } from './PersonPicker'
import { assignablePeople } from '../myWork'
import { runInBackground } from '../backgroundJobs'
import { formatDateTime } from '../format'

// Edit a Feature, User Story or Task (Backlogs, Assigned to Me): the title; Assigned to, State and Iteration (Feature:
// a PI; story / Task: a Sprint, current or future); the type's own fields (Feature: DoD, Target date; story: Story
// Points, Priority, Risk, Value area; Task: Original Estimate, Completed Work under the Monthly lock rules);
// Description and Acceptance criteria; and the Discussion (read, and add a comment). Locked and not shown: Type, Parent
// and Area Path. The Time Writing story and a month Task keep their iteration; a month Task keeps its month. The form
// reads the item fresh when it opens; Save sends only what changed, refused if the item changed in Azure meanwhile.
// When a Feature moves to another PI, its open User Stories can be moved to a Sprint of that PI in the same job.
type Loaded = Awaited<ReturnType<typeof readWorkItemForEdit>>
const closedStates = ['closed', 'removed', 'resolved', 'done']
export function WorkItemEditor({ item: opened, items, config, savedPat = '', me, canChoose, onSavePat, onUpdated, onDone, onFailed, onClose }: { item: AzureWorkItem; items: AzureWorkItem[]; config: AzureConfig; savedPat?: string; me: string; canChoose: boolean; onSavePat?: (pat: string) => void; onUpdated?: (items: AzureWorkItem[]) => void; onDone?: (text: string, item: AzureWorkItem) => void; onFailed?: (text: string) => void; onClose: () => void }) {
  const people = useMemo(() => assignablePeople(items), [items])
  const [pat, setPat] = useState(savedPat)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState('')
  const [choices, setChoices] = useState<AzureIteration[]>([])
  const [comments, setComments] = useState<WorkItemComment[] | null>(null)
  const [commentsError, setCommentsError] = useState('')
  const [newComment, setNewComment] = useState('')
  const [posting, setPosting] = useState(false)
  // The form's values; set from the fresh read.
  const [title, setTitle] = useState('')
  const [assigneeName, setAssigneeName] = useState('')
  const [state, setState] = useState('')
  const [iterationPath, setIterationPath] = useState('')
  const [dod, setDod] = useState('')
  const [description, setDescription] = useState('')
  const [acceptance, setAcceptance] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [storyPoints, setStoryPoints] = useState('')
  const [priority, setPriority] = useState('')
  const [risk, setRisk] = useState('')
  const [valueArea, setValueArea] = useState('')
  const [originalEstimate, setOriginalEstimate] = useState('')
  const [completedWork, setCompletedWork] = useState('')
  const [moveStories, setMoveStories] = useState(false)
  const [storySprint, setStorySprint] = useState('')
  const submitting = useRef(false)
  const type = opened.workItemType
  const token = pat || savedPat

  async function load(withToken = token) {
    setError('')
    try {
      const fresh = await readWorkItemForEdit(config, withToken, opened.id)
      const item = fresh.item
      setLoaded(fresh)
      setTitle(item.title); setState(item.state); setIterationPath(item.iterationPath)
      setAssigneeName('')
      const parts = type === 'Feature' ? splitDoD(fresh.description) : { dod: '', rest: fresh.description }
      setDod(parts.dod); setDescription(parts.rest); setAcceptance(fresh.acceptanceCriteria)
      setTargetDate(item.targetDate?.slice(0, 10) ?? '')
      setStoryPoints(item.storyPoints == null ? '' : String(item.storyPoints)); setPriority(fresh.priority == null ? '' : String(fresh.priority)); setRisk(fresh.risk); setValueArea(fresh.valueArea)
      setOriginalEstimate(item.originalEstimate == null ? '' : String(item.originalEstimate)); setCompletedWork(item.completedWork == null ? '' : String(item.completedWork))
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not read the work item.') }
    readAzureIterations(config, withToken).then(setChoices).catch(() => setChoices([]))
    readComments(config, withToken, opened.id).then((list) => { setComments(list); setCommentsError('') }).catch((failure) => setCommentsError(failure instanceof Error ? failure.message : 'Could not read the Discussion.'))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (token) void load() }, [])

  const item = loaded?.item
  const locks = editLocks(item ?? opened)
  const month = locks.monthTask
  const planLocked = Boolean(month && (planningLockedNow(month) || isAdhocTask(item?.tags ?? '')))
  const actualLocked = Boolean(month && actualsLockedNow(month))
  const pairs = [...currentIterationPairs(choices), ...futureIterationPairs(choices)]
  // Feature: the PIs of the current and future Sprints; story / Task: those Sprints. The current value is always listed.
  const pis = [...new Map(pairs.map((pair) => [pair.pi.path, pair.pi])).values()]
  const iterationOptions = type === 'Feature' ? pis.map((pi) => ({ path: pi.path, label: pi.name })) : pairs.map((pair) => ({ path: pair.sprint.path, label: `${pair.pi.name} → ${pair.sprint.name}` }))
  const withCurrent = item && !iterationOptions.some((option) => option.path === item.iterationPath) ? [{ path: item.iterationPath, label: `${item.iterationPath.split('\\').slice(-2).join(' → ')} (current)` }, ...iterationOptions] : iterationOptions
  const states = [...new Set([...(item ? [item.state] : []), ...statesFor(type)])]
  // Blank keeps the current assignee (else me); the list offers everyone else with an email, me included.
  const current = item?.assignedToEmail ?? ''
  const assignee = canChoose && assigneeName ? people.find((person) => person.name === assigneeName)?.email ?? '' : current || me
  // Open User Stories under a Feature (not its Time Writing story), offered to follow the Feature to its new PI.
  const openStories = type === 'Feature' ? items.filter((entry) => entry.parentId === opened.id && entry.workItemType === 'User Story' && !isTimeWritingStory(entry) && !closedStates.includes(entry.state.trim().toLowerCase())) : []
  const piChanged = Boolean(item && type === 'Feature' && iterationPath !== item.iterationPath)
  const sprintsOfPi = pairs.filter((pair) => pair.pi.path === iterationPath)

  // Only what changed is sent.
  function changes(): WorkItemEdit | string {
    if (!item || !loaded) return 'The work item is not loaded yet.'
    const edit: WorkItemEdit = {}
    if (title.trim() !== item.title.trim()) edit.title = title.trim()
    if (assignee && assignee !== (item.assignedToEmail ?? '')) edit.assignedTo = assignee
    if (state !== item.state) edit.state = state
    if (iterationPath !== item.iterationPath) edit.iterationPath = iterationPath
    const parts = type === 'Feature' ? splitDoD(loaded.description) : { dod: '', rest: loaded.description }
    if (type === 'Feature' && (dod.trim() !== parts.dod || description.trim() !== parts.rest)) { if (!dod.trim()) return 'Enter the Feature DoD (Definition of Done): a Feature keeps it.'; edit.description = joinDoD(dod, description) }
    if (type !== 'Feature' && description.trim() !== parts.rest) edit.description = description.trim()
    if (acceptance.trim() !== loaded.acceptanceCriteria) edit.acceptanceCriteria = acceptance.trim()
    if (type === 'Feature' && targetDate !== (item.targetDate?.slice(0, 10) ?? '')) edit.targetDate = targetDate
    if (type === 'User Story') {
      const points = storyPoints.trim() ? Number(storyPoints) : undefined
      if (points != null && !validStoryPoints(points)) return 'Story Points must be a number from 0 to 1,000.'
      if (points != null && points !== item.storyPoints) edit.storyPoints = points
      if (priority && Number(priority) !== loaded.priority) edit.priority = Number(priority)
      if (risk !== loaded.risk) edit.risk = risk
      if (valueArea && valueArea !== loaded.valueArea) edit.valueArea = valueArea
    }
    if (type === 'Task') {
      for (const [text, current, field, label] of [[originalEstimate, item.originalEstimate, 'originalEstimate', 'Original Estimate'], [completedWork, item.completedWork, 'completedWork', 'Completed Work']] as const) {
        if (!text.trim()) continue
        const value = Number(text)
        if (!Number.isFinite(value) || value < 0 || value > 1_000_000) return `${label} must be a number from 0 to 1,000,000.`
        if (value !== current) edit[field] = value
      }
    }
    return edit
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current || !loaded) return
    const edit = changes()
    if (typeof edit === 'string') { setError(edit); return }
    const move = piChanged && moveStories && storySprint ? openStories : []
    if (!Object.keys(edit).length && !move.length) { onClose(); return }
    submitting.current = true
    onSavePat?.(token)
    const rev = loaded.rev, label = `Edit ${type} #${opened.id}`
    const started = runInBackground(`edit:${opened.id}`, label, async (progress) => {
      try {
        progress('Saving…')
        const updated = Object.keys(edit).length ? await editWorkItem(config, token, opened.id, rev, edit, { planningLocked: (value) => planningLockedNow(value), actualsLocked: (value) => actualsLockedNow(value) }) : loaded.item
        const moved: AzureWorkItem[] = [], failed: string[] = []
        for (const [index, story] of move.entries()) {
          progress(`Moving User Story ${index + 1} of ${move.length}…`)
          try { moved.push(await updateAzureWorkItem(config, token, story.id, { iterationPath: storySprint })) } catch (failure) { failed.push(`#${story.id}: ${failure instanceof Error ? failure.message : 'failed'}`) }
        }
        onUpdated?.([updated, ...moved])
        const text = `#${opened.id} saved and verified${moved.length ? `; ${moved.length} User Stor${moved.length === 1 ? 'y' : 'ies'} moved to ${storySprint.split('\\').pop()}` : ''}.${failed.length ? ` ${failed.length} not moved — ${failed.join(' · ')}` : ''}`
        onDone?.(text, updated)
        return { text, failed: failed.length > 0 }
      } catch (failure) {
        const text = failure instanceof Error ? failure.message : 'The work item could not be saved.'
        onFailed?.(text)
        return { text, failed: true }
      }
    })
    submitting.current = false
    if (!started) { setError('This work item is already being saved in the background (see the top bar).'); return }
    onClose()
  }

  async function post() {
    if (!newComment.trim() || posting) return
    setPosting(true); setCommentsError('')
    try { const added = await addComment(config, token, opened.id, newComment); setComments((list) => [added, ...(list ?? [])]); setNewComment('') }
    catch (failure) { setCommentsError(failure instanceof Error ? failure.message : 'The comment was not added.') }
    finally { setPosting(false) }
  }

  const kind = type === 'User Story' ? 'story' : type.toLowerCase()
  return <Modal title={`${type} #${opened.id}`} eyebrow="EDIT · AZURE DEVOPS WRITE" onClose={onClose}><form onSubmit={save} className="nf-form story-form edit-form">
    {!token && <label>PAT — Work Items: Read &amp; Write<input type="password" required autoComplete="off" value={pat} onChange={(event) => setPat(event.target.value)} /><button type="button" className="text-button" disabled={!pat.trim()} onClick={() => void load(pat)}>Load</button><small>Saved in this browser only.</small></label>}
    {!loaded && token && !error && <p className="muted">Reading #{opened.id} from Azure DevOps…</p>}
    {loaded && <>
      <input className="nf-title" aria-label={`${type} title`} required maxLength={255} value={title} onChange={(event) => setTitle(event.target.value)} />
      {month && <p className="muted edit-note">Month Task: the title keeps “{title.split('|')[0].trim() || month}”; it stays at {item?.iterationPath}.</p>}
      <div className="story-row">
        <label>Assigned to{canChoose ? <PersonPicker label="Assigned to" value={assigneeName} people={people.filter((person) => person.email !== (current || me)).map((person) => person.name)} onChange={setAssigneeName} meLabel={current ? `${item?.assignedTo || current}${current === me ? ' (me)' : ''}` : me ? `Me (${me})` : 'Choose a person…'} /> : <span className="nf-value" title={item?.assignedToEmail}>{item?.assignedTo || item?.assignedToEmail || '—'}</span>}</label>
        <label>State<select value={state} onChange={(event) => setState(event.target.value)}>{states.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>{type === 'Feature' ? 'PI' : 'Sprint'}{locks.iterationLocked ? <span className="nf-value" title={item?.iterationPath}>{item?.iterationPath} (locked)</span> : <select aria-label="Iteration" value={iterationPath} onChange={(event) => setIterationPath(event.target.value)}>{withCurrent.map((option) => <option key={option.path} value={option.path}>{option.label}</option>)}</select>}</label>
        {type === 'User Story' && <><label>Story Points<input type="number" min="0" max="1000" step="any" value={storyPoints} onChange={(event) => setStoryPoints(event.target.value)} placeholder="—" /></label>
          <label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value)}>{!priority && <option value="">—</option>}{storyPriorities.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></>}
        {type === 'Feature' && <label>Target date<input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></label>}
        {type === 'Task' && <><label>Original Estimate (h)<input type="number" min="0" max="1000000" step="0.25" value={originalEstimate} disabled={planLocked} title={planLocked ? 'Locked: planning has locked for the month (or the Task is ad-hoc)' : undefined} onChange={(event) => setOriginalEstimate(event.target.value)} /></label>
          <label>Completed Work (h)<input type="number" min="0" max="1000000" step="0.25" value={completedWork} disabled={actualLocked} title={actualLocked ? 'Locked: actuals have locked for the month' : undefined} onChange={(event) => setCompletedWork(event.target.value)} /></label></>}
      </div>
      {piChanged && openStories.length > 0 && <div className="edit-move">
        <label className="checkbox-label"><input type="checkbox" checked={moveStories} onChange={(event) => { setMoveStories(event.target.checked); if (!storySprint && sprintsOfPi[0]) setStorySprint(sprintsOfPi[0].sprint.path) }} />Also move its {openStories.length} open User Stor{openStories.length === 1 ? 'y' : 'ies'} to</label>
        <select aria-label="Sprint for the User Stories" value={storySprint} disabled={!moveStories} onChange={(event) => setStorySprint(event.target.value)}><option value="">Select a Sprint</option>{sprintsOfPi.map((pair) => <option key={pair.sprint.path} value={pair.sprint.path}>{pair.sprint.name}</option>)}</select>
      </div>}
      {type === 'Feature' && <label>Feature DoD (Definition of Done) — required<textarea required maxLength={100000} rows={2} value={dod} onChange={(event) => setDod(event.target.value)} /></label>}
      <label>Description<textarea maxLength={100000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <label>Acceptance criteria<textarea maxLength={100000} rows={2} value={acceptance} onChange={(event) => setAcceptance(event.target.value)} /></label>
      {type === 'User Story' && <details className="nf-more"><summary>More fields (Risk {risk || 'not set'} · Value area {valueArea || 'not set'})</summary>
        <div className="story-row">
          <label>Risk<select value={risk} onChange={(event) => setRisk(event.target.value)}><option value="">(not set)</option>{storyRisks.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>Value area<select value={valueArea} onChange={(event) => setValueArea(event.target.value)}>{!valueArea && <option value="">(not set)</option>}{storyValueAreas.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        </div>
      </details>}
      <p className="muted edit-note">Formatting made in Azure DevOps (bold, lists) is kept unless you change that text. The {kind}’s parent and Area Path are not changed here.</p>
      <section className="edit-discussion" aria-label="Discussion"><h4>Discussion{comments ? ` (${comments.length})` : ''}</h4>
        <div className="edit-comment-add"><textarea aria-label="Add a comment" rows={2} maxLength={100000} value={newComment} onChange={(event) => setNewComment(event.target.value)} placeholder="Add a comment…" /><button type="button" className="ghost" disabled={posting || !newComment.trim()} onClick={() => void post()}>{posting ? 'Adding…' : 'Add comment'}</button></div>
        {commentsError && <div className="notice error" role="alert">{commentsError}</div>}
        {comments == null && !commentsError && <p className="muted">Loading the Discussion…</p>}
        {comments?.length === 0 && <p className="muted">No comments yet.</p>}
        {comments?.map((comment) => <article key={comment.id} className="edit-comment"><header><strong>{comment.author}</strong> <small className="muted">{comment.date ? formatDateTime(comment.date) : ''}</small></header><p>{comment.text}</p></article>)}
      </section>
    </>}
    {error && <div className="notice error" role="alert">{error}</div>}
    <div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button className="primary" disabled={!loaded || !title.trim() || (piChanged && moveStories && !storySprint)}>Save</button></div>
  </form></Modal>
}
