import { dpMilestoneNames, type SupportedRelease } from '../dpMilestones'
import { formatDate } from '../format'
import { DataTable } from './DataTable'

// The Supported Releases of a month as a table: each release once, with the milestones it passed in the month
// (DT, SFV, PRD, RPE) and their dates. Used on the DP page (the folded "Supported releases counted" under its counts) and in Pulse Check.
export function SupportedReleasesTable({ releases }: { releases: SupportedRelease[] }) {
  return <DataTable id="dp-supported" rows={releases} rowKey={(entry) => entry.key} exportName="Supported Releases" columns={[
    { id: 'release', label: 'Release', value: (entry) => [entry.name, entry.release].filter(Boolean).join(' '), render: (entry) => <><strong>{[entry.name, entry.release].filter(Boolean).join(' ') || '—'}</strong>{entry.milestones.some((milestone) => milestone.milestone === 'DDT') && <small>Completed (DT)</small>}</> },
    { id: 'milestones', label: 'Milestones Done in the month', value: (entry) => entry.milestones.map((milestone) => `${dpMilestoneNames[milestone.milestone].short} ${milestone.date.slice(0, 10)}`).join('; '), render: (entry) => entry.milestones.map((milestone) => <span key={milestone.milestone} className="milestone-chip" title={`${dpMilestoneNames[milestone.milestone].long} (${milestone.milestone}) · ${formatDate(milestone.date)}`}>{dpMilestoneNames[milestone.milestone].short} <small>{formatDate(milestone.date)}</small></span>) },
    { id: 'latest', label: 'Latest', firstSortDesc: true, value: (entry) => entry.date, render: (entry) => formatDate(entry.date) },
    { id: 'id', label: 'ID', value: (entry) => entry.item.id, render: (entry) => <a href={entry.item.url} target="_blank" rel="noreferrer">{entry.item.id}</a> },
    { id: 'title', label: 'Title', value: (entry) => entry.item.title },
  ]} />
}
