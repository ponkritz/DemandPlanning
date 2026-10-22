import { useState } from 'react'
import { EmptyState, Info, Page, Panel } from '../components/ui'
import { HoursTrendChart } from '../components/HoursTrendChart'
import { CapacityMetrics, MonthSections } from '../components/MonthOverview'
import { EpicMixChart, ParetoChart, UtilizationChart, UtilizationHeatmap } from '../components/WorkloadCharts'
import { epicColors, shortFeatureTitle } from '../chartUtils'
import { ScopeSwitch } from '../components/ScopeSwitch'
import { usePersonScope, useTeamFilter } from '../usePersonScope'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { MyWork } from '../useMyWork'
import { TeamFilterBar } from '../components/TeamFilterBar'
import { capacityContext, capacityModel, itemsForPerson, itemsForTeam, teamFiltered, monthlyHours, problemBreakdown } from '../capacity'
import { formatHours, formatPercent, monthName } from '../format'
import type { Page as PageId } from './registry'
import type { PageProps } from './types'

type Level = 'feature' | 'epic'

function LevelToggle({ value, onChange }: { value: Level; onChange: (value: Level) => void }) {
  return <div className="viz-range" role="group" aria-label="Group by">{(['feature', 'epic'] as const).map((level) => <button key={level} type="button" className={value === level ? 'primary' : 'ghost'} aria-pressed={value === level} onClick={() => onChange(level)}>By {level === 'feature' ? 'Feature' : 'Epic'}</button>)}</div>
}

