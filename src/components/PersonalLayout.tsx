import { useState, type ReactNode } from 'react'
import { arrangeSections, moveSection, type MenuLayout } from '../personalViews'
import type { PersonalViewsStore } from '../usePersonalViews'
import { Modal, Notice } from './ui'

export interface LayoutSection { id: string; label: string; node: ReactNode }

// A page's sections in the person's own order, shown or hidden (MYD-06): "Customize" opens the list with
// ✓ to show, ↑ ↓ to move, "Reset to default", and for admins "Use as default for everyone".
export function CustomizableSections({ page, sections, views, canSetDefault }: { page: string; sections: LayoutSection[]; views: PersonalViewsStore; canSetDefault: boolean }) {
  const [editing, setEditing] = useState(false)
  const [status, setStatus] = useState('')
  const layout = arrangeSections(sections.map((section) => section.id), views.sections(page))
  const byId = new Map(sections.map((section) => [section.id, section]))
  const save = (order: string[], hidden: string[]) => views.setSections(page, { order, hidden })
  const toggle = (id: string) => save(layout.order, layout.hidden.includes(id) ? layout.hidden.filter((entry) => entry !== id) : [...layout.hidden, id])
  return <>
    <div className="layout-bar">
      {layout.hidden.length > 0 && <small className="muted">{layout.hidden.length} section{layout.hidden.length === 1 ? '' : 's'} hidden</small>}
      <button type="button" className="text-button" aria-expanded={editing} onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Customize'}</button>
    </div>
    {editing && <div className="layout-editor" role="group" aria-label="Sections of this page">
      <ol>{layout.order.map((id, index) => <li key={id}>
        <label className="checkbox-label"><input type="checkbox" checked={!layout.hidden.includes(id)} onChange={() => toggle(id)} />{byId.get(id)?.label ?? id}</label>
        <span className="button-row nowrap"><button type="button" className="ghost" aria-label={`Move ${byId.get(id)?.label ?? id} up`} disabled={index === 0} onClick={() => save(moveSection(layout.order, id, -1), layout.hidden)}>↑</button><button type="button" className="ghost" aria-label={`Move ${byId.get(id)?.label ?? id} down`} disabled={index === layout.order.length - 1} onClick={() => save(moveSection(layout.order, id, 1), layout.hidden)}>↓</button></span>
      </li>)}</ol>
      <div className="button-row">
        <button type="button" className="ghost" onClick={() => views.resetSections(page)}>Reset to default</button>
        {canSetDefault && <button type="button" className="ghost" onClick={() => { setStatus('Saving…'); views.saveAsDefault().then(() => setStatus('Saved as the default for everyone.'), (failure: unknown) => setStatus(`Not saved: ${failure instanceof Error ? failure.message : String(failure)}`)) }}>Use as default for everyone</button>}
      </div>
      <small className="muted">{views.inGit ? 'Kept in Git for you, on every computer.' : 'Kept in this browser (connect Git storage and set your work email to keep it everywhere).'}</small>
      {status && <Notice tone={status.startsWith('Not saved') ? 'warning' : 'info'}>{status}</Notice>}
    </div>}
    {views.note && <Notice tone="warning">{views.note}</Notice>}
    {layout.shown.map((id) => <div key={id} className="layout-section" data-section={id}>{byId.get(id)!.node}</div>)}
    {!layout.shown.length && <p className="muted">All sections are hidden. Use Customize to show them again.</p>}
  </>
}

// Menu pins and hidden pages (MYD-07): pages listed by menu group, each with Pinned and In menu boxes; pinned pages appear first in the menu, hidden ones leave it (they still open
// from links). Only the pages this person's roles allow are listed.
export function MenuCustomizer({ pages, menu, onChange, onClose }: { pages: { id: string; label: string; group: string }[]; menu: MenuLayout; onChange: (menu: MenuLayout) => void; onClose: () => void }) {
  const flip = (list: string[], id: string) => list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id]
  const groups = [...new Set(pages.map((page) => page.group))]
  return <Modal title="Customize menu" eyebrow="YOUR VIEWS" onClose={onClose}>
    <p className="muted">Pin the pages you use most to the top of the menu, and hide the ones you never use.</p>
    <div className="menu-customizer"><table><thead><tr><th>Page</th><th>Pinned</th><th>In menu</th></tr></thead>
      {groups.map((group) => <tbody key={group}><tr className="menu-group"><th colSpan={3} scope="colgroup">{group}</th></tr>
        {pages.filter((page) => page.group === group).map((page) => <tr key={page.id} className={menu.hidden.includes(page.id) ? 'menu-hidden' : undefined}>
          <td>{page.label}</td>
          <td><input type="checkbox" aria-label={`Pin ${page.label}`} checked={menu.pinned.includes(page.id)} onChange={() => onChange({ pinned: flip(menu.pinned, page.id), hidden: menu.hidden.filter((entry) => entry !== page.id) })} /></td>
          <td><input type="checkbox" aria-label={`Show ${page.label} in the menu`} checked={!menu.hidden.includes(page.id)} onChange={() => onChange({ pinned: menu.pinned.filter((entry) => entry !== page.id), hidden: flip(menu.hidden, page.id) })} /></td></tr>)}
      </tbody>)}
    </table></div>
    <div className="modal-actions"><button type="button" className="ghost" onClick={() => onChange({ pinned: [], hidden: [] })}>Reset menu</button><button type="button" className="primary" onClick={onClose}>Done</button></div>
  </Modal>
}
