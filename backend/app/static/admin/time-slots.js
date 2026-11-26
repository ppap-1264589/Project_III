import { escapeHtml } from "./helpers.js";

const DAYS = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const DAY_START = 6 * 60, DAY_END = 18 * 60, NOON = 12 * 60, STEP = 5, PPM = 1.2; // PPM = pixel mỗi phút
const TYPES = ["Tiết học", "Hoạt động"];
const cls = (t) => (t === "Hoạt động" ? "activity" : "lesson");

let uid = 0, blocks = [], days = [], selected = null, tool = "Tiết học", defaultDur = 45;
let message = "", wrapEl = null, tablesRef = null;
let quick = { day: "ALL", start: "07:00", count: 5, dur: 45, brk: 5 };
let copyFrom = "Thứ Hai";

const toMin = (t) => { const [h, m] = String(t || "").split(":"); return (Number(h) || 0) * 60 + (Number(m) || 0); };
const toHHMM = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const snap = (m) => Math.round(m / STEP) * STEP;
const sessionOf = (b) => (b.start < NOON ? "Sáng" : "Chiều");
const overlaps = (day, s, e, ignore) =>
  blocks.some((b) => b.day === day && b.uid !== ignore && s < b.start + b.dur && e > b.start);

// ---- Giờ bận: bỏ các dòng GV_Ban không còn khớp một tiết học ----
export function pruneBusy(tables) {
  const valid = new Set((tables.KhungGio || []).filter((r) => r.loai_khung === "Tiết học")
    .map((r) => r.thu + "|" + r.buoi + "|" + Number(r.tiet_so)));
  const before = (tables.GV_Ban || []).length;
  tables.GV_Ban = (tables.GV_Ban || []).filter((r) => valid.has(r.thu + "|" + r.buoi + "|" + Number(r.tiet_so)));
  return before - tables.GV_Ban.length;
}

// ---- Khối <-> dòng KhungGio ----
function numbering() {
  const info = new Map();
  for (const day of days) {
    for (const buoi of ["Sáng", "Chiều"]) {
      const list = blocks.filter((b) => b.day === day && sessionOf(b) === buoi).sort((a, b) => a.start - b.start);
      const counters = { "Tiết học": 0, "Hoạt động": 0 };
      list.forEach((b, i) => info.set(b.uid, { buoi, n: ++counters[b.type], next: list[i + 1] }));
    }
  }
  return info;
}

function toRows() {
  const info = numbering();
  const rows = [];
  days.forEach((day, d) => {
    blocks.filter((b) => b.day === day).sort((a, b) => a.start - b.start).forEach((b) => {
      const { buoi, n, next } = info.get(b.uid);
      rows.push({
        khung_gio_id: "T" + (d + 2) + "-" + (buoi === "Sáng" ? "S" : "C") + "-" + (b.type === "Tiết học" ? "T" : "HD") + n,
        thu: day, buoi, tiet_so: n,
        gio_bat_dau: toHHMM(b.start), thoi_luong_phut: b.dur,
        nghi_sau_tiet_phut: next ? Math.max(0, next.start - (b.start + b.dur)) : 0,
        loai_khung: b.type, ghi_chu: b.note,
      });
    });
  });
  return rows;
}

const commit = () => { tablesRef.KhungGio = toRows(); };

export function renderTimeSlots(wrap, tables) {
  wrapEl = wrap;
  tablesRef = tables;
  blocks = (tables.KhungGio || []).filter((r) => String(r.thu || "").trim()).map((r) => ({
    uid: ++uid, day: r.thu, start: toMin(r.gio_bat_dau), dur: Number(r.thoi_luong_phut) || 45,
    type: r.loai_khung === "Hoạt động" ? "Hoạt động" : "Tiết học", note: r.ghi_chu || "",
  }));
  days = [...DAYS, ...new Set(blocks.map((b) => b.day).filter((d) => !DAYS.includes(d)))];
  selected = null;
  message = "";
  draw();
}

