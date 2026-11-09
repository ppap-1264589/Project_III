from __future__ import annotations

from datetime import date, datetime, timedelta
from io import BytesIO
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from openpyxl import Workbook
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import models
from .database import Base, DATA_DIR, SessionLocal, engine
from .excel_import import DEFAULT_MIN_TEACHING_PERIODS_PER_WEEK, SHEETS, parse_and_validate

app = FastAPI(title="Project 3 Timetable", description="Nhập dữ liệu thời khóa biểu từ Excel vào SQLite.", version="0.2.0")
app.mount("/static", StaticFiles(directory=Path(__file__).resolve().parent / "static"), name="static")
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
PREVIEW_TTL = timedelta(minutes=20)
PREVIEWS: dict[str, dict] = {}
INDEX_FILE = Path(__file__).resolve().parent / "static" / "index.html"


class ConfirmImport(BaseModel):
    preview_id: str


class SettingsUpdate(BaseModel):
    minimum_periods_per_teacher: int = Field(ge=0, le=40)


def current_minimum(session: Session) -> int:
    item = session.get(models.AppSetting, "minimum_periods_per_teacher")
    if item is None:
        return DEFAULT_MIN_TEACHING_PERIODS_PER_WEEK
    try:
        return max(0, int(item.value))
    except ValueError:
        return DEFAULT_MIN_TEACHING_PERIODS_PER_WEEK


@app.on_event("startup")
def initialize_database() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal.begin() as session:
        if session.get(models.AppSetting, "minimum_periods_per_teacher") is None:
            session.add(models.AppSetting(key="minimum_periods_per_teacher", value=str(DEFAULT_MIN_TEACHING_PERIODS_PER_WEEK)))


@app.get("/", include_in_schema=False)
def home():
    return FileResponse(INDEX_FILE)


@app.get("/admin", include_in_schema=False)
def admin_page():
    return FileResponse(Path(__file__).resolve().parent / "static" / "admin.html")


@app.get("/solver", include_in_schema=False)
def solver_page():
    return FileResponse(Path(__file__).resolve().parent / "static" / "solver.html")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/settings")
def get_settings() -> dict[str, int]:
    with SessionLocal() as session:
        return {"minimum_periods_per_teacher": current_minimum(session)}


@app.put("/api/settings")
def update_settings(payload: SettingsUpdate) -> dict[str, int]:
    with SessionLocal.begin() as session:
        item = session.get(models.AppSetting, "minimum_periods_per_teacher")
        if item is None:
            session.add(models.AppSetting(key="minimum_periods_per_teacher", value=str(payload.minimum_periods_per_teacher)))
        else:
            item.value = str(payload.minimum_periods_per_teacher)
    return {"minimum_periods_per_teacher": payload.minimum_periods_per_teacher}


@app.get("/api/data/summary")
def data_summary() -> dict:
    with SessionLocal() as session:
        models_and_names = [
            ("classes", models.SchoolClass), ("subjects", models.Subject), ("teachers", models.Teacher),
            ("teacher_subjects", models.TeacherSubject), ("demands", models.ClassSubjectDemand),
            ("reference_assignments", models.TeachingAssignment), ("time_slots", models.TimeSlot),
            ("teacher_unavailable_slots", models.TeacherUnavailableSlot),
            ("semester_configs", models.SemesterConfig), ("school_holidays", models.SchoolHoliday),
        ]
        counts = {name: session.scalar(select(func.count()).select_from(model)) or 0 for name, model in models_and_names}
        teachers = session.scalars(select(models.Teacher).order_by(models.Teacher.id)).all()
        assignments = session.scalars(select(models.TeachingAssignment)).all()
        loads = {teacher.id: 0 for teacher in teachers}
        for assignment in assignments:
            loads[assignment.teacher_id] = loads.get(assignment.teacher_id, 0) + assignment.periods_per_week
        return {
            "counts": counts,
            "reference_assignment_loads": loads,
            "minimum_periods_per_teacher": current_minimum(session),
            "semester": next(({
                "id": item.id, "name": item.name, "start_date": item.start_date.isoformat(),
                "duration_weeks": item.duration_weeks,
                "end_date": (item.start_date + timedelta(days=item.duration_weeks * 7 - 1)).isoformat(),
            } for item in session.scalars(select(models.SemesterConfig).order_by(models.SemesterConfig.id))), None),
            "holiday_count": session.scalar(select(func.count()).select_from(models.SchoolHoliday)) or 0,
            "database": str(DATA_DIR / "timetable.db"),
        }


@app.post("/api/input/preview")
async def preview_input(file: Annotated[UploadFile, File(description="Workbook theo mẫu input Project 3")]) -> dict:
    if not (file.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(status_code=415, detail="Chỉ hỗ trợ tệp .xlsx.")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Tệp vượt quá giới hạn 10 MB.")
    if not content.startswith(b"PK"):
        raise HTTPException(status_code=400, detail="Tệp tải lên không có định dạng XLSX hợp lệ.")
    with SessionLocal() as session:
        minimum = current_minimum(session)
    result = parse_and_validate(content, minimum)
    result["filename"] = file.filename
    result["preview_id"] = None
    if result["valid"]:
        now = datetime.utcnow()
        for token, preview in list(PREVIEWS.items()):
            if preview["expires_at"] < now:
                PREVIEWS.pop(token, None)
        preview_id = str(uuid4())
        PREVIEWS[preview_id] = {
            "data": result.pop("data"),
            "filename": file.filename,
            "expires_at": now + PREVIEW_TTL,
        }
        result["preview_id"] = preview_id
    else:
        result.pop("data", None)
    return result


def replace_all_input_data(session: Session, data: dict[str, list[dict]]) -> None:
    # Remove dependent rows first; application settings are preserved.
    for model in (
        models.TeacherUnavailableSlot, models.TeachingAssignment, models.ClassSubjectDemand,
        models.SchoolHoliday, models.SemesterConfig, models.TeacherSubject, models.TimeSlot,
        models.Teacher, models.Subject, models.SchoolClass,
    ):
        session.execute(delete(model))

    session.add_all(models.SchoolClass(id=row["lop_id"], name=row["ten_lop"], grade=int(row["khoi"])) for row in data["Lop"])
    session.add_all(models.Subject(id=row["mon_id"], name=row["ten_mon"]) for row in data["Mon"])
    session.add_all(models.Teacher(id=row["giao_vien_id"], display_name=row["ten_hien_thi"]) for row in data["GiaoVien"])
    # Flush parent rows first: without ORM relationships, SQLAlchemy does not
    # infer the insert ordering from foreign keys alone.
    session.flush()
    session.add_all(models.TeacherSubject(teacher_id=row["giao_vien_id"], subject_id=row["mon_id"]) for row in data["GV_Mon"])
    session.add_all(models.ClassSubjectDemand(class_id=row["lop_id"], subject_id=row["mon_id"], periods_per_week=int(row["so_tiet_tuan"])) for row in data["NhuCau"])
    session.add_all(models.TeachingAssignment(
        id=row["phan_cong_id"], class_id=row["lop_id"], subject_id=row["mon_id"],
        teacher_id=row["giao_vien_id"], periods_per_week=int(row["so_tiet_tuan"]),
    ) for row in data["PhanCong"])
    session.add_all(models.TimeSlot(
        id=row["khung_gio_id"], weekday=row["thu"], session=row["buoi"], period_number=int(row["tiet_so"]),
        start_time=str(row["gio_bat_dau"]), duration_minutes=int(row["thoi_luong_phut"]),
        break_after_minutes=int(row["nghi_sau_tiet_phut"]), slot_type=row["loai_khung"],
        note=row["ghi_chu"] or "",
    ) for row in data["KhungGio"])
    session.add_all(models.TeacherUnavailableSlot(
        teacher_id=row["giao_vien_id"], weekday=row["thu"], session=row["buoi"],
        period_number=int(row["tiet_so"]), note=row["ghi_chu"] or "",
    ) for row in data["GV_Ban"])
    session.add_all(models.SemesterConfig(
        id=row["hoc_ky_id"], name=row["ten_hoc_ky"],
        start_date=date.fromisoformat(str(row["ngay_bat_dau"])[:10]), duration_weeks=int(row["so_tuan"]),
    ) for row in data["HocKy"])
    session.add_all(models.SchoolHoliday(
        id=row["ngay_nghi_id"], date=date.fromisoformat(str(row["ngay"])[:10]), name=row["ten_ngay_nghi"],
    ) for row in data["NgayNghi"])


def database_rows(session: Session) -> dict[str, list[dict]]:
    return {
        "Lop": [{"lop_id": r.id, "ten_lop": r.name, "khoi": r.grade} for r in session.scalars(select(models.SchoolClass).order_by(models.SchoolClass.id))],
        "Mon": [{"mon_id": r.id, "ten_mon": r.name} for r in session.scalars(select(models.Subject).order_by(models.Subject.id))],
        "GiaoVien": [{"giao_vien_id": r.id, "ten_hien_thi": r.display_name} for r in session.scalars(select(models.Teacher).order_by(models.Teacher.id))],
        "GV_Mon": [{"giao_vien_id": r.teacher_id, "mon_id": r.subject_id} for r in session.scalars(select(models.TeacherSubject).order_by(models.TeacherSubject.teacher_id, models.TeacherSubject.subject_id))],
        "NhuCau": [{"lop_id": r.class_id, "mon_id": r.subject_id, "so_tiet_tuan": r.periods_per_week} for r in session.scalars(select(models.ClassSubjectDemand).order_by(models.ClassSubjectDemand.class_id, models.ClassSubjectDemand.subject_id))],
        "PhanCong": [{"phan_cong_id": r.id, "lop_id": r.class_id, "mon_id": r.subject_id, "giao_vien_id": r.teacher_id, "so_tiet_tuan": r.periods_per_week} for r in session.scalars(select(models.TeachingAssignment).order_by(models.TeachingAssignment.id))],
        "KhungGio": [{"khung_gio_id": r.id, "thu": r.weekday, "buoi": r.session, "tiet_so": r.period_number, "gio_bat_dau": r.start_time, "thoi_luong_phut": r.duration_minutes, "nghi_sau_tiet_phut": r.break_after_minutes, "loai_khung": r.slot_type, "ghi_chu": r.note} for r in session.scalars(select(models.TimeSlot).order_by(models.TimeSlot.weekday, models.TimeSlot.session, models.TimeSlot.period_number))],
        "GV_Ban": [{"giao_vien_id": r.teacher_id, "thu": r.weekday, "buoi": r.session, "tiet_so": r.period_number, "ghi_chu": r.note} for r in session.scalars(select(models.TeacherUnavailableSlot).order_by(models.TeacherUnavailableSlot.teacher_id, models.TeacherUnavailableSlot.weekday, models.TeacherUnavailableSlot.session, models.TeacherUnavailableSlot.period_number))],
        "HocKy": [{"hoc_ky_id": r.id, "ten_hoc_ky": r.name, "ngay_bat_dau": r.start_date.isoformat(), "so_tuan": r.duration_weeks} for r in session.scalars(select(models.SemesterConfig).order_by(models.SemesterConfig.id))],
        "NgayNghi": [{"ngay_nghi_id": r.id, "ngay": r.date.isoformat(), "ten_ngay_nghi": r.name} for r in session.scalars(select(models.SchoolHoliday).order_by(models.SchoolHoliday.date, models.SchoolHoliday.id))],
    }


def validate_admin_tables(tables: dict[str, list[dict]], minimum: int) -> dict:
    workbook = Workbook()
    workbook.remove(workbook.active)
    for table_name, columns in SHEETS.items():
        sheet = workbook.create_sheet(table_name)
        sheet.cell(4, 1, columns[0])
        for column_index, column in enumerate(columns, start=1):
            sheet.cell(4, column_index, column)
        for row_index, row in enumerate(tables[table_name], start=5):
            for column_index, column in enumerate(columns, start=1):
                sheet.cell(row_index, column_index, row.get(column))
    stream = BytesIO()
    workbook.save(stream)
    workbook.close()
    return parse_and_validate(stream.getvalue(), minimum)


@app.get("/api/admin/data")
def get_admin_data() -> dict:
    with SessionLocal() as session:
        return {
            "tables": database_rows(session),
            "columns": {name: list(columns) for name, columns in SHEETS.items()},
            "minimum_periods_per_teacher": current_minimum(session),
        }


@app.put("/api/admin/data")
def save_admin_data(payload: dict) -> dict:
    tables = payload.get("tables")
    if not isinstance(tables, dict) or set(tables) != set(SHEETS):
        raise HTTPException(status_code=422, detail="Dữ liệu phải có đủ và đúng các bảng đầu vào.")
    for name, rows in tables.items():
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise HTTPException(status_code=422, detail=f"Bảng {name} phải là danh sách các dòng dữ liệu.")
    with SessionLocal() as session:
        minimum = current_minimum(session)
    validation = validate_admin_tables(tables, minimum)
    if not validation["valid"]:
        raise HTTPException(status_code=422, detail={
            "message": "Có lỗi dữ liệu. Chưa lưu thay đổi.",
            "errors": validation["errors"],
            "warnings": validation["warnings"],
        })
    try:
        with SessionLocal.begin() as session:
            replace_all_input_data(session, tables)
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail=f"Không thể lưu do vi phạm khóa hoặc dữ liệu trùng: {exc.orig}") from exc
    return {
        "saved": True,
        "message": "Đã lưu các bảng dữ liệu vào cơ sở dữ liệu.",
        "warnings": validation["warnings"],
    }


