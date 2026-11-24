import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type Tone = 'neutral' | 'open' | 'locked' | 'warning' | 'danger' | 'info'

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`pill pill-${tone}`}>{children}</span>
}

// Every page renders inside Page: the header lives in the top bar, so a page starts with its toolbar (intro + actions) and then its panels.
export function Page({ children, className = '', intro, actions }: { children: ReactNode; className?: string; intro?: ReactNode; actions?: ReactNode }) {
  return <section className={`content ${className}`}>
    {(intro || actions) && <div className="page-toolbar">{intro ? <p className="muted">{intro}</p> : <span />}{actions && <div className="button-row">{actions}</div>}</div>}
    {children}
  </section>
}

// "ⓘ Info": explanations and rules of a view, shown on hover or keyboard focus (and on tap) instead of on the page.
// Rendered in a portal so a scrolling table panel cannot clip it; it stays open while the pointer is on it, so links work.
// iconOnly: just ⓘ, the label as its accessible name (UI-STANDARDS §6), e.g. next to a table heading.
export function Info({ children, label = 'Info', iconOnly = false }: { children: ReactNode; label?: string; iconOnly?: boolean }) {
  const id = useId()
  const anchor = useRef<HTMLButtonElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const [at, setAt] = useState<{ top: number; left: number } | null>(null)
  const open = () => { window.clearTimeout(timer.current); const box = anchor.current?.getBoundingClientRect(); if (box) setAt({ top: box.bottom + 6, left: Math.max(8, Math.min(box.left, window.innerWidth - 428)) }) }
  const close = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setAt(null), 150) }
  useEffect(() => {
    if (!at) return
    const hide = () => setAt(null)
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') hide() }
    window.addEventListener('scroll', hide, true); window.addEventListener('keydown', key)
    return () => { window.removeEventListener('scroll', hide, true); window.removeEventListener('keydown', key) }
  }, [at])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return <>
    <button type="button" ref={anchor} className="info-button" aria-label={iconOnly ? label : undefined} aria-describedby={at ? id : undefined} aria-expanded={Boolean(at)} onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close} onClick={(event) => { event.preventDefault(); if (at) setAt(null); else open() }}>{iconOnly ? 'ⓘ' : `ⓘ ${label}`}</button>
    {at && createPortal(<div id={id} role="tooltip" className="info-pop" style={{ top: at.top, left: at.left }} onMouseEnter={open} onMouseLeave={close}>{children}</div>, document.body)}
  </>
}

