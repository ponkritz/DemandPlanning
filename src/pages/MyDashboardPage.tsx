import { capacityContext, itemsForPerson, problemBreakdown } from '../capacity'
import { monthRange, personMonths, streamTotals, totals } from '../dashboard'
import { isMine, isPending, stateChecks } from '../myWork'
import { formatDate, formatHours, formatPercent, monthName, todayIso } from '../format'
import { EmptyState, Metric, Metrics, Page, Pill, TablePanel } from '../components/ui'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { MyWork } from '../useMyWork'
import type { Page as PageId } from './registry'
import type { PageProps } from './types'
import type { PersonalViewsStore } from '../usePersonalViews'
import { CustomizableSections } from '../components/PersonalLayout'

// My dashboard (MYD-01…MYD-04): every user's start page — their own hours against their capacity, their open work and
// their streams and releases, for the header month. Each count opens the page with the detail.
export function MyDashboardPage({ month, azure, store, my, navigate, views, canSetDefault = false }: { month: string; azure: AzureWorkspace; store: PageProps['store']; my: MyWork; navigate: (page: PageId) => void; views: PersonalViewsStore; canSetDefault?: boolean }) {
  if (!my.known) return <Page><EmptyState title="Who are you in Azure DevOps?" detail="Set your work email in Settings → Azure DevOps → Your work email, or choose your name on Assigned to Me. My dashboard then shows your own hours and work." /></Page>
  const settings = capacityContext(store.state)
  const today = todayIso()
  const name = my.me.name ?? ''
  const months = monthRange(month, 6)
  const rows = name ? personMonths(azure.items, months, today, settings).filter((row) => row.person === name) : []
  const now = totals(rows.filter((row) => row.month === month))
  const problems = problemBreakdown(itemsForPerson(azure.items, my.me, settings), [month], settings)
  const checks = stateChecks(azure.items, my.me, my.absenceEpicId)
  const count = (type: string) => my.pending.filter((row) => row.item.workItemType === type).length
  const toClose = checks.filter((check) => check.kind === 'close-feature' || check.kind === 'close-story').length
  const needsStory = checks.filter((check) => check.kind === 'feature-needs-active-story').length
  const streams = streamTotals(rows.filter((row) => row.month === month)).filter((stream) => stream.plan > 0 || stream.actual > 0)
  // Releases behind my Features: my open or closed Features whose Target Date falls in the month.
  const due = azure.items.filter((item) => item.workItemType === 'Feature' && isMine(item, my.me) && item.targetDate?.slice(0, 7) === month).sort((a, b) => (a.targetDate ?? '').localeCompare(b.targetDate ?? ''))
  const label = monthName(month)
  const open = (page: PageId, text: string) => <button type="button" className="text-button" onClick={() => navigate(page)}>{text} →</button>
  return <Page>
    <p className="muted">{name || my.me.email} · {label}</p>
    <CustomizableSections page="mydash" views={views} canSetDefault={canSetDefault} sections={[
      { id: 'hours', label: 'My hours', node: <>
    <TablePanel title={`My hours · ${label}`} info={<ul><li>Planned = Original Estimate and recorded = Completed Work of your month Time Writing Tasks; capacity = your working days less absence, as on the Dashboard.</li><li>Overrun = hours recorded above the estimate; ad-hoc = hours on Tasks tagged ad-hoc.</li></ul>} action={open('activities', 'My Activities')}>
      <Metrics>
        <Metric label="Planned" value={`${formatHours(now.plan)}h`} hint={`Capacity ${formatHours(now.capacity)}h`} />
        <Metric label="Recorded" value={`${formatHours(now.actual)}h`} hint={now.absence ? `${formatHours(now.absence)}h absence` : 'No absence booked'} />
        <Metric label="Utilization" value={formatPercent(now.actualUtil ?? now.planUtil)} hint={now.actualUtil != null ? 'Recorded ÷ capacity' : 'Planned ÷ capacity'} tone={(now.actualUtil ?? now.planUtil ?? 0) >= settings.overloadedAt ? 'negative' : undefined} />
        <Metric label="Overrun · ad-hoc" value={`${formatHours(problems.overrun.total)}h · ${formatHours(problems.adhoc.total)}h`} hint="Above estimate · tagged ad-hoc" />
      </Metrics>
      {rows.length > 0 ? <div className="azure-table"><table><thead><tr><th>Month</th><th>Planned</th><th>Recorded</th><th>Capacity</th><th>Utilization</th></tr></thead><tbody>
        {months.slice().reverse().map((entry) => { const row = totals(rows.filter((item) => item.month === entry)); return <tr key={entry} className={entry === month ? 'row-current' : ''}><td>{monthName(entry)}</td><td>{formatHours(row.plan)}h</td><td>{formatHours(row.actual)}h</td><td>{formatHours(row.capacity)}h</td><td>{formatPercent(row.actualUtil ?? row.planUtil)}</td></tr> })}
      </tbody></table></div> : <EmptyState title="No Time Writing hours for you yet." detail="Refresh Time Writing from Azure, or check that your name on Assigned to Me matches your Tasks." />}
    </TablePanel>
      </> },
      { id: 'work', label: 'My open work', node: <>
    <TablePanel title="My open work" info="Your New and Active work items (work under the absence Epic left out), and the state checks of Sprint check." action={open('mywork', 'Assigned to Me')}>
      <Metrics>
        <Metric label="Features" value={count('Feature')} hint="open, assigned to you" />
        <Metric label="User Stories" value={count('User Story')} hint={`${count('Task')} Tasks, ${count('Bug')} Bugs`} />
        <Metric label="Ready to close" value={toClose} hint="all children closed" tone={toClose ? 'negative' : undefined} />
        <Metric label="Features without an active story" value={needsStory} tone={needsStory ? 'negative' : undefined} />
      </Metrics>
      <div className="button-row">{open('mywork', 'Open my work')}{(toClose > 0 || needsStory > 0) && open('bulk', 'Fix in Sprint check')}</div>
    </TablePanel>
      </> },
      { id: 'streams', label: 'My streams and releases', node: <>
    <TablePanel title={`My streams and releases · ${label}`} info="The Epics you planned or recorded hours on in the month, and your Features with a Target Date in the month." empty={streams.length || due.length ? undefined : `No hours or Features due for you in ${label}.`}>
      {streams.length > 0 && <div className="azure-table"><table><thead><tr><th>Stream (Epic)</th><th>Planned</th><th>Recorded</th></tr></thead><tbody>
        {streams.map((stream) => <tr key={stream.key}><td>{stream.title}</td><td>{formatHours(stream.plan)}h</td><td>{formatHours(stream.actual)}h</td></tr>)}
      </tbody></table></div>}
      {due.length > 0 && <div className="azure-table"><table><thead><tr><th>Feature due in {label}</th><th>State</th><th>Target date</th></tr></thead><tbody>
        {due.map((item) => <tr key={item.key}><td><a href={item.url} target="_blank" rel="noreferrer">#{item.id}</a> {item.title}</td><td><Pill tone={isPending(item) ? 'open' : 'neutral'}>{item.state}</Pill></td><td>{item.targetDate ? formatDate(item.targetDate) : '—'}</td></tr>)}
      </tbody></table></div>}
    </TablePanel>
      </> },
    ]} />
  </Page>
}
