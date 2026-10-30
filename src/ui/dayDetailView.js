/**
 * dayDetailView.js – Day detail screen (RF02, RF04, RF05, RF06, RF09).
 * - "Choveu" iOS-style switch with cloud-rain icon
 * - "Anotações" auto-saving textarea
 * - Activity checklist
 * - Muscle groups chips for activities with usesMuscleGroups
 */

import { parseDateString } from '../logic/dateUtils.js';
import {
  getActivities,
  getCompletionsWithDetailsForDate,
  setCompletion,
  setCompletionMuscleGroups,
  getDayEntry,
  setDayRained,
  setDayNotes,
  getMuscleGroups,
} from '../storage/storage.js';
import { ICONS, renderIconGlyph } from './icons.js';
import '../version.js';

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
              <div class="ios-switch">
                <input type="checkbox" id="day-rained-switch" />
                <span class="ios-switch-slider"></span>
              </div>
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
    const [activities, completionsList, dayEntry, allMuscleGroups] = await Promise.all([
      getActivities(),
      getCompletionsWithDetailsForDate(dateStr),
      getDayEntry(dateStr),
      getMuscleGroups(true), // include archived for historical display
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

    // Muscle group maps
    const muscleGroupMap = new Map(allMuscleGroups.map((mg) => [mg.id, mg]));

    // Completions map: activityId -> completion object
    const completionMap = new Map(completionsList.map((c) => [c.activityId, c]));

    function formatSubtitle(muscleGroupIds = []) {
      if (!muscleGroupIds || muscleGroupIds.length === 0) return '';
      const names = muscleGroupIds
        .map((id) => muscleGroupMap.get(id)?.name)
        .filter(Boolean);
      return names.join(', ');
    }

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
            const selectedMgIds = comp?.muscleGroupIds || [];
            const subtitleText = formatSubtitle(selectedMgIds);

            // Available groups for chips: all active groups PLUS any archived group already selected
            const availableGroups = allMuscleGroups.filter(
              (mg) => !mg.archived || selectedMgIds.includes(mg.id)
            );

            return `
              <div class="activity-item-wrapper" data-act-id="${act.id}">
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
                    ${
                      act.usesMuscleGroups
                        ? `<span class="activity-subtitle-text" id="subtitle-${act.id}">${escapeHtml(subtitleText)}</span>`
                        : ''
                    }
                  </div>
                </div>

                ${
                  act.usesMuscleGroups
                    ? `
                      <div
                        class="muscle-chips-container ${isDone ? '' : 'hidden'}"
                        id="chips-container-${act.id}"
                        aria-label="Grupos musculares para ${escapeHtml(act.name)}"
                      >
                        ${availableGroups
                          .map((mg) => {
                            const isChipSelected = selectedMgIds.includes(mg.id);
                            return `
                              <button
                                type="button"
                                class="muscle-chip ${isChipSelected ? 'selected' : ''}"
                                data-act-id="${act.id}"
                                data-mg-id="${mg.id}"
                                aria-pressed="${isChipSelected}"
                              >
                                ${escapeHtml(mg.name)}
                              </button>
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
            muscleGroupIds: [],
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
          // Unchecking clears muscle groups and removes completion
          row.classList.remove('activity-check-row--done');
          row.setAttribute('aria-checked', 'false');
          completionMap.delete(activityId);

          if (chipsContainer) {
            chipsContainer.classList.add('hidden');
            chipsContainer.querySelectorAll('.muscle-chip').forEach((c) => {
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

    // Muscle chip click listeners
    listEl.querySelectorAll('.muscle-chip').forEach((chip) => {
      chip.addEventListener('click', async (e) => {
        e.stopPropagation(); // prevent clicking activity row

        const actId = chip.dataset.actId;
        const mgId = chip.dataset.mgId;
        const subtitleEl = root.querySelector(`#subtitle-${actId}`);

        const comp = completionMap.get(actId);
        if (!comp) return;

        const currentIds = Array.isArray(comp.muscleGroupIds) ? [...comp.muscleGroupIds] : [];
        const index = currentIds.indexOf(mgId);

        if (index > -1) {
          currentIds.splice(index, 1);
          chip.classList.remove('selected');
          chip.setAttribute('aria-pressed', 'false');
        } else {
          currentIds.push(mgId);
          chip.classList.add('selected');
          chip.setAttribute('aria-pressed', 'true');
        }

        comp.muscleGroupIds = currentIds;
        if (subtitleEl) {
          subtitleEl.textContent = formatSubtitle(currentIds);
        }

        try {
          await setCompletionMuscleGroups(dateStr, actId, currentIds);
        } catch (err) {
          console.error('Erro ao salvar grupos musculares:', err);
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
