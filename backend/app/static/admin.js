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
// Cột do hệ thống tự sinh: không hiện trong lưới, không cho nhập tay.
const hiddenColumns = {
  Lop: ["lop_id"],
  Mon: ["mon_id"],
};

const readonlyColumns = { GiaoVien: ["giao_vien_id"] };   // hiện nhưng không cho sửa
const isReadonly = (table, col) => (readonlyColumns[table] || []).includes(col);
const editableColumns = (table) => visibleColumns(table).filter((col) => !isReadonly(table, col));

const visibleColumns = (table) =>
  (tableColumns[table] || []).filter((col) => !(hiddenColumns[table] || []).includes(col));
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
  const gridWrap = byId("gridWrap");
  gridWrap.onclick = gridWrap.onchange = gridWrap.oninput = gridWrap.onkeydown = null;
  byId("addRow").hidden = activeTable === "GV_Mon" || activeTable === "NhuCau";   // hai bảng này nhập bằng giao diện riêng
  if (activeTable === "GV_Mon") { renderTeacherSubjects(); return; }
  if (activeTable === "NhuCau") { renderDemandMatrix(); return; }
  const cols = visibleColumns(activeTable);
  const rows = dataSet[activeTable] || [];
  let html = '<table class="edit-grid"><thead><tr>';
  for (const col of cols) html += "<th>" + escapeHtml(columns[col] || col) + "</th>";
  html += "<th>Thao tác</th></tr></thead><tbody>";
  rows.forEach((row, rowIndex) => {
    html += "<tr>";
    for (const col of cols) {
      const inputType = (col === "ngay_bat_dau" || col === "ngay") ? "date" : (col === "khoi" ? "number" : "text");
      const locked = isReadonly(activeTable, col);
      html += '<td><input type="' + inputType + '" aria-label="' + escapeHtml(columns[col] || col) + '" data-row="' + rowIndex +
        '" data-column="' + escapeHtml(col) + '"' +
        (locked ? ' readonly tabindex="-1" placeholder="Tự sinh khi lưu"' : "") +
        ' value="' + escapeHtml(row[col] ?? "") + '"></td>';
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


// Bỏ các dòng GV_Mon trỏ tới giáo viên/môn không còn trong bảng cha.
function pruneTeacherSubjects() {
  const teacherIds = new Set((dataSet.GiaoVien || []).map((t) => String(t.giao_vien_id || "").trim()).filter(Boolean));
  const subjectIds = new Set((dataSet.Mon || []).map((s) => String(s.mon_id || "").trim()).filter(Boolean));
  dataSet.GV_Mon = (dataSet.GV_Mon || []).filter((r) => teacherIds.has(r.giao_vien_id) && subjectIds.has(r.mon_id));
}

function renderTeacherSubjects() {
  pruneTeacherSubjects();
  const hasId = (value) => String(value || "").trim() !== "";
  const teachers = (dataSet.GiaoVien || []).filter((t) => hasId(t.giao_vien_id));
  const subjects = (dataSet.Mon || []).filter((s) => hasId(s.mon_id));
  const nameOf = new Map(subjects.map((s) => [s.mon_id, s.ten_mon || s.mon_id]));
  const sortIds = (ids) => [...ids].sort((a, b) => String(nameOf.get(a)).localeCompare(String(nameOf.get(b)), "vi"));

  const unsaved = (dataSet.GiaoVien || []).length - teachers.length + (dataSet.Mon || []).length - subjects.length;
  let html = unsaved
    ? '<p class="muted empty-grid">Có ' + unsaved + ' giáo viên/môn mới chưa có mã nên chưa hiện ở đây. Hãy bấm “Kiểm tra và lưu” trước.</p>'
    : "";

  html += '<table class="edit-grid"><thead><tr><th>Giáo viên</th><th>Môn có thể dạy</th></tr></thead><tbody>';
  for (const t of teachers) {
    const mine = dataSet.GV_Mon.filter((r) => r.giao_vien_id === t.giao_vien_id).map((r) => r.mon_id);
    const rest = sortIds(subjects.map((s) => s.mon_id).filter((id) => !mine.includes(id)));
    html += "<tr><td>" + escapeHtml(t.giao_vien_id) + " - " + escapeHtml(t.ten_hien_thi) + "</td><td>";
    html += mine.length ? "" : '<span class="muted">Chưa có môn nào</span>';
    for (const id of sortIds(mine)) {
      html += '<div class="subject-line"><span>' + escapeHtml(nameOf.get(id)) + '</span>' +
        '<button type="button" class="delete-row" data-remove-subject="' + escapeHtml(t.giao_vien_id) +
        '" data-subject="' + escapeHtml(id) + '" aria-label="Bỏ môn">×</button></div>';
    }
    if (rest.length) {
      html += '<button type="button" class="secondary add-subject-btn" data-add-for="' + escapeHtml(t.giao_vien_id) + '">+</button>' +
        '<select class="subject-picker" data-teacher="' + escapeHtml(t.giao_vien_id) + '" hidden>' +
        '<option value="">Chọn môn...</option>' +
        rest.map((id) => '<option value="' + escapeHtml(id) + '">' + escapeHtml(nameOf.get(id)) + "</option>").join("") +
        "</select>";
    }
    html += "</td></tr>";
  }
  html += "</tbody></table>";
  if (!teachers.length) html += '<p class="muted empty-grid">Chưa có giáo viên nào. Hãy thêm và lưu ở bảng Giáo viên trước.</p>';

  const wrap = byId("gridWrap");
  wrap.innerHTML = html;
  wrap.onclick = (event) => {
    const remove = event.target.closest("[data-remove-subject]");
    if (remove) {
      dataSet.GV_Mon = dataSet.GV_Mon.filter((r) =>
        !(r.giao_vien_id === remove.dataset.removeSubject && r.mon_id === remove.dataset.subject));
      renderGrid();
      return;
    }
    const add = event.target.closest("[data-add-for]");
    if (add) {
      const picker = add.nextElementSibling;
      add.hidden = true;
      picker.hidden = false;
      picker.focus();
      try { picker.showPicker(); } catch { /* trình duyệt không hỗ trợ: người dùng bấm thêm một lần */ }
    }
  };
  wrap.onchange = (event) => {
    const picker = event.target.closest("select[data-teacher]");
    if (!picker || !picker.value) return;
    dataSet.GV_Mon.push({ giao_vien_id: picker.dataset.teacher, mon_id: picker.value });
    renderGrid();
  };
}

// Bỏ các dòng NhuCau trỏ tới lớp/môn không còn trong bảng cha.
function pruneDemand() {
  const ids = (table, col) => new Set((dataSet[table] || []).map((r) => String(r[col] || "").trim()).filter(Boolean));
  const classIds = ids("Lop", "lop_id");
  const subjectIds = ids("Mon", "mon_id");
  dataSet.NhuCau = (dataSet.NhuCau || []).filter((r) => classIds.has(r.lop_id) && subjectIds.has(r.mon_id));
}

function renderDemandMatrix() {
  pruneDemand();
  const hasId = (value) => String(value || "").trim() !== "";
  const classes = (dataSet.Lop || []).filter((c) => hasId(c.lop_id)).sort((a, b) =>
    (Number(a.khoi) - Number(b.khoi)) || String(a.ten_lop).localeCompare(String(b.ten_lop), "vi", { numeric: true }));
  const subjects = (dataSet.Mon || []).filter((s) => hasId(s.mon_id)).sort((a, b) =>
    String(a.ten_mon).localeCompare(String(b.ten_mon), "vi"));
  const unsaved = (dataSet.Lop || []).length - classes.length + (dataSet.Mon || []).length - subjects.length;

  const periods = new Map(dataSet.NhuCau.map((r) => [r.lop_id + "|" + r.mon_id, Number(r.so_tiet_tuan) || 0]));
  const classTotal = (classId) => dataSet.NhuCau.filter((r) => r.lop_id === classId)
    .reduce((sum, r) => sum + (Number(r.so_tiet_tuan) || 0), 0);

  let html = unsaved
    ? '<p class="muted empty-grid">Có ' + unsaved + ' lớp/môn mới chưa có mã nên chưa hiện ở đây. Hãy bấm “Kiểm tra và lưu” trước.</p>'
    : "";
  html += '<p class="muted matrix-note">Mỗi ô là số tiết/tuần của môn đó với lớp đó. Để trống hoặc 0 nếu lớp không học môn này.</p>';
  html += '<table class="edit-grid demand-matrix"><thead><tr><th>Lớp</th>' +
    subjects.map((s) => "<th>" + escapeHtml(s.ten_mon) + "</th>").join("") + "<th>Tổng/tuần</th></tr></thead><tbody>";
  for (const c of classes) {
    html += "<tr><th>" + escapeHtml(c.ten_lop) + "</th>";
    for (const s of subjects) {
      const value = periods.get(c.lop_id + "|" + s.mon_id) || "";
      html += '<td><input class="demand-cell" type="number" min="0" max="40" step="1" placeholder="0" value="' + value + '"' +
        ' data-class-id="' + escapeHtml(c.lop_id) + '" data-subject-id="' + escapeHtml(s.mon_id) +
        '" aria-label="' + escapeHtml(c.ten_lop + " - " + s.ten_mon) + '"></td>';
    }
    html += '<td class="total" data-total-for="' + escapeHtml(c.lop_id) + '">' + classTotal(c.lop_id) + "</td></tr>";
  }
  html += "</tbody></table>";
  if (!classes.length || !subjects.length) {
    html += '<p class="muted empty-grid">Cần có ít nhất một lớp và một môn (đã lưu) để nhập nhu cầu.</p>';
  }

  const wrap = byId("gridWrap");
  wrap.innerHTML = html;

  wrap.oninput = (event) => {
    const input = event.target.closest(".demand-cell");
    if (!input) return;
    const raw = input.value.trim();
    const n = raw === "" ? 0 : Number(raw);
    const valid = Number.isInteger(n) && n >= 0 && n <= 40;
    input.classList.toggle("invalid", !valid);
    if (!valid) return;                          // giá trị sai: không ghi vào dữ liệu, chặn khi lưu
    const { classId, subjectId } = input.dataset;
    const rows = dataSet.NhuCau;
    const index = rows.findIndex((r) => r.lop_id === classId && r.mon_id === subjectId);
    if (n === 0) { if (index >= 0) rows.splice(index, 1); }
    else if (index >= 0) rows[index].so_tiet_tuan = n;
    else rows.push({ lop_id: classId, mon_id: subjectId, so_tiet_tuan: n });
    const total = wrap.querySelector('[data-total-for="' + CSS.escape(classId) + '"]');
    if (total) total.textContent = classTotal(classId);
  };

  wrap.onkeydown = (event) => {                  // Enter: xuống ô cùng cột ở lớp kế tiếp
    if (event.key !== "Enter" || event.isComposing) return;
    const input = event.target.closest(".demand-cell");
    if (!input) return;
    event.preventDefault();
    const next = input.closest("tr").nextElementSibling
      ?.querySelector('input[data-subject-id="' + CSS.escape(input.dataset.subjectId) + '"]');
    if (next) { next.focus(); next.select(); }
  };
}

byId("tableSelect").addEventListener("change", () => {
  captureVisibleInputs();
  activeTable = byId("tableSelect").value;
  renderGrid();
});

byId("gridWrap").addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.isComposing) return;   // isComposing: không chặn Enter khi đang gõ Telex/VNI
  const input = event.target.closest("input[data-row]");
  if (!input) return;
  event.preventDefault();

  const rows = dataSet[activeTable];
  const row = Number(input.dataset.row);

  if (row < rows.length - 1) {                 // còn dòng dưới: xuống cùng cột
    focusCell(row + 1, input.dataset.column);
    return;
  }
  captureVisibleInputs();                      // đang ở dòng cuối

  const cols = editableColumns(activeTable);
  const lastIsBlank = cols.every((c) => String(rows[row][c] ?? "").trim() === "");
  if (lastIsBlank) return;
  addBlankRow();
  focusCell(rows.length - 1, cols[0]);
});

