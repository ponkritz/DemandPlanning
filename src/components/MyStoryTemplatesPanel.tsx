import { useState } from 'react'
import type { AzureWorkItem } from '../domain'
import type { EpicSetupFile, StoryTemplateItem } from '../epicSetup'
import { maxMyDescription, maxMyStoryTemplates, newMyTemplateId } from '../myStoryTemplates'
import { useMyStoryTemplates } from '../useMyStoryTemplates'
import { DataTable, type DataColumn } from './DataTable'
import { TemplateEditor } from './StoryTemplatesPanel'
import { EmptyState, Modal, Notice, Panel, WriteBlocked } from './ui'

// STT-04, STT-05: Admin → Feature & PI setup → User Story templates → My templates — everyone's own User Story
// templates (also people whose role may only read the shared ones), with the same fields as a shared template. Kept in
// this browser only (STT-06); offered after the shared ones, labelled "Mine", wherever a template starts a User Story (STT-07).
export function MyStoryTemplatesPanel({ email, viewingAs, items, epicFile }: { email: string; viewingAs: boolean; items: AzureWorkItem[]; epicFile: EpicSetupFile | null }) {
  const mine = useMyStoryTemplates(email, viewingAs)
  const [editing, setEditing] = useState<StoryTemplateItem | null>(null)
  const [removing, setRemoving] = useState<StoryTemplateItem | null>(null)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const epics = items.filter((item) => item.workItemType === 'Epic' && item.state.toLowerCase() !== 'removed').sort((a, b) => a.title.localeCompare(b.title))
  const epicName = (id: number) => epics.find((epic) => epic.id === id)?.title ?? epicFile?.epics.find((entry) => entry.epicId === id)?.epicTitle ?? ''
  const knownValues = [...new Set((epicFile?.lists ?? []).flatMap((list) => list.values))]
  const full = mine.templates.length >= maxMyStoryTemplates
  const blocked = mine.blocked || (full ? `You keep ${maxMyStoryTemplates} templates of your own, the most allowed: remove one first.` : '')
  const startNew = () => { setResult(''); setError(''); setEditing({ id: newMyTemplateId(mine.templates, 'story'), title: '', description: '', epics: [], classes: [] }) }
  const save = (item: StoryTemplateItem) => {
    const known = mine.templates.some((entry) => entry.id === item.id)
    const id = known ? item.id : newMyTemplateId(mine.templates, item.title)
    try { mine.save([...mine.templates.filter((entry) => entry.id !== item.id), { ...item, id }]) } catch (failure) { return failure instanceof Error ? failure.message : String(failure) }
    setEditing(null); setResult(`${known ? 'Saved' : 'Added'} “${item.title}” — in this browser only.`)
  }
  const remove = () => {
    if (!removing) return
    try { mine.save(mine.templates.filter((entry) => entry.id !== removing.id)); setResult(`Removed “${removing.title}”.`); setError('') } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    setRemoving(null)
  }
  const tags = (item: StoryTemplateItem) => item.epics.map((id) => `#${id} ${epicName(id)}`.trim()).join(', ')
  const columns: DataColumn<StoryTemplateItem>[] = [
    { id: 'title', label: 'Title', value: (item) => item.title },
    { id: 'description', label: 'Description', value: (item) => item.description, render: (item) => <span className="stt-description">{item.description || <span className="muted">—</span>}</span> },
    { id: 'epics', label: 'Epics', value: (item) => tags(item) || 'Any Epic', render: (item) => item.epics.length ? tags(item) : <span className="muted">Any Epic</span> },
    { id: 'classes', label: 'Release Classification', value: (item) => item.classes.join(', ') || 'Any value', render: (item) => item.classes.length ? item.classes.join(', ') : <span className="muted">Any value</span> },
    { id: 'actions', label: 'Actions', sortable: false, export: false, render: (item) => <span className="button-row nowrap"><button type="button" className="ghost" aria-label={`Edit my template ${item.title}`} disabled={Boolean(mine.blocked)} title={mine.blocked || undefined} onClick={() => { setResult(''); setError(''); setEditing(item) }}>Edit…</button><button type="button" className="text-button danger-text" aria-label={`Remove my template ${item.title}`} disabled={Boolean(mine.blocked)} title={mine.blocked || undefined} onClick={() => { setResult(''); setError(''); setRemoving(item) }}>Remove…</button></span> },
  ]
  const newButton = <button type="button" className="ghost" disabled={Boolean(blocked)} title={blocked || undefined} onClick={startNew}>＋ New template…</button>

  return <Panel className="admin-section my-story-templates" eyebrow="ONLY YOU · THIS BROWSER" title="My templates" info="User Story templates of your own: the same fields as a shared template. Only you see them — they are kept in this browser on this computer, not in Git, a backup or SharePoint — and the New User Story form and Your own User Story on New Feature offer them after the shared ones, labelled “Mine”. The shared templates above stay as they are.">
    <WriteBlocked reason={blocked} />
    {mine.templates.length ? <DataTable id="my-story-templates" columns={columns} rows={mine.templates} rowKey={(item) => item.id} exportName="My User Story templates" defaultSort={{ id: 'title' }}
      toolbar={newButton} status={`${mine.templates.length} of ${maxMyStoryTemplates} templates of your own`} empty={<EmptyState title="No template of your own." />} />
      : <><EmptyState title="No templates of your own yet." detail={mine.blocked ? undefined : 'Add one with ＋ New template…: only you see it, in this browser.'} />{newButton}</>}
    {editing && <TemplateEditor item={editing} epics={epics} epicName={epicName} knownValues={knownValues} eyebrow="MY TEMPLATES · ONLY YOU" maxDescription={maxMyDescription} onCancel={() => setEditing(null)} onSave={save} />}
    {removing && <Modal title={`Remove “${removing.title}”?`} eyebrow="MY TEMPLATES · ONLY YOU" onClose={() => setRemoving(null)} form={false}>
      <form onSubmit={(event) => { event.preventDefault(); remove() }}>
        <p>Remove your template <strong>{removing.title}</strong> from this browser? User Stories already created from it keep their title and description; it cannot be brought back.</p>
        <div className="modal-actions"><button type="button" className="ghost" onClick={() => setRemoving(null)}>Cancel</button><button className="danger-button">Remove template</button></div>
      </form>
    </Modal>}
    {result && <Notice tone="success">{result}</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
  </Panel>
}
