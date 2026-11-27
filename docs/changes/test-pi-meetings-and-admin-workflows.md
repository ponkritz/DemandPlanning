---
bump: major
---
**Changed**
- **PI Review** — reviews now use a heading that identifies their PI. Eligible older comments can be converted. The bulk update grid preloads each Feature’s own review, previews its intended change, and reports results with retry for failures (PIR-48…PIR-50, PIR-75…PIR-84).
- **Admin** — seven pages group the settings. Page settings open relevant sections in place. Shared access edits check for concurrent changes, and Git connection actions keep PATs tied to their servers (SET-26…SET-35, CON-130…CON-142).
- **Git refresh** — the required reload brings in the latest Release Details mapping. Loading everything is a separate action on the Git storage page (GIT-36…GIT-38).
- **Time Writing and capacity** — automatic month Task states follow logged hours and the Actuals lock. Planned leave and holidays reduce available capacity (ACT-23…ACT-28, CAP-63, CAP-64).

**Added**
- **PI Review Meeting** — build an offline presentation with executive metrics, Product Owner filters, and month-based long-running Feature limits. Save it to the team’s Git data repository where allowed (PIR-40…PIR-47, PIR-51…PIR-62, PIR-64…PIR-71, PIR-85, EPS-11).
- **Personal setup** — access-role starter views and local User Story templates add shortcuts for individuals. The New Feature form puts Feature DoD in one field and offers Priority (SET-21…SET-25, STT-04…STT-07, BKL-52, BKL-53).

Synced ponkritz/Test through commit `bb44a452859f92ef0b65a6b88cd415052dbcc35a`, using the completed Test2 sync at `31dcb9c329f1905c8d1b3cb2d00dd58e54fe745d` as the source baseline.
