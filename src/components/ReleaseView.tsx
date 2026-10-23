import { useMemo, useState, type ReactNode } from 'react'
import type { AzureWorkItem } from '../domain'
import { matchScore, releaseFeatureTitle, releaseRegister, tracksRelease, type ReleaseEntry } from '../releaseSource'
import type { ReleaseRule } from '../streams'
import { createAzureFeature } from '../azureDevOps'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { formatDate, formatHours, monthName } from '../format'
import { QueryView } from './QueryView'
import { EmptyState, Pill, TablePanel } from './ui'
import type { QueryColumn, QueryOrder } from '../queryView'
import { useColumnWidths } from './columnWidths'
import { AssigneeConfirm } from './AssigneeConfirm'
import { assignablePeople } from '../myWork'
import { designReviews, dpReleases, type DpRelease, type PedestalRelease } from '../dpReleases'

// Release source view, one page: the releases found in the documents' paths (see releasePath: release from the
// Iteration Path with the name from the Area Path, else "…\Name\Release x.y.z" in the Area Path) as a flat list — no grouping by stream — and below it the documents with the query's columns.
export function ReleaseView({ name, items, backlog, columns, orderBy, unresolved, azure, assign, rule, fuzzy = false, threshold = 80 }: { name: string; items: AzureWorkItem[]; backlog: AzureWorkItem[]; columns?: QueryColumn[]; orderBy?: QueryOrder[]; unresolved?: string[]; azure?: AzureWorkspace; assign?: { me: string; canChoose: boolean }; rule?: ReleaseRule; fuzzy?: boolean; threshold?: number }) {
  const register = useMemo(() => releaseRegister(items, backlog, { rule, fuzzy, threshold }), [items, backlog, rule, fuzzy, threshold])
  const info = rule === 'dp' ? `DP: release name from the Area Path (last segment), release number from the Iteration Path (a “Release x.y.z” segment, else a segment with a version). Time Writing Feature = the best fuzzy match among QMS-0025 Features (name 60%, version 40%); it counts — with its planned and booked hours — at ${threshold}% or more (Settings → Azure DevOps → Stream mapping). Map the Pedestal and DHFI data sets there to list the Pedestal Releases with their DHFI dates instead.` : rule === 'iocc' ? `IOCC: the Area Path segment after “IOCC” is the Type of Release; the release name comes from the document Title, with its version as the release number. Time Writing Feature = the best fuzzy match among QMS-0025 Features (name 60%, version 40%); it counts — with its planned and booked hours — at ${threshold}% or more (Settings → Azure DevOps → Stream mapping).` : 'Releases are read from the documents’ paths: a “Release x.y.z” segment with the name in the segment above it (Iteration Path first, else Area Path). Time Writing Feature = the QMS-0025 Feature whose title names the release exactly (name as whole words and the exact version, in any order); a Feature matching several releases goes to the longest name. Planned and booked hours are the Time Writing Tasks under that Feature.'
  return <>
    <ReleaseTable name={name} register={register} azure={azure} assign={assign} fuzzy={fuzzy} threshold={threshold} typed={rule === 'iocc'} info={info} empty={<EmptyState title="No releases found in the documents' paths." detail="A release is read from a path segment “Release x.y.z”, with the name in the segment above it." />} />
    <QueryView name={name} items={items} columns={columns} orderBy={orderBy} unresolved={unresolved} />
  </>
}

// DP with the Pedestal and DHFI data sets (dpReleases): the Pedestal Releases dated by their DHFI documents in the
// month, then those without a DHFI document (or a dated one) under "No DHFI yet". Each with its Pedestal plan and
// its QMS-0025 Feature match.
export function DpReleasesView({ pedestal, dhfi, backlog, month, allMonths, azure, assign, threshold = 80, action }: { pedestal: AzureWorkItem[]; dhfi: AzureWorkItem[]; backlog: AzureWorkItem[]; month: string; allMonths: boolean; azure?: AzureWorkspace; assign?: { me: string; canChoose: boolean }; threshold?: number; action?: ReactNode }) {
  const register = useMemo(() => dpReleases(pedestal, dhfi, backlog, { threshold }), [pedestal, dhfi, backlog, threshold])
  const dated = register.filter((release) => release.month && (allMonths || release.month === month))
  const undated = register.filter((release) => !release.month)
  const info = `DP combines two data sets (Settings → Azure DevOps → Stream mapping): the Pedestal release register — every Release work item is a DP release, its Title naming the release and its version (“RSGMS 3.0.0.2”) — and the DHFI documents. The DHFI list is searched for documents whose Title names both the release and its exact version, ignoring spaces and punctuation inside words (“RS GMS” = “RSGMS”); the latest Author Approval Date (else Closed Date) of those documents dates the release and puts it in the month. Pedestal Release shows its State, Intent and PI / Year; Design reviews the DRPE, DRPC, DRfH and DDT dates and statuses. Time Writing Feature = the best fuzzy match among QMS-0025 Features (name 60%, version 40%; spacing inside words ignored, another version never counts as the same release); it counts — with its planned and booked hours — at ${threshold}% or more. Releases without a dated DHFI document are listed under “No DHFI yet”.`
  return <>
    <ReleaseTable name="DP" title={allMonths ? 'Releases (all months)' : `Releases in ${monthName(month)}`} register={dated} azure={azure} assign={assign} fuzzy threshold={threshold} pedestal info={info} action={action} empty={<EmptyState title={allMonths ? 'No Pedestal Release has a dated DHFI document.' : `No DP release dated in ${monthName(month)}.`} detail={!pedestal.length ? 'Fetch the Pedestal data set (Settings → Azure DevOps → Stream mapping).' : !dhfi.length ? 'Fetch the DHFI data set (Settings → Azure DevOps → Stream mapping).' : 'A release is dated by the Author Approval Date (else Closed Date) of the DHFI documents whose Title names it.'} />} />
    {undated.length > 0 && <ReleaseTable name="DP" title="No DHFI yet" detail={`${undated.length} Pedestal Release${undated.length === 1 ? '' : 's'} without a dated DHFI document`} register={undated} azure={azure} assign={assign} fuzzy threshold={threshold} pedestal />}
  </>
}

