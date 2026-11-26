import { createContext, useContext } from 'react'
import type { EpicSetup } from './featureSetup'
import type { OnDemandPage } from './onDemand'
import { qeSourceOf, resolveQePage, type QePageRef, type QeSource } from './qePage'

// DPF-02, EPS-09: the On-Demand Table pages a QE page can be (not the dashboards), and a page as the app holds it (built-in
// list columns with their lists' names), provided by the app; without a provider there are none.
export interface QePagesEnv { pages: QePageRef[]; page: (id: string) => OnDemandPage | null }
export const QePagesContext = createContext<QePagesEnv>({ pages: [], page: () => null })
export const useQePages = () => useContext(QePagesContext)

// The QE rows of a bulk Epic's setup: its QE page (or the default Resource Mapping page, which still needs its columns).
export function useQeSource(setup: Pick<EpicSetup, 'qePage'> | undefined): QeSource {
  const env = useQePages()
  const setting = resolveQePage(setup?.qePage, env.pages).setting
  const page = setting?.pageId ? env.page(setting.pageId) : null
  return qeSourceOf(page, setting)
}
