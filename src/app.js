/**
 * app.js – application entry point with iOS bottom tab bar navigation.
 * Uses Phosphor Icons for tab bar (outline when inactive, fill when active).
 * Registers service worker for offline use.
 */

import { mountCalendarView } from './ui/calendarView.js';
import { mountDayDetailView } from './ui/dayDetailView.js';
import { mountActivitiesView } from './ui/activitiesView.js';
import { mountSummaryView } from './ui/summaryView.js';
import { mountSettingsView } from './ui/settingsView.js';
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
  ajustes: {
    outline: ICONS['gear-six'],
    fill: ICONS['gear-six-fill'],
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

      <button class="ios-tab-item hidden" data-tab="resumo" aria-label="Aba Resumo" style="display: none;" aria-hidden="true">
        <span class="tab-icon-wrap" id="tab-icon-resumo">${TAB_ICONS.resumo.outline}</span>
        <span class="tab-label">Resumo</span>
      </button>

      <button class="ios-tab-item" data-tab="ajustes" aria-label="Aba Ajustes">
        <span class="tab-icon-wrap" id="tab-icon-ajustes">${TAB_ICONS.ajustes.outline}</span>
        <span class="tab-label">Ajustes</span>
      </button>
    </nav>
  </div>
`;

const viewContainer = root.querySelector('#view-container');
const tabButtons = root.querySelectorAll('.ios-tab-item');
const tabBar = root.querySelector('.ios-tab-bar');

let currentTab = 'calendario';
let navigationId = 0;
let navigationRequestId = 0;
let navigationLock = null;

function waitForMotion(element, property, fallbackMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      element.removeEventListener('transitionend', onEnd);
      clearTimeout(timeout);
      resolve();
    };
    const onEnd = (event) => {
      if (event.target === element && event.propertyName === property) finish();
    };
    const timeout = setTimeout(finish, fallbackMs);
    element.addEventListener('transitionend', onEnd);
  });
}

async function changeView(mount, motion = 'fade', onRendered) {
  const id = ++navigationId;
  const outgoing = viewContainer.querySelector('.view-layer--current');
  const incoming = document.createElement('div');
  incoming.className = 'view-layer view-layer--current';

  const lock = { id };
  navigationLock = lock;
  let releaseTimer = null;
  const lockTimeout = new Promise((_, reject) => {
    // A stalled mount or transition lock can never block navigation for more than ~500ms.
    releaseTimer = setTimeout(() => {
      if (navigationLock === lock) navigationLock = null;
      reject(new Error('Tempo limite de navegação excedido (500ms)'));
    }, 500);
  });

  try {
    await Promise.race([ Promise.resolve().then(() => mount(incoming)), lockTimeout ]);
    clearTimeout(releaseTimer);
    if (navigationLock === lock) navigationLock = null;
    if (id !== navigationId) {
      incoming.remove();
      return false;
    }
    if (!incoming.querySelector('.screen-view')) throw new Error('Tela não foi renderizada');
  } catch (error) {
    clearTimeout(releaseTimer);
    if (navigationLock === lock) navigationLock = null;
    incoming.remove();
    console.error('Falha ao renderizar tela:', error);
    if (outgoing && id === navigationId) {
      Array.from(viewContainer.children).forEach((child) => {
        if (child !== outgoing) child.remove();
      });
      outgoing.className = 'view-layer view-layer--current';
    } else if (!outgoing && !viewContainer.querySelector('.view-layer--current')) {
      viewContainer.innerHTML = '<p class="view-error">Não foi possível abrir esta tela. Tente novamente.</p>';
    }
    return false;
  }

  Array.from(viewContainer.children).forEach((child) => {
    if (child !== outgoing) child.remove();
  });

  viewContainer.prepend(incoming);
  if (onRendered) onRendered();

  if (!outgoing) {
    return true;
  }

  outgoing.className = `view-layer view-layer--outgoing view-layer--${motion}-out`;
  incoming.classList.add('view-layer--incoming', `view-layer--${motion}-in`);
  // Force the initial transform to paint before moving both layers.
  void incoming.offsetWidth;
  outgoing.classList.add('is-animating');
  incoming.classList.add('is-animating');
  const prop = motion === 'fade' ? 'opacity' : 'transform';
  const fallbackMs = motion === 'fade' ? 230 : 430;
  await Promise.all([waitForMotion(incoming, prop, fallbackMs), waitForMotion(outgoing, prop, fallbackMs)]);
  outgoing.remove();
  if (id !== navigationId) return true;
  incoming.className = 'view-layer view-layer--current';
  return true;
}

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

async function navigate(tabName, mount, motion = 'fade') {
  const requestId = ++navigationRequestId;
  const previousTab = currentTab;
  const rendered = await changeView(mount, motion, () => {
    isEditFormOpen = false;
    setTabBarVisible(true);
    setActiveTab(tabName);
  });

  if (!rendered && requestId === navigationRequestId) {
    // The old layer remains mounted; restore its tab selection for the latest request.
    setActiveTab(previousTab);
    return false;
  }

  return rendered;
}

function showCalendar(motion = 'fade') {
  return navigate('calendario', async (layer) => {
    await mountCalendarView(layer, {
      onDaySelect: (dateStr) => showDayDetail(dateStr),
    });
    if (!layer.querySelector('.cal-day')) {
      await new Promise((resolve) => {
        const observer = new MutationObserver(() => {
          if (layer.querySelector('.cal-day')) {
            observer.disconnect();
            resolve();
          }
        });
        observer.observe(layer, { childList: true, subtree: true });
        setTimeout(() => {
          observer.disconnect();
          resolve();
        }, 250);
      });
    }
  }, motion);
}

function showDayDetail(dateStr) {
  return navigate('calendario', (layer) => mountDayDetailView(layer, dateStr, {
    onBack: () => showCalendar('day-back'),
    onManageActivities: () => showActivities(),
  }), 'day-forward');
}

let isEditFormOpen = false;

function isAnyFormOpen() {
  return isEditFormOpen || Boolean(document.querySelector('#activity-form, .ios-form, form'));
}

function showUpdateBanner() {
  if (document.getElementById('sw-update-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'sw-update-banner';
  banner.className = 'ios-update-banner';
  banner.setAttribute('role', 'alert');
  banner.innerHTML = `<span>Nova versão disponível. Toque para atualizar.</span>`;

  banner.addEventListener('click', () => {
    window.location.reload();
  });

  document.body.appendChild(banner);
}

function showActivities() {
  return navigate('atividades', (layer) => mountActivitiesView(layer, {
    onBack: () => showCalendar(),
    onFormOpen: () => {
      isEditFormOpen = true;
      setTabBarVisible(true);   // Tab bar remains visible on pushed activity form
    },
    onFormClose: () => {
      isEditFormOpen = false;
      setTabBarVisible(true);
    },
  }), 'fade');
}

function showSummary() {
  return navigate('resumo', (layer) => mountSummaryView(layer), 'fade');
}

function showSettings() {
  return navigate('ajustes', (layer) => mountSettingsView(layer, {
    onFormOpen: () => {
      isEditFormOpen = true;
      setTabBarVisible(false);
    },
    onFormClose: () => {
      isEditFormOpen = false;
      setTabBarVisible(true);
    },
  }), 'fade');
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
    } else if (tab === 'ajustes') {
      showSettings();
    }
  });
});

// Boot app on Calendar tab
showCalendar();

// ── Register Service Worker for Offline Use (PWA) ────────────────────────────
if ('serviceWorker' in navigator) {
  let refreshing = false;
  let hadController = Boolean(navigator.serviceWorker.controller);

  // When a new SW takes control, reload once or show banner if editing
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // If there was no previous controller, this is the initial install taking control
    if (!hadController) {
      hadController = true;
      return;
    }

    if (refreshing) return;

    if (isAnyFormOpen()) {
      showUpdateBanner();
      return;
    }

    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', {
        scope: './',
        updateViaCache: 'none',
      });

      // Check for SW updates on every app launch
      registration.update().catch((err) => {
        console.warn('Falha ao verificar atualização do service worker no início:', err);
      });

      // Check for SW updates whenever app becomes visible again
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch((err) => {
            console.warn('Falha ao verificar atualização do service worker no visibilitychange:', err);
          });
        }
      });
    } catch (err) {
      console.warn('Falha ao registrar o service worker:', err);
    }
  });
}

