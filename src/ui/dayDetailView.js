/**
 * dayDetailView.js – empty day-detail screen (RF02).
 * Shown when the user taps a day; will host activities, notes etc. later.
 */

import { parseDateString } from '../logic/dateUtils.js';

/**
 * Mounts the day-detail screen into `root`.
 *
 * @param {HTMLElement} root
 * @param {string} dateStr – "YYYY-MM-DD"
 * @param {{ onBack: () => void }} options
 */
export function mountDayDetailView(root, dateStr, { onBack }) {
  const date = parseDateString(dateStr);
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);

  // Capitalise first letter
  const heading = formatted.charAt(0).toUpperCase() + formatted.slice(1);

  root.innerHTML = `
    <div class="day-detail">
      <header class="day-header">
        <button class="nav-btn back-btn" id="btn-back" aria-label="Voltar">&#8592;</button>
        <h2 class="day-title">${heading}</h2>
      </header>

      <main class="day-content">
        <p class="day-placeholder">Em breve: atividades, chuva e notas para este dia.</p>
      </main>
    </div>
  `;

  root.querySelector('#btn-back').addEventListener('click', onBack);
}
