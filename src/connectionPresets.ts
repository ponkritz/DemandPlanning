import { collectionUrlFrom, composeAzureUrl, type AzureConnectionProfileSummary } from './azureCredentials.ts'
import type { ConnectionInput } from './useAzureWorkspace'

// Connections the team uses, pre-filled so only the PAT has to be entered. A preset disappears from the list once a
// saved connection points at the same collection and project, or when it is dismissed in this browser.
export const connectionPresets: Array<Omit<ConnectionInput, 'pat'> & { key: string }> = [
  { key: 'time-writing-cloud', name: 'QMS-0025', viewName: 'QMS-0025', showInMenu: true, role: 'time-tracking', serverUrl: '', organization: 'ALMP-ORG-MSTP01', project: 'Patient Safety and Quality', team: 'InD Quality', query: '', creatorEmail: '', apiVersion: '' },
  { key: 'dhp-on-prem', name: 'DHP (on-prem)', viewName: '', showInMenu: false, role: 'reference', serverUrl: 'https://tfsapac04.ta.philips.com/tfs', organization: 'DHPCollection', project: 'DHP', team: '', query: '', creatorEmail: '', apiVersion: '' },
]

const projectKey = (url: string) => { try { const parsed = new URL(url); return `${parsed.origin}${parsed.pathname.split('/_backlogs/')[0]}`.replace(/\/+$/, '').toLowerCase() } catch { return url.toLowerCase() } }
export function presetProjectUrl(preset: Pick<ConnectionInput, 'serverUrl' | 'organization' | 'project'>) { return composeAzureUrl(collectionUrlFrom(preset.serverUrl, preset.organization), preset.project) }

export function pendingPresets(saved: Pick<AzureConnectionProfileSummary, 'url'>[], dismissed: string[]) {
  const existing = new Set(saved.map((profile) => projectKey(profile.url)))
  return connectionPresets.filter((preset) => !dismissed.includes(preset.key) && !existing.has(projectKey(presetProjectUrl(preset))))
}

const dismissedKey = 'demand-planning-dismissed-presets-v1'
export function loadDismissedPresets(storage: Pick<Storage, 'getItem'> = localStorage): string[] { try { const raw = JSON.parse(storage.getItem(dismissedKey) ?? '[]'); return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : [] } catch { return [] } }
export function saveDismissedPresets(keys: string[], storage: Pick<Storage, 'setItem'> = localStorage) { try { storage.setItem(dismissedKey, JSON.stringify(keys)) } catch { /* kept for this session */ } }
