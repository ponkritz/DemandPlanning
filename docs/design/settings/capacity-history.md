# Historical hours

[Back to Settings](../admin.md)

## Default design

With writable Git and live mode, upload a workbook or choose one from the data repository. The preview shows excluded rows, parsed hours, detected/matched people, Feature IDs, stream-to-Epic mappings and the cut-off month. Default cut-off is October 2026.

## Behavior and storage

Opening requires `capacity.history`. Reads an `.xlsx` up to 30 MB, preferring `TransformedData`; maps expected and actual hours, person, month, stream, title, Epic and optional Feature/tag. A fetched valid Feature ID takes precedence, then Epic No, then stream mapping. Only earlier months use historical rows; newer report months use Azure Tasks and the live Azure write pages still receive live Azure items. Save replaces `history-hours.json` in Git after preview; a Git conflict is retried with refreshed SHA because this is a full replacement. Removal is a separate confirmed action.

## Implementation

- [`components/HistoryPanel.tsx`](../../../src/components/HistoryPanel.tsx)
- [`history.ts`](../../../src/history.ts)
- [`useHistory.ts`](../../../src/useHistory.ts)
- [`useGitStorage.ts`](../../../src/useGitStorage.ts)
- [`App.tsx`](../../../src/App.tsx)
