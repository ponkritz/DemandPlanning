// DPF-06: the QE of one release in a bulk Create Features pop-up — prefilled from the QE Mapping (or the person chosen
// for all), changeable to anyone with an email on the QMS-0025 board.
export function QePick({ label, email, mapped, people, onPick, disabled }: { label: string; email: string; mapped?: string; people: { name: string; email: string }[]; onPick: (email: string) => void; disabled?: boolean }) {
  const known = people.some((person) => person.email === email)
  return <span className="qe-pick">
    <select aria-label={`QE for ${label}`} value={email} disabled={disabled} onChange={(event) => onPick(event.target.value)}>
      {!email && <option value="">Choose the QE…</option>}
      {email && !known && <option value={email}>{mapped || email}</option>}
      {people.map((person) => <option key={person.email} value={person.email}>{person.name}</option>)}
    </select>
    {mapped && <small className="muted">QE Mapping: {mapped}</small>}
  </span>
}

// DPF-08, DPF-11: the Release Classification of one release in the DP / IOCC Create Features pop-up — the Epic's values,
// prefilled with the value detected from the release number (by the field's rules, DPF-10) and changeable; the hint
// under it says what was detected from which number.
export function ClassPick({ label, field, values, value, detected, version, onPick }: { label: string; field: string; values: string[]; value: string; detected: string; version: string; onPick: (value: string) => void }) {
  return <span className="qe-pick">
    <select aria-label={`${field} of ${label}`} value={value} onChange={(event) => onPick(event.target.value)}>
      <option value="">— the Epic’s default —</option>
      {[...values, ...(value && !values.includes(value) ? [value] : [])].map((item) => <option key={item} value={item}>{item}</option>)}
    </select>
    {detected && <small className="muted">{detected === value ? `detected from ${version}` : `${detected} detected from ${version}`}</small>}
  </span>
}
