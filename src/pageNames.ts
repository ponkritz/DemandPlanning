// PGB-15…PGB-18: page names are set by Tool Owners and co-owners, so the app keeps them apart. A page name must be
// unique across every page in the menu — the added pages of every type (Table, Table + Insights, On-Demand Dashboard) in
// every group, the built-in pages' menu names, the Admin pages and the release streams (default and custom) — compared
// as people read them: ignoring case, surrounding spaces, repeated inner spaces, zero-width characters and Unicode
// width / compatibility forms (NFKC: "ＣｏＮＱ" is "CoNQ").

// A page in the menu: key 'ondemand:<id>' for an added page, 'page:<id>', 'admin:<tab>' or 'stream:<name>' otherwise.
export interface MenuPageName { key: string; name: string; group: string }

export const normalPageName = (name: string) => name.normalize('NFKC').replace(/[​-‍⁠﻿]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en')

// The page already using the name (another than `except`), or null.
export function pageNameClash(name: string, taken: MenuPageName[], except = ''): MenuPageName | null {
  const wanted = normalPageName(name)
  if (!wanted) return null
  return taken.find((entry) => entry.key !== except && normalPageName(entry.name) === wanted) ?? null
}
export const clashText = (clash: MenuPageName) => `There is already a page named “${clash.name}” (in ${clash.group}). Choose another name.`
// The error shown at the name field, '' when the name is free.
export function pageNameError(name: string, taken: MenuPageName[], except = '') {
  const clash = pageNameClash(name, taken, except)
  return clash ? clashText(clash) : ''
}

// PGB-17: names used by two or more pages — two owners saving the same name at the same time on different computers
// (merged by GIT-17), or duplicates already in Git. Both pages are kept; each set is listed with its groups.
export function duplicatePageNames(pages: MenuPageName[]): MenuPageName[][] {
  const sets = new Map<string, MenuPageName[]>()
  for (const entry of pages) { const key = normalPageName(entry.name); if (key) sets.set(key, [...(sets.get(key) ?? []), entry]) }
  return [...sets.values()].filter((set) => set.length > 1 && set.some((entry) => entry.key.startsWith('ondemand:')))
}
// The menu label of an added page whose name another page also has: its group added, to tell them apart (PGB-17).
export function menuLabel(entry: MenuPageName, duplicates: MenuPageName[][]) {
  return duplicates.some((set) => set.some((item) => item.key === entry.key)) ? `${entry.name} (${entry.group})` : entry.name
}
