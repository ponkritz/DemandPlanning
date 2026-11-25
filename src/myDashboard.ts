import { clampSize, type GridSize } from './chartSize.ts'
import { blankBlock, parseDashboard, type BlockType, type DashboardBlock, type Dataset } from './dashboardPages.ts'
import { capacitySource, completedSource, historySource, kpiSource, mySourcePattern, releasesSource } from './dashboardSources.ts'
import { arrangeSections, type SectionLayout } from './personalViews.ts'
import type { ColorPins } from './onDemand.ts'

// MYD-14, MYD-23 My dashboard as the person's own dashboard: its built-in sections (My hours, My open work, My streams
// and releases, Release counts, Signed by me) are its default blocks, and the person adds, removes, moves and resizes
// blocks of the On-Demand Dashboard types over any data source of the registry (src/dashboardSources.ts). The layout is
// personal: the order and the hidden ones in the personal views' sections of the page (`mydash`, MYD-06), the blocks and
// the sections' sizes as the personal views entry `my-dashboard` (only the person's own entry is read — never the
// shared defaults, which hold no blocks), the period as `my-dashboard-view`. Nobody else reads it; View as shows the
// default My dashboard of the viewed role. Kept free of React so that every rule is tested (tests/my-dashboard.test.mjs).

export const myDashboardPage = 'mydash'
export const myDashboardKey = 'my-dashboard'
export const myDashboardViewKey = 'my-dashboard-view'
export const mySections = [
  { id: 'hours', label: 'My hours' },
  { id: 'work', label: 'My open work' },
  { id: 'streams', label: 'My streams and releases' },
  { id: 'releasecounts', label: 'Release counts' },
  { id: 'signed', label: 'Signed by me' },
] as const
export type MySectionId = typeof mySections[number]['id']
export const isSection = (id: string): id is MySectionId => mySections.some((section) => section.id === id)
// A personal views entry is kept up to 20,000 characters (MYD-09): 20 blocks fit.
export const maxMyBlocks = 20
export const maxMyChars = 19_000
export const sectionKindSize: GridSize = { w: 12, h: 4 }

export interface MyDashboard { blocks: DashboardBlock[]; sizes: Record<string, GridSize>; colors?: ColorPins }
export const emptyMyDashboard = (): MyDashboard => ({ blocks: [], sizes: {} })

// Read back from the personal views entry: blocks validated as an On-Demand Dashboard's (DSH-08) with the registry's
// source keys; sizes only for the built-in sections, clamped to the grid.
export function parseMyDashboard(value: unknown): { dashboard: MyDashboard; dropped: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { dashboard: emptyMyDashboard(), dropped: [] }
  const raw = value as { blocks?: unknown; sizes?: unknown; colors?: unknown }
  let parsed: ReturnType<typeof parseDashboard>
  try { parsed = parseDashboard(JSON.stringify({ schema: 1, kind: 'dashboard', id: 'my-dashboard', tabs: [], filters: [], blocks: Array.isArray(raw.blocks) ? raw.blocks : [], ...(raw.colors ? { colors: raw.colors } : {}) }), 'my-dashboard', mySourcePattern) } catch { return { dashboard: emptyMyDashboard(), dropped: ['Your dashboard’s blocks could not be read; the default My dashboard is shown.'] } }
  const sizes: Record<string, GridSize> = {}
  if (raw.sizes && typeof raw.sizes === 'object') for (const [id, size] of Object.entries(raw.sizes as Record<string, { w?: unknown; h?: unknown }>)) {
    if (isSection(id) && size && typeof size.w === 'number' && typeof size.h === 'number') sizes[id] = clampSize({ w: size.w, h: size.h }, 'table')
  }
  const blocks = parsed.dashboard.blocks.filter((block) => !isSection(block.id)).slice(0, maxMyBlocks)
  return { dashboard: { blocks, sizes, ...(parsed.dashboard.colors ? { colors: parsed.dashboard.colors } : {}) }, dropped: parsed.dropped.map((text) => text.replace('dashboards/my-dashboard.json', 'Your dashboard')) }
}
// The entry written to the personal views (refused when it would not fit: remove a block first).
export function myDashboardOut(dashboard: MyDashboard): { blocks: unknown[]; sizes: Record<string, GridSize>; colors?: ColorPins } {
  const out = { blocks: dashboard.blocks.map((block) => JSON.parse(JSON.stringify(block)) as unknown), sizes: dashboard.sizes, ...(dashboard.colors && Object.keys(dashboard.colors).length ? { colors: dashboard.colors } : {}) }
  if (dashboard.blocks.length > maxMyBlocks) throw new Error(`My dashboard holds at most ${maxMyBlocks} blocks of your own: remove one first.`)
  if (JSON.stringify(out).length > maxMyChars) throw new Error('Your dashboard is too large to keep with your views: remove a block or shorten a narrative.')
  return out
}

