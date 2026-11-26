import { escapeHtml } from "./helpers.js";

function parsePeriods(value) {
  const text = value.trim();
  const periods = text === "" ? 0 : Number(text);
  return Number.isInteger(periods) && periods >= 0 && periods <= 40 ? periods : null;
}

function bindDemandSelection(wrap, classes) {
  const matrix = wrap.querySelector(".demand-matrix");
  const feedback = wrap.querySelector(".demand-feedback");
  const cells = Array.from(matrix.tBodies[0].rows, (row) => [...row.querySelectorAll(".demand-cell")]);
  const positions = new Map();
  cells.forEach((row, r) => row.forEach((cell, c) => positions.set(cell, [r, c])));
  let anchor;
  let extent;
  let dragging = false;

  function selectedRows() {
    if (!anchor || !extent) return [];
    const [top, bottom] = [anchor[0], extent[0]].sort((a, b) => a - b);
    const [left, right] = [anchor[1], extent[1]].sort((a, b) => a - b);
    return cells.slice(top, bottom + 1).map((row) => row.slice(left, right + 1));
  }

  function select(from, to = from) {
    anchor = from;
    extent = to;
    const selected = new Set(selectedRows().flat());
    for (const cell of positions.keys()) {
      cell.classList.toggle("demand-selected", selected.has(cell));
    }
  }

  function writeCell(cell, value) {
    cell.value = value || "";
    cell.dispatchEvent(new Event("input", { bubbles: true }));
  }

  matrix.addEventListener("focusin", (event) => {
    if (positions.has(event.target) && !dragging) select(positions.get(event.target));
  });
  matrix.addEventListener("pointerdown", (event) => {
    const point = positions.get(event.target);
    if (event.button !== 0 || !point) return;
    dragging = true;
    if (event.shiftKey && anchor) {
      event.preventDefault();
      select(anchor, point);
    } else {
      select(point);
    }
  });
  matrix.addEventListener("pointerover", (event) => {
    const point = positions.get(event.target);
    if (dragging && (event.buttons & 1) && point) select(anchor, point);
  });
  matrix.addEventListener("pointerup", () => { dragging = false; });
  matrix.addEventListener("pointerleave", () => { dragging = false; });

  matrix.addEventListener("keydown", (event) => {
    const point = positions.get(event.target);
    const direction = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key];
    if (!point || !event.shiftKey || !direction || event.isComposing) return;
    event.preventDefault();
    const [row, col] = extent || point;
    const next = [row + direction[0], col + direction[1]];
    if (cells[next[0]]?.[next[1]]) select(anchor || point, next);
  });
  matrix.addEventListener("click", (event) => {
    const heading = event.target.closest(".demand-class");
    if (!heading || !cells[0]?.length) return;
    const row = heading.closest("tr").sectionRowIndex;
    select([row, 0], [row, cells[row].length - 1]);
  });
  matrix.addEventListener("copy", (event) => {
    const rows = selectedRows();
    if (!rows.length || !event.clipboardData) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", rows.map((row) => row.map((cell) => cell.value).join("\t")).join("\n"));
    feedback.textContent = "Đã sao chép vùng ô.";
  });
  matrix.addEventListener("paste", (event) => {
    const point = positions.get(event.target);
    if (!point || !event.clipboardData?.types.includes("text/plain")) return;
    event.preventDefault();
    const [startRow, startCol] = point;
    const lines = event.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
    const values = lines.map((line) => line.split("\t").map(parsePeriods));
    if (values.some((row, r) => row.some((value, c) => value === null || !cells[startRow + r]?.[startCol + c]))) {
      feedback.textContent = "Không thể dán. Vùng dán phải nằm trong bảng và mỗi ô phải trống hoặc là số nguyên từ 0 đến 40.";
      return;
    }
    values.forEach((row, r) => row.forEach((value, c) => writeCell(cells[startRow + r][startCol + c], value)));
    select(point, [startRow + values.length - 1, startCol + Math.max(...values.map((row) => row.length)) - 1]);
    feedback.textContent = "Đã dán vùng ô. Bấm “Kiểm tra và lưu” để ghi thay đổi.";
  });

  const popup = document.createElement("div");
  popup.className = "demand-copy-menu";
  popup.setAttribute("popover", "auto");
  const action = document.createElement("button");
  action.type = "button";
  popup.append(action);
  wrap.append(popup);

  matrix.addEventListener("contextmenu", (event) => {
    const heading = event.target.closest(".demand-class");
    if (!heading) return;
    event.preventDefault();
    const row = heading.closest("tr").sectionRowIndex;
    const source = classes[row];
    const grade = String(source.khoi ?? "").trim();
    const targets = classes.map((candidate, index) =>
      index !== row && grade && String(candidate.khoi ?? "").trim() === grade ? index : -1,
    ).filter((index) => index >= 0);
    popup.hidePopover();
    action.textContent = "Sao chép phân môn cùng khối";
    action.disabled = !targets.length || !cells[row].length;
    let confirmed = false;
    action.onclick = () => {
      if (!confirmed) {
        confirmed = true;
        action.textContent = "Chắc chắn sao chép phân môn cùng khối?";
        return;
      }
      const values = cells[row].map((cell) => cell.validity.badInput ? null : parsePeriods(cell.value));
      popup.hidePopover();
      if (values.includes(null)) {
        feedback.textContent = "Hãy sửa số tiết không hợp lệ ở lớp " + source.ten_lop + " trước khi sao chép.";
        return;
      }
      targets.forEach((target) => values.forEach((value, col) => writeCell(cells[target][col], value)));
      feedback.textContent = "Đã sao chép phân môn của lớp " + source.ten_lop +
        " sang " + targets.length + " lớp cùng khối. Bấm “Kiểm tra và lưu” để ghi thay đổi.";
    };
    const bounds = heading.getBoundingClientRect();
    popup.style.left = Math.max(0, Math.min(event.clientX || bounds.left, innerWidth - 320)) + "px";
    popup.style.top = Math.max(0, Math.min(event.clientY || bounds.bottom, innerHeight - 56)) + "px";
    popup.showPopover();
    if (!action.disabled) action.focus();
  });
}

