import { useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { maxTitleFields, builtinMilestones, builtinSetup, copySetup, defaultTimeWritingStory, emptySetup, fillTitle, missingValues, placeholders, removeSetup, editSetup, setupFor, setupsMissingDoD, defaultDoDFor, fillMissingDoD, missingDoD, sharedSetupRows, titleValues, type EpicSetup, type FeatureSetupFile } from '../featureSetup'
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
  // Every shared setup at once, editable in place (titles, stories, estimate) with one Save to Git for all changed
  // rows; Open shows an Epic's shared setup in the pop-up with every field.
  const [listDraft, setListDraft] = useState<FeatureSetupFile | null>(null)
  const [listEditing, setListEditing] = useState<number[]>([])
  const [listCommit, setListCommit] = useState('')
  const sharedEditable = git.connected && !git.readOnly && !git.isSample
  const sharedRows = sharedSetupRows({ shared: listDraft ?? setup.shared, personal: setup.personal })
  const listMissing = listDraft ? setupsMissingDoD(listDraft, setup.shared) : []
  const listChanged = (id: number) => JSON.stringify(setupFor(listDraft, id) ?? null) !== JSON.stringify(setupFor(setup.shared, id) ?? null)
  const editRow = (id: number, update: (entry: EpicSetup) => void) => { setListDraft((current) => editSetup(current ?? structuredClone(setup.shared!), id, update)); setResult(null) }
  // Editing a row whose setup has no Feature DoD pre-fills the default (reviewed before Save to Git).
  const startRow = (id: number) => { if (draft && !window.confirm('Discard the unsaved changes in the Feature setup editor?')) return; setDraft(null); setListEditing((current) => current.includes(id) ? current : [...current, id]); const entry = setupFor(listDraft ?? setup.shared, id); if (entry && missingDoD(entry)) editRow(id, (item) => { item.featureDoD = defaultDoDFor(item) }) }
  const missingCount = (listDraft ?? setup.shared)?.epics.filter(missingDoD).length ?? 0
  const fillAll = () => { setListDraft((current) => fillMissingDoD(current ?? structuredClone(setup.shared!)).file); setResult(null) }
  const removeRow = (id: number) => { if (!window.confirm(`Delete the shared setup of Epic #${id}? Features under it then use the built-in milestones (or a person's own setup). It is deleted in Git when you press Save to Git.`)) return; setListDraft((current) => removeSetup(current ?? structuredClone(setup.shared!), id)); setListEditing((current) => current.filter((entry) => entry !== id)); setResult(null) }
  const discardList = () => { setListDraft(null); setListEditing([]); setListCommit('') }
  async function saveList(event: React.FormEvent) {
    event.preventDefault()
    if (!listDraft || listMissing.length) return
    const changed = [...new Set([...listDraft.epics, ...(setup.shared?.epics ?? [])].map((entry) => entry.epicId))].filter(listChanged)
    setBusy(true)
    try { const saved = await setup.saveShared(listDraft, listCommit.trim() || `Update the shared Feature setup of Epic${changed.length === 1 ? '' : 's'} ${changed.map((id) => `#${id}`).join(', ')}`); discardList(); setResult({ tone: 'success', text: `Shared Feature setup saved to Git (${changed.length} Epic${changed.length === 1 ? '' : 's'}).`, url: saved.commitUrl }) }
    catch (failure) { setResult({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }) }
    finally { setBusy(false) }
  }
  const openShared = (id: number) => { if (listDraft && !window.confirm('Discard the unsaved changes in the list?')) return; discardList(); if (draft && !window.confirm('Discard the unsaved changes?')) return; setDraft(null); setResult(null); setLayer('shared'); setEpicId(id); setEditing(true) }
  const draftMissing = draft ? setupsMissingDoD(draft, base) : []
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
  const values = titleValues(sample, currentIndiaMonth(), current?.titleFields)
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
    if (!draft || draftMissing.length) return
    setBusy(true)
    try { const saved = mine ? await setup.savePersonal(draft, commit.trim() || `Update my Feature setup (${setup.email})`) : await setup.saveShared(draft, commit.trim() || 'Update the shared Feature setup'); setDraft(null); setEditing(false); setCommit(''); setResult({ tone: 'success', text: mine ? 'Your setup is saved to Git. It applies when you create a Feature.' : 'The shared setup is saved to Git. It applies to everyone without their own setup of the Epic.', url: saved.commitUrl }) }
    catch (failure) { setResult({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }) }
    finally { setBusy(false) }
  }
  // Delete my / the shared setup of the chosen Epic straight away (one commit), after confirmation.
  async function deleteCurrent() {
    if (!current || !base || draft) return
    if (!window.confirm(`Delete ${mine ? 'your' : 'the shared'} Feature setup of Epic ${epicLabel} from Git now? ${mine ? (sharedEntry ? 'The shared setup then applies to you.' : 'The built-in milestones then apply.') : 'Features under it then use the built-in milestones (or a person\'s own setup).'}`)) return
    const next = { ...base, epics: base.epics.filter((entry) => entry.epicId !== chosen) }
    setBusy(true)
    try { const saved = mine ? await setup.savePersonal(next, `Delete my Feature setup of Epic #${chosen} (${setup.email})`) : await setup.saveShared(next, `Delete the shared Feature setup of Epic #${chosen}`); discardList(); setResult({ tone: 'success', text: `${mine ? 'Your' : 'The shared'} Feature setup of Epic #${chosen} was deleted in Git.`, url: saved.commitUrl }) }
    catch (failure) { setResult({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }) }
    finally { setBusy(false) }
  }
  async function enableForEveryone() {
    if (!myEntry || draft || !myEntry.featureDoD.trim()) return
    if (!window.confirm(`Enable your setup of Epic #${chosen} for everyone? It replaces the shared setup of this Epic.`)) return
    setBusy(true)
    try { const saved = await setup.enableForEveryone(myEntry); setResult({ tone: 'success', text: `Your setup of Epic #${chosen} is now the shared setup for everyone.`, url: saved.commitUrl }) }
    catch (failure) { setResult({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }) }
    finally { setBusy(false) }
  }

  return <Panel className="admin-section" eyebrow="NEW FEATURES" title="Feature setup per Epic" info={<>When a Feature is created under an Epic, its optional User Stories (all ticked, untick what is not needed), the Time Writing User Story and the month Time Writing Task defaults come from here. An Epic without a setup keeps the PU / Full Release milestones. <strong>My setup</strong> is yours alone (Git: feature-setup/&lt;your email&gt;.json) and is used before the shared one when you create a Feature. <strong>Shared</strong> is for everyone without their own setup of the Epic (Git: feature-setup.json). <strong>Enable for everyone</strong> copies your setup of the Epic into the shared one. Saving needs a Git token that can write; personal files sit in the same repository, so anyone with access to it can read them.{setup.history && <> <a href={setup.history} target="_blank" rel="noreferrer">History</a></>}</>}
    action={<div className="button-row">
      <div className="segmented" role="group" aria-label="Which setup">{setup.email && <button type="button" aria-pressed={mine} onClick={() => switchLayer('mine')}>My setup</button>}<button type="button" aria-pressed={!mine} onClick={() => switchLayer('shared')}>Shared (everyone)</button></div>
      {git.connected && <button type="button" className="ghost" onClick={() => { if ((draft || listDraft) && !window.confirm('Discard the unsaved changes?')) return; setDraft(null); discardList(); setResult(null); void setup.reload() }}>Reload from Git</button>}
    </div>}>
    <p className="muted setup-layer">{mine ? <>Your own setup ({setup.email}). It is used only when <strong>you</strong> create a Feature, before the shared one.</> : <>The shared setup, used by everyone who has no setup of their own for the Epic.</>}</p>
    {!setup.email && <Notice tone="info">Set your email on the Time Writing connection to keep a setup of your own; until then only the shared setup is shown.</Notice>}
    {!git.connected && <Notice tone="info">Connect Git storage (Storage tab) to share the Feature setup.{setup.shared || setup.personal ? ' The setup last loaded in this browser is used meanwhile.' : ''}</Notice>}
    {git.connected && git.readOnly && <Notice tone="info">View only: your Git token can read but not save.</Notice>}
    {setup.error && <Notice tone="error">Feature setup: {setup.error}</Notice>}
    <details className="setup-all" open={Boolean(listDraft) || (sharedRows.length > 0 && sharedRows.length <= 12)}>
      <summary><strong>All shared setups</strong> <span className="muted">({sharedRows.length} Epic{sharedRows.length === 1 ? '' : 's'}{git.connected ? '' : ', as last loaded in this browser'})</span></summary>
      {sharedRows.length > 0 && !sharedEditable && <p className="muted">{git.connected ? git.readOnly ? 'View only: your Git token can read but not save.' : 'Synthetic sample data is loaded: editing is disabled.' : 'Connect Git storage (Storage tab) to edit them here.'}</p>}
      {sharedEditable && missingCount > 0 && <div className="setup-fill-dod"><span className="warning-text">{missingCount} shared setup{missingCount === 1 ? ' has' : 's have'} no Feature DoD.</span><button type="button" className="ghost" disabled={busy} onClick={fillAll}>Fill missing DoDs with the default</button><small className="muted">Full Release DoD for setups with a PRD story, PU DoD otherwise; review, then Save to Git.</small></div>}
      {sharedRows.length ? <div className="azure-table"><table className="setup-all-table"><thead><tr><th>Epic</th><th>Feature DoD</th><th>Optional User Stories</th><th>Time Writing story</th><th>Month Task</th><th /></tr></thead><tbody>
        {sharedRows.map((row) => { const title = epics.find((item) => item.id === row.epicId)?.title || row.epicTitle, on = sharedEditable && listEditing.includes(row.epicId), changed = Boolean(listDraft) && listChanged(row.epicId); return <tr key={row.epicId} className={on ? 'setup-all-editing' : undefined}>
          <td><strong>#{row.epicId}</strong>{title && <small>{title}</small>}{changed && <small className="warning-text">Changed · not yet in Git</small>}{row.mineInstead && <small className="warning-text">Your own setup replaces it for you</small>}</td>
          {on ? <>
            <td><textarea className="setup-all-dod" aria-label={`Epic #${row.epicId} Feature DoD`} rows={3} required value={row.featureDoD} maxLength={100000} placeholder="Required, e.g. IQOQ finished and Checklist uploaded into the Feature." onChange={(event) => editRow(row.epicId, (entry) => { entry.featureDoD = event.target.value })} /></td>
            <td><ol className="setup-all-stories setup-all-edit">{row.stories.map((story, index) => <li key={index}>
              <input aria-label={`Epic #${row.epicId} story ${index + 1}`} value={story} maxLength={255} onChange={(event) => editRow(row.epicId, (entry) => { entry.stories[index].title = event.target.value })} />
              <button type="button" className="ghost" aria-label="Move up" disabled={index === 0} onClick={() => editRow(row.epicId, (entry) => { [entry.stories[index - 1], entry.stories[index]] = [entry.stories[index], entry.stories[index - 1]] })}>↑</button>
              <button type="button" className="ghost" aria-label="Move down" disabled={index === row.stories.length - 1} onClick={() => editRow(row.epicId, (entry) => { [entry.stories[index + 1], entry.stories[index]] = [entry.stories[index], entry.stories[index + 1]] })}>↓</button>
              <button type="button" className="text-button" aria-label={`Remove story ${index + 1}`} onClick={() => editRow(row.epicId, (entry) => { entry.stories.splice(index, 1) })}>✕</button>
            </li>)}</ol><button type="button" className="text-button" onClick={() => editRow(row.epicId, (entry) => { entry.stories.push({ title: '', description: '' }) })}>＋ Add User Story</button></td>
            <td><input aria-label={`Epic #${row.epicId} Time Writing story`} value={row.timeWritingStory} maxLength={255} onChange={(event) => editRow(row.epicId, (entry) => { entry.timeWritingStory.title = event.target.value })} />
              <label className="setup-all-estimate">Area Path<input aria-label={`Epic #${row.epicId} Time Writing story Area Path`} value={row.storyAreaPath} maxLength={4096} placeholder="The Feature's" onChange={(event) => editRow(row.epicId, (entry) => { entry.timeWritingStory.areaPath = event.target.value })} /></label>
              <label className="setup-all-estimate">Iteration Path<input aria-label={`Epic #${row.epicId} Time Writing story Iteration Path`} value={row.storyIterationPath} maxLength={4096} placeholder="Project root" onChange={(event) => editRow(row.epicId, (entry) => { entry.timeWritingStory.iterationPath = event.target.value })} /></label></td>
            <td><input aria-label={`Epic #${row.epicId} month Task`} value={row.task} maxLength={255} onChange={(event) => editRow(row.epicId, (entry) => { entry.task.title = event.target.value })} />
              <label className="setup-all-estimate">Estimate (h)<input type="number" min="0" max="1000000" step="0.25" value={row.originalEstimate ?? ''} placeholder="None" onChange={(event) => editRow(row.epicId, (entry) => { const value = event.target.value.trim(); if (value === '') delete entry.task.originalEstimate; else entry.task.originalEstimate = Number(value) })} /></label></td>
            <td><div className="button-row setup-all-actions"><button type="button" className="ghost" onClick={() => setListEditing((current) => current.filter((entry) => entry !== row.epicId))}>Done</button><button type="button" className="text-button" title="Open the full editor of this setup: also the Descriptions, Assigned to and Area / Iteration Paths of the stories and the Task" onClick={() => openShared(row.epicId)}>All fields…</button><button type="button" className="text-button danger-text" onClick={() => removeRow(row.epicId)}>Delete</button></div></td>
          </> : <>
            <td>{row.featureDoD.trim() ? row.featureDoD : <><span className="warning-text">Missing</span><small>Default: {defaultDoDFor({ stories: row.stories.map((title) => ({ title, description: '' })) })}</small></>}</td>
            <td>{row.stories.length ? <ol className="setup-all-stories">{row.stories.map((story, index) => <li key={index}>{story || '(untitled)'}</li>)}</ol> : <span className="muted">None</span>}</td>
            <td>{row.timeWritingStory}<small>Area: {row.storyAreaPath || 'the Feature’s'}</small><small>Iteration: {row.storyIterationPath || 'project root'}</small></td>
            <td>{row.task}{row.originalEstimate != null && <small>{row.originalEstimate}h estimate</small>}</td>
            <td><div className="button-row setup-all-actions">{sharedEditable && <button type="button" className="primary" disabled={busy} onClick={() => startRow(row.epicId)}>Edit</button>}<button type="button" className="ghost" title="Open the full editor of this setup: also the Descriptions, Assigned to and Area / Iteration Paths of the stories and the Task" onClick={() => openShared(row.epicId)}>{sharedEditable ? 'All fields…' : 'Open'}</button>{sharedEditable && <button type="button" className="text-button danger-text" disabled={busy} onClick={() => removeRow(row.epicId)}>Delete</button>}</div></td>
          </>}
        </tr> })}
      </tbody></table></div> : <p className="muted">{git.connected && !setup.loaded ? 'Loading from Git…' : 'No shared setup yet: every Epic uses the built-in milestones unless someone has a setup of their own.'}</p>}
      {sharedEditable && listDraft && <form className="git-bar git-bar-dirty" onSubmit={saveList}>
        <span><strong>Unsaved shared Feature setup</strong> — not yet in Git</span>
        <input aria-label="Change description" value={listCommit} onChange={(event) => setListCommit(event.target.value)} placeholder="Describe the change" />
        <button type="button" className="ghost" disabled={busy} onClick={discardList}>Discard</button>
        <button className="primary" disabled={busy || listMissing.length > 0} title={listMissing.length ? 'Every changed setup needs its Feature DoD' : undefined}>{busy ? 'Saving…' : 'Save to Git'}</button>
      </form>}
      {sharedEditable && listMissing.length > 0 && <Notice tone="warning">The Feature DoD is mandatory: add it for Epic {listMissing.map((id) => `#${id}`).join(', ')} to save.</Notice>}
    </details>
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
        <div><span className="field-label">{current ? `${mine ? 'My' : 'Shared'} setup of this Epic` : 'No setup of this Epic here'}</span><p>{current ? <>{current.featureDoD.trim() ? <>DoD “{current.featureDoD.trim()}” · </> : <span className="warning-text">Feature DoD missing · </span>}{current.stories.length ? current.stories.map((entry) => entry.title || '(untitled)').join(' · ') : 'No optional User Stories'} · Time Writing story “{story.title}” · Task “{current.task.title}”</> : mine && sharedEntry ? 'The shared setup applies (see above).' : 'The built-in milestones apply (see above).'}</p></div>
        <div className="button-row"><button type="button" className="primary" onClick={() => { setResult(null); if (editable && current && missingDoD(current)) change((entry) => { entry.featureDoD = defaultDoDFor(entry) }); setEditing(true) }}>{editable ? current ? 'Edit setup…' : 'Create setup…' : 'View setup…'}</button>{editable && current && <button type="button" className="text-button danger-text" disabled={busy || Boolean(draft)} onClick={() => void deleteCurrent()}>Delete setup</button>}</div>
      </div>
      {mine && editable && myEntry && !draft && <div className="button-row setup-share"><button type="button" className="ghost" disabled={busy || !myEntry.featureDoD.trim()} onClick={() => void enableForEveryone()} title={myEntry.featureDoD.trim() ? 'Copies your setup of this Epic into the shared setup' : 'Add the Feature DoD to your setup first'}>Enable for everyone</button><small className="muted">{sharedEntry ? 'Replaces the shared setup of this Epic.' : 'This Epic has no shared setup yet.'}</small></div>}
      {editing && <Modal title={`${mine ? 'My' : 'Shared'} Feature setup · Epic ${epicLabel}`} eyebrow={editable ? 'SETTINGS · FEATURE SETUP' : 'SETTINGS · FEATURE SETUP · VIEW ONLY'} wide form onClose={closeEditor}>
        <label>Preview with Feature title<input value={sample} onChange={(event) => setSample(event.target.value)} /></label>
      <p className="info-line"><Info label="Placeholders">Placeholders: {placeholders.map((key) => `{${key}}`).join(' ')} — {'{feature}'} is the whole title; {'{program}'}, {'{service}'}, {'{version}'} are its parts for titles like “Program | Service | v1.2”; {'{month}'} is e.g. “{currentIndiaMonth()}”; an Epic with title fields also has {'{Field}'} for each (any letter case, spaces ignored). Text without placeholders is used as typed. ● marks Epics with a setup.</Info></p>
      <fieldset className="plain-fieldset feature-setup" disabled={!editable || busy}>
        {mine && !current && sharedEntry && <Notice tone="info">You use the shared setup of this Epic. <button type="button" className="text-button" onClick={() => { const next = structuredClone(file); next.epics.push(structuredClone(sharedEntry)); setDraft(next); setResult(null) }}>Start my own from the shared one</button></Notice>}
        {!current && <div className="setup-builtin"><p><strong>No {mine ? 'personal' : 'shared'} setup of Epic {epicLabel} yet.</strong> Start from the built-in stories (editable afterwards):</p><div className="button-row"><button type="button" className="ghost" onClick={() => startFromBuiltin('Release')}>Use built-in Full Release ({builtinMilestones.Release.join(', ')})</button><button type="button" className="ghost" onClick={() => startFromBuiltin('PU')}>Use built-in PU ({builtinMilestones.PU.join(', ')})</button></div></div>}
        <label className="setup-dod">Feature DoD (Definition of Done) — required<textarea rows={2} required maxLength={100000} value={current?.featureDoD ?? ''} placeholder="e.g. IQOQ finished and Checklist uploaded into the Feature." onChange={(event) => change((entry) => { entry.featureDoD = event.target.value })} /><small>A new Feature under this Epic starts with it as “Feature DoD: …” at the top of its Description; it can be changed when creating.</small></label>
        {!current?.featureDoD.trim() && <div className="button-row"><button type="button" className="text-button" onClick={() => change((entry) => { entry.featureDoD = defaultDoDFor(entry) })}>Use the default: “{defaultDoDFor(current ?? { stories: [] })}”</button></div>}
        <h3>Title fields</h3>
        <p className="muted">Optional, up to {maxTitleFields}: the parts of a Feature title for this Epic (e.g. DP: Program, Service, Release; CP: Platform, Release Name, Number). New Feature asks for each, joins them with “ | ” into the title, writes “Field : value” into the Description and offers {'{Field}'} as a placeholder. The on-prem field (reference or plain name, e.g. SourceProgram) fills it from the release in Release Details. Blank or repeated names are dropped on save.</p>
        {current?.titleFields?.map((field, index) => <div key={index} className="setup-field">
          <label>Field<input value={field.label} maxLength={60} placeholder="e.g. Platform" onChange={(event) => change((entry) => { entry.titleFields![index].label = event.target.value })} /></label>
          <label>On-prem field<input value={field.source} maxLength={255} placeholder="Optional, e.g. SourceProgram" onChange={(event) => change((entry) => { entry.titleFields![index].source = event.target.value })} /></label>
          <div className="button-row"><button type="button" className="ghost" aria-label="Move up" disabled={index === 0} onClick={() => change((entry) => { const list = entry.titleFields!; [list[index - 1], list[index]] = [list[index], list[index - 1]] })}>↑</button><button type="button" className="text-button" aria-label={`Remove field ${index + 1}`} onClick={() => change((entry) => { entry.titleFields!.splice(index, 1); if (!entry.titleFields!.length) delete entry.titleFields })}>✕</button></div>
        </div>)}
        {(current?.titleFields?.length ?? 0) < maxTitleFields && <button type="button" className="ghost" onClick={() => change((entry) => { entry.titleFields = [...(entry.titleFields ?? []), { label: '', source: '' }] })}>＋ Add title field</button>}
        <h3>Optional User Stories</h3>
        {!current?.stories.length && <p className="muted">{current ? 'No optional User Stories: only the Time Writing story and Task are created.' : mine && sharedEntry ? 'No setup of your own for this Epic: the shared one applies (see above).' : 'No setup for this Epic yet: Features under it use the PU / Full Release milestones. Add a User Story or set the Task defaults to start one.'}</p>}
        {current?.stories.map((story, index) => <div key={index} className="setup-story">
          <label>Title<input value={story.title} maxLength={255} onChange={(event) => change((entry) => { entry.stories[index].title = event.target.value })} /><small className="muted">→ {preview(story.title)}</small></label>
          <label>Description<textarea rows={2} value={story.description} onChange={(event) => change((entry) => { entry.stories[index].description = event.target.value })} /></label>
          <div className="button-row"><button type="button" className="ghost" aria-label="Move up" disabled={index === 0} onClick={() => change((entry) => { [entry.stories[index - 1], entry.stories[index]] = [entry.stories[index], entry.stories[index - 1]] })}>↑</button><button type="button" className="ghost" aria-label="Move down" disabled={index === current.stories.length - 1} onClick={() => change((entry) => { [entry.stories[index + 1], entry.stories[index]] = [entry.stories[index], entry.stories[index + 1]] })}>↓</button><button type="button" className="text-button" onClick={() => change((entry) => { entry.stories.splice(index, 1) })}>Remove</button></div>
        </div>)}
        <button type="button" className="ghost" onClick={() => change((entry) => { entry.stories.push({ title: '', description: '' }) })}>＋ Add optional User Story</button>
        <h3>Time Writing User Story <Info>Always created under the Feature; it holds the month Task. Keep “Time Writing” in the title so Monthly Time Writing and Bulk actions recognise it before its first Task exists. Its Area Path and Iteration Path are set here: empty Iteration Path = the project root, never the PI or Sprint chosen when creating (the story is not tied to a PI, Sprint or year); empty Area Path = the Feature's.</Info></h3>
        <div className="form-row">
          <label>Title<input value={story.title} maxLength={255} onChange={(event) => change((entry) => { entry.timeWritingStory ??= { ...defaultTimeWritingStory }; entry.timeWritingStory.title = event.target.value })} /><small className="muted">→ {preview(story.title)}</small></label>
          <label>Assigned to<PersonPicker label="Time Writing story assigned to" value={nameOf(story.assignedTo)} people={people.map((person) => person.name)} onChange={(name) => change((entry) => { entry.timeWritingStory ??= { ...defaultTimeWritingStory }; entry.timeWritingStory.assignedTo = people.find((person) => person.name === name)?.email ?? '' })} meLabel="The person the Feature is assigned to" /></label>
        </div>
        <label>Description<textarea rows={2} value={story.description} onChange={(event) => change((entry) => { entry.timeWritingStory ??= { ...defaultTimeWritingStory }; entry.timeWritingStory.description = event.target.value })} /></label>
        <div className="form-row">
          <label>Area Path<input value={story.areaPath} placeholder="Empty: the Feature's Area Path, e.g. QMS\\Quality Engineering" onChange={(event) => change((entry) => { entry.timeWritingStory ??= { ...defaultTimeWritingStory }; entry.timeWritingStory.areaPath = event.target.value })} /></label>
          <label>Iteration Path<input value={story.iterationPath} placeholder="Empty: the project root, e.g. QMS (no PI, Sprint or year)" onChange={(event) => change((entry) => { entry.timeWritingStory ??= { ...defaultTimeWritingStory }; entry.timeWritingStory.iterationPath = event.target.value })} /></label>
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
        {current && <button type="button" className="text-button" onClick={() => { const next = structuredClone(file); next.epics = next.epics.filter((entry) => entry.epicId !== chosen); setDraft(next); setResult(null) }}>{mine ? `Delete my setup of this Epic (${sharedEntry ? 'use the shared one' : 'back to PU / Full Release'})` : 'Delete the shared setup of this Epic (back to PU / Full Release)'}</button>}
      </fieldset>
      {editable && current && <div className="button-row setup-copy"><label>Copy this setup to Epic #<input inputMode="numeric" value={copyTo} placeholder="e.g. 13946" onChange={(event) => setCopyTo(event.target.value)} /></label><button type="button" className="ghost" disabled={!idOf(copyTo) || idOf(copyTo) === chosen} onClick={copy}>Copy</button></div>}
      {editable && draft && <form className="git-bar git-bar-dirty" onSubmit={save}>
        <span><strong>Unsaved {mine ? 'personal' : 'shared'} Feature setup</strong> — not yet in Git</span>
        <input aria-label="Change description" value={commit} onChange={(event) => setCommit(event.target.value)} placeholder="Describe the change" />
        <button type="button" className="ghost" disabled={busy} onClick={() => { setDraft(null); setResult(null) }}>Discard</button>
        <button className="primary" disabled={busy || draftMissing.length > 0} title={draftMissing.length ? 'Every changed setup needs its Feature DoD' : undefined}>{busy ? 'Saving…' : 'Save to Git'}</button>
      </form>}
        {editable && draftMissing.length > 0 && <Notice tone="warning">The Feature DoD is mandatory: add it for Epic {draftMissing.map((id) => `#${id}`).join(', ')} to save.</Notice>}
        {result?.tone === 'error' && <Notice tone="error">{result.text}</Notice>}
        {!draft && <div className="modal-actions"><button type="button" className="primary" onClick={closeEditor}>Close</button></div>}
      </Modal>}
    </>}
    {result && !(editing && result.tone === 'error') && <Notice tone={result.tone}>{result.text}{result.url && <> <a href={result.url} target="_blank" rel="noreferrer">View commit</a></>}</Notice>}
  </Panel>
}
