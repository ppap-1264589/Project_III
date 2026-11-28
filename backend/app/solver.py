"""Bộ giải CP-SAT: xếp thời khóa biểu cho MỘT TUẦN MẪU.

File này không đọc database, nên có thể gọi và kiểm thử độc lập.
Việc đọc dữ liệu nằm ở routes/timetable.py.

Ký hiệu
-------
  c: lớp    m: môn    g: giáo viên    k: khung giờ "Tiết học"
  nhu_cau[c, m]: số tiết/tuần lớp c phải học môn m (bảng NhuCau)

Biến quyết định (đều là 0/1)
----------------------------
  assign[c, m, g]   = 1 nếu giáo viên g được giao dạy môn m cho lớp c
  teach[c, m, g, k] = 1 nếu lớp c học môn m với giáo viên g ở khung k

  Biến teach chỉ được tạo khi g dạy được m, g rảnh ở k và lớp c không bị chặn ở k.
  Nhờ vậy giờ bận của giáo viên và lớp được thỏa mãn mà không cần thêm ràng buộc.

Ràng buộc
---------
  (1) Mỗi (lớp, môn) có đúng một giáo viên:   Σ_g assign[c, m, g] = 1
  (2) Giáo viên được giao dạy đủ số tiết, giáo viên không được giao dạy 0 tiết:
                                               Σ_k teach[c, m, g, k] = nhu_cau[c, m] · assign[c, m, g]
  (3) Một lớp học tối đa một tiết mỗi khung:   Σ_{m, g} teach[c, m, g, k] ≤ 1
  (4) Một giáo viên dạy tối đa một tiết mỗi khung: Σ_{c, m} teach[c, m, g, k] ≤ 1
  (5) Mỗi giáo viên dạy ít nhất min_periods tiết:  Σ_{c, m} nhu_cau[c, m] · assign[c, m, g] ≥ min_periods

Hàm mục tiêu: giảm tổng số tiết trống của giáo viên
---------------------------------------------------
  Trong một buổi (cùng thứ, cùng buổi), khung k là "tiết trống" của giáo viên g nếu
  g rảnh ở k, không dạy ở k, nhưng có dạy ở một khung j trước k và một khung l sau k.
  Ví dụ: dạy tiết 1 và tiết 4, rảnh tiết 2, 3 -> 2 tiết trống.
  Khung giáo viên bận (GV_Ban) không tính là tiết trống.

  Đặt busy[g, k] = Σ_{c, m} teach[c, m, g, k] (bằng 0 hoặc 1 nhờ ràng buộc (4)).
  Với mỗi khung k và mỗi cặp j < k < l trong cùng buổi, thêm biến 0/1 gap[g, k] với:
  (6)  gap[g, k] ≥ busy[g, j] + busy[g, l] − busy[g, k] − 1
  Vế phải bằng 1 chỉ khi g dạy ở j và l nhưng không dạy ở k, ngược lại ≤ 0.

  Minimize Σ gap[g, k]

  Khi tổng nhỏ nhất, gap[g, k] = 1 đúng khi k là tiết trống.
  Hàm mục tiêu không ảnh hưởng ràng buộc (1)-(5). Khung giờ vẫn được phép để trống.
"""
from collections import defaultdict
from dataclasses import dataclass

from ortools.sat.python import cp_model

from .helpers import session_order, weekday_index


# ---------------------------------------------------------------------------
# Cấu trúc dữ liệu
# ---------------------------------------------------------------------------

@dataclass
class PreparedData:
    """Dữ liệu đầu vào đã được sắp xếp lại để tra cứu nhanh khi dựng mô hình."""
    demands: dict               # {(class_id, subject_id): số tiết/tuần}, chỉ giữ số tiết > 0
    slots: list                 # [{"id", "weekday", "session", "period"}]
    teachers_of_subject: dict   # {subject_id: [teacher_id, ...]}
    free_slots_of_teacher: dict  # {teacher_id: [slot, ...]}, khung giáo viên không bận
    blocked_slots_of_class: dict  # {class_id: {slot_id, ...}}, khung lớp không học được
    all_teachers: list          # mọi giáo viên, kể cả người chưa khai báo môn


@dataclass
class Lesson:
    """Một biến teach[c, m, g, k] cùng thông tin để đọc kết quả."""
    var: cp_model.IntVar
    class_id: str
    subject_id: str
    teacher_id: str
    slot: dict


