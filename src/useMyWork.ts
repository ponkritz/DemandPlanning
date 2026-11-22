import { useState } from 'react'
import { myPendingWork, selfOf, type Me } from './myWork'
import type { AzureWorkspace } from './useAzureWorkspace'
import type { PageProps } from './pages/types'
import { capacityContext } from './capacity'

const nameKey = 'demand-planning-my-name-v1'

// Who "me" is: the Time Writing connection's Azure email, plus a display name (chosen once, kept in this browser)
// for cached or sample items that carry no email.
export function useMyWork(azure: AzureWorkspace, store: PageProps['store'], viewAsPerson?: { name: string; email?: string }) {
  const [chosen, setChosen] = useState(() => { try { return localStorage.getItem(nameKey) ?? '' } catch { return '' } })
  const email = azure.creatorEmail.trim().toLowerCase()
  const nameFromEmail = email ? azure.items.find((item) => item.assignedToEmail === email)?.assignedTo : undefined
  // Choosing someone else's name shows their work (matched by name); your email is only used for your own view.
  // View as a person (CON-90): their own work, by their Azure email and name.
  const viewed: Me | undefined = viewAsPerson ? { ...(viewAsPerson.email ? { email: viewAsPerson.email } : {}), ...(viewAsPerson.name && viewAsPerson.name !== viewAsPerson.email ? { name: viewAsPerson.name } : {}) } : undefined
  const me: Me = viewed ?? (chosen && chosen !== nameFromEmail ? { name: chosen } : { ...(email ? { email } : {}), ...(nameFromEmail ? { name: nameFromEmail } : {}) })
  const known = Boolean(me.email || me.name)
  const absenceEpicId = capacityContext(store.state).absenceEpicId
  const pending = known ? myPendingWork(azure.items, me, absenceEpicId) : []
  const people = [...new Set(azure.items.map((item) => item.assignedTo).filter(Boolean))].sort()
  // NAV-47: My dashboard is always the person themselves — their work email, else the name they chose as theirs before
  // an email was set (or the person viewed as); the person picker of the person-based pages does not change it.
  const selfMe: Me = selfOf(email, nameFromEmail, chosen, viewed)
  const selfKnown = Boolean(selfMe.email || selfMe.name)
  const self = { me: selfMe, known: selfKnown, pending: selfKnown ? myPendingWork(azure.items, selfMe, absenceEpicId) : [] }
  function setName(name: string) {
    setChosen(name)
    try { if (name) localStorage.setItem(nameKey, name); else localStorage.removeItem(nameKey) } catch { /* kept for this session */ }
  }
  return { me, known, pending, absenceEpicId, people, setName, chosenName: chosen, self }
}
export type MyWork = ReturnType<typeof useMyWork>

