import { useEffect, useRef, useState } from 'react'

// A filter that takes any number of values: a button showing the choice ("All", one value, or "3 selected") that opens
// a list of checkboxes. Nothing ticked = all.
export function MultiSelect({ label, options, value, onChange }: { label: string; options: [string, string][]; value: string[]; onChange: (value: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | KeyboardEvent) => { if (event instanceof KeyboardEvent ? event.key === 'Escape' : !box.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])
  const chosen = value.filter((entry) => options.some(([key]) => key === entry))
  const summary = !chosen.length ? 'All' : chosen.length === 1 ? options.find(([key]) => key === chosen[0])?.[1] ?? chosen[0] : `${chosen.length} selected`
  const toggle = (key: string) => onChange(chosen.includes(key) ? chosen.filter((entry) => entry !== key) : [...chosen, key])
  return <div className="multi-select" ref={box}>
    <span className="multi-label">{label}</span>
    <button type="button" className="multi-button" aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${summary}`} onClick={() => setOpen(!open)}><span>{summary}</span><span aria-hidden="true">▾</span></button>
    {open && <div className="multi-list" role="listbox" aria-multiselectable="true" aria-label={label}>
      <div className="multi-actions"><button type="button" className="text-button" onClick={() => onChange([])}>All</button>{options.length > 1 && <button type="button" className="text-button" onClick={() => onChange(options.map(([key]) => key))}>Select every one</button>}</div>
      {options.length ? options.map(([key, text]) => <label key={key} className="multi-option"><input type="checkbox" checked={chosen.includes(key)} onChange={() => toggle(key)} />{text}</label>) : <span className="muted">Nothing to choose</span>}
    </div>}
  </div>
}
