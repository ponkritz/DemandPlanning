import { IoccBulkCreate } from './IoccBulkCreate'
import { useWriteBlock } from '../useCan'
import { useMemo, useState, type ReactNode } from 'react'
import { ContentBulkCreate } from './ContentBulkCreate'
import type { NamingPattern } from '../namingPatterns'
import { fullMatch } from '../dpBulk'
import { classificationOf, detectClassification } from '../epicSetup'
import { useEpicSetupFile } from '../useEpicSetup'
import type { AzureWorkItem } from '../domain'
import { releaseFeatureTitle, releaseRegister, type ReleaseEntry } from '../releaseSource'
import type { FeatureSetups } from '../featureSetup'
import type { ReleaseRule } from '../streams'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { formatDate, formatHours } from '../format'
import { QueryView } from './QueryView'
import { ResultTabs } from './ResultTabs'
import { EmptyState, Pill, TablePanel, WriteBlocked } from './ui'
import type { QueryColumn, QueryOrder } from '../queryView'
import { DataTable, type DataColumn } from './DataTable'
import { useBulkEpic, useStreamEpics } from '../useStreamEpics'
import { BulkEpicNotSet } from './BulkEpicsPanel'
import { bulkEpicMissing } from '../bulkEpics'
import { BoardMatchCell } from './DpBoardColumn'
import { boardMatchText, dpBoardCandidates, releaseBoardMatch, type BoardMatch } from '../dpBoardMatch'
import { nestGroups, nestedKeys, type GroupLevel, type NestedGroup } from '../nestedGroups'

// IOCC: nested grouping of its releases (QV-37), by Type of Release, then name, then version.
const releaseLevels: GroupLevel<ReleaseEntry>[] = [
  { id: 'type', label: 'Type of Release', value: (release) => release.group ?? '' },
  { id: 'name', label: 'Release name', value: (release) => release.name },
  { id: 'release', label: 'Release', value: (release) => release.release },
]

// Release source view, one page: the releases found in the documents' paths (see releasePath: release from the
// Iteration Path with the name from the Area Path, else "…\Name\Release x.y.z" in the Area Path) as a flat list — no grouping by stream — and below it the documents with the query's columns.
export function ReleaseView({ name, items, backlog, columns, orderBy, unresolved, azure, assign, featureSetup, rule, fuzzy = false, threshold = 80, patterns, area, onOpenBulkEpics }: { onOpenBulkEpics?: () => void; area?: string[]; patterns?: NamingPattern[]; featureSetup?: FeatureSetups | null; name: string; items: AzureWorkItem[]; backlog: AzureWorkItem[]; columns?: QueryColumn[]; orderBy?: QueryOrder[]; unresolved?: string[]; azure?: AzureWorkspace; assign?: { me: string; canChoose: boolean }; rule?: ReleaseRule; fuzzy?: boolean; threshold?: number }) {
  const register = useMemo(() => releaseRegister(items, backlog, { rule, fuzzy, threshold, patterns, area }), [items, backlog, rule, fuzzy, threshold, patterns, area])
  const info = rule === 'title' ? 'Content: a release is named by the naming patterns (Admin → Streams → Stream mapping; built in: the Title up to and including _RELEASE, the rest is the document), its documents grouped under it; a Title no pattern fits is a release of its own (QV-52, QV-55). The Time Writing Feature is the one whose title holds that name.' : rule === 'dp' ? `DP: release name from the Area Path (last segment), release number from the Iteration Path (a “Release x.y.z” segment, else a segment with a version). Time Writing Feature = the best fuzzy match among QMS-0025 Features (name 60%, version 40%); it counts — with its planned and booked hours — at ${threshold}% or more (Admin → Streams → Stream mapping). Map the Pedestal and DHFI data sets there to list the Pedestal Releases with their DHFI dates instead.` : rule === 'iocc' ? `${area ? `${name} (Like IOCC, STR-03): the Area Path segment after “${area.join('” or “')}” (else the last segment)` : 'IOCC: the Area Path segment after “IOCC”'} is the Type of Release; the release name comes from the document Title, with its version as the release number. Time Writing Feature = the best fuzzy match among QMS-0025 Features (name 60%, version 40%); it counts — with its planned and booked hours — at ${threshold}% or more (Admin → Streams → Stream mapping).` : 'Releases are read from the documents’ paths: a “Release x.y.z” segment with the name in the segment above it (Iteration Path first, else Area Path). Time Writing Feature = the QMS-0025 Feature whose title names the release exactly (name as whole words and the exact version, in any order); a Feature matching several releases goes to the longest name. Planned and booked hours are the Time Writing Tasks under that Feature.'
  // QV-47: the releases and the source data (the query output) are two tabs of the page.
  const releases = <ReleaseTable name={name} register={register} azure={azure} onOpenBulkEpics={onOpenBulkEpics} assign={assign} featureSetup={featureSetup} threshold={threshold} typed={rule === 'iocc'} titled={rule === 'title'} info={info} empty={<EmptyState title="No releases found in the documents' paths." detail="A release is read from a path segment “Release x.y.z”, with the name in the segment above it." />} />
  const rows = <TablePanel><QueryView name={name} items={items} columns={columns} orderBy={orderBy} unresolved={unresolved} summary={rule !== 'tool'} queryOnly={rule === 'title'} /></TablePanel>
  return <ResultTabs id={`azure:${name}`} rawCount={items.length} main={releases} raw={rows} />
}

