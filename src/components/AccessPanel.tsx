import { Fragment, useState } from 'react'
import { actionGroups, actions, areas, cellOf, defaultPolicy, explainAccess, setCell, type Cell, type Permission, isEmail, normalEmail, roles, serializeAccess, withMemberRoles, type AccessPolicy, type Role } from '../access'
import type { AccessBase } from '../accessSave'
import type { Access } from '../useAccess'
import type { GitStorage } from '../useGitStorage'
import { MultiSelect } from './MultiSelect'
import { Modal, Notice, Panel, Pill, WriteBlocked } from './ui'

// Admin → People & access → Role rights: the default role and what each role sees and may do, and the app access of
// emails that are not a person in Azure DevOps. Shown to everyone; changed and saved to Git (access.json) only by a
// role that may manage access, with a Git token that can write.
// CAP-49: each person's app access role is set in the People section with the rest of their mapping. CON-134
// (AR-011): app access for an email no one in Azure DevOps has (accessOnly — a leaver, someone outside the team) is
// listed here with Remove…, and Give access by email… adds or changes one; both save through access.save (CON-131).
export function AccessPanel({ access, git, people, accessOnly }: { access: Access; git: GitStorage; people: { email: string; name: string }[]; accessOnly: [string, Role[]][] }) {
  const [draft, setDraft] = useState<AccessPolicy | null>(null)
  // CON-132 (AR-002): the policy and version (sha) the draft was made from; Save writes over that version only.
  const [draftBase, setDraftBase] = useState<AccessBase | null>(null)
  const [commit, setCommit] = useState('')
  const [busy, setBusy] = useState(false)
  const [find, setFind] = useState('')
  const [checkWho, setCheckWho] = useState('')
  const [checkWhat, setCheckWhat] = useState<Permission>('azure.write')
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string; url?: string } | null>(null)
  // CON-134: Remove… of one access-only email, or Give access by email….
  const [removing, setRemoving] = useState<[string, Role[]] | null>(null)
  const [giving, setGiving] = useState(false)
  const editable = git.connected && !git.readOnly && !git.isSample && access.can('access.manage')
  const shown = draft ?? access.policy
  const dirty = Boolean(draft) && (!access.policy || serializeAccess(draft!) !== serializeAccess(access.policy))
  // A newer access.json was loaded (e.g. quietly, GIT-23) while the draft was open: Save would be refused (CON-132).
  const stale = dirty && Boolean(draftBase) && draftBase!.sha !== access.sha
  const change = (update: (policy: AccessPolicy) => void) => {
    const next = structuredClone(shown ?? defaultPolicy(access.email)); update(next)
    if (!draft) setDraftBase({ policy: access.policy, sha: access.sha })
    setDraft(next); setResult(null)
  }
  const discard = () => { setDraft(null); setDraftBase(null); setResult(null) }
  // Two people with the same name are told apart by their email.
  const label = (person: { email: string; name: string }) => people.filter((entry) => entry.name === person.name).length > 1 ? `${person.name} (${person.email})` : person.name
  // CON-94: the matrix rows: the menu areas, then each group of actions.
  const matrixGroups: { label: string; rows: { key: Permission; label: string }[] }[] = [{ label: 'Menu areas (pages)', rows: areas.map((area) => ({ key: area.key, label: area.label })) }, ...actionGroups.map((group) => ({ label: group, rows: actions.filter((action) => action.group === group).map((action) => ({ key: action.key, label: action.label })) }))]
  const checkPeople = [...people, ...Object.keys(shown?.members ?? {}).filter((email) => !people.some((person) => person.email === email)).map((email) => ({ email, name: email }))].sort((a, b) => a.name.localeCompare(b.name))
  // CON-134: Remove… and Give access… save at once, so they wait for unsaved matrix changes to be saved or discarded.
  const directBlocked = !editable ? (git.readOnly ? 'Your Git token can read but not save.' : !access.can('access.manage') ? 'Changing app access needs “Manage access” (Role rights).' : 'Changing app access needs Git storage with a token that can write (not the synthetic sample).') : dirty ? 'Save or discard the unsaved access changes below first.' : ''

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!draft) return
    setBusy(true)
    try {
      // CON-131, CON-132: the Tool Owner rule, Manage access kept, and written over the version the draft was made from.
      const saved = await access.save(draft, commit.trim() || 'Update access roles', draftBase ?? undefined)
      setDraft(null); setDraftBase(null); setCommit(''); setResult({ tone: 'success', text: `Saved to ${access.path}.`, url: saved.commitUrl })
    } catch (failure) { setResult({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }) }
    finally { setBusy(false) }
  }

  const you = access.email ? <>You are <strong>{access.email}</strong> (the email on your Time Writing connection){access.policy ? <> · {access.rights.roles.length ? access.rights.roles.map((role) => <Pill key={role} tone="info">{role}</Pill>) : <Pill tone="danger">no role</Pill>}{access.policy.members[access.email] ? '' : ' (default role)'}</> : ''}.</>
    : <>Your roles follow the email on your Time Writing connection (Admin → Streams → the connection's email field). None is set{access.policy ? ', so the default role applies' : ''}.</>
  return <Panel className="admin-section" eyebrow="ACCESS" title="Roles and access" info={<>Which menu areas each role sees and what it may do, and who has which role (by the email on their Time Writing connection). Stored in Git as {access.path || 'access.json'}, so only people who can write to the data repository can change it. Roles decide what this app shows and does; what each person can read or change in Azure DevOps and GitHub is still decided by their own tokens and project permissions.{access.history && <> <a href={access.history} target="_blank" rel="noreferrer">History</a></>}</>}
    action={access.policy && editable ? <button type="button" className="ghost" onClick={() => { discard(); void access.reload() }}>Reload from Git</button> : undefined}>
    <Notice tone={access.email ? 'info' : 'warning'}>{you}</Notice>
    {!git.connected && <Notice tone="info">Connect Git storage (Admin → Data & history) to use access roles. {access.policy ? 'The roles last loaded in this browser still apply.' : 'Until they are loaded, the app is read-only: everyone sees every page, nobody can make changes.'}</Notice>}
    {access.error && <Notice tone="error">{access.path}: {access.error}</Notice>}
    {/* CON-101: no roles file yet: the app is read-only; the viewer may set up the first one (bootstrap). */}
    {git.connected && access.bootstrap && !shown && <Notice tone="warning">No access roles yet: the app is read-only — everyone sees every page, nobody can make changes. {editable ? <button type="button" className="text-button" onClick={() => setDraft(defaultPolicy(access.email))}>Set up roles →</button> : 'Someone who can write to the data repository can set them up here.'}</Notice>}
    {shown && <>
      {!editable && <p className="muted">{git.readOnly ? 'View only: your Git token can read but not save.' : 'View only: your role does not include “Manage access”.'}</p>}
      <fieldset className="plain-fieldset" disabled={!editable || busy}>
        <div className="query-toolbar"><label>Everyone else<select aria-label="Default role" value={shown.defaultRole ?? ''} onChange={(event) => change((policy) => { policy.defaultRole = (event.target.value || null) as Role | null })}><option value="">No role (Settings only)</option>{roles.map((role) => <option key={role}>{role}</option>)}</select></label><small className="muted">Each person's app access role is set in the People section.</small></div>
      </fieldset>
      <h3>Access for emails not in Azure DevOps</h3>
      <p className="muted">App access of emails no one in Azure DevOps has (for example someone who left, or who is not in the team). Remove a leaver's access here.</p>
      <div className="query-toolbar"><button type="button" className="ghost" disabled={Boolean(directBlocked)} title={directBlocked || undefined} onClick={() => { setGiving(true); setResult(null) }}>Give access by email…</button><WriteBlocked reason={directBlocked} /></div>
      <div className="azure-table"><table className="access-table access-only-table"><thead><tr><th>Email</th><th>App access roles</th><th /></tr></thead><tbody>
        {accessOnly.map(([email, assigned]) => <tr key={email}>
          <td><strong>{email}</strong></td>
          <td>{assigned.map((role) => <Pill key={role} tone="info">{role}</Pill>)}</td>
          <td><button type="button" className="text-button" aria-label={`Remove access of ${email}`} disabled={Boolean(directBlocked)} title={directBlocked || undefined} onClick={() => { setRemoving([email, assigned]); setResult(null) }}>Remove…</button></td>
        </tr>)}
        {!accessOnly.length && <tr><td colSpan={3} className="muted">No app access for emails outside Azure DevOps.</td></tr>}
      </tbody></table></div>
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
      {editable && stale && <Notice tone="warning">Someone else saved {access.path || 'access.json'} after you started these changes. Save is refused so their change is not lost: Discard, or Reload from Git, then make your change again.</Notice>}
      {editable && dirty && <form className="git-bar git-bar-dirty" onSubmit={save}>
        <span><strong>Unsaved access changes</strong> — not yet in Git</span>
        <input aria-label="Change description" value={commit} onChange={(event) => setCommit(event.target.value)} placeholder="Describe the change (e.g. Scrum Master role for …)" />
        <button type="button" className="ghost" disabled={busy} onClick={discard}>Discard</button>
        <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save to Git'}</button>
      </form>}
    </>}
    {result && <Notice tone={result.tone}>{result.text}{result.url && <> <a href={result.url} target="_blank" rel="noreferrer">View commit</a></>}</Notice>}
    {removing && access.policy && <RemoveAccessDialog email={removing[0]} assigned={removing[1]} path={access.path} onClose={() => setRemoving(null)}
      onRemove={async () => { const saved = await access.save(withMemberRoles(access.policy!, removing[0], []), `Access: remove ${removing[0]} (not in Azure DevOps)`); setRemoving(null); setResult({ tone: 'success', text: `App access of ${removing[0]} removed; saved to ${access.path}.`, url: saved.commitUrl }) }} />}
    {giving && access.policy && <GiveAccessDialog path={access.path} known={people.map((person) => person.email)} onClose={() => setGiving(false)}
      onGive={async (email, chosen) => { const saved = await access.save(withMemberRoles(access.policy!, email, chosen), `Access: ${email} → ${chosen.join(', ')}`); setGiving(false); setResult({ tone: 'success', text: `${email}: ${chosen.join(', ')}; saved to ${access.path}.`, url: saved.commitUrl }) }} />}
  </Panel>
}

