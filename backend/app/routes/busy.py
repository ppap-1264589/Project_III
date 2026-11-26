"""API giờ bận của giáo viên. Một giờ bận = (thứ, buổi, tiết) và áp dụng cho MỌI tuần.

Dữ liệu lưu trong bảng GV_Ban (models.TeacherUnavailableSlot).
Khóa dùng giữa frontend và backend có dạng "Thứ Hai|Sáng|1".
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from .. import models
from ..database import SessionLocal
from ..helpers import session_order, weekday_index

router = APIRouter(prefix="/api")


class BusyUpdate(BaseModel):
    busy: list[str]   # ví dụ ["Thứ Hai|Sáng|1", "Thứ Hai|Sáng|2"]


def slot_key(weekday, session, period) -> str:
    return f"{weekday}|{session}|{period}"


def time_range(start, minutes) -> str:
    """'07:00' + 45 phút -> '07:00–07:45'."""
    try:
        hour, minute = (int(part) for part in str(start).split(":")[:2])
    except ValueError:
        return ""
    begin = hour * 60 + minute
    end = begin + int(minutes)
    return f"{begin // 60:02d}:{begin % 60:02d}–{end // 60:02d}:{end % 60:02d}"


@router.get("/slots")
def list_teaching_slots() -> list[dict]:
    """Các khung 'Tiết học' đã sắp xếp theo thứ, buổi, tiết (để vẽ lưới giờ bận)."""
    with SessionLocal() as session:
        slots = [
            {
                "key": slot_key(s.weekday, s.session, s.period_number),
                "weekday": s.weekday, "session": s.session, "period": s.period_number,
                "order": session_order(s.session) * 100 + s.period_number,   # thứ tự dòng trong lưới
                "time": time_range(s.start_time, s.duration_minutes),
            }
            for s in session.scalars(select(models.TimeSlot)) if s.slot_type == "Tiết học"
        ]
    slots.sort(key=lambda s: (9 if weekday_index(s["weekday"]) is None else weekday_index(s["weekday"]), s["order"]))
    return slots


@router.get("/busy/{teacher_id}")
def get_busy(teacher_id: str) -> dict:
    with SessionLocal() as session:
        if session.get(models.Teacher, teacher_id) is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy giáo viên.")
        rows = session.scalars(select(models.TeacherUnavailableSlot).where(
            models.TeacherUnavailableSlot.teacher_id == teacher_id))
        return {"busy": [slot_key(r.weekday, r.session, r.period_number) for r in rows]}


@router.put("/busy/{teacher_id}")
def save_busy(teacher_id: str, payload: BusyUpdate) -> dict:
    with SessionLocal.begin() as session:
        if session.get(models.Teacher, teacher_id) is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy giáo viên.")

        valid = {slot_key(s.weekday, s.session, s.period_number)
                 for s in session.scalars(select(models.TimeSlot)) if s.slot_type == "Tiết học"}
        wanted = set(payload.busy)
        for key in wanted:
            if key not in valid:
                raise HTTPException(status_code=422, detail=f"Khung giờ bận không hợp lệ: {key}")

        old_rows = {slot_key(r.weekday, r.session, r.period_number): r
                    for r in session.scalars(select(models.TeacherUnavailableSlot).where(
                        models.TeacherUnavailableSlot.teacher_id == teacher_id))}
        for key, row in old_rows.items():          # bỏ những ô không còn đánh dấu
            if key not in wanted:
                session.delete(row)
        for key in wanted - old_rows.keys():       # thêm những ô mới đánh dấu
            weekday, session_name, period = key.split("|")
            session.add(models.TeacherUnavailableSlot(
                teacher_id=teacher_id, weekday=weekday, session=session_name,
                period_number=int(period), note="Đánh dấu trên giao diện"))
    return {"saved": True}