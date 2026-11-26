"""API xếp thời khóa biểu: giải 1 tuần mẫu rồi nhân ra cả học kỳ."""
from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from .. import models
from ..calendar_expand import expand_to_semester
from ..database import SessionLocal
from ..db_io import get_minimum
from ..solver import solve_timetable

router = APIRouter(prefix="/api")


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
        result = solve_timetable(**load_solver_input(session))
        holidays = {h.date: h.name for h in session.scalars(select(models.SchoolHoliday))}
        start_date, weeks, semester_name = semester.start_date, semester.duration_weeks, semester.name

    schedule = result.pop("schedule", None)
    if schedule is not None:
        result["weeks"], result["lessons"] = expand_to_semester(schedule, start_date, weeks, holidays)
        result["semester"] = {"name": semester_name, "start_date": start_date.isoformat(), "weeks": weeks}
    return result