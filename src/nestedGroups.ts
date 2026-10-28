// Nested grouping of any list (QV-37): the items grouped by the first level's value, each group by the next level's,
// and so on. Values sort A→Z with numbers in order and "(blank)" last. A group's key is its path of values, unique
// across levels, so that each group can be collapsed on its own.
export interface GroupLevel<T> { id: string; label: string; value: (item: T) => string }
export interface NestedGroup<T> { key: string; levelId: string; label: string; value: string; depth: number; items: T[]; children: NestedGroup<T>[] }

export function nestGroups<T>(items: T[], levels: GroupLevel<T>[], path: string[] = []): NestedGroup<T>[] {
  const [level, ...rest] = levels
  if (!level) return []
  const byValue = new Map<string, T[]>()
  for (const item of items) { const value = level.value(item).trim(); byValue.set(value, [...(byValue.get(value) ?? []), item]) }
  return [...byValue.entries()]
    .sort(([a], [b]) => a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map(([value, grouped]) => ({ key: JSON.stringify([...path, value]), levelId: level.id, label: level.label, value, depth: path.length, items: grouped, children: nestGroups(grouped, rest, [...path, value]) }))
}
export const nestedKeys = <T>(groups: NestedGroup<T>[]): string[] => groups.flatMap((group) => [group.key, ...nestedKeys(group.children)])
