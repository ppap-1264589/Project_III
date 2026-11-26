import { columns } from "./labels.js";
import { escapeHtml } from "./helpers.js";

// Cột do hệ thống tự sinh: không hiện trong lưới, không cho nhập tay.
const hiddenColumns = {
  Lop: ["lop_id"],
  Mon: ["mon_id"],
};

const readonlyColumns = { GiaoVien: ["giao_vien_id"] };   // hiện nhưng không cho sửa
const isReadonly = (table, col) => (readonlyColumns[table] || []).includes(col);

const visibleColumns = (table, tableColumns) =>
  (tableColumns[table] || []).filter((col) => !(hiddenColumns[table] || []).includes(col));

export function editableColumns(table, tableColumns) {
  return visibleColumns(table, tableColumns).filter((col) => !isReadonly(table, col));
}

export function renderTableGrid(wrap, table, tableColumns, rows) {
  const cols = visibleColumns(table, tableColumns);
  let html = '<table class="edit-grid"><thead><tr>';
  for (const col of cols) html += "<th>" + escapeHtml(columns[col] || col) + "</th>";
  html += "<th>Thao tác</th></tr></thead><tbody>";
  rows.forEach((row, rowIndex) => {
    html += "<tr>";
    for (const col of cols) {
      const inputType = (col === "ngay_bat_dau" || col === "ngay") ? "date" : (col === "khoi" ? "number" : "text");
      const locked = isReadonly(table, col);
      html += '<td><input type="' + inputType + '" aria-label="' + escapeHtml(columns[col] || col) + '" data-row="' + rowIndex +
        '" data-column="' + escapeHtml(col) + '"' +
        (locked ? ' readonly tabindex="-1" placeholder="Tự sinh khi lưu"' : "") +
        ' value="' + escapeHtml(row[col] ?? "") + '"></td>';
    }
    html += '<td><button type="button" class="delete-row" data-delete-row="' + rowIndex + '">Xóa</button></td></tr>';
  });
  html += "</tbody></table>";
  if (!rows.length) html += '<p class="muted empty-grid">Bảng chưa có dòng dữ liệu. Bấm “Thêm dòng” để nhập.</p>';
  wrap.innerHTML = html;
  wrap.querySelectorAll("input[data-row]").forEach((input) => {
    input.addEventListener("input", () => {
      const row = Number(input.dataset.row);
      const column = input.dataset.column;
      rows[row][column] = input.value;
    });
  });
  wrap.querySelectorAll("[data-delete-row]").forEach((button) => {
    button.addEventListener("click", () => {
      captureVisibleInputs(wrap, rows);
      rows.splice(Number(button.dataset.deleteRow), 1);
      renderTableGrid(wrap, table, tableColumns, rows);
    });
  });
}

export function captureVisibleInputs(wrap, rows) {
  wrap.querySelectorAll("input[data-row]").forEach((input) => {
    rows[Number(input.dataset.row)][input.dataset.column] = input.value;
  });
}
export function focusCell(wrap, row, column) {
  const input = wrap.querySelector(
    'input[data-row="' + row + '"][data-column="' + column + '"]');
  if (input) { input.focus(); input.select?.(); }
}
