// NAV-50: every page fills the width beside the menu (also when the menu is folded), inside a thin border with a
// margin on each side — top, right, bottom and left set separately (default 10 / 20 / 10 / 20 px). Kept per computer
// (My settings → Look & feel → Page layout) and applied as CSS variables on the document root.
export interface PageLayout { top: number; right: number; bottom: number; left: number; border: boolean }
export const defaultPageLayout: PageLayout = { top: 10, right: 20, bottom: 10, left: 20, border: true }
export const pageMarginLimits = { min: 0, max: 64 } as const
export const pageLayoutKey = 'demand-planning-page-layout-v1'
export const pageLayoutEvent = 'demand-planning-page-layout'
const sides = ['top', 'right', 'bottom', 'left'] as const

export const clampMargin = (value: unknown, fallback: number) => {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isFinite(number) ? Math.round(Math.min(pageMarginLimits.max, Math.max(pageMarginLimits.min, number))) : fallback
}
export function normalizePageLayout(value: unknown): PageLayout {
  const raw = value && typeof value === 'object' ? value as Partial<Record<keyof PageLayout, unknown>> : {}
  const layout = { ...defaultPageLayout }
  for (const side of sides) layout[side] = clampMargin(raw[side], defaultPageLayout[side])
  layout.border = raw.border !== false
  return layout
}
export function loadPageLayout(storage: Pick<Storage, 'getItem'> = localStorage): PageLayout {
  try { return normalizePageLayout(JSON.parse(storage.getItem(pageLayoutKey) ?? 'null')) } catch { return { ...defaultPageLayout } }
}
export function savePageLayout(layout: PageLayout, storage: Pick<Storage, 'setItem'> = localStorage) {
  const clean = normalizePageLayout(layout)
  try { storage.setItem(pageLayoutKey, JSON.stringify(clean)) } catch { /* this visit only */ }
  return clean
}
export function applyPageLayout(layout: PageLayout, root: HTMLElement = document.documentElement) {
  for (const side of sides) root.style.setProperty(`--page-m-${side}`, `${layout[side]}px`)
  if (layout.border) root.removeAttribute('data-page-border'); else root.setAttribute('data-page-border', 'off')
}
