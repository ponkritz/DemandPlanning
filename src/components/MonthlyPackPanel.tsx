import { useDeferredValue, useMemo, useState } from 'react'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { GitStorage } from '../useGitStorage'
import type { MonthlyPackStore } from '../useMonthlyPack'
import type { WindchillWorkspace } from '../useWindchill'
import type { PageProps } from '../pages/types'
import { buildMonthlyPack, monthLabel, noteLabels, packFill, packSlides, slideText, type MonthlyPackNotes, type NoteKey, type Slide, type SlideBox, type StreamMonth, type Utilization } from '../monthlyPack'
import { packStreamsOf, packUtilization } from '../packInputs'
import { capacityContext } from '../capacity'
import { writePptx, type PptxSlide } from '../pptx'
import { downloadPptx } from '../download'
import { Notice, Panel } from './ui'
import { fillTemplate, overallStatuses } from '../pptxTemplate'

// Pulse Check → Monthly pack: the two slides for the month (2x2 and Performance Pulse), each box with its generated
// lines (releases per line from the setup, utilisation, YoY, Epic KPIs) and the text typed for the month, saved to
// Git. Copy a box or a slide as text, or download both slides as .pptx: page 1 the Performance Pulse (Summary), page 2
// the 2x2 — in the team's PowerPoint template when one is in Storage (pptxTemplate.ts), else a plain layout (pptx.ts).

