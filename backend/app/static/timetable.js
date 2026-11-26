// Trang /timetable: chạy bộ giải và xem thời khóa biểu từng tuần của học kỳ.
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const listHtml = (items) => (items && items.length ? "<ul>" + items.map((i) => `<li>${esc(i)}</li>`).join("") + "</ul>" : "");
const vnDate = (iso) => iso.split("-").reverse().join("/");

let lessons = [];

function showWeek() {
  const week = Number($("weekSelect").value);
  const rows = lessons.filter((x) => x.week === week).map((x) =>
    `<tr><td>${vnDate(x.date)}</td><td>${esc(x.weekday)}</td><td>${esc(x.session)}</td><td>${x.period}</td>` +
    `<td>${esc(x.class)}</td><td>${esc(x.subject)}</td><td>${esc(x.teacher)}</td></tr>`).join("");
  $("lessons").innerHTML = '<table><thead><tr><th>Ngày</th><th>Thứ</th><th>Buổi</th><th>Tiết</th>' +
    `<th>Lớp</th><th>Môn</th><th>Giáo viên</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function solve() {
  const box = $("result");
  $("solve").disabled = true;
  box.className = "status";
  box.textContent = "Đang tìm lịch...";
  $("detail").hidden = true;
  try {
    const response = await fetch("/api/solve", { method: "POST" });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Có lỗi xảy ra");

    if (!data.lessons) {   // infeasible / timeout / error
      box.className = "status bad";
      box.innerHTML = esc(data.message) + listHtml(data.problems) + listHtml(data.warnings);
      return;
    }

    box.className = "status ok";
    box.innerHTML = `${esc(data.message)} Học kỳ “${esc(data.semester.name)}”: ${data.semester.weeks} tuần, ` +
      `tổng ${data.lessons.length} tiết (${esc(data.status)}).` + listHtml(data.warnings);

    $("loads").innerHTML = '<table><thead><tr><th>Giáo viên</th><th>Số tiết/tuần</th></tr></thead><tbody>' +
      data.teacher_loads.map((t) => `<tr><td>${esc(t.teacher)} (${esc(t.teacher_id)})</td><td>${t.periods}</td></tr>`).join("") +
      "</tbody></table>";

    lessons = data.lessons;
    $("weekSelect").innerHTML = data.weeks.map((w) =>
      `<option value="${w.week}">Tuần ${w.week}: ${vnDate(w.start)} – ${vnDate(w.end)} · ${w.lesson_count} tiết` +
      `${w.holidays.length ? " · nghỉ: " + esc(w.holidays.join(", ")) : ""}</option>`).join("");
    showWeek();
    $("detail").hidden = false;
  } catch (error) {
    box.className = "status bad";
    box.textContent = error.message;
  } finally {
    $("solve").disabled = false;
  }
}

$("weekSelect").onchange = showWeek;
$("solve").onclick = solve;