import { useMemo, useRef, useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { buildWorkItemTree, type WorkItemNode } from '../azureHierarchy'
import { createAzureReleaseHierarchy, completeReleaseHierarchy, currentIndiaMonth, releaseHierarchyTitles, HierarchyCreationError, featureDescription, readAzureIterations, currentIterationPairs, readAzureCreator, type AzureIteration, type AzureConfig, type FeatureInput } from '../azureDevOps'
import { Modal, Pill } from './ui'

export function AzureWorkItemTree({ items, config, onCreated, savedPat = '', onSavePat }: { items: AzureWorkItem[]; config: AzureConfig; onCreated: (items: AzureWorkItem[]) => void; savedPat?: string; onSavePat?: (pat: string) => void }) {
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
  const [iterationPath, setIterationPath] = useState('')
  const [sprintPath, setSprintPath] = useState('')
  const [creatorName, setCreatorName] = useState('Identified from your PAT when creating')
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
  // Search reveals matches; state filtering alone must not expand thousands of fetched records.
  const filtering = Boolean(search.trim())
  const states = [...new Set(['New', 'Active', 'Closed', ...scoped.map((item) => item.state)])].filter(Boolean)
  const pairs = currentIterationPairs(iterationChoices)
  const availableMilestones = releaseKind === 'PU' ? ['SFV', 'DT', 'IQOQ'] : ['PRD', 'SFV', 'DT', 'IQOQ']
  const monthLabel = currentIndiaMonth()
  let plan
  try { plan = releaseHierarchyTitles(title.trim(), releaseKind, monthLabel) } catch { plan = null }

  function openEditor(epic: AzureWorkItem) { setParent(epic); setResumeFeature(null); setTitle(''); setIterationPath(''); setSprintPath(''); setIterationChoices([]); setReleaseKind('PU'); setMilestones(['SFV', 'DT', 'IQOQ']); setDescription(featureDescription('PU')); setPat(savedPat); setError(''); setPartialError(''); setResult(null); if (savedPat) void loadIterations(savedPat) }
  function openResume(item: AzureWorkItem) { setParent(null); setResumeFeature(item); setTitle(item.title); setIterationPath(''); setSprintPath(''); setIterationChoices([]); setReleaseKind('PU'); setMilestones(['SFV', 'DT', 'IQOQ']); setPat(savedPat); setError(''); setPartialError(''); setResult(null); if (savedPat) void loadIterations(savedPat) }
  function closeEditor() { if (submitting.current) return; setParent(null); setResumeFeature(null); setPat(''); setError('') }
  function setKind(kind: 'PU' | 'Release') { setReleaseKind(kind); setMilestones(kind === 'PU' ? ['SFV', 'DT', 'IQOQ'] : ['PRD', 'SFV', 'DT', 'IQOQ']); setDescription(featureDescription(kind)) }
  function toggle(key: string) { setExpanded((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next }) }

  async function loadIterations(token = pat || savedPat) {
    setError(''); setIterationLoading(true)
    try {
      const options = await readAzureIterations(config, token)
      setIterationChoices(options)
      const current = currentIterationPairs(options)
      if (current.length === 1) { setIterationPath(current[0].pi.path); setSprintPath(current[0].sprint.path) }
      else { setIterationPath(''); setSprintPath(''); setError(current.length ? 'Several current PI/Sprint branches overlap. Select the correct team schedule below.' : 'No current dated PI → Sprint pair found. Check start/finish dates and nesting in Azure Project settings, then reload.') }
      const creator = await readAzureCreator(config, token)
      setCreatorName(creator.name)
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to load iteration paths.') }
    finally { setIterationLoading(false) }
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if ((!parent && !resumeFeature) || submitting.current) return
    const data = new FormData(event.currentTarget)
    const token = pat; setError(''); submitting.current = true; setCreating(true)
    const feature: FeatureInput = { parentId: parent?.id ?? 0, title: title.trim(), description: String(data.get('description') ?? ''), acceptanceCriteria: String(data.get('acceptance') ?? ''), areaPath: String(data.get('areaPath') ?? ''), iterationPath, assignToCreator: true, storyIterationPath: sprintPath, targetDate: String(data.get('targetDate') ?? '') }
    try {
      onSavePat?.(token)
      const fresh = currentIterationPairs(await readAzureIterations(config, token))
      if (!fresh.some((pair) => pair.pi.path === iterationPath && pair.sprint.path === sprintPath)) throw new Error('The selected PI/Sprint is no longer current. Reload the schedule and review it before creating. No write was attempted.')
      const bundle = resumeFeature ? await completeReleaseHierarchy(config, token, resumeFeature.id, releaseKind, milestones, monthLabel, undefined, sprintPath) : await createAzureReleaseHierarchy(config, token, feature, releaseKind, milestones, monthLabel)
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
    <div className="tree-controls"><div className="button-row" role="group" aria-label="Work item states (multi-select)">{[...states, 'All'].map((value) => <button key={value} className={state.includes(value) ? 'primary' : 'ghost'} aria-pressed={state.includes(value)} onClick={() => setState((current) => value === 'All' ? ['All'] : current.includes(value) ? current.filter((item) => item !== value && item !== 'All') : [...current.filter((item) => item !== 'All'), value])}>{value}</button>)}</div><input aria-label="Search work-item tree" placeholder="Search ID, title, type or assignee" value={search} onChange={(event) => setSearch(event.target.value)} /><button className="ghost" onClick={() => { setExpandAll(!expandAll); setExpanded(new Set()) }}>{expandAll ? 'Collapse all' : 'Expand all'}</button></div>
    <p className="muted tree-help">Select multiple states. Default: New + Active. Matching children retain their ancestors as context, even when the parent has another state. All Epics remain available in the New Feature selector.</p>
    {result && <div className="notice success" role="status"><a href={result.url} target="_blank" rel="noreferrer">Feature #{result.id}: {result.title}</a> — {resultText}</div>}
    {partialError && <div className="notice error" role="alert">{partialError}</div>}
    <div className="work-tree">{tree.length ? tree.map((node) => render(node, 0)) : <p className="empty-state">{scoped.length ? 'No work items match this filter.' : 'Fetch your team work items to load the hierarchy.'}</p>}</div>
    {(parent || resumeFeature) && <Modal title={resumeFeature ? 'Complete Feature children' : 'Add Feature under an Epic'} eyebrow="AZURE DEVOPS WRITE" onClose={closeEditor}><form onSubmit={create}>
      <p className="muted">{resumeFeature ? 'Completes missing children without recreating the Feature.' : `Creates one real Feature and its selected children in ${config.organization} / ${config.project}.`} Review the hierarchy below. Project validation runs before each save.</p>
      {parent && <label>Parent Epic<select disabled={creating} value={parent.key} onChange={(event) => setParent(epics.find((item) => item.key === event.target.value) ?? null)}>{epics.map((epic) => <option value={epic.key} key={epic.key}>#{epic.id} · {epic.title} ({epic.state})</option>)}</select></label>}
      <label>Feature title<input name="title" required maxLength={255} value={title} onChange={(event) => setTitle(event.target.value)} disabled={creating || Boolean(resumeFeature)} placeholder="Program | Service | vRelease" autoFocus /></label>
      {parent && <><label>Area Path<input name="areaPath" key={parent.key} defaultValue={parent.areaPath} required disabled={creating} /></label>
      </>}
      <div className="iteration-picker"><button type="button" className="ghost" onClick={() => void loadIterations()} disabled={creating || iterationLoading}>{iterationLoading ? 'Detecting current schedule…' : 'Detect current PI / Sprint & creator'}</button><label>Current team schedule<select required value={sprintPath} onChange={(event) => { const pair = pairs.find((value) => value.sprint.path === event.target.value); setSprintPath(pair?.sprint.path ?? ''); setIterationPath(pair?.pi.path ?? '') }} disabled={creating || iterationLoading}><option value="">Select a current dated PI → Sprint</option>{pairs.map((pair) => <option key={pair.sprint.path} value={pair.sprint.path}>{pair.pi.path} → {pair.sprint.name} ({pair.sprint.attributes?.startDate?.slice(0, 10)} — {pair.sprint.attributes?.finishDate?.slice(0, 10)})</option>)}</select></label></div>
      <p className="muted">Current date uses India time; date boundaries are inclusive. Feature → {resumeFeature ? resumeFeature.iterationPath : iterationPath || 'current PI'}. User Stories → {sprintPath || 'current Sprint'}. Time Writing task → {config.project}. Existing Features are not moved during child completion.</p>
      <label>Release classification<select value={releaseKind} disabled={creating} onChange={(event) => setKind(event.target.value as 'PU' | 'Release')}><option value="PU">PU</option><option value="Release">Full Release</option></select></label>
      {parent && <><label>Description<textarea name="description" maxLength={100000} value={description} onChange={(event) => setDescription(event.target.value)} disabled={creating} /></label><label>Acceptance criteria<textarea name="acceptance" maxLength={100000} disabled={creating} /></label>
      <div className="form-row"><label>Feature assigned to<input readOnly value={creatorName} /></label><label>Target date (optional)<input name="targetDate" type="date" disabled={creating} /></label></div></>}
      <fieldset className="milestone-choices" disabled={creating}><legend>Optional milestone User Stories</legend><div className="button-row"><button type="button" className="text-button" onClick={() => setMilestones(availableMilestones)}>Select all</button><button type="button" className="text-button" onClick={() => setMilestones([])}>Skip all milestones</button></div>{availableMilestones.map((milestone) => <label className="checkbox-label" key={milestone}><input type="checkbox" checked={milestones.includes(milestone)} onChange={(event) => setMilestones((current) => event.target.checked ? [...current, milestone] : current.filter((value) => value !== milestone))} />{milestone} review of deliverables</label>)}</fieldset>
      <div className="hierarchy-plan"><strong>Always included</strong><p>Time Writing User Story in the current Sprint and one task for {monthLabel}. Task iteration: {config.project}. The Feature is assigned to the PAT owner; children are not automatically assigned.</p>{plan ? <ul>{plan.reviews.filter((review) => milestones.includes(review.milestone)).map((review) => <li key={review.milestone}>{review.title}</li>)}<li>{plan.timeWriting}<ul><li>{plan.task}</li></ul></li></ul> : <p>Enter Program | Service | vRelease to preview the exact titles.</p>}</div>
      <label>PAT — Work Items: Read &amp; Write<input type="password" required autoComplete="off" value={pat} onChange={(event) => { setPat(event.target.value); setCreatorName('Identified from your PAT when creating'); setIterationChoices([]); setIterationPath(''); setSprintPath('') }} disabled={creating} /></label>
      <p className="muted">The configured PAT is reused and saved separately in this browser. No state, priority, notification setting or project rule is overridden.</p>
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="ghost" onClick={closeEditor} disabled={creating}>Cancel</button><button className="primary" disabled={creating || iterationLoading || !plan || !sprintPath}>{creating ? 'Creating and verifying hierarchy…' : resumeFeature ? 'Complete missing children' : 'Create Feature and children'}</button></div>
    </form></Modal>}
  </>
}