def _fail(status, message, problems=()):
    return {"status": status, "message": message, "problems": list(problems), "warnings": []}


def _time_key(teacher_or_class_id, slot):
    """Khóa (đối tượng, thứ, buổi, tiết) dùng trong GV_Ban và Lop_Ban."""
    return (teacher_or_class_id, slot["weekday"], slot["session"], slot["period"])


# ---------------------------------------------------------------------------
# Bước 1: chuẩn bị dữ liệu
# ---------------------------------------------------------------------------

def _prepare_data(demands, qualified, slots, busy, class_busy, teacher_names):
    teachers_of_subject = defaultdict(list)
    for teacher_id, subject_id in sorted(qualified):
        teachers_of_subject[subject_id].append(teacher_id)

    qualified_teachers = {teacher_id for teacher_id, _ in qualified}
    free_slots_of_teacher = {
        teacher_id: [slot for slot in slots if _time_key(teacher_id, slot) not in busy]
        for teacher_id in qualified_teachers
    }

    class_busy = set(class_busy)
    classes_with_demand = {class_id for class_id, _ in demands}
    blocked_slots_of_class = {
        class_id: {slot["id"] for slot in slots if _time_key(class_id, slot) in class_busy}
        for class_id in classes_with_demand
    }

    return PreparedData(
        demands=demands,
        slots=slots,
        teachers_of_subject=teachers_of_subject,
        free_slots_of_teacher=free_slots_of_teacher,
        blocked_slots_of_class=blocked_slots_of_class,
        all_teachers=sorted(teacher_names.keys() | qualified_teachers),
    )


# ---------------------------------------------------------------------------
# Bước 2: kiểm tra nhanh để báo lỗi dễ hiểu trước khi giải
# ---------------------------------------------------------------------------

def _find_data_problems(data, min_periods, teacher_names, class_names, subject_names):
    """Trả về danh sách lỗi dữ liệu chắc chắn làm bài toán vô nghiệm."""
    problems = []

    # Tổng số tiết phải đủ để mọi giáo viên đạt mức tối thiểu
    total_periods = sum(data.demands.values())
    minimum_total = len(data.all_teachers) * min_periods
    if total_periods < minimum_total:
        problems.append(
            f"Tổng nhu cầu là {total_periods} tiết/tuần. "
            f"Để {len(data.all_teachers)} giáo viên đều dạy ít nhất {min_periods} tiết/tuần, "
            f"cần ít nhất {minimum_total} tiết/tuần."
        )

    # Mỗi giáo viên phải có đủ khung rảnh để đạt mức tối thiểu
    if min_periods > 0:
        for teacher_id in data.all_teachers:
            name = teacher_names.get(teacher_id, teacher_id)
            if teacher_id not in data.free_slots_of_teacher:
                problems.append(f"Giáo viên {name} chưa được khai báo môn có thể dạy, "
                                f"nên không thể đạt {min_periods} tiết/tuần.")
                continue
            available = len(data.free_slots_of_teacher[teacher_id])
            if available < min_periods:
                problems.append(f"Giáo viên {name} chỉ có {available} khung giờ dạy còn trống, "
                                f"nên không thể đạt {min_periods} tiết/tuần.")

    # Môn nào có nhu cầu cũng phải có ít nhất một giáo viên
    for _, subject_id in data.demands:
        if not data.teachers_of_subject[subject_id]:
            message = f"Môn {subject_names.get(subject_id, subject_id)} chưa có giáo viên nào được khai báo trong GV_Mon."
            if message not in problems:
                problems.append(message)

    # Mỗi lớp phải có đủ khung không bị chặn để học hết số tiết
    class_load = defaultdict(int)
    for (class_id, _), periods in data.demands.items():
        class_load[class_id] += periods
    for class_id, load in class_load.items():
        available = len(data.slots) - len(data.blocked_slots_of_class[class_id])
        if load > available:
            problems.append(f"Lớp {class_names.get(class_id, class_id)} cần {load} tiết/tuần "
                            f"nhưng chỉ còn {available} khung có thể học.")

    return problems


# ---------------------------------------------------------------------------
# Bước 3: dựng mô hình CP-SAT
# ---------------------------------------------------------------------------

