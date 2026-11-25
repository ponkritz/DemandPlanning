import { useStreamEpics } from '../useStreamEpics'
import { useCan } from '../useCan'
import { useMemo, useState } from 'react'
import { DataTable } from './DataTable'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { FeatureSetups } from '../featureSetup'
import type { CpMonthReport, CpReleaseRow } from '../cpReporting'
import { boardMatch, boardMatchText, dpBoardCandidates } from '../dpBoardMatch'
import { releaseOnlyTitle, timeWritingHours } from '../releaseSource'
import { matchedFeatureColumns } from './matchedFeatureColumns'
import { formatDate, formatDateTime, monthName } from '../format'
import { csvCell } from '../csv'
import { downloadCsv } from '../download'
import { BoardMatchCell } from './DpBoardColumn'
import { Notice, Pill, TablePanel } from './ui'

// Release Details → CP (cpReporting): the month's releases supported and completed by QA/QE, one row per Release
// container with its name, signed documents, Release Notes signature and the QMS-0025 Feature (or Create Feature,
// titled "release name | vVersion"); each row opens its signature evidence. Shared containers and data issues are
// listed apart; the evidence of the month can be exported as CSV. The counts (Releases in the month, Completed,
// Supported) are the page's counts above the tabs (QV-62, UI-STANDARDS §10); the columns follow the standard's order:
// Release name ▸, Release, the Release Notes signature (in the Approved place), Documents, then CP's own (Container,
// Completed), the matched Feature's Time Writing Feature, Planned (h) and Booked (h) (QV-65) and the QMS-0025 match last.
const statusText: Record<string, string> = { candidate_from_title: 'name from title, to review', name_unavailable: 'no name', conflicting_names: 'conflicting names', version_unavailable: 'no version', enrichment_not_supplied: 'no CP Releases data' }

