/**
 * recordsView.js – Generic list screen "Registros".
 * Pushed screen taking a filter { status | blockedByRain | pending | upcoming, period (month or all), optional activityId }.
 * Displays:
 *  - iOS pushed nav bar with back chevron
 *  - Total count at the top
 *  - Optional "Por opção" grouped card (when blockedByRain filter is active)
 *  - Grouped card per date (pt-BR date header) with activity rows
 *  - Pending items open status sheet in place and reload; other items open day detail
 *  - Plain pt-BR empty state
 */

import {
  todayString,
  firstDayOfMonth,
  lastDayOfMonth,
  toDateString,
} from '../logic/dateUtils.js';
import {
  getActivities,
  getCompletionsForDateRange,
  getDayEntry,
  setDayRained,
  saveCompletion,
  deleteCompletion,
} from '../storage/storage.js';
import {
  plannedToDone,
  plannedToMissed,
  plannedToNone,
} from '../logic/activityLogic.js';
import { computeImpededOptionsStats } from '../logic/stats.js';
import { ICONS, renderIconGlyph } from './icons.js';
import {
  formatActivitySubtitle,
  openPlannedStatusSheet,
} from './dayDetailView.js';

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateHeading(dateStr) {
  if (typeof dateStr !== 'string') return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const raw = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dateObj);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/**
 * Mounts the generic list screen "Registros".
 *
 * @param {HTMLElement} root
 * @param {{
 *   filter: {
 *     status?: string,
 *     blockedByRain?: boolean,
 *     pending?: boolean,
 *     upcoming?: boolean,
 *     type?: string,
 *     period?: 'month' | 'all',
 *     year?: number,
 *     month?: number,
 *     activityId?: string,
 *     wasPlanned?: boolean,
 *     title?: string,
 *   },
 *   onBack?: () => void,
 *   onDaySelect?: (dateStr: string) => void,
 *   backLabel?: string,
 * }} options
 */