// The release table shared by the views: one row per release with its documents, Feature match and hours; with
// pedestal, the Pedestal Release and Design reviews columns; with typed, the IOCC Type of Release column.
function ReleaseTable({ name, title = 'Releases', detail, register, azure, assign, fuzzy = false, threshold = 80, pedestal = false, typed, info, action, empty }: { name: string; title?: string; detail?: string; register: ReleaseEntry[]; azure?: AzureWorkspace; assign?: { me: string; canChoose: boolean }; fuzzy?: boolean; threshold?: number; pedestal?: boolean; typed?: boolean; info?: ReactNode; action?: ReactNode; empty?: ReactNode }) {
  const [open, setOpen] = useState('')
  const widths = useColumnWidths(`releases:${name}:${title}`)
  // IOCC: the Area Path segment after IOCC is the Type of Release, in its own column.
  const grouped = typed || register.some((release) => release.group)
  const headings = [...(grouped ? ['Type of Release'] : []), 'Name', 'Release', 'Approved', 'Documents', ...(pedestal ? ['Pedestal Release', 'Design reviews'] : []), 'Time Writing Feature', 'Planned (h)', 'Booked (h)']
  return <TablePanel title={title} detail={detail} info={info} action={action}>
      {register.length ? <table className="release-register resizable"><thead><tr>{headings.map((heading) => <th key={heading} style={widths.style(heading)}>{heading}{widths.handle(heading)}</th>)}</tr></thead><tbody>
        {register.flatMap((release) => [
          <tr key={release.key}>
            {grouped && <td>{release.group || '—'}</td>}
            <td><button type="button" className="text-button" aria-expanded={open === release.key} onClick={() => setOpen(open === release.key ? '' : release.key)}>{open === release.key ? '▾' : '▸'} {release.name}</button></td>
            <td>{release.release || '—'}</td><td>{release.approvalDate ? formatDate(release.approvalDate) : '—'}</td><td>{release.documents}</td>
            {pedestal && <PedestalCells plan={'pedestal' in release ? (release as DpRelease).pedestal : undefined} />}
            <td>{release.match && release.match.score >= 50 && <Pill tone={release.match.score >= threshold ? 'open' : 'warning'}>{release.match.score}% match</Pill>}{release.features.length ? release.features.map((feature) => <a key={feature.id} className="feature-link" href={feature.url} target="_blank" rel="noreferrer">#{feature.id} {feature.title}</a>) : release.match && release.match.score >= 50 ? <><small className="muted">Closest: <a href={release.match.feature.url} target="_blank" rel="noreferrer">#{release.match.feature.id} {release.match.feature.title}</a> — below {threshold}%</small>{azure && <button type="button" className="text-button" onClick={() => setOpen(`${release.key}/create`)}>＋ Create Feature</button>}</> : release.tracked ? <Pill tone="info">Named by {release.trackedBy.length} item{release.trackedBy.length === 1 ? '' : 's'}, no Feature</Pill> : <><Pill tone="warning">Not tracked</Pill>{azure && <button type="button" className="text-button" onClick={() => setOpen(`${release.key}/create`)}>＋ Create Feature</button>}</>}</td>
            <td>{release.hourTasks ? formatHours(release.planned) : '—'}</td>
            <td>{release.hourTasks ? <>{formatHours(release.booked)}{release.planned > 0 && release.booked > release.planned && <small className="negative">+{formatHours(release.booked - release.planned)} over plan</small>}</> : '—'}<small>{release.hourTasks ? `${release.hourTasks} task${release.hourTasks === 1 ? '' : 's'}` : ''}</small></td>
          </tr>,
          ...(open === `${release.key}/create` && azure ? [<tr key={`${release.key}/create`} className="release-docs"><td colSpan={headings.length}><CreateReleaseFeature assign={assign} stream={name} release={release} azure={azure} fuzzy={fuzzy} threshold={threshold} onDone={() => setOpen('')} /></td></tr>] : []),
          ...(open === release.key ? [<tr key={`${release.key}/docs`} className="release-docs"><td colSpan={headings.length}><ul>{release.items.map((item) => <li key={item.key}><a href={item.url} target="_blank" rel="noreferrer">#{item.id} {item.title}</a><small> · {item.state}{item.approvalDate ? ` · approved ${formatDate(item.approvalDate)}` : ''}</small></li>)}</ul></td></tr>] : []),
        ])}
      </tbody></table> : empty ?? <EmptyState title="No releases." />}
    </TablePanel>
}

// The Pedestal plan and status of a release: its Release work item (State, Intent, PI / Year) and its design reviews
// (date and status).
function PedestalCells({ plan }: { plan?: PedestalRelease }) {
  if (!plan) return <><td><span className="muted">—</span></td><td>—</td></>
  const { item, values } = plan
  const when = [values.PI && `PI ${values.PI}`, values.Year].filter(Boolean).join(' · ')
  const reviews = designReviews.filter(([, date, status]) => values[date] || values[status])
  return <>
    <td><a className="feature-link" href={item.url} target="_blank" rel="noreferrer">#{item.id} {item.title}</a><small>{[item.state, values.ReleaseIntent, when].filter(Boolean).join(' · ')}</small></td>
    <td>{reviews.length ? reviews.map(([label, date, status]) => <small key={label}>{label}: {values[date] ? formatDate(values[date]!) : '—'}{values[status] ? ` · ${values[status]}` : ''}</small>) : '—'}</td>
  </>
}

// Creates the QMS-0025 Feature for a release. The title is pre-filled as "<Stream> | <Name> | v<release>" and can be
// edited; it must still name the release (tracksRelease) so the release maps back to it. Parent: the Epic named like the stream (DP, CP, IOCC, …) unless another is chosen; assigned to the Time
// Writing connection's creator email. Azure DevOps validates the Feature before it is saved.
// The new Feature is assigned to the person chosen in the confirmation: by default the person creating it.
function CreateReleaseFeature({ stream, release, azure, onDone, assign, fuzzy = false, threshold = 80 }: { stream: string; release: ReleaseEntry; azure: AzureWorkspace; onDone: () => void; assign?: { me: string; canChoose: boolean }; fuzzy?: boolean; threshold?: number }) {
  const [confirming, setConfirming] = useState(false)
  const me = (assign?.me || azure.creatorEmail).trim().toLowerCase()
  const epics = azure.items.filter((item) => item.workItemType === 'Epic' && item.state.trim().toLowerCase() !== 'removed').sort((a, b) => a.title.localeCompare(b.title))
  const word = new RegExp(`(^|[^a-z0-9])${stream.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`)
  const suggested = epics.find((epic) => epic.title.trim().toLowerCase() === stream.trim().toLowerCase()) ?? epics.find((epic) => word.test(epic.title.toLowerCase()))
  const [epicId, setEpicId] = useState(suggested?.id ?? 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [title, setTitle] = useState(() => releaseFeatureTitle(stream, [release.group, release.name].filter(Boolean).join(' '), release.release))
  const score = fuzzy ? matchScore(title, release.name, release.release, release.group) : undefined
  const mapsBack = score != null ? score >= threshold : tracksRelease(title, release.name, release.release)
  const blocked = azure.isSample ? 'Synthetic sample data is loaded: creating in Azure DevOps is disabled.' : !azure.config || !azure.pat.trim() ? 'Connect the QMS-0025 Time Writing connection (with its PAT) to create Features.' : !azure.creatorEmail ? 'Set the Feature creator email on the Time Writing connection: new Features are assigned to it.' : ''
  async function create(assignee: string) {
    if (blocked || !azure.config || !epicId || !mapsBack || !title.trim()) return
    setBusy(true); setError('')
    try {
      const created = await createAzureFeature(azure.config, azure.pat, { parentId: epicId, title: title.trim(), description: `Release ${release.name} ${release.release} (${stream}); created from the ${stream} release view. ${release.documents} document(s).`, acceptanceCriteria: '', assignedTo: assignee })
      azure.featureCreated([created])
      setConfirming(false); onDone()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'The Feature could not be created.') }
    finally { setBusy(false) }
  }
  return <div className="create-release-feature">
    <label>Feature title<input value={title} maxLength={255} onChange={(event) => setTitle(event.target.value)} /></label>
    <small className={mapsBack ? 'muted' : 'negative'}>{score != null ? `${score}% match with ${[release.group, release.name, release.release].filter(Boolean).join(' ')}${mapsBack ? ' — the release maps to this Feature.' : ` — below ${threshold}%, the release would not map to it. Keep the name and version in the title.`}` : mapsBack ? `Maps back to ${release.name} ${release.release}: the title names the release and its version.` : `This title does not name “${release.name}” and version ${release.release}; the release would not map to the Feature. Keep both in the title.`}</small>
    {blocked ? <p className="notice warning">{blocked}</p> : <div className="button-row">
      <label>Parent Epic<select value={epicId || ''} onChange={(event) => setEpicId(Number(event.target.value))}><option value="">Choose an Epic…</option>{epics.map((epic) => <option key={epic.id} value={epic.id}>#{epic.id} {epic.title}</option>)}</select></label>
      <button type="button" className="primary" disabled={busy || !epicId || !mapsBack} onClick={() => setConfirming(true)}>Create Feature</button>
      <button type="button" className="ghost" disabled={busy} onClick={onDone}>Cancel</button>
    </div>}
    {error && <p className="notice error">{error}</p>}
    {confirming && <AssigneeConfirm title="Create Feature" people={assignablePeople(azure.items)} me={me} canChoose={Boolean(assign?.canChoose)} busy={busy} confirmLabel="Create Feature"
      summary={<>Creates the Feature “{title.trim()}” under Epic #{epicId} in Azure DevOps, assigned to the person below (by default you).</>}
      onCancel={() => setConfirming(false)} onConfirm={(email) => void create(email)}>{error && <p className="notice error">{error}</p>}</AssigneeConfirm>}
  </div>
}
