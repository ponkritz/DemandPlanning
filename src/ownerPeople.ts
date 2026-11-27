import { maxOwners, ownersOf } from './menuLayout.ts'

// PGB-18, PGB-21: co-owners are picked from the people the app already knows (Admin → People & access → People, CAP-51: the
// Azure DevOps team members and everyone Assigned To fetched work) instead of typing their work emails. The name is
// shown, the work email (lower case) is stored, as before (PGB-08). A co-owner already named who is not in that list
// stays chosen, marked "not in Azure DevOps"; a person without a work email is listed but cannot be chosen.
export interface KnownPerson { name: string; email?: string }
export interface OwnerOption { key: string; label: string; disabled: string }
export const noEmailReason = 'No work email known yet: it comes with their work fetched from Azure DevOps (Assigned To).'
export const capReason = `At most ${maxOwners} co-owners.`

// The people of the list from the fetched work items (name and Assigned To email) and others known (e.g. the people
// with app roles, by work email), by name.
export function knownPeople(items: { assignedTo?: string; assignedToEmail?: string }[], extra: KnownPerson[] = []): KnownPerson[] {
  const byName = new Map<string, KnownPerson>()
  for (const person of [...items.map((item) => ({ name: item.assignedTo ?? '', email: item.assignedToEmail })), ...extra]) {
    const name = person.name.trim()
    if (!name || name === 'Unassigned') continue
    const known = byName.get(name), email = person.email?.trim().toLowerCase()
    byName.set(name, { name, ...(known?.email || email ? { email: known?.email || email } : {}) })
  }
  // A person known by name and work email is listed once: an entry named by its email alone is dropped then.
  const named = new Set([...byName.values()].filter((person) => person.email && person.name !== person.email).map((person) => person.email))
  return [...byName.values()].filter((person) => !(person.name === person.email && named.has(person.email))).sort((a, b) => a.name.localeCompare(b.name))
}

// PGB-21: the members of the Time Writing connection's team (CAP-30), read once per team in this app session (the
// first caller reads, the others share the answer). A refused or failed read gives no one, silently: the list then
// has the other people it knows (no notice outside Admin → People & access).
const teamReads = new Map<string, Promise<KnownPerson[]>>()
export function teamPeopleOnce(key: string, read: () => Promise<KnownPerson[]>): Promise<KnownPerson[]> {
  let found = teamReads.get(key)
  if (!found) { found = read().then((people) => people.filter((person) => person.name?.trim()), () => []); teamReads.set(key, found) }
  return found
}

// The options of the co-owner list: the known people with a work email (by name), the chosen co-owners not among them
// (marked), then the people without a work email (disabled with the reason). At the cap, the others are disabled.
export function ownerOptions(people: KnownPerson[], chosen: string[]): OwnerOption[] {
  const owners = ownersOf(chosen)
  const withEmail = people.filter((person) => person.email && ownersOf([person.email]).length)
  const emails = new Set(withEmail.map((person) => person.email!.toLowerCase()))
  const full = owners.length >= maxOwners
  const options: OwnerOption[] = [
    ...withEmail.map((person) => { const key = person.email!.toLowerCase(); return { key, label: person.name === key ? key : `${person.name} (${key})`, disabled: full && !owners.includes(key) ? capReason : '' } }),
    ...owners.filter((email) => !emails.has(email)).map((email) => ({ key: email, label: `${email} — not in Azure DevOps`, disabled: '' })),
    ...people.filter((person) => !person.email).map((person) => ({ key: `name:${person.name}`, label: person.name, disabled: noEmailReason })),
  ]
  return options
}
// The co-owners after a change of the list: only emails, each once, at most 50 (PGB-08).
export const ownersFromList = (keys: string[]) => ownersOf(keys.filter((key) => !key.startsWith('name:')))
