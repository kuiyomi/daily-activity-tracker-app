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
  getWeekDays,
  getWeekRange,
  nextWeek,
  prevWeek,
  isSameWeek,
  formatWeekHeading,
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
  getCompletionsWithDetailsForDate,
  getDayEntry,
  setCompletion,
  setDayRained,
} from '../storage/storage.js';
import { ICONS, renderIconGlyph } from './icons.js';
import { renderActivityCheckRowHtml, formatActivitySubtitle } from './dayDetailView.js';
import '../version.js';

const CALENDAR_VIEW_KEY = 'calendar_view_mode';

function getStoredCalendarView() {
  try {
    const val = localStorage.getItem(CALENDAR_VIEW_KEY);
    return val === 'week' ? 'week' : 'month';
  } catch (_) {
    return 'month';
  }
}

function setStoredCalendarView(view) {
  try {
    localStorage.setItem(CALENDAR_VIEW_KEY, view);
  } catch (_) {}
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Initialises and mounts the calendar view.
 *
 * @param {HTMLElement} root – the element that will contain the calendar
 * @param {{ onDaySelect: (dateStr: string) => void }} options
 */
export async function mountCalendarView(root, { onDaySelect }) {
  const today = new Date();
  let currentYear = today.getFullYear();
  let currentMonth = today.getMonth();
  let currentWeekDate = new Date(today);
  let currentView = getStoredCalendarView();

  const formattedCaption = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(today);
  const todayCaption = formattedCaption.charAt(0).toUpperCase() + formattedCaption.slice(1);

  // ── Build the static skeleton ──────────────────────────────────────────────
  root.innerHTML = `
    <div class="screen-view calendar-screen">
      <header class="ios-nav-bar ios-nav-bar--with-action calendar-nav-header">
        <div class="calendar-nav-title-row">
          <h1 class="ios-large-title">${'Calendário'}</h1>
          <button class="ios-nav-action-btn is-visually-hidden" id="btn-today" aria-label="Voltar para o mês atual" aria-hidden="true" tabindex="-1">
            Hoje
          </button>
        </div>
        <div class="calendar-segment-wrapper">
          <div class="ios-segmented-control" role="tablist" aria-label="Visualização do calendário">
            <button
              type="button"
              class="ios-segment-btn ${currentView === 'month' ? 'active' : ''}"
              role="tab"
              id="seg-btn-month"
              aria-selected="${currentView === 'month'}"
              data-view="month"
            >
              Mês
            </button>
            <button
              type="button"
              class="ios-segment-btn ${currentView === 'week' ? 'active' : ''}"
              role="tab"
              id="seg-btn-week"
              aria-selected="${currentView === 'week'}"
              data-view="week"
            >
              Semana
            </button>
          </div>
        </div>
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

            <div class="cal-view-container" id="cal-view-container">
              <div class="cal-view cal-month-view" id="cal-month-view">
                <div class="cal-weekdays" role="row" aria-hidden="true"></div>
                <div class="cal-grid-stage" id="cal-grid-stage">
                  <div class="cal-grid" id="cal-grid" role="grid"></div>
                </div>
              </div>
              <div class="cal-view cal-week-view" id="cal-week-view" style="display: none;">
                <div class="cal-week-stage" id="cal-week-stage">
                  <div class="cal-week-list" id="cal-week-list" role="list"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Section: "Hoje" card (RF13) -->
        <div class="inset-section" id="today-section">
          <div class="inset-section-header today-section-header">
            <span class="today-section-title">Hoje</span>
            <span class="today-section-caption">${todayCaption}</span>
          </div>
          <div class="inset-group" id="today-card-content">
            <div class="inset-row empty-state-row">
              <span class="ios-spinner-text">Carregando...</span>
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
  const todayCardContent = root.querySelector('#today-card-content');
  const btnPrev = root.querySelector('#btn-prev');
  const btnNext = root.querySelector('#btn-next');
  const segMonthBtn = root.querySelector('#seg-btn-month');
  const segWeekBtn = root.querySelector('#seg-btn-week');
  const monthViewEl = root.querySelector('#cal-month-view');
  const weekViewEl = root.querySelector('#cal-week-view');
  const weekStage = root.querySelector('#cal-week-stage');
  const weekListEl = root.querySelector('#cal-week-list');
  const calendarCard = root.querySelector('.calendar-card');

  // ── Weekday header (rendered once) ────────────────────────────────────────
  weekdayLabels().forEach((label) => {
    const cell = document.createElement('div');
    cell.className = 'cal-weekday';
    cell.textContent = label;
    weekdaysEl.appendChild(cell);
  });

  // ── Render helpers ─────────────────────────────────────────────────────────
  let renderId = 0;
  let weekRenderId = 0;
  let monthAnimationTimer = null;
  let weekAnimationTimer = null;
  let cachedActivities = [];
  let cachedTodayCompletions = [];
  let cachedTodayEntry = null;

  async function updateTodayCellUI() {
    const todayStr = todayString();

    // 1. Month cell update
    const cell = gridEl.querySelector(`.cal-day[data-date="${todayStr}"]`);
    if (cell) {
      const completedIds = cachedTodayCompletions.map((c) => c.activityId);
      const hasCompletions = completedIds.length > 0;
      const rained = Boolean(cachedTodayEntry?.rained);
      const { dots, hasOverflow } = getDayDotIndicators(completedIds, cachedActivities, 4);

      cell.classList.toggle('cal-day--has-completions', hasCompletions);
      cell.classList.toggle('cal-day--rained', rained);

      const dotsHtml = dots
        .map((color) => `<span class="cal-dot" style="background-color: ${color};"></span>`)
        .join('');
      const moreHtml = hasOverflow ? `<span class="cal-dots-more">+</span>` : '';
      const rainSlot = cell.querySelector('.cal-day-rain');
      if (rainSlot) {
        if (rained) {
          rainSlot.setAttribute('role', 'img');
          rainSlot.setAttribute('aria-label', 'Choveu');
          rainSlot.removeAttribute('aria-hidden');
          rainSlot.innerHTML = ICONS['cloud-rain'];
        } else {
          rainSlot.removeAttribute('role');
          rainSlot.removeAttribute('aria-label');
          rainSlot.setAttribute('aria-hidden', 'true');
          rainSlot.innerHTML = '';
        }
      }
      const dotsSlot = cell.querySelector('.cal-day-dots');
      if (dotsSlot) {
        dotsSlot.innerHTML = `${dotsHtml}${moreHtml}`;
      }
      cell.setAttribute('aria-label', rained ? `${todayStr}, Choveu` : todayStr);
    }

    // 2. Week row update (if present)
    const weekRow = weekListEl.querySelector(`.cal-week-row[data-date="${todayStr}"]`);
    if (weekRow) {
      const activityMap = new Map(cachedActivities.map((a) => [a.id, a]));
      const badgesHtml = cachedTodayCompletions
        .map((comp) => {
          const act = activityMap.get(comp.activityId);
          if (!act) return '';
          return `
            <div class="activity-icon-badge activity-icon-badge--sm" style="background-color: ${act.color};" aria-hidden="true" title="${escapeHtml(act.name)}">
              ${renderIconGlyph(act.icon)}
            </div>
          `;
        })
        .filter(Boolean)
        .join('');

      const optionNames = [];
      for (const comp of cachedTodayCompletions) {
        const act = activityMap.get(comp.activityId);
        if (!act) continue;
        const subtitle = formatActivitySubtitle(act, comp.optionIds || []);
        if (subtitle) {
          optionNames.push(subtitle);
        }
      }
      const optionsText = optionNames.join(', ');
      const isRained = Boolean(cachedTodayEntry?.rained);

      const contentCol = weekRow.querySelector('.cal-week-content-col');
      if (contentCol) {
        contentCol.innerHTML = `
          ${badgesHtml ? `<div class="cal-week-badges">${badgesHtml}</div>` : ''}
          ${optionsText ? `<span class="cal-week-options-text">${escapeHtml(optionsText)}</span>` : ''}
        `;
      }
      const rainCol = weekRow.querySelector('.cal-week-rain-col');
      if (rainCol) {
        rainCol.innerHTML = isRained
          ? `<span class="cal-week-rain" role="img" aria-label="Choveu">${ICONS['cloud-rain']}</span>`
          : '';
      }
    }
  }

  async function renderTodayCard() {
    const todayStr = todayString();
    try {
      const [activities, completionsList, dayEntry] = await Promise.all([
        getActivities(),
        getCompletionsWithDetailsForDate(todayStr),
        getDayEntry(todayStr),
      ]);
      cachedActivities = activities;
      cachedTodayCompletions = completionsList;
      cachedTodayEntry = dayEntry;
    } catch (err) {
      console.error('Failed to load today card data', err);
    }

    if (cachedActivities.length === 0) {
      todayCardContent.innerHTML = `
        <div class="inset-row empty-state-row">
          <p class="empty-state-text">Nenhuma atividade ainda. Toque na aba Atividades para criar.</p>
        </div>
      `;
      return;
    }

    const completionMap = new Map(cachedTodayCompletions.map((c) => [c.activityId, c]));
    const isRained = Boolean(cachedTodayEntry?.rained);

    const rowsHtml = cachedActivities
      .map((act) => {
        const comp = completionMap.get(act.id);
        const isDone = Boolean(comp);
        const selectedOptionIds = comp?.optionIds || [];
        const subtitleText = formatActivitySubtitle(act, selectedOptionIds);
        return renderActivityCheckRowHtml(act, isDone, subtitleText, { showDetailsButton: true });
      })
      .join('');

    const rainedRowHtml = `
      <label class="inset-row toggle-row" for="today-card-rained-switch">
        <div class="toggle-row-left">
          <div class="activity-icon-badge rain-badge" style="background-color: var(--ios-blue);">
            ${ICONS['cloud-rain']}
          </div>
          <span class="toggle-label-title">Choveu</span>
        </div>
        <input
          type="checkbox"
          id="today-card-rained-switch"
          class="ios-switch"
          role="switch"
          aria-label="Choveu"
          ${isRained ? 'checked' : ''}
        />
      </label>
    `;

    todayCardContent.innerHTML = rowsHtml + rainedRowHtml;

    // Attach listeners
    todayCardContent.querySelectorAll('.activity-check-row').forEach((row) => {
      const toggle = async (e) => {
        // If clicking directly on the "Detalhes" button, navigate to day screen
        if (e.target.closest('.today-details-btn')) {
          e.stopPropagation();
          onDaySelect(todayStr);
          return;
        }

        const activityId = row.dataset.id;
        const currentlyDone = completionMap.has(activityId);
        const newDone = !currentlyDone;
        const act = cachedActivities.find((a) => a.id === activityId);

        if (newDone) {
          row.classList.add('activity-check-row--done');
          row.setAttribute('aria-checked', 'true');
          const newComp = {
            id: `${todayStr}:${activityId}`,
            date: todayStr,
            activityId,
            completedAt: Date.now(),
            optionIds: [],
          };
          completionMap.set(activityId, newComp);
          cachedTodayCompletions = Array.from(completionMap.values());

          const subtitleEl = row.querySelector(`#subtitle-${activityId}`);
          if (subtitleEl) subtitleEl.textContent = '';

          // Add Detalhes button if not present
          if (!row.querySelector('.today-details-btn')) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'today-details-btn';
            btn.dataset.actId = activityId;
            btn.setAttribute('aria-label', `Detalhes de ${act?.name || ''}`);
            btn.textContent = 'Detalhes';
            btn.addEventListener('click', (ev) => {
              ev.stopPropagation();
              onDaySelect(todayStr);
            });
            row.appendChild(btn);
          }

          try {
            await setCompletion(todayStr, activityId, true, []);
          } catch (err) {
            console.error('Erro ao marcar atividade hoje:', err);
          }
        } else {
          row.classList.remove('activity-check-row--done');
          row.setAttribute('aria-checked', 'false');
          completionMap.delete(activityId);
          cachedTodayCompletions = Array.from(completionMap.values());

          const subtitleEl = row.querySelector(`#subtitle-${activityId}`);
          if (subtitleEl) subtitleEl.textContent = '';

          const detailsBtn = row.querySelector('.today-details-btn');
          if (detailsBtn) detailsBtn.remove();

          try {
            await setCompletion(todayStr, activityId, false, []);
          } catch (err) {
            console.error('Erro ao desmarcar atividade hoje:', err);
          }
        }

        updateTodayCellUI();
      };

      row.addEventListener('click', toggle);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle(e);
        }
      });
    });

    // Detalhes buttons inside activity rows
    todayCardContent.querySelectorAll('.today-details-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onDaySelect(todayStr);
      });
    });

    // Rain switch
    const switchEl = todayCardContent.querySelector('#today-card-rained-switch');
    if (switchEl) {
      switchEl.addEventListener('change', async () => {
        const rained = switchEl.checked;
        if (!cachedTodayEntry) cachedTodayEntry = { date: todayStr };
        cachedTodayEntry.rained = rained;
        updateTodayCellUI();
        try {
          await setDayRained(todayStr, rained);
        } catch (err) {
          console.error('Falha ao salvar status de chuva hoje:', err);
        }
      });
    }
  }

  async function render(direction = 0) {
    const id = ++renderId;
    const oldGrid = direction && gridEl.childElementCount ? gridEl.cloneNode(true) : null;
    titleEl.textContent = formatMonthHeading(currentYear, currentMonth);
    btnPrev.setAttribute('aria-label', 'Mês anterior');
    btnNext.setAttribute('aria-label', 'Próximo mês');
    gridEl.innerHTML = '';

    // Toggle "Hoje" button visibility: show when not viewing current month
    const isCurrentMonthView = currentYear === today.getFullYear() && currentMonth === today.getMonth();
    if (todayBtn) {
      todayBtn.classList.toggle('is-visually-hidden', isCurrentMonthView);
      todayBtn.setAttribute('aria-hidden', String(isCurrentMonthView));
      todayBtn.setAttribute('aria-label', 'Voltar para o mês atual');
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

  async function renderWeek(direction = 0) {
    const id = ++weekRenderId;
    const oldWeekList = direction && weekListEl.childElementCount ? weekListEl.cloneNode(true) : null;

    const weekRange = getWeekRange(currentWeekDate);
    titleEl.textContent = formatWeekHeading(weekRange.start, weekRange.end);
    btnPrev.setAttribute('aria-label', 'Semana anterior');
    btnNext.setAttribute('aria-label', 'Próxima semana');

    // Toggle "Hoje" button visibility: show when not viewing current week
    const isCurrentWeek = isSameWeek(currentWeekDate, today);
    if (todayBtn) {
      todayBtn.classList.toggle('is-visually-hidden', isCurrentWeek);
      todayBtn.setAttribute('aria-hidden', String(isCurrentWeek));
      todayBtn.setAttribute('aria-label', 'Voltar para a semana atual');
      todayBtn.tabIndex = isCurrentWeek ? -1 : 0;
    }

    weekListEl.innerHTML = '';

    const todayStr = todayString();
    const startDateStr = weekRange.startDateStr;
    const endDateStr = weekRange.endDateStr;

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
      console.error('Failed to fetch completions/activities/day entries for week', err);
    }

    if (id !== weekRenderId) return;

    weekStage.querySelectorAll('.cal-week-list--leaving').forEach((list) => list.remove());
    weekListEl.className = 'cal-week-list';

    const activityMap = new Map(activities.map((a) => [a.id, a]));
    const completionsByDate = {};
    for (const c of completions) {
      if (!completionsByDate[c.date]) completionsByDate[c.date] = [];
      completionsByDate[c.date].push(c);
    }
    const rainyDates = rainedDateSet(dayEntries);
    const weekdayNames = weekdayLabels();

    weekRange.days.forEach((date) => {
      const dateStr = toDateString(date);
      const isToday = dateStr === todayStr;
      const rained = rainyDates.has(dateStr);
      const dayComps = completionsByDate[dateStr] || [];

      // Badges: 24px icon badges in order of completions
      const badgesHtml = dayComps
        .map((comp) => {
          const act = activityMap.get(comp.activityId);
          if (!act) return '';
          return `
            <div class="activity-icon-badge activity-icon-badge--sm" style="background-color: ${act.color};" aria-hidden="true" title="${escapeHtml(act.name)}">
              ${renderIconGlyph(act.icon)}
            </div>
          `;
        })
        .filter(Boolean)
        .join('');

      // Option subtitle text: e.g. "Peito, Tríceps"
      const optionNames = [];
      for (const comp of dayComps) {
        const act = activityMap.get(comp.activityId);
        if (!act) continue;
        const subtitle = formatActivitySubtitle(act, comp.optionIds || []);
        if (subtitle) {
          optionNames.push(subtitle);
        }
      }
      const optionsText = optionNames.join(', ');

      const rowBtn = document.createElement('button');
      rowBtn.type = 'button';
      rowBtn.className = [
        'cal-week-row',
        isToday ? 'cal-week-row--today' : '',
      ].filter(Boolean).join(' ');
      rowBtn.setAttribute('data-date', dateStr);
      if (isToday) rowBtn.setAttribute('aria-current', 'date');

      let ariaLabel = dateStr;
      if (dayComps.length > 0) {
        const actsDone = dayComps.map((c) => activityMap.get(c.activityId)?.name).filter(Boolean).join(', ');
        if (actsDone) ariaLabel += `, ${actsDone}`;
        if (optionsText) ariaLabel += ` (${optionsText})`;
      }
      if (rained) ariaLabel += ', Choveu';
      rowBtn.setAttribute('aria-label', ariaLabel);

      rowBtn.innerHTML = `
        <div class="cal-week-day-col">
          <span class="cal-week-weekday">${weekdayNames[date.getDay()]}</span>
          <span class="cal-week-day-num ${isToday ? 'cal-week-day-num--today' : ''}">${date.getDate()}</span>
        </div>
        <div class="cal-week-content-col">
          ${badgesHtml ? `<div class="cal-week-badges">${badgesHtml}</div>` : ''}
          ${optionsText ? `<span class="cal-week-options-text">${escapeHtml(optionsText)}</span>` : ''}
        </div>
        <div class="cal-week-rain-col">
          ${rained ? `<span class="cal-week-rain" role="img" aria-label="Choveu">${ICONS['cloud-rain']}</span>` : ''}
        </div>
      `;

      rowBtn.addEventListener('click', () => onDaySelect(dateStr));
      weekListEl.appendChild(rowBtn);
    });

    if (oldWeekList) {
      const suffix = direction > 0 ? 'next' : 'prev';
      oldWeekList.id = '';
      oldWeekList.className = `cal-week-list cal-week-list--leaving cal-week-list--leave-${suffix}`;
      weekListEl.classList.add(`cal-week-list--enter-${suffix}`);
      weekStage.appendChild(oldWeekList);
      void weekListEl.offsetWidth;
      weekListEl.classList.add('is-animating');
      oldWeekList.classList.add('is-animating');
      clearTimeout(weekAnimationTimer);
      let animationDone = false;
      const finishAnimation = () => {
        if (animationDone) return;
        animationDone = true;
        oldWeekList.removeEventListener('transitionend', onTransitionEnd);
        oldWeekList.remove();
        weekListEl.className = weekListEl.className.replace(/\s*cal-week-list--enter-(next|prev)|\s*is-animating/g, '');
      };
      const onTransitionEnd = (event) => {
        if (event.target === oldWeekList && event.propertyName === 'transform') finishAnimation();
      };
      oldWeekList.addEventListener('transitionend', onTransitionEnd);
      weekAnimationTimer = setTimeout(finishAnimation, 310);
    }
  }

  // ── Switch View (Month / Week) ────────────────────────────────────────────
  async function switchView(targetView) {
    if (targetView === currentView) return;
    const oldView = currentView;
    currentView = targetView;
    setStoredCalendarView(currentView);

    segMonthBtn.classList.toggle('active', currentView === 'month');
    segMonthBtn.setAttribute('aria-selected', String(currentView === 'month'));
    segWeekBtn.classList.toggle('active', currentView === 'week');
    segWeekBtn.setAttribute('aria-selected', String(currentView === 'week'));

    const outgoing = oldView === 'month' ? monthViewEl : weekViewEl;
    const incoming = currentView === 'month' ? monthViewEl : weekViewEl;

    // Render target view data
    if (currentView === 'week') {
      if (currentWeekDate.getFullYear() !== currentYear || currentWeekDate.getMonth() !== currentMonth) {
        currentWeekDate = new Date(currentYear, currentMonth, 1);
      }
      await renderWeek(0);
    } else {
      currentYear = currentWeekDate.getFullYear();
      currentMonth = currentWeekDate.getMonth();
      await render(0);
    }

    outgoing.classList.remove('cal-view--fade-in', 'is-animating');
    incoming.classList.remove('cal-view--fade-out', 'is-animating');

    outgoing.classList.add('cal-view--fade-out');
    incoming.style.display = '';
    incoming.classList.add('cal-view--fade-in');
    void incoming.offsetWidth;
    outgoing.classList.add('is-animating');
    incoming.classList.add('is-animating');

    setTimeout(() => {
      outgoing.style.display = 'none';
      outgoing.classList.remove('cal-view--fade-out', 'is-animating');
      incoming.classList.remove('cal-view--fade-in', 'is-animating');
    }, 200);
  }

  segMonthBtn.addEventListener('click', () => switchView('month'));
  segWeekBtn.addEventListener('click', () => switchView('week'));

  // ── Navigation ────────────────────────────────────────────────────────────
  btnPrev.addEventListener('click', () => {
    if (currentView === 'week') {
      currentWeekDate = prevWeek(currentWeekDate);
      currentYear = currentWeekDate.getFullYear();
      currentMonth = currentWeekDate.getMonth();
      renderWeek(-1);
    } else {
      ({ year: currentYear, month: currentMonth } = prevMonth(currentYear, currentMonth));
      render(-1);
    }
  });

  btnNext.addEventListener('click', () => {
    if (currentView === 'week') {
      currentWeekDate = nextWeek(currentWeekDate);
      currentYear = currentWeekDate.getFullYear();
      currentMonth = currentWeekDate.getMonth();
      renderWeek(1);
    } else {
      ({ year: currentYear, month: currentMonth } = nextMonth(currentYear, currentMonth));
      render(1);
    }
  });

  if (todayBtn) {
    todayBtn.addEventListener('click', () => {
      if (currentView === 'week') {
        currentWeekDate = new Date(today);
        currentYear = today.getFullYear();
        currentMonth = today.getMonth();
        renderWeek();
      } else {
        currentYear = today.getFullYear();
        currentMonth = today.getMonth();
        currentWeekDate = new Date(today);
        render();
      }
    });
  }

  // Initial paint
  if (currentView === 'week') {
    monthViewEl.style.display = 'none';
    weekViewEl.style.display = '';
    await Promise.all([renderWeek(), renderTodayCard()]);
  } else {
    monthViewEl.style.display = '';
    weekViewEl.style.display = 'none';
    await Promise.all([render(), renderTodayCard()]);
  }

  // Lock only deliberate horizontal gestures; vertical page scrolling remains native.
  let swipeStart = null;
  calendarCard.addEventListener('pointerdown', (event) => {
    if (event.target.closest('#btn-prev, #btn-next')) return;
    swipeStart = { x: event.clientX, y: event.clientY, locked: false };
  });
  calendarCard.addEventListener('pointermove', (event) => {
    if (!swipeStart || swipeStart.locked) return;
    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
    swipeStart.locked = Math.abs(dx) > Math.abs(dy);
  });
  calendarCard.addEventListener('pointerup', (event) => {
    if (!swipeStart) return;
    const dx = event.clientX - swipeStart.x;
    const horizontal = swipeStart.locked && Math.abs(dx) >= 48;
    swipeStart = null;
    if (!horizontal) return;
    if (currentView === 'week') {
      if (dx < 0) {
        currentWeekDate = nextWeek(currentWeekDate);
        currentYear = currentWeekDate.getFullYear();
        currentMonth = currentWeekDate.getMonth();
        renderWeek(1);
      } else {
        currentWeekDate = prevWeek(currentWeekDate);
        currentYear = currentWeekDate.getFullYear();
        currentMonth = currentWeekDate.getMonth();
        renderWeek(-1);
      }
    } else {
      if (dx < 0) {
        ({ year: currentYear, month: currentMonth } = nextMonth(currentYear, currentMonth));
        render(1);
      } else {
        ({ year: currentYear, month: currentMonth } = prevMonth(currentYear, currentMonth));
        render(-1);
      }
    }
  });
  calendarCard.addEventListener('pointercancel', () => { swipeStart = null; });
}
