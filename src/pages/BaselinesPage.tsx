import { useState } from 'react'
import { EmptyState, Metric, Metrics, Notice, Page, Pill, TablePanel } from '../components/ui'
import { BaselineRulesEditor } from '../components/BaselineRulesEditor'
import { GitSyncBar } from '../components/GitStorage'
import type { GitStorage } from '../useGitStorage'
import { azureInsights } from '../azureInsights'
import { baselineHours, describeRule, normalizeRules, normalizeScopes, releaseBaselines, type BaselineRule, type ReleaseBaselineRow, type ScopeEntry } from '../baseline'
import { formatDate, formatHours, todayIso } from '../format'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { PageProps } from './types'

const scopeText = (rule: BaselineRule, entry: Pick<ScopeEntry, 'drivers'>) => rule.unitsPerDriver ? `${entry.drivers[rule.driver] ?? '?'} ${rule.driver}` : 'Fixed units only'

// canEdit: the viewer's access roles include editing baselines (a read-only Git token makes the page view-only too).
export function BaselinesPage({ azure, month, store, git, onOpenSettings, canEdit = true }: { azure: AzureWorkspace; month: string; store: PageProps['store']; git: GitStorage; onOpenSettings: () => void; canEdit?: boolean }) {
  const readOnly = git.readOnly || !canEdit
  const [today] = useState(todayIso)
  const [editing, setEditing] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const rules = normalizeRules(store.state.baselineRules)
  const scopes = normalizeScopes(store.state.releaseScopes)
  const releases = releaseBaselines(azure.items, rules, scopes)
  const scoped = releases.filter((row) => row.current)
  const totals = { baseline: scoped.reduce((sum, row) => sum + row.current!.total, 0), actual: scoped.reduce((sum, row) => sum + row.actual, 0), growth: scoped.reduce((sum, row) => sum + (row.growth ?? 0), 0) }
  const streams = [...new Set(azure.items.filter((item) => item.workItemType === 'Epic').map((item) => item.title))].sort()

  const data = azureInsights(azure.items, month, today)
  const rows = data.epicBreakdown.flatMap(group => data.monthlyTasks.filter(task => group.stories.some(story => story.id === task.parentId)).map(task => {
    const variance = task.originalEstimate == null || task.completedWork == null ? null : task.completedWork - task.originalEstimate
    const flagged = task.originalEstimate != null && task.originalEstimate > 0 && task.completedWork != null && task.completedWork > task.originalEstimate * 1.25
    return { group, task, variance, flagged }
  }))

  function saveRules(next: BaselineRule[]) {
    store.update((draft) => {
      draft.baselineRules = next
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Update', entity: 'BaselineRules', entityId: 'rules', detail: next.map(describeRuleLine).join(' | ') || 'All rules removed' })
      return draft
    })
  }

  function saveScope(row: ReleaseBaselineRow, entry: Omit<ScopeEntry, 'at'>) {
    store.update((draft) => {
      const at = new Date().toISOString()
      const current = normalizeScopes(draft.releaseScopes)
      const existing = current.find((scope) => scope.release === row.feature.title && scope.stream.toLowerCase() === row.stream.toLowerCase())
      draft.releaseScopes = existing ? current.map((scope) => scope === existing ? { ...scope, history: [...scope.history, { at, ...entry }] } : scope) : [...current, { release: row.feature.title, stream: row.stream, history: [{ at, ...entry }] }]
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: at, actor: 'u-owner', action: existing ? 'Re-baseline' : 'Baseline', entity: 'ReleaseScope', entityId: row.feature.title, detail: `${scopeText(row.rule, entry)} → ${formatHours(baselineHours(row.rule, entry).total)}h${entry.reason ? ` (${entry.reason})` : ''}` })
      return draft
    })
    setEditing(null)
  }

  return <Page>
    {canEdit ? <GitSyncBar git={git} onOpenSettings={onOpenSettings} /> : <Notice tone="info" className="git-bar">View only: your role does not include editing baselines. An Admin can change this in Settings → Access.</Notice>}
    <Metrics>
      <Metric label="Releases with a baseline" value={`${scoped.length} / ${releases.length}`} hint={`Features under ${rules.length} stream${rules.length === 1 ? '' : 's'} with estimation rules`} />
      <Metric label="Baseline" value={`${formatHours(totals.baseline)}h`} hint="Current scope × estimation rules" />
      <Metric label="Actual" value={`${formatHours(totals.actual)}h`} hint="Completed Work on those releases, all months" tone={totals.actual > totals.baseline && scoped.length ? 'negative' : undefined} />
      <Metric label="Scope growth" value={`${totals.growth >= 0 ? '+' : ''}${formatHours(totals.growth)}h`} hint="Current baseline minus first baseline" tone={totals.growth > 0 ? 'negative' : undefined} />
    </Metrics>
    <TablePanel className="admin-section" title="Release baselines" detail="Each release (Feature under a stream with rules) gets a baseline from its scope: the driver count (documents, assets, …) in the stream's formula. Changing the scope adds a dated entry, so re-baselining shows as scope growth instead of overwriting the first estimate." count={`${releases.length} releases`}>
      {releases.length ? <table className="baseline-table"><thead><tr><th>Stream</th><th>Release</th><th>Scope</th><th>Baseline (h)</th><th>Actual (h)</th><th>Variance (h)</th><th>Scope growth (h)</th><th /></tr></thead><tbody>{releases.map((row) => {
        const key = `${row.stream}|${row.feature.key}`
        return [
          <tr key={key}>
            <td>{row.stream}</td>
            <td><a href={row.feature.url} target="_blank" rel="noreferrer">#{row.feature.id} {row.feature.title}</a>{row.scope && row.scope.history.length > 1 && <button type="button" className="text-button small" onClick={() => setOpen(open === key ? null : key)}>{open === key ? 'Hide' : 'Show'} {row.scope.history.length} versions</button>}</td>
            <td>{row.scope ? scopeText(row.rule, row.scope.history[row.scope.history.length - 1]) : <Pill tone="warning">Not scoped</Pill>}{row.current && row.current.missing.length > 0 && <small>Missing {row.current.missing.join(', ')}</small>}</td>
            <td><strong>{row.current ? formatHours(row.current.total) : '—'}</strong>{row.current?.capped && <small>capped from {formatHours(row.current.uncapped)}h</small>}</td>
            <td>{formatHours(row.actual)}</td>
            <td className={row.variance != null && row.variance > 0 ? 'negative' : ''}>{row.variance == null ? '—' : `${row.variance > 0 ? '+' : ''}${formatHours(row.variance)}`}</td>
            <td className={row.growth ? 'negative' : ''}>{row.growth == null ? '—' : `${row.growth > 0 ? '+' : ''}${formatHours(row.growth)}`}</td>
            <td>{!readOnly && <button type="button" className="ghost" onClick={() => setEditing(editing === key ? null : key)}>{row.scope ? 'Re-baseline' : 'Set scope'}</button>}</td>
          </tr>,
          open === key && row.scope ? <tr key={`${key}-history`} className="baseline-history"><td /><td colSpan={7}><ol>{row.scope.history.map((entry, index) => <li key={entry.at}><strong>v{index + 1}</strong> {formatDate(entry.at)} · {scopeText(row.rule, entry)} → {formatHours(baselineHours(row.rule, entry).total)}h{entry.reason && <em> — {entry.reason}</em>}</li>)}</ol></td></tr> : null,
          editing === key && !git.readOnly ? <tr key={`${key}-edit`} className="baseline-edit"><td /><td colSpan={7}><ScopeForm row={row} onCancel={() => setEditing(null)} onSave={(entry) => saveScope(row, entry)} /></td></tr> : null,
        ]
      })}</tbody></table>
        : <EmptyState title={rules.length ? 'No releases found for the streams with rules.' : 'No estimation rules yet.'} detail={rules.length ? `Releases are the Features under the Epics ${rules.map((rule) => rule.stream).join(', ')}. Refresh from Azure DevOps or check the stream names in the rules below.` : 'Add a rule for a stream below.'} />}
    </TablePanel>
    <BaselineRulesEditor key={JSON.stringify(rules)} rules={rules} streams={streams} onSave={saveRules} readOnly={readOnly} />
    <h2 className="baseline-subhead">Task plan check · this month</h2>
    <Metrics>
        <Metric label="Month tasks" value={data.monthlyTasks.length} hint={`${data.paired.length} with both fields populated`} />
        <Metric label="Original Estimate" value={formatHours(data.plan.value)} hint={`${data.plan.count}/${data.plan.total} tasks populated`} />
        <Metric label="Completed Work" value={formatHours(data.actual.value)} hint={`${data.actual.count}/${data.actual.total} tasks populated`} />
        <Metric label="Variance" value={formatHours(data.variance)} hint={`${data.flags.length} task(s) above +25%`} tone={data.flags.length ? 'negative' : undefined} />
    </Metrics>
    <TablePanel title="Time Writing Tasks this month" detail="Completed Work minus Original Estimate on the same Task." count={`${rows.length} tasks`} empty={rows.length ? undefined : 'No selected-month Time Writing Tasks.'}>
      <table><thead><tr><th>Epic</th><th>Time Writing Task</th><th>Original Estimate</th><th>Completed Work</th><th>Variance</th><th>Signal</th></tr></thead><tbody>{rows.map(({ group, task, variance, flagged }) => <tr key={task.key}><td>{group.epic?.title ?? 'No Epic path'}</td><td><a href={task.url} target="_blank" rel="noreferrer">#{task.id} {task.title}</a></td><td>{formatHours(task.originalEstimate)}</td><td>{formatHours(task.completedWork)}</td><td className={variance != null && variance > 0 ? 'negative' : ''}>{formatHours(variance)}</td><td><Pill tone={flagged ? 'warning' : 'neutral'}>{flagged ? '>25%' : '—'}</Pill></td></tr>)}</tbody></table>
    </TablePanel>
  </Page>
}

const describeRuleLine = (rule: BaselineRule) => `${rule.stream}: ${describeRule(rule)}`

function ScopeForm({ row, onSave, onCancel }: { row: ReleaseBaselineRow; onSave: (entry: Omit<ScopeEntry, 'at'>) => void; onCancel: () => void }) {
  const last = row.scope?.history[row.scope.history.length - 1]
  const { driver } = row.rule, needsCount = row.rule.unitsPerDriver > 0
  const [count, setCount] = useState(last?.drivers[driver] != null ? String(last.drivers[driver]) : '')
  const [reason, setReason] = useState('')
  const entry = { drivers: needsCount && count !== '' && Number(count) >= 0 ? { [driver]: Number(count) } : {} }
  const result = baselineHours(row.rule, entry)
  const unchanged = last && JSON.stringify(last.drivers) === JSON.stringify(entry.drivers)
  return <form className="scope-form" onSubmit={(event) => { event.preventDefault(); onSave({ ...entry, ...(reason.trim() ? { reason: reason.trim() } : {}) }) }}>
    {needsCount && <label>{driver}<input type="number" min="0" step="1" required value={count} onChange={(event) => setCount(event.target.value)} /></label>}
    <label className="wide-field">Reason{last ? ' (e.g. items scoped in)' : ''}<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={last ? 'Why the scope changed' : 'Initial scope'} /></label>
    <div className="scope-result"><span>Baseline</span><strong>{formatHours(result.total)}h</strong><small>{describeRule(row.rule)} = {result.units} units × {row.rule.hoursPerUnit}h = {formatHours(result.uncapped)}h{result.capped ? ` · capped at ${formatHours(row.rule.cap)}h` : ''}</small></div>
    {unchanged && <Notice tone="warning">Same scope as the current baseline; saving adds a version with no change.</Notice>}
    <div className="button-row"><button type="submit" className="primary" disabled={result.missing.length > 0}>{last ? 'Save re-baseline' : 'Save baseline'}</button><button type="button" className="ghost" onClick={onCancel}>Cancel</button></div>
  </form>
}
