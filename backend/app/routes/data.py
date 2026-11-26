"""API quản lý dữ liệu đầu vào: nhập Excel, sửa trên lưới, cài đặt, thống kê."""
from datetime import datetime, timedelta
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from .. import models
from ..database import SessionLocal
from ..db_io import MINIMUM_KEY, get_minimum, read_all, replace_all
from ..excel_import import SHEETS, parse_and_validate, validate_tables

router = APIRouter(prefix="/api")

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
PREVIEW_TTL = timedelta(minutes=20)
PREVIEWS: dict[str, dict] = {}   # bản xem trước file Excel, giữ trong RAM 20 phút


class ConfirmImport(BaseModel):
    preview_id: str


class SettingsUpdate(BaseModel):
    minimum_periods_per_teacher: int = Field(ge=0, le=40)


def save_tables(tables: dict) -> None:
    """Thay toàn bộ dữ liệu đầu vào bằng `tables` (dùng chung cho nhập Excel và sửa trên lưới)."""
    try:
        with SessionLocal.begin() as session:
            replace_all(session, tables)
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail=f"Không thể lưu do vi phạm khóa hoặc dữ liệu trùng: {exc.orig}") from exc


# ---------- Cài đặt ----------

@router.get("/settings")
def get_settings() -> dict:
    with SessionLocal() as session:
        return {"minimum_periods_per_teacher": get_minimum(session)}


@router.put("/settings")
def update_settings(payload: SettingsUpdate) -> dict:
    value = str(payload.minimum_periods_per_teacher)
    with SessionLocal.begin() as session:
        item = session.get(models.AppSetting, MINIMUM_KEY)
        if item is None:
            session.add(models.AppSetting(key=MINIMUM_KEY, value=value))
        else:
            item.value = value
    return {"minimum_periods_per_teacher": payload.minimum_periods_per_teacher}


# ---------- Thống kê trang chủ ----------

@router.get("/data/summary")
def data_summary() -> dict:
    with SessionLocal() as session:
        def count(model):
            return session.scalar(select(func.count()).select_from(model)) or 0

        semester = session.scalars(select(models.SemesterConfig)).first()
        return {
            "counts": {
                "classes": count(models.SchoolClass), "subjects": count(models.Subject),
                "teachers": count(models.Teacher), "teacher_subjects": count(models.TeacherSubject),
                "demands": count(models.ClassSubjectDemand), "reference_assignments": count(models.TeachingAssignment),
                "time_slots": count(models.TimeSlot), "teacher_unavailable_slots": count(models.TeacherUnavailableSlot),
                "school_holidays": count(models.SchoolHoliday),
            },
            "semester": None if semester is None else {
                "id": semester.id, "name": semester.name,
                "start_date": semester.start_date.isoformat(), "duration_weeks": semester.duration_weeks,
                "end_date": (semester.start_date + timedelta(days=semester.duration_weeks * 7 - 1)).isoformat(),
            },
            "holiday_count": count(models.SchoolHoliday),
        }


@router.get("/teachers")
def list_teachers() -> list[dict]:
    """Danh sách giáo viên + số tiết trong bảng PhanCong tham khảo."""
    with SessionLocal() as session:
        loads: dict[str, int] = {}
        for a in session.scalars(select(models.TeachingAssignment)):
            loads[a.teacher_id] = loads.get(a.teacher_id, 0) + a.periods_per_week
        teachers = session.scalars(select(models.Teacher).order_by(models.Teacher.id))
        return [{"id": t.id, "name": t.display_name, "assigned_periods": loads.get(t.id, 0)} for t in teachers]


# ---------- Nhập file Excel ----------

@router.post("/input/preview")
async def preview_input(file: Annotated[UploadFile, File(description="Workbook theo mẫu input Project 3")]) -> dict:
    if not (file.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(status_code=415, detail="Chỉ hỗ trợ tệp .xlsx.")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Tệp vượt quá giới hạn 10 MB.")
    if not content.startswith(b"PK"):
        raise HTTPException(status_code=400, detail="Tệp tải lên không có định dạng XLSX hợp lệ.")

    with SessionLocal() as session:
        minimum = get_minimum(session)
    result = parse_and_validate(content, minimum)
    result["filename"] = file.filename
    result["preview_id"] = None

    data = result.pop("data", None)
    if result["valid"]:
        now = datetime.utcnow()
        for token, preview in list(PREVIEWS.items()):   # dọn bản xem trước đã hết hạn
            if preview["expires_at"] < now:
                PREVIEWS.pop(token)
        result["preview_id"] = str(uuid4())
        PREVIEWS[result["preview_id"]] = {"data": data, "filename": file.filename, "expires_at": now + PREVIEW_TTL}
    return result


@router.post("/input/confirm")
def confirm_input(payload: ConfirmImport) -> dict:
    preview = PREVIEWS.get(payload.preview_id)
    if preview is None or preview["expires_at"] < datetime.utcnow():
        PREVIEWS.pop(payload.preview_id, None)
        raise HTTPException(status_code=410, detail="Bản xem trước đã hết hạn. Hãy tải và kiểm tra lại file.")
    save_tables(preview["data"])
    PREVIEWS.pop(payload.preview_id, None)
    return {"saved": True, "filename": preview["filename"], "message": "Đã thay bộ dữ liệu hiện tại bằng dữ liệu từ Excel."}


# ---------- Sửa dữ liệu trên lưới (/admin) ----------

@router.get("/admin/data")
def get_admin_data() -> dict:
    with SessionLocal() as session:
        return {
            "tables": read_all(session),
            "columns": {name: list(columns) for name, columns in SHEETS.items()},
            "minimum_periods_per_teacher": get_minimum(session),
        }


@router.put("/admin/data")
def save_admin_data(payload: dict) -> dict:
    tables = payload.get("tables")
    if not isinstance(tables, dict) or set(tables) != set(SHEETS):
        raise HTTPException(status_code=422, detail="Dữ liệu phải có đủ và đúng các bảng đầu vào.")
    for name, rows in tables.items():
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise HTTPException(status_code=422, detail=f"Bảng {name} phải là danh sách các dòng dữ liệu.")

    with SessionLocal() as session:
        minimum = get_minimum(session)
    validation = validate_tables(tables, minimum)
    if not validation["valid"]:
        raise HTTPException(status_code=422, detail={
            "message": "Có lỗi dữ liệu. Chưa lưu thay đổi.",
            "errors": validation["errors"], "warnings": validation["warnings"],
        })
    save_tables(tables)
    return {"saved": True, "message": "Đã lưu các bảng dữ liệu vào cơ sở dữ liệu.", "warnings": validation["warnings"]}