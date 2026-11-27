import { createContext, useContext, type ReactNode } from 'react'

// SET-32: the ⚙ Settings for this page, set by App for the page in use (null for people who may change none of its
// settings, and on pages without settings); a page puts it last in its page actions (UI-STANDARDS §6).
export const PageSettingsContext = createContext<ReactNode>(null)
export const usePageSettingsGear = () => useContext(PageSettingsContext)
