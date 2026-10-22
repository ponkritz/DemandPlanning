import { Info, Panel, Pill } from './ui'
import { monthName } from '../format'
import type { timeWritingGaps } from '../azureInsights'

// Lists what the page did not pick up for the month and why, so naming or hierarchy problems are visible.
export function GapsPanel({ gaps, month }: { gaps: ReturnType<typeof timeWritingGaps>; month: string }) {
  const label = monthName(month)
  const total = gaps.storiesWithoutTask.length + gaps.tasksWithoutMonth.length + gaps.tasksWithoutFeature.length
  const link = (item: { id: number; title: string; url: string }) => <a href={item.url} target="_blank" rel="noreferrer">#{item.id} {item.title}</a>
  return <Panel className="admin-section gaps-panel" eyebrow="CHECK" title={total ? `Not picked up for ${label} (${total})` : `Everything picked up for ${label}`}
    info={<>A Task is counted for the month when its title starts or ends with the month and year, with any delimiter (“{label} | …”, “… - {label.slice(0, 3)} {month.slice(0, 4)}”, …). The story above it can have any name; the Feature and Epic come from the parent links. Only items in the saved backlog are checked — the team’s Epic backlog and area paths, or a Time Writing connection’s query — so refresh from Azure and save the preview after adding items.</>}>
    {gaps.storiesWithoutTask.length > 0 && <details open><summary><Pill tone="warning">{gaps.storiesWithoutTask.length}</Pill> Time Writing stories with no {label} Task <Info>Open stories that held month Tasks before (or say “Time Writing”) but none for {label}. Add the month Task (Assigned to Me can create them for your Features), or close the story if it is finished.</Info></summary><ul>{gaps.storiesWithoutTask.slice(0, 60).map((story) => <li key={story.key}>{link(story)}{story.assignedTo && <small> · {story.assignedTo}</small>}</li>)}</ul></details>}
    {gaps.tasksWithoutMonth.length > 0 && <details open><summary><Pill tone="warning">{gaps.tasksWithoutMonth.length}</Pill> Tasks under a Time Writing story without a month in the title <Info>Not counted for any month. Start or end the title with the month and year, e.g. “{label} | …” or “… | {label}”.</Info></summary><ul>{gaps.tasksWithoutMonth.slice(0, 60).map((task) => <li key={task.key}>{link(task)}</li>)}</ul></details>}
    {gaps.tasksWithoutFeature.length > 0 && <details open><summary><Pill tone="warning">{gaps.tasksWithoutFeature.length}</Pill> {label} Tasks with no Feature above them <Info>Counted, but not attributed to a stream. Link them under a story or Feature of the right Epic.</Info></summary><ul>{gaps.tasksWithoutFeature.slice(0, 60).map(({ task, parent }) => <li key={task.key}>{link(task)}<small> · parent: {parent ? `#${parent.id} ${parent.title} (${parent.workItemType})` : task.parentId ? `#${task.parentId} (not in the saved data)` : 'none'}</small></li>)}</ul></details>}
  </Panel>
}