// The release table shared by the views: one row per release with its documents, Feature match and hours; with
// typed, the IOCC Type of Release column and nested grouping (Group by … then by …, Collapse all / Expand all).
// QV-62, UI-STANDARDS §10: the columns in the standard's order — Select (bulk only), Release name ▸, Release, Approved,
// Documents, the stream's own (Type of Release), Time Writing Feature, Planned (h), Booked (h), QMS-0025 match.
function ReleaseTable({ onOpenBulkEpics, name, title = 'Releases', detail, register, azure, assign, featureSetup, threshold = 80, typed, titled = false, info, action, empty, featureTitle = (release) => releaseFeatureTitle(name, [release.group, release.name].filter(Boolean).join(' '), release.release) }: { onOpenBulkEpics?: () => void; featureTitle?: (release: ReleaseEntry) => string; name: string; title?: string; detail?: string; register: ReleaseEntry[]; featureSetup?: FeatureSetups | null; azure?: AzureWorkspace; assign?: { me: string; canChoose: boolean }; fuzzy?: boolean; threshold?: number; typed?: boolean; titled?: boolean; info?: ReactNode; action?: ReactNode; empty?: ReactNode }) {
  const [open, setOpen] = useState('')
  const [groupBy, setGroupBy] = useState<string[]>(typed ? ['type'] : [])
  const [collapsed, setCollapsed] = useState<string[]>([])
  const levels = useMemo(() => groupBy.map((id) => releaseLevels.find((level) => level.id === id)!).filter(Boolean), [groupBy])
  const groups = useMemo(() => levels.length ? nestGroups(register, levels) : null, [register, levels])
  const groupKeys = useMemo(() => groups ? nestedKeys(groups) : [], [groups])
  const regroup = (next: string[]) => { setGroupBy(next); setCollapsed([]) }
  // IOCC: the Area Path segment after IOCC is the Type of Release, in its own column.
  const grouped = typed || register.some((release) => release.group)
  // QV-46: the QMS-0025 match of every release, searched as on the DP table and the Windchill releases (boardMatch):
  // the release name (and, for IOCC, Type of Release + name) with its number, the stream as the program; a board title
  // equal to the Create Feature title is 100%. No match: the closest item and Create Feature, on every such release.
  const boardItems = azure?.items
  const epics = useStreamEpics(name)
  const candidates = useMemo(() => boardItems ? dpBoardCandidates(boardItems, epics) : [], [boardItems, epics])
  const matches = useMemo(() => new Map<string, BoardMatch>(azure ? register.map((release) => [release.key, releaseBoardMatch(release, name, featureTitle(release), candidates, threshold)]) : []), [azure, register, name, candidates, threshold, featureTitle])
  // UI-07…12: the release table follows the shared design default; the documents of a release open under it.
  // CNB-01: Content releases are ticked for Create Features (all assigned to one person, chosen in the pop-up).
  // QV-59: IOCC releases too, by the DP rules (IoccBulkCreate).
  // CON-94: bulk creation needs "Bulk create Features"; CON-102: without it Create Features is disabled and says why.
  const write = useWriteBlock(), bulkWhy = write.why('work.bulk')
  const bulk = (titled || Boolean(typed)) && Boolean(azure)
  // QV-59: no bulk creation Epic is built in — without one mapped, Create Features is disabled and says where to map it.
  const ioccEpic = useBulkEpic('IOCC').epicId, contentEpic = useBulkEpic('Content').epicId
  const bulkStream = typed ? 'IOCC' as const : 'Content' as const, bulkEpic = typed ? ioccEpic : contentEpic
  const [picked, setPicked] = useState<string[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const featureMatch = (release: ReleaseEntry) => matches.get(release.key)?.feature
  const epicFile = useEpicSetupFile()
  const classes = classificationOf(epicFile, typed ? ioccEpic : undefined)
  const detected = (release: ReleaseEntry) => ioccEpic ? detectClassification(classes, release.release) : ''
  const columns: DataColumn<ReleaseEntry>[] = [
    ...(bulk ? [{ id: 'pick', label: 'Select', fixed: true, sortable: false, export: false as const, value: (release: ReleaseEntry) => picked.includes(release.key) ? 'yes' : '', render: (release: ReleaseEntry) => { const full = fullMatch(featureMatch(release)); return <input type="checkbox" aria-label={`Select ${release.name}`} disabled={full} title={full ? `Feature #${featureMatch(release)!.item.id} on QMS-0025 matches this release 100%: nothing to create` : undefined} checked={!full && picked.includes(release.key)} onChange={() => setPicked((current) => current.includes(release.key) ? current.filter((key) => key !== release.key) : [...current, release.key])} /> } }] : []),
    { id: 'name', label: 'Release name', value: (release) => release.name, render: (release) => <button type="button" className="text-button" aria-expanded={open === release.key} onClick={() => setOpen(open === release.key ? '' : release.key)}>{open === release.key ? '▾' : '▸'} {release.name}</button> },
    // QV-52 Content: the Title is the release, so there is no release number column. DPF-12 IOCC: Version, then the
    // Release Classification detected from it by the rules of the IOCC bulk Epic (DPF-11; '—' without one).
    ...(titled ? [] : [{ id: 'release', label: typed ? 'Version' : 'Release', value: (release: ReleaseEntry) => release.release || '', render: (release: ReleaseEntry) => release.release || '—' }]),
    ...(typed ? [{ id: 'class', label: `${classes.label} (detected)`, value: (release: ReleaseEntry) => detected(release), render: (release: ReleaseEntry) => detected(release) || '—', title: () => !ioccEpic ? 'No IOCC bulk creation Epic is set (Admin → Stream options → Bulk creation Epics)' : `Detected from the version by Epic #${ioccEpic}’s ${classes.label} (Admin → Epic & Feature setup)` }] : []),
    { id: 'approved', label: 'Approved', value: (release) => release.approvalDate ?? '', render: (release) => release.approvalDate ? formatDate(release.approvalDate) : '—' },
    { id: 'documents', label: 'Documents', value: (release) => release.documents, align: 'right' },
    ...(grouped ? [{ id: 'type', label: 'Type of Release', value: (release: ReleaseEntry) => release.group || '' }] : []),
    { id: 'feature', label: 'Time Writing Feature', value: (release) => release.features.map((feature) => `#${feature.id} ${feature.title}`).join('; '), render: (release) => <>{release.match && release.match.score >= 50 && <Pill tone={release.match.score >= threshold ? 'open' : 'warning'}>{release.match.score}% match</Pill>}{release.features.length ? release.features.map((feature) => <a key={feature.id} className="feature-link" href={feature.url} target="_blank" rel="noreferrer">#{feature.id} {feature.title}</a>) : release.match && release.match.score >= 50 ? <><small className="muted">Closest: <a href={release.match.feature.url} target="_blank" rel="noreferrer">#{release.match.feature.id} {release.match.feature.title}</a> — below {threshold}%</small></> : <span className="muted">—</span>}</> },
    { id: 'planned', label: 'Planned (h)', value: (release) => release.hourTasks ? release.planned : '', render: (release) => release.hourTasks ? formatHours(release.planned) : '—', align: 'right' },
    { id: 'booked', label: 'Booked (h)', value: (release) => release.hourTasks ? release.booked : '', render: (release) => <>{release.hourTasks ? <>{formatHours(release.booked)}{release.planned > 0 && release.booked > release.planned && <small className="negative">+{formatHours(release.booked - release.planned)} over plan</small>}</> : '—'}<small>{release.hourTasks ? `${release.hourTasks} task${release.hourTasks === 1 ? '' : 's'}` : ''}</small></>, align: 'right' },
    ...(azure ? [{ id: 'match', label: 'QMS-0025 match', value: (release: ReleaseEntry) => boardMatchText(matches.get(release.key) ?? {}), sortable: false, render: (release: ReleaseEntry) => <BoardMatchCell match={matches.get(release.key) ?? {}} azure={azure} stream={name} title={featureTitle(release)} items={release.items} assign={assign} featureSetup={featureSetup} /> }] : []),
  ]
  const documents = (release: ReleaseEntry) => open === release.key ? <ul className="release-docs">{release.items.map((item) => <li key={item.key}><a href={item.url} target="_blank" rel="noreferrer">#{item.id} {item.title}</a><small> · {item.state}{item.approvalDate ? ` · approved ${formatDate(item.approvalDate)}` : ''}</small></li>)}</ul> : null
  // A group row (indented by its level with a CSS class, UI-STANDARDS §11, with its release count) and, when open, its sub-groups or its releases.
  const groupLines = (list: NestedGroup<ReleaseEntry>[], row: (release: ReleaseEntry) => ReactNode[], span: number): ReactNode[] => list.flatMap((group) => {
    const shut = collapsed.includes(group.key)
    return [<tr key={`g:${group.key}`} className={`qe-group qe-group-${Math.min(group.depth, 3)}`}><td colSpan={span}><button type="button" className={`text-button group-indent-${Math.min(group.depth, 3)}`} aria-expanded={!shut} onClick={() => setCollapsed((current) => shut ? current.filter((key) => key !== group.key) : [...current, group.key])}>{shut ? '▸' : '▾'} {group.label}: {group.value || '(blank)'}</button> <span className="muted">{group.items.length} release{group.items.length === 1 ? '' : 's'}</span></td></tr>,
      ...(shut ? [] : group.children.length ? groupLines(group.children, row, span) : group.items.flatMap(row))]
  })
  const grouping = typed && register.length > 0 ? <>
    {[...groupBy, ''].slice(0, releaseLevels.length).map((value, level) => <label key={level} className="inline-select">{level ? 'then by' : 'Group by'}<select aria-label={level ? `Group level ${level + 1}` : 'Group releases by'} value={value} onChange={(event) => regroup(event.target.value ? [...groupBy.slice(0, level), event.target.value] : groupBy.slice(0, level))}><option value="">{level ? '—' : 'No grouping'}</option>{releaseLevels.filter((entry) => entry.id === value || !groupBy.slice(0, level).includes(entry.id)).map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>)}
    {groupKeys.length > 1 && <><button type="button" className="ghost" disabled={groupKeys.every((key) => collapsed.includes(key))} onClick={() => setCollapsed(groupKeys)}>Collapse all</button><button type="button" className="ghost" disabled={!collapsed.length} onClick={() => setCollapsed([])}>Expand all</button></>}
  </> : null
  return <TablePanel title={title} detail={detail} info={info} action={action} count={register.length ? `${register.length} release${register.length === 1 ? '' : 's'}` : undefined}>
      {bulkOpen && azure && (typed ? <IoccBulkCreate releases={register.filter((release) => picked.includes(release.key))} featureTitle={featureTitle} featureMatch={featureMatch} azure={azure} featureSetup={featureSetup} onClose={() => { setBulkOpen(false); setPicked([]) }} /> : <ContentBulkCreate releases={register.filter((release) => picked.includes(release.key))} featureTitle={featureTitle} featureMatch={featureMatch} azure={azure} onClose={() => { setBulkOpen(false); setPicked([]) }} />)}
      {register.length ? <DataTable id={`releases:${name}:${title}`} className="release-register" columns={columns} rows={register} rowKey={(release) => release.key} exportName={`${name} ${title}`} toolbar={bulk ? <><span className="muted">{picked.length} selected</span><button type="button" className="ghost" disabled={!register.length} onClick={() => setPicked(register.filter((release) => !fullMatch(featureMatch(release))).map((release) => release.key))}>Select all shown</button><button type="button" className="ghost" disabled={!picked.length} onClick={() => setPicked([])}>Clear</button><WriteBlocked reason={bulkWhy} />{!bulkWhy && !bulkEpic && <BulkEpicNotSet stream={bulkStream} onOpen={onOpenBulkEpics} />}<button type="button" className="primary" disabled={!picked.length || !assign?.canChoose || Boolean(bulkWhy) || !bulkEpic} title={bulkWhy || (!bulkEpic ? bulkEpicMissing(bulkStream) : '') || (assign?.canChoose ? 'Create a Feature for each selected release, all assigned to one person' : 'Needs the right to create work items for other people (Admin → People & roles → Role rights)')} onClick={() => setBulkOpen(true)}>Create Features ({picked.length})</button></> : grouping} expand={documents} group={groups ? (_, row, span) => groupLines(groups, row, span) : undefined} /> : empty ?? <EmptyState title="No releases." />}
    </TablePanel>
}

