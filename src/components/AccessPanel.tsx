import { useId, useState } from 'react'
import { actions, areas, defaultPolicy, isEmail, keepsManager, normalEmail, roles, serializeAccess, type AccessPolicy, type Action, type Area, type Role } from '../access'
import type { Access } from '../useAccess'
import type { GitStorage } from '../useGitStorage'
import { Notice, Panel, Pill } from './ui'

// Settings → Access: who has which role, and what each role sees and may do. Shown to everyone; changed and saved to
// Git (access.json) only by a role that may manage access, with a Git token that can write.
export function AccessPanel({ access, git, people }: { access: Access; git: GitStorage; people: { email: string; name: string }[] }) {
  const listId = useId()
  const [draft, setDraft] = useState<AccessPolicy | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [search, setSearch] = useState('')
  const [commit, setCommit] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string; url?: string } | null>(null)
  const editable = git.connected && !git.readOnly && !git.isSample && access.can('access.manage')
  const shown = draft ?? access.policy
  const dirty = Boolean(draft) && (!access.policy || serializeAccess(draft!) !== serializeAccess(access.policy))
  const change = (update: (policy: AccessPolicy) => void) => { const next = structuredClone(shown ?? defaultPolicy(access.email)); update(next); setDraft(next); setResult(null) }
  const toggle = <T extends string>(list: T[], value: T) => list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]
  const nameOf = (email: string) => people.find((person) => person.email === email)?.name
  const members = Object.entries(shown?.members ?? {}).filter(([email]) => !search.trim() || `${email} ${nameOf(email) ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())).sort(([a], [b]) => a.localeCompare(b))

  function addMember(event: React.FormEvent) {
    event.preventDefault()
    const email = normalEmail(newEmail.replace(/^.*<([^>]+)>\s*$/, '$1'))
    if (!isEmail(email)) { setResult({ tone: 'error', text: 'Enter an email address.' }); return }
    change((policy) => { policy.members[email] = policy.members[email] ?? [policy.defaultRole ?? 'Team Member'] })
    setNewEmail('')
  }
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!draft) return
    if (!keepsManager(draft, access.email)) { setResult({ tone: 'error', text: access.email ? `Not saved: ${access.email} would lose “Manage access”. Keep a role with it for yourself (e.g. Admin).` : 'Not saved: your email is not known yet (it comes from the Time Writing PAT), so the app cannot check that you keep “Manage access”.' }); return }
    setBusy(true)
    try {
      const saved = await access.save(draft, commit.trim() || 'Update access roles')
      setDraft(null); setCommit(''); setResult({ tone: 'success', text: `Saved to ${access.path}.`, url: saved.commitUrl })
    } catch (failure) { setResult({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }) }
    finally { setBusy(false) }
  }

  const you = access.email ? <>You are <strong>{access.email}</strong>{access.name && access.name !== access.email ? ` (${access.name})` : ''}, from your Azure DevOps PAT{access.policy ? <> · {access.rights.roles.length ? access.rights.roles.map((role) => <Pill key={role} tone="info">{role}</Pill>) : <Pill tone="danger">no role</Pill>}{access.policy.members[access.email] ? '' : ' (default role)'}</> : ''}.</>
    : access.identityError ? <>Your email could not be read from Azure DevOps: {access.identityError}{access.policy ? ' The default role applies.' : ''}</>
      : <>Your email comes from the Time Writing connection’s PAT{access.policy ? '; until it is known, the default role applies' : ''}.</>
  return <Panel className="admin-section" eyebrow="ACCESS" title="Roles and access" detail={<>Which menu areas each role sees and what it may do, and who has which role (by the email of their Azure DevOps PAT). Stored in Git as {access.path || 'access.json'}, so only people who can write to the data repository can change it.{access.history && <> <a href={access.history} target="_blank" rel="noreferrer">History</a></>}</>}
    action={access.policy && editable ? <button type="button" className="ghost" onClick={() => { setDraft(null); setResult(null); void access.reload() }}>Reload from Git</button> : undefined}>
    <Notice tone={access.identityError ? 'warning' : 'info'}>{you}</Notice>
    {!git.connected && <Notice tone="info">Connect Git storage (Storage tab) to use access roles. {access.policy ? 'The roles last loaded in this browser still apply.' : 'Without them, everyone sees every page.'}</Notice>}
    {access.error && <Notice tone="error">{access.path}: {access.error}</Notice>}
    {git.connected && access.loaded && !shown && <Notice tone="info">No access roles yet: everyone sees every page and may do everything. {editable ? <button type="button" className="text-button" onClick={() => setDraft(defaultPolicy(access.email))}>Set up roles →</button> : 'Someone who can write to the data repository can set them up here.'}</Notice>}
    {shown && <>
      {!editable && <p className="muted">{git.readOnly ? 'View only: your Git token can read but not save.' : 'View only: your role does not include “Manage access”.'}</p>}
      <fieldset className="plain-fieldset" disabled={!editable || busy}>
        <h3>Members</h3>
        <div className="query-toolbar">
          <input className="search" aria-label="Search members" placeholder="Search email or name" value={search} onChange={(event) => setSearch(event.target.value)} />
          <form className="inline-form" onSubmit={addMember}>
            <input type="text" aria-label="Email to add" list={listId} placeholder="name@company.com" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
            <datalist id={listId}>{people.filter((person) => !shown.members[person.email]).map((person) => <option key={person.email} value={person.email}>{person.name}</option>)}</datalist>
            <button type="submit" className="ghost">Add member</button>
          </form>
          <label>Everyone else<select aria-label="Default role" value={shown.defaultRole ?? ''} onChange={(event) => change((policy) => { policy.defaultRole = (event.target.value || null) as Role | null })}><option value="">No role (Settings only)</option>{roles.map((role) => <option key={role}>{role}</option>)}</select></label>
        </div>
        <div className="azure-table"><table className="access-table"><thead><tr><th>Email</th>{roles.map((role) => <th key={role}>{role}</th>)}<th /></tr></thead><tbody>
          {members.map(([email, assigned]) => <tr key={email}>
            <td><strong>{email}</strong>{nameOf(email) && <small>{nameOf(email)}</small>}</td>
            {roles.map((role) => <td key={role}><input type="checkbox" aria-label={`${role} for ${email}`} checked={assigned.includes(role)} onChange={() => change((policy) => { policy.members[email] = toggle(policy.members[email] ?? [], role) })} /></td>)}
            <td><button type="button" className="text-button" onClick={() => change((policy) => { delete policy.members[email] })}>Remove</button></td>
          </tr>)}
          {!members.length && <tr><td colSpan={roles.length + 2} className="muted">{search ? 'No member matches.' : 'No members yet: everyone has the default role.'}</td></tr>}
        </tbody></table></div>
        <h3>What each role sees and may do</h3>
        <div className="azure-table"><table className="access-table"><thead><tr><th>Menu area / action</th>{roles.map((role) => <th key={role}>{role}</th>)}</tr></thead><tbody>
          {areas.map((area) => <tr key={area.key}><td>{area.label}</td>{roles.map((role) => <td key={role}><input type="checkbox" aria-label={`${role} sees ${area.label}`} checked={shown.roles[role].areas.includes(area.key)} onChange={() => change((policy) => { policy.roles[role].areas = toggle<Area>(policy.roles[role].areas, area.key) })} /></td>)}</tr>)}
          <tr><td colSpan={roles.length + 1}><small className="muted">Settings is always there, for each person’s own connections and tokens.</small></td></tr>
          {actions.map((action) => <tr key={action.key}><td>{action.label}</td>{roles.map((role) => <td key={role}><input type="checkbox" aria-label={`${role} may ${action.label}`} checked={shown.roles[role].actions.includes(action.key)} onChange={() => change((policy) => { policy.roles[role].actions = toggle<Action>(policy.roles[role].actions, action.key) })} /></td>)}</tr>)}
        </tbody></table></div>
      </fieldset>
      {editable && dirty && <form className="git-bar git-bar-dirty" onSubmit={save}>
        <span><strong>Unsaved access changes</strong> — not yet in Git</span>
        <input aria-label="Change description" value={commit} onChange={(event) => setCommit(event.target.value)} placeholder="Describe the change (e.g. Scrum Master role for …)" />
        <button type="button" className="ghost" disabled={busy} onClick={() => { setDraft(null); setResult(null) }}>Discard</button>
        <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save to Git'}</button>
      </form>}
    </>}
    {result && <Notice tone={result.tone}>{result.text}{result.url && <> <a href={result.url} target="_blank" rel="noreferrer">View commit</a></>}</Notice>}
    <p className="muted"><small>Roles decide what this app shows and does. What each person can read or change in Azure DevOps and GitHub is still decided by their own tokens and project permissions.</small></p>
  </Panel>
}