// ---- Vẽ giao diện ----
function readQuick() {
  const q = (id) => wrapEl.querySelector("#" + id);
  if (!q("tsQStart")) return;
  quick = { day: q("tsQDay").value, start: q("tsQStart").value, count: Number(q("tsQCount").value) || 1,
            dur: Number(q("tsQDur").value) || 45, brk: Number(q("tsQBrk").value) || 0 };
  copyFrom = q("tsCopyFrom").value;
}

function draw() {
  readQuick();
  const info = numbering();
  const height = (DAY_END - DAY_START) * PPM;
  const dayOptions = (selectedValue, withAll) => (withAll ? '<option value="ALL"' + (selectedValue === "ALL" ? " selected" : "") + ">Thứ Hai – Thứ Sáu</option>" : "") +
    days.map((d) => '<option value="' + escapeHtml(d) + '"' + (d === selectedValue ? " selected" : "") + ">" + escapeHtml(d) + "</option>").join("");

  let html = '<div class="ts-tools"><span>Công cụ kéo:</span>' +
    TYPES.map((t) => '<button type="button" class="ts-tool-btn ' + cls(t) + (tool === t ? " active" : "") + '" data-ts-tool="' + t + '">' + t + "</button>").join("") +
    '<label>Thời lượng khi bấm (phút) <input type="number" id="tsDur" min="5" step="5" value="' + defaultDur + '"></label></div>';
  html += '<p class="muted matrix-note">Kéo trên vùng trống để tạo khối, bấm một lần để tạo khối có thời lượng mặc định. Kéo thân khối để dời, kéo mép trên/dưới để đổi giờ. Truy bài và sinh hoạt là khối “Hoạt động” (màu cam): không đánh số tiết và không được xếp môn.</p>';

  html += '<div class="ts-tools"><b>Tạo nhanh một buổi:</b>' +
    '<select id="tsQDay">' + dayOptions(quick.day, true) + "</select>" +
    '<label>Bắt đầu <input type="time" id="tsQStart" step="300" value="' + quick.start + '"></label>' +
    '<label>Số tiết <input type="number" id="tsQCount" min="1" max="10" value="' + quick.count + '"></label>' +
    '<label>Phút/tiết <input type="number" id="tsQDur" min="5" step="5" value="' + quick.dur + '"></label>' +
    '<label>Nghỉ <input type="number" id="tsQBrk" min="0" step="5" value="' + quick.brk + '"></label>' +
    '<button type="button" class="secondary" data-ts-action="quick">Tạo các tiết</button></div>';

  html += '<div class="ts-tools"><b>Sao chép ngày:</b><select id="tsCopyFrom">' + dayOptions(copyFrom, false) + "</select>" +
    '<button type="button" class="secondary" data-ts-action="copy">Chép sang các ngày Thứ Hai – Thứ Sáu còn lại</button></div>';

  html += '<div class="grid-wrap"><div class="ts-board"><div class="ts-axis" style="height:' + height + 'px">';
  for (let h = DAY_START / 60; h <= DAY_END / 60; h++) {
    html += '<span style="top:' + (h * 60 - DAY_START) * PPM + 'px">' + String(h).padStart(2, "0") + ":00</span>";
  }
  html += "</div>";
  for (const day of days) {
    html += '<div class="ts-col"><div class="ts-head">' + escapeHtml(day) + "</div>" +
      '<div class="ts-lane" data-day="' + escapeHtml(day) + '" style="height:' + height + "px;background-size:100% " + 60 * PPM + 'px">' +
      '<div class="ts-noon" style="top:' + (NOON - DAY_START) * PPM + 'px"></div>';
    for (const b of blocks.filter((x) => x.day === day)) {
      const i = info.get(b.uid);
      const title = b.type === "Tiết học" ? i.buoi + " · tiết " + i.n : (b.note || "Hoạt động");
      html += '<div class="ts-block ' + cls(b.type) + (b.uid === selected ? " selected" : "") + '" data-uid="' + b.uid +
        '" style="top:' + (b.start - DAY_START) * PPM + "px;height:" + b.dur * PPM + 'px">' +
        '<div class="ts-handle top" data-handle="top"></div>' + escapeHtml(title) +
        "<small>" + toHHMM(b.start) + "–" + toHHMM(b.start + b.dur) + "</small>" +
        '<div class="ts-handle bottom" data-handle="bottom"></div></div>';
    }
    html += "</div></div>";
  }
  html += "</div></div>";

  const sel = blocks.find((b) => b.uid === selected);
  if (sel) {
    html += '<div class="ts-panel"><b>Khối đang chọn (' + escapeHtml(sel.day) + ")</b>" +
      '<select data-ts-field="type">' + TYPES.map((t) => '<option value="' + t + '"' + (t === sel.type ? " selected" : "") + ">" + t + "</option>").join("") + "</select>" +
      '<label>Bắt đầu <input type="time" step="300" data-ts-field="start" value="' + toHHMM(sel.start) + '"></label>' +
      '<label>Thời lượng (phút) <input type="number" min="5" step="5" data-ts-field="dur" value="' + sel.dur + '"></label>' +
      '<label>Ghi chú <input type="text" data-ts-field="note" value="' + escapeHtml(sel.note) + '" placeholder="vd: Truy bài"></label>' +
      '<button type="button" class="delete-row" data-ts-action="delete">Xóa khối</button></div>';
  }
  if (message) html += '<div class="status warn">' + escapeHtml(message) + "</div>";
  wrapEl.innerHTML = html;
  bind();
}

