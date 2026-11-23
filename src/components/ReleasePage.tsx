import type { ReactNode } from 'react'
import { monthName } from '../format'
import { Info, Metric, Metrics, Panel } from './ui'
import { ViewActions, type ViewAction } from './ViewActions'

// UI-STANDARDS §10 (QV-62): the parts every stream's Release page (DP, CP, IOCC, Content, Tool Validations, S&S IT,
// ECP) shows in the same order — (1) the source bar, (2) the counts, (3) the Releases | Source data tabs
// (ResultTabs) and (4) the Releases table. A stream leaves out a part it cannot have.

// The period of a Release page (§7): the header month, or every month.
export type ReleaseScope = 'month' | 'all'
export function PeriodSelect({ month, value, onChange }: { month: string; value: ReleaseScope; onChange: (next: ReleaseScope) => void }) {
  return <label className="inline-field">Show<select aria-label="Show" value={value} onChange={(event) => onChange(event.target.value === 'all' ? 'all' : 'month')}><option value="month">{monthName(month)}</option><option value="all">All months</option></select></label>
}

// (1) The source bar: view name, source (server / project, or export file), when fetched, ⓘ, Show, ↻ and ⋯. Warnings
// about the data shown (fetch failed, other columns) follow as children.
export function ReleaseSourceBar({ name, source, fetched, info, period, primary, menu, children }: { name: string; source: ReactNode; fetched?: ReactNode; info?: ReactNode; period?: ReactNode; primary?: ReactNode; menu: ViewAction[]; children?: ReactNode }) {
  return <Panel className="release-source">
    <div className="view-source-bar">
      <div><strong>{name}</strong><span className="muted"> · {source}{fetched ? <> · {fetched}</> : null}</span>{info && <Info>{info}</Info>}</div>
      <div className="button-row">{period}<ViewActions label={name} primary={primary} items={menu} /></div>
    </div>
    {children}
  </Panel>
}

// (2) The counts of the header month: Releases in the month (as the Releases table lists them), Completed and
// Supported (as the stream counts them, QV-58, QV-64), with ⓘ "What was counted". A stream without a sound rule for
// a count leaves its tile out (Content: no Completed or Supported; Tool Validations, S&S IT, ECP: no Completed).
export interface CountValue { value: number | string; hint?: ReactNode }
export function ReleaseCounts({ month, releases, completed, supported, counted, children }: { month: string; releases: CountValue; completed?: CountValue; supported?: CountValue; counted: ReactNode; children?: ReactNode }) {
  const label = monthName(month)
  return <div className="release-counts">
    <Metrics>
      <Metric label={`Releases in ${label}`} value={releases.value} hint={releases.hint} />
      {completed && <Metric label="Completed" value={completed.value} hint={completed.hint} />}
      {supported && <Metric label="Supported" value={supported.value} hint={supported.hint} />}
    </Metrics>
    <p className="release-counts-info"><Info label="What was counted">{counted}</Info></p>
    {children}
  </div>
}
