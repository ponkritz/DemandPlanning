import { useContext, useState } from 'react'
import { addCustomStream, changeCustomStream, customStreamsFile, maxAliases, removeCustomStream, ruleOptions, type CustomRule, type CustomStreamEntry } from '../customStreams'
import { writeBlockedReason } from '../access'
import { ReadOnlyContext } from '../useCan'
import { useCustomStreamsStore } from '../useCustomStreams'
import { recordJob } from '../backgroundJobs'
import type { GitStorage } from '../useGitStorage'
import { Modal, Notice, Panel, Pill, WriteBlocked } from './ui'

// STR-01…06: Admin → Streams → Stream mapping → Custom streams. The Tool Owner (streams.manage, CON-93) adds a stream
// of our own — name, source, one of the app's release rules, fuzzy Feature matching, earlier names, Epics — and it gets
// its connection or export row in the Stream mapping, its Release page under Release Details and its lines in Pulse
// Check, the Dashboard and the Monthly pack without a release of the app. Saved to the shared setup in Git
// (custom-streams.json) at once. Built-in streams are listed in the Stream mapping and cannot be changed here.
// Everyone else sees the list read only and ＋ Add stream… disabled with the reason (CON-101, CON-102).
type Draft = { name: string; source: 'azure' | 'windchill'; rule: CustomRule; fuzzy: boolean; aliases: string; epics: string }
const blank: Draft = { name: '', source: 'azure', rule: 'title', fuzzy: false, aliases: '', epics: '' }
const draftOf = (entry: CustomStreamEntry): Draft => { const option = ruleOptions.find((rule) => rule.key === entry.rule)!; return { name: entry.name, source: option.source, rule: entry.rule, fuzzy: entry.fuzzy, aliases: (entry.aliases ?? []).join(', '), epics: (entry.epics ?? []).join(', ') } }
const list = (text: string) => text.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean)

export function CustomStreamsPanel({ git, canManageStreams, isSample }: { git?: GitStorage; canManageStreams: boolean; isSample: boolean }) {
  const store = useCustomStreamsStore()
  const readOnly = useContext(ReadOnlyContext)
  const entries = store?.entries ?? []
  const [editing, setEditing] = useState<{ name?: string; draft: Draft } | null>(null)
  const [removing, setRemoving] = useState<CustomStreamEntry | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Fail closed (CON-101, CON-102): the reason the viewer cannot change the custom streams, '' when they can.
  const why = !canManageStreams ? writeBlockedReason(readOnly, ['streams.manage'], 'in the shared stream mapping')
    : !store ? 'The custom streams are not available here.'
      : isSample ? 'Synthetic sample data is loaded: custom streams are not saved to Git.'
        : !git?.connected ? 'Connect Git storage (Data & sharing → Git storage): custom streams are kept in the shared setup in Git.'
          : git.readOnly ? 'Your Git token is read-only: custom streams are saved to the shared setup in Git.'
            : !store.loaded ? (store.error ? `${customStreamsFile} could not be read: ${store.error}` : `Reading ${customStreamsFile} from Git…`) : ''
  const open = (entry?: CustomStreamEntry) => { setError(''); setEditing(entry ? { name: entry.name, draft: draftOf(entry) } : { draft: blank }) }
  const option = editing ? ruleOptions.find((rule) => rule.key === editing.draft.rule) : undefined
  const setDraft = (patch: Partial<Draft>) => setEditing((current) => current ? { ...current, draft: { ...current.draft, ...patch } } : current)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!editing || !store || why) return
    const { draft } = editing, chosen = ruleOptions.find((rule) => rule.key === draft.rule)
    const epics = list(draft.epics)
    if (chosen?.epics && epics.some((id) => !/^\d+$/.test(id.replace(/^#/, '')))) { setError('Epics: enter Epic IDs separated by commas, e.g. 13946, 22919.'); return }
    const entry: CustomStreamEntry = { name: draft.name.replace(/\s+/g, ' ').trim(), rule: draft.rule, fuzzy: chosen?.source === 'azure' && draft.fuzzy, aliases: list(draft.aliases).slice(0, maxAliases), epics: chosen?.epics ? epics.map((id) => Number(id.replace(/^#/, ''))) : [] }
    let next: CustomStreamEntry[]
    try { next = editing.name ? changeCustomStream(entries, editing.name, entry) : addCustomStream(entries, entry) } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); return }
    const renamed = editing.name && editing.name !== entry.name ? `Rename stream: ${editing.name} → ${entry.name}` : ''
    const message = renamed || `${editing.name ? 'Change' : 'Add'} stream: ${entry.name} (${chosen?.label.split(' — ')[0] ?? entry.rule})`
    setBusy(true); setError('')
    try {
      await store.save(next, message)
      recordJob('custom-streams', message, { text: `${message} — saved to ${customStreamsFile} in Git; everyone gets it at their next start.${editing.name ? '' : ` Map a ${chosen?.source === 'windchill' ? 'Windchill export' : 'connection'} named “${entry.name}” to fill its Release page.`}` })
      setEditing(null)
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setBusy(false) }
  }
  async function remove() {
    if (!removing || !store || why) return
    setBusy(true); setError('')
    try {
      const message = `Remove stream: ${removing.name}`
      await store.save(removeCustomStream(entries, removing.name), message)
      recordJob('custom-streams', message, { text: `${message} — its connection or export and their data are kept (listed under Other views).` })
      setRemoving(null)
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setBusy(false) }
  }

  return <Panel className="connection-panel custom-streams" eyebrow="STREAMS" title="Custom streams"
    info={<ul><li>Streams of our own, added without a new version of the app. Each reads its releases with one of the app's rules, from an Azure DevOps query connection or a Windchill export named like the stream — mapped below as the built-in streams are.</li><li>A custom stream gets its Release page under Release Details, its line in Pulse Check, the Dashboard delivery counts and the Monthly pack setup, and its row in the Stream mapping.</li><li>Kept in the shared setup in Git ({customStreamsFile}); only the Tool Owner (“Change the stream mapping”) adds, changes or removes them. The built-in streams (DP, CP, IOCC, Content, Tool Validations, S&amp;S IT, ECP) stay as they are.</li></ul>}
    action={<div className="button-row"><button type="button" className="ghost" disabled={Boolean(why)} title={why || 'Add a stream of our own'} onClick={() => open()}>＋ Add stream…</button></div>}>
    <WriteBlocked reason={why} />
    {store?.error && <Notice tone="warning">{customStreamsFile} could not be read from Git: {store.error} The custom streams last read here are used.</Notice>}
    {(store?.refused.length ?? 0) > 0 && <Notice tone="warning">Not used — {customStreamsFile} in Git: {store!.refused.map((entry) => `${entry.name}: ${entry.reason}`).join(' · ')}</Notice>}
    {entries.length ? <div className="azure-table"><table><thead><tr><th>Stream</th><th>Source</th><th>Release rule</th><th>Feature matching</th><th>Earlier names</th><th>Epics</th><th>Actions</th></tr></thead><tbody>
      {entries.map((entry) => { const rule = ruleOptions.find((item) => item.key === entry.rule)!; return <tr key={entry.name}>
        <td><strong>{entry.name}</strong><Pill tone="info">Custom</Pill></td>
        <td><small className="plain">{rule.source === 'azure' ? 'Azure DevOps query connection' : 'Windchill export'} “{entry.name}”</small></td>
        <td><small className="plain">{rule.label}</small></td>
        <td><small className="plain">{rule.source === 'azure' ? entry.fuzzy ? 'Fuzzy (percentage)' : 'Exact' : 'Release name and number'}</small></td>
        <td><small className="plain">{entry.aliases?.join(', ') || '—'}</small></td>
        <td><small className="plain">{rule.epics ? entry.epics?.length ? entry.epics.map((id) => `#${id}`).join(', ') : 'Whole board' : '—'}</small></td>
        <td><div className="button-row nowrap"><button type="button" className="ghost" disabled={Boolean(why)} title={why || `Change or rename ${entry.name}`} onClick={() => open(entry)}>Edit</button><button type="button" className="text-button danger-text" disabled={Boolean(why)} title={why || `Remove ${entry.name}`} onClick={() => { setError(''); setRemoving(entry) }}>Remove</button></div></td>
      </tr> })}
    </tbody></table></div> : <p className="muted">No custom streams yet.{why ? '' : ' ＋ Add stream… adds one: its Release page appears under Release Details once a connection or export named like it is mapped.'}</p>}

    {editing && <Modal title={editing.name ? `Edit stream “${editing.name}”` : 'Add stream'} eyebrow="SETTINGS · STREAMS" onClose={() => { if (!busy) setEditing(null) }}>
      <form onSubmit={(event) => void save(event)}>
        <label>Name<input aria-label="Name" required maxLength={40} value={editing.draft.name} onChange={(event) => setDraft({ name: event.target.value })} placeholder="e.g. Labeling" /><small>2 to 40 characters, not a built-in stream. Its connection (or Windchill export) is the one named like it, e.g. “{editing.draft.name.trim() || 'Labeling'}” or “{editing.draft.name.trim() || 'Labeling'} [Approved]”.{editing.name ? ' Renaming keeps the old name as an earlier name, so its connection and data stay with it.' : ''}</small></label>
        <label>Source<select aria-label="Source" value={editing.draft.source} onChange={(event) => { const source = event.target.value === 'windchill' ? 'windchill' : 'azure'; const first = ruleOptions.find((rule) => rule.source === source)!; setDraft({ source, rule: first.key, fuzzy: first.fuzzy }) }}><option value="azure">Azure DevOps query connection</option><option value="windchill">Windchill export</option></select><small>{editing.draft.source === 'azure' ? 'A read-only query connection named like the stream, set up in the Stream mapping below (Add query).' : 'A Windchill export named like the stream, imported under Release Details → Windchill exports.'}</small></label>
        <label>Release rule<select aria-label="Release rule" value={editing.draft.rule} onChange={(event) => { const rule = ruleOptions.find((entry) => entry.key === event.target.value)!; setDraft({ rule: rule.key, fuzzy: rule.fuzzy }) }}>{ruleOptions.filter((rule) => rule.source === editing.draft.source).map((rule) => <option key={rule.key} value={rule.key}>{rule.label}</option>)}</select>{option && <small>{option.gives} Example: {option.example}. Counts: {option.counts}.{option.bulk ? ' Create Features for several releases at once.' : ''}</small>}</label>
        {option?.source === 'azure' && <div className="field-check"><label className="checkbox-label"><input type="checkbox" checked={editing.draft.fuzzy} onChange={(event) => setDraft({ fuzzy: event.target.checked })} />Fuzzy Feature matching</label><small className="muted">On: the QMS-0025 Feature with the best match (a percentage, at the threshold of the Stream mapping) is the release's Time Writing Feature. Off: only a Feature whose title names the release exactly.</small></div>}
        <label>Earlier names (optional)<input aria-label="Earlier names (optional)" value={editing.draft.aliases} onChange={(event) => setDraft({ aliases: event.target.value })} placeholder="e.g. Labelling, LBL" /><small>Up to {maxAliases}, separated by commas: a connection or export named after one still belongs to this stream.</small></label>
        {option?.epics && <label>Epics to match Features in (optional)<input aria-label="Epics to match Features in (optional)" value={editing.draft.epics} onChange={(event) => setDraft({ epics: event.target.value })} placeholder="e.g. 13946, 22919" inputMode="numeric" /><small>QMS-0025 Epic IDs, separated by commas. Empty: the whole board is searched.</small></label>}
        {error && <Notice tone="error">{error}</Notice>}
        <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={() => setEditing(null)}>Cancel</button><button className="primary" disabled={busy || Boolean(why)}>{busy ? 'Saving to Git…' : editing.name ? 'Save to Git' : 'Add stream'}</button></div>
      </form>
    </Modal>}
    {removing && <Modal title="Remove the stream" eyebrow="SETTINGS · STREAMS" onClose={() => { if (!busy) setRemoving(null) }}>
      <form onSubmit={(event) => { event.preventDefault(); void remove() }}>
        <p>Remove the custom stream <strong>{removing.name}</strong> for everyone? Its Release page leaves Release Details and its line leaves Pulse Check, the Dashboard and the Monthly pack setup.</p>
        <p>Its {ruleOptions.find((rule) => rule.key === removing.rule)?.source === 'windchill' ? 'Windchill export' : 'connection'} and the data fetched for it are <strong>kept</strong> (listed under Other views); adding the stream again with the same name brings its page back. {customStreamsFile} keeps its history in Git.</p>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={() => setRemoving(null)}>Cancel</button><button className="danger-button" disabled={busy || Boolean(why)}>{busy ? 'Removing…' : `Remove stream ${removing.name}`}</button></div>
      </form>
    </Modal>}
  </Panel>
}
