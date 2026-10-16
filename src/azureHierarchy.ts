import type { AzureWorkItem } from './domain'

export type StateFilter = 'All' | 'New' | 'Active' | 'Closed'
export interface WorkItemNode { item: AzureWorkItem; children: WorkItemNode[]; context: boolean; parentMissing: boolean }

export function buildWorkItemTree(items: AzureWorkItem[], state: StateFilter | readonly string[], search: string): WorkItemNode[] {
  const states = typeof state === 'string' ? [state] : state
  const byKey = new Map(items.map((item) => [item.key, item]))
  const parentKey = (item: AzureWorkItem) => `${item.organization.toLowerCase()}/${item.project.toLowerCase()}/${item.parentId}`
  const matched = new Set(items.filter((item) => (states.includes('All') || states.some((value) => item.state.toLowerCase() === value.toLowerCase())) && `${item.id} ${item.title} ${item.workItemType} ${item.state} ${item.assignedTo}`.toLowerCase().includes(search.toLowerCase())).map((item) => item.key))
  const visible = new Set(matched)
  for (const key of matched) {
    const seen = new Set<string>([key])
    let item = byKey.get(key)
    while (item?.parentId) {
      const parent = byKey.get(parentKey(item))
      if (!parent || seen.has(parent.key)) break
      visible.add(parent.key); seen.add(parent.key); item = parent
    }
  }
  const nodes = new Map([...visible].map((key) => { const item = byKey.get(key)!; return [key, { item, children: [], context: !matched.has(key), parentMissing: Boolean(item.parentId && !byKey.has(parentKey(item))) } as WorkItemNode] }))
  const roots: WorkItemNode[] = []
  for (const node of nodes.values()) {
    const seen = new Set([node.item.key])
    let ancestor = node.item
    let cyclic = false
    while (ancestor.parentId) {
      const parent = byKey.get(parentKey(ancestor))
      if (!parent) break
      if (seen.has(parent.key)) { cyclic = true; break }
      seen.add(parent.key); ancestor = parent
    }
    const parent = node.item.parentId && !cyclic ? nodes.get(parentKey(node.item)) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  const order = ['Epic', 'Feature', 'User Story', 'Product Backlog Item', 'Bug', 'Task']
  const sort = (list: WorkItemNode[]) => { list.sort((a, b) => { const rank = (type: string) => { const index = order.indexOf(type); return index < 0 ? order.length : index }; return rank(a.item.workItemType) - rank(b.item.workItemType) || a.item.id - b.item.id }); for (const node of list) sort(node.children) }
  sort(roots)
  return roots
}