// ---- Thao tác ----
function quickGenerate() {
  const targets = quick.day === "ALL" ? days.slice(0, 5) : [quick.day];
  const first = toMin(quick.start);
  const buoi = first < NOON ? "Sáng" : "Chiều";
  const fresh = Array.from({ length: quick.count }, (_, i) => ({ start: first + i * (quick.dur + quick.brk), dur: quick.dur }));
  const last = fresh[fresh.length - 1];
  if (first < DAY_START || last.start + last.dur > DAY_END) { message = "Các tiết vượt ngoài khoảng 06:00 – 18:00."; return draw(); }
  const isOld = (b) => targets.includes(b.day) && b.type === "Tiết học" && sessionOf(b) === buoi;
  const kept = blocks.filter((b) => !isOld(b));
  const clash = targets.some((day) => fresh.some((f) => kept.some((b) => b.day === day && f.start < b.start + b.dur && f.start + f.dur > b.start)));
  if (clash) { message = "Các tiết mới chồng lên một khối Hoạt động. Hãy dời hoặc xóa khối đó trước."; return draw(); }
  if (blocks.some(isOld) && !window.confirm("Thay các tiết học " + buoi.toLowerCase() + " hiện có của các ngày đã chọn?")) return;
  blocks = kept;
  for (const day of targets) for (const f of fresh) blocks.push({ uid: ++uid, day, start: f.start, dur: f.dur, type: "Tiết học", note: "" });
  message = "";
  commit();
  draw();
}

function copyDay() {
  const targets = days.slice(0, 5).filter((d) => d !== copyFrom);
  if (!window.confirm("Thay toàn bộ khung giờ của " + targets.join(", ") + " bằng khung giờ của " + copyFrom + "?")) return;
  const source = blocks.filter((b) => b.day === copyFrom);
  blocks = blocks.filter((b) => !targets.includes(b.day));
  for (const day of targets) for (const b of source) blocks.push({ ...b, uid: ++uid, day });
  selected = null;
  message = "";
  commit();
  draw();
}

