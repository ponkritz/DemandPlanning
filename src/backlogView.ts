import type { WorkItemNode } from './azureHierarchy'

export const backlogColumns = [
  { id: 'order', label: 'Order', width: 60 }, { id: 'id', label: 'ID', width: 80 },
  { id: 'type', label: 'Work Item Type', width: 125 }, { id: 'title', label: 'Title', width: 440 },
  { id: 'description', label: 'Description', width: 350 }, { id: 'state', label: 'State', width: 105 },
  { id: 'storyPoints', label: 'Story Points', width: 100 }, { id: 'assignedTo', label: 'Assigned To', width: 160 },
  { id: 'iterationPath', label: 'Iteration Path', width: 240 }, { id: 'areaPath', label: 'Area Path', width: 220 },
  { id: 'targetDate', label: 'Target Date', width: 115 }, { id: 'closedDate', label: 'Closed Date', width: 115 },
  { id: 'tags', label: 'Tags', width: 180 }, { id: 'actions', label: 'Actions', width: 150 },
] as const
export type BacklogColumn = typeof backlogColumns[number]['id']
export const defaultBacklogColumns: BacklogColumn[] = ['order', 'id', 'type', 'title', 'description', 'state', 'storyPoints', 'actions']
export function normalizeBacklogColumns(value: unknown): BacklogColumn[] {
  if (!Array.isArray(value)) return [...defaultBacklogColumns]
  const valid = [...new Set(value.filter((id): id is BacklogColumn => backlogColumns.some((column) => column.id === id)))]
  return valid.includes('title') ? valid : ['title', ...valid]
}

export function plainAzureText(value: string) {
  // Render as React text only, never injected HTML. Rich-text source formatting is not executable.
  return value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]*>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:\d+|x[\da-f]+);/gi, (entity) => {
      const named: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' }
      if (named[entity.toLowerCase()]) return named[entity.toLowerCase()]
      const point = entity[2].toLowerCase() === 'x' ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10)
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ''
    }).replace(/\s+/g, ' ').trim()
}

export interface BacklogRow { node: WorkItemNode; depth: number; order: number; open: boolean }
export function visibleBacklogRows(tree: WorkItemNode[], expanded: ReadonlySet<string>, expandAll: boolean, search: boolean, level = 'Epic'): BacklogRow[] {
  const roots: WorkItemNode[] = []
  const find = (nodes: WorkItemNode[]) => { for (const node of nodes) { if (node.item.workItemType === level) roots.push(node); else find(node.children) } }
  if (level === 'Epic') roots.push(...tree)
  else find(tree)
  const rows: BacklogRow[] = []
  const visit = (nodes: WorkItemNode[], depth: number) => nodes.forEach((node, index) => {
    const open = expandAll || search || expanded.has(node.item.key)
    rows.push({ node, depth, order: depth === 0 ? index + 1 : 0, open })
    if (open) visit(node.children, depth + 1)
  })
  visit(roots, 0)
  return rows
}
