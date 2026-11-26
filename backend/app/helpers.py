"""Hàm nhỏ dùng chung: xử lý tên thứ/buổi tiếng Việt."""
import re
import unicodedata


def fold(text) -> str:
    """Chữ thường, bỏ dấu tiếng Việt: 'Thứ Hai' -> 'thu hai'."""
    value = str(text or "").strip().lower().replace("đ", "d")
    value = unicodedata.normalize("NFD", value)
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", value)


DAY_NAMES = {
    "thu hai": 0, "thu ba": 1, "thu tu": 2, "thu nam": 3,
    "thu sau": 4, "thu bay": 5, "chu nhat": 6, "cn": 6,
}


def weekday_index(label):
    """'Thứ Hai' -> 0 ... 'Chủ nhật' -> 6. Không nhận ra thì trả None."""
    text = fold(label)
    if text in DAY_NAMES:
        return DAY_NAMES[text]
    match = re.fullmatch(r"(?:thu|t)\s*([2-7])", text)  # 'Thu 2', 'T2'
    return int(match.group(1)) - 2 if match else None


def session_order(label) -> int:
    """Sáng = 0, Chiều = 1, khác = 2 (dùng để sắp xếp)."""
    text = fold(label)
    if "sang" in text:
        return 0
    if "chieu" in text:
        return 1
    return 2