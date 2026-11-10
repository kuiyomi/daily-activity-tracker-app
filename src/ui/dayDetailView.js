/**
 * dayDetailView.js – Day detail screen (RF02, RF04, RF05, RF06, RF09 + Planning).
 * - "Choveu" iOS-style switch with cloud-rain icon
 * - "Anotações" auto-saving textarea
 * - Two sections: "Planejadas" and "Atividades"
 * - Action sheet for planned entries
 * - Per-activity groups ("detalhes") displayed as grouped cards with chips
 */

import { parseDateString, todayString, isFutureDate, isPastDate } from '../logic/dateUtils.js';
import {
  getActivities,
  getCompletionsWithDetailsForDate,
  saveCompletion,
  deleteCompletion,
  setCompletionOptionIds,
  getDayEntry,
  setDayRained,
  setDayNotes,
} from '../storage/storage.js';
import {
  normalizeCompletionRecord,
  noneToPlanned,
  noneToDone,
  plannedToDone,
  plannedToMissed,
  resolvedToPlanned,
  doneToNone,
  plannedToNone,
} from '../logic/activityLogic.js';
import { ICONS, renderIconGlyph } from './icons.js';
import '../version.js';

/**
 * Formats a subtitle string containing selected option names for an activity.
 *
 * @param {object} act
 * @param {string[]} optionIds
 * @returns {string}
 */
export function formatActivitySubtitle(act, optionIds = []) {
  if (!act || !Array.isArray(act.groups) || !Array.isArray(optionIds) || optionIds.length === 0) {
    return '';
  }
  const optSet = new Set(optionIds);
  const names = [];
  for (const group of act.groups) {
    if (!Array.isArray(group.options)) continue;
    for (const opt of group.options) {
      if (optSet.has(opt.id)) {
        names.push(opt.name);
      }
    }
  }
  return names.join(', ');
}

/**
 * Renders the HTML markup for an activity observation / note row.
 *
 * @param {object} act
 * @param {string} [note]
 * @returns {string}
 */
export function renderActivityNoteRowHtml(act, note = '') {
  return `
    <div class="inset-row notes-row activity-note-row" data-act-id="${act.id}">
      <div class="notes-row-content">
        <label for="act-note-${act.id}" class="notes-label">Observação</label>
        <textarea
          id="act-note-${act.id}"
          class="ios-textarea activity-note-input"
          rows="2"
          placeholder="Escreva uma observação (opcional)"
          aria-label="Observação de ${escapeHtml(act.name)}"
          maxlength="500"
        >${escapeHtml(note || '')}</textarea>
      </div>
    </div>
  `;
}

/**
 * Attaches autosave listeners (600ms debounce and blur) to all .activity-note-input in container.
 *
 * @param {HTMLElement} container
 * @param {(actId: string, noteVal: string) => Promise<void> | void} onSave
 */
export function attachNoteAutosave(container, onSave) {
  if (!container) return;
  container.querySelectorAll('.activity-note-input').forEach((textarea) => {
    const actId = textarea.closest('.activity-note-row')?.dataset.actId;
    if (!actId) return;

    let timeout = null;
    const triggerSave = async () => {
      if (timeout) clearTimeout(timeout);
      timeout = null;
      await onSave(actId, textarea.value);
    };

    textarea.addEventListener('input', () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(triggerSave, 600);
    });

    textarea.addEventListener('blur', triggerSave);
    textarea.addEventListener('click', (e) => e.stopPropagation());
    textarea.addEventListener('keydown', (e) => e.stopPropagation());
  });
}

/**
 * Renders the HTML markup for an activity checklist item row.
 * Shared component used in day detail view and calendarView today card.
 *
 * @param {object} act
 * @param {boolean|object} compOrDone – completion record or boolean isDone
 * @param {string} subtitleText
 * @param {{
 *   isPlanned?: boolean,
 *   showInlineStatusButtons?: boolean,
 *   showPlanButton?: boolean,
 *   showDetailsButton?: boolean,
 *   hasEntry?: boolean,
 *   note?: string,
 *   chipsHtml?: string,
 *   isFuture?: boolean
 * }} [options]
 * @returns {string}
 */
