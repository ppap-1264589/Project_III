# Project 3 - Xếp thời khóa biểu THCS

Đồ án xây dựng ứng dụng hỗ trợ nhập dữ liệu và xếp thời khóa biểu cho trường THCS. Phiên bản hiện tại có giao diện local web để kiểm tra workbook Excel, xác nhận nhập vào SQLite và cấu hình mức tiết tối thiểu của giáo viên.

## Chạy thử trên Windows

Từ thư mục gốc của dự án, chạy một lệnh:

```powershell
.\backend\run.bat
```

Lần đầu chạy, script tạo môi trường Python riêng trong `backend/.venv` và cài các thư viện khai báo trong `backend/requirements.txt`. Những lần sau, script kiểm tra dependencies rồi chạy API. Cần cài Python 3.10 trở lên trước.

Khi server khởi động, mở `http://127.0.0.1:8000/` để nhập Excel, `http://127.0.0.1:8000/admin` để sửa dữ liệu dạng lưới, hoặc `http://127.0.0.1:8000/solver` để đánh dấu giờ bận theo ngày và chạy bộ giải CP-SAT. Tài liệu API dành cho phát triển vẫn ở `http://127.0.0.1:8000/docs`.

## Cấu trúc hiện tại

- `backend/app/main.py`: API, SQLite import workflow và phục vụ giao diện.
- `backend/app/excel_import.py`: đọc workbook và kiểm tra bảng, mã định danh, quan hệ, phân công, khung giờ và tải tiết.
- `backend/app/models.py`: cấu trúc bảng SQLAlchemy.
- `backend/app/static/index.html`: giao diện người dùng.
- `backend/app/static/app.css` và `backend/app/static/app.js`: kiểu dáng và xử lý giao diện.
- `backend/app/static/admin.html` và `backend/app/static/admin.js`: giao diện lưới nhập/chỉnh sửa các bảng.
- `backend/data/timetable.db`: SQLite được tạo tự động khi backend khởi động; Git bỏ qua file database này.
- `backend/requirements.txt`: thư viện Python cần cài.
- Bộ giải CP-SAT dùng dữ liệu `PhanCong` làm phân công lớp-môn-giáo viên, tạo lịch tuần theo `KhungGio`, loại giờ bận lặp lại trong `GV_Ban` và giờ bận theo ngày đã chọn trên trang `/solver`.
- `Bảng nhu cầu lịch học - học kỳ.xlsx`: workbook input mẫu hiện tại, có cấu hình học kỳ và ngày nghỉ.

## Input Excel

Backend cần các trang `Lop`, `Mon`, `GiaoVien`, `GV_Mon`, `NhuCau`, `PhanCong`, `KhungGio`, `GV_Ban`, `HocKy` và `NgayNghi`. Tiêu đề cột nằm ở hàng 4, dữ liệu bắt đầu từ hàng 5. `Doc huong dan` và `KiemTraInput` là trang hướng dẫn/đối chiếu, không phải bảng nghiệp vụ để nhập.

`PhanCong` là dữ liệu mẫu tham khảo được lưu riêng để so sánh, không phải kết quả xếp lịch và chênh lệch với `NhuCau` chỉ tạo cảnh báo. Đầu vào phân công dự kiến của thuật toán gồm nhu cầu lớp-môn, giáo viên, chuyên môn, khung giờ và giờ giáo viên không thể dạy. `HocKy` có đúng một dòng gồm mã/tên học kỳ, ngày bắt đầu và số tuần (1–52); ngày kết thúc tính tự động theo số tuần. `NgayNghi` có thể có nhiều dòng, mỗi dòng là một ngày nghỉ cụ thể trong năm mô phỏng. Có thể lưu ngày ngoài học kỳ; thuật toán sau này chỉ loại các ngày nghỉ nằm trong khoảng học kỳ.

Có thể chỉnh hai bảng lịch trên Excel hoặc tại `/admin` trong giao diện lưới. Trang chính hiển thị khoảng ngày học kỳ và số ngày nghỉ đã khai báo. Workbook `Bảng nhu cầu lịch học - học kỳ.xlsx` là mẫu giả định; hãy thay ngày và số tuần theo kịch bản đồ án của bạn.

Mã dạng chữ như `TCH-01`, `CLS-6A` và `SUB-MATH` được dùng làm ID. Giờ truy bài có loại khung `Hoạt động`, không được tính vào tải giảng dạy. Mức tiết tối thiểu chỉnh ở giao diện và lưu trong database, mặc định là 19. Khi xác nhận Excel mới, các bảng dữ liệu thời khóa biểu được thay thế trong một transaction; cấu hình mức tiết được giữ nguyên.
