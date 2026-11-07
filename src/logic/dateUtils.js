/**
 * dateUtils.js – pure date-logic functions for the calendar.
 * No DOM, no side-effects, easy to unit-test.
 */

/**
 * Returns today as a local YYYY-MM-DD string (avoids UTC offset bugs).
 * @returns {string}
 */
export function todayString() {
  const d = new Date();
  return toDateString(d);
}

/**
 * Checks if a date string is in the future relative to a reference date.
 * @param {string} dateStr – "YYYY-MM-DD"
 * @param {string} [todayStr] – "YYYY-MM-DD" (defaults to todayString())
 * @returns {boolean}
 */
export function isFutureDate(dateStr, todayStr = todayString()) {
  return typeof dateStr === 'string' && typeof todayStr === 'string' && dateStr > todayStr;
}

/**
 * Checks if a date string is in the past relative to a reference date.
 * @param {string} dateStr – "YYYY-MM-DD"
 * @param {string} [todayStr] – "YYYY-MM-DD" (defaults to todayString())
 * @returns {boolean}
 */
export function isPastDate(dateStr, todayStr = todayString()) {
  return typeof dateStr === 'string' && typeof todayStr === 'string' && dateStr < todayStr;
}

/**
 * Checks if a date string is today relative to a reference date.
 * @param {string} dateStr – "YYYY-MM-DD"
 * @param {string} [todayStr] – "YYYY-MM-DD" (defaults to todayString())
 * @returns {boolean}
 */
export function isTodayDate(dateStr, todayStr = todayString()) {
  return typeof dateStr === 'string' && typeof todayStr === 'string' && dateStr === todayStr;
}

/**
 * Converts a Date object to a local YYYY-MM-DD string.
 * @param {Date} date
 * @returns {string}
 */
export function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parses a YYYY-MM-DD string into a local Date (midnight local time).
 * @param {string} dateStr – "YYYY-MM-DD"
 * @returns {Date}
 */
export function parseDateString(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Returns the first day of the month for the given year/month.
 * @param {number} year
 * @param {number} month – 0-based (0 = January)
 * @returns {Date}
 */
export function firstDayOfMonth(year, month) {
  return new Date(year, month, 1);
}

/**
 * Returns the last day of the month for the given year/month.
 * @param {number} year
 * @param {number} month – 0-based
 * @returns {Date}
 */
export function lastDayOfMonth(year, month) {
  return new Date(year, month + 1, 0);
}

/**
 * Builds the grid of days for a monthly calendar view
 * where weeks start on Sunday.
 *
 * Returns a flat array of Date objects (always 35 or 42 entries)
 * padded with days from the previous and next months.
 *
 * @param {number} year
 * @param {number} month – 0-based
 * @returns {Date[]}
 */
export function buildMonthGrid(year, month) {
  const first = firstDayOfMonth(year, month);
  const last = lastDayOfMonth(year, month);

  // Sunday = 0 … Saturday = 6
  const startOffset = first.getDay(); // days to pad before the 1st
  const endOffset = 6 - last.getDay(); // days to pad after the last

  const days = [];

  // Pad from previous month
  for (let i = startOffset; i > 0; i--) {
    days.push(new Date(year, month, 1 - i));
  }

  // Days in current month
  for (let d = 1; d <= last.getDate(); d++) {
    days.push(new Date(year, month, d));
  }

  // Pad into next month to complete the last week
  for (let i = 1; i <= endOffset; i++) {
    days.push(new Date(year, month + 1, i));
  }

  // Ensure we always have complete weeks (35 or 42 cells)
  return days;
}

/**
 * Returns { year, month } for the month after the given one.
 * @param {number} year
 * @param {number} month – 0-based
 * @returns {{ year: number, month: number }}
 */
export function nextMonth(year, month) {
  if (month === 11) return { year: year + 1, month: 0 };
  return { year, month: month + 1 };
}

/**
 * Returns { year, month } for the month before the given one.
 * @param {number} year
 * @param {number} month – 0-based
 * @returns {{ year: number, month: number }}
 */
export function prevMonth(year, month) {
  if (month === 0) return { year: year - 1, month: 11 };
  return { year, month: month - 1 };
}

/**
 * Formats a month heading in pt-BR, e.g. "Outubro de 2026".
 * Only the first letter is capitalised; "de" stays lowercase.
 * @param {number} year
 * @param {number} month – 0-based
 * @returns {string}
 */
export function formatMonthHeading(year, month) {
  const date = new Date(year, month, 1);
  const raw = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/**
 * Returns an array of abbreviated weekday labels starting on Sunday,
 * e.g. ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].
 * @returns {string[]}
 */
export function weekdayLabels() {
  const fmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
  // Use a known week: 2024-01-07 is a Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 0, 7 + i); // Sun 7 Jan … Sat 13 Jan 2024
    // Capitalise the first letter and strip trailing dot
    const label = fmt.format(d).replace(/\.$/, '');
    return label.charAt(0).toUpperCase() + label.slice(1);
  });
}