export function MonthlyPackPanel({ month, azure, store, git, pack, windchill }: { month: string; azure: AzureWorkspace; store: PageProps['store']; git: GitStorage; pack: MonthlyPackStore; windchill: WindchillWorkspace }) {
  // Keyed by content: the store rebuilds the settings object on every render, which would redo the capacity model per keystroke.
  const settingsKey = JSON.stringify([store.state.capacitySettings ?? null, store.state.resourceProfiles ?? null])
  const settings = useMemo(() => capacityContext(store.state), [settingsKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState<MonthlyPackNotes>(pack.notes)
  const [status, setStatus] = useState<{ tone: 'info' | 'success' | 'error'; text: string; url?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  // When the month's text arrives from Git (or the month changes), the draft follows it.
  const [seen, setSeen] = useState(pack.notes)
  if (pack.notes !== seen) { setSeen(pack.notes); setDraft(pack.notes); setStatus(null) }
  const editable = git.connected && !git.readOnly && !git.isSample
  const dirty = JSON.stringify(draft) !== JSON.stringify(pack.notes)

  const streamsOf = useMemo(() => (at: string): StreamMonth[] => packStreamsOf(store.state, azure.connectionProfiles, windchill, at), [store.state, azure.connectionProfiles, windchill])
  const utilization = useMemo((): Utilization => packUtilization(azure.items, month, settings), [azure.items, month, settings])
  // The boxes follow the keyboard at once; the pack (generated lines, KPIs, slide text) follows the typed text a moment
  // later, so typing never waits for it (the data part is also kept between keystrokes, monthlyPack.packBase).
  const typed = useDeferredValue(draft)
  const built = useMemo(() => buildMonthlyPack({ month, setup: pack.setup, notes: typed, items: azure.items, streamsOf, utilization }), [month, pack.setup, typed, azure.items, streamsOf, utilization])
  const slides = useMemo(() => packSlides(built), [built])

  const setText = (key: NoteKey, value: string) => setDraft((current) => ({ ...current, text: { ...current.text, [key]: value } }))
  const setKpi = (id: string, value: string) => setDraft((current) => ({ ...current, kpiValues: { ...current.kpiValues, [id]: value } }))
  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text); setStatus({ tone: 'success', text: `${what} copied.` }) } catch { setStatus({ tone: 'error', text: 'Copy failed: the browser refused clipboard access.' }) } }
  async function save() {
    setBusy(true); setStatus({ tone: 'info', text: 'Saving to Git…' })
    try { const result = await pack.saveNotes(draft, `Monthly pack ${month}`); setStatus({ tone: 'success', text: `Saved to Git (${monthLabel(month)}).`, url: result.commitUrl }) }
    catch (failure) { setStatus({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }) }
    finally { setBusy(false) }
  }
  async function download() {
    // The team's template from Storage, filled with the pack: the exact design. Without one, the plain layout below.
    if (git.connected && !git.isSample) {
      setStatus({ tone: 'info', text: 'Filling the PowerPoint template…' })
      try {
        const template = await git.readPackTemplate()
        if (template) {
          const filled = await fillTemplate(template, packFill(built, pack.setup.department ?? ''))
          downloadPptx(filled.bytes, `pulse-check-${month}.pptx`)
          setStatus(filled.missing.length ? { tone: 'error', text: `Downloaded in the template, but the template has no place for: ${filled.missing.join(', ')}.` } : { tone: 'success', text: 'Downloaded in the team template (Settings → Monthly pack).' })
          return
        }
        setStatus(null)
      } catch (failure) { setStatus({ tone: 'error', text: `The template could not be used (${failure instanceof Error ? failure.message : String(failure)}); the plain layout was downloaded instead.` }) }
    }
    plainDownload()
  }
  const plainDownload = () => {
    const [first, second] = slides
    const by = (slide: Slide, key: string) => slide.boxes.find((box) => box.key === key)!
    const grid = (slide: Slide, place: [string, number, number, number?][]): PptxSlide['boxes'] => place.map(([key, col, row, colSpan]) => ({ title: by(slide, key).title, lines: by(slide, key).lines, col, row, ...(colSpan ? { colSpan } : {}) }))
    const takeaways = { ...by(second, 'takeaways'), lines: [...by(second, 'takeaways').lines, ...(by(second, 'next').lines.length ? ['Key next steps:', ...by(second, 'next').lines] : [])] }
    const risks = { ...by(second, 'risks'), lines: [...by(second, 'risks').lines, ...(by(second, 'mitigation').lines.length ? ['Proposed mitigation:', ...by(second, 'mitigation').lines] : [])] }
    // Page 1 the Performance Pulse (Summary), page 2 the 2x2.
    const deck: PptxSlide[] = [
      { title: second.title, subtitle: second.subtitle, columns: 3, rows: 3, boxes: [...grid(second, [['summary', 0, 0, 2], ['status', 2, 0]]), { title: takeaways.title, lines: takeaways.lines, col: 0, row: 1 }, ...grid(second, [['decision', 1, 1]]), { title: risks.title, lines: risks.lines, col: 2, row: 1 }, ...grid(second, [['leadership', 0, 2], ['kpi', 1, 2, 2]])] },
      { title: first.title, subtitle: first.subtitle, columns: 2, rows: 2, boxes: grid(first, [['deliverables', 0, 0], ['observations', 1, 0], ['focus', 0, 1], ['support', 1, 1]]) },
    ]
    downloadPptx(writePptx(deck), `pulse-check-${month}.pptx`)
  }

  const box = (slide: Slide, entry: SlideBox) => <div key={entry.key} className="pack-box">
    <div className="pack-box-head"><h4>{entry.title}</h4><button type="button" className="text-button" onClick={() => void copy(entry.lines.map((line) => `• ${line}`).join('\n'), entry.title)}>Copy</button></div>
    {entry.key !== 'kpi' && entry.generated.length > 0 && <ul className="pack-generated">{entry.generated.map((line, index) => <li key={index}>{line}</li>)}</ul>}
    {entry.key === 'kpi' && <table className="pack-kpi"><tbody>{built.kpis.map((row) => <tr key={row.id}><td>{row.label}</td><td><input aria-label={`${row.label} value`} value={draft.kpiValues[row.id] ?? ''} placeholder={row.computed || '—'} disabled={!editable || busy} onChange={(event) => setKpi(row.id, event.target.value)} />{!row.manual && <small className="muted pack-kpi-calc">{row.overridden ? <>Overridden · calculated {row.computed || '—'} <button type="button" className="text-button" disabled={!editable || busy} onClick={() => setKpi(row.id, '')}>Use calculated</button></> : `Calculated ${row.computed || '—'}; type to override`}</small>}</td></tr>)}</tbody></table>}
    {entry.key === 'status' && <select aria-label={`Overall status for ${monthLabel(month)}`} value={draft.text.overallStatus ?? ''} disabled={!editable || busy} onChange={(event) => setText('overallStatus', event.target.value)}><option value="">On Track (default)</option>{overallStatuses.map((value) => <option key={value} value={value}>{value}</option>)}</select>}
    {entry.note && entry.key !== 'status' && <textarea aria-label={`${noteLabels[entry.note]} for ${monthLabel(month)}`} rows={3} placeholder={entry.generated.length ? 'Add lines (one per line)…' : 'One line per bullet…'} value={draft.text[entry.note] ?? ''} disabled={!editable || busy} onChange={(event) => setText(entry.note!, event.target.value)} />}
    {entry.key === 'kpi' && !editable && <small className="muted">Values are typed with a Git token that can save.</small>}
    {slide.title && null}
  </div>

  return <>
    <Panel className="pack-panel" eyebrow="MONTHLY PACK" title={`${monthLabel(month)} · two slides`} info={<p>The slides for the month before the header month, as presented in the following month's call. Generated lines come from the data in the app: releases per slide line (Settings → Monthly pack decides which streams and Epics feed each line), actual utilisation of the month and this year (QE apart), the year-on-year change of the supported releases, and the KPI rows read from Epics. Everything else is typed here per month and saved to the Git data repository (monthly-pack/{month}.json), so the team sees the same text. Copy a box or a slide as text into the PowerPoint template, or download both slides as .pptx and restyle them there.</p>}
      action={<div className="button-row">
        <button type="button" className="ghost" onClick={() => void download()}>Download .pptx</button>
        {editable && <button type="button" className="primary" disabled={!dirty || busy} onClick={() => void save()}>Save to Git</button>}
        {pack.notesHistory && <a className="text-button" href={pack.notesHistory} target="_blank" rel="noreferrer">History</a>}
      </div>}>
      {!pack.hasSetup && <Notice tone="info">No Monthly pack setup in Git yet: the default lines (Serviceability = S&S IT, Digital Platform = DP, Clinical Platform = CP, IOCC, PPU, Content, Tool validation) and KPI rows apply. Settings → Monthly pack maps streams and Epics to the slide lines.</Notice>}
      {pack.setupError && <Notice tone="warning">Monthly pack setup: {pack.setupError}</Notice>}
      {pack.notesError && <Notice tone="warning">Monthly pack text: {pack.notesError}</Notice>}
      {!editable && <p className="muted">{git.isSample ? 'Synthetic sample data is loaded: the text cannot be saved.' : git.connected ? 'View only: your Git token can read but not save.' : 'Connect Git storage (Settings → Storage) to type and save the slide text.'}</p>}
      {status && <Notice tone={status.tone === 'error' ? 'warning' : 'info'}><span role="status">{status.text}</span>{status.url && <> <a href={status.url} target="_blank" rel="noreferrer">View commit</a></>}</Notice>}
      {[...slides].reverse().map((slide) => <section key={slide.title} className="pack-slide" aria-label={slide.title}>
        <div className="pack-slide-head"><h3>{slide.title} <small className="muted">{slide.subtitle}</small></h3><button type="button" className="ghost" onClick={() => void copy(slideText(slide), slide.title)}>Copy slide as text</button></div>
        <div className={`pack-grid ${slide.boxes.length > 4 ? 'pack-grid-3' : 'pack-grid-2'}`}>{slide.boxes.map((entry) => box(slide, entry))}</div>
      </section>)}
    </Panel>
  </>
}
