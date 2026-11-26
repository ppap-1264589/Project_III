import { escapeHtml } from "./helpers.js";

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
  const subjects = (tables.Mon || []).filter((s) => hasId(s.mon_id)).sort((a, b) =>
    String(a.ten_mon).localeCompare(String(b.ten_mon), "vi"));
  const unsaved = (tables.Lop || []).length - classes.length + (tables.Mon || []).length - subjects.length;

  const periods = new Map(tables.NhuCau.map((r) => [r.lop_id + "|" + r.mon_id, Number(r.so_tiet_tuan) || 0]));
  const classTotal = (classId) => tables.NhuCau.filter((r) => r.lop_id === classId)
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
