import { useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { builtinMilestones, builtinSetup, copySetup, defaultTimeWritingStory, emptySetup, fillTitle, missingValues, placeholders, setupFor, titleValues, type EpicSetup, type FeatureSetupFile } from '../featureSetup'
import { currentIndiaMonth } from '../azureDevOps'
import { assignablePeople } from '../myWork'
import type { FeatureSetup } from '../useFeatureSetup'
import type { GitStorage } from '../useGitStorage'
import { PersonPicker } from './PersonPicker'
import { EmptyState, Modal, Notice, Panel, Info } from './ui'

// Settings → Feature setup: per Epic, the optional User Stories offered when a Feature is created under it (all ticked
// by default) and the defaults of the month Time Writing Task. Two layers: "My setup" (feature-setup/<my email>.json,
// used only when I create a Feature, before the shared one) and "Shared" (feature-setup.json, everyone). Anyone whose
// Git token can write may edit either, and "Enable for everyone" copies my setup of an Epic into the shared one.
export function FeatureSetupPanel({ setup, git, items }: { setup: FeatureSetup; git: GitStorage; items: AzureWorkItem[] }) {
  const epics = items.filter((item) => item.workItemType === 'Epic' && item.state.toLowerCase() !== 'removed').sort((a, b) => a.title.localeCompare(b.title))
  const people = assignablePeople(items)
  const [draft, setDraft] = useState<FeatureSetupFile | null>(null)
  const [epicId, setEpicId] = useState(0)
  const [sample, setSample] = useState('Program | Service | v1.0')
  const [commit, setCommit] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string; url?: string } | null>(null)
  const [goTo, setGoTo] = useState('')
  const [copyTo, setCopyTo] = useState('')
  const [editing, setEditing] = useState(false)
  // Which layer is shown and edited: mine (default when my email is known) or the shared one.
  const [layer, setLayer] = useState<'mine' | 'shared'>(setup.email ? 'mine' : 'shared')
  const mine = layer === 'mine' && Boolean(setup.email)
  const base = mine ? setup.personal : setup.shared
  const file = draft ?? base ?? { schema: 1, kind: 'feature-setup', epics: [] }
  const editable = git.connected && !git.readOnly && !git.isSample && (!mine || Boolean(setup.email))
  const chosen = epicId || base?.epics[0]?.epicId || setup.shared?.epics[0]?.epicId || epics[0]?.id || 0
  const sharedEntry = setupFor(setup.shared, chosen), myEntry = setupFor(setup.personal, chosen)
  const switchLayer = (next: 'mine' | 'shared') => { if (draft && !window.confirm('Discard the unsaved changes?')) return; setDraft(null); setResult(null); setLayer(next) }
  // The editor is a pop-up; closing it with unsaved changes asks first.
  const closeEditor = () => { if (draft && !window.confirm('Discard the unsaved changes?')) return; setDraft(null); setEditing(false) }
  const epic = epics.find((item) => item.id === chosen)
  const current = setupFor(file, chosen)
  const epicLabel = `#${chosen}${epic ? ` ${epic.title}` : current?.epicTitle ? ` ${current.epicTitle}` : ''}`
  // Which setup a new Feature under this Epic gets when I create it: mine, else the shared one, else the built-in milestones.
  const appliesNow: 'mine' | 'shared' | 'builtin' = myEntry ? 'mine' : sharedEntry ? 'shared' : 'builtin'
  const idOf = (text: string) => { const id = Number(text.trim().replace(/^#/, '')); return Number.isSafeInteger(id) && id > 0 ? id : 0 }
  const jump = () => { const id = idOf(goTo); if (id) { if (draft && !window.confirm('Discard the unsaved changes?')) return; setDraft(null); setEpicId(id); setGoTo(''); setCopyTo(''); setResult(null) } }
  const startFromBuiltin = (kind: keyof typeof builtinMilestones) => { const next = structuredClone(file); next.epics = [...next.epics.filter((entry) => entry.epicId !== chosen), builtinSetup(chosen, epic?.title ?? '', kind)]; setDraft(next); setResult(null) }
  const copy = () => { const id = idOf(copyTo); if (!id || id === chosen) return; const target = epics.find((item) => item.id === id); if (setupFor(file, id) && !window.confirm(`Epic #${id} already has a setup here. Replace it with the setup of Epic #${chosen}?`)) return; setDraft(copySetup(file, chosen, id, target?.title ?? '')); setEpicId(id); setCopyTo(''); setResult({ tone: 'success', text: `Copied to Epic #${id}. Review it below and save to Git.` }) }
  const values = titleValues(sample, currentIndiaMonth())
  const change = (update: (entry: EpicSetup) => void) => {
    const next = structuredClone(file)
    let entry = next.epics.find((item) => item.epicId === chosen)
    if (!entry) { entry = emptySetup(chosen, epic?.title ?? ''); next.epics.push(entry) }
    update(entry); entry.epicTitle = epic?.title ?? entry.epicTitle
    setDraft(next); setResult(null)
  }
  const preview = (template: string) => { const missing = missingValues(template, values); return missing.length ? `needs {${missing.join('}, {')}} — the sample title has no such part` : fillTitle(template, values) || '—' }
  const nameOf = (email: string | undefined) => email ? people.find((person) => person.email === email)?.name ?? email : ''
  const taskAssigneeName = nameOf(current?.task.assignedTo)
  const story = current?.timeWritingStory ?? defaultTimeWritingStory

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!draft) return
    setBusy(true)
    try { const saved = mine ? await setup.savePersonal(draft, commit.trim() || `Update my Feature setup (${setup.email})`) : await setup.saveShared(draft, commit.trim() || 'Update the shared Feature setup'); setDraft(null); setEditing(false); setCommit(''); setResult({ tone: 'success', text: mine ? 'Your setup is saved to Git. It applies when you create a Feature.' : 'The shared setup is saved to Git. It applies to everyone without their own setup of the Epic.', url: saved.commitUrl }) }
    catch (failure) { setResult({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }) }
    finally { setBusy(false) }
  }
  async function enableForEveryone() {
    if (!myEntry || draft) return
    if (!window.confirm(`Enable your setup of Epic #${chosen} for everyone? It replaces the shared setup of this Epic.`)) return
    setBusy(true)
    try { const saved = await setup.enableForEveryone(myEntry); setResult({ tone: 'success', text: `Your setup of Epic #${chosen} is now the shared setup for everyone.`, url: saved.commitUrl }) }
    catch (failure) { setResult({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }) }
    finally { setBusy(false) }
  }

  return <Panel className="admin-section" eyebrow="NEW FEATURES" title="Feature setup per Epic" info={<>When a Feature is created under an Epic, its optional User Stories (all ticked, untick what is not needed), the Time Writing User Story and the month Time Writing Task defaults come from here. An Epic without a setup keeps the PU / Full Release milestones. <strong>My setup</strong> is yours alone (Git: feature-setup/&lt;your email&gt;.json) and is used before the shared one when you create a Feature. <strong>Shared</strong> is for everyone without their own setup of the Epic (Git: feature-setup.json). <strong>Enable for everyone</strong> copies your setup of the Epic into the shared one. Saving needs a Git token that can write; personal files sit in the same repository, so anyone with access to it can read them.{setup.history && <> <a href={setup.history} target="_blank" rel="noreferrer">History</a></>}</>}
    action={<div className="button-row">
      <div className="segmented" role="group" aria-label="Which setup">{setup.email && <button type="button" aria-pressed={mine} onClick={() => switchLayer('mine')}>My setup</button>}<button type="button" aria-pressed={!mine} onClick={() => switchLayer('shared')}>Shared (everyone)</button></div>
      {git.connected && <button type="button" className="ghost" onClick={() => { setDraft(null); setResult(null); void setup.reload() }}>Reload from Git</button>}
    </div>}>
    <p className="muted setup-layer">{mine ? <>Your own setup ({setup.email}). It is used only when <strong>you</strong> create a Feature, before the shared one.</> : <>The shared setup, used by everyone who has no setup of their own for the Epic.</>}</p>
    {!setup.email && <Notice tone="info">Set your email on the Time Writing connection to keep a setup of your own; until then only the shared setup is shown.</Notice>}
    {!git.connected && <Notice tone="info">Connect Git storage (Storage tab) to share the Feature setup.{setup.shared || setup.personal ? ' The setup last loaded in this browser is used meanwhile.' : ''}</Notice>}
    {git.connected && git.readOnly && <Notice tone="info">View only: your Git token can read but not save.</Notice>}
    {setup.error && <Notice tone="error">Feature setup: {setup.error}</Notice>}
    <div className="setup-jump"><label>Go to Epic #<input inputMode="numeric" value={goTo} placeholder="e.g. 13946" onChange={(event) => setGoTo(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); jump() } }} /></label><button type="button" className="ghost" disabled={!idOf(goTo)} onClick={jump}>Open</button></div>
    {chosen > 0 && <div className="setup-flow" role="group" aria-label={`Which setup applies to Epic #${chosen}`}>
      <p><strong>When you create a Feature under Epic {epicLabel}</strong>, the first of these that exists is used:</p>
      <ol>
        <li className={appliesNow === 'mine' ? 'setup-flow-on' : ''}><strong>My setup</strong> of this Epic{setup.email ? '' : ' (needs your email on the Time Writing connection)'} — {myEntry ? `${myEntry.stories.length} optional User Stor${myEntry.stories.length === 1 ? 'y' : 'ies'}` : 'none'}{mine && draft && current ? <em className="setup-unsaved"> · changed here, not saved yet: save to Git to apply</em> : null}</li>
        <li className={appliesNow === 'shared' ? 'setup-flow-on' : ''}><strong>Shared setup</strong> of this Epic — {sharedEntry ? `${sharedEntry.stories.length} optional User Stor${sharedEntry.stories.length === 1 ? 'y' : 'ies'}` : 'none'}{!mine && draft && current ? <em className="setup-unsaved"> · changed here, not saved yet: save to Git to apply</em> : null}</li>
        <li className={appliesNow === 'builtin' ? 'setup-flow-on' : ''}><strong>Built-in</strong> — you choose PU (SFV, DT, IQOQ) or Full Release (PRD, SFV, DT, IQOQ) in the New Feature form</li>
      </ol>
      <p className="muted">Applies now: <strong>{appliesNow === 'mine' ? 'my setup' : appliesNow === 'shared' ? 'the shared setup' : 'the built-in milestones'}</strong>. The Time Writing User Story and the month Task are always created.</p>
    </div>}
    {!epics.length && !chosen ? <EmptyState title="No Epics loaded yet." detail="Fetch the Time Writing connection; its Epics appear here." /> : <>
      <div className="setup-summary">
        <label>Epic<select value={chosen} onChange={(event) => setEpicId(Number(event.target.value))}>{!epic && chosen > 0 && <option value={chosen}>#{chosen}{current?.epicTitle ? ` ${current.epicTitle}` : ' (not in the fetched data)'}</option>}{epics.map((item) => <option key={item.id} value={item.id}>{setupFor(file, item.id) ? '● ' : ''}#{item.id} {item.title}{mine && !setupFor(file, item.id) && setupFor(setup.shared, item.id) ? ' (shared)' : ''}</option>)}</select></label>
        <div><span className="field-label">{current ? `${mine ? 'My' : 'Shared'} setup of this Epic` : 'No setup of this Epic here'}</span><p>{current ? <>{current.stories.length ? current.stories.map((entry) => entry.title || '(untitled)').join(' · ') : 'No optional User Stories'} · Time Writing story “{story.title}” · Task “{current.task.title}”</> : mine && sharedEntry ? 'The shared setup applies (see above).' : 'The built-in milestones apply (see above).'}</p></div>
        <button type="button" className="primary" onClick={() => { setResult(null); setEditing(true) }}>{editable ? current ? 'Edit setup…' : 'Create setup…' : 'View setup…'}</button>
      </div>
      {mine && editable && myEntry && !draft && <div className="button-row setup-share"><button type="button" className="ghost" disabled={busy} onClick={() => void enableForEveryone()} title="Copies your setup of this Epic into the shared setup">Enable for everyone</button><small className="muted">{sharedEntry ? 'Replaces the shared setup of this Epic.' : 'This Epic has no shared setup yet.'}</small></div>}
      {editing && <Modal title={`${mine ? 'My' : 'Shared'} Feature setup · Epic ${epicLabel}`} eyebrow={editable ? 'SETTINGS · FEATURE SETUP' : 'SETTINGS · FEATURE SETUP · VIEW ONLY'} wide form onClose={closeEditor}>
        <label>Preview with Feature title<input value={sample} onChange={(event) => setSample(event.target.value)} /></label>
      <p className="info-line"><Info label="Placeholders">Placeholders: {placeholders.map((key) => `{${key}}`).join(' ')} — {'{feature}'} is the whole title; {'{program}'}, {'{service}'}, {'{version}'} are its parts for titles like “Program | Service | v1.2”; {'{month}'} is e.g. “{currentIndiaMonth()}”. Text without placeholders is used as typed. ● marks Epics with a setup.</Info></p>
      <fieldset className="plain-fieldset feature-setup" disabled={!editable || busy}>
        {mine && !current && sharedEntry && <Notice tone="info">You use the shared setup of this Epic. <button type="button" className="text-button" onClick={() => { const next = structuredClone(file); next.epics.push(structuredClone(sharedEntry)); setDraft(next); setResult(null) }}>Start my own from the shared one</button></Notice>}
        {!current && <div className="setup-builtin"><p><strong>No {mine ? 'personal' : 'shared'} setup of Epic {epicLabel} yet.</strong> Start from the built-in stories (editable afterwards):</p><div className="button-row"><button type="button" className="ghost" onClick={() => startFromBuiltin('Release')}>Use built-in Full Release ({builtinMilestones.Release.join(', ')})</button><button type="button" className="ghost" onClick={() => startFromBuiltin('PU')}>Use built-in PU ({builtinMilestones.PU.join(', ')})</button></div></div>}
        <h3>Optional User Stories</h3>
        {!current?.stories.length && <p className="muted">{current ? 'No optional User Stories: only the Time Writing story and Task are created.' : mine && sharedEntry ? 'No setup of your own for this Epic: the shared one applies (see above).' : 'No setup for this Epic yet: Features under it use the PU / Full Release milestones. Add a User Story or set the Task defaults to start one.'}</p>}
        {current?.stories.map((story, index) => <div key={index} className="setup-story">
          <label>Title<input value={story.title} maxLength={255} onChange={(event) => change((entry) => { entry.stories[index].title = event.target.value })} /><small className="muted">→ {preview(story.title)}</small></label>
          <label>Description<textarea rows={2} value={story.description} onChange={(event) => change((entry) => { entry.stories[index].description = event.target.value })} /></label>
          <div className="button-row"><button type="button" className="ghost" aria-label="Move up" disabled={index === 0} onClick={() => change((entry) => { [entry.stories[index - 1], entry.stories[index]] = [entry.stories[index], entry.stories[index - 1]] })}>↑</button><button type="button" className="ghost" aria-label="Move down" disabled={index === current.stories.length - 1} onClick={() => change((entry) => { [entry.stories[index + 1], entry.stories[index]] = [entry.stories[index], entry.stories[index + 1]] })}>↓</button><button type="button" className="text-button" onClick={() => change((entry) => { entry.stories.splice(index, 1) })}>Remove</button></div>
        </div>)}
        <button type="button" className="ghost" onClick={() => change((entry) => { entry.stories.push({ title: '', description: '' }) })}>＋ Add optional User Story</button>
        <h3>Time Writing User Story <Info>Always created under the Feature; it holds the month Task. Keep “Time Writing” in the title so Monthly Time Writing and Bulk actions recognise it before its first Task exists.</Info></h3>
        <div className="form-row">
          <label>Title<input value={story.title} maxLength={255} onChange={(event) => change((entry) => { entry.timeWritingStory ??= { ...defaultTimeWritingStory }; entry.timeWritingStory.title = event.target.value })} /><small className="muted">→ {preview(story.title)}</small></label>
          <label>Assigned to<PersonPicker label="Time Writing story assigned to" value={nameOf(story.assignedTo)} people={people.map((person) => person.name)} onChange={(name) => change((entry) => { entry.timeWritingStory ??= { ...defaultTimeWritingStory }; entry.timeWritingStory.assignedTo = people.find((person) => person.name === name)?.email ?? '' })} meLabel="The person the Feature is assigned to" /></label>
        </div>
        <label>Description<textarea rows={2} value={story.description} onChange={(event) => change((entry) => { entry.timeWritingStory ??= { ...defaultTimeWritingStory }; entry.timeWritingStory.description = event.target.value })} /></label>
        <div className="form-row">
          <label>Area Path<input value={story.areaPath} placeholder="The Feature's Area Path" onChange={(event) => change((entry) => { entry.timeWritingStory ??= { ...defaultTimeWritingStory }; entry.timeWritingStory.areaPath = event.target.value })} /></label>
          <label>Iteration Path<input value={story.iterationPath} placeholder="The Sprint chosen when creating" onChange={(event) => change((entry) => { entry.timeWritingStory ??= { ...defaultTimeWritingStory }; entry.timeWritingStory.iterationPath = event.target.value })} /></label>
        </div>
        <h3>Time Writing Task defaults <Info>Always created under the Time Writing User Story above.</Info></h3>
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
        {current && <button type="button" className="text-button" onClick={() => { const next = structuredClone(file); next.epics = next.epics.filter((entry) => entry.epicId !== chosen); setDraft(next); setResult(null) }}>{mine ? `Remove my setup of this Epic (${sharedEntry ? 'use the shared one' : 'back to PU / Full Release'})` : 'Remove the shared setup of this Epic (back to PU / Full Release)'}</button>}
      </fieldset>
      {editable && current && <div className="button-row setup-copy"><label>Copy this setup to Epic #<input inputMode="numeric" value={copyTo} placeholder="e.g. 13946" onChange={(event) => setCopyTo(event.target.value)} /></label><button type="button" className="ghost" disabled={!idOf(copyTo) || idOf(copyTo) === chosen} onClick={copy}>Copy</button></div>}
      {editable && draft && <form className="git-bar git-bar-dirty" onSubmit={save}>
        <span><strong>Unsaved {mine ? 'personal' : 'shared'} Feature setup</strong> — not yet in Git</span>
        <input aria-label="Change description" value={commit} onChange={(event) => setCommit(event.target.value)} placeholder="Describe the change" />
        <button type="button" className="ghost" disabled={busy} onClick={() => { setDraft(null); setResult(null) }}>Discard</button>
        <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save to Git'}</button>
      </form>}
        {result?.tone === 'error' && <Notice tone="error">{result.text}</Notice>}
        {!draft && <div className="modal-actions"><button type="button" className="primary" onClick={closeEditor}>Close</button></div>}
      </Modal>}
    </>}
    {result && !(editing && result.tone === 'error') && <Notice tone={result.tone}>{result.text}{result.url && <> <a href={result.url} target="_blank" rel="noreferrer">View commit</a></>}</Notice>}
  </Panel>
}