function addBlankRow() {
  captureVisibleInputs();
  const blank = {};
  for (const column of tableColumns[activeTable]) blank[column] = "";
  dataSet[activeTable].push(blank);
  renderGrid();
}

function focusCell(row, column) {
  const input = byId("gridWrap").querySelector(
    'input[data-row="' + row + '"][data-column="' + column + '"]');
  if (input) { input.focus(); input.select?.(); }
}

byId("addRow").addEventListener("click", () => {
  addBlankRow();
  // handler nút "Thêm dòng"
  focusCell(dataSet[activeTable].length - 1, editableColumns(activeTable)[0]);
});

byId("reloadData").addEventListener("click", () => {
  if (window.confirm("Tải lại từ database và bỏ mọi thay đổi chưa lưu?")) loadData();
});

byId("saveData").addEventListener("click", async () => {
  captureVisibleInputs();
  pruneTeacherSubjects();
  pruneDemand();
  if (document.querySelector(".demand-cell.invalid")) {
    byId("status").className = "status bad";
    byId("status").textContent = "Có ô nhu cầu không hợp lệ (cần số nguyên từ 0 đến 40). Hãy sửa các ô viền đỏ.";
    return;
  }
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


let clearTimer = null;
function disarmClear() {
  clearTimeout(clearTimer);
  clearTimer = null;
  byId("clearData").textContent = "Xóa toàn bộ dữ liệu";
}

byId("clearData").addEventListener("click", async () => {
  const button = byId("clearData");
  if (!clearTimer) {   // lần bấm 1: chỉ cảnh báo
    button.textContent = "Bấm lần nữa để XÓA TOÀN BỘ";
    byId("status").className = "status warn";
    byId("status").textContent = "Sắp xóa toàn bộ dữ liệu (lớp, môn, giáo viên, nhu cầu, khung giờ, giờ bận, học kỳ, ngày nghỉ). Không thể khôi phục. Bấm lại nút đỏ trong 5 giây để xác nhận.";
    clearTimer = setTimeout(() => {
      disarmClear();
      byId("status").className = "status";
      byId("status").textContent = "Đã hủy xóa dữ liệu.";
    }, 5000);
    return;
  }
  disarmClear();       // lần bấm 2: xóa thật
  button.disabled = true;
  byId("issues").innerHTML = "";
  try {
    const response = await fetch("/api/admin/data", { method: "DELETE" });
    const result = await readResponse(response);
    if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Không thể xóa dữ liệu.");
    await loadData();
    byId("status").className = "status ok";
    byId("status").textContent = result.message + " Các bảng hiện đang trống.";
  } catch (error) {
    byId("status").className = "status bad";
    byId("status").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

loadData();
