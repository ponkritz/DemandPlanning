import { useStreamEpics } from '../useStreamEpics'
import { useMemo, useState, useSyncExternalStore } from 'react'
import { releasesInMonth, windchillDateValue, windchillLocationsFile, type ReleaseSource, type WindchillRelease } from '../windchillReleases'
import type { WindchillReading } from '../useWindchillReading'
import { monthName } from '../format'
import type { GitStorage } from '../useGitStorage'
import { TablePanel } from './ui'
import { isRunning, runInBackground, subscribeJobs } from '../backgroundJobs'
import { timeWritingHours } from '../releaseSource'
import { DataTable, type DataColumn } from './DataTable'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { FeatureSetups } from '../featureSetup'
import { boardMatchText, dpBoardCandidates, type BoardMatch, windchillBoardMatch, windchillFeatureTitle } from '../dpBoardMatch'
import { BoardMatchCell } from './DpBoardColumn'
import { windchillOptionsForView } from '../streams'
import { projectLevels, type WindchillLogic } from '../windchillViews'
import type { ReleaseScope } from './ReleasePage'
import { matchedFeatureColumns } from './matchedFeatureColumns'

const ordinal = (level: number) => `${level}${level === 2 ? 'nd' : level === 3 ? 'rd' : 'th'}`

// A Windchill export's unique releases (windchillReleases): from the Location column (folder path) when the export
// has one — the preferred source, its folder names follow a few fixed shapes — else from the document names; the
// source and the columns can be chosen. Each release is listed once with its documents and folders. The unique
// Locations (count and the release read from each) can be saved to the Git data repository as
// windchill-analysis/<export>-locations.json, for analysis of the folder naming, and exported as CSV. The list can
// be limited to the releases with a document dated in the header month (CON-73), sorted by any column (newest
// first by default), with column widths that can be dragged (kept in this browser). With the QMS-0025 board, each
// release has a "QMS-0025 match" column as on the DP table (windchillBoardMatch), with Create Feature when nothing
// matches, titled "{stream} | {release name} | v{release}". QV-62, UI-STANDARDS §10: the period (Show: {month} / All
// months) is chosen in the page's source bar; the columns follow the standard's order — Release name ▸ (opens the
// documents), Release, the latest document date (in the Approved place), Documents, the stream's own (Locations,
// Document names), the matched Feature's Time Writing Feature, Planned (h) and Booked (h) (QV-65) and the QMS-0025
// match last — on S&S IT and ECP alike (an ECP release is a project, CON-83). QV-63: Save locations to Git runs as a
// Background job (its result there, not on the page).
// How the releases are read (Read from, the name or Location column) is held by the page (useWindchillReading), so
// that its counts (QV-64) count the releases the table lists.
export interface ReleaseBoard { azure: AzureWorkspace; stream: string; threshold: number; assign?: { me: string; canChoose: boolean }; featureSetup?: FeatureSetups | null }
type SortKey = 'name' | 'release' | 'documents' | 'locations' | 'latest' | 'match'
const sortValue = (entry: WindchillRelease, key: SortKey, matches: Map<string, BoardMatch>) => key === 'match' ? matches.get(entry.key)?.feature?.score ?? matches.get(entry.key)?.story?.score ?? -1 : key === 'name' ? entry.name : key === 'release' ? entry.release : key === 'documents' ? entry.documents.length : key === 'locations' ? entry.locations.length : entry.latestAt ?? -Infinity

