import { useMemo } from 'react'
import type { AzureWorkItem } from '../domain'
import { dpMilestoneNames, dpMilestones, dpMonthCounts, dpReleaseName } from '../dpMilestones'
import { formatDate, monthName } from '../format'
import { Metric, Metrics } from './ui'

// DP page: the month's two counts from the DP query (dpMilestones) and, folded, every milestone counted.
export function DpMonthCounts({ items, month }: { items: AzureWorkItem[]; month: string }) {
  const counts = useMemo(() => dpMonthCounts(items, month), [items, month])
  const label = monthName(month)
  return <div className="dp-counts">
    <Metrics>
      <Metric label={`Completed Releases · ${label}`} value={counts.completed.length} hint="DT (Design Transfer) Done with its DDT Date in the month" />
      <Metric label={`Supported Releases · ${label}`} value={counts.supported.length} hint={`Done in the month: ${dpMilestones.map(([milestone]) => `${dpMilestoneNames[milestone].short} ${counts.byMilestone[milestone]}`).join(' · ')}`} />
    </Metrics>
    {counts.supported.length > 0 && <details className="dp-counted"><summary>What was counted ({counts.supported.length})</summary>
      <div className="azure-table"><table><thead><tr><th>Milestone</th><th>Date</th><th>ID</th><th>Release</th><th>Title</th></tr></thead><tbody>
        {counts.supported.map((entry) => { const release = dpReleaseName(entry.item); return <tr key={`${entry.item.id}:${entry.milestone}`}><td title={`${entry.milestone}: ${dpMilestoneNames[entry.milestone].long}`}><strong>{dpMilestoneNames[entry.milestone].short}</strong><small>{dpMilestoneNames[entry.milestone].long}{entry.milestone === 'DDT' ? ' · Completed' : ''}</small></td><td>{formatDate(entry.date)}</td><td><a href={entry.item.url} target="_blank" rel="noreferrer">{entry.item.id}</a></td><td>{[release.name, release.release].filter(Boolean).join(' ')}</td><td>{entry.item.title}</td></tr> })}
      </tbody></table></div>
    </details>}
  </div>
}
