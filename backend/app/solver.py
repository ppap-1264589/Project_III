"""Bộ giải CP-SAT: xếp thời khóa biểu cho MỘT TUẦN MẪU.

Ý tưởng mô hình:
  - Với mỗi (lớp, môn): chọn đúng 1 giáo viên dạy được môn đó.
  - Giáo viên được chọn phải dạy đủ số tiết/tuần của (lớp, môn), vào các khung giáo viên rảnh.
  - Cùng một khung giờ: 1 lớp chỉ học 1 tiết, 1 giáo viên chỉ dạy 1 tiết.
Hàm này không đụng database, nên dễ test. Việc đọc DB nằm ở routes/timetable.py.
"""
from collections import defaultdict

from ortools.sat.python import cp_model

from .helpers import session_order, weekday_index


def _fail(status, message, problems=()):
    return {"status": status, "message": message, "problems": list(problems), "warnings": []}


def solve_timetable(
    *,
    demands,          # {(class_id, subject_id): số tiết/tuần}              (NhuCau)
    qualified,        # {(teacher_id, subject_id)}                           (GV_Mon)
    slots,            # [{"id", "weekday", "session", "period"}] chỉ "Tiết học" (KhungGio)
    busy,             # {(teacher_id, weekday, session, period)}             (GV_Ban)
    teacher_names, class_names, subject_names,   # {id: tên} để hiện thông báo cho dễ đọc
    min_periods=0,    # chỉ để cảnh báo, không phải ràng buộc
    time_limit=30.0,
    workers=8,
):
    demands = {k: v for k, v in demands.items() if v > 0}
    if not demands:
        return _fail("error", "Chưa có nhu cầu tiết học (NhuCau) để xếp lịch.")
    if not slots:
        return _fail("error", "Chưa có khung giờ loại 'Tiết học' (KhungGio).")

    # Bước 1: mỗi môn có những giáo viên nào dạy được?
    teachers_of = defaultdict(list)
    for teacher_id, subject_id in sorted(qualified):
        teachers_of[subject_id].append(teacher_id)

    # Bước 2: mỗi giáo viên rảnh ở những khung nào? (khung không nằm trong 'busy')
    free_slots = {
        teacher_id: [s for s in slots if (teacher_id, s["weekday"], s["session"], s["period"]) not in busy]
        for teacher_id in {t for t, _ in qualified}
    }

    # Bước 3: kiểm tra nhanh để báo lỗi dễ hiểu trước khi giải
    problems = []
    class_load = defaultdict(int)
    for (class_id, subject_id), periods in demands.items():
        class_load[class_id] += periods
        if not teachers_of[subject_id]:
            message = f"Môn {subject_names.get(subject_id, subject_id)} chưa có giáo viên nào được khai báo trong GV_Mon."
            if message not in problems:
                problems.append(message)
    for class_id, load in class_load.items():
        if load > len(slots):
            problems.append(f"Lớp {class_names.get(class_id, class_id)} cần {load} tiết/tuần "
                            f"nhưng chỉ có {len(slots)} khung học.")
    if problems:
        return _fail("infeasible", "Không thể xếp lịch vì dữ liệu chưa đủ.", problems)

    # Bước 4: dựng mô hình CP-SAT
    model = cp_model.CpModel()
    lessons = []                          # (biến, lớp, môn, giáo viên, khung)
    picks = []                            # để tránh biến mất tham chiếu (không bắt buộc)
    in_class_slot = defaultdict(list)     # (lớp, khung)       -> các biến cùng ô
    in_teacher_slot = defaultdict(list)   # (giáo viên, khung) -> các biến cùng ô

    for (class_id, subject_id), periods in sorted(demands.items()):
        options = []
        for teacher_id in teachers_of[subject_id]:
            pick = model.NewBoolVar(f"pick_{class_id}_{subject_id}_{teacher_id}")  # 1 nếu chọn giáo viên này
            options.append(pick)
            picks.append(pick)
            here = []
            for slot in free_slots[teacher_id]:
                x = model.NewBoolVar(f"x_{class_id}_{subject_id}_{teacher_id}_{slot['id']}")  # 1 nếu dạy ở khung này
                here.append(x)
                lessons.append((x, class_id, subject_id, teacher_id, slot))
                in_class_slot[(class_id, slot["id"])].append(x)
                in_teacher_slot[(teacher_id, slot["id"])].append(x)
            # chọn giáo viên này -> đủ `periods` tiết; không chọn -> 0 tiết
            model.Add(sum(here) == periods * pick)
        model.AddExactlyOne(options)  # mỗi (lớp, môn) đúng 1 giáo viên

    for group in [*in_class_slot.values(), *in_teacher_slot.values()]:
        model.AddAtMostOne(group)     # không trùng tiết

    # Bước 5: giải
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(time_limit)
    solver.parameters.num_workers = int(workers)
    status = solver.Solve(model)

    if status == cp_model.INFEASIBLE:
        return _fail("infeasible",
                     "Bộ giải chứng minh được không có lịch thỏa mọi ràng buộc.",
                     ["Thử bớt giờ bận của giáo viên, thêm giáo viên cho môn có tải sát giới hạn, hoặc giảm nhu cầu tiết."])
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return _fail("timeout", f"Chưa tìm được lịch trong {time_limit:g} giây (chưa kết luận là vô nghiệm). "
                                "Thử tăng thời gian hoặc giảm tải giáo viên.")

    # Bước 6: lấy kết quả
    def slot_order(slot):
        day = weekday_index(slot["weekday"])
        return (9 if day is None else day, session_order(slot["session"]), slot["period"])

    schedule = [
        {"class": class_names.get(c, c), "subject": subject_names.get(s, s), "teacher": teacher_names.get(t, t),
         "weekday": slot["weekday"], "session": slot["session"], "period": slot["period"], "_t": t}
        for x, c, s, t, slot in sorted(lessons, key=lambda item: (slot_order(item[4]), item[1]))
        if solver.Value(x)
    ]

    loads = defaultdict(int)
    for row in schedule:
        loads[row.pop("_t")] += 1
    # giáo viên không được chọn dạy lớp nào vẫn hiện với 0 tiết
    all_teachers = sorted({t for t, _ in qualified})
    teacher_loads = [{"teacher_id": t, "teacher": teacher_names.get(t, t), "periods": loads[t]} for t in all_teachers]

    warnings = [f"{r['teacher']} chỉ có {r['periods']} tiết/tuần, thấp hơn mức tối thiểu {min_periods}."
                for r in teacher_loads if r["periods"] < min_periods]
    return {
        "status": "optimal" if status == cp_model.OPTIMAL else "feasible",
        "message": f"Đã xếp {len(schedule)} tiết cho một tuần mẫu.",
        "schedule": schedule, "teacher_loads": teacher_loads, "problems": [], "warnings": warnings,
    }