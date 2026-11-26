# Default UI and table design

## Shell and responsive layout

The shell uses a left navigation rail, a top bar for the current page and context, one main content area and a footer for desktop download and build controls. The sidebar can collapse to icons on wide screens and becomes an off-canvas menu on smaller screens. The top bar shows data freshness and refresh, a month input where relevant, and a person selector on Time Writing, My Tasks and Sprint check. The Profile menu exposes personal settings and supported layout/access tools. The shell measures the header and footer so sticky page content can use their actual heights. [App.tsx](../../src/App.tsx), [App.css](../../src/App.css), [fresh.css](../../src/fresh.css), [index.css](../../src/index.css).

Theme defaults to the system choice, with explicit light and dark preferences. Desktop zoom has its own control and persistence. The design uses the available CSS viewport width, so display scaling can trigger smaller-screen layouts. Verify wrapping and reachability of toolbar buttons at 150% separately on web and desktop if layout changes are made. [theme.ts](../../src/theme.ts), [ZoomControl.tsx](../../src/components/ZoomControl.tsx), [desktopZoom.ts](../../src/desktopZoom.ts).

## Standard interactive table

| Behavior | Built-in default and persistence |
|---|---|
| Resize | Enabled. Drag a heading edge. Double-click the handle to reset one column. Stored per table. |
| Reorder | Enabled. Drag a movable heading or use up/down in Columns. Fixed columns stay first. New movable columns follow the saved order. |
| Select columns | Enabled. A view can supply fixed and initially hidden columns. The saved visibility list is applied to recognized movable columns. |
| Wrap and density | Wrap off, comfortable density. Both controls enabled. Compact and wrap are independent preferences. |
| Sort and filter | Views provide rows and may control sort themselves. Otherwise the table compares dates, numbers, or text. Filter controls are supplied by the hosting view. |
| Export | Excel and CSV are offered to users with Export tables permission when the view supplies an export name. Exports use the sorted source rows, including rows beyond a display limit. They use visible value columns plus any configured always-export columns. Detail rows and child rendering are separate from this export path. |
| Spreadsheet values | Excel keeps numeric values and recognized dates as typed cells, with default display format `yyyy-mm-dd hh:mm`. CSV uses escaped cells and formula neutralization. |
| Charts | Data labels default off. Supported charts can override the default independently. |

Admin → Reports → Table and chart defaults changes the shared defaults for participating components. Personal per-table preferences live in the current browser profile. [DataTable.tsx](../../src/components/DataTable.tsx), [tableDefaults.ts](../../src/tableDefaults.ts), [columnWidths.tsx](../../src/components/columnWidths.tsx), [tableDesign.ts](../../src/components/tableDesign.ts), [TableDefaultsPanel.tsx](../../src/components/TableDefaultsPanel.tsx).

Several views use a dedicated table. The editable Azure backlog tree has its own column and expansion logic. On-Demand tables provide row editing and their own column filters. Summary tables can be plain HTML. Use the individual design document to confirm which controls and export behavior are available.
