import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { menuPlace } from '../menuPlace'

// The actions of a Release page's source bar (QV-48, UI-STANDARDS §10), compact: the main one as a small ↻ icon button
// (class primary) with its name as tooltip and aria-label (Refresh from Azure, Import newer export…), the others — Load from Git, Connection settings, Remove — in a "⋯" menu.
// The menu closes on a choice, a click outside or Escape.
// OND-61, DSH-13: the same menu for a page's actions and a chart's actions, with the menu button pattern — the first
// item focused when it opens, ↓ / ↑ / Home / End move between the items, Escape closes it and returns to ⋯; a disabled
// item keeps its reason as its tooltip.
// KB-88: the open menu is drawn in a layer of its own on top of the page (a portal to <body>, position: fixed), under
// its ⋯ — flipped above it near the bottom of the window and kept inside the window at the sides — so a card, a chart
// panel or the grid around it (overflow: hidden, a stacking context of its own) never clips or covers it. It follows ⋯
// when the page scrolls or the window is resized.
export interface ViewAction { key: string; label: string; onClick?: () => void; disabled?: boolean; danger?: boolean; title?: string; render?: (close: () => void) => ReactNode }
export function ViewActions({ primary, items, label, className = '' }: { primary?: ReactNode; items: ViewAction[]; label: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<CSSProperties | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!open) return
    const measure = () => {
      const anchor = button.current?.getBoundingClientRect(), list = menu.current
      if (!anchor || !list) return
      const at = menuPlace(anchor, { width: list.offsetWidth, height: list.scrollHeight }, { width: window.innerWidth, height: window.innerHeight })
      setPlace({ top: at.top, left: at.left, maxHeight: at.maxHeight })
    }
    measure()
    window.addEventListener('scroll', measure, true); window.addEventListener('resize', measure)
    return () => { window.removeEventListener('scroll', measure, true); window.removeEventListener('resize', measure) }
  }, [open])
  useEffect(() => {
    if (!open) return
    const outside = (event: MouseEvent) => { const target = event.target as Node; if (!box.current?.contains(target) && !menu.current?.contains(target)) setOpen(false) }
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); button.current?.focus() } }
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', escape)
    // The first item that can be chosen takes the focus.
    menu.current?.querySelector<HTMLElement>('[role=menuitem]:not(:disabled)')?.focus({ preventScroll: true })
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  const close = () => setOpen(false)
  const shown = items.filter(Boolean)
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = [...(menu.current?.querySelectorAll<HTMLElement>('[role=menuitem]:not(:disabled)') ?? [])]
    if (event.key === 'Tab') { event.preventDefault(); close(); button.current?.focus(); return }
    if (!list.length) return
    const at = list.indexOf(document.activeElement as HTMLElement)
    const go = (index: number) => { event.preventDefault(); list[(index + list.length) % list.length].focus() }
    if (event.key === 'ArrowDown') go(at + 1)
    else if (event.key === 'ArrowUp') go(at - 1)
    else if (event.key === 'Home') go(0)
    else if (event.key === 'End') go(list.length - 1)
  }
  return <div className={`view-actions ${className}`.trim()} ref={box}>
    {primary}
    {shown.length > 0 && <button ref={button} type="button" className="ghost" aria-label={`More actions: ${label}`} aria-haspopup="menu" aria-expanded={open} title="More actions" onClick={() => setOpen(!open)}
      onKeyDown={(event) => { if (event.key === 'ArrowDown' && !open) { event.preventDefault(); setOpen(true) } }}>⋯</button>}
    {open && createPortal(<div className="view-actions-menu view-actions-floating" role="menu" aria-label={label} ref={menu} onKeyDown={keys} style={place ?? { top: 0, left: 0, opacity: 0 }}>{shown.map((item) => item.render ? <div key={item.key} role="none">{item.render(close)}</div>
      : <button key={item.key} type="button" role="menuitem" className={item.danger ? 'danger-text' : undefined} disabled={item.disabled} title={item.title} onClick={() => { close(); button.current?.focus(); item.onClick?.() }}>{item.label}</button>)}</div>, document.body)}
  </div>
}
