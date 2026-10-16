import { useMemo, useState, type ReactNode } from 'react'
import type { AzureWorkItem } from '../domain'
import type { WorkItemNode } from '../azureHierarchy'
import { backlogColumns, defaultBacklogColumns, normalizeBacklogColumns, plainAzureText, visibleBacklogRows, type BacklogColumn, type BacklogRow } from '../backlogView'
import { Modal } from './ui'

export function BacklogTable({ tree, expanded, expandAll, searching, scope, onToggle, onExpand, onNewFeature, onComplete }: { tree: WorkItemNode[]; expanded: Set<string>; expandAll: boolean; searching: boolean; scope: string; onToggle: (key: string) => void; onExpand: (value: boolean) => void; onNewFeature: (item: AzureWorkItem) => void; onComplete: (item: AzureWorkItem) => void }) {
  const preferenceKey = `demand-planning-backlog-columns:${scope.toLowerCase()}`
  const [columns, setColumns] = useState<BacklogColumn[]>(() => { try { const saved = localStorage.getItem(preferenceKey); return saved ? normalizeBacklogColumns(JSON.parse(saved)) : [...defaultBacklogColumns] } catch { return [...defaultBacklogColumns] } })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<BacklogColumn[]>([])
  const [notice, setNotice] = useState('')
  const [level, setLevel] = useState('Epic')
  const [page, setPage] = useState(0)
  const rows = useMemo(() => visibleBacklogRows(tree, expanded, expandAll, searching, level), [tree, expanded, expandAll, searching, level])
  const pageSize = 200
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / pageSize) - 1))
  const shown = rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  function move(id: BacklogColumn, offset: number) {
    setDraft((current) => { const next = [...current], index = next.indexOf(id), target = index + offset; if (index >= 0 && target >= 0 && target < next.length) [next[index], next[target]] = [next[target], next[index]]; return next })
  }
  function apply() {
    const next = normalizeBacklogColumns(draft)
    setColumns(next); setEditing(false)
    try { localStorage.setItem(preferenceKey, JSON.stringify(next)); setNotice('Column preferences saved in this browser.') } catch { setNotice('Columns updated for this session; browser storage is unavailable.') }
  }
  function cell(id: BacklogColumn, row: BacklogRow): ReactNode {
    const { node, depth, order, open } = row, item = node.item
    switch (id) {
      case 'order': return order || ''
      case 'id': return <a href={item.url} target="_blank" rel="noreferrer">{item.id}</a>
      case 'type': return item.workItemType
      case 'title': return <div className="backlog-title" style={{ paddingLeft: Math.min(depth, 20) * 20 }}>
        {node.children.length ? <button type="button" className="tree-toggle" aria-label={`${open ? 'Collapse' : 'Expand'} ${item.workItemType} ${item.id}`} aria-expanded={open} disabled={searching} onClick={() => onToggle(item.key)}>{open ? '⌄' : '›'}</button> : <span className="tree-toggle" />}
        <span className={`backlog-type-icon backlog-type-${item.workItemType.toLowerCase().replaceAll(' ', '-')}`} aria-hidden="true">{item.workItemType === 'Epic' ? '♛' : item.workItemType === 'Feature' ? '♜' : item.workItemType === 'Task' ? '☑' : '▣'}</span>
        <a href={item.url} target="_blank" rel="noreferrer" title={item.title}>{item.title}</a>
        {node.context && <span className="backlog-context" title="Parent retained to show the hierarchy, outside the selected state or search">Context</span>}
        {node.parentMissing && <span className="backlog-context" title={`Parent #${item.parentId} is not in the displayed source`}>Parent outside view</span>}
      </div>
      case 'description': { const text = plainAzureText(item.description || ''); return <span className="backlog-description" title={text}>{text}</span> }
      case 'state': return <span className="backlog-state"><i className={`state-dot state-${item.state.toLowerCase().replaceAll(' ', '-')}`} />{item.state}</span>
      case 'storyPoints': return item.storyPoints ?? '—'
      case 'assignedTo': return item.assignedTo || 'Unassigned'
      case 'iterationPath': return item.iterationPath
      case 'areaPath': return item.areaPath
      case 'targetDate': return item.targetDate?.slice(0, 10) || '—'
      case 'closedDate': return item.closedDate?.slice(0, 10) || '—'
      case 'tags': return item.tags
      case 'actions': return item.workItemType === 'Epic' ? <button className="backlog-action" onClick={() => onNewFeature(item)}>＋ Feature</button> : item.workItemType === 'Feature' ? <button className="backlog-action" onClick={() => onComplete(item)}>Complete children</button> : ''
    }
  }
  return <>
    <div className="backlog-toolbar"><div className="backlog-tab">Backlog</div><div className="backlog-toolbar-actions"><label className="backlog-level">Backlog level<select value={level} onChange={(event) => { setLevel(event.target.value); setPage(0) }}><option value="Epic">Epics</option><option value="Feature">Features</option><option value="User Story">User Stories</option><option value="Task">Tasks</option></select></label><button className="ghost" onClick={() => { setDraft([...columns]); setEditing(true) }}>⚙ Column Options</button></div></div>
    {notice && <p className="muted backlog-preference-status" role="status">{notice}</p>}
    <div className="backlog-table-scroll"><table className="backlog-table" style={{ width: 66 + columns.reduce((sum, id) => sum + backlogColumns.find((column) => column.id === id)!.width, 0) }} aria-label="Backlogs hierarchy"><colgroup><col style={{ width: 66 }} />{columns.map((id) => <col key={id} style={{ width: backlogColumns.find((column) => column.id === id)!.width }} />)}</colgroup><thead><tr><th className="backlog-expand-controls"><button aria-label="Expand all backlog items" title="Expand all" onClick={() => onExpand(true)}>＋</button><button aria-label="Collapse all backlog items" title="Collapse all" onClick={() => onExpand(false)}>−</button></th>{columns.map((id) => <th key={id} scope="col">{backlogColumns.find((column) => column.id === id)!.label}</th>)}</tr></thead><tbody>{shown.map((row) => <tr key={row.node.item.key} className={row.node.context ? 'backlog-parent-context' : ''}><td className="backlog-row-marker" />{columns.map((id) => <td className={`backlog-cell-${id}`} key={id}>{cell(id, row)}</td>)}</tr>)}</tbody></table>{!rows.length && <p className="empty-state backlog-empty">No work items match this level and the selected filters.</p>}</div>
    <div className="backlog-footer"><span>{rows.length ? `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, rows.length)} of ${rows.length} expanded rows` : '0 rows'} · Removed items excluded</span>{rows.length > pageSize && <div className="button-row"><button className="ghost" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Previous</button><button className="ghost" disabled={(currentPage + 1) * pageSize >= rows.length} onClick={() => setPage(currentPage + 1)}>Next</button></div>}</div>
    {editing && <Modal title="Column Options" eyebrow="BACKLOG PREFERENCES" onClose={() => setEditing(false)}><p className="muted">Choose and reorder columns. Title stays visible so you can expand the hierarchy. Preferences apply only to this browser, not Azure DevOps.</p><div className="backlog-column-options">{[...draft, ...backlogColumns.map((column) => column.id).filter((id) => !draft.includes(id))].map((id) => <div className="backlog-column-choice" key={id}><label className="checkbox-label"><input type="checkbox" checked={draft.includes(id)} disabled={id === 'title'} onChange={(event) => setDraft((current) => event.target.checked ? [...current, id] : current.filter((value) => value !== id))} />{backlogColumns.find((column) => column.id === id)!.label}{id === 'title' ? ' (required)' : ''}</label><div className="button-row"><button className="ghost" aria-label={`Move ${id} column up`} disabled={!draft.includes(id) || draft.indexOf(id) === 0} onClick={() => move(id, -1)}>↑</button><button className="ghost" aria-label={`Move ${id} column down`} disabled={!draft.includes(id) || draft.indexOf(id) === draft.length - 1} onClick={() => move(id, 1)}>↓</button></div></div>)}</div><div className="modal-actions"><button className="ghost" onClick={() => setDraft([...defaultBacklogColumns])}>Reset defaults</button><button className="ghost" onClick={() => setEditing(false)}>Cancel</button><button className="primary" onClick={apply}>Apply</button></div></Modal>}
  </>
}
