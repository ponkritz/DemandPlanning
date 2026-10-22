import type { ReactNode } from 'react'
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

export function Panel({ children, className = '', eyebrow, title, detail, action }: { children: ReactNode; className?: string; eyebrow?: string; title?: string; detail?: ReactNode; action?: ReactNode }) {
  return <article className={`panel ${className}`}>
    {(title || action) && <div className="panel-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}{title && <h2>{title}</h2>}{detail && <p className="muted">{detail}</p>}</div>{action}</div>}
    {children}
  </article>
}

// A table inside a panel: optional heading, record count, search box and empty state so every list looks the same.
export function TablePanel({ children, className = '', eyebrow, title, detail, count, action, empty }: { children: ReactNode; className?: string; eyebrow?: string; title?: string; detail?: ReactNode; count?: string; action?: ReactNode; empty?: string }) {
  return <Panel className={`table-panel ${className}`} eyebrow={eyebrow} title={title} detail={detail} action={(count || action) && <div className="button-row">{count && <span className="record-count">{count}</span>}{action}</div>}>
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
export function Modal({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode }) {
  return createPortal(<div className="modal-backdrop" role="presentation" onMouseDown={onClose}><div className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close">×</button></div>{children}</div></div>, document.body)
}
