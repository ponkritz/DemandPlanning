import { useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { bulkEpicFor, bulkStreams, builtInBulkEpics, loadMyBulkEpics, saveMyBulkEpics, type BulkStream } from '../bulkEpics'
import { normalizeReleaseSourceSettings } from '../releaseSource'
import type { PageProps } from '../pages/types'
import { Panel } from './ui'

// QV-59: Settings → Azure DevOps → Stream mapping → Bulk creation Epics. Per stream (DP, IOCC, Content), the Epic its
// Create Features works under: a shared default (managers; saved to Git with the planning data) and each person's own
// choice (this browser), which wins. The Feature setup of that Epic gives the DoD, sets, stories and QE columns.
export function BulkEpicsPanel({ store, items, canManage }: { store: PageProps['store']; items: AzureWorkItem[]; canManage: boolean }) {
  const shared = normalizeReleaseSourceSettings(store.state.releaseSourceSettings).bulkEpics ?? {}
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
    state.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Update', entity: 'ReleaseSourceSettings', entityId: `bulk:${stream}`, detail: text.trim() ? `${stream} bulk creation under Epic #${text.trim()} (shared)` : `${stream} bulk creation Epic back to the built-in one (shared)` })
    return state
  })
  const saveMine = (stream: BulkStream, text: string) => { const next = { ...mine }; if (text.trim()) next[stream] = Number(text); else delete next[stream]; saveMyBulkEpics(next); setMine(next) }
  return <Panel className="connection-panel bulk-epics" eyebrow="BULK CREATION" title="Bulk creation Epics" info={<ul><li>The Epic under which Create Features (DP, IOCC, Content release tables) creates the Features; that Epic's Feature setup gives the DoD, release type sets, User Stories and QE Mapping columns.</li><li>Shared: the default for everyone (Save to Git after a change). Mine: your own choice in this browser, used instead of the shared one.</li><li>Built in: DP #13946, Content #22919; IOCC has none until one is set.</li></ul>}>
    <div className="azure-table"><table aria-label="Bulk creation Epics"><thead><tr><th>Stream</th><th>Shared</th><th>Mine</th><th>Used</th></tr></thead><tbody>
      {bulkStreams.map((stream) => {
        const used = bulkEpicFor(stream, shared, mine)
        const sharedKey = `shared:${stream}`, mineKey = `mine:${stream}`
        const sharedText = draftOf(sharedKey, shared[stream]), mineText = draftOf(mineKey, mine[stream])
        return <tr key={stream}><td><strong>{stream}</strong>{builtInBulkEpics[stream] && <small className="muted"> built in #{builtInBulkEpics[stream]}</small>}</td>
          <td><input aria-label={`${stream} shared bulk Epic`} inputMode="numeric" placeholder="Epic ID" disabled={!canManage} value={sharedText} onChange={(event) => setDrafts({ ...drafts, [sharedKey]: event.target.value })} />{canManage && drafts[sharedKey] != null && <button type="button" className="ghost" disabled={!valid(sharedText)} onClick={() => { saveShared(stream, sharedText); setDrafts(({ [sharedKey]: _drop, ...rest }) => rest) }}>Save</button>}</td>
          <td><input aria-label={`${stream} my bulk Epic`} inputMode="numeric" placeholder="Epic ID" value={mineText} onChange={(event) => setDrafts({ ...drafts, [mineKey]: event.target.value })} />{drafts[mineKey] != null && <button type="button" className="ghost" disabled={!valid(mineText)} onClick={() => { saveMine(stream, mineText); setDrafts(({ [mineKey]: _drop, ...rest }) => rest) }}>Save</button>}</td>
          <td>{title(used.epicId)}<small className="muted"> · {used.source === 'mine' ? 'mine' : used.source === 'shared' ? 'shared' : used.source === 'built-in' ? 'built in' : 'not set'}</small></td></tr>
      })}
    </tbody></table></div>
  </Panel>
}