const failureText = (failure: unknown) => failure instanceof Error ? failure.message : String(failure)

// CON-134: the confirmation of Remove… (UI-STANDARDS §4: a pop-up that names what changes).
function RemoveAccessDialog({ email, assigned, path, onClose, onRemove }: { email: string; assigned: Role[]; path: string; onClose: () => void; onRemove: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <Modal eyebrow="ROLE RIGHTS · APP ACCESS" title={`Remove access of ${email}`} onClose={onClose}>
    <form aria-label={`Remove access of ${email}`} onSubmit={(event) => { event.preventDefault(); setBusy(true); setError(''); void onRemove().catch((failure: unknown) => setError(failureText(failure))).finally(() => setBusy(false)) }}>
      <p>{email} loses the app access roles {assigned.join(', ') || '(none)'}; the default role then applies to this email. Saved to {path || 'access.json'} in Git at once.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Remove access'}</button></div>
    </form>
  </Modal>
}

// CON-134: Give access by email… — an email and its app access roles (as a whole, CON-104), saved at once.
function GiveAccessDialog({ path, known, onClose, onGive }: { path: string; known: string[]; onClose: () => void; onGive: (email: string, chosen: Role[]) => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [chosen, setChosen] = useState<Role[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const typed = normalEmail(email)
  const missing = !isEmail(typed) ? 'Enter an email address.' : !chosen.length ? 'Choose at least one app access role.' : ''
  return <Modal eyebrow="ROLE RIGHTS · APP ACCESS" title="Give access by email" onClose={onClose}>
    <form aria-label="Give access by email" onSubmit={(event) => { event.preventDefault(); if (missing) return; setBusy(true); setError(''); void onGive(typed, chosen).catch((failure: unknown) => setError(failureText(failure))).finally(() => setBusy(false)) }}>
      <label>Email<input type="email" aria-label="Email" required value={email} onChange={(event) => setEmail(event.target.value)} /><small>{known.includes(typed) ? 'This person is in Azure DevOps: their roles can also be set in People.' : 'For someone who is not a person in Azure DevOps. The email gets exactly the roles chosen.'} Saved to {path || 'access.json'} in Git at once.</small></label>
      <MultiSelect label="App access roles" emptyLabel="Choose roles" options={roles.map((role) => [role, role])} value={chosen} selectAll={false} onChange={(value) => setChosen(value as Role[])} />
      {error && <Notice tone="error">{error}</Notice>}
      <WriteBlocked reason={missing} />
      <div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button className="primary" disabled={busy || Boolean(missing)}>{busy ? 'Saving…' : 'Save to Git'}</button></div>
    </form>
  </Modal>
}
