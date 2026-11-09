// Trang /busy-overview: lịch bận của mọi giáo viên trong một tuần.
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fold = (t) => String(t ?? "").trim().toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");

const DAY_NAMES = { "thu hai": 0, "thu ba": 1, "thu tu": 2, "thu nam": 3, "thu sau": 4, "thu bay": 5, "chu nhat": 6, cn: 6,
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 };
function weekdayIndex(label) {
  const t = fold(label);
  if (t in DAY_NAMES) return DAY_NAMES[t];
  const m = t.match(/^(?:thu|t)\s*([2-7])$/);
  return m ? Number(m[1]) - 2 : null;
}
const sessionOrder = (s) => (/sang|morning/.test(fold(s)) ? 0 : /chieu|afternoon/.test(fold(s)) ? 1 : 2);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

let slots = [], weekStart, data = null;

async function request(url) {
  const r = await fetch(url);
  const body = await r.json();
  if (!r.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Có lỗi xảy ra");
  return body;
}

function render() {
  if (!data) return;
  const filter = fold($("filter").value);
  const dated = Object.fromEntries(Object.entries(data.dated_busy).map(([t, a]) => [t, new Set(a)]));
  const fixed = Object.fromEntries(Object.entries(data.recurring_busy).map(([t, a]) => [t, new Set(a)]));
  const holidays = new Set(data.holidays);

  // Chỉ những ngày có khung học mới có cột; mỗi ngày gồm các tiết xếp theo buổi, tiết.
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const daySlots = slots.filter((s) => weekdayIndex(s.thu) === i)
      .sort((a, b) => sessionOrder(a.buoi) - sessionOrder(b.buoi) || a.tiet_so - b.tiet_so);
    if (daySlots.length) days.push({ date, slots: daySlots });
  }

  let head1 = '<tr><th class="sticky" rowspan="2">Giáo viên</th>', head2 = "<tr>";
  for (const d of days) {
    const hol = holidays.has(iso(d.date));
    head1 += `<th class="day-sep ${hol ? "hol" : ""}" colspan="${d.slots.length}">${d.date.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" })}${hol ? " · nghỉ" : ""}</th>`;
    d.slots.forEach((s, i) => {
      head2 += `<th class="${i === 0 ? "day-sep" : ""}" title="${esc(s.buoi)} · tiết ${s.tiet_so}">${fold(s.buoi).startsWith("sang") ? "S" : "C"}${s.tiet_so}</th>`;
    });
  }
  head1 += '<th rowspan="2">Tổng bận</th></tr>'; head2 += "</tr>";

  let body = "", shown = 0;
  for (const t of data.teachers) {
    if (filter && !fold(t.name + " " + t.id).includes(filter)) continue;
    shown++;
    let total = 0, cells = "";
    for (const d of days) {
      const hol = holidays.has(iso(d.date));
      d.slots.forEach((s, i) => {
        const key = `${iso(d.date)}|${s.buoi}|${s.tiet_so}`;
        const isDated = dated[t.id]?.has(key), isFixed = fixed[t.id]?.has(key);
        const cls = isDated ? "busy" : isFixed ? "fixed" : hol ? "hol" : "free";
        if (isDated || isFixed) total++;
        cells += `<td class="ov-cell ${cls} ${i === 0 ? "day-sep" : ""}">${isDated || isFixed ? "X" : ""}</td>`;
      });
    }
    body += `<tr><th class="sticky">${esc(t.name)}<small>${esc(t.id)}</small></th>${cells}<td><b>${total}</b></td></tr>`;
  }
  $("overview").innerHTML = shown
    ? `<table class="ov-grid"><thead>${head1}${head2}</thead><tbody>${body}</tbody></table>`
    : '<p class="muted empty-grid">Không có giáo viên phù hợp.</p>';
}

async function load() {
  try {
    data = await request(`/api/availability/overview?week_start=${iso(weekStart)}`);
    $("range").textContent = `Tuần ${data.week_start} đến ${data.week_end} · ${data.teachers.length} giáo viên`;
    render();
  } catch (e) {
    $("overview").textContent = e.message;
  }
}

function setWeek(d) { weekStart = monday(d); $("week").value = iso(weekStart); return load(); }

$("week").onchange = () => { if ($("week").value) setWeek(new Date($("week").value + "T12:00:00")); };
$("prev").onclick = () => setWeek(addDays(weekStart, -7));
$("next").onclick = () => setWeek(addDays(weekStart, 7));
$("filter").oninput = render;

(async () => {
  try {
    const admin = await request("/api/admin/data");
    slots = admin.tables.KhungGio.filter((s) => s.loai_khung === "Tiết học").map((s) => ({ ...s, tiet_so: Number(s.tiet_so) }));
    await setWeek(new Date());
  } catch (e) {
    $("overview").textContent = e.message;
  }
})();