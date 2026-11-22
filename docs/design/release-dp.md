# Release Details — DP

## Default design

The view shows monthly Supported and Completed counts, a query-backed work-item table and a raw query-output tab. Enhanced columns include the selected rows, QE, Possible QEs, Month & Year, Milestones and QMS-0025 match. Rows are initially scoped to the header month. All months expands the query list while the summary remains monthly.

## Logic and implementation

- [BoardPage.tsx](../../src/pages/BoardPage.tsx) reads the DP connection result directly. [dpMilestones.ts](../../src/dpMilestones.ts) uses DDT Date for list membership. With no DDT date, it checks dated Planned and ToBePlanned milestones. Records without either appear with All months.
- For counts, the release must satisfy the list rule and have a relevant Done milestone dated in the selected month. Supported counts unique qualifying releases and Completed uses the DDT subset. Identity uses product and release when available, or source work-item ID. [DpMonthCounts.tsx](../../src/components/DpMonthCounts.tsx) renders the underlying milestone evidence.
- [dpBoardMatch.ts](../../src/dpBoardMatch.ts) builds board candidates and scores by name and version. Exact proposed Feature title can qualify as 100%. [useDpBoardColumn.tsx](../../src/useDpBoardColumn.tsx) and [DpBoardColumn.tsx](../../src/components/DpBoardColumn.tsx) render match links and creation actions. The QE column follows the Epic's configured mapping columns. Possible QEs come from earlier releases of the product.
- [DpBulkCreate.tsx](../../src/components/DpBulkCreate.tsx) and [dpBulk.ts](../../src/dpBulk.ts) build and verify the selected creation plan, excluding 100% existing Feature matches. Bulk creation requires bulk-create and assignment authority. The source query stays read-only, while Feature creation targets Time Writing.
- Pulse Check can combine configured Pedestal and DHFI sources using [dpReleases.ts](../../src/dpReleases.ts). That reporting path is distinct from the query list shown here.

The query and evidence tables use their configured exporters. If the source is missing, fetch the configured connection. [DP bulk tests](../../tests/dp-bulk.test.mjs).
