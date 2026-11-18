import { useEffect, useRef, useState } from 'react'
import { autoZoom, clampZoom, loadZoom, saveZoom, stepZoom, type ZoomSetting } from '../desktopZoom'

// UI-14: the desktop app's zoom — Auto (fit the window, on by default) or set by hand with − / 100% / +, Ctrl −,
// Ctrl +, Ctrl 0 or Ctrl + wheel (which turn Auto off). Not shown in the browser, which has its own zoom.
// Auto is worked out when the app starts, when the window is resized and when Auto is ticked, from the window's size
// at 100% (its CSS size times the zoom in effect).
export function ZoomControl() {
  const bridge = typeof window === 'undefined' ? undefined : window.desktopZoom
  const [setting, setSetting] = useState<ZoomSetting>(() => loadZoom())
  const applied = useRef(1)
  const apply = (next: ZoomSetting) => { setSetting(next); saveZoom(next) }
  const fitted = () => autoZoom(window.innerWidth * applied.current, window.innerHeight * applied.current)
  // The zoom shown is the one set.
  useEffect(() => {
    if (!bridge) return
    let active = true
    void bridge.set(setting.factor).then((factor) => { if (active) applied.current = factor })
    return () => { active = false }
  }, [bridge, setting.factor])
  useEffect(() => {
    if (!bridge) return
    let active = true
    void bridge.get().then((factor) => { if (!active) return; applied.current = factor; const saved = loadZoom(); if (saved.auto) { const next = { auto: true, factor: fitted() }; setSetting(next); saveZoom(next) } })
    const resize = () => { if (loadZoom().auto) { const next = { auto: true, factor: fitted() }; setSetting(next); saveZoom(next) } }
    window.addEventListener('resize', resize)
    const stop = bridge.onKey((direction) => setSetting((current) => { const next = { auto: false, factor: direction === 0 ? 1 : stepZoom(current.factor, direction) }; saveZoom(next); return next }))
    return () => { active = false; window.removeEventListener('resize', resize); stop() }
  // Once per bridge: fitted reads the window, not React state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge])
  if (!bridge) return null
  const percent = Math.round(setting.factor * 100)
  return <div className="zoom-control" role="group" aria-label="Zoom">
    <button type="button" className="text-button" aria-label="Zoom out" title="Zoom out (Ctrl −)" disabled={setting.factor <= 0.5} onClick={() => apply({ auto: false, factor: stepZoom(setting.factor, -1) })}>−</button>
    <button type="button" className="text-button zoom-value" title="Back to 100% (Ctrl 0)" onClick={() => apply({ auto: false, factor: clampZoom(1) })}>{percent}%</button>
    <button type="button" className="text-button" aria-label="Zoom in" title="Zoom in (Ctrl +)" disabled={setting.factor >= 2} onClick={() => apply({ auto: false, factor: stepZoom(setting.factor, 1) })}>+</button>
    <label className="inline-check" title="Fit the app to the window, also after it is resized"><input type="checkbox" checked={setting.auto} onChange={(event) => apply(event.target.checked ? { auto: true, factor: fitted() } : { auto: false, factor: setting.factor })} />Auto</label>
  </div>
}
