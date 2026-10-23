import { formatDate, formatDateTime, monthName } from '../format'
import type { ReleaseStream } from '../releaseOverview'
import { Panel } from './ui'

// Overview Releases tab: the summary lines first ("CP [2] : Care Pathways 3.1, Care Pathways 3.2"), then a 2x2 with one
// quadrant per stream (counts and the Titles of its documents approved in the month) and a last quadrant with the totals.
export function ReleaseQuadrants({ streams, month }: { streams: ReleaseStream[]; month: string }) {
  const releases = streams.reduce((sum, stream) => sum + stream.releases.length, 0)
  const documents = streams.reduce((sum, stream) => sum + stream.documents, 0)
  return <>
    <Panel className="release-summary" eyebrow="RELEASES" title={`${monthName(month)} · ${releases} release${releases === 1 ? '' : 's'}`} info="Releases with documents approved in the month (Author Approval Date in your time zone), per default stream: DP (name from the Area Path, number from the Iteration Path), CP, IOCC (Type of Release = the Area Path segment after IOCC, shown in brackets; name from the Title), Content and Tool Validations (a “Release x.y.z” path segment).">
      <ul>{streams.map((stream) => <li key={stream.id}><strong>{stream.name} [{stream.releases.length}]</strong> : {stream.releases.length ? stream.releases.map((entry) => `${[entry.name, entry.release].filter(Boolean).join(' ')}${entry.type ? ` (${entry.type})` : ''}`).join(', ') : <span className="muted">—</span>}</li>)}</ul>
    </Panel>
    <section className="release-quadrants" aria-label={`Release counts in ${monthName(month)}`}>
      {streams.map((stream) => <Panel key={stream.id} className="release-quadrant" eyebrow="STREAM" title={stream.name} detail={stream.notSetUp ? `Not set up: add a connection named “${stream.name}” (Settings → Azure DevOps → Default connections)` : stream.fetchedAt ? `Data fetched ${formatDateTime(stream.fetchedAt)}` : 'Not fetched yet'}>
        <div className="quadrant-counts"><div><strong>{stream.releases.length}</strong><span>release{stream.releases.length === 1 ? '' : 's'}</span></div><div><strong>{stream.documents}</strong><span>document{stream.documents === 1 ? '' : 's'}</span></div></div>
        {stream.titles.length ? <ul className="quadrant-titles">{stream.titles.map((doc) => <li key={doc.id}><a href={doc.url} target="_blank" rel="noreferrer">{doc.title}</a><small>{doc.release}{doc.approvalDate ? ` · ${formatDate(doc.approvalDate)}` : ''}</small></li>)}</ul> : <p className="muted">No documents approved in {monthName(month)}.</p>}
      </Panel>)}
      <Panel className="release-quadrant release-quadrant-total" eyebrow="ALL STREAMS" title={`${releases} release${releases === 1 ? '' : 's'} · ${documents} document${documents === 1 ? '' : 's'}`} detail={`${monthName(month)}, per stream.`}>
        <table><thead><tr><th>Stream</th><th>Releases</th><th>Documents</th></tr></thead><tbody>{streams.map((stream) => <tr key={stream.id}><td>{stream.name}</td><td>{stream.releases.length}</td><td>{stream.documents}</td></tr>)}<tr className="matrix-total"><td>Total</td><td>{releases}</td><td>{documents}</td></tr></tbody></table>
      </Panel>
    </section>
  </>
}
