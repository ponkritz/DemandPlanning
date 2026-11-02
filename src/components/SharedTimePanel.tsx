import { useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { capacityModel, regions, type CapacitySettings, type SharedTimeKind, type SharedTimeRule, type SharedTimeScope } from '../capacity'
import { formatHours, monthName } from '../format'
import { Modal, Notice, Panel, Pill } from './ui'

// Settings → Capacity: map an Epic or Feature (by ID) as regional / company holidays or as a common activity everyone
// (or one region) attends, such as PI Planning or an audit. Its month Tasks then apply to every person in scope:
// holidays as absence, activities as reserved time; both lower available capacity. Saved with the capacity settings,
// which go to Git with the planning data (Save to Git), so everyone gets the same mappings.
const kindLabel: Record<SharedTimeKind, string> = { holiday: 'Holidays (absence)', activity: 'Common activity (reserved time)' }
const scopeLabel = (scope: SharedTimeScope) => scope === 'everyone' ? 'Everyone' : `Everyone in ${scope}`

export function SharedTimePanel({ settings, items, month, onSave }: { settings: CapacitySettings; items: AzureWorkItem[]; month: string; onSave: (rules: SharedTimeRule[], detail: string) => void }) {
  const rules = settings.sharedTime ?? []
  const [id, setId] = useState('')
  const [kind, setKind] = useState<SharedTimeKind>('activity')
  const [scope, setScope] = useState<SharedTimeScope>('everyone')
  const [label, setLabel] = useState('')
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const byId = new Map(items.filter((item) => item.state.trim().toLowerCase() !== 'removed').map((item) => [item.id, item]))
  const typed = Number(id.trim().replace(/^#/, ''))
  const target = Number.isSafeInteger(typed) && typed > 0 ? byId.get(typed) : undefined
  // This month's effect of every mapping (hours per person in scope and how many people), from the capacity model.
  const model = capacityModel(items, month, settings)
  const effect = new Map(model.sharedTime.map((entry) => [entry.id, entry]))
  const automatic = model.sharedTime.filter((entry) => !rules.some((rule) => rule.id === entry.id))

  function add(event: React.FormEvent) {
    event.preventDefault()
    if (!Number.isSafeInteger(typed) || typed < 1) { setError('Enter the ID of the Epic or Feature that holds the month Tasks.'); return }
    if (target && target.workItemType !== 'Epic' && target.workItemType !== 'Feature') { setError(`#${typed} is a ${target.workItemType}: map its Feature or Epic instead.`); return }
    const rule: SharedTimeRule = { id: typed, kind, scope, ...(label.trim() ? { label: label.trim() } : {}) }
    const replaced = rules.some((entry) => entry.id === typed)
    onSave([...rules.filter((entry) => entry.id !== typed), rule], `${replaced ? 'Changed' : 'Mapped'} #${typed}${target ? ` “${target.title}”` : ''} as ${kindLabel[kind].toLowerCase()} for ${scopeLabel(scope).toLowerCase()}`)
    setId(''); setLabel(''); setError(''); setOpen(false)
  }
  // Add opens an empty pop-up; Edit opens it with the mapping's values (saving replaces it).
  function openEditor(rule?: SharedTimeRule) {
    setId(rule ? String(rule.id) : ''); setKind(rule?.kind ?? 'activity'); setScope(rule?.scope ?? 'everyone'); setLabel(rule?.label ?? ''); setError(''); setOpen(true)
  }
  function remove(rule: SharedTimeRule) {
    if (!window.confirm(`Remove the mapping of #${rule.id}? Its Tasks then count for their assignee again.`)) return
    onSave(rules.filter((entry) => entry.id !== rule.id), `Removed the mapping of #${rule.id}`)
  }

  return <Panel className="admin-section shared-time-panel" eyebrow="SHARED TIME" title="Holidays and common activities" info={<>Map the Epic or Feature that holds the month Tasks of regional holidays, or of a common activity such as PI Planning or an audit. Each of its month Tasks (“{monthName(month)} | PI Planning”) then applies to every person in scope instead of to its assignee: holidays count as absence, common activities as reserved time, and both lower available capacity. Hours per Task: Original Estimate, else Completed Work, else one working day ({settings.hoursPerDay}h). Scope “Everyone in a region” uses the region of each person in Settings → Resources. The nearest mapped Epic or Feature above a Task decides. A Feature under the absence Epic named like “Public Holidays - India” still counts as that region’s holidays without a mapping. Mappings are saved with the planning data in Git: press Save to Git so everyone gets them.</>}
    action={<Pill tone={rules.length ? 'open' : 'neutral'}>{rules.length} mapped</Pill>}>
    <div className="button-row"><button type="button" className="primary" onClick={() => openEditor()}>＋ Map an Epic or Feature…</button></div>
    {open && <Modal title={rules.some((entry) => entry.id === typed) ? `Change the mapping of #${typed}` : 'Map an Epic or Feature'} eyebrow="SETTINGS · HOLIDAYS AND COMMON ACTIVITIES" wide form onClose={() => setOpen(false)}>
      <form className="shared-time-form" onSubmit={add}>
        <label>Epic or Feature ID<input inputMode="numeric" value={id} placeholder="e.g. 37810" onChange={(event) => { setId(event.target.value); setError('') }} /><small className={target || !id.trim() ? 'muted' : 'warning-text'}>{!id.trim() ? 'Its month Tasks hold the hours.' : target ? `${target.workItemType} · ${target.title}` : 'Not in the fetched data (can still be mapped)'}</small></label>
        <label>Counts as<select value={kind} onChange={(event) => setKind(event.target.value as SharedTimeKind)}><option value="holiday">{kindLabel.holiday}</option><option value="activity">{kindLabel.activity}</option></select></label>
        <label>Applies to<select value={scope} onChange={(event) => setScope(event.target.value as SharedTimeScope)}><option value="everyone">Everyone</option>{regions.map((region) => <option key={region} value={region}>Everyone in {region}</option>)}</select></label>
        <label>Name (optional)<input value={label} maxLength={120} placeholder={target?.title ?? 'e.g. PI Planning'} onChange={(event) => setLabel(event.target.value)} /></label>
        <div className="modal-actions"><button type="button" className="ghost" onClick={() => setOpen(false)}>Cancel</button><button className="primary">{rules.some((entry) => entry.id === typed) ? 'Update mapping' : 'Add mapping'}</button></div>
      </form>
      {error && <Notice tone="error">{error}</Notice>}
    </Modal>}
    {rules.length || automatic.length ? <div className="azure-table"><table><thead><tr><th>Epic / Feature</th><th>Counts as</th><th>Applies to</th><th>{monthName(month)}</th><th /></tr></thead><tbody>
      {rules.map((rule) => { const item = byId.get(rule.id), now = effect.get(rule.id); return <tr key={rule.id}>
        <td>{item ? <a href={item.url} target="_blank" rel="noreferrer">#{rule.id}</a> : `#${rule.id}`} <strong className="inline">{rule.label || item?.title || 'Not in the fetched data'}</strong>{item && <small>{item.workItemType}{rule.label ? ` · ${item.title}` : ''}</small>}</td>
        <td><Pill tone={rule.kind === 'holiday' ? 'info' : 'warning'}>{rule.kind === 'holiday' ? 'Holidays' : 'Common activity'}</Pill></td>
        <td>{scopeLabel(rule.scope)}</td>
        <td>{now ? <>{formatHours(now.hours)}h each<small>{now.tasks} Task{now.tasks === 1 ? '' : 's'} · {now.people} {now.people === 1 ? 'person' : 'people'}</small></> : <span className="muted">No Task this month</span>}</td>
        <td><div className="button-row nowrap"><button type="button" className="ghost" onClick={() => openEditor(rule)}>Edit</button><button type="button" className="text-button" onClick={() => remove(rule)}>Remove</button></div></td>
      </tr> })}
      {automatic.map((entry) => <tr key={`auto-${entry.id}`} className="muted-row">
        <td><a href={entry.item.url} target="_blank" rel="noreferrer">#{entry.id}</a> <strong className="inline">{entry.title}</strong><small>Found by its name under the absence Epic · map it to change it</small></td>
        <td><Pill tone="info">Holidays</Pill></td><td>{scopeLabel(entry.scope)}</td>
        <td>{formatHours(entry.hours)}h each<small>{entry.tasks} Task{entry.tasks === 1 ? '' : 's'} · {entry.people} {entry.people === 1 ? 'person' : 'people'}</small></td><td />
      </tr>)}
    </tbody></table></div> : <p className="muted">Nothing mapped yet. Map, for example, the Feature holding “{monthName(month)} | PI Planning” as a common activity for everyone.</p>}
  </Panel>
}
