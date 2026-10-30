/**
 * activitiesView.js – Screen to list, create, edit, and delete activities.
 * Uses Phosphor Icons, live form preview, iOS Settings badge style, and no custom emoji input.
 */

import {
  getActivities,
  saveActivity,
  deleteActivity,
} from '../storage/storage.js';
import {
  ACTIVITY_ICON_KEYS,
  ICONS,
  renderIconGlyph,
  normalizeIconKey,
} from './icons.js';

const PRESET_COLORS = [
  '#007aff', // iOS blue
  '#34c759', // iOS green
  '#ff9500', // iOS orange
  '#ff2d55', // iOS pink
  '#af52de', // iOS purple
  '#5856d6', // iOS indigo
  '#ffcc00', // iOS yellow
  '#32ade6', // iOS cyan
];

const CHECKMARK_SVG = `
  <svg class="color-check-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
`;

const PALETTE_SVG = `
  <svg class="color-palette-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <path d="M12 2a4.5 4.5 0 0 0 0 9 1.5 1.5 0 0 1 1.5 1.5 4.5 4.5 0 0 0 9 0"></path>
  </svg>
`;

/**
 * Mounts the activities view into `root`.
 * @param {HTMLElement} root
 * @param {{ onBack?: () => void, onFormOpen?: () => void, onFormClose?: () => void }} [options]
 */
