"""Thao tác lưu dùng chung cho nhập Excel và trang quản trị."""
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from ..database import SessionLocal
from ..db_io import replace_all


def save_tables(tables: dict) -> None:
    """Thay toàn bộ dữ liệu đầu vào bằng `tables` (dùng chung cho nhập Excel và sửa trên lưới)."""
    try:
        with SessionLocal.begin() as session:
            replace_all(session, tables)
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail=f"Không thể lưu do vi phạm khóa hoặc dữ liệu trùng: {exc.orig}") from exc
