import { useState } from 'react'
import { roles, type Role } from '../access'
import type { ViewAs } from '../viewAs'
import { Modal } from './ui'

// View as (CON-89…CON-92): choose a person (their roles, their own work) or a role on its own; read-only.
export function ViewAsDialog({ current, people, onStart, onClose }: { current: ViewAs | null; people: { name: string; email?: string }[]; onStart: (viewAs: ViewAs) => void; onClose: () => void }) {
  const [kind, setKind] = useState<'person' | 'role'>(current?.kind ?? 'person')
  const [person, setPerson] = useState(current?.kind === 'person' ? current.email || current.name : '')
  const [role, setRole] = useState<Role>(current?.kind === 'role' ? current.role : 'Team Member')
  const chosen = people.find((entry) => (entry.email || entry.name) === person)
  return <Modal title="View as" eyebrow="ADMIN" onClose={onClose}>
    <p className="muted">See the app as someone else sees it — read only: nothing you do is saved to Azure DevOps or Git while View as is on. It ends when you choose Exit or reload the page.</p>
    <div className="view-as-form">
      <div className="segmented" role="radiogroup" aria-label="View as">
        <label className={kind === 'person' ? 'active' : undefined}><input type="radio" name="view-as-kind" checked={kind === 'person'} onChange={() => setKind('person')} />A person</label>
        <label className={kind === 'role' ? 'active' : undefined}><input type="radio" name="view-as-kind" checked={kind === 'role'} onChange={() => setKind('role')} />A role</label>
      </div>
      {kind === 'person' ? <label>Person<select value={person} onChange={(event) => setPerson(event.target.value)}><option value="">Choose…</option>{people.map((entry) => <option key={entry.email || entry.name} value={entry.email || entry.name}>{entry.name}{entry.email && entry.email !== entry.name ? ` · ${entry.email}` : ''}</option>)}</select></label>
        : <label>Role<select value={role} onChange={(event) => setRole(event.target.value as Role)}>{roles.map((entry) => <option key={entry}>{entry}</option>)}</select></label>}
      <small className="muted">{kind === 'person' ? 'Their menu and pages follow the roles of their work email in Settings → Access (the default role when they have none or no email is known); My dashboard, Assigned to Me and Monthly show their own work.' : 'The menu and pages of that role; My dashboard and Assigned to Me stay yours.'}</small>
    </div>
    <div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={kind === 'person' && !chosen} onClick={() => onStart(kind === 'role' ? { kind: 'role', role } : { kind: 'person', name: chosen!.name, ...(chosen!.email ? { email: chosen!.email } : {}) })}>View as</button></div>
  </Modal>
}
