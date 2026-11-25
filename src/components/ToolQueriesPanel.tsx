import { defaultStreams, noToolDocumentsQuery, profilesForStream, toolQueries, toolQueryHowLabel, toolRoleLabel } from '../streams'
import { viewNameOf, type AzureConnectionProfileSummary } from '../azureCredentials'
import { defaultCompletionField, normalizeReleaseSourceSettings, withToolValidationsSettings, type ToolValidationsSettings } from '../releaseSource'
import { completionFieldOptions } from '../toolQueries'
import { viewSource } from '../viewSources'
import type { PageProps } from '../pages/types'
import { Notice, Panel, Pill } from './ui'

// TVL-19, TVL-20: Admin → Streams → Stream mapping → Tool Validations queries. Which Tool Validations connection is
// the Signed documents query (automatic by its name or columns, a connection chosen here, or none: one query, counted
// as before) and the Tools query's field whose date makes a tool Completed (default Changed Date). Saved in the shared
// settings (releaseSourceSettings.toolValidations) and to Git with the planning data, like the other release source
// settings; changed by the Tool Owner (the Stream mapping right), read by everyone else.
// TVL-33: the roles are named Tool List (the Tools query) and Validation Documents (the Signed documents query).
export function ToolQueriesPanel({ store, profiles, canManage }: { store: PageProps['store']; profiles: AzureConnectionProfileSummary[]; canManage: boolean }) {
  const stream = defaultStreams.find((entry) => entry.rule === 'tool')!
  const settings = normalizeReleaseSourceSettings(store.state.releaseSourceSettings).toolValidations ?? {}
  const mine = profilesForStream(stream, profiles)
  const queries = toolQueries(stream, profiles, settings.documentsQuery)
  const releaseConnections = profiles.filter((profile) => profile.role === 'release-source').length
  const dataOf = (profile: AzureConnectionProfileSummary | undefined) => profile ? viewSource(store.state, profile.id, profile.role, profile.query, releaseConnections) : undefined
  const tools = dataOf(queries.tools)
  const field = settings.completionField ?? defaultCompletionField
  const options = completionFieldOptions(tools && 'columns' in tools ? tools.columns : undefined, tools?.items)
  const choices = options.some((option) => option.ref === field) ? options : [...options, { ref: field, name: `${field} (not in the query's columns now)` }]
  const save = (next: ToolValidationsSettings, detail: string) => store.update((state) => withToolValidationsSettings(state, next, detail))
  const roleOf = (profile: AzureConnectionProfileSummary) => profile === queries.tools ? toolRoleLabel.tools : profile === queries.documents ? toolRoleLabel.documents : 'Not used'
  const why = canManage ? '' : 'Set by the Tool Owner (Stream mapping); read only for you.'
  return <Panel className="connection-panel tool-queries" eyebrow="TOOL VALIDATIONS" title="Tool Validations queries" info={<ul>
    <li>Tool Validations reads two queries, two connections named like the stream: the <strong>Tool List</strong> query (one row per tool — the master list and <strong>Completed</strong>) and the <strong>Validation Documents</strong> query (one row per document, its <strong>Parent</strong> the tool’s work item ID, with the approver slots — <strong>Supported</strong>). Only the Tool List feeds the master list.</li>
    <li><strong>Add query</strong> asks which one a new connection is — Tool List or Validation Documents — pre-selected by its name or columns; the choice is saved here. The Validation Documents query is the connection chosen here; on Automatic, the one whose name carries “documents”, “docs”, “signed” or “signatures”, else the one whose query selects [System.Parent] and an ApproverName column. The Tool List query is the other one.</li>
    <li>With one connection — or None chosen — the stream counts as before: each tool with a document approved (else changed) in the month.</li>
    <li>Completed: a tool whose completion date falls in the month (UTC). Supported: a tool with a document signed by a Quality role in the month (CP’s rule). Saved in the shared settings in Git for everyone.</li>
  </ul>}>
    <div className="form-row">
      <label>Validation Documents query<select aria-label="Validation Documents query" value={settings.documentsQuery ?? ''} disabled={!canManage} title={why || undefined} onChange={(event) => save({ documentsQuery: event.target.value || undefined }, `Tool Validations: Validation Documents query ${event.target.value === noToolDocumentsQuery ? 'none' : event.target.value || 'automatic'}`)}>
        <option value="">Automatic (by name or columns)</option>
        {mine.map((profile) => <option key={profile.id} value={viewNameOf(profile)}>{viewNameOf(profile)}</option>)}
        {settings.documentsQuery && settings.documentsQuery !== noToolDocumentsQuery && !mine.some((profile) => viewNameOf(profile) === settings.documentsQuery) && <option value={settings.documentsQuery}>{settings.documentsQuery} (no such connection)</option>}
        <option value={noToolDocumentsQuery}>None — one query, counted as before</option>
      </select></label>
      <label>Completion date (Completed)<select aria-label="Completion date field" value={field} disabled={!canManage} title={why || undefined} onChange={(event) => save({ completionField: event.target.value === defaultCompletionField ? undefined : event.target.value }, `Tool Validations: completion date ${event.target.value}`)}>
        {choices.map((option) => <option key={option.ref} value={option.ref}>{option.ref === defaultCompletionField ? 'Changed Date (last updated date) — default' : `${option.name} (${option.ref})`}</option>)}
      </select></label>
    </div>
    {field === defaultCompletionField && <Notice tone="info">Changed Date is the last update of the tool’s work item: it moves on any edit, so a tool edited after its validation counts as Completed in the month of that edit. Choose a date column of the Tool List query that is set once, if it has one.</Notice>}
    {!tools && queries.tools && <p className="muted">The date columns offered come from the Tool List query’s fetched data: fetch “{viewNameOf(queries.tools)}” to see them all.</p>}
    {why && <p className="muted">{why}</p>}
    <div className="azure-table"><table><thead><tr><th>Connection</th><th>Role</th><th>Rows fetched</th></tr></thead><tbody>
      {mine.map((profile) => { const data = dataOf(profile); return <tr key={profile.id}><td><strong>{viewNameOf(profile)}</strong></td><td><Pill tone={roleOf(profile) === 'Not used' ? 'warning' : 'info'}>{roleOf(profile)}</Pill></td><td>{data ? data.items.length : <span className="muted">Not fetched</span>}</td></tr> })}
      {!mine.length && <tr><td colSpan={3} className="muted">No Tool Validations connection yet: Add query on the Tool Validations row above.</td></tr>}
    </tbody></table></div>
    <p className="muted">How they are told apart: {toolQueryHowLabel[queries.how]}.</p>
  </Panel>
}
