---
bump: patch
---
**Fixed**
- **QMS-0025 board: no extra page scrolling on Windows** — the board table no longer stops at 240 px (now 120 px, about three rows), and any page overflow the measurement misses is taken off the table, so the page does not scroll by a few pixels (BKL-45, KB-74).

TC-BKL-34.
