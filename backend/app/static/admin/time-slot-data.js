export const DAYS = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
export const DAY_START = 360, DAY_END = 1080, NOON = 720, STEP = 5, PPM = 1.2;
export const LESSON = "Tiết học", ACTIVITY = "Hoạt động";
export const DEFAULT_DURATION = { [LESSON]: 45, [ACTIVITY]: 15 };
export const typeLabel = (type) => type === LESSON ? LESSON : "Truy bài";
export const typeClass = (type) => type === LESSON ? "lesson" : "activity";
export const snap = (minute) => Math.round(minute / STEP) * STEP;
export const timeTop = (minute) => (minute - DAY_START) * PPM;

export function toMin(value) {
  const [hour, minute] = String(value || "").split(":").map(Number);
  return (hour || 0) * 60 + (minute || 0);
}

export function toHHMM(minute) {
  const hour = String(Math.floor(minute / 60)).padStart(2, "0");
  return hour + ":" + String(minute % 60).padStart(2, "0");
}

export const timeRange = (block) => toHHMM(block.start) + "–" + toHHMM(block.start + block.dur);

export function blockFromRow(row, uid) {
  const type = row.loai_khung === ACTIVITY ? ACTIVITY : LESSON;
  return {
    uid, type, day: row.thu, start: toMin(row.gio_bat_dau),
    dur: Number(row.thoi_luong_phut) || DEFAULT_DURATION[type], note: row.ghi_chu || "",
  };
}

export function numbering(blocks, days) {
  const info = new Map();
  for (const day of days) {
    const dayBlocks = blocks.filter((block) => block.day === day).sort((a, b) => a.start - b.start);
    const sessions = [
      ["Sáng", dayBlocks.filter((block) => block.start < NOON)],
      ["Chiều", dayBlocks.filter((block) => block.start >= NOON)],
    ];
    for (const [session, list] of sessions) {
      // Truy bài có mã riêng và không chiếm số tiết học.
      const numbers = { [LESSON]: 0, [ACTIVITY]: 0 };
      list.forEach((block, index) => {
        info.set(block.uid, { session, number: ++numbers[block.type], next: list[index + 1] });
      });
    }
  }
  return info;
}

export function blockTitle(block, info) {
  return block.type === LESSON ? "Tiết " + info.number : block.note || "Truy bài";
}

export function toRows(blocks, days) {
  const info = numbering(blocks, days);
  const rows = [];
  days.forEach((day, dayIndex) => {
    for (const block of blocks.filter((item) => item.day === day).sort((a, b) => a.start - b.start)) {
      const { session, number, next } = info.get(block.uid);
      const sessionCode = session === "Sáng" ? "S" : "C";
      const typeCode = block.type === LESSON ? "T" : "HD";
      rows.push({
        khung_gio_id: `T${dayIndex + 2}-${sessionCode}-${typeCode}${number}`,
        thu: day, buoi: session, tiet_so: number,
        gio_bat_dau: toHHMM(block.start), thoi_luong_phut: block.dur,
        nghi_sau_tiet_phut: next ? Math.max(0, next.start - block.start - block.dur) : 0,
        loai_khung: block.type, ghi_chu: block.note,
      });
    }
  });
  return rows;
}

export function placementError(candidates, existing, movingIds = new Set()) {
  if (candidates.some((block) => block.start < DAY_START || block.start + block.dur > DAY_END)) {
    return "Thời gian phải nằm trong khoảng 06:00–18:00.";
  }
  const occupied = existing.filter((block) => !movingIds.has(block.uid));
  for (const candidate of candidates) {
    if (occupied.some((block) => block.day === candidate.day &&
        candidate.start < block.start + block.dur && block.start < candidate.start + candidate.dur)) {
      return "Vị trí này chồng lên hoạt động khác.";
    }
    occupied.push(candidate);
  }
  return "";
}

export const busySlotKey = (row) => [row.thu, row.buoi, Number(row.tiet_so)].join("|");

export function pruneBusy(tables) {
  const valid = new Set((tables.KhungGio || []).filter((row) => row.loai_khung === LESSON)
    .map(busySlotKey));
  const before = (tables.GV_Ban || []).length;
  tables.GV_Ban = (tables.GV_Ban || []).filter((row) => valid.has(busySlotKey(row)));
  return before - tables.GV_Ban.length;
}
