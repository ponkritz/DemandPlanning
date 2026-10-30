import { useMemo, useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { buildWorkItemTree, type WorkItemNode } from '../azureHierarchy'
import { addChildWorkItem, type AzureConfig } from '../azureDevOps'
import { BacklogTable } from './BacklogTable'
import { FeatureEditor } from './FeatureEditor'
import { StoryEditor } from './StoryEditor'
import { WorkItemEditor } from './WorkItemEditor'
import { AssigneeConfirm } from './AssigneeConfirm'
import { assignablePeople, hasOptionalStories } from '../myWork'
import type { FeatureSetups } from '../featureSetup'

// readOnly: a backlog view from another connection — no Feature creation or child completion, nothing written to Azure.
// assign: who is creating (their email) and whether they may assign new work to someone else. New Features and their
// children, and User Stories / Tasks added here, are assigned to the person chosen, else to the creator; never blank.
export function AzureWorkItemTree({ items, config, onCreated, savedPat = '', creatorEmail = '', onSavePat, readOnly = false, tabs, assign, featureSetup }: { items: AzureWorkItem[]; config: AzureConfig; onCreated?: (items: AzureWorkItem[]) => void; savedPat?: string; creatorEmail?: string; onSavePat?: (pat: string) => void; readOnly?: boolean; tabs?: React.ReactNode; assign?: { me: string; canChoose: boolean }; featureSetup?: FeatureSetups | null }) {
  const me = (assign?.me || creatorEmail).trim().toLowerCase(), canChoose = Boolean(assign?.canChoose)
  const people = useMemo(() => assignablePeople(items), [items])
  const [childOf, setChildOf] = useState<AzureWorkItem | null>(null)
  const [childTitle, setChildTitle] = useState('')
  const [childIteration, setChildIteration] = useState('')
  const [childBusy, setChildBusy] = useState(false)
  const [childError, setChildError] = useState('')
  const [state, setState] = useState<string[]>(['New', 'Active'])
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
  const tree = useMemo(() => buildWorkItemTree(scoped, state, search), [scoped, state, search])
  // Search reveals matches; state filtering alone must not expand thousands of fetched records.
  const filtering = Boolean(search.trim())
  const states = [...new Set(['New', 'Active', 'Closed', ...scoped.map((item) => item.state)])].filter(Boolean)
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
    <div className="panel-heading backlog-heading"><div><p className="muted">{epics.length} Epics · {scoped.length} work items · Epic → Feature → User Story → Task</p></div>{readOnly ? <span className="pill">Read only</span> : <button className="primary" disabled={!epics.length} onClick={() => openEditor(epics[0])}>＋ New Feature</button>}</div>
    <div className="tree-controls"><div className="button-row" role="group" aria-label="Work item states (multi-select)">{[...states, 'All'].map((value) => <button key={value} className={state.includes(value) ? 'primary' : 'ghost'} aria-pressed={state.includes(value)} onClick={() => setState((current) => value === 'All' ? ['All'] : current.includes(value) ? current.filter((item) => item !== value && item !== 'All') : [...current.filter((item) => item !== 'All'), value])}>{value}</button>)}</div><input aria-label="Search work-item tree" placeholder="Search ID, title, type or assignee" value={search} onChange={(event) => setSearch(event.target.value)} /><button className="ghost" onClick={() => { setExpandAll(!expandAll); setExpanded(new Set()) }}>{expandAll ? 'Collapse all' : 'Expand all'}</button></div>
    <p className="muted tree-help">Select multiple states. Default: New + Active. Matching children retain their ancestors as context, even when the parent has another state. All Epics remain available in the New Feature selector.</p>
    {result && <div className="notice success" role="status"><a href={result.url} target="_blank" rel="noreferrer">{result.workItemType} #{result.id}: {result.title}</a> — {resultText}</div>}
    {partialError && <div className="notice error" role="alert">{partialError}</div>}
    <BacklogTable key={`${config.organization}/${config.project}/${config.team}`} scope={`${config.organization}/${config.project}/${config.team}`} tree={tree} expanded={expanded} expandAll={expandAll} searching={filtering} onToggle={toggle} onExpand={(value) => { setExpandAll(value); setExpanded(new Set()) }} onNewFeature={readOnly ? undefined : openEditor} onComplete={readOnly ? undefined : openResume} canComplete={(feature) => !hasOptionalStories(scoped, feature)} onAddChild={readOnly ? undefined : openChild} onEdit={readOnly ? undefined : (item) => { setEditing(item); setResult(null) }} tabs={tabs} />
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
