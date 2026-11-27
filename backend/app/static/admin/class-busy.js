import { escapeHtml } from "./helpers.js";
import { LESSON, PPM, blockFromRow, busySlotKey, timeRange, timeTop } from "./time-slot-data.js";
import { renderWeeklyTimeline, timelineDays } from "./weekly-timeline.js";

export function pruneClassBusy(tables) {
  const classes = new Set(tables.Lop.map((row) => row.lop_id).filter(Boolean));
  const lessons = new Set(tables.KhungGio.filter((row) => row.loai_khung === LESSON).map(busySlotKey));
  tables.Lop_Ban = tables.Lop_Ban.filter((row) => classes.has(row.lop_id) && lessons.has(busySlotKey(row)));
}

export function renderClassBusy(wrap, tables, preferred, onChange) {
  const classes = tables.Lop.filter((row) => row.lop_id);
  const slots = tables.KhungGio.filter((row) => row.thu);
  const lessons = slots.filter((row) => row.loai_khung === LESSON);
  if (!classes.length || !lessons.length) {
    wrap.innerHTML = '<p class="status">Hãy lưu ít nhất một lớp và tạo tiết trong bảng Khung giờ học.</p>';
    return;
  }

  let classId = classes.some((row) => row.lop_id === preferred) ? preferred : classes[0].lop_id;
  const days = timelineDays(slots.map((row) => row.thu));
  const groups = [];
  function groupButton(label, rows, className = "", style = "", content = escapeHtml(label)) {
    const index = groups.push(rows) - 1;
    return `<button type="button" class="${className}" style="${style}" data-class-group="${index}"
      aria-label="${escapeHtml(label)}" aria-pressed="false"${rows.length ? "" : " disabled"}>${content}</button>`;
  }

  function dayHeading(day) {
    const rows = lessons.filter((row) => row.thu === day);
    const sessions = ["Sáng", "Chiều"].filter((session) => rows.some((row) => row.buoi === session));
    return groupButton(day + " · Cả ngày", rows, "busy-day", "",
      `<span>${escapeHtml(day)}</span> <small>Cả ngày</small>`) +
      '<div class="busy-sessions">' + sessions.map((session) => groupButton(day + " · " + session,
        rows.filter((row) => row.buoi === session), "secondary", "", escapeHtml(session))).join("") + "</div>";
  }

  function daySlots(day) {
    return slots.filter((row) => row.thu === day).map((row) => {
      const block = blockFromRow(row, 0);
      const label = day + " · " + row.buoi + " · Tiết " + row.tiet_so;
      const style = `top:${timeTop(block.start)}px;height:${block.dur * PPM}px`;
      if (row.loai_khung !== LESSON) {
        return `<div class="ts-block busy-activity${block.dur < 25 ? " compact" : ""}" style="${style}">
          <span class="ts-block-title">${escapeHtml(row.ghi_chu || "Truy bài")}</span>
          <small>${timeRange(block)}</small></div>`;
      }
      return groupButton(label, [row], "ts-block busy-lesson" + (block.dur < 25 ? " compact" : ""), style,
        `<span class="ts-block-title">Tiết ${escapeHtml(row.tiet_so)}</span>
         <small>${timeRange(block)}</small><span class="busy-mark" aria-hidden="true">X</span>`);
    }).join("");
  }

  wrap.innerHTML = `
    <div class="ts-tools">
      <label>Lớp <select data-blocked-class>${classes.map((row) =>
        `<option value="${escapeHtml(row.lop_id)}">${escapeHtml(row.ten_lop || row.lop_id)}</option>`).join("")}</select></label>
    </div>
    <p class="muted matrix-note">Bấm vào tiết, buổi hoặc ngày để chặn hoặc bỏ chặn hằng tuần. Dấu X đỏ là tiết lớp không thể học.</p>
    <div class="busy-timeline">${renderWeeklyTimeline(days, dayHeading, daySlots)}</div>`;
  const picker = wrap.querySelector("[data-blocked-class]");
  const controls = [...wrap.querySelectorAll("[data-class-group]:enabled")];
  picker.value = classId;

  function blockedKeys() {
    return new Set(tables.Lop_Ban.filter((row) => row.lop_id === classId).map(busySlotKey));
  }
  const fullyBlocked = (rows, keys) => rows.every((row) => keys.has(busySlotKey(row)));

  function update() {
    const keys = blockedKeys();
    for (const button of controls) {
      button.setAttribute("aria-pressed", fullyBlocked(groups[button.dataset.classGroup], keys));
    }
  }

  function toggle(rows) {
    const keys = blockedKeys();
    if (fullyBlocked(rows, keys)) {
      const affected = new Set(rows.map(busySlotKey));
      tables.Lop_Ban = tables.Lop_Ban.filter((row) => row.lop_id !== classId || !affected.has(busySlotKey(row)));
    } else {
      for (const row of rows) {
        const key = busySlotKey(row);
        if (keys.has(key)) continue;
        tables.Lop_Ban.push({ lop_id: classId, thu: row.thu, buoi: row.buoi, tiet_so: Number(row.tiet_so) });
        keys.add(key);
      }
    }
    update();
  }

  picker.onchange = () => {
    classId = picker.value;
    onChange(classId);
    update();
  };
  for (const button of controls) button.onclick = () => toggle(groups[button.dataset.classGroup]);
  update();
}
