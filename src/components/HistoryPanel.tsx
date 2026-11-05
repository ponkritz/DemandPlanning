import { useMemo, useRef, useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { buildHistoryFile, defaultCutoff, featureChecks, groupOf, matchPeople, parseHistorySheet, pickHistorySheet, streamsWithoutEpic, withHistory, type HistoryRow, type SkippedRow, type UnreadableId } from '../history'
import type { HistoryStore } from '../useHistory'
import type { GitStorage } from '../useGitStorage'
import { readXlsx } from '../xlsx'
import { formatDateTime, formatHours, monthName } from '../format'
import { EmptyState, Metric, Metrics, Notice, Panel, SettingsSummary } from './ui'

interface Draft { source: string; sheet: string; rows: HistoryRow[]; skipped: SkippedRow[]; unreadable: UnreadableId[]; cutoff: string; people: Record<string, string>; streamEpics: Record<string, number> }

// Settings → Historical hours (HIS-01…HIS-09): upload the Excel planning workbook, check who each name is and which Epic
// each stream without an Epic No belongs to, then save it to Git for everyone. The file is read in this browser only;
// its rows are kept in the Git data repository, never in the app's source.
export function HistoryPanel({ history, git, items, profileNames, editable, importedBy }: { history: HistoryStore; git: GitStorage; items: AzureWorkItem[]; profileNames: string[]; editable: boolean; importedBy: string }) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const upload = useRef<HTMLInputElement>(null)
  // The names the reports know: everyone Assigned To a Task in Azure DevOps, and everyone in Settings → Resources.
  const known = useMemo(() => [...new Set([...items.filter((item) => item.workItemType === 'Task' && item.assignedTo).map((item) => item.assignedTo), ...profileNames])].sort((a, b) => a.localeCompare(b)), [items, profileNames])
  const epics = useMemo(() => items.filter((item) => item.workItemType === 'Epic' && item.state.trim().toLowerCase() !== 'removed').sort((a, b) => a.title.localeCompare(b.title)), [items])
  const file = history.file
  const merged = file ? withHistory(items, file) : null

  const [workbooks, setWorkbooks] = useState<{ name: string; path: string }[] | null>(null)
  const listWorkbooks = async () => {
    setStatus('')
    try { const found = await git.listWorkbooks(); setWorkbooks(found); if (!found.length) setStatus('No .xlsx file in the data repository (its folder or history/). Add the planning workbook there, or upload it from this computer.') }
    catch (failure) { setStatus(`Not read: ${failure instanceof Error ? failure.message : String(failure)}`) }
  }
  const fromGit = async (path: string) => {
    if (!path) return
    setBusy(true)
    try { await read(path.split('/').pop() || path, await git.readWorkbook(path)) } catch (failure) { setStatus(`Not read: ${failure instanceof Error ? failure.message : String(failure)}`) }
    setBusy(false)
  }
  const onUpload = async (chosen?: File) => {
    if (!chosen) return
    try {
      if (chosen.size > 30 * 1024 * 1024) throw new Error('The file is larger than 30 MB.')
      await read(chosen.name, new Uint8Array(await chosen.arrayBuffer()))
    } catch (failure) { setStatus(`Not read: ${failure instanceof Error ? failure.message : String(failure)}`) }
    finally { if (upload.current) upload.current.value = '' }
  }
  const read = async (source: string, bytes: Uint8Array) => {
    setStatus(''); setDraft(null)
    try {
      if (bytes.length > 30 * 1024 * 1024) throw new Error('The file is larger than 30 MB.')
      const sheets = await readXlsx(bytes)
      const sheet = pickHistorySheet(sheets)
      if (!sheet) throw new Error('No sheet with a person (QA/QE), a Month(Date) and an Expected / Actual column was found. The planning workbook\'s "TransformedData" sheet has them.')
      const cutoff = file?.cutoff ?? defaultCutoff
      const parsed = parseHistorySheet(sheet.rows, cutoff)
      const names = [...new Set(parsed.rows.map((row) => row.person))].filter((name) => !groupOf(name))
      // Earlier choices are kept for the names and streams they covered; new names are matched automatically.
      const people = { ...matchPeople(names, known), ...Object.fromEntries(Object.entries(file?.people ?? {}).filter(([name]) => names.includes(name))) }
      const streamEpics = Object.fromEntries(Object.entries(file?.streamEpics ?? {}).filter(([stream]) => parsed.rows.some((row) => row.epicId == null && (row.stream || '(no stream)') === stream)))
      setDraft({ source, sheet: sheet.name, rows: parsed.rows, skipped: parsed.skipped, unreadable: parsed.unreadable, cutoff, people, streamEpics })
    } catch (failure) { setStatus(`Not read: ${failure instanceof Error ? failure.message : String(failure)}`) }
  }
  const save = async () => {
    if (!draft) return
    setBusy(true); setStatus('Saving to Git…')
    try {
      const next = buildHistoryFile({ rows: draft.rows.filter((row) => row.month < draft.cutoff), cutoff: draft.cutoff, source: draft.source, sheet: draft.sheet, importedBy, streamEpics: draft.streamEpics, people: draft.people })
      await history.save(next, `Historical hours from ${draft.source} (${next.rows.length} rows before ${draft.cutoff})`)
      setDraft(null); setStatus('Saved to Git. The reports now count the history before the cut-off month.')
    } catch (failure) { setStatus(`Not saved: ${failure instanceof Error ? failure.message : String(failure)}`) }
    setBusy(false)
  }
  const remove = async () => {
    if (!window.confirm('Remove the historical hours for everyone? The reports then show only Azure DevOps hours, also before the cut-off month.')) return
    setBusy(true)
    try { await history.remove('Remove the historical hours'); setStatus('Removed.') } catch (failure) { setStatus(`Not removed: ${failure instanceof Error ? failure.message : String(failure)}`) }
    setBusy(false)
  }

  const rowsOf = (person: string) => draft?.rows.filter((row) => row.person === person && row.month < draft.cutoff).length ?? 0
  const draftNames = draft ? [...new Set(draft.rows.filter((row) => row.month < draft.cutoff).map((row) => row.person))].filter((name) => !groupOf(name)).sort((a, b) => a.localeCompare(b)) : []
  // Group rows (All, All-BLR, All-NL, All-US): shared time for everyone in the group (HIS-13).
  const groups = draft ? Object.entries(draft.rows.filter((row) => row.month < draft.cutoff && groupOf(row.person)).reduce<Record<string, number>>((all, row) => { const label = groupOf(row.person) === 'everyone' ? 'everyone' : `everyone in ${groupOf(row.person)}`; all[label] = (all[label] ?? 0) + 1; return all }, {})) : []
  const features = useMemo(() => new Set(items.filter((item) => item.workItemType === 'Feature').map((item) => item.id)), [items])
  // Rows placed by a Feature in the data need no stream; the others are placed by Epic No, else by their stream (HIS-07, HIS-10).
  const draftStreams = draft ? streamsWithoutEpic(draft.rows.filter((row) => row.month < draft.cutoff && !(row.featureId && features.has(row.featureId)))) : []
  // Why each stream needs an Epic (HIS-14): its rows' Feature Nos not in the fetched data, or no Feature No and no Epic No.
  const whyStream = (stream: string) => {
    const rows = draft ? draft.rows.filter((row) => row.month < draft.cutoff && row.epicId == null && !(row.featureId && features.has(row.featureId)) && (row.stream || '(no stream)') === stream) : []
    const notFetched = rows.filter((row) => row.featureId).length
    return [notFetched ? `${notFetched} with a Feature No not in the fetched data` : '', rows.length - notFetched ? `${rows.length - notFetched} without Feature No or Epic No` : ''].filter(Boolean).join(' · ')
  }
  const checks = draft ? featureChecks(draft.rows.filter((row) => row.month < draft.cutoff), items) : { missing: [], conflicts: [] }
  const byFeature = draft ? draft.rows.filter((row) => row.month < draft.cutoff && row.featureId && features.has(row.featureId)).length : 0
  const draftMonths = draft ? [...new Set(draft.rows.filter((row) => row.month < draft.cutoff).map((row) => row.month))].sort() : []
  const draftHours = draft ? draft.rows.filter((row) => row.month < draft.cutoff).reduce((sum, row) => sum + (row.actual ?? 0), 0) : 0
  // Rows left out by design (a month from the cut-off on, no hours that month) apart from rows to check (HIS-03).
  const expected = (reason: string) => /from the cut-off on|^no hours$/.test(reason)
  const toCheck = draft ? draft.skipped.filter((entry) => !expected(entry.reason)) : []
  const reasons = draft ? Object.entries(draft.skipped.reduce<Record<string, number>>((all, entry) => { const reason = entry.reason.replace(/^\d{4}-\d{2}: /, ''); all[reason] = (all[reason] ?? 0) + 1; return all }, {})) : []

  return <Panel className="admin-section" eyebrow="SHARED DATA" title="Historical hours" info={<ul><li>The planned and recorded hours of the months before Time Writing in Azure DevOps, from the planning workbook (sheet TransformedData: QA/QE, Month(Date), Epic No, Stream(Features), Project / Release Title, Expected, Actual, and an optional Feature ID column), uploaded from this computer or read from the Git data repository (its folder or history/).</li><li>Where a row has a Feature ID of a Feature in the fetched data, its hours count under that Feature and its Epic; else under the Epic No; else under the Epic chosen for its stream.</li><li>Before the cut-off month the history is the only source of hours: Azure DevOps Time Writing Tasks of those months are not counted (they stay in Azure DevOps). From the cut-off on, only Azure DevOps counts.</li><li>The rows are kept in the Git data repository (history-hours.json), never in the app's source; nothing is written to Azure DevOps.</li><li>People who have left appear by name; add them in Settings → Resources (region, role, Left on) so their utilization has a capacity.</li></ul>}>
    {!git.connected && <Notice tone="info">Connect Git storage (Settings → Storage): the historical hours are shared with everyone through Git.</Notice>}
    {history.note && <Notice tone="warning">{history.note}</Notice>}
    {file ? <SettingsSummary rows={[
      ['Source', `${file.source} · sheet ${file.sheet}`],
      ['Imported', `${file.importedAt ? formatDateTime(file.importedAt) : '—'}${file.importedBy ? ` by ${file.importedBy}` : ''}`],
      ['Cut-off', `${monthName(file.cutoff)}: history before it, Azure DevOps from it`],
      ['Rows', `${merged?.added.rows ?? 0} rows · ${merged?.added.people ?? 0} people · ${formatHours(merged?.added.hours ?? 0)}h recorded`],
      ['Azure DevOps left out', merged?.leftOut.tasks ? `${merged.leftOut.tasks} Time Writing Tasks before ${monthName(file.cutoff)} (${formatHours(merged.leftOut.hours)}h) are not counted; they stay in Azure DevOps.` : 'No Azure DevOps Time Writing Tasks before the cut-off.'],
    ]} /> : git.connected && history.loaded && !draft && <EmptyState title="No historical hours yet." detail={editable ? 'Upload the planning workbook (.xlsx) to bring in the months before Time Writing in Azure DevOps.' : 'Roles with Manage shared settings can upload them.'} />}
    {editable && <div className="button-row">
      <input ref={upload} type="file" accept=".xlsx" hidden onChange={(event) => void onUpload(event.target.files?.[0])} />
      <button type="button" className="primary" disabled={busy} onClick={() => upload.current?.click()}>{file ? 'Replace from Excel…' : 'Upload Excel…'}</button>
      {workbooks === null ? <button type="button" className="ghost" disabled={busy} onClick={() => void listWorkbooks()}>From Git storage…</button>
        : workbooks.length > 0 && <label className="inline-select">Workbook in Git storage<select value="" disabled={busy} onChange={(event) => void fromGit(event.target.value)}><option value="">Choose…</option>{workbooks.map((entry) => <option key={entry.path} value={entry.path}>{entry.path}</option>)}</select></label>}
      {file && <button type="button" className="ghost" disabled={busy} onClick={() => void remove()}>Remove history</button>}
      {file && git.historyFileHistory && <a href={git.historyFileHistory} target="_blank" rel="noreferrer">History in Git</a>}
    </div>}
    {!editable && git.connected && <small className="muted">Only roles with Manage shared settings can upload, replace or remove the historical hours.</small>}
    {status && <Notice tone={/^Not /.test(status) ? 'error' : 'info'}>{status}</Notice>}
    {draft && <div className="history-draft">
      <h3>Check before saving · {draft.source} · sheet {draft.sheet}</h3>
      <label className="inline-field">Cut-off month (first month from Azure DevOps)<input type="month" value={draft.cutoff} onChange={(event) => /^\d{4}-\d{2}$/.test(event.target.value) && setDraft({ ...draft, cutoff: event.target.value })} /></label>
      <small className="muted">Only rows before the cut-off are imported. Rows of the cut-off month or later in the file were left out on reading; upload again after changing the cut-off to a later month.</small>
      <Metrics>
        <Metric label="Rows imported" value={draft.rows.filter((row) => row.month < draft.cutoff).length} hint={draftMonths.length ? `${monthName(draftMonths[0])} – ${monthName(draftMonths[draftMonths.length - 1])}` : 'no month'} />
        <Metric label="People" value={draftNames.length} hint={`${draftNames.filter((name) => draft.people[name]).length} matched to Azure DevOps / Resources`} />
        <Metric label="Recorded hours" value={`${formatHours(draftHours)}h`} />
        <Metric label="By Feature ID" value={byFeature} hint="rows under a Feature in Azure DevOps" />
        <Metric label="Rows to check" value={toCheck.length} tone={toCheck.length ? 'negative' : undefined} hint={reasons.filter(([reason]) => !expected(reason)).map(([reason, count]) => `${count} ${reason}`).join(' · ') || 'none'} />
        <Metric label="Left out as expected" value={draft.skipped.length - toCheck.length} hint={reasons.filter(([reason]) => expected(reason)).map(([reason, count]) => `${count} ${reason}`).join(' · ') || 'none'} />
      </Metrics>
      {groups.length > 0 && <Notice tone="info">Rows for a group apply to each person in it, like a regional holiday Feature: {groups.map(([label, count]) => `${count} for ${label}`).join(' · ')}. Holidays and leave under the Team Holidays and Training Epic count as public holidays, everything else as reserved common time. People need their region in Settings → Resources.</Notice>}
      <h4>People</h4>
      <p className="muted">Each name in the Excel, and the name the reports use. A name matched to Azure DevOps joins that person's hours from the cut-off on; “As written” keeps the Excel name (for people who have left).</p>
      <div className="azure-table"><table><thead><tr><th>Name in the Excel</th><th>Rows</th><th>Name in the reports</th></tr></thead><tbody>
        {draftNames.map((name) => <tr key={name}><td>{name}</td><td>{rowsOf(name)}</td><td><select aria-label={`Report name for ${name}`} value={draft.people[name] ?? ''} onChange={(event) => { const people = { ...draft.people }; if (event.target.value) people[name] = event.target.value; else delete people[name]; setDraft({ ...draft, people }) }}>
          <option value="">As written: {name}</option>{known.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
        </select></td></tr>)}
      </tbody></table></div>
      {draftStreams.length > 0 && <>
        <h4>Streams without an Epic No</h4>
        <p className="muted">Choose the Epic each stream's hours belong to; without one they count under the stream's own name.</p>
        <div className="azure-table"><table><thead><tr><th>Stream (Features)</th><th>Rows</th><th>Why</th><th>Epic</th></tr></thead><tbody>
          {draftStreams.map(({ stream, count }) => <tr key={stream}><td>{stream}</td><td>{count}</td><td><small className="muted">{whyStream(stream)}</small></td><td><select aria-label={`Epic for ${stream}`} value={draft.streamEpics[stream] ?? ''} onChange={(event) => { const streamEpics = { ...draft.streamEpics }; const id = Number(event.target.value); if (id > 0) streamEpics[stream] = id; else delete streamEpics[stream]; setDraft({ ...draft, streamEpics }) }}>
            <option value="">Own stream: {stream}</option>{epics.map((epic) => <option key={epic.id} value={epic.id}>#{epic.id} {epic.title}</option>)}
          </select></td></tr>)}
        </tbody></table></div>
        {!epics.length && <small className="muted">No Epics fetched yet: refresh the Time Writing connection to choose from its Epics.</small>}
      </>}
      {draft.unreadable.length > 0 && <Notice tone="warning">Epic No / Feature No cells that are not a number (the row is placed by the next column that is): {draft.unreadable.slice(0, 30).map((entry) => `row ${entry.row} ${entry.column} “${entry.value}”`).join(' · ')}{draft.unreadable.length > 30 ? ` … and ${draft.unreadable.length - 30} more` : ''}.</Notice>}
      {(checks.missing.length > 0 || checks.conflicts.length > 0) && <Notice tone="warning">
        {checks.missing.length > 0 && <>Feature IDs not in the fetched data (placed by Epic No or stream instead): {checks.missing.slice(0, 40).map((id) => `#${id}`).join(', ')}{checks.missing.length > 40 ? ', …' : ''}. Refresh the Time Writing connection if they should be there. </>}
        {checks.conflicts.length > 0 && <>Feature ID and Epic No disagree (the Feature's Epic is used): {checks.conflicts.slice(0, 40).map((entry) => `#${entry.featureId} → Epic ${entry.epicOfFeature ? `#${entry.epicOfFeature}` : 'none'}, Epic No ${entry.epicNo}`).join('; ')}{checks.conflicts.length > 40 ? '; …' : ''}.</>}
      </Notice>}
      {toCheck.length > 0 && <details open><summary>The {toCheck.length} rows to check</summary><ul className="plain">{toCheck.slice(0, 500).map((entry) => <li key={entry.row}>Row {entry.row}: {entry.reason}</li>)}</ul></details>}
      {draft.skipped.length > 0 && <details><summary>All {draft.skipped.length} rows not imported</summary><ul className="plain">{draft.skipped.slice(0, 500).map((entry) => <li key={entry.row}>Row {entry.row}: {entry.reason}</li>)}</ul>{draft.skipped.length > 500 && <small className="muted">… and {draft.skipped.length - 500} more.</small>}</details>}
      <div className="button-row"><button type="button" className="ghost" disabled={busy} onClick={() => setDraft(null)}>Cancel</button><button type="button" className="primary" disabled={busy || !git.connected || !draft.rows.some((row) => row.month < draft.cutoff)} onClick={() => void save()}>Save to Git for everyone</button></div>
    </div>}
  </Panel>
}
