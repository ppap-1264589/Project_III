"""Bộ giải CP-SAT xếp thời khóa biểu tuần (tách khỏi main.py).

- `solve_timetable(...)`: hàm thuần, chỉ nhận dữ liệu thường (dict/set), dễ test.
- `solve_week(session, week_start)`: đọc dữ liệu từ SQLite rồi gọi hàm trên.

Kết quả luôn có `status`:
    optimal / feasible  -> có khóa `schedule`
    infeasible          -> chứng minh được là vô nghiệm (hoặc phát hiện sớm bằng kiểm tra tải)
    timeout             -> hết thời gian mà chưa tìm được lịch (CHƯA kết luận là vô nghiệm)
    error               -> mô hình không hợp lệ / không có dữ liệu
Các trạng thái lỗi có `message` và danh sách `problems` nêu rõ nguyên nhân.
"""
from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from datetime import date, timedelta
from typing import TYPE_CHECKING, Any

from ortools.sat.python import cp_model

if TYPE_CHECKING:  # chỉ để gợi ý kiểu, tránh import vòng khi test hàm thuần
    from sqlalchemy.orm import Session

DEFAULT_TIME_LIMIT_SECONDS = 30.0
DEFAULT_WORKERS = 8

_DAY_NAMES = {
    "thu hai": 0, "thu ba": 1, "thu tu": 2, "thu nam": 3, "thu sau": 4, "thu bay": 5, "chu nhat": 6, "cn": 6,
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6,
    "mon": 0, "tue": 1, "wed": 2, "fri": 4, "sat": 5, "sun": 6,
}


def fold(text: Any) -> str:
    """Chữ thường, bỏ dấu tiếng Việt, gọn khoảng trắng."""
    value = str(text or "").strip().lower().replace("đ", "d")
    value = unicodedata.normalize("NFD", value)
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", value)


def weekday_index(label: Any) -> int | None:
    """'Thứ Hai' / 'Thu 2' / 'T2' / 'Monday' -> 0 ... 'Chủ nhật' -> 6; không nhận ra -> None."""
    text = fold(label)
    if text in _DAY_NAMES:
        return _DAY_NAMES[text]
    match = re.fullmatch(r"(?:thu|t)\s*([2-7])", text)
    return int(match.group(1)) - 2 if match else None


def session_order(label: Any) -> int:
    text = fold(label)
    return 0 if "sang" in text or "morning" in text else 1 if "chieu" in text or "afternoon" in text else 2


def _fail(status: str, message: str, problems: list[str], warnings: list[str], stats: dict | None = None) -> dict[str, Any]:
    return {"status": status, "message": message, "problems": problems, "warnings": warnings, "stats": stats or {}}


