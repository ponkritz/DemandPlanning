import type { AppState, AzureWorkItem } from './domain.ts'
import type { AzureConnectionProfileSummary } from './azureCredentials.ts'
import type { StreamMonth, Utilization } from './monthlyPack.ts'
import { defaultStreamReleases } from './releaseOverview.ts'
import { defaultStreams, exportForStream } from './streams.ts'
import { windchillSupported } from './windchillReleases.ts'
import { capacityModel, type CapacitySettings } from './capacity.ts'
import { yearMonths } from './monthlyPack.ts'

// The data the Monthly pack reads for a month, shared by Pulse Check → Monthly pack and the Insights workspace so
// both show the same figures: the streams' releases and supported counts (Azure streams per their Pulse Check rules,
// Windchill exports per their month), and the actual utilisation of the month, of January to the month, and of the
// QE role in the month.
export interface WindchillData { views: { id: string; name: string; exportFile?: string; columns: string[] }[]; sources: { viewId: string; columns: string[]; rows: Record<string, unknown>[] }[] }
const label = (entry: { name: string; release: string; type?: string }) => `${[entry.name, entry.release].filter(Boolean).join(' ')}${entry.type ? ` (${entry.type})` : ''}`
const ratio = (work: number, available: number) => available > 0 ? Math.round(work / available * 1000) / 10 : null

export function packStreamsOf(state: Pick<AppState, 'azureSources' | 'releaseSource'>, profiles: AzureConnectionProfileSummary[], windchill: WindchillData, at: string): StreamMonth[] {
  return [
    ...defaultStreamReleases(state, profiles, at).map((stream) => ({ name: stream.name, releases: stream.releases.map(label), supported: stream.supported ?? stream.releases.length })),
    ...defaultStreams.filter((stream) => stream.source === 'windchill').map((stream) => {
      const view = exportForStream(stream, windchill.views)
      const source = view ? windchill.sources.find((entry) => entry.viewId === view.id) : undefined
      const releases = source ? windchillSupported(source.rows, source.columns.length ? source.columns : view?.columns ?? [], at) : []
      return { name: stream.name, releases, supported: releases.length }
    }),
  ]
}

export function packUtilization(items: AzureWorkItem[], month: string, settings: CapacitySettings): Utilization {
  const people = (at: string) => { try { return capacityModel(items, at, settings).people.filter((person) => person.name !== 'Unassigned' && person.tasks) } catch { return [] } }
  const sum = (list: { work: number; available: number }[]) => ratio(list.reduce((total, person) => total + person.work, 0), list.reduce((total, person) => total + person.available, 0))
  const now = people(month)
  return { month: sum(now), ytd: sum(yearMonths(month).flatMap(people)), qeMonth: sum(now.filter((person) => settings.profiles?.[person.name]?.role === 'QE')) }
}
