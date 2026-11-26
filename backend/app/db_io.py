"""Đọc / ghi toàn bộ các bảng dữ liệu đầu vào với database."""
import datetime as dt

from sqlalchemy import delete, inspect, select
from sqlalchemy.orm import Session

from . import models
from .input_schema import DEFAULT_MIN_TEACHING_PERIODS_PER_WEEK

MINIMUM_KEY = "minimum_periods_per_teacher"

# Tên sheet Excel -> (model, {tên cột Excel: tên thuộc tính của model})
# THỨ TỰ QUAN TRỌNG: bảng cha (Lop, Mon, GiaoVien) phải đứng trước bảng con.
TABLES = {
    "Lop": (models.SchoolClass, {"lop_id": "id", "ten_lop": "name", "khoi": "grade"}),
    "Mon": (models.Subject, {"mon_id": "id", "ten_mon": "name"}),
    "GiaoVien": (models.Teacher, {"giao_vien_id": "id", "ten_hien_thi": "display_name"}),
    "GV_Mon": (models.TeacherSubject, {"giao_vien_id": "teacher_id", "mon_id": "subject_id"}),
    "NhuCau": (models.ClassSubjectDemand, {
        "lop_id": "class_id", "mon_id": "subject_id", "so_tiet_tuan": "periods_per_week"}),
    "PhanCong": (models.TeachingAssignment, {
        "phan_cong_id": "id", "lop_id": "class_id", "mon_id": "subject_id",
        "giao_vien_id": "teacher_id", "so_tiet_tuan": "periods_per_week"}),
    "KhungGio": (models.TimeSlot, {
        "khung_gio_id": "id", "thu": "weekday", "buoi": "session", "tiet_so": "period_number",
        "gio_bat_dau": "start_time", "thoi_luong_phut": "duration_minutes",
        "nghi_sau_tiet_phut": "break_after_minutes", "loai_khung": "slot_type", "ghi_chu": "note"}),
    "GV_Ban": (models.TeacherUnavailableSlot, {
        "giao_vien_id": "teacher_id", "thu": "weekday", "buoi": "session",
        "tiet_so": "period_number", "ghi_chu": "note"}),
    "HocKy": (models.SemesterConfig, {
        "hoc_ky_id": "id", "ten_hoc_ky": "name", "ngay_bat_dau": "start_date", "so_tuan": "duration_weeks"}),
    "NgayNghi": (models.SchoolHoliday, {"ngay_nghi_id": "id", "ngay": "date", "ten_ngay_nghi": "name"}),
}


def _to_python(model, attr, value):
    """Ép giá trị từ Excel/JSON về đúng kiểu của cột (int, date, str)."""
    kind = getattr(model, attr).type.python_type
    if kind is int:
        return int(value)
    if kind is dt.date:
        return dt.date.fromisoformat(str(value)[:10])
    return "" if value is None else str(value)


def _to_json(value):
    return value.isoformat() if isinstance(value, dt.date) else value


def replace_all(session: Session, data: dict[str, list[dict]]) -> None:
    """Xóa hết dữ liệu đầu vào rồi ghi lại từ `data` (cùng 1 transaction). Cài đặt app được giữ nguyên."""
    for model, _ in reversed(TABLES.values()):
        session.execute(delete(model))
    for sheet, (model, columns) in TABLES.items():
        session.add_all(
            model(**{attr: _to_python(model, attr, row[col]) for col, attr in columns.items()})
            for row in data[sheet]
        )
        session.flush()  # ghi bảng cha trước khi ghi bảng con


def read_all(session: Session) -> dict[str, list[dict]]:
    """Đọc mọi bảng thành {tên sheet: [dòng]} với tên cột như trong Excel."""
    result = {}
    for sheet, (model, columns) in TABLES.items():
        rows = session.scalars(select(model).order_by(*inspect(model).primary_key)).all()
        result[sheet] = [{col: _to_json(getattr(r, attr)) for col, attr in columns.items()} for r in rows]
    return result


def get_minimum(session: Session) -> int:
    """Mức tiết tối thiểu mỗi giáo viên (chỉ dùng để cảnh báo)."""
    item = session.get(models.AppSetting, MINIMUM_KEY)
    try:
        return max(0, int(item.value)) if item else DEFAULT_MIN_TEACHING_PERIODS_PER_WEEK
    except ValueError:
        return DEFAULT_MIN_TEACHING_PERIODS_PER_WEEK