// titleHidden (CHT-26, a chart's Chart heading element off): the title is read by screen readers but not shown.
export function Panel({ children, className = '', eyebrow, title, detail, info, action, titleHidden = false, style }: { children: ReactNode; className?: string; eyebrow?: string; title?: string; detail?: ReactNode; info?: ReactNode; action?: ReactNode; titleHidden?: boolean; style?: CSSProperties }) {
  return <article className={`panel ${className}`} style={style}>
    {(title || action || info) && <div className="panel-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}{title ? <h2>{titleHidden ? <span className="chart-title-hidden">{title}</span> : title}{info && <> <Info>{info}</Info></>}</h2> : info && <Info>{info}</Info>}{detail && <p className="muted">{detail}</p>}</div>{action}</div>}
    {children}
  </article>
}

// A table inside a panel: optional heading, record count, search box and empty state so every list looks the same.
export function TablePanel({ children, className = '', eyebrow, title, detail, info, count, action, empty }: { children: ReactNode; className?: string; eyebrow?: string; title?: string; detail?: ReactNode; info?: ReactNode; count?: string; action?: ReactNode; empty?: string }) {
  return <Panel className={`table-panel ${className}`} eyebrow={eyebrow} title={title} detail={detail} info={info} action={(count || action) && <div className="button-row">{count && <span className="record-count">{count}</span>}{action}</div>}>
    {children}
    {empty && <EmptyState title={empty} />}
  </Panel>
}

export function Metrics({ children, compact = true }: { children: ReactNode; compact?: boolean }) {
  return <div className={`metric-grid ${compact ? 'compact' : ''}`}>{children}</div>
}

export function Metric({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'positive' | 'negative' }) {
  return <article><span>{label}</span><strong className={tone ?? ''}>{value}</strong>{hint && <small>{hint}</small>}</article>
}

// CON-102, UI-STANDARDS §3: the visible line next to (or above) buttons disabled because the viewer lacks a permission
// — one line for a toolbar or a table of row buttons; nothing when reason is empty.
export function WriteBlocked({ reason }: { reason: string }) {
  return reason ? <small className="muted write-blocked" role="note">{reason}</small> : null
}

export function Notice({ children, tone = 'info', className = '' }: { children: ReactNode; tone?: 'info' | 'success' | 'warning' | 'error'; className?: string }) {
  return <div className={`notice ${tone === 'info' ? '' : tone} ${className}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>
}

// GIT-17: the save queue of a shared Git file, shown where the save happens: how many saves are waiting, or the changes
// kept after a failed save, with Retry. Nothing when the queue is empty.
export function SaveQueueStatus({ state, onRetry }: { state: { waiting: number; failed: number }; onRetry: () => void }) {
  if (state.failed) return <Notice tone="warning">Not saved to Git: {state.failed} change{state.failed === 1 ? '' : 's'} kept in the queue. <button type="button" className="ghost" onClick={onRetry}>Retry</button></Notice>
  return state.waiting > 1 ? <p className="muted" role="status">Waiting to save ({state.waiting} in queue).</p> : null
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return <div className="empty-state"><strong>{title}</strong>{detail && <p>{detail}</p>}</div>
}

// Every dialog is rendered into <body> above all page layers (sticky sidebar, top bar, cards), so nothing behind it
// can draw over it, wherever in the page the dialog is opened from.
// A pop-up window. Forms pass wide (settings editors). A click beside a pop-up does not close it, so what was typed is
// not lost (UI-19); pop-ups without input pass form={false} to close on that click too. × and Cancel close it.
// Keyboard (UI-18): the first field (else the pop-up) takes the focus, Tab and Shift+Tab stay inside, Escape closes the
// topmost pop-up as × does (not while a list inside it is open), and on close the focus goes back to what opened it.
const openDialogs: object[] = []
const focusable = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
const fieldSelector = 'input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([role="combobox"]),select:not([disabled]),textarea:not([disabled])'
export function Modal({ title, eyebrow, onClose, children, wide = false, form = true }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode; wide?: boolean; form?: boolean }) {
  const dialog = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })
  useEffect(() => {
    const me = {}
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    openDialogs.push(me)
    const box = dialog.current
    if (box && !box.contains(document.activeElement)) {
      const body = box.querySelector('.modal-heading')?.nextElementSibling ?? box
      const first = body.querySelector<HTMLElement>('[autofocus]') ?? body.querySelector<HTMLElement>(fieldSelector)
      ;(first ?? box).focus()
    }
    const key = (event: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== me || !box) return
      const target = event.target instanceof HTMLElement ? event.target : null
      if (event.key === 'Escape') {
        // A list open inside the pop-up (person picker, search select, multi-select) closes first.
        if (event.defaultPrevented || target?.getAttribute('aria-expanded') === 'true' || target?.closest('.multi-select, .person-picker')?.querySelector('[aria-expanded="true"]')) return
        event.preventDefault(); close.current()
      } else if (event.key === 'Tab') {
        const items = [...box.querySelectorAll<HTMLElement>(focusable)].filter((item) => item.offsetParent !== null || item === document.activeElement)
        if (!items.length) { event.preventDefault(); box.focus(); return }
        const at = items.indexOf(document.activeElement as HTMLElement)
        if (event.shiftKey && at <= 0) { event.preventDefault(); items[items.length - 1].focus() }
        else if (!event.shiftKey && (at === -1 || at === items.length - 1)) { event.preventDefault(); items[0].focus() }
      }
    }
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('keydown', key)
      openDialogs.splice(openDialogs.indexOf(me), 1)
      if (opener?.isConnected && (!document.activeElement || document.activeElement === document.body || box?.contains(document.activeElement) || !document.activeElement.isConnected)) opener.focus()
    }
  }, [])
  return createPortal(<div className="modal-backdrop" role="presentation" onMouseDown={form ? undefined : onClose}><div ref={dialog} tabIndex={-1} className={wide ? 'modal modal-wide' : 'modal'} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close">×</button></div>{children}</div></div>, document.body)
}
// OND-27: a drawer — one record beside the page it belongs to, sliding in from the right (about 520 px; the full width
// on a phone). Rendered into <body> like a pop-up and sharing its keyboard rules (UI-18): the focus moves into it (the
// first field, else the drawer), Tab and Shift+Tab stay inside, Escape closes the topmost drawer or pop-up, and on close
// the focus goes back to what opened it (or to restoreFocus()). A click on the overlay beside it closes it as × does —
// onClose decides whether to ask first (unsaved edits). Header: eyebrow, title (the dialog's accessible name), optional
// actions (‹ ›) and ×; the body scrolls; the footer (the actions) stays at the bottom.
export function Drawer({ title, eyebrow, onClose, children, footer, headerActions, restoreFocus, className = '' }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; headerActions?: ReactNode; restoreFocus?: () => HTMLElement | null | undefined; className?: string }) {
  const panel = useRef<HTMLElement>(null)
  const titleId = useId()
  const close = useRef(onClose)
  const restore = useRef(restoreFocus)
  useEffect(() => { close.current = onClose; restore.current = restoreFocus })
  useEffect(() => {
    const me = {}
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    openDialogs.push(me)
    const box = panel.current
    if (box && !box.contains(document.activeElement)) (box.querySelector<HTMLElement>('.drawer-body [autofocus]') ?? box).focus()
    const key = (event: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== me || !box) return
      const target = event.target instanceof HTMLElement ? event.target : null
      if (event.key === 'Escape') {
        if (event.defaultPrevented || target?.getAttribute('aria-expanded') === 'true') return
        event.preventDefault(); close.current()
      } else if (event.key === 'Tab') {
        const items = [...box.querySelectorAll<HTMLElement>(focusable)].filter((item) => item.offsetParent !== null || item === document.activeElement)
        if (!items.length) { event.preventDefault(); box.focus(); return }
        const at = items.indexOf(document.activeElement as HTMLElement)
        if (event.shiftKey && at <= 0) { event.preventDefault(); items[items.length - 1].focus() }
        else if (!event.shiftKey && (at === -1 || at === items.length - 1)) { event.preventDefault(); items[0].focus() }
      }
    }
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('keydown', key)
      openDialogs.splice(openDialogs.indexOf(me), 1)
      const back = restore.current?.() ?? opener
      if (back?.isConnected && (!document.activeElement || document.activeElement === document.body || box?.contains(document.activeElement) || !document.activeElement.isConnected)) back.focus()
    }
  }, [])
  return createPortal(<div className="drawer-backdrop" role="presentation" onMouseDown={() => close.current()}>
    <aside ref={panel} tabIndex={-1} className={`drawer ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()}>
      <div className="drawer-heading">
        <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2 id={titleId}>{title}</h2></div>
        <div className="drawer-heading-actions">{headerActions}<button type="button" className="icon-button" onClick={() => close.current()} aria-label="Close">×</button></div>
      </div>
      <div className="drawer-body">{children}</div>
      {footer && <div className="drawer-footer">{footer}</div>}
    </aside>
  </div>, document.body)
}
// The saved values of a setting, shown on the page while its editor is a pop-up.
export function SettingsSummary({ rows }: { rows: [string, ReactNode][] }) {
  return <dl className="settings-summary">{rows.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value || '—'}</dd></div>)}</dl>
}
