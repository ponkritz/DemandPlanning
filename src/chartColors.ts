import { isHexColor, paletteSize, type ColorPin } from './onDemand.ts'

// CHT-41 Colour pins of any colour: a value's colour is a palette colour 1…5 (the --viz-series-* tokens, which change
// with the theme) or any "#rrggbb" (the same in both themes). The contrast of a chosen colour against the chart's
// background in the light and the dark theme (WCAG 2.1 non-text contrast, 1.4.11: at least 3:1) is checked so the
// pop-up can warn — the choice is never refused — and a data label drawn on a bar or slice of that colour takes the
// readable text colour. Pure functions (tests/chart-colors.test.mjs).

// The chart background (--surface) and the palette tokens of src/index.css and src/App.css, light and dark.
export const chartBackground = { light: '#ffffff', dark: '#171a21' } as const
export const paletteHex: { light: string[]; dark: string[] } = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'],
}
export const minContrast = 3
// The text colours a label may take on a coloured bar: the app's dark text and white.
export const darkText = '#111827', lightText = '#ffffff'

const channel = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
// WCAG relative luminance of "#rrggbb".
export function luminance(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}
// The contrast ratio of two colours, 1…21.
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
// A typed colour as stored: "#rgb" or "#rrggbb" (with or without "#", any case) → "#rrggbb"; anything else ''.
export function normalizeHex(text: string): string {
  const raw = text.trim().replace(/^#/, '').toLowerCase()
  const full = /^[0-9a-f]{3}$/.test(raw) ? raw.split('').map((digit) => digit + digit).join('') : raw
  return isHexColor(`#${full}`) ? `#${full}` : ''
}
// A pin's colour in a theme, as "#rrggbb" (a palette slot by the token's value in that theme).
export function pinHex(pin: ColorPin, theme: 'light' | 'dark' = 'light'): string {
  if (typeof pin === 'number') return paletteHex[theme][Math.max(1, Math.min(paletteSize, pin)) - 1]
  return isHexColor(pin) ? pin : paletteHex[theme][0]
}
// A pin's colour for drawing: a palette slot as its token (it follows the theme), a hex as it is.
export const pinColor = (pin: ColorPin) => typeof pin === 'number' ? `var(--viz-series-${pin})` : pin
// The themes in which a colour has less than 3:1 against the chart background, with the ratio (empty: fine in both).
export function lowContrast(hex: string): { theme: 'light' | 'dark'; ratio: number }[] {
  if (!isHexColor(hex)) return []
  return (['light', 'dark'] as const).map((theme) => ({ theme, ratio: contrast(hex, chartBackground[theme]) })).filter((entry) => entry.ratio < minContrast)
}
// The pop-up's warning for a chosen colour ('' when it has 3:1 in both themes). Never blocks the choice.
export function contrastWarning(hex: string) {
  const low = lowContrast(hex)
  if (!low.length) return ''
  return `Low contrast against the chart background in the ${low.map((entry) => `${entry.theme} theme (${(Math.floor(entry.ratio * 10) / 10).toFixed(1)}:1)`).join(' and the ')}; at least ${minContrast}:1 keeps bars and slices visible. You can keep it.`
}
// The text colour of a label drawn on a bar or slice of this colour: dark text or white, whichever reads better; ''
// for a palette token (the chart's own label style applies, as before).
export function labelOn(color: string): string {
  if (!isHexColor(color)) return ''
  return contrast(color, darkText) >= contrast(color, lightText) ? darkText : lightText
}
