import { useState } from 'react'
import { monthName } from '../format'
import { completedCount, defaultStreamReleases, supportedCount } from '../releaseOverview'
import { countStreams, normalizeReleaseSourceSettings } from '../releaseSource'
import type { AzureConnectionProfileSummary } from '../azureCredentials'
import type { PageProps } from '../pages/types'
import { Panel, TablePanel } from './ui'

// QV-58: Completed and Supported releases of CP, DP and IOCC in a month — from each stream's data (the Pulse Check
// rules), or, while a stream has no data for the month (not set up or not fetched), the counts an Admin entered; with
// neither, a placeholder (—) and the reason.
export function ReleaseCountsPanel({ state, profiles, month }: { state: PageProps['store']['state']; profiles: AzureConnectionProfileSummary[]; month: string }) {
  const streams = defaultStreamReleases(state, profiles, month).filter((stream) => (countStreams as readonly string[]).includes(stream.name))
  const cell = (value: number | undefined, stream: (typeof streams)[number]) => stream.noData && !stream.entered ? '—' : value ?? '—'
  return <TablePanel title={`Release counts · ${monthName(month)}`} info={<ul><li>Completed and Supported releases in the month, as Pulse Check counts them: DP — DT Done / DT, SFV, PRD or RPE Done; CP — main Release Notes / any document signed by QA/QE; IOCC — Release Notes or Verification Report / Release Plan, Release Notes or Verification Report signed.</li><li>A stream without data for the month (not set up or not fetched) shows the counts an Admin entered (Admin → Streams → Stream mapping → Release counts), else —.</li></ul>}>
    <div className="azure-table"><table aria-label="Release counts"><thead><tr><th>Stream</th><th>Completed</th><th>Supported</th><th>Source</th></tr></thead><tbody>
      {streams.map((stream) => <tr key={stream.name}><td>{stream.name}</td><td>{cell(completedCount(stream), stream)}</td><td>{cell(supportedCount(stream), stream)}</td>
        <td>{!stream.noData ? 'Data' : stream.entered ? <span className="muted">Entered by an Admin · no data ({stream.noData})</span> : <span className="warning-text">No data ({stream.noData}) — placeholder</span>}</td></tr>)}
    </tbody></table></div>
  </TablePanel>
}

// QV-58: Admin → Streams → Stream mapping → Release counts. An Admin enters Completed / Supported per stream and
// month; they are used only while the stream has no data for that month. Shared in planning-data.json, audited.
export function ReleaseCountsAdmin({ store, canManage, month, initialStream }: { store: PageProps['store']; canManage: boolean; month: string; initialStream?: string }) {
  const saved = normalizeReleaseSourceSettings(store.state.releaseSourceSettings).countOverrides ?? {}
  // SET-34: a Release Details page's ⚙ settings open on its own stream.
  const [stream, setStream] = useState<string>(() => initialStream && (countStreams as readonly string[]).includes(initialStream) ? initialStream : countStreams[0])
  const [at, setAt] = useState(month)
  const current = saved[stream]?.[at]
  const [draft, setDraft] = useState<{ key: string; completed: string; supported: string } | null>(null)
  const key = `${stream}:${at}`
  const values = draft?.key === key ? draft : { key, completed: current?.completed != null ? String(current.completed) : '', supported: current?.supported != null ? String(current.supported) : '' }
  const valid = (text: string) => text.trim() === '' || (/^\d+$/.test(text.trim()) && Number(text) <= 10000)
  const save = (next: { completed?: number; supported?: number } | undefined) => store.update((state) => {
    const settings = normalizeReleaseSourceSettings(state.releaseSourceSettings)
    const all = { ...(settings.countOverrides ?? {}) }, byMonth = { ...(all[stream] ?? {}) }
    if (next && (next.completed != null || next.supported != null)) byMonth[at] = next; else delete byMonth[at]
    if (Object.keys(byMonth).length) all[stream] = byMonth; else delete all[stream]
    state.releaseSourceSettings = { ...settings, countOverrides: Object.keys(all).length ? all : undefined }
    state.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Update', entity: 'ReleaseSourceSettings', entityId: `counts:${stream}:${at}`, detail: next ? `${stream} ${at}: Completed ${next.completed ?? '—'}, Supported ${next.supported ?? '—'} entered` : `${stream} ${at}: entered counts removed` })
    return state
  })
  const entries = countStreams.flatMap((name) => Object.entries(saved[name] ?? {}).map(([entryMonth, counts]) => ({ name, month: entryMonth, counts }))).sort((a, b) => b.month.localeCompare(a.month) || a.name.localeCompare(b.name))
  return <Panel className="connection-panel release-counts-admin" eyebrow="RELEASE COUNTS" title="Release counts (entered)" info={<ul><li>Completed and Supported releases of CP, DP and IOCC for a month, used only while the stream has no data for that month (not set up or not fetched); real counts replace them once the data is there.</li><li>Shown marked as entered on My dashboard, Pulse Check, the stream pages and in the Monthly pack.</li><li>Shared with everyone in the planning data: Save to Git after a change.</li></ul>}>
    <div className="form-row">
      <label>Stream<select aria-label="Stream for entered counts" value={stream} onChange={(event) => { setStream(event.target.value); setDraft(null) }}>{countStreams.map((name) => <option key={name}>{name}</option>)}</select></label>
      <label>Month<input type="month" aria-label="Month for entered counts" value={at} onChange={(event) => { if (event.target.value) { setAt(event.target.value); setDraft(null) } }} /></label>
      <label>Completed<input aria-label="Entered Completed releases" inputMode="numeric" disabled={!canManage} value={values.completed} onChange={(event) => setDraft({ ...values, completed: event.target.value })} /></label>
      <label>Supported<input aria-label="Entered Supported releases" inputMode="numeric" disabled={!canManage} value={values.supported} onChange={(event) => setDraft({ ...values, supported: event.target.value })} /></label>
    </div>
    {(!valid(values.completed) || !valid(values.supported)) && <p className="negative">Enter whole numbers from 0 to 10,000 (or leave a box empty).</p>}
    {canManage && <div className="button-row">
      <button type="button" className="primary" disabled={!draft || !valid(values.completed) || !valid(values.supported)} onClick={() => { save({ ...(values.completed.trim() ? { completed: Number(values.completed) } : {}), ...(values.supported.trim() ? { supported: Number(values.supported) } : {}) }); setDraft(null) }}>Save counts</button>
      {current && <button type="button" className="ghost" onClick={() => { save(undefined); setDraft(null) }}>Remove for {monthName(at)}</button>}
    </div>}
    {entries.length > 0 && <div className="azure-table"><table aria-label="Entered release counts"><thead><tr><th>Stream</th><th>Month</th><th>Completed</th><th>Supported</th></tr></thead><tbody>{entries.map((entry) => <tr key={`${entry.name}:${entry.month}`}><td>{entry.name}</td><td>{monthName(entry.month)}</td><td>{entry.counts.completed ?? '—'}</td><td>{entry.counts.supported ?? '—'}</td></tr>)}</tbody></table></div>}
  </Panel>
}