export function CpReportView({ report, azure, assign, featureSetup, threshold, enrichment }: { report: CpMonthReport; azure: AzureWorkspace; assign?: { me: string; canChoose: boolean }; featureSetup?: FeatureSetups | null; threshold: number; enrichment?: string }) {
  const can = useCan()
  const [open, setOpen] = useState('')
  const epics = useStreamEpics('CP')
  const candidates = useMemo(() => dpBoardCandidates(azure.items, epics), [azure.items, epics])
  const titleOf = (row: CpReleaseRow) => row.name.name && row.name.rawVersion ? releaseOnlyTitle(row.name.name, row.name.rawVersion) : row.container.title
  const matches = useMemo(() => new Map(report.rows.map((row) => [row.container.id, boardMatch({ names: [row.name.name ?? '', row.container.title], versions: [row.name.rawVersion ?? ''], created: titleOf(row) }, candidates, threshold)])), [report.rows, candidates, threshold])
  const allMonths = report.month === 'all'
  const month = allMonths ? 'all months' : monthName(report.month)
  const hoursOf = useMemo(() => timeWritingHours(azure.items), [azure.items])
  const [openShared, setOpenShared] = useState('')
  const evidenceCsv = () => [['Month', 'Release container', 'Release', 'Counted', 'Document ID', 'Document', 'Type', 'State', 'Main Release Notes', 'Slot', 'Approver', 'Role', 'Signature date', 'Author Approval Date', 'Path'].join(','),
    ...[...report.rows, ...report.shared].flatMap((row) => row.signatures.map((entry) => [entry.month, String(row.container.id), row.name.displayLabel, row.container.excluded ? 'no (shared)' : 'yes', String(entry.documentId), entry.documentTitle, entry.documentType, entry.state, entry.mainReleaseNotes ? 'yes' : 'no', String(entry.slot), entry.name, entry.role, entry.date, entry.authorApprovalDate ?? '', entry.path.join(' / ')].map(csvCell).join(',')))].join('\r\n')
  const evidence = (row: CpReleaseRow) => <ul className="cp-evidence">{row.signatures.map((entry) => <li key={`${entry.documentId}:${entry.slot}`}><a href={entry.url} target="_blank" rel="noreferrer">{entry.documentId} {entry.documentTitle}</a> <small>{[entry.documentType || 'no Type', entry.state, entry.mainReleaseNotes ? 'main Release Notes' : '', `${entry.name} (${entry.role}, slot ${entry.slot}) ${formatDateTime(entry.date)}`, entry.path.slice(1, -1).join(' / ')].filter(Boolean).join(' · ')}</small></li>)}</ul>
  return <>
    <TablePanel title="Releases" count={`${report.rows.length} release${report.rows.length === 1 ? '' : 's'} · ${report.signedDocuments} QA/QE-signed document${report.signedDocuments === 1 ? '' : 's'}`}
      info={<><p>A release is a <strong>Release container</strong> of the CP release-folder tree query; every document counts for its nearest Release above it, so twelve asset folders are still one release. <strong>Supported</strong>: at least one Artifact or Document under it has a QA/QE signature dated in the month (approver slot with a name, a role on the QA/QE list — QAQE for Software, Quality Engineer, QA, QE, QA/QE, QE Software — and a date; the document's State and Author Approval Date do not matter). <strong>Completed</strong>: its main Release Notes (Release → Reports folder → Release Notes) has that signature in the month; an asset's Release Notes does not complete the release. This is a reporting convention, not a check that every controlled document is complete.</p><p>Names come from {enrichment && report.names ? `“${enrichment}” (Content per Release version: ${report.names.records} records, ${report.names.withContent} with Content, ${report.names.versions} versions with a name${report.names.unreadable ? `, ${report.names.unreadable} with an unreadable Release` : ''})` : 'the release title only — add a second CP connection (e.g. “CP Releases”) whose query returns Release and Content, and fetch it, for the codenames'}; they never change the counts. Completion history across months is not kept yet: a Release Notes signed again later counts as completed again.</p></>}
      action={can('data.export') ? <button type="button" className="ghost" disabled={!report.rows.length && !report.shared.length} onClick={() => downloadCsv(evidenceCsv(), `CP-release-evidence-${report.month}.csv`)}>Export evidence CSV</button> : undefined}
      empty={report.rows.length ? undefined : allMonths ? 'No QA/QE signature in any month. Refresh the CP connection.' : `No QA/QE signature in ${month}. Pick another month in the header, choose All months, or refresh the CP connection.`}>
      {report.rows.length > 0 && <DataTable id={`cp-report`} rows={report.rows} rowKey={(row) => String(row.container.id)} exportName={`CP releases ${report.month}`}
        expand={(row) => open === String(row.container.id) ? <>{row.completionReview && <p className="negative">{row.completionReview}</p>}{evidence(row)}</> : null}
        columns={[
          { id: 'release', label: 'Release name', value: (row) => row.name.displayLabel, render: (row) => <><button type="button" className="text-button" aria-expanded={open === String(row.container.id)} onClick={() => setOpen(open === String(row.container.id) ? '' : String(row.container.id))}>{open === String(row.container.id) ? '▾' : '▸'} {row.name.displayLabel}</button>{statusText[row.name.nameStatus] && <Pill tone="warning">{statusText[row.name.nameStatus]}</Pill>}{row.name.warnings.length > 0 && <small className="muted">{row.name.warnings.join(' ')}</small>}</> },
          { id: 'version', label: 'Release', value: (row) => row.name.rawVersion ?? '', render: (row) => row.name.rawVersion ?? '—' },
          { id: 'notes', label: 'Release Notes signed', firstSortDesc: true, value: (row) => row.releaseNotesDate ?? '', render: (row) => row.releaseNotesDate ? formatDate(row.releaseNotesDate) : '—' },
          { id: 'signed', label: 'Documents', align: 'right', firstSortDesc: true, value: (row) => row.signedDocuments, title: () => 'QA/QE-signed documents under the release in the month' },
          { id: 'container', label: 'Container', value: (row) => row.container.id, render: (row) => <a href={row.container.url} target="_blank" rel="noreferrer">{row.container.id}</a> },
          { id: 'completed', label: 'Completed', value: (row) => row.completed ? 'Completed' : '', render: (row) => <>{row.completed ? <Pill tone="open">Completed</Pill> : '—'}{row.completionReview && <Pill tone="warning">review</Pill>}</> },
          ...matchedFeatureColumns<CpReleaseRow>((row) => matches.get(row.container.id)?.feature, hoursOf),
          { id: 'match', label: 'QMS-0025 match', value: (row) => boardMatchText(matches.get(row.container.id) ?? {}), render: (row) => <BoardMatchCell match={matches.get(row.container.id) ?? {}} azure={azure} stream="CP" title={titleOf(row)} assign={assign} featureSetup={featureSetup} /> },
        ]} />}
    </TablePanel>
    {report.shared.length > 0 && <TablePanel title={`Shared activity · ${month}`} count={`${report.shared.length} shared container${report.shared.length === 1 ? '' : 's'}, not in the release counts`}>
      {/* UI-STANDARDS §5: the count right-aligned; the evidence opens under the row (▸), as on the Releases table. */}
      <DataTable id="cp-shared" rows={report.shared} rowKey={(row) => String(row.container.id)} exportName={`CP shared activity ${report.month}`}
        expand={(row) => openShared === String(row.container.id) ? evidence(row) : null} columns={[
        { id: 'container', label: 'Container', value: (row) => `${row.container.id} ${row.container.title}`, render: (row) => <><button type="button" className="text-button" aria-expanded={openShared === String(row.container.id)} aria-label={`${openShared === String(row.container.id) ? 'Hide' : 'Show'} the signatures of ${row.container.id} ${row.container.title}`} onClick={() => setOpenShared(openShared === String(row.container.id) ? '' : String(row.container.id))}>{openShared === String(row.container.id) ? '▾' : '▸'}</button> <a href={row.container.url} target="_blank" rel="noreferrer">{row.container.id}</a> {row.container.title}</> },
        { id: 'why', label: 'Why apart', value: (row) => row.container.excluded ?? '' },
        { id: 'signed', label: 'Signed documents', align: 'right', firstSortDesc: true, value: (row) => row.signedDocuments },
      ]} />
    </TablePanel>}
    {report.issues.length > 0 && <Notice tone="warning"><details><summary>{report.issues.length} data issue{report.issues.length === 1 ? '' : 's'} to check (not counted, never silently dropped)</summary><ul>{report.issues.map((issue, index) => <li key={index}>{issue.text}</li>)}</ul></details></Notice>}
  </>
}
