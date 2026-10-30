/**
 * settingsView.js – Screen for user settings (Ajustes):
 * - Aparência (native standalone segmented control: Automático, Claro, Escuro)
 * - Grupos musculares (navigation row to manage muscle groups)
 * - Sobre (App name and version)
 */

import '../version.js';
import {
  THEMES,
  getStoredTheme,
  setStoredTheme,
  applyTheme,
} from '../logic/theme.js';
import { getMuscleGroups } from '../storage/storage.js';
import { mountMuscleGroupsView } from './muscleGroupsView.js';

const APP_VERSION = self.APP_VERSION || '0.4.0';
const APP_NAME = self.APP_NAME || 'Agenda';

/**
 * Mounts the settings view into `root`.
 * @param {HTMLElement} root
 */
export async function mountSettingsView(root) {
  let activeGroupsCount = 0;
  try {
    const groups = await getMuscleGroups(false);
    activeGroupsCount = groups.length;
  } catch (err) {
    console.error('Falha ao contar grupos musculares:', err);
  }

  const currentTheme = getStoredTheme();

  root.innerHTML = `
    <div class="screen-view settings-screen">
      <header class="ios-nav-bar">
        <h1 class="ios-large-title">Ajustes</h1>
      </header>

      <main class="screen-content">
        <!-- Aparência Section (Native segmented control without extra card wrapper) -->
        <div class="inset-section appearance-section">
          <div class="inset-section-header">
            <span>Aparência</span>
          </div>

          <div class="segmented-control-track-wrapper">
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
          <div class="inset-section-footer">
            <span>Automático segue a configuração do sistema.</span>
          </div>
        </div>

        <!-- Treino / Grupos musculares Section -->
        <div class="inset-section">
          <div class="inset-section-header">
            <span>Treino</span>
          </div>

          <div class="inset-group">
            <div class="inset-row nav-row" id="btn-goto-muscle-groups" role="button" tabindex="0">
              <span class="inset-row-info-label">Grupos musculares</span>
              <div class="inset-row-right">
                <span class="inset-row-info-value" id="muscle-groups-count">${activeGroupsCount}</span>
                <svg class="ios-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </div>
            </div>
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
            <div class="inset-row inset-row-info">
              <span class="inset-row-info-label">Versão</span>
              <span class="inset-row-info-value" id="about-app-version">${APP_VERSION}</span>
            </div>
          </div>
        </div>
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

  // Navigation to Muscle Groups View
  const gotoMgBtn = root.querySelector('#btn-goto-muscle-groups');
  gotoMgBtn?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      gotoMgBtn.click();
    }
  });

  gotoMgBtn?.addEventListener('click', async () => {
    try {
      await mountMuscleGroupsView(root, {
        onBack: () => mountSettingsView(root),
      });
    } catch (err) {
      console.error('Falha ao abrir grupos musculares:', err);
      await mountSettingsView(root);
      window.alert('Não foi possível abrir os grupos musculares. Tente de novo.');
    }
  });
}