def solve_timetable(
    *,
    assignments: list[dict[str, Any]],      # {id, class_id, subject_id, teacher_id, periods}
    slots: list[dict[str, Any]],            # {id, weekday, session, period}  (chỉ "Tiết học")
    recurring_busy: set[tuple[str, str, str, int]],   # (teacher_id, weekday, session, period)
    dated_busy: set[tuple[str, date, str, int]],      # (teacher_id, date, session, period)
    holidays: set[date],
    week_start: date | None,
    teacher_names: dict[str, str],
    class_names: dict[str, str],
    subject_names: dict[str, str],
    qualified: set[tuple[str, str]] | None = None,    # (teacher_id, subject_id)
    time_limit: float = DEFAULT_TIME_LIMIT_SECONDS,
    workers: int = DEFAULT_WORKERS,
) -> dict[str, Any]:
    problems: list[str] = []
    warnings: list[str] = []

    if not assignments:
        return _fail("error", "Chưa có dữ liệu phân công (PhanCong) để xếp lịch.", [], warnings)
    if not slots:
        return _fail("error", "Chưa có khung giờ loại 'Tiết học' (KhungGio).", [], warnings)

    if week_start is not None:
        week_start -= timedelta(days=week_start.weekday())  # luôn về thứ Hai

    # 1) Ngày thực tế của từng khung, loại các khung rơi vào ngày nghỉ.
    slot_date: dict[str, date] = {}
    for slot in slots:
        index = weekday_index(slot["weekday"])
        if week_start is None:
            continue
        if index is None:
            warnings.append(f"Không nhận ra thứ '{slot['weekday']}' trong KhungGio nên bỏ qua ngày nghỉ/giờ bận theo ngày cho khung này.")
        else:
            slot_date[slot["id"]] = week_start + timedelta(days=index)
    open_slots = [s for s in slots if slot_date.get(s["id"]) not in holidays]
    closed_by_holiday = len(slots) - len(open_slots)
    if closed_by_holiday:
        warnings.append(f"Có {closed_by_holiday} khung học bị loại vì tuần đã chọn chứa ngày nghỉ.")
    slot_by_id = {s["id"]: s for s in open_slots}
    slot_rank = {s["id"]: i for i, s in enumerate(sorted(
        open_slots, key=lambda s: (weekday_index(s["weekday"]) if weekday_index(s["weekday"]) is not None else 9,
                                   session_order(s["session"]), s["period"])))}

    def teacher_free(teacher_id: str, slot: dict[str, Any]) -> bool:
        if (teacher_id, slot["weekday"], slot["session"], slot["period"]) in recurring_busy:
            return False
        day = slot_date.get(slot["id"])
        return not (day is not None and (teacher_id, day, slot["session"], slot["period"]) in dated_busy)

    free_slots = {tid: [s["id"] for s in open_slots if teacher_free(tid, s)] for tid in {a["teacher_id"] for a in assignments}}

    # 2) Kiểm tra tải trước khi giải: nhanh và chỉ ra đúng nguyên nhân.
    teacher_load: dict[str, int] = defaultdict(int)
    class_load: dict[str, int] = defaultdict(int)
    for a in assignments:
        teacher_load[a["teacher_id"]] += a["periods"]
        class_load[a["class_id"]] += a["periods"]
        if qualified is not None and (a["teacher_id"], a["subject_id"]) not in qualified:
            warnings.append(f"Giáo viên {teacher_names.get(a['teacher_id'], a['teacher_id'])} chưa khai báo chuyên môn "
                            f"{subject_names.get(a['subject_id'], a['subject_id'])} (lớp {class_names.get(a['class_id'], a['class_id'])}).")
    for teacher_id, load in sorted(teacher_load.items()):
        free = len(free_slots[teacher_id])
        if load > free:
            problems.append(f"Giáo viên {teacher_names.get(teacher_id, teacher_id)} được phân {load} tiết/tuần "
                            f"nhưng chỉ có {free} khung trống (tuần có {len(open_slots)} khung học mở, đã trừ giờ bận).")
    for class_id, load in sorted(class_load.items()):
        if load > len(open_slots):
            problems.append(f"Lớp {class_names.get(class_id, class_id)} cần {load} tiết/tuần "
                            f"nhưng tuần này chỉ có {len(open_slots)} khung học mở.")

    stats = {
        "open_slots": len(open_slots),
        "teacher_loads": dict(sorted(teacher_load.items())),
        "teacher_free_slots": {tid: len(v) for tid, v in sorted(free_slots.items())},
    }
    if problems:
        return _fail("infeasible", "Không thể xếp lịch vì dữ liệu đầu vào vượt quá số khung giờ khả dụng.", problems, warnings, stats)

    # 3) Mô hình CP-SAT.
    model = cp_model.CpModel()
    by_assignment: dict[str, list] = defaultdict(list)
    by_class_slot: dict[tuple[str, str], list] = defaultdict(list)
    by_teacher_slot: dict[tuple[str, str], list] = defaultdict(list)
    placements: list[tuple[Any, dict, dict]] = []
    for a in assignments:
        for slot_id in free_slots[a["teacher_id"]]:
            var = model.NewBoolVar(f"x_{a['id']}_{slot_id}")
            by_assignment[a["id"]].append(var)
            by_class_slot[(a["class_id"], slot_id)].append(var)
            by_teacher_slot[(a["teacher_id"], slot_id)].append(var)
            placements.append((var, a, slot_by_id[slot_id]))
    for a in assignments:
        model.Add(cp_model.LinearExpr.Sum(by_assignment[a["id"]]) == a["periods"])
    for group in (*by_class_slot.values(), *by_teacher_slot.values()):
        if len(group) > 1:
            model.AddAtMostOne(group)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(time_limit)
    solver.parameters.num_workers = int(workers)
    status = solver.Solve(model)

    if status == cp_model.INFEASIBLE:
        return _fail("infeasible",
                     "Bộ giải đã chứng minh không có lịch thỏa mọi ràng buộc (không giáo viên/lớp nào trùng tiết). "
                     "Thường do nhiều giáo viên cùng bận đúng các khung mà một lớp/môn cần, hoặc tải giáo viên quá sát số khung trống.",
                     ["Mỗi giáo viên và mỗi lớp từng mục đều đủ khung riêng lẻ, nhưng không thể ghép đồng thời."], warnings, stats)
    if status == cp_model.UNKNOWN:
        return _fail("timeout", f"Chưa tìm được lịch trong {time_limit:g} giây. Chưa thể kết luận là vô nghiệm; "
                                "thử tăng thời gian hoặc giảm tải giáo viên.", [], warnings, stats)
    if status == cp_model.MODEL_INVALID:
        return _fail("error", "Mô hình không hợp lệ: " + solver.ResponseStats(), [], warnings, stats)

    schedule = [
        {
            "class_id": a["class_id"], "class": class_names.get(a["class_id"], a["class_id"]),
            "subject_id": a["subject_id"], "subject": subject_names.get(a["subject_id"], a["subject_id"]),
            "teacher_id": a["teacher_id"], "teacher": teacher_names.get(a["teacher_id"], a["teacher_id"]),
            "weekday": s["weekday"], "session": s["session"], "period": s["period"], "slot_id": s["id"],
        }
        for var, a, s in placements if solver.Value(var)
    ]
    schedule.sort(key=lambda r: (slot_rank[r["slot_id"]], r["class"]))
    return {
        "status": "optimal" if status == cp_model.OPTIMAL else "feasible",
        "message": f"Đã xếp {len(schedule)} tiết.",
        "schedule": schedule, "problems": [], "warnings": warnings, "stats": stats,
    }


