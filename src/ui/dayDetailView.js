/**
 * dayDetailView.js – Day detail screen (RF02, RF04).
 * Phosphor icons as white glyphs in colored rounded squares (iOS Settings style).
 */

import { parseDateString } from '../logic/dateUtils.js';
import {
  getActivities,
  getCompletionsForDate,
  setCompletion,
} from '../storage/storage.js';
import { renderIconGlyph } from './icons.js';

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

  // Capitalise only the first letter: "Sexta-feira, 30 de outubro de 2026"
  const heading = formatted.charAt(0).toUpperCase() + formatted.slice(1);

  root.innerHTML = `
    <div class="screen-view day-detail-screen">
      <header class="ios-nav-bar ios-nav-bar--with-back">
        <button class="ios-back-btn" id="btn-back" aria-label="Voltar para o calendário">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          <span>Calendário</span>
        </button>
      </header>

      <main class="screen-content">
        <div class="day-heading-container">
          <h1 class="day-large-title">${heading}</h1>
        </div>

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

  try {
    const [activities, completedIdsList] = await Promise.all([
      getActivities(),
      getCompletionsForDate(dateStr),
    ]);

    const completedSet = new Set(completedIdsList);

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
            const isDone = completedSet.has(act.id);
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
                </div>
              </div>
            `;
          })
          .join('')}
      </div>
    `;

    // Add click listeners to toggle completion
    listEl.querySelectorAll('.activity-check-row').forEach((row) => {
      row.addEventListener('click', async () => {
        const activityId = row.dataset.id;
        const currentlyDone = completedSet.has(activityId);
        const newDone = !currentlyDone;

        // Optimistic UI update
        if (newDone) {
          completedSet.add(activityId);
          row.classList.add('activity-check-row--done');
          row.setAttribute('aria-checked', 'true');
        } else {
          completedSet.delete(activityId);
          row.classList.remove('activity-check-row--done');
          row.setAttribute('aria-checked', 'false');
        }

        try {
          await setCompletion(dateStr, activityId, newDone);
        } catch (err) {
          console.error('Failed to save completion', err);
          // Revert optimistic update on error
          if (currentlyDone) {
            completedSet.add(activityId);
            row.classList.add('activity-check-row--done');
            row.setAttribute('aria-checked', 'true');
          } else {
            completedSet.delete(activityId);
            row.classList.remove('activity-check-row--done');
            row.setAttribute('aria-checked', 'false');
          }
        }
      });
    });
  } catch (err) {
    console.error('Error rendering day detail', err);
    listEl.innerHTML = `
      <div class="inset-group">
        <div class="inset-row empty-state-row">
          <p class="empty-state-text">Erro ao carregar atividades.</p>
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
