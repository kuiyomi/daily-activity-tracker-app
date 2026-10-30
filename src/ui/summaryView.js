/**
 * summaryView.js – Summary screen placeholder (RF10).
 * Displays monthly stats placeholder with Phosphor chart-bar icon and app version footer.
 */

import { ICONS } from './icons.js';

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
          <p>Calendário do Pai</p>
          <p class="version-code">Versão 0.1.0</p>
        </footer>
      </main>
    </div>
  `;
}
