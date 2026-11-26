import { createContext, useContext } from 'react'
import { writeBlockedReason, type Action } from './access.ts'

// CON-94: the viewer's permissions for components deep in the page tree (bulk create, Monthly pack text,
// the shared Feature setup, table export). Provided by the app from useAccess; without a provider nothing is allowed,
// as without an access policy (CON-101, fail closed).
export const CanContext = createContext<(action: Action) => boolean>(() => false)
export const useCan = () => useContext(CanContext)
// CON-101: no roles file loaded (read-only); without a provider, read-only too.
export const ReadOnlyContext = createContext(true)

// CON-102: buttons that start a change in Azure DevOps are disabled when the viewer lacks the action, and say why.
// why(action): the reason for one button ('' when allowed; also its tooltip); note(...actions): one visible line for a
// toolbar or table whose buttons need these actions ('' when all are allowed).
export function useWriteBlock() {
  const can = useCan(), readOnly = useContext(ReadOnlyContext)
  return {
    can,
    why: (action: Action) => can(action) ? '' : writeBlockedReason(readOnly, [action]),
    note: (...needed: Action[]) => writeBlockedReason(readOnly, needed.filter((action) => !can(action))),
    // OND-07: the same for a change saved to Git (where: e.g. 'on this page').
    noteFor: (where: string, ...needed: Action[]) => writeBlockedReason(readOnly, needed.filter((action) => !can(action)), where),
  }
}
