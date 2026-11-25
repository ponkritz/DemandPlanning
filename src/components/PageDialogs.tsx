import { useContext, useState } from 'react'
import { MultiSelect } from './MultiSelect'
import { ownerOptions, ownersFromList } from '../ownerPeople'
import { OwnerPeopleContext } from '../usePageNames'
import { usePageNameClash } from '../usePageNames'
import { defaultIcon, findGroup, groupNameError, hideReason, groupsForAdding, menuGroups, moveReason, pageIcons, pageKinds, placementOf, type MenuLayout, type PageKind, type Viewer } from '../menuLayout'
import type { NewPage } from '../useMenuLayout'
import { Modal, Notice } from './ui'

// PGB-05…PGB-08: the pop-ups of the page builder (UI-STANDARDS §3/§4), shared by Admin → Pages & menu, the ⋯ of a menu
// group and ＋ Add page… on a page: add a page, edit a page's place in the menu, add or edit a group.

const newGroupKey = '@new'
// PGB-15, PGB-16: the page name field — the clash with another page's name (usePageNameClash) is shown at the field while
// it is typed, and the form's main button stays disabled while it clashes.
export function PageNameField({ value, onChange, clash }: { value: string; onChange: (value: string) => void; clash: string }) {
  return <div className="field-with-error"><label>Page name<input autoFocus required maxLength={80} aria-invalid={clash ? true : undefined} aria-describedby={clash ? 'page-name-clash' : undefined} value={value} onChange={(event) => onChange(event.target.value)} /></label>{clash && <small id="page-name-clash" className="field-error" role="alert">{clash}</small>}</div>
}
// PGB-18: co-owners picked from the people the app knows (Admin → People & roles → People), type to filter; the name is
// shown, the work email kept. Co-owners not in that list stay chosen ("not in Azure DevOps"); people without a work
// email are listed disabled with the reason; at most 50.
const ownersHelp = 'Pick people from Admin → People & roles → People (Azure DevOps team members and assignees); their work email is kept.'
// TVL-11: also the co-owners of the Tool Validations master list (disabled with its reason for anyone but a Tool Owner).
export function OwnersField({ label, value, onChange, help, disabled = '' }: { label: string; value: string[]; onChange: (value: string[]) => void; help: string; disabled?: string }) {
  const options = ownerOptions(useContext(OwnerPeopleContext), value)
  const reasons = new Map(options.map((option) => [option.key, option.disabled]))
  return <div className="pgb-owners"><MultiSelect label={label} search selectAll={false} emptyLabel="Nobody" disabled={Boolean(disabled)} title={disabled || undefined} options={options.map((option) => [option.key, option.label])} value={value} onChange={(keys) => onChange(ownersFromList(keys))} disabledReason={(key) => reasons.get(key) ?? ''} /><small>{disabled || help} {disabled ? '' : ownersHelp}</small></div>
}
// DSH-01: an On-Demand Dashboard holds blocks, a table page rows — a page keeps its family: Edit offers Table and Table + Insights
// for a table page and On-Demand Dashboard only for a dashboard; the other choice is disabled with the reason.
const lockedReason = (locked: 'dashboard' | 'table' | undefined, key: PageKind) => locked === 'dashboard' && key !== 'dashboard' ? 'An On-Demand Dashboard stays a dashboard: it holds blocks, not rows. Add a Table page instead.' : locked === 'table' && key === 'dashboard' ? 'A table page cannot become an On-Demand Dashboard: its rows would be hidden. Add an On-Demand Dashboard page instead.' : ''
export function KindField({ value, onChange, locked, hideStreamNote = false }: { value: PageKind; onChange: (kind: PageKind) => void; locked?: 'dashboard' | 'table'; hideStreamNote?: boolean }) {
  return <fieldset className="pgb-kinds"><legend>Page type</legend>
    {pageKinds.map((kind) => { const reason = lockedReason(locked, kind.key); return <div key={kind.key} className="pgb-kind"><label className="check" title={reason || undefined}><input type="radio" name="page-kind" aria-describedby={`page-kind-${kind.key}`} disabled={Boolean(reason)} checked={value === kind.key} onChange={() => onChange(kind.key)} />{kind.label}</label><small id={`page-kind-${kind.key}`}>{reason || kind.detail}</small></div> })}
    {!hideStreamNote && <small className="muted">A Release page for a new stream is added as a custom stream: Admin → Streams → Stream mapping → ＋ Add stream….</small>}
  </fieldset>
}
function IconField({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  return <label>Icon<select aria-label="Icon" value={value} onChange={(event) => onChange(event.target.value)}>{pageIcons.map((entry) => <option key={entry.icon} value={entry.icon}>{entry.icon} {entry.label}</option>)}</select><small>Shown next to the page’s name in the menu and on Home.</small></label>
}

// PGB-05: ＋ Add page — type, name, description, icon, menu group (one that accepts added pages and that the viewer may
// add to, or ＋ New group… for a Tool Owner) and the page's co-owners.
export function AddPageDialog({ viewer, layout, group: preset, onCancel, onCreate }: { viewer: Viewer; layout: MenuLayout; group?: string; onCancel: () => void; onCreate: (input: NewPage) => Promise<void> }) {
  const groups = groupsForAdding(viewer, layout)
  const [kind, setKind] = useState<PageKind>('table')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState(defaultIcon)
  const [group, setGroup] = useState(preset && groups.some((entry) => entry.id === preset) ? preset : groups[0]?.id ?? (viewer.manager ? newGroupKey : ''))
  const [groupName, setGroupName] = useState('')
  const [owners, setOwners] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const clash = usePageNameClash(name)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) { setError('Give the page a name.'); return }
    if (clash) return
    const isNew = group === newGroupKey
    if (isNew) { const problem = groupNameError(layout, groupName); if (problem) { setError(problem); return } }
    else if (!groups.some((entry) => entry.id === group)) { setError('Choose a menu group.'); return }
    setBusy(true); setError('')
    try { await onCreate({ kind, name, description, icon, group: isNew ? '' : group, newGroup: isNew ? groupName : null, owners }) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) }
  }
  const presetName = preset ? findGroup(layout, preset)?.name : undefined
  return <Modal eyebrow="PAGES & MENU" title={presetName ? `Add a page to ${presetName}` : 'Add a page'} onClose={() => { if (!busy) onCancel() }}>
    <form onSubmit={(event) => void submit(event)} className="pgb-form">
      <KindField value={kind} onChange={setKind} />
      <PageNameField value={name} clash={clash} onChange={(value) => { setName(value); setError('') }} />
      <label>Description (optional)<input maxLength={300} value={description} onChange={(event) => setDescription(event.target.value)} /><small>Shown under the page name and as the title’s tooltip.</small></label>
      <IconField value={icon} onChange={setIcon} />
      <label>Menu group<select aria-label="Menu group" required value={group} onChange={(event) => { setGroup(event.target.value); setError('') }}>
        {groups.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        {viewer.manager && <option value={newGroupKey}>＋ New group…</option>}
      </select><small>The groups that accept added pages{viewer.manager ? ', or a new group of your own' : ' and that you co-own'}.</small></label>
      {group === newGroupKey && <label>New group name<input aria-label="New group name" required maxLength={40} value={groupName} onChange={(event) => { setGroupName(event.target.value); setError('') }} /><small>Shown as a heading of its own in the menu, after On-Demand; it accepts added pages.</small></label>}
      <OwnersField label="Page co-owners (optional)" value={owners} onChange={setOwners} help={kind === 'dashboard' ? 'They may build this dashboard (add, edit, reorder and remove its blocks, tabs and filters).' : 'They may set up this page (columns, options, key prefix, insights) and edit its rows.'} />
      <small className="muted">The page is created in Git at once (on-demand/page-id.json) and its place in the menu is saved to menu-layout.json{kind === 'dashboard' ? '; its blocks are saved to dashboards/page-id.json when the first one is added' : ''}.</small>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className="primary" disabled={busy || Boolean(clash)}>{busy ? 'Saving to Git…' : 'Add page'}</button></div>
    </form>
  </Modal>
}

// PGB-07: a page in the menu — name and description (in the page's file), type, icon, group and co-owners (in the menu
// layout). A move offers the groups the viewer may move it to.
// PGB-19: hidden — hidden from the menu, Home and search for everyone (Tool Owner, the page's and its group's co-owners).
export interface PageEdit { name: string; description: string; kind: PageKind; icon: string; group: string; owners: string[]; hidden: boolean }
export function EditPageDialog({ viewer, layout, page, pending, onCancel, onSave }: { viewer: Viewer; layout: MenuLayout; page: { id: string; name: string; description: string }; pending: boolean; onCancel: () => void; onSave: (edit: PageEdit) => Promise<void> }) {
  const placement = placementOf(layout, page.id)
  const [name, setName] = useState(page.name)
  const [description, setDescription] = useState(page.description)
  const [kind, setKind] = useState<PageKind>(placement.type === 'table' || placement.type === 'dashboard' ? placement.type : 'table-insights')
  const [icon, setIcon] = useState(placement.icon)
  const [group, setGroup] = useState(placement.group)
  const [owners, setOwners] = useState<string[]>(placement.owners)
  const [hidden, setHidden] = useState(placement.hidden === true)
  const hiding = hideReason(viewer, layout, page.id)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const targets = menuGroups(layout).filter((entry) => entry.id === placement.group || !moveReason(viewer, layout, page.id, entry.id))
  // PGB-16: checked on every save — a rename and a move alike (a page that already shares its name is renamed first).
  const clash = usePageNameClash(name, `ondemand:${page.id}`)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) { setError('Give the page a name.'); return }
    if (clash) return
    if (pending && (name.trim() !== page.name || description.trim() !== page.description)) { setError(`Save or discard the unsaved changes to ${page.name} first: the name is saved in the page’s file.`); return }
    setBusy(true); setError('')
    try { await onSave({ name, description, kind, icon, group, owners, hidden }) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) }
  }
  return <Modal eyebrow={`PAGES & MENU · ${page.name.toUpperCase()}`} title="Edit the page" onClose={() => { if (!busy) onCancel() }}>
    <form onSubmit={(event) => void submit(event)} className="pgb-form">
      <KindField value={kind} onChange={setKind} locked={placement.type === 'dashboard' ? 'dashboard' : 'table'} />
      {kind === 'table' && placement.type !== 'table' && <small className="muted">The Insights tab is hidden, its charts and tables kept in the page’s file.</small>}
      <PageNameField value={name} clash={clash} onChange={(value) => { setName(value); setError('') }} />
      <label>Description (optional)<input maxLength={300} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <IconField value={icon} onChange={setIcon} />
      <label>Menu group<select aria-label="Menu group" value={group} onChange={(event) => setGroup(event.target.value)}>{targets.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select><small>{viewer.manager ? 'Any group that accepts added pages.' : 'A group co-owner moves pages within the groups they co-own.'}</small></label>
      <OwnersField label="Page co-owners (optional)" value={owners} onChange={setOwners} help={kind === 'dashboard' ? 'They may build this dashboard.' : 'They may set up this page and edit its rows.'} />
      <label className="check"><input type="checkbox" checked={hidden} disabled={Boolean(hiding)} title={hiding || undefined} onChange={(event) => setHidden(event.target.checked)} />Hidden from the menu<small>Not in the menu, on Home or in search for anyone; the page’s data stays in Git and dashboards keep reading it. Only a Tool Owner deletes a page.</small></label>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className="primary" disabled={busy || Boolean(clash)}>{busy ? 'Saving to Git…' : 'Save to Git'}</button></div>
    </form>
  </Modal>
}

