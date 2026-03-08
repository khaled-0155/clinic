// helpers/slots.js
const MS = 1000 * 60;

function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}

/**
 * Extract time-of-day from a Date stored in the DB (assumes date part is irrelevant).
 * Returns { hours, minutes } using UTC components to avoid server-local timezone surprises.
 */
function timePartsFromDate(dt) {
  if (!(dt instanceof Date)) dt = new Date(dt);
  return { hours: dt.getUTCHours(), minutes: dt.getUTCMinutes() };
}

/**
 * Build a Date object for the given isoDate (YYYY-MM-DD) and time parts (hours, minutes)
 * Uses UTC so the produced Date represents that exact YYYY-MM-DDT hh:mm:00Z moment.
 */
function buildUtcDateForDay(isoDate /* "YYYY-MM-DD" */, hours, minutes) {
  // "YYYY-MM-DDTHH:MM:00Z"
  return new Date(`${isoDate}T${pad(hours)}:${pad(minutes)}:00Z`);
}

/**
 * Generate contiguous slots between startDate (Date) and endDate (Date),
 * each slot duration slotMinutes, returns array of { start: Date, end: Date }.
 */
function generateSlotsBetween(startDate, endDate, slotMinutes) {
  const slots = [];
  let cursor = new Date(startDate.getTime());
  const slotMs = slotMinutes * MS;
  while (cursor.getTime() + slotMs <= endDate.getTime() + 0.1) {
    // allow exact end boundary
    const slotStart = new Date(cursor.getTime());
    const slotEnd = new Date(cursor.getTime() + slotMs);
    slots.push({ start: slotStart, end: slotEnd });
    cursor = new Date(cursor.getTime() + slotMs);
  }
  return slots;
}

/**
 * Return true if appointment overlaps the slot (any overlap).
 * Two intervals [a,b) and [c,d) overlap if a < d && c < b
 */
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

module.exports = {
  timePartsFromDate,
  buildUtcDateForDay,
  generateSlotsBetween,
  overlaps,
};