export function DashboardPage({ month, azure, navigate, store, setMonth, my }: { month: string; azure: AzureWorkspace; navigate: (page: PageId) => void; store: PageProps['store']; setMonth?: (month: string) => void; my: MyWork }) {
  const settings = capacityContext(store.state)
  const personScope = usePersonScope('demand-planning-overview-view-v1', 'team', my)
  // Two tabs: this month's capacity picture, and the monthly-review trends; the last one opened is remembered.
  const [tab, setTabState] = useState<'month' | 'trends'>(() => { try { return localStorage.getItem('demand-planning-overview-tab-v1') === 'trends' ? 'trends' : 'month' } catch { return 'month' } })
  const setTab = (next: 'month' | 'trends') => { setTabState(next); try { localStorage.setItem('demand-planning-overview-tab-v1', next) } catch { /* convenience only */ } }
  const { scope, individual, who } = personScope
  const [teamFilter, setTeamFilter] = useTeamFilter()
  const teamLabel = teamFiltered(teamFilter) ? [teamFilter.region, teamFilter.roles.join(', ')].filter(Boolean).join(' · ') : 'Team'
  const items = scope ? itemsForPerson(azure.items, scope, settings) : individual ? [] : itemsForTeam(azure.items, teamFilter, settings)
  const model = capacityModel(items, month, settings)
  const [span, setSpan] = useState<6 | 12>(12)
  const trend = monthlyHours(items, month, span, settings)
  const trendTotals = trend.filter((point) => point.actual != null)
  const problems = problemBreakdown(items, trend.map((point) => point.month), settings)
  const [overrunLevel, setOverrunLevel] = useState<Level>('feature')
  const [adhocLevel, setAdhocLevel] = useState<Level>('epic')
  // Epic colours come from a fixed 12-month window so switching 6/12 months never repaints an Epic.
  const colors = epicColors(span === 12 ? trend : monthlyHours(items, month, 12, settings))
  return <Page>
    <ScopeSwitch scope={personScope} label="Overview for" note="Only this person’s Tasks; regional holidays still apply by region." />
    {!individual && <TeamFilterBar filter={teamFilter} onChange={setTeamFilter} />}
    {individual && !scope ? <EmptyState title="Choose whose overview to show." detail="Pick a person above, or set your Azure email on the Time Writing connection to make “Me” the default." /> : <>
    <CapacityMetrics model={model} settings={settings} label={individual ? `${who} · utilization` : `${teamLabel} utilization`} />
    <div className="overview-tabs" role="tablist" aria-label="Overview sections">{([['month', `This month · ${monthName(month)}`], ['trends', 'Trends']] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={`backlog-tab ${tab === key ? 'backlog-tab-active' : ''}`} onClick={() => setTab(key)}>{label}</button>)}</div>
    {tab === 'month' ? <>
    <MonthSections items={items} month={month} settings={settings} navigate={navigate} />
    </> : <>
    <div className="viz-filters" role="group" aria-label="Months shown"><span>Months shown</span>{([6, 12] as const).map((value) => <button key={value} type="button" className={span === value ? 'primary' : 'ghost'} aria-pressed={span === value} onClick={() => setSpan(value)}>{value} months</button>)}{trendTotals.length > 0 && <span className="record-count">{trendTotals.length} month{trendTotals.length === 1 ? '' : 's'} with bookings · click a month in any chart to select it</span>}</div>
    {trendTotals.length ? <>
      <Panel className="viz-panel" title="Hours by month" info={`Funded = people × working days × ${settings.hoursPerDay}h; available = funded − absence; actual = booked Completed Work.`}>
        <HoursTrendChart series={trend} selected={month} onSelect={setMonth} defaultView="table" />
      </Panel>
      <Panel className="viz-panel" title="Utilization by month" info="Bars: actual = booked Completed Work ÷ available hours. Line: planned = Original Estimate ÷ available hours. Reference lines are the thresholds set in Settings.">
        <UtilizationChart series={trend} selected={month} onSelect={setMonth} overloadedAt={settings.overloadedAt} availableBelow={settings.availableBelow} />
      </Panel>
      <Panel className="viz-panel" title="Utilization by person and month" info={`Each cell is that person's booked ÷ available hours. Grey is ${settings.overloadedAt}% (the overloaded threshold); deeper blue = more spare capacity, deeper red = more overloaded. Sorted by average; click a month to select it.`}>
        <UtilizationHeatmap series={trend} selected={month} onSelect={setMonth} midpoint={settings.overloadedAt} />
      </Panel>
      <Panel className="viz-panel" title="Epic mix by month" info="Stacked bars: booked hours per Epic (the five largest over the last 12 months keep their colour; the rest are grouped as Other Epics). Line: available hours on the same scale.">
        <EpicMixChart series={trend} selected={month} onSelect={setMonth} colors={colors} />
      </Panel>
      <div className="viz-section"><p className="eyebrow">PROBLEM ANALYSIS · LAST {span} MONTHS</p><h2>Where overruns and unplanned work concentrate <Info>Pareto charts rank causes: the few Features or Epics up to the 80% line account for most of the problem, so they are where to act first. Scoped by Months shown.</Info></h2></div>
      <Panel className="viz-panel" title="Overrun hours" detail={`${formatHours(problems.overrun.total)}h above estimate on ${problems.overrun.tasks} Task${problems.overrun.tasks === 1 ? '' : 's'}`} info="Completed Work above Original Estimate, per Task. Tasks without an estimate cannot overrun; unplanned work is counted under Ad-hoc hours." action={<LevelToggle value={overrunLevel} onChange={setOverrunLevel} />}>
        <ParetoChart items={problems.overrun[overrunLevel]} colors={colors} noun={overrunLevel === 'feature' ? 'Feature' : 'Epic'} measure="overrun hours" shortLabel={overrunLevel === 'feature' ? shortFeatureTitle : undefined} />
      </Panel>
      <Panel className="viz-panel" title="Ad-hoc hours" detail={`${formatHours(problems.adhoc.total)}h on ${problems.adhoc.tasks} Task${problems.adhoc.tasks === 1 ? '' : 's'} — ${formatPercent(problems.adhoc.share)} of booked hours`} info="Hours on Tasks tagged ad-hoc: unplanned work that arrived after planning locked." action={<LevelToggle value={adhocLevel} onChange={setAdhocLevel} />}>
        <ParetoChart items={problems.adhoc[adhocLevel]} colors={colors} noun={adhocLevel === 'feature' ? 'Feature' : 'Epic'} measure="ad-hoc hours" shortLabel={adhocLevel === 'feature' ? shortFeatureTitle : undefined} />
      </Panel>
    </> : <Panel className="viz-panel" title="Hours by month"><EmptyState title="No Time Writing Tasks in this range." detail="Refresh from Azure or load the synthetic sample to see the trend." /></Panel>}
    </>}
    </>}
  </Page>
}
