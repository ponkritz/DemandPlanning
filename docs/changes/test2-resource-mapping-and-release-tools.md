---
bump: major
---
**Changed**
- **Resource Mapping replaces QE Mapping** — select an On-Demand table and its product and QE columns in Epic setup. Reconfigure existing DP and IOCC mappings against the new source. The Tool Owner can download a copy of the retired Git file before deleting it (NAV-54, EPS-09, DPF-02, CON-117, GIT-28).
- **DP Feature creation** — single and bulk creation use the same release rules. Set start and target dates, choose whether to create month Tasks, and derive selected User Story sprints from milestone dates (DPF-13…DPF-18, EPS-10).
- **Other views** — delete personal views and eligible Windchill exports from their pages (SET-19, CON-116, CON-118).

**Added**
- **Azure DevOps query sources** — use authorized query results in shared dashboards or My dashboard (DSH-17…DSH-23, MYD-26).
- **Named page files** — newly created On-Demand pages and dashboards use readable Git filenames. Owners can review and clean up older copies. File moves and cleanup require a verified private repository (OND-120…OND-131, OND-133…OND-135, DSH-08).
- **PI Review** — Discussions for your own Features load when the page opens, so you can find and edit an existing review (PIR-35).

Synced Test2 through commit `779fbc69bdfd310cea2380b9b82b93bd37d94bed`.
