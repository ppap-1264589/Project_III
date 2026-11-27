import { byId, escapeHtml, readResponse } from "./admin/helpers.js";
import { columns, issueTitles, labels, sheetLabels } from "./admin/labels.js?v=class-busy";
import { captureVisibleInputs, confirmDelete, editableColumns, focusCell, renderTableGrid } from "./admin/table-grid.js?v=delete-layout";
import { pruneTeacherSubjects, renderTeacherSubjects } from "./admin/teacher-subjects.js?v=delete-layout";
import { pruneDemand, renderDemandMatrix } from "./admin/demand-matrix.js?v=copy-demand";
import { pruneBusy, renderTimeSlots } from "./admin/time-slots.js";
import { renderTeacherBusy } from "./admin/teacher-busy.js?v=day-sessions";
import { pruneClassBusy, renderClassBusy } from "./admin/class-busy.js?v=class-activities";

const gridWrap = byId("gridWrap");

let dataSet = {};
let tableColumns = {};
let activeTable = null;
let busyTeacher = "";
let busyClass = "";

async function loadData(successMessage = "Đã tải lại dữ liệu từ database") {
  byId("status").className = "status";
  byId("status").textContent = "Đang tải các bảng...";
  try {
    const response = await fetch("/api/admin/data");
    const result = await readResponse(response);
    if (!response.ok) throw new Error(result.detail || "Không tải được dữ liệu.");
    dataSet = result.tables;
    tableColumns = result.columns;
    const previous = activeTable ?? sessionStorage.getItem("admin.activeTable");
    const select = byId("tableSelect");
    const visibleTables = Object.keys(tableColumns).filter((name) => name !== "PhanCong");
    select.innerHTML = visibleTables.map((name) =>
      '<option value="' + escapeHtml(name) + '">' + escapeHtml(labels[name] || name) + "</option>",
    ).join("");
    activeTable = visibleTables.includes(previous) ? previous : visibleTables[0];
    select.value = activeTable;
    renderGrid();
    byId("status").className = "status ok";
    byId("status").textContent = successMessage;
    byId("issues").innerHTML = "";
  } catch (error) {
    byId("status").className = "status bad";
    byId("status").textContent = error.message;
  }
}

function renderGrid() {
  activeTable = byId("tableSelect").value;
  gridWrap.onclick = gridWrap.onchange = gridWrap.oninput = gridWrap.onkeydown = gridWrap.onpointerdown = null;
  byId("addRow").hidden = ["GV_Mon", "NhuCau", "KhungGio", "GV_Ban", "Lop_Ban"].includes(activeTable);
  if (activeTable === "GV_Mon") {
    renderTeacherSubjects(gridWrap, dataSet);
  } else if (activeTable === "NhuCau") {
    renderDemandMatrix(gridWrap, dataSet);
  } else if (activeTable === "KhungGio") {
    renderTimeSlots(gridWrap, dataSet);
  } else if (activeTable === "GV_Ban") {
    renderTeacherBusy(gridWrap, dataSet, busyTeacher, (teacherId) => { busyTeacher = teacherId; });
  } else if (activeTable === "Lop_Ban") {
    renderClassBusy(gridWrap, dataSet, busyClass, (classId) => { busyClass = classId; });
  } else {
    renderTableGrid(gridWrap, activeTable, tableColumns, dataSet[activeTable] || []);
  }
}

byId("tableSelect").addEventListener("change", () => {
  sessionStorage.setItem("admin.activeTable", byId("tableSelect").value);
  captureVisibleInputs(gridWrap, dataSet[activeTable]);
  renderGrid();
});

gridWrap.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.isComposing) return;   // isComposing: không chặn Enter khi đang gõ Telex/VNI
  const input = event.target.closest("input[data-row]");
  if (!input) return;
  event.preventDefault();

  const rows = dataSet[activeTable];
  const row = Number(input.dataset.row);

  if (row < rows.length - 1) {                 // còn dòng dưới: xuống cùng cột
    focusCell(gridWrap, row + 1, input.dataset.column);
    return;
  }
  captureVisibleInputs(gridWrap, dataSet[activeTable]);                      // đang ở dòng cuối

  const cols = editableColumns(activeTable, tableColumns);
  const lastIsBlank = cols.every((c) => String(rows[row][c] ?? "").trim() === "");
  if (lastIsBlank) return;
  addBlankRow();
  focusCell(gridWrap, rows.length - 1, cols[0]);
});

