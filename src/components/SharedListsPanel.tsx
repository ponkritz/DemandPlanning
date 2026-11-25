import { useEffect, useState } from 'react'
import { EmptyState, Modal, Notice, Panel, SaveQueueStatus, WriteBlocked } from './ui'
import { formatDateTime } from '../format'
import { readTeamIdentities } from '../azureRead'
import type { ListItem } from '../onDemand'
import { cleanItems, cleanSource, createList, diffEmpty, diffItems, editList, emptySharedLists, listNameProblem, maxListName, refreshList, sharedListsFile, sourceConfig, sourceLabel, teamRef, upsertSharedList, type ListDiff, type SharedList, type TeamSource } from '../sharedLists'
import type { SharedListsStore } from '../useSharedLists'

// LST-03…LST-07, LST-12, LST-13: Admin → Epic & Feature setup → Value lists → "Team lists from Azure DevOps": the built-in
// lists of people that On-Demand columns use. Everyone sees them (name, source, people, last refreshed, used by, the log);
// ＋ New list…, ↻ Refresh… and Edit… need "Manage built-in lists" or a page co-ownership, Remove "Manage built-in lists"
// and a list no column uses — disabled with the reason otherwise (UI-STANDARDS §3). A refresh reads the team's members
// from Azure DevOps with the viewer's own PAT (read only) and shows who is added, removed and renamed before Save to Git.
export interface SharedListsEnv {
  store: SharedListsStore
  block: string // why the viewer cannot create, refresh or edit ('' when they can)
  removeBlock: (usedBy: string[]) => string // why the viewer cannot remove a list ('' when they can)
  by: string // who is written in the log (the viewer's display name; never an email, LST-04)
  connection: { server: string; project: string; team: string } | null // the Time Writing connection, as the default source
  patFor: (server: string) => string // the viewer's PAT for a server, from this browser ('' when none)
  usage: (ref: string) => string[] // the columns that use a list ("Page: Column")
  rowsWith: (ref: string, names: string[]) => number // how many rows hold one of these names in a column of the list
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function SharedListsPanel({ env }: { env: SharedListsEnv }) {
  const { store, block } = env
  const file = store.file ?? emptySharedLists()
  const lists = [...file.lists].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  const [dialog, setDialog] = useState<{ mode: 'new' } | { mode: 'edit' | 'refresh' | 'log' | 'remove'; list: SharedList } | null>(null)
  const close = () => setDialog(null)
  return <Panel className="admin-section shared-lists" eyebrow="BUILT-IN LISTS" title="Team lists from Azure DevOps" action={<button type="button" className="primary" disabled={Boolean(block)} title={block || undefined} onClick={() => setDialog({ mode: 'new' })}>＋ New list…</button>} info={<>
    <p>Lists of people — the members of an Azure DevOps team, with their display names (and, to tell people apart, their Azure DevOps identity ids; no emails) — that the On-Demand table pages use as the choices of a column (<strong>Dropdown (built-in list)</strong>, <strong>Multi-select (built-in list)</strong>). The Value lists above can be used the same way.</p>
    <p><strong>↻ Refresh…</strong> reads the team again from Azure DevOps with your own PAT (read only; nothing is written to Azure DevOps) and shows who is added, removed and renamed before you save. A row keeps a person who leaves the list, marked “not in the list”; a renamed person (the same Azure DevOps identity) keeps their rows under the new name. Two people with the same display name are told apart by a short part of their identity id, e.g. “Sam Lee (#3f2a)”.</p>
    <p>Shared with everyone in Git as {sharedListsFile}. Created, refreshed and edited by “Manage built-in lists” (Tool Owner, Admin and Scrum Master by default) and by the co-owners of On-Demand pages; removed by “Manage built-in lists” only, and only when no column uses the list.</p>
  </>}>
    {store.error && <Notice tone="warning">{sharedListsFile} could not be used, so the lists stay as they were: {store.error}</Notice>}
    <WriteBlocked reason={block} />
    {lists.length ? <div className="azure-table"><table aria-label="Team lists from Azure DevOps" className="shared-lists-table">
      <thead><tr><th>List</th><th>Source</th><th className="num">People</th><th>Last refreshed</th><th>Used by</th><th>Actions</th></tr></thead>
      <tbody>{lists.map((list) => { const usedBy = env.usage(teamRef(list.id)), removeWhy = env.removeBlock(usedBy); return <tr key={list.id}>
        <td><strong>{list.name}</strong></td>
        <td>{sourceLabel(list.source)}</td>
        <td className="num">{list.items.length}</td>
        <td>{list.refreshedAt ? `${formatDateTime(list.refreshedAt)}${list.refreshedBy ? ` by ${list.refreshedBy}` : ''}` : '—'}</td>
        <td>{usedBy.length ? usedBy.join(', ') : <span className="muted">Not used yet</span>}</td>
        <td className="nowrap"><span className="button-row">
          <button type="button" className="ghost" aria-label={`Refresh ${list.name}`} disabled={Boolean(block)} title={block || undefined} onClick={() => setDialog({ mode: 'refresh', list })}>↻ Refresh…</button>
          <button type="button" className="ghost" aria-label={`Edit ${list.name}`} disabled={Boolean(block)} title={block || undefined} onClick={() => setDialog({ mode: 'edit', list })}>Edit…</button>
          <button type="button" className="text-button" aria-label={`Log of ${list.name}`} onClick={() => setDialog({ mode: 'log', list })}>Log</button>
          <button type="button" className="text-button danger-text" aria-label={`Remove ${list.name}`} disabled={Boolean(removeWhy)} title={removeWhy || undefined} onClick={() => setDialog({ mode: 'remove', list })}>Remove</button>
        </span></td>
      </tr> })}</tbody>
    </table></div> : <EmptyState title="No team lists yet." detail={block ? undefined : 'Create one with ＋ New list…: give it a name and the Azure DevOps team whose members it lists.'} />}
    <SaveQueueStatus state={store.queue} onRetry={() => void store.retry()} />
    {dialog?.mode === 'new' && <ListDialog env={env} onClose={close} />}
    {(dialog?.mode === 'edit' || dialog?.mode === 'refresh') && <ListDialog env={env} list={dialog.list} refresh={dialog.mode === 'refresh'} onClose={close} />}
    {dialog?.mode === 'log' && <LogDialog list={dialog.list} onClose={close} />}
    {dialog?.mode === 'remove' && <RemoveDialog env={env} list={dialog.list} onClose={close} />}
  </Panel>
}

// LST-03, LST-06, LST-07: New list… (name and team, then the members read), Edit… (name and team) and Refresh… (the
// members read again): the difference is shown before Save to Git.
function ListDialog({ env, list, refresh = false, onClose }: { env: SharedListsEnv; list?: SharedList; refresh?: boolean; onClose: () => void }) {
  const file = env.store.file ?? emptySharedLists()
  const start = list?.source ?? (env.connection ? { kind: 'azure-team' as const, ...env.connection } : { kind: 'azure-team' as const, server: '', project: '', team: '' })
  const [name, setName] = useState(list?.name ?? '')
  const [server, setServer] = useState(start.server)
  const [project, setProject] = useState(start.project)
  const [team, setTeam] = useState(start.team)
  // members: as kept (names and identity ids); emails: the work emails of this read, shown in the pop-up only (never saved).
  const [read, setRead] = useState<{ members: ListItem[]; diff: ListDiff; emails: Map<string, string> } | null>(null)
  const [busy, setBusy] = useState<'' | 'reading' | 'saving'>('')
  const [error, setError] = useState('')
  const source = cleanSource({ kind: 'azure-team', server, project, team })
  const reading = !list || refresh
  async function readTeam(from: TeamSource) {
    setBusy('reading'); setError(''); setRead(null)
    try {
      const pat = env.patFor(from.server)
      if (!pat) throw new Error(`No PAT for ${from.server} in this browser: add a connection on that server (Admin → Connections) or use the Time Writing connection's server.`)
      const identities = await readTeamIdentities(sourceConfig(from), pat)
      const members = cleanItems(identities)
      setRead({ members, diff: diffItems(list?.items ?? [], members), emails: new Map(identities.flatMap((entry) => entry.id && entry.email ? [[entry.id, entry.email] as const] : [])) })
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setBusy('') }
  }
  // Refresh… reads the list's team as soon as it opens.
  useEffect(() => { if (refresh && list) void Promise.resolve().then(() => readTeam(list.source)) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    setError('')
    if (env.block) return
    const problem = listNameProblem(file, name, list?.id ?? '') || (!source ? 'Give the server (https), the project and the team.' : '')
    if (problem) { setError(problem); return }
    setBusy('saving')
    try {
      let next: SharedList, message: string
      if (!list) { if (!read) throw new Error('Read the team first.'); next = createList(file, { name, source: source!, members: read.members }, { by: env.by }); message = `Built-in lists: create ${next.name} (${plural(next.items.length, 'person', 'people')} from ${source!.team})` }
      else if (refresh) { if (!read) throw new Error('Read the team first.'); next = refreshList(list, read.members, { by: env.by }); message = `Built-in lists: refresh ${list.name} (${read.diff.added.length} added, ${read.diff.removed.length} removed, ${read.diff.renamed.length} renamed)` }
      else { next = editList(list, { name, source: source! }, { by: env.by }); if (next === list) { onClose(); return } message = `Built-in lists: edit ${list.name}` }
      await env.store.save(upsertSharedList(file, next), message)
      onClose()
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy('') }
  }
  const title = !list ? 'New team list' : refresh ? `Refresh ${list.name}` : `Edit ${list.name}`
  const removedRows = read && list ? env.rowsWith(teamRef(list.id), read.diff.removed.map((item) => item.name)) : 0
  const why = env.block || (busy === 'saving' ? 'Saving to Git…' : busy === 'reading' ? 'Reading the team from Azure DevOps…' : reading && !read ? (list ? 'The team could not be read: see above.' : 'Read the team first.') : '')
  return <Modal title={title} eyebrow="SETTINGS · BUILT-IN LISTS" wide={Boolean(read)} onClose={() => { if (!busy) onClose() }}>
    <form className="shared-list-form" onSubmit={(event) => { event.preventDefault(); void save() }}>
      {!refresh && <>
        <label>Name<input aria-label="List name" required maxLength={maxListName} value={name} onChange={(event) => { setName(event.target.value); setError('') }} placeholder="e.g. QE team" /><small>Shown in the column setup of the On-Demand pages.</small></label>
        <label>Azure DevOps server<input aria-label="Azure DevOps server" required value={server} onChange={(event) => { setServer(event.target.value); setRead(null) }} placeholder="https://dev.azure.com/your-organization" /><small>dev.azure.com/&lt;organization&gt; or your Azure DevOps Server collection; read with your own PAT for that server (one PAT per server, kept in this browser).</small></label>
        <div className="form-row"><label>Project<input aria-label="Project" required value={project} onChange={(event) => { setProject(event.target.value); setRead(null) }} /></label><label>Team<input aria-label="Team" required value={team} onChange={(event) => { setTeam(event.target.value); setRead(null) }} /></label></div>
      </>}
      {refresh && list && <p className="muted">{sourceLabel(list.source)} · {plural(list.items.length, 'person', 'people')} now{list.refreshedAt ? ` · last refreshed ${formatDateTime(list.refreshedAt)}` : ''}</p>}
      {reading && !refresh && <div className="button-row"><button type="button" className="ghost" disabled={!source || busy !== ''} title={!source ? 'Give the server (https), the project and the team first.' : undefined} onClick={() => void readTeam(source!)}>↻ Read the team</button></div>}
      {busy === 'reading' && <p className="muted" role="status">Reading the team from Azure DevOps…</p>}
      {read && <DiffView diff={read.diff} emails={read.emails} removedRows={removedRows} total={read.members.length} first={!list} />}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><WriteBlocked reason={why} /><button type="button" className="ghost" disabled={busy === 'saving'} onClick={onClose}>Cancel</button><button className="primary" disabled={Boolean(why)}>{busy === 'saving' ? 'Saving to Git…' : 'Save to Git'}</button></div>
    </form>
  </Modal>
}

// LST-06: who is added, removed and renamed (the same identity id) — what saving changes; each person read with the email
// Azure DevOps gives, as a hint on the screen only (LST-04: not saved).
function DiffView({ diff, emails, removedRows, total, first }: { diff: ListDiff; emails: Map<string, string>; removedRows: number; total: number; first: boolean }) {
  const hint = (id: string | undefined) => id && emails.get(id) ? <small className="muted"> {emails.get(id)}</small> : null
  const person = (item: ListItem) => <li key={`${item.id ?? ''}|${item.name}`}>{item.name}{hint(item.id)}</li>
  return <section className="shared-list-diff" aria-label="Changes from Azure DevOps">
    <p><strong>{first ? `${plural(total, 'team member', 'team members')} read from Azure DevOps.` : diffEmpty(diff) ? 'The list is up to date: nobody added, removed or renamed.' : `${diff.added.length} added · ${diff.removed.length} removed · ${diff.renamed.length} renamed · ${diff.kept} unchanged`}</strong></p>
    {!first && diff.added.length > 0 && <div><h3>Added</h3><ul aria-label="Added">{diff.added.map(person)}</ul></div>}
    {first && total > 0 && <div><h3>Members</h3><ul aria-label="Members">{diff.added.map(person)}</ul></div>}
    {diff.removed.length > 0 && <div><h3>Removed</h3><ul aria-label="Removed">{diff.removed.map(person)}</ul><small className="muted">{removedRows ? `${plural(removedRows, 'row')} use${removedRows === 1 ? 's' : ''} a removed person: the value is kept and shown as “not in the list”.` : 'No row uses a removed person.'}</small></div>}
    {diff.renamed.length > 0 && <div><h3>Renamed (same person in Azure DevOps)</h3><ul aria-label="Renamed">{diff.renamed.map((entry) => <li key={entry.id}>{entry.from} → {entry.to}{hint(entry.id)}</li>)}</ul><small className="muted">Their rows show the new name.</small></div>}
  </section>
}

function LogDialog({ list, onClose }: { list: SharedList; onClose: () => void }) {
  const what = { created: 'Created', refreshed: 'Refreshed', edited: 'Edited' }
  return <Modal title={`Log of ${list.name}`} eyebrow="SETTINGS · BUILT-IN LISTS" form={false} onClose={onClose}>
    {list.log.length ? <ol className="shared-list-log">{[...list.log].reverse().map((entry) => <li key={entry.id}>
      <p><strong>{what[entry.action]}</strong> · {formatDateTime(entry.at)} · {entry.by}</p>
      {entry.note && <p className="muted">{entry.note}</p>}
      {entry.added.length > 0 && <p>Added: {entry.added.join(', ')}</p>}
      {entry.removed.length > 0 && <p>Removed: {entry.removed.join(', ')}</p>}
      {entry.renamed.length > 0 && <p>Renamed: {entry.renamed.join(', ')}</p>}
    </li>)}</ol> : <p className="muted">No entries yet.</p>}
    <small className="muted">The last 50 changes of the list, each with up to 20 names; saved with the list in Git.</small>
    <div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Close</button></div>
  </Modal>
}

function RemoveDialog({ env, list, onClose }: { env: SharedListsEnv; list: SharedList; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const why = env.removeBlock(env.usage(teamRef(list.id)))
  async function remove() {
    setBusy(true); setError('')
    try { const file = env.store.file ?? emptySharedLists(); await env.store.save({ ...file, lists: file.lists.filter((entry) => entry.id !== list.id) }, `Built-in lists: remove ${list.name}`); onClose() }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) }
  }
  return <Modal title={`Remove ${list.name}?`} eyebrow="SETTINGS · BUILT-IN LISTS" form={false} onClose={() => { if (!busy) onClose() }}>
    <p>The list and its {plural(list.items.length, 'person', 'people')} leave {sharedListsFile} for everyone. No column uses it. Git keeps the earlier versions.</p>
    {error && <Notice tone="error">{error}</Notice>}
    <div className="modal-actions"><WriteBlocked reason={why} /><button type="button" className="ghost" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={busy || Boolean(why)} onClick={() => void remove()}>{busy ? 'Removing…' : 'Remove list'}</button></div>
  </Modal>
}
