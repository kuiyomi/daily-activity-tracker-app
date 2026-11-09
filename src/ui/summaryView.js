/**
 * summaryView.js – Monthly summary screen (RF10).
 * Displays monthly statistics:
 *  - Month navigation with ‹ › and reserved-space "Hoje" button, swipe and slide animation.
 *  - Card (a): Stat tiles: "Dias ativos", "Dias de chuva", "Plano cumprido".
 *  - Card (b): "Por atividade": grouped list with icon badge, name, "N dias" and proportional thin bar.
 *  - Card (c): "Planejamento": Feitas, Não feitas, Pendentes (orange), A fazer,
 *              plus "Não feitas em dias de chuva" if > 0. Tapping Pendentes opens earliest pending day.
 *  - Card (d): Empty state "Sem registros neste mês." when there are no records.
 */

import {
  todayString,
  firstDayOfMonth,
  lastDayOfMonth,
  toDateString,
  formatMonthHeading,
  nextMonth,
  prevMonth,
} from '../logic/dateUtils.js';
import {
  getDayEntriesForDateRange,
  getCompletionsForDateRange,
  getActivities,
} from '../storage/storage.js';
import {
  computeMonthlyStats,
  computeActivityMonthlyStats,
  computeActivityOptionStats,
  getActivityNotesForMonth,
} from '../logic/stats.js';
import { ICONS, renderIconGlyph } from './icons.js';
import '../version.js';

const APP_VERSION = self.APP_VERSION;
const APP_NAME = self.APP_NAME || 'Agenda';

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Mounts the summary view into `root`.
 * @param {HTMLElement} root
 * @param {{ onDaySelect?: (dateStr: string) => void }} [options]
 */
