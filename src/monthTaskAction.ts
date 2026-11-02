import type { AzureWorkItem } from './domain'
import { currentIndiaMonth, ensureMonthTask, type AzureConfig } from './azureDevOps'
import { adhocAfterLock } from './planningLock'
import { featureOf } from './myWork'

// "＋ Time Writing Task" on a Feature or User Story row (BKL-22): this month's Task for the person, under the Feature
// (the row's own Feature, or the one above the Story), placed by the usual rules (planMonthStory: an existing Task of
// theirs is reused, their own Time Writing story first) — the same as Bulk actions, one Feature at a time. Leave and
// training under the Team Holidays and Training Epic work the same way. After the planning lock the new Task is ad-hoc.
export async function addMonthTask(config: AzureConfig, pat: string, items: AzureWorkItem[], item: AzureWorkItem, assignee: string, month = currentIndiaMonth()) {
  const feature = featureOf(items, item)
  if (!feature) throw new Error(`#${item.id} has no Feature above it to hold a Time Writing Task.`)
  const result = await ensureMonthTask(config, pat, feature.id, assignee, month, undefined, adhocAfterLock(month))
  const text = result.status === 'created' ? `${month} Time Writing Task created under ${result.storyCreated ? 'a new' : 'the'} story “${result.story.title}”.` : `Your ${month} Time Writing Task under “${feature.title}” already exists.`
  return { result, feature, text, changed: [result.task, ...(result.storyCreated ? [result.story] : [])] }
}
