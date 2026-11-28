# Project memory — Project 3 timetable app

## Purpose and workflow

Local Vietnamese web app for importing school data, editing it, and generating a lower-secondary school timetable. Treat the sample workbook as synthetic demonstration data. Reply in Vietnamese and preserve existing workbook and API field names where possible.

Run `backend\run.bat` from the repository root. The stack uses Python 3.10+, FastAPI, SQLAlchemy, SQLite, OpenPyXL, and OR-Tools CP-SAT. The frontend uses HTML, CSS, and JavaScript without a build step.

| Page | Purpose |
| --- | --- |
| `/` | Excel import, saved-data counts, and minimum weekly periods per teacher |
| `/admin` | Data editing and weekly availability |
| `/timetable` | Solve and view the timetable by week |
| `/docs` | API documentation |

## Data and persistence

- `main.py` registers pages and creates missing SQLite tables at startup. `backend/data/timetable.db` is runtime data and is Git-ignored.
- `routes/data.py` serves admin load, save, clear, settings, and summary. The admin save path writes the normalized result from validation, which skips completely blank rows. Validation errors identify the affected table and field.
- `input_schema.py`, `excel_import.py`, and `input_validation.py` define and validate workbook data. Headers are on row 4 and data starts on row 5. `Lop_Ban` is optional in Excel, so older workbooks can still be imported.
- `db_io.py` maps sheets to SQLAlchemy models and replaces input tables in a single transaction. Class blocks are stored in `class_unavailable_slots`, keyed by class, weekday, session, and period number. Teacher blocks use `GV_Ban` and the same time coordinates.
- `PhanCong` remains a legacy reference sheet. It is hidden in the admin selector and on the homepage. Reference comparisons are skipped when its rows are empty. Solver output comes from `/api/solve`.
- `normalize_workbook.mjs` generates the synthetic workbook. The sample XLSX is available for demonstrations, and the DOCX contains the original project plan.

## Admin behavior

- `admin.js` manages draft state. **Kiểm tra và lưu** validates and writes it. Reload discards unsaved edits. Row and subject removal require two clicks. The same button width is used for both labels, and a pending selection is highlighted. Clearing the current table edits the draft. The separate all-data action is in a collapsed section.
- `static/admin/demand-matrix.js` uses the same subject order as the Subjects table. The grid supports selecting a range or class row, copying and pasting with the clipboard, and copying a class row to the rest of its grade after a second confirmation.
- `static/admin/table-grid.js` displays semester and holiday dates as `dd/mm/yy`, with a native date picker. The two IDs are hidden and generated when saving new rows. API dates use ISO format.
- The time-slot editor supports moving blocks, editing them, and copying activities across a range of weekdays. Time slots can represent either lessons or activities such as **Truy bài**.
- `teacher-busy.js` and `class-busy.js` render separate availability editors using the shared `weekly-timeline.js`. Each has a dropdown and per-day controls for **Sáng**, **Chiều**, and the whole day. Morning precedes afternoon. Pressed session controls are red. Clicking a lesson toggles its block and shows a red X. Activity blocks display as context. The class editor has no separate group dropdown.
- The former `/busy` page and its dedicated API routes were retired. Availability is edited at `/admin`.

## Solver semantics

`routes/timetable.py` reads the database and calls `solver.py`. CP-SAT solves one sample week using `NhuCau`, `GV_Mon`, teaching slots from `KhungGio`, `GV_Ban`, and `Lop_Ban`. Each class–subject pair is assigned to one qualified teacher. Classes and teachers cannot be double-booked. The solver excludes blocked slots and enforces the configured weekly minimum for every teacher. Unused teaching slots are allowed. The minimum applies to the sample week. The objective minimizes teacher gaps: a free, non-blocked teaching slot between two taught slots in the same weekday and session. Teacher loads include a `gaps` count per teacher.

`calendar_expand.py` repeats the sample week across the semester and omits lessons on fixed holidays. Holiday weeks may therefore have fewer lessons. Make-up scheduling, date-specific availability, further optimization objectives, and an automated regression suite remain future work.

## Weekly results and export

- `/api/solve` includes class, teacher, and slot IDs on each lesson. It returns the class roster and teaching slots alongside the existing teacher loads. The result page filters a selected week by class or teacher ID, including entities with zero lessons.
- `static/timetable.js` builds the weekly grid from configured teaching slots and solved lessons. It shows morning before afternoon and marks holidays in the column headings. Sample-week teacher loads are always visible with a result. The expandable full weekly list comes last.
- `/api/timetable/saved` uses HEAD for availability, GET to reload, and PUT to replace the single saved SQLite snapshot. The homepage reads the saved sample-week teacher loads. An explicit all-data clear also deletes the saved timetable.
- The admin table selection is stored in session storage so a page reload keeps the table open in the same tab.
- `POST /api/timetable/export` uses `timetable_export.py` to write the displayed grid to an XLSX with OpenPyXL. The export covers one week and one class or teacher per download.
- Consecutive-period rules for classes by session remain future work.
