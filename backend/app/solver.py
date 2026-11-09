"""Bộ giải CP-SAT xếp thời khóa biểu tuần (tách khỏi main.py).

Đầu vào của thuật toán:
    NhuCau  (lớp, môn -> số tiết/tuần)      GV_Mon  (giáo viên nào dạy được môn nào)
    KhungGio ("Tiết học")                    GV_Ban + giờ bận theo ngày + ngày nghỉ
Thuật toán TỰ CHỌN giáo viên cho từng (lớp, môn) và TỰ XẾP tiết. Bảng PhanCong chỉ là dữ liệu
tham khảo, solver không đọc nó.

- `solve_timetable(...)`: hàm thuần, chỉ nhận dữ liệu thường (dict/set), dễ test.
- `solve_week(session, week_start)`: đọc dữ liệu từ SQLite rồi gọi hàm trên.

Kết quả luôn có `status`:
    optimal / feasible  -> có `schedule` (từng tiết) và `assignments` (giáo viên được chọn cho từng lớp-môn)
    infeasible          -> chứng minh được là vô nghiệm (hoặc phát hiện sớm bằng kiểm tra năng lực)
    timeout             -> hết thời gian mà chưa tìm được lịch (CHƯA kết luận là vô nghiệm)
    error               -> không có dữ liệu
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
    demands: dict[tuple[str, str], int],    # (class_id, subject_id) -> số tiết/tuần   (NhuCau)
    qualified: set[tuple[str, str]],        # (teacher_id, subject_id)                  (GV_Mon)
    slots: list[dict[str, Any]],            # {id, weekday, session, period}  (chỉ "Tiết học")
    recurring_busy: set[tuple[str, str, str, int]],   # (teacher_id, weekday, session, period)
    dated_busy: set[tuple[str, date, str, int]],      # (teacher_id, date, session, period)
    holidays: set[date],
    week_start: date | None,
    teacher_names: dict[str, str],
    class_names: dict[str, str],
    subject_names: dict[str, str],
    min_periods: int = 0,                   # chỉ để cảnh báo, không phải ràng buộc cứng
    time_limit: float = DEFAULT_TIME_LIMIT_SECONDS,
    workers: int = DEFAULT_WORKERS,
) -> dict[str, Any]:
    problems: list[str] = []
    warnings: list[str] = []
    tname = lambda t: teacher_names.get(t, t)
    sname = lambda s: subject_names.get(s, s)
    cname = lambda c: class_names.get(c, c)

    demands = {k: v for k, v in demands.items() if v > 0}
    if not demands:
        return _fail("error", "Chưa có nhu cầu tiết học (NhuCau) để xếp lịch.", [], warnings)
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

    # 2) Giáo viên đủ chuyên môn cho từng môn và các khung trống của họ.
    teachers_for: dict[str, list[str]] = defaultdict(list)
    for teacher_id, subject_id in sorted(qualified):
        teachers_for[subject_id].append(teacher_id)
    all_teachers = sorted({t for t, _ in qualified})
    free_slots = {t: [s["id"] for s in open_slots if teacher_free(t, s)] for t in all_teachers}

    # 3) Kiểm tra năng lực trước khi giải: nhanh và chỉ ra đúng nguyên nhân.
    subject_demand: dict[str, int] = defaultdict(int)
    class_load: dict[str, int] = defaultdict(int)
    for (class_id, subject_id), periods in demands.items():
        subject_demand[subject_id] += periods
        class_load[class_id] += periods
    for subject_id in sorted(subject_demand):
        if not teachers_for[subject_id]:
            problems.append(f"Môn {sname(subject_id)} cần {subject_demand[subject_id]} tiết/tuần nhưng chưa có giáo viên nào "
                            f"được khai báo dạy môn này trong GV_Mon.")
    for class_id, load in sorted(class_load.items()):
        if load > len(open_slots):
            problems.append(f"Lớp {cname(class_id)} cần {load} tiết/tuần nhưng tuần này chỉ có {len(open_slots)} khung học mở.")

    # Nhóm các môn dùng chung giáo viên (ví dụ một giáo viên dạy cả Thể chất và Nghệ thuật);
    # tổng nhu cầu của nhóm không được vượt tổng khung trống của các giáo viên trong nhóm.
    parent = {s: s for s in subject_demand}
    def find(a: str) -> str:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for teacher_id in all_teachers:
        mine = [s for s in subject_demand if (teacher_id, s) in qualified]
        for other in mine[1:]:
            parent[find(other)] = find(mine[0])
    groups: dict[str, list[str]] = defaultdict(list)
    for subject_id in subject_demand:
        groups[find(subject_id)].append(subject_id)
    for members in groups.values():
        members.sort()
        group_teachers = sorted({t for t in all_teachers if any((t, s) in qualified for s in members)})
        need = sum(subject_demand[s] for s in members)
        have = sum(len(free_slots[t]) for t in group_teachers)
        if group_teachers and need > have:
            problems.append(
                f"Môn {', '.join(sname(s) for s in members)} cần tổng {need} tiết/tuần, nhưng "
                f"{len(group_teachers)} giáo viên đủ chuyên môn ({', '.join(tname(t) for t in group_teachers)}) "
                f"chỉ có tổng {have} khung trống (đã trừ giờ bận). Cần thêm giáo viên cho môn này hoặc giảm nhu cầu tiết.")

    stats: dict[str, Any] = {
        "open_slots": len(open_slots),
        "subject_demand": dict(sorted(subject_demand.items())),
        "teacher_free_slots": {t: len(v) for t, v in sorted(free_slots.items())},
    }
    if problems:
        return _fail("infeasible", "Không thể xếp lịch vì nhu cầu vượt quá năng lực giáo viên/khung giờ hiện có.", problems, warnings, stats)

    # 4) Mô hình CP-SAT: mỗi (lớp, môn) chọn đúng một giáo viên, rồi chọn các tiết.
    model = cp_model.CpModel()
    by_class_slot: dict[tuple[str, str], list] = defaultdict(list)
    by_teacher_slot: dict[tuple[str, str], list] = defaultdict(list)
    placements: list[tuple[Any, str, str, str, dict]] = []
    choice: dict[tuple[str, str, str], Any] = {}
    for (class_id, subject_id), periods in sorted(demands.items()):
        options = []
        for teacher_id in teachers_for[subject_id]:
            pick = model.NewBoolVar(f"y_{class_id}_{subject_id}_{teacher_id}")
            choice[(class_id, subject_id, teacher_id)] = pick
            options.append(pick)
            lessons = []
            for slot_id in free_slots[teacher_id]:
                var = model.NewBoolVar(f"x_{class_id}_{subject_id}_{teacher_id}_{slot_id}")
                lessons.append(var)
                by_class_slot[(class_id, slot_id)].append(var)
                by_teacher_slot[(teacher_id, slot_id)].append(var)
                placements.append((var, class_id, subject_id, teacher_id, slot_by_id[slot_id]))
            # Nếu chọn giáo viên này thì đủ `periods` tiết, nếu không thì 0 tiết.
            model.Add(cp_model.LinearExpr.Sum(lessons) == periods * pick)
        model.AddExactlyOne(options)
    for group in (*by_class_slot.values(), *by_teacher_slot.values()):
        if len(group) > 1:
            model.AddAtMostOne(group)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(time_limit)
    solver.parameters.num_workers = int(workers)
    status = solver.Solve(model)

    if status == cp_model.INFEASIBLE:
        return _fail("infeasible",
                     "Bộ giải đã chứng minh không có lịch thỏa mọi ràng buộc (không giáo viên/lớp nào trùng tiết, "
                     "mỗi lớp-môn có đúng một giáo viên đủ chuyên môn). Từng môn đều đủ năng lực riêng lẻ nhưng không thể ghép đồng thời; "
                     "thường do giờ bận của giáo viên hoặc ngày nghỉ làm khung giờ quá chật.",
                     ["Hãy thử tuần khác, bớt giờ bận, hoặc thêm giáo viên cho môn có tải sát giới hạn."], warnings, stats)
    if status == cp_model.UNKNOWN:
        return _fail("timeout", f"Chưa tìm được lịch trong {time_limit:g} giây. Chưa thể kết luận là vô nghiệm; "
                                "thử tăng thời gian hoặc giảm tải giáo viên.", [], warnings, stats)
    if status == cp_model.MODEL_INVALID:
        return _fail("error", "Mô hình không hợp lệ: " + solver.ResponseStats(), [], warnings, stats)

    schedule = [
        {
            "class_id": c, "class": cname(c), "subject_id": s, "subject": sname(s),
            "teacher_id": t, "teacher": tname(t),
            "weekday": slot["weekday"], "session": slot["session"], "period": slot["period"], "slot_id": slot["id"],
        }
        for var, c, s, t, slot in placements if solver.Value(var)
    ]
    schedule.sort(key=lambda r: (slot_rank[r["slot_id"]], r["class"]))
    assignments = [
        {"class_id": c, "class": cname(c), "subject_id": s, "subject": sname(s),
         "teacher_id": t, "teacher": tname(t), "periods": demands[(c, s)]}
        for (c, s, t), pick in sorted(choice.items()) if solver.Value(pick)
    ]
    loads: dict[str, int] = {t: 0 for t in all_teachers}
    for row in schedule:
        loads[row["teacher_id"]] += 1
    stats["teacher_loads"] = dict(sorted(loads.items()))
    for teacher_id, load in sorted(loads.items()):
        if load < min_periods:
            warnings.append(f"{tname(teacher_id)} chỉ có {load} tiết/tuần, thấp hơn mức tối thiểu {min_periods}.")
    return {
        "status": "optimal" if status == cp_model.OPTIMAL else "feasible",
        "message": f"Đã xếp {len(schedule)} tiết.",
        "schedule": schedule, "assignments": assignments, "problems": [], "warnings": warnings, "stats": stats,
    }


def solve_week(session: "Session", week_start: date | None, time_limit: float = DEFAULT_TIME_LIMIT_SECONDS) -> dict[str, Any]:
    """Đọc dữ liệu từ DB (NhuCau, GV_Mon, KhungGio, GV_Ban, giờ bận theo ngày, ngày nghỉ) rồi giải."""
    from sqlalchemy import select
    from . import models

    slots = [
        {"id": s.id, "weekday": s.weekday, "session": s.session, "period": s.period_number}
        for s in session.scalars(select(models.TimeSlot)) if s.slot_type == "Tiết học"
    ]
    demands = {(r.class_id, r.subject_id): r.periods_per_week for r in session.scalars(select(models.ClassSubjectDemand))}
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
    minimum = session.get(models.AppSetting, "minimum_periods_per_teacher")
    try:
        min_periods = int(minimum.value) if minimum else 0
    except ValueError:
        min_periods = 0
    return solve_timetable(
        demands=demands, qualified={(r.teacher_id, r.subject_id) for r in session.scalars(select(models.TeacherSubject))},
        slots=slots, recurring_busy=recurring, dated_busy=dated,
        holidays={h.date for h in session.scalars(select(models.SchoolHoliday))}, week_start=week_start,
        teacher_names={t.id: t.display_name for t in session.scalars(select(models.Teacher))},
        class_names={c.id: c.name for c in session.scalars(select(models.SchoolClass))},
        subject_names={s.id: s.name for s in session.scalars(select(models.Subject))},
        min_periods=min_periods, time_limit=time_limit,
    )