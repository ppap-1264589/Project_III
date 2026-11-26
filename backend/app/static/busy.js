import { byId, readResponse } from "./admin/helpers.js";
import { renderTeacherBusy } from "./admin/teacher-busy.js";
import { busySlotKey } from "./admin/time-slot-data.js";

const pending = new Set();
let tables;
let currentTeacher = "";
let saving = false;

async function request(url, options) {
  const response = await fetch(url, options);
  const result = await readResponse(response);
  if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Có lỗi xảy ra.");
  return result;
}

function showMessage(text, kind = "") {
  byId("message").className = "status " + kind;
  byId("message").textContent = text;
}

function busyKeys(teacherId) {
  return tables.GV_Ban.filter((row) => row.giao_vien_id === teacherId).map(busySlotKey).sort();
}

function updateActions() {
  const dirty = pending.has(currentTeacher);
  byId("save").disabled = saving || !dirty;
  showMessage(dirty ? "Giáo viên đang chọn có thay đổi chưa lưu." : "Đang hiển thị giờ bận đã lưu.", dirty ? "warn" : "");
}

byId("save").onclick = async () => {
  const teacherId = currentTeacher;
  const busy = busyKeys(teacherId);
  saving = true;
  byId("save").disabled = true;
  try {
    await request(`/api/busy/${encodeURIComponent(teacherId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ busy }),
    });
    if (JSON.stringify(busyKeys(teacherId)) === JSON.stringify(busy)) pending.delete(teacherId);
    saving = false;
    updateActions();
    if (currentTeacher === teacherId && !pending.has(teacherId)) showMessage("Đã lưu giờ bận.", "ok");
  } catch (error) {
    saving = false;
    updateActions();
    showMessage(error.message, "bad");
  }
};

async function load() {
  try {
    ({ tables } = await request("/api/admin/data"));
    currentTeacher = tables.GiaoVien.find((row) => row.giao_vien_id)?.giao_vien_id || "";
    renderTeacherBusy(byId("calendar"), tables, currentTeacher, (teacherId, edited) => {
      currentTeacher = teacherId;
      if (edited) pending.add(teacherId);
      updateActions();
    });
    if (currentTeacher) updateActions();
    else showMessage("Chưa có giáo viên.");
  } catch (error) {
    showMessage(error.message, "bad");
  }
}

load();
