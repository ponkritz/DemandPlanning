import { useId, useState } from 'react'

// A person list you can type into: clicking shows the whole list (with "me" first), typing narrows it, and a click,
// Enter or the arrow keys pick a name. Empty value = me.
export function PersonPicker({ value, people, onChange, meLabel, label }: { value: string; people: string[]; onChange: (name: string) => void; meLabel: string; label: string }) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const text = query.trim().toLowerCase()
  const options = text ? people.filter((person) => person.toLowerCase().includes(text)) : ['', ...people]
  const choose = (name: string) => { onChange(name); setOpen(false); setQuery('') }
  const show = (index: number) => setActive(Math.max(0, Math.min(options.length - 1, index)))
  function keyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') { event.preventDefault(); if (!open) setOpen(true); else show(active + 1) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); show(active - 1) }
    else if (event.key === 'Enter' && open && options.length) { event.preventDefault(); choose(options[active]) }
    else if (event.key === 'Escape') { setOpen(false); setQuery('') }
  }
  return <span className="person-picker">
    <input type="text" role="combobox" aria-label={label} aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open && options.length ? `${listId}-${active}` : undefined}
      value={open ? query : value} placeholder={open ? 'Type to search…' : meLabel}
      onFocus={() => { setOpen(true); setQuery(''); setActive(0) }} onBlur={() => { setOpen(false); setQuery('') }}
      onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0) }} onKeyDown={keyDown} />
    {open && <ul id={listId} role="listbox" className="person-options">
      {options.length ? options.map((name, index) => <li key={name || 'me'} id={`${listId}-${index}`} role="option" aria-selected={name === value} className={index === active ? 'active' : ''} onMouseDown={(event) => { event.preventDefault(); choose(name) }} onMouseEnter={() => setActive(index)}>{name || meLabel}</li>)
        : <li className="muted" role="option" aria-selected={false} aria-disabled>No one matches “{query}”</li>}
    </ul>}
  </span>
}
