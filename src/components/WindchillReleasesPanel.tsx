import { useMemo, useState } from 'react'
import { windchillLocationsFile, windchillReleases, type ReleaseSource } from '../windchillReleases'
import { csvCell } from '../csv'
import { downloadCsv } from '../download'
import type { GitStorage } from '../useGitStorage'
import { Notice, TablePanel } from './ui'

// A Windchill export's unique releases (windchillReleases): from the Location column (folder path) when the export
// has one — the preferred source, its folder names follow a few fixed shapes — else from the document names; the
// source and the columns can be chosen. Each release is listed once with its documents and folders. The unique
// Locations (count and the release read from each) can be saved to the Git data repository as
// windchill-analysis/<export>-locations.json, for analysis of the folder naming, and exported as CSV.
export function WindchillReleasesPanel({ view, rows, columns, git }: { view: { id: string; name: string }; rows: Record<string, unknown>[]; columns: string[]; git?: GitStorage }) {
  const [source, setSource] = useState<ReleaseSource | 'auto'>('auto')
  const [nameColumn, setNameColumn] = useState('')
  const [locationColumn, setLocationColumn] = useState('')
  const [open, setOpen] = useState('')
  const [showLocations, setShowLocations] = useState(false)
  const [saved, setSaved] = useState<{ tone: 'info' | 'success' | 'error'; text: string } | null>(null)
  const result = useMemo(() => windchillReleases(rows, columns, { source, nameColumn: nameColumn || undefined, locationColumn: locationColumn || undefined }), [rows, columns, source, nameColumn, locationColumn])
  const fileName = view.name.replace(/[^\w-]+/g, '-')
  const releasesCsv = () => [['Release name', 'Release', 'Documents', 'Latest', 'Locations', 'Document names'].join(','), ...result.releases.map((entry) => [entry.name, entry.release, String(entry.documents.length), entry.latest, entry.locations.join('; '), entry.documents.map((doc) => doc.name).join('; ')].map(csvCell).join(','))].join('\r\n')
  const locationsCsv = () => [['Location', 'Documents', 'Releases', 'Release folder'].join(','), ...result.locations.map((entry) => [entry.location, String(entry.count), entry.releases.map((release) => `${release.name} ${release.release}`).join('; '), entry.releases[0]?.folder ?? ''].map(csvCell).join(','))].join('\r\n')
  const saveToGit = async () => {
    if (!git) return
    setSaved({ tone: 'info', text: 'Saving to Git…' })
    try {
      const file = windchillLocationsFile(view, result, rows.length)
      const path = await git.pushWindchillAnalysis(view.id, `${JSON.stringify(file, null, 2)}\n`, `Windchill ${view.name}: ${result.locations.length} unique locations, ${result.releases.length} releases (${rows.length} documents)`)
      setSaved({ tone: 'success', text: `Saved to Git (${path}).` })
    } catch (error) { setSaved({ tone: 'error', text: `Not saved to Git: ${error instanceof Error ? error.message : String(error)}` }) }
  }
  const fromLocation = result.source === 'location'
  const columnLabel = fromLocation ? `“${result.locationColumn}”` : `“${result.nameColumn}”`
  return <TablePanel title="Releases" info={<><p><strong>Location</strong> (the folder path) is the preferred source: the releases are read from the deepest folder that holds a version — the name and number in one folder ("Remote Diagnostics 1.6"), a clubbed folder ("Ser1 Rel1_Ser2 Rel2": one release, as written, counted once), or a version folder under the name folder ("Remote Diagnostics/1.6", "CareLink/R3.2"); the folders after it (document type) are ignored, and the number is kept exactly as the folder writes it. <strong>Document name</strong> is the fallback: the name holds the release name(s), the release number(s) and then the document name, with any delimiters; a clubbed name ("Ser1 Rel1_Ser2 Rel2") is one release.</p><p>Each release is listed once (name and number; case and trailing zeros ignored, 3.1 = 3.1.0). <strong>Save locations to Git</strong> writes every distinct Location with its document count and the release read from it to the Git data repository (windchill-analysis/{view.id}-locations.json), for analysis of the folder naming; no document contents.</p></>}
    count={`${result.releases.length} release${result.releases.length === 1 ? '' : 's'} · ${rows.length - result.unmatched.length} of ${rows.length} documents${result.clubbed ? ` · ${result.clubbed} clubbed` : ''} · from ${fromLocation ? 'Location' : 'Document name'}`}
    action={<div className="button-row">
      <label className="inline-field">Read from<select value={source} onChange={(event) => setSource(event.target.value as ReleaseSource | 'auto')}><option value="auto">Automatic ({result.locationColumn ? 'Location' : 'Document name'})</option><option value="location" disabled={!result.locationColumn && !columns.length}>Location</option><option value="name">Document name</option></select></label>
      {fromLocation ? <label className="inline-field">Location column<select value={locationColumn || result.locationColumn || ''} onChange={(event) => setLocationColumn(event.target.value)}>{columns.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label>
        : <label className="inline-field">Name column<select value={nameColumn || result.nameColumn} onChange={(event) => setNameColumn(event.target.value)}>{columns.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label>}
      <button type="button" className="ghost" disabled={!result.releases.length} onClick={() => downloadCsv(releasesCsv(), `${fileName}-releases.csv`)}>Export releases CSV</button>
      {fromLocation && <button type="button" className="ghost" disabled={!result.locations.length} onClick={() => downloadCsv(locationsCsv(), `${fileName}-locations.csv`)}>Export locations CSV</button>}
      {fromLocation && git?.connected && !git.readOnly && <button type="button" className="primary" disabled={!result.locations.length || saved?.tone === 'info'} onClick={() => void saveToGit()}>Save locations to Git</button>}
    </div>}
    empty={result.releases.length ? undefined : `No release found in the ${columnLabel} column. Choose the column that holds the ${fromLocation ? 'folder paths' : 'document names'}, or read from the ${fromLocation ? 'document names' : 'Location'} instead.`}>
    {saved && <Notice tone={saved.tone === 'error' ? 'warning' : 'info'}><span role="status">{saved.text}</span></Notice>}
    {result.releases.length > 0 && <table><thead><tr><th>Release name</th><th>Release</th><th>Documents</th>{fromLocation && <th>Locations</th>}{result.dateColumn && <th>Latest {result.dateColumn}</th>}</tr></thead><tbody>
      {result.releases.flatMap((entry) => [<tr key={entry.key}><td><strong>{entry.name}</strong>{entry.clubbed && <> <small className="muted" title={entry.parts.map((part) => `${part.name} ${part.release}`).join(' · ')}>clubbed</small></>}</td><td>{entry.release}</td><td><button type="button" className="text-button" aria-expanded={open === entry.key} onClick={() => setOpen(open === entry.key ? '' : entry.key)}>{open === entry.key ? '▾' : '▸'} {entry.documents.length} document{entry.documents.length === 1 ? '' : 's'}</button></td>{fromLocation && <td>{entry.locations.length}</td>}{result.dateColumn && <td>{entry.latest || '—'}</td>}</tr>,
        ...(open === entry.key ? [<tr key={`${entry.key}/docs`} className="release-docs"><td colSpan={3 + (fromLocation ? 1 : 0) + (result.dateColumn ? 1 : 0)}><ul>{entry.documents.map((doc, index) => <li key={index}>{doc.name}</li>)}</ul>{entry.locations.length > 0 && <ul className="muted">{entry.locations.map((location) => <li key={location}>{location}</li>)}</ul>}</td></tr>] : [])])}
    </tbody></table>}
    {fromLocation && result.locations.length > 0 && <details className="dp-counted" open={showLocations} onToggle={(event) => setShowLocations((event.target as HTMLDetailsElement).open)}><summary>{result.locations.length} unique location{result.locations.length === 1 ? '' : 's'}</summary>
      <table><thead><tr><th>Location</th><th>Documents</th><th>Releases read from it</th></tr></thead><tbody>{result.locations.slice(0, 500).map((entry) => <tr key={entry.location}><td>{entry.location}</td><td>{entry.count}</td><td>{entry.releases.length ? entry.releases.map((release) => `${release.name} ${release.release}`).join('; ') : <span className="muted">none</span>}</td></tr>)}</tbody></table>{result.locations.length > 500 && <p className="muted">First 500 shown; the CSV and the Git file hold all.</p>}</details>}
    {result.unmatched.length > 0 && <details className="dp-counted"><summary>{result.unmatched.length} document{result.unmatched.length === 1 ? '' : 's'} without a release {fromLocation ? 'in the Location' : 'number in the name'}</summary><ul>{[...new Set(result.unmatched)].slice(0, 200).map((text, index) => <li key={index}>{text}</li>)}</ul>{result.unmatched.length > 200 && <p className="muted">First 200 shown.</p>}</details>}
  </TablePanel>
}
