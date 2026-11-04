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
  rainedDateSet,
} from '../logic/activityLogic.js';
import {
  getCompletionsForDateRange,
  getDayEntriesForDateRange,
  getActivities,
} from '../storage/storage.js';
import { ICONS } from './icons.js';
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
        <h1 class="ios-large-title">${'Calendário'}</h1>
        <button class="ios-nav-action-btn is-visually-hidden" id="btn-today" aria-label="Voltar para o mês atual" aria-hidden="true" tabindex="-1">
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
            <div class="cal-grid-stage" id="cal-grid-stage">
              <div class="cal-grid" id="cal-grid" role="grid"></div>
            </div>
          </div>
        </div>
      </main>
    </div>
  `;

  const titleEl = root.querySelector('#cal-title');
  const gridEl = root.querySelector('#cal-grid');
  const gridStage = root.querySelector('#cal-grid-stage');
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
  let renderId = 0;
  let monthAnimationTimer = null;
  async function render(direction = 0) {
    const id = ++renderId;
    const oldGrid = direction && gridEl.childElementCount ? gridEl.cloneNode(true) : null;
    titleEl.textContent = formatMonthHeading(currentYear, currentMonth);
    gridEl.innerHTML = '';

    // Toggle "Hoje" button visibility: show when not viewing current month
    const isCurrentMonthView = currentYear === today.getFullYear() && currentMonth === today.getMonth();
    if (todayBtn) {
      todayBtn.classList.toggle('is-visually-hidden', isCurrentMonthView);
      todayBtn.setAttribute('aria-hidden', String(isCurrentMonthView));
      todayBtn.tabIndex = isCurrentMonthView ? -1 : 0;
    }

    const todayStr = todayString();
    const days = buildMonthGrid(currentYear, currentMonth);
    const startDateStr = toDateString(days[0]);
    const endDateStr = toDateString(days[days.length - 1]);

    let completions = [];
    let activities = [];
    let dayEntries = [];
    try {
      [completions, activities, dayEntries] = await Promise.all([
        getCompletionsForDateRange(startDateStr, endDateStr),
        getActivities(),
        getDayEntriesForDateRange(startDateStr, endDateStr),
      ]);
    } catch (err) {
      console.error('Failed to fetch completions/activities/day entries for month', err);
    }

    if (id !== renderId) return;

    gridStage.querySelectorAll('.cal-grid--leaving').forEach((grid) => grid.remove());
    gridEl.className = 'cal-grid';

    const completionsByDate = groupCompletionsByDate(completions);
    const rainyDates = rainedDateSet(dayEntries);

    gridEl.classList.toggle('cal-grid--six-weeks', days.length === 42);

    days.forEach((date) => {
      const dateStr = toDateString(date);
      const isCurrentMonth = date.getMonth() === currentMonth;
      const isToday = dateStr === todayStr;
      const rained = rainyDates.has(dateStr);
      const completedIds = completionsByDate[dateStr] || [];
      const hasCompletions = completedIds.length > 0;
      const { dots, hasOverflow } = getDayDotIndicators(completedIds, activities, 4);

      const btn = document.createElement('button');
      btn.className = [
        'cal-day',
        isCurrentMonth ? '' : 'cal-day--other-month',
        isToday ? 'cal-day--today' : '',
        hasCompletions ? 'cal-day--has-completions' : '',
        rained ? 'cal-day--rained' : '',
      ]
        .filter(Boolean)
        .join(' ');

      const dotsHtml = dots
        .map((color) => `<span class="cal-dot" style="background-color: ${color};"></span>`)
        .join('');
      const moreHtml = hasOverflow ? `<span class="cal-dots-more">+</span>` : '';
      const rainHtml = rained
        ? `<span class="cal-day-rain" role="img" aria-label="Choveu">${ICONS['cloud-rain']}</span>`
        : `<span class="cal-day-rain" aria-hidden="true"></span>`;

      btn.innerHTML = `
        ${rainHtml}
        <span class="cal-day-num">${date.getDate()}</span>
        <span class="cal-day-dots" aria-hidden="true">${dotsHtml}${moreHtml}</span>
      `;

      btn.setAttribute('aria-label', rained ? `${dateStr}, Choveu` : dateStr);
      btn.setAttribute('data-date', dateStr);
      if (isToday) btn.setAttribute('aria-current', 'date');

      btn.addEventListener('click', () => onDaySelect(dateStr));
      gridEl.appendChild(btn);
    });

    if (oldGrid) {
      const suffix = direction > 0 ? 'next' : 'prev';
      oldGrid.id = '';
      oldGrid.className = `cal-grid cal-grid--leaving cal-grid--month-leave-${suffix}`;
      gridEl.classList.add(`cal-grid--month-enter-${suffix}`);
      gridStage.appendChild(oldGrid);
      void gridEl.offsetWidth;
      gridEl.classList.add('is-animating');
      oldGrid.classList.add('is-animating');
      clearTimeout(monthAnimationTimer);
      let animationDone = false;
      const finishAnimation = () => {
        if (animationDone) return;
        animationDone = true;
        oldGrid.removeEventListener('transitionend', onTransitionEnd);
        oldGrid.remove();
        gridEl.className = gridEl.className.replace(/\s*cal-grid--month-enter-(next|prev)|\s*is-animating/g, '');
      };
      const onTransitionEnd = (event) => {
        if (event.target === oldGrid && event.propertyName === 'transform') finishAnimation();
      };
      oldGrid.addEventListener('transitionend', onTransitionEnd);
      monthAnimationTimer = setTimeout(finishAnimation, 310);
    }
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  root.querySelector('#btn-prev').addEventListener('click', () => {
    ({ year: currentYear, month: currentMonth } = prevMonth(currentYear, currentMonth));
    render(-1);
  });

  root.querySelector('#btn-next').addEventListener('click', () => {
    ({ year: currentYear, month: currentMonth } = nextMonth(currentYear, currentMonth));
    render(1);
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

  // Lock only deliberate horizontal gestures; vertical page scrolling remains native.
  let swipeStart = null;
  gridStage.addEventListener('pointerdown', (event) => {
    swipeStart = { x: event.clientX, y: event.clientY, locked: false };
  });
  gridStage.addEventListener('pointermove', (event) => {
    if (!swipeStart || swipeStart.locked) return;
    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
    swipeStart.locked = Math.abs(dx) > Math.abs(dy);
  });
  gridStage.addEventListener('pointerup', (event) => {
    if (!swipeStart) return;
    const dx = event.clientX - swipeStart.x;
    const horizontal = swipeStart.locked && Math.abs(dx) >= 48;
    swipeStart = null;
    if (!horizontal) return;
    if (dx < 0) {
      ({ year: currentYear, month: currentMonth } = nextMonth(currentYear, currentMonth));
      render(1);
    } else {
      ({ year: currentYear, month: currentMonth } = prevMonth(currentYear, currentMonth));
      render(-1);
    }
  });
  gridStage.addEventListener('pointercancel', () => { swipeStart = null; });
}
