import type { AzureWorkItem } from './domain.ts'
import { updateAzureWorkItem, type AzureConfig } from './azureDevOps.ts'
import { isTimeWritingStory, timeWritingMonth } from './azureInsights.ts'
import { closeStates, isMine, isPending, type Me } from './myWork.ts'

// BKL-39: the pop-up of what Close Feature / Close User Story closes — each open item listed with a tick box, the
// person's own ticked, other people's not (named, to tick on purpose). A parent closes only with everything open
// below it: ticking it ticks what is below; unticking an item unticks what is above it.
export interface CloseRow { item: AzureWorkItem; depth: number; parentId?: number; mine: boolean; timeWriting: boolean; monthTask: boolean }

const same = (a: AzureWorkItem, b: AzureWorkItem) => a.organization === b.organization && a.project === b.project
const open = (item: AzureWorkItem) => isPending(item) && item.state.trim().toLowerCase() !== 'removed'

// The item and every open item below it, parents before children, by ID.
export function closeTree(items: AzureWorkItem[], root: AzureWorkItem, me: Me, depth = 0, parentId?: number): CloseRow[] {
  const below = items.filter((item) => item.parentId === root.id && same(item, root) && open(item)).sort((a, b) => a.id - b.id)
  const row: CloseRow[] = open(root) ? [{ item: root, depth, ...(parentId != null ? { parentId } : {}), mine: isMine(root, me), timeWriting: isTimeWritingStory(root), monthTask: root.workItemType === 'Task' && timeWritingMonth(root.title) != null }] : []
  return [...row, ...below.flatMap((child) => closeTree(items, child, me, depth + 1, root.id))]
}

// Close User Story: the story alone; when it is the last open User Story of its Feature (Time Writing stories not
// counted), the Feature with its Time Writing story and Tasks too.
export function storyCloseRows(items: AzureWorkItem[], story: AzureWorkItem, me: Me): CloseRow[] {
  const alone = closeTree(items, story, me).slice(0, 1)
  const feature = story.parentId == null ? undefined : items.find((item) => item.id === story.parentId && item.workItemType === 'Feature' && same(item, story))
  if (!feature || !open(feature)) return alone
  const others = items.filter((item) => item.parentId === feature.id && same(item, feature) && item.workItemType === 'User Story' && item.id !== story.id && !isTimeWritingStory(item) && open(item))
  if (others.length) return alone
  // The last one: everything still open under the Feature — this story with its Tasks, the Time Writing story with its
  // month Tasks, and the Feature.
  return closeTree(items, feature, me)
}

// The ticks to start with: the person's own items (and the item asked about).
export function defaultTicks(rows: CloseRow[], asked?: number) {
  const ticked = new Set(rows.filter((row) => row.mine || row.item.id === asked).map((row) => row.item.id))
  // A parent stays unticked while something open below it is not ticked (another person's item).
  for (const row of [...rows].sort((a, b) => b.depth - a.depth)) if (ticked.has(row.item.id) && rows.some((child) => child.parentId === row.item.id && !ticked.has(child.item.id))) ticked.delete(row.item.id)
  return ticked
}

// Ticking an item ticks every item below it in the list; unticking one unticks every item above it.
export function toggleTick(rows: CloseRow[], ticked: Set<number>, id: number, on: boolean) {
  const next = new Set(ticked)
  const parentOf = new Map(rows.flatMap((row) => row.parentId != null ? [[row.item.id, row.parentId] as [number, number]] : []))
  if (on) {
    const add = (target: number) => { next.add(target); for (const row of rows) if (row.parentId === target) add(row.item.id) }
    add(id)
  } else {
    next.delete(id)
    for (let up = parentOf.get(id); up != null; up = parentOf.get(up)) next.delete(up)
  }
  return next
}

// What the ticks close, deepest first so children close before parents; and whether hours must be confirmed (a month
// Time Writing Task is among them).
export function closeSelection(rows: CloseRow[], ticked: Set<number>) {
  const chosen = rows.filter((row) => ticked.has(row.item.id) && closeStates(row.item).length)
  return { items: [...chosen].sort((a, b) => b.depth - a.depth || a.item.id - b.item.id).map((row) => row.item), needsHours: chosen.some((row) => row.monthTask), parentOf: new Map(rows.flatMap((row) => row.parentId != null ? [[row.item.id, row.parentId] as [number, number]] : [])) }
}

// Closes the chosen items in order; an item whose child failed is left open.
export async function closeChosen(config: AzureConfig, pat: string, selection: ReturnType<typeof closeSelection>, write: (config: AzureConfig, pat: string, id: number, update: { state: string }) => Promise<AzureWorkItem> = updateAzureWorkItem, progress?: (text: string) => void) {
  const closed: AzureWorkItem[] = [], failed: string[] = [], skipped: string[] = []
  const bad = new Set<number>()
  const markUp = (id: number) => { for (let parent = selection.parentOf.get(id); parent != null && !bad.has(parent); parent = selection.parentOf.get(parent)) bad.add(parent) }
  for (const [index, item] of selection.items.entries()) {
    progress?.(`Closing ${index + 1} of ${selection.items.length}…`)
    if (bad.has(item.id)) { skipped.push(`#${item.id} left open: an item below it could not be closed`); markUp(item.id); continue }
    try { let updated = item; for (const state of closeStates(item)) updated = await write(config, pat, item.id, { state }); closed.push(updated) }
    catch (failure) { failed.push(`#${item.id}: ${failure instanceof Error ? failure.message : 'update failed'}`); markUp(item.id) }
  }
  return { closed, failed, skipped }
}