// onSetup: changes how the export is read — Standard or ECP logic and the ECP project folder (CON-87).
export function WindchillReleasesPanel({ view, rows, columns, git, month, scope = 'month', board, onSetup, reading }: { view: { id: string; name: string; logic?: WindchillLogic; projectLevel?: number }; rows: Record<string, unknown>[]; columns: string[]; git?: GitStorage; month?: string; scope?: ReleaseScope; board?: ReleaseBoard; onSetup?: (setup: { logic: WindchillLogic; projectLevel?: number }) => void; reading: WindchillReading }) {
  const { source, setSource, nameColumn, setNameColumn, locationColumn, setLocationColumn, result } = reading
  const [open, setOpen] = useState('')
  const [showLocations, setShowLocations] = useState(false)
  const saveKey = `windchill-locations:${view.id}`
  const saving = useSyncExternalStore(subscribeJobs, () => isRunning(saveKey))
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'latest', desc: true })
  // ECP (CON-83): a release is a project, read from the Location folder chosen under "Project details at".
  const isProject = Boolean(windchillOptionsForView(view).project)
  const fileName = view.name.replace(/[^\w-]+/g, '-')
  const boardItems = board?.azure.items, stream = board?.stream ?? '', threshold = board?.threshold
  const epics = useStreamEpics(stream)
  const candidates = useMemo(() => boardItems ? dpBoardCandidates(boardItems, epics) : [], [boardItems, epics])
  const matches = useMemo(() => new Map(boardItems ? result.releases.map((entry) => [entry.key, windchillBoardMatch(entry, stream, candidates, threshold)]) : []), [result.releases, boardItems, stream, threshold, candidates])
  const hoursOf = useMemo(() => timeWritingHours(boardItems ?? []), [boardItems])
  // The list shown: the header month's releases (any document dated in it) unless "All months" is chosen; then the chosen sort.
  const inMonth = Boolean(month) && scope === 'month'
  const shown = useMemo(() => {
    const list = inMonth && month ? releasesInMonth(result.releases, month) : result.releases
    const compare = (a: WindchillRelease, b: WindchillRelease) => {
      const x = sortValue(a, sort.key, matches), y = sortValue(b, sort.key, matches)
      const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' })
      return (sort.desc ? -order : order) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    }
    return [...list].sort(compare)
  }, [result.releases, inMonth, month, sort, matches])
  const shownDocuments = new Set(shown.flatMap((entry) => entry.documents.map((doc) => doc.row))).size
  const fromLocation = result.source === 'location'
  // UI-07…12: the release (or project) table and the locations follow the shared design default; one Export each.
  const releaseColumns: DataColumn<WindchillRelease>[] = [
    { id: 'name', label: 'Release name', value: (entry) => entry.name, render: (entry) => <button type="button" className="text-button" aria-expanded={open === entry.key} onClick={() => setOpen(open === entry.key ? '' : entry.key)}>{open === entry.key ? '▾' : '▸'} {entry.name}</button> },
    { id: 'release', label: 'Release', value: (entry) => entry.release },
    ...(result.dateColumn ? [{ id: 'latest', label: `Latest ${result.dateColumn}`, value: (entry: WindchillRelease) => entry.latest ? windchillDateValue(entry.latest) : '', firstSortDesc: true, render: (entry: WindchillRelease) => entry.latest || '—' }] : []),
    { id: 'documents', label: 'Documents', value: (entry) => entry.documents.length, firstSortDesc: true, align: 'right' },
    ...(fromLocation ? [{ id: 'locations', label: 'Locations', value: (entry: WindchillRelease) => entry.locations.length, align: 'right' as const, firstSortDesc: true }] : []),
    { id: 'documentNames', label: 'Document names', value: (entry) => entry.documents.map((doc) => doc.name).join('; '), defaultHidden: true, export: 'always' },
    ...(board ? matchedFeatureColumns<WindchillRelease>((entry) => matches.get(entry.key)?.feature, hoursOf) : []),
    ...(board ? [{ id: 'match', label: 'QMS-0025 match', value: (entry: WindchillRelease) => boardMatchText(matches.get(entry.key) ?? {}), render: (entry: WindchillRelease) => <BoardMatchCell match={matches.get(entry.key) ?? {}} azure={board.azure} stream={board.stream} title={windchillFeatureTitle(board.stream, entry)} assign={board.assign} featureSetup={board.featureSetup} /> }] : []),
  ]
  const locationColumns: DataColumn<typeof result.locations[number]>[] = [
    { id: 'location', label: 'Location', value: (entry) => entry.location },
    { id: 'documents', label: 'Documents', value: (entry) => entry.count, align: 'right' },
    { id: 'releases', label: 'Releases read from it', value: (entry) => entry.releases.map((release) => `${release.name} ${release.release}`).join('; '), render: (entry) => entry.releases.length ? entry.releases.map((release) => `${release.name} ${release.release}`).join('; ') : <span className="muted">none</span> },
    { id: 'folder', label: 'Release folder', value: (entry) => entry.releases[0]?.folder ?? '', defaultHidden: true, export: 'always' },
  ]
  // QV-63: a Background job named after the export; its result ("Saved to Git (path).", or why not) is listed there.
  const saveToGit = () => {
    if (!git) return
    const file = windchillLocationsFile(view, result, rows.length), locations = result.locations.length, releases = result.releases.length
    runInBackground(saveKey, `Save locations to Git · ${view.name}`, async (progress) => {
      progress('Saving to Git…')
      try {
        const path = await git.pushWindchillAnalysis(view.id, `${JSON.stringify(file, null, 2)}\n`, `Windchill ${view.name}: ${locations} unique locations, ${releases} releases (${rows.length} documents)`)
        return { text: `Saved to Git (${path}).` }
      } catch (error) { return { text: `Not saved to Git: ${error instanceof Error ? error.message : String(error)}`, failed: true } }
    })
  }
  const columnLabel = fromLocation ? `“${result.locationColumn}”` : `“${result.nameColumn}”`
  return <TablePanel title="Releases" info={<><p><strong>Location</strong> (the folder path) is the preferred source: the releases are read from the deepest folder that holds a version — the name and number in one folder ("Remote Diagnostics 1.6"), a clubbed folder ("Ser1 Rel1_Ser2 Rel2": one release, as written, counted once), or a version folder under the name folder ("Remote Diagnostics/1.6", "CareLink/R3.2"); the folders after it (document type) are ignored, and the number is kept exactly as the folder writes it. <strong>Document name</strong> is the fallback: the name holds the release name(s), the release number(s) and then the document name, with any delimiters; a clubbed name ("Ser1 Rel1_Ser2 Rel2") is one release.</p><p>Each release is listed once (name and number; case and trailing zeros ignored, 3.1 = 3.1.0). <strong>Save locations to Git</strong> writes every distinct Location with its document count and the release read from it to the Git data repository (windchill-analysis/{view.id}-locations.json), for analysis of the folder naming; no document contents.</p></>}
    count={inMonth && month ? `${shown.length} of ${result.releases.length} release${result.releases.length === 1 ? '' : 's'} with a document ${result.dateColumn ?? 'date'} in ${monthName(month)} · ${shownDocuments} document${shownDocuments === 1 ? '' : 's'}${result.clubbed ? ` · ${result.clubbed} clubbed` : ''} · from ${fromLocation ? 'Location' : 'Document name'}` : `${result.releases.length} release${result.releases.length === 1 ? '' : 's'} · ${rows.length - result.unmatched.length} of ${rows.length} documents${result.clubbed ? ` · ${result.clubbed} clubbed` : ''} · from ${fromLocation ? 'Location' : 'Document name'}`}
    action={<div className="button-row release-controls">
      {onSetup && <label className="inline-field">Logic<select aria-label="Logic" value={isProject ? 'ecp' : 'standard'} onChange={(event) => onSetup({ logic: event.target.value as WindchillLogic, ...(view.projectLevel ? { projectLevel: view.projectLevel } : {}) })}><option value="standard">Standard (releases)</option><option value="ecp">ECP (projects)</option></select></label>}
      {onSetup && isProject && <label className="inline-field">Project details at<select aria-label="Project details at" value={view.projectLevel ?? 2} onChange={(event) => onSetup({ logic: 'ecp', projectLevel: Number(event.target.value) })}>{projectLevels.map((level) => <option key={level} value={level}>{ordinal(level)} folder</option>)}</select></label>}
      <label className="inline-field">Read from<select value={source} onChange={(event) => setSource(event.target.value as ReleaseSource | 'auto')}><option value="auto">Automatic ({result.locationColumn ? 'Location' : 'Document name'})</option><option value="location" disabled={!result.locationColumn && !columns.length}>Location</option><option value="name">Document name</option></select></label>
      {fromLocation ? <label className="inline-field">Location column<select value={locationColumn || result.locationColumn || ''} onChange={(event) => setLocationColumn(event.target.value)}>{columns.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label>
        : <label className="inline-field">Name column<select value={nameColumn || result.nameColumn} onChange={(event) => setNameColumn(event.target.value)}>{columns.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label>}
      {fromLocation && git?.connected && !git.readOnly && <button type="button" className="primary" disabled={!result.locations.length || saving} onClick={saveToGit}>Save locations to Git</button>}
      {saving && <small className="muted" role="status">Saving to Git… (Background jobs)</small>}
    </div>}
    empty={result.releases.length ? (shown.length ? undefined : `No release has its latest ${result.dateColumn ?? 'date'} in ${monthName(month ?? '')}. Choose another month in the header, or choose Show: All months.`) : `No release found in the ${columnLabel} column. Choose the column that holds the ${fromLocation ? 'folder paths' : 'document names'}, or read from the ${fromLocation ? 'document names' : 'Location'} instead.`}>
    {shown.length > 0 && <DataTable id={`windchill-releases:${view.id}`} columns={releaseColumns} rows={shown} rowKey={(entry) => entry.key} exportName={`${fileName}-${isProject ? 'projects' : 'releases'}`}
      sort={{ id: sort.key, desc: sort.desc }} onSort={(next) => setSort({ key: next.id as SortKey, desc: next.desc })}
      expand={(entry) => open === entry.key ? <><ul>{entry.documents.map((doc, index) => <li key={index}>{doc.name}</li>)}</ul>{entry.locations.length > 0 && <ul className="muted">{entry.locations.map((location) => <li key={location}>{location}</li>)}</ul>}</> : null} />}
    {fromLocation && result.locations.length > 0 && <details className="dp-counted" open={showLocations} onToggle={(event) => setShowLocations((event.target as HTMLDetailsElement).open)}><summary>{result.locations.length} unique location{result.locations.length === 1 ? '' : 's'}</summary>
      <DataTable id={`windchill-locations:${view.id}`} columns={locationColumns} rows={result.locations} rowKey={(entry) => entry.location} exportName={`${fileName}-locations`} limit={500} /></details>}
    {result.unmatched.length > 0 && <details className="dp-counted"><summary>{result.unmatched.length} document{result.unmatched.length === 1 ? '' : 's'} without a release {fromLocation ? 'in the Location' : 'number in the name'}</summary><ul>{[...new Set(result.unmatched)].slice(0, 200).map((text, index) => <li key={index}>{text}</li>)}</ul>{result.unmatched.length > 200 && <p className="muted">First 200 shown.</p>}</details>}
  </TablePanel>
}
