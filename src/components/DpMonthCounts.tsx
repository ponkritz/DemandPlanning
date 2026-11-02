import { useMemo } from 'react'
import type { AzureWorkItem } from '../domain'
import { dpMilestoneNames, dpMilestones, dpMonthCounts, type SupportedRelease } from '../dpMilestones'
import { formatDate, monthName } from '../format'
import { Metric, Metrics } from './ui'
import { DataTable } from './DataTable'

// The Supported Releases of a month as a table: each release once, with the milestones it passed in the month
// (DT, SFV, PRD, RPE) and their dates. Used on the DP page ("What was counted") and in Pulse Check.
export function SupportedReleasesTable({ releases }: { releases: SupportedRelease[] }) {
  return <DataTable id="dp-supported" rows={releases} rowKey={(entry) => entry.key} exportName="Supported Releases" columns={[
    { id: 'release', label: 'Release', value: (entry) => [entry.name, entry.release].filter(Boolean).join(' '), render: (entry) => <><strong>{[entry.name, entry.release].filter(Boolean).join(' ') || '—'}</strong>{entry.milestones.some((milestone) => milestone.milestone === 'DDT') && <small>Completed (DT)</small>}</> },
    { id: 'milestones', label: 'Milestones Done in the month', value: (entry) => entry.milestones.map((milestone) => `${dpMilestoneNames[milestone.milestone].short} ${milestone.date.slice(0, 10)}`).join('; '), render: (entry) => entry.milestones.map((milestone) => <span key={milestone.milestone} className="milestone-chip" title={`${dpMilestoneNames[milestone.milestone].long} (${milestone.milestone}) · ${formatDate(milestone.date)}`}>{dpMilestoneNames[milestone.milestone].short} <small>{formatDate(milestone.date)}</small></span>) },
    { id: 'latest', label: 'Latest', firstSortDesc: true, value: (entry) => entry.date, render: (entry) => formatDate(entry.date) },
    { id: 'id', label: 'ID', value: (entry) => entry.item.id, render: (entry) => <a href={entry.item.url} target="_blank" rel="noreferrer">{entry.item.id}</a> },
    { id: 'title', label: 'Title', value: (entry) => entry.item.title },
  ]} />
}

// DP page: the month's two counts from the DP query (dpMilestones) and, folded, the supported releases behind them.
export function DpMonthCounts({ items, month }: { items: AzureWorkItem[]; month: string }) {
  const counts = useMemo(() => dpMonthCounts(items, month), [items, month])
  const label = monthName(month)
  return <div className="dp-counts">
    <Metrics>
      <Metric label={`Completed Releases · ${label}`} value={counts.completed.length} hint="Releases with DT (Design Transfer) Done and the DDT Date in the month" />
      <Metric label={`Supported Releases · ${label}`} value={counts.supported.length} hint={`Releases with a milestone Done in the month, each once · ${counts.milestones.length} milestone${counts.milestones.length === 1 ? '' : 's'}: ${dpMilestones.map(([milestone]) => `${dpMilestoneNames[milestone].short} ${counts.byMilestone[milestone]}`).join(' · ')}`} />
    </Metrics>
    {counts.supported.length > 0 && <details className="dp-counted"><summary>What was counted ({counts.supported.length} release{counts.supported.length === 1 ? '' : 's'}, {counts.milestones.length} milestone{counts.milestones.length === 1 ? '' : 's'})</summary>
      <SupportedReleasesTable releases={counts.supported} />
    </details>}
  </div>
}
