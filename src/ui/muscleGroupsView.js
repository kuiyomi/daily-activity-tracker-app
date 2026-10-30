/**
 * muscleGroupsView.js – Management screen for muscle groups (RF05).
 * Allows adding new groups, renaming existing ones, and archiving (removing).
 */

import {
  getMuscleGroups,
  saveMuscleGroup,
  archiveMuscleGroup,
} from '../storage/storage.js';

/**
 * Mounts the muscle groups management view into `root`.
 * @param {HTMLElement} root
 * @param {{ onBack: () => void }} options
 */
export async function mountMuscleGroupsView(root, { onBack }) {
  async function render() {
    let groups = [];
    try {
      groups = await getMuscleGroups(false); // only active groups
    } catch (err) {
      console.error('Falha ao carregar grupos musculares:', err);
    }

    root.innerHTML = `
      <div class="screen-view muscle-groups-screen">
        <header class="ios-nav-bar ios-nav-bar--with-back">
          <button class="ios-back-btn" id="btn-back-settings" aria-label="Voltar para Ajustes">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            <span>Ajustes</span>
          </button>
        </header>

        <main class="screen-content">
          <div class="day-heading-container">
            <h1 class="day-large-title">Grupos musculares</h1>
          </div>

          <!-- Add Group Section -->
          <div class="inset-section">
            <div class="inset-section-header">
              <span>Novo grupo</span>
            </div>
            <div class="inset-group">
              <form id="form-add-muscle-group" class="inset-row add-mg-row">
                <input
                  type="text"
                  id="input-new-mg-name"
                  class="ios-input mg-input"
                  placeholder="Nome do grupo (ex: Antebraço)"
                  maxlength="30"
                  required
                />
                <button type="submit" class="ios-nav-action-btn btn-add-mg" id="btn-add-mg">
                  Adicionar
                </button>
              </form>
            </div>
            <div class="inset-section-footer">
              <span>Adicione grupos para registrar nos treinos da academia.</span>
            </div>
          </div>

          <!-- Active Groups List -->
          <div class="inset-section">
            <div class="inset-section-header">
              <span>Grupos cadastrados (${groups.length})</span>
            </div>

            <div class="inset-group" id="mg-list-group">
              ${
                groups.length === 0
                  ? `
                    <div class="inset-row empty-state-row">
                      <p class="empty-state-text">Nenhum grupo ativo. Adicione um acima.</p>
                    </div>
                  `
                  : groups
                      .map(
                        (mg) => `
                        <div class="inset-row mg-item-row" data-id="${mg.id}">
                          <span class="mg-item-name" id="mg-name-${mg.id}">${escapeHtml(mg.name)}</span>
                          <div class="mg-actions">
                            <button
                              type="button"
                              class="mg-action-btn mg-rename-btn"
                              data-id="${mg.id}"
                              data-name="${escapeHtml(mg.name)}"
                              aria-label="Renomear ${escapeHtml(mg.name)}"
                            >
                              Renomear
                            </button>
                            <button
                              type="button"
                              class="mg-action-btn mg-remove-btn"
                              data-id="${mg.id}"
                              data-name="${escapeHtml(mg.name)}"
                              aria-label="Remover ${escapeHtml(mg.name)}"
                            >
                              Remover
                            </button>
                          </div>
                        </div>
                      `
                      )
                      .join('')
              }
            </div>
            <div class="inset-section-footer">
              <span>Grupos removidos não aparecem em novos treinos, mas são mantidos no histórico.</span>
            </div>
          </div>
        </main>
      </div>
    `;

    // Back to Settings
    root.querySelector('#btn-back-settings')?.addEventListener('click', onBack);

    // Form Add Group
    const addForm = root.querySelector('#form-add-muscle-group');
    const addInput = root.querySelector('#input-new-mg-name');

    addForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = addInput.value.trim();
      if (!name) return;

      try {
        await saveMuscleGroup({ name });
        await render();
      } catch (err) {
        alert(err.message || 'Erro ao adicionar grupo muscular.');
      }
    });

    // Rename buttons
    root.querySelectorAll('.mg-rename-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const currentName = btn.dataset.name;
        const newName = window.prompt('Renomear grupo muscular:', currentName);
        if (newName === null) return;
        const trimmed = newName.trim();
        if (!trimmed || trimmed === currentName) return;

        try {
          await saveMuscleGroup({ id, name: trimmed });
          await render();
        } catch (err) {
          alert(err.message || 'Erro ao renomear grupo muscular.');
        }
      });
    });

    // Remove (Archive) buttons
    root.querySelectorAll('.mg-remove-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        const confirmed = window.confirm(
          `Tem certeza que deseja remover o grupo "${name}"?\n\nEle não aparecerá para novas seleções, mas continuará salvo no histórico dos dias anteriores.`
        );
        if (!confirmed) return;

        try {
          await archiveMuscleGroup(id);
          await render();
        } catch (err) {
          alert(err.message || 'Erro ao remover grupo muscular.');
        }
      });
    });
  }

  await render();
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
