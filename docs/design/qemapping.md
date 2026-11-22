# QE Mapping

[Design index](README.md) · Route `qemapping` · [QeMappingPage](../../src/pages/QeMappingPage.tsx)

## Default view

Uses the first sheet when no sheet is selected. Global search, per-column filters and grouping start empty. Browser preferences can hide columns and retain widths/wrap. Groups can nest to four levels and can be expanded or collapsed. The page displays up to 300 data rows initially, with options to show more. Selecting a different sheet clears the active query, grouping, selection and cell editor. Read-only or disconnected users can still see a locally cached mapping if one exists.

## Import, edit and persistence

XLSX imports every sheet. CSV imports one tab. Legacy XLS gives a conversion prompt. The first populated row becomes the header. Blank rows and columns are removed and duplicate headings made distinct. The input creates an editable table from cell values. It is an app data mapping rather than an Excel workbook editor. Replacement asks for confirmation and stays in the local draft until saved. Editing supports cells, row selection/removal, add/rename/delete/reorder columns and a QE Name selector populated by resources where available. The Add row form immediately tries to save the new row and any current draft together. On failure it preserves the row as a draft for retry.

The shared revision is `qe-mapping.json` beside planning data. Edit requires `qemapping.edit`, a Git connection with write access and non-sample mode. Save checks the known version. A conflicting remote change prompts the user to reload. The file is limited to 900,000 bytes and is parsed before use. A cached validated copy supports disconnected reading. DP setup can refer to the mapping's source and QE columns.

## Output

CSV exports filtered rows and shown columns from the current sheet. Excel exports the full set of sheets and columns in the current loaded or draft file. Git history links to the saved mapping. Width and hiding choices are viewer preferences, while persisted column order comes from the mapping file.

[Workbook reader/writer](../../src/xlsx.ts) · [Mapping schema, filters and groups](../../src/qeMapping.ts) · [Git-backed mapping hook](../../src/useQeMapping.ts) · [DP mapping consumer](../../src/dpBulk.ts)
