"""Các quy tắc kiểm tra dữ liệu sau khi đã đọc các bảng từ Excel."""
from __future__ import annotations

from dataclasses import dataclass
import datetime as dt
from typing import Any

from .input_schema import HEADER_ROW


@dataclass
class Issue:
    severity: str
    code: str
    message: str
    sheet: str | None = None
    row: int | None = None
    column: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "severity": self.severity,
            "code": self.code,
            "message": self.message,
            "sheet": self.sheet,
            "row": self.row,
            "column": self.column,
        }


def is_empty(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def cell_text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _integer(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        try:
            return int(value.strip())
        except ValueError:
            return None
    return None


def make_issue(code: str, message: str, sheet: str, row: int | None = None,
           column: str | None = None, severity: str = "error") -> Issue:
    return Issue(severity, code, message, sheet, row, column)


def _json_value(value: Any) -> Any:
    if isinstance(value, dt.datetime):
        return value.isoformat(timespec="minutes")
    if isinstance(value, dt.date):
        return value.isoformat()
    if isinstance(value, dt.time):
        return value.strftime("%H:%M")
    if isinstance(value, dt.timedelta):
        total_minutes = int(value.total_seconds() // 60)
        return f"{total_minutes // 60:02d}:{total_minutes % 60:02d}"
    return value


def _validate_required_fields_and_keys(parsed, issues):
    primary_keys = {
        "Lop": ("lop_id",), "Mon": ("mon_id",), "GiaoVien": ("giao_vien_id",),
        "PhanCong": ("phan_cong_id",), "KhungGio": ("khung_gio_id",),
        "GV_Mon": ("giao_vien_id", "mon_id"),
        "NhuCau": ("lop_id", "mon_id"),
        "GV_Ban": ("giao_vien_id", "thu", "buoi", "tiet_so"),
        "HocKy": ("hoc_ky_id",), "NgayNghi": ("ngay_nghi_id",),
    }
    for sheet_name, rows in parsed.items():
        for row_index, row in enumerate(rows, start=HEADER_ROW + 1):
            for col, value in row.items():
                if is_empty(value) and col != "ghi_chu":
                    issues.append(make_issue("REQUIRED_VALUE_MISSING", f"Thiếu giá trị ở cột {col}.", sheet_name, row_index, col))
        keys = primary_keys[sheet_name]
        seen: set[tuple[str, ...]] = set()
        for row_index, row in enumerate(rows, start=HEADER_ROW + 1):
            key = tuple(cell_text(row.get(col)) for col in keys)
            if any(not part for part in key):
                continue
            if key in seen:
                issues.append(make_issue("DUPLICATE_PRIMARY_KEY", f"Khóa {' + '.join(keys)} bị trùng: {' / '.join(key)}.", sheet_name, row_index))
            seen.add(key)

def _validate_demands_and_assignments(parsed, issues):
    def ids(table: str, field: str) -> set[str]:
        return {cell_text(row.get(field)) for row in parsed[table] if not is_empty(row.get(field))}

    class_ids = ids("Lop", "lop_id")
    subject_ids = ids("Mon", "mon_id")
    teacher_ids = ids("GiaoVien", "giao_vien_id")
    teacher_subjects = {(cell_text(r["giao_vien_id"]), cell_text(r["mon_id"])) for r in parsed["GV_Mon"]}
    demand_totals: dict[tuple[str, str], int] = {}
    for row_index, row in enumerate(parsed["NhuCau"], start=HEADER_ROW + 1):
        class_id, subject_id = cell_text(row["lop_id"]), cell_text(row["mon_id"])
        if class_id not in class_ids:
            issues.append(make_issue("UNKNOWN_CLASS", f"Không tìm thấy lớp {class_id}.", "NhuCau", row_index, "lop_id"))
        if subject_id not in subject_ids:
            issues.append(make_issue("UNKNOWN_SUBJECT", f"Không tìm thấy môn {subject_id}.", "NhuCau", row_index, "mon_id"))
        count = _integer(row["so_tiet_tuan"])
        if count is None or count <= 0:
            issues.append(make_issue("INVALID_PERIOD_COUNT", "Số tiết phải là số nguyên dương.", "NhuCau", row_index, "so_tiet_tuan"))
        else:
            demand_totals[(class_id, subject_id)] = demand_totals.get((class_id, subject_id), 0) + count

    assigned_totals: dict[tuple[str, str], int] = {}
    teacher_load: dict[str, int] = {teacher_id: 0 for teacher_id in teacher_ids}
    for row_index, row in enumerate(parsed["PhanCong"], start=HEADER_ROW + 1):
        class_id, subject_id, teacher_id = map(cell_text, (row["lop_id"], row["mon_id"], row["giao_vien_id"]))
        if class_id not in class_ids:
            issues.append(make_issue("UNKNOWN_CLASS", f"Không tìm thấy lớp {class_id}.", "PhanCong", row_index, "lop_id"))
        if subject_id not in subject_ids:
            issues.append(make_issue("UNKNOWN_SUBJECT", f"Không tìm thấy môn {subject_id}.", "PhanCong", row_index, "mon_id"))
        if teacher_id not in teacher_ids:
            issues.append(make_issue("UNKNOWN_TEACHER", f"Không tìm thấy giáo viên {teacher_id}.", "PhanCong", row_index, "giao_vien_id"))
        elif (teacher_id, subject_id) not in teacher_subjects:
            issues.append(make_issue("TEACHER_NOT_QUALIFIED", f"{teacher_id} chưa được khai báo chuyên môn {subject_id} trong GV_Mon.", "PhanCong", row_index, "giao_vien_id"))
        count = _integer(row["so_tiet_tuan"])
        if count is None or count <= 0:
            issues.append(make_issue("INVALID_PERIOD_COUNT", "Số tiết phải là số nguyên dương.", "PhanCong", row_index, "so_tiet_tuan"))
        else:
            assigned_totals[(class_id, subject_id)] = assigned_totals.get((class_id, subject_id), 0) + count
            if teacher_id in teacher_load:
                teacher_load[teacher_id] += count

    comparison_keys = demand_totals.keys() | assigned_totals.keys() if parsed["PhanCong"] else ()
    for key in sorted(comparison_keys):
        needed, assigned = demand_totals.get(key, 0), assigned_totals.get(key, 0)
        if needed != assigned:
            issues.append(make_issue("REFERENCE_ASSIGNMENT_MISMATCH", f"Dữ liệu phân công tham khảo của lớp {key[0]}, môn {key[1]} là {assigned} tiết, trong khi nhu cầu là {needed}. Thuật toán sẽ dùng nhu cầu lớp-môn làm đầu vào.", "PhanCong", severity="warning"))

    return class_ids, subject_ids, teacher_ids, demand_totals, teacher_load


def _validate_time_slots(parsed, teacher_ids, issues):
    # Giáo viên chỉ đánh dấu bận ở khung dành cho tiết học.
    valid_slots: set[tuple[str, str, int]] = set()
    for row_index, row in enumerate(parsed["KhungGio"], start=HEADER_ROW + 1):
        day, session, period = cell_text(row["thu"]), cell_text(row["buoi"]), _integer(row["tiet_so"])
        kind = cell_text(row["loai_khung"])
        if kind not in {"Hoạt động", "Tiết học"} or period is None or (kind == "Hoạt động" and period < 0) or (kind == "Tiết học" and period <= 0):
            issues.append(make_issue("INVALID_SLOT_TYPE_OR_NUMBER", "Tiết học cần số tiết dương; hoạt động có thể dùng tiết_so = 0 hoặc số tiết của khung sinh hoạt.", "KhungGio", row_index, "tiet_so"))
        if kind == "Tiết học" and period is not None:
            valid_slots.add((day, session, period))

    for row_index, row in enumerate(parsed["GV_Ban"], start=HEADER_ROW + 1):
        teacher_id = cell_text(row["giao_vien_id"])
        key = (cell_text(row["thu"]), cell_text(row["buoi"]), _integer(row["tiet_so"]))
        if teacher_id not in teacher_ids:
            issues.append(make_issue("UNKNOWN_TEACHER", f"Không tìm thấy giáo viên {teacher_id}.", "GV_Ban", row_index, "giao_vien_id"))
        if key not in valid_slots:
            issues.append(make_issue("UNKNOWN_TIME_SLOT", "Khung bận không khớp một tiết học trong KhungGio.", "GV_Ban", row_index, "tiet_so"))

    by_day: dict[str, list[tuple[int, int, int]]] = {}
    for row_index, row in enumerate(parsed["KhungGio"], start=HEADER_ROW + 1):
        try:
            hour, minute = (int(part) for part in cell_text(row["gio_bat_dau"]).split(":")[:2])
            begin = hour * 60 + minute
            length = int(row["thoi_luong_phut"])
        except (ValueError, TypeError):
            issues.append(make_issue("INVALID_SLOT_TIME", "Giờ bắt đầu phải dạng HH:MM và thời lượng là số phút.", "KhungGio", row_index, "gio_bat_dau"))
            continue
        by_day.setdefault(cell_text(row["thu"]), []).append((begin, begin + length, row_index))
    for day, spans in by_day.items():
        spans.sort()
        for (_, end1, row1), (start2, _, row2) in zip(spans, spans[1:]):
            if start2 < end1:
                issues.append(make_issue("SLOT_OVERLAP", f"{day}: dòng {row1} và dòng {row2} bị chồng giờ.", "KhungGio", row2, "gio_bat_dau"))

def _validate_semester_and_holidays(parsed, issues):
    # Kiểm tra cấu hình học kỳ và định dạng ngày nghỉ.
    semester_rows = parsed["HocKy"]
    semester_start = None
    semester_end = None
    if len(semester_rows) != 1:
        issues.append(make_issue("SEMESTER_ROW_COUNT", "Cần đúng một dòng cấu hình học kỳ đang sử dụng.", "HocKy"))
    else:
        semester = semester_rows[0]
        raw_start = semester.get("ngay_bat_dau")
        try:
            semester_start = raw_start.date() if isinstance(raw_start, dt.datetime) else raw_start
            if isinstance(semester_start, str):
                semester_start = dt.date.fromisoformat(semester_start.strip())
        except (TypeError, ValueError):
            semester_start = None
        weeks = _integer(semester.get("so_tuan"))
        if semester_start is None or not isinstance(semester_start, dt.date):
            issues.append(make_issue("INVALID_SEMESTER_START_DATE", "Ngày bắt đầu học kỳ phải là một ngày hợp lệ.", "HocKy", HEADER_ROW + 1, "ngay_bat_dau"))
        if weeks is None or weeks <= 0 or weeks > 52:
            issues.append(make_issue("INVALID_SEMESTER_WEEKS", "Số tuần học kỳ phải là số nguyên từ 1 đến 52.", "HocKy", HEADER_ROW + 1, "so_tuan"))
        if isinstance(semester_start, dt.date) and weeks and weeks > 0:
            semester_end = semester_start + dt.timedelta(days=weeks * 7 - 1)

    for row_index, holiday in enumerate(parsed["NgayNghi"], start=HEADER_ROW + 1):
        raw_date = holiday.get("ngay")
        try:
            holiday_date = raw_date.date() if isinstance(raw_date, dt.datetime) else raw_date
            if isinstance(holiday_date, str):
                holiday_date = dt.date.fromisoformat(holiday_date.strip())
        except (TypeError, ValueError):
            holiday_date = None
        if not isinstance(holiday_date, dt.date):
            message = "Chưa nhập ngày nghỉ." if raw_date is None or raw_date == "" else "Ngày nghỉ không tồn tại hoặc sai định dạng."
            issues.append(make_issue("INVALID_HOLIDAY_DATE", message, "NgayNghi", row_index, "ngay"))

    return semester_start, semester_end


def validate_input(parsed, issues: list[Issue], min_periods: int) -> dict[str, Any]:
    _validate_required_fields_and_keys(parsed, issues)
    class_ids, subject_ids, teacher_ids, demand_totals, teacher_load = _validate_demands_and_assignments(parsed, issues)
    _validate_time_slots(parsed, teacher_ids, issues)

    warnings: list[Issue] = [item for item in issues if item.severity == "warning"]
    for teacher_id, load in sorted(teacher_load.items()):
        if parsed["PhanCong"] and load < min_periods:
            warnings.append(make_issue(
                "REFERENCE_TEACHER_LOAD_BELOW_MIN",
                f"Dữ liệu phân công tham khảo của {teacher_id} có {load} tiết; mức tối thiểu đang cấu hình là {min_periods}. Đây chưa phải tải từ kết quả thuật toán.",
                "PhanCong", severity="warning",
            ))

    semester_start, semester_end = _validate_semester_and_holidays(parsed, issues)

    errors = [item for item in issues if item.severity == "error"]
    return {
        "valid": not errors,
        "errors": [item.as_dict() for item in errors],
        "warnings": [item.as_dict() for item in warnings],
        "summary": {
            "classes": len(class_ids),
            "subjects": len(subject_ids),
            "teachers": len(teacher_ids),
            "weekly_demand_periods": sum(demand_totals.values()),
            "teacher_loads": teacher_load,
            "minimum_periods_per_teacher": min_periods,
            "semester_start": semester_start.isoformat() if isinstance(semester_start, dt.date) else None,
            "semester_end": semester_end.isoformat() if isinstance(semester_end, dt.date) else None,
            "holiday_count": len(parsed["NgayNghi"]),
        },
        "data": {
            table: [{key: _json_value(value) for key, value in row.items()} for row in rows]
            for table, rows in parsed.items()
        },
    }
