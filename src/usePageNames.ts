import { createContext, useContext } from 'react'
import { pageNameError, type MenuPageName } from './pageNames'
import type { KnownPerson } from './ownerPeople'

// PGB-15: every page name in the menu (added pages, built-in pages, Admin pages, release streams), provided by the app.
export const PageNamesContext = createContext<MenuPageName[]>([])
// PGB-18: the people co-owners are picked from (name and work email), provided by the app.
export const OwnerPeopleContext = createContext<KnownPerson[]>([])
// PGB-16: the clash of a typed page name with another page's name ('' when free); except: the page being renamed.
export function usePageNameClash(name: string, except = '') { return pageNameError(name, useContext(PageNamesContext), except) }