function addBlankRow() {
  captureVisibleInputs(gridWrap, dataSet[activeTable]);
  const blank = {};
  for (const column of tableColumns[activeTable]) blank[column] = "";
  dataSet[activeTable].push(blank);
  renderGrid();
}

byId("addRow").addEventListener("click", () => {
  addBlankRow();
  focusCell(gridWrap, dataSet[activeTable].length - 1, editableColumns(activeTable, tableColumns)[0]);
});

byId("reloadData").addEventListener("click", () => {
  if (window.confirm("Tải lại từ database và bỏ mọi thay đổi chưa lưu?")) loadData();
});

byId("clearTable").addEventListener("click", (event) => {
  if (!dataSet[activeTable]?.length || !confirmDelete(event.currentTarget)) return;
  event.currentTarget.blur();
  dataSet[activeTable] = [];
  renderGrid();
  byId("issues").innerHTML = "";
  byId("status").className = "status warn";
  byId("status").textContent =
    "Đã xóa dữ liệu trên lưới của bảng “" + (labels[activeTable] || activeTable) +
    "”. Bấm “Kiểm tra và lưu” để ghi thay đổi vào cơ sở dữ liệu.";
});

function withGeneratedIds(rows, column, prefix) {
  return rows.map((row) => {
    if (row[column] || !Object.values(row).some((value) => String(value ?? "").trim())) return row;
    return { ...row, [column]: prefix + "-" + crypto.randomUUID() };
  });
}

byId("saveData").addEventListener("click", async () => {
  captureVisibleInputs(gridWrap, dataSet[activeTable]);
  pruneTeacherSubjects(dataSet);
  pruneDemand(dataSet);
  const removedBusy = pruneBusy(dataSet);
  pruneClassBusy(dataSet);
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
      body: JSON.stringify({ tables: {
        ...dataSet,
        HocKy: withGeneratedIds(dataSet.HocKy, "hoc_ky_id", "HK"),
        NgayNghi: withGeneratedIds(dataSet.NgayNghi, "ngay_nghi_id", "NN"),
      } }),
    });
    const result = await readResponse(response);
    if (!response.ok) {
      const detail = result.detail || {};
      if (detail.errors) {
        byId("status").className = "status bad";
        byId("status").textContent = detail.message || "Có lỗi dữ liệu. Chưa lưu thay đổi.";
        byId("issues").innerHTML = detail.errors.concat(detail.warnings || []).map((issue) => {
          const where = (sheetLabels[issue.sheet] || issue.sheet || "Dữ liệu") +
            (issue.row > 4 ? " · Dòng " + (issue.row - 4) : "") +
            (issue.column ? " · Cột " + (columns[issue.column] || issue.column) : "");
          return '<article class="issue ' + (issue.severity === "error" ? "error" : "") + '">' +
            '<div class="issue-title">' + escapeHtml(issueTitles[issue.code] || "Cần kiểm tra dữ liệu") + "</div>" +
            '<p class="issue-detail">' + escapeHtml(issue.message +
              (issue.code === "INVALID_HOLIDAY_DATE" ? " Bấm “Mở lịch” hoặc nhập ngày theo dd/mm/yy, ví dụ 08/09/26." : "")) + "</p>" +
            '<div class="issue-location">Bảng: ' + escapeHtml(where) + "</div></article>";
        }).join("");
      } else {
        throw new Error(typeof detail === "string" ? detail : "Không thể lưu dữ liệu.");
      }
      return;
    }
    byId("status").className = result.warnings?.length ? "status warn" : "status ok";
    byId("status").textContent = result.message + (result.warnings?.length ? " Có " + result.warnings.length + " cảnh báo về tải tiết." : "");
    await loadData("Đã kiểm tra và lưu thành công dữ liệu vào database");
    if (removedBusy) {
      byId("status").className = "status warn";
      byId("status").textContent = result.message + " Đã bỏ " + removedBusy + " giờ bận không còn khớp khung giờ mới.";
    }
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

byId("destructiveActions").addEventListener("toggle", (event) => {
  if (!event.currentTarget.open && clearTimer) {
    disarmClear();
    byId("status").className = "status";
    byId("status").textContent = "Đã hủy xóa toàn bộ dữ liệu.";
  }
});

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
