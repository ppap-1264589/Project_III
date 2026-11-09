import datetime as dt

from sqlalchemy import Date, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class SchoolClass(Base):
    __tablename__ = "classes"
    id: Mapped[str] = mapped_column("lop_id", String(40), primary_key=True)
    name: Mapped[str] = mapped_column("ten_lop", String(80), nullable=False)
    grade: Mapped[int] = mapped_column("khoi", Integer, nullable=False)


class Subject(Base):
    __tablename__ = "subjects"
    id: Mapped[str] = mapped_column("mon_id", String(40), primary_key=True)
    name: Mapped[str] = mapped_column("ten_mon", String(100), nullable=False)


class Teacher(Base):
    __tablename__ = "teachers"
    id: Mapped[str] = mapped_column("giao_vien_id", String(40), primary_key=True)
    display_name: Mapped[str] = mapped_column("ten_hien_thi", String(100), nullable=False)


class TeacherSubject(Base):
    __tablename__ = "teacher_subjects"
    teacher_id: Mapped[str] = mapped_column(ForeignKey("teachers.giao_vien_id", ondelete="CASCADE"), primary_key=True)
    subject_id: Mapped[str] = mapped_column(ForeignKey("subjects.mon_id", ondelete="CASCADE"), primary_key=True)


class ClassSubjectDemand(Base):
    __tablename__ = "class_subject_demands"
    class_id: Mapped[str] = mapped_column(ForeignKey("classes.lop_id", ondelete="CASCADE"), primary_key=True)
    subject_id: Mapped[str] = mapped_column(ForeignKey("subjects.mon_id", ondelete="CASCADE"), primary_key=True)
    periods_per_week: Mapped[int] = mapped_column(Integer, nullable=False)


class TeachingAssignment(Base):
    """Imported reference assignment rows; not an algorithm-generated schedule."""
    __tablename__ = "teaching_assignments"
    id: Mapped[str] = mapped_column("phan_cong_id", String(50), primary_key=True)
    class_id: Mapped[str] = mapped_column(ForeignKey("classes.lop_id", ondelete="CASCADE"), nullable=False)
    subject_id: Mapped[str] = mapped_column(ForeignKey("subjects.mon_id", ondelete="CASCADE"), nullable=False)
    teacher_id: Mapped[str] = mapped_column(ForeignKey("teachers.giao_vien_id", ondelete="CASCADE"), nullable=False)
    periods_per_week: Mapped[int] = mapped_column(Integer, nullable=False)


class SemesterConfig(Base):
    __tablename__ = "semester_config"
    id: Mapped[str] = mapped_column("hoc_ky_id", String(50), primary_key=True)
    name: Mapped[str] = mapped_column("ten_hoc_ky", String(100), nullable=False)
    start_date: Mapped[dt.date] = mapped_column("ngay_bat_dau", Date, nullable=False)
    duration_weeks: Mapped[int] = mapped_column("so_tuan", Integer, nullable=False)


class SchoolHoliday(Base):
    __tablename__ = "school_holidays"
    id: Mapped[str] = mapped_column("ngay_nghi_id", String(50), primary_key=True)
    date: Mapped[dt.date] = mapped_column("ngay", Date, nullable=False)
    name: Mapped[str] = mapped_column("ten_ngay_nghi", String(100), nullable=False)


class TimeSlot(Base):
    __tablename__ = "time_slots"
    id: Mapped[str] = mapped_column("khung_gio_id", String(60), primary_key=True)
    weekday: Mapped[str] = mapped_column("thu", String(20), nullable=False)
    session: Mapped[str] = mapped_column("buoi", String(20), nullable=False)
    period_number: Mapped[int] = mapped_column("tiet_so", Integer, nullable=False)
    start_time: Mapped[str] = mapped_column("gio_bat_dau", String(5), nullable=False)
    duration_minutes: Mapped[int] = mapped_column("thoi_luong_phut", Integer, nullable=False)
    break_after_minutes: Mapped[int] = mapped_column("nghi_sau_tiet_phut", Integer, nullable=False)
    slot_type: Mapped[str] = mapped_column("loai_khung", String(30), nullable=False)
    note: Mapped[str] = mapped_column("ghi_chu", String(300), nullable=False, default="")
    __table_args__ = (UniqueConstraint("thu", "buoi", "tiet_so", name="uq_slot_day_session_period"),)


class TeacherUnavailableSlot(Base):
    __tablename__ = "teacher_unavailable_slots"
    teacher_id: Mapped[str] = mapped_column(ForeignKey("teachers.giao_vien_id", ondelete="CASCADE"), primary_key=True)
    weekday: Mapped[str] = mapped_column("thu", String(20), primary_key=True)
    session: Mapped[str] = mapped_column("buoi", String(20), primary_key=True)
    period_number: Mapped[int] = mapped_column("tiet_so", Integer, primary_key=True)
    note: Mapped[str] = mapped_column("ghi_chu", String(300), nullable=False, default="")


class TeacherDateUnavailableSlot(Base):
    """One-off teacher unavailability for a specific calendar date."""
    __tablename__ = "teacher_date_unavailable_slots"
    teacher_id: Mapped[str] = mapped_column(ForeignKey("teachers.giao_vien_id", ondelete="CASCADE"), primary_key=True)
    date: Mapped[dt.date] = mapped_column(Date, primary_key=True)
    session: Mapped[str] = mapped_column("buoi", String(20), primary_key=True)
    period_number: Mapped[int] = mapped_column("tiet_so", Integer, primary_key=True)


class AppSetting(Base):
    __tablename__ = "app_settings"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str] = mapped_column(String(300), nullable=False)
