import { useMemo, useState, type ReactNode } from 'react'
import type { AzureWorkItem } from '../domain'
import { releaseFeatureTitle, releaseOnlyTitle, releaseRegister, type ReleaseEntry } from '../releaseSource'
import type { FeatureSetups } from '../featureSetup'
import type { ReleaseRule } from '../streams'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { formatDate, formatHours } from '../format'
import { QueryView } from './QueryView'
import { EmptyState, Pill, TablePanel } from './ui'
import type { QueryColumn, QueryOrder } from '../queryView'
import { useColumnWidths } from './columnWidths'
import { ReleaseFeatureButton } from './ReleaseFeatureEditor'
import { nestGroups, nestedKeys, type GroupLevel, type NestedGroup } from '../nestedGroups'

// IOCC: nested grouping of its releases (QV-37), by Type of Release, then name, then version.
const releaseLevels: GroupLevel<ReleaseEntry>[] = [
  { id: 'type', label: 'Type of Release', value: (release) => release.group ?? '' },
  { id: 'name', label: 'Name', value: (release) => release.name },
  { id: 'release', label: 'Release', value: (release) => release.release },
]

// Release source view, one page: the releases found in the documents' paths (see releasePath: release from the
// Iteration Path with the name from the Area Path, else "…\Name\Release x.y.z" in the Area Path) as a flat list — no grouping by stream — and below it the documents with the query's columns.
export function ReleaseView({ name, items, backlog, columns, orderBy, unresolved, azure, assign, featureSetup, rule, fuzzy = false, threshold = 80 }: { featureSetup?: FeatureSetups | null; name: string; items: AzureWorkItem[]; backlog: AzureWorkItem[]; columns?: QueryColumn[]; orderBy?: QueryOrder[]; unresolved?: string[]; azure?: AzureWorkspace; assign?: { me: string; canChoose: boolean }; rule?: ReleaseRule; fuzzy?: boolean; threshold?: number }) {
  const register = useMemo(() => releaseRegister(items, backlog, { rule, fuzzy, threshold }), [items, backlog, rule, fuzzy, threshold])
  const info = rule === 'dp' ? `DP: release name from the Area Path (last segment), release number from the Iteration Path (a “Release x.y.z” segment, else a segment with a version). Time Writing Feature = the best fuzzy match among QMS-0025 Features (name 60%, version 40%); it counts — with its planned and booked hours — at ${threshold}% or more (Settings → Azure DevOps → Stream mapping). Map the Pedestal and DHFI data sets there to list the Pedestal Releases with their DHFI dates instead.` : rule === 'iocc' ? `IOCC: the Area Path segment after “IOCC” is the Type of Release; the release name comes from the document Title, with its version as the release number. Time Writing Feature = the best fuzzy match among QMS-0025 Features (name 60%, version 40%); it counts — with its planned and booked hours — at ${threshold}% or more (Settings → Azure DevOps → Stream mapping).` : rule === 'asset' ? `CP: each asset's Title is “[Release name] [Release No] [Asset name]”; the release is the Title before its first version (3.1, v3.1, R3.2, Rel 4.0) and the number is that version, so a release's assets are one release. Time Writing Feature = the best fuzzy match among QMS-0025 Features (name 60%, version 40%); it counts — with its planned and booked hours — at ${threshold}% or more; without one, Create Feature opens the New Feature form titled with the release name and number only, “release name | vRelease”.` : 'Releases are read from the documents’ paths: a “Release x.y.z” segment with the name in the segment above it (Iteration Path first, else Area Path). Time Writing Feature = the QMS-0025 Feature whose title names the release exactly (name as whole words and the exact version, in any order); a Feature matching several releases goes to the longest name. Planned and booked hours are the Time Writing Tasks under that Feature.'
  return <>
    <ReleaseTable name={name} register={register} azure={azure} assign={assign} featureSetup={featureSetup} threshold={threshold} typed={rule === 'iocc'} info={info} featureTitle={rule === 'asset' ? (release) => releaseOnlyTitle(release.name, release.release) : undefined} empty={rule === 'asset' ? <EmptyState title="No releases found in the asset Titles." detail="A release is read from a Title “[Release name] [Release No] [Asset name]”, e.g. “Care Pathways 3.1 Test Report” → Care Pathways 3.1." /> : <EmptyState title="No releases found in the documents' paths." detail="A release is read from a path segment “Release x.y.z”, with the name in the segment above it." />} />
    <QueryView name={name} items={items} columns={columns} orderBy={orderBy} unresolved={unresolved} summary={rule !== 'tool'} />
  </>
}

