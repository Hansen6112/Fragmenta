/*
 * FRAGMENTA — World Clock
 * A day/night cycle layered on top of the whole-day counter that already
 * existed (state.day, still the single source of truth for "what day is
 * it" — nothing here introduces a second one). state.hour/state.minute
 * live directly on GameState (see engine/state.js), not a bare module-
 * level object, so they persist through save/load exactly like every
 * other piece of state.
 *
 * DAYPARTS is the one source of truth for the boundaries — getDaypart
 * derives its answer from it (rather than repeating the same hour
 * numbers in two places) and handles NIGHT's wraparound past midnight
 * generically, not as a special case.
 */
const DAYPARTS = {
  morning: { start: 6, end: 12 },
  afternoon: { start: 12, end: 18 },
  evening: { start: 18, end: 22 },
  night: { start: 22, end: 6 }, // wraps past midnight
};

function getDaypart(hour) {
  for (const [name, range] of Object.entries(DAYPARTS)) {
    if (range.start < range.end) {
      if (hour >= range.start && hour < range.end) return name;
    } else if (hour >= range.start || hour < range.end) {
      return name;
    }
  }
  return "night"; // unreachable given the table above; a safe fallback
}

function formatTime(state) {
  return `${String(state.hour).padStart(2, "0")}:${String(state.minute).padStart(2, "0")}`;
}

const DAYPART_TRANSITION_LINES = {
  morning: "The sky lightens. Morning has broken.",
  afternoon: "The sun climbs toward its peak.",
  evening: "Shadows lengthen as evening comes on.",
  night: "Night falls.",
};

// Advances the clock by `minutes`, rolling hour/day over as needed, and
// returns any narrative lines worth printing (only when the daypart
// actually changed — nobody needs "+5 minutes" printed on every talk).
// Also fires three silent events on the existing Events bus for anything
// that wants to react without needing print output of its own:
//   - "time.advanced": { minutes, reason, state } — every call.
//   - "day.started": { day, state } — only when the day counter ticked over.
//   - "daypart.changed": { previous, current, state } — only on a change.
// `reason` is a short label (e.g. "travel", "rest", "combat") for
// anything that wants to know WHY time passed, not just that it did.
function advanceTime(state, minutes, reason) {
  const lines = [];
  const previousDay = state.day;
  const previousDaypart = getDaypart(state.hour);

  state.minute += minutes;
  while (state.minute >= 60) {
    state.minute -= 60;
    state.hour += 1;
  }
  while (state.hour >= 24) {
    state.hour -= 24;
    state.day += 1;
  }

  const currentDaypart = getDaypart(state.hour);

  Events.emit("time.advanced", { minutes, reason: reason || "unknown", state });
  if (state.day !== previousDay) {
    Events.emit("day.started", { day: state.day, state });
  }
  if (currentDaypart !== previousDaypart) {
    Events.emit("daypart.changed", { previous: previousDaypart, current: currentDaypart, state });
    lines.push(DAYPART_TRANSITION_LINES[currentDaypart] || `It is now ${currentDaypart}.`);
  }
  return lines;
}