def _slots_by_session(slots):
    """Nhóm khung giờ theo (thứ, buổi), mỗi nhóm sắp theo số tiết."""
    groups = defaultdict(list)
    for slot in slots:
        groups[(slot["weekday"], slot["session"])].append(slot)
    return [sorted(group, key=lambda slot: slot["period"]) for group in groups.values()]


def _build_model(data, min_periods):
    """Tạo biến, ràng buộc (1)-(6) và hàm mục tiêu ở đầu file. Trả về (model, danh sách Lesson)."""
    model = cp_model.CpModel()
    lessons = []
    lessons_of_class_slot = defaultdict(list)    # (lớp, khung)       -> các biến teach
    lessons_of_teacher_slot = defaultdict(list)  # (giáo viên, khung) -> các biến teach
    periods_of_teacher = defaultdict(list)       # giáo viên -> các biểu thức nhu_cau · assign

    for (class_id, subject_id), periods in sorted(data.demands.items()):
        blocked = data.blocked_slots_of_class[class_id]
        assign_vars = []

        for teacher_id in data.teachers_of_subject[subject_id]:
            assign = model.NewBoolVar(f"assign_{class_id}_{subject_id}_{teacher_id}")
            assign_vars.append(assign)
            periods_of_teacher[teacher_id].append(periods * assign)

            teach_vars = []
            for slot in data.free_slots_of_teacher[teacher_id]:
                if slot["id"] in blocked:
                    continue
                teach = model.NewBoolVar(f"teach_{class_id}_{subject_id}_{teacher_id}_{slot['id']}")
                teach_vars.append(teach)
                lessons.append(Lesson(teach, class_id, subject_id, teacher_id, slot))
                lessons_of_class_slot[(class_id, slot["id"])].append(teach)
                lessons_of_teacher_slot[(teacher_id, slot["id"])].append(teach)

            model.Add(sum(teach_vars) == periods * assign)  # (2)

        model.AddExactlyOne(assign_vars)  # (1)

    for same_class_slot in lessons_of_class_slot.values():
        model.AddAtMostOne(same_class_slot)  # (3)
    for same_teacher_slot in lessons_of_teacher_slot.values():
        model.AddAtMostOne(same_teacher_slot)  # (4)

    if min_periods > 0:
        for teacher_id in data.all_teachers:
            model.Add(sum(periods_of_teacher[teacher_id]) >= min_periods)  # (5)

    _minimize_teacher_gaps(model, data, lessons_of_teacher_slot)
    return model, lessons


def _minimize_teacher_gaps(model, data, lessons_of_teacher_slot):
    """Thêm biến gap, ràng buộc (6) và hàm mục tiêu Minimize Σ gap."""
    gap_vars = []
    for teacher_id in sorted(data.free_slots_of_teacher):
        free_ids = {slot["id"] for slot in data.free_slots_of_teacher[teacher_id]}

        for session in _slots_by_session(data.slots):
            # busy[i] = Σ teach của giáo viên ở khung thứ i trong buổi (0 nếu không thể dạy ở đó)
            teach_lists = [lessons_of_teacher_slot.get((teacher_id, slot["id"]), []) for slot in session]
            busy = [sum(teach_vars) for teach_vars in teach_lists]

            for k, slot in enumerate(session):
                if slot["id"] not in free_ids:
                    continue
                # chỉ xét các cặp (j, l) mà giáo viên có thể dạy ở cả hai khung
                pairs = [(j, l) for j in range(k) for l in range(k + 1, len(session))
                         if teach_lists[j] and teach_lists[l]]
                if not pairs:
                    continue
                gap = model.NewBoolVar(f"gap_{teacher_id}_{slot['id']}")
                for j, l in pairs:
                    model.Add(gap >= busy[j] + busy[l] - busy[k] - 1)  # (6)
                gap_vars.append(gap)

    model.Minimize(sum(gap_vars))


# ---------------------------------------------------------------------------
# Bước 4: đọc kết quả
# ---------------------------------------------------------------------------

def _slot_sort_key(slot):
    """Sắp theo thứ, buổi (sáng trước chiều), rồi số tiết."""
    day = weekday_index(slot["weekday"])
    return (9 if day is None else day, session_order(slot["session"]), slot["period"])