export async function mountRecordsView(root, options = {}) {
  const filter = options.filter || {};
  const onBack = typeof options.onBack === 'function' ? options.onBack : () => {};
  const onDaySelect = typeof options.onDaySelect === 'function' ? options.onDaySelect : () => {};
  const backLabel = options.backLabel || 'Resumo';

  const isPending = Boolean(filter.pending || filter.type === 'pending');
  const isUpcoming = Boolean(filter.upcoming || filter.type === 'upcoming');
  const isBlockedByRain = Boolean(filter.blockedByRain || filter.type === 'blockedByRain');
  const statusFilter = filter.status || (filter.type === 'done' || filter.type === 'missed' ? filter.type : null);

  let screenTitle = filter.title;
  if (!screenTitle) {
    if (isBlockedByRain) {
      screenTitle = 'Atividades impedidas';
    } else if (isPending) {
      screenTitle = 'Pendentes';
    } else if (isUpcoming) {
      screenTitle = 'A fazer';
    } else if (statusFilter === 'done') {
      screenTitle = 'Feitas';
    } else if (statusFilter === 'missed') {
      screenTitle = 'Não feitas';
    } else {
      screenTitle = 'Registros';
    }
  }

  root.innerHTML = `
    <div class="screen-view records-screen">
      <header class="ios-nav-bar ios-nav-bar--pushed">
        <button type="button" class="ios-back-btn" id="btn-back-records" aria-label="Voltar para ${escapeHtml(backLabel)}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          <span>${escapeHtml(backLabel)}</span>
        </button>
        <h1 class="ios-nav-title" id="records-screen-title">${escapeHtml(screenTitle)}</h1>
        <div style="width: 44px; min-width: 44px;" aria-hidden="true"></div>
      </header>

      <main class="screen-content records-screen-content" id="records-main-content">
        <div class="records-loading">
          <span class="ios-spinner-text">Carregando registros...</span>
        </div>
      </main>
    </div>
  `;

  root.querySelector('#btn-back-records').addEventListener('click', onBack);

  const mainContent = root.querySelector('#records-main-content');

  async function loadAndRender() {
    let rawCompletions = [];
    let activities = [];

    const todayStr = todayString();

    // Determine range to fetch
    const isPeriodMonth = filter.period === 'month' || (filter.year !== undefined && filter.month !== undefined && filter.period !== 'all');

    let startDateStr = '';
    let endDateStr = '';
    if (isPeriodMonth) {
      const year = filter.year !== undefined ? filter.year : new Date().getFullYear();
      const month = filter.month !== undefined ? filter.month : new Date().getMonth();
      startDateStr = toDateString(firstDayOfMonth(year, month));
      endDateStr = toDateString(lastDayOfMonth(year, month));
      [rawCompletions, activities] = await Promise.all([
        getCompletionsForDateRange(startDateStr, endDateStr),
        getActivities(),
      ]);
    } else {
      // Pending or period === 'all': fetch all records
      [rawCompletions, activities] = await Promise.all([
        getCompletionsForDateRange(),
        getActivities(),
      ]);
    }

    const actMap = new Map(activities.map((a) => [a.id, a]));

    // Apply filters
    const matchedCompletions = rawCompletions.filter((c) => {
      if (!c || typeof c.date !== 'string') return false;
      if (filter.activityId && c.activityId !== filter.activityId) return false;

      // wasPlanned filter if specified
      if (filter.wasPlanned !== undefined && Boolean(c.wasPlanned) !== Boolean(filter.wasPlanned)) {
        return false;
      }

      if (isPeriodMonth && (c.date < startDateStr || c.date > endDateStr)) {
        return false;
      }

      if (isPending) {
        // Pending: past pending entries, wasPlanned entries with status 'planned' (or no status)
        return c.date < todayStr && (c.status === 'planned' || !c.status) && Boolean(c.wasPlanned);
      }

      if (isUpcoming) {
        // Upcoming: today or future planned entries
        return c.date >= todayStr && (c.status === 'planned' || !c.status) && Boolean(c.wasPlanned);
      }

      if (isBlockedByRain) {
        return c.status === 'missed' && Boolean(c.blockedByRain);
      }

      if (statusFilter) {
        const entryStatus = c.status || 'done';
        return entryStatus === statusFilter;
      }

      return true;
    });

    // Group by date
    const dateMap = new Map();
    for (const comp of matchedCompletions) {
      if (!dateMap.has(comp.date)) {
        dateMap.set(comp.date, []);
      }
      dateMap.get(comp.date).push(comp);
    }

    // Sort dates: Pending oldest first, others newest first
    const sortedDates = Array.from(dateMap.keys());
    if (isPending) {
      sortedDates.sort((a, b) => a.localeCompare(b));
    } else {
      sortedDates.sort((a, b) => b.localeCompare(a));
    }

    const totalCount = matchedCompletions.length;
    const countLabel = totalCount === 1 ? '1 registro' : `${totalCount} registros`;

    // "Por opção" grouped card for blockedByRain filter
    let byOptionCardHtml = '';
    if (isBlockedByRain && totalCount > 0) {
      const year = filter.year !== undefined ? filter.year : new Date().getFullYear();
      const month = filter.month !== undefined ? filter.month : new Date().getMonth();
      const optionStats = computeImpededOptionsStats(matchedCompletions, activities, { year, month });

      if (optionStats.length > 0) {
        const optionCards = optionStats
          .map((actStat) => {
            const rows = actStat.options
              .map((opt) => {
                const optCountLabel = opt.count === 1 ? '1 registro' : `${opt.count} registros`;
                return `
                  <div class="inset-row records-option-row">
                    <span class="inset-row-info-label">${escapeHtml(opt.name)}</span>
                    <span class="inset-row-info-value">${escapeHtml(optCountLabel)}</span>
                  </div>
                `;
              })
              .join('');

            return `
              <div class="records-act-options-group">
                <div class="inset-row records-act-header-row">
                  <div class="activity-icon-badge" style="background-color: ${actStat.color};">
                    ${renderIconGlyph(actStat.icon)}
                  </div>
                  <span class="records-act-name">${escapeHtml(actStat.activityName)}</span>
                </div>
                ${rows}
              </div>
            `;
          })
          .join('');

        byOptionCardHtml = `
          <div class="inset-section records-by-option-card" id="records-by-option-card">
            <div class="inset-section-header">Por opção</div>
            <div class="inset-group">
              ${optionCards}
            </div>
          </div>
        `;
      }
    }

    // Empty state text in plain pt-BR
    let emptyMessage = 'Nenhum registro encontrado.';
    if (isBlockedByRain) {
      emptyMessage = 'Nenhuma atividade impedida pela chuva.';
    } else if (isPending) {
      emptyMessage = 'Nenhuma atividade pendente.';
    } else if (isUpcoming) {
      emptyMessage = 'Nenhuma atividade a fazer.';
    } else if (statusFilter === 'done') {
      emptyMessage = 'Nenhuma atividade feita.';
    } else if (statusFilter === 'missed') {
      emptyMessage = 'Nenhuma atividade não feita.';
    }

    let recordsListHtml = '';
    if (totalCount === 0) {
      recordsListHtml = `
        <div class="inset-section records-empty-section">
          <div class="inset-group">
            <div class="inset-row empty-state-row">
              <p class="empty-state-text" id="records-empty-text">${escapeHtml(emptyMessage)}</p>
            </div>
          </div>
        </div>
      `;
    } else {
      recordsListHtml = sortedDates
        .map((dateStr) => {
          const comps = dateMap.get(dateStr) || [];
          const heading = formatDateHeading(dateStr);

          const rows = comps
            .map((comp) => {
              const act = actMap.get(comp.activityId) || {
                id: comp.activityId,
                name: comp.activityId,
                color: 'var(--ios-blue)',
                icon: 'barbell',
              };

              const optText = formatActivitySubtitle(act, comp.optionIds || []);
              const noteText = typeof comp.note === 'string' ? comp.note.trim() : '';
              const secondaryParts = [optText, noteText].filter(Boolean);
              const secondaryHtml = secondaryParts.length > 0
                ? `<span class="record-row-secondary">${escapeHtml(secondaryParts.join(' • '))}</span>`
                : '';

              const status = comp.status || 'done';
              let statusBadgeHtml = '';
              if (status === 'done') {
                statusBadgeHtml = `<span class="plan-status-badge plan-status--done" aria-label="Feita">${ICONS['check']}</span>`;
              } else if (status === 'missed') {
                statusBadgeHtml = `<span class="plan-status-badge plan-status--missed" aria-label="Não feita">${ICONS['x']}</span>`;
              } else {
                statusBadgeHtml = `<span class="plan-status-badge plan-status--planned" aria-label="Planejada">${ICONS['clock']}</span>`;
              }

              return `
                <div
                  class="inset-row record-item-row is-interactive"
                  data-comp-id="${escapeHtml(comp.id)}"
                  data-activity-id="${escapeHtml(act.id)}"
                  data-date="${escapeHtml(dateStr)}"
                  role="button"
                  tabindex="0"
                  aria-label="${escapeHtml(act.name)} em ${escapeHtml(heading)}"
                >
                  <div class="activity-icon-badge" style="background-color: ${act.color};">
                    ${renderIconGlyph(act.icon)}
                  </div>
                  <div class="record-row-content">
                    <span class="record-row-name">${escapeHtml(act.name)}</span>
                    ${secondaryHtml}
                  </div>
                  <div class="record-row-trailing">
                    ${statusBadgeHtml}
                    ${
                      !isPending
                        ? `<svg class="summary-row-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>`
                        : ''
                    }
                  </div>
                </div>
              `;
            })
            .join('');

          return `
            <div class="inset-section record-date-section" data-date="${escapeHtml(dateStr)}">
              <div class="inset-section-header">${escapeHtml(heading)}</div>
              <div class="inset-group">
                ${rows}
              </div>
            </div>
          `;
        })
        .join('');
    }

    mainContent.innerHTML = `
      <div class="records-header-count" id="records-total-count">
        ${escapeHtml(countLabel)}
      </div>
      ${byOptionCardHtml}
      ${recordsListHtml}
    `;

    // Wire up row taps
    mainContent.querySelectorAll('.record-item-row').forEach((row) => {
      const dateStr = row.dataset.date;
      const actId = row.dataset.activityId;
      const compId = row.dataset.compId;

      const act = actMap.get(actId);
      const comp = matchedCompletions.find((c) => c.id === compId || (c.date === dateStr && c.activityId === actId));

      const handleRowClick = async () => {
        if (isPending && act && comp) {
          // Tapping a pending row opens the status sheet right there (Feita / Não feita / Remover do plano) and updates the list
          let isDayRained = false;
          try {
            const dayEntry = await getDayEntry(dateStr);
            isDayRained = Boolean(dayEntry?.rained);
          } catch (_) {}

          openPlannedStatusSheet({
            act,
            comp,
            dateStr,
            isFuture: false,
            isDayRained,
            onResolve: async (action, data) => {
              if (action === 'remove') {
                plannedToNone(comp);
                try {
                  await deleteCompletion(dateStr, act.id);
                } catch (err) {
                  console.error('Erro ao remover do plano:', err);
                }
              } else if (action === 'done') {
                try {
                  const updated = {
                    ...plannedToDone(comp, todayString()),
                    note: data.note,
                  };
                  await saveCompletion(updated);
                } catch (err) {
                  console.error('Erro ao marcar como feita:', err);
                }
              } else if (action === 'missed') {
                try {
                  const updated = {
                    ...plannedToMissed(comp, todayString(), { blockedByRain: data.blockedByRain }),
                    note: data.note,
                  };
                  await saveCompletion(updated);
                  if (data.blockedByRain) {
                    await setDayRained(dateStr, true);
                  }
                } catch (err) {
                  console.error('Erro ao marcar como não feita:', err);
                }
              }
              // Refresh list in place
              await loadAndRender();
            },
          });
        } else {
          // Other rows open that day's screen
          onDaySelect(dateStr);
        }
      };

      row.addEventListener('click', handleRowClick);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleRowClick();
        }
      });
    });
  }

  await loadAndRender();
}
