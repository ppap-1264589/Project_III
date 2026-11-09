let previewId = null;
const byId = (id) => document.getElementById(id);
async function readResponse(response) {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    const detail = body.trim().replace(/\s+/g, " ").slice(0, 180);
    throw new Error("Máy chủ trả phản hồi không phải JSON (HTTP " + response.status + "). " + detail);
  }
}
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

const issueTitles = {
  INVALID_WORKBOOK: "Không đọc được tệp Excel",
  MISSING_SHEETS: "Thiếu trang tính bắt buộc",
  INVALID_HEADERS: "Tên cột không đúng mẫu",
  REQUIRED_VALUE_MISSING: "Thiếu dữ liệu bắt buộc",
  DUPLICATE_PRIMARY_KEY: "Mã định danh bị trùng",
  UNKNOWN_CLASS: "Không tìm thấy lớp",
  UNKNOWN_SUBJECT: "Không tìm thấy môn học",
  UNKNOWN_TEACHER: "Không tìm thấy giáo viên",
  TEACHER_NOT_QUALIFIED: "Giáo viên chưa được khai báo dạy môn này",
  INVALID_PERIOD_COUNT: "Số tiết không hợp lệ",
  REFERENCE_ASSIGNMENT_MISMATCH: "Phân công tham khảo khác nhu cầu",
  INVALID_SLOT_TYPE_OR_NUMBER: "Loại khung giờ hoặc số tiết không hợp lệ",
  UNKNOWN_TIME_SLOT: "Khung giờ bận không khớp thời khóa biểu",
  REFERENCE_TEACHER_LOAD_BELOW_MIN: "Tải tiết trong phân công tham khảo còn thấp",
  SEMESTER_ROW_COUNT: "Cần một cấu hình học kỳ",
  INVALID_SEMESTER_START_DATE: "Ngày bắt đầu học kỳ chưa hợp lệ",
  INVALID_SEMESTER_WEEKS: "Số tuần học kỳ chưa hợp lệ",
  INVALID_HOLIDAY_DATE: "Ngày nghỉ chưa hợp lệ",
  HOLIDAY_OUTSIDE_SEMESTER: "Ngày nghỉ nằm ngoài học kỳ",
};
const sheetNames = {
  Lop: "Lớp", Mon: "Môn", GiaoVien: "Giáo viên", GV_Mon: "Chuyên môn giáo viên",
  NhuCau: "Nhu cầu tiết", PhanCong: "Phân công", KhungGio: "Khung giờ",
  GV_Ban: "Giờ giáo viên không thể dạy", HocKy: "Cấu hình học kỳ",
  NgayNghi: "Ngày nghỉ cố định", Workbook: "Toàn bộ tệp",
};

async function refreshData() {
  const responses = await Promise.all([fetch("/api/settings"), fetch("/api/data/summary"), fetch("/api/teachers")]);
  if (responses.some((response) => !response.ok)) return;
  const [settings, summary, teachers] = await Promise.all(responses.map((response) => response.json()));
  byId("minimum").value = settings.minimum_periods_per_teacher;
  byId("counts").innerHTML = Object.entries(summary.counts).map(([name, count]) =>
    '<div class="metric"><b>' + count + "</b><span>" + escapeHtml(name.replaceAll("_", " ")) + "</span></div>",
  ).join("");
  byId("calendarSummary").textContent = summary.semester
    ? summary.semester.name + " · " + summary.semester.start_date + " đến " + summary.semester.end_date +
      " · " + summary.semester.duration_weeks + " tuần · " + summary.holiday_count + " ngày nghỉ đã khai báo"
    : "Chưa có cấu hình học kỳ. Mở lưới nhập liệu để thêm một dòng cấu hình.";
  byId("teachers").innerHTML = teachers.length
    ? "<p class=\"muted\">Số tiết dưới đây lấy từ bảng Phân công tham khảo, chưa phải kết quả thuật toán.</p><table><thead><tr><th>Giáo viên</th><th>Tiết trong dữ liệu tham khảo</th></tr></thead><tbody>" +
      teachers.map((teacher) => "<tr><td>" + escapeHtml(teacher.id) + " · " + escapeHtml(teacher.name) +
        "</td><td>" + teacher.assigned_periods + "</td></tr>").join("") + "</tbody></table>"
    : '<p class="muted">Chưa có giáo viên trong cơ sở dữ liệu.</p>';
}

