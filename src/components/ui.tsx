import type { ReactNode } from 'react'

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'open' | 'locked' | 'warning' | 'danger' | 'info' }) {
  return <span className={`pill pill-${tone}`}>{children}</span>
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <article className={`panel ${className}`}>{children}</article>
}

export function Heading({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail?: string; action?: ReactNode }) {
  return <div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{detail && <p className="muted">{detail}</p>}</div>{action}</div>
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><strong>{title}</strong><p>{detail}</p></div>
}

export function Modal({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><div className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close">×</button></div>{children}</div></div>
}
