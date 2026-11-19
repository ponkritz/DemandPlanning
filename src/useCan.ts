import { createContext, useContext } from 'react'
import type { Action } from './access.ts'

// CON-94: the viewer's permissions for components deep in the page tree (bulk create, QE Mapping, Monthly pack text,
// the shared Feature setup, table export). Provided by the app from useAccess; without a provider everything is
// allowed, as without an access policy.
export const CanContext = createContext<(action: Action) => boolean>(() => true)
export const useCan = () => useContext(CanContext)
