import { useEffect, useId, useSyncExternalStore } from 'react'

// GIT-18: what the page in use holds that is not saved to Git yet (a row being edited in its drawer, the columns pop-up,
// a kept change, a QE Mapping draft …), so that Load the newer data asks first when loading would drop it. Every
// component that holds such an edit says so with useUnsavedEdit while it is mounted; only the page in use is mounted.
const edits = new Map<string, string>()
const listeners = new Set<() => void>()
let version = 0
const changed = () => { version += 1; for (const listener of listeners) listener() }
export function setUnsavedEdit(id: string, label: string) {
  if (label ? edits.get(id) === label : !edits.has(id)) return
  if (label) edits.set(id, label); else edits.delete(id)
  changed()
}
export const unsavedEdits = () => [...new Set(edits.values())]
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
// label: what would be lost, e.g. "the row you are editing in CoNQ"; '' or false: nothing unsaved.
export function useUnsavedEdit(label: string | false) {
  const id = useId()
  useEffect(() => { setUnsavedEdit(id, label || ''); return () => setUnsavedEdit(id, '') }, [id, label])
}
export function useUnsavedEdits() {
  useSyncExternalStore(subscribe, () => version)
  return unsavedEdits()
}