function renderIssue(issue) {
  const location = [
    "Sheet: " + (sheetNames[issue.sheet] || issue.sheet || "Không xác định"),
    issue.row ? "Dòng " + issue.row : "",
    issue.column ? "Cột " + issue.column : "",
  ].filter(Boolean).join(" · ");
  const title = issueTitles[issue.code] || "Cần kiểm tra dữ liệu";
  const kind = issue.severity === "error" ? "error" : "warning";
  return '<article class="issue ' + kind + '">' +
    '<div class="issue-title">' + escapeHtml(title) + "</div>" +
    '<p class="issue-detail">' + escapeHtml(issue.message) + "</p>" +
    '<div class="issue-location">' + escapeHtml(location) + "</div></article>";
}

byId("check").addEventListener("click", async () => {
  const file = byId("file").files[0];
  if (!file) {
    byId("result").className = "status bad";
    byId("result").textContent = "Hãy chọn workbook .xlsx trước.";
    return;
  }
  byId("check").disabled = true;
  byId("save").disabled = true;
  previewId = null;
  byId("issues").innerHTML = "";
  byId("result").className = "status";
  byId("result").textContent = "Đang kiểm tra dữ liệu...";
  try {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/input/preview", { method: "POST", body: form });
    const data = await readResponse(response);
    if (!response.ok) throw new Error(data.detail || "Không thể đọc file.");
    previewId = data.preview_id;
    const errors = data.errors || [];
    const warnings = data.warnings || [];
    byId("result").className = "status " + (errors.length ? "bad" : warnings.length ? "warn" : "ok");
    byId("result").textContent = errors.length
      ? "Có " + errors.length + " lỗi cần sửa trước khi lưu."
      : "Kiểm tra cấu trúc đạt. Có " + warnings.length + " cảnh báo. " +
        data.summary.classes + " lớp, " + data.summary.teachers + " giáo viên, " +
        data.summary.weekly_demand_periods + " tiết nhu cầu.";
    byId("issues").innerHTML = errors.concat(warnings).map(renderIssue).join("");
    byId("save").disabled = Boolean(errors.length) || !previewId;
  } catch (error) {
    byId("result").className = "status bad";
    byId("result").textContent = error.message;
  } finally {
    byId("check").disabled = false;
  }
});

byId("save").addEventListener("click", async () => {
  if (!previewId) return;
  if (!window.confirm("Thay toàn bộ dữ liệu hiện tại trong database bằng dữ liệu Excel vừa kiểm tra?")) return;
  byId("save").disabled = true;
  try {
    const response = await fetch("/api/input/confirm", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preview_id: previewId }),
    });
    const data = await readResponse(response);
    if (!response.ok) throw new Error(data.detail || "Không lưu được dữ liệu.");
    previewId = null;
    byId("result").className = "status ok";
    byId("result").textContent = data.message;
    byId("issues").innerHTML = "";
    await refreshData();
  } catch (error) {
    byId("result").className = "status bad";
    byId("result").textContent = error.message;
  }
});

byId("saveSetting").addEventListener("click", async () => {
  try {
    const response = await fetch("/api/settings", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minimum_periods_per_teacher: Number(byId("minimum").value) }),
    });
    const data = await readResponse(response);
    if (!response.ok) throw new Error(data.detail || "Mức phải từ 0 đến 40.");
    byId("settingMessage").textContent = "Đã lưu mức " + data.minimum_periods_per_teacher + " tiết/tuần.";
    await refreshData();
  } catch (error) {
    byId("settingMessage").textContent = error.message;
  }
});

refreshData();
