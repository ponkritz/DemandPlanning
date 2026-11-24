import { publishFileName } from './standaloneHtml'
import { parsePublishKey } from './publishSchedule'

// OND-76 Where a page's standalone HTML file goes: one fixed file the person chose, overwritten by each publish.
// Desktop app: the main process asks with its save dialog and keeps the path per page on this computer
// (electron/html-publish.cjs; the page can only write to that path). Browser: the File System Access API — the file
// handle from showSaveFilePicker, kept per page in this browser's IndexedDB; its write permission is asked again at most
// once per session (a scheduled run never asks: it fails and says so). Browsers without it (Firefox, Safari) or a
// policy that blocks it: the file is downloaded instead, and the result says so. Nothing is ever kept in Git.

interface Writable { write: (data: string | Blob) => Promise<void>; close: () => Promise<void>; abort?: () => Promise<void> }
interface FileHandle { kind: 'file'; name: string; queryPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>; requestPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>; createWritable: () => Promise<Writable> }
type SavePicker = (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileHandle>
declare global {
  interface DesktopFiles {
    publishTarget?: (key: string) => Promise<{ path: string } | null>
    choosePublishTarget?: (key: string, defaultName: string) => Promise<{ path: string } | null>
    publishHtml?: (key: string, html: string) => Promise<{ path: string; bytes: number }>
  }
}
export type TargetKind = 'desktop' | 'file-system' | 'download'
export class PublishTargetError extends Error {
  // kind: 'missing' — no file chosen yet; 'permission' — the browser's write permission is not granted (any more).
  readonly kind: 'missing' | 'permission' | 'write'
  constructor(message: string, kind: 'missing' | 'permission' | 'write') { super(message); this.name = 'PublishTargetError'; this.kind = kind }
}

const desktop = () => { const bridge = typeof window === 'undefined' ? undefined : window.desktopFiles; return bridge?.publishHtml && bridge.choosePublishTarget && bridge.publishTarget ? bridge : null }
const picker = (): SavePicker | null => typeof window !== 'undefined' && typeof (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker === 'function' ? (window as unknown as { showSaveFilePicker: SavePicker }).showSaveFilePicker : null
export const targetKind = (): TargetKind => desktop() ? 'desktop' : picker() ? 'file-system' : 'download'

// The handles of this session (a handle that cannot be kept in IndexedDB still works until the page is closed).
const handles = new Map<string, FileHandle>()
const asked = new Set<string>()
const databaseName = 'demand-planning-publish-v2', storeName = 'handles'
function database(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(databaseName, 1)
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName) }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch { resolve(null) }
  })
}
async function stored(pageId: string, handle?: FileHandle | null): Promise<FileHandle | null> {
  const db = await database()
  if (!db) return null
  try {
    return await new Promise((resolve) => {
      const transaction = db.transaction(storeName, handle === undefined ? 'readonly' : 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = handle === undefined ? store.get(pageId) : handle === null ? store.delete(pageId) : store.put(handle, pageId)
      request.onsuccess = () => resolve(handle === undefined ? (request.result as FileHandle | undefined) ?? null : handle)
      request.onerror = () => resolve(null)
    })
  } catch { return null } finally { db.close() }
}

// The file a page publishes to, for display ("CoNQ.html" / the desktop path), or null when none was chosen.
export async function currentTarget(pageId: string): Promise<string | null> {
  if (!parsePublishKey(pageId)) return null
  const bridge = desktop()
  if (bridge) return (await bridge.publishTarget!(pageId))?.path ?? null
  const handle = handles.get(pageId) ?? await stored(pageId)
  if (handle) handles.set(pageId, handle)
  return handle?.name ?? null
}
// Ask the person for the file (a save dialog). Must run from their click (the browser needs it). null: cancelled.
export async function chooseTarget(pageId: string, pageName: string): Promise<string | null> {
  if (!parsePublishKey(pageId)) throw new Error('Invalid publishing repository, person or page.')
  const name = publishFileName(pageName)
  const bridge = desktop()
  if (bridge) return (await bridge.choosePublishTarget!(pageId, name))?.path ?? null
  const pick = picker()
  if (!pick) return null
  let handle: FileHandle
  try { handle = await pick({ suggestedName: name, types: [{ description: 'Web page (HTML)', accept: { 'text/html': ['.html'] } }] }) }
  catch (failure) { if (failure instanceof DOMException && failure.name === 'AbortError') return null; throw failure }
  handles.set(pageId, handle)
  asked.add(pageId)
  await stored(pageId, handle)
  return handle.name
}
async function fileForWrite(pageId: string, interactive: boolean) {
  if (!parsePublishKey(pageId)) throw new Error('Invalid publishing repository, person or page.')
  const handle = handles.get(pageId) ?? await stored(pageId)
  if (!handle) throw new PublishTargetError('No file is chosen for this page yet: choose Publish now to pick one.', 'missing')
  handles.set(pageId, handle)
  let state: PermissionState = handle.queryPermission ? await handle.queryPermission({ mode: 'readwrite' }) : 'granted'
  if (state !== 'granted' && interactive && !asked.has(pageId) && handle.requestPermission) { asked.add(pageId); state = await handle.requestPermission({ mode: 'readwrite' }) }
  if (state !== 'granted') throw new PublishTargetError(`The browser no longer lets the app write ${handle.name}: choose Publish now and allow it (or choose the file again).`, 'permission')
  return handle
}

// Request a browser permission from the person's click, before the Git reads and chart drawing.
export async function prepareTarget(key: string) {
  if (targetKind() === 'file-system') await fileForWrite(key, true)
}

export async function writeTarget(pageId: string, html: string, { authorize, check }: { authorize: () => Promise<unknown>; check: () => void }): Promise<{ where: string; bytes: number }> {
  check()
  const bridge = desktop()
  if (bridge) {
    await authorize()
    check()
    const result = await bridge.publishHtml!(pageId, html)
    return { where: result.path, bytes: result.bytes }
  }
  const handle = await fileForWrite(pageId, false)
  const blob = new Blob([html], { type: 'text/html' })
  await authorize()
  check()
  let writable: Writable | undefined
  try {
    writable = await handle.createWritable()
    check()
    await writable.write(blob)
    check()
    await writable.close()
  } catch (failure) {
    await writable?.abort?.().catch(() => undefined)
    throw new PublishTargetError(`${handle.name} could not be written (${failure instanceof Error ? failure.message : String(failure)}).`, 'write')
  }
  return { where: handle.name, bytes: blob.size }
}
// The fallback: the browser's download (to its Downloads folder).
export function downloadHtml(html: string, pageName: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = publishFileName(pageName)
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return anchor.download
}
