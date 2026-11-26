# Resource Mapping

[Design index](README.md) · [Source selection](../../src/components/QePageFields.tsx) · [Matching model](../../src/qePage.ts)

## Default source

DP and IOCC Feature creation use an On-Demand table as the QE source. In the bulk Epic’s Feature setup, select a page and choose the Platform / Product and QE columns. A table named **Resource Mapping** is offered by default. The setup stores page and column IDs, so a rename preserves the mapping. Column choices are explicit.

## Reading the mapping

The source uses visible rows with both values present. Product / platform can use Text, Long text, Dropdown, or Multi-select. QE can use Text or Dropdown, including a built-in team list. When a linked list changes a person’s display name, the source uses that current name. Feature creation uses the mapped QE and still lets the user choose the assignee where the editor offers that control.

## Moving from QE Mapping

Recreate the mapping in an On-Demand table and select its columns in each DP or IOCC bulk Epic’s Feature setup. Earlier column-name settings are preserved for migration and the setup prompts users to choose the replacement columns.

When the legacy `qe-mapping.json` is present, **Admin → Data & sharing → Shared setup in Git → Data no longer used** offers a download. After downloading a copy, the Tool Owner can confirm deletion of that exact version from the private data repository. Git history retains earlier commits.

[DP consumer](../../src/dpBulk.ts) · [Source provider](../../src/useQeSource.ts) · [Retired file controls](../../src/retiredData.ts)
