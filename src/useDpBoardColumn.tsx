import { useMemo } from 'react'
import type { AzureWorkItem } from './domain'
import type { AzureWorkspace } from './useAzureWorkspace'
import type { FeatureSetups } from './featureSetup'
import { boardMatchText, dpBoardCandidates, dpBoardMatch } from './dpBoardMatch'
import { DpBoardCell } from './components/DpBoardColumn'
import type { ExtraColumn } from './components/QueryView'

// The DP table's "QMS-0025 match" column: each row's Feature / User Story on the Time Writing board (dpBoardMatch),
// searched and exported by its text, with Create Feature when nothing matches.
export function useDpBoardColumn(rows: AzureWorkItem[], azure: AzureWorkspace, threshold: number, assign?: { me: string; canChoose: boolean }, featureSetup?: FeatureSetups | null): ExtraColumn {
  const candidates = useMemo(() => dpBoardCandidates(azure.items), [azure.items])
  const matches = useMemo(() => new Map(rows.map((row) => [row.id, dpBoardMatch(row, candidates, threshold)])), [rows, candidates, threshold])
  return useMemo(() => ({
    name: 'QMS-0025 match',
    text: (row: AzureWorkItem) => boardMatchText(matches.get(row.id) ?? {}),
    cell: (row: AzureWorkItem) => <DpBoardCell row={row} match={matches.get(row.id) ?? {}} azure={azure} assign={assign} featureSetup={featureSetup} />,
  }), [matches, azure, assign, featureSetup])
}
