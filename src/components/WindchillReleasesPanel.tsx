import { useMemo, useState } from 'react'
import { windchillReleases } from '../windchillReleases'
import { csvCell } from '../csv'
import { downloadCsv } from '../download'
import { TablePanel } from './ui'

// A Windchill export's unique releases, read from the document names (windchillReleases): each release once with
// its documents; the name column can be chosen; names without a release number are counted and listed.
export function WindchillReleasesPanel({ name, rows, columns }: { name: string; rows: Record<string, unknown>[]; columns: string[] }) {
  const [column, setColumn] = useState('')
  const [open, setOpen] = useState('')
  const result = useMemo(() => windchillReleases(rows, columns, column || undefined), [rows, columns, column])
  const csv = () => [['Release name', 'Release', 'Documents', 'Latest', 'Document names'].join(','), ...result.releases.map((entry) => [entry.name, entry.release, String(entry.documents.length), entry.latest, entry.documents.map((doc) => doc.name).join('; ')].map(csvCell).join(','))].join('\r\n')
  return <TablePanel title="Releases" info={<p>Each document name holds the release name, the release number and then the document name. The first version in the name (two or more numbers joined by dots, optionally after v, R, Rel or Release; a single number only after one of those words) splits it: before = release name, version = release number, after = document name. Each release is listed once (name and number; case and trailing zeros ignored, 3.1 = 3.1.0).</p>}
    count={`${result.releases.length} release${result.releases.length === 1 ? '' : 's'} · ${rows.length - result.unmatched.length} of ${rows.length} documents${result.clubbed ? ` · ${result.clubbed} clubbed` : ''}`}
    action={<div className="button-row"><label className="inline-field">Name column<select value={column || result.nameColumn} onChange={(event) => setColumn(event.target.value)}>{columns.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label><button type="button" className="ghost" disabled={!result.releases.length} onClick={() => downloadCsv(csv(), `${name.replace(/[^\w-]+/g, '-')}-releases.csv`)}>Export releases CSV</button></div>}
    empty={result.releases.length ? undefined : `No release number found in the “${result.nameColumn}” column. Choose the column that holds the document names.`}>
    {result.releases.length > 0 && <table><thead><tr><th>Release name</th><th>Release</th><th>Documents</th>{result.dateColumn && <th>Latest {result.dateColumn}</th>}</tr></thead><tbody>
      {result.releases.flatMap((entry) => [<tr key={entry.key}><td><strong>{entry.name}</strong></td><td>{entry.release}</td><td><button type="button" className="text-button" aria-expanded={open === entry.key} onClick={() => setOpen(open === entry.key ? '' : entry.key)}>{open === entry.key ? '▾' : '▸'} {entry.documents.length} document{entry.documents.length === 1 ? '' : 's'}</button></td>{result.dateColumn && <td>{entry.latest || '—'}</td>}</tr>,
        ...(open === entry.key ? [<tr key={`${entry.key}/docs`} className="release-docs"><td colSpan={result.dateColumn ? 4 : 3}><ul>{entry.documents.map((doc, index) => <li key={index}>{doc.name}</li>)}</ul></td></tr>] : [])])}
    </tbody></table>}
    {result.unmatched.length > 0 && <details className="dp-counted"><summary>{result.unmatched.length} document{result.unmatched.length === 1 ? '' : 's'} without a release number in the name</summary><ul>{result.unmatched.slice(0, 200).map((text, index) => <li key={index}>{text}</li>)}</ul>{result.unmatched.length > 200 && <p className="muted">First 200 shown.</p>}</details>}
  </TablePanel>
}
