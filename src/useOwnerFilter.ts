import { useState } from 'react'
import { keepsOwner, offeredOwners, ownerOptions, readOwnerFilter, writeOwnerFilter, type ProductOwner } from './epicOwners'
import { productOwnerOf } from './epicSetup'
import { useEpicSetupFile } from './useEpicSetup'

// PIR-69: the Product Owner filter of a page (PI Review, the Release Details pages, Team overview) — the Product Owners
// set in the Epic setup, the choice remembered per page in this browser; keeps: whether a row is kept, by the Product
// Owners of its Features' Epics; ofEpic: an Epic's Product Owner.
export function useOwnerFilter(page: string) {
  const file = useEpicSetupFile()
  const options = ownerOptions(file)
  const [chosen, setChosen] = useState(() => readOwnerFilter(page))
  const value = offeredOwners(chosen, options)
  const change = (next: string[]) => { setChosen(next); writeOwnerFilter(page, next) }
  return { file, options, value, change, active: value.length > 0, keeps: (owners: (ProductOwner | undefined)[]) => keepsOwner(value, owners), ofEpic: (epicId: number | undefined) => productOwnerOf(file, epicId) }
}
export type OwnerFilter = ReturnType<typeof useOwnerFilter>
