import { DAY_START, DAY_END, STEP, PPM, snap, timeTop, timeRange } from "./time-slot-data.js";

export function minuteAt(lane, clientY) {
  const minute = DAY_START + Math.round((clientY - lane.getBoundingClientRect().top) / PPM);
  return Math.max(DAY_START, Math.min(DAY_END, minute));
}

export function startSlotDrag(event, board, options) {
  const { lane, block, group, days, duration, type, onPreview, onDrop, onCancel } = options;
  const handle = event.target.dataset.handle;
  const originDay = days.indexOf(lane.dataset.day);
  const origin = snap(minuteAt(lane, event.clientY));
  const pointerId = event.pointerId;
  const initialX = event.clientX;
  const initialY = event.clientY;
  let moved = false;
  let proposal = null;
  board.setPointerCapture(pointerId);

  function propose(pointer) {
    const target = document.elementFromPoint(pointer.clientX, pointer.clientY)?.closest(".ts-lane");
    if (!target || !board.contains(target)) return null;
    const minute = snap(minuteAt(target, pointer.clientY));
    if (!block) {
      const dragged = moved && origin !== minute;
      const start = dragged ? Math.min(origin, minute) : origin;
      const dur = dragged ? Math.abs(origin - minute) : duration;
      return [{ day: lane.dataset.day, start, dur, type, note: "" }];
    }
    if (handle && group.length === 1) {
      const end = block.start + block.dur;
      const start = handle === "top" ? Math.min(minute, end - STEP) : block.start;
      const finish = handle === "bottom" ? Math.max(minute, start + STEP) : end;
      return [{ ...block, start, dur: finish - start }];
    }
    const dayDelta = days.indexOf(target.dataset.day) - originDay;
    return group.map((item) => ({
      ...item, day: days[days.indexOf(item.day) + dayDelta], start: item.start + minute - origin,
    }));
  }

  function move(pointer) {
    if (pointer.pointerId !== pointerId) return;
    moved ||= Math.hypot(pointer.clientX - initialX, pointer.clientY - initialY) > 3;
    if (!moved) return;
    proposal = propose(pointer);
    onPreview(proposal);
  }

  function finish(pointer) {
    if (pointer.pointerId !== pointerId) return;
    const cancelled = pointer.type !== "pointerup";
    const finalPositions = cancelled || (block && !moved) ? null : propose(pointer);
    board.removeEventListener("pointermove", move);
    board.removeEventListener("pointerup", finish);
    board.removeEventListener("pointercancel", finish);
    board.removeEventListener("lostpointercapture", finish);
    if (board.hasPointerCapture(pointerId)) board.releasePointerCapture(pointerId);
    if (cancelled) onCancel();
    else onDrop(finalPositions, moved);
  }

  board.addEventListener("pointermove", move);
  board.addEventListener("pointerup", finish);
  board.addEventListener("pointercancel", finish);
  board.addEventListener("lostpointercapture", finish);
}

export function drawDragPreview(board, candidates, error) {
  board.querySelectorAll(".ts-ghost").forEach((ghost) => ghost.remove());
  board.classList.toggle("ts-dragging", candidates !== null);
  const lanes = new Map([...board.querySelectorAll(".ts-lane")].map((lane) => [lane.dataset.day, lane]));
  for (const block of candidates || []) {
    const lane = lanes.get(block.day);
    if (!lane) continue;
    const ghost = document.createElement("div");
    ghost.className = "ts-ghost" + (error ? " invalid" : "");
    ghost.style.top = timeTop(block.start) + "px";
    ghost.style.height = block.dur * PPM + "px";
    ghost.textContent = timeRange(block);
    lane.append(ghost);
  }
}
