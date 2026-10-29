import { useMemo, useState, type ReactNode } from 'react'
import { EmptyState, Notice, Page, Panel, Pill, TablePanel } from '../components/ui'
import { MultiSelect } from '../components/MultiSelect'
import { DemandChart, Util } from './DashboardPage'
import { capacityContext, regions, resourceRoles, type Region, type ResourceRole } from '../capacity'
import { applyFilter, monthRange, noFilter, personMonths, streamTotals, type Bands, type DashboardFilter } from '../dashboard'
import { normalizeRules, normalizeScopes, releaseBaselines } from '../baseline'
import { streamCounts } from '../releaseOverview'
import { formatHours, monthName, todayIso } from '../format'
import { previousMonth } from '../pulseCheck'
import { buildMonthlyPack, capacityLine, monthLabel, noteLabels, sameMonthLastYear, supportedLine, yearMonths, yoyLine, type MonthlyPackNotes } from '../monthlyPack'
import { packStreamsOf, packUtilization } from '../packInputs'
import { useMonthlyPack } from '../useMonthlyPack'
import { completeness, cumulative, delta, exceptionKinds, exceptionQueue, insightCards, monthUtilization, questions, signedText, timelineHealth, type ExceptionKind, type InsightCard, type ReleaseSnapshot, type TimelineStream } from '../workspace'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { GitStorage } from '../useGitStorage'
import type { WindchillWorkspace } from '../useWindchill'
import type { PageProps } from './types'

