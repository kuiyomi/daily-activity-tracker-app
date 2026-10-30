/**
 * theme.js – Pure logic and DOM/storage helpers for appearance and theme preferences.
 * Supports "Automático" (follows system), "Claro" (forced light), and "Escuro" (forced dark).
 */

export const THEME_STORAGE_KEY = 'theme-preference';

export const THEMES = {
  AUTO: 'auto',
  LIGHT: 'light',
  DARK: 'dark',
};

export const THEME_COLORS = {
  LIGHT: '#F2F2F7',
  DARK: '#000000',
};

/**
 * Validates whether a value is a valid theme choice.
 * @param {string} theme
 * @returns {boolean}
 */
export function isValidTheme(theme) {
  return theme === THEMES.AUTO || theme === THEMES.LIGHT || theme === THEMES.DARK;
}

/**
 * Resolves the effective visual mode ('light' | 'dark') given the user preference and OS mode.
 * Pure function for testing and decision-making.
 *
 * @param {string} themeChoice – 'auto' | 'light' | 'dark'
 * @param {boolean} systemPrefersDark – whether matchMedia('(prefers-color-scheme: dark)') is true
 * @returns {'light' | 'dark'}
 */
export function resolveEffectiveTheme(themeChoice, systemPrefersDark) {
  if (themeChoice === THEMES.DARK) return 'dark';
  if (themeChoice === THEMES.LIGHT) return 'light';
  return systemPrefersDark ? 'dark' : 'light';
}

/**
 * Safely reads the theme preference from storage.
 * @param {Storage} [storage=localStorage]
 * @returns {'auto' | 'light' | 'dark'}
 */
export function getStoredTheme(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  try {
    if (!storage) return THEMES.AUTO;
    const value = storage.getItem(THEME_STORAGE_KEY);
    return isValidTheme(value) ? value : THEMES.AUTO;
  } catch (err) {
    console.warn('Não foi possível ler tema do localStorage:', err);
    return THEMES.AUTO;
  }
}

/**
 * Safely persists the theme preference to storage.
 * @param {string} theme – 'auto' | 'light' | 'dark'
 * @param {Storage} [storage=localStorage]
 * @returns {boolean} true if saved, false otherwise
 */
export function setStoredTheme(theme, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (!isValidTheme(theme)) {
    theme = THEMES.AUTO;
  }
  try {
    if (!storage) return false;
    storage.setItem(THEME_STORAGE_KEY, theme);
    return true;
  } catch (err) {
    console.warn('Não foi possível salvar tema no localStorage:', err);
    return false;
  }
}

/**
 * Applies the given theme to the document:
 * 1. Sets or removes data-theme attribute on <html>
 * 2. Updates <meta name="theme-color"> tags to match the mode
 *
 * @param {'auto' | 'light' | 'dark'} theme
 * @param {Document} [doc=document]
 */
export function applyTheme(theme, doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || !doc.documentElement) return;

  if (theme === THEMES.LIGHT || theme === THEMES.DARK) {
    doc.documentElement.setAttribute('data-theme', theme);
  } else {
    doc.documentElement.removeAttribute('data-theme');
  }

  // Update theme-color meta tags
  const metaLight = doc.querySelector('meta[name="theme-color"][data-scheme="light"]') ||
                    doc.querySelector('meta[name="theme-color"]:not([data-scheme="dark"]):not([media*="dark"])');
  const metaDark = doc.querySelector('meta[name="theme-color"][data-scheme="dark"]') ||
                   doc.querySelector('meta[name="theme-color"][media*="dark"]');

  if (theme === THEMES.LIGHT) {
    if (metaLight) {
      metaLight.setAttribute('content', THEME_COLORS.LIGHT);
      metaLight.removeAttribute('media');
    }
    if (metaDark) {
      metaDark.setAttribute('content', THEME_COLORS.LIGHT);
      metaDark.removeAttribute('media');
    }
  } else if (theme === THEMES.DARK) {
    if (metaLight) {
      metaLight.setAttribute('content', THEME_COLORS.DARK);
      metaLight.removeAttribute('media');
    }
    if (metaDark) {
      metaDark.setAttribute('content', THEME_COLORS.DARK);
      metaDark.removeAttribute('media');
    }
  } else {
    // Automático: restore media query matching
    if (metaLight) {
      metaLight.setAttribute('content', THEME_COLORS.LIGHT);
      metaLight.setAttribute('media', '(prefers-color-scheme: light)');
    }
    if (metaDark) {
      metaDark.setAttribute('content', THEME_COLORS.DARK);
      metaDark.setAttribute('media', '(prefers-color-scheme: dark)');
    }
  }
}
