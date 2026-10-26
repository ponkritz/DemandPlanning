import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
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
export function Info({ children, label = 'Info' }: { children: ReactNode; label?: string }) {
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
    <button type="button" ref={anchor} className="info-button" aria-describedby={at ? id : undefined} aria-expanded={Boolean(at)} onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close} onClick={(event) => { event.preventDefault(); if (at) setAt(null); else open() }}>ⓘ {label}</button>
    {at && createPortal(<div id={id} role="tooltip" className="info-pop" style={{ top: at.top, left: at.left }} onMouseEnter={open} onMouseLeave={close}>{children}</div>, document.body)}
  </>
}

export function Panel({ children, className = '', eyebrow, title, detail, info, action }: { children: ReactNode; className?: string; eyebrow?: string; title?: string; detail?: ReactNode; info?: ReactNode; action?: ReactNode }) {
  return <article className={`panel ${className}`}>
    {(title || action || info) && <div className="panel-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}{title ? <h2>{title}{info && <> <Info>{info}</Info></>}</h2> : info && <Info>{info}</Info>}{detail && <p className="muted">{detail}</p>}</div>{action}</div>}
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

export function Notice({ children, tone = 'info', className = '' }: { children: ReactNode; tone?: 'info' | 'success' | 'warning' | 'error'; className?: string }) {
  return <div className={`notice ${tone === 'info' ? '' : tone} ${className}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return <div className="empty-state"><strong>{title}</strong>{detail && <p>{detail}</p>}</div>
}

// Every dialog is rendered into <body> above all page layers (sticky sidebar, top bar, cards), so nothing behind it
// can draw over it, wherever in the page the dialog is opened from.
// A pop-up window. Forms pass wide (settings editors) and form (a click beside it does not close it and lose what was
// typed; × and Cancel do).
export function Modal({ title, eyebrow, onClose, children, wide = false, form = false }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode; wide?: boolean; form?: boolean }) {
  return createPortal(<div className="modal-backdrop" role="presentation" onMouseDown={form ? undefined : onClose}><div className={wide ? 'modal modal-wide' : 'modal'} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close">×</button></div>{children}</div></div>, document.body)
}
// The saved values of a setting, shown on the page while its editor is a pop-up.
export function SettingsSummary({ rows }: { rows: [string, ReactNode][] }) {
  return <dl className="settings-summary">{rows.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value || '—'}</dd></div>)}</dl>
}