// Insights workspace: a separate page beside the Dashboard (which is unchanged) after the Overview and "AI Insights"
// mock-ups — KPI tiles, the workload trend, releases this year against last year, the exception queue, the timeline
// health, and evidence-based insight cards that can be queued for the Monthly pack of the header month (workspace.ts).
const tabs = [['overview', 'Overview'], ['insights', 'Insights & monthly pack']] as const
type Tab = typeof tabs[number][0]
const tabKey = 'demand-planning-workspace-tab-v1', queueKey = 'demand-planning-workspace-queue-v1'
const list = <T extends string>(value: unknown, allowed?: readonly T[]) => Array.isArray(value) ? value.filter((entry): entry is T => typeof entry === 'string' && (!allowed || allowed.includes(entry as T))) : []
const loadTab = (): Tab => { try { const saved = localStorage.getItem(tabKey); return tabs.some(([key]) => key === saved) ? saved as Tab : 'overview' } catch { return 'overview' } }
const loadQueue = (): Record<string, string[]> => { try { const saved = JSON.parse(localStorage.getItem(queueKey) ?? '{}') as Record<string, unknown>; return Object.fromEntries(Object.entries(saved).filter(([key]) => /^\d{4}-\d{2}$/.test(key)).map(([key, value]) => [key, list(value).slice(0, 50)])) } catch { return {} } }
const short = (month: string) => new Intl.DateTimeFormat('en', { month: 'short', year: '2-digit' }).format(new Date(`${month}-01T00:00:00`))
const pct = (value: number | null | undefined) => value == null ? '—' : `${value.toFixed(1)}%`
const lines = (text: string | undefined) => (text ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
const tone: Record<InsightCard['tone'], 'open' | 'warning' | 'danger' | 'info'> = { ok: 'open', warning: 'warning', danger: 'danger', info: 'info' }

function Tile({ label, value, change, hint, tone: kind }: { label: string; value: ReactNode; change?: ReactNode; hint?: ReactNode; tone?: 'danger' | 'warning' | 'ok' }) {
  return <div className={`dash-card wsp-tile ${kind ? `dash-card-${kind}` : ''}`}><span>{label}</span><strong>{value}</strong>{change && <em className="wsp-change">{change}</em>}{hint && <small>{hint}</small>}</div>
}

// Completed releases, cumulative over the year's months: this year to the header month against the prior year.
function CumulativeChart({ year, thisYear, lastYear }: { year: number; thisYear: number[]; lastYear: number[] }) {
  const width = 520, height = 220, left = 36, right = 12, top = 16, bottom = 190
  const max = Math.max(1, ...thisYear, ...lastYear)
  const x = (index: number) => left + index / 11 * (width - left - right), y = (value: number) => bottom - value / max * (bottom - top)
  const path = (values: number[]) => values.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ')
  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return <div className="dash-chart wsp-chart">
    <div className="legend"><span><i className="dash-dot wsp-dot-now" />{year}</span><span><i className="dash-dot wsp-dot-before" />{year - 1}</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Completed releases, cumulative, ${year} against ${year - 1}`}>
      {[...new Set([0, Math.round(max / 2), max])].map((tick) => <g key={tick}><line className="wsp-grid" x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} /><text x={left - 6} y={y(tick) + 4} textAnchor="end">{tick}</text></g>)}
      {lastYear.length > 0 && <path d={path(lastYear)} className="wsp-line-before" />}
      {thisYear.length > 0 && <path d={path(thisYear)} className="wsp-line-now" />}
      {thisYear.map((value, index) => <circle key={index} cx={x(index)} cy={y(value)} r={3} className="wsp-dot-now"><title>{`${labels[index]} ${year}: ${value} releases so far`}</title></circle>)}
      {labels.map((label, index) => <text key={label} x={x(index)} y={height - 8} textAnchor="middle">{label}</text>)}
    </svg>
  </div>
}

function Stacked({ stream }: { stream: TimelineStream }) {
  const parts: [string, number, string][] = [['completed', stream.completed, 'Completed'], ['risk', stream.atRisk, 'At risk'], ['overdue', stream.overdue, 'Overdue'], ['planned', stream.planned - stream.completed - stream.atRisk - stream.overdue, 'Planned']]
  return <div className="wsp-stack" role="img" aria-label={parts.map(([, count, label]) => `${count} ${label.toLowerCase()}`).join(', ')}>{parts.filter(([, count]) => count > 0).map(([key, count, label]) => <i key={key} className={`wsp-stack-${key}`} style={{ flex: count }} title={`${count} ${label.toLowerCase()}`} />)}</div>
}

function Bars({ bars, unit }: { bars: InsightCard['bars']; unit: string }) {
  const max = Math.max(1, ...bars.map((bar) => Math.abs(bar.value)))
  return <div className="wsp-bars" aria-label={unit}>{bars.map((bar) => <div key={bar.label} className="wsp-bar"><span title={bar.label}>{bar.label}</span><div className="wsp-bar-track"><i style={{ width: `${Math.max(2, Math.abs(bar.value) / max * 100)}%` }} /></div><b>{bar.text}</b></div>)}</div>
}

function Card({ card, queued, onQueue, open, setOpen }: { card: InsightCard; queued: boolean; onQueue: () => void; open: boolean; setOpen: (open: boolean) => void }) {
  return <article id={`wsp-card-${card.id}`} className={`wsp-card wsp-card-${card.tone}`} aria-label={card.title}>
    <div className="wsp-card-head"><h4>{card.title}</h4><Pill tone={tone[card.tone]}>{card.tone === 'ok' ? 'As expected' : card.tone === 'info' ? 'No data' : card.tone === 'warning' ? 'Worth a look' : 'Needs attention'}</Pill></div>
    <p>{card.text}</p>
    <small className="muted">{card.filters} · {card.quality}</small>
    {card.bars.length > 0 && <Bars bars={card.bars} unit={card.barsTitle} />}
    <div className="wsp-card-actions">
      {card.evidence.rows.length > 0 && <button type="button" className="text-button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide evidence' : `Source evidence (${card.evidence.rows.length})`}</button>}
      <button type="button" className="ghost" disabled={!card.packLine || queued} onClick={onQueue}>{queued ? 'In the queue' : 'Add to monthly pack'}</button>
    </div>
    {open && card.evidence.rows.length > 0 && <div className="azure-table"><table><thead><tr>{card.evidence.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{card.evidence.rows.map((row, index) => <tr key={index}>{row.map((cell, at) => <td key={at}>{cell}</td>)}</tr>)}</tbody></table></div>}
  </article>
}

export function WorkspacePage({ month, azure, store, git, windchill }: { month: string; azure: AzureWorkspace; store: PageProps['store']; git: GitStorage; windchill: WindchillWorkspace }) {
  const settings = capacityContext(store.state)
  const bands: Bands = { overloadedAt: settings.overloadedAt, availableBelow: settings.availableBelow }
  const [tab, setTabState] = useState<Tab>(loadTab)
  const setTab = (next: Tab) => { setTabState(next); try { localStorage.setItem(tabKey, next) } catch { /* convenience only */ } }
  const [filter, setFilter] = useState<DashboardFilter>(noFilter)
  const [kind, setKind] = useState<ExceptionKind | 'all'>('all')
  const [openCard, setOpenCard] = useState<string | null>(null)
  const [queues, setQueues] = useState<Record<string, string[]>>(loadQueue)
  const [status, setStatus] = useState<{ tone: 'info' | 'success' | 'error'; text: string; url?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const pack = useMonthlyPack(git, month)
  const today = todayIso()
  const previous = previousMonth(month), lastYear = sameMonthLastYear(month)
  const year = Number(month.slice(0, 4))
  const trendMonths = useMemo(() => monthRange(month, 12), [month])
  const allMonths = useMemo(() => [...new Set([...trendMonths, previous, lastYear, ...yearMonths(month)])].sort(), [trendMonths, previous, lastYear, month])
  const everyone = useMemo(() => personMonths(azure.items, allMonths, today, settings), [azure.items, allMonths, today, settings])
  const rows = useMemo(() => applyFilter(everyone, filter), [everyone, filter])
  const trendRows = useMemo(() => rows.filter((row) => trendMonths.includes(row.month)), [rows, trendMonths])
  const people = useMemo(() => [...new Set(everyone.map((row) => row.person))].sort((a, b) => a.localeCompare(b)), [everyone])
  const streamOptions = useMemo(() => streamTotals(everyone), [everyone])
  const filtered = Boolean(filter.regions.length || filter.roles.length || filter.people.length || filter.streams.length)
  const filterText = filtered ? `Filters: ${[filter.regions.length && `region ${filter.regions.join('/')}`, filter.roles.length && `role ${filter.roles.join('/')}`, filter.people.length && `${filter.people.length} team member${filter.people.length === 1 ? '' : 's'}`, filter.streams.length && 'stream'].filter(Boolean).join(', ')}` : 'Filters: none'
  const baselines = useMemo(() => releaseBaselines(azure.items, normalizeRules(store.state.baselineRules), normalizeScopes(store.state.releaseScopes)), [azure.items, store.state.baselineRules, store.state.releaseScopes])
  const thisYearMonths = useMemo(() => Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`), [year])
  const lastYearMonths = useMemo(() => thisYearMonths.map((entry) => sameMonthLastYear(entry)), [thisYearMonths])
  const countMonths = useMemo(() => [...new Set([previous, ...thisYearMonths, ...lastYearMonths])].sort(), [previous, thisYearMonths, lastYearMonths])
  const counts = useMemo(() => streamCounts(store.state, azure.connectionProfiles, countMonths), [store.state, azure.connectionProfiles, countMonths])
  const snapshot = (at: string): ReleaseSnapshot => ({ month: at, streams: counts.map((stream) => ({ name: stream.name, releases: stream.months.find((entry) => entry.month === at)?.releases ?? 0, notSetUp: stream.notSetUp })) })
  const releasesIn = (at: string) => snapshot(at).streams.filter((stream) => !stream.notSetUp).reduce((sum, stream) => sum + stream.releases, 0)
  const hasLastYear = lastYearMonths.some((at) => releasesIn(at) > 0) || everyone.some((row) => row.month === lastYear && (row.plan > 0 || row.actual > 0))
  const timeline = useMemo(() => timelineHealth(azure.items, today), [azure.items, today])
  const regionOf = (person: string) => settings.profiles?.[person]?.region
  const queue = useMemo(() => exceptionQueue({ baselines, rows, month, bands, regionOf }), [baselines, rows, month, bands, settings.profiles]) // eslint-disable-line react-hooks/exhaustive-deps
  const previousQueue = exceptionQueue({ baselines, rows, month: previous, bands, regionOf })
  const util = monthUtilization(rows, month), utilBefore = monthUtilization(rows, previous)
  const complete = completeness(rows, month), completeBefore = completeness(rows, previous)
  const releases = delta(releasesIn(month), releasesIn(previous))
  const cards = useMemo(() => insightCards({ month, rows, bands, baselines, releases: { now: snapshot(month), previous: snapshot(previous), ...(hasLastYear ? { lastYear: snapshot(lastYear) } : {}) }, timeline, filters: filterText }), [month, rows, bands, baselines, counts, timeline, filterText, hasLastYear]) // eslint-disable-line react-hooks/exhaustive-deps
  const shownQueue = kind === 'all' ? queue : queue.filter((row) => row.kind === kind)
  const kindCounts = (list: typeof queue) => (Object.keys(exceptionKinds) as ExceptionKind[]).map((key) => [key, list.filter((row) => row.kind === key).length] as const)
  const cumulativeNow = cumulative(thisYearMonths.filter((at) => at <= month).map(releasesIn)), cumulativeBefore = cumulative(lastYearMonths.map(releasesIn))
  const hasData = everyone.length > 0 || counts.some((stream) => stream.releases > 0) || baselines.length > 0

  // Monthly pack of the header month for the preview and the queue.
  const packInputs = useMemo(() => ({ streamsOf: (at: string) => packStreamsOf(store.state, azure.connectionProfiles, windchill, at), utilization: packUtilization(azure.items, month, settings) }), [store.state, azure.connectionProfiles, windchill, azure.items, month, settings])
  const built = useMemo(() => buildMonthlyPack({ month, setup: pack.setup, notes: pack.notes, items: azure.items, ...packInputs }), [month, pack.setup, pack.notes, azure.items, packInputs])
  const queued = queues[month] ?? []
  const setQueue = (next: string[]) => setQueues((current) => { const value = { ...current, [month]: next }; try { localStorage.setItem(queueKey, JSON.stringify(value)) } catch { /* convenience only */ } return value })
  const editable = git.connected && !git.readOnly && !git.isSample
  async function saveQueue() {
    setBusy(true); setStatus({ tone: 'info', text: 'Saving to the monthly pack in Git…' })
    try {
      const existing = lines(pack.notes.text.keyTakeaways)
      const notes: MonthlyPackNotes = { ...pack.notes, text: { ...pack.notes.text, keyTakeaways: [...existing, ...queued.filter((line) => !existing.includes(line))].join('\n') } }
      const result = await pack.saveNotes(notes, `Monthly pack ${month}: insights from the workspace`)
      setQueue([]); setStatus({ tone: 'success', text: `${queued.length} insight${queued.length === 1 ? '' : 's'} added to Key takeaways of the ${monthLabel(month)} pack.`, url: result.commitUrl })
    } catch (failure) { setStatus({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }) }
    finally { setBusy(false) }
  }
  const jump = (target: typeof questions[number]['target']) => {
    const [where, detail] = target.split(':') as [string, string | undefined]
    if (where === 'card') { setTab('insights'); setOpenCard(detail ?? null) } else { setTab('overview'); if (where === 'queue') setKind((detail as ExceptionKind | undefined) ?? 'all') }
    const id = where === 'card' ? `wsp-card-${detail}` : where === 'queue' ? 'wsp-queue' : 'wsp-timeline'
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  return <Page className="wsp" intro={`${monthName(month)} from the header month · the Dashboard is unchanged; this page reads the same data with rules that show their evidence.`}>
    <div className="overview-tabs dash-tabs" role="tablist" aria-label="Workspace sections">{tabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={`backlog-tab ${tab === key ? 'backlog-tab-active' : ''}`} onClick={() => setTab(key)}>{label}</button>)}</div>
    {!hasData ? <EmptyState title="Nothing to show yet." detail="Fetch Time Writing from Azure DevOps, set up the release streams, or load the synthetic sample." /> : <>
      <div className="dash-filters" role="group" aria-label="Workspace filters">
        <MultiSelect label="Region" options={regions.map((region) => [region, region])} value={filter.regions} onChange={(value) => setFilter({ ...filter, regions: value as Region[] })} />
        <MultiSelect label="Role" options={resourceRoles.map((role) => [role, role])} value={filter.roles} onChange={(value) => setFilter({ ...filter, roles: value as ResourceRole[] })} />
        <MultiSelect label="Team member" options={people.map((name) => [name, name])} value={filter.people} onChange={(value) => setFilter({ ...filter, people: value })} />
        <MultiSelect label="Stream" options={streamOptions.map((stream) => [stream.key, stream.title])} value={filter.streams} onChange={(value) => setFilter({ ...filter, streams: value })} />
        <button type="button" className="ghost" disabled={!filtered} onClick={() => setFilter(noFilter)}>Reset filters</button>
      </div>
      <div className="dash-cards dash-cards-4 wsp-tiles" aria-label="Key figures">
        <Tile label={`Planned utilization · ${short(month)}`} value={<Util value={util.plan} bands={bands} />} change={`${signedText(delta(util.plan, utilBefore.plan).delta, ' pp')} vs ${short(previous)}`} hint={`${formatHours(util.planHours)}h planned / ${formatHours(util.capacity)}h capacity · actual ${pct(util.actual)}`} />
        <Tile label={`Releases completed · ${short(month)}`} value={releases.value ?? 0} change={`${signedText(releases.delta)} vs ${short(previous)}`} hint={`${counts.filter((stream) => !stream.notSetUp).length} streams counted as in Pulse Check`} />
        <Tile label="Exceptions" value={queue.length} tone={queue.some((row) => row.severity === 'high') ? 'danger' : queue.length ? 'warning' : 'ok'} change={`${signedText(queue.length - previousQueue.length)} vs ${short(previous)}`} hint={kindCounts(queue).map(([key, count]) => `${count} ${exceptionKinds[key].toLowerCase()}`).join(' · ')} />
        <Tile label={`Data completeness · ${short(month)}`} value={pct(complete.percent)} tone={complete.percent == null ? undefined : complete.percent >= 90 ? 'ok' : complete.percent >= 70 ? 'warning' : 'danger'} change={`${signedText(delta(complete.percent, completeBefore.percent).delta, ' pp')} vs ${short(previous)}`} hint={complete.planLines ? `${complete.planLines - complete.blankActuals} of ${complete.planLines} planned Tasks with actuals${complete.unmapped.length ? ` · ${complete.unmapped.length} without region or role` : ''}` : util.status === 'future' ? 'A future month has nothing to record yet' : 'No planned Tasks in the month'} />
      </div>
      {tab === 'overview' && <>
        <div className="dash-grid-wide">
          <Panel title="Workload and capacity trend" info={`The twelve months to ${monthName(month)} for the selected people: planned (Original Estimate), recorded (Completed Work) and net capacity, as on the Dashboard.`}>{trendRows.length ? <DemandChart rows={trendRows} months={trendMonths} /> : <p className="muted">No Time Writing data in the twelve months.</p>}</Panel>
          <Panel title="Releases completed, cumulative" info={`Completed releases of every stream, summed from January: ${year} to ${monthName(month)} against ${year - 1}, counted as in Pulse Check (DP and IOCC per their document rules, the other streams by approved documents).`}><CumulativeChart year={year} thisYear={cumulativeNow} lastYear={hasLastYear ? cumulativeBefore : []} />{!hasLastYear && <small className="muted">No data for {year - 1} yet.</small>}</Panel>
        </div>
        <TablePanel className="wsp-queue" title={`Exception queue (${shownQueue.length})`} info={<><p><strong>Over 25% baseline</strong>: booked hours above the release's current baseline (Baselines page) by more than 25%; high at 50%. <strong>Missing baseline</strong>: an open release under a stream with an estimation rule but no scope. <strong>Capacity risk</strong>: a person planned at or above {bands.overloadedAt}% of capacity in {monthName(month)}; high at {bands.overloadedAt + 20}%. High first, then by impact.</p></>}
          action={<div className="chip-row" role="group" aria-label="Exception kind"><button type="button" className={`chip ${kind === 'all' ? 'chip-on' : ''}`} aria-pressed={kind === 'all'} onClick={() => setKind('all')}>All <b>{queue.length}</b></button>{kindCounts(queue).map(([key, count]) => <button key={key} type="button" className={`chip ${kind === key ? 'chip-on' : ''}`} aria-pressed={kind === key} onClick={() => setKind(key)}>{exceptionKinds[key]} <b>{count}</b></button>)}</div>}>
          <div id="wsp-queue" />
          {shownQueue.length ? <table><thead><tr><th>#</th><th>Item</th><th>Stream</th><th>Region</th><th>Issue</th><th>Impact</th><th>Severity</th><th>Owner</th><th>Target date</th></tr></thead><tbody>
            {shownQueue.map((row, index) => <tr key={row.key}><td>{index + 1}</td><td>{row.url ? <a href={row.url} target="_blank" rel="noreferrer">{row.title}</a> : row.title}</td><td>{row.stream}</td><td>{row.region || '—'}</td><td><Pill tone={row.kind === 'over-baseline' ? 'danger' : row.kind === 'capacity-risk' ? 'warning' : 'info'}>{exceptionKinds[row.kind]}</Pill></td><td>{row.impact}</td><td><Pill tone={row.severity === 'high' ? 'danger' : 'warning'}>{row.severity === 'high' ? 'High' : 'Medium'}</Pill></td><td>{row.owner || '—'}</td><td>{row.targetDate ? row.targetDate.slice(0, 10) : '—'}</td></tr>)}
          </tbody></table> : <p className="muted">No exceptions of this kind.</p>}
        </TablePanel>
        <TablePanel className="wsp-timeline" title={`Timeline health · ${timeline.totals.planned} Features due by ${timeline.to}`} info={<p>Features (not Removed) with a Target Date from the first day of this month to six months ahead, per Epic. <strong>Completed</strong> = finished state; <strong>Overdue</strong> = open with the date gone; <strong>At risk</strong> = open and due within 30 days; the rest are <strong>Planned</strong>. Features without a Target Date are not on the timeline.</p>}>
          <div id="wsp-timeline" />
          <div className="dash-cards dash-cards-4"><Tile label="Planned" value={timeline.totals.planned} /><Tile label="Completed" value={timeline.totals.completed} tone="ok" /><Tile label="At risk" value={timeline.totals.atRisk} tone={timeline.totals.atRisk ? 'warning' : undefined} /><Tile label="Overdue" value={timeline.totals.overdue} tone={timeline.totals.overdue ? 'danger' : undefined} /></div>
          {timeline.streams.length ? <table><thead><tr><th>Stream</th><th>Features</th><th>Progress</th><th>Completed</th><th>At risk</th><th>Overdue</th></tr></thead><tbody>
            {timeline.streams.map((stream) => <tr key={stream.name}><td><strong>{stream.name}</strong></td><td>{stream.planned}</td><td className="wsp-stack-cell"><Stacked stream={stream} /></td><td>{stream.completed}</td><td>{stream.atRisk}</td><td>{stream.overdue}</td></tr>)}
          </tbody></table> : <p className="muted">No Feature carries a Target Date in the window.</p>}
          <div className="legend wsp-legend"><span><i className="dash-dot wsp-stack-completed" />Completed</span><span><i className="dash-dot wsp-stack-risk" />At risk</span><span><i className="dash-dot wsp-stack-overdue" />Overdue</span><span><i className="dash-dot wsp-stack-planned" />Planned</span></div>
        </TablePanel>
      </>}
      {tab === 'insights' && <div className="wsp-insights">
        <div className="wsp-cards">
          <Panel eyebrow="EVIDENCE-BASED INSIGHTS" title={`${cards.length} findings for ${monthName(month)}`} info="Each card is a rule over the app's data (its threshold and the rows it checked are on the card), not a language model: nothing leaves the device. Add a card to the queue and save the queue into the Key takeaways of the month's Monthly pack in Git.">
            <div className="wsp-card-grid">{cards.map((card) => <Card key={card.id} card={card} queued={queued.includes(card.packLine)} onQueue={() => setQueue([...queued, card.packLine])} open={openCard === card.id} setOpen={(open) => setOpenCard(open ? card.id : null)} />)}</div>
          </Panel>
          <Panel eyebrow="QUESTIONS" title="Ask the data" info="The questions the mock-up suggests, answered by the sections that hold the evidence. There is no free-text question: that needs a language model, which would send team data off the device (KNOWN-ISSUES LIM-09).">
            <div className="chip-row">{questions.map((question) => <button key={question.id} type="button" className="chip" onClick={() => jump(question.target)}>{question.text}</button>)}</div>
          </Panel>
        </div>
        <div className="wsp-side">
          <Panel eyebrow="MONTHLY PRESENTATION PREVIEW" title={`${monthLabel(month)} pack`} info="A preview of the Monthly pack of the header month: the generated figures and the text already saved for the month (Pulse Check → Monthly pack keeps the full slides, the editing and the .pptx download).">
            <div className="wsp-slide">
              <h4>1 · Monthly Performance Review</h4>
              <div className="wsp-mini-tiles"><div><span>Utilization</span><strong>{pct(built.utilization.month)}</strong></div><div><span>Releases</span><strong>{releases.value ?? 0}</strong></div><div><span>Exceptions</span><strong>{queue.length}</strong></div><div><span>Data complete</span><strong>{pct(complete.percent)}</strong></div></div>
              <ul>{[capacityLine(built), supportedLine(built) ? `Supported: ${supportedLine(built)}` : '', yoyLine(built)].filter(Boolean).map((line) => <li key={line}>{line}</li>)}</ul>
            </div>
            <div className="wsp-slide">
              <h4>2 · Actions and Lessons Learned</h4>
              <div className="wsp-slide-cols">
                <div><h5>Key actions taken</h5>{lines(pack.notes.text.keyTakeaways).concat(lines(pack.notes.text.nextSteps)).length ? <ul>{lines(pack.notes.text.keyTakeaways).concat(lines(pack.notes.text.nextSteps)).map((line, index) => <li key={index}>{line}</li>)}</ul> : <p className="muted">Nothing saved yet — queue insights below or type in Pulse Check → Monthly pack.</p>}</div>
                <div><h5>Outcomes</h5><ul>{built.lines.filter((line) => line.releases.length).map((line) => <li key={line.id}>{line.label}: {line.releases.length} release{line.releases.length === 1 ? '' : 's'}</li>)}{built.overall.change != null && <li>YoY supported {signedText(built.overall.change, '%')}</li>}</ul></div>
                <div><h5>Lessons learned</h5>{lines(pack.notes.text.observations).length ? <ul>{lines(pack.notes.text.observations).map((line, index) => <li key={index}>{line}</li>)}</ul> : <p className="muted">{noteLabels.observations}: nothing saved yet.</p>}</div>
              </div>
            </div>
          </Panel>
          <Panel eyebrow="YOUR INSIGHTS QUEUE" title={`${queued.length} queued for ${monthLabel(month)}`} info="Kept in this browser per month until saved. Save adds the lines to the Key takeaways of the month's pack in Git (a token that can write; refused in sample mode)." action={<button type="button" className="primary" disabled={!queued.length || !editable || busy} onClick={() => void saveQueue()}>Save to monthly pack</button>}>
            {queued.length ? <ul className="wsp-queue-list">{queued.map((line) => <li key={line}><span>{line}</span><button type="button" className="text-button" aria-label={`Remove: ${line}`} onClick={() => setQueue(queued.filter((entry) => entry !== line))}>×</button></li>)}</ul> : <p className="muted">Nothing queued. Use "Add to monthly pack" on a card.</p>}
            {!editable && queued.length > 0 && <small className="muted">{git.isSample ? 'Synthetic sample data is loaded: the queue cannot be saved.' : 'Saving needs Git connected with a token that can write.'}</small>}
            {status && <Notice tone={status.tone}>{status.text}{status.url && <> <a href={status.url} target="_blank" rel="noreferrer">commit</a></>}</Notice>}
          </Panel>
        </div>
      </div>}
    </>}
  </Page>
}
