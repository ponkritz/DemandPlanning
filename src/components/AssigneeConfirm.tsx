import { useState, type ReactNode } from 'react'
import { Modal, Notice } from './ui'
import { PersonPicker } from './PersonPicker'

// Confirmation before creating work items in Azure DevOps: what is created and who it is assigned to. With the right to
// create work for others the person is chosen from everyone in the backlog (starting at `initial`, else me); without it,
// it is always the person creating it. It is never blank: Create stays disabled until there is an email.
export function AssigneeConfirm({ title, summary, people, me, initial = '', canChoose, confirmLabel, busy = false, onConfirm, onCancel, children }: {
  title: string; summary: ReactNode; people: { name: string; email: string }[]; me: string; initial?: string; canChoose: boolean
  confirmLabel: string; busy?: boolean; onConfirm: (email: string) => void; onCancel: () => void; children?: ReactNode
}) {
  const [name, setName] = useState(() => canChoose ? people.find((person) => person.email === initial.trim().toLowerCase() && person.email !== me)?.name ?? '' : '')
  const chosen = canChoose && name ? people.find((person) => person.name === name)?.email ?? '' : me
  return <Modal title={title} eyebrow="AZURE DEVOPS WRITE" onClose={() => { if (!busy) onCancel() }}>
    <div className="assignee-confirm">
      <div className="muted">{summary}</div>
      {children}
      {canChoose
        ? <label>Assigned to<PersonPicker label="Assigned to" value={name} people={people.filter((person) => person.email !== me).map((person) => person.name)} onChange={setName} meLabel={me ? `Me (${me})` : 'Choose a person…'} /></label>
        : <p><strong>Assigned to:</strong> {me || '—'} <small className="muted">(you; creating work for others needs the “Create work items for other people” right)</small></p>}
      {chosen && <small className="muted">Assigned To in Azure DevOps: {chosen}</small>}
      {!chosen && <Notice tone="warning">{me ? 'Choose who the work is assigned to.' : 'Your email is not known: set the Feature creator email on the Time Writing connection (Settings → Azure DevOps).'}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button><button type="button" className="primary" disabled={busy || !chosen} onClick={() => onConfirm(chosen)}>{busy ? 'Creating…' : confirmLabel}</button></div>
    </div>
  </Modal>
}
