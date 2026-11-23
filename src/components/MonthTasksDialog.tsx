import { useMemo, useState } from 'react'
import type { AzureWorkItem } from '../domain'
import type { AzureConfig } from '../azureDevOps'
import { utcMonthLabel } from '../azureDevOps'
import { setupHours, type FeatureSetups } from '../featureSetup'
import { isFutureMonth, monthKeyOfLabel, monthLabelOfKey } from '../featureMonths'
import { existingMonthNotice, existingMonthTasks, overrideConfirmText, startMonthTasksJob } from '../monthTaskAction'
import { assignablePeople, featureOf } from '../myWork'
import { adhocAfterLock } from '../planningLock'
import { Modal, Notice } from './ui'
import { PersonPicker } from './PersonPicker'

// BKL-34 "＋ Time Writing Task": the months to add a Time Writing Task for — the month in the header first — each with
// its hours (Original Estimate; Completed Work for a month not in the future), "＋ Add month" for the next one, any month
// changeable; a month the person already has a Task for shows it (its hours are updated only where typed).
// BKL-35: Assigned to — the person creating, changeable with the right to create work for others — is the Task's and
// the Time Writing story's assignee; a month that person already has a Task for is warned about on its row (no second
// Task, the typed hours override its hours) and confirmed before Add.
// BKL-37: Add closes the pop-up and runs as a background job (top bar), like every other long write (NAV-36).
type Row = { key: string; plan: string; done: string }
const nextKey = (key: string) => { const [year, month] = key.split('-').map(Number); return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}` }

export function MonthTasksDialog({ item, items, config, pat, me, canChoose = false, month, featureSetup, onDone, onFailed, onClose }: { item: AzureWorkItem; items: AzureWorkItem[]; config: AzureConfig; pat: string; me: string; canChoose?: boolean; month?: string; featureSetup?: FeatureSetups | null; onDone: (text: string, changed: AzureWorkItem[]) => void; onFailed?: (text: string, changed: AzureWorkItem[]) => void; onClose: () => void }) {
  const todayLabel = utcMonthLabel()
  const start = month && /^\d{4}-\d{2}$/.test(month) ? month : monthKeyOfLabel(todayLabel) ?? ''
  const [rows, setRows] = useState<Row[]>([{ key: start, plan: '', done: '' }])
  const [error, setError] = useState('')
  const feature = featureOf(items, item)
  const people = useMemo(() => assignablePeople(items), [items])
  const self = me.trim().toLowerCase()
  const [assigneeName, setAssigneeName] = useState('')
  const assignee = canChoose && assigneeName ? people.find((person) => person.name === assigneeName)?.email ?? '' : self
  const forOther = assignee && assignee !== self ? people.find((person) => person.email === assignee)?.name ?? assignee : ''
  // The Epic's default hours for a new Task (its Feature setup), shown as the placeholder.
  const defaultHours = useMemo(() => {
    const byId = new Map(items.map((entry) => [entry.id, entry]))
    let epic: AzureWorkItem | undefined = feature
    for (let guard = 0; epic && epic.workItemType !== 'Epic' && guard < 6; guard += 1) epic = epic.parentId == null ? undefined : byId.get(epic.parentId)
    return setupHours(featureSetup, epic?.id)
  }, [items, feature, featureSetup])
  // The assignee's month Tasks already under this Feature (any story), by month.
  const mine = useMemo(() => existingMonthTasks(items, feature, assignee), [items, feature, assignee])
  const keys = rows.map((row) => row.key)
  const duplicate = keys.find((key, index) => key && keys.indexOf(key) !== index)
  const set = (index: number, change: Partial<Row>) => setRows((now) => now.map((row, at) => at === index ? { ...row, ...change } : row))
  const addMonth = () => setRows((now) => { const last = [...now.map((row) => row.key)].filter(Boolean).sort().pop() ?? start; let key = nextKey(last); while (now.some((row) => row.key === key)) key = nextKey(key); return [...now, { key, plan: '', done: '' }] })

  function save() {
    if (!feature) { setError(`#${item.id} has no Feature above it to hold a Time Writing Task.`); return }
    if (rows.some((row) => !/^\d{4}-\d{2}$/.test(row.key))) { setError('Choose a month for every row.'); return }
    if (duplicate) { setError(`${monthLabelOfKey(duplicate)} is listed twice.`); return }
    if (!assignee) { setError('Choose who the Time Writing Tasks are assigned to.'); return }
    const hours = (value: string, what: string) => { if (!value.trim()) return undefined; const number = Number(value); if (!Number.isFinite(number) || number < 0 || number > 1000000) throw new Error(`${what} must be a number from 0 to 1,000,000.`); return number }
    let entries
    try { entries = [...rows].sort((a, b) => a.key.localeCompare(b.key)).map((row) => { const label = monthLabelOfKey(row.key); return { month: label, originalEstimate: hours(row.plan, `Original Estimate of ${label}`), completedWork: isFutureMonth(label, todayLabel) ? undefined : hours(row.done, `Completed Work of ${label}`) } }) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Check the hours.'); return }
    const existing = rows.flatMap((row) => { const task = mine.get(row.key); return task ? [{ label: monthLabelOfKey(row.key), task, typed: Boolean(row.plan.trim() || row.done.trim()) }] : [] })
    if (existing.length && !window.confirm(overrideConfirmText(existing))) return
    setError('')
    const started = startMonthTasksJob({ config, pat, items, item, assignee, entries, setups: featureSetup, onDone, onFailed })
    if (!started) { setError('These Time Writing Tasks are already being added in the background (see the top bar).'); return }
    onClose()
  }

  return <Modal title="Time Writing Tasks" eyebrow="AZURE DEVOPS WRITE" onClose={onClose}>
    <div className="month-tasks">
      <p className="muted">Your Time Writing Task per month under “{feature?.title ?? `#${item.id}`}” — “{'{Month}'} | {feature?.title ?? '…'}”. Add the months you need; the hours are optional and can be changed later.</p>
      {canChoose
        ? <label className="month-tasks-assignee">Assigned to<PersonPicker label="Assigned to" value={assigneeName} people={people.filter((person) => person.email !== self).map((person) => person.name)} onChange={setAssigneeName} meLabel={self ? `Me (${self})` : 'Choose a person…'} /></label>
        : <p className="month-tasks-assignee"><strong>Assigned to:</strong> {self || '—'} <small className="muted">(you; assigning work to others needs the right “Assign new work to other people”)</small></p>}
      {assignee && <small className="muted">Assigned To of the Task and its Time Writing story in Azure DevOps: {assignee}</small>}
      <table className="nf-month-hours"><thead><tr><th scope="col">Month</th><th scope="col">Original Estimate (h)</th><th scope="col">Completed Work (h)</th><th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
        <tbody>{rows.map((row, index) => { const label = row.key ? monthLabelOfKey(row.key) : '', future = Boolean(label) && isFutureMonth(label, todayLabel), existing = mine.get(row.key); return <tr key={index}>
          <th scope="row"><input type="month" aria-label={`Month ${index + 1}`} value={row.key} onChange={(event) => set(index, { key: event.target.value })} />
            {existing && <small className="month-tasks-note month-tasks-exists" role="note">{existingMonthNotice(monthLabelOfKey(row.key), existing, forOther)}</small>}
            {label && adhocAfterLock(label) && !existing && <small className="muted month-tasks-note">Planning is locked: tagged ad-hoc</small>}</th>
          <td><input type="number" aria-label={`Original Estimate (h) ${label || index + 1}`} min="0" max="1000000" step="0.25" value={row.plan} placeholder={existing?.originalEstimate != null ? String(existing.originalEstimate) : defaultHours != null ? `${defaultHours} (setup)` : 'Optional'} onChange={(event) => set(index, { plan: event.target.value })} /></td>
          <td><input type="number" aria-label={`Completed Work (h) ${label || index + 1}`} min="0" max="1000000" step="0.25" value={future ? '' : row.done} disabled={future} placeholder={future ? '—' : existing?.completedWork != null ? String(existing.completedWork) : 'Optional'} onChange={(event) => set(index, { done: event.target.value })} /></td>
          <td>{rows.length > 1 && <button type="button" className="text-button danger-text" aria-label={`Remove ${label || `month ${index + 1}`}`} onClick={() => setRows((now) => now.filter((_, at) => at !== index))}>✕</button>}</td>
        </tr> })}</tbody>
      </table>
      <div className="button-row"><button type="button" className="ghost" onClick={addMonth}>＋ Add month</button></div>
      {duplicate && <Notice tone="warning">{monthLabelOfKey(duplicate)} is listed twice.</Notice>}
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="primary" disabled={Boolean(duplicate) || !assignee} onClick={() => void save()}>{`Add ${rows.length} month${rows.length === 1 ? '' : 's'}`}</button></div>
    </div>
  </Modal>
}
