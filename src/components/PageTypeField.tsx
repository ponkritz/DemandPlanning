import { pageTypeOf, tickReason, typeText, typeTicks, type TypeLock, type TypeTicks } from '../pageType'

// PGB-22: the page type as four tick boxes — Table (Build your own), Table (Query), Insights, Dashboard. A box that would
// make a combination that is not a page type is disabled, its reason shown under it (UI-STANDARDS §3); the type the
// ticks make is shown in words, or what is still missing. PGB-26 (Edit page) / DSH-01: lock — a page keeps its family
// and its table's source; only Insights can be switched on a table page.
export function PageTypeField({ ticks, onChange, lock, hideStreamNote = false }: { ticks: TypeTicks; onChange: (ticks: TypeTicks) => void; lock?: TypeLock; hideStreamNote?: boolean }) {
  const type = pageTypeOf(ticks)
  return <fieldset className="pgb-kinds"><legend>Page type</legend>
    {typeTicks.map((tick) => { const reason = tickReason(ticks, tick.key, lock); return <div key={tick.key} className="pgb-kind"><label className="check"><input type="checkbox" aria-describedby={`page-type-${tick.key}`} disabled={Boolean(reason)} checked={ticks[tick.key]} onChange={(event) => onChange({ ...ticks, [tick.key]: event.target.checked })} />{tick.label}</label><small id={`page-type-${tick.key}`}>{reason || tick.detail}</small></div> })}
    <p className="pgb-type-result" aria-live="polite">{typeof type === 'string' ? <span className="muted">{type}</span> : <><span className="muted">This page:</span> <strong>{typeText(type)}</strong></>}</p>
    {!hideStreamNote && <small className="muted">A Release page for a new stream is added as a custom stream: Admin → Streams → Stream mapping → ＋ Add stream….</small>}
  </fieldset>
}
