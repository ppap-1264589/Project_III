"""API xếp thời khóa biểu: giải 1 tuần mẫu rồi nhân ra cả học kỳ."""
from typing import Literal

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert

from .. import models
from ..calendar_expand import expand_to_semester
from ..database import SessionLocal
from ..db_io import get_minimum
from ..helpers import session_order, weekday_index
from ..solver import solve_timetable
from ..timetable_export import WeeklyGrid, export_weekly_grid

router = APIRouter(prefix="/api")


class TeacherLoad(BaseModel):
    teacher_id: str
    teacher: str
    periods: int = Field(ge=0)
    gaps: int = Field(default=0, ge=0)


class SavedResult(BaseModel):
    status: Literal["optimal", "feasible"]
    message: str
    warnings: list[str]
    semester: dict
    weeks: list[dict] = Field(min_length=1)
    lessons: list[dict]
    teacher_loads: list[TeacherLoad]
    classes: dict[str, str]
    slots: list[dict] = Field(min_length=1)


@router.head("/timetable/saved")
def saved_timetable_status():
    with SessionLocal() as session:
        exists = session.scalar(select(models.SavedTimetable.id).where(models.SavedTimetable.id == 1))
    return Response(status_code=200 if exists else 404)


@router.get("/timetable/saved")
def load_saved_timetable() -> dict:
    with SessionLocal() as session:
        saved = session.get(models.SavedTimetable, 1)
        if saved is None:
            raise HTTPException(status_code=404, detail="Chưa có thời khóa biểu đã lưu.")
        return saved.result


@router.put("/timetable/saved")
def save_timetable(payload: SavedResult) -> dict:
    statement = insert(models.SavedTimetable).values(id=1, result=payload.model_dump())
    with SessionLocal.begin() as session:
        session.execute(statement.on_conflict_do_update(index_elements=["id"], set_={"result": statement.excluded.result}))
    return {"saved": True}


def load_solver_input(session) -> dict:
    """Đọc database và đổi thành dữ liệu thường để đưa cho solver."""
    return {
        "demands": {(r.class_id, r.subject_id): r.periods_per_week
                    for r in session.scalars(select(models.ClassSubjectDemand))},
        "qualified": {(r.teacher_id, r.subject_id) for r in session.scalars(select(models.TeacherSubject))},
        "slots": [{"id": s.id, "weekday": s.weekday, "session": s.session, "period": s.period_number}
                  for s in session.scalars(select(models.TimeSlot)) if s.slot_type == "Tiết học"],
        "busy": {(r.teacher_id, r.weekday, r.session, r.period_number)
                 for r in session.scalars(select(models.TeacherUnavailableSlot))},
        "class_busy": {(r.class_id, r.weekday, r.session, r.period_number)
                       for r in session.scalars(select(models.ClassUnavailableSlot))},
        "teacher_names": {t.id: t.display_name for t in session.scalars(select(models.Teacher))},
        "class_names": {c.id: c.name for c in session.scalars(select(models.SchoolClass))},
        "subject_names": {s.id: s.name for s in session.scalars(select(models.Subject))},
        "min_periods": get_minimum(session),
    }


@router.post("/solve")
def solve() -> dict:
    with SessionLocal() as session:
        semester = session.scalars(select(models.SemesterConfig)).first()
        if semester is None:
            raise HTTPException(status_code=422, detail="Chưa có cấu hình học kỳ (HocKy). Hãy nhập ở trang Excel hoặc /admin.")
        inputs = load_solver_input(session)
        result = solve_timetable(**inputs)
        holidays = {h.date: h.name for h in session.scalars(select(models.SchoolHoliday))}
        start_date, weeks, semester_name = semester.start_date, semester.duration_weeks, semester.name

    schedule = result.pop("schedule", None)
    if schedule is not None:
        result["weeks"], result["lessons"] = expand_to_semester(schedule, start_date, weeks, holidays)
        result["semester"] = {"name": semester_name, "start_date": start_date.isoformat(), "weeks": weeks}
        result["classes"] = inputs["class_names"]
        result["slots"] = [
            {**slot, "day": weekday_index(slot["weekday"]), "session_order": session_order(slot["session"])}
            for slot in inputs["slots"]
        ]
    return result


@router.post("/timetable/export")
def export_timetable(grid: WeeklyGrid):
    return export_weekly_grid(grid)