export function mountActivitiesView(root, { onBack, onFormOpen, onFormClose } = {}) {
  let isEditing = false;
  let currentActivity = null;

  async function renderList() {
    isEditing = false;
    currentActivity = null;

    if (onFormClose) onFormClose();

    let activities = [];
    try {
      activities = await getActivities();
    } catch (err) {
      console.error('Failed to load activities', err);
    }

    root.innerHTML = `
      <div class="screen-view activities-screen">
        <header class="ios-nav-bar ios-nav-bar--with-action">
          <h1 class="ios-large-title">Atividades</h1>
          <button class="ios-nav-action-btn" id="btn-new-activity" aria-label="Nova atividade">
            + Nova
          </button>
        </header>

        <main class="screen-content">
          <div class="inset-section">
            <div class="inset-section-header">
              <span>Minhas atividades</span>
            </div>

            ${
              activities.length === 0
                ? `
                  <div class="inset-group">
                    <div class="inset-row empty-state-row">
                      <p class="empty-state-text">Nenhuma atividade ainda. Toque em + para criar.</p>
                    </div>
                  </div>
                `
                : `
                  <div class="inset-group activity-card-list">
                    ${activities
                      .map(
                        (act) => `
                      <div class="inset-row activity-item-card" data-id="${act.id}" role="button" tabindex="0">
                        <div class="activity-icon-badge" style="background-color: ${act.color};">
                          ${renderIconGlyph(act.icon)}
                        </div>
                        <div class="activity-card-info">
                          <span class="activity-card-name">${escapeHtml(act.name)}</span>
                          ${
                            act.usesMuscleGroups
                              ? `<span class="activity-badge">Grupos musculares</span>`
                              : ''
                          }
                        </div>
                        <svg class="ios-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                      </div>
                    `
                      )
                      .join('')}
                  </div>
                `
            }
          </div>
        </main>
      </div>
    `;

    root.querySelector('#btn-new-activity').addEventListener('click', () => renderForm(null));

    root.querySelectorAll('.activity-item-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        const act = activities.find((a) => a.id === id);
        if (act) renderForm(act);
      });
    });
  }

  function renderForm(activityToEdit) {
    isEditing = Boolean(activityToEdit);
    currentActivity = activityToEdit;

    // Hide tab bar when editing / creating an activity
    if (onFormOpen) onFormOpen();

    const initialName = activityToEdit ? activityToEdit.name : '';
    let selectedIconKey = activityToEdit ? normalizeIconKey(activityToEdit.icon) : ACTIVITY_ICON_KEYS[0];
    let selectedColor = activityToEdit ? activityToEdit.color : PRESET_COLORS[0];
    const initialMuscle = activityToEdit ? Boolean(activityToEdit.usesMuscleGroups) : false;

    // Check if selectedColor is one of the presets
    const isPreset = PRESET_COLORS.some((c) => c.toLowerCase() === selectedColor.toLowerCase());

    root.innerHTML = `
      <div class="screen-view activity-form-screen">
        <header class="ios-modal-header">
          <button type="button" class="ios-modal-btn" id="btn-cancel-form">Cancelar</button>
          <h2 class="ios-modal-title">${isEditing ? 'Editar atividade' : 'Nova atividade'}</h2>
          <button type="button" class="ios-modal-btn ios-modal-btn--bold" id="btn-submit-header">Salvar</button>
        </header>

        <main class="screen-content">
          <form class="ios-form" id="activity-form">
            <!-- Form Preview Card (iOS Settings Style) -->
            <div class="inset-section">
              <div class="inset-group">
                <div class="inset-row form-preview-row">
                  <div class="activity-icon-badge form-preview-badge" id="form-preview-badge" style="background-color: ${selectedColor};">
                    ${renderIconGlyph(selectedIconKey)}
                  </div>
                  <div class="form-preview-info">
                    <span class="form-preview-name" id="form-preview-name">${escapeHtml(initialName) || 'Nome da atividade'}</span>
                    <span class="form-preview-sub">Pré-visualização</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="inset-section">
              <div class="inset-section-header">
                <span>Nome</span>
              </div>
              <div class="inset-group">
                <div class="inset-row input-row">
                  <input
                    type="text"
                    id="form-act-name"
                    class="ios-input"
                    placeholder="Nome da atividade"
                    value="${escapeHtml(initialName)}"
                    maxlength="40"
                    required
                    autofocus
                  />
                </div>
              </div>
            </div>

            <div class="inset-section">
              <div class="inset-section-header">
                <span>Ícone</span>
              </div>
              <div class="inset-group">
                <div class="inset-row picker-row">
                  <div class="icon-picker-grid">
                    ${ACTIVITY_ICON_KEYS.map((key) => {
                      const isSelected = key === selectedIconKey;
                      return `
                        <button
                          type="button"
                          class="icon-choice-btn ${isSelected ? 'selected' : ''}"
                          data-icon="${key}"
                          aria-label="${key}"
                        >
                          ${ICONS[key]}
                        </button>
                      `;
                    }).join('')}
                  </div>
                </div>
              </div>
            </div>

            <div class="inset-section">
              <div class="inset-section-header">
                <span>Cor</span>
              </div>
              <div class="inset-group">
                <div class="inset-row picker-row">
                  <div class="color-picker-grid">
                    ${PRESET_COLORS.map((col) => {
                      const isSelected = col.toLowerCase() === selectedColor.toLowerCase();
                      return `
                        <button
                          type="button"
                          class="color-choice-btn ${isSelected ? 'selected' : ''}"
                          data-color="${col}"
                          style="background-color: ${col};"
                          aria-label="Selecionar cor ${col}"
                        >
                          ${isSelected ? CHECKMARK_SVG : ''}
                        </button>
                      `;
                    }).join('')}

                    <!-- Custom color picker matching the preset style -->
                    <label
                      class="color-choice-btn color-choice-custom ${!isPreset ? 'selected' : ''}"
                      id="custom-color-label"
                      style="${!isPreset ? `background-color: ${selectedColor};` : ''}"
                      title="Escolher cor personalizada"
                      aria-label="Escolher cor personalizada"
                    >
                      <input
                        type="color"
                        id="form-act-color"
                        class="ios-color-native-hidden"
                        value="${selectedColor}"
                      />
                      <span class="custom-color-content" id="custom-color-content">
                        ${!isPreset ? CHECKMARK_SVG : PALETTE_SVG}
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div class="inset-section">
              <div class="inset-section-header">
                <span>Configurações</span>
              </div>
              <div class="inset-group">
                <label class="inset-row toggle-row" for="form-act-muscle">
                  <span class="toggle-label">Rastrear grupos musculares</span>
                  <input
                    type="checkbox"
                    id="form-act-muscle"
                    class="ios-switch"
                    ${initialMuscle ? 'checked' : ''}
                  />
                </label>
              </div>
            </div>

            ${
              isEditing
                ? `
              <div class="inset-section">
                <div class="inset-group">
                  <button type="button" class="inset-row delete-row" id="btn-delete-activity">
                    <span>Excluir atividade</span>
                  </button>
                </div>
              </div>
            `
                : ''
            }

            <div class="form-error" id="form-error" style="display: none;"></div>
          </form>
        </main>
      </div>
    `;

    const form = root.querySelector('#activity-form');
    const nameInput = root.querySelector('#form-act-name');
    const colorInput = root.querySelector('#form-act-color');
    const muscleInput = root.querySelector('#form-act-muscle');
    const errorEl = root.querySelector('#form-error');
    const customColorLabel = root.querySelector('#custom-color-label');
    const customColorContent = root.querySelector('#custom-color-content');
    const previewBadge = root.querySelector('#form-preview-badge');
    const previewName = root.querySelector('#form-preview-name');

    // Live name preview
    nameInput.addEventListener('input', () => {
      previewName.textContent = nameInput.value.trim() || 'Nome da atividade';
    });

    // Icon preset clicks
    root.querySelectorAll('.icon-choice-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        root.querySelectorAll('.icon-choice-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedIconKey = btn.dataset.icon;
        previewBadge.innerHTML = renderIconGlyph(selectedIconKey);
      });
    });

    // Helper to select a color and update checkmarks / rings / preview
    function setSelectedColor(colorHex) {
      selectedColor = colorHex;
      colorInput.value = colorHex;
      previewBadge.style.backgroundColor = colorHex;
      const normalized = colorHex.toLowerCase();
      let matchedPreset = false;

      root.querySelectorAll('.color-choice-btn:not(.color-choice-custom)').forEach((btn) => {
        const btnCol = btn.dataset.color.toLowerCase();
        if (btnCol === normalized) {
          btn.classList.add('selected');
          btn.innerHTML = CHECKMARK_SVG;
          matchedPreset = true;
        } else {
          btn.classList.remove('selected');
          btn.innerHTML = '';
        }
      });

      if (matchedPreset) {
        customColorLabel.classList.remove('selected');
        customColorLabel.style.backgroundColor = '';
        customColorContent.innerHTML = PALETTE_SVG;
      } else {
        customColorLabel.classList.add('selected');
        customColorLabel.style.backgroundColor = colorHex;
        customColorContent.innerHTML = CHECKMARK_SVG;
      }
    }

    // Color preset clicks
    root.querySelectorAll('.color-choice-btn:not(.color-choice-custom)').forEach((btn) => {
      btn.addEventListener('click', () => {
        setSelectedColor(btn.dataset.color);
      });
    });

    // Custom color input change/input
    colorInput.addEventListener('input', (e) => {
      setSelectedColor(e.target.value);
    });

    // Cancel handler
    root.querySelector('#btn-cancel-form').addEventListener('click', () => renderList());

    // Submit handler
    const submitForm = async () => {
      errorEl.style.display = 'none';

      const payload = {
        name: nameInput.value,
        icon: selectedIconKey,
        color: selectedColor || '#007aff',
        usesMuscleGroups: muscleInput.checked,
      };

      if (isEditing && currentActivity) {
        payload.id = currentActivity.id;
        payload.createdAt = currentActivity.createdAt;
      }

      try {
        await saveActivity(payload);
        renderList();
      } catch (err) {
        errorEl.textContent = err.message || 'Erro ao salvar atividade';
        errorEl.style.display = 'block';
      }
    };

    root.querySelector('#btn-submit-header').addEventListener('click', submitForm);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submitForm();
    });

    // Delete handler
    if (isEditing) {
      root.querySelector('#btn-delete-activity').addEventListener('click', async () => {
        const confirmed = window.confirm(
          `Tem certeza que deseja excluir esta atividade? O histórico de "${currentActivity.name}" também será apagado.`
        );
        if (confirmed) {
          try {
            await deleteActivity(currentActivity.id);
            renderList();
          } catch (err) {
            errorEl.textContent = 'Erro ao excluir atividade: ' + err.message;
            errorEl.style.display = 'block';
          }
        }
      });
    }
  }

  // Initial list view
  renderList();
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
