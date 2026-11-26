# Project memory: Project 3 timetable app

## Purpose and handoff

Vietnamese, local web application for a lower secondary school (THCS) timetable: import school data from Excel, validate it, edit it in the browser, record teacher busy slots, and generate a timetable for the whole semester. It is a student project. Treat all school data, names and dates in the sample workbook as synthetic demonstration data, not real school records or official curriculum requirements.

Use this file as starting context. Preserve the Vietnamese UI and the existing workbook/API field names unless the user asks for a change. The user (Hoang) works in Vietnamese; reply in Vietnamese. Code changes are usually given as snippets for the user to paste, and have only been checked manually in the browser, not by automated tests.

## Stack and layout

- Backend: Python 3.10+, FastAPI, SQLAlchemy, SQLite, OpenPyXL, OR-Tools CP-SAT. Frontend: plain HTML/CSS/JS in `backend/app/static`, no build step.
- `backend/app/main.py`: app setup, page routes (`/`, `/admin`, `/busy`, `/timetable`), startup DB init and the default minimum-periods setting.
- `backend/app/routes/excel.py`: Excel preview and confirm.
- `backend/app/routes/data.py`: admin table load/save/clear, settings, summary, teacher list. Contains `AUTO_ID` and `fill_auto_ids`.
- `backend/app/routes/busy.py`: recurring weekly teacher busy slots (`GV_Ban`), plus `/api/slots`.
- `backend/app/routes/timetable.py`: `/api/solve` (loads DB, calls solver, expands to semester).
- `backend/app/solver.py`: CP-SAT model for one sample week; no database access.
- `backend/app/calendar_expand.py`: replicates the sample week across the semester and drops lessons on holidays.
- `backend/app/db_io.py`: sheet-to-model mapping (`TABLES`, parent tables first), `replace_all`, `read_all`, `get_minimum`.
- `backend/app/excel_import.py`: workbook reader. `input_schema.py` defines `SHEETS`, and `input_validation.py` checks the parsed tables. `backend/app/models.py`, `database.py`, `helpers.py` (Vietnamese weekday/session helpers).
- Static pages: `index.html`/`app.js` (Excel import), `admin.html`/`admin.js` (grid editing), `busy.html`/`busy.js`, `timetable.html`/`timetable.js`, shared `app.css`.
- `normalize_workbook.mjs` generates the synthetic sample workbook with `@oai/artifact-tool`; its output path is hard-coded to the original developer's Windows path. `Bảng nhu cầu lịch học - học kỳ.xlsx` is the current sample input. `Kế hoạch thực hiện Project 3.docx` is the original plan.
- `backend/data/timetable.db` is runtime state (Git-ignored). `__pycache__` is incidental.

## Run locally (Windows)

From the repo root run `backend\run.bat` (creates `backend/.venv`, installs `requirements.txt`, runs Uvicorn with reload). Pages: `/` import Excel, `/admin` grid editing, `/busy` weekly busy slots, `/timetable` solve and view by week, `/docs` API docs, `/health`. If port 8000 is blocked (`WinError 10013`), kill the process holding it (`netstat -ano | findstr :8000`, `taskkill /PID ... /F`), restart WinNAT as admin (`net stop winnat`, `net start winnat`), or change `--port` in `run.bat`. A `pause` at the end of `run.bat` helps when the window closes on errors.

## Workbook contract

Required sheets: `Lop`, `Mon`, `GiaoVien`, `GV_Mon`, `NhuCau`, `PhanCong`, `KhungGio`, `GV_Ban`, `HocKy`, `NgayNghi`. Headers on row 4, data from row 5. `Doc huong dan` and `KiemTraInput` are explanatory sheets and are not imported. Column names are defined by `SHEETS` in `input_schema.py`.

IDs are strings (`CLS-6A`, `SUB-MATH`, `TCH-MATH-01`); foreign keys always use IDs, never display names. `GV_Mon` = teacher qualifications. `NhuCau` = weekly periods per class-subject. `PhanCong` = reference assignment table only (a mismatch with `NhuCau` is a warning, and it is not a solver input). `KhungGio` has `Tiết học` (teaching) and `Hoạt động` (truy bài, Friday homeroom; not teaching periods). `HocKy` must have exactly one row; `NgayNghi` holds specific holiday dates.

