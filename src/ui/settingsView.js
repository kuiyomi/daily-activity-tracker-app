/**
 * settingsView.js – Screen for user settings (Ajustes):
 * - Aparência (segmented control: Automático, Claro, Escuro)
 * - Sobre (App name and version)
 */

import '../version.js';
import {
  THEMES,
  getStoredTheme,
  setStoredTheme,
  applyTheme,
} from '../logic/theme.js';

const APP_VERSION = self.APP_VERSION || '0.3.0';
const APP_NAME = self.APP_NAME || 'Agenda';

/**
 * Mounts the settings view into `root`.
 * @param {HTMLElement} root
 */
export function mountSettingsView(root) {
  const currentTheme = getStoredTheme();

  root.innerHTML = `
    <div class="screen-view settings-screen">
      <header class="ios-nav-bar">
        <h1 class="ios-large-title">Ajustes</h1>
      </header>

      <main class="screen-content">
        <!-- Aparência Section -->
        <div class="inset-section">
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
}
