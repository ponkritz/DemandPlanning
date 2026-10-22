import { useState } from 'react'
import { myPendingWork, type Me } from './myWork'
import type { AzureWorkspace } from './useAzureWorkspace'
import type { PageProps } from './pages/types'
import { capacityContext } from './capacity'

const nameKey = 'demand-planning-my-name-v1'

// Who "me" is: the Time Writing connection's Azure email, plus a display name (chosen once, kept in this browser)
// for cached or sample items that carry no email.
export function useMyWork(azure: AzureWorkspace, store: PageProps['store']) {
  const [chosen, setChosen] = useState(() => { try { return localStorage.getItem(nameKey) ?? '' } catch { return '' } })
  const email = azure.creatorEmail.trim().toLowerCase()
  const nameFromEmail = email ? azure.items.find((item) => item.assignedToEmail === email)?.assignedTo : undefined
  // Choosing someone else's name shows their work (matched by name); your email is only used for your own view.
  const me: Me = chosen && chosen !== nameFromEmail ? { name: chosen } : { ...(email ? { email } : {}), ...(nameFromEmail ? { name: nameFromEmail } : {}) }
  const known = Boolean(me.email || me.name)
  const absenceEpicId = capacityContext(store.state).absenceEpicId
  const pending = known ? myPendingWork(azure.items, me, absenceEpicId) : []
  const people = [...new Set(azure.items.map((item) => item.assignedTo).filter(Boolean))].sort()
  function setName(name: string) {
    setChosen(name)
    try { if (name) localStorage.setItem(nameKey, name); else localStorage.removeItem(nameKey) } catch { /* kept for this session */ }
  }
  return { me, known, pending, absenceEpicId, people, setName, chosenName: chosen }
}
export type MyWork = ReturnType<typeof useMyWork>
