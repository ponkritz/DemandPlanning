import { Notice, Pill } from './ui'
import { formatDateTime, relativeTime } from '../format'
import { useNow } from '../useNow'
import type { AzureWorkspace } from '../useAzureWorkspace'

// The one place for Azure data status: a compact chip and Refresh in the header (DataStatus), and the notices about
// the data (DataNotices) once under the header — not repeated on each page.
export function DataStatus({ azure }: { azure: AzureWorkspace }) {
  const { config, items, preview, busy, pat, lastRefreshed, isSample } = azure
  const now = useNow(30000)
  const tone = busy ? 'info' : preview ? 'warning' : isSample ? 'warning' : items.length ? 'open' : 'neutral'
  const savedAt = !lastRefreshed && items.length ? items.reduce((latest, item) => item.syncedAt > latest ? item.syncedAt : latest, '') : ''
  const at = lastRefreshed || savedAt
  const label = busy ? 'Refreshing…' : preview ? 'Unsaved result' : isSample ? 'Sample data' : items.length ? `${items.length} items · ${at ? relativeTime(at, now) : 'saved'}` : 'No data'
  return <div className="data-status"><Pill tone={tone}><span title={at ? `${config?.team || config?.project || 'Azure DevOps'} · fetched ${formatDateTime(at)} · saved locally` : 'Nothing fetched yet'}>{label}</span></Pill><button type="button" className="ghost icon-refresh" disabled={busy || (!azure.connectionProfiles.length && (!config || !pat.trim()))} onClick={() => void (azure.connectionProfiles.length ? azure.fetchAll() : azure.refresh())} title="Refresh every connection from Azure DevOps (saved automatically)" aria-label="Refresh from Azure">↻</button></div>
}

export function DataNotices({ azure, onOpenConnection }: { azure: AzureWorkspace; onOpenConnection: () => void }) {
  const { items, preview, busy, error, message, needsScopedRefresh, isSample } = azure
  return <div className="data-notices">
    {preview && <Notice tone="warning" className="notice-split"><span>Azure returned {preview.items.length} work items for {preview.scope.team || preview.scope.project}, so this result was not saved automatically and your saved data is unchanged. Save it only if an empty backlog is expected; it replaces the saved Azure data.</span><div className="button-row"><button className="primary" onClick={azure.savePreview}>Save preview — replace Azure cache</button><button className="ghost" onClick={() => { azure.setPreview(null); azure.setMessage('Preview discarded. Previously saved work items are unchanged.') }}>Discard</button></div></Notice>}
    {needsScopedRefresh && !preview && <Notice>Previously cached work items have no verified scope for this team backlog and are hidden. Refresh from Azure, then save the scoped result to replace the old cache. Other app data is unchanged.</Notice>}
    {!items.length && !busy && !preview && <Notice className="notice-split"><span>No source data loaded yet. <button className="text-button" onClick={onOpenConnection}>Fetch work items from Azure DevOps →</button></span><button className="ghost" onClick={azure.loadSampleData}>Load synthetic sample</button></Notice>}
    {isSample && <Notice tone="warning">Showing a synthetic sample dataset, not Azure DevOps data. Refresh from Azure to replace it.</Notice>}
    {error && <Notice tone="error">{error} Previously loaded data has been retained.</Notice>}
    {message && <Notice className="notice-dismissible"><span>{message}</span><button type="button" className="notice-close" aria-label="Dismiss message" onClick={() => azure.setMessage('')}>×</button></Notice>}
  </div>
}
