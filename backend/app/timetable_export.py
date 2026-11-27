"""Xuất bảng tuần đang xem ra Excel."""
from io import BytesIO

from fastapi import HTTPException, Response
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from pydantic import BaseModel, Field


class WeeklyGrid(BaseModel):
    title: str
    subtitle: str
    headings: list[str] = Field(min_length=2, max_length=8)
    rows: list[list[str]] = Field(max_length=500)


def export_weekly_grid(grid: WeeklyGrid) -> Response:
    width = len(grid.headings)
    if any(len(row) != width for row in grid.rows):
        raise HTTPException(status_code=422, detail="Số cột trong bảng không khớp với tiêu đề.")

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Thời khóa biểu tuần"
    for index, values in enumerate([[grid.title], [grid.subtitle], grid.headings, *grid.rows], 1):
        for column, value in enumerate(values, 1):
            cell = sheet.cell(index, column, value)
            cell.data_type = "s"  # Tên lớp, môn và giáo viên luôn là văn bản.
            cell.alignment = Alignment(vertical="center", wrap_text=True)
            if index <= 3:
                cell.font = Font(bold=True, color="FFFFFF" if index == 3 else "173B5F")
            if index == 3 or (index > 3 and (column == 1 or "\n" in value)):
                color = "173B5F" if index == 3 else "E8F1FA"
                cell.fill = PatternFill("solid", fgColor=color)
        sheet.row_dimensions[index].height = 24 if index <= 2 else 38

    sheet.merge_cells(start_row=1, start_column=1, end_row=1, end_column=width)
    sheet.merge_cells(start_row=2, start_column=1, end_row=2, end_column=width)
    for column in range(1, width + 1):
        sheet.column_dimensions[get_column_letter(column)].width = 26 if column > 1 else 17
    sheet.freeze_panes = "B4"
    sheet.sheet_view.showGridLines = False
    sheet.page_setup.orientation = "landscape"
    sheet.page_setup.fitToWidth = 1
    sheet.sheet_properties.pageSetUpPr.fitToPage = True
    sheet.print_title_rows = "1:3"

    output = BytesIO()
    workbook.save(output)
    return Response(
        output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="thoi-khoa-bieu-tuan.xlsx"'},
    )
