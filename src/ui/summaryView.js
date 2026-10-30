/**
 * summaryView.js – Summary screen placeholder (RF10).
 * Displays monthly stats placeholder with Phosphor chart-bar icon and app version footer.
 * Reads self.APP_VERSION after side-effect import of src/version.js (single source of truth).
 */

import '../version.js';
import { ICONS } from './icons.js';

const APP_VERSION = self.APP_VERSION;

/**
 * Mounts the summary view into `root`.
 * @param {HTMLElement} root
 */
export function mountSummaryView(root) {
  root.innerHTML = `
    <div class="screen-view">
      <header class="ios-nav-bar">
        <h1 class="ios-large-title">Resumo</h1>
      </header>

      <main class="screen-content">
        <div class="inset-section">
          <div class="inset-group">
            <div class="inset-row summary-placeholder-row">
              <div class="activity-icon-badge summary-badge" style="background-color: var(--ios-blue);">
                ${ICONS['chart-bar']}
              </div>
              <div class="summary-placeholder-text">
                <p class="summary-placeholder-title">Estatísticas mensais</p>
                <p class="summary-placeholder-desc">
                  Em breve: dias de academia, frequência de treinos e resumo de dias chuvosos.
                </p>
              </div>
            </div>
          </div>
        </div>

        <footer class="app-version-footer">
          <p>Agenda</p>
          <p class="version-code">Versão ${APP_VERSION}</p>
        </footer>
      </main>
    </div>
  `;
}
