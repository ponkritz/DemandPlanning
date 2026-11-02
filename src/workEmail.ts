import { listAzureConnectionProfiles, loadAzureConnectionProfile } from './azureCredentials.ts'

// Your work email (CON-82): a personal setting of its own on this computer — not part of any connection, the stream
// mapping or the shared setup in Git. It says who "me" is: the access role, Assigned to Me / My Work, the assignee of
// new Features and the Time Writing prompts. Connections, Git syncs and app updates never change it.
export const workEmailKey = 'demand-planning-work-email-v1'
// Set once the shared-email clean-up of CON-80 has run on this computer (an email kept on a connection is then the
// person's own and may be moved into this setting).
const sharedEmailFixKey = 'demand-planning-shared-email-cleared-v1'
export const validWorkEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

export function readWorkEmail(storage: Pick<Storage, 'getItem'> = localStorage): string {
  try { const value = storage.getItem(workEmailKey)?.trim().toLowerCase() ?? ''; return validWorkEmail(value) ? value : '' } catch { return '' }
}
export function saveWorkEmail(email: string, storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage) {
  const value = email.trim().toLowerCase()
  if (value && !validWorkEmail(value)) throw new Error('Enter a valid work email, e.g. name@company.com.')
  if (value) storage.setItem(workEmailKey, value); else storage.removeItem(workEmailKey)
  return value
}
// First start with this setting: the email entered on the Time Writing connection before becomes the setting — only
// once the CON-80 clean-up has run here, so an email inherited from the shared setup is never taken over.
export function initialWorkEmail(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage): string {
  const saved = readWorkEmail(storage)
  if (saved) return saved
  try { if (!storage.getItem(sharedEmailFixKey)) return '' } catch { return '' }
  const timeWriting = listAzureConnectionProfiles(storage).find((profile) => profile.role === 'time-tracking' && profile.creatorEmail)
  const email = timeWriting ? loadAzureConnectionProfile(timeWriting.id, storage)?.creatorEmail?.trim().toLowerCase() ?? '' : ''
  if (!validWorkEmail(email)) return ''
  try { return saveWorkEmail(email, storage) } catch { return '' }
}
