/**
 * dayDetailView.js – Day detail screen (RF02, RF04, RF05, RF06, RF09).
 * - "Choveu" iOS-style switch with cloud-rain icon
 * - "Anotações" auto-saving textarea
 * - Activity checklist
 * - Per-activity groups ("detalhes") displayed as grouped cards with chips
 */

import { parseDateString } from '../logic/dateUtils.js';
import {
  getActivities,
  getCompletionsWithDetailsForDate,
  setCompletion,
  setCompletionOptionIds,
  getDayEntry,
  setDayRained,
  setDayNotes,
} from '../storage/storage.js';
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
 * Renders the HTML markup for an activity checklist item row.
 *
 * @param {object} act
 * @param {boolean} isDone
 * @param {string} subtitleText
 * @param {{ showDetailsButton?: boolean }} [options]
 * @returns {string}
 */
export function renderActivityCheckRowHtml(act, isDone, subtitleText = '', options = {}) {
  const showDetailsButton = Boolean(options.showDetailsButton && isDone);
  const detailsHtml = showDetailsButton
    ? `<button type="button" class="today-details-btn" data-act-id="${act.id}" aria-label="Detalhes de ${escapeHtml(act.name)}">Detalhes</button>`
    : '';

  return `
    <div
      class="inset-row activity-check-row ${isDone ? 'activity-check-row--done' : ''}"
      data-id="${act.id}"
      role="checkbox"
      aria-checked="${isDone}"
      tabindex="0"
    >
      <div class="activity-checkbox-circle" aria-hidden="true">
        <svg class="check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <div class="activity-icon-badge" style="background-color: ${act.color};">
        ${renderIconGlyph(act.icon)}
      </div>
      <div class="activity-row-label">
        <span class="activity-name-text">${escapeHtml(act.name)}</span>
        <span class="activity-subtitle-text" id="subtitle-${act.id}">${escapeHtml(subtitleText)}</span>
      </div>
      ${detailsHtml}
    </div>
  `;
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

        <!-- Section: Atividades -->
        <div class="inset-section">
          <div class="inset-section-header">
            <span>Atividades</span>
          </div>

          <div id="day-activities-list">
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

  const listEl = root.querySelector('#day-activities-list');
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

    // Completions map: activityId -> completion object
    const completionMap = new Map(completionsList.map((c) => [c.activityId, c]));

    if (activities.length === 0) {
      listEl.innerHTML = `
        <div class="inset-group">
          <div class="inset-row empty-state-row">
            <p class="empty-state-text">Nenhuma atividade ainda. Toque em + para criar.</p>
          </div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = `
      <div class="inset-group activity-checklist" role="group" aria-label="Lista de atividades">
        ${activities
          .map((act) => {
            const comp = completionMap.get(act.id);
            const isDone = Boolean(comp);
            const selectedOptionIds = comp?.optionIds || [];
            const subtitleText = formatActivitySubtitle(act, selectedOptionIds);

            // Non-archived groups for this activity
            const nonArchivedGroups = Array.isArray(act.groups)
              ? act.groups.filter((g) => !g.archived)
              : [];

            return `
              <div class="activity-item-wrapper" data-act-id="${act.id}">
                ${renderActivityCheckRowHtml(act, isDone, subtitleText)}

                ${
                  nonArchivedGroups.length > 0
                    ? `
                      <div
                        class="activity-groups-container muscle-chips-container ${isDone ? '' : 'hidden'}"
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
                    `
                    : ''
                }
              </div>
            `;
          })
          .join('')}
      </div>
    `;

    // Activity check toggle listeners
    listEl.querySelectorAll('.activity-check-row').forEach((row) => {
      const toggleActivity = async () => {
        const activityId = row.dataset.id;
        const currentlyDone = completionMap.has(activityId);
        const newDone = !currentlyDone;

        const chipsContainer = root.querySelector(`#chips-container-${activityId}`);
        const subtitleEl = root.querySelector(`#subtitle-${activityId}`);

        if (newDone) {
          row.classList.add('activity-check-row--done');
          row.setAttribute('aria-checked', 'true');
          const newComp = {
            id: `${dateStr}:${activityId}`,
            date: dateStr,
            activityId,
            completedAt: Date.now(),
            optionIds: [],
          };
          completionMap.set(activityId, newComp);

          if (chipsContainer) {
            chipsContainer.classList.remove('hidden');
          }
          if (subtitleEl) {
            subtitleEl.textContent = '';
          }

          try {
            await setCompletion(dateStr, activityId, true, []);
          } catch (err) {
            console.error('Erro ao marcar atividade:', err);
          }
        } else {
          // Unchecking clears options and removes completion
          row.classList.remove('activity-check-row--done');
          row.setAttribute('aria-checked', 'false');
          completionMap.delete(activityId);

          if (chipsContainer) {
            chipsContainer.classList.add('hidden');
            chipsContainer.querySelectorAll('.group-chip, .muscle-chip').forEach((c) => {
              c.classList.remove('selected');
              c.setAttribute('aria-pressed', 'false');
            });
          }
          if (subtitleEl) {
            subtitleEl.textContent = '';
          }

          try {
            await setCompletion(dateStr, activityId, false, []);
          } catch (err) {
            console.error('Erro ao desmarcar atividade:', err);
          }
        }
      };

      row.addEventListener('click', toggleActivity);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleActivity();
        }
      });
    });

    // Option chip click listeners
    listEl.querySelectorAll('.group-chip, .muscle-chip').forEach((chip) => {
      chip.addEventListener('click', async (e) => {
        e.stopPropagation(); // prevent clicking activity row

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
          // multiple = true: toggle selection
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
          // multiple = false: allows only one selected option in this group
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

        const subtitleEl = root.querySelector(`#subtitle-${actId}`);
        if (subtitleEl) {
          subtitleEl.textContent = formatActivitySubtitle(act, currentIds);
        }

        try {
          await setCompletionOptionIds(dateStr, actId, currentIds);
        } catch (err) {
          console.error('Erro ao salvar opções selecionadas:', err);
        }
      });
    });

  } catch (err) {
    console.error('Error rendering day detail', err);
    listEl.innerHTML = `
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
