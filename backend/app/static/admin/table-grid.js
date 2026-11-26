import { columns } from "./labels.js";
import { escapeHtml } from "./helpers.js";

// Cột do hệ thống tự sinh: không hiện trong lưới, không cho nhập tay.
const hiddenColumns = {
  Lop: ["lop_id"],
  Mon: ["mon_id"],
  HocKy: ["hoc_ky_id"],
  NgayNghi: ["ngay_nghi_id"],
};

const readonlyColumns = { GiaoVien: ["giao_vien_id"] };   // hiện nhưng không cho sửa
const isReadonly = (table, col) => (readonlyColumns[table] || []).includes(col);

const visibleColumns = (table, tableColumns) =>
  (tableColumns[table] || []).filter((col) => !(hiddenColumns[table] || []).includes(col));

export function editableColumns(table, tableColumns) {
  return visibleColumns(table, tableColumns).filter((col) => !isReadonly(table, col));
}

function displaySemesterDate(value) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return iso ? iso[3] + "/" + iso[2] + "/" + iso[1].slice(-2) : value;
}

function readGridValue(input, previousValue) {
  if (!input.hasAttribute("data-semester-date")) return input.value;
  const value = input.value.trim();
  const date = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(value);
  if (!date) return value;

  const [, day, month, shortYear] = date;
  const previousYear = /^(\d{4})-/.exec(previousValue)?.[1];
  const year = previousYear?.endsWith(shortYear) ? previousYear : "20" + shortYear;
  return year + "-" + month + "-" + day;
}

export function renderTableGrid(wrap, table, tableColumns, rows) {
  const cols = visibleColumns(table, tableColumns);
  let html = '<table class="edit-grid"><thead><tr>';
  for (const col of cols) html += "<th>" + escapeHtml(columns[col] || col) + "</th>";
  html += "<th>Thao tác</th></tr></thead><tbody>";
  rows.forEach((row, rowIndex) => {
    html += "<tr>";
    for (const col of cols) {
      const semesterDate = col === "ngay_bat_dau" || col === "ngay";
      const inputType = col === "khoi" ? "number" : "text";
      const value = semesterDate ? displaySemesterDate(row[col] ?? "") : row[col];
      const locked = isReadonly(table, col);
      html += '<td><input type="' + inputType + '" aria-label="' + escapeHtml(columns[col] || col) + '" data-row="' + rowIndex +
        '" data-column="' + escapeHtml(col) + '"' +
        (locked ? ' readonly tabindex="-1" placeholder="Tự sinh khi lưu"' : "") +
        (semesterDate ? ' data-semester-date placeholder="dd/mm/yy"' : "") +
        ' value="' + escapeHtml(value ?? "") + '">';
      if (semesterDate) {
        html += '<span class="semester-calendar">' +
          '<button type="button" class="secondary" data-open-calendar>Mở lịch</button>' +
          '<input type="date" data-calendar tabindex="-1" aria-label="Chọn ' +
          escapeHtml(columns[col].toLowerCase()) + '">' +
          '</span>';
      }
      html += "</td>";
    }
    html += '<td><button type="button" class="delete-row" data-delete-row="' + rowIndex + '">Xóa</button></td></tr>';
  });
  html += "</tbody></table>";
  if (!rows.length) html += '<p class="muted empty-grid">Bảng chưa có dòng dữ liệu. Bấm “Thêm dòng” để nhập.</p>';
  wrap.innerHTML = html;
  wrap.querySelectorAll("[data-open-calendar]").forEach((button) => {
    const cell = button.closest("td");
    const input = cell.querySelector("[data-semester-date]");
    const calendar = cell.querySelector("[data-calendar]");
    const row = rows[Number(input.dataset.row)];
    const column = input.dataset.column;

    button.addEventListener("click", () => {
      calendar.value = readGridValue(input, row[column]);
      calendar.showPicker();
    });
    calendar.addEventListener("change", () => {
      row[column] = calendar.value;
      input.value = displaySemesterDate(calendar.value);
    });
  });
  wrap.querySelectorAll("input[data-row]").forEach((input) => {
    input.addEventListener("input", () => {
      const row = Number(input.dataset.row);
      const column = input.dataset.column;
      if (!input.hasAttribute("data-semester-date")) rows[row][column] = input.value;
    });
  });
  wrap.querySelectorAll("[data-delete-row]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!confirmDelete(button)) return;
      captureVisibleInputs(wrap, rows);
      rows.splice(Number(button.dataset.deleteRow), 1);
      renderTableGrid(wrap, table, tableColumns, rows);
    });
  });
}

export function confirmDelete(button) {
  const confirmLabel = "Chắc chắn xóa";
  if (button.textContent === confirmLabel) return true;

  const originalLabel = button.textContent;
  const accessibleLabel = button.getAttribute("aria-label");
  button.focus();
  button.textContent = confirmLabel;
  button.classList.add("is-confirming-delete");
  if (accessibleLabel !== null) button.setAttribute("aria-label", confirmLabel);
  button.addEventListener("blur", () => {
    button.textContent = originalLabel;
    button.classList.remove("is-confirming-delete");
    if (accessibleLabel !== null) button.setAttribute("aria-label", accessibleLabel);
  }, { once: true });
  return false;
}

export function captureVisibleInputs(wrap, rows) {
  wrap.querySelectorAll("input[data-row]").forEach((input) => {
    const row = rows[Number(input.dataset.row)];
    const column = input.dataset.column;
    row[column] = readGridValue(input, row[column]);
  });
}
export function focusCell(wrap, row, column) {
  const input = wrap.querySelector(
    'input[data-row="' + row + '"][data-column="' + column + '"]');
  if (input) { input.focus(); input.select?.(); }
}
