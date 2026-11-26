import { useState, type ReactNode } from 'react'
import { recordJob } from '../backgroundJobs'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { GitStorage } from '../useGitStorage'
import type { WindchillWorkspace } from '../useWindchill'
import type { WindchillView } from '../windchillViews'
import { exportPageActions, viewPageActions } from '../viewPageActions'
import type { ViewAction } from './ViewActions'
import { DeleteMyView } from './DeleteMyView'
import { DeleteWindchillExport } from './DeleteWindchillExport'

// SET-19, CON-116, CON-118: the delete item in the ⋯ of a page listed under Other views — who may do what comes from
// the page's viewer (App). A view of your own is deleted by the pop-up and code of My settings → My views
// (DeleteMyView); a Windchill export by DeleteWindchillExport (the existing local removal, useWindchill.removeView, after
// its files in Git are deleted in one commit). A shared Azure DevOps view gets no item (CON-116).
export interface OtherViewEnv { other: boolean; viewingAs: boolean; isSample: boolean; canImportWindchill: boolean; onGone: (text: string) => void }

const asItems = (actions: ReturnType<typeof viewPageActions>, open: () => void): ViewAction[] => actions.map((action) => ({ key: `view-${action.key}`, label: action.label, danger: action.danger, disabled: Boolean(action.blocked), title: action.title, onClick: open }))
// After the view is gone the app leaves its page (there is nothing left to show) and says what happened, once.
const goneJob = (id: string, name: string, text: string, env: OtherViewEnv) => { recordJob(`view-gone:${id}`, name, { text }); env.onGone(text) }

export function useOtherViewActions(id: string, azure: AzureWorkspace, env: OtherViewEnv | undefined): { items: ViewAction[]; dialog: ReactNode } {
  const [open, setOpen] = useState(false)
  const view = azure.connectionProfiles.find((profile) => profile.id === id)
  if (!env || !view) return { items: [], dialog: null }
  const items = asItems(viewPageActions({ other: env.other, mine: Boolean(view.mine), viewingAs: env.viewingAs }), () => setOpen(true))
  // The workspace's own "removed from this browser" line would repeat the confirmation: cleared.
  const dialog = open ? <DeleteMyView view={view} azure={azure} onClose={() => setOpen(false)} onDone={(text) => { setOpen(false); azure.setMessage(''); goneJob(view.id, view.viewName || view.reason, text, env) }} /> : null
  return { items, dialog }
}

export function useExportActions(view: WindchillView, windchill: WindchillWorkspace, git: GitStorage | undefined, env: OtherViewEnv | undefined): { items: ViewAction[]; dialog: ReactNode } {
  const [open, setOpen] = useState(false)
  if (!env || !view.exportFile) return { items: [], dialog: null }
  const items = asItems(exportPageActions({ other: env.other, canImport: env.canImportWindchill, viewingAs: env.viewingAs, isSample: env.isSample, git }), () => setOpen(true))
  const dialog = open && git ? <DeleteWindchillExport view={view} windchill={windchill} git={git} onClose={() => setOpen(false)} onDone={(text) => { setOpen(false); goneJob(view.id, view.name, text, env) }} /> : null
  return { items, dialog }
}
