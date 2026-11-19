import { useState } from 'react'
import { monthRange } from '../dashboard'
import { formatDate, monthName } from '../format'
import { signedInPeriod, type SignedDocument } from '../mySignatures'
import { EmptyState, Metric, Metrics, TablePanel } from './ui'

// MYD-13: the releases and documents I signed (Author, Reviewer or Approver) in a period I choose, per stream and in
// total, with the documents behind the figures.
export function SignedByMe({ signed, streams, month, missing }: { signed: SignedDocument[]; streams: string[]; month: string; missing: string[] }) {
  const year = month.slice(0, 4), quarterStart = `${year}-${String(Math.floor((Number(month.slice(5)) - 1) / 3) * 3 + 1).padStart(2, '0')}`
  const quick = [
    { label: 'This month', from: month, to: month },
    { label: 'This quarter', from: quarterStart, to: month },
    { label: 'This year', from: `${year}-01`, to: month },
    { label: 'Last 12 months', from: monthRange(month, 12)[0], to: month },
  ]
  const [period, setPeriod] = useState({ from: quick[3].from, to: month })
  const result = signedInPeriod(signed, period.from, period.to, streams)
  const span = period.from === period.to ? monthName(period.from) : `${monthName(period.from)} – ${monthName(period.to)}`
  return <TablePanel title={`Signed by me · ${span}`} info={<ul><li>A document counts when your name or work email is in one of its Author, Reviewer or Approver fields (any field or column whose name says so).</li><li>Its date is your own signature date when the field has one, else the document's approval date (Author Approval Date, else Closed Date; Windchill: its date column).</li><li>A release counts once you signed any one of its documents in the period.</li></ul>}>
    <div className="signed-period" role="group" aria-label="Period">
      <label>From<input type="month" aria-label="From month" value={period.from} max={period.to} onChange={(event) => event.target.value && setPeriod((current) => ({ ...current, from: event.target.value }))} /></label>
      <label>To<input type="month" aria-label="To month" value={period.to} min={period.from} onChange={(event) => event.target.value && setPeriod((current) => ({ ...current, to: event.target.value }))} /></label>
      <div className="ovw-chips">{quick.map((entry) => <button key={entry.label} type="button" aria-pressed={period.from === entry.from && period.to === entry.to} className={period.from === entry.from && period.to === entry.to ? 'active' : ''} onClick={() => setPeriod({ from: entry.from, to: entry.to })}>{entry.label}</button>)}</div>
    </div>
    <Metrics>
      <Metric label="Releases signed" value={result.total.releases} hint="any one of its documents" />
      <Metric label="Documents signed" value={result.total.documents} hint="as Author, Reviewer or Approver" />
    </Metrics>
    <div className="azure-table"><table aria-label="Signed by me per stream"><thead><tr><th>Stream</th><th>Releases</th><th>Documents</th></tr></thead><tbody>
      {result.streams.map((row) => <tr key={row.stream}><td>{row.stream}</td><td>{row.releases}</td><td>{row.documents}</td></tr>)}
      <tr className="matrix-total"><td>All streams</td><td>{result.total.releases}</td><td>{result.total.documents}</td></tr>
    </tbody></table></div>
    {missing.length > 0 && <p className="muted">No data with Author, Reviewer or Approver fields yet: {missing.join(', ')}. Fetch the stream (or import its export) with those fields to count it.</p>}
    {result.undated > 0 && <p className="muted">{result.undated} signed document{result.undated === 1 ? ' has' : 's have'} no date and {result.undated === 1 ? 'is' : 'are'} not counted in any period.</p>}
    {result.total.signed.length ? <details className="signed-list"><summary>The {result.total.documents} document{result.total.documents === 1 ? '' : 's'}</summary><div className="azure-table"><table><thead><tr><th>Stream</th><th>Release</th><th>Document</th><th>As</th><th>Date</th></tr></thead><tbody>
      {result.total.signed.toSorted((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).map((entry, index) => <tr key={`${entry.stream}-${entry.id ?? entry.document}-${index}`}><td>{entry.stream}</td><td>{entry.release}</td><td>{entry.url ? <a href={entry.url} target="_blank" rel="noreferrer">#{entry.id}</a> : null} {entry.document}</td><td>{entry.field}</td><td>{entry.date ? formatDate(entry.date.slice(0, 10)) : '—'}</td></tr>)}
    </tbody></table></div></details> : <EmptyState title="Nothing signed by you in this period." detail="Choose another period, or check that the streams are fetched with their Author, Reviewer and Approver fields." />}
  </TablePanel>
}