export function renderActivityCheckRowHtml(act, compOrDone, subtitleText = '', options = {}) {
  const isCompObject = typeof compOrDone === 'object' && compOrDone !== null;
  const comp = isCompObject ? compOrDone : options.comp || null;
  const isDone = isCompObject ? (comp.status || 'done') === 'done' : Boolean(compOrDone);
  const isPlanned = options.isPlanned !== undefined ? Boolean(options.isPlanned) : Boolean(comp?.wasPlanned);
  const status = comp?.status || (isDone ? 'done' : (isPlanned ? 'planned' : ''));

  let leftIndicatorHtml = '';
  if (isPlanned) {
    if (status === 'done') {
      leftIndicatorHtml = `<span class="plan-status-badge plan-status--done" aria-label="Feita">${ICONS['check']}</span>`;
    } else if (status === 'missed') {
      leftIndicatorHtml = `<span class="plan-status-badge plan-status--missed" aria-label="Não feita">${ICONS['x']}</span>`;
    } else {
      leftIndicatorHtml = `<span class="plan-status-badge plan-status--planned" aria-label="Planejada">${ICONS['clock']}</span>`;
    }
  } else if (!options.isFuture) {
    leftIndicatorHtml = `
      <div class="activity-checkbox-circle" aria-hidden="true">
        <svg class="check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
    `;
  }

  let actionHtml = '';
  if (options.showInlineStatusButtons) {
    actionHtml = `
      <div class="today-inline-actions">
        <button
          type="button"
          class="btn-inline-status btn-inline-status--done ${status === 'done' ? 'is-active' : ''}"
          data-act-id="${act.id}"
          data-action="done"
          aria-label="Marcar ${escapeHtml(act.name)} como feita"
          aria-pressed="${status === 'done'}"
        >
          Feita
        </button>
        <button
          type="button"
          class="btn-inline-status btn-inline-status--missed ${status === 'missed' ? 'is-active' : ''}"
          data-act-id="${act.id}"
          data-action="missed"
          aria-label="Marcar ${escapeHtml(act.name)} como não feita"
          aria-pressed="${status === 'missed'}"
        >
          Não feita
        </button>
      </div>
    `;
  } else if (options.showPlanButton) {
    actionHtml = `
      <button
        type="button"
        class="btn-plan-activity"
        data-act-id="${act.id}"
        aria-label="Planejar ${escapeHtml(act.name)}"
      >
        ${ICONS['calendar-plus']}
        <span class="btn-plan-text">Planejar</span>
      </button>
    `;
  } else if (options.showDetailsButton && isDone) {
    actionHtml = `<button type="button" class="today-details-btn" data-act-id="${act.id}" aria-label="Detalhes de ${escapeHtml(act.name)}">Detalhes</button>`;
  }

  const hasEntry = options.hasEntry !== undefined ? options.hasEntry : Boolean(comp || isDone);
  const showNote = Boolean(act?.allowsNote && (isPlanned || (hasEntry && (isDone || status === 'missed'))));
  const noteVal = options.note !== undefined ? options.note : (comp?.note || '');
  const noteHtml = showNote ? renderActivityNoteRowHtml(act, noteVal) : '';
  const chipsHtml = options.chipsHtml || '';

  const rowClasses = [
    'inset-row',
    'activity-check-row',
    isPlanned ? 'planned-check-row' : 'unplanned-check-row',
    isDone ? 'activity-check-row--done' : '',
    status === 'missed' ? 'activity-check-row--missed' : '',
  ].filter(Boolean).join(' ');

  const role = isPlanned ? 'button' : (options.isFuture ? 'button' : 'checkbox');
  const ariaCheckedAttr = !isPlanned && !options.isFuture ? `aria-checked="${isDone}"` : '';
  const ariaLabelAttr = isPlanned ? `aria-label="${escapeHtml(act.name)} (${status})"` : '';

  return `
    <div class="activity-item-wrapper" data-act-id="${act.id}">
      <div
        class="${rowClasses}"
        data-id="${act.id}"
        role="${role}"
        ${ariaCheckedAttr}
        ${ariaLabelAttr}
        tabindex="0"
      >
        ${leftIndicatorHtml}
        <div class="activity-icon-badge" style="background-color: ${act.color};">
          ${renderIconGlyph(act.icon)}
        </div>
        <div class="activity-row-label">
          <span class="activity-name-text">${escapeHtml(act.name)}</span>
          <span class="activity-subtitle-text" id="subtitle-${act.id}">${subtitleText}</span>
        </div>
        ${actionHtml}
      </div>
      ${chipsHtml}
      ${noteHtml}
    </div>
  `;
}

/**
 * Renders the grouped chips container for an activity.
 *
 * @param {object} act
 * @param {string[]} selectedOptionIds
 * @param {boolean} isVisible
 * @param {Array<object>} nonArchivedGroups
 * @returns {string}
 */
function renderChipsMarkup(act, selectedOptionIds = [], isVisible = false, nonArchivedGroups = []) {
  if (nonArchivedGroups.length === 0) return '';

  return `
    <div
      class="activity-groups-container muscle-chips-container ${isVisible ? '' : 'hidden'}"
      id="chips-container-${act.id}"
      aria-label="Detalhes de ${escapeHtml(act.name)}"
    >
      ${nonArchivedGroups
        .map((group) => {
          const options = Array.isArray(group.options)
            ? group.options.filter((opt) => !opt.archived || selectedOptionIds.includes(opt.id))
            : [];
          return `
            <div class="activity-group-card inset-section" data-group-id="${group.id}">
              <div class="activity-group-header inset-section-header">
                <span>${escapeHtml(group.name)}</span>
              </div>
              <div class="inset-group group-chips-card">
                <div
                  class="group-chips-container"
                  role="group"
                  aria-label="${escapeHtml(group.name)}"
                >
                  ${options
                    .map((opt) => {
                      const isChipSelected = selectedOptionIds.includes(opt.id);
                      return `
                        <button
                          type="button"
                          class="group-chip muscle-chip ${isChipSelected ? 'selected' : ''}"
                          data-act-id="${act.id}"
                          data-group-id="${group.id}"
                          data-opt-id="${opt.id}"
                          data-mg-id="${opt.id}"
                          aria-pressed="${isChipSelected}"
                        >
                          ${escapeHtml(opt.name)}
                        </button>
                      `;
                    })
                    .join('')}
                </div>
              </div>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

/**
 * Opens the planned activity status action sheet.
 * Can be called from dayDetailView or from recordsView (Registros list).
 *
 * @param {{
 *   act: object,
 *   comp: object,
 *   dateStr: string,
 *   isFuture?: boolean,
 *   isDayRained?: boolean,
 *   onResolve: (action: 'done' | 'missed' | 'revert' | 'remove', data: { note: string, blockedByRain: boolean }) => Promise<void> | void,
 *   onClose?: () => void,
 * }} params
 */
export function openPlannedStatusSheet({
  act,
  comp,
  dateStr,
  isFuture = false,
  isDayRained = false,
  onResolve,
  onClose,
}) {
  const isResolved = comp.status === 'done' || comp.status === 'missed';
  const isBlockedByRainPreset = comp.status === 'missed' ? Boolean(comp.blockedByRain || isDayRained) : Boolean(isDayRained);

  const backdrop = document.createElement('div');
  backdrop.className = 'ios-sheet-backdrop';
  backdrop.id = 'plan-action-sheet';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', `Opções para ${act.name}`);

  const tabBar = document.querySelector('.ios-tab-bar');
  if (tabBar) tabBar.classList.add('hidden');

  backdrop.innerHTML = `
    <div class="ios-action-sheet">
      <div class="ios-action-sheet-group">
        <div class="ios-action-sheet-header">
          <h3 class="ios-action-sheet-title">${escapeHtml(act.name)}</h3>
        </div>
        ${
          act.allowsNote
            ? `
              <div class="sheet-notes-container">
                <label for="sheet-note-input" class="notes-label">Observação</label>
                <textarea
                  id="sheet-note-input"
                  class="ios-textarea sheet-note-textarea"
                  rows="2"
                  placeholder="Escreva uma observação (opcional)"
                  aria-label="Observação de ${escapeHtml(act.name)}"
                  maxlength="500"
                >${escapeHtml(comp.note || '')}</textarea>
              </div>
            `
            : ''
        }
        ${
          !isFuture
            ? `
              <div class="sheet-toggle-container">
                <label class="toggle-row inset-row" for="sheet-rain-switch">
                  <span class="toggle-label-title">Impedida pela chuva</span>
                  <input
                    type="checkbox"
                    id="sheet-rain-switch"
                    class="ios-switch"
                    role="switch"
                    aria-label="Impedida pela chuva"
                    ${isBlockedByRainPreset ? 'checked' : ''}
                  />
                </label>
              </div>
            `
            : ''
        }
        ${
          isFuture
            ? `<button type="button" class="ios-sheet-btn ios-sheet-btn--destructive" id="sheet-btn-remove">Remover do plano</button>`
            : `
              <button type="button" class="ios-sheet-btn ios-sheet-btn--done" id="sheet-btn-done">Feita</button>
              <button type="button" class="ios-sheet-btn ios-sheet-btn--missed" id="sheet-btn-missed">Não feita</button>
              ${isResolved ? `<button type="button" class="ios-sheet-btn ios-sheet-btn--neutral" id="sheet-btn-revert">Voltar para planejada</button>` : ''}
              <button type="button" class="ios-sheet-btn ios-sheet-btn--destructive" id="sheet-btn-remove">Remover do plano</button>
            `
        }
      </div>
      <div class="ios-action-sheet-group">
        <button type="button" class="ios-sheet-btn ios-sheet-btn--cancel" id="sheet-btn-cancel">Cancelar</button>
      </div>
    </div>
  `;

  const closeSheet = () => {
    backdrop.remove();
    if (tabBar) tabBar.classList.remove('hidden');
    if (onClose) onClose();
  };

  const getSheetNote = () => {
    const input = backdrop.querySelector('#sheet-note-input');
    if (input) {
      return input.value.trim().slice(0, 500);
    }
    return comp.note || '';
  };

  const getRainSwitchState = () => {
    const sw = backdrop.querySelector('#sheet-rain-switch');
    return Boolean(sw && sw.checked);
  };

  backdrop.querySelector('#sheet-btn-cancel').addEventListener('click', closeSheet);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeSheet();
  });

  const removeBtn = backdrop.querySelector('#sheet-btn-remove');
  if (removeBtn) {
    removeBtn.addEventListener('click', async () => {
      closeSheet();
      await onResolve('remove', { note: getSheetNote(), blockedByRain: false });
    });
  }

  const doneBtn = backdrop.querySelector('#sheet-btn-done');
  if (doneBtn) {
    doneBtn.addEventListener('click', async () => {
      const note = getSheetNote();
      closeSheet();
      await onResolve('done', { note, blockedByRain: false });
    });
  }

  const missedBtn = backdrop.querySelector('#sheet-btn-missed');
  if (missedBtn) {
    missedBtn.addEventListener('click', async () => {
      const note = getSheetNote();
      const blockedByRain = getRainSwitchState();
      closeSheet();
      await onResolve('missed', { note, blockedByRain });
    });
  }

  const revertBtn = backdrop.querySelector('#sheet-btn-revert');
  if (revertBtn) {
    revertBtn.addEventListener('click', async () => {
      const note = getSheetNote();
      closeSheet();
      await onResolve('revert', { note, blockedByRain: false });
    });
  }

  document.body.appendChild(backdrop);
}

