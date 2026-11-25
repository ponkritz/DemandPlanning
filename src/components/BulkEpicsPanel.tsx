import { useEffect, useRef, useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { bulkEpicFor, bulkEpicMissing, bulkSharedBlocked, bulkStreams, loadMyBulkEpics, saveMyBulkEpics, type BulkStream } from '../bulkEpics'
import { normalizeReleaseSourceSettings } from '../releaseSource'
import type { PageProps } from '../pages/types'
import type { GitStorage } from '../useGitStorage'
import { Notice, Panel, WriteBlocked } from './ui'

// QV-59: Admin → Stream options → Bulk creation Epics. Per stream (DP, IOCC, Content), the Epic its
// Create Features works under: a shared default (managers; saved to Git with the planning data) and each person's own
// choice (this browser), which wins. The Feature setup of that Epic gives the DoD, sets, stories and QE columns.
// No Epic is built in — a stream with neither is "not set" and its Create Features is disabled.
export function BulkEpicsPanel({ store, items, canManage, git }: { store: PageProps['store']; items: AzureWorkItem[]; canManage: boolean; git?: GitStorage }) {
  const shared = normalizeReleaseSourceSettings(store.state.releaseSourceSettings).bulkEpics ?? {}
  const blocked = bulkSharedBlocked(git)
  // The change lands in the store on the next render; commit once it is there (git.save reads the current state).
  // A shared Epic is committed straight to Git (QV-59). The change lands in the store on the next render, and git.save
  // reads the current state, so the commit runs once the new value is there (each Save once).
  const [pending, setPending] = useState<{ stream: BulkStream; id?: number } | null>(null)
  const committed = useRef<typeof pending>(null)
  const landed = pending ? shared[pending.stream] : undefined
  useEffect(() => {
    if (!pending || !git || committed.current === pending || landed !== pending.id) return
    committed.current = pending
    void git.save(pending.id ? `Bulk creation Epic: ${pending.stream} → #${pending.id}` : `Bulk creation Epic: ${pending.stream} cleared`)
  }, [pending, landed, git])
  const [mine, setMine] = useState(() => loadMyBulkEpics())
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const title = (id?: number) => { const epic = id ? items.find((item) => item.id === id && item.workItemType === 'Epic') : undefined; return epic ? `#${epic.id} ${epic.title}` : id ? `#${id} (not on the loaded board)` : '—' }
  const valid = (text: string) => text.trim() === '' || /^\d{1,9}$/.test(text.trim())
  const draftOf = (key: string, value?: number) => drafts[key] ?? (value ? String(value) : '')
  const saveShared = (stream: BulkStream, text: string) => store.update((state) => {
    const settings = normalizeReleaseSourceSettings(state.releaseSourceSettings)
    const next = { ...(settings.bulkEpics ?? {}) }
    if (text.trim()) next[stream] = Number(text); else delete next[stream]
    state.releaseSourceSettings = { ...settings, bulkEpics: Object.keys(next).length ? next : undefined }
    state.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Update', entity: 'ReleaseSourceSettings', entityId: `bulk:${stream}`, detail: text.trim() ? `${stream} bulk creation under Epic #${text.trim()} (shared)` : `${stream} bulk creation Epic cleared (shared): not set` })
    return state
  })
  const saveMine = (stream: BulkStream, text: string) => { const next = { ...mine }; if (text.trim()) next[stream] = Number(text); else delete next[stream]; saveMyBulkEpics(next); setMine(next) }
  return <Panel className="connection-panel bulk-epics" eyebrow="BULK CREATION" title="Bulk creation Epics" info={<ul><li>The Epic under which Create Features (DP, IOCC, Content release tables) creates the Features; that Epic's Feature setup gives the DoD, release type sets, User Stories and QE Mapping columns.</li><li>Shared: the default for everyone; Save commits it to Git straight away (with any other unsaved planning changes). Mine: your own choice in this browser, used instead of the shared one.</li><li>No Epic is built in: a stream with neither is not set, and its Create Features stays disabled until one is mapped here.</li></ul>}>
    <div className="azure-table"><table aria-label="Bulk creation Epics"><thead><tr><th>Stream</th><th>Shared</th><th>Mine</th><th>Used</th></tr></thead><tbody>
      {bulkStreams.map((stream) => {
        const used = bulkEpicFor(stream, shared, mine)
        const sharedKey = `shared:${stream}`, mineKey = `mine:${stream}`
        const sharedText = draftOf(sharedKey, shared[stream]), mineText = draftOf(mineKey, mine[stream])
        return <tr key={stream}><td><strong>{stream}</strong></td>
          <td><input aria-label={`${stream} shared bulk Epic`} inputMode="numeric" placeholder="Epic ID" disabled={!canManage || !!blocked} value={sharedText} onChange={(event) => setDrafts({ ...drafts, [sharedKey]: event.target.value })} />{canManage && !blocked && drafts[sharedKey] != null && <button type="button" className="ghost" disabled={!valid(sharedText) || git?.status === 'saving'} onClick={() => { saveShared(stream, sharedText); setPending({ stream, id: sharedText.trim() ? Number(sharedText) : undefined }); setDrafts(({ [sharedKey]: _drop, ...rest }) => rest) }}>Save to Git</button>}</td>
          <td><input aria-label={`${stream} my bulk Epic`} inputMode="numeric" placeholder="Epic ID" value={mineText} onChange={(event) => setDrafts({ ...drafts, [mineKey]: event.target.value })} />{drafts[mineKey] != null && <button type="button" className="ghost" disabled={!valid(mineText)} onClick={() => { saveMine(stream, mineText); setDrafts(({ [mineKey]: _drop, ...rest }) => rest) }}>Save</button>}</td>
          <td>{title(used.epicId)}<small className="muted"> · {used.source === 'mine' ? 'mine' : used.source === 'shared' ? 'shared' : 'not set'}</small></td></tr>
      })}
    </tbody></table></div>
    {canManage && blocked && <WriteBlocked reason={blocked} />}
    {pending && !blocked && git && ['saving', 'synced', 'error', 'conflict'].includes(git.status) && git.message && <Notice tone={git.status === 'error' || git.status === 'conflict' ? 'error' : git.status === 'synced' ? 'success' : 'info'}>{git.message}</Notice>}
  </Panel>
}

// QV-59: next to a disabled Create Features when the stream has no bulk creation Epic: the reason and a way there.
export function BulkEpicNotSet({ stream, onOpen }: { stream: BulkStream; onOpen?: () => void }) {
  return <><WriteBlocked reason={bulkEpicMissing(stream)} />{onOpen && <button type="button" className="text-button" onClick={onOpen}>Open Bulk creation Epics</button>}</>
}
