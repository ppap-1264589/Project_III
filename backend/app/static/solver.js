// Trang /solver: đánh dấu giờ bận theo ngày và chạy bộ giải.

const $ = (id) => document.getElementById(id);
const WEEKDAY_LABELS = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"];

let teachers = [];
let slots = [];          // các khung loại "Tiết học" khai báo trong Excel
let busy = new Set();    // khóa "YYYY-MM-DD|buổi|tiết"
let mode = "week";
let weekStart;           // Date, luôn là thứ Hai

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));

function fold(text) {
  return String(text ?? "").trim().toLowerCase().replace(/đ/g, "d")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

const DAY_NAMES = {
  "thu hai": 0, "thu ba": 1, "thu tu": 2, "thu nam": 3, "thu sau": 4, "thu bay": 5,
  "chu nhat": 6, "cn": 6,
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6,
};

function weekdayIndex(label) {
  const text = fold(label);
  if (text in DAY_NAMES) return DAY_NAMES[text];
  const match = text.match(/^(?:thu|t)\s*([2-7])$/);
  return match ? Number(match[1]) - 2 : null;
}

function sessionOrder(session) {
  if (/sang|morning/.test(fold(session))) return 0;
  if (/chieu|afternoon/.test(fold(session))) return 1;
  return 2;
}

function monday(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

function iso(d) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function weekDates() { return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)); }

// "07:00" + 45 phút -> "07:00–07:45"
function timeRange(start, minutes) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(start ?? ""));
  if (!m) return "";
  const total = Number(m[1]) * 60 + Number(m[2]) + Number(minutes || 0);
  const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  return `${fmt(Number(m[1]) * 60 + Number(m[2]))}–${fmt(total)}`;
}

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    const detail = data.detail;
    throw new Error(typeof detail === "string" ? detail : "Có lỗi xảy ra");
  }
  return data;
}

// Các khóa bận của mọi khung học có thật trong ngày d (rỗng với thứ Bảy/Chủ nhật nếu Excel không khai báo).
function dayKeys(d) {
  const dayIndex = (d.getDay() + 6) % 7;
  return slots.filter((s) => weekdayIndex(s.thu) === dayIndex)
    .map((s) => `${iso(d)}|${s.session}|${s.period_number}`);
}

// ---------- Vẽ lưới giờ bận ----------

function monthPickerHtml(selectedDates) {
  const first = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const dayCount = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const selected = new Set(selectedDates.map(iso));
  let html = '<div class="month-picker">';
  html += WEEKDAY_LABELS.map((label) => `<b>${label.slice(0, 2)}</b>`).join("");
  for (let i = 0; i < offset; i++) html += "<span></span>";
  for (let day = 1; day <= dayCount; day++) {
    const d = new Date(first.getFullYear(), first.getMonth(), day, 12);
    html += `<button class="month-day ${selected.has(iso(d)) ? "selected" : ""}" data-day="${iso(d)}">${day}</button>`;
  }
  return html + '</div><p class="muted">Chọn ngày trong tháng để mở tuần tương ứng.</p>';
}

function busyTableHtml(dates) {
  const rowMap = new Map();
  for (const s of slots) {
    const key = `${s.session}|${s.period_number}`;
    if (!rowMap.has(key)) rowMap.set(key, { session: s.session, period_number: s.period_number, time: timeRange(s.gio_bat_dau, s.thoi_luong_phut) });
  }
  const rows = [...rowMap.values()].sort((a, b) =>
    sessionOrder(a.session) - sessionOrder(b.session) || a.session.localeCompare(b.session, "vi") || a.period_number - b.period_number);

  let html = '<div class="grid-wrap"><table class="busy-grid"><thead><tr><th>Buổi · tiết</th>';
  html += dates.map((d) => {
    const label = d.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" });
    const keys = dayKeys(d);
    if (!keys.length) return `<th class="off-day">${label}</th>`;
    const all = keys.every((k) => busy.has(k));
    return `<th><button class="day-toggle ${all ? "all-busy" : ""}" data-day="${iso(d)}" ` +
      `title="${all ? "Bỏ đánh dấu bận cả ngày" : "Đánh dấu bận cả ngày"}">${label}` +
      `<small>${all ? "Bỏ bận cả ngày" : "Bận cả ngày"}</small></button></th>`;
  }).join("");
  html += "</tr></thead><tbody>";

  for (const row of rows) {
    html += `<tr><th>${esc(row.session)} · tiết ${row.period_number}<small>${esc(row.time)}</small></th>`;
    for (const d of dates) {
      const dayIndex = (d.getDay() + 6) % 7;
      const slot = slots.find((s) => s.session === row.session &&
        Number(s.period_number) === Number(row.period_number) && weekdayIndex(s.thu) === dayIndex);
      if (!slot) { html += '<td class="not-a-slot">—</td>'; continue; }
      const key = `${iso(d)}|${slot.session}|${slot.period_number}`;
      const isBusy = busy.has(key);
      html += `<td><button class="busy-cell ${isBusy ? "busy" : ""}" data-key="${key}" ` +
        `aria-label="${isBusy ? "Bận" : "Trống"}">${isBusy ? "X" : ""}</button></td>`;
    }
    html += "</tr>";
  }
  return html + "</tbody></table></div>";
}