/**
 * Mounts the day-detail screen into `root`.
 *
 * @param {HTMLElement} root
 * @param {string} dateStr – "YYYY-MM-DD"
 * @param {{ onBack: () => void, onManageActivities: () => void }} options
 */
export async function mountDayDetailView(root, dateStr, { onBack, onManageActivities }) {
  const date = parseDateString(dateStr);
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);

  const heading = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  const appName = self.APP_NAME || 'Agenda';

  root.innerHTML = `
    <div class="screen-view day-detail-screen">
      <header class="ios-nav-bar ios-nav-bar--with-back">
        <button class="ios-back-btn" id="btn-back" aria-label="Voltar para ${appName}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          <span>${appName}</span>
        </button>
      </header>

      <main class="screen-content">
        <div class="day-heading-container">
          <h1 class="day-large-title">${heading}</h1>
        </div>

        <!-- Section: Registro do dia (Choveu & Anotações) -->
        <div class="inset-section">
          <div class="inset-section-header">
            <span>Registro do dia</span>
          </div>

          <div class="inset-group">
            <!-- Choveu row -->
            <label class="inset-row toggle-row" for="day-rained-switch">
              <div class="toggle-row-left">
                <div class="activity-icon-badge rain-badge" style="background-color: var(--ios-blue);">
                  ${ICONS['cloud-rain']}
                </div>
                <span class="toggle-label-title">Choveu</span>
              </div>
              <input
                type="checkbox"
                id="day-rained-switch"
                class="ios-switch"
                role="switch"
                aria-label="Choveu"
              />
            </label>

            <!-- Anotações row -->
            <div class="inset-row notes-row">
              <div class="notes-row-content">
                <label for="day-notes-input" class="notes-label">Anotações</label>
                <textarea
                  id="day-notes-input"
                  class="ios-textarea"
                  rows="3"
                  placeholder="Escreva aqui observações do dia..."
                  aria-label="Anotações do dia"
                ></textarea>
              </div>
            </div>
          </div>
        </div>

        <!-- Dynamic sections container: Planejadas & Atividades -->
        <div id="day-activities-sections">
          <div class="inset-section">
            <div class="inset-group">
              <div class="inset-row empty-state-row">
                <span class="ios-spinner-text">Carregando atividades...</span>
              </div>
            </div>
          </div>
        </div>

        <div class="day-footer-action">
          <button class="ios-link-btn" id="btn-manage-act">
            Gerenciar atividades
          </button>
        </div>
      </main>
    </div>
  `;

  root.querySelector('#btn-back').addEventListener('click', onBack);
  root.querySelector('#btn-manage-act').addEventListener('click', onManageActivities);

  const sectionsContainer = root.querySelector('#day-activities-sections');
  const rainedSwitch = root.querySelector('#day-rained-switch');
  const notesTextarea = root.querySelector('#day-notes-input');

  try {
    const [activities, completionsList, dayEntry] = await Promise.all([
      getActivities(),
      getCompletionsWithDetailsForDate(dateStr),
      getDayEntry(dateStr),
    ]);

    // Setup Choveu switch
    if (dayEntry) {
      rainedSwitch.checked = Boolean(dayEntry.rained);
      notesTextarea.value = dayEntry.notes || '';
    }

    rainedSwitch.addEventListener('change', async () => {
      try {
        await setDayRained(dateStr, rainedSwitch.checked);
      } catch (err) {
        console.error('Falha ao salvar status de chuva:', err);
      }
    });

    // Setup Notes auto-save (input debounce + blur)
    let notesTimeout = null;
    const saveNotes = async () => {
      if (notesTimeout) clearTimeout(notesTimeout);
      try {
        await setDayNotes(dateStr, notesTextarea.value);
      } catch (err) {
        console.error('Falha ao salvar anotações:', err);
      }
    };

    notesTextarea.addEventListener('input', () => {
      if (notesTimeout) clearTimeout(notesTimeout);
      notesTimeout = setTimeout(saveNotes, 350);
    });
    notesTextarea.addEventListener('blur', saveNotes);

    if (activities.length === 0) {
      sectionsContainer.innerHTML = `
        <div class="inset-section">
          <div class="inset-section-header">
            <span>Atividades</span>
          </div>
          <div class="inset-group">
            <div class="inset-row empty-state-row">
              <p class="empty-state-text">Nenhuma atividade ainda. Toque em + para criar.</p>
            </div>
          </div>
        </div>
      `;
      return;
    }

    // Map: activityId -> completion record (normalized)
    const completionMap = new Map();
    for (const c of completionsList) {
      completionMap.set(c.activityId, normalizeCompletionRecord(c));
    }

    const isFuture = isFutureDate(dateStr);
    const isPast = isPastDate(dateStr);

    /**
     * Opens the iOS action sheet for a planned activity row.
     * @param {object} act
     * @param {object} comp
     */
    function openPlannedSheet(act, comp) {
      openPlannedStatusSheet({
        act,
        comp,
        dateStr,
        isFuture,
        isDayRained: rainedSwitch.checked,
        onResolve: async (action, data) => {
          if (action === 'remove') {
            plannedToNone(comp);
            completionMap.delete(act.id);
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
              completionMap.set(act.id, updated);
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
              completionMap.set(act.id, updated);
              await saveCompletion(updated);
              if (data.blockedByRain) {
                await setDayRained(dateStr, true);
                rainedSwitch.checked = true;
              }
            } catch (err) {
              console.error('Erro ao marcar como não feita:', err);
            }
          } else if (action === 'revert') {
            try {
              const updated = {
                ...resolvedToPlanned(comp, todayString()),
                note: data.note,
              };
              completionMap.set(act.id, updated);
              await saveCompletion(updated);
            } catch (err) {
              console.error('Erro ao voltar para planejada:', err);
            }
          }
          renderSections();
        },
      });
    }

    /**
     * Main render function that splits activities into "Planejadas" and "Atividades".
     */
    function renderSections() {
      const plannedList = [];
      const unplannedList = [];

      for (const act of activities) {
        const comp = completionMap.get(act.id);
        if (comp && comp.wasPlanned) {
          plannedList.push({ act, comp });
        } else {
          unplannedList.push({ act, comp });
        }
      }

      // ── 1. Planejadas Section ──────────────────────────────
      let plannedContentHtml = '';
      if (plannedList.length === 0) {
        plannedContentHtml = `
          <div class="inset-row empty-state-row">
            <p class="empty-state-text">Nenhuma atividade planejada</p>
          </div>
        `;
      } else {
        plannedContentHtml = plannedList
          .map(({ act, comp }) => {
            const status = comp.status || 'planned';
            const optText = formatActivitySubtitle(act, comp.optionIds || []);

            let subtitleHtml = '';
            if (isPast && status === 'planned') {
              subtitleHtml = `<span class="pending-badge-text">Pendente</span>${optText ? ` • ${escapeHtml(optText)}` : ''}`;
            } else {
              subtitleHtml = escapeHtml(optText);
            }

            const showChips = status === 'planned' || status === 'done' || status === 'missed';
            const nonArchivedGroups = Array.isArray(act.groups)
              ? act.groups.filter((g) => !g.archived)
              : [];
            const chipsHtml = renderChipsMarkup(act, comp.optionIds || [], showChips, nonArchivedGroups);

            return renderActivityCheckRowHtml(act, comp, subtitleHtml, {
              isPlanned: true,
              chipsHtml,
              note: comp.note || '',
            });
          })
          .join('');
      }

      // ── 2. Atividades Section ──────────────────────────────
      let unplannedContentHtml = '';
      if (unplannedList.length === 0) {
        unplannedContentHtml = `
          <div class="inset-row empty-state-row">
            <p class="empty-state-text">Todas as atividades estão no plano</p>
          </div>
        `;
      } else {
        unplannedContentHtml = unplannedList
          .map(({ act, comp }) => {
            const isDone = Boolean(comp && comp.status === 'done');
            const selectedOptionIds = comp?.optionIds || [];
            const optText = formatActivitySubtitle(act, selectedOptionIds);
            const nonArchivedGroups = Array.isArray(act.groups)
              ? act.groups.filter((g) => !g.archived)
              : [];
            const chipsHtml = renderChipsMarkup(act, selectedOptionIds, isDone, nonArchivedGroups);

            return renderActivityCheckRowHtml(act, comp, escapeHtml(optText), {
              isPlanned: false,
              isFuture,
              showPlanButton: true,
              chipsHtml,
              note: comp?.note || '',
            });
          })
          .join('');
      }

      sectionsContainer.innerHTML = `
        <!-- Section: Planejadas -->
        <div class="inset-section" id="section-planned">
          <div class="inset-section-header">
            <span>Planejadas</span>
          </div>
          <div class="inset-group activity-checklist" role="group" aria-label="Atividades planejadas">
            ${plannedContentHtml}
          </div>
        </div>

        <!-- Section: Atividades -->
        <div class="inset-section" id="section-activities">
          <div class="inset-section-header">
            <span>Atividades</span>
          </div>
          <div class="inset-group activity-checklist" role="group" aria-label="Atividades disponíveis">
            ${unplannedContentHtml}
          </div>
        </div>
      `;

      attachListeners();
    }

    /**
     * Attaches interactive listeners to rows, buttons, and chips.
     */
    function attachListeners() {
      // 1. Tapping a planned row -> opens action sheet
      sectionsContainer.querySelectorAll('.planned-check-row').forEach((row) => {
        const actId = row.dataset.id;
        const act = activities.find((a) => a.id === actId);
        const comp = completionMap.get(actId);

        const openSheet = () => {
          if (act && comp) openPlannedSheet(act, comp);
        };

        row.addEventListener('click', openSheet);
        row.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openSheet();
          }
        });
      });

      // 2. Tapping "Planejar" button -> moves activity into plan
      sectionsContainer.querySelectorAll('.btn-plan-activity').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const actId = btn.dataset.actId;
          const act = activities.find((a) => a.id === actId);
          if (!act) return;

          try {
            const plannedRecord = noneToPlanned({ dateStr, activityId: actId, optionIds: [] });
            completionMap.set(actId, plannedRecord);
            await saveCompletion(plannedRecord);
          } catch (err) {
            console.error('Erro ao planejar atividade:', err);
          }
          renderSections();
        });
      });

      // 3. Tapping an unplanned row in "Atividades"
      sectionsContainer.querySelectorAll('.unplanned-check-row').forEach((row) => {
        const actId = row.dataset.id;
        const act = activities.find((a) => a.id === actId);
        if (!act) return;

        const handleUnplannedClick = async () => {
          if (isFuture) {
            // On future dates, check circle is hidden, tapping row plans the activity
            try {
              const plannedRecord = noneToPlanned({ dateStr, activityId: actId, optionIds: [] });
              completionMap.set(actId, plannedRecord);
              await saveCompletion(plannedRecord);
            } catch (err) {
              console.error('Erro ao planejar atividade:', err);
            }
            renderSections();
            return;
          }

          // On today or past dates: toggle done / undone
          const comp = completionMap.get(actId);
          const isDone = Boolean(comp && comp.status === 'done');

          if (isDone) {
            doneToNone(comp, todayString());
            completionMap.delete(actId);
            try {
              await deleteCompletion(dateStr, actId);
            } catch (err) {
              console.error('Erro ao desmarcar atividade:', err);
            }
          } else {
            const newDone = noneToDone({ dateStr, activityId: actId, optionIds: [] }, todayString());
            completionMap.set(actId, newDone);
            try {
              await saveCompletion(newDone);
            } catch (err) {
              console.error('Erro ao marcar atividade:', err);
            }
          }
          renderSections();
        };

        row.addEventListener('click', handleUnplannedClick);
        row.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleUnplannedClick();
          }
        });
      });

      // 4. Option chips selection (works for planned and done entries)
      sectionsContainer.querySelectorAll('.group-chip, .muscle-chip').forEach((chip) => {
        chip.addEventListener('click', async (e) => {
          e.stopPropagation();

          const actId = chip.dataset.actId;
          const groupId = chip.dataset.groupId;
          const optId = chip.dataset.optId || chip.dataset.mgId;

          const act = activities.find((a) => a.id === actId);
          const comp = completionMap.get(actId);
          if (!act || !comp) return;

          const group = (act.groups || []).find((g) => g.id === groupId);
          if (!group) return;

          let currentIds = Array.isArray(comp.optionIds) ? [...comp.optionIds] : [];
          const isAlreadySelected = currentIds.includes(optId);

          if (group.multiple) {
            if (isAlreadySelected) {
              currentIds = currentIds.filter((id) => id !== optId);
              chip.classList.remove('selected');
              chip.setAttribute('aria-pressed', 'false');
            } else {
              currentIds.push(optId);
              chip.classList.add('selected');
              chip.setAttribute('aria-pressed', 'true');
            }
          } else {
            const groupOptIds = new Set((group.options || []).map((o) => o.id));
            if (isAlreadySelected) {
              currentIds = currentIds.filter((id) => id !== optId);
              chip.classList.remove('selected');
              chip.setAttribute('aria-pressed', 'false');
            } else {
              currentIds = currentIds.filter((id) => !groupOptIds.has(id));
              currentIds.push(optId);

              const card = chip.closest('.activity-group-card');
              if (card) {
                card.querySelectorAll('.group-chip, .muscle-chip').forEach((c) => {
                  c.classList.remove('selected');
                  c.setAttribute('aria-pressed', 'false');
                });
              }
              chip.classList.add('selected');
              chip.setAttribute('aria-pressed', 'true');
            }
          }

          comp.optionIds = currentIds;

          const subtitleEl = sectionsContainer.querySelector(`#subtitle-${actId}`);
          if (subtitleEl) {
            const optText = formatActivitySubtitle(act, currentIds);
            if (isPast && comp.status === 'planned') {
              subtitleEl.innerHTML = `<span class="pending-badge-text">Pendente</span>${optText ? ` • ${escapeHtml(optText)}` : ''}`;
            } else {
              subtitleEl.textContent = optText;
            }
          }

          try {
            await setCompletionOptionIds(dateStr, actId, currentIds);
          } catch (err) {
            console.error('Erro ao salvar opções selecionadas:', err);
          }
        });
      });

      // 5. Note autosave for activities with allowsNote
      attachNoteAutosave(sectionsContainer, async (actId, noteVal) => {
        const comp = completionMap.get(actId);
        if (!comp) return;
        const sanitized = noteVal.trim().slice(0, 500);
        comp.note = sanitized;
        try {
          await saveCompletion(comp);
        } catch (err) {
          console.error('Erro ao salvar observação da atividade:', err);
        }
      });
    }

    // Initial render
    renderSections();

  } catch (err) {
    console.error('Error rendering day detail', err);
    sectionsContainer.innerHTML = `
      <div class="inset-group">
        <div class="inset-row empty-state-row">
          <p class="empty-state-text">Erro ao carregar detalhes do dia.</p>
        </div>
      </div>
    `;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
