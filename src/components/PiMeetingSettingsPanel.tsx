import { useContext, useMemo, useState } from 'react'
import { Modal, Notice, Panel, SettingsSummary, WriteBlocked } from './ui'
import { ReleaseSettingsContext } from '../useStreamEpics'
import { allStreams } from '../streams'
import { meetingStreamEpics } from '../piMeetingSources'
import { colourProblem, contrastRatio, defaultLongRunning, defaultMeetingSettings, epicOrderLabel, fillPlaceholders, isHexColour, maxFooter, maxLongRunning, maxSubtitle, maxTeam, maxTitle, meetingPlaceholders, meetingSettingsChanges, meetingSettingsProblems, monthsLabel, oldPiLimitsNote, type EpicOrder, type MeetingSettings, type TitleTheme } from '../piMeetingSettings'
import type { PiFormStore } from '../usePiFormSetup'
import type { AzureWorkItem } from '../domain'

// PIR-58…PIR-62: Admin → Feature & PI setup → PI Review form → Meeting presentation — the settings of the PI Review
// Meeting file (piMeetingSettings.ts), saved with the PI Review form setup in Git (pi-review-form.json, schema 2). A
// summary of the saved values (UI-STANDARDS §3) and Edit meeting presentation… opening the form in a pop-up, disabled
// with the reason for everyone without "PI Review: set up the review form" and in View as, with the sample, without Git
// (the reasons of the PI Review form, PIR-31) — they read it only. PIR-85: the long-running limits are months; a file
// still holding the PI-based ones of PIR-57 shows a one-line note (they are not used) until saved again.
const example = { pi: 'PI 26.4', date: '26 Nov 2026', time: '14:30 CET', builtBy: 'Rita Gomez', team: '' }

export function PiMeetingSettingsPanel({ store, block, by, items = [] }: { store: PiFormStore; block: string; by: string; items?: AzureWorkItem[] }) {
  const [editing, setEditing] = useState(false)
  const settings = store.setup.meeting ?? defaultMeetingSettings()
  const releaseSettings = useContext(ReleaseSettingsContext)
  const epicTitle = useMemo(() => { const titles = new Map(items.filter((item) => item.workItemType === 'Epic').map((item) => [item.id, item.title])); return (id: number) => titles.get(id) ? `${titles.get(id)} (#${id})` : `Epic #${id}` }, [items])
  const own = Object.entries(settings.longRunningMonths).sort((a, b) => Number(a[0]) - Number(b[0]))
  return <Panel className="admin-section pir-meeting-setup" eyebrow="PI REVIEW" title="Meeting presentation" info={<>
    <p>How <strong>Conduct PI Meeting</strong> (PI Review) builds the PI Review Meeting file: the release-based streams whose releases and long-running Features it shows, when a Feature of those streams counts as long-running (a number of months since the Created Date, per Epic), the title slide and the footer of every slide, the colours, and the order of the Epics on every per-Epic slide.</p>
    <p>Placeholders in the title, subtitle and footer: {meetingPlaceholders.join(' ')} — {'{PI}'} is the PI’s number (“26.4”), {'{team}'} the team name below (else the Azure DevOps project). Saved with the PI Review form in Git; a meeting built after saving uses it.</p>
  </>}>
    {settings.oldPiLimits && <Notice tone="warning">{oldPiLimitsNote}</Notice>}
    <SettingsSummary rows={[
      ['Release-based streams', settings.streams.length ? settings.streams.join(', ') : 'None ticked (the Releases slide says “No release-based streams chosen”)'],
      ['Long-running after (months)', `${monthsLabel(settings.longRunningMonthsDefault)} by default${own.length ? `; ${own.map(([epic, count]) => `${epicTitle(Number(epic))}: ${monthsLabel(count)}`).join('; ')}` : ''}`],
      ['Order Epics by', epicOrderLabel[settings.epicOrder]],
      ['Title slide', `${fillPlaceholders(settings.title, example)}${settings.subtitle ? ` · ${fillPlaceholders(settings.subtitle, example)}` : ''} (${settings.titleTheme})`],
      ['Footer', `${fillPlaceholders(settings.footer, example) || '(none)'} · n / N`],
      ['Accent colour', <span key="accent" className="pir-accent"><span className="pir-swatch" aria-hidden="true" style={{ background: settings.accent }} />{settings.accent}</span>],
      ['Team name', settings.team || '(the Azure DevOps project)'],
    ]} />
    <div className="button-row"><button type="button" className="ghost" disabled={Boolean(block)} title={block || undefined} onClick={() => setEditing(true)}>Edit meeting presentation…</button><WriteBlocked reason={block} /></div>
    {editing && <MeetingSettingsEditor settings={settings} blocked={block} streamEpics={(streams) => meetingStreamEpics(streams, releaseSettings)} epicTitle={epicTitle}
      onSave={async (next, changes) => { await store.save({ ...store.setup, meeting: next, changedAt: `${new Date().toISOString().slice(0, 19)}Z`, ...(by ? { changedBy: by } : {}) }, `PI Review Meeting presentation: ${changes.join(', ')}`); setEditing(false) }}
      onClose={() => setEditing(false)} />}
  </Panel>
}

