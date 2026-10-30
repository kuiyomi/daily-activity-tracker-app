/**
 * calendarView.js – renders the monthly calendar grid into the DOM.
 * Restyled with iOS inset-grouped look, system colors, safe areas, and "Hoje" navigation.
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
import {
  groupCompletionsByDate,
  getDayDotIndicators,
} from '../logic/activityLogic.js';
import {
  getCompletionsForDateRange,
  getActivities,
} from '../storage/storage.js';
import '../version.js';

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
    <div class="screen-view calendar-screen">
      <header class="ios-nav-bar ios-nav-bar--with-action">
        <h1 class="ios-large-title">${self.APP_NAME || 'Agenda'}</h1>
        <button class="ios-nav-action-btn" id="btn-today" aria-label="Voltar para o mês atual" style="display: none;">
          Hoje
        </button>
      </header>

      <main class="screen-content">
        <div class="inset-section">
          <div class="inset-group calendar-card">
            <header class="cal-nav-bar">
              <button class="ios-icon-btn nav-btn" id="btn-prev" aria-label="Mês anterior">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </button>
              <h2 class="cal-title" id="cal-title"></h2>
              <button class="ios-icon-btn nav-btn" id="btn-next" aria-label="Próximo mês">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
            </header>

            <div class="cal-weekdays" role="row" aria-hidden="true"></div>
            <div class="cal-grid" id="cal-grid" role="grid"></div>
          </div>
        </div>
      </main>
    </div>
  `;

  const titleEl = root.querySelector('#cal-title');
  const gridEl = root.querySelector('#cal-grid');
  const weekdaysEl = root.querySelector('.cal-weekdays');
  const todayBtn = root.querySelector('#btn-today');

  // ── Weekday header (rendered once) ────────────────────────────────────────
  weekdayLabels().forEach((label) => {
    const cell = document.createElement('div');
    cell.className = 'cal-weekday';
    cell.textContent = label;
    weekdaysEl.appendChild(cell);
  });

  // ── Render helpers ─────────────────────────────────────────────────────────
  async function render() {
    titleEl.textContent = formatMonthHeading(currentYear, currentMonth);
    gridEl.innerHTML = '';

    // Toggle "Hoje" button visibility: show when not viewing current month
    const isCurrentMonthView = currentYear === today.getFullYear() && currentMonth === today.getMonth();
    if (todayBtn) {
      todayBtn.style.display = isCurrentMonthView ? 'none' : 'inline-flex';
    }

    const todayStr = todayString();
    const days = buildMonthGrid(currentYear, currentMonth);
    const startDateStr = toDateString(days[0]);
    const endDateStr = toDateString(days[days.length - 1]);

    let completions = [];
    let activities = [];
    try {
      [completions, activities] = await Promise.all([
        getCompletionsForDateRange(startDateStr, endDateStr),
        getActivities(),
      ]);
    } catch (err) {
      console.error('Failed to fetch completions/activities for month', err);
    }

    const completionsByDate = groupCompletionsByDate(completions);

    days.forEach((date) => {
      const dateStr = toDateString(date);
      const isCurrentMonth = date.getMonth() === currentMonth;
      const isToday = dateStr === todayStr;
      const completedIds = completionsByDate[dateStr] || [];
      const hasCompletions = completedIds.length > 0;
      const { dots, hasOverflow } = getDayDotIndicators(completedIds, activities, 4);

      const btn = document.createElement('button');
      btn.className = [
        'cal-day',
        isCurrentMonth ? '' : 'cal-day--other-month',
        isToday ? 'cal-day--today' : '',
        hasCompletions ? 'cal-day--has-completions' : '',
      ]
        .filter(Boolean)
        .join(' ');

      const dotsHtml = dots
        .map((color) => `<span class="cal-dot" style="background-color: ${color};"></span>`)
        .join('');
      const moreHtml = hasOverflow ? `<span class="cal-dots-more">+</span>` : '';

      btn.innerHTML = `
        <span class="cal-day-rain" aria-hidden="true"></span>
        <span class="cal-day-num">${date.getDate()}</span>
        <span class="cal-day-dots" aria-hidden="true">${dotsHtml}${moreHtml}</span>
      `;

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

  if (todayBtn) {
    todayBtn.addEventListener('click', () => {
      currentYear = today.getFullYear();
      currentMonth = today.getMonth();
      render();
    });
  }

  // Initial paint
  render();
}
