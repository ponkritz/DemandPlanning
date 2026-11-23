import { MonthTasksDialog } from './MonthTasksDialog'
import { useMemo, useState } from 'react'
import { isMine, withContext } from '../myWork'
import { MultiSelect } from './MultiSelect'
import { WriteBlocked } from './ui'
import { useWriteBlock } from '../useCan'

// BKL-46: the Assigned to choice is kept for this visit of the app (a new start filters to the person browsing again).
const assigneesKey = 'demand-planning-backlog-assignees-v1'
const unassigned = '(unassigned)'
const defaultStates = ['New', 'Active']
const assigneeOf = (item: Pick<AzureWorkItem, 'assignedTo' | 'assignedToEmail'>) => item.assignedToEmail?.trim().toLowerCase() || (item.assignedTo?.trim() ? `name:${item.assignedTo.trim().toLowerCase()}` : unassigned)
import type { AzureWorkItem } from '../domain'
import { buildWorkItemTree, type WorkItemNode } from '../azureHierarchy'
import { addChildWorkItem, type AzureConfig } from '../azureDevOps'
import { BacklogTable } from './BacklogTable'
import type { BacklogColumn } from '../backlogView'
import { FeatureEditor } from './FeatureEditor'
import { StoryEditor } from './StoryEditor'
import { WorkItemEditor } from './WorkItemEditor'
import { AssigneeConfirm } from './AssigneeConfirm'
import { assignablePeople, hasOptionalStories } from '../myWork'
import { completeChildrenOn, type FeatureSetups } from '../featureSetup'

