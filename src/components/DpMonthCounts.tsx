import { useMemo } from 'react'
import type { AzureWorkItem } from '../domain'
import { dpMilestoneNames, dpMilestones, dpMonthCounts, type SupportedRelease } from '../dpMilestones'
import { formatDate, monthName } from '../format'
import { Metric, Metrics } from './ui'

// The Supported Releases of a month as a table: each release once, with the milestones it passed in the month
// (DT, SFV, PRD, RPE) and their dates. Used on the DP page ("What was counted") and in Pulse Check.
export function SupportedReleasesTable({ releases }: { releases: SupportedRelease[] }) {
  return <div className="azure-table"><table><thead><tr><th>Release</th><th>Milestones Done in the month</th><th>Latest</th><th>ID</th><th>Title</th></tr></thead><tbody>
    {releases.map((entry) => <tr key={entry.key}><td><strong>{[entry.name, entry.release].filter(Boolean).join(' ') || '—'}</strong>{entry.milestones.some((milestone) => milestone.milestone === 'DDT') && <small>Completed (DT)</small>}</td>
      <td>{entry.milestones.map((milestone) => <span key={milestone.milestone} className="milestone-chip" title={`${dpMilestoneNames[milestone.milestone].long} (${milestone.milestone}) · ${formatDate(milestone.date)}`}>{dpMilestoneNames[milestone.milestone].short} <small>{formatDate(milestone.date)}</small></span>)}</td>
      <td>{formatDate(entry.date)}</td><td><a href={entry.item.url} target="_blank" rel="noreferrer">{entry.item.id}</a></td><td>{entry.item.title}</td></tr>)}
  </tbody></table></div>
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