def solve_week(session: "Session", week_start: date | None, time_limit: float = DEFAULT_TIME_LIMIT_SECONDS) -> dict[str, Any]:
    """Đọc dữ liệu từ DB (PhanCong, KhungGio, GV_Ban, giờ bận theo ngày, ngày nghỉ) rồi giải."""
    from sqlalchemy import select
    from . import models

    slots = [
        {"id": s.id, "weekday": s.weekday, "session": s.session, "period": s.period_number}
        for s in session.scalars(select(models.TimeSlot)) if s.slot_type == "Tiết học"
    ]
    assignments = [
        {"id": a.id, "class_id": a.class_id, "subject_id": a.subject_id, "teacher_id": a.teacher_id, "periods": a.periods_per_week}
        for a in session.scalars(select(models.TeachingAssignment).order_by(models.TeachingAssignment.id))
    ]
    recurring = {(r.teacher_id, r.weekday, r.session, r.period_number) for r in session.scalars(select(models.TeacherUnavailableSlot))}
    dated: set[tuple[str, date, str, int]] = set()
    if week_start is not None:
        monday = week_start - timedelta(days=week_start.weekday())
        dated = {
            (r.teacher_id, r.date, r.session, r.period_number)
            for r in session.scalars(select(models.TeacherDateUnavailableSlot).where(
                models.TeacherDateUnavailableSlot.date >= monday,
                models.TeacherDateUnavailableSlot.date <= monday + timedelta(days=6)))
        }
    return solve_timetable(
        assignments=assignments, slots=slots, recurring_busy=recurring, dated_busy=dated,
        holidays={h.date for h in session.scalars(select(models.SchoolHoliday))}, week_start=week_start,
        teacher_names={t.id: t.display_name for t in session.scalars(select(models.Teacher))},
        class_names={c.id: c.name for c in session.scalars(select(models.SchoolClass))},
        subject_names={s.id: s.name for s in session.scalars(select(models.Subject))},
        qualified={(r.teacher_id, r.subject_id) for r in session.scalars(select(models.TeacherSubject))},
        time_limit=time_limit,
    )