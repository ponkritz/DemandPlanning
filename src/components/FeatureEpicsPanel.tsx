import { useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { epicMatchStreams, normalizeReleaseSourceSettings } from '../releaseSource'
import type { PageProps } from '../pages/types'
import { Panel } from './ui'

// QV-57: Admin → Streams → Stream mapping → Epics to match Features in. Per stream (DP, CP, IOCC, Content), the QMS-0025 Epics whose
// Features (and User Stories) its releases are matched to — the Board column, Create Feature's existing-match check
// and the 100% rule; none chosen: the whole board. Applied to the shared settings and saved to Git with the planning data.
// SET-29: opened from the stream's row of the Stream mapping (fixed: that stream, in a pop-up, without the panel frame).
export function FeatureEpicsPanel({ store, items, canManage, fixed }: { store: PageProps['store']; items: AzureWorkItem[]; canManage: boolean; fixed?: string }) {
  const saved = normalizeReleaseSourceSettings(store.state.releaseSourceSettings).featureEpics ?? {}
  const streams: string[] = [...epicMatchStreams]
  const [chosenStream, setStream] = useState(streams[0] ?? '')
  const stream = fixed ?? chosenStream
  const chosen = saved[stream] ?? []
  const epics = items.filter((item) => item.workItemType === 'Epic' && (item.state.trim().toLowerCase() !== 'removed' || chosen.includes(item.id)))
  const known = new Set(epics.map((epic) => epic.id))
  const shown = [...epics].sort((a, b) => Number(chosen.includes(b.id)) - Number(chosen.includes(a.id)) || a.title.localeCompare(b.title))
  const [filter, setFilter] = useState('')
  const visible = shown.filter((epic) => !filter.trim() || `#${epic.id} ${epic.title}`.toLowerCase().includes(filter.trim().toLowerCase()))
  const apply = (next: number[]) => store.update((state) => {
    const settings = normalizeReleaseSourceSettings(state.releaseSourceSettings)
    const map = { ...(settings.featureEpics ?? {}) }
    if (next.length) map[stream] = next; else delete map[stream]
    state.releaseSourceSettings = { ...settings, featureEpics: Object.keys(map).length ? map : undefined }
    state.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Update', entity: 'ReleaseSourceSettings', entityId: `epics:${stream}`, detail: next.length ? `${stream} Features matched in Epics ${next.map((id) => `#${id}`).join(', ')}` : `${stream} Features matched across the whole board` })
    return state
  })
  const body = <>
    <div className="form-row">
      {!fixed && <label>Stream<select aria-label="Stream for Feature matching" value={stream} onChange={(event) => { setStream(event.target.value); setFilter('') }}>{streams.map((name) => <option key={name} value={name}>{name}{saved[name]?.length ? ` (${saved[name].length})` : ''}</option>)}</select></label>}
      <span className="muted">{chosen.length ? `${chosen.length} Epic${chosen.length === 1 ? '' : 's'} chosen` : 'Whole board (no Epic chosen)'}</span>
      {canManage && chosen.length > 0 && <button type="button" className="ghost" onClick={() => apply([])}>Clear: whole board</button>}
    </div>
    {!items.some((item) => item.workItemType === 'Epic') ? <p className="muted">Fetch the Time Writing connection (QMS-0025) to choose its Epics.</p> : <>
      <input aria-label="Search Epics" placeholder="Search Epics by ID or title" value={filter} onChange={(event) => setFilter(event.target.value)} />
      <ul className="pick-list feature-epics-list">{visible.map((epic) => <li key={epic.id}><label className="check"><input type="checkbox" disabled={!canManage} checked={chosen.includes(epic.id)} onChange={(event) => apply(event.target.checked ? [...chosen, epic.id] : chosen.filter((id) => id !== epic.id))} />#{epic.id} {epic.title}<small className="muted"> · {epic.state}</small></label></li>)}</ul>
      {chosen.some((id) => !known.has(id)) && <p className="muted">Chosen but not on the board now: {chosen.filter((id) => !known.has(id)).map((id) => `#${id}`).join(', ')}.</p>}
    </>}
  </>
  return fixed ? <div className="feature-epics">{body}</div> : <Panel className="connection-panel feature-epics" eyebrow="FEATURE MATCHING" title="Epics to match Features in" info={featureEpicsInfo}>{body}</Panel>
}
const featureEpicsInfo = <ul><li>Per stream, the QMS-0025 Epics whose Features and User Stories its releases are matched to: the Board column of the release tables, the existing-Feature check of Create Feature and bulk create (the 100% rule).</li><li>For DP, CP, IOCC and Content; Tool Validations and the Windchill streams always search the whole board. No Epic chosen: the whole board is searched, as before.</li><li>Shared with everyone in the planning data: Save to Git after a change.</li></ul>
