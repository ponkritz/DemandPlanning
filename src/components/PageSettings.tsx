import { Suspense, type ReactNode } from 'react'
import { Modal } from './ui'
import { pageSettingsLabel } from '../pageSettings'

// SET-32…SET-35: a page's own settings — the ⚙ in its page actions (last, UI-STANDARDS §6) and the pop-up it opens.
// The app decides per page whether the ⚙ is shown (pageSettingsFor: a right to change at least one of its sections; in
// View as the viewed rights) and gives it to the page through PageSettingsContext (usePageSettingsGear.ts).

export function PageSettingsButton({ pageName, onOpen }: { pageName: string; onOpen: () => void }) {
  const label = pageSettingsLabel(pageName)
  return <button type="button" className="ghost pir-setup-gear page-settings-gear" aria-label={label} title={label} onClick={onOpen}><span aria-hidden="true">⚙</span></button>
}

// The pop-up (UI-STANDARDS §4): named "Settings for <page>", the focus inside, Escape and × close it, Close at the end;
// children are the Admin panels of its sections as tabs (AdminPage `only`).
export function PageSettingsDialog({ pageName, onClose, children }: { pageName: string; onClose: () => void; children: ReactNode }) {
  return <Modal title={pageSettingsLabel(pageName)} eyebrow="PAGE SETTINGS" wide onClose={onClose}>
    <p className="muted page-settings-intro">The settings that shape this page — the same as in Admin, saved the same way and shared with everyone. Only the settings your role may change are shown.</p>
    <div className="page-settings-body"><Suspense fallback={<p className="muted page-settings-loading" role="status">Loading the settings…</p>}>{children}</Suspense></div>
    <div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Close</button></div>
  </Modal>
}
