import { useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { emptySetup, fillTitle, missingValues, placeholders, setupFor, titleValues, type EpicSetup, type FeatureSetupFile } from '../featureSetup'
import { currentIndiaMonth } from '../azureDevOps'
import { assignablePeople } from '../myWork'
import type { FeatureSetup } from '../useFeatureSetup'
import type { GitStorage } from '../useGitStorage'
import { PersonPicker } from './PersonPicker'
import { EmptyState, Notice, Panel } from './ui'

// Settings → Feature setup: per Epic, the optional User Stories offered when a Feature is created under it (all ticked
// by default) and the defaults of the month Time Writing Task. Saved to Git (feature-setup.json) for everyone.
export function FeatureSetupPanel({ setup, git, items }: { setup: FeatureSetup; git: GitStorage; items: AzureWorkItem[] }) {
  const epics = items.filter((item) => item.workItemType === 'Epic' && item.state.toLowerCase() !== 'removed').sort((a, b) => a.title.localeCompare(b.title))
  const people = assignablePeople(items)
  const [draft, setDraft] = useState<FeatureSetupFile | null>(null)
  const [epicId, setEpicId] = useState(0)
  const [sample, setSample] = useState('Program | Service | v1.0')
  const [commit, setCommit] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string; url?: string } | null>(null)
  const file = draft ?? setup.file ?? { schema: 1, kind: 'feature-setup', epics: [] }
  const editable = git.connected && !git.readOnly && !git.isSample
  const chosen = epicId || setup.file?.epics[0]?.epicId || epics[0]?.id || 0
  const epic = epics.find((item) => item.id === chosen)
  const current = setupFor(file, chosen)
  const values = titleValues(sample, currentIndiaMonth())
  const change = (update: (entry: EpicSetup) => void) => {
    const next = structuredClone(file)
    let entry = next.epics.find((item) => item.epicId === chosen)
    if (!entry) { entry = emptySetup(chosen, epic?.title ?? ''); next.epics.push(entry) }
    update(entry); entry.epicTitle = epic?.title ?? entry.epicTitle
    setDraft(next); setResult(null)
  }
  const preview = (template: string) => { const missing = missingValues(template, values); return missing.length ? `needs {${missing.join('}, {')}} — the sample title has no such part` : fillTitle(template, values) || '—' }
  const taskAssigneeName = current?.task.assignedTo ? people.find((person) => person.email === current.task.assignedTo)?.name ?? current.task.assignedTo : ''

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!draft) return
    setBusy(true)
    try { const saved = await setup.save(draft, commit.trim() || 'Update the Feature setup'); setDraft(null); setCommit(''); setResult({ tone: 'success', text: 'Saved to Git.', url: saved.commitUrl }) }
    catch (failure) { setResult({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }) }
    finally { setBusy(false) }
  }

  return <Panel className="admin-section" eyebrow="NEW FEATURES" title="Feature setup per Epic" detail={<>When a Feature is created under an Epic, its optional User Stories (all ticked, untick what is not needed) and the month Time Writing Task defaults come from here. An Epic without a setup keeps the PU / Full Release milestones. Shared with everyone through Git (feature-setup.json).{setup.history && <> <a href={setup.history} target="_blank" rel="noreferrer">History</a></>}</>}
    action={editable && setup.file ? <button type="button" className="ghost" onClick={() => { setDraft(null); setResult(null); void setup.reload() }}>Reload from Git</button> : undefined}>
    {!git.connected && <Notice tone="info">Connect Git storage (Storage tab) to share the Feature setup.{setup.file ? ' The setup last loaded in this browser is used meanwhile.' : ''}</Notice>}
    {git.connected && git.readOnly && <Notice tone="info">View only: your Git token can read but not save.</Notice>}
    {setup.error && <Notice tone="error">feature-setup.json: {setup.error}</Notice>}
    {!epics.length ? <EmptyState title="No Epics loaded yet." detail="Fetch the Time Writing connection; its Epics appear here." /> : <>
      <div className="form-row">
        <label>Epic<select value={chosen} onChange={(event) => setEpicId(Number(event.target.value))}>{epics.map((item) => <option key={item.id} value={item.id}>{setupFor(file, item.id) ? '● ' : ''}#{item.id} {item.title}</option>)}</select></label>
        <label>Preview with Feature title<input value={sample} onChange={(event) => setSample(event.target.value)} /></label>
      </div>
      <p className="muted"><small>Placeholders: {placeholders.map((key) => `{${key}}`).join(' ')} — {'{feature}'} is the whole title; {'{program}'}, {'{service}'}, {'{version}'} are its parts for titles like “Program | Service | v1.2”; {'{month}'} is e.g. “{currentIndiaMonth()}”. Text without placeholders is used as typed. ● marks Epics with a setup.</small></p>
      <fieldset className="plain-fieldset feature-setup" disabled={!editable || busy}>
        <h3>Optional User Stories</h3>
        {!current?.stories.length && <p className="muted">{current ? 'No optional User Stories: only the Time Writing story and Task are created.' : 'No setup for this Epic yet: Features under it use the PU / Full Release milestones. Add a User Story or set the Task defaults to start one.'}</p>}
        {current?.stories.map((story, index) => <div key={index} className="setup-story">
          <label>Title<input value={story.title} maxLength={255} onChange={(event) => change((entry) => { entry.stories[index].title = event.target.value })} /><small className="muted">→ {preview(story.title)}</small></label>
          <label>Description<textarea rows={2} value={story.description} onChange={(event) => change((entry) => { entry.stories[index].description = event.target.value })} /></label>
          <div className="button-row"><button type="button" className="ghost" aria-label="Move up" disabled={index === 0} onClick={() => change((entry) => { [entry.stories[index - 1], entry.stories[index]] = [entry.stories[index], entry.stories[index - 1]] })}>↑</button><button type="button" className="ghost" aria-label="Move down" disabled={index === current.stories.length - 1} onClick={() => change((entry) => { [entry.stories[index + 1], entry.stories[index]] = [entry.stories[index], entry.stories[index + 1]] })}>↓</button><button type="button" className="text-button" onClick={() => change((entry) => { entry.stories.splice(index, 1) })}>Remove</button></div>
        </div>)}
        <button type="button" className="ghost" onClick={() => change((entry) => { entry.stories.push({ title: '', description: '' }) })}>＋ Add optional User Story</button>
        <h3>Time Writing Task defaults</h3>
        <p className="muted"><small>Always created under the “{'{feature}'} - Time Writing” User Story.</small></p>
        <div className="form-row">
          <label>Title<input value={current?.task.title ?? '{month} | {feature}'} maxLength={255} onChange={(event) => change((entry) => { entry.task.title = event.target.value })} /><small className="muted">→ {preview(current?.task.title ?? '{month} | {feature}')}</small></label>
          <label>Original Estimate (hours)<input type="number" min="0" max="1000000" step="0.25" value={current?.task.originalEstimate ?? ''} placeholder="None" onChange={(event) => change((entry) => { const value = event.target.value.trim(); if (value === '') delete entry.task.originalEstimate; else if (Number.isFinite(Number(value)) && Number(value) >= 0) entry.task.originalEstimate = Number(value) })} /></label>
        </div>
        <label>Description<textarea rows={2} value={current?.task.description ?? ''} onChange={(event) => change((entry) => { entry.task.description = event.target.value })} /></label>
        <div className="form-row">
          <label>Assigned to<PersonPicker label="Task assigned to" value={taskAssigneeName} people={people.map((person) => person.name)} onChange={(name) => change((entry) => { entry.task.assignedTo = people.find((person) => person.name === name)?.email ?? '' })} meLabel="The person the Feature is assigned to" /></label>
          <label>Area Path<input value={current?.task.areaPath ?? ''} placeholder="The Time Writing story's Area Path" onChange={(event) => change((entry) => { entry.task.areaPath = event.target.value })} /></label>
          <label>Iteration Path<input value={current?.task.iterationPath ?? ''} placeholder="The project (no Sprint)" onChange={(event) => change((entry) => { entry.task.iterationPath = event.target.value })} /></label>
        </div>
        {current && <button type="button" className="text-button" onClick={() => { const next = structuredClone(file); next.epics = next.epics.filter((entry) => entry.epicId !== chosen); setDraft(next); setResult(null) }}>Remove the setup of this Epic (back to PU / Full Release)</button>}
      </fieldset>
      {editable && draft && <form className="git-bar git-bar-dirty" onSubmit={save}>
        <span><strong>Unsaved Feature setup</strong> — not yet in Git</span>
        <input aria-label="Change description" value={commit} onChange={(event) => setCommit(event.target.value)} placeholder="Describe the change" />
        <button type="button" className="ghost" disabled={busy} onClick={() => { setDraft(null); setResult(null) }}>Discard</button>
        <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save to Git'}</button>
      </form>}
    </>}
    {result && <Notice tone={result.tone}>{result.text}{result.url && <> <a href={result.url} target="_blank" rel="noreferrer">View commit</a></>}</Notice>}
  </Panel>
}
