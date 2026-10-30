/**
 * app.js – application entry point with iOS bottom tab bar navigation.
 * Uses Phosphor Icons for tab bar (outline when inactive, fill when active).
 * Registers service worker for offline use.
 */

import { mountCalendarView } from './ui/calendarView.js';
import { mountDayDetailView } from './ui/dayDetailView.js';
import { mountActivitiesView } from './ui/activitiesView.js';
import { mountSummaryView } from './ui/summaryView.js';
import { ICONS } from './ui/icons.js';
import './version.js';

const APP_NAME = self.APP_NAME || 'Agenda';

// Enforce APP_NAME on document title and iOS home screen meta tag
document.title = APP_NAME;
const appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
if (appleTitleMeta) {
  appleTitleMeta.setAttribute('content', APP_NAME);
}

// Dynamically keep manifest name and short_name bound to APP_NAME
const manifestLink = document.querySelector('link[rel="manifest"]');
if (manifestLink) {
  fetch(manifestLink.href)
    .then((res) => res.json())
    .then((manifest) => {
      if (manifest.name !== APP_NAME || manifest.short_name !== APP_NAME) {
        manifest.name = APP_NAME;
        manifest.short_name = APP_NAME;
        const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
        manifestLink.href = URL.createObjectURL(blob);
      }
    })
    .catch(() => {});
}

const root = document.getElementById('app');

const TAB_ICONS = {
  calendario: {
    outline: ICONS['calendar-blank'],
    fill: ICONS['calendar-blank-fill'],
  },
  atividades: {
    outline: ICONS['check-square'],
    fill: ICONS['check-square-fill'],
  },
  resumo: {
    outline: ICONS['chart-bar'],
    fill: ICONS['chart-bar-fill'],
  },
};

// ── Build shell with bottom tab bar ──────────────────────────────────────────
root.innerHTML = `
  <div class="ios-app-layout">
    <div id="view-container" class="ios-view-container"></div>

    <nav class="ios-tab-bar" aria-label="Navegação principal">
      <button class="ios-tab-item active" data-tab="calendario" aria-label="Aba Calendário">
        <span class="tab-icon-wrap" id="tab-icon-calendario">${TAB_ICONS.calendario.fill}</span>
        <span class="tab-label">Calendário</span>
      </button>

      <button class="ios-tab-item" data-tab="atividades" aria-label="Aba Atividades">
        <span class="tab-icon-wrap" id="tab-icon-atividades">${TAB_ICONS.atividades.outline}</span>
        <span class="tab-label">Atividades</span>
      </button>

      <button class="ios-tab-item" data-tab="resumo" aria-label="Aba Resumo">
        <span class="tab-icon-wrap" id="tab-icon-resumo">${TAB_ICONS.resumo.outline}</span>
        <span class="tab-label">Resumo</span>
      </button>
    </nav>
  </div>
`;

const viewContainer = root.querySelector('#view-container');
const tabButtons = root.querySelectorAll('.ios-tab-item');
const tabBar = root.querySelector('.ios-tab-bar');

let currentTab = 'calendario';

function setTabBarVisible(visible) {
  if (tabBar) {
    tabBar.classList.toggle('hidden', !visible);
  }
  if (viewContainer) {
    viewContainer.classList.toggle('tab-bar-hidden', !visible);
  }
}

function setActiveTab(tabName) {
  currentTab = tabName;
  tabButtons.forEach((btn) => {
    const tabKey = btn.dataset.tab;
    const isActive = tabKey === tabName;
    btn.classList.toggle('active', isActive);

    const iconWrap = btn.querySelector('.tab-icon-wrap');
    if (iconWrap && TAB_ICONS[tabKey]) {
      iconWrap.innerHTML = isActive ? TAB_ICONS[tabKey].fill : TAB_ICONS[tabKey].outline;
    }
  });
}

function showCalendar() {
  setTabBarVisible(true);
  setActiveTab('calendario');
  mountCalendarView(viewContainer, {
    onDaySelect: (dateStr) => showDayDetail(dateStr),
  });
}

function showDayDetail(dateStr) {
  // Day detail keeps the tab bar visible
  setTabBarVisible(true);
  mountDayDetailView(viewContainer, dateStr, {
    onBack: () => showCalendar(),
    onManageActivities: () => showActivities(),
  });
}

function showActivities() {
  setTabBarVisible(true);
  setActiveTab('atividades');
  mountActivitiesView(viewContainer, {
    onBack: () => showCalendar(),
    onFormOpen: () => setTabBarVisible(false),  // Hide tab bar on the activity form
    onFormClose: () => setTabBarVisible(true), // Restore tab bar when exiting form
  });
}

function showSummary() {
  setTabBarVisible(true);
  setActiveTab('resumo');
  mountSummaryView(viewContainer);
}

// ── Tab click handling ───────────────────────────────────────────────────────
tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    if (tab === 'calendario') {
      showCalendar();
    } else if (tab === 'atividades') {
      showActivities();
    } else if (tab === 'resumo') {
      showSummary();
    }
  });
});

// Boot app on Calendar tab
showCalendar();

// ── Register Service Worker for Offline Use (PWA) ────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('./sw.js', { scope: './' });
    } catch (err) {
      console.warn('Falha ao registrar o service worker:', err);
    }
  });
}
