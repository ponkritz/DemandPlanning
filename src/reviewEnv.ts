import { createContext } from 'react'
import type { AzureConfig } from './azureClient.ts'
import type { AuditEvent, AzureWorkItem } from './domain'
import type { PiFormSetup } from './piReviewSetup.ts'

// PIR-13, PIR-17, PIR-18: what posting a PI review needs, wherever the form is (PI Review, My PI Review, the Close
// pop-up): the viewer's work email and View as, the Time Writing connection and its PAT, the fetched items (for the PI
// list) and the audit. Provided by the app; without a provider nothing can be posted.
// PIR-19: formSetup — the PI Review form setup in use (pi-review-form.json in Git, else the built-in form), for the form,
// the comment and the split; openFormSetup opens Admin → Feature & PI setup → PI Review form (PIR-29; the ⚙ of PIR-30).
export interface ReviewEnv {
  // PIR-34: name — the viewer's Azure DevOps display name, to know their own comments when a comment has no email.
  email: string; name?: string; viewingAs: string; isSample: boolean; config: AzureConfig | null; pat: string; items: AzureWorkItem[]
  addAudit: (event: Omit<AuditEvent, 'id' | 'timestamp'>) => void
  formSetup?: PiFormSetup; openFormSetup?: () => void
}
export const ReviewEnvContext = createContext<ReviewEnv | null>(null)
