import { useEffect, useState } from 'react'
import { formatDateTime } from '../format'
import { cutSummary, type PublishCut } from '../publishData'
import { dayNames, nextOccurrence, offSchedule, scheduleText, type PublishSchedule, type ScheduleMode } from '../publishSchedule'
import { chooseTarget, currentTarget, prepareTarget, targetKind } from '../publishTarget'
import { runPublish, useSchedules, writeSchedule, type Prepare, type PublishAuthorization } from '../publishRun'
import { publishFileName } from '../standaloneHtml'
import { Modal, Notice } from './ui'

// OND-80, OND-94, OND-96 Publish interactive HTML… (UI-STANDARDS §4: a confirmation pop-up naming what is shared). It
// says how many rows of the page pass the publisher's filters (only those go into the file) and with which filters,
// shows the file it overwrites (Choose another file…) and the page's schedule on this computer — a scheduled run
// publishes with the filters saved with the schedule (Save schedule saves the current ones); Publish now asks for the
// file the first time (or after Choose another file…), then publishes as a Background job (§8) with the current
// filters; Save schedule keeps the schedule on this computer only. pageId / name: the table page or dashboard;
// cut / prepare: the publisher's current filters and the data cut with them.
export function PublishDialog({ pageId, name, cut, prepare, publishScope, authorization, publishedBy, onClose }: { pageId: string; name: string; cut: PublishCut; prepare: Prepare; publishScope: string; authorization: PublishAuthorization; publishedBy: string; onClose: () => void }) {
  const how = targetKind()
  const [target, setTarget] = useState<string | null | undefined>(undefined)
  const [again, setAgain] = useState(false)
  const saved = useSchedules()[publishScope]
  const [draft, setDraft] = useState<PublishSchedule>(() => saved ?? offSchedule(new Date()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  // The data as it would be published now (the counts and the filters it is cut with), or why it cannot be.
  const [preview] = useState(() => { try { return { data: prepare(new Date(), false), problem: '' } } catch (failure) { return { data: null, problem: failure instanceof Error ? failure.message : String(failure) } } })
  useEffect(() => { let live = true; void currentTarget(publishScope).then((value) => { if (live) setTarget(value) }, () => { if (live) setTarget(null) }); return () => { live = false } }, [publishScope])
  const data = preview.data
  const rows = data?.meta.rows ?? 0, all = data?.meta.all ?? 0
  const filters = data ? cutSummary(data) : ''
  const scheduleReason = how === 'download' ? 'This browser cannot write to a chosen file (no File System Access), so it cannot publish on a schedule: use the desktop app, or Chrome or Edge.' : !target ? 'Choose the file first: Publish now asks where to save it.' : ''
  const set = (change: Partial<PublishSchedule>) => { setDraft((current) => ({ ...current, ...change })); setNote('') }
  const publish = async () => {
    if (!data) return
    setBusy(true); setError('')
    try {
      authorization.check(publishScope, pageId)
      if (how !== 'download' && (!target || again)) { const chosen = await chooseTarget(publishScope, name); if (!chosen) { setBusy(false); return } setTarget(chosen) }
      else await prepareTarget(publishScope)
      authorization.check(publishScope, pageId)
      runPublish({ key: publishScope, id: pageId, name, publishedBy, cut, authorization, preview: data })
      onClose()
    } catch (failure) { setError(`The file could not be chosen: ${failure instanceof Error ? failure.message : String(failure)}`); setBusy(false) }
  }
  const saveSchedule = async () => {
    if (draft.mode !== 'off' && !data) return
    setBusy(true); setError('')
    try {
      await authorization.verify(publishScope, pageId)
      const now = new Date()
      writeSchedule(publishScope, () => draft.mode === 'off' ? undefined : { mode: draft.mode, day: draft.day, time: draft.time, setAt: now.toISOString(), cut, cutText: filters })
      const next = nextOccurrence(draft, now)
      setNote(draft.mode === 'off' ? 'No scheduled publish on this computer.' : `Saved on this computer with your current filters: ${scheduleText(draft)}${next ? `, next on ${formatDateTime(next.toISOString())}` : ''}.`)
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setBusy(false) }
  }
  return <Modal eyebrow={`ON-DEMAND · ${name.toUpperCase()}`} title="Publish interactive HTML" onClose={() => { if (!busy) onClose() }}>
    <form className="pgb-form publish-form" noValidate onSubmit={(event) => { event.preventDefault(); void publish() }}>
      {data ? <Notice tone="warning" className="publish-warning"><strong>This file contains the {rows} row{rows === 1 ? '' : 's'} of {name} that pass your filters.</strong> Anyone who receives it can read them. (Your filters: {filters}; {rows} of {all} row{all === 1 ? '' : 's'}; hidden rows are never published. An interactive dashboard that works offline — the charts, your filters to narrow further within these rows, the rows table — with who published it and when; no token or password.)</Notice>
        : <Notice tone="error">{preview.problem}</Notice>}
      {data?.meta.notes.map((entry) => <p key={entry} className="muted">{entry}</p>)}
      <div className="publish-target">
        <strong>File</strong>
        {how === 'download' ? <p>This browser cannot write to a chosen file (or its policy blocks it): Publish now downloads <code>{publishFileName(name)}</code> to your Downloads folder instead.</p>
          : target === undefined ? <p className="muted" role="status">Looking for the file…</p>
          : target && !again ? <p><code>{target}</code> — overwritten by each publish.{' '}<button type="button" className="text-button" onClick={() => setAgain(true)}>Choose another file…</button></p>
          : <p>{again ? 'Publish now asks for the file again.' : 'Not chosen yet: Publish now asks where to save it'} (suggested <code>{publishFileName(name)}</code>); the destination is remembered here for your account, this repository and this page.</p>}
      </div>
      <fieldset className="publish-schedule" disabled={busy || Boolean(scheduleReason)} title={scheduleReason || undefined}><legend>Schedule (on this computer)</legend>
        <div className="publish-modes">{(['off', 'daily', 'weekly'] as ScheduleMode[]).map((mode) => <label key={mode} className="check"><input type="radio" name="publish-mode" checked={draft.mode === mode} onChange={() => set({ mode })} />{mode === 'off' ? 'Off' : mode === 'daily' ? 'Daily' : 'Weekly'}</label>)}</div>
        {draft.mode !== 'off' && <div className="form-row">
          {draft.mode === 'weekly' && <label>Day<select aria-label="Day" value={draft.day} onChange={(event) => set({ day: Number(event.target.value) })}>{dayNames.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>}
          <label>At<input type="time" aria-label="Time" required value={draft.time} onChange={(event) => { if (/^\d{2}:\d{2}$/.test(event.target.value)) set({ time: event.target.value }) }} /></label>
        </div>}
        <small className="publish-schedule-filters">A scheduled run publishes the rows that pass the filters saved with the schedule, not those on screen then. Save schedule saves your current filters with it{data ? ` (${filters})` : ''}; Publish now always uses your current filters.</small>
        {saved?.cutText && <small role="status">Saved with the schedule: {saved.cutText}.</small>}
        <small>Runs only while the app is open here (the desktop app, or this browser tab while it may still write the file); a run missed while it was closed runs at the next start. Kept on this computer only, never in Git. Results and failures go to Background jobs; a failure also shows on the page.</small>
        {saved?.lastRun && <small role="status">Last scheduled run {formatDateTime(saved.lastRun)}: {saved.lastOk === false ? `failed — ${saved.lastText ?? ''}` : saved.lastText ?? 'done'}.</small>}
        <div><button type="button" className="ghost" onClick={() => void saveSchedule()}>Save schedule</button>{note && <small role="status"> {note}</small>}</div>
      </fieldset>
      {scheduleReason && <small>{scheduleReason}</small>}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !data}>{busy ? 'Publishing…' : 'Publish now'}</button></div>
    </form>
  </Modal>
}
