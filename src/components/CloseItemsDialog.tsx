import { useState } from 'react'
import { closeSelection, defaultTicks, toggleTick, type CloseRow } from '../closeList'
import type { AzureWorkItem } from '../domain'
import { Modal, Notice } from './ui'

// BKL-39: the pop-up of Close Feature / Close User Story — every open item that would close, with a tick box (yours
// ticked, other people's not), its type, #ID (opens it in Azure DevOps), title, owner and state. Close shows how many
// are ticked; a month Time Writing Task among them asks first whether its hours are up to date. BKL-43: a later month's
// Time Writing Task under a Feature closed early is listed to be Removed with 0 h (ticked, whoever it belongs to).
export function CloseItemsDialog({ title, intro, rows, asked, blocked, onConfirm, onClose }: { title: string; intro: string; rows: CloseRow[]; asked?: number; blocked?: string; onConfirm: (items: ReturnType<typeof closeSelection>) => void; onClose: () => void }) {
  const [ticked, setTicked] = useState(() => defaultTicks(rows, asked))
  const [hoursDone, setHoursDone] = useState(false)
  const selection = closeSelection(rows, ticked)
  const owner = (item: AzureWorkItem) => item.assignedTo?.trim() || 'Unassigned'
  return <Modal title={title} eyebrow="AZURE DEVOPS WRITE" onClose={onClose}>
    <div className="close-items">
      <p className="muted">{intro}</p>
      <ul className="close-list" aria-label="Items to close">
        {rows.map((row) => <li key={row.item.id} style={{ paddingLeft: `${row.depth * 20}px` }} className={row.mine ? '' : 'close-other'}>
          <label className="checkbox-label"><input type="checkbox" aria-label={`Close #${row.item.id}`} checked={ticked.has(row.item.id)} onChange={(event) => setTicked(toggleTick(rows, ticked, row.item.id, event.target.checked))} />
            <span className="close-type">{row.timeWriting ? 'Time Writing story' : row.monthTask ? 'Time Writing Task' : row.item.workItemType}</span>
          </label>
          <a href={row.item.url} target="_blank" rel="noreferrer" className="close-id" title={`Open #${row.item.id} in Azure DevOps`}>#{row.item.id}</a>
          <span className="close-title">{row.item.title}</span>
          <small className="muted">{row.mine ? 'yours' : owner(row.item)} · {row.remove ? `${row.item.state} → Removed, 0 h (later month)` : row.item.state}</small>
        </li>)}
      </ul>
      {rows.some((row) => row.remove) && <p className="muted">The Feature closes before these months: their Time Writing Tasks (everyone’s, without Completed Work) are set to 0 h Original Estimate and Removed.</p>}
      {rows.some((row) => !row.mine && !row.remove) && <p className="muted">Other people’s items are not ticked: tick them only if you mean to close them. A parent closes only with everything open below it.</p>}
      {selection.needsHours && <label className="checkbox-label close-hours"><input type="checkbox" checked={hoursDone} onChange={(event) => setHoursDone(event.target.checked)} />I have updated the hours (Original Estimate and Completed Work) of the Time Writing Tasks being closed — they become read-only.</label>}
      {!selection.items.length && !selection.removals.length && <Notice tone="info">Tick what to close.</Notice>}
      {blocked && <Notice tone="warning">{blocked}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="primary" disabled={Boolean(blocked) || (!selection.items.length && !selection.removals.length) || (selection.needsHours && !hoursDone)} onClick={() => onConfirm(selection)}>{`Close ${selection.items.length} item${selection.items.length === 1 ? '' : 's'}${selection.removals.length ? `, remove ${selection.removals.length}` : ''}`}</button></div>
    </div>
  </Modal>
}
