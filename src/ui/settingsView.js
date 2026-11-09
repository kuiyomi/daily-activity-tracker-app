/**
 * settingsView.js – Screen for user settings (Ajustes):
 * - Aparência (segmented control in grouped card: Automático, Claro, Escuro)
 * - Sobre (App name and version)
 */

import '../version.js';
import {
  THEMES,
  getStoredTheme,
  setStoredTheme,
  applyTheme,
} from '../logic/theme.js';
import {
  seedDemoData,
  removeDemoData,
  clearAllData,
} from '../storage/storage.js';

const APP_VERSION = self.APP_VERSION || '0.4.0';
const APP_NAME = self.APP_NAME || 'Agenda';
const STORAGE_KEY_DEV_TOOLS = 'agenda_dev_tools_unlocked';

/**
 * Mounts the settings view into `root`.
 * @param {HTMLElement} root
 * @param {{ onFormOpen?: () => void, onFormClose?: () => void }} [options]
 */
export async function mountSettingsView(root, options = {}) {
  const currentTheme = getStoredTheme();

  root.innerHTML = `
    <div class="screen-view settings-screen">
      <header class="ios-nav-bar">
        <h1 class="ios-large-title">Ajustes</h1>
      </header>

      <main class="screen-content">
        <!-- Aparência Section -->
        <div class="inset-section appearance-section">
          <div class="inset-section-header">
            <span>Aparência</span>
          </div>

          <div class="inset-group">
            <div class="inset-row inset-row-segmented">
              <div class="ios-segmented-control" role="group" aria-label="Aparência do aplicativo">
                <button
                  type="button"
                  class="ios-segment-btn ${currentTheme === THEMES.AUTO ? 'active' : ''}"
                  data-theme-val="${THEMES.AUTO}"
                  aria-pressed="${currentTheme === THEMES.AUTO}"
                >
                  Automático
                </button>
                <button
                  type="button"
                  class="ios-segment-btn ${currentTheme === THEMES.LIGHT ? 'active' : ''}"
                  data-theme-val="${THEMES.LIGHT}"
                  aria-pressed="${currentTheme === THEMES.LIGHT}"
                >
                  Claro
                </button>
                <button
                  type="button"
                  class="ios-segment-btn ${currentTheme === THEMES.DARK ? 'active' : ''}"
                  data-theme-val="${THEMES.DARK}"
                  aria-pressed="${currentTheme === THEMES.DARK}"
                >
                  Escuro
                </button>
              </div>
            </div>
          </div>
          <div class="inset-section-footer">
            <span>Automático segue a configuração do sistema.</span>
          </div>
        </div>

        <!-- Sobre Section -->
        <div class="inset-section">
          <div class="inset-section-header">
            <span>Sobre</span>
          </div>

          <div class="inset-group">
            <div class="inset-row inset-row-info">
              <span class="inset-row-info-label">Nome</span>
              <span class="inset-row-info-value" id="about-app-name">${APP_NAME}</span>
            </div>
            <div class="inset-row inset-row-info" id="about-row-version" style="cursor: pointer; -webkit-tap-highlight-color: transparent;">
              <span class="inset-row-info-label">Versão</span>
              <span class="inset-row-info-value" id="about-app-version">${APP_VERSION}</span>
            </div>
          </div>
        </div>

        <!-- Ferramentas de teste (hidden developer tool) -->
        <div id="dev-tools-container"></div>
      </main>
    </div>
  `;

  // Segment buttons click handling
  const segmentBtns = root.querySelectorAll('.ios-segment-btn');
  segmentBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const selectedTheme = btn.dataset.themeVal;
      setStoredTheme(selectedTheme);
      applyTheme(selectedTheme);

      segmentBtns.forEach((b) => {
        const isActive = b === btn;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-pressed', String(isActive));
      });
    });
  });

  // Confirmation sheet helper
  function openConfirmationSheet({ title, message, actionLabel, isDestructive, onConfirm }) {
    const backdrop = document.createElement('div');
    backdrop.className = 'ios-sheet-backdrop';
    backdrop.id = 'dev-tools-confirmation-sheet';

    const tabBar = document.querySelector('.ios-tab-bar');
    if (tabBar) tabBar.classList.add('hidden');
    if (options.onFormOpen) options.onFormOpen();

    backdrop.innerHTML = `
      <div class="ios-action-sheet" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="ios-action-sheet-group">
          <div class="ios-action-sheet-header">
            <h3 class="ios-action-sheet-title">${title}</h3>
            <p class="ios-action-sheet-message">${message}</p>
          </div>
          <button
            type="button"
            class="ios-sheet-btn ${isDestructive ? 'ios-sheet-btn--destructive' : ''}"
            id="sheet-action-confirm"
          >
            ${actionLabel}
          </button>
        </div>
        <div class="ios-action-sheet-group">
          <button type="button" class="ios-sheet-btn ios-sheet-btn--cancel" id="sheet-action-cancel">
            Cancelar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const closeSheet = () => {
      backdrop.remove();
      if (tabBar) tabBar.classList.remove('hidden');
      if (options.onFormClose) options.onFormClose();
    };

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeSheet();
    });

    backdrop.querySelector('#sheet-action-cancel').addEventListener('click', closeSheet);

    backdrop.querySelector('#sheet-action-confirm').addEventListener('click', async () => {
      try {
        await onConfirm();
      } catch (err) {
        console.error('Erro na ação de desenvolvimento:', err);
      } finally {
        closeSheet();
      }
    });
  }

  // Developer tools container rendering
  const devToolsContainer = root.querySelector('#dev-tools-container');

  function renderDevToolsSection() {
    if (!devToolsContainer) return;
    devToolsContainer.innerHTML = `
      <div class="inset-section" id="dev-tools-section">
        <div class="inset-section-header">
          <span>Ferramentas de teste</span>
        </div>
        <div class="inset-group">
          <button type="button" class="inset-row nav-row is-interactive" id="btn-load-demo-data">
            <span class="inset-row-label">Carregar dados de exemplo</span>
            <svg class="ios-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
          <button type="button" class="inset-row nav-row is-interactive" id="btn-remove-demo-data">
            <span class="inset-row-label">Remover dados de exemplo</span>
            <svg class="ios-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
          <button type="button" class="inset-row nav-row is-interactive" id="btn-clear-all-data">
            <span class="inset-row-label row-label-destructive">Apagar todos os dados</span>
            <svg class="ios-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>
      </div>
    `;

    const btnLoad = devToolsContainer.querySelector('#btn-load-demo-data');
    if (btnLoad) {
      btnLoad.addEventListener('click', () => {
        openConfirmationSheet({
          title: 'Carregar dados de exemplo',
          message: 'Isso adicionará atividades e registros de exemplo para testar o aplicativo. Seus registros reais não serão alterados.',
          actionLabel: 'Carregar dados de exemplo',
          isDestructive: false,
          onConfirm: async () => {
            await seedDemoData();
          },
        });
      });
    }

    const btnRemove = devToolsContainer.querySelector('#btn-remove-demo-data');
    if (btnRemove) {
      btnRemove.addEventListener('click', () => {
        openConfirmationSheet({
          title: 'Remover dados de exemplo',
          message: 'Todas as atividades e registros de exemplo serão removidos. Seus registros reais serão mantidos.',
          actionLabel: 'Remover dados de exemplo',
          isDestructive: true,
          onConfirm: async () => {
            await removeDemoData();
          },
        });
      });
    }

    const btnClearAll = devToolsContainer.querySelector('#btn-clear-all-data');
    if (btnClearAll) {
      btnClearAll.addEventListener('click', () => {
        openConfirmationSheet({
          title: 'Apagar todos os dados',
          message: 'Todos os dados do aplicativo serão apagados permanentemente e a atividade Academia será restaurada. Esta ação não pode ser desfeita.',
          actionLabel: 'Apagar todos os dados',
          isDestructive: true,
          onConfirm: async () => {
            await clearAllData();
          },
        });
      });
    }
  }

  // Check stored unlock state
  let isDevToolsUnlocked = false;
  try {
    isDevToolsUnlocked = localStorage.getItem(STORAGE_KEY_DEV_TOOLS) === 'true';
  } catch (_) {}

  if (isDevToolsUnlocked) {
    renderDevToolsSection();
  }

  // Hidden unlock: 7 taps within 3 seconds on the "Versão" row
  let tapTimestamps = [];
  const versionRow = root.querySelector('#about-row-version');
  if (versionRow) {
    versionRow.addEventListener('click', () => {
      const now = Date.now();
      tapTimestamps = tapTimestamps.filter((t) => now - t <= 3000);
      tapTimestamps.push(now);

      if (tapTimestamps.length >= 7) {
        tapTimestamps = [];
        try {
          localStorage.setItem(STORAGE_KEY_DEV_TOOLS, 'true');
        } catch (_) {}
        renderDevToolsSection();
      }
    });
  }
}
