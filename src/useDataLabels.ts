import { useState } from 'react'
import { useTableDefaults } from './components/tableDesign'
import { chartLabelsOn, readChartLabels, saveChartLabel } from './chartLabels'

// UI-17: a chart's Data labels switch — its own choice on this computer, else the shared default. CHT-28: an On-Demand
// chart's owners may turn data labels on or off for everyone (`owner`); the viewer's own choice still wins.
export function useDataLabels(chart: string, owner?: boolean): [boolean, (on: boolean) => void] {
  const shared = useTableDefaults().chartDataLabels
  const [own, setOwn] = useState<Record<string, boolean>>(() => readChartLabels())
  return [chartLabelsOn(own, chart, owner ?? shared), (on: boolean) => { setOwn((current) => ({ ...current, [chart]: on })); saveChartLabel(chart, on) }]
}