// Bỏ các dòng NhuCau trỏ tới lớp/môn không còn trong bảng cha.
export function pruneDemand(tables) {
  const ids = (table, col) => new Set((tables[table] || []).map((r) => String(r[col] || "").trim()).filter(Boolean));
  const classIds = ids("Lop", "lop_id");
  const subjectIds = ids("Mon", "mon_id");
  tables.NhuCau = (tables.NhuCau || []).filter((r) => classIds.has(r.lop_id) && subjectIds.has(r.mon_id));
}

export function renderDemandMatrix(wrap, tables) {
  pruneDemand(tables);
  const hasId = (value) => String(value || "").trim() !== "";
  const classes = (tables.Lop || []).filter((c) => hasId(c.lop_id)).sort((a, b) =>
    (Number(a.khoi) - Number(b.khoi)) || String(a.ten_lop).localeCompare(String(b.ten_lop), "vi", { numeric: true }));
  const subjects = (tables.Mon || []).filter((s) => hasId(s.mon_id));
  const unsaved = (tables.Lop || []).length - classes.length + (tables.Mon || []).length - subjects.length;

  const periods = new Map(tables.NhuCau.map((r) => [r.lop_id + "|" + r.mon_id, Number(r.so_tiet_tuan) || 0]));
  const classTotal = (classId) => tables.NhuCau.filter((r) => r.lop_id === classId)
    .reduce((sum, r) => sum + (Number(r.so_tiet_tuan) || 0), 0);

  let html = unsaved
    ? '<p class="muted empty-grid">Có ' + unsaved + ' lớp/môn mới chưa có mã nên chưa hiện ở đây. Hãy bấm “Kiểm tra và lưu” trước.</p>'
    : "";
  html += '<p class="muted matrix-note">Mỗi ô là số tiết/tuần. Kéo chuột để chọn vùng ô hoặc bấm tên lớp để chọn cả hàng, rồi dùng Ctrl+C và Ctrl+V. Bấm chuột phải vào tên lớp để sao chép cùng khối.</p>';
  html += '<table class="edit-grid demand-matrix"><thead><tr><th>Lớp</th>' +
    subjects.map((s) => "<th>" + escapeHtml(s.ten_mon) + "</th>").join("") + "<th>Tổng/tuần</th></tr></thead><tbody>";
  for (const c of classes) {
    html += '<tr><th scope="row"><button type="button" class="demand-class" title="Bấm để chọn hàng, bấm chuột phải để sao chép cùng khối">' +
      escapeHtml(c.ten_lop) + "</button></th>";
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

  html += '<p class="muted demand-feedback" role="status"></p>';
  wrap.innerHTML = html;
  bindDemandSelection(wrap, classes);

  wrap.oninput = (event) => {
    const input = event.target.closest(".demand-cell");
    if (!input) return;
    const n = input.validity.badInput ? null : parsePeriods(input.value);
    const valid = n !== null;
    input.classList.toggle("invalid", !valid);
    if (!valid) return;                          // giá trị sai: không ghi vào dữ liệu, chặn khi lưu
    const { classId, subjectId } = input.dataset;
    const rows = tables.NhuCau;
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
