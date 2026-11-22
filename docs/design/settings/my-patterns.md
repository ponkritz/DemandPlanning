# My naming patterns

[Back to Settings](../admin.md)

## Default design

Stream selector, ordered rows with pattern and optional group label, and a title tester. With no personal override, the selected stream uses its shared pattern list if set, then its built-ins. DP and CP retain their dedicated naming rules and are excluded from this picker.

## Behavior and storage

The parser treats `*` as arbitrary text, `{…}` as the captured name, and runs case-insensitive matching with flexible whitespace. The first matching pattern wins. Unmatched titles follow the stream rule. Content’s built-in captures through `_RELEASE`; IOCC built-ins recognize Conformance Verification and Test Tools. Saving or clearing a personal override updates browser storage and redraws consumers through the pattern subscription.

## Implementation

- [`components/NamingPatternsPanel.tsx`](../../../src/components/NamingPatternsPanel.tsx)
- [`namingPatterns.ts`](../../../src/namingPatterns.ts)
- [`myNamingPatterns.ts`](../../../src/myNamingPatterns.ts)
- [`releaseSource.ts`](../../../src/releaseSource.ts)
- [`App.tsx`](../../../src/App.tsx)
