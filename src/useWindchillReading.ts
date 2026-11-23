import { useMemo, useState } from 'react'
import { windchillReleases, type ReleaseSource } from './windchillReleases'
import { windchillOptionsForView } from './streams'
import type { WindchillLogic } from './windchillViews'

// The reading of an export's releases: Read from (Automatic, Location, Document name), the name and Location columns,
// and the releases read with them. Held by the Windchill page (WindchillPage), so that its counts (QV-64) count the
// releases its Releases table (WindchillReleasesPanel) lists.
export function useWindchillReading(view: { id: string; name: string; logic?: WindchillLogic; projectLevel?: number }, rows: Record<string, unknown>[], columns: string[]) {
  const [source, setSource] = useState<ReleaseSource | 'auto'>('auto')
  const [nameColumn, setNameColumn] = useState('')
  const [locationColumn, setLocationColumn] = useState('')
  const result = useMemo(() => windchillReleases(rows, columns, { source, nameColumn: nameColumn || undefined, locationColumn: locationColumn || undefined, ...windchillOptionsForView(view) }), [rows, columns, source, nameColumn, locationColumn, view])
  return { source, setSource, nameColumn, setNameColumn, locationColumn, setLocationColumn, result }
}
export type WindchillReading = ReturnType<typeof useWindchillReading>
