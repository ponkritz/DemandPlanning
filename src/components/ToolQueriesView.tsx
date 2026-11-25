import type { DataColumn } from './DataTable'
import { QueryView } from './QueryView'
import { Pill, TablePanel } from './ui'
import { monthName } from '../format'
import type { AzureWorkItem } from '../domain'
import type { QueryColumn, QueryOrder } from '../queryView'
import { documentToolOf, notInToolList, parentIdsToRead, parentToolOf, type ParentTitles, type ToolMonthReport } from '../toolQueries'

// TVL-14, TVL-31: the two Azure DevOps tabs of Tool Validations — Tool List [TFS] (the Tools query's rows) and
// Validation Documents [TFS] (every document of the Signed documents query, with its tool's name; those whose Parent is
// no tool of the Tools query marked "Not in Tool List (Azure)", never counted). Each is one table with every column its
// query selects, in its SELECT order (none hidden until someone hides one with Columns). There is no Releases table:
// the month's Completed and Supported tools are the master list's Current Month Status (TVL-35).
export type QuerySource = { name: string; items: AzureWorkItem[]; columns?: QueryColumn[]; orderBy?: QueryOrder[]; unresolved?: string[] }
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

export function ToolListTable({ tools, single = false }: { tools: QuerySource; single?: boolean }) {
  return <TablePanel title="Tool List [TFS]" detail={tools.name} count={plural(tools.items.length, 'row')}
    info={single
      ? <p>The Tool Validations query's rows with every column the query selects, in its order; hide some with Columns. Its tools are the master list's source; the Current Month Status on the Master list marks those with a document in the month as Supported.</p>
      : <p>The Tools query's rows (one per tool) with every column the query selects, in its order; hide some with Columns. These tools are the master list's source (with their ID, Source as Used by, State as Validated and Type) and the only tools counted as Completed or Supported (the Master list's Current Month Status).</p>}>
    <QueryView name={tools.name} items={tools.items} columns={tools.columns} orderBy={tools.orderBy} unresolved={tools.unresolved} summary={false} queryOnly />
  </TablePanel>
}

// Validation Documents [TFS] starts with Tool (the Parent's name), Parent ID and Tool List (Azure).
export function ValidationDocumentsTable({ report, documents, parentTitles }: { report: ToolMonthReport; documents: QuerySource; parentTitles?: ParentTitles }) {
  const toolOf = (item: AzureWorkItem) => documentToolOf(report, item.id, parentTitles)
  const lead: DataColumn<AzureWorkItem>[] = [
    { id: '@tvl-tool', label: 'Tool', value: (item) => toolOf(item).name, title: (item) => toolOf(item).note, render: (item) => { const tool = toolOf(item), listed = tool.parentId != null ? report.toolsById.get(tool.parentId) : undefined; return listed ? <a href={listed.url} target="_blank" rel="noreferrer">{tool.name}</a> : tool.name } },
    { id: '@tvl-parent', label: 'Parent ID', align: 'right', value: (item) => toolOf(item).parentId ?? '', render: (item) => toolOf(item).parentId ?? '—' },
    { id: '@tvl-listed', label: 'Tool List (Azure)', value: (item) => { const tool = toolOf(item); return tool.listed ? 'Listed' : tool.parentId == null ? 'No Parent' : notInToolList }, render: (item) => { const tool = toolOf(item); return tool.listed ? 'Listed' : <Pill tone="warning">{tool.parentId == null ? 'No Parent' : notInToolList}</Pill> } },
  ]
  const outside = report.unlinked.length
  const notRead = parentIdsToRead(report).flatMap((id) => { const tool = parentToolOf(report, id, parentTitles); return tool.name === `#${id}` ? [{ id, note: tool.note ?? '' }] : [] })
  const reasons = [...new Set(notRead.map((entry) => entry.note))]
  return <TablePanel title="Validation Documents [TFS]" detail={documents.name} count={`${plural(documents.items.length, 'document')}${outside ? ` · ${outside} not in Tool List (Azure) · not counted` : ''}`}
    info={<>
      <p>Every document of the Signed documents query, with every column the query selects, in its order (hide some with Columns), after <strong>Tool</strong> — the name of the document's Parent —, <strong>Parent ID</strong> and <strong>Tool List (Azure)</strong>.</p>
      <p><strong>Tool</strong>: for a Parent in the Tools query, the tool's name and version; for a Parent that is not (e.g. a retired tool), its title read from Azure DevOps by its ID when ↻ fetches the two queries — read only, with this server's PAT — and kept with the fetched documents.</p>
      <p><strong>{notInToolList}</strong>: {plural(outside, 'document')} whose Parent is no tool of the Tools query, or that have no Parent ({report.unlinkedSigned.length} with a Quality signature in {monthName(report.month)}). They are listed here, <strong>not counted</strong> as Completed or Supported, and never added to the master list.</p>
      {reasons.length > 0 && <p>{plural(notRead.length, 'Parent name')} not read — shown as #ID: {reasons.join(' ')}</p>}
    </>}>
    <QueryView name={documents.name} items={documents.items} columns={documents.columns} orderBy={documents.orderBy} unresolved={documents.unresolved} summary={false} queryOnly lead={lead} />
  </TablePanel>
}