def _read_schedule(solver, lessons, teacher_names, class_names, subject_names):
    chosen = [lesson for lesson in lessons if solver.Value(lesson.var)]
    chosen.sort(key=lambda lesson: (_slot_sort_key(lesson.slot), lesson.class_id))
    return [
        {
            "class": class_names.get(lesson.class_id, lesson.class_id),
            "subject": subject_names.get(lesson.subject_id, lesson.subject_id),
            "teacher": teacher_names.get(lesson.teacher_id, lesson.teacher_id),
            "weekday": lesson.slot["weekday"],
            "session": lesson.slot["session"],
            "period": lesson.slot["period"],
            "class_id": lesson.class_id,
            "teacher_id": lesson.teacher_id,
            "slot_id": lesson.slot["id"],
        }
        for lesson in chosen
    ]


def _count_teacher_gaps(schedule, data):
    """Đếm tiết trống của từng giáo viên trong lịch đã xếp, theo định nghĩa ở đầu file."""
    taught_periods = defaultdict(set)  # (giáo viên, thứ, buổi) -> các số tiết có dạy
    for row in schedule:
        taught_periods[(row["teacher_id"], row["weekday"], row["session"])].add(row["period"])

    gaps = defaultdict(int)
    for session in _slots_by_session(data.slots):
        weekday, session_name = session[0]["weekday"], session[0]["session"]
        for teacher_id, free_slots in data.free_slots_of_teacher.items():
            taught = taught_periods.get((teacher_id, weekday, session_name))
            if not taught:
                continue
            free_ids = {slot["id"] for slot in free_slots}
            gaps[teacher_id] += sum(
                1 for slot in session
                if min(taught) < slot["period"] < max(taught)
                and slot["period"] not in taught and slot["id"] in free_ids
            )
    return gaps


def _count_teacher_loads(schedule, data, teacher_names):
    """Số tiết và số tiết trống của từng giáo viên. Giáo viên không được giao lớp nào vẫn hiện với 0 tiết."""
    loads = defaultdict(int)
    for row in schedule:
        loads[row["teacher_id"]] += 1
    gaps = _count_teacher_gaps(schedule, data)
    return [
        {"teacher_id": teacher_id, "teacher": teacher_names.get(teacher_id, teacher_id),
         "periods": loads[teacher_id], "gaps": gaps[teacher_id]}
        for teacher_id in data.all_teachers
    ]


# ---------------------------------------------------------------------------
# Hàm chính
# ---------------------------------------------------------------------------

def solve_timetable(
    *,
    demands,          # {(class_id, subject_id): số tiết/tuần}               (NhuCau)
    qualified,        # {(teacher_id, subject_id)}                            (GV_Mon)
    slots,            # [{"id", "weekday", "session", "period"}], chỉ "Tiết học" (KhungGio)
    busy,             # {(teacher_id, weekday, session, period)}              (GV_Ban)
    teacher_names, class_names, subject_names,   # {id: tên}, dùng trong thông báo và kết quả
    class_busy=(),    # {(class_id, weekday, session, period)}                (Lop_Ban)
    min_periods=0,    # số tiết tối thiểu mỗi giáo viên trong tuần mẫu
    time_limit=30.0,
    workers=8,
):
    demands = {key: periods for key, periods in demands.items() if periods > 0}
    if not demands:
        return _fail("error", "Chưa có nhu cầu tiết học (NhuCau) để xếp lịch.")
    if not slots:
        return _fail("error", "Chưa có khung giờ loại 'Tiết học' (KhungGio).")

    data = _prepare_data(demands, qualified, slots, busy, class_busy, teacher_names)

    problems = _find_data_problems(data, min_periods, teacher_names, class_names, subject_names)
    if problems:
        return _fail("infeasible", "Không thể xếp lịch vì dữ liệu chưa đủ.", problems)

    model, lessons = _build_model(data, min_periods)

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

    schedule = _read_schedule(solver, lessons, teacher_names, class_names, subject_names)
    teacher_loads = _count_teacher_loads(schedule, data, teacher_names)
    total_gaps = sum(row["gaps"] for row in teacher_loads)
    return {
        "status": "optimal" if status == cp_model.OPTIMAL else "feasible",
        "message": f"Đã xếp {len(schedule)} tiết cho một tuần mẫu, tổng {total_gaps} tiết trống của giáo viên.",
        "schedule": schedule,
        "teacher_loads": teacher_loads,
        "problems": [],
        "warnings": [],
    }
