// Trang /busy: đánh dấu giờ bận hằng tuần của một giáo viên (áp dụng mọi tuần).
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let slots = [];            // các khung "Tiết học" (từ /api/slots)
let busy = new Set();      // các khóa "Thứ Hai|Sáng|1" đang được đánh dấu
let dirty = false;         // đã sửa nhưng chưa lưu?
let currentTeacher = "";

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Có lỗi xảy ra");
  return data;
}

function showMessage(text, kind = "") {
  $("message").className = "status " + kind;
  $("message").textContent = text;
}

const keysOfDay = (day) => slots.filter((s) => s.weekday === day).map((s) => s.key);

function draw() {
  const days = [...new Set(slots.map((s) => s.weekday))];                 // các cột
  const slotKeys = new Set(slots.map((s) => s.key));
  const rowMap = new Map();                                                // các dòng: buổi + tiết
  for (const s of slots) rowMap.set(`${s.session}|${s.period}`, s);
  const rows = [...rowMap.values()].sort((a, b) => a.order - b.order);

  let html = '<div class="grid-wrap"><table class="busy-grid"><thead><tr><th>Buổi · tiết</th>';
  for (const day of days) {
    const all = keysOfDay(day).every((k) => busy.has(k));
    html += `<th><button class="day-toggle ${all ? "all-busy" : ""}" data-day="${esc(day)}">${esc(day)}` +
            `<small>${all ? "Bỏ bận cả ngày" : "Bận cả ngày"}</small></button></th>`;
  }
  html += "</tr></thead><tbody>";

  for (const row of rows) {
    html += `<tr><th>${esc(row.session)} · tiết ${row.period}<small>${esc(row.time)}</small></th>`;
    for (const day of days) {
      const key = `${day}|${row.session}|${row.period}`;
      if (!slotKeys.has(key)) { html += '<td class="not-a-slot">—</td>'; continue; }
      const isBusy = busy.has(key);
      html += `<td><button class="busy-cell ${isBusy ? "busy" : ""}" data-key="${esc(key)}">${isBusy ? "X" : ""}</button></td>`;
    }
    html += "</tr>";
  }
  $("calendar").innerHTML = html + "</tbody></table></div>";
}

// Bấm vào ô hoặc tên thứ (một handler cho cả bảng)
$("calendar").onclick = (event) => {
  const cell = event.target.closest(".busy-cell");
  const dayButton = event.target.closest(".day-toggle");
  if (cell) {
    const key = cell.dataset.key;
    busy.has(key) ? busy.delete(key) : busy.add(key);
  } else if (dayButton) {
    const keys = keysOfDay(dayButton.dataset.day);
    const all = keys.every((k) => busy.has(k));
    keys.forEach((k) => (all ? busy.delete(k) : busy.add(k)));
  } else {
    return;
  }
  dirty = true;
  showMessage("Có thay đổi chưa lưu.", "warn");
  draw();
};

async function loadBusy() {
  currentTeacher = $("teacher").value;
  const data = await request(`/api/busy/${encodeURIComponent(currentTeacher)}`);
  busy = new Set(data.busy);
  dirty = false;
  showMessage("Đã tải giờ bận từ database.");
  draw();
}

$("teacher").onchange = async () => {
  if (dirty && !confirm("Bỏ các thay đổi chưa lưu của giáo viên hiện tại?")) {
    $("teacher").value = currentTeacher;
    return;
  }
  await loadBusy();
};

$("save").onclick = async () => {
  try {
    await request(`/api/busy/${encodeURIComponent(currentTeacher)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ busy: [...busy] }),
    });
    dirty = false;
    showMessage("Đã lưu giờ bận.", "ok");
  } catch (error) {
    showMessage(error.message, "bad");
  }
};

(async () => {
  try {
    const [slotList, teachers] = await Promise.all([request("/api/slots"), request("/api/teachers")]);
    slots = slotList;
    $("teacher").innerHTML = teachers.map((t) => `<option value="${esc(t.id)}">${esc(t.name)} (${esc(t.id)})</option>`).join("");
    if (teachers.length) await loadBusy();
    else showMessage("Chưa có giáo viên. Hãy nhập dữ liệu Excel trước.", "bad");
  } catch (error) {
    showMessage(error.message, "bad");
  }
})();