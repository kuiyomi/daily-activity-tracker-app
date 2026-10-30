/**
 * calendarView.js – renders the monthly calendar grid into the DOM.
 * Depends only on dateUtils; no storage or service-worker calls.
 */

import {
  buildMonthGrid,
  weekdayLabels,
  formatMonthHeading,
  nextMonth,
  prevMonth,
  todayString,
  toDateString,
} from '../logic/dateUtils.js';

/**
 * Initialises and mounts the calendar view.
 *
 * @param {HTMLElement} root – the element that will contain the calendar
 * @param {{ onDaySelect: (dateStr: string) => void }} options
 */
export function mountCalendarView(root, { onDaySelect }) {
  const today = new Date();
  let currentYear = today.getFullYear();
  let currentMonth = today.getMonth();

  // ── Build the static skeleton ──────────────────────────────────────────────
  root.innerHTML = `
    <div class="calendar">
      <header class="cal-header">
        <button class="nav-btn" id="btn-prev" aria-label="Mês anterior">&#8249;</button>
        <h2 class="cal-title" id="cal-title"></h2>
        <button class="nav-btn" id="btn-next" aria-label="Próximo mês">&#8250;</button>
      </header>

      <div class="cal-weekdays" role="row" aria-hidden="true"></div>
      <div class="cal-grid" id="cal-grid" role="grid"></div>
    </div>
  `;

  const titleEl = root.querySelector('#cal-title');
  const gridEl = root.querySelector('#cal-grid');
  const weekdaysEl = root.querySelector('.cal-weekdays');

  // ── Weekday header (rendered once) ────────────────────────────────────────
  weekdayLabels().forEach((label) => {
    const cell = document.createElement('div');
    cell.className = 'cal-weekday';
    cell.textContent = label;
    weekdaysEl.appendChild(cell);
  });

  // ── Render helpers ─────────────────────────────────────────────────────────
  function render() {
    titleEl.textContent = formatMonthHeading(currentYear, currentMonth);
    gridEl.innerHTML = '';

    const todayStr = todayString();
    const days = buildMonthGrid(currentYear, currentMonth);

    days.forEach((date) => {
      const dateStr = toDateString(date);
      const isCurrentMonth = date.getMonth() === currentMonth;
      const isToday = dateStr === todayStr;

      const btn = document.createElement('button');
      btn.className = [
        'cal-day',
        isCurrentMonth ? '' : 'cal-day--other-month',
        isToday ? 'cal-day--today' : '',
      ]
        .filter(Boolean)
        .join(' ');

      btn.textContent = date.getDate();
      btn.setAttribute('aria-label', dateStr);
      btn.setAttribute('data-date', dateStr);
      if (isToday) btn.setAttribute('aria-current', 'date');

      btn.addEventListener('click', () => onDaySelect(dateStr));
      gridEl.appendChild(btn);
    });
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  root.querySelector('#btn-prev').addEventListener('click', () => {
    ({ year: currentYear, month: currentMonth } = prevMonth(currentYear, currentMonth));
    render();
  });

  root.querySelector('#btn-next').addEventListener('click', () => {
    ({ year: currentYear, month: currentMonth } = nextMonth(currentYear, currentMonth));
    render();
  });

  // Initial paint
  render();
}