function bind() {
  wrapEl.onclick = (event) => {
    const el = event.target.closest("[data-ts-tool],[data-ts-action]");
    if (!el) return;
    if (el.dataset.tsTool) { tool = el.dataset.tsTool; return draw(); }
    const action = el.dataset.tsAction;
    if (action === "quick") readQuick(), quickGenerate();
    else if (action === "copy") readQuick(), copyDay();
    else if (action === "delete") {
      blocks = blocks.filter((b) => b.uid !== selected);
      selected = null;
      commit();
      draw();
    }
  };

  wrapEl.onchange = (event) => {
    if (event.target.id === "tsDur") { defaultDur = Math.max(STEP, snap(Number(event.target.value) || 45)); return; }
    const field = event.target.dataset.tsField;
    const b = blocks.find((x) => x.uid === selected);
    if (!field || !b) return;
    const old = { ...b };
    if (field === "type") b.type = event.target.value;
    if (field === "note") b.note = event.target.value;
    if (field === "start") b.start = Math.max(DAY_START, toMin(event.target.value));
    if (field === "dur") b.dur = Math.max(STEP, snap(Number(event.target.value) || STEP));
    if (overlaps(b.day, b.start, b.start + b.dur, b.uid) || b.start + b.dur > DAY_END) {
      Object.assign(b, old);
      message = "Giá trị này làm khối chồng lên khối khác hoặc vượt quá 18:00, đã hoàn lại.";
    } else {
      message = "";
      commit();
    }
    draw();
  };

  wrapEl.onpointerdown = (event) => {
    const lane = event.target.closest(".ts-lane");
    if (!lane || event.button !== 0) return;
    event.preventDefault();
    const day = lane.dataset.day;
    const at = (ev) => Math.min(DAY_END, Math.max(DAY_START, DAY_START + snap((ev.clientY - lane.getBoundingClientRect().top) / PPM)));
    const blockEl = event.target.closest(".ts-block");
    const b = blockEl && blocks.find((x) => x.uid === Number(blockEl.dataset.uid));
    const mode = !b ? "create" : event.target.dataset.handle === "top" ? "top" : event.target.dataset.handle === "bottom" ? "bottom" : "move";
    const origin = at(event);
    const orig = b ? { start: b.start, dur: b.dur } : null;
    let moved = false, range = [origin, origin], ghost = null;

    const onMove = (ev) => {
      const m = at(ev);
      if (m !== origin) moved = true;
      if (mode === "create") {
        range = [Math.min(origin, m), Math.max(origin, m)];
        if (!ghost) { ghost = document.createElement("div"); ghost.className = "ts-ghost"; lane.appendChild(ghost); }
        ghost.style.top = (range[0] - DAY_START) * PPM + "px";
        ghost.style.height = Math.max(STEP, range[1] - range[0]) * PPM + "px";
        return;
      }
      let s = b.start, d = b.dur;
      const end = orig.start + orig.dur;
      if (mode === "move") s = Math.min(DAY_END - orig.dur, Math.max(DAY_START, orig.start + m - origin));
      else if (mode === "bottom") d = Math.max(STEP, m - orig.start);
      else { s = Math.min(m, end - STEP); d = end - s; }
      if (!overlaps(day, s, s + d, b.uid)) {
        b.start = s; b.dur = d;
        blockEl.style.top = (s - DAY_START) * PPM + "px";
        blockEl.style.height = d * PPM + "px";
      }
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      message = "";
      if (mode === "create") {
        const dragged = range[1] - range[0] >= STEP;
        const start = dragged ? range[0] : origin;
        const dur = dragged ? range[1] - range[0] : defaultDur;
        if (start + dur > DAY_END || overlaps(day, start, start + dur, 0)) {
          message = "Không tạo được: khối sẽ chồng lên khối khác hoặc vượt quá 18:00.";
        } else {
          const nb = { uid: ++uid, day, start, dur, type: tool, note: "" };
          blocks.push(nb);
          selected = nb.uid;
          commit();
        }
      } else {
        selected = b.uid;
        if (moved) commit();
      }
      draw();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
}