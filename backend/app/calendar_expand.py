"""Nhân thời khóa biểu của tuần mẫu ra tất cả các tuần của học kỳ."""
from datetime import date, timedelta

from .helpers import weekday_index


def expand_to_semester(schedule, start_date: date, weeks: int, holidays: dict[date, str]):
    """
    schedule: các tiết của tuần mẫu (kết quả solver)
    holidays: {ngày nghỉ: tên ngày nghỉ}
    Trả về (danh sách tuần, danh sách tiết có ngày cụ thể).
    Tiết rơi vào ngày nghỉ bị bỏ (không xếp bù).
    """
    end_date = start_date + timedelta(days=weeks * 7 - 1)
    first_monday = start_date - timedelta(days=start_date.weekday())

    week_list, lessons = [], []
    for n in range(weeks):
        monday = first_monday + timedelta(weeks=n)
        count = 0
        for row in schedule:
            index = weekday_index(row["weekday"])
            if index is None:
                continue
            day = monday + timedelta(days=index)
            if day < start_date or day > end_date or day in holidays:
                continue
            lessons.append({**row, "week": n + 1, "date": day.isoformat()})
            count += 1
        week_holidays = [f"{d.isoformat()} ({name})" for d, name in sorted(holidays.items())
                         if monday <= d <= monday + timedelta(days=6) and start_date <= d <= end_date]
        week_list.append({
            "week": n + 1, "start": monday.isoformat(), "end": (monday + timedelta(days=6)).isoformat(),
            "lesson_count": count, "holidays": week_holidays,
        })
    return week_list, lessons