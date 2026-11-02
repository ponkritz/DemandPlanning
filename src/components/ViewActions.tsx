import { useEffect, useRef, useState, type ReactNode } from 'react'

// The actions of a Release Details page (QV-48), compact: the main one as a small icon button with its name as tooltip
// (Refresh from Azure, Import newer export…), the others — Load from Git, Connection settings, Remove — in a "⋯" menu.
// The menu closes on a choice, a click outside or Escape.
export interface ViewAction { key: string; label: string; onClick?: () => void; disabled?: boolean; danger?: boolean; render?: (close: () => void) => ReactNode }
export function ViewActions({ primary, items, label }: { primary?: ReactNode; items: ViewAction[]; label: string }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  const close = () => setOpen(false)
  const shown = items.filter(Boolean)
  return <div className="view-actions" ref={box}>
    {primary}
    {shown.length > 0 && <button type="button" className="act-button" aria-label={`More actions: ${label}`} aria-haspopup="menu" aria-expanded={open} title="More actions" onClick={() => setOpen(!open)}>⋯</button>}
    {open && <div className="view-actions-menu" role="menu">{shown.map((item) => item.render ? <div key={item.key} role="none">{item.render(close)}</div>
      : <button key={item.key} type="button" role="menuitem" className={item.danger ? 'danger-text' : undefined} disabled={item.disabled} onClick={() => { close(); item.onClick?.() }}>{item.label}</button>)}</div>}
  </div>
}
