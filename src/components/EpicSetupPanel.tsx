import { useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { copyEpicFields, emptyEpicSetup, featureFromFields, fieldTypes, ifEmptyOptions, intoOptions, listUsedBy, maxEpicFields, newListId, parseEpicSetup, serializeEpicSetup, upsertEpicFields, upsertList, type EpicField, type EpicFields, type EpicSetupFile } from '../epicSetup'
import { fieldKey } from '../featureSetup'
import type { EpicSetupStore } from '../useEpicSetup'
import type { GitStorage } from '../useGitStorage'
import { EmptyState, Notice, Panel, Pill } from './ui'

// EPS-01…05 Admin → Epic & Feature setup: per Epic, the extra fields of a new Feature (Program, Platform…), where each goes
// (Description, Title or both), what an empty one does (Optional, Warn, Block), the title pattern, and the shared value
// lists of the drop-downs. One draft for the whole file, saved to Git in one commit.
export function EpicSetupPanel({ setup, git, items, canEdit, canEditLists, section, initialEpicId = 0 }: { setup: EpicSetupStore; git: GitStorage; items: AzureWorkItem[]; canEdit: boolean; canEditLists: boolean; section: 'fields' | 'lists'; initialEpicId?: number }) {
  const { draft, setDraft } = setup
  const [epicId, setEpicId] = useState(initialEpicId)
  const [copyTo, setCopyTo] = useState<number[]>([])
  const [commit, setCommit] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [newList, setNewList] = useState('')
  const file = draft ?? setup.file ?? emptyEpicSetup()
  const writable = git.connected && !git.readOnly && !git.isSample
  const editFields = writable && canEdit, editLists = writable && canEditLists
  const dirty = Boolean(draft) && serializeEpicSetup(draft!) !== serializeEpicSetup(setup.file ?? emptyEpicSetup())
  const change = (next: EpicSetupFile) => { setDraft(next); setResult(null) }
  const boardEpics = items.filter((item) => item.workItemType === 'Epic' && item.state.toLowerCase() !== 'removed')
  const epics = [...new Map([...file.epics.map((entry) => [entry.epicId, { id: entry.epicId, title: entry.epicTitle }] as const), ...boardEpics.map((item) => [item.id, { id: item.id, title: item.title }] as const)]).values()].sort((a, b) => a.title.localeCompare(b.title) || a.id - b.id)
  const chosen = epicId || file.epics[0]?.epicId || epics[0]?.id || 0
  const chosenTitle = epics.find((epic) => epic.id === chosen)?.title ?? ''
  const entry: EpicFields = file.epics.find((item) => item.epicId === chosen) ?? { epicId: chosen, epicTitle: chosenTitle, fields: [] }
  const editEntry = (update: (next: EpicFields) => void) => { const next = structuredClone(entry); next.epicTitle = next.epicTitle || chosenTitle; update(next); change(upsertEpicFields(file, next)) }
  const editField = (index: number, update: Partial<EpicField>) => editEntry((next) => { next.fields[index] = { ...next.fields[index], ...update }; if (next.fields[index].type !== 'list') delete next.fields[index].list })
  const move = (index: number, by: number) => editEntry((next) => { const [field] = next.fields.splice(index, 1); next.fields.splice(index + by, 0, field) })
  const sample = entry.fields.map((field) => field.type === 'list' ? file.lists.find((list) => list.id === field.list)?.values[0] ?? field.label : field.type === 'date' ? '2026-12-01' : field.type === 'number' ? '1' : field.label)
  const preview = featureFromFields(entry, sample, 'Feature title')
  const duplicateLabels = entry.fields.filter((field, index) => entry.fields.findIndex((other) => fieldKey(other.label) === fieldKey(field.label)) !== index || !fieldKey(field.label) || ['feature', 'month'].includes(fieldKey(field.label))).map((field) => field.label || '(no label)')

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!draft) return
    if (duplicateLabels.length) { setResult({ tone: 'error', text: `Not saved: each field needs its own label (not Feature or Month): ${duplicateLabels.join(', ')}.` }); return }
    setBusy(true)
    try { await setup.save(parseEpicSetup(serializeEpicSetup(draft)), commit.trim() || 'Update the Epic setup'); setCommit(''); setResult({ tone: 'success', text: 'Saved to Git.' }) }
    catch (failure) { setResult({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }) }
    finally { setBusy(false) }
  }
  const saveBar = (editFields || editLists) && dirty && <form className="git-bar git-bar-dirty" onSubmit={save}>
    <span><strong>Unsaved Epic setup changes</strong> — not yet in Git</span>
    <input aria-label="Change description" value={commit} onChange={(event) => setCommit(event.target.value)} placeholder="Describe the change (e.g. CP: Platform field)" />
    <button type="button" className="ghost" disabled={busy} onClick={() => { setDraft(null); setResult(null) }}>Discard</button>
    <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save to Git'}</button>
  </form>
  const notices = <>
    {!git.connected && <Notice tone="info">Connect Git storage (Admin → Data & sharing) to load and save the Epic setup{setup.file ? '; the one last loaded here still applies' : ''}.</Notice>}
    {git.connected && git.readOnly && <Notice tone="info">View only: your Git token can read but not save.</Notice>}
    {setup.error && <Notice tone="error">{setup.error}</Notice>}
  </>

  if (section === 'lists') return <Panel className="admin-section epic-lists" eyebrow="EPIC SETUP" title="Value lists" info="The drop-down values of the Epic setup's List fields, shared by every Epic (e.g. Platform: Platform 1.0, Platform 2.0). One value per line. A list used by a field cannot be removed.">
    {notices}
    {!canEditLists && <p className="muted">View only: your role is not allowed “Edit Epic setup value lists and User Story templates”.</p>}
    {file.lists.length ? <div className="epic-list-grid">{[...file.lists].sort((a, b) => a.name.localeCompare(b.name)).map((list) => { const used = listUsedBy(file, list.id); return <div className="epic-list" key={list.id}>
      <div className="epic-list-head"><strong>{list.name}</strong><small className="muted">{used.length ? `Used by Epic ${used.map((id) => `#${id}`).join(', ')}` : 'Not used yet'}</small>{editLists && <button type="button" className="text-button danger-text" disabled={used.length > 0} title={used.length ? 'Used by a field: change the field first' : 'Remove this list'} onClick={() => change({ ...file, lists: file.lists.filter((item) => item.id !== list.id) })}>Remove</button>}</div>
      <textarea aria-label={`Values of ${list.name}`} rows={Math.min(8, Math.max(3, list.values.length + 1))} value={list.values.join('\n')} readOnly={!editLists} onChange={(event) => change(upsertList(file, { ...list, values: event.target.value.split('\n').map((value) => value.replace(/\s+$/, '')).filter((value, index, all) => value.trim() || index === all.length - 1) }))} />
    </div> })}</div> : <EmptyState title="No value lists yet." detail={editLists ? 'Add one below; List fields of the Epic setup choose from it.' : undefined} />}
    {editLists && <form className="inline-form" onSubmit={(event) => { event.preventDefault(); const name = newList.trim(); if (!name) return; if (file.lists.some((list) => list.name.toLowerCase() === name.toLowerCase())) { setResult({ tone: 'error', text: `A list named “${name}” exists.` }); return } change(upsertList(file, { id: newListId(file, name), name, values: [] })); setNewList('') }}>
      <input aria-label="New list name" placeholder="New list, e.g. Platform" value={newList} maxLength={60} onChange={(event) => setNewList(event.target.value)} /><button className="ghost">＋ Add list</button>
    </form>}
    {saveBar}
    {result && <Notice tone={result.tone}>{result.text}</Notice>}
  </Panel>

  return <Panel className="admin-section epic-setup" eyebrow="EPIC SETUP" title="Feature fields per Epic" info={<>The fields a new Feature under the Epic carries — New Feature and bulk creation, with or without a Feature setup. Each goes into the Feature's <strong>Description</strong> (“Label : value”), its <strong>Title</strong>, or both. <strong>If empty</strong>: Optional; Warn (created, and the empty field is listed); Block (New Feature waits for it; bulk creation skips that release). The <strong>title pattern</strong> uses the fields' placeholders, e.g. {'{program} | {service} | {version}'}; without one, the Title fields are joined with “ | ”. <strong>On-prem field</strong>: a Text field becomes a drop-down of that field's values in the fetched on-prem data, and is filled from the release's on-prem work item when there is one.</>}>
    {notices}
    {!canEdit && <p className="muted">View only: your role is not allowed “Edit the Epic setup”.</p>}
    <div className="query-toolbar">
      <label>Epic<select aria-label="Epic" value={chosen || ''} onChange={(event) => { setEpicId(Number(event.target.value)); setCopyTo([]) }}>{epics.length ? epics.map((epic) => <option key={epic.id} value={epic.id}>#{epic.id} {epic.title}{file.epics.some((item) => item.epicId === epic.id && item.fields.length) ? ' ●' : ''}</option>) : <option value="">Load the QMS-0025 board to list its Epics</option>}</select></label>
      <small className="muted">● has fields</small>
    </div>
    {chosen > 0 && <>
      {entry.fields.length ? <div className="azure-table"><table className="epic-fields"><thead><tr><th>Field</th><th>Type</th><th>Values</th><th>If empty</th><th>Goes into</th><th>On-prem field</th><th /></tr></thead><tbody>{entry.fields.map((field, index) => <tr key={index}>
        <td><input aria-label={`Field ${index + 1} label`} value={field.label} maxLength={60} disabled={!editFields} onChange={(event) => editField(index, { label: event.target.value })} /><small className="muted">{'{'}{fieldKey(field.label)}{'}'}</small></td>
        <td><select aria-label={`${field.label} type`} value={field.type} disabled={!editFields} onChange={(event) => editField(index, { type: event.target.value as EpicField['type'] })}>{fieldTypes.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}</select></td>
        <td>{field.type === 'list' ? <select aria-label={`${field.label} list`} value={field.list ?? ''} disabled={!editFields} onChange={(event) => editField(index, { list: event.target.value || undefined })}><option value="">Choose a list…</option>{file.lists.map((list) => <option key={list.id} value={list.id}>{list.name} ({list.values.length})</option>)}</select> : <small className="muted">typed</small>}</td>
        <td><select aria-label={`${field.label} if empty`} value={field.ifEmpty} disabled={!editFields} onChange={(event) => editField(index, { ifEmpty: event.target.value as EpicField['ifEmpty'] })}>{ifEmptyOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></td>
        <td><select aria-label={`${field.label} goes into`} value={field.into} disabled={!editFields} onChange={(event) => editField(index, { into: event.target.value as EpicField['into'] })}>{intoOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></td>
        <td><input aria-label={`${field.label} on-prem field`} value={field.source ?? ''} maxLength={255} placeholder="optional" disabled={!editFields} onChange={(event) => editField(index, { source: event.target.value || undefined })} /></td>
        <td className="nowrap">{editFields && <><button type="button" className="text-button" aria-label={`Move ${field.label} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" className="text-button" aria-label={`Move ${field.label} down`} disabled={index === entry.fields.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" className="text-button danger-text" aria-label={`Remove ${field.label}`} onClick={() => editEntry((next) => { next.fields.splice(index, 1) })}>✕</button></>}</td>
      </tr>)}</tbody></table></div> : <EmptyState title={`No fields for Epic #${chosen} yet.`} detail={editFields ? 'Add the fields its Features need (e.g. Program, Platform).' : undefined} />}
      {editFields && <div className="button-row"><button type="button" className="ghost" disabled={entry.fields.length >= maxEpicFields} onClick={() => editEntry((next) => { next.fields.push({ label: '', type: 'text', ifEmpty: 'optional', into: 'description' }) })}>＋ Add field</button></div>}
      {duplicateLabels.length > 0 && <Notice tone="warning">Each field needs its own label (not Feature or Month): {duplicateLabels.join(', ')}.</Notice>}
      <label className="epic-pattern">Title pattern<input aria-label="Title pattern" value={entry.titlePattern ?? ''} maxLength={255} disabled={!editFields} placeholder={entry.fields.filter((field) => field.into !== 'description').map((field) => `{${fieldKey(field.label)}}`).join(' | ') || 'Optional, e.g. {program} | {platform} | {feature}'} onChange={(event) => editEntry((next) => { if (event.target.value.trim()) next.titlePattern = event.target.value; else delete next.titlePattern })} /></label>
      {entry.fields.length > 0 && <div className="epic-preview"><strong>Example</strong><span>Title: {preview.title || '—'}</span><span>Description: {preview.lines.join(' · ') || '—'}</span>{(preview.blocked.length > 0 || preview.warned.length > 0) && <small className="muted">An empty {[...preview.blocked.map((label) => `${label} blocks`), ...preview.warned.map((label) => `${label} warns`)].join(', ')}.</small>}</div>}
      {editFields && entry.fields.length > 0 && <details className="epic-copy"><summary>Copy to Epics…</summary>
        <p className="muted">Gives the chosen Epics these fields and title pattern (replacing theirs), e.g. the Epics of one stream split by leader.</p>
        <div className="epic-copy-list">{epics.filter((epic) => epic.id !== chosen).map((epic) => <label key={epic.id} className="inline-check"><input type="checkbox" checked={copyTo.includes(epic.id)} onChange={(event) => setCopyTo((current) => event.target.checked ? [...current, epic.id] : current.filter((id) => id !== epic.id))} />#{epic.id} {epic.title}{file.epics.some((item) => item.epicId === epic.id && item.fields.length) && <Pill tone="warning">has fields</Pill>}</label>)}</div>
        <button type="button" className="ghost" disabled={!copyTo.length} onClick={() => { change(copyEpicFields(upsertEpicFields(file, { ...entry, epicTitle: entry.epicTitle || chosenTitle }), chosen, epics.filter((epic) => copyTo.includes(epic.id)))); setResult({ tone: 'success', text: `Copied to ${copyTo.length} Epic${copyTo.length === 1 ? '' : 's'} — Save to Git to keep it.` }); setCopyTo([]) }}>Copy to {copyTo.length || ''} Epic{copyTo.length === 1 ? '' : 's'}</button>
      </details>}
      {editFields && file.epics.some((item) => item.epicId === chosen) && <div className="button-row"><button type="button" className="text-button danger-text" onClick={() => { if (window.confirm(`Remove the Epic setup of #${chosen}? New Features under it get no extra fields.`)) change({ ...file, epics: file.epics.filter((item) => item.epicId !== chosen) }) }}>Remove this Epic's setup</button></div>}
    </>}
    {saveBar}
    {result && <Notice tone={result.tone}>{result.text}</Notice>}
  </Panel>
}
