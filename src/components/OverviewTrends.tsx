import { useState } from 'react'
import { EmptyState, Info, Panel } from './ui'
import { HoursTrendChart } from './HoursTrendChart'
import { EpicMixChart, ParetoChart, UtilizationChart, UtilizationHeatmap } from './WorkloadCharts'
import { epicColors, shortFeatureTitle } from '../chartUtils'
import { monthlyHours, problemBreakdown, type CapacitySettings } from '../capacity'
import { formatHours, formatPercent } from '../format'
import type { AzureWorkItem } from '../domain'

type Level = 'feature' | 'epic'
function LevelToggle({ value, onChange }: { value: Level; onChange: (value: Level) => void }) {
  return <div className="viz-range" role="group" aria-label="Group by">{(['feature', 'epic'] as const).map((level) => <button key={level} type="button" className={value === level ? 'primary' : 'ghost'} aria-pressed={value === level} onClick={() => onChange(level)}>By {level === 'feature' ? 'Feature' : 'Epic'}</button>)}</div>
}

// Overview → Charts: hours and utilization by month, the person × month heatmap, Epic mix and the overrun / ad-hoc
// Pareto charts, over 6 or 12 months ending with the selected month.
export function OverviewTrends({ items, month, settings, setMonth }: { items: AzureWorkItem[]; month: string; settings: CapacitySettings; setMonth?: (month: string) => void }) {
  const [span, setSpan] = useState<6 | 12>(12)
  const trend = monthlyHours(items, month, span, settings)
  const trendTotals = trend.filter((point) => point.actual != null)
  const problems = problemBreakdown(items, trend.map((point) => point.month), settings)
  const [overrunLevel, setOverrunLevel] = useState<Level>('feature')
  const [adhocLevel, setAdhocLevel] = useState<Level>('epic')
  // Epic colours come from a fixed 12-month window so switching 6/12 months never repaints an Epic.
  const colors = epicColors(span === 12 ? trend : monthlyHours(items, month, 12, settings))
  return <>
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
  </>
}
