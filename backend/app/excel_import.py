"""Đọc workbook Excel và chuyển các bảng sang bước kiểm tra dữ liệu."""
from __future__ import annotations

from io import BytesIO
from typing import Any

from openpyxl import Workbook, load_workbook

from .input_schema import DEFAULT_MIN_TEACHING_PERIODS_PER_WEEK, HEADER_ROW, SHEETS
from .input_validation import Issue, cell_text, is_empty, make_issue, validate_input


def _rows(sheet: Any) -> tuple[list[dict[str, Any]], list[Issue]]:
    expected = SHEETS[sheet.title]
    actual = tuple(cell_text(sheet.cell(HEADER_ROW, col).value) for col in range(1, len(expected) + 1))
    issues: list[Issue] = []
    if actual != expected:
        issues.append(Issue(
            "error", "INVALID_HEADERS",
            f"Tên/cấu trúc cột không đúng. Cần: {', '.join(expected)}.",
            sheet=sheet.title, row=HEADER_ROW,
        ))
        return [], issues

    result: list[dict[str, Any]] = []
    # Một số tệp XLSX thiếu thông tin kích thước bảng khi mở ở chế độ chỉ đọc.
    max_row = sheet.max_row
    if max_row is None:
        sheet.calculate_dimension(force=True)
        max_row = sheet.max_row or HEADER_ROW
    for values in sheet.iter_rows(
        min_row=HEADER_ROW + 1, max_row=max_row, max_col=len(expected), values_only=True,
    ):
        if all(is_empty(value) for value in values):
            continue
        result.append(dict(zip(expected, values)))
    return result, issues


def parse_and_validate(content: bytes, min_periods: int = DEFAULT_MIN_TEACHING_PERIODS_PER_WEEK) -> dict[str, Any]:
    issues: list[Issue] = []
    try:
        workbook = load_workbook(BytesIO(content), read_only=True, data_only=True)
    except Exception as exc:
        return {
            "valid": False,
            "errors": [make_issue("INVALID_WORKBOOK", f"Không đọc được tệp Excel: {exc}", "").as_dict()],
            "warnings": [],
            "summary": {},
        }

    try:
        missing = sorted(set(SHEETS) - set(workbook.sheetnames))
        if missing:
            issues.append(make_issue("MISSING_SHEETS", f"Thiếu trang tính: {', '.join(missing)}.", "Workbook"))
        parsed: dict[str, list[dict[str, Any]]] = {}
        for name in SHEETS:
            if name in workbook.sheetnames:
                parsed[name], sheet_issues = _rows(workbook[name])
                issues.extend(sheet_issues)
            else:
                parsed[name] = []
    finally:
        workbook.close()

    return validate_input(parsed, issues, min_periods)


def validate_tables(tables: dict[str, list[dict]], min_periods: int = DEFAULT_MIN_TEACHING_PERIODS_PER_WEEK) -> dict:
    """Kiểm tra dữ liệu sửa trên lưới: ghi tạm thành workbook rồi dùng lại parse_and_validate."""
    workbook = Workbook()
    workbook.remove(workbook.active)
    for sheet_name, columns in SHEETS.items():
        sheet = workbook.create_sheet(sheet_name)
        for col, name in enumerate(columns, start=1):
            sheet.cell(HEADER_ROW, col, name)
        for row_number, row in enumerate(tables[sheet_name], start=HEADER_ROW + 1):
            for col, name in enumerate(columns, start=1):
                sheet.cell(row_number, col, row.get(name))
    stream = BytesIO()
    workbook.save(stream)
    workbook.close()
    return parse_and_validate(stream.getvalue(), min_periods)
