const labels = {
  Lop: "Lớp",
  Mon: "Môn học",
  GiaoVien: "Giáo viên",
  GV_Mon: "Môn giáo viên có thể dạy",
  NhuCau: "Nhu cầu tiết học",
  PhanCong: "Phân công tham khảo (dữ liệu mẫu)",
  KhungGio: "Khung giờ học",
  GV_Ban: "Giờ giáo viên không thể dạy",
  HocKy: "Cấu hình học kỳ",
  NgayNghi: "Ngày nghỉ cố định",
};
const columns = {
  lop_id: "Mã lớp", ten_lop: "Tên lớp", khoi: "Khối",
  mon_id: "Mã môn", ten_mon: "Tên môn",
  giao_vien_id: "Mã giáo viên", ten_hien_thi: "Tên hiển thị",
  phan_cong_id: "Mã phân công", so_tiet_tuan: "Số tiết/tuần",
  khung_gio_id: "Mã khung giờ", thu: "Thứ", buoi: "Buổi", tiet_so: "Tiết",
  gio_bat_dau: "Giờ bắt đầu", thoi_luong_phut: "Thời lượng (phút)",
  nghi_sau_tiet_phut: "Nghỉ sau tiết (phút)", loai_khung: "Loại khung", ghi_chu: "Ghi chú",
  hoc_ky_id: "Mã học kỳ", ten_hoc_ky: "Tên học kỳ", ngay_bat_dau: "Ngày bắt đầu",
  so_tuan: "Số tuần", ngay_nghi_id: "Mã ngày nghỉ", ngay: "Ngày nghỉ", ten_ngay_nghi: "Tên ngày nghỉ",
};
const issueTitles = {
  UNKNOWN_CLASS: "Không tìm thấy lớp",
  UNKNOWN_SUBJECT: "Không tìm thấy môn học",
  UNKNOWN_TEACHER: "Không tìm thấy giáo viên",
  TEACHER_NOT_QUALIFIED: "Giáo viên chưa được khai báo dạy môn này",
  INVALID_PERIOD_COUNT: "Số tiết không hợp lệ",
  REFERENCE_ASSIGNMENT_MISMATCH: "Phân công tham khảo khác nhu cầu",
  UNKNOWN_TIME_SLOT: "Khung giờ bận không khớp thời khóa biểu",
  DUPLICATE_PRIMARY_KEY: "Mã định danh bị trùng",
  REQUIRED_VALUE_MISSING: "Thiếu dữ liệu bắt buộc",
  REFERENCE_TEACHER_LOAD_BELOW_MIN: "Tải tiết trong phân công tham khảo còn thấp",
  SEMESTER_ROW_COUNT: "Cần một cấu hình học kỳ",
  INVALID_SEMESTER_START_DATE: "Ngày bắt đầu học kỳ chưa hợp lệ",
  INVALID_SEMESTER_WEEKS: "Số tuần học kỳ chưa hợp lệ",
  INVALID_HOLIDAY_DATE: "Ngày nghỉ chưa hợp lệ",
  HOLIDAY_OUTSIDE_SEMESTER: "Ngày nghỉ nằm ngoài học kỳ",
};
const sheetLabels = {
  Lop:"Lớp", Mon:"Môn học", GiaoVien:"Giáo viên", GV_Mon:"Môn giáo viên có thể dạy",
  NhuCau:"Nhu cầu tiết học", PhanCong:"Phân công tham khảo",
  KhungGio:"Khung giờ học", GV_Ban:"Giờ giáo viên không thể dạy",
  HocKy:"Cấu hình học kỳ", NgayNghi:"Ngày nghỉ cố định",
};
let dataSet = {};
let tableColumns = {};
let activeTable = null;

const byId = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;",
}[char]));

async function readResponse(response) {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    const detail = body.trim().replace(/\s+/g, " ").slice(0, 180);
    throw new Error("Máy chủ trả phản hồi không phải JSON (HTTP " + response.status + "). " + detail);
  }
}

async function loadData() {
  byId("status").className = "status";
  byId("status").textContent = "Đang tải các bảng...";
  try {
    const response = await fetch("/api/admin/data");
    const result = await readResponse(response);
    if (!response.ok) throw new Error(result.detail || "Không tải được dữ liệu.");
    dataSet = result.tables;
    tableColumns = result.columns;
    const previous = activeTable;
    const select = byId("tableSelect");
    select.innerHTML = Object.keys(tableColumns).map((name) =>
      '<option value="' + escapeHtml(name) + '">' + escapeHtml(labels[name] || name) + "</option>",
    ).join("");
    activeTable = previous && dataSet[previous] ? previous : Object.keys(tableColumns)[0];
    select.value = activeTable;
    renderGrid();
    byId("status").className = "status ok";
    byId("status").textContent = "Đã nạp dữ liệu từ database. Thay đổi chưa được lưu sẽ mất nếu tải lại.";
    byId("issues").innerHTML = "";
  } catch (error) {
    byId("status").className = "status bad";
    byId("status").textContent = error.message;
  }
}

