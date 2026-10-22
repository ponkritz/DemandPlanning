import { useContext } from 'react'
import { PersonPicker } from './PersonPicker'
import { createPortal } from 'react-dom'
import type { PersonScope } from '../usePersonScope'
import { HeaderSlot } from '../headerSlot'

// Team / Individual toggle with a person picker (defaults to me), shown in the page header when the header has room
// for it, otherwise at the top of the page.
export function ScopeSwitch({ scope, label, note }: { scope: PersonScope; label: string; note?: string }) {
  const { view, setView, individual, person, setPerson, my } = scope
  const slot = useContext(HeaderSlot)
  const control = <div className="view-switch" role="group" aria-label={label} title={note}>
    <span>{label}</span>
    <div className="segmented">{(['individual', 'team'] as const).map((value) => <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)}>{value === 'team' ? 'Team' : 'Individual'}</button>)}</div>
    {individual && <PersonPicker label="Person" value={person} people={my.people} onChange={setPerson} meLabel={my.known ? `Me (${my.me.name ?? my.me.email})` : 'Choose a person…'} />}
    {individual && note && !slot && <small>{note}</small>}
  </div>
  return slot ? createPortal(control, slot) : control
}
