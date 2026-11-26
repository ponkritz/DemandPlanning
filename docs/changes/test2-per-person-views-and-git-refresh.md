---
bump: major
---
**Changed**
- **Other views move to per-person Git files** — the shared connection file keeps the Stream mapping. Existing Other views move to an unassigned list for admins to assign. New Other views follow the creator’s work email, with verified private storage required for saves and assignments. Existing server PATs and local My views stay on the device (CON-98, CON-119…CON-124, SET-20).
- **Load everything from Git** — the app asks users to reload once after upgrading and when a new Stream mapping version is detected. If every failed read is a server outage or network failure, users can continue for that session and retry at the next start (GIT-29…GIT-32).

**Maintenance**
- Updated dependencies and regenerated the software bill of materials (CI-08).

Synced Test2 through commit `682923743483a9b4fdde1bd9a0c5db755b8abb02`.
