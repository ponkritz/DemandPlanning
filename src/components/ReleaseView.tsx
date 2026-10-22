import { useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { releaseFeatureTitle, releaseRegister, tracksRelease, type ReleaseEntry } from '../releaseSource'
import { createAzureFeature } from '../azureDevOps'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { formatDate, formatHours } from '../format'
import { QueryView } from './QueryView'
import { EmptyState, Pill, TablePanel } from './ui'
import type { QueryColumn, QueryOrder } from '../queryView'
import { useColumnWidths } from './columnWidths'
import { AssigneeConfirm } from './AssigneeConfirm'
import { assignablePeople } from '../myWork'

// Release source view, one page: the releases found in the documents' paths (see releasePath: release from the
// Iteration Path with the name from the Area Path, else "…\Name\Release x.y.z" in the Area Path) as a flat list — no grouping by stream — and below it the documents with the query's columns.
export function ReleaseView({ name, items, backlog, columns, orderBy, unresolved, azure, assign }: { name: string; items: AzureWorkItem[]; backlog: AzureWorkItem[]; columns?: QueryColumn[]; orderBy?: QueryOrder[]; unresolved?: string[]; azure?: AzureWorkspace; assign?: { me: string; canChoose: boolean } }) {
  const [open, setOpen] = useState('')
  const register = releaseRegister(items, backlog)
  const widths = useColumnWidths(`releases:${name}`)
  const headings = ['Name', 'Release', 'Approved', 'Documents', 'Time Writing Feature', 'Planned (h)', 'Booked (h)']
  return <>
    <TablePanel title="Releases" detail="Release from the segment “Release x.y.z” of each document's Iteration Path, with the name from its Area Path (last segment); without a release in the Iteration Path, both from the Area Path (“…\Name\Release x.y.z”). Time Writing Feature = the QMS-0025 Feature whose title names both, in any order (extra words allowed), with the exact version, e.g. “Art-A, Dose Planning, v.1.1.0.1”. Planned and booked = Original Estimate and Completed Work, all months, on its Time Writing Tasks." count={`${register.length} releases`}>
      {register.length ? <table className="release-register resizable"><thead><tr>{headings.map((heading) => <th key={heading} style={widths.style(heading)}>{heading}{widths.handle(heading)}</th>)}</tr></thead><tbody>
        {register.flatMap((release) => [
          <tr key={release.key}>
            <td><button type="button" className="text-button" aria-expanded={open === release.key} onClick={() => setOpen(open === release.key ? '' : release.key)}>{open === release.key ? '▾' : '▸'} {release.name}</button></td>
            <td>{release.release}</td><td>{release.approvalDate ? formatDate(release.approvalDate) : '—'}</td><td>{release.documents}</td>
            <td>{release.features.length ? release.features.map((feature) => <a key={feature.id} className="feature-link" href={feature.url} target="_blank" rel="noreferrer">#{feature.id} {feature.title}</a>) : release.tracked ? <Pill tone="info">Named by {release.trackedBy.length} item{release.trackedBy.length === 1 ? '' : 's'}, no Feature</Pill> : <><Pill tone="warning">Not tracked</Pill>{azure && <button type="button" className="text-button" onClick={() => setOpen(`${release.key}/create`)}>＋ Create Feature</button>}</>}</td>
            <td>{release.hourTasks ? formatHours(release.planned) : '—'}</td>
            <td>{release.hourTasks ? <>{formatHours(release.booked)}{release.planned > 0 && release.booked > release.planned && <small className="negative">+{formatHours(release.booked - release.planned)} over plan</small>}</> : '—'}<small>{release.hourTasks ? `${release.hourTasks} task${release.hourTasks === 1 ? '' : 's'}` : ''}</small></td>
          </tr>,
          ...(open === `${release.key}/create` && azure ? [<tr key={`${release.key}/create`} className="release-docs"><td colSpan={7}><CreateReleaseFeature assign={assign} stream={name} release={release} azure={azure} onDone={() => setOpen('')} /></td></tr>] : []),
          ...(open === release.key ? [<tr key={`${release.key}/docs`} className="release-docs"><td colSpan={7}><ul>{release.items.map((item) => <li key={item.key}><a href={item.url} target="_blank" rel="noreferrer">#{item.id} {item.title}</a><small> · {item.state}{item.approvalDate ? ` · approved ${formatDate(item.approvalDate)}` : ''}</small></li>)}</ul></td></tr>] : []),
        ])}
      </tbody></table> : <EmptyState title="No releases found in the documents' paths." detail="A release is read from a path segment “Release x.y.z”, with the name in the segment above it." />}
    </TablePanel>
    <QueryView name={name} items={items} columns={columns} orderBy={orderBy} unresolved={unresolved} />
  </>
}

// Creates the QMS-0025 Feature for a release. The title is pre-filled as "<Stream> | <Name> | v<release>" and can be
// edited; it must still name the release (tracksRelease) so the release maps back to it. Parent: the Epic named like the stream (DP, CP, IOCC, …) unless another is chosen; assigned to the Time
// Writing connection's creator email. Azure DevOps validates the Feature before it is saved.
// The new Feature is assigned to the person chosen in the confirmation: by default the person creating it.
function CreateReleaseFeature({ stream, release, azure, onDone, assign }: { stream: string; release: ReleaseEntry; azure: AzureWorkspace; onDone: () => void; assign?: { me: string; canChoose: boolean } }) {
  const [confirming, setConfirming] = useState(false)
  const me = (assign?.me || azure.creatorEmail).trim().toLowerCase()
  const epics = azure.items.filter((item) => item.workItemType === 'Epic' && item.state.trim().toLowerCase() !== 'removed').sort((a, b) => a.title.localeCompare(b.title))
  const word = new RegExp(`(^|[^a-z0-9])${stream.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`)
  const suggested = epics.find((epic) => epic.title.trim().toLowerCase() === stream.trim().toLowerCase()) ?? epics.find((epic) => word.test(epic.title.toLowerCase()))
  const [epicId, setEpicId] = useState(suggested?.id ?? 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [title, setTitle] = useState(() => releaseFeatureTitle(stream, release.name, release.release))
  const mapsBack = tracksRelease(title, release.name, release.release)
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
    <small className={mapsBack ? 'muted' : 'negative'}>{mapsBack ? `Maps back to ${release.name} ${release.release}: the title names the release and its version.` : `This title does not name “${release.name}” and version ${release.release}; the release would not map to the Feature. Keep both in the title.`}</small>
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
