import { useState } from 'react'
import { loadUsage, setUsageEnabled, usageRows } from '../usageCounts'
import { formatDate } from '../format'
import { Panel } from './ui'

// NAV-45 My settings → My page usage: opt-in, this browser only.
export function UsagePanel() {
  const [usage, setUsage] = useState(loadUsage)
  const rows = usageRows(usage)
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  return <Panel className="connection-panel usage-panel" eyebrow="ONLY YOU · THIS BROWSER" title="My page usage" info="Counts how often you open each page, so you can see which ones you use. The counts stay in this browser: they are never sent anywhere, shared through Git, or put in a backup. Off unless you turn it on; turning it off deletes them.">
    <label className="check"><input type="checkbox" checked={usage.enabled} onChange={(event) => setUsage(setUsageEnabled(event.target.checked))} /> Count the pages I open (this browser only)</label>
    {usage.enabled && <>
      <p className="muted">{total ? `${total} opening${total === 1 ? '' : 's'} of ${rows.length} page${rows.length === 1 ? '' : 's'}` : 'Nothing counted yet'}{usage.since ? ` since ${formatDate(usage.since)}` : ''}.</p>
      {rows.length > 0 && <table className="azure-table usage-table"><thead><tr><th scope="col">Page</th><th scope="col">Opened</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}><th scope="row">{row.label}</th><td>{row.count}</td></tr>)}</tbody></table>}
      <div className="button-row"><button type="button" className="ghost" onClick={() => setUsage(setUsageEnabled(true))} disabled={!total}>Start again from zero</button></div>
    </>}
  </Panel>
}
