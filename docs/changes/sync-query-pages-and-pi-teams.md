---
bump: minor
---
**Added**
- **Page type tick boxes** — ＋ Add page…, Edit and Tool Validations ＋ Add tab… choose the page type with four tick boxes: Table (Build your own), Table (Query), Insights, Dashboard. Only Dashboard alone, one table source, or one table source with Insights can be ticked; the other choices are disabled with the reason, and the form shows the resulting type in words (PGB-22, PGB-01, PGB-05).
- **Table (Query) pages** — a table of the rows and columns of a saved Azure DevOps query, picked as in the dashboards' Add Azure query…; only its reference is saved in the page's file in Git, never a PAT or rows. Each viewer reads the rows with their own PAT when the page opens and with ↻ Refresh; search, sort, Columns, Export and Group by / Filter by column work; the rows are read only. A viewer without a PAT sees the reason. With Insights, the charts read the same rows (PGB-23, PGB-24, PGB-25).
- **Fixed table source** — Edit keeps a page's table source (Build your own or Query); Insights can still be switched on and off. A page file's source is validated when read; an invalid one shows the page read only with the reason (PGB-26, PGB-27; LIM-260, LIM-253).

DF-567…DF-570, SM-356…SM-358; TC-PGB-17…TC-PGB-20.

- **Presenting teams in the PI Review Meeting** — in Admin → Feature & PI setup → PI Review form → Meeting presentation, **Edit presenting teams…** names the teams that present (name, short name, their Epics — an Epic in one team only — in order, ↑ ↓) and the Agenda sentence; saved with the PI Review form in Git (PIR-86, PIR-89).
- **Agenda slide** — after the title: "The following teams will present the Features they have been working on during PI {PI}" (a template) and the teams as a bulleted list, "Name (SHORT)" (PIR-87).
- **One section per team** — after the executive slides, each team's divider (its Features in the PI) and its Features with their reviews, then Other Features; without teams the deck is unchanged (PIR-88).
- **Read tolerantly** — a team in the file that cannot be used is left out with a note, never refusing the file (PIR-90, LIM-262).

DF-590…DF-593, SM-370; TC-PIR-87…TC-PIR-92.
