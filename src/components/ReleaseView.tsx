import { useMemo, useState, type ReactNode } from 'react'
import type { AzureWorkItem } from '../domain'
import { releaseFeatureTitle, releaseRegister, type ReleaseEntry } from '../releaseSource'
import type { FeatureSetups } from '../featureSetup'
import type { ReleaseRule } from '../streams'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { formatDate, formatHours } from '../format'
import { QueryView } from './QueryView'
import { EmptyState, Pill, TablePanel } from './ui'
import type { QueryColumn, QueryOrder } from '../queryView'
import { useColumnWidths } from './columnWidths'
import { ReleaseFeatureButton } from './ReleaseFeatureEditor'

// Release source view, one page: the releases found in the documents' paths (see releasePath: release from the
// Iteration Path with the name from the Area Path, else "…\Name\Release x.y.z" in the Area Path) as a flat list — no grouping by stream — and below it the documents with the query's columns.
export function ReleaseView({ name, items, backlog, columns, orderBy, unresolved, azure, assign, featureSetup, rule, fuzzy = false, threshold = 80 }: { featureSetup?: FeatureSetups | null; name: string; items: AzureWorkItem[]; backlog: AzureWorkItem[]; columns?: QueryColumn[]; orderBy?: QueryOrder[]; unresolved?: string[]; azure?: AzureWorkspace; assign?: { me: string; canChoose: boolean }; rule?: ReleaseRule; fuzzy?: boolean; threshold?: number }) {
  const register = useMemo(() => releaseRegister(items, backlog, { rule, fuzzy, threshold }), [items, backlog, rule, fuzzy, threshold])
  const info = rule === 'dp' ? `DP: release name from the Area Path (last segment), release number from the Iteration Path (a “Release x.y.z” segment, else a segment with a version). Time Writing Feature = the best fuzzy match among QMS-0025 Features (name 60%, version 40%); it counts — with its planned and booked hours — at ${threshold}% or more (Settings → Azure DevOps → Stream mapping). Map the Pedestal and DHFI data sets there to list the Pedestal Releases with their DHFI dates instead.` : rule === 'iocc' ? `IOCC: the Area Path segment after “IOCC” is the Type of Release; the release name comes from the document Title, with its version as the release number. Time Writing Feature = the best fuzzy match among QMS-0025 Features (name 60%, version 40%); it counts — with its planned and booked hours — at ${threshold}% or more (Settings → Azure DevOps → Stream mapping).` : 'Releases are read from the documents’ paths: a “Release x.y.z” segment with the name in the segment above it (Iteration Path first, else Area Path). Time Writing Feature = the QMS-0025 Feature whose title names the release exactly (name as whole words and the exact version, in any order); a Feature matching several releases goes to the longest name. Planned and booked hours are the Time Writing Tasks under that Feature.'
  return <>
    <ReleaseTable name={name} register={register} azure={azure} assign={assign} featureSetup={featureSetup} threshold={threshold} typed={rule === 'iocc'} info={info} empty={<EmptyState title="No releases found in the documents' paths." detail="A release is read from a path segment “Release x.y.z”, with the name in the segment above it." />} />
    <QueryView name={name} items={items} columns={columns} orderBy={orderBy} unresolved={unresolved} />
  </>
}
// The release table shared by the views: one row per release with its documents, Feature match and hours; with
// typed, the IOCC Type of Release column.
function ReleaseTable({ name, title = 'Releases', detail, register, azure, assign, featureSetup, threshold = 80, typed, info, action, empty }: { name: string; title?: string; detail?: string; register: ReleaseEntry[]; featureSetup?: FeatureSetups | null; azure?: AzureWorkspace; assign?: { me: string; canChoose: boolean }; fuzzy?: boolean; threshold?: number; typed?: boolean; info?: ReactNode; action?: ReactNode; empty?: ReactNode }) {
  const [open, setOpen] = useState('')
  const widths = useColumnWidths(`releases:${name}:${title}`)
  // IOCC: the Area Path segment after IOCC is the Type of Release, in its own column.
  const grouped = typed || register.some((release) => release.group)
  const headings = [...(grouped ? ['Type of Release'] : []), 'Name', 'Release', 'Approved', 'Documents', 'Time Writing Feature', 'Planned (h)', 'Booked (h)']
  return <TablePanel title={title} detail={detail} info={info} action={action}>
      {register.length ? <table className="release-register resizable"><thead><tr>{headings.map((heading) => <th key={heading} style={widths.style(heading)}>{heading}{widths.handle(heading)}</th>)}</tr></thead><tbody>
        {register.flatMap((release) => [
          <tr key={release.key}>
            {grouped && <td>{release.group || '—'}</td>}
            <td><button type="button" className="text-button" aria-expanded={open === release.key} onClick={() => setOpen(open === release.key ? '' : release.key)}>{open === release.key ? '▾' : '▸'} {release.name}</button></td>
            <td>{release.release || '—'}</td><td>{release.approvalDate ? formatDate(release.approvalDate) : '—'}</td><td>{release.documents}</td>
            <td>{release.match && release.match.score >= 50 && <Pill tone={release.match.score >= threshold ? 'open' : 'warning'}>{release.match.score}% match</Pill>}{release.features.length ? release.features.map((feature) => <a key={feature.id} className="feature-link" href={feature.url} target="_blank" rel="noreferrer">#{feature.id} {feature.title}</a>) : release.match && release.match.score >= 50 ? <><small className="muted">Closest: <a href={release.match.feature.url} target="_blank" rel="noreferrer">#{release.match.feature.id} {release.match.feature.title}</a> — below {threshold}%</small>{azure && <ReleaseFeatureButton stream={name} title={releaseFeatureTitle(name, [release.group, release.name].filter(Boolean).join(' '), release.release)} azure={azure} assign={assign} featureSetup={featureSetup} />}</> : release.tracked ? <Pill tone="info">Named by {release.trackedBy.length} item{release.trackedBy.length === 1 ? '' : 's'}, no Feature</Pill> : <><Pill tone="warning">Not tracked</Pill>{azure && <ReleaseFeatureButton stream={name} title={releaseFeatureTitle(name, [release.group, release.name].filter(Boolean).join(' '), release.release)} azure={azure} assign={assign} featureSetup={featureSetup} />}</>}</td>
            <td>{release.hourTasks ? formatHours(release.planned) : '—'}</td>
            <td>{release.hourTasks ? <>{formatHours(release.booked)}{release.planned > 0 && release.booked > release.planned && <small className="negative">+{formatHours(release.booked - release.planned)} over plan</small>}</> : '—'}<small>{release.hourTasks ? `${release.hourTasks} task${release.hourTasks === 1 ? '' : 's'}` : ''}</small></td>
          </tr>,
          ...(open === release.key ? [<tr key={`${release.key}/docs`} className="release-docs"><td colSpan={headings.length}><ul>{release.items.map((item) => <li key={item.key}><a href={item.url} target="_blank" rel="noreferrer">#{item.id} {item.title}</a><small> · {item.state}{item.approvalDate ? ` · approved ${formatDate(item.approvalDate)}` : ''}</small></li>)}</ul></td></tr>] : []),
        ])}
      </tbody></table> : empty ?? <EmptyState title="No releases." />}
    </TablePanel>
}