@app.post("/api/input/confirm")
def confirm_input(payload: ConfirmImport) -> dict:
    preview = PREVIEWS.get(payload.preview_id)
    if preview is None or preview["expires_at"] < datetime.utcnow():
        PREVIEWS.pop(payload.preview_id, None)
        raise HTTPException(status_code=410, detail="Bản xem trước đã hết hạn. Hãy tải và kiểm tra lại file.")
    try:
        with SessionLocal.begin() as session:
            replace_all_input_data(session, preview["data"])
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail=f"Không thể lưu do vi phạm khóa hoặc dữ liệu trùng: {exc.orig}") from exc
    PREVIEWS.pop(payload.preview_id, None)
    return {"saved": True, "filename": preview["filename"], "message": "Đã thay bộ dữ liệu hiện tại bằng dữ liệu từ Excel."}


@app.get("/api/teachers")
def list_teachers() -> list[dict]:
    with SessionLocal() as session:
        teachers = session.scalars(select(models.Teacher).order_by(models.Teacher.id)).all()
        loads: dict[str, int] = {teacher.id: 0 for teacher in teachers}
        for assignment in session.scalars(select(models.TeachingAssignment)).all():
            loads[assignment.teacher_id] = loads.get(assignment.teacher_id, 0) + assignment.periods_per_week
        return [{"id": teacher.id, "name": teacher.display_name, "assigned_periods": loads[teacher.id]} for teacher in teachers]