// readOnly: a backlog view from another connection — no Feature creation or child completion, nothing written to Azure.
// assign: who is creating (their email) and whether they may assign new work to someone else. New Features and their
// children, and User Stories / Tasks added here, are assigned to the person chosen, else to the creator; never blank.
export function AzureWorkItemTree({ items, config, onCreated, savedPat = '', creatorEmail = '', onSavePat, readOnly = false, tabs, assign, featureSetup, month, teamColumns, onSaveColumnsForEveryone }: { teamColumns?: BacklogColumn[]; onSaveColumnsForEveryone?: (columns: BacklogColumn[]) => Promise<void>; items: AzureWorkItem[]; config: AzureConfig; onCreated?: (items: AzureWorkItem[]) => void; savedPat?: string; creatorEmail?: string; onSavePat?: (pat: string) => void; readOnly?: boolean; tabs?: React.ReactNode; assign?: { me: string; canChoose: boolean }; featureSetup?: FeatureSetups | null; month?: string }) {
  const me = (assign?.me || creatorEmail).trim().toLowerCase(), canChoose = Boolean(assign?.canChoose)
  const people = useMemo(() => assignablePeople(items), [items])
  // CON-102: create and edit buttons are disabled when the viewer lacks the permission; one line above says why.
  const write = useWriteBlock()
  const [childOf, setChildOf] = useState<AzureWorkItem | null>(null)
  const [childTitle, setChildTitle] = useState('')
  const [childIteration, setChildIteration] = useState('')
  const [childBusy, setChildBusy] = useState(false)
  const [childError, setChildError] = useState('')
  const [state, setState] = useState<string[]>(defaultStates)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [expandAll, setExpandAll] = useState(false)
  // The Feature editor (FeatureEditor): parent = Add Feature under that Epic; resumeFeature = Complete its children.
  const [parent, setParent] = useState<AzureWorkItem | null>(null)
  const [resumeFeature, setResumeFeature] = useState<AzureWorkItem | null>(null)
  const [resultText, setResultText] = useState('')
  const [partialError, setPartialError] = useState('')
  const [result, setResult] = useState<AzureWorkItem | null>(null)
  const scoped = useMemo(() => items.filter((item) => item.state.trim().toLowerCase() !== 'removed' && item.organization.toLowerCase() === config.organization.toLowerCase() && item.project.toLowerCase() === config.project.toLowerCase()), [items, config.organization, config.project])
  const epics = scoped.filter((item) => item.workItemType === 'Epic').sort((a, b) => a.id - b.id)
  // BKL-21, BKL-46: Assigned to (several people, Unassigned) as a multi-select; by default only the person browsing — the
  // items of the people chosen with everything above and below them — until the filter is changed (kept for this visit).
  const myName = useMemo(() => scoped.find((item) => item.assignedToEmail === me)?.assignedTo, [scoped, me])
  const defaultAssignees = useMemo(() => me ? [me] : [], [me])
  const [assigneesChosen, setAssigneesState] = useState<string[] | null>(() => { try { const saved = sessionStorage.getItem(assigneesKey); return saved ? JSON.parse(saved) as string[] : null } catch { return null } })
  const assignees = assigneesChosen ?? defaultAssignees
  const setAssignees = (next: string[] | null) => { setAssigneesState(next); try { if (next) sessionStorage.setItem(assigneesKey, JSON.stringify(next)); else sessionStorage.removeItem(assigneesKey) } catch { /* this view only */ } }
  const assigneeOptions = useMemo(() => {
    const names = new Map<string, string>()
    for (const item of scoped) { const key = assigneeOf(item); if (key !== unassigned && !names.has(key)) names.set(key, item.assignedTo?.trim() || key) }
    const mine: [string, string][] = me ? [[me, `Me — ${myName ?? me}`]] : []
    const others = [...names].filter(([key]) => key !== me && !(myName && key === `name:${myName.toLowerCase()}`)).sort((a, b) => a[1].localeCompare(b[1]))
    return [...mine, ...others, [unassigned, 'Unassigned'] as [string, string]]
  }, [scoped, me, myName])
  const visible = useMemo(() => assignees.length ? withContext(scoped, (item) => assignees.includes(assigneeOf(item)) || (assignees.includes(me) && isMine(item, { email: me, ...(myName ? { name: myName } : {}) })), (item) => assigneeOf(item) !== unassigned) : scoped, [assignees, me, myName, scoped])
  const filtered = assigneesChosen !== null || state.join() !== defaultStates.join() || Boolean(search)
  function resetFilters() { setAssignees(null); setState(defaultStates); setSearch('') }
  const tree = useMemo(() => buildWorkItemTree(visible, state.length ? state : ['All'], search), [visible, state, search])
  // BKL-22: "＋ Time Writing Task" on a Feature or User Story row.
  // BKL-34: it opens the months-and-hours pop-up (MonthTasksDialog).
  const [monthBusy] = useState(0)
  const [monthFor, setMonthFor] = useState<AzureWorkItem | null>(null)
  function monthTask(item: AzureWorkItem) { setPartialError(''); setResult(null); setMonthFor(item) }
  // Search reveals matches; state filtering alone must not expand thousands of fetched records.
  const filtering = Boolean(search.trim())
  const states = [...new Set(['New', 'Active', 'Closed', ...scoped.map((item) => item.state)])].filter(Boolean).map((value): [string, string] => [value, value])
  const savedToken = savedPat

  function openEditor(epic: AzureWorkItem) { setParent(epic); setResumeFeature(null); setPartialError(''); setResult(null) }
  function openResume(item: AzureWorkItem) { setParent(null); setResumeFeature(item); setPartialError(''); setResult(null) }
  function closeEditor() { setParent(null); setResumeFeature(null) }
  function toggle(key: string) {
    if (expandAll) {
      const next = new Set<string>()
      const visit = (nodes: WorkItemNode[]) => { for (const node of nodes) { if (node.item.key !== key) next.add(node.item.key); visit(node.children) } }
      visit(tree); setExpanded(next); setExpandAll(false)
    } else setExpanded((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })
  }

  // ＋ User Story under a Feature opens the New User Story form (StoryEditor); ＋ Task under a User Story: title,
  // iteration (default the parent's) and who it is for.
  const [storyOf, setStoryOf] = useState<AzureWorkItem | null>(null)
  // Edit a Feature, User Story or Task (WorkItemEditor).
  const [editing, setEditing] = useState<AzureWorkItem | null>(null)
  const childType = childOf?.workItemType === 'Feature' ? 'User Story' : 'Task'
  function openChild(item: AzureWorkItem) { if (item.workItemType === 'Feature') { setStoryOf(item); setResult(null); return } setChildOf(item); setChildTitle(''); setChildIteration(item.iterationPath); setChildError('') }
  async function addChild(email: string) {
    if (!childOf || childBusy) return
    const token = savedToken
    if (!token.trim()) { setChildError('Add the PAT of the Time Writing connection first.'); return }
    setChildBusy(true); setChildError('')
    try {
      const created = await addChildWorkItem(config, token, childOf.id, childType, childTitle, email, childIteration)
      onCreated?.([childOf, created]); setExpanded((current) => new Set([...current, childOf.key]))
      setResult(created); setResultText(`${childType} created and verified, assigned to ${email}.`); setChildOf(null)
    } catch (failure) { setChildError(failure instanceof Error ? failure.message : `Unable to create the ${childType}.`) }
    finally { setChildBusy(false) }
  }

  return <>
    <div className="panel-heading backlog-heading"><div><p className="muted">{epics.length} Epics · {scoped.length} work items · Epic → Feature → User Story → Task</p></div>{readOnly ? <span className="pill">Read only</span> : <div className="button-row"><WriteBlocked reason={write.note('azure.write', 'work.edit')} /><button className="primary" disabled={!epics.length || Boolean(write.why('azure.write'))} title={write.why('azure.write') || undefined} onClick={() => openEditor(epics[0])}>＋ New Feature</button></div>}</div>
    <div className="tree-controls"><MultiSelect label="State" options={states} value={state} onChange={setState} /><MultiSelect label="Assigned to" options={assigneeOptions} value={assignees} onChange={setAssignees} /><input aria-label="Search work-item tree" placeholder="Search ID, title, type or assignee" value={search} onChange={(event) => setSearch(event.target.value)} /><button type="button" className="ghost" disabled={!filtered} onClick={resetFilters}>Reset filters</button><button className="ghost" onClick={() => { setExpandAll(!expandAll); setExpanded(new Set()) }}>{expandAll ? 'Collapse all' : 'Expand all'}</button></div>
    <p className="muted tree-help">State and Assigned to take several values; nothing ticked = all. Default: New + Active, assigned to you. Matching items keep the items above them as context, even in another state; Assigned to also keeps everything below them. All Epics remain available in the New Feature selector.</p>
    {monthFor && <MonthTasksDialog item={monthFor} items={items} config={config} pat={savedPat} me={me} canChoose={canChoose} month={month} featureSetup={featureSetup} onClose={() => setMonthFor(null)} onFailed={(text, changed) => { if (changed.length) onCreated?.(changed); setPartialError(text) }} onDone={(text, changed) => { setMonthFor(null); onCreated?.(changed); const task = [...changed].reverse().find((entry) => entry.workItemType === 'Task'); if (task) { setResult(task); setResultText(text) } }} />}
    {result && <div className="notice success" role="status"><a href={result.url} target="_blank" rel="noreferrer">{result.workItemType} #{result.id}: {result.title}</a> — {resultText}</div>}
    {partialError && <div className="notice error" role="alert">{partialError}</div>}
    <BacklogTable key={`${config.organization}/${config.project}/${config.team}`} scope={`${config.organization}/${config.project}/${config.team}`} tree={tree} expanded={expanded} expandAll={expandAll} searching={filtering} onToggle={toggle} onExpand={(value) => { setExpandAll(value); setExpanded(new Set()) }} onNewFeature={readOnly ? undefined : openEditor} onComplete={readOnly ? undefined : openResume} canComplete={(feature) => completeChildrenOn(featureSetup, feature.parentId) && !hasOptionalStories(scoped, feature)} onAddChild={readOnly ? undefined : openChild} onEdit={readOnly ? undefined : (item) => { setEditing(item); setResult(null) }} onMonthTask={readOnly || !me ? undefined : (item) => void monthTask(item)} monthBusy={monthBusy} why={{ create: write.why('azure.write'), edit: write.why('work.edit') }} tabs={tabs} teamColumns={teamColumns} onSaveForEveryone={onSaveColumnsForEveryone} />
    {(parent || resumeFeature) && <FeatureEditor mode={resumeFeature ? { resume: resumeFeature } : { parent: parent! }} items={items} config={config} savedPat={savedPat} me={me} canChoose={canChoose} featureSetup={featureSetup} onSavePat={onSavePat} onCreated={onCreated} onClose={closeEditor} onDone={(done) => { setResult(done.feature); setResultText(done.text); setPartialError(''); setParent(null); setResumeFeature(null); setExpanded((current) => new Set([...current, done.feature.key, ...done.items.filter((item) => item.workItemType === 'User Story').map((item) => item.key), ...(done.parent ? [done.parent.key] : [])])) }} onPartial={(text) => { setPartialError(text); setParent(null); setResumeFeature(null) }} />}
    {editing && <WorkItemEditor item={editing} items={items} config={config} savedPat={savedPat} me={me} canChoose={canChoose} onSavePat={onSavePat} onUpdated={onCreated} onClose={() => setEditing(null)}
      onDone={(text, item) => { setResult(item); setResultText(text); setPartialError('') }} onFailed={(text) => setPartialError(text)} />}
    {storyOf && <StoryEditor feature={storyOf} items={items} config={config} savedPat={savedPat} me={me} canChoose={canChoose} onSavePat={onSavePat} onCreated={(created) => { onCreated?.(created); setExpanded((current) => new Set([...current, created[0].key])) }} onClose={() => setStoryOf(null)}
      onDone={(done) => { setResult(done.story); setResultText(`User Story ${done.text}`); setPartialError('') }} onFailed={(text) => setPartialError(text)} />}
    {childOf && <AssigneeConfirm title={`Add a ${childType} under #${childOf.id}`} people={people} me={me} initial={childOf.assignedToEmail ?? ''} canChoose={canChoose} busy={childBusy} confirmLabel={`Create ${childType}`}
      summary={<>Creates a {childType} under {childOf.workItemType} #{childOf.id} “{childOf.title}” in {config.organization} / {config.project}, in its Area Path. Project validation runs before saving.</>}
      onCancel={() => setChildOf(null)} onConfirm={(email) => { if (childTitle.trim()) void addChild(email); else setChildError('Enter a title.') }}>
      <label>{childType} title<input required maxLength={255} value={childTitle} onChange={(event) => setChildTitle(event.target.value)} disabled={childBusy} autoFocus /></label>
      <label>Iteration Path<input value={childIteration} onChange={(event) => setChildIteration(event.target.value)} disabled={childBusy} /></label>
      {childError && <div className="notice error" role="alert">{childError}</div>}
    </AssigneeConfirm>}
  </>
}
