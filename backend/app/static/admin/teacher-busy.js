import { escapeHtml } from "./helpers.js";
import { LESSON, PPM, blockFromRow, busySlotKey, timeRange, timeTop } from "./time-slot-data.js";
import { renderWeeklyTimeline, timelineDays } from "./weekly-timeline.js";

export function renderTeacherBusy(wrap, tables, preferredTeacher = "", onChange = () => {}) {
  const teachers = (tables.GiaoVien || []).filter((row) => row.giao_vien_id);
  if (!teachers.length) {
    wrap.innerHTML = '<p class="status">Hãy thêm và lưu giáo viên trước khi đánh dấu giờ bận.</p>';
    return;
  }

  const slots = (tables.KhungGio || []).filter((row) => row.thu);
  const days = timelineDays(slots.map((row) => row.thu));
  const lessons = slots.filter((row) => row.loai_khung === LESSON);
  let teacherId = teachers.some((row) => row.giao_vien_id === preferredTeacher)
    ? preferredTeacher : teachers[0].giao_vien_id;

  const options = teachers.map((row) => `<option value="${escapeHtml(row.giao_vien_id)}">
    ${escapeHtml(row.ten_hien_thi || row.giao_vien_id)} (${escapeHtml(row.giao_vien_id)})</option>`).join("");

  function dayHeading(day) {
    const hasLessons = lessons.some((row) => row.thu === day);
    const sessions = ["Sáng", "Chiều"].filter((session) =>
      lessons.some((row) => row.thu === day && row.buoi === session));
    const sessionButtons = sessions.map((session) =>
      `<button type="button" class="secondary" data-busy-day="${escapeHtml(day)}"
        data-busy-session="${session}" aria-label="${escapeHtml(day)} · ${session}"
        aria-pressed="false">${session}</button>`).join("");
    return `<button type="button" class="busy-day" data-busy-day="${escapeHtml(day)}"
      aria-pressed="false"${hasLessons ? "" : " disabled"}><span>${escapeHtml(day)}</span>
  <small>${hasLessons ? "Bận cả ngày" : "Không có tiết dạy"}</small></button>
      <div class="busy-sessions">${sessionButtons}</div>`;
  }

  function headingSlots(button) {
    const { busyDay, busySession } = button.dataset;
    return lessons.filter((row) => row.thu === busyDay && (!busySession || row.buoi === busySession));
  }

  function daySlots(day) {
    return slots.filter((row) => row.thu === day).map((row) => {
      const block = blockFromRow(row, 0);
      const style = `top:${timeTop(block.start)}px;height:${block.dur * PPM}px`;
      const compact = block.dur < 25 ? " compact" : "";
      if (row.loai_khung !== LESSON) {
        return `<div class="ts-block busy-activity${compact}" style="${style}">
          <span class="ts-block-title">${escapeHtml(row.ghi_chu || "Truy bài")}</span>
          <small>${timeRange(block)}</small></div>`;
      }
      const label = `Tiết ${row.tiet_so} · ${timeRange(block)}`;
      return `<button type="button" class="ts-block busy-lesson${compact}" style="${style}"
        data-busy-key="${escapeHtml(busySlotKey(row))}"
        aria-label="${escapeHtml(day + " · " + label)}" aria-pressed="false">
        <span class="ts-block-title">Tiết ${escapeHtml(row.tiet_so)}</span>
        <small>${timeRange(block)}</small><span class="busy-mark" aria-hidden="true">X</span>
        </button>`;
    }).join("");
  }

  wrap.innerHTML = `
    <div class="ts-tools"><label>Giáo viên <select data-busy-teacher>${options}</select></label></div>
    <p class="muted matrix-note">Bấm tiết để đổi giữa có thể dạy (xanh) và không thể dạy (đỏ, dấu X).
      Bấm tên ngày để đánh dấu hoặc bỏ bận cả ngày. Lựa chọn áp dụng cho mọi tuần.</p>
    ${lessons.length ? `<div class="busy-timeline">${renderWeeklyTimeline(days, dayHeading, daySlots)}</div>`
      : '<p class="status">Chưa có tiết học. Hãy tạo tiết trong bảng Khung giờ học.</p>'}`;

  const picker = wrap.querySelector("[data-busy-teacher]");
  picker.value = teacherId;
  const board = wrap.querySelector(".ts-board");
  picker.onchange = () => {
    teacherId = picker.value;
    updateBoard();
    onChange(teacherId, false);
  };

  function busyKeys() {
    return new Set((tables.GV_Ban || []).filter((row) => row.giao_vien_id === teacherId).map(busySlotKey));
  }

  function updateBoard() {
    if (!board) return;
    const busy = busyKeys();
    for (const cell of board.querySelectorAll("[data-busy-key]")) {
      cell.setAttribute("aria-pressed", busy.has(cell.dataset.busyKey));
    }
    for (const button of board.querySelectorAll("[data-busy-day]:enabled")) {
      const allBusy = headingSlots(button)
        .every((row) => busy.has(busySlotKey(row)));
      button.setAttribute("aria-pressed", allBusy);
      if (!button.dataset.busySession) {
        button.querySelector("small").textContent = allBusy ? "Bỏ bận cả ngày" : "Bận cả ngày";
      }
    }
  }

  if (board) board.onclick = (event) => {
    const cell = event.target.closest("[data-busy-key]");
    const heading = event.target.closest("[data-busy-day]:enabled");
    if (!cell && !heading) return;
    const affected = cell ? lessons.filter((row) => busySlotKey(row) === cell.dataset.busyKey)
      : headingSlots(heading);
    const keys = new Set(affected.map(busySlotKey));
    const existing = busyKeys();
    const remove = [...keys].every((key) => existing.has(key));
    if (remove) {
      tables.GV_Ban = (tables.GV_Ban || []).filter((row) =>
        row.giao_vien_id !== teacherId || !keys.has(busySlotKey(row)));
    } else {
      tables.GV_Ban ||= [];
      for (const row of affected) {
        const key = busySlotKey(row);
        if (existing.has(key)) continue;
        tables.GV_Ban.push({
          giao_vien_id: teacherId, thu: row.thu, buoi: row.buoi,
          tiet_so: Number(row.tiet_so), ghi_chu: "Đánh dấu trên giao diện",
        });
        existing.add(key);
      }
    }
    updateBoard();
    onChange(teacherId, true);
  };

  updateBoard();
}
