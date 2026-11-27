import { useState, type ReactNode } from 'react'
import { DataTable, type DataColumn } from './DataTable'
import { PageViewForEveryone } from './ViewForEveryone'
import { useViewsForEveryone } from '../useViewsForEveryone'
import { Drawer, Info, Modal, Notice, Panel, Pill, WriteBlocked } from './ui'
import { MultiSelect } from './MultiSelect'
import { ViewActions } from './ViewActions'
import { GitSyncBar } from './GitStorage'
import { recordJob } from '../backgroundJobs'
import { useUnsavedEdit } from '../pageEdits'
import { formatDate } from '../format'
import { utcToday } from '../businessTime'
import { regions, resourceRoles, type Region, type ResourceProfile, type ResourceRole } from '../capacity'
import { roles as accessRoles, type Role } from '../access'
import { emptyFilters, filterPeople, peopleFiltersKey, readPeopleFilters, filtersChanged, formError, formOf, missingOf, patchText, profilePatch, sameRoles, statusOptions, statusText, type PeopleFilters, type PersonEntry, type PersonForm } from '../people'
import type { GitStorage } from '../useGitStorage'

// Admin → People & access → People (CAP-58…CAP-61, UI-STANDARDS §4a, §5, §7, §8). A read-only list in the shared
// DataTable (search, sort, columns, Export) with Region, Role, Access role and Status filters; a click on a row (or
// Enter) opens the person in a drawer — view first, Edit turns the values into fields, Save saves the profile with the
// planning data and the app access roles to access.json (two saves, each a Background jobs entry); tick rows for the
// bulk edit (Set region…, Set role…, Set access role…, one save each). The help and the team read are behind ⓘ, the
// warnings one folded line, Default Time tracking started in the page's ⋯ menu.

export interface PeopleSaves {
  // One change of the planning data for every name (undefined clears a field); detail names it in History.
  profiles: (names: string[], patch: Partial<ResourceProfile>, detail: string) => void
  // One save of access.json: each person with an email gets exactly these roles. Throws when not saved.
  roles: (people: { name: string; email?: string }[], chosen: Role[]) => Promise<{ changed: string[]; skipped: string[]; path: string }>
  defaultJoined: (value: string) => void
}

export interface PeoplePanelProps {
  entries: PersonEntry[]
  names: string[] // the people from Azure DevOps (offered as managers)
  outside: string[] // managers typed in by name who are not on the board
  defaultRole: Role | null
  defaultJoinedOn?: string
  accessReason: string // why the app access roles cannot be changed here ('' when they can)
  accessOnly: [string, Role[]][] // app access for emails no one in Azure DevOps has
  source: ReactNode // where the names come from and the team read, behind ⓘ
  teamError?: string
  readTeam?: { disabled: boolean; onClick: () => void }
  git: GitStorage
  saves: PeopleSaves
}

const regionOptions: [string, string][] = [['', 'Not set'], ...regions.map((region): [string, string] => [region, region])]
const roleOptions: [string, string][] = [['', 'Not set'], ...resourceRoles.map((role): [string, string] => [role, role])]
const accessOptions: [string, string][] = accessRoles.map((role) => [role, role])
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`
const failureText = (failure: unknown) => failure instanceof Error ? failure.message : String(failure)

export function PeoplePanel({ entries, names, outside, defaultRole, defaultJoinedOn, accessReason, accessOnly, source, teamError, readTeam, git, saves }: PeoplePanelProps) {
  const today = utcToday()
  // UI-23: the filters remembered per person (personal views), else the view for everyone, else the built-in start.
  const { views } = useViewsForEveryone()
  const [filters, setFilterState] = useState<PeopleFilters>(() => ({ ...(views?.filter(peopleFiltersKey, readPeopleFilters) ?? emptyFilters), text: '' }))
  // The search box is not remembered (only Region, Role, Access role and Status).
  const setFilters = (next: PeopleFilters) => { setFilterState(next); if (JSON.stringify({ ...next, text: '' }) !== JSON.stringify({ ...filters, text: '' })) views?.setFilter(peopleFiltersKey, { ...next, text: '' }) }
  const [selected, setSelected] = useState<string[]>([])
  const [open, setOpen] = useState<{ name: string; order: string[] } | null>(null)
  const [bulk, setBulk] = useState<'region' | 'role' | 'access' | null>(null)
  const [defaultOpen, setDefaultOpen] = useState(false)
  const shown = filterPeople(entries, filters)
  const byName = new Map(entries.map((entry) => [entry.name, entry]))
  const picked = selected.map((name) => byName.get(name)).filter((entry): entry is PersonEntry => Boolean(entry))
  const defaultText = defaultRole ? `Default (${defaultRole})` : 'None'
  const status = (entry: PersonEntry) => statusText(entry.status, entry.profile, defaultJoinedOn, today, formatDate)

  const columns: DataColumn<PersonEntry>[] = [
    { id: 'person', label: 'Person', value: (entry) => entry.name, render: (entry) => <><strong>{entry.name}</strong>{entry.note && <small className="person-note">{entry.note}</small>}</> },
    { id: 'email', label: 'Email', defaultHidden: true, value: (entry) => entry.email ?? '', render: (entry) => entry.email ? <>{entry.email}{entry.emailSaved && <small className="muted"> saved earlier; not in Azure DevOps</small>}</> : <small className="muted">No email in Azure DevOps</small>, className: 'person-email' },
    { id: 'access', label: 'Access', value: (entry) => entry.roles.join(', ') || defaultText, render: (entry) => entry.roles.length ? <span className="person-tags">{entry.roles.map((role) => <Pill key={role}>{role}</Pill>)}</span> : <small className="muted">{defaultText}</small> },
    { id: 'region', label: 'Region', value: (entry) => entry.profile.region ?? '', render: (entry) => entry.profile.region ?? <small className="muted">Not set</small> },
    { id: 'role', label: 'Role', value: (entry) => [entry.profile.role, entry.profile.peopleManager ? 'People manager' : ''].filter(Boolean).join(', '), render: (entry) => <span className="person-tags">{entry.profile.role ?? <small className="muted">Not set</small>}{entry.profile.peopleManager && <Pill tone="info">People manager</Pill>}</span> },
    { id: 'reports', label: 'Reports to', value: (entry) => entry.profile.reportsTo ?? '', render: (entry) => entry.profile.reportsTo ?? <small className="muted">—</small> },
    { id: 'status', label: 'Status', value: status, render: (entry) => <span className={`person-status person-status-${entry.status}`}>{status(entry)}</span> },
  ]

  // Warnings about the people shown (UI-STANDARDS §8): one folded line.
  const inTeam = entries.filter((entry) => entry.status === 'active')
  const noRegion = inTeam.filter((entry) => !entry.profile.region).map((entry) => entry.name)
  const incomplete = inTeam.map((entry) => [entry.name, missingOf(entry)] as const).filter(([, missing]) => missing.length)
  const warnings: { key: string; summary: string; detail: ReactNode }[] = [
    ...(teamError ? [{ key: 'team', summary: 'the team was not read', detail: <>The team was not read: {teamError}. The PAT needs Project and Team (Read); the people Assigned To in the fetched work are listed.</> }] : []),
    ...(noRegion.length ? [{ key: 'region', summary: `no region for ${plural(noRegion.length, 'person', 'people')}`, detail: <>No region yet for {noRegion.join(', ')}; regional holidays are not applied to them.</> }] : []),
    ...(incomplete.length ? [{ key: 'mapping', summary: `mapping incomplete for ${plural(incomplete.length, 'person', 'people')}`, detail: <>Mapping incomplete: <ul className="people-incomplete">{incomplete.map(([name, missing]) => <li key={name}><strong>{name}</strong>: {missing.join(', ')}</li>)}</ul></> }] : []),
    ...(accessOnly.length ? [{ key: 'access', summary: `access for ${plural(accessOnly.length, 'email')} not in Azure DevOps`, detail: <>App access for an email no one in Azure DevOps has (add the person to the team in Azure DevOps, or remove the access in People & roles → Role rights → Access for emails not in Azure DevOps): {accessOnly.map(([email, assigned]) => <span key={email} className="access-only"> {email} ({assigned.join(', ') || 'no role'}) </span>)}</> }] : []),
  ]

  const current = open ? byName.get(open.name) : undefined
  const step = (by: number) => { if (!open) return; const name = open.order[open.order.indexOf(open.name) + by]; if (name && byName.has(name)) setOpen({ ...open, name }) }
  const saveProfile = (who: string[], patch: Partial<ResourceProfile>, label: string) => {
    saves.profiles(who, patch, `${who.length === 1 ? who[0] : `${who.length} people (${who.join(', ')})`}: ${patchText(patch)}`)
    recordJob('people-profile', label, { text: `${who.length === 1 ? who[0] : plural(who.length, 'person', 'people')}: ${patchText(patch)}. Saved with the planning data; Save to Git (the bar above the list) shares it with everyone.` })
  }
  const saveRoles = async (people: { name: string; email?: string }[], chosen: Role[], label: string) => {
    try {
      const result = await saves.roles(people, chosen)
      const who = result.changed.length === 1 ? result.changed[0] : plural(result.changed.length, 'person', 'people')
      if (result.changed.length) recordJob('people-access', label, { text: `${who}: app access roles ${chosen.join(', ') || 'removed (default role)'}; saved to ${result.path}.${result.skipped.length ? ` Not changed (no email in Azure DevOps): ${result.skipped.join(', ')}.` : ''}`, failed: result.skipped.length > 0 })
      else if (result.skipped.length) recordJob('people-access', label, { text: `Nothing saved: no email in Azure DevOps for ${result.skipped.join(', ')}.`, failed: true })
    } catch (failure) {
      recordJob('people-access', label, { text: failureText(failure), failed: true })
      throw failure
    }
  }

  const toolbar = <span className="people-filters">
    <MultiSelect label="Region" options={regionOptions} value={filters.regions} onChange={(value) => setFilters({ ...filters, regions: value })} />
    <MultiSelect label="Role" options={roleOptions} value={filters.roles} onChange={(value) => setFilters({ ...filters, roles: value })} />
    <MultiSelect label="Access role" options={[['', 'Default role'], ...accessOptions]} value={filters.access} onChange={(value) => setFilters({ ...filters, access: value })} />
    <MultiSelect label="Status" options={statusOptions} value={filters.status} onChange={(value) => setFilters({ ...filters, status: value })} />
    <input type="search" className="search" aria-label="Search people" placeholder="Search name or email" value={filters.text} onChange={(event) => setFilters({ ...filters, text: event.target.value })} />
    <button type="button" className="ghost" disabled={!filtersChanged(filters)} onClick={() => setFilters(emptyFilters)}>Reset filters</button>
  </span>

  return <Panel className="admin-section people-panel" eyebrow="PEOPLE & ACCESS" title="People"
    info="Everyone whose region, role and dates can be set: the people with Time Writing Tasks (with their figures), everyone else Assigned To fetched work, the Azure DevOps team members, and people with settings who are not in Azure DevOps (Status filter). Click a person to see or change them. Region, role and reporting line are saved with the planning data in Git; the app access roles in access.json. Region decides which regional holidays apply. Time tracking started / Left on (both days worked) limit a person's funded hours to the working days they are employed: a month they join or leave in is prorated, and in a month before joining or after leaving they have no capacity and are not counted. The capacity of the month and the regional holidays are on Capacity & time → Capacity."
    action={<div className="button-row"><Pill tone={entries.length ? 'open' : 'neutral'}>{plural(entries.length, 'person', 'people')}</Pill><ViewActions label="People" items={[{ key: 'default-joined', label: 'Default Time tracking started…', onClick: () => setDefaultOpen(true) }]} /></div>}>
    {entries.length > 0 && <GitSyncBar git={git} />}
    <p className="people-source muted">Names and work emails come from Azure DevOps. <Info iconOnly label="Where the people come from">{source}</Info>{readTeam && <button type="button" className="ghost" disabled={readTeam.disabled} onClick={readTeam.onClick}>↻ Read the team again</button>}</p>
    {warnings.length > 0 && <Notice tone="warning" className="people-warnings"><details><summary>{plural(warnings.length, 'warning')}: {warnings.map((warning) => warning.summary).join(' · ')}</summary><ul>{warnings.map((warning) => <li key={warning.key}>{warning.detail}</li>)}</ul></details></Notice>}
    {picked.length > 0 && <div className="bulk-bar" role="region" aria-label="Selected people">
      <strong>{plural(picked.length, 'selected', 'selected')}</strong>
      <button type="button" className="ghost" onClick={() => setBulk('region')}>Set region…</button>
      <button type="button" className="ghost" onClick={() => setBulk('role')}>Set role…</button>
      <button type="button" className="ghost" disabled={Boolean(accessReason)} title={accessReason || undefined} onClick={() => setBulk('access')}>Set access role…</button>
      <button type="button" className="text-button" onClick={() => setSelected([])}>Clear selection</button>
      <WriteBlocked reason={accessReason} />
    </div>}
    <PageViewForEveryone entryKey={peopleFiltersKey} what="People filters" value={{ ...filters, text: '' }} onUse={(value) => setFilterState(readPeopleFilters(value) ?? emptyFilters)} />
    <DataTable id="admin:people" className="people-table" columns={columns} rows={shown} rowKey={(entry) => entry.name} exportName="People" toolbar={toolbar}
      status={`${shown.length} of ${plural(entries.length, 'person', 'people')}`} defaultSort={{ id: 'person' }}
      selection={{ selected, onChange: setSelected, label: (entry) => entry.name }}
      onRowOpen={(entry, order) => setOpen({ name: entry.name, order: order.map((row) => row.name) })} rowLabel={(entry) => `${entry.name}: open`}
      empty={<div className="empty-state"><strong>{entries.length ? 'No person matches the filters.' : 'No people from Azure yet.'}</strong><p>{entries.length ? 'Change the filters, or Reset filters.' : 'Refresh from Azure DevOps; people appear once they are in the team or Assigned To a Time Writing Task.'}</p></div>} />
    {open && current && <PersonDrawer key={current.name} entry={current} position={{ at: open.order.indexOf(current.name), of: open.order.length }} onStep={step} onClose={() => setOpen(null)}
      names={names} outside={outside} defaultRole={defaultRole} defaultJoinedOn={defaultJoinedOn} accessReason={accessReason} status={status(current)}
      onSaveProfile={(patch) => saveProfile([current.name], patch, `Save ${current.name}`)}
      onSaveRoles={(chosen) => saveRoles([{ name: current.name, email: current.email }], chosen, `Access · ${current.name}`)} />}
    {bulk && <BulkDialog kind={bulk} people={picked} defaultText={defaultText} onClose={() => setBulk(null)}
      onProfiles={(patch, label) => saveProfile(picked.map((entry) => entry.name), patch, label)}
      onRoles={(chosen, label) => saveRoles(picked, chosen, label)} />}
    {defaultOpen && <DefaultJoinedDialog value={defaultJoinedOn ?? ''} onClose={() => setDefaultOpen(false)} onSave={(value) => { saves.defaultJoined(value); recordJob('people-profile', 'Default Time tracking started', { text: `Default Time tracking started = ${value ? formatDate(value) : 'none'}. Saved with the capacity settings; Save to Git shares it with everyone.` }); setDefaultOpen(false) }} />}
  </Panel>
}

// CAP-59: one person in a drawer (UI-STANDARDS §4a). View: email and status, then Access, Profile and Employment;
// ‹ › move through the list in its current order. Edit turns the values into fields; Save saves what changed — the
// profile with the planning data, the app access roles to access.json — and a failed save keeps the edit with Retry.
// Mark as left…, Not part of the team and Restore change the person at once (Mark as left… and Not part of the team
// after a pop-up that can also remove their app access). Unsaved edits ask before the drawer closes or moves on.
function PersonDrawer({ entry, position, onStep, onClose, names, outside, defaultRole, defaultJoinedOn, accessReason, status, onSaveProfile, onSaveRoles }: { entry: PersonEntry; position: { at: number; of: number }; onStep: (by: number) => void; onClose: () => void; names: string[]; outside: string[]; defaultRole: Role | null; defaultJoinedOn?: string; accessReason: string; status: string; onSaveProfile: (patch: Partial<ResourceProfile>) => void; onSaveRoles: (chosen: Role[]) => Promise<void> }) {
  const [form, setForm] = useState<PersonForm | null>(null)
  const [other, setOther] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [asking, setAsking] = useState<(() => void) | null>(null)
  const [removing, setRemoving] = useState<'left' | 'not-team' | null>(null)
  const base = formOf(entry)
  const dirty = Boolean(form) && (Object.keys(profilePatch(entry, form!)).length > 0 || !sameRoles(form!.roles, base.roles))
  useUnsavedEdit(dirty ? `the changes to ${entry.name} in People` : false)
  const guard = (action: () => void) => { if (busy) return; if (dirty) setAsking(() => action); else action() }
  const rolesReason = !entry.email ? 'Azure DevOps has no email for this person, so no app access role can be given here.' : accessReason
  const set = (patch: Partial<PersonForm>) => { setForm({ ...form!, ...patch }); setError('') }
  const managers = names.filter((name) => name !== entry.name)
  const others = outside.filter((name) => name !== entry.name)
  const typedManager = Boolean(form?.reportsTo) && !managers.includes(form!.reportsTo) && !others.includes(form!.reportsTo)

  async function save() {
    if (!form) return
    const problem = formError(form)
    if (problem) { setError(problem); return }
    const patch = profilePatch(entry, form)
    setBusy(true); setError('')
    try {
      if (Object.keys(patch).length) onSaveProfile(patch)
      if (!sameRoles(form.roles, entry.roles)) await onSaveRoles(form.roles)
      setForm(null); setOther(false)
    } catch (failure) { setError(`App access roles not saved: ${failureText(failure)}`) }
    finally { setBusy(false) }
  }
  const startEdit = () => { setForm(base); setOther(false); setError('') }
  const cancel = () => { setForm(null); setOther(false); setError('') }
  const restore = () => onSaveProfile(entry.profile.removed ? { removed: undefined } : { leftOn: undefined })

  const value = (shown: ReactNode, empty = '—') => shown || <span className="muted">{empty}</span>
  const footer = form ? <>
    {error && <Notice tone="error" className="drawer-error">{error}{' '}<button type="button" className="ghost" disabled={busy} onClick={() => void save()}>Retry</button></Notice>}
    <div className="drawer-actions" key="editing"><button type="button" className="ghost" disabled={busy} onClick={cancel}>Cancel</button><button type="submit" form="person-form" className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
  </> : <>
    {error && <Notice tone="error" className="drawer-error">{error}</Notice>}
    <div className="drawer-actions" key="viewing">
      <span className="button-row drawer-remove">
        {entry.status === 'active' && <button type="button" className="text-button danger-text" onClick={() => setRemoving('left')}>Mark as left…</button>}
        {entry.status !== 'not-team' && <button type="button" className="text-button danger-text" onClick={() => setRemoving('not-team')}>Not part of the team</button>}
        {(entry.profile.removed || entry.profile.leftOn) && <button type="button" className="text-button" title={entry.profile.removed ? 'Back in the team: counted again' : 'Clears Left on: counted again after that day'} onClick={restore}>Restore</button>}
      </span>
      <button type="button" className="primary" onClick={startEdit}>Edit</button>
    </div>
  </>

  return <Drawer eyebrow="PEOPLE & ROLES · PERSON" title={entry.name} className="person-drawer" onClose={() => guard(onClose)}
    restoreFocus={() => document.querySelector<HTMLElement>(`tr[data-row-key="${CSS.escape(entry.name)}"]`)}
    headerActions={position.of > 1 && <span className="button-row drawer-steps">
      <button type="button" className="ghost" aria-label="Previous person" disabled={busy || position.at <= 0} onClick={() => guard(() => onStep(-1))}>‹</button>
      <small className="muted">{position.at + 1} of {position.of}</small>
      <button type="button" className="ghost" aria-label="Next person" disabled={busy || position.at < 0 || position.at >= position.of - 1} onClick={() => guard(() => onStep(1))}>›</button>
    </span>}
    footer={footer}>
    <dl className="od-row-facts">
      <div><dt>Email</dt><dd>{entry.email ? <>{entry.email}{entry.emailSaved && <small className="muted"> (saved earlier; not in Azure DevOps)</small>}</> : <span className="muted">No email in Azure DevOps</span>}</dd></div>
      <div><dt>Status</dt><dd>{status}</dd></div>
      {entry.note && <div><dt>Time Writing</dt><dd>{entry.note}</dd></div>}
    </dl>
    {!form && entry.status === 'active' && missingOf(entry).length > 0 && <p className="warning-text">Mapping incomplete: {missingOf(entry).join(', ')}</p>}
    <form id="person-form" className="person-form" noValidate onSubmit={(event) => { event.preventDefault(); void save() }}>
      <section aria-label="Access" className="person-section"><h3>Access</h3>
        {form ? <>
          <MultiSelect label="App access roles" emptyLabel={defaultRole ? `Default (${defaultRole})` : 'None'} options={accessOptions} value={form.roles} disabled={Boolean(rolesReason)} title={rolesReason || undefined} selectAll={false} onChange={(chosen) => set({ roles: chosen as Role[] })} />
          <small className="muted">Saved to access.json (Manage access). No role: the default role applies.</small>
          <WriteBlocked reason={rolesReason} />
        </> : <dl className="od-row-values"><div><dt>App access roles</dt><dd>{entry.roles.length ? <span className="person-tags">{entry.roles.map((role) => <Pill key={role}>{role}</Pill>)}</span> : <span className="muted">{defaultRole ? `Default (${defaultRole})` : 'None'}</span>}</dd></div></dl>}
      </section>
      <section aria-label="Profile" className="person-section"><h3>Profile</h3>
        {form ? <>
          <label>Region<select aria-label="Region" value={form.region} onChange={(event) => set({ region: event.target.value as Region | '' })}><option value="">Not set</option>{regions.map((region) => <option key={region}>{region}</option>)}</select><small>Decides which regional holidays apply.</small></label>
          <label>Role<select aria-label="Role" value={form.role} onChange={(event) => set({ role: event.target.value as ResourceRole | '' })}><option value="">Not set</option>{resourceRoles.map((role) => <option key={role}>{role}</option>)}</select><small>The team role decides who counts for capacity (Capacity roles).</small></label>
          <label className="check"><input type="checkbox" checked={form.peopleManager} onChange={(event) => set({ peopleManager: event.target.checked })} />People manager</label>
          {other || typedManager ? <label>Reports to (typed name)<span className="button-row"><input aria-label="Manager's name" placeholder="Manager's name" value={form.reportsTo} autoFocus={other} onChange={(event) => set({ reportsTo: event.target.value })} /><button type="button" className="text-button" onClick={() => { setOther(false); set({ reportsTo: base.reportsTo }) }}>Choose from the list</button></span><small>A manager who is not on the board.</small></label>
            : <label>Reports to<select aria-label="Reports to" value={form.reportsTo} onChange={(event) => { if (event.target.value === '__other') { setOther(true); set({ reportsTo: '' }) } else set({ reportsTo: event.target.value }) }}><option value="">—</option>{managers.map((name) => <option key={name}>{name}</option>)}{others.length > 0 && <optgroup label="Not on the board">{others.map((name) => <option key={name}>{name}</option>)}</optgroup>}<option value="__other">Other (type a name)…</option></select></label>}
        </> : <dl className="od-row-values">
          <div><dt>Region</dt><dd>{value(entry.profile.region, 'Not set')}</dd></div>
          <div><dt>Role</dt><dd>{value(entry.profile.role, 'Not set')}{entry.profile.peopleManager && <> <Pill tone="info">People manager</Pill></>}</dd></div>
          <div><dt>Reports to</dt><dd>{value(entry.profile.reportsTo)}{entry.profile.reportsTo && !names.includes(entry.profile.reportsTo) && <small className="muted"> (not on the board)</small>}</dd></div>
        </dl>}
      </section>
      <section aria-label="Employment" className="person-section"><h3>Employment</h3>
        {form ? <>
          <label>Time tracking started (optional)<input type="date" aria-label="Time tracking started" value={form.joinedOn} max={form.leftOn || undefined} onChange={(event) => set({ joinedOn: event.target.value })} /><small>{defaultJoinedOn ? `Empty: the default, ${formatDate(defaultJoinedOn)}.` : 'Empty: no start date.'} Months before it count no capacity.</small></label>
          <label>Left on (optional)<input type="date" aria-label="Left on" value={form.leftOn} min={form.joinedOn || undefined} onChange={(event) => set({ leftOn: event.target.value })} /><small>Counted up to that day (a day worked); earlier months unchanged.</small></label>
        </> : <dl className="od-row-values">
          <div><dt>Time tracking started</dt><dd>{entry.profile.joinedOn ? formatDate(entry.profile.joinedOn) : <span className="muted">{defaultJoinedOn ? `Default: ${formatDate(defaultJoinedOn)}` : '—'}</span>}</dd></div>
          <div><dt>Left on</dt><dd>{value(entry.profile.leftOn && formatDate(entry.profile.leftOn))}</dd></div>
        </dl>}
      </section>
    </form>
    {asking && <Modal eyebrow="PEOPLE & ROLES · PERSON" title="Discard your changes?" onClose={() => setAsking(null)}>
      <form onSubmit={(event) => { event.preventDefault(); const action = asking; setAsking(null); cancel(); action() }}>
        <p>Your changes to {entry.name} are not saved. Discard them?</p>
        <div className="modal-actions"><button type="button" className="ghost" onClick={() => setAsking(null)}>Keep editing</button><button className="danger-button">Discard changes</button></div>
      </form>
    </Modal>}
    {removing && <RemoveDialog kind={removing} entry={entry} accessReason={accessReason} onClose={() => setRemoving(null)} onConfirm={async (leftOn, revoke) => {
      onSaveProfile(removing === 'left' ? { leftOn } : { removed: true })
      setRemoving(null)
      if (revoke) await onSaveRoles([]).catch((failure: unknown) => setError(`App access not removed: ${failureText(failure)}`))
    }} />}
  </Drawer>
}

// CAP-59 (formerly CAP-48): Mark as left… (on a date, default today, saved as Left on) or Not part of the team
// (removed from every figure, restorable), with "Also remove their app access" (ticked; needs Manage access).
function RemoveDialog({ kind, entry, accessReason, onClose, onConfirm }: { kind: 'left' | 'not-team'; entry: PersonEntry; accessReason: string; onClose: () => void; onConfirm: (leftOn: string, revoke: boolean) => Promise<void> }) {
  const [leftOn, setLeftOn] = useState(utcToday())
  const hasAccess = entry.roles.length > 0
  const [revoke, setRevoke] = useState(hasAccess && !accessReason)
  const [busy, setBusy] = useState(false)
  const tooEarly = kind === 'left' && Boolean(entry.profile.joinedOn) && leftOn < entry.profile.joinedOn!
  return <Modal eyebrow="PEOPLE & ROLES · PERSON" title={kind === 'left' ? `Mark ${entry.name} as left` : `${entry.name}: not part of the team`} onClose={onClose}>
    <form aria-label={kind === 'left' ? `Mark ${entry.name} as left` : `${entry.name} not part of the team`} onSubmit={(event) => { event.preventDefault(); if (busy || (kind === 'left' && (!leftOn || tooEarly))) return; setBusy(true); void onConfirm(leftOn, revoke).finally(() => setBusy(false)) }}>
      {kind === 'left' ? <label>Left the team on<input type="date" aria-label="Left the team on" required value={leftOn} min={entry.profile.joinedOn} onChange={(event) => setLeftOn(event.target.value)} /><small>Counted up to that day (a day worked); earlier months stay as they are.</small></label>
        : <p>{entry.name} is left out of every figure, every month — capacity, utilization, Pulse Check, Team overview. Restore brings them back.</p>}
      {tooEarly && <Notice tone="error">Left on cannot be before Time tracking started ({formatDate(entry.profile.joinedOn!)}).</Notice>}
      {hasAccess && <label className="check"><input type="checkbox" checked={revoke} disabled={Boolean(accessReason)} onChange={(event) => setRevoke(event.target.checked)} />Also remove their app access ({entry.roles.join(', ')})</label>}
      {hasAccess && <WriteBlocked reason={accessReason} />}
      <div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button className="primary" disabled={busy || (kind === 'left' && (!leftOn || tooEarly))}>{kind === 'left' ? 'Mark as left' : 'Remove from the team'}</button></div>
    </form>
  </Modal>
}

// CAP-60: one value for every selected person, saved in one go (one planning save, or one save of access.json).
// CON-135 (AR-010): nothing is chosen when the pop-up opens and Save stays disabled until a value is picked; clearing
// is its own choice ("(none) — clear …") and asks to confirm in the pop-up before anything is saved.
const clearValue = '__clear'
function BulkDialog({ kind, people, defaultText, onClose, onProfiles, onRoles }: { kind: 'region' | 'role' | 'access'; people: PersonEntry[]; defaultText: string; onClose: () => void; onProfiles: (patch: Partial<ResourceProfile>, label: string) => void; onRoles: (chosen: Role[], label: string) => Promise<void> }) {
  const [value, setValue] = useState('')
  const [chosen, setChosen] = useState<Role[]>([])
  const [clearRoles, setClearRoles] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const count = plural(people.length, 'person', 'people')
  const noEmail = people.filter((entry) => !entry.email).map((entry) => entry.name)
  const title = kind === 'region' ? `Set region for ${count}` : kind === 'role' ? `Set role for ${count}` : `Set access role for ${count}`
  const what = kind === 'region' ? 'region' : kind === 'role' ? 'role' : 'app access roles'
  const clearing = kind === 'access' ? clearRoles : value === clearValue
  const missing = kind === 'access' ? (!clearRoles && !chosen.length ? 'Choose the app access roles, or (none) — remove their app access roles.' : '') : !value ? `Choose a ${what}, or (none) — clear.` : ''
  const clearLabel = kind === 'access' ? `Remove app access roles for ${count}` : `Clear ${what} for ${count}`
  async function submit() {
    if (missing) return
    if (clearing && !confirming) { setConfirming(true); return }
    const picked = clearing ? undefined : value
    if (kind === 'region') { onProfiles({ region: picked as Region | undefined }, `${clearing ? 'Clear' : 'Set'} region · ${count}`); onClose(); return }
    if (kind === 'role') { onProfiles({ role: picked as ResourceRole | undefined }, `${clearing ? 'Clear' : 'Set'} role · ${count}`); onClose(); return }
    setBusy(true); setError('')
    try { await onRoles(clearing ? [] : chosen, `${clearing ? 'Remove access roles' : 'Set access role'} · ${count}`); onClose() } catch (failure) { setError(failureText(failure)) } finally { setBusy(false) }
  }
  const options = kind === 'region' ? regions : resourceRoles
  return <Modal eyebrow="PEOPLE & ROLES · BULK EDIT" title={title} onClose={onClose}>
    <form aria-label={title} onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <p className="muted">{people.map((entry) => entry.name).join(', ')}</p>
      {kind !== 'access' && <label>{kind === 'region' ? 'Region' : 'Role'}<select aria-label={kind === 'region' ? 'Region' : 'Role'} required value={value} disabled={confirming} onChange={(event) => { setValue(event.target.value); setConfirming(false) }}><option value="" disabled>Choose…</option>{options.map((entry) => <option key={entry}>{entry}</option>)}<option value={clearValue}>(none) — clear</option></select><small>Saved with the planning data for everyone selected.</small></label>}
      {kind === 'access' && <>
        <MultiSelect label="App access roles" emptyLabel="Choose roles" options={accessOptions} value={chosen} selectAll={false} disabled={clearRoles || confirming} onChange={(next) => setChosen(next as Role[])} />
        <label className="checkbox-label"><input type="checkbox" checked={clearRoles} disabled={confirming} onChange={(event) => { setClearRoles(event.target.checked); setConfirming(false) }} />(none) — remove their app access roles ({defaultText} then applies)</label>
        <small className="muted">Everyone selected gets exactly these roles, in one save of access.json.{noEmail.length ? ` Not changed — no email in Azure DevOps: ${noEmail.join(', ')}.` : ''}</small>
      </>}
      {confirming && <Notice tone="warning">This clears the {what} of {count}: {people.map((entry) => entry.name).join(', ')}. Choose {clearLabel} again to go ahead, or Cancel.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <WriteBlocked reason={missing} />
      <div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button className="primary" disabled={busy || Boolean(missing)}>{busy ? 'Saving…' : clearing ? clearLabel : 'Save'}</button></div>
    </form>
  </Modal>
}

// CAP-61: Default Time tracking started (CAP-15), from the page's ⋯ menu.
function DefaultJoinedDialog({ value, onClose, onSave }: { value: string; onClose: () => void; onSave: (value: string) => void }) {
  const [day, setDay] = useState(value)
  return <Modal eyebrow="PEOPLE & ROLES · CAPACITY" title="Default Time tracking started" onClose={onClose}>
    <form aria-label="Default Time tracking started" onSubmit={(event) => { event.preventDefault(); onSave(day) }}>
      <label>Default Time tracking started (optional)<input type="date" aria-label="Default Time tracking started" value={day} onChange={(event) => setDay(event.target.value)} /><small>For everyone without their own date; months before it count no capacity. Empty: none.</small></label>
      <div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button className="primary">Save</button></div>
    </form>
  </Modal>
}
