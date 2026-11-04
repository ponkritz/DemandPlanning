import { useRef, useState } from 'react'
import type { PeriodControl } from '../domain'
import type { GitStorage } from '../useGitStorage'
import type { PageProps } from '../pages/types'
import { actualsLocked, normalizePeriods, periodFor, planningLocked } from '../planningLock'
import { usePlanningClock } from '../usePlanningClock'
import { formatDateTime, monthName } from '../format'
import { Notice, Panel, Pill } from './ui'

const dateValue = (value: string) => {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
type Mode = 'automatic' | 'locked' | 'unlocked'

export function PeriodControls({ store, git, month, actor }: Pick<PageProps, 'store' | 'month'> & { git: GitStorage; actor: string }) {
  const original = store.state.periods.find((period) => period.month === month)
  const saved = periodFor(store.state.periods, month)
  const savedSignature = JSON.stringify(saved)
  const [edit, setEdit] = useState(() => ({ source: savedSignature, value: saved }))
  const draft = edit.source === savedSignature ? edit.value : saved
  const setDraft = (update: (current: PeriodControl) => PeriodControl) => setEdit((current) => ({ source: savedSignature, value: update(current.source === savedSignature ? current.value : saved) }))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ error?: boolean; text: string } | null>(null)
  const pending = useRef(false)
  const now = usePlanningClock()
  const locked = { planning: planningLocked(store.state.periods, month, now), actuals: actualsLocked(store.state.periods, month, now) }
  const mode = (kind: 'planning' | 'actuals'): Mode => draft[`${kind}Override`] ?? (draft[`${kind}Locked`] ? 'locked' : 'automatic')
  const setMode = (kind: 'planning' | 'actuals', value: Mode) => setDraft((current) => ({ ...current, [`${kind}Override`]: value === 'automatic' ? undefined : value, [`${kind}Locked`]: value === 'locked' }))
  const setDate = (kind: 'planning' | 'actuals', value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return
    setDraft((current) => ({ ...current, [`${kind}Deadline`]: new Date(`${value}T23:59:59.999`).toISOString(), [`${kind}ExtendedUntil`]: undefined }))
  }
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (pending.current || !reason.trim()) return
    pending.current = true; setBusy(true); setMessage(null)
    try {
      const next: PeriodControl = { ...draft, controlVersion: 2, extensionReason: reason.trim(), updatedAt: new Date().toISOString(), updatedBy: actor }
      if (git.connected) await git.savePeriod(next, original)
      else await store.savePeriods(normalizePeriods([...store.state.periods.filter((period) => period.month !== month), next]))
      store.addAudit({ actor, action: 'Update', entity: 'PeriodControl', entityId: month, detail: `Planning ${mode('planning')}: ${next.planningExtendedUntil || next.planningDeadline}; Actuals ${mode('actuals')}: ${next.actualsExtendedUntil || next.actualsDeadline}. ${reason.trim()}` })
      setMessage({ text: git.connected ? `${monthName(month)} controls saved to ${git.config?.owner}/${git.config?.repo}. Both locks apply to this month.` : `${monthName(month)} controls saved in this browser. Connect Git storage and Save to share them with everyone.` })
    } catch (error) { setMessage({ error: true, text: error instanceof Error ? error.message : 'Could not save controls.' }) }
    finally { pending.current = false; setBusy(false) }
  }
  return <Panel eyebrow="PERIOD CONTROL" title={monthName(month)}>
    <p>Both controls below belong to {monthName(month)}. Plan defaults to the 5th of this month; Actuals defaults to the 5th of the following month. Dates end at 23:59:59 in your local time when saved.</p>
    <form onSubmit={(event) => void save(event)}>
      <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} disabled={busy || (git.connected && git.readOnly) || git.isSample}>
        {(['planning', 'actuals'] as const).map((kind) => <div className="control-card" key={kind}>
          <div><strong>{kind === 'planning' ? 'Planning' : 'Actuals'}</strong><p>Saved deadline: {formatDateTime(saved[`${kind}ExtendedUntil`] || saved[`${kind}Deadline`])}</p></div>
          <Pill tone={locked[kind] ? 'locked' : 'open'}>{locked[kind] ? 'Locked' : 'Open'}</Pill>
          <label>{kind === 'planning' ? 'Plan' : 'Actual'} lock date<input type="date" required value={dateValue(draft[`${kind}ExtendedUntil`] || draft[`${kind}Deadline`])} onChange={(event) => setDate(kind, event.target.value)} /></label>
          <label>{kind === 'planning' ? 'Plan' : 'Actual'} mode<select aria-label={`${kind === 'planning' ? 'Plan' : 'Actual'} mode`} value={mode(kind)} onChange={(event) => setMode(kind, event.target.value as Mode)}><option value="automatic">Automatic — follow deadline</option><option value="locked">Locked</option><option value="unlocked">Unlocked — override deadline</option></select></label>
        </div>)}
        <label>Reason for change<textarea required value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        <p className="muted">Save applies only to this selected month. Manual Unlock stays open until changed back to Automatic or Locked.</p>
        <div className="button-row"><button className="primary" type="submit" disabled={!reason.trim()}>{busy ? 'Saving…' : 'Save month controls'}</button>{git.connected && <button type="button" className="ghost" onClick={() => void git.load()}>Reload shared controls</button>}</div>
      </fieldset>
    </form>
    {git.readOnly && <Notice>View only: your Git token cannot save these controls.</Notice>}
    {git.status === 'error' && <Notice tone="error">{git.message}</Notice>}
    {git.isSample && <Notice tone="warning">Synthetic sample data is loaded. Period changes are disabled.</Notice>}
    {!git.connected && <Notice tone="warning">Controls are local to this browser until saved to Git storage. {store.cache.message}</Notice>}
    {saved.updatedAt && <p className="muted">Last saved: {formatDateTime(saved.updatedAt)} · {saved.updatedBy}{saved.extensionReason ? ` · ${saved.extensionReason}` : ''}</p>}
    {message && <Notice tone={message.error ? 'error' : 'success'}>{message.text}</Notice>}
  </Panel>
}
