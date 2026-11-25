import { useEffect, useRef, useState } from 'react'

// A filter that takes any number of values: a button showing the choice ("All", one value, or "3 selected") that opens
// a list of checkboxes. Nothing ticked = all.
// emptyLabel: what nothing ticked means (default "All"); disabled/title: a control the viewer may not change, with why.
// search (PGB-18): a box at the top of the list filters the options as you type; disabledReason: an option that cannot
// be ticked, shown greyed with why (a ticked one can still be unticked); selectAll: false hides "Select every one".
export function MultiSelect({ label, options, value, onChange, emptyLabel = 'All', disabled = false, title, search = false, disabledReason, selectAll = true }: { label: string; options: [string, string][]; value: string[]; onChange: (value: string[]) => void; emptyLabel?: string; disabled?: boolean; title?: string; search?: boolean; disabledReason?: (key: string) => string; selectAll?: boolean }) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    // KB-91: in the capture phase, so a click elsewhere inside a pop-up (whose box stops the click from bubbling to the
    // page) still closes the list; Escape closes the list (not the pop-up) and gives the focus back to its button.
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) { if (event.key === 'Escape') { setOpen(false); button.current?.focus() } }
      else if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close, true); document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close, true); document.removeEventListener('keydown', close) }
  }, [open])
  const chosen = value.filter((entry) => options.some(([key]) => key === entry))
  const summary = !chosen.length ? emptyLabel : chosen.length === 1 ? options.find(([key]) => key === chosen[0])?.[1] ?? chosen[0] : `${chosen.length} selected`
  const toggle = (key: string) => onChange(chosen.includes(key) ? chosen.filter((entry) => entry !== key) : [...chosen, key])
  return <div className="multi-select" ref={box}>
    <span className="multi-label">{label}</span>
    <button ref={button} type="button" className="multi-button" aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${summary}`} disabled={disabled} title={title} onClick={() => setOpen(!open)}><span>{summary}</span><span aria-hidden="true">▾</span></button>
    {open && <div className="multi-list" role="listbox" aria-multiselectable="true" aria-label={label}>
      {search && <input type="search" className="multi-search" aria-label={`Filter ${label}`} placeholder="Type to filter" autoFocus value={typed} onChange={(event) => setTyped(event.target.value)} />}
      <div className="multi-actions"><button type="button" className="text-button" onClick={() => onChange([])}>{emptyLabel}</button>{selectAll && options.length > 1 && <button type="button" className="text-button" onClick={() => onChange(options.map(([key]) => key))}>Select every one</button>}</div>
      {(() => {
        const words = typed.trim().toLowerCase().split(/\s+/).filter(Boolean)
        const shown = options.filter(([, text]) => words.every((word) => text.toLowerCase().includes(word)))
        return shown.length ? shown.map(([key, text]) => { const reason = chosen.includes(key) ? '' : disabledReason?.(key) ?? ''; return <label key={key} className={`multi-option${reason ? ' multi-option-disabled' : ''}`} title={reason || undefined}><input type="checkbox" checked={chosen.includes(key)} disabled={Boolean(reason)} onChange={() => toggle(key)} />{text}{reason && <small className="muted"> — {reason}</small>}</label> }) : <span className="muted">{options.length ? 'Nothing matches.' : 'Nothing to choose'}</span>
      })()}
    </div>}
  </div>
}
