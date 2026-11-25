import { useEffect, useRef, type RefObject } from 'react'
import { stickyBarPlacement } from '../stickyScrollbar'

// UI-24: a wide table's horizontal scroll bar, kept at the bottom of the screen right above the app's sticky footer
// while the table's own bottom is out of view (placement: stickyBarPlacement). It is a copy of the table's scroll bar:
// moving one moves the other (the bar dragged, the table scrolled with a trackpad, Shift + wheel or the keyboard).
// Hidden from screen readers and out of the Tab order: the table itself stays scrollable. It follows every change of
// size (columns shown or hidden, Wrap text, density, data loaded, the window, the side menu folded) through a
// ResizeObserver, and the page's scrolling through one passive listener drawn once per frame. Tables in a pop-up or
// drawer keep their own bar (their box scrolls, not the page).
export function StickyScrollbar({ target }: { target: RefObject<HTMLElement | null> }) {
  const barRef = useRef<HTMLDivElement>(null)
  const spacerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const box = target.current, bar = barRef.current, spacer = spacerRef.current
    if (!box || !bar || !spacer || typeof ResizeObserver === 'undefined' || box.closest('[role="dialog"]')) return
    let frame = 0, shown = false
    // Ancestors that clip (overflow other than visible): the bar sits at the lowest edge that is still visible.
    let clips: Element[] = []
    const findClips = () => {
      clips = []
      for (let node = box.parentElement; node && node !== document.body; node = node.parentElement) {
        const { overflowY } = getComputedStyle(node)
        if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'hidden') clips.push(node)
      }
    }
    const footerTop = () => {
      const footer = document.querySelector('.app-footer')
      if (!footer) return undefined
      const { position } = getComputedStyle(footer)
      return position === 'sticky' || position === 'fixed' ? footer.getBoundingClientRect().top : undefined
    }
    const hide = () => { if (shown) { bar.hidden = true; shown = false } }
    const update = () => {
      frame = 0
      if (!box.isConnected) return hide()
      const rect = box.getBoundingClientRect()
      const clipBottom = clips.reduce((lowest, node) => Math.min(lowest, node.getBoundingClientRect().bottom), Infinity)
      const place = stickyBarPlacement({ box: { top: rect.top, bottom: rect.bottom, left: rect.left + box.clientLeft }, scrollWidth: box.scrollWidth, clientWidth: box.clientWidth, viewportHeight: window.innerHeight, footerTop: footerTop(), clipBottom: Number.isFinite(clipBottom) ? clipBottom : undefined })
      if (!place.show) return hide()
      bar.style.left = `${place.left}px`
      bar.style.width = `${place.width}px`
      bar.style.bottom = `${place.bottom}px`
      spacer.style.width = `${box.scrollWidth}px`
      if (!shown) { bar.hidden = false; shown = true }
      if (Math.abs(bar.scrollLeft - box.scrollLeft) >= 1) bar.scrollLeft = box.scrollLeft
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    const resized = () => { findClips(); schedule() }
    // Both ways; a difference under a pixel (zoom rounding) is left alone, so the two never echo each other.
    const fromTable = () => { if (shown && Math.abs(bar.scrollLeft - box.scrollLeft) >= 1) bar.scrollLeft = box.scrollLeft }
    const fromBar = () => { if (Math.abs(box.scrollLeft - bar.scrollLeft) >= 1) box.scrollLeft = bar.scrollLeft }
    box.addEventListener('scroll', fromTable, { passive: true })
    bar.addEventListener('scroll', fromBar, { passive: true })
    // Capture: also a panel that scrolls the table (a scroll does not bubble).
    window.addEventListener('scroll', schedule, { passive: true, capture: true })
    window.addEventListener('resize', resized, { passive: true })
    const observer = new ResizeObserver(resized)
    observer.observe(box)
    if (box.firstElementChild) observer.observe(box.firstElementChild)
    observer.observe(document.body) // content loaded above the table moves it
    const footer = document.querySelector('.app-footer')
    if (footer) observer.observe(footer)
    findClips(); update()
    return () => {
      if (frame) cancelAnimationFrame(frame)
      observer.disconnect()
      box.removeEventListener('scroll', fromTable)
      bar.removeEventListener('scroll', fromBar)
      window.removeEventListener('scroll', schedule, { capture: true })
      window.removeEventListener('resize', resized)
    }
  }, [target])
  return <div ref={barRef} className="data-table-hscroll" aria-hidden="true" tabIndex={-1} hidden><div ref={spacerRef} className="data-table-hscroll-spacer" /></div>
}
