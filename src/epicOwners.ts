// EPS-11, PIR-68…PIR-71: the Product Owner of an Epic (product owner, 26 Nov 2026: "We have specific Product Owners for
// the Epics") — set in Admin → Feature & PI setup → Setup per Epic (the shared Epic setup in Git, epic-setup.json),
// stored by work email with the display name shown. Here: whose Epic a Feature is under, the Product Owner filter of
// PI Review, the Release Details pages and Team overview, and the Product Owner case of who may post a PI review. Pure
// apart from the remembered filter (this browser's storage, a convenience only).
import { productOwnerOf, type EpicSetupFile, type ProductOwner } from './epicSetup.ts'
import type { AzureWorkItem } from './domain'

export type { ProductOwner } from './epicSetup.ts'
const lower = (value: string | undefined) => value?.trim().toLowerCase() ?? ''
// PIR-70: the same person — work emails compared trimmed, ignoring case; nothing matches an empty email.
export const sameOwnerEmail = (a: string | undefined, b: string | undefined) => Boolean(lower(a) && lower(a) === lower(b))
// PIR-68: the name shown for a Product Owner — the display name, never the email (a name that is an email shows "—").
export const ownerName = (owner: ProductOwner | undefined) => !owner ? '' : owner.name.includes('@') ? '—' : owner.name

type Linked = Pick<AzureWorkItem, 'id' | 'parentId' | 'workItemType'>
// The Epic above a work item (its own id for an Epic), through the fetched items' parents (as PI Review's epicOf);
// undefined without one.
export function epicIdOf<T extends Linked>(items: readonly T[], item: T | undefined, byId: Map<number, T> = new Map(items.map((entry) => [entry.id, entry]))): number | undefined {
  if (!item) return undefined
  if (item.workItemType === 'Epic') return item.id
  const seen = new Set<number>()
  for (let current = item.parentId == null ? undefined : byId.get(item.parentId); current && !seen.has(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId)) {
    if (current.workItemType === 'Epic') return current.id
    seen.add(current.id)
  }
  return undefined
}
// The Product Owner of the Epic a work item is under (undefined: no Epic, or the Epic has none).
export function featureOwner<T extends Linked>(file: EpicSetupFile | null | undefined, items: readonly T[], item: T | undefined, byId?: Map<number, T>): ProductOwner | undefined {
  return productOwnerOf(file, epicIdOf(items, item, byId))
}
// PIR-71: the Epics a person owns (by work email).
export function ownedEpics(file: EpicSetupFile | null | undefined, email: string | undefined): number[] {
  return lower(email) ? (file?.epics ?? []).filter((entry) => sameOwnerEmail(entry.productOwner?.email, email)).map((entry) => entry.epicId).sort((a, b) => a - b) : []
}
// PIR-71: the Features of a list under an Epic the person owns.
export function ownedFeatures<T extends Linked>(file: EpicSetupFile | null | undefined, items: readonly T[], features: readonly T[], email: string | undefined): T[] {
  const owned = new Set(ownedEpics(file, email))
  if (!owned.size) return []
  const byId = new Map(items.map((item) => [item.id, item]))
  return features.filter((feature) => { const epic = epicIdOf(items, feature, byId); return epic != null && owned.has(epic) })
}

// ---- PIR-69: the Product Owner filter ----
// The key of "no Product Owner" (a Feature without an Epic, or under an Epic without one).
export const noOwnerKey = '@none'
export const noOwnerLabel = 'No Product Owner'
// The options: every Product Owner set in the Epic setup (by name, each email once), then No Product Owner.
export function ownerOptions(file: EpicSetupFile | null | undefined): [string, string][] {
  const byEmail = new Map<string, string>()
  for (const entry of file?.epics ?? []) if (entry.productOwner && !byEmail.has(entry.productOwner.email)) byEmail.set(entry.productOwner.email, ownerName(entry.productOwner) || entry.productOwner.email)
  const named = [...byEmail].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
  return named.length ? [...named, [noOwnerKey, noOwnerLabel]] : []
}
// A row is kept when nothing is chosen, or its Feature's Epic's Product Owner (or No Product Owner) is chosen. A row
// with several Features (a release with more than one) is kept when one of them is.
export function keepsOwner(chosen: readonly string[], owners: readonly (ProductOwner | undefined)[]): boolean {
  if (!chosen.length) return true
  const keys = owners.length ? owners.map((owner) => owner ? owner.email : noOwnerKey) : [noOwnerKey]
  return keys.some((key) => chosen.some((value) => value === noOwnerKey ? key === noOwnerKey : sameOwnerEmail(value, key)))
}
// The chosen values still offered (a Product Owner removed from the setup drops out of the filter).
export const offeredOwners = (chosen: readonly string[], options: readonly [string, string][]) => chosen.filter((value) => options.some(([key]) => key === value))
// Team overview: the stream keys (an Epic's work item key) of the Epics whose Product Owner is chosen; undefined when
// nothing is chosen. A stream without an Epic ("unmapped") counts as No Product Owner.
export function ownerStreamKeys(file: EpicSetupFile | null | undefined, items: readonly Pick<AzureWorkItem, 'id' | 'key' | 'workItemType'>[], streamKeys: readonly string[], chosen: readonly string[]): string[] | undefined {
  if (!chosen.length) return undefined
  const epics = new Map(items.filter((item) => item.workItemType === 'Epic').map((item) => [item.key, item.id]))
  return streamKeys.filter((key) => { const id = epics.get(key); return keepsOwner(chosen, [id == null ? undefined : productOwnerOf(file, id)]) })
}

// The filter is remembered per page in this browser (as the other filters of those pages); a value that is not a list
// of text reads as nothing chosen.
const storageKey = (page: string) => `demand-planning-po-filter-v1:${page}`
export function readOwnerFilter(page: string): string[] {
  try { const value: unknown = JSON.parse(localStorage.getItem(storageKey(page)) ?? '[]'); return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string').slice(0, 200) : [] } catch { return [] }
}
export function writeOwnerFilter(page: string, value: readonly string[]) {
  try { if (value.length) localStorage.setItem(storageKey(page), JSON.stringify(value)); else localStorage.removeItem(storageKey(page)) } catch { /* this visit only */ }
}

// ---- PIR-68: the PI Review Meeting ----
// The display name of every Epic's Product Owner by Epic ID (no email ever goes into the meeting file).
export function meetingOwners(file: EpicSetupFile | null | undefined): Record<string, string> {
  return Object.fromEntries((file?.epics ?? []).filter((entry) => entry.productOwner).map((entry) => [String(entry.epicId), ownerName(entry.productOwner)]))
}
// Per release stream, the Product Owners of its Epics (each name once, in Epic order); a stream without one is left out.
export function streamOwners(file: EpicSetupFile | null | undefined, streamEpics: Record<string, readonly number[]>): Record<string, string> {
  return Object.fromEntries(Object.entries(streamEpics).map(([stream, ids]) => [stream, [...new Set([...ids].sort((a, b) => a - b).map((id) => ownerName(productOwnerOf(file, id))).filter(Boolean))].join(', ')] as const).filter(([, names]) => names))
}