// Every item in the person's order (the sections and the blocks), shown and hidden, as MYD-06 arranges sections: a block
// added goes last; the sections keep their default order until moved.
export function arrangeMyItems(dashboard: MyDashboard, layout: SectionLayout | undefined) {
  return arrangeSections([...mySections.map((section) => section.id), ...dashboard.blocks.map((block) => block.id)], layout)
}
export const withBlock = (dashboard: MyDashboard, block: DashboardBlock): MyDashboard => {
  const exists = dashboard.blocks.some((entry) => entry.id === block.id)
  if (!exists && dashboard.blocks.length >= maxMyBlocks) throw new Error(`My dashboard holds at most ${maxMyBlocks} blocks of your own: remove one first.`)
  return { ...dashboard, blocks: exists ? dashboard.blocks.map((entry) => entry.id === block.id ? block : entry) : [...dashboard.blocks, block] }
}
// A removed block leaves the blocks and the order; a section is only hidden (it comes back with its tick or Reset).
export function withoutBlock(dashboard: MyDashboard, layout: SectionLayout | undefined, id: string): { dashboard: MyDashboard; layout: SectionLayout } {
  const arranged = arrangeMyItems(dashboard, layout)
  return { dashboard: { ...dashboard, blocks: dashboard.blocks.filter((block) => block.id !== id) }, layout: { order: arranged.order.filter((entry) => entry !== id), hidden: arranged.hidden.filter((entry) => entry !== id) } }
}
// A new block over a source, with the source's natural measure and period: hours and capacity as the Sum of their first
// hours, the releases, KPI values and history by their Month; the Azure work not filtered by the period.
export function myBlankBlock(dataset: Dataset, id: string, type: BlockType = 'kpi'): DashboardBlock {
  const block = blankBlock(dataset, id, type)
  const period = (column: string) => dataset.page.columns.some((entry) => entry.id === column) ? column : ''
  if (dataset.key === capacitySource) return { ...block, measure: 'sum', value: 'cp-available', period: period('cp-month') }
  if (dataset.key === releasesSource) return { ...block, period: period('rl-month') }
  // MYD-25: the Sum of Completed releases by Month (a line chart by Month with Running total is Pulse Check's Year chart).
  if (dataset.key === completedSource) return { ...block, measure: 'sum', value: 'cr-completed', period: period('cr-month'), ...(type === 'line' ? { category: 'cr-month' } : {}) }
  if (dataset.key === historySource) return { ...block, measure: 'sum', value: 'hs-actual', period: period('hs-month') }
  if (dataset.key === kpiSource) return { ...block, measure: 'sum', value: 'kp-value', period: '' }
  if (dataset.key === 'azure:work') return { ...block, period: '', ...(type !== 'kpi' && type !== 'line' && dataset.page.columns.some((column) => column.id === 'aw-state') ? { category: 'aw-state' } : {}) }
  return block
}