// PGB-06, PGB-08: a group — its name (custom groups only; a built-in group keeps its name), whether it accepts added
// pages and its co-owners. Tool Owner only.
export interface GroupEdit { name: string; acceptsPages: boolean; owners: string[] }
export function GroupDialog({ layout, group, onCancel, onSave }: { layout: MenuLayout; group: { id: string; name: string; builtIn: boolean; acceptsPages: boolean; owners: string[] } | null; onCancel: () => void; onSave: (edit: GroupEdit) => Promise<void> }) {
  const [name, setName] = useState(group?.name ?? '')
  const [accepts, setAccepts] = useState(group?.acceptsPages ?? true)
  const [owners, setOwners] = useState<string[]>(group?.owners ?? [])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!group?.builtIn) { const problem = groupNameError(layout, name, group?.id); if (problem) { setError(problem); return } }
    setBusy(true); setError('')
    try { await onSave({ name, acceptsPages: accepts, owners }) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) }
  }
  return <Modal eyebrow="PAGES & MENU · GROUPS" title={group ? `Edit the group ${group.name}` : 'Add a group'} onClose={() => { if (!busy) onCancel() }}>
    <form onSubmit={(event) => void submit(event)} className="pgb-form">
      {group?.builtIn ? <p><strong>{group.name}</strong> is a built-in group: it keeps its name and place in the menu; only these settings change.</p>
        : <label>Group name<input aria-label="Group name" autoFocus required maxLength={40} value={name} onChange={(event) => { setName(event.target.value); setError('') }} /><small>Shown as a heading in the menu, after On-Demand.</small></label>}
      <label className="check"><input type="checkbox" checked={accepts} onChange={(event) => setAccepts(event.target.checked)} />Accepts added pages</label>
      <small className="muted">Off: no page can be added or moved into the group, and its co-owners hold nothing until it is on again.</small>
      <OwnersField label="Group co-owners (optional)" value={owners} onChange={setOwners} help="While the group accepts added pages they may add, rename, reorder, move within and remove its pages, name the pages’ co-owners, set the pages up and edit their rows — not change the group itself." />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Saving to Git…' : group ? 'Save to Git' : 'Add group'}</button></div>
    </form>
  </Modal>
}
