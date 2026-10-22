import { createContext } from 'react'

// A place in the page header that pages can fill (e.g. the Team / Individual switch), set by App.
export const HeaderSlot = createContext<HTMLElement | null>(null)
