// UI-14: zoom in the desktop app. The page is laid out for about 1440 × 880; on a smaller window (or a screen with
// display scaling) Auto zooms out so all of it fits, and back to 100% when there is room; − / + / 100% (also Ctrl −,
// Ctrl +, Ctrl 0 and Ctrl + wheel) set it by hand, which turns Auto off until it is ticked again. Kept per computer.
export const zoomLimits = { min: 0.5, max: 2, step: 0.1 } as const
export const designSize = { width: 1440, height: 880 } as const
export const autoLimits = { min: 0.67, max: 1 } as const
export interface ZoomSetting { auto: boolean; factor: number }
export const defaultZoom: ZoomSetting = { auto: true, factor: 1 }
const zoomKey = 'demand-planning-desktop-zoom-v1'

const round = (value: number) => Math.round(value * 100) / 100
export const clampZoom = (factor: number) => Number.isFinite(factor) ? round(Math.min(zoomLimits.max, Math.max(zoomLimits.min, factor))) : 1
// The zoom that fits the design size into the window's real size (CSS pixels at 100%), in steps of 5%, between 67%
// and 100% (Auto never zooms in).
export function autoZoom(width: number, height: number) {
  if (!(width > 0) || !(height > 0)) return 1
  const fit = Math.min(width / designSize.width, height / designSize.height)
  return round(Math.min(autoLimits.max, Math.max(autoLimits.min, Math.floor(fit * 20) / 20)))
}
// One step in or out from the current zoom, on the 10% grid.
export const stepZoom = (factor: number, direction: 1 | -1) => clampZoom(Math.round((factor + direction * zoomLimits.step) * 10) / 10)

export function loadZoom(storage: Pick<Storage, 'getItem'> = localStorage): ZoomSetting {
  try {
    const raw = JSON.parse(storage.getItem(zoomKey) ?? 'null') as Partial<ZoomSetting> | null
    if (!raw || typeof raw !== 'object') return { ...defaultZoom }
    return { auto: raw.auto !== false, factor: clampZoom(Number(raw.factor ?? 1)) }
  } catch { return { ...defaultZoom } }
}
export function saveZoom(setting: ZoomSetting, storage: Pick<Storage, 'setItem'> = localStorage) {
  try { storage.setItem(zoomKey, JSON.stringify({ auto: setting.auto, factor: clampZoom(setting.factor) })) } catch { /* this visit only */ }
}

declare global { interface Window { desktopZoom?: { get: () => Promise<number>; set: (factor: number) => Promise<number>; onKey: (listener: (direction: 1 | -1 | 0) => void) => () => void } } }
