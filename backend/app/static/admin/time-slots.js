import { escapeHtml } from "./helpers.js";
import { minuteAt, startSlotDrag, drawDragPreview } from "./time-slot-drag.js";
import { renderWeeklyTimeline, timelineDays } from "./weekly-timeline.js";
import {
  DAYS, DAY_START, DAY_END, STEP, PPM, LESSON, ACTIVITY, DEFAULT_DURATION,
  blockFromRow, blockTitle, numbering, placementError, snap, timeTop, timeRange,
  toHHMM, toMin, toRows, typeClass, typeLabel,
} from "./time-slot-data.js";

export { pruneBusy } from "./time-slot-data.js";

const TYPES = [LESSON, ACTIVITY];
const durations = { ...DEFAULT_DURATION };
let tool = LESSON;

function blockOptions(block) {
  return TYPES.map((type) =>
    `<option value="${type}"${block.type === type ? " selected" : ""}>${typeLabel(type)}</option>`
  ).join("");
}

function showPopup(popup, x, y) {
  popup.hidden = false;
  const left = Math.max(4, Math.min(x, document.documentElement.clientWidth - popup.offsetWidth - 4));
  const top = Math.max(4, Math.min(y, document.documentElement.clientHeight - popup.offsetHeight - 4));
  popup.style.left = left + "px";
  popup.style.top = top + "px";
}

