import type { ReactNode } from 'react'
import { EmptyState } from './ui'
import { hasOptions, maxDescription, onDemandTypes, type ColumnDraft, type OnDemandType } from '../onDemand'

// OND-05, OND-06 (and PIR-22): one editor for a list of columns or fields — the On-Demand pages' "Set up columns" and the
// PI Review form setup share it, so a change here changes both. Per entry: its name, type (of the types allowed),
// Required, ↑ ↓ ✕, an optional description, and for a Dropdown or Multi-select its options (add, rename, reorder,
// remove); a slot for what a use adds per entry (the default currency of a Currency column; the heading and the default
// of a PI Review field). An entry can be locked in part (a built-in field keeps its type, Move to next PI its name and
// options and cannot be removed). The words ("column", "field") come from the use.
export type ColumnChange = 'edit' | 'move' | 'remove' | 'add'
export interface ColumnLock { name?: boolean; type?: boolean; remove?: boolean; options?: boolean; required?: boolean; why?: string }
export interface ColumnListWords { one: string; One: string; many: string }
const columnWords: ColumnListWords = { one: 'column', One: 'Column', many: 'columns' }
export interface DescriptionField { label: string; aria: (index: number) => string; placeholder?: string; help: ReactNode; max: number }
const columnDescription: DescriptionField = {
  label: 'Description (optional)', aria: (index) => `Column ${index + 1} description`, max: maxDescription,
  placeholder: 'How or what to fill, e.g. “The cost in the supplier’s currency, without VAT.”',
  help: <>Shown under the field in the row drawer and behind ⓘ on the column heading; up to {maxDescription} characters.</>,
}
export function ColumnListEditor({ drafts, onChange, newDraft, types = onDemandTypes, words = columnWords, lock, extra, description = columnDescription, addNote, max, emptyDetail }: {
  drafts: ColumnDraft[]; onChange: (drafts: ColumnDraft[], change: ColumnChange) => void; newDraft: () => ColumnDraft
  types?: { key: OnDemandType; label: string }[]; words?: ColumnListWords; lock?: (draft: ColumnDraft) => ColumnLock | undefined
  extra?: (draft: ColumnDraft, index: number, edit: (change: Partial<ColumnDraft>) => void) => ReactNode
  description?: DescriptionField; addNote?: ReactNode; max?: number; emptyDetail?: string
}) {
  const edit = (index: number, change: Partial<ColumnDraft>) => onChange(drafts.map((draft, at) => at === index ? { ...draft, ...change } : draft), 'edit')
  const move = <T,>(list: T[], at: number, by: number) => { const to = at + by; if (to < 0 || to >= list.length) return list; const next = [...list];[next[at], next[to]] = [next[to], next[at]]; return next }
  const nameOf = (draft: ColumnDraft, index: number) => draft.name || `${words.one} ${index + 1}`
  return <>
    {!drafts.length && <EmptyState title={`No ${words.many} yet.`} detail={emptyDetail ?? `Add the first one with ＋ Add ${words.one}.`} />}
    <ol className="od-columns">{drafts.map((draft, index) => { const locked = lock?.(draft) ?? {}; return <li key={draft.id} className="od-column">
      <div className="od-column-head">
        <label>Name<input aria-label={`${words.One} ${index + 1} name`} autoFocus={index === drafts.length - 1 && draft.isNew} required maxLength={120} value={draft.name} disabled={locked.name} title={locked.name ? locked.why : undefined} onChange={(event) => edit(index, { name: event.target.value })} /></label>
        <label>Type<select aria-label={`${words.One} ${index + 1} type`} value={draft.type} disabled={locked.type} title={locked.type ? locked.why : undefined} onChange={(event) => edit(index, { type: event.target.value as ColumnDraft['type'] })}>{types.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}</select></label>
        <label className="check"><input type="checkbox" checked={draft.required} disabled={locked.required} onChange={(event) => edit(index, { required: event.target.checked })} />Required</label>
        <span className="button-row od-column-moves">
          <button type="button" className="ghost" aria-label={`Move ${draft.name || `${words.one} ${index + 1}`} up`} disabled={index === 0} onClick={() => onChange(move(drafts, index, -1), 'move')}>↑</button>
          <button type="button" className="ghost" aria-label={`Move ${draft.name || `${words.one} ${index + 1}`} down`} disabled={index === drafts.length - 1} onClick={() => onChange(move(drafts, index, 1), 'move')}>↓</button>
          <button type="button" className="text-button danger-text" aria-label={`Remove ${words.one} ${draft.name || index + 1}`} disabled={locked.remove} title={locked.remove ? locked.why : undefined} onClick={() => onChange(drafts.filter((_, at) => at !== index), 'remove')}>✕</button>
        </span>
      </div>
      {extra?.(draft, index, (change) => edit(index, change))}
      <label className="od-description">{description.label}<textarea aria-label={description.aria(index)} rows={2} maxLength={description.max} value={draft.description ?? ''} placeholder={description.placeholder} onChange={(event) => edit(index, { description: event.target.value })} /><small>{description.help}</small></label>
      {hasOptions(draft.type) && <div className="od-options"><small>Options of “{nameOf(draft, index)}”</small>
        {draft.options.map((option, at) => <div key={at} className="od-option">
          <input aria-label={`${draft.name || `${words.One} ${index + 1}`} option ${at + 1}`} maxLength={120} value={option.label} disabled={locked.options} onChange={(event) => edit(index, { options: draft.options.map((entry, i) => i === at ? { ...entry, label: event.target.value } : entry) })} />
          <button type="button" className="ghost" aria-label={`Move option ${option.label || at + 1} up`} disabled={locked.options || at === 0} onClick={() => edit(index, { options: move(draft.options, at, -1) })}>↑</button>
          <button type="button" className="ghost" aria-label={`Move option ${option.label || at + 1} down`} disabled={locked.options || at === draft.options.length - 1} onClick={() => edit(index, { options: move(draft.options, at, 1) })}>↓</button>
          <button type="button" className="text-button danger-text" aria-label={`Remove option ${option.label || at + 1}`} disabled={locked.options} onClick={() => edit(index, { options: draft.options.filter((_, i) => i !== at) })}>✕</button>
        </div>)}
        {!locked.options && <button type="button" className="text-button" onClick={() => edit(index, { options: [...draft.options, { label: '' }] })}>＋ Add option</button>}
      </div>}
    </li> })}</ol>
    <div><button type="button" className="ghost" disabled={max != null && drafts.length >= max} title={max != null && drafts.length >= max ? `At most ${max} ${words.many}.` : undefined} onClick={() => onChange([...drafts, newDraft()], 'add')}>＋ Add {words.one}</button>{addNote && <> {addNote}</>}</div>
  </>
}
