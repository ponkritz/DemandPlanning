import { useState } from 'react'
import type { AzureWorkItem } from '../domain'
import type { GitStorage } from '../useGitStorage'
import type { MonthlyPackStore } from '../useMonthlyPack'
import { kpiMetrics, type KpiMetric, type KpiRow, type MonthlyPackSetup, type PackLine } from '../monthlyPack'
import { defaultStreams } from '../streams'
import { Notice, Panel } from './ui'

// Settings → Monthly pack: which streams and Epics feed each slide line, and which Epic (with which metric) each KPI
// row reads. Shared in Git as monthly-pack-setup.json.
const streamNames = defaultStreams.map((stream) => stream.name)
const newId = (prefix: string, taken: string[]) => { let index = taken.length + 1; while (taken.includes(`${prefix}-${index}`)) index += 1; return `${prefix}-${index}` }

export function MonthlyPackSetupPanel({ pack, git, items }: { pack: MonthlyPackStore; git: GitStorage; items: AzureWorkItem[] }) {
  const epics = items.filter((item) => item.workItemType === 'Epic' && item.state.toLowerCase() !== 'removed').sort((a, b) => a.title.localeCompare(b.title))
  const [draft, setDraft] = useState<MonthlyPackSetup>(pack.setup)
  const [status, setStatus] = useState<{ tone: 'info' | 'success' | 'error'; text: string; url?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [seen, setSeen] = useState(pack.setup)
  if (pack.setup !== seen) { setSeen(pack.setup); setDraft(pack.setup); setStatus(null) }
  const editable = git.connected && !git.readOnly && !git.isSample
  const dirty = JSON.stringify(draft) !== JSON.stringify(pack.setup)
  const setLine = (id: string, patch: Partial<PackLine>) => setDraft((current) => ({ ...current, lines: current.lines.map((line) => line.id === id ? { ...line, ...patch } : line) }))
  const setKpi = (id: string, patch: Partial<KpiRow>) => setDraft((current) => ({ ...current, kpis: current.kpis.map((row) => row.id === id ? { ...row, ...patch } : row) }))
  const move = <T extends { id: string }>(list: T[], id: string, by: number) => { const at = list.findIndex((entry) => entry.id === id), to = at + by; if (at < 0 || to < 0 || to >= list.length) return list; const next = [...list]; const [entry] = next.splice(at, 1); next.splice(to, 0, entry); return next }
  const epicName = (id: number) => { const epic = epics.find((entry) => entry.id === id); return epic ? `#${epic.id} ${epic.title}` : `#${id}` }
  async function save() {
    setBusy(true); setStatus({ tone: 'info', text: 'Saving to Git…' })
    try { const result = await pack.saveSetup(draft, 'Monthly pack setup'); setStatus({ tone: 'success', text: 'Saved to Git.', url: result.commitUrl }) }
    catch (failure) { setStatus({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }) }
    finally { setBusy(false) }
  }
  return <Panel className="admin-section" eyebrow="PULSE CHECK" title="Monthly pack setup" info={<p>The slide lines of the Monthly pack (Pulse Check) and what feeds them: each line lists the releases of its streams in the month (DP, CP, IOCC, Content and Tool Validations from their connections, S&S IT from its Windchill export) and the Features closed in the month under its Epics — a line scattered across Epics, such as PPU, is mapped to those Epics. Each KPI row reads an Epic with a metric, the utilisation of the month or the year, or is typed per month. Shared in Git as monthly-pack-setup.json.</p>}
    action={editable ? <button type="button" className="primary" disabled={!dirty || busy} onClick={() => void save()}>Save to Git</button> : undefined}>
    {pack.setupError && <Notice tone="warning">{pack.setupError}</Notice>}
    {!editable && <p className="muted">{git.connected ? 'View only: your Git token can read but not save.' : 'Connect Git storage to change the setup.'}</p>}
    {status && <Notice tone={status.tone === 'error' ? 'warning' : 'info'}><span role="status">{status.text}</span>{status.url && <> <a href={status.url} target="_blank" rel="noreferrer">View commit</a></>}</Notice>}
    <fieldset className="plain-fieldset" disabled={!editable || busy}>
      <h3>Slide lines</h3>
      <div className="azure-table"><table className="pack-setup"><thead><tr><th>Line</th><th>Streams</th><th>Epics (Features closed in the month)</th><th /></tr></thead><tbody>
        {draft.lines.map((line) => <tr key={line.id}>
          <td><input aria-label={`Line ${line.id} label`} value={line.label} maxLength={80} onChange={(event) => setLine(line.id, { label: event.target.value })} /></td>
          <td>{streamNames.map((name) => <label key={name} className="check"><input type="checkbox" checked={line.streams.includes(name)} onChange={(event) => setLine(line.id, { streams: event.target.checked ? [...line.streams, name] : line.streams.filter((entry) => entry !== name) })} />{name}</label>)}</td>
          <td>
            {line.epicIds.map((id) => <span key={id} className="milestone-chip">{epicName(id)} <button type="button" className="text-button" aria-label={`Remove ${epicName(id)} from ${line.label}`} onClick={() => setLine(line.id, { epicIds: line.epicIds.filter((entry) => entry !== id) })}>×</button></span>)}
            <select aria-label={`Add an Epic to ${line.label}`} value="" onChange={(event) => { const id = Number(event.target.value); if (id) setLine(line.id, { epicIds: [...line.epicIds, id] }) }}><option value="">Add Epic…</option>{epics.filter((epic) => !line.epicIds.includes(epic.id)).map((epic) => <option key={epic.id} value={epic.id}>#{epic.id} {epic.title}</option>)}</select>
          </td>
          <td className="pack-row-actions"><button type="button" className="text-button" onClick={() => setDraft((current) => ({ ...current, lines: move(current.lines, line.id, -1) }))}>↑</button><button type="button" className="text-button" onClick={() => setDraft((current) => ({ ...current, lines: move(current.lines, line.id, 1) }))}>↓</button><button type="button" className="text-button danger-text" onClick={() => setDraft((current) => ({ ...current, lines: current.lines.filter((entry) => entry.id !== line.id) }))}>Remove</button></td>
        </tr>)}
      </tbody></table></div>
      <div className="button-row"><button type="button" className="ghost" onClick={() => setDraft((current) => ({ ...current, lines: [...current.lines, { id: newId('line', current.lines.map((line) => line.id)), label: 'New line', streams: [], epicIds: [] }] }))}>＋ Add line</button></div>
      <h3>KPI Pulse rows</h3>
      <div className="azure-table"><table className="pack-setup"><thead><tr><th>KPI</th><th>Reads</th><th>Epic</th><th /></tr></thead><tbody>
        {draft.kpis.map((row) => <tr key={row.id}>
          <td><input aria-label={`KPI ${row.id} label`} value={row.label} maxLength={80} onChange={(event) => setKpi(row.id, { label: event.target.value })} /></td>
          <td><select aria-label={`KPI ${row.label} metric`} value={row.metric} onChange={(event) => setKpi(row.id, { metric: event.target.value as KpiMetric })}>{(Object.keys(kpiMetrics) as KpiMetric[]).map((metric) => <option key={metric} value={metric}>{kpiMetrics[metric]}</option>)}</select></td>
          <td>{['open', 'closed-month', 'closed-ytd', 'percent-closed'].includes(row.metric) ? <select aria-label={`KPI ${row.label} Epic`} value={row.epicId ?? ''} onChange={(event) => setKpi(row.id, { epicId: Number(event.target.value) || undefined })}><option value="">Choose an Epic…</option>{epics.map((epic) => <option key={epic.id} value={epic.id}>#{epic.id} {epic.title}</option>)}</select> : <span className="muted">—</span>}</td>
          <td className="pack-row-actions"><button type="button" className="text-button" onClick={() => setDraft((current) => ({ ...current, kpis: move(current.kpis, row.id, -1) }))}>↑</button><button type="button" className="text-button" onClick={() => setDraft((current) => ({ ...current, kpis: move(current.kpis, row.id, 1) }))}>↓</button><button type="button" className="text-button danger-text" onClick={() => setDraft((current) => ({ ...current, kpis: current.kpis.filter((entry) => entry.id !== row.id) }))}>Remove</button></td>
        </tr>)}
      </tbody></table></div>
      <div className="button-row"><button type="button" className="ghost" onClick={() => setDraft((current) => ({ ...current, kpis: [...current.kpis, { id: newId('kpi', current.kpis.map((row) => row.id)), label: 'New KPI', metric: 'manual' }] }))}>＋ Add KPI row</button>{pack.setupHistory && <a className="text-button" href={pack.setupHistory} target="_blank" rel="noreferrer">History in GitHub</a>}</div>
    </fieldset>
  </Panel>
}