function draw() {
  const dates = weekDates();
  $("calendar").innerHTML = (mode === "month" ? monthPickerHtml(dates) : "") + busyTableHtml(dates);

  document.querySelectorAll(".busy-cell").forEach((button) => {
    button.onclick = () => {
      const key = button.dataset.key;
      if (busy.has(key)) busy.delete(key); else busy.add(key);
      draw();
    };
  });

  // Bấm tên ngày: nếu chưa bận hết thì X cả ngày, nếu đã bận hết thì bỏ X cả ngày.
  document.querySelectorAll(".day-toggle").forEach((button) => {
    button.onclick = () => {
      const keys = dayKeys(new Date(button.dataset.day + "T12:00:00"));
      const all = keys.every((k) => busy.has(k));
      keys.forEach((k) => (all ? busy.delete(k) : busy.add(k)));
      draw();
    };
  });

  document.querySelectorAll(".month-day").forEach((button) => {
    button.onclick = async () => {
      weekStart = monday(new Date(button.dataset.day + "T12:00:00"));
      await loadBusy();
    };
  });
}

// ---------- Tải / lưu giờ bận ----------

async function loadBusy() {
  const teacherId = encodeURIComponent($("teacher").value);
  const data = await request(`/api/availability?teacher_id=${teacherId}&start=${iso(weekStart)}&end=${iso(addDays(weekStart, 6))}`);
  busy = new Set(data.busy);
  draw();
}

async function saveBusy() {
  try {
    await request("/api/availability", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teacher_id: $("teacher").value,
        start: iso(weekStart),
        end: iso(addDays(weekStart, 6)),
        busy: [...busy],
      }),
    });
    alert("Đã lưu giờ bận.");
  } catch (error) {
    alert(error.message);
  }
}

// ---------- Chạy bộ giải ----------

function scheduleTableHtml(schedule) {
  const rows = schedule.map((x) =>
    `<tr><td>${esc(x.weekday)}</td><td>${esc(x.session)}</td><td>${x.period}</td>` +
    `<td>${esc(x.class)}</td><td>${esc(x.subject)}</td><td>${esc(x.teacher)}</td></tr>`).join("");
  return '<div class="grid-wrap"><table><thead><tr><th>Thứ</th><th>Buổi</th><th>Tiết</th>' +
    `<th>Lớp</th><th>Môn</th><th>Giáo viên</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function loadsTableHtml(loads) {
  const rows = Object.entries(loads || {}).map(([id, n]) => `<tr><td>${esc(id)}</td><td>${n}</td></tr>`).join("");
  return rows
    ? '<h3>Tải tiết của giáo viên (do thuật toán phân)</h3><div class="grid-wrap"><table><thead><tr>' +
      `<th>Giáo viên</th><th>Số tiết/tuần</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : "";
}

function listHtml(items) {
  return items && items.length ? "<ul>" + items.map((p) => `<li>${esc(p)}</li>`).join("") + "</ul>" : "";
}

async function solve() {
  const box = $("result");
  box.className = "status";
  box.textContent = "Đang tìm lịch...";
  try {
    const data = await request("/api/solve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week_start: iso(weekStart) }),
    });
    if (!data.schedule) {
      box.className = "status bad";
      box.innerHTML = esc(data.message) + listHtml(data.problems) + listHtml(data.warnings);
      return;
    }
    box.className = "status ok";
    box.innerHTML = `Tìm được ${data.schedule.length} tiết (${esc(data.status)}).` +
      listHtml(data.warnings) + loadsTableHtml(data.stats && data.stats.teacher_loads) + scheduleTableHtml(data.schedule);
  } catch (error) {
    box.className = "status bad";
    box.textContent = error.message;
  }
}

// ---------- Sự kiện ----------

$("week").onchange = async () => {
  const value = $("week").value;
  if (!value) return;
  const chosen = $("week").type === "month" ? new Date(value + "-01T12:00:00") : new Date(value + "T12:00:00");
  weekStart = monday(chosen);
  $("week").value = $("week").type === "month" ? iso(weekStart).slice(0, 7) : iso(weekStart);
  await loadBusy();
};
$("teacher").onchange = loadBusy;
$("viewMode").onclick = () => {
  mode = mode === "week" ? "month" : "week";
  $("viewMode").textContent = mode === "week" ? "Xem theo tháng" : "Xem theo tuần";
  $("week").type = mode === "month" ? "month" : "date";
  $("week").value = mode === "month" ? iso(weekStart).slice(0, 7) : iso(weekStart);
  draw();
};
$("saveBusy").onclick = saveBusy;
$("solve").onclick = solve;

async function init() {
  const [teacherList, admin] = await Promise.all([request("/api/teachers"), request("/api/admin/data")]);
  slots = admin.tables.KhungGio
    .filter((s) => s.loai_khung === "Tiết học")
    .map((s) => ({ ...s, session: s.buoi, period_number: Number(s.tiet_so) }));
  teachers = teacherList;
  $("teacher").innerHTML = teachers.map((t) => `<option value="${esc(t.id)}">${esc(t.name)} (${esc(t.id)})</option>`).join("");
  weekStart = monday(new Date());
  $("week").value = iso(weekStart);
  await loadBusy();
}

init().catch((error) => { $("calendar").textContent = error.message; });