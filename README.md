# Project 3 - Xếp thời khóa biểu THCS

Ứng dụng web cục bộ để nhập dữ liệu trường THCS, chỉnh sửa trên lưới và xếp thời khóa biểu bằng OR-Tools CP-SAT. File Excel mẫu dùng dữ liệu giả định để chạy thử đồ án.

## Chạy thử trên Windows

Cài Python 3.10 trở lên. Từ thư mục gốc của dự án, chạy:

```powershell
.\backend\run.bat
```

Script tạo môi trường Python trong `backend/.venv`, cài thư viện từ `backend/requirements.txt` và khởi động FastAPI. Mở [trang chủ](http://localhost:8000/) sau khi máy chủ chạy. Nếu cổng 8000 đang được sử dụng, có thể đổi `--port` trong `backend/run.bat` và mở địa chỉ tương ứng.

## Nhập và chỉnh sửa dữ liệu

- [Trang chủ](http://localhost:8000/) dùng để kiểm tra và nhập Excel, xem thống kê dữ liệu đã lưu và đặt số tiết tối thiểu mỗi giáo viên phải dạy trong tuần mẫu. Xác nhận nhập Excel sẽ thay thế dữ liệu đầu vào đang lưu.
- [Quản trị dữ liệu](http://localhost:8000/admin) hỗ trợ chỉnh sửa lớp, môn, giáo viên và các ràng buộc. Bấm **Kiểm tra và lưu** để ghi vào SQLite. **Tải lại từ database** bỏ các thay đổi chưa lưu. Nút xóa dòng hoặc bỏ môn yêu cầu bấm lần hai. Nút xóa toàn bộ nằm trong mục thu gọn ở cuối trang.
- **Môn giáo viên có thể dạy** có cột **Thao tác** để thêm môn. Nút bỏ môn nằm cạnh môn tương ứng.
- **Nhu cầu tiết học** là ma trận lớp × môn, với các cột theo thứ tự của bảng **Môn học**. Kéo để chọn vùng hoặc bấm tên lớp để chọn cả hàng, rồi dùng `Ctrl+C` và `Ctrl+V`. Bấm chuột phải vào tên lớp để sao chép số tiết sang các lớp còn lại cùng khối. Thao tác ghi đè sau lần xác nhận thứ hai.
- **Khung giờ học** là lưới theo tuần. Có thể thêm, kéo, sửa, xóa và sao chép khung giờ qua các ngày. Khung loại **Tiết học** là vị trí bộ giải có thể dùng. Các hoạt động như **Truy bài** được hiển thị trên lưới.
- **Giờ lớp không thể học** và **Giờ giáo viên không thể dạy** dùng cùng khung giờ. Chọn lớp hoặc giáo viên trong dropdown, rồi bấm một tiết, **Sáng**, **Chiều** hoặc tên ngày để chặn hay bỏ chặn theo tuần. Ô đỏ có dấu **X** là tiết bị chặn. Nút buổi chuyển đỏ khi cả buổi đã bị chặn.
- **Cấu hình học kỳ** và **Ngày nghỉ cố định** hỗ trợ gõ ngày theo `dd/mm/yy` hoặc bấm **Mở lịch**. Mã của dòng mới được sinh khi lưu. Dòng trống hoàn toàn được bỏ qua. Nếu ngày sai, thông báo chỉ rõ bảng, dòng và cột.

## Cách xếp thời khóa biểu

Ở [trang xếp lịch](http://localhost:8000/timetable), bấm **Tạo thời khóa biểu**. Bộ giải tạo một tuần mẫu từ nhu cầu tiết học, chuyên môn giáo viên và các khung giờ của trường. Mỗi cặp lớp–môn có một giáo viên đủ chuyên môn. Bộ giải tránh trùng lịch, loại tiết đã chặn theo lớp hoặc giáo viên và buộc mỗi giáo viên đạt số tiết tối thiểu đã cấu hình. Khung giờ học được phép để trống khi lớp đã đủ số tiết hoặc khi cần để thỏa các ràng buộc.

Ứng dụng áp tuần mẫu cho cả học kỳ và bỏ các tiết rơi vào ngày nghỉ cố định. Hiện chưa tự xếp tiết học bù hoặc giải lại lịch riêng cho tuần có ngày nghỉ.

Sau khi tạo lịch, chọn **Tuần**, **Xem theo** và tên lớp hoặc giáo viên. Bảng đặt các ngày ở cột và các tiết theo buổi ở hàng. Khi xem theo lớp, mỗi ô có môn và giáo viên. Khi xem theo giáo viên, mỗi ô có môn và lớp. Ô trống là tiết chưa được xếp cho đối tượng đang xem. Dấu **—** chỉ khung giờ ngoài lịch học hoặc ngày nghỉ.

Bấm **Tải Excel tuần này** để lưu bảng của tuần và lớp hoặc giáo viên đang chọn thành file `.xlsx`. Có thể mở mục **Tất cả tiết học trong tuần** để xem danh sách của toàn trường.

Bấm **Lưu thời khóa biểu** để lưu lời giải hiện tại vào SQLite và cập nhật số tiết dạy trong tuần mẫu trên trang chủ. Hệ thống giữ một lời giải, nên lần lưu tiếp theo sẽ thay thế lời giải trước. Bấm **Tải lại lời giải đã có** để mở lịch đã lưu. Trình duyệt ghi nhớ bảng đang mở khi tải lại trang quản trị trong cùng tab.

## Excel và lưu trữ

Workbook có tiêu đề cột ở hàng 4 và dữ liệu từ hàng 5. Tên bảng và cột được khai báo trong `backend/app/input_schema.py`. Sheet `Lop_Ban` là tùy chọn để tương thích với file Excel cũ. `PhanCong` là sheet tham khảo của mẫu cũ, được ẩn khỏi giao diện quản trị và được bỏ qua khi trống. Kết quả xếp lịch được tạo ở trang xếp lịch.

SQLite lưu tại `backend/data/timetable.db`. Ứng dụng tự tạo bảng còn thiếu khi khởi động. Mỗi lượt lưu từ trang quản trị hoặc xác nhận nhập Excel ghi dữ liệu đầu vào trong một giao dịch. Cấu hình số tiết tối thiểu được giữ khi thay dữ liệu đầu vào.

## Cấu trúc mã nguồn

| Tệp hoặc thư mục | Vai trò |
| --- | --- |
| `backend/app/main.py` | Khởi tạo ứng dụng, route và SQLite |
| `backend/app/routes/` | API nhập Excel, quản trị, thống kê và xếp lịch |
| `backend/app/input_schema.py`, `input_validation.py` | Cấu trúc và quy tắc kiểm tra dữ liệu |
| `backend/app/models.py`, `db_io.py` | Mô hình SQLAlchemy và đọc ghi SQLite |
| `backend/app/solver.py`, `calendar_expand.py` | Giải tuần mẫu và mở rộng lịch theo học kỳ |
| `backend/app/static/` | Giao diện HTML, CSS và JavaScript |

Xem [tài liệu API](http://localhost:8000/docs) khi phát triển. Xem `CLAUDE.md` để nắm chi tiết luồng dữ liệu và hành vi cần giữ khi sửa mã.
