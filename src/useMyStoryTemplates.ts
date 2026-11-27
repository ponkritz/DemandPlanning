import { useEffect, useState } from 'react'
import type { StoryTemplateItem } from './epicSetup'
import { loadMyStoryTemplates, myStoryTemplatesKey, myTemplatesBlocked, myTemplatesOf, saveMyStoryTemplates, withMyTemplates } from './myStoryTemplates'
import { viewingAs } from './viewAs'

// STT-04…STT-07: the person's own User Story templates (this browser's local storage), the same in every open form and
// tab: a save here tells the other users of the hook, and another tab's save arrives through the storage event.
const listeners = new Set<() => void>()
const changed = () => { for (const listener of listeners) listener() }

export interface MyStoryTemplates { email: string; blocked: string; templates: StoryTemplateItem[]; save: (list: StoryTemplateItem[]) => void }
export function useMyStoryTemplates(email: string, viewing = Boolean(viewingAs())): MyStoryTemplates {
  const [file, setFile] = useState(() => loadMyStoryTemplates())
  useEffect(() => {
    const reload = () => setFile(loadMyStoryTemplates())
    const fromOtherTab = (event: StorageEvent) => { if (event.key === myStoryTemplatesKey || event.key === null) reload() }
    listeners.add(reload); window.addEventListener('storage', fromOtherTab)
    return () => { listeners.delete(reload); window.removeEventListener('storage', fromOtherTab) }
  }, [])
  const blocked = myTemplatesBlocked({ email, viewingAs: viewing })
  return {
    email, blocked,
    // View as or no work email: none shown — never another person's, and not the viewer's own as if they were the person's.
    templates: blocked ? [] : myTemplatesOf(file, email),
    // Throws with the reason when it cannot be saved (no email, View as, a secret, too many or too large).
    save: (list) => {
      if (blocked) throw new Error(blocked)
      const next = withMyTemplates(loadMyStoryTemplates(), email, list)
      saveMyStoryTemplates(next)
      setFile(next); changed()
    },
  }
}