/**
 * Returns the 7 Date objects (Sunday through Saturday) for the week containing referenceDate.
 * @param {Date | string} referenceDate
 * @returns {Date[]}
 */
export function getWeekDays(referenceDate) {
  const d = typeof referenceDate === 'string' ? parseDateString(referenceDate) : new Date(referenceDate);
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const sunday = new Date(local.getFullYear(), local.getMonth(), local.getDate() - local.getDay());
  return Array.from({ length: 7 }, (_, i) => new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i));
}

/**
 * Returns week range info containing start Date, end Date, and ISO date strings.
 * @param {Date | string} referenceDate
 * @returns {{ start: Date, end: Date, startDateStr: string, endDateStr: string, days: Date[] }}
 */
export function getWeekRange(referenceDate) {
  const days = getWeekDays(referenceDate);
  const start = days[0];
  const end = days[6];
  return {
    start,
    end,
    startDateStr: toDateString(start),
    endDateStr: toDateString(end),
    days,
  };
}

/**
 * Returns a new Date 7 days after the given date.
 * @param {Date | string} referenceDate
 * @returns {Date}
 */
export function nextWeek(referenceDate) {
  const d = typeof referenceDate === 'string' ? parseDateString(referenceDate) : new Date(referenceDate);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
}

/**
 * Returns a new Date 7 days before the given date.
 * @param {Date | string} referenceDate
 * @returns {Date}
 */
export function prevWeek(referenceDate) {
  const d = typeof referenceDate === 'string' ? parseDateString(referenceDate) : new Date(referenceDate);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7);
}

/**
 * Checks whether two dates belong to the same week (Sunday-Saturday).
 * @param {Date | string} dateA
 * @param {Date | string} dateB
 * @returns {boolean}
 */
export function isSameWeek(dateA, dateB) {
  const daysA = getWeekDays(dateA);
  const daysB = getWeekDays(dateB);
  return toDateString(daysA[0]) === toDateString(daysB[0]);
}

/**
 * Formats a week heading in pt-BR, e.g. "1 – 7 nov. 2026",
 * "27 set. – 3 out. 2026", or "27 dez. 2026 – 2 jan. 2027".
 * Uses en-dash (" \u2013 ").
 * @param {Date | string} startDate
 * @param {Date | string} endDate
 * @returns {string}
 */
export function formatWeekHeading(startDate, endDate) {
  const start = typeof startDate === 'string' ? parseDateString(startDate) : new Date(startDate);
  const end = typeof endDate === 'string' ? parseDateString(endDate) : new Date(endDate);
  const fmtMonth = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
  const startMonth = fmtMonth.format(start);
  const endMonth = fmtMonth.format(end);
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();

  if (startYear === endYear && start.getMonth() === end.getMonth()) {
    return `${start.getDate()} \u2013 ${end.getDate()} ${startMonth} ${startYear}`;
  }
  if (startYear === endYear) {
    return `${start.getDate()} ${startMonth} \u2013 ${end.getDate()} ${endMonth} ${startYear}`;
  }
  return `${start.getDate()} ${startMonth} ${startYear} \u2013 ${end.getDate()} ${endMonth} ${endYear}`;
}

