import { useEffect, useRef, useState } from 'react'
import type { AzureConnectionProfileSummary } from '../azureCredentials'
import { bulkSharedBlocked } from '../bulkEpics'
import { dpBulkDateDefaults, dpBulkDatesOf, dpDateLabel, type DpBulkDates } from '../dpBulkDates'
import { dpQueryDateColumns } from '../dpQueryColumns'
import { normalizeReleaseSourceSettings } from '../releaseSource'
import type { PageProps } from '../pages/types'
import type { GitStorage } from '../useGitStorage'
import { Modal, Notice, Panel, SettingsSummary, WriteBlocked } from './ui'

// DPF-13: Admin → Stream options → Bulk creation Epics → DP bulk creation dates. Which date column of the DP query gives
// a Feature made by DP bulk creation its Start date (default DRPE Date, RPE) and its Target date (default DDT Date, DT).
// Shared with the bulk creation Epics (releaseSourceSettings.dpBulkDates in the planning data), changed by the same right
// (Stream options) and committed to Git straight away like a shared bulk Epic (QV-59); a default is not stored, so
// files without the setting use the defaults. Shown as a summary with Edit… (UI-STANDARDS §3).
export function DpBulkDatesPanel({ store, profiles, canManage, git }: { store: PageProps['store']; profiles: AzureConnectionProfileSummary[]; canManage: boolean; git?: GitStorage }) {
  const saved = normalizeReleaseSourceSettings(store.state.releaseSourceSettings).dpBulkDates
  const used = dpBulkDatesOf(saved)
  const blocked = canManage ? bulkSharedBlocked(git) : 'Set by the roles with “Stream options” (shared); read only for you.'
  // The DP query's columns: the fetched data's, else the query's SELECT.
  const { options, fetched } = dpQueryDateColumns(store.state, profiles)
  const [editing, setEditing] = useState(false)
  // Committed once the change is in the store (git.save reads the current state), as the shared bulk Epic is.
  const [pending, setPending] = useState<DpBulkDates | null>(null)
  const committed = useRef<DpBulkDates | null>(null)
  const landed = pending && used.start === pending.start && used.target === pending.target
  useEffect(() => {
    if (!pending || !git || !landed || committed.current === pending) return
    committed.current = pending
    void git.save(`DP bulk creation dates: Start from ${pending.start}, Target from ${pending.target}`)
  }, [pending, landed, git])
  const save = (next: DpBulkDates) => {
    store.update((state) => {
      const settings = normalizeReleaseSourceSettings(state.releaseSourceSettings)
      const stored = { ...(next.start !== dpBulkDateDefaults.start ? { start: next.start } : {}), ...(next.target !== dpBulkDateDefaults.target ? { target: next.target } : {}) }
      state.releaseSourceSettings = { ...settings, dpBulkDates: Object.keys(stored).length ? stored : undefined }
      state.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Update', entity: 'ReleaseSourceSettings', entityId: 'bulk:DP:dates', detail: `DP bulk creation dates (shared): Start date from ${next.start}, Target date from ${next.target}` })
      return state
    })
    setPending(next)
    setEditing(false)
  }
  const isDefault = (field: string, fallback: string) => field.toLowerCase() === fallback.toLowerCase()
  return <Panel className="connection-panel dp-bulk-dates" eyebrow="BULK CREATION · DP" title="DP bulk creation dates" info={<ul>
    <li>DP <strong>Create Features</strong> sets each Feature’s <strong>Start date</strong> and <strong>Target date</strong> from these date columns of the DP query (Azure DevOps Start Date and Target Date). The defaults are the <strong>DRPE Date</strong> (RPE, Release Planning Event) and the <strong>DDT Date</strong> (DT, Design Transfer).</li>
    <li>A column is found by its field name with any prefix (Custom.DRPEDate). A release without the date gets the Feature without it, named in the pop-up; a Start date after the Target date skips the release.</li>
    <li>Shared for everyone with the bulk creation Epics; Save to Git commits it straight away.</li>
  </ul>}>
    <SettingsSummary rows={[
      ['Start date from', `${dpDateLabel(used.start)}${isDefault(used.start, dpBulkDateDefaults.start) ? ' — default' : ''}`],
      ['Target date from', `${dpDateLabel(used.target)}${isDefault(used.target, dpBulkDateDefaults.target) ? ' — default' : ''}`],
    ]} />
    <div className="button-row"><button type="button" className="ghost" disabled={Boolean(blocked)} title={blocked || undefined} onClick={() => setEditing(true)}>Edit dates…</button><WriteBlocked reason={blocked} /></div>
    {pending && !blocked && git && ['saving', 'synced', 'error', 'conflict'].includes(git.status) && git.message && <Notice tone={git.status === 'error' || git.status === 'conflict' ? 'error' : git.status === 'synced' ? 'success' : 'info'}>{git.message}</Notice>}
    {editing && <DpBulkDatesEditor used={used} options={options} fetched={fetched} onSave={save} onClose={() => setEditing(false)} />}
  </Panel>
}

function DpBulkDatesEditor({ used, options, fetched, onSave, onClose }: { used: DpBulkDates; options: { field: string; label: string }[]; fetched: boolean; onSave: (next: DpBulkDates) => void; onClose: () => void }) {
  const [start, setStart] = useState(used.start)
  const [target, setTarget] = useState(used.target)
  // A saved column the query no longer has is still offered, marked.
  const choices = (value: string) => options.some((option) => option.field.toLowerCase() === value.toLowerCase()) ? options : [...options, { field: value, label: `${dpDateLabel(value)} (not in the DP query now)` }]
  const label = (option: { field: string; label: string }, fallback: string) => `${option.label}${option.field.toLowerCase() === fallback.toLowerCase() ? ' — default' : ''}`
  return <Modal eyebrow="SETTINGS · BULK CREATION" title="DP bulk creation dates" onClose={onClose}>
    <form onSubmit={(event) => { event.preventDefault(); onSave({ start, target }) }}>
      <label>Start date from<select aria-label="Start date from" value={start} onChange={(event) => setStart(event.target.value)}>{choices(start).map((option) => <option key={option.field} value={option.field}>{label(option, dpBulkDateDefaults.start)}</option>)}</select><small>The DP query’s date column that gives each Feature its Start date.</small></label>
      <label>Target date from<select aria-label="Target date from" value={target} onChange={(event) => setTarget(event.target.value)}>{choices(target).map((option) => <option key={option.field} value={option.field}>{label(option, dpBulkDateDefaults.target)}</option>)}</select><small>The DP query’s date column that gives each Feature its Target date.</small></label>
      {!fetched && <p className="muted">The columns offered are the DP milestone dates and the query’s columns named …Date: fetch the DP query to see every column it returns.</p>}
      <div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button type="submit" className="primary">Save to Git</button></div>
    </form>
  </Modal>
}
