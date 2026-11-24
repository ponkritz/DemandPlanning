import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

// The actions of a Release page's source bar (QV-48, UI-STANDARDS §10), compact: the main one as a small ↻ icon button
// (class primary) with its name as tooltip and aria-label (Refresh from Azure, Import newer export…), the others — Load from Git, Connection settings, Remove — in a "⋯" menu.
// The menu closes on a choice, a click outside or Escape.
// OND-61, DSH-13: the same menu for a page's actions and a chart's actions, with the menu button pattern — the first
// item focused when it opens, ↓ / ↑ / Home / End move between the items, Escape closes it and returns to ⋯; a disabled
// item keeps its reason as its tooltip.
export interface ViewAction { key: string; label: string; onClick?: () => void; disabled?: boolean; danger?: boolean; title?: string; render?: (close: () => void) => ReactNode }
export function ViewActions({ primary, items, label, className = '' }: { primary?: ReactNode; items: ViewAction[]; label: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false) }
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); button.current?.focus() } }
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', escape)
    // The first item that can be chosen takes the focus.
    menu.current?.querySelector<HTMLElement>('[role=menuitem]:not(:disabled)')?.focus()
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  const close = () => setOpen(false)
  const shown = items.filter(Boolean)
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = [...(menu.current?.querySelectorAll<HTMLElement>('[role=menuitem]:not(:disabled)') ?? [])]
    if (!list.length) return
    const at = list.indexOf(document.activeElement as HTMLElement)
    const go = (index: number) => { event.preventDefault(); list[(index + list.length) % list.length].focus() }
    if (event.key === 'ArrowDown') go(at + 1)
    else if (event.key === 'ArrowUp') go(at - 1)
    else if (event.key === 'Home') go(0)
    else if (event.key === 'End') go(list.length - 1)
    else if (event.key === 'Tab') close()
  }
  return <div className={`view-actions ${className}`.trim()} ref={box}>
    {primary}
    {shown.length > 0 && <button ref={button} type="button" className="ghost" aria-label={`More actions: ${label}`} aria-haspopup="menu" aria-expanded={open} title="More actions" onClick={() => setOpen(!open)}
      onKeyDown={(event) => { if (event.key === 'ArrowDown' && !open) { event.preventDefault(); setOpen(true) } }}>⋯</button>}
    {open && <div className="view-actions-menu" role="menu" aria-label={label} ref={menu} onKeyDown={keys}>{shown.map((item) => item.render ? <div key={item.key} role="none">{item.render(close)}</div>
      : <button key={item.key} type="button" role="menuitem" className={item.danger ? 'danger-text' : undefined} disabled={item.disabled} title={item.title} onClick={() => { close(); button.current?.focus(); item.onClick?.() }}>{item.label}</button>)}</div>}
  </div>
}
