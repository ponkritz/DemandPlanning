import { useMemo, useRef, useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { buildWorkItemTree, type StateFilter, type WorkItemNode } from '../azureHierarchy'
import { createAzureReleaseHierarchy, completeReleaseHierarchy, currentIndiaMonth, releaseHierarchyTitles, HierarchyCreationError, featureDescription, readAzureIterations, type AzureIteration, type AzureConfig, type FeatureInput } from '../azureDevOps'
import { Modal, Pill } from './ui'

export function AzureWorkItemTree({ items, config, onCreated, savedPat = '', onSavePat }: { items: AzureWorkItem[]; config: AzureConfig; onCreated: (items: AzureWorkItem[]) => void; savedPat?: string; onSavePat?: (pat: string) => void }) {
  const [state, setState] = useState<StateFilter>('All')
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
  const [iterationPath, setIterationPath] = useState('Current PI')
  const [iterationChoices, setIterationChoices] = useState<AzureIteration[]>([])
  const [iterationLoading, setIterationLoading] = useState(false)
  const [pat, setPat] = useState('')
  const [creating, setCreating] = useState(false)
  const submitting = useRef(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<AzureWorkItem | null>(null)
  const scoped = useMemo(() => items.filter((item) => item.organization.toLowerCase() === config.organization.toLowerCase() && item.project.toLowerCase() === config.project.toLowerCase()), [items, config.organization, config.project])
  const epics = scoped.filter((item) => item.workItemType === 'Epic').sort((a, b) => a.id - b.id)
  const tree = useMemo(() => buildWorkItemTree(scoped, state, search), [scoped, state, search])
  const filtering = state !== 'All' || Boolean(search.trim())
  const availableMilestones = releaseKind === 'PU' ? ['SFV', 'DT', 'IQOQ'] : ['PRD', 'SFV', 'DT', 'IQOQ']
  const monthLabel = currentIndiaMonth()
  let plan
  try { plan = releaseHierarchyTitles(title.trim(), releaseKind, monthLabel) } catch { plan = null }

  function openEditor(epic: AzureWorkItem) { setParent(epic); setResumeFeature(null); setTitle(''); setIterationPath('Current PI'); setIterationChoices([]); setReleaseKind('PU'); setMilestones(['SFV', 'DT', 'IQOQ']); setDescription(featureDescription('PU')); setPat(savedPat); setError(''); setPartialError(''); setResult(null) }
  function openResume(item: AzureWorkItem) { setParent(null); setResumeFeature(item); setTitle(item.title); setReleaseKind('PU'); setMilestones(['SFV', 'DT', 'IQOQ']); setPat(savedPat); setError(''); setPartialError(''); setResult(null) }
  function closeEditor() { if (submitting.current) return; setParent(null); setResumeFeature(null); setPat(''); setError('') }
  function setKind(kind: 'PU' | 'Release') { setReleaseKind(kind); setMilestones(kind === 'PU' ? ['SFV', 'DT', 'IQOQ'] : ['PRD', 'SFV', 'DT', 'IQOQ']); setDescription(featureDescription(kind)) }
  function toggle(key: string) { setExpanded((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next }) }

  async function loadIterations() {
    setError(''); setIterationLoading(true)
    try { setIterationChoices(await readAzureIterations(config, pat || savedPat)) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to load iteration paths.') }
    finally { setIterationLoading(false) }
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if ((!parent && !resumeFeature) || submitting.current) return
    const data = new FormData(event.currentTarget)
    const token = pat; setPat(''); setError(''); submitting.current = true; setCreating(true)
    const feature: FeatureInput = { parentId: parent?.id ?? 0, title: title.trim(), description: String(data.get('description') ?? ''), acceptanceCriteria: String(data.get('acceptance') ?? ''), areaPath: String(data.get('areaPath') ?? ''), iterationPath: String(data.get('iterationPath') ?? ''), assignedTo: String(data.get('assignedTo') ?? ''), targetDate: String(data.get('targetDate') ?? '') }
    try {
      onSavePat?.(token)
      const bundle = resumeFeature ? await completeReleaseHierarchy(config, token, resumeFeature.id, releaseKind, milestones, monthLabel) : await createAzureReleaseHierarchy(config, token, feature, releaseKind, milestones, monthLabel)
      onCreated(parent ? [parent, ...bundle.items] : bundle.items)
      setResult(bundle.feature); setResultText(`Hierarchy complete: ${milestones.length} milestone stories, Time Writing story and ${monthLabel} task verified.`); setParent(null); setResumeFeature(null); setExpanded((current) => new Set([...current, bundle.feature.key, ...bundle.items.filter((item) => item.workItemType === 'User Story').map((item) => item.key), ...(parent ? [parent.key] : [])]))
    } catch (failure) {
      const detail = failure instanceof Error ? failure.message : 'Unable to create the hierarchy.'
      if (failure instanceof HierarchyCreationError && failure.createdItems.length) {
        onCreated(parent ? [parent, ...failure.createdItems] : failure.createdItems)
        setPartialError(detail); setParent(null); setResumeFeature(null)
      } else setError(detail)
    }
    finally { submitting.current = false; setCreating(false) }
  }

  function render(node: WorkItemNode, depth: number) {
    const item = node.item
    const open = filtering || expandAll || expanded.has(item.key)
    return <div className="work-tree-node" key={item.key}><div className={`work-tree-row ${node.context ? 'work-tree-context' : ''}`} style={{ paddingLeft: `${12 + Math.min(depth, 20) * 22}px` }}>
      {node.children.length ? <button type="button" className="tree-toggle" aria-label={`${open ? 'Collapse' : 'Expand'} ${item.workItemType} ${item.id}`} aria-expanded={open} onClick={() => toggle(item.key)} disabled={filtering || expandAll}>{open ? '▾' : '▸'}</button> : <span className="tree-toggle" />}
      <Pill tone={item.workItemType === 'Epic' ? 'info' : item.workItemType === 'Feature' ? 'open' : 'neutral'}>{item.workItemType}</Pill>
      <div className="work-tree-title"><a href={item.url} target="_blank" rel="noreferrer">#{item.id} · {item.title}</a><small>{node.context ? 'Parent context · ' : ''}{item.assignedTo || 'Unassigned'}{node.parentMissing ? ` · Parent #${item.parentId} is outside the fetched data` : ''}</small></div>
      <Pill tone={item.state.toLowerCase() === 'closed' ? 'open' : 'neutral'}>{item.state}</Pill><span className="muted">{node.children.length ? `${node.children.length} children` : ''}</span>
      {item.workItemType === 'Epic' && <button className="ghost" type="button" onClick={() => openEditor(item)}>＋ Feature</button>}
      {item.workItemType === 'Feature' && <button className="ghost" type="button" onClick={() => openResume(item)}>Complete children</button>}
    </div>{open && node.children.map((child) => render(child, depth + 1))}</div>
  }

  return <>
    <div className="panel-heading"><div><h2>Epic and work-item tree</h2><p className="muted">{epics.length} Epics · {scoped.length} work items. Links follow Azure DevOps parent IDs.</p></div><button className="primary" disabled={!epics.length} onClick={() => openEditor(epics[0])}>＋ New Feature</button></div>
    <div className="tree-controls"><div className="button-row" role="group" aria-label="Work item state">{(['Active', 'New', 'Closed', 'All'] as StateFilter[]).map((value) => <button key={value} className={state === value ? 'primary' : 'ghost'} aria-pressed={state === value} onClick={() => setState(value)}>{value}</button>)}</div><input aria-label="Search work-item tree" placeholder="Search ID, title, type or assignee" value={search} onChange={(event) => setSearch(event.target.value)} /><button className="ghost" onClick={() => { setExpandAll(!expandAll); setExpanded(new Set()) }}>{expandAll ? 'Collapse all' : 'Expand all'}</button></div>
    <p className="muted tree-help">Filters use the exact Azure DevOps state. Matching children retain their ancestors as context. Other process states are visible under All. All Epics remain available in the New Feature selector.</p>
    {result && <div className="notice success" role="status"><a href={result.url} target="_blank" rel="noreferrer">Feature #{result.id}: {result.title}</a> — {resultText}</div>}
    {partialError && <div className="notice error" role="alert">{partialError}</div>}
    <div className="work-tree">{tree.length ? tree.map((node) => render(node, 0)) : <p className="empty-state">{scoped.length ? 'No work items match this filter.' : 'Fetch your team work items to load the hierarchy.'}</p>}</div>
    {(parent || resumeFeature) && <Modal title={resumeFeature ? 'Complete Feature children' : 'Add Feature under an Epic'} eyebrow="AZURE DEVOPS WRITE" onClose={closeEditor}><form onSubmit={create}>
      <p className="muted">{resumeFeature ? 'Completes missing children without recreating the Feature.' : `Creates one real Feature and its selected children in ${config.organization} / ${config.project}.`} Review the hierarchy below. Project validation runs before each save.</p>
      {parent && <label>Parent Epic<select disabled={creating} value={parent.key} onChange={(event) => setParent(epics.find((item) => item.key === event.target.value) ?? null)}>{epics.map((epic) => <option value={epic.key} key={epic.key}>#{epic.id} · {epic.title} ({epic.state})</option>)}</select></label>}
      <label>Feature title<input name="title" required maxLength={255} value={title} onChange={(event) => setTitle(event.target.value)} disabled={creating || Boolean(resumeFeature)} placeholder="Program | Service | vRelease" autoFocus /></label>
      {parent && <><label>Area Path<input name="areaPath" key={parent.key} defaultValue={parent.areaPath} required disabled={creating} /></label>
      <label>Iteration Path or iteration name<input name="iterationPath" value={iterationPath} onChange={(event) => setIterationPath(event.target.value)} placeholder="Select or enter the actual full path" disabled={creating} /></label>
      <div className="iteration-picker"><button type="button" className="ghost" onClick={loadIterations} disabled={creating || iterationLoading}>{iterationLoading ? 'Loading iteration paths…' : 'Load iteration paths'}</button>{iterationChoices.length > 0 && <label>Actual Azure DevOps iteration<select value={iterationChoices.some((choice) => choice.path === iterationPath) ? iterationPath : ''} onChange={(event) => { if (event.target.value) setIterationPath(event.target.value) }} disabled={creating}><option value="">Select the PI's full path</option>{iterationChoices.map((choice) => <option key={choice.path} value={choice.path}>{choice.path}</option>)}</select></label>}</div>
      <p className="muted">Current PI must match a real iteration name. Load paths to find project iterations outside the team's list. The Time Writing task still uses the project-root iteration.</p></>}
      <label>Release classification<select value={releaseKind} disabled={creating} onChange={(event) => setKind(event.target.value as 'PU' | 'Release')}><option value="PU">PU</option><option value="Release">Full Release</option></select></label>
      {parent && <><label>Description<textarea name="description" maxLength={100000} value={description} onChange={(event) => setDescription(event.target.value)} disabled={creating} /></label><label>Acceptance criteria<textarea name="acceptance" maxLength={100000} disabled={creating} /></label>
      <div className="form-row"><label>Assignee email (optional)<input name="assignedTo" type="email" disabled={creating} /></label><label>Target date (optional)<input name="targetDate" type="date" disabled={creating} /></label></div></>}
      <fieldset className="milestone-choices" disabled={creating}><legend>Optional milestone User Stories</legend><div className="button-row"><button type="button" className="text-button" onClick={() => setMilestones(availableMilestones)}>Select all</button><button type="button" className="text-button" onClick={() => setMilestones([])}>Skip all milestones</button></div>{availableMilestones.map((milestone) => <label className="checkbox-label" key={milestone}><input type="checkbox" checked={milestones.includes(milestone)} onChange={(event) => setMilestones((current) => event.target.checked ? [...current, milestone] : current.filter((value) => value !== milestone))} />{milestone} review of deliverables</label>)}</fieldset>
      <div className="hierarchy-plan"><strong>Always included</strong><p>Time Writing User Story and one task for {monthLabel}. Task iteration: {config.project}. User Stories inherit the Feature iteration.</p>{plan ? <ul>{plan.reviews.filter((review) => milestones.includes(review.milestone)).map((review) => <li key={review.milestone}>{review.title}</li>)}<li>{plan.timeWriting}<ul><li>{plan.task}</li></ul></li></ul> : <p>Enter Program | Service | vRelease to preview the exact titles.</p>}</div>
      <label>PAT — Work Items: Read &amp; Write<input type="password" required autoComplete="off" value={pat} onChange={(event) => setPat(event.target.value)} disabled={creating} /></label>
      <p className="muted">The configured PAT is reused and saved separately in this browser. No state, priority, notification setting or project rule is overridden.</p>
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="ghost" onClick={closeEditor} disabled={creating}>Cancel</button><button className="primary" disabled={creating || iterationLoading || !plan}>{creating ? 'Creating and verifying hierarchy…' : resumeFeature ? 'Complete missing children' : 'Create Feature and children'}</button></div>
    </form></Modal>}
  </>
}
