// Trang /timetable: chạy bộ giải và xem thời khóa biểu từng tuần của học kỳ.
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const listHtml = (items) => (items && items.length ? "<ul>" + items.map((i) => `<li>${esc(i)}</li>`).join("") + "</ul>" : "");
const vnDate = (iso) => iso.split("-").reverse().join("/");

const dayNames = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"];
const periodKey = ({ session, period }) => JSON.stringify([session, period]);
let schedule;
let currentGrid;

function populateEntities() {
  const byClass = $("viewSelect").value === "class";
  const entries = byClass ? Object.entries(schedule.classes) :
    schedule.teacher_loads.map(({ teacher_id, teacher }) => [teacher_id, teacher]);
  entries.sort((a, b) => a[1].localeCompare(b[1], "vi", { numeric: true }));
  $("entityLabel").textContent = byClass ? "Lớp" : "Giáo viên";
  $("entitySelect").replaceChildren(...entries.map(([id, name]) => new Option(
    byClass && id === name ? name : `${name} · ${id}`, id,
  )));
  showWeek();
}

function showGrid(week, lessons) {
  const view = $("viewSelect").value;
  const entity = $("entitySelect").selectedOptions[0];
  const selected = lessons.filter((lesson) => lesson[`${view}_id`] === entity?.value);
  const slots = schedule.slots.filter((slot) => slot.day !== null);
  const days = [...new Set(slots.map((slot) => slot.day))].sort((a, b) => a - b);
  const periods = [...new Map(slots.map((slot) => [periodKey(slot), slot])).values()]
    .sort((a, b) => a.session_order - b.session_order ||
      a.session.localeCompare(b.session, "vi") || a.period - b.period);
  const slotIds = new Map(slots.map((slot) => [`${slot.day}:${periodKey(slot)}`, slot.id]));
  const assigned = new Map(selected.map((lesson) => [lesson.slot_id, lesson]));
  const dates = days.map((day) => {
    const date = new Date(`${week.start}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + day);
    return date.toISOString().slice(0, 10);
  });
  const holidays = dates.map((date) => week.holidays.find((holiday) => holiday.startsWith(date)));
  const headings = ["Buổi / Tiết", ...days.map((day, i) =>
    `${dayNames[day]}\n${vnDate(dates[i])}${holidays[i] ? "\nNghỉ " + holidays[i].slice(12, -1) : ""}`)];
  const rows = periods.map((slot) => [
    `${slot.session} · Tiết ${slot.period}`,
    ...days.map((day, i) => {
      const id = slotIds.get(`${day}:${periodKey(slot)}`);
      if (id === undefined || holidays[i] || dates[i] < schedule.semester.start_date) return "—";
      const lesson = assigned.get(id);
      return lesson ? `${lesson.subject}\n${view === "class" ? lesson.teacher : lesson.class}` : "";
    }),
  ]);
  $("export").disabled = !entity || !days.length;
  $("weekSummary").textContent = entity ? `${entity.text} · ${selected.length} tiết trong tuần` : "Chưa có đối tượng để xem.";
  currentGrid = {
    title: `Thời khóa biểu ${view === "class" ? "lớp" : "giáo viên"} ${entity?.text ?? ""}`,
    subtitle: `${schedule.semester.name} · Tuần ${week.week} · ${vnDate(week.start)} – ${vnDate(week.end)}`,
    headings,
    rows,
  };
  $("weeklyGrid").innerHTML = entity && days.length ? `<table class="weekly-result">
    <thead><tr>${headings.map((label) => `<th scope="col">${esc(label)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(([label, ...cells]) => `<tr><th scope="row">${esc(label)}</th>
      ${cells.map((cell) => `<td class="${cell === "—" ? "unavailable" : cell ? "scheduled" : ""}">${esc(cell)}</td>`).join("")}
      </tr>`).join("")}</tbody></table>` : '<p class="empty-grid">Không có khung giờ để hiển thị.</p>';
}

function showWeek() {
  $("exportStatus").hidden = true;
  const week = schedule.weeks.find((item) => item.week === Number($("weekSelect").value));
  const lessons = schedule.lessons.filter((lesson) => lesson.week === week.week);
  showGrid(week, lessons);
  const rows = lessons.map((x) =>
    `<tr><td>${vnDate(x.date)}</td><td>${esc(x.weekday)}</td><td>${esc(x.session)}</td><td>${x.period}</td>` +
    `<td>${esc(x.class)}</td><td>${esc(x.subject)}</td><td>${esc(x.teacher)}</td></tr>`).join("");
  $("lessons").innerHTML = '<table><thead><tr><th>Ngày</th><th>Thứ</th><th>Buổi</th><th>Tiết</th>' +
    `<th>Lớp</th><th>Môn</th><th>Giáo viên</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function exportWeek() {
  const grid = currentGrid;
  const week = $("weekSelect").value;
  const button = $("export");
  const status = $("exportStatus");
  button.disabled = true;
  status.hidden = true;
  try {
    const response = await fetch("/api/timetable/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(grid),
    });
    if (!response.ok) throw new Error("Không tạo được file Excel. Hãy thử lại.");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = `${grid.title} - Tuần ${week}.xlsx`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    status.textContent = error.message;
    status.hidden = false;
  } finally {
    if (currentGrid === grid) button.disabled = false;
  }
}

const savedUrl = "/api/timetable/saved";
let hasSaved = false;
let unsaved = false;

function renderSchedule(data, message) {
  $("result").className = "status ok";
  $("result").innerHTML = `${esc(message)} Học kỳ “${esc(data.semester.name)}”: ${data.semester.weeks} tuần, ` +
    `tổng ${data.lessons.length} tiết (${esc(data.status)}).` + listHtml(data.warnings);

  $("loads").innerHTML = '<table><thead><tr><th>Giáo viên</th><th>Số tiết/tuần</th><th>Tiết trống</th></tr></thead><tbody>' +
    data.teacher_loads.map((t) => `<tr><td>${esc(t.teacher)} (${esc(t.teacher_id)})</td><td>${t.periods}</td><td>${t.gaps ?? "—"}</td></tr>`).join("") +
    "</tbody></table>";

  schedule = data;
  $("exportStatus").hidden = true;
  $("weekSelect").innerHTML = data.weeks.map((w) =>
    `<option value="${w.week}">Tuần ${w.week}: ${vnDate(w.start)} – ${vnDate(w.end)} · ${w.lesson_count} tiết` +
    `${w.holidays.length ? " · nghỉ: " + esc(w.holidays.join(", ")) : ""}</option>`).join("");
  populateEntities();
  $("detail").hidden = false;
}

function updateActions(busy = false) {
  $("solve").disabled = busy;
  $("loadSaved").disabled = busy || !hasSaved;
  $("saveSchedule").disabled = busy || !unsaved;
}

async function scheduleRequest(url, options, pending, onSuccess) {
  const box = $("result");
  updateActions(true);
  box.className = "status";
  box.textContent = pending;
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) {
      if (url === savedUrl && response.status === 404) hasSaved = false;
      throw new Error(typeof data.detail === "string" ? data.detail : "Có lỗi xảy ra.");
    }
    onSuccess(data);
  } catch (error) {
    box.className = "status bad";
    box.textContent = error.message;
  } finally {
    updateActions();
  }
}

function solve() {
  return scheduleRequest("/api/solve", { method: "POST" }, "Đang tìm lịch…", (data) => {
    if (!data.lessons) {
      $("result").className = "status bad";
      $("result").innerHTML = esc(data.message) + listHtml(data.problems) + listHtml(data.warnings);
      return;
    }
    renderSchedule(data, data.message + " Lời giải chưa lưu.");
    unsaved = true;
  });
}

function loadSaved() {
  return scheduleRequest(savedUrl, {}, "Đang tải lời giải…", (data) => {
    renderSchedule(data, "Đã tải thời khóa biểu đã lưu.");
    unsaved = false;
  });
}

function saveSchedule() {
  return scheduleRequest(savedUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(schedule),
  }, "Đang lưu thời khóa biểu…", () => {
    hasSaved = true;
    unsaved = false;
    $("result").className = "status ok";
    $("result").textContent = "Đã lưu thời khóa biểu. Thống kê trang chủ đã được cập nhật.";
  });
}

$("weekSelect").onchange = showWeek;
$("viewSelect").onchange = populateEntities;
$("entitySelect").onchange = showWeek;
$("export").onclick = exportWeek;
$("solve").onclick = solve;
$("loadSaved").onclick = loadSaved;
$("saveSchedule").onclick = saveSchedule;

updateActions(true);
fetch(savedUrl, { method: "HEAD" })
  .then((response) => { hasSaved = response.ok; })
  .catch(() => { $("result").textContent = "Không kiểm tra được thời khóa biểu đã lưu."; })
  .finally(() => updateActions());
