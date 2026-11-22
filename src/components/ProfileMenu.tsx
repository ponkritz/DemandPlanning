import { useEffect, useRef, useState, type ReactNode } from 'react'

// NAV-48: the profile button at the top right — the person's initial; it opens their own things: My settings, the tile
// or classic view, View as…, Search settings, Customize menu and (desktop app only) zoom. Closes on Escape, on a choice
// and on a click outside.
export interface ProfileAction { key: string; label: string; icon: string; onClick: () => void; detail?: string }

export function ProfileMenu({ name, email, actions, children }: { name: string; email: string; actions: ProfileAction[]; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key) }
  }, [open])
  const shown = name || email
  const initial = (shown || '?').trim().charAt(0).toUpperCase()
  return <div className="profile-menu" ref={box}>
    <button type="button" className="profile-button" aria-haspopup="menu" aria-expanded={open} aria-label={`Profile${shown ? ` (${shown})` : ''}`} title={shown || 'Profile'} onClick={() => setOpen(!open)}><span aria-hidden="true">{initial}</span></button>
    {open && <div className="profile-panel" role="menu" aria-label="Profile">
      <div className="profile-who"><span className="profile-avatar" aria-hidden="true">{initial}</span><div><strong>{name || email || 'Not set yet'}</strong>{email && name && <small>{email}</small>}{!email && <small>Set your work email in My settings</small>}</div></div>
      {actions.map((action) => <button key={action.key} type="button" role="menuitem" className="profile-item" title={action.detail} onClick={() => { setOpen(false); action.onClick() }}><span aria-hidden="true">{action.icon}</span>{action.label}</button>)}
      {children && <div className="profile-extra">{children}</div>}
    </div>}
  </div>
}
