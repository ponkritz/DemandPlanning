import { useState, type ReactNode } from 'react'
import { monthName } from '../format'
import { Info, Metric, Metrics, Modal } from './ui'
import { ViewActions, type ViewAction } from './ViewActions'

// UI-STANDARDS §10 (QV-62): the parts every stream's Release page (DP, CP, IOCC, Content, Tool Validations, S&S IT,
// ECP) shows in the same order — (1) the source bar, (2) the counts, (3) the Releases | Source data tabs
// (ResultTabs) and (4) the Releases table. A stream leaves out a part it cannot have.

// The period of a Release page (§7): the header month, or every month — a toggle **Selected month | All months**
// (QV-71); the month itself is in the top bar, so it is not repeated here (named in the Selected month tooltip).
export type ReleaseScope = 'month' | 'all'
export function PeriodSelect({ month, value, onChange }: { month: string; value: ReleaseScope; onChange: (next: ReleaseScope) => void }) {
  const options: [ReleaseScope, string, string][] = [['month', 'Selected month', `Only ${monthName(month)} (the month in the top bar)`], ['all', 'All months', 'Every month']]
  return <div className="segmented" role="radiogroup" aria-label="Show">{options.map(([key, label, title]) => <button key={key} type="button" role="radio" aria-checked={value === key} className={value === key ? 'active' : ''} title={title} onClick={() => onChange(key)}>{label}</button>)}</div>
}

// (1) The source bar (QV-62, QV-70): only the controls, right-aligned — Show, ↻ and ⋯ (the page title already names
// the view). Where the data comes from and when it was fetched or imported is the first line of the ⋯ menu (not an
// action); the details of the view (month filter rule, items fetched, milestone names, the Git copy) are behind
// ⋯ → About this source…, a pop-up with the same source line. Warnings about the data shown (fetch failed, other
// columns) follow as children.
export function ReleaseSourceBar({ name, source, fetched, about, period, primary, menu, children }: { name: string; source: string; fetched?: string; about?: ReactNode; period?: ReactNode; primary?: ReactNode; menu: ViewAction[]; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const line = fetched ? `${source} · ${fetched}` : source
  const items: ViewAction[] = [
    { key: 'source', label: line, render: () => <p className="view-actions-note">{line}</p> },
    ...menu,
    ...(about ? [{ key: 'about', label: 'About this source…', onClick: () => setOpen(true) }] : []),
  ]
  return <div className="release-source">
    <div className="view-source-bar"><div className="button-row">{period}<ViewActions label={name} primary={primary} items={items} /></div></div>
    {children}
    {open && <Modal eyebrow={`RELEASE PAGE · ${name.toUpperCase()}`} title="About this source" form={false} onClose={() => setOpen(false)}>
      <div className="release-source-about"><p className="muted">{line}</p>{about}</div>
      <div className="modal-actions"><button type="button" className="primary" onClick={() => setOpen(false)}>Close</button></div>
    </Modal>}
  </div>
}

// (2) The counts of the header month: Releases in the month (as the Releases table lists them), Completed and
// Supported (as the stream counts them, QV-58, QV-64), with ⓘ "What was counted". A stream without a sound rule for
// a count leaves its tile out (Content: no Completed or Supported; Tool Validations, S&S IT, ECP: no Completed).
export interface CountValue { value: number | string; hint?: ReactNode }
// `noun` names what is counted (TVL-23: Tool Validations counts Validations, not Releases).
export function ReleaseCounts({ month, releases, completed, supported, counted, noun, children }: { month: string; releases: CountValue; completed?: CountValue; supported?: CountValue; counted: ReactNode; noun?: 'validations'; children?: ReactNode }) {
  const label = monthName(month)
  const tool = noun === 'validations'
  return <div className="release-counts">
    <Metrics>
      <Metric label={`${tool ? 'Validations' : 'Releases'} in ${label}`} value={releases.value} hint={releases.hint} />
      {completed && <Metric label={tool ? 'Completed validations' : 'Completed'} value={completed.value} hint={completed.hint} />}
      {supported && <Metric label={tool ? 'Supported validations' : 'Supported'} value={supported.value} hint={supported.hint} />}
    </Metrics>
    <p className="release-counts-info"><Info label="What was counted">{counted}</Info></p>
    {children}
  </div>
}
