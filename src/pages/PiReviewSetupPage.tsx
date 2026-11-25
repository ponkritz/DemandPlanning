import { Page } from '../components/ui'
import { ScopeChip } from '../components/ScopeChip'
import { PiFormSetupPanel, ReviewStartPanel } from '../components/PiFormSetupPanel'
import type { PiFormStore } from '../usePiFormSetup'

// PIR-29: Admin → PI Review Setup — the PI Review form setup on a page of its own (formerly a section of Epic & Feature
// setup): the summary of the form in use, Edit form… with the shared column-list editor, Save to Git, the notices and
// the read-only state with its reason (PIR-19…PIR-22, PIR-31). Listed in the Admin menu, Search settings and the Admin links
// only for the holders of "PI Review: set up the review form" (CON-114: Scrum Master and Tool Owner by default); anyone
// else asking for it gets Streams (shownSettingsTab). The ⚙ in My PI Review and PI Review opens it (PIR-30).
export function PiReviewSetupPage({ store, block, by }: { store: PiFormStore; block: string; by: string }) {
  return <Page intro="When PI Review starts, and the fields of the PI review form — Write review… in PI Review, My PI Review and the Close pop-up — and the headings each writes in the Feature’s Discussion comment. Shared with everyone through Git.">
    <div className="scope-line"><ScopeChip scope="everyone" /></div>
    {/* PIR-33: the start date of PI Review, before the form. */}
    <ReviewStartPanel store={store} block={block} by={by} />
    <PiFormSetupPanel store={store} block={block} by={by} />
  </Page>
}
