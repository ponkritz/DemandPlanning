import { useId, useState } from 'react'

// A drop-down list you can type into (ACT-04): clicking shows every option, typing narrows them (by label and hint),
// and a click, Enter or the arrow keys pick one. Escape closes it and keeps the choice.
export interface SearchOption { value: string; label: string; hint?: string }
export function SearchSelect({ value, options, onChange, label, placeholder, empty = 'Nothing matches' }: { value: string; options: SearchOption[]; onChange: (value: string) => void; label: string; placeholder: string; empty?: string }) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const text = query.trim().toLowerCase()
  const shown = text ? options.filter((option) => `${option.label} ${option.hint ?? ''}`.toLowerCase().includes(text)) : options
  const chosen = options.find((option) => option.value === value)
  const choose = (next: string) => { onChange(next); setOpen(false); setQuery('') }
  const show = (index: number) => setActive(Math.max(0, Math.min(shown.length - 1, index)))
  const start = () => { setOpen(true); setQuery(''); setActive(0) }
  function keyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') { event.preventDefault(); if (!open) start(); else show(active + 1) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); show(active - 1) }
    else if (event.key === 'Enter' && open && shown.length) { event.preventDefault(); choose(shown[active].value) }
    else if (event.key === 'Escape') { setOpen(false); setQuery('') }
  }
  return <span className="person-picker search-select">
    <input type="text" role="combobox" aria-label={label} aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open && shown.length ? `${listId}-${active}` : undefined}
      value={open ? query : chosen?.label ?? ''} placeholder={open ? 'Type to search…' : placeholder}
      onFocus={start} onClick={() => { if (!open) start() }} onBlur={() => { setOpen(false); setQuery('') }}
      onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0) }} onKeyDown={keyDown} />
    <span className="search-select-caret" aria-hidden="true">▾</span>
    {open && <ul id={listId} role="listbox" aria-label={label} className="person-options">
      {shown.length ? shown.map((option, index) => <li key={option.value} id={`${listId}-${index}`} role="option" aria-selected={option.value === value} className={index === active ? 'active' : ''} onMouseDown={(event) => { event.preventDefault(); choose(option.value) }} onMouseEnter={() => setActive(index)}>{option.label}{option.hint ? <small>{option.hint}</small> : null}</li>)
        : <li className="muted" role="option" aria-selected={false} aria-disabled>{text ? `${empty} “${query}”` : empty}</li>}
    </ul>}
  </span>
}
