# Pulse Check

**Route** `pulse` · Data Insights · Header month enabled. First visit opens Releases for the month immediately preceding the header month. The DP milestone list starts collapsed. The period selector starts at Month. Tabs and subset of settings use browser preferences, with personal-view settings supported for period selection.

## Default design and behavior

| Section | Data and rules |
|---|---|
| Releases | Prior-month completion quadrants and supported lines by configured release stream, a control to expand the DP milestone table, and Windchill export summaries and drill-down. Missing sources are indicated. |
| Last month | Prior-month capacity and gaps, releases compared with the selected month, work opened and closed by Epic, and detailed monthly sections. Team is the default scope. Team region and role filters or the Individual picker affect eligible work and capacity. The page can offer a temporary alternate calculation profile to an Admin. Release counts are team-wide. |
| Ongoing activities | Features and User Stories in Active, In Progress, Committed or Doing. Cards show counts, people and overdue items. The list can narrow by stream. Selected-month booked effort comes from descendant Time Writing Tasks and 'past target' uses an open item with a past Target Date. |
| Current month releases | Runs the release presentation for the header month instead of the previous month. |
| Monthly pack | Builds the preceding month's two-slide report using loaded release and Time Writing data, pack setup/template, and saved narrative inputs. |

## Data and processing

- `defaultStreamReleases` maps on-prem result datasets per stream. Path-based approved documents contribute dates and release identities. CP uses its folder/signature logic, DP counts distinct supported milestones (DT, SFV, PRD, RPE) recorded Done in the month and DT for completion, Content uses configured name rules, IOCC uses signed document types, and Tool Validations count per tool. Where configured, manually entered CP/DP/IOCC counts are a marked fallback for missing data. Windchill uses imported export rows and the corresponding extraction mode.
- Work flows group actual Features and Stories under their Epic using Created Date and Closed Date. Finished items missing Closed Date use Changed Date. Removed items and absence-Epic work are excluded. Work-flow date bucketing uses the viewer time zone.
- Quarterly, half-year and yearly choices replace the monthly tab body with an aggregate period report. Each release identity counts once per stream over the period, documents sum, and the comparison is with the immediately preceding equal-length calendar period.
- Monthly Pack content is previewed and exported through its dedicated panel and PPTX template path. Shared setup or per-month content uses Git storage when configured. Data tables expose their configured export behavior. Pulse Check does not write Azure work items.

## Code and verification

[View](../../src/pages/PulseCheckPage.tsx) · [Flow and comparison](../../src/pulseCheck.ts) · [Periods](../../src/pulsePeriods.ts) · [Release rules](../../src/releaseOverview.ts) · [Stream definitions](../../src/streams.ts) · [Windchill extraction](../../src/windchillReleases.ts) · [Pack panel](../../src/components/MonthlyPackPanel.tsx) · [Pack model](../../src/monthlyPack.ts) · [Pulse tests](../../tests/pulse-check.test.mjs)
