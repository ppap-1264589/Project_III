# Project 3 - Xếp thời khóa biểu THCS

Đồ án xây dựng ứng dụng hỗ trợ nhập dữ liệu và xếp thời khóa biểu cho trường THCS. Phiên bản hiện tại là một web cục bộ cho phép nhập/kiểm tra workbook Excel, nhập và chỉnh sửa dữ liệu trên giao diện, đánh dấu giờ bận của giáo viên và chạy bộ giải CP-SAT để xếp thời khóa biểu cả học kỳ.

Toàn bộ dữ liệu trong workbook mẫu (tên, ngày, số tiết) là dữ liệu giả định để thử ứng dụng, không đại diện cho một trường cụ thể hay định mức chính thức.

## Chạy thử trên Windows

Từ thư mục gốc của dự án, chạy một lệnh:

```powershell
.\backend\run.bat
```

Lần đầu chạy, script tạo môi trường Python riêng trong `backend/.venv` và cài các thư viện khai báo trong `backend/requirements.txt`. Những lần sau, script kiểm tra dependencies rồi chạy API. Cần cài Python 3.10 trở lên trước.

Khi server khởi động, mở:

- `http://127.0.0.1:8000/` để nhập Excel.
- `http://127.0.0.1:8000/admin` để nhập và sửa dữ liệu trên giao diện.
- `http://127.0.0.1:8000/busy` để đánh dấu giờ bận hằng tuần của giáo viên.
- `http://127.0.0.1:8000/timetable` để chạy bộ giải và xem thời khóa biểu theo tuần.
- `http://127.0.0.1:8000/docs` để xem tài liệu API dành cho phát triển.

Nếu gặp lỗi `WinError 10013` (cổng 8000 bị chặn hoặc đang được dùng), tắt tiến trình đang giữ cổng (`netstat -ano | findstr :8000`, rồi `taskkill /PID <PID> /F`) hoặc đổi `--port` ở dòng cuối của `backend/run.bat`.

## Tiến độ

Đã hoàn thành:

- Nhập file Excel, kiểm tra, xác nhận lưu vào SQLite; cấu hình mức tiết tối thiểu của giáo viên.
- Trang `/admin`:
  - Bảng Lớp, Môn, Giáo viên: mã tự sinh khi lưu (`CLS-01`, `SUB-01`, `TCH-01`...), dữ liệu cũ giữ nguyên mã. Mã lớp và mã môn được ẩn; mã giáo viên hiển thị nhưng không cho sửa.
  - Bảng môn giáo viên có thể dạy: chọn giáo viên dạng "mã - tên", thêm môn bằng nút `+` từ bảng Môn, mỗi môn một dòng, xếp theo bảng chữ cái.
  - Bảng nhu cầu tiết học: nhập dạng ma trận lớp x môn, có tổng số tiết/tuần của mỗi lớp.
  - Phím Enter xuống dòng hoặc xuống ô kế tiếp; nút "Thêm dòng" vẫn dùng được.
- Trang `/busy`: đánh dấu giờ bận hằng tuần theo từng ô hoặc cả ngày.
- Trang `/timetable`: bộ giải xếp một tuần mẫu rồi áp dụng cho cả học kỳ, xem theo tuần, hiển thị tải tiết của giáo viên.

Chưa làm:

- Các bảng Phân công tham khảo, Khung giờ, Giờ bận, Học kỳ, Ngày nghỉ ở `/admin` vẫn là lưới nhập thường (Phân công vẫn phải gõ tay mã lớp, môn, giáo viên).
- Ẩn mã ở toàn bộ các bảng còn lại; chặn sửa mã giáo viên ở phía backend (hiện mới chặn ở giao diện).
- Ràng buộc đúng 19 tiết cho mỗi giáo viên (hiện chỉ cảnh báo khi dưới mức tối thiểu), các mục tiêu tối ưu (giảm tiết trống, tránh lặp môn trong ngày...), xem theo lớp hoặc giáo viên, khóa tiết, xuất CSV/in.
- Kiểm thử tự động (các thay đổi gần đây mới được kiểm tra thủ công trên trình duyệt).

## Cấu trúc hiện tại

