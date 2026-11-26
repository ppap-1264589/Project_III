from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import models
from .database import Base, SessionLocal, engine
from .db_io import MINIMUM_KEY
from .excel_import import DEFAULT_MIN_TEACHING_PERIODS_PER_WEEK
from .routes import busy, data, timetable

STATIC_DIR = Path(__file__).resolve().parent / "static"

app = FastAPI(title="Project 3 Timetable", description="Nhập dữ liệu và xếp thời khóa biểu THCS.", version="0.3.0")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.include_router(data.router)
app.include_router(busy.router)
app.include_router(timetable.router)

# Địa chỉ trang -> file HTML
PAGES = {
    "/": "index.html",           # nhập Excel
    "/admin": "admin.html",      # sửa dữ liệu trên lưới
    "/busy": "busy.html",        # đánh dấu giờ bận
    "/timetable": "timetable.html",  # xếp lịch
}


def make_page(filename: str):
    def page():
        return FileResponse(STATIC_DIR / filename)
    return page


for url, filename in PAGES.items():
    app.add_api_route(url, make_page(filename), include_in_schema=False)


@app.on_event("startup")
def initialize_database() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal.begin() as session:
        if session.get(models.AppSetting, MINIMUM_KEY) is None:
            session.add(models.AppSetting(key=MINIMUM_KEY, value=str(DEFAULT_MIN_TEACHING_PERIODS_PER_WEEK)))


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}