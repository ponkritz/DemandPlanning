---
bump: minor
---
**Added**
- **Start a Table (Build your own) from a file** — ＋ Add page… offers **Start from a file (optional)** while Table (Build your own) is ticked, and an empty Build-your-own page offers **Start from a file…** next to Set up columns…. The pop-up lists each column of the Excel or CSV file's header with its name, a **suggested type** (Number, Date, Currency, Long text, Dropdown with its options from the values, Text), Required and a sample value — all editable — and the preview of the rows; **Save to Git** adds the columns and the valid rows in one change, rows with errors left out and counted. Everything stays editable in Set up columns… (OND-136, OND-137, OND-138, OND-139, OND-142).
- **New columns from Upload Excel…** — columns of the file that the page does not have are listed with a tick box (unticked) and a suggested type; ticked ones are added as new columns in the same save with their values. Needs the right of Set up columns; otherwise the tick boxes are disabled with the reason (OND-140, OND-141).

**Changed**
- Upload Excel… lists unknown columns as columns to add (OND-105) and points a page without columns to Start from a file… (OND-107).

DF-575…DF-582, SM-360…SM-364; LIM-255…LIM-257; TC-OND-138…TC-OND-143.
