import { useMemo, useState } from 'react'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { FeatureSetups } from '../featureSetup'
import type { CpMonthReport, CpReleaseRow } from '../cpReporting'
import { boardMatch, dpBoardCandidates } from '../dpBoardMatch'
import { releaseOnlyTitle } from '../releaseSource'
import { formatDate, formatDateTime, monthName } from '../format'
import { csvCell } from '../csv'
import { downloadCsv } from '../download'
import { BoardMatchCell } from './DpBoardColumn'
import { Metric, Metrics, Notice, Pill, TablePanel } from './ui'

// Release Details → CP (cpReporting): the month's releases supported and completed by QA/QE, one row per Release
// container with its name, signed documents, Release Notes signature and the QMS-0025 Feature (or Create Feature,
// titled "release name | vVersion"); each row opens its signature evidence. Shared containers and data issues are
// listed apart; the evidence of the month can be exported as CSV.
const statusText: Record<string, string> = { candidate_from_title: 'name from title, to review', name_unavailable: 'no name', conflicting_names: 'conflicting names', version_unavailable: 'no version', enrichment_not_supplied: 'no CP Releases data' }

export function CpReportView({ report, azure, assign, featureSetup, threshold, enrichment }: { report: CpMonthReport; azure: AzureWorkspace; assign?: { me: string; canChoose: boolean }; featureSetup?: FeatureSetups | null; threshold: number; enrichment: boolean }) {
  const [open, setOpen] = useState('')
  const candidates = useMemo(() => dpBoardCandidates(azure.items), [azure.items])
  const titleOf = (row: CpReleaseRow) => row.name.name && row.name.rawVersion ? releaseOnlyTitle(row.name.name, row.name.rawVersion) : row.container.title
  const matches = useMemo(() => new Map(report.rows.map((row) => [row.container.id, boardMatch({ names: [row.name.name ?? '', row.container.title], versions: [row.name.rawVersion ?? ''], created: titleOf(row) }, candidates, threshold)])), [report.rows, candidates, threshold])
  const month = monthName(report.month)
  const evidenceCsv = () => [['Month', 'Release container', 'Release', 'Counted', 'Document ID', 'Document', 'Type', 'State', 'Main Release Notes', 'Slot', 'Approver', 'Role', 'Signature date', 'Author Approval Date', 'Path'].join(','),
    ...[...report.rows, ...report.shared].flatMap((row) => row.signatures.map((entry) => [report.month, String(row.container.id), row.name.displayLabel, row.container.excluded ? 'no (shared)' : 'yes', String(entry.documentId), entry.documentTitle, entry.documentType, entry.state, entry.mainReleaseNotes ? 'yes' : 'no', String(entry.slot), entry.name, entry.role, entry.date, entry.authorApprovalDate ?? '', entry.path.join(' / ')].map(csvCell).join(',')))].join('\r\n')
  const evidence = (row: CpReleaseRow) => <ul className="cp-evidence">{row.signatures.map((entry) => <li key={`${entry.documentId}:${entry.slot}`}><a href={entry.url} target="_blank" rel="noreferrer">{entry.documentId} {entry.documentTitle}</a> <small>{[entry.documentType || 'no Type', entry.state, entry.mainReleaseNotes ? 'main Release Notes' : '', `${entry.name} (${entry.role}, slot ${entry.slot}) ${formatDateTime(entry.date)}`, entry.path.slice(1, -1).join(' / ')].filter(Boolean).join(' · ')}</small></li>)}</ul>
  return <>
    <Metrics>
      <Metric label={`Supported · ${month}`} value={report.supported} hint="Releases with a QA/QE-signed document in the month" />
      <Metric label={`Completed · ${month}`} value={report.completed} hint="Main Release Notes signed by QA/QE in the month (also supported)" />
      <Metric label="QA/QE-signed documents" value={report.signedDocuments} hint="Distinct documents of the counted releases" />
    </Metrics>
    <TablePanel title={`CP releases · ${month}`} count={`${report.supported} supported · ${report.completed} completed — completed releases are part of the supported ones; do not add them`}
      info={<><p>A release is a <strong>Release container</strong> of the CP release-folder tree query; every document counts for its nearest Release above it, so twelve asset folders are still one release. <strong>Supported</strong>: at least one Artifact or Document under it has a QA/QE signature dated in the month (approver slot with a name, a role on the QA/QE list — QAQE for Software, Quality Engineer, QA, QE, QA/QE, QE Software — and a date; the document's State and Author Approval Date do not matter). <strong>Completed</strong>: its main Release Notes (Release → Reports folder → Release Notes) has that signature in the month; an asset's Release Notes does not complete the release. This is a reporting convention, not a check that every controlled document is complete.</p><p>Names come from {enrichment ? 'the other CP connection (CP Releases: Content per Release version)' : 'the release title only — connect a second CP connection (e.g. “CP Releases”, with Release and Content) for the codenames'}; they never change the counts. Completion history across months is not kept yet: a Release Notes signed again later counts as completed again.</p></>}
      action={<button type="button" className="ghost" disabled={!report.rows.length && !report.shared.length} onClick={() => downloadCsv(evidenceCsv(), `CP-release-evidence-${report.month}.csv`)}>Export evidence CSV</button>}
      empty={report.rows.length ? undefined : `No QA/QE signature in ${month}. Pick another month in the header, or refresh the CP connection.`}>
      {report.rows.length > 0 && <table><thead><tr><th>Release</th><th>Container</th><th>Version</th><th>Completed</th><th>Signed documents</th><th>Release Notes signed</th><th>QMS-0025 match</th></tr></thead><tbody>
        {report.rows.flatMap((row) => [<tr key={row.container.id}>
          <td><button type="button" className="text-button" aria-expanded={open === String(row.container.id)} onClick={() => setOpen(open === String(row.container.id) ? '' : String(row.container.id))}>{open === String(row.container.id) ? '▾' : '▸'} {row.name.displayLabel}</button>{statusText[row.name.nameStatus] && <Pill tone="warning">{statusText[row.name.nameStatus]}</Pill>}{row.name.warnings.length > 0 && <small className="muted" title={row.name.warnings.join(' ')}> ⓘ</small>}</td>
          <td><a href={row.container.url} target="_blank" rel="noreferrer">{row.container.id}</a></td>
          <td>{row.name.rawVersion ?? '—'}</td>
          <td>{row.completed ? <Pill tone="open">Completed</Pill> : '—'}{row.completionReview && <Pill tone="warning">review</Pill>}</td>
          <td>{row.signedDocuments}</td>
          <td>{row.releaseNotesDate ? formatDate(row.releaseNotesDate) : '—'}</td>
          <td><BoardMatchCell match={matches.get(row.container.id) ?? {}} azure={azure} stream="CP" title={titleOf(row)} assign={assign} featureSetup={featureSetup} /></td>
        </tr>, ...(open === String(row.container.id) ? [<tr key={`${row.container.id}/evidence`} className="release-docs"><td colSpan={7}>{row.completionReview && <p className="negative">{row.completionReview}</p>}{evidence(row)}</td></tr>] : [])])}
      </tbody></table>}
    </TablePanel>
    {report.shared.length > 0 && <TablePanel title={`Shared activity · ${month}`} count={`${report.shared.length} shared container${report.shared.length === 1 ? '' : 's'}, not in the release counts`}>
      <table><thead><tr><th>Container</th><th>Why apart</th><th>Signed documents</th></tr></thead><tbody>{report.shared.map((row) => <tr key={row.container.id}><td><a href={row.container.url} target="_blank" rel="noreferrer">{row.container.id}</a> {row.container.title}</td><td>{row.container.excluded}</td><td>{row.signedDocuments}{evidence(row)}</td></tr>)}</tbody></table>
    </TablePanel>}
    {report.issues.length > 0 && <Notice tone="warning"><details><summary>{report.issues.length} data issue{report.issues.length === 1 ? '' : 's'} to check (not counted, never silently dropped)</summary><ul>{report.issues.map((issue, index) => <li key={index}>{issue.text}</li>)}</ul></details></Notice>}
  </>
}
