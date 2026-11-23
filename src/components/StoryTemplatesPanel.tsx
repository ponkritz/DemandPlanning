import { useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { emptyEpicSetup, newStoryTemplateId, parseEpicSetup, serializeEpicSetup, upsertStoryTemplate, type StoryTemplateItem } from '../epicSetup'
import { templateUses } from '../featureSetup'
import type { EpicSetupStore } from '../useEpicSetup'
import type { FeatureSetup } from '../useFeatureSetup'
import type { GitStorage } from '../useGitStorage'
import { DataTable, type DataColumn } from './DataTable'
import { EmptyState, Modal, Notice, Panel } from './ui'

// STT-01 Admin → Epic & Feature setup → User Story templates: the shared library of User Stories (title and description)
// tagged with the Epics and Release Classification values they are offered for. Setup per Epic picks them; a picked
// story stays linked (STT-02), so editing a template here changes every Epic that uses it. Saved with the Epic setup.
export function StoryTemplatesPanel({ setup, featureSetup, git, items, canEdit }: { setup: EpicSetupStore; featureSetup: FeatureSetup; git: GitStorage; items: AzureWorkItem[]; canEdit: boolean }) {
  const [find, setFind] = useState('')
  const [commit, setCommit] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  // STT-03: the templates are a list; Edit (or ＋ New template) opens one template in a pop-up.
  const [editing, setEditing] = useState<StoryTemplateItem | null>(null)
  const file = setup.draft ?? setup.file ?? emptyEpicSetup()
  const editable = git.connected && !git.readOnly && !git.isSample && canEdit
  const dirty = Boolean(setup.draft) && serializeEpicSetup(setup.draft!) !== serializeEpicSetup(setup.file ?? emptyEpicSetup())
  const change = (item: StoryTemplateItem) => { setup.setDraft(upsertStoryTemplate(file, item)); setResult(null) }
  const epics = items.filter((item) => item.workItemType === 'Epic' && item.state.toLowerCase() !== 'removed').sort((a, b) => a.title.localeCompare(b.title))
  const epicName = (id: number) => epics.find((epic) => epic.id === id)?.title ?? file.epics.find((entry) => entry.epicId === id)?.epicTitle ?? ''
  // Every Release Classification value known: the values of every value list (there are no built-in ones, DPF-09).
  const knownValues = [...new Set(file.lists.flatMap((list) => list.values))]
  const usedBy = (id: string) => templateUses(featureSetup.shared, id) + templateUses(featureSetup.personal, id)
  const templates = [...(file.storyTemplates ?? [])].sort((a, b) => a.title.localeCompare(b.title))
    .filter((item) => !find.trim() || `${item.title} ${item.description} ${item.classes.join(' ')}`.toLowerCase().includes(find.trim().toLowerCase()))

  const remove = (item: StoryTemplateItem) => {
    const uses = usedBy(item.id)
    if (uses && !window.confirm(`“${item.title}” is linked in ${uses} place${uses === 1 ? '' : 's'}. Remove it? Those stories keep their last copy.`)) return
    setup.setDraft({ ...file, storyTemplates: (file.storyTemplates ?? []).filter((entry) => entry.id !== item.id) }); setResult(null)
  }
  const columns: DataColumn<StoryTemplateItem>[] = [
    { id: 'title', label: 'Title', value: (item) => item.title || '(no title)' },
    { id: 'description', label: 'Description', value: (item) => item.description, render: (item) => <span className="stt-description">{item.description || <span className="muted">—</span>}</span> },
    { id: 'epics', label: 'Epics', value: (item) => item.epics.map((id) => `#${id} ${epicName(id)}`.trim()).join(', ') || 'Any Epic', render: (item) => item.epics.length ? item.epics.map((id) => `#${id} ${epicName(id)}`.trim()).join(', ') : <span className="muted">Any Epic</span> },
    { id: 'classes', label: 'Release Classification', value: (item) => item.classes.join(', ') || 'Any value', render: (item) => item.classes.length ? item.classes.join(', ') : <span className="muted">Any value</span> },
    { id: 'uses', label: 'Linked in', align: 'right', value: (item) => usedBy(item.id), render: (item) => { const uses = usedBy(item.id); return uses ? `${uses} place${uses === 1 ? '' : 's'}` : <span className="muted">Not used</span> } },
    ...(editable ? [{ id: 'actions', label: 'Actions', sortable: false, export: false, render: (item: StoryTemplateItem) => <span className="button-row nowrap"><button type="button" className="ghost" aria-label={`Edit ${item.title || 'template'}`} onClick={() => setEditing(item)}>Edit</button><button type="button" className="text-button danger-text" aria-label={`Remove ${item.title || 'template'}`} onClick={() => remove(item)}>Remove</button></span> } as DataColumn<StoryTemplateItem>] : []),
  ]

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!setup.draft) return
    const blank = (setup.draft.storyTemplates ?? []).filter((item) => !item.title.trim())
    if (blank.length) { setResult({ tone: 'error', text: 'Not saved: every template needs a title.' }); return }
    setBusy(true)
    try { await setup.save(parseEpicSetup(serializeEpicSetup(setup.draft)), commit.trim() || 'Update the User Story templates'); setCommit(''); setResult({ tone: 'success', text: 'Saved to Git.' }) }
    catch (failure) { setResult({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }) }
    finally { setBusy(false) }
  }

  return <Panel className="admin-section story-templates" eyebrow="EPIC SETUP" title="User Story templates" info="User Stories to reuse: a title (placeholders such as {service} {version} or {feature} allowed) and a description, tagged with the Epics and Release Classification values they are offered for (no tag = any). In Setup per Epic, “＋ Add from templates” picks them; a picked story stays linked, so a change here applies to every Epic that uses it. New Feature ticks them by default.">
    {!git.connected && <Notice tone="info">Connect Git storage (Admin → Data &amp; sharing) to change the templates; the ones last loaded here are shown.</Notice>}
    {git.connected && !editable && <Notice tone="info">{git.readOnly ? 'View only: your Git token can read but not save.' : 'View only: your role is not allowed “Edit Epic setup value lists and User Story templates”.'}</Notice>}
    {(file.storyTemplates ?? []).length ? <DataTable id="story-templates" columns={columns} rows={templates} rowKey={(item) => item.id} exportName="User Story templates" defaultSort={{ id: 'title' }}
      toolbar={<><input className="search" type="search" aria-label="Search templates" placeholder="Search templates" value={find} onChange={(event) => setFind(event.target.value)} />{editable && <button type="button" className="ghost" onClick={() => setEditing({ id: newStoryTemplateId(file, 'story'), title: '', description: '', epics: [], classes: [] })}>＋ New template</button>}</>}
      status={`${templates.length} of ${(file.storyTemplates ?? []).length} templates`}
      empty={<EmptyState title="No template matches." />} />
      : <><EmptyState title="No User Story templates yet." detail={editable ? 'Add one with ＋ New template, or use “Save as template” on a User Story in Setup per Epic.' : undefined} />{editable && <button type="button" className="ghost" onClick={() => setEditing({ id: newStoryTemplateId(file, 'story'), title: '', description: '', epics: [], classes: [] })}>＋ New template</button>}</>}
    {editing && <TemplateEditor item={editing} epics={epics} epicName={epicName} knownValues={knownValues} onCancel={() => setEditing(null)} onSave={(item) => { change(item); setEditing(null) }} />}
    {editable && dirty && <form className="git-bar git-bar-dirty" onSubmit={save}>
      <span><strong>Unsaved template changes</strong> — not yet in Git</span>
      <input aria-label="Change description" value={commit} onChange={(event) => setCommit(event.target.value)} placeholder="Describe the change" />
      <button type="button" className="ghost" disabled={busy} onClick={() => { setup.setDraft(null); setResult(null) }}>Discard</button>
      <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save to Git'}</button>
    </form>}
    {result && <Notice tone={result.tone}>{result.text}</Notice>}
  </Panel>
}

// STT-03: one template in a pop-up — title (required), description and its tags; Save puts it in the unsaved changes.
function TemplateEditor({ item, epics, epicName, knownValues, onCancel, onSave }: { item: StoryTemplateItem; epics: AzureWorkItem[]; epicName: (id: number) => string; knownValues: string[]; onCancel: () => void; onSave: (item: StoryTemplateItem) => void }) {
  const [draft, setDraft] = useState(item)
  return <Modal eyebrow="EPIC SETUP · USER STORY TEMPLATE" title={item.title ? 'Edit template' : 'New template'} onClose={onCancel}>
    <form onSubmit={(event) => { event.preventDefault(); if (draft.title.trim()) onSave({ ...draft, title: draft.title.trim() }) }}>
      <label>Title<input aria-label="Template title" value={draft.title} maxLength={255} required placeholder="e.g. SFV : Review of Deliverables ({service} {version})" onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <label>Description (optional)<textarea aria-label="Template description" rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      <TagPicker label="Epics" empty="Any Epic" tags={draft.epics.map((id) => ({ key: String(id), text: `#${id} ${epicName(id)}`.trim() }))} options={epics.filter((epic) => !draft.epics.includes(epic.id)).map((epic) => ({ key: String(epic.id), text: `#${epic.id} ${epic.title}` }))} disabled={false} onAdd={(key) => setDraft({ ...draft, epics: [...draft.epics, Number(key)] })} onRemove={(key) => setDraft({ ...draft, epics: draft.epics.filter((id) => String(id) !== key) })} />
      <TagPicker label="Release Classification" empty="Any value" tags={draft.classes.map((value) => ({ key: value, text: value }))} options={knownValues.filter((value) => !draft.classes.some((tag) => tag.toLowerCase() === value.toLowerCase())).map((value) => ({ key: value, text: value }))} disabled={false} onAdd={(key) => setDraft({ ...draft, classes: [...draft.classes, key] })} onRemove={(key) => setDraft({ ...draft, classes: draft.classes.filter((value) => value !== key) })} />
      {!draft.title.trim() && <small className="muted">A template needs a title before it can be saved.</small>}
      <div className="modal-actions"><button type="button" className="ghost" onClick={onCancel}>Cancel</button><button className="primary" disabled={!draft.title.trim()}>Save</button></div>
    </form>
  </Modal>
}

function TagPicker({ label, empty, tags, options, disabled, onAdd, onRemove }: { label: string; empty: string; tags: { key: string; text: string }[]; options: { key: string; text: string }[]; disabled: boolean; onAdd: (key: string) => void; onRemove: (key: string) => void }) {
  return <div className="stt-tagpicker"><small>{label}</small>
    <div className="stt-chips">{tags.length ? tags.map((tag) => <span key={tag.key} className="stt-chip">{tag.text}{!disabled && <button type="button" aria-label={`Remove ${label} ${tag.text}`} onClick={() => onRemove(tag.key)}>✕</button>}</span>) : <span className="muted">{empty}</span>}</div>
    {!disabled && options.length > 0 && <select aria-label={`Add ${label}`} value="" onChange={(event) => { if (event.target.value) onAdd(event.target.value) }}><option value="">＋ Add…</option>{options.map((option) => <option key={option.key} value={option.key}>{option.text}</option>)}</select>}
  </div>
}