export function renderTimeSlots(wrap, tables) {
  let uid = 0;
  let blocks = (tables.KhungGio || []).filter((row) => String(row.thu || "").trim())
    .map((row) => blockFromRow(row, ++uid));
  const days = timelineDays(blocks.map((block) => block.day));
  let selected = new Set();
  let anchor = null;
  let message = "";

  const byUid = (element) => element && blocks.find((block) => block.uid === Number(element.dataset.uid));
  const dayOptions = (value) => days.map((day) =>
    `<option${day === value ? " selected" : ""}>${escapeHtml(day)}</option>`
  ).join("");

  function commit(notice = "") {
    tables.KhungGio = toRows(blocks, days);
    message = notice;
    draw();
  }

  function boardHtml() {
    const info = numbering(blocks, days);
    return renderWeeklyTimeline(days, escapeHtml, (day) =>
      blocks.filter((block) => block.day === day).map((block) => `
        <div class="ts-block ${typeClass(block.type)}${block.dur < 25 ? " compact" : ""}${selected.has(block.uid) ? " selected" : ""}"
             data-uid="${block.uid}" style="top:${timeTop(block.start)}px;height:${block.dur * PPM}px">
          <div class="ts-handle top" data-handle="top"></div>
          <span class="ts-block-title">${escapeHtml(blockTitle(block, info.get(block.uid)))}</span>
          <small>${timeRange(block)}</small>
          <div class="ts-handle bottom" data-handle="bottom"></div>
        </div>`).join(""));
  }

  function draw() {
    const scroll = wrap.querySelector(".ts-scroll")?.scrollLeft ?? 0;
    const buttons = TYPES.map((type) => `<button type="button"
      class="ts-tool-btn ${typeClass(type)}${tool === type ? " active" : ""}"
      aria-pressed="${tool === type}" data-ts-tool="${type}">${typeLabel(type)}</button>`).join("");
    wrap.innerHTML = `
      <div class="ts-tools">${buttons}
        <label>Thời lượng <input id="tsDur" type="number" min="${STEP}" max="${DAY_END - DAY_START}"
          step="${STEP}" value="${durations[tool]}"> phút</label>
      </div>
      <p class="muted matrix-note">Bấm vùng trống để thêm. Ctrl+bấm để chọn từng ô, Shift+bấm để chọn một vùng.
        Kéo ô đã chọn để di chuyển. Bấm chuột phải để chỉnh sửa, sao chép hoặc xóa.</p>
      ${message ? `<div class="status warn" role="status">${escapeHtml(message)}</div>` : ""}
      ${boardHtml()}
      <div class="ts-hover" hidden></div>
      <div class="ts-context" hidden></div>`;
    wrap.querySelector(".ts-scroll").scrollLeft = scroll;
    bind();
  }

  function selectBlock(block, event) {
    if (event.shiftKey && anchor) {
      const firstDay = days.indexOf(anchor.day);
      const lastDay = days.indexOf(block.day);
      const start = Math.min(anchor.start, block.start);
      const end = Math.max(anchor.start + anchor.dur, block.start + block.dur);
      selected = new Set(blocks.filter((item) => {
        const day = days.indexOf(item.day);
        return day >= Math.min(firstDay, lastDay) && day <= Math.max(firstDay, lastDay) &&
          item.start < end && item.start + item.dur > start;
      }).map((item) => item.uid));
    } else if (event.ctrlKey || event.metaKey) {
      if (selected.has(block.uid)) selected.delete(block.uid);
      else selected.add(block.uid);
      anchor = block;
    } else {
      selected = new Set([block.uid]);
      anchor = block;
    }
  }

  function bind() {
    const board = wrap.querySelector(".ts-board");
    const hover = wrap.querySelector(".ts-hover");
    const menu = wrap.querySelector(".ts-context");
    const duration = wrap.querySelector("#tsDur");
    let dragging = false;

    duration.onchange = () => {
      durations[tool] = Math.min(DAY_END - DAY_START,
        Math.max(STEP, snap(Number(duration.value) || DEFAULT_DURATION[tool])));
      duration.value = durations[tool];
    };
    wrap.querySelectorAll("[data-ts-tool]").forEach((button) => {
      button.onclick = () => {
        tool = button.dataset.tsTool;
        draw();
      };
    });

    board.onpointermove = (event) => {
      const lane = event.target.closest(".ts-lane");
      if (!lane || dragging || !menu.hidden) {
        hover.hidden = true;
        return;
      }
      hover.textContent = toHHMM(minuteAt(lane, event.clientY));
      showPopup(hover, event.clientX + 12, event.clientY + 14);
    };
    board.onpointerleave = () => { hover.hidden = true; };

    board.onpointerdown = (event) => {
      const lane = event.target.closest(".ts-lane");
      if (!lane || event.button !== 0 || dragging) return;
      event.preventDefault();
      hover.hidden = true;
      if (!menu.hidden) {
        menu.hidden = true;
        return;
      }
      const block = byUid(event.target.closest(".ts-block"));
      if (block && (event.shiftKey || event.ctrlKey || event.metaKey)) {
        selectBlock(block, event);
        draw();
        return;
      }
      if (block && !selected.has(block.uid)) selectBlock(block, event);
      const group = block ? blocks.filter((item) => selected.has(item.uid)) : [];
      board.querySelectorAll(".ts-block").forEach((element) =>
        element.classList.toggle("selected", selected.has(Number(element.dataset.uid))));
      dragging = true;

      function check(candidates) {
        if (!candidates) return "Hãy thả trong bảng khung giờ.";
        if (candidates.some((item) => !item.day)) return "Một số hoạt động vượt ra ngoài các cột ngày.";
        return placementError(candidates, blocks, block ? selected : new Set());
      }

      startSlotDrag(event, board, {
        lane, block, group, days, duration: durations[tool], type: tool,
        onPreview(candidates) {
          drawDragPreview(board, candidates, check(candidates));
        },
        onCancel: draw,
        onDrop(candidates, moved) {
          if (block && !moved) {
            selectBlock(block, event);
            message = "";
            draw();
            return;
          }
          message = check(candidates);
          if (message) {
            draw();
            return;
          }
          if (block) {
            const movedBlocks = new Map(candidates.map((item) => [item.uid, item]));
            blocks = blocks.map((item) => movedBlocks.get(item.uid) ?? item);
            anchor = blocks.find((item) => item.uid === anchor?.uid);
          } else {
            const added = { ...candidates[0], uid: ++uid };
            blocks.push(added);
            selected = new Set([added.uid]);
            anchor = added;
          }
          commit();
        },
      });
    };

    board.oncontextmenu = (event) => {
      const block = byUid(event.target.closest(".ts-block"));
      if (!block || dragging) return;
      event.preventDefault();
      hover.hidden = true;
      openContext(menu, block, event.clientX, event.clientY);
    };
  }

  function openContext(menu, block, x, y) {
    const deleteIds = selected.has(block.uid) ? new Set(selected) : new Set([block.uid]);
    const deleteCount = deleteIds.size;
    const deleteLabel = deleteCount === 1 ? "Xóa hoạt động" : `Xóa ${deleteCount} hoạt động đã chọn`;

    function show(html) {
      menu.innerHTML = html;
      showPopup(menu, x, y);
      menu.querySelector("button, select, input")?.focus({ preventScroll: true });
    }

    show(`
      <strong>${escapeHtml(block.day)} · ${timeRange(block)}</strong>
      <button type="button" class="secondary" data-action="edit">Chỉnh sửa hoạt động</button>
      <button type="button" class="secondary" data-action="copy">Sao chép hoạt động</button>
      <button type="button" class="danger" data-action="delete">${deleteLabel}</button>`);
    menu.onkeydown = (event) => {
      if (event.key === "Escape") menu.hidden = true;
    };
    menu.onclick = (event) => {
      const button = event.target.closest("[data-action]");
      const action = button?.dataset.action;
      if (action === "close") menu.hidden = true;
      if (action === "delete") {
        button.textContent = deleteCount === 1 ? "Chắc chắn xóa?" : `Chắc chắn xóa ${deleteCount} hoạt động?`;
        button.dataset.action = "confirm-delete";
        showPopup(menu, x, y);
      }
      if (action === "confirm-delete") {
        blocks = blocks.filter((item) => !deleteIds.has(item.uid));
        for (const id of deleteIds) selected.delete(id);
        if (deleteIds.has(anchor?.uid)) anchor = null;
        commit();
      }
      if (action === "copy") {
        show(`
          <strong>Sao chép hoạt động lúc ${toHHMM(block.start)}</strong>
          <label>Từ ngày <select name="from">${dayOptions(block.day)}</select></label>
          <label>Đến ngày <select name="to">${dayOptions(DAYS[4])}</select></label>
          <p class="ts-context-error" role="status"></p>
          <button type="button" data-action="confirm-copy">Sao chép</button>
          <button type="button" class="secondary" data-action="close">Hủy</button>`);
      }
      if (action === "confirm-copy") {
        const from = menu.querySelector('[name="from"]').value;
        const to = menu.querySelector('[name="to"]').value;
        const fromIndex = days.indexOf(from);
        const toIndex = days.indexOf(to);
        const feedback = menu.querySelector(".ts-context-error");
        if (toIndex <= fromIndex) {
          feedback.textContent = "Ngày kết thúc phải đứng sau ngày nguồn.";
          return;
        }
        const source = blocks.find((item) => item.day === from && item.start === block.start);
        if (!source) {
          feedback.textContent = "Ngày nguồn không có hoạt động bắt đầu lúc " + toHHMM(block.start) + ".";
          return;
        }
        const copies = [];
        const skipped = [];
        for (const day of days.slice(fromIndex + 1, toIndex + 1)) {
          const copy = { ...source, day };
          const error = placementError([copy], blocks);
          if (error) {
            skipped.push(day + " (" + error + ")");
          } else {
            copies.push({ ...copy, uid: ++uid });
          }
        }
        const notice = skipped.length ? "Bỏ qua " + skipped.join("; ") : "";
        if (!copies.length) {
          feedback.textContent = notice;
          return;
        }
        blocks.push(...copies);
        selected = new Set(copies.map((copy) => copy.uid));
        anchor = copies[0];
        commit(notice);
      }
      if (action === "edit") {
        show(`
          <label>Loại <select name="type">${blockOptions(block)}</select></label>
          <label>Bắt đầu <input name="start" type="time" value="${toHHMM(block.start)}"></label>
          <label>Thời lượng <input name="duration" type="number" min="1" value="${block.dur}"> phút</label>
          <label>Ghi chú <input name="note" type="text" value="${escapeHtml(block.note)}"></label>
          <p class="ts-context-error" role="status"></p>
          <button type="button" data-action="confirm-edit">Áp dụng</button>
          <button type="button" class="secondary" data-action="close">Hủy</button>`);
      }
      if (action === "confirm-edit") {
        const value = (name) => menu.querySelector(`[name="${name}"]`).value;
        const edited = { ...block, type: value("type"), start: toMin(value("start")),
          dur: Number(value("duration")), note: value("note") };
        const error = Number.isInteger(edited.dur) && edited.dur > 0
          ? placementError([edited], blocks, new Set([block.uid])) : "Thời lượng phải là số nguyên dương.";
        if (error) {
          menu.querySelector(".ts-context-error").textContent = error;
          return;
        }
        Object.assign(block, edited);
        commit();
      }
    };
  }

  draw();
}