Sample data: 16 classes (grades 6-9, sections A-D), 10 subjects, 11 synthetic teachers, 160 demand rows, 27 periods per class per week. Monday-Friday, 5 morning and 4 afternoon teaching periods plus activity slots. Demo semester dates and holidays are illustrative.

## Data semantics

- Excel upload: `.xlsx` only, max 10 MB. The preview is held in memory for 20 minutes; only a valid preview gets a token. Confirm replaces all input tables in one transaction and keeps app settings (minimum periods per teacher, default 19, stored in `app_settings`).
- Admin save validates all tables together (by writing a temporary workbook and reusing `parse_and_validate`), then replaces them transactionally. Warnings do not block saving; errors do.
- Busy slots are recurring weekly (`GV_Ban`, key = weekday + session + period). There is no date-specific availability in the current code.

## Solver (current behavior)

`/api/solve` builds a CP-SAT model from `NhuCau`, `GV_Mon`, `KhungGio` (only `Tiết học`) and `GV_Ban`. For each (class, subject) it chooses exactly one qualified teacher who teaches all the periods; at most one lesson per class and per teacher per slot; busy slots are excluded. It solves one sample week, then `calendar_expand.py` replicates it over the semester and drops lessons on holidays (no make-up). Pre-solve checks report subjects with no qualified teacher and class load above the number of slots. Result statuses: optimal/feasible, infeasible, timeout, error. Per-teacher weekly loads are returned; teachers below the minimum only produce warnings.

Not implemented (do not describe as done): exactly 19 periods per teacher; richer infeasibility diagnostics; optimization objectives (gaps, same-subject clustering, late periods); an independent post-solve verifier; per-class/per-teacher views, locked lessons, unscheduled lessons, CSV/print export; date-specific availability; holiday make-up. The planning document expects the hard constraints above; if data cannot satisfy them, report infeasibility rather than silently relaxing constraints.

## Admin UI (`/admin`) progress

Done:
- Auto-generated IDs on save for `Lop` (`CLS-nn`), `Mon` (`SUB-nn`), `GiaoVien` (`TCH-nn`) via `fill_auto_ids`, called in `save_admin_data` before validation. Existing IDs are kept. Lop and Mon ID columns are hidden; the GiaoVien ID is shown read-only (read-only is enforced in the UI only, not in the backend).
- `GV_Mon`: custom view with the teacher shown as "id - name"; subjects added with a `+` picker from `Mon`, one per line, sorted A-Z. Rows that point to deleted teachers/subjects are pruned before saving.
- `NhuCau`: custom matrix view (rows = classes sorted by grade then name, columns = subjects sorted A-Z, cell = periods per week, blank/0 = no row, row totals). It still saves as `lop_id, mon_id, so_tiet_tuan` rows, so the backend and solver are unchanged. Invalid cells (not an integer 0-40) block saving.
- Enter moves down a row (and adds a row at the end of a normal grid); "Thêm dòng" still works. New teachers/classes/subjects must be saved once to get IDs before they appear in `GV_Mon`/`NhuCau`.
- `admin.js` coordinates loading, saving, and switching views. In `static/admin/`, `table-grid.js` manages normal editable tables, `teacher-subjects.js` manages `GV_Mon`, and `demand-matrix.js` manages `NhuCau`. Styles are in `app.css`.

Next candidates:
- `PhanCong`: use name-based dropdowns, or hide it (it is reference data only).
- Name-based selection in the remaining tables (`GV_Ban`, etc.) and hide IDs everywhere.
- Backend rejection of changed teacher IDs.
- Decide whether `NhuCau` plus teacher choice by the solver, or a fixed `PhanCong`, is the authority (the solver currently uses `NhuCau`).
- Solver improvements listed above; automated tests.

## Principles and workflow

Hard constraints first: no class/teacher double booking, qualified teachers, busy slots respected, all required periods scheduled, then the 19-period rule. Quality goals come after validity. The intended user is a timetable administrator; staff review the result. Keep demo data clearly labeled as hypothetical. When changing behavior, check the workbook contract and both the Excel import and admin validation paths, and update the README and UI copy.

## Repository state

At the last handoff the workspace was not a Git repository and no automated test suite existed. Check `git status` before assuming anything about history.
