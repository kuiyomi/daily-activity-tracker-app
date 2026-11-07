/**
 * activitiesView.js – Screen to list, create, edit, and delete activities.
 * Follows iOS navigation: pushed screens with back chevrons and persistent tab bar.
 */

import {
  getActivities,
  saveActivity,
  deleteActivity,
} from '../storage/storage.js';
import {
  PRESET_COLORS,
  DEFAULT_MUSCLE_GROUPS,
  getNextAvailablePresetColor,
  muscleGroupSlug,
} from '../logic/activityLogic.js';
import {
  ACTIVITY_ICON_KEYS,
  ICONS,
  renderIconGlyph,
  normalizeIconKey,
} from './icons.js';

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

const CHEVRON_SVG = `
  <svg class="ios-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
`;

const BACK_CHEVRON_SVG = `
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 18 9 12 15 6"></polyline>
  </svg>
`;

/**
 * Mounts the activities view into `root`.
 * @param {HTMLElement} root
 * @param {{ onBack?: () => void, onFormOpen?: () => void, onFormClose?: () => void }} [options]
 */
export async function mountActivitiesView(root, { onBack, onFormOpen, onFormClose } = {}) {
  root.innerHTML = `<div class="activities-view-stack" id="activities-stack"></div>`;
  const stack = root.querySelector('#activities-stack');

  let currentActivities = [];
  let currentDraft = null;
  let isEditing = false;
  let activeSubscreen = null;
  let isTransitioning = false;

  async function transitionTo(newElement, direction = 'none') {
    if (!stack) return;

    if (direction === 'none' || !activeSubscreen) {
      if (activeSubscreen) activeSubscreen.remove();
      newElement.classList.add('activities-subscreen', 'activities-subscreen--current');
      stack.appendChild(newElement);
      activeSubscreen = newElement;
      return;
    }

    if (isTransitioning && activeSubscreen) {
      activeSubscreen.remove();
    }
    isTransitioning = true;

    const outgoing = activeSubscreen;
    const incoming = newElement;

    outgoing.classList.remove('activities-subscreen--current');
    outgoing.classList.add('activities-subscreen--outgoing', `activities-subscreen--${direction}-out`);
    incoming.classList.add('activities-subscreen', 'activities-subscreen--incoming', `activities-subscreen--${direction}-in`);

    stack.appendChild(incoming);
    // Force reflow
    void incoming.offsetWidth;

    outgoing.classList.add('is-animating');
    incoming.classList.add('is-animating');

    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        incoming.removeEventListener('transitionend', onEnd);
        clearTimeout(timer);
        resolve();
      };
      const onEnd = (e) => {
        if (e.target === incoming && e.propertyName === 'transform') finish();
      };
      const timer = setTimeout(finish, 270);
      incoming.addEventListener('transitionend', onEnd);
    });

    outgoing.remove();
    incoming.classList.remove('activities-subscreen--incoming', `activities-subscreen--${direction}-in`, 'is-animating');
    incoming.classList.add('activities-subscreen--current');
    activeSubscreen = incoming;
    isTransitioning = false;
  }

  function formatOptionCount(group) {
    const activeOpts = Array.isArray(group?.options)
      ? group.options.filter((o) => !o.archived)
      : [];
    const count = activeOpts.length;
    if (count === 1) return '1 opção';
    return `${count} opções`;
  }

  // ── 1. List View ──────────────────────────────────────────────────────────
  async function renderList(direction = 'none') {
    if (onFormClose) onFormClose();
    currentDraft = null;
    isEditing = false;

    try {
      currentActivities = await getActivities();
    } catch (err) {
      console.error('Falha ao carregar atividades:', err);
      currentActivities = [];
    }

    const activities = currentActivities;
    const container = document.createElement('div');
    container.className = 'screen-view activities-screen';

    container.innerHTML = `
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
                      </div>
                      ${CHEVRON_SVG}
                    </div>
                  `
                    )
                    .join('')}
                </div>
              `
          }
        </div>
      </main>
    `;

    container.querySelector('#btn-new-activity').addEventListener('click', () => {
      openActivityForm(null, 'push');
    });

    container.querySelectorAll('.activity-item-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        const act = activities.find((a) => a.id === id);
        if (act) openActivityForm(act, 'push');
      });
    });

    await transitionTo(container, direction);
  }

  function openActivityForm(activityToEdit, direction = 'push') {
    isEditing = Boolean(activityToEdit);

    if (activityToEdit) {
      currentDraft = JSON.parse(JSON.stringify(activityToEdit));
      if (!Array.isArray(currentDraft.groups)) currentDraft.groups = [];
      currentDraft.allowsNote = Boolean(activityToEdit.allowsNote);
    } else {
      currentDraft = {
        name: '',
        icon: ACTIVITY_ICON_KEYS[0],
        color: getNextAvailablePresetColor(currentActivities, PRESET_COLORS),
        groups: [],
        allowsNote: false,
      };
    }

    renderFormScreen(direction);
  }

  // ── 2. Activity Form Screen (Pushed Screen) ────────────────────────────────
  async function renderFormScreen(direction = 'none') {
    if (onFormOpen) onFormOpen();

    const container = document.createElement('div');
    container.className = 'screen-view activity-form-screen';

    const selectedIconKey = normalizeIconKey(currentDraft.icon) || ACTIVITY_ICON_KEYS[0];
    const selectedColor = currentDraft.color || getNextAvailablePresetColor(currentActivities, PRESET_COLORS);
    const isPreset = PRESET_COLORS.some((c) => c.toLowerCase() === selectedColor.toLowerCase());

    const activeGroups = (currentDraft.groups || []).filter((g) => !g.archived);
    const isValidName = Boolean(currentDraft.name && currentDraft.name.trim().length > 0 && currentDraft.name.trim().length <= 50);

    container.innerHTML = `
      <header class="ios-nav-bar ios-nav-bar--pushed">
        <button type="button" class="ios-back-btn" id="btn-back-activity-form" aria-label="Voltar para Atividades">
          ${BACK_CHEVRON_SVG}
          <span>Atividades</span>
        </button>
        <h2 class="ios-nav-title">${isEditing ? 'Editar atividade' : 'Nova atividade'}</h2>
        <button
          type="button"
          class="ios-nav-action-btn ios-nav-action-btn--bold"
          id="btn-submit-header"
          ${isValidName ? '' : 'disabled'}
        >
          Salvar
        </button>
      </header>

      <main class="screen-content">
        <form class="ios-form" id="activity-form" onsubmit="return false;">
          <!-- Section: Nome -->
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
                  value="${escapeHtml(currentDraft.name || '')}"
                  maxlength="50"
                  required
                  ${isEditing ? '' : 'autofocus'}
                />
              </div>
            </div>
          </div>

          <!-- Section: Ícone -->
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

          <!-- Section: Cor -->
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

          <!-- Section: Detalhes -->
          <div class="inset-section">
            <div class="inset-section-header">
              <span>Detalhes</span>
            </div>
            <div class="inset-group detail-groups-list">
              ${activeGroups
                .map(
                  (grp) => `
                <div class="inset-row detail-group-row" data-group-id="${grp.id}" role="button" tabindex="0">
                  <span class="detail-group-name">${escapeHtml(grp.name || 'Sem nome')}</span>
                  <div class="detail-group-meta">
                    <span class="detail-group-count">${formatOptionCount(grp)}</span>
                    ${CHEVRON_SVG}
                  </div>
                </div>
              `
                )
                .join('')}

              <div class="inset-row link-row add-detail-group-row" id="btn-add-detail-group" role="button" tabindex="0">
                <span class="ios-blue-text">+ Adicionar detalhe</span>
              </div>
            </div>
          </div>

          <!-- Section: Observações -->
          <div class="inset-section">
            <div class="inset-section-header">
              <span>Observações</span>
            </div>
            <div class="inset-group">
              <label class="inset-row toggle-row" for="form-act-allows-note">
                <span class="toggle-label-title">Permitir observação</span>
                <input
                  type="checkbox"
                  id="form-act-allows-note"
                  class="ios-switch"
                  role="switch"
                  aria-label="Permitir observação"
                  ${currentDraft.allowsNote ? 'checked' : ''}
                />
              </label>
            </div>
            <div class="inset-section-footer">
              <span>Mostra um campo de observação nos dias em que a atividade for planejada ou registrada.</span>
            </div>
          </div>

          <!-- Section: Excluir atividade (if editing) -->
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
    `;

    const nameInput = container.querySelector('#form-act-name');
    const submitBtn = container.querySelector('#btn-submit-header');
    const colorInput = container.querySelector('#form-act-color');
    const customColorLabel = container.querySelector('#custom-color-label');
    const customColorContent = container.querySelector('#custom-color-content');
    const errorEl = container.querySelector('#form-error');

    // Name input validation and sync
    nameInput.addEventListener('input', () => {
      currentDraft.name = nameInput.value;
      const valid = Boolean(nameInput.value.trim().length > 0 && nameInput.value.trim().length <= 50);
      submitBtn.disabled = !valid;
    });

    // Icon buttons
    container.querySelectorAll('.icon-choice-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.icon-choice-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        currentDraft.icon = btn.dataset.icon;
      });
    });

    // Color buttons
    function updateSelectedColor(hex) {
      currentDraft.color = hex;
      colorInput.value = hex;
      const normalized = hex.toLowerCase();
      let matchedPreset = false;

      container.querySelectorAll('.color-choice-btn:not(.color-choice-custom)').forEach((btn) => {
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
        customColorLabel.style.backgroundColor = hex;
        customColorContent.innerHTML = CHECKMARK_SVG;
      }
    }

    container.querySelectorAll('.color-choice-btn:not(.color-choice-custom)').forEach((btn) => {
      btn.addEventListener('click', () => {
        updateSelectedColor(btn.dataset.color);
      });
    });

    colorInput.addEventListener('input', (e) => {
      updateSelectedColor(e.target.value);
    });

    // Allows note switch
    const allowsNoteSwitch = container.querySelector('#form-act-allows-note');
    if (allowsNoteSwitch) {
      allowsNoteSwitch.addEventListener('change', () => {
        currentDraft.allowsNote = allowsNoteSwitch.checked;
      });
    }

    // Back button
    container.querySelector('#btn-back-activity-form').addEventListener('click', () => {
      renderList('back');
    });

    // Submit / Save button
    submitBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name) return;

      errorEl.style.display = 'none';

      const payload = {
        name,
        icon: currentDraft.icon || ACTIVITY_ICON_KEYS[0],
        color: currentDraft.color || '#007aff',
        groups: Array.isArray(currentDraft.groups) ? currentDraft.groups : [],
        allowsNote: Boolean(currentDraft.allowsNote),
      };

      if (isEditing && currentDraft.id) {
        payload.id = currentDraft.id;
        payload.createdAt = currentDraft.createdAt;
      }

      try {
        await saveActivity(payload);
        renderList('back');
      } catch (err) {
        errorEl.textContent = err.message || 'Erro ao salvar atividade';
        errorEl.style.display = 'block';
      }
    });

    // Delete activity
    if (isEditing) {
      container.querySelector('#btn-delete-activity').addEventListener('click', async () => {
        const confirmed = window.confirm(
          `Tem certeza que deseja excluir esta atividade? O histórico de "${currentDraft.name}" também será apagado.`
        );
        if (confirmed) {
          try {
            await deleteActivity(currentDraft.id);
            renderList('back');
          } catch (err) {
            errorEl.textContent = 'Erro ao excluir atividade: ' + err.message;
            errorEl.style.display = 'block';
          }
        }
      });
    }

    // Detail group row click -> push Detail screen
    container.querySelectorAll('.detail-group-row').forEach((row) => {
      row.addEventListener('click', () => {
        const groupId = row.dataset.groupId;
        const group = (currentDraft.groups || []).find((g) => g.id === groupId);
        if (group) {
          renderDetailScreen(group, 'push', false);
        }
      });
    });

    // Add detail group row click -> push Detail screen with new group
    container.querySelector('#btn-add-detail-group').addEventListener('click', () => {
      const newGroup = {
        id: `grp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: '',
        multiple: true,
        archived: false,
        options: [],
      };
      if (!Array.isArray(currentDraft.groups)) currentDraft.groups = [];
      currentDraft.groups.push(newGroup);
      renderDetailScreen(newGroup, 'push', true);
    });

    await transitionTo(container, direction);
  }

  // ── 3. Detail Screen (Pushed Screen) ──────────────────────────────────────
  async function renderDetailScreen(group, direction = 'none', isNew = false) {
    const container = document.createElement('div');
    container.className = 'screen-view detail-edit-screen';

    function getActiveOptions() {
      return (group.options || []).filter((o) => !o.archived);
    }

    function renderDetailContent() {
      const activeOptions = getActiveOptions();

      container.innerHTML = `
        <header class="ios-nav-bar ios-nav-bar--pushed">
          <button type="button" class="ios-back-btn" id="btn-back-detail" aria-label="Voltar">
            ${BACK_CHEVRON_SVG}
            <span>Voltar</span>
          </button>
          <h2 class="ios-nav-title">Detalhe</h2>
          <div style="width: 44px; min-width: 44px;" aria-hidden="true"></div>
        </header>

        <main class="screen-content">
          <!-- Section: Nome -->
          <div class="inset-section">
            <div class="inset-section-header">
              <span>Nome</span>
            </div>
            <div class="inset-group">
              <div class="inset-row input-row">
                <input
                  type="text"
                  id="detail-group-name-input"
                  class="ios-input"
                  placeholder="Nome do detalhe (ex: Grupos musculares)"
                  value="${escapeHtml(group.name || '')}"
                  maxlength="50"
                  autofocus
                />
              </div>
            </div>
          </div>

          <!-- Section: Segmented control Várias opções | Uma opção -->
          <div class="inset-section">
            <div class="inset-section-header">
              <span>Seleção</span>
            </div>
            <div class="segmented-control-track-wrapper">
              <div class="ios-segmented-control" role="group" aria-label="Tipo de seleção">
                <button
                  type="button"
                  class="ios-segment-btn ${group.multiple ? 'active' : ''}"
                  id="btn-seg-multiple"
                  data-multiple="true"
                  aria-pressed="${group.multiple}"
                >
                  Várias opções
                </button>
                <button
                  type="button"
                  class="ios-segment-btn ${!group.multiple ? 'active' : ''}"
                  id="btn-seg-single"
                  data-multiple="false"
                  aria-pressed="${!group.multiple}"
                >
                  Uma opção
                </button>
              </div>
            </div>
          </div>

          <!-- Template button for new empty group -->
          ${
            activeOptions.length === 0
              ? `
            <div class="inset-section" id="section-muscle-template">
              <div class="inset-group">
                <button type="button" class="inset-row link-row" id="btn-use-muscle-template">
                  <span class="ios-blue-text">Usar modelo: grupos musculares</span>
                </button>
              </div>
            </div>
          `
              : ''
          }

          <!-- Grouped list of options -->
          <div class="inset-section">
            <div class="inset-section-header">
              <span>Opções</span>
            </div>
            <div class="inset-group detail-options-group">
              ${activeOptions
                .map(
                  (opt) => `
                <div class="inset-row detail-option-row" data-opt-id="${opt.id}" role="button" tabindex="0">
                  <span class="detail-option-name">${escapeHtml(opt.name)}</span>
                  ${CHEVRON_SVG}
                </div>
              `
                )
                .join('')}

              <div class="inset-row add-option-row">
                <input
                  type="text"
                  id="input-add-option"
                  class="ios-input add-option-input"
                  placeholder="Adicionar opção"
                  maxlength="40"
                />
                <button type="button" class="add-option-btn" id="btn-add-option" aria-label="Adicionar opção">
                  Adicionar
                </button>
              </div>
            </div>
          </div>

          <!-- Section: Remover detalhe -->
          <div class="inset-section">
            <div class="inset-group">
              <button type="button" class="inset-row delete-row" id="btn-delete-group">
                <span>Remover detalhe</span>
              </button>
            </div>
          </div>
        </main>
      `;

      attachDetailEvents();
    }

    function attachDetailEvents() {
      const nameInput = container.querySelector('#detail-group-name-input');
      const addInput = container.querySelector('#input-add-option');
      const addBtn = container.querySelector('#btn-add-option');

      // Name sync
      nameInput.addEventListener('input', () => {
        group.name = nameInput.value;
      });

      // Segmented control
      const segMultiple = container.querySelector('#btn-seg-multiple');
      const segSingle = container.querySelector('#btn-seg-single');

      segMultiple.addEventListener('click', () => {
        group.multiple = true;
        segMultiple.classList.add('active');
        segMultiple.setAttribute('aria-pressed', 'true');
        segSingle.classList.remove('active');
        segSingle.setAttribute('aria-pressed', 'false');
      });

      segSingle.addEventListener('click', () => {
        group.multiple = false;
        segSingle.classList.add('active');
        segSingle.setAttribute('aria-pressed', 'true');
        segMultiple.classList.remove('active');
        segMultiple.setAttribute('aria-pressed', 'false');
      });

      // Template button
      const templateBtn = container.querySelector('#btn-use-muscle-template');
      if (templateBtn) {
        templateBtn.addEventListener('click', () => {
          if (!group.name || !group.name.trim()) {
            group.name = 'Grupos musculares';
          }
          if (!Array.isArray(group.options)) group.options = [];
          DEFAULT_MUSCLE_GROUPS.forEach((mName, idx) => {
            group.options.push({
              id: `opt_${muscleGroupSlug(mName)}_${Date.now()}_${idx}`,
              name: mName,
              archived: false,
            });
          });
          renderDetailContent();
        });
      }

      // Add option handler
      const handleAddOption = () => {
        const val = addInput.value.trim();
        if (!val) return;
        if (!Array.isArray(group.options)) group.options = [];
        group.options.push({
          id: `opt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: val,
          archived: false,
        });
        renderDetailContent();
      };

      addBtn.addEventListener('click', handleAddOption);
      addInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAddOption();
        }
      });

      // Option row click -> Edit / Remove option dialog
      container.querySelectorAll('.detail-option-row').forEach((row) => {
        row.addEventListener('click', () => {
          const optId = row.dataset.optId;
          const opt = (group.options || []).find((o) => o.id === optId);
          if (!opt) return;

          openOptionDialog(opt);
        });
      });

      // Delete group button
      container.querySelector('#btn-delete-group').addEventListener('click', () => {
        const confirmed = window.confirm(
          `Tem certeza que deseja remover este detalhe? O histórico de preenchimentos anteriores será mantido.`
        );
        if (confirmed) {
          group.archived = true;
          renderFormScreen('back');
        }
      });

      // Back chevron button
      container.querySelector('#btn-back-detail').addEventListener('click', () => {
        // Sanitize group name
        group.name = (group.name || '').trim();

        // If newly created and left completely empty, discard it
        if (isNew && !group.name && getActiveOptions().length === 0) {
          currentDraft.groups = currentDraft.groups.filter((g) => g !== group);
        }

        renderFormScreen('back');
      });
    }

    function openOptionDialog(opt) {
      const dialogBackdrop = document.createElement('div');
      dialogBackdrop.className = 'ios-dialog-backdrop';
      dialogBackdrop.id = 'option-dialog-backdrop';

      dialogBackdrop.innerHTML = `
        <div class="ios-dialog-card" role="dialog" aria-modal="true" aria-labelledby="dialog-opt-title">
          <h3 class="ios-dialog-title" id="dialog-opt-title">Opção</h3>
          <div class="ios-dialog-body">
            <input
              type="text"
              id="dialog-opt-name"
              class="ios-input dialog-opt-input"
              value="${escapeHtml(opt.name)}"
              maxlength="40"
              placeholder="Nome da opção"
              autofocus
            />
          </div>
          <div class="ios-dialog-buttons">
            <button type="button" class="ios-dialog-btn ios-dialog-btn--primary" id="dialog-btn-save-opt">Salvar</button>
            <button type="button" class="ios-dialog-btn ios-dialog-btn--destructive" id="dialog-btn-remove-opt">Remover opção</button>
            <button type="button" class="ios-dialog-btn ios-dialog-btn--cancel" id="dialog-btn-cancel-opt">Cancelar</button>
          </div>
        </div>
      `;

      const dialogInput = dialogBackdrop.querySelector('#dialog-opt-name');
      const saveBtn = dialogBackdrop.querySelector('#dialog-btn-save-opt');
      const removeBtn = dialogBackdrop.querySelector('#dialog-btn-remove-opt');
      const cancelBtn = dialogBackdrop.querySelector('#dialog-btn-cancel-opt');

      const closeDialog = () => dialogBackdrop.remove();

      saveBtn.addEventListener('click', () => {
        const newName = dialogInput.value.trim();
        if (newName) {
          opt.name = newName;
          closeDialog();
          renderDetailContent();
        }
      });

      dialogInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveBtn.click();
        }
      });

      removeBtn.addEventListener('click', () => {
        opt.archived = true;
        closeDialog();
        renderDetailContent();
      });

      cancelBtn.addEventListener('click', closeDialog);
      dialogBackdrop.addEventListener('click', (e) => {
        if (e.target === dialogBackdrop) closeDialog();
      });

      document.body.appendChild(dialogBackdrop);
      dialogInput.focus();
    }

    renderDetailContent();
    await transitionTo(container, direction);
  }

  // Initial list view
  await renderList('none');
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
