# Project memory: Project 3 timetable app

## Purpose and handoff

This repository contains a Vietnamese, local web application for importing school timetable data, validating it, editing it in a grid, recording teacher unavailability, and generating a weekly timetable. It is a student project for a lower secondary school (THCS). Treat the workbook's school data and all sample names/dates as synthetic demonstration data, not real school records or official curriculum requirements.

Use this file as the starting context when working in this repository. The README and planning document are useful companion references. Preserve the Vietnamese UI and existing workbook/API field names unless the user requests a change.

## Current implementation

- Backend: Python 3.10+, FastAPI, SQLAlchemy, SQLite, OpenPyXL, OR-Tools CP-SAT.
- Frontend: plain HTML/CSS/JavaScript under `backend/app/static`; no frontend build step.
- `backend/app/main.py`: API routes, Excel preview/confirm import, admin table editing, teacher date availability, and weekly solver.
- `backend/app/excel_import.py`: workbook schema and validation (headers, required cells, duplicate keys, references, qualified subjects, positive periods, slot validity, semester, holidays, and reference-load warnings).
- `backend/app/models.py`: SQLAlchemy entities. `backend/app/database.py` creates `backend/data/timetable.db` and enables SQLite foreign keys.
- `normalize_workbook.mjs`: generates a synthetic sample workbook using `@oai/artifact-tool`; its output path is currently hard-coded to the original developer's Windows path. It may need adapting before reuse elsewhere.
- `Bảng nhu cầu lịch học - học kỳ.xlsx`: current sample input workbook. `outputs/20261106-project3-sample/` contains another generated sample.
- `Kế hoạch thực hiện Project 3.docx`: original project scope and phased plan.
- `backend/data/timetable.db` is runtime state and is ignored by Git. Python `__pycache__` files are incidental and should not be treated as source.

## Run locally on Windows

From repository root, run `backend\\run.bat`. It creates `backend/.venv` if needed, installs `backend/requirements.txt`, then runs Uvicorn with reload. Requires Python 3.10+. Open:

- `/` — upload/preview/confirm Excel workbook
- `/admin` — edit the workbook tables in a grid
- `/solver` — set date-specific teacher busy slots and solve the selected week
- `/docs` — FastAPI API docs
- `/health` — health check

SQLite is created automatically at `backend/data/timetable.db`. The minimum teacher-period setting is stored in `app_settings`, defaults to 19, and is preserved when imported/admin data tables are replaced.

## Workbook contract

The required sheets are `Lop`, `Mon`, `GiaoVien`, `GV_Mon`, `NhuCau`, `PhanCong`, `KhungGio`, `GV_Ban`, `HocKy`, and `NgayNghi`. Headers are on row 4 and data begins at row 5. `Doc huong dan` and `KiemTraInput` are explanatory/check sheets and are not imported as business tables. Sheet/column names are defined by `SHEETS` in `backend/app/excel_import.py`.

IDs are strings (examples: `CLS-6A`, `SUB-MATH`, `TCH-MATH-01`). Foreign-key relationships should use IDs, never display labels. `GV_Mon` declares teacher qualifications. `NhuCau` is weekly class-subject demand. `PhanCong` is explicitly treated as a reference assignment table in the current app, despite also being used as solver input. `KhungGio` distinguishes `Tiết học` from `Hoạt động`; activities such as truy bài and Friday homeroom should not count as teaching periods. `HocKy` must contain exactly one row; holidays are specific dates.

The sample workbook represents 16 classes (grades 6–9, sections A–D), 10 subjects, 11 synthetic teachers, 160 demand rows, and 27 periods/class/week (432 total). The timetable has Monday–Friday, 5 morning teaching periods and 4 afternoon periods, plus activity slots. Demo semester values and holidays are illustrative and should be changed for any real scenario.

## Solver behavior and important gaps

The current `/api/solve` builds CP-SAT Boolean choices from `TeachingAssignment` (`PhanCong`) rows and `KhungGio` rows where `loai_khung == "Tiết học"`. It enforces the specified assignment count for each assignment row and at most one lesson per class and per teacher in each slot. It blocks recurring `GV_Ban` slots, date-specific teacher blocks for the selected week, and holiday dates that fall in that selected week. The solver has a 10-second time limit and returns a schedule or a generic infeasible response.

Do not describe the following as implemented requirements:

- The project plan calls for exactly 19 teaching periods per teacher, with feasibility diagnostics. Current setting only warns when imported/reference assignment load is below a configurable minimum (default 19); it does not constrain CP-SAT to exactly 19 or report per-teacher solver loads.
- The plan expects the solver to expand `NhuCau` into lesson requests. Current solver instead schedules `PhanCong` rows; loaded `NhuCau` is currently unused in the solve constraints. This makes the distinction between reference assignments and algorithm inputs an important design issue to resolve.
- Current solver checks class/teacher collisions and unavailable slots but does not enforce that each assigned teacher is qualified for that subject at solve time (Excel/admin validation checks reference rows).
- No optimization objectives are applied (e.g. avoid subject clustering, reduce gaps), and there is no independent post-solve verifier or detailed conflict explanation.
- Semester duration is reported/validated, but the solver generates a weekly pattern. Holidays are only blocked when a `week_start` is supplied and a holiday falls in that selected 7-day window; the semester is not expanded into a semester calendar.
- The plan mentions viewing by class/teacher, locked lessons, unscheduled lessons, CSV/print export, and richer diagnostics. These are not present in the current `/solver` flow.

These are candidate next steps, not a mandate to change scope. Confirm which source should be authoritative (`NhuCau` plus teacher-selection logic vs. fixed `PhanCong`) before changing the solver model.

## Data validation and update semantics

Excel upload is limited to `.xlsx` and 10 MB. Preview is held in process memory for 20 minutes; only a valid preview gets a token. Confirm replaces all timetable input tables in a database transaction while retaining application settings. Admin save validates the complete set of tables before replacing them transactionally. Warnings (including reference assignment mismatch and load below minimum) do not make a workbook invalid; validation errors do.

Availability on `/solver` is stored per teacher/date/session/period. Saving a selected week replaces that teacher's date-specific busy entries only within that week. Recurring `GV_Ban` remains a separate weekly rule.

## Project principles and workflow

The planning doc prioritizes hard constraints: no class/teacher double booking, qualified teachers, unavailable slots respected, all required periods scheduled, and exactly 19 weekly teaching periods per teacher. If the data cannot satisfy hard requirements, report infeasibility rather than silently relaxing constraints. Suggested quality goals (after validity is stable) include reducing teacher gaps, avoiding repeated same-day subjects, and avoiding late periods.

The intended audience is a timetable administrator. The app supports decisions; school staff remain responsible for reviewing the result. Keep demo data clearly labeled as hypothetical. When implementing, check the affected workbook contract and both Excel import and admin validation paths, and update README/UI copy if behavior changes.

## Repository state and verification caveat

At handoff, the workspace did not expose a Git repository (`git status`/`git log` returned “not a git repository”), so there is no verified commit history or clean/dirty status to report. No automated test suite was found in the visible file list. No test suite was run while preparing this memory. Use focused checks when the user requests verification or when a code change needs validation.
