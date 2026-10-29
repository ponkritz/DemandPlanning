import type { AzureWorkItem } from './domain.ts'
import { updateAzureWorkItem, type AzureConfig } from './azureDevOps.ts'
import { closeFollowUp, closeStates, followUpQuestion, type CloseFollowUp } from './myWork.ts'

// After an item is closed from Assigned to Me or a state check: ask the follow-up question (closeFollowUp) and, when
// confirmed, close the related items one by one in the staged order (New → Active → Closed), each write read back as
// usual. Items in a state that cannot be closed are reported, not written. Nothing is written without the confirmation.
export interface FollowUpResult { follow: CloseFollowUp; confirmed: boolean; closed: AzureWorkItem[]; skipped: string[]; failed: string[] }
export async function closeRelated(config: AzureConfig, pat: string, items: AzureWorkItem[], closed: AzureWorkItem, confirm: (question: string) => boolean, write: (config: AzureConfig, pat: string, id: number, update: { state: string }) => Promise<AzureWorkItem> = updateAzureWorkItem): Promise<FollowUpResult> {
  const follow = closeFollowUp(items, closed)
  const result: FollowUpResult = { follow, confirmed: false, closed: [], skipped: [], failed: [] }
  if (!follow) return result
  const targets = follow.kind === 'stories' ? follow.stories : [follow.feature]
  const closable = targets.filter((item) => closeStates(item).length)
  for (const item of targets.filter((item) => !closeStates(item).length)) result.skipped.push(`#${item.id} is ${item.state} and cannot be closed from here`)
  if (!closable.length) return result
  if (!confirm(followUpQuestion(follow))) return result
  result.confirmed = true
  for (const item of closable) {
    try { let updated = item; for (const state of closeStates(item)) updated = await write(config, pat, item.id, { state }); result.closed.push(updated) }
    catch (failure) { result.failed.push(`#${item.id}: ${failure instanceof Error ? failure.message : 'update failed'}`) }
  }
  return result
}
