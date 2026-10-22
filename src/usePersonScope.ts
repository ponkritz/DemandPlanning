import { useState } from 'react'
import type { Me } from './myWork'
import type { MyWork } from './useMyWork'

export type ScopeView = 'team' | 'individual'

// Team / Individual choice shared by Overview and Monthly Time Writing, remembered per page in this browser.
// Individual defaults to "me" (Time Writing connection email); any other assignee can be picked.
export function usePersonScope(key: string, defaultView: ScopeView, my: MyWork) {
  const [view, setViewState] = useState<ScopeView>(() => { try { const saved = localStorage.getItem(key); return saved === 'team' || saved === 'individual' ? saved : defaultView } catch { return defaultView } })
  const [person, setPerson] = useState('')
  const setView = (next: ScopeView) => { setViewState(next); try { localStorage.setItem(key, next) } catch { /* convenience only */ } }
  const individual = view === 'individual'
  const scope: Me | null = individual ? (person ? { name: person } : my.known ? my.me : null) : null
  const who = scope ? scope.name ?? scope.email ?? 'Me' : 'Team'
  return { view, setView, person, setPerson, individual, scope, who, my }
}
export type PersonScope = ReturnType<typeof usePersonScope>