function renderGrid() {
  activeTable = byId("tableSelect").value;
  const cols = tableColumns[activeTable] || [];
  const rows = dataSet[activeTable] || [];
  let html = '<table class="edit-grid"><thead><tr>';
  for (const col of cols) html += "<th>" + escapeHtml(columns[col] || col) + "</th>";
  html += "<th>Thao tác</th></tr></thead><tbody>";
  rows.forEach((row, rowIndex) => {
    html += "<tr>";
    for (const col of cols) {
      const inputType = (col === "ngay_bat_dau" || col === "ngay") ? "date" : "text";
      html += '<td><input type="' + inputType + '" aria-label="' + escapeHtml(columns[col] || col) + '" data-row="' + rowIndex +
        '" data-column="' + escapeHtml(col) + '" value="' + escapeHtml(row[col] ?? "") + '"></td>';
    }
    html += '<td><button type="button" class="delete-row" data-delete-row="' + rowIndex + '">Xóa</button></td></tr>';
  });
  html += "</tbody></table>";
  if (!rows.length) html += '<p class="muted empty-grid">Bảng chưa có dòng dữ liệu. Bấm “Thêm dòng” để nhập.</p>';
  byId("gridWrap").innerHTML = html;
  byId("gridWrap").querySelectorAll("input[data-row]").forEach((input) => {
    input.addEventListener("input", () => {
      const row = Number(input.dataset.row);
      const column = input.dataset.column;
      dataSet[activeTable][row][column] = input.value;
    });
  });
  byId("gridWrap").querySelectorAll("[data-delete-row]").forEach((button) => {
    button.addEventListener("click", () => {
      captureVisibleInputs();
      dataSet[activeTable].splice(Number(button.dataset.deleteRow), 1);
      renderGrid();
    });
  });
}

function captureVisibleInputs() {
  byId("gridWrap").querySelectorAll("input[data-row]").forEach((input) => {
    dataSet[activeTable][Number(input.dataset.row)][input.dataset.column] = input.value;
  });
}

byId("tableSelect").addEventListener("change", () => {
  captureVisibleInputs();
  activeTable = byId("tableSelect").value;
  renderGrid();
});

byId("addRow").addEventListener("click", () => {
  captureVisibleInputs();
  const blank = {};
  for (const column of tableColumns[activeTable]) blank[column] = "";
  dataSet[activeTable].push(blank);
  renderGrid();
  const inputs = byId("gridWrap").querySelectorAll("tbody tr:last-child input");
  if (inputs.length) inputs[0].focus();
});

byId("reloadData").addEventListener("click", () => {
  if (window.confirm("Tải lại từ database và bỏ mọi thay đổi chưa lưu?")) loadData();
});

byId("saveData").addEventListener("click", async () => {
  captureVisibleInputs();
  byId("saveData").disabled = true;
  byId("status").className = "status";
  byId("status").textContent = "Đang kiểm tra và lưu toàn bộ bảng...";
  byId("issues").innerHTML = "";
  try {
    const response = await fetch("/api/admin/data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tables: dataSet }),
    });
    const result = await readResponse(response);
    if (!response.ok) {
      const detail = result.detail || {};
      if (detail.errors) {
        byId("status").className = "status bad";
        byId("status").textContent = detail.message || "Có lỗi dữ liệu. Chưa lưu thay đổi.";
        byId("issues").innerHTML = detail.errors.concat(detail.warnings || []).map((issue) => {
          const where = (sheetLabels[issue.sheet] || issue.sheet || "Dữ liệu") +
            (issue.row ? " · Dòng " + issue.row : "") +
            (issue.column ? " · Cột " + (columns[issue.column] || issue.column) : "");
          return '<article class="issue ' + (issue.severity === "error" ? "error" : "") + '">' +
            '<div class="issue-title">' + escapeHtml(issueTitles[issue.code] || "Cần kiểm tra dữ liệu") + "</div>" +
            '<p class="issue-detail">' + escapeHtml(issue.message) + "</p>" +
            '<div class="issue-location">Bảng: ' + escapeHtml(where) + "</div></article>";
        }).join("");
      } else {
        throw new Error(typeof detail === "string" ? detail : "Không thể lưu dữ liệu.");
      }
      return;
    }
    byId("status").className = result.warnings?.length ? "status warn" : "status ok";
    byId("status").textContent = result.message + (result.warnings?.length ? " Có " + result.warnings.length + " cảnh báo về tải tiết." : "");
    await loadData();
  } catch (error) {
    byId("status").className = "status bad";
    byId("status").textContent = error.message;
  } finally {
    byId("saveData").disabled = false;
  }
});

loadData();
