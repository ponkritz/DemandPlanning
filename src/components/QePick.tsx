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
