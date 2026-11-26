import { escapeHtml } from "./helpers.js";

// Bỏ các dòng GV_Mon trỏ tới giáo viên/môn không còn trong bảng cha.
export function pruneTeacherSubjects(tables) {
  const teacherIds = new Set((tables.GiaoVien || []).map((t) => String(t.giao_vien_id || "").trim()).filter(Boolean));
  const subjectIds = new Set((tables.Mon || []).map((s) => String(s.mon_id || "").trim()).filter(Boolean));
  tables.GV_Mon = (tables.GV_Mon || []).filter((r) => teacherIds.has(r.giao_vien_id) && subjectIds.has(r.mon_id));
}

export function renderTeacherSubjects(wrap, tables) {
  pruneTeacherSubjects(tables);
  const hasId = (value) => String(value || "").trim() !== "";
  const teachers = (tables.GiaoVien || []).filter((t) => hasId(t.giao_vien_id));
  const subjects = (tables.Mon || []).filter((s) => hasId(s.mon_id));
  const nameOf = new Map(subjects.map((s) => [s.mon_id, s.ten_mon || s.mon_id]));
  const sortIds = (ids) => [...ids].sort((a, b) => String(nameOf.get(a)).localeCompare(String(nameOf.get(b)), "vi"));

  const unsaved = (tables.GiaoVien || []).length - teachers.length + (tables.Mon || []).length - subjects.length;
  let html = unsaved
    ? '<p class="muted empty-grid">Có ' + unsaved + ' giáo viên/môn mới chưa có mã nên chưa hiện ở đây. Hãy bấm “Kiểm tra và lưu” trước.</p>'
    : "";

  html += '<table class="edit-grid"><thead><tr><th>Giáo viên</th><th>Môn có thể dạy</th></tr></thead><tbody>';
  for (const t of teachers) {
    const mine = tables.GV_Mon.filter((r) => r.giao_vien_id === t.giao_vien_id).map((r) => r.mon_id);
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

  wrap.innerHTML = html;
  wrap.onclick = (event) => {
    const remove = event.target.closest("[data-remove-subject]");
    if (remove) {
      tables.GV_Mon = tables.GV_Mon.filter((r) =>
        !(r.giao_vien_id === remove.dataset.removeSubject && r.mon_id === remove.dataset.subject));
      renderTeacherSubjects(wrap, tables);
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
    tables.GV_Mon.push({ giao_vien_id: picker.dataset.teacher, mon_id: picker.value });
    renderTeacherSubjects(wrap, tables);
  };
}
