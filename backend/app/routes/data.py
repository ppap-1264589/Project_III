"""API quản lý dữ liệu đầu vào: sửa trên lưới, cài đặt, thống kê."""
import re
from datetime import timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from .. import models
from ..database import SessionLocal
from ..db_io import MINIMUM_KEY, get_minimum, read_all, replace_all
from ..excel_import import validate_tables
from ..input_schema import SHEETS
from .data_storage import save_tables
from .excel import clear_previews

router = APIRouter(prefix="/api")

class SettingsUpdate(BaseModel):
    minimum_periods_per_teacher: int = Field(ge=0, le=40)


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
        saved = session.get(models.SavedTimetable, 1)
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
            "has_saved_timetable": saved is not None,
        }


@router.get("/teachers")
def list_teachers() -> list[dict]:
    """Số tiết trong tuần mẫu của thời khóa biểu đã lưu."""
    with SessionLocal() as session:
        saved = session.get(models.SavedTimetable, 1)
        if saved is not None:
            loads = sorted(saved.result["teacher_loads"], key=lambda item: item["teacher_id"])
            return [{"id": t["teacher_id"], "name": t["teacher"], "assigned_periods": t["periods"]} for t in loads]
        teachers = session.scalars(select(models.Teacher).order_by(models.Teacher.id))
        return [{"id": t.id, "name": t.display_name, "assigned_periods": 0} for t in teachers]


# ---------- Sửa dữ liệu trên lưới (/admin) ----------

@router.get("/admin/data")
def get_admin_data() -> dict:
    with SessionLocal() as session:
        return {
            "tables": read_all(session),
            "columns": {name: list(columns) for name, columns in SHEETS.items()},
            "minimum_periods_per_teacher": get_minimum(session),
        }


# Bảng -> (cột mã, tiền tố) cho những bảng mà mã do hệ thống tự sinh.
AUTO_ID = {
    "Lop": ("lop_id", "CLS-"),
    "Mon": ("mon_id", "SUB-"),
    "GiaoVien": ("giao_vien_id", "TCH-"),
}


def fill_auto_ids(tables: dict) -> None:
    """Dòng nào để trống mã thì sinh mã tiếp theo: CLS-01, CLS-02, ... (không trùng mã đang có)."""
    for sheet, (column, prefix) in AUTO_ID.items():
        rows = tables[sheet]
        used = {str(row.get(column) or "").strip() for row in rows}
        pattern = re.compile(rf"^{re.escape(prefix)}(\d+)$")
        numbers = [int(m.group(1)) for value in used if (m := pattern.match(value))]
        next_number = max(numbers, default=0) + 1
        for row in rows:
            if str(row.get(column) or "").strip():
                continue
            while f"{prefix}{next_number:02d}" in used:
                next_number += 1
            row[column] = f"{prefix}{next_number:02d}"
            used.add(row[column])
            next_number += 1


@router.put("/admin/data")
def save_admin_data(payload: dict) -> dict:
    tables = payload.get("tables")
    if not isinstance(tables, dict) or set(tables) != set(SHEETS):
        raise HTTPException(status_code=422, detail="Dữ liệu phải có đủ và đúng các bảng đầu vào.")
    for name, rows in tables.items():
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise HTTPException(status_code=422, detail=f"Bảng {name} phải là danh sách các dòng dữ liệu.")

    fill_auto_ids(tables)
    with SessionLocal() as session:
        minimum = get_minimum(session)
    validation = validate_tables(tables, minimum)
    if not validation["valid"]:
        raise HTTPException(status_code=422, detail={
            "message": "Có lỗi dữ liệu. Chưa lưu thay đổi.",
            "errors": validation["errors"], "warnings": validation["warnings"],
        })
    save_tables(validation["data"])
    return {"saved": True, "message": "Đã lưu các bảng dữ liệu vào cơ sở dữ liệu.", "warnings": validation["warnings"]}


@router.delete("/admin/data")
def clear_all_data() -> dict:
    """Xóa sạch mọi bảng dữ liệu đầu vào (Excel hoặc nhập tay). Cài đặt mức tiết tối thiểu được giữ nguyên."""
    with SessionLocal.begin() as session:
        replace_all(session, {name: [] for name in SHEETS})
        saved = session.get(models.SavedTimetable, 1)
        if saved is not None:
            session.delete(saved)
    clear_previews()
    return {"cleared": True, "message": "Đã xóa toàn bộ dữ liệu khỏi hệ thống."}
