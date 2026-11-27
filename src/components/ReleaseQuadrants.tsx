import { formatDate, formatDateTime, monthName } from '../format'
import { completedCount, supportedCount, type ReleaseStream } from '../releaseOverview'
import { Panel, Pill } from './ui'

// Overview Releases tab: the summary lines first ("CP [2] : Care Pathways 3.1, Care Pathways 3.2"), next to them the
// Supported summary in the same format (DP's Supported Releases, S&S IT's releases with a document dated in the month —
// QV-33), then a 2x2 with one quadrant per stream (counts and the Titles of its documents approved in the month) and a
// last quadrant with the totals.
export interface SupportedLine { name: string; releases: string[] }
// QV-66: a stream the Streams filter leaves out stays listed, greyed and marked "Not counted"; the totals ignore it.
type Counted = (name: string) => boolean
const all: Counted = () => true
export const NotCounted = () => <Pill>Not counted</Pill>
export function SupportedSummary({ lines, month, counted = all, note = '' }: { lines: SupportedLine[]; month: string; counted?: Counted; note?: string }) {
  const total = lines.filter((line) => counted(line.name)).reduce((sum, line) => sum + line.releases.length, 0)
  return <Panel className="release-summary supported-summary" eyebrow="SUPPORTED" title={`${monthName(month)} · ${total} supported release${total === 1 ? '' : 's'}`} info={`Supported releases in the month, per stream, in the same format as the Releases: DP — the releases with a milestone passed in the month (Supported Releases); IOCC — the releases with a Release Plan, Release Notes or Verification Report signed in the month; Tool Validations — the unique tools with a validation document in the month; S&S IT — the unique releases of its Windchill export with a document whose Last Modified falls in the month (a release counts in every month one of its documents is dated in).${note ? ` ${note}` : ''}`}>
    <ul>{lines.map((line) => <li key={line.name} className={counted(line.name) ? undefined : 'not-counted'}>{!counted(line.name) && <><NotCounted />{' '}</>}<strong>{line.name} [{line.releases.length}]</strong> : {line.releases.length ? line.releases.join(', ') : <span className="muted">none</span>}</li>)}</ul>
  </Panel>
}
export function ReleaseQuadrants({ streams, month, supported = [], counted = all, note = '' }: { streams: ReleaseStream[]; month: string; supported?: SupportedLine[]; counted?: Counted; note?: string }) {
  // QV-58: a CP / DP / IOCC month without data counts what an Admin entered for it. QV-66: only the counted streams.
  const releases = streams.filter((stream) => counted(stream.name)).reduce((sum, stream) => sum + completedCount(stream), 0)
  const documents = streams.filter((stream) => counted(stream.name)).reduce((sum, stream) => sum + stream.documents, 0)
  const out = (stream: ReleaseStream) => counted(stream.name) ? undefined : 'not-counted'
  return <>
    <div className="release-summaries">
    <Panel className="release-summary" eyebrow="RELEASES" title={`${monthName(month)} · ${releases} release${releases === 1 ? '' : 's'}`} info={`Releases with documents approved in the month (Author Approval Date in UTC), per default stream: DP (name from the Area Path, number from the Iteration Path), CP, IOCC (Type of Release = the Area Path segment after IOCC, shown in brackets; name from the Title; Completed Releases = Release Notes or Verification Report signed in the month, Supported Releases = also a Release Plan signed — each release once), Content and Tool Validations (a “Release x.y.z” path segment). DP counts from its own query: Completed Releases (DT, Design Transfer: DDT Done with its DDT Date in the month) and Supported Releases (DT, SFV = Start of Verification / Hardening, PRD = PRD Milestone and RPE = Release Planning Event, Done in the month — each release once).${note ? ` ${note}` : ''}`}>
      <ul>{streams.map((stream) => <li key={stream.id} className={out(stream)}>{!counted(stream.name) && <><NotCounted />{' '}</>}<strong>{stream.name} [{completedCount(stream)}]</strong> : {stream.noData && stream.entered ? <span className="muted">entered by an Admin ({stream.noData})</span> : stream.releases.length ? stream.releases.map((entry) => `${[entry.name, entry.release].filter(Boolean).join(' ')}${entry.type ? ` (${entry.type})` : ''}`).join(', ') : <span className="muted">—</span>}</li>)}</ul>
    </Panel>
    {supported.length > 0 && <SupportedSummary lines={supported} month={month} counted={counted} note={note} />}
    </div>
    <section className="release-quadrants" aria-label={`Release counts in ${monthName(month)}`}>
      {streams.map((stream) => <Panel key={stream.id} className={`release-quadrant${counted(stream.name) ? '' : ' not-counted'}`} eyebrow={counted(stream.name) ? 'STREAM' : 'STREAM · NOT COUNTED'} title={stream.name} detail={!counted(stream.name) ? 'Not counted: left out by the Streams filter (the totals ignore it)' : stream.notSetUp ? `Not set up: add a connection named “${stream.name}” (Admin → Streams → Default connections)` : stream.fetchedAt ? `Data fetched ${formatDateTime(stream.fetchedAt)}` : 'Not fetched yet'}>
        <div className="quadrant-counts"><div><strong>{completedCount(stream)}</strong><span>{supportedCount(stream) != null ? 'completed' : `release${completedCount(stream) === 1 ? '' : 's'}`}</span></div><div><strong>{supportedCount(stream) ?? stream.documents}</strong><span>{supportedCount(stream) != null ? 'supported' : `document${stream.documents === 1 ? '' : 's'}`}</span></div></div>
        {stream.noData && <p className={stream.entered ? 'muted' : 'warning-text'}>{stream.entered ? `Entered by an Admin: no data (${stream.noData}).` : `No data (${stream.noData}): an Admin can enter the counts in Admin → Streams → Release counts.`}</p>}
        {stream.titles.length ? <ul className="quadrant-titles">{stream.titles.map((doc) => <li key={`${doc.id}:${doc.release}`}><a href={doc.url} target="_blank" rel="noreferrer">{doc.title}</a><small>{[doc.release, doc.approvalDate ? formatDate(doc.approvalDate) : ''].filter(Boolean).join(' · ')}</small></li>)}</ul> : <p className="muted">{stream.supported != null ? `No DT, SFV, PRD or RPE Done in ${monthName(month)}.` : `No documents approved in ${monthName(month)}.`}</p>}
      </Panel>)}
      <Panel className="release-quadrant release-quadrant-total" eyebrow="ALL STREAMS" title={`${releases} release${releases === 1 ? '' : 's'} · ${documents} document${documents === 1 ? '' : 's'}`} detail={`${monthName(month)}, per stream${streams.some((stream) => !counted(stream.name)) ? '; the streams not counted are left out of the total' : ''}.`}>
        <table><thead><tr><th>Stream</th><th>Releases</th><th>Documents</th></tr></thead><tbody>{streams.map((stream) => <tr key={stream.id} className={out(stream)}><td>{stream.name}{!counted(stream.name) && <small>Not counted</small>}</td><td>{completedCount(stream)}{supportedCount(stream) != null && <small> completed</small>}{stream.noData && stream.entered && <small> (entered)</small>}</td><td>{supportedCount(stream) != null ? <>{supportedCount(stream)}<small> supported</small></> : stream.documents}</td></tr>)}<tr className="matrix-total"><td>Total</td><td>{releases}</td><td>{documents}</td></tr></tbody></table>
      </Panel>
    </section>
  </>
}
