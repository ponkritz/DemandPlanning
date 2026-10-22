import { useEffect, useState } from 'react'
import { useNow } from '../useNow'
import { localTimeZone, timeZoneLabel } from '../format'
import { applyTheme, nextThemePreference, readThemePreference, storeThemePreference, type ThemePreference } from '../theme'

// System clock in the viewer's own time zone; every freshness label in the app is relative to this.
export function Clock() {
  const now = useNow(1000)
  const zone = localTimeZone()
  return <div className="clock" title={`${now.toLocaleString()} · ${zone}`} aria-live="off">
    <strong>{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong>
    <small>{now.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })} · {timeZoneLabel(now)}</small>
  </div>
}

const labels: Record<ThemePreference, string> = { system: 'Auto', light: 'Light', dark: 'Dark' }
const icons: Record<ThemePreference, string> = { system: '◐', light: '☀', dark: '☾' }

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>(() => readThemePreference())
  useEffect(() => { applyTheme(preference) }, [preference])
  const next = nextThemePreference(preference)
  return <button type="button" className="theme-toggle" onClick={() => { setPreference(next); storeThemePreference(next) }} aria-label={`Theme: ${labels[preference]}. Switch to ${labels[next]}.`} title={`Theme: ${labels[preference]} (click for ${labels[next]})`}>
    <span aria-hidden="true">{icons[preference]}</span>{labels[preference]}
  </button>
}