// The release table shared by the views: one row per release with its documents, Feature match and hours; with
// typed, the IOCC Type of Release column and nested grouping (Group by … then by …, Collapse all / Expand all).
function ReleaseTable({ name, title = 'Releases', detail, register, azure, assign, featureSetup, threshold = 80, typed, info, action, empty, featureTitle = (release) => releaseFeatureTitle(name, [release.group, release.name].filter(Boolean).join(' '), release.release) }: { featureTitle?: (release: ReleaseEntry) => string; name: string; title?: string; detail?: string; register: ReleaseEntry[]; featureSetup?: FeatureSetups | null; azure?: AzureWorkspace; assign?: { me: string; canChoose: boolean }; fuzzy?: boolean; threshold?: number; typed?: boolean; info?: ReactNode; action?: ReactNode; empty?: ReactNode }) {
  const [open, setOpen] = useState('')
  const widths = useColumnWidths(`releases:${name}:${title}`)
  const [groupBy, setGroupBy] = useState<string[]>(typed ? ['type'] : [])
  const [collapsed, setCollapsed] = useState<string[]>([])
  const levels = useMemo(() => groupBy.map((id) => releaseLevels.find((level) => level.id === id)!).filter(Boolean), [groupBy])
  const groups = useMemo(() => levels.length ? nestGroups(register, levels) : null, [register, levels])
  const groupKeys = useMemo(() => groups ? nestedKeys(groups) : [], [groups])
  const regroup = (next: string[]) => { setGroupBy(next); setCollapsed([]) }
  // IOCC: the Area Path segment after IOCC is the Type of Release, in its own column.
  const grouped = typed || register.some((release) => release.group)
  const headings = [...(grouped ? ['Type of Release'] : []), 'Name', 'Release', 'Approved', 'Documents', 'Time Writing Feature', 'Planned (h)', 'Booked (h)']
  const releaseRows = (release: ReleaseEntry): ReactNode[] => [
          <tr key={release.key}>
            {grouped && <td>{release.group || '—'}</td>}
            <td><button type="button" className="text-button" aria-expanded={open === release.key} onClick={() => setOpen(open === release.key ? '' : release.key)}>{open === release.key ? '▾' : '▸'} {release.name}</button></td>
            <td>{release.release || '—'}</td><td>{release.approvalDate ? formatDate(release.approvalDate) : '—'}</td><td>{release.documents}</td>
            <td>{release.match && release.match.score >= 50 && <Pill tone={release.match.score >= threshold ? 'open' : 'warning'}>{release.match.score}% match</Pill>}{release.features.length ? release.features.map((feature) => <a key={feature.id} className="feature-link" href={feature.url} target="_blank" rel="noreferrer">#{feature.id} {feature.title}</a>) : release.match && release.match.score >= 50 ? <><small className="muted">Closest: <a href={release.match.feature.url} target="_blank" rel="noreferrer">#{release.match.feature.id} {release.match.feature.title}</a> — below {threshold}%</small>{azure && <ReleaseFeatureButton stream={name} title={featureTitle(release)} items={release.items} azure={azure} assign={assign} featureSetup={featureSetup} />}</> : release.tracked ? <Pill tone="info">Named by {release.trackedBy.length} item{release.trackedBy.length === 1 ? '' : 's'}, no Feature</Pill> : <><Pill tone="warning">Not tracked</Pill>{azure && <ReleaseFeatureButton stream={name} title={featureTitle(release)} items={release.items} azure={azure} assign={assign} featureSetup={featureSetup} />}</>}</td>
            <td>{release.hourTasks ? formatHours(release.planned) : '—'}</td>
            <td>{release.hourTasks ? <>{formatHours(release.booked)}{release.planned > 0 && release.booked > release.planned && <small className="negative">+{formatHours(release.booked - release.planned)} over plan</small>}</> : '—'}<small>{release.hourTasks ? `${release.hourTasks} task${release.hourTasks === 1 ? '' : 's'}` : ''}</small></td>
          </tr>,
          ...(open === release.key ? [<tr key={`${release.key}/docs`} className="release-docs"><td colSpan={headings.length}><ul>{release.items.map((item) => <li key={item.key}><a href={item.url} target="_blank" rel="noreferrer">#{item.id} {item.title}</a><small> · {item.state}{item.approvalDate ? ` · approved ${formatDate(item.approvalDate)}` : ''}</small></li>)}</ul></td></tr>] : []),
  ]
  // A group row (indented by its level, with its release count) and, when open, its sub-groups or its releases.
  const groupLines = (list: NestedGroup<ReleaseEntry>[]): ReactNode[] => list.flatMap((group) => {
    const shut = collapsed.includes(group.key)
    return [<tr key={`g:${group.key}`} className={`qe-group qe-group-${Math.min(group.depth, 3)}`}><td colSpan={headings.length}><button type="button" className="text-button" style={{ marginLeft: group.depth * 18 }} aria-expanded={!shut} onClick={() => setCollapsed((current) => shut ? current.filter((key) => key !== group.key) : [...current, group.key])}>{shut ? '▸' : '▾'} {group.label}: {group.value || '(blank)'}</button> <span className="muted">{group.items.length} release{group.items.length === 1 ? '' : 's'}</span></td></tr>,
      ...(shut ? [] : group.children.length ? groupLines(group.children) : group.items.flatMap(releaseRows))]
  })
  const toolbar = register.length > 0 ? <div className="button-row">
    {typed && [...groupBy, ''].slice(0, releaseLevels.length).map((value, level) => <label key={level} className="inline-select">{level ? 'then by' : 'Group by'}<select aria-label={level ? `Group level ${level + 1}` : 'Group releases by'} value={value} onChange={(event) => regroup(event.target.value ? [...groupBy.slice(0, level), event.target.value] : groupBy.slice(0, level))}><option value="">{level ? '—' : 'No grouping'}</option>{releaseLevels.filter((entry) => entry.id === value || !groupBy.slice(0, level).includes(entry.id)).map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>)}
    {typed && groupKeys.length > 1 && <><button type="button" className="ghost" disabled={groupKeys.every((key) => collapsed.includes(key))} onClick={() => setCollapsed(groupKeys)}>Collapse all</button><button type="button" className="ghost" disabled={!collapsed.length} onClick={() => setCollapsed([])}>Expand all</button></>}
    {widths.wrapToggle}
    {widths.resized && <button type="button" className="ghost" onClick={widths.reset}>Reset widths</button>}
    {action}
  </div> : action
  return <TablePanel title={title} detail={detail} info={info} action={toolbar}>
      {register.length ? <table className={`release-register ${widths.tableClass}`}><thead><tr>{headings.map((heading) => <th key={heading} style={widths.style(heading)}>{heading}{widths.handle(heading)}</th>)}</tr></thead><tbody>
        {groups ? groupLines(groups) : register.flatMap(releaseRows)}
      </tbody></table> : empty ?? <EmptyState title="No releases." />}
    </TablePanel>
}

