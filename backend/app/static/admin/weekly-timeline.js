import { escapeHtml } from "./helpers.js";
import { DAYS, DAY_START, DAY_END, NOON, PPM, timeTop, toHHMM } from "./time-slot-data.js";

export function timelineDays(weekdays) {
  return [...DAYS, ...new Set(weekdays.filter((day) => day && !DAYS.includes(day)))];
}

export function renderWeeklyTimeline(days, renderDayHeading, renderSlots) {
  const height = timeTop(DAY_END);
  const hours = [];
  for (let minute = DAY_START; minute <= DAY_END; minute += 60) {
    hours.push(`<span style="top:${timeTop(minute)}px">${toHHMM(minute)}</span>`);
  }
  const columns = days.map((day) => `<div class="ts-col">
    <div class="ts-head">${renderDayHeading(day)}</div>
    <div class="ts-lane" data-day="${escapeHtml(day)}"
         style="height:${height}px;background-size:100% ${60 * PPM}px">
      <div class="ts-noon" style="top:${timeTop(NOON)}px"></div>${renderSlots(day)}
    </div></div>`).join("");
  return `<div class="grid-wrap ts-scroll"><div class="ts-board">
    <div class="ts-axis" style="height:${height}px">${hours.join("")}</div>${columns}
    </div></div>`;
}
