import { useState } from 'react'
import { regions, resourceRoles, type TeamFilter } from './capacity'
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

// Team view filter (region and roles), remembered in this browser; shared by Overview and Pulse Check.
export function useTeamFilter() {
  const [teamFilter, setTeamFilterState] = useState<TeamFilter>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('demand-planning-overview-team-filter-v1') ?? '{}') as Partial<TeamFilter>
      return { region: regions.find((region) => region === saved.region), roles: Array.isArray(saved.roles) ? resourceRoles.filter((role) => saved.roles!.includes(role)) : [] }
    } catch { return { roles: [] } }
  })
  const setTeamFilter = (next: TeamFilter) => { setTeamFilterState(next); try { localStorage.setItem('demand-planning-overview-team-filter-v1', JSON.stringify(next)) } catch { /* convenience only */ } }
  return [teamFilter, setTeamFilter] as const
}
