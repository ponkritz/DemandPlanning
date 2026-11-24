import { useState, useSyncExternalStore } from 'react'
import { isRunning, subscribeJobs } from '../backgroundJobs'
import type { ViewMeta } from '../personalViews'
import { useViewsForEveryone } from '../useViewsForEveryone'
import { Modal } from './ui'

// UI-20…UI-23 Save view for everyone (useViewsForEveryone keeps the views): the line in a Columns panel or beside a
// page's filters.

const dateOf = (at: string) => { const date = new Date(at); return Number.isNaN(date.getTime()) ? at : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }

// The line in a Columns panel or beside a page's filters: which view the viewer sees, "Use the view for everyone" for
// one with their own view, and for the Tool Owner Save view for everyone / Clear the view for everyone (confirmed).
export function ViewForEveryoneBar({ entryKey, what, source, hasEveryone, newer = false, canSave, meta, onUse, onSave, onClear, className = '' }: {
  className?: string; entryKey: string; what: string; source: 'own' | 'everyone' | 'table'; hasEveryone: boolean; newer?: boolean; canSave: boolean; meta?: ViewMeta
  onUse: () => void; onSave: () => void; onClear: () => void
}) {
  const busy = useSyncExternalStore(subscribeJobs, () => isRunning(`views-for-everyone:${entryKey}`))
  const [confirming, setConfirming] = useState(false)
  const own = source === 'own'
  if (!canSave && !(own && hasEveryone) && source !== 'everyone') return null
  return <div className={`view-for-everyone ${className}`.trim()} role="group" aria-label={`View for everyone: ${what}`}>
    {own && hasEveryone && (newer
      ? <span className="view-for-everyone-state">A new view for everyone is available — <button type="button" className="text-button" onClick={onUse}>Use it</button></span>
      : <span className="view-for-everyone-state">Your own view · <button type="button" className="text-button" onClick={onUse}>Use the view for everyone</button></span>)}
    {source === 'everyone' && <span className="view-for-everyone-state muted">The view for everyone{meta?.at ? `, saved by ${meta.by || 'a Tool Owner'} on ${dateOf(meta.at)}` : ''}</span>}
    {own && !hasEveryone && canSave && <span className="view-for-everyone-state muted">Your own view</span>}
    {source === 'table' && canSave && <span className="view-for-everyone-state muted">The built-in view</span>}
    {canSave && <span className="button-row">
      <button type="button" className="ghost" disabled={busy} title="Everyone who has not changed it sees this view; people with their own view keep theirs (saved to the shared views defaults in Git)" onClick={onSave}>{busy ? 'Saving…' : 'Save view for everyone'}</button>
      {hasEveryone && <button type="button" className="text-button danger-text" disabled={busy} onClick={() => setConfirming(true)}>Clear the view for everyone</button>}
    </span>}
    {confirming && <Modal title="Clear the view for everyone?" eyebrow="VIEW FOR EVERYONE" onClose={() => setConfirming(false)}>
      <p>{what}: the view saved for everyone is removed from the shared views defaults in Git. People who did not change it see the built-in view again; people with their own view keep theirs.</p>
      <div className="modal-actions"><button type="button" className="ghost" onClick={() => setConfirming(false)}>Cancel</button><button type="button" className="primary" onClick={() => { setConfirming(false); onClear() }}>Clear the view for everyone</button></div>
    </Modal>}
  </div>
}

// UI-23: a page's remembered filters (period, filters, tab) as a view for everyone: the viewer's own choice (their
// personal views) wins, else the one saved for everyone, else the page's built-in start. onUse applies a view to the page.
export function PageViewForEveryone({ entryKey, what, value, onUse }: { entryKey: string; what: string; value: unknown; onUse: (value: unknown) => void }) {
  const shared = useViewsForEveryone()
  const views = shared.views
  if (!views?.ownFilter) return null
  const own = views.ownFilter(entryKey) !== undefined
  const everyone = shared.everyone(entryKey)
  const meta = shared.meta(entryKey)
  const source = own ? 'own' : everyone !== undefined ? 'everyone' : 'table'
  return <ViewForEveryoneBar className="page-view-for-everyone" entryKey={entryKey} what={what} source={source} hasEveryone={everyone !== undefined} canSave={shared.canSave} meta={meta}
    onUse={() => { views.clearFilter(entryKey); if (everyone !== undefined) onUse(everyone) }}
    onSave={() => { shared.save(entryKey, value, what, () => views.clearFilter(entryKey)) }}
    onClear={() => { shared.clear(entryKey, what) }} />
}