export async function mountSummaryView(root, options = {}) {
  const onDaySelect = typeof options?.onDaySelect === 'function' ? options.onDaySelect : () => {};
  const onActivitySelect = typeof options?.onActivitySelect === 'function' ? options.onActivitySelect : () => {};

  const today = new Date();
  let currentYear = typeof options?.initialYear === 'number' ? options.initialYear : today.getFullYear();
  let currentMonth = typeof options?.initialMonth === 'number' ? options.initialMonth : today.getMonth(); // 0-based
  let renderId = 0;
  let animationTimer = null;

  root.innerHTML = `
    <div class="screen-view summary-screen">
      <header class="ios-nav-bar ios-nav-bar--with-action summary-nav-header">
        <div class="calendar-nav-title-row">
          <h1 class="ios-large-title">Resumo</h1>
          <button
            class="ios-nav-action-btn is-visually-hidden"
            id="summary-btn-today"
            aria-label="Voltar para o mês atual"
            aria-hidden="true"
            tabindex="-1"
          >
            Hoje
          </button>
        </div>
      </header>

      <main class="screen-content summary-screen-content">
        <!-- Month navigation card -->
        <div class="inset-section summary-nav-section">
          <div class="inset-group summary-nav-card">
            <header class="cal-nav-bar">
              <button class="ios-icon-btn nav-btn" id="summary-btn-prev" aria-label="Mês anterior">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </button>
              <h2 class="cal-title" id="summary-cal-title"></h2>
              <button class="ios-icon-btn nav-btn" id="summary-btn-next" aria-label="Próximo mês">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
            </header>
          </div>
        </div>

        <!-- Main summary cards container with slide animation stage -->
        <div class="summary-stage" id="summary-stage">
          <div class="summary-body" id="summary-body"></div>
        </div>

        <footer class="app-version-footer">
          <p>${APP_NAME}</p>
          <p class="version-code">Versão ${APP_VERSION}</p>
        </footer>
      </main>
    </div>
  `;

  const titleEl = root.querySelector('#summary-cal-title');
  const todayBtn = root.querySelector('#summary-btn-today');
  const btnPrev = root.querySelector('#summary-btn-prev');
  const btnNext = root.querySelector('#summary-btn-next');
  const stageEl = root.querySelector('#summary-stage');
  const bodyEl = root.querySelector('#summary-body');
  const screenContent = root.querySelector('.summary-screen-content');

  function renderSummaryContent(stats, activities) {
    const isEmpty =
      stats.activeDays === 0 &&
      stats.rainDays === 0 &&
      stats.plan.done === 0 &&
      stats.plan.missed === 0 &&
      stats.plan.pending === 0 &&
      stats.plan.upcoming === 0;

    if (isEmpty) {
      return `
        <div class="inset-section">
          <div class="inset-group summary-empty-card">
            <p class="summary-empty-text">Sem registros neste mês.</p>
          </div>
        </div>
      `;
    }

    // Card (a): Stat tiles
    const adherenceValue =
      stats.adherence !== null ? `${Math.round(stats.adherence * 100)}%` : '—';

    const tilesHtml = `
      <div class="inset-section">
        <div class="inset-group summary-stat-tiles-group">
          <div class="summary-stat-tile" id="summary-tile-active">
            <span class="summary-stat-value" id="stat-active-days">${stats.activeDays}</span>
            <span class="summary-stat-label">Dias ativos</span>
          </div>
          <div class="summary-stat-tile" id="summary-tile-rain">
            <span class="summary-stat-value" id="stat-rain-days">${stats.rainDays}</span>
            <span class="summary-stat-label">Dias de chuva</span>
          </div>
          <div class="summary-stat-tile" id="summary-tile-adherence">
            <span class="summary-stat-value" id="stat-adherence">${adherenceValue}</span>
            <span class="summary-stat-label">Plano cumprido</span>
          </div>
        </div>
      </div>
    `;

    // Card (b): Por atividade
    const activityMap = new Map((activities || []).map((a) => [a.id, a]));
    const activeActivities = Object.entries(stats.doneByActivity || {})
      .map(([id, days]) => {
        const act = activityMap.get(id) || {
          id,
          name: id,
          color: '#007aff',
          icon: 'barbell',
        };
        return { ...act, days };
      })
      .filter((a) => a.days > 0)
      .sort((a, b) => b.days - a.days || a.name.localeCompare(b.name));

    let activitiesCardHtml = '';
    if (activeActivities.length > 0) {
      const maxDays = Math.max(...activeActivities.map((a) => a.days), 1);
      const rows = activeActivities
        .map((act) => {
          const pct = Math.max(4, Math.round((act.days / maxDays) * 100));
          const countLabel = act.days === 1 ? '1 dia' : `${act.days} dias`;
          return `
            <div
              class="inset-row summary-activity-row is-interactive"
              data-activity-id="${escapeHtml(act.id)}"
              role="button"
              tabindex="0"
              aria-label="${escapeHtml(act.name)}: ${countLabel}. Toque para ver detalhes"
            >
              <div class="activity-icon-badge" style="background-color: ${act.color};" aria-hidden="true">
                ${renderIconGlyph(act.icon)}
              </div>
              <div class="summary-activity-content">
                <div class="summary-activity-header">
                  <span class="summary-activity-name">${escapeHtml(act.name)}</span>
                  <span class="summary-activity-count">${countLabel}</span>
                </div>
                <div class="summary-activity-bar-track" aria-hidden="true">
                  <div class="summary-activity-bar-fill" style="width: ${pct}%; background-color: ${act.color};"></div>
                </div>
              </div>
              <svg class="summary-row-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </div>
          `;
        })
        .join('');

      activitiesCardHtml = `
        <div class="inset-section">
          <div class="inset-section-header">Por atividade</div>
          <div class="inset-group summary-activities-group">
            ${rows}
          </div>
        </div>
      `;
    }

    // Card (c): Planejamento
    const pendingHtml =
      stats.plan.pending > 0 && stats.earliestPendingDate
        ? `
          <button
            type="button"
            class="inset-row inset-row-info summary-pending-row is-interactive"
            id="plan-row-pending"
            data-date="${stats.earliestPendingDate}"
            aria-label="Pendentes: ${stats.plan.pending}. Toque para abrir o dia pendente mais antigo"
          >
            <span class="inset-row-info-label">Pendentes</span>
            <div class="summary-pending-value-wrap">
              <span class="inset-row-info-value summary-pending-orange">${stats.plan.pending}</span>
              <svg class="summary-row-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </div>
          </button>
        `
        : `
          <div class="inset-row inset-row-info summary-pending-row">
            <span class="inset-row-info-label">Pendentes</span>
            <span class="inset-row-info-value summary-pending-orange">${stats.plan.pending}</span>
          </div>
        `;

    const missedOnRainHtml =
      stats.missedOnRainDays > 0
        ? `
          <div class="inset-row inset-row-info" id="plan-row-missed-rain">
            <span class="inset-row-info-label">Não feitas em dias de chuva</span>
            <span class="inset-row-info-value" id="stat-missed-rain">${stats.missedOnRainDays}</span>
          </div>
        `
        : '';

    const planningCardHtml = `
      <div class="inset-section">
        <div class="inset-section-header">Planejamento</div>
        <div class="inset-group summary-planning-group">
          <div class="inset-row inset-row-info">
            <span class="inset-row-info-label">Feitas</span>
            <span class="inset-row-info-value" id="stat-plan-done">${stats.plan.done}</span>
          </div>
          <div class="inset-row inset-row-info">
            <span class="inset-row-info-label">Não feitas</span>
            <span class="inset-row-info-value" id="stat-plan-missed">${stats.plan.missed}</span>
          </div>
          ${pendingHtml}
          <div class="inset-row inset-row-info">
            <span class="inset-row-info-label">A fazer</span>
            <span class="inset-row-info-value" id="stat-plan-upcoming">${stats.plan.upcoming}</span>
          </div>
          ${missedOnRainHtml}
        </div>
      </div>
    `;

    return tilesHtml + activitiesCardHtml + planningCardHtml;
  }

  async function render(direction = 0) {
    const id = ++renderId;
    const oldBody = direction && bodyEl.childElementCount ? bodyEl.cloneNode(true) : null;

    titleEl.textContent = formatMonthHeading(currentYear, currentMonth);

    // Toggle "Hoje" button visibility: show when not viewing current month
    const isCurrentMonthView =
      currentYear === today.getFullYear() && currentMonth === today.getMonth();
    if (todayBtn) {
      todayBtn.classList.toggle('is-visually-hidden', isCurrentMonthView);
      todayBtn.setAttribute('aria-hidden', String(isCurrentMonthView));
      todayBtn.tabIndex = isCurrentMonthView ? -1 : 0;
    }

    const firstDate = firstDayOfMonth(currentYear, currentMonth);
    const lastDate = lastDayOfMonth(currentYear, currentMonth);
    const startDateStr = toDateString(firstDate);
    const endDateStr = toDateString(lastDate);

    let completions = [];
    let dayEntries = [];
    let activities = [];

    try {
      [completions, dayEntries, activities] = await Promise.all([
        getCompletionsForDateRange(startDateStr, endDateStr),
        getDayEntriesForDateRange(startDateStr, endDateStr),
        getActivities(),
      ]);
    } catch (err) {
      console.error('Failed to load summary range data', err);
    }

    if (id !== renderId) return;

    stageEl.querySelectorAll('.summary-body--leaving').forEach((el) => el.remove());
    bodyEl.className = 'summary-body';

    const todayStr = todayString();
    const stats = computeMonthlyStats(completions, dayEntries, {
      year: currentYear,
      month: currentMonth,
      todayStr,
    });

    bodyEl.innerHTML = renderSummaryContent(stats, activities);

    // Wire up pending button click if interactive
    const pendingBtn = bodyEl.querySelector('#plan-row-pending');
    if (pendingBtn) {
      pendingBtn.addEventListener('click', () => {
        const dateStr = pendingBtn.dataset.date;
        if (dateStr) onDaySelect(dateStr);
      });
    }

    // Wire up activity rows click to push activity detail screen
    bodyEl.querySelectorAll('.summary-activity-row').forEach((row) => {
      const actId = row.dataset.activityId;
      if (!actId) return;
      const trigger = () => onActivitySelect(actId, { year: currentYear, month: currentMonth });
      row.addEventListener('click', trigger);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          trigger();
        }
      });
    });

    // Month slide animation
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (oldBody && !prefersReducedMotion) {
      const suffix = direction > 0 ? 'next' : 'prev';
      oldBody.id = '';
      oldBody.className = `summary-body summary-body--leaving summary-body--leave-${suffix}`;
      bodyEl.classList.add(`summary-body--enter-${suffix}`);
      stageEl.appendChild(oldBody);

      void bodyEl.offsetWidth; // Force layout
      bodyEl.classList.add('is-animating');
      oldBody.classList.add('is-animating');

      clearTimeout(animationTimer);
      let animationDone = false;
      const finishAnimation = () => {
        if (animationDone) return;
        animationDone = true;
        oldBody.remove();
        bodyEl.className = 'summary-body';
      };

      animationTimer = setTimeout(finishAnimation, 280);
      bodyEl.addEventListener('transitionend', finishAnimation, { once: true });
    }
  }

  // ── Month navigation events ────────────────────────────────────────────────
  btnPrev.addEventListener('click', () => {
    ({ year: currentYear, month: currentMonth } = prevMonth(currentYear, currentMonth));
    render(-1);
  });

  btnNext.addEventListener('click', () => {
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

  // ── Swipe gestures matching calendar ───────────────────────────────────────
  let swipeStart = null;
  const gestureContainer = stageEl || screenContent;

  gestureContainer.addEventListener('pointerdown', (event) => {
    if (event.target.closest('#summary-btn-prev, #summary-btn-next, #summary-btn-today, #plan-row-pending')) {
      return;
    }
    swipeStart = { x: event.clientX, y: event.clientY, locked: false };
  });

  gestureContainer.addEventListener('pointermove', (event) => {
    if (!swipeStart || swipeStart.locked) return;
    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
    swipeStart.locked = Math.abs(dx) > Math.abs(dy);
  });

  gestureContainer.addEventListener('pointerup', (event) => {
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

  gestureContainer.addEventListener('pointercancel', () => {
    swipeStart = null;
  });

  // Initial paint
  await render();
}

/**
 * Mounts the activity detail summary view (drill-down from Resumo).
 * Pushed screen with activity's name as title (back chevron, tab bar visible).
 * Cards:
 * (a) "Neste mês": days done, planned, não feitas for this activity;
 * (b) one grouped card per detail group, titled with the group's name,
 *     listing its options with the number of days selected in the month and a thin bar,
 *     sorted descending, only options with at least one day (archived options are counted);
 * (c) "Observações" (only if the activity allows notes and has some this month):
 *     the date and note text of each entry, newest first; tapping one opens that day's screen.
 *
 * @param {HTMLElement} root
 * @param {string} activityId
 * @param {{
 *   year?: number,
 *   month?: number,
 *   onBack?: () => void,
 *   onDaySelect?: (dateStr: string) => void,
 * }} [options]
 */
export async function mountSummaryActivityView(root, activityId, options = {}) {
  const onBack = typeof options?.onBack === 'function' ? options.onBack : () => {};
  const onDaySelect = typeof options?.onDaySelect === 'function' ? options.onDaySelect : () => {};

  const today = new Date();
  const year = typeof options?.year === 'number' ? options.year : today.getFullYear();
  const month = typeof options?.month === 'number' ? options.month : today.getMonth();

  const firstDate = firstDayOfMonth(year, month);
  const lastDate = lastDayOfMonth(year, month);
  const startDateStr = toDateString(firstDate);
  const endDateStr = toDateString(lastDate);

  let activities = [];
  let completions = [];

  try {
    [activities, completions] = await Promise.all([
      getActivities(),
      getCompletionsForDateRange(startDateStr, endDateStr),
    ]);
  } catch (err) {
    console.error('Failed to load activity summary data', err);
  }

  const activity = activities.find((a) => a.id === activityId) || {
    id: activityId,
    name: 'Atividade',
    color: '#007aff',
    icon: 'barbell',
    groups: [],
    allowsNote: false,
  };

  const monthStats = computeActivityMonthlyStats(completions, activityId, { year, month });
  const detailGroups = computeActivityOptionStats(completions, activity, { year, month });
  const notes = activity.allowsNote
    ? getActivityNotesForMonth(completions, activityId, { year, month })
    : [];

  function formatObservationDate(dateStr) {
    if (typeof dateStr !== 'string') return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const raw = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
    }).format(dateObj);
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  // Card (a): Neste mês
  const cardMonthHtml = `
    <div class="inset-section" id="summary-act-card-month">
      <div class="inset-section-header">Neste mês</div>
      <div class="inset-group">
        <div class="inset-row inset-row-info">
          <span class="inset-row-info-label">Feitas</span>
          <span class="inset-row-info-value" id="stat-act-done">${monthStats.done}</span>
        </div>
        <div class="inset-row inset-row-info">
          <span class="inset-row-info-label">Planejadas</span>
          <span class="inset-row-info-value" id="stat-act-planned">${monthStats.planned}</span>
        </div>
        <div class="inset-row inset-row-info">
          <span class="inset-row-info-label">Não feitas</span>
          <span class="inset-row-info-value" id="stat-act-missed">${monthStats.missed}</span>
        </div>
      </div>
    </div>
  `;

  // Card (b): Detail groups
  const cardGroupsHtml = detailGroups
    .map((grp) => {
      const rows = grp.options
        .map((opt) => {
          const countLabel = opt.days === 1 ? '1 dia' : `${opt.days} dias`;
          return `
            <div class="inset-row summary-option-row" data-option-id="${escapeHtml(opt.id)}">
              <div class="summary-activity-content">
                <div class="summary-activity-header">
                  <span class="summary-activity-name">${escapeHtml(opt.name)}</span>
                  <span class="summary-activity-count">${countLabel}</span>
                </div>
                <div class="summary-activity-bar-track" aria-hidden="true">
                  <div class="summary-activity-bar-fill" style="width: ${opt.pct}%; background-color: ${activity.color || 'var(--ios-blue)'};"></div>
                </div>
              </div>
            </div>
          `;
        })
        .join('');

      return `
        <div class="inset-section summary-group-card" data-group-id="${escapeHtml(grp.id)}">
          <div class="inset-section-header">${escapeHtml(grp.name)}</div>
          <div class="inset-group">
            ${rows}
          </div>
        </div>
      `;
    })
    .join('');

  // Card (c): Observações (only if allowsNote and has notes this month)
  let cardNotesHtml = '';
  if (activity.allowsNote && notes.length > 0) {
    const noteRows = notes
      .map((item) => {
        const formattedDate = formatObservationDate(item.date);
        return `
          <button
            type="button"
            class="inset-row summary-note-row is-interactive"
            data-date="${escapeHtml(item.date)}"
            aria-label="Abrir dia ${escapeHtml(formattedDate)}"
          >
            <div class="summary-note-content">
              <span class="summary-note-date">${escapeHtml(formattedDate)}</span>
              <p class="summary-note-text">${escapeHtml(item.note)}</p>
            </div>
            <svg class="summary-row-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        `;
      })
      .join('');

    cardNotesHtml = `
      <div class="inset-section summary-notes-card" id="summary-act-card-notes">
        <div class="inset-section-header">Observações</div>
        <div class="inset-group">
          ${noteRows}
        </div>
      </div>
    `;
  }

  root.innerHTML = `
    <div class="screen-view summary-activity-screen">
      <header class="ios-nav-bar ios-nav-bar--pushed">
        <button type="button" class="ios-back-btn" id="btn-back-activity-summary" aria-label="Voltar para Resumo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          <span>Resumo</span>
        </button>
        <h1 class="ios-nav-title" id="summary-activity-title">${escapeHtml(activity.name)}</h1>
        <div style="width: 44px; min-width: 44px;" aria-hidden="true"></div>
      </header>

      <main class="screen-content summary-screen-content">
        ${cardMonthHtml}
        ${cardGroupsHtml}
        ${cardNotesHtml}
      </main>
    </div>
  `;

  const btnBack = root.querySelector('#btn-back-activity-summary');
  if (btnBack) {
    btnBack.addEventListener('click', () => onBack());
  }

  root.querySelectorAll('.summary-note-row').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dateStr = btn.dataset.date;
      if (dateStr) onDaySelect(dateStr);
    });
  });
}

