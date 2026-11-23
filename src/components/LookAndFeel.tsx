import { useEffect, useState } from 'react'
import { applyPageLayout, defaultPageLayout, loadPageLayout, pageMarginLimits, savePageLayout, type PageLayout } from '../pageLayout'
import { chooseTheme, readThemePreference, themeEvent, type ThemePreference } from '../theme'
import type { StartView } from '../homeTiles'
import { Panel } from './ui'

// SET-18: My settings → Look & feel — the settings of how the app looks, one tab each (the shared Tables & charts
// defaults are a tab of their own for the people allowed to change them).

// NAV-50: the page margins (top, right, bottom, left) and the border around the page; applied at once, kept here.
export function PageLayoutPanel() {
  const [layout, setLayout] = useState<PageLayout>(() => loadPageLayout())
  const [draft, setDraft] = useState<Record<'top' | 'right' | 'bottom' | 'left', string>>(() => ({ top: String(layout.top), right: String(layout.right), bottom: String(layout.bottom), left: String(layout.left) }))
  const commit = (next: PageLayout) => { const saved = savePageLayout(next); setLayout(saved); applyPageLayout(saved); setDraft({ top: String(saved.top), right: String(saved.right), bottom: String(saved.bottom), left: String(saved.left) }) }
  const side = (key: 'top' | 'right' | 'bottom' | 'left', label: string) => <label>{label} (px)<input type="number" min={pageMarginLimits.min} max={pageMarginLimits.max} step={1} inputMode="numeric" value={draft[key]}
    onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} onBlur={() => commit({ ...layout, [key]: Number(draft[key]) })} onKeyDown={(event) => { if (event.key === 'Enter') commit({ ...layout, [key]: Number(draft[key]) }) }} /></label>
  const isDefault = (['top', 'right', 'bottom', 'left'] as const).every((key) => layout[key] === defaultPageLayout[key]) && layout.border === defaultPageLayout.border
  return <Panel className="connection-panel look-panel" eyebrow="LOOK & FEEL" title="Page layout" info="Every page fills the width beside the menu — also when you fold the menu — inside a thin border. Set the space between the page and the window on each side (0 to 64 px). Applies at once, on this computer only."
    action={<button type="button" className="ghost" disabled={isDefault} onClick={() => commit({ ...defaultPageLayout })}>Back to 10 / 20 / 10 / 20</button>}>
    <div className="look-margins" role="group" aria-label="Page margins">{side('top', 'Top')}{side('right', 'Right')}{side('bottom', 'Bottom')}{side('left', 'Left')}</div>
    <label className="checkbox-label"><input type="checkbox" checked={layout.border} onChange={(event) => commit({ ...layout, border: event.target.checked })} />Show a border around the page</label>
  </Panel>
}

const themeLabels: Record<ThemePreference, string> = { system: 'Follow the computer', light: 'Light', dark: 'Dark' }
export function ThemePanel({ desktop }: { desktop: boolean }) {
  const [theme, setTheme] = useState<ThemePreference>(() => readThemePreference(''))
  useEffect(() => { const follow = (event: Event) => setTheme((event as CustomEvent<ThemePreference>).detail); window.addEventListener(themeEvent, follow); return () => window.removeEventListener(themeEvent, follow) }, [])
  return <Panel className="connection-panel look-panel" eyebrow="LOOK & FEEL" title="Theme and zoom" info="The theme also switches with the button in the top bar. In the desktop app the zoom is set with − / + and Auto in the footer (also Ctrl − / Ctrl + / Ctrl 0).">
    <div className="segmented" role="radiogroup" aria-label="Theme">{(['system', 'light', 'dark'] as const).map((value) => <button key={value} type="button" role="radio" aria-checked={theme === value} className={theme === value ? 'active' : ''} onClick={() => { setTheme(value); chooseTheme(value) }}>{themeLabels[value]}</button>)}</div>
    {desktop ? <p className="muted">Zoom: use − / + and Auto in the footer of the window.</p> : <p className="muted">Zoom: use the browser's zoom (Ctrl − / Ctrl +). The desktop app has its own zoom in the footer.</p>}
  </Panel>
}

export function StartViewPanel({ startView, onStartView, onCustomizeMenu }: { startView: StartView; onStartView: (view: StartView) => void; onCustomizeMenu: () => void }) {
  return <Panel className="connection-panel look-panel" eyebrow="LOOK & FEEL" title="Start view and menu" info="Tiles open on Home with the menu hidden; Classic opens on My dashboard with the menu. Switching opens that start page. Customize menu pins, hides and orders the pages of your menu.">
    <div className="segmented" role="radiogroup" aria-label="Start view">{(['tiles', 'classic'] as const).map((value) => <button key={value} type="button" role="radio" aria-checked={startView === value} className={startView === value ? 'active' : ''} onClick={() => onStartView(value)}>{value === 'tiles' ? 'Tiles (Home)' : 'Classic (My dashboard)'}</button>)}</div>
    <div className="button-row"><button type="button" className="ghost" onClick={onCustomizeMenu}>Customize menu…</button></div>
  </Panel>
}
