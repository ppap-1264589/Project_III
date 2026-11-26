"""Tên bảng, thứ tự cột và các giá trị mặc định của dữ liệu đầu vào."""

HEADER_ROW = 4
DEFAULT_MIN_TEACHING_PERIODS_PER_WEEK = 19

SHEETS: dict[str, tuple[str, ...]] = {
    "Lop": ("lop_id", "ten_lop", "khoi"),
    "Mon": ("mon_id", "ten_mon"),
    "GiaoVien": ("giao_vien_id", "ten_hien_thi"),
    "GV_Mon": ("giao_vien_id", "mon_id"),
    "NhuCau": ("lop_id", "mon_id", "so_tiet_tuan"),
    "PhanCong": (
        "phan_cong_id",
        "lop_id",
        "mon_id",
        "giao_vien_id",
        "so_tiet_tuan",
    ),
    "KhungGio": (
        "khung_gio_id",
        "thu",
        "buoi",
        "tiet_so",
        "gio_bat_dau",
        "thoi_luong_phut",
        "nghi_sau_tiet_phut",
        "loai_khung",
        "ghi_chu",
    ),
    "GV_Ban": ("giao_vien_id", "thu", "buoi", "tiet_so", "ghi_chu"),
    "HocKy": ("hoc_ky_id", "ten_hoc_ky", "ngay_bat_dau", "so_tuan"),
    "NgayNghi": ("ngay_nghi_id", "ngay", "ten_ngay_nghi"),
}
