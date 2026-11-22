import { useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { emptyEpicSetup, newStoryTemplateId, parseEpicSetup, serializeEpicSetup, upsertStoryTemplate, type StoryTemplateItem } from '../epicSetup'
import { templateUses } from '../featureSetup'
import type { EpicSetupStore } from '../useEpicSetup'
import type { FeatureSetup } from '../useFeatureSetup'
import type { GitStorage } from '../useGitStorage'
import { EmptyState, Notice, Panel } from './ui'

// STT-01 Admin → Epic & Feature setup → User Story templates: the shared library of User Stories (title and description)
// tagged with the Epics and Release Classification values they are offered for. Setup per Epic picks them; a picked
// story stays linked (STT-02), so editing a template here changes every Epic that uses it. Saved with the Epic setup.
export function StoryTemplatesPanel({ setup, featureSetup, git, items, canEdit }: { setup: EpicSetupStore; featureSetup: FeatureSetup; git: GitStorage; items: AzureWorkItem[]; canEdit: boolean }) {
  const [find, setFind] = useState('')
  const [commit, setCommit] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
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
    <div className="query-toolbar"><input className="search" type="search" aria-label="Search templates" placeholder="Search templates" value={find} onChange={(event) => setFind(event.target.value)} />
      {editable && <button type="button" className="ghost" onClick={() => change({ id: newStoryTemplateId(file, 'story'), title: '', description: '', epics: [], classes: [] })}>＋ New template</button>}</div>
    {templates.length ? <div className="stt-list">{templates.map((item) => { const uses = usedBy(item.id); return <article key={item.id} className="stt-card" aria-label={`Template ${item.title || '(no title)'}`}>
      <label>Title<input aria-label="Template title" value={item.title} maxLength={255} readOnly={!editable} placeholder="e.g. SFV : Review of Deliverables ({service} {version})" onChange={(event) => change({ ...item, title: event.target.value })} /></label>
      <label>Description<textarea aria-label="Template description" rows={2} value={item.description} readOnly={!editable} onChange={(event) => change({ ...item, description: event.target.value })} /></label>
      <div className="stt-tags">
        <TagPicker label="Epics" empty="Any Epic" tags={item.epics.map((id) => ({ key: String(id), text: `#${id} ${epicName(id)}`.trim() }))} options={epics.filter((epic) => !item.epics.includes(epic.id)).map((epic) => ({ key: String(epic.id), text: `#${epic.id} ${epic.title}` }))} disabled={!editable} onAdd={(key) => change({ ...item, epics: [...item.epics, Number(key)] })} onRemove={(key) => change({ ...item, epics: item.epics.filter((id) => String(id) !== key) })} />
        <TagPicker label="Release Classification" empty="Any value" tags={item.classes.map((value) => ({ key: value, text: value }))} options={knownValues.filter((value) => !item.classes.some((tag) => tag.toLowerCase() === value.toLowerCase())).map((value) => ({ key: value, text: value }))} disabled={!editable} onAdd={(key) => change({ ...item, classes: [...item.classes, key] })} onRemove={(key) => change({ ...item, classes: item.classes.filter((value) => value !== key) })} />
      </div>
      <div className="stt-foot"><small className="muted">{uses ? `Linked in ${uses} place${uses === 1 ? '' : 's'} of the saved Feature setup` : 'Not used in the saved Feature setup'}</small>
        {editable && <button type="button" className="text-button danger-text" onClick={() => { if (uses && !window.confirm(`“${item.title}” is linked in ${uses} place${uses === 1 ? '' : 's'}. Remove it? Those stories keep their last copy.`)) return; setup.setDraft({ ...file, storyTemplates: (file.storyTemplates ?? []).filter((entry) => entry.id !== item.id) }); setResult(null) }}>Remove</button>}</div>
    </article> })}</div> : <EmptyState title={find.trim() ? 'No template matches.' : 'No User Story templates yet.'} detail={editable && !find.trim() ? 'Add one here, or use “Save as template” on a User Story in Setup per Epic.' : undefined} />}
    {editable && dirty && <form className="git-bar git-bar-dirty" onSubmit={save}>
      <span><strong>Unsaved template changes</strong> — not yet in Git</span>
      <input aria-label="Change description" value={commit} onChange={(event) => setCommit(event.target.value)} placeholder="Describe the change" />
      <button type="button" className="ghost" disabled={busy} onClick={() => { setup.setDraft(null); setResult(null) }}>Discard</button>
      <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save to Git'}</button>
    </form>}
    {result && <Notice tone={result.tone}>{result.text}</Notice>}
  </Panel>
}

function TagPicker({ label, empty, tags, options, disabled, onAdd, onRemove }: { label: string; empty: string; tags: { key: string; text: string }[]; options: { key: string; text: string }[]; disabled: boolean; onAdd: (key: string) => void; onRemove: (key: string) => void }) {
  return <div className="stt-tagpicker"><small>{label}</small>
    <div className="stt-chips">{tags.length ? tags.map((tag) => <span key={tag.key} className="stt-chip">{tag.text}{!disabled && <button type="button" aria-label={`Remove ${label} ${tag.text}`} onClick={() => onRemove(tag.key)}>✕</button>}</span>) : <span className="muted">{empty}</span>}</div>
    {!disabled && options.length > 0 && <select aria-label={`Add ${label}`} value="" onChange={(event) => { if (event.target.value) onAdd(event.target.value) }}><option value="">＋ Add…</option>{options.map((option) => <option key={option.key} value={option.key}>{option.text}</option>)}</select>}
  </div>
}