function MeetingSettingsEditor({ settings, blocked, streamEpics, epicTitle, onSave, onClose }: { settings: MeetingSettings; blocked: string; streamEpics: (streams: string[]) => Record<string, number[]>; epicTitle: (id: number) => string; onSave: (next: MeetingSettings, changes: string[]) => Promise<void>; onClose: () => void }) {
  // PIR-85: the PI-based limits of an older file are dropped at this save (the note says so), so it can be saved as is.
  const [draft, setDraft] = useState<MeetingSettings>(() => { const { oldPiLimits: _old, ...rest } = settings; return rest })
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)
  const [failure, setFailure] = useState('')
  const set = (change: Partial<MeetingSettings>) => { setDraft((current) => ({ ...current, ...change })); setFailure('') }
  const problems = meetingSettingsProblems(draft)
  const changes = meetingSettingsChanges(settings, draft)
  const epics = [...new Set(Object.values(streamEpics(draft.streams)).flat())].sort((a, b) => a - b)
  const streams = allStreams().map((stream) => stream.name)
  const colour = colourProblem(draft.accent, draft.titleTheme)
  const values = { ...example, team: draft.team || 'Project' }
  async function save() {
    setTried(true); setFailure('')
    if (blocked || problems.length || !changes.length) return
    setBusy(true)
    try { await onSave(draft, changes) } catch (error) { setFailure(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }
  const why = blocked || (busy ? 'Saving to Git…' : !changes.length ? 'Nothing changed yet.' : tried && problems.length ? 'Fix the problems above first.' : '')
  const setLong = (epic: number, value: string) => { const next = { ...draft.longRunningMonths }; if (value === '') delete next[String(epic)]; else next[String(epic)] = Number(value); set({ longRunningMonths: next }) }
  return <Modal title="Edit the meeting presentation" eyebrow="SETTINGS · PI REVIEW MEETING" wide onClose={() => { if (!busy) onClose() }}>
    <div className="pir-meeting-editor">
      <section aria-label="Title slide and footer">
        <h3>Title slide and footer</h3>
        <label>Title<input aria-label="Title" required maxLength={maxTitle} value={draft.title} onChange={(event) => set({ title: event.target.value })} /><small>Placeholders: {meetingPlaceholders.join(' ')}.</small></label>
        <label>Subtitle (optional)<input aria-label="Subtitle" maxLength={maxSubtitle} value={draft.subtitle} onChange={(event) => set({ subtitle: event.target.value })} /><small>For example “Built {'{date}'}, {'{time}'} by {'{builtBy}'}”.</small></label>
        <label>Footer text (optional)<input aria-label="Footer text" maxLength={maxFooter} value={draft.footer} onChange={(event) => set({ footer: event.target.value })} /><small>On every slide, followed by the slide number “n / N”; e.g. “Confidential · {'{team}'} · PI {'{PI}'}”.</small></label>
        <label>Team name (optional)<input aria-label="Team name" maxLength={maxTeam} value={draft.team} onChange={(event) => set({ team: event.target.value })} /><small>{'{team}'}; without it the Azure DevOps project of the Time Writing connection.</small></label>
        <div className="form-row">
          <label>Accent colour<input aria-label="Accent colour" required maxLength={7} value={draft.accent} onChange={(event) => set({ accent: event.target.value.trim() })} /><small>#rrggbb; headings, the title and links. {isHexColour(draft.accent) ? `Contrast with white ${contrastRatio(draft.accent, '#ffffff').toFixed(2)}:1 (at least 4.5:1).` : ''}</small></label>
          <label>Title slide<select aria-label="Title slide" value={draft.titleTheme} onChange={(event) => set({ titleTheme: event.target.value as TitleTheme })}><option value="light">Light (white, the title in the accent colour)</option><option value="dark">Dark (the accent colour, white text)</option></select><small>Printed light either way.</small></label>
        </div>
        {colour && <Notice tone="error">{colour}</Notice>}
        <h3>Preview</h3>
        <div className={`pir-meeting-preview${draft.titleTheme === 'dark' ? ' dark' : ''}`} aria-label="Title slide preview" role="img" style={isHexColour(draft.accent) ? (draft.titleTheme === 'dark' ? { background: draft.accent } : { color: draft.accent }) : undefined}>
          <span className="pir-preview-eyebrow">PI REVIEW</span>
          <strong className="pir-preview-title">{fillPlaceholders(draft.title, values) || '—'}</strong>
          {draft.subtitle && <span className="pir-preview-subtitle">{fillPlaceholders(draft.subtitle, values)}</span>}
          <span className="pir-preview-footer"><span>{fillPlaceholders(draft.footer, values)}</span><span>1 / 24</span></span>
        </div>
      </section>
      <section aria-label="Content">
        <h3>Order and streams</h3>
        <label>Order Epics by<select aria-label="Order Epics by" value={draft.epicOrder} onChange={(event) => set({ epicOrder: event.target.value as EpicOrder })}>{(Object.keys(epicOrderLabel) as EpicOrder[]).map((key) => <option key={key} value={key}>{epicOrderLabel[key]}</option>)}</select><small>Every per-Epic slide and chart; the tables of the file can be re-sorted while presenting.</small></label>
        <fieldset className="pir-streams"><legend>Release-based streams (optional)</legend>
          {streams.map((name) => <label key={name} className="check"><input type="checkbox" checked={draft.streams.includes(name)} onChange={(event) => set({ streams: event.target.checked ? streams.filter((entry) => entry === name || draft.streams.includes(entry)) : draft.streams.filter((entry) => entry !== name) })} />{name}</label>)}
          <small>Their releases (Releases in the PI) and their long-running Features are shown; none ticked: “No release-based streams chosen”.</small>
        </fieldset>
        <h3>Long-running after (months)</h3>
        {settings.oldPiLimits && <Notice tone="warning">{oldPiLimitsNote}</Notice>}
        <div className="azure-table pir-long-running"><table aria-label="Long-running after (months) per Epic"><thead><tr><th>Epic</th><th>Months</th></tr></thead><tbody>
          <tr><td>Default (every other Epic)</td><td><input type="number" aria-label="Long-running after, default" required min={1} max={maxLongRunning} step={1} value={draft.longRunningMonthsDefault} onChange={(event) => set({ longRunningMonthsDefault: event.target.value === '' ? defaultLongRunning : Number(event.target.value) })} /></td></tr>
          {epics.map((epic) => <tr key={epic}><td>{epicTitle(epic)}</td><td><input type="number" aria-label={`Long-running after, ${epicTitle(epic)}`} min={1} max={maxLongRunning} step={1} placeholder={`${draft.longRunningMonthsDefault} (default)`} value={draft.longRunningMonths[String(epic)] ?? ''} onChange={(event) => setLong(epic, event.target.value)} /></td></tr>)}
        </tbody></table></div>
        <small className="muted">A Feature not Closed / Done whose Created Date is more than this many calendar months before the build is long-running (created 20 May, 6 months: from 21 Nov). {epics.length ? 'Empty: the default.' : draft.streams.length ? 'No Epics are mapped to the ticked streams (Admin → Streams → Stream mapping).' : 'Tick a stream to set a number per Epic.'}</small>
      </section>
    </div>
    {tried && problems.length > 0 && <Notice tone="error">{problems.join(' ')}</Notice>}
    {failure && <Notice tone="error">Not saved: {failure}</Notice>}
    <div className="modal-actions"><WriteBlocked reason={why} /><button type="button" className="ghost" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={Boolean(blocked) || busy} onClick={() => void save()}>Save to Git</button></div>
  </Modal>
}