@app.get("/api/availability")
def get_availability(teacher_id: str, start: date, end: date) -> dict:
    with SessionLocal() as session:
        if session.get(models.Teacher, teacher_id) is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy giáo viên.")
        slots = session.scalars(select(models.TeacherDateUnavailableSlot).where(
            models.TeacherDateUnavailableSlot.teacher_id == teacher_id,
            models.TeacherDateUnavailableSlot.date >= start,
            models.TeacherDateUnavailableSlot.date <= end,
        )).all()
        return {"busy": [f"{row.date.isoformat()}|{row.session}|{row.period_number}" for row in slots]}


@app.put("/api/availability")
def save_availability(payload: dict) -> dict:
    teacher_id = str(payload.get("teacher_id", ""))
    start, end = date.fromisoformat(payload["start"]), date.fromisoformat(payload["end"])
    busy = payload.get("busy", [])
    with SessionLocal.begin() as session:
        if session.get(models.Teacher, teacher_id) is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy giáo viên.")
        session.execute(delete(models.TeacherDateUnavailableSlot).where(
            models.TeacherDateUnavailableSlot.teacher_id == teacher_id,
            models.TeacherDateUnavailableSlot.date >= start,
            models.TeacherDateUnavailableSlot.date <= end,
        ))
        valid = {(r.weekday, r.session, r.period_number) for r in session.scalars(select(models.TimeSlot)).all() if r.slot_type == "Tiết học"}
        for item in busy:
            day, session_name, period = item.split("|")
            day_value = date.fromisoformat(day)
            if not start <= day_value <= end or (day_value.strftime("%A"), session_name, int(period)) not in valid:
                # Weekday labels in Excel are localized, so validate session/period only.
                if not start <= day_value <= end or not any(s == session_name and p == int(period) for _, s, p in valid):
                    raise HTTPException(status_code=422, detail="Khung giờ bận không hợp lệ.")
            session.add(models.TeacherDateUnavailableSlot(teacher_id=teacher_id, date=day_value, session=session_name, period_number=int(period)))
    return {"saved": True}


from .solver import solve_week, weekday_index
@app.post("/api/solve")
def solve(payload: dict) -> dict:
    raw = payload.get("week_start")
    try:
        week_start = date.fromisoformat(raw) if raw else None
    except ValueError:
        raise HTTPException(status_code=422, detail="week_start phải có dạng YYYY-MM-DD.")
    with SessionLocal() as session:
        return solve_week(session, week_start)