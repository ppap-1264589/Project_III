"""API kiểm tra và xác nhận nhập dữ liệu từ Excel."""
from datetime import datetime, timedelta
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from ..database import SessionLocal
from ..db_io import get_minimum
from ..excel_import import parse_and_validate
from .data_storage import save_tables

router = APIRouter(prefix="/api")

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
PREVIEW_TTL = timedelta(minutes=20)
PREVIEWS: dict[str, dict] = {}   # bản xem trước file Excel, giữ trong RAM 20 phút


class ConfirmImport(BaseModel):
    preview_id: str


def clear_previews() -> None:
    PREVIEWS.clear()


@router.post("/input/preview")
async def preview_input(file: Annotated[UploadFile, File(description="Workbook theo mẫu input Project 3")]) -> dict:
    if not (file.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(status_code=415, detail="Chỉ hỗ trợ tệp .xlsx.")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Tệp vượt quá giới hạn 10 MB.")
    if not content.startswith(b"PK"):
        raise HTTPException(status_code=400, detail="Tệp tải lên không có định dạng XLSX hợp lệ.")

    with SessionLocal() as session:
        minimum = get_minimum(session)
    result = parse_and_validate(content, minimum)
    result["filename"] = file.filename
    result["preview_id"] = None

    data = result.pop("data", None)
    if result["valid"]:
        now = datetime.utcnow()
        for token, preview in list(PREVIEWS.items()):   # dọn bản xem trước đã hết hạn
            if preview["expires_at"] < now:
                PREVIEWS.pop(token)
        result["preview_id"] = str(uuid4())
        PREVIEWS[result["preview_id"]] = {"data": data, "filename": file.filename, "expires_at": now + PREVIEW_TTL}
    return result


@router.post("/input/confirm")
def confirm_input(payload: ConfirmImport) -> dict:
    preview = PREVIEWS.get(payload.preview_id)
    if preview is None or preview["expires_at"] < datetime.utcnow():
        PREVIEWS.pop(payload.preview_id, None)
        raise HTTPException(status_code=410, detail="Bản xem trước đã hết hạn. Hãy tải và kiểm tra lại file.")
    save_tables(preview["data"])
    PREVIEWS.pop(payload.preview_id, None)
    return {"saved": True, "filename": preview["filename"], "message": "Đã thay bộ dữ liệu hiện tại bằng dữ liệu từ Excel."}
