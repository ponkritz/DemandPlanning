import { Fragment, useState } from 'react'
import { actionGroups, actions, areas, cellOf, defaultPolicy, explainAccess, setCell, type Cell, type Permission, isEmail, keepsManager, normalEmail, roles, serializeAccess, toolOwnerChange, type AccessPolicy, type Role } from '../access'
import type { Access } from '../useAccess'
import type { GitStorage } from '../useGitStorage'
import { Notice, Panel, Pill } from './ui'

// Admin → People & roles → Role rights: who has which role, and what each role sees and may do. Shown to everyone; changed and saved to
// Git (access.json) only by a role that may manage access, with a Git token that can write.
// CAP-49: on Admin → People & roles the members (who has which role) are set in the People section with the rest
// of each person's mapping; this panel then shows only the default role and what each role sees and may do.
export function AccessPanel({ access, git, people, membersInPeople = false }: { access: Access; git: GitStorage; people: { email: string; name: string }[]; membersInPeople?: boolean }) {
  const [draft, setDraft] = useState<AccessPolicy | null>(null)
  const [newEmail, setNewEmail] = useState('')
  // The person picked by name from the QMS-0025 people (their email is stored), or 'other' to type an email.
  const [pick, setPick] = useState('')
  const [search, setSearch] = useState('')
  const [commit, setCommit] = useState('')
  const [busy, setBusy] = useState(false)
  const [find, setFind] = useState('')
  const [checkWho, setCheckWho] = useState('')
  const [checkWhat, setCheckWhat] = useState<Permission>('azure.write')
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string; url?: string } | null>(null)
  const editable = git.connected && !git.readOnly && !git.isSample && access.can('access.manage')
  const shown = draft ?? access.policy
  const dirty = Boolean(draft) && (!access.policy || serializeAccess(draft!) !== serializeAccess(access.policy))
  const change = (update: (policy: AccessPolicy) => void) => { const next = structuredClone(shown ?? defaultPolicy(access.email)); update(next); setDraft(next); setResult(null) }
  const toggle = <T extends string>(list: T[], value: T) => list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]
  const nameOf = (email: string) => people.find((person) => person.email === email)?.name
  // Two people with the same name are told apart by their email.
  const label = (person: { email: string; name: string }) => people.filter((entry) => entry.name === person.name).length > 1 ? `${person.name} (${person.email})` : person.name
  // CON-94: the matrix rows: the menu areas, then each group of actions.
  const matrixGroups: { label: string; rows: { key: Permission; label: string }[] }[] = [{ label: 'Menu areas (pages)', rows: areas.map((area) => ({ key: area.key, label: area.label })) }, ...actionGroups.map((group) => ({ label: group, rows: actions.filter((action) => action.group === group).map((action) => ({ key: action.key, label: action.label })) }))]
  const checkPeople = [...people, ...Object.keys(shown?.members ?? {}).filter((email) => !people.some((person) => person.email === email)).map((email) => ({ email, name: email }))].sort((a, b) => a.name.localeCompare(b.name))
  const candidates = people.filter((person) => !shown?.members[person.email]).sort((a, b) => a.name.localeCompare(b.name))
  const members = Object.entries(shown?.members ?? {}).filter(([email]) => !search.trim() || `${email} ${nameOf(email) ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())).sort(([a], [b]) => (nameOf(a) ?? a).localeCompare(nameOf(b) ?? b))

  function addMember(event: React.FormEvent) {
    event.preventDefault()
    const email = normalEmail(pick && pick !== 'other' ? pick : newEmail.replace(/^.*<([^>]+)>\s*$/, '$1'))
    if (!isEmail(email)) { setResult({ tone: 'error', text: people.length ? 'Choose a person, or choose Other and enter an email address.' : 'Enter an email address.' }); return }
    change((policy) => { policy.members[email] = policy.members[email] ?? [policy.defaultRole ?? 'Team Member'] })
    setNewEmail(''); setPick('')
  }
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!draft) return
    // CON-93: only a Tool Owner changes who holds the stream mapping, and one must remain.
    const ownerProblem = toolOwnerChange(access.policy, draft, access.email)
    if (ownerProblem) { setResult({ tone: 'error', text: `Not saved: ${ownerProblem}` }); return }
    if (!keepsManager(draft, access.email)) { setResult({ tone: 'error', text: access.email ? `Not saved: ${access.email} would lose “Manage access”. Keep a role with it for yourself (e.g. Admin).` : 'Not saved: no email is set on your Time Writing connection, so the app cannot check that you keep “Manage access”.' }); return }
    setBusy(true)
    try {
      const saved = await access.save(draft, commit.trim() || 'Update access roles')
      setDraft(null); setCommit(''); setResult({ tone: 'success', text: `Saved to ${access.path}.`, url: saved.commitUrl })
    } catch (failure) { setResult({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }) }
    finally { setBusy(false) }
  }

  const you = access.email ? <>You are <strong>{access.email}</strong> (the email on your Time Writing connection){access.policy ? <> · {access.rights.roles.length ? access.rights.roles.map((role) => <Pill key={role} tone="info">{role}</Pill>) : <Pill tone="danger">no role</Pill>}{access.policy.members[access.email] ? '' : ' (default role)'}</> : ''}.</>
    : <>Your roles follow the email on your Time Writing connection (Admin → Streams → the connection's email field). None is set{access.policy ? ', so the default role applies' : ''}.</>
  return <Panel className="admin-section" eyebrow="ACCESS" title="Roles and access" info={<>Which menu areas each role sees and what it may do, and who has which role (by the email on their Time Writing connection). Stored in Git as {access.path || 'access.json'}, so only people who can write to the data repository can change it. Roles decide what this app shows and does; what each person can read or change in Azure DevOps and GitHub is still decided by their own tokens and project permissions.{access.history && <> <a href={access.history} target="_blank" rel="noreferrer">History</a></>}</>}
    action={access.policy && editable ? <button type="button" className="ghost" onClick={() => { setDraft(null); setResult(null); void access.reload() }}>Reload from Git</button> : undefined}>
    <Notice tone={access.email ? 'info' : 'warning'}>{you}</Notice>
    {!git.connected && <Notice tone="info">Connect Git storage (Admin → Data & sharing) to use access roles. {access.policy ? 'The roles last loaded in this browser still apply.' : 'Until they are loaded, the app is read-only: everyone sees every page, nobody can make changes.'}</Notice>}
    {access.error && <Notice tone="error">{access.path}: {access.error}</Notice>}
    {/* CON-101: no roles file yet: the app is read-only; the viewer may set up the first one (bootstrap). */}
    {git.connected && access.bootstrap && !shown && <Notice tone="warning">No access roles yet: the app is read-only — everyone sees every page, nobody can make changes. {editable ? <button type="button" className="text-button" onClick={() => setDraft(defaultPolicy(access.email))}>Set up roles →</button> : 'Someone who can write to the data repository can set them up here.'}</Notice>}
    {shown && <>
      {!editable && <p className="muted">{git.readOnly ? 'View only: your Git token can read but not save.' : 'View only: your role does not include “Manage access”.'}</p>}
      <fieldset className="plain-fieldset" disabled={!editable || busy}>
        {membersInPeople ? <div className="query-toolbar"><label>Everyone else<select aria-label="Default role" value={shown.defaultRole ?? ''} onChange={(event) => change((policy) => { policy.defaultRole = (event.target.value || null) as Role | null })}><option value="">No role (Settings only)</option>{roles.map((role) => <option key={role}>{role}</option>)}</select></label><small className="muted">Each person's app access role is set in the People section above.</small></div> : <>
        <h3>Members</h3>
        <div className="query-toolbar">
          <input className="search" aria-label="Search members" placeholder="Search email or name" value={search} onChange={(event) => setSearch(event.target.value)} />
          <form className="inline-form" onSubmit={addMember}>
            {people.length > 0 && <select aria-label="Person to add" value={pick} onChange={(event) => setPick(event.target.value)}><option value="">Choose a person ({candidates.length})…</option>{candidates.map((person) => <option key={person.email} value={person.email}>{label(person)}</option>)}<option value="other">Other (enter an email)…</option></select>}
            {(!people.length || pick === 'other') && <input type="text" aria-label="Email to add" placeholder="name@company.com" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />}
            <button type="submit" className="ghost" disabled={people.length > 0 && !pick}>Add member</button>
          </form>
          {!people.length && <small className="muted">Load the Time Writing (QMS-0025) data to choose people by name.</small>}
          <label>Everyone else<select aria-label="Default role" value={shown.defaultRole ?? ''} onChange={(event) => change((policy) => { policy.defaultRole = (event.target.value || null) as Role | null })}><option value="">No role (Settings only)</option>{roles.map((role) => <option key={role}>{role}</option>)}</select></label>
        </div>
        <div className="azure-table"><table className="access-table"><thead><tr><th>Member</th>{roles.map((role) => <th key={role}>{role}</th>)}<th /></tr></thead><tbody>
          {members.map(([email, assigned]) => <tr key={email}>
            <td>{nameOf(email) ? <><strong>{nameOf(email)}</strong><small>{email}</small></> : <strong>{email}</strong>}</td>
            {roles.map((role) => <td key={role}><input type="checkbox" aria-label={`${role} for ${email}`} checked={assigned.includes(role)} onChange={() => change((policy) => { policy.members[email] = toggle(policy.members[email] ?? [], role) })} /></td>)}
            <td><button type="button" className="text-button" onClick={() => change((policy) => { delete policy.members[email] })}>Remove</button></td>
          </tr>)}
          {!members.length && <tr><td colSpan={roles.length + 2} className="muted">{search ? 'No member matches.' : 'No members yet: everyone has the default role.'}</td></tr>}
        </tbody></table></div>
        </>}
      </fieldset>
      <h3>What each role sees and may do</h3>
      <p className="muted">Each cell is <strong>Allow</strong>, <strong>Deny</strong> or <strong>Not set</strong>. A person gets everything any of their roles allows, except what any of their roles denies: a denial wins. Not set means not allowed unless another role allows it.</p>
      <div className="query-toolbar"><input className="search" aria-label="Search permissions" placeholder="Search permissions" value={find} onChange={(event) => setFind(event.target.value)} /></div>
      <fieldset className="plain-fieldset" disabled={!editable || busy}>
        <div className="azure-table"><table className="access-table access-matrix"><thead><tr><th>Permission</th>{roles.map((role) => <th key={role}>{role}</th>)}</tr></thead><tbody>
          {matrixGroups.map((group) => { const rows = group.rows.filter((row) => !find.trim() || `${group.label} ${row.label}`.toLowerCase().includes(find.trim().toLowerCase())); return rows.length ? <Fragment key={group.label}>
            <tr className="access-group"><th colSpan={roles.length + 1} scope="colgroup">{group.label}</th></tr>
            {rows.map((row) => <tr key={row.key}><td>{row.label}</td>{roles.map((role) => { const cell = cellOf(shown.roles[role], row.key); return <td key={role}><select className={`access-cell access-${cell}`} aria-label={`${role}: ${row.label}`} value={cell} onChange={(event) => change((policy) => setCell(policy.roles[role], row.key, event.target.value as Cell))}><option value="allow">Allow</option><option value="deny">Deny</option><option value="unset">Not set</option></select></td> })}</tr>)}
          </Fragment> : null })}
          <tr><td colSpan={roles.length + 1}><small className="muted">Settings is always there, for each person’s own connections and tokens.</small></td></tr>
        </tbody></table></div>
      </fieldset>
      <h3>Check access</h3>
      <div className="query-toolbar access-check">
        <select aria-label="Check access for" value={checkWho} onChange={(event) => setCheckWho(event.target.value)}><option value="">Choose a person…</option>{checkPeople.map((person) => <option key={person.email} value={person.email}>{label(person)}</option>)}</select>
        <select aria-label="Check permission" value={checkWhat} onChange={(event) => setCheckWhat(event.target.value as Permission)}>{matrixGroups.map((group) => <optgroup key={group.label} label={group.label}>{group.rows.map((row) => <option key={row.key} value={row.key}>{row.label}</option>)}</optgroup>)}</select>
        {checkWho && (() => { const answer = explainAccess(shown, checkWho, checkWhat); return <span role="status" className="access-answer">{answer.allowed ? <Pill tone="open">Allowed</Pill> : <Pill tone="danger">Not allowed</Pill>} {answer.deniedBy.length ? `Denied by ${answer.deniedBy.join(', ')}.` : answer.allowedBy.length ? `Allowed by ${answer.allowedBy.join(', ')}.` : answer.roles.length ? `None of ${answer.roles.join(', ')} allows it.` : 'No role (no default role either).'}{draft ? ' (unsaved changes included)' : ''}</span> })()}
      </div>
      {editable && dirty && <form className="git-bar git-bar-dirty" onSubmit={save}>
        <span><strong>Unsaved access changes</strong> — not yet in Git</span>
        <input aria-label="Change description" value={commit} onChange={(event) => setCommit(event.target.value)} placeholder="Describe the change (e.g. Scrum Master role for …)" />
        <button type="button" className="ghost" disabled={busy} onClick={() => { setDraft(null); setResult(null) }}>Discard</button>
        <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save to Git'}</button>
      </form>}
    </>}
    {result && <Notice tone={result.tone}>{result.text}{result.url && <> <a href={result.url} target="_blank" rel="noreferrer">View commit</a></>}</Notice>}
    
  </Panel>
}