- `backend/app/main.py`: khởi tạo ứng dụng, các địa chỉ trang, khởi tạo database.
- `backend/app/routes/excel.py`: API xem trước và xác nhận nhập Excel.
- `backend/app/routes/data.py`: API sửa dữ liệu trên lưới, cài đặt, thống kê; sinh mã tự động cho Lớp, Môn, Giáo viên.
- `backend/app/routes/busy.py`: API giờ bận hằng tuần của giáo viên.
- `backend/app/routes/timetable.py`: API chạy bộ giải và nhân kết quả ra cả học kỳ.
- `backend/app/solver.py`: bộ giải CP-SAT cho một tuần mẫu. Đầu vào là `NhuCau`, `GV_Mon`, `KhungGio` (chỉ loại `Tiết học`) và `GV_Ban`. Mỗi cặp lớp-môn được chọn đúng một giáo viên có chuyên môn; không trùng tiết của lớp hoặc giáo viên; tránh giờ bận.
- `backend/app/calendar_expand.py`: nhân tuần mẫu ra các tuần của học kỳ, bỏ các tiết rơi vào ngày nghỉ (không xếp bù).
- `backend/app/db_io.py`, `backend/app/helpers.py`: đọc/ghi các bảng với database và các hàm xử lý tên thứ, buổi tiếng Việt.
- `backend/app/excel_import.py`: đọc workbook và chuyển dữ liệu sang `input_validation.py` để kiểm tra. Tên bảng và thứ tự cột nằm trong `input_schema.py`.
- `backend/app/models.py`, `backend/app/database.py`: cấu trúc bảng SQLAlchemy và kết nối SQLite.
- `backend/app/static/`: giao diện. `index.html` và `app.js` (nhập Excel), `admin.html` và `admin.js` (lưới nhập/chỉnh sửa), `busy.html` và `busy.js` (giờ bận), `timetable.html` và `timetable.js` (xếp lịch), `app.css` (kiểu dáng chung).
  Trang quản trị dùng `admin.js` để tải/lưu dữ liệu và chọn cách hiển thị bảng. Các màn chỉnh sửa nằm trong `static/admin/` với `table-grid.js` (lưới thường), `teacher-subjects.js` (chuyên môn giáo viên) và `demand-matrix.js` (nhu cầu tiết học).
- `backend/data/timetable.db`: SQLite được tạo tự động khi backend khởi động; Git bỏ qua file database này.
- `backend/requirements.txt`: thư viện Python cần cài.
- `Bảng nhu cầu lịch học - học kỳ.xlsx`: workbook input mẫu hiện tại, có cấu hình học kỳ và ngày nghỉ.

## Input Excel

Backend cần các trang `Lop`, `Mon`, `GiaoVien`, `GV_Mon`, `NhuCau`, `PhanCong`, `KhungGio`, `GV_Ban`, `HocKy` và `NgayNghi`. Tiêu đề cột nằm ở hàng 4, dữ liệu bắt đầu từ hàng 5. `Doc huong dan` và `KiemTraInput` là trang hướng dẫn/đối chiếu, không phải bảng nghiệp vụ để nhập.

`PhanCong` là dữ liệu mẫu tham khảo được lưu riêng để so sánh, không phải kết quả xếp lịch và không phải đầu vào của bộ giải; chênh lệch với `NhuCau` chỉ tạo cảnh báo. Đầu vào của bộ giải gồm nhu cầu lớp-môn (`NhuCau`), chuyên môn giáo viên (`GV_Mon`), khung giờ (`KhungGio`) và giờ giáo viên không thể dạy (`GV_Ban`).

`HocKy` có đúng một dòng gồm mã/tên học kỳ, ngày bắt đầu và số tuần (1-52); ngày kết thúc tính tự động theo số tuần. `NgayNghi` có thể có nhiều dòng, mỗi dòng là một ngày nghỉ cụ thể trong năm mô phỏng. Có thể lưu ngày ngoài học kỳ; chỉ những ngày nằm trong khoảng học kỳ mới được loại khi nhân lịch. Workbook mẫu chỉ là giả định, hãy thay ngày và số tuần theo kịch bản đồ án của bạn.

Mã dạng chữ như `TCH-01`, `CLS-6A` và `SUB-MATH` được dùng làm ID; các bảng liên kết luôn dùng ID, không dùng tên hiển thị. Giờ truy bài và sinh hoạt lớp có loại khung `Hoạt động`, không được tính vào tải giảng dạy. Mức tiết tối thiểu chỉnh ở giao diện và lưu trong database, mặc định là 19; hiện chỉ dùng để cảnh báo.

Khi xác nhận Excel mới hoặc lưu từ `/admin`, các bảng dữ liệu thời khóa biểu được thay thế trong một transaction; cấu hình mức tiết được giữ nguyên. Giờ bận lưu ở `/busy` thuộc bảng `GV_Ban` nên cũng bị thay khi nhập dữ liệu mới.

## Nhập và chỉnh sửa trên `/admin`

- Chọn bảng, sửa từng ô, thêm hoặc xóa dòng, rồi bấm "Kiểm tra và lưu". Toàn bộ các bảng được kiểm tra cùng lúc trước khi ghi vào database.
- **Lớp, Môn, Giáo viên:** chỉ nhập tên (và khối với lớp). Mã được sinh khi lưu. Lớp, môn hoặc giáo viên mới phải được lưu một lần thì mới xuất hiện ở các bảng phụ thuộc.
- **Môn giáo viên có thể dạy:** mỗi giáo viên một dòng; bấm `+` để thêm môn, bấm `×` để bỏ môn.
- **Nhu cầu tiết học:** ma trận lớp x môn; để trống hoặc 0 nếu lớp không học môn đó. Ô phải là số nguyên từ 0 đến 40.
- Nút "Xóa toàn bộ dữ liệu" cần bấm hai lần để xác nhận.

## Lưu ý

Ứng dụng hỗ trợ người xếp thời khóa biểu ra quyết định; nhân sự nhà trường vẫn chịu trách nhiệm kiểm tra kết quả. Ứng dụng chạy cục bộ, chưa có tài khoản đăng nhập.
