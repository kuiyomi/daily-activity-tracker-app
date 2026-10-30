import {
  THEMES,
  THEME_STORAGE_KEY,
  isValidTheme,
  resolveEffectiveTheme,
  getStoredTheme,
  setStoredTheme,
} from '../src/logic/theme.js';

let passed = 0;
let failed = 0;

function describe(label, fn) {
  console.log(`\n${label}`);
  fn();
}

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message} (expected "${expected}", got "${actual}")`);
    failed++;
  }
}

describe('isValidTheme()', () => {
  assert(isValidTheme('auto'), 'accepts "auto"');
  assert(isValidTheme('light'), 'accepts "light"');
  assert(isValidTheme('dark'), 'accepts "dark"');
  assert(!isValidTheme('blue'), 'rejects invalid string "blue"');
  assert(!isValidTheme(''), 'rejects empty string');
  assert(!isValidTheme(null), 'rejects null');
  assert(!isValidTheme(undefined), 'rejects undefined');
});

describe('resolveEffectiveTheme()', () => {
  assertEqual(resolveEffectiveTheme('dark', false), 'dark', 'forced dark with system light');
  assertEqual(resolveEffectiveTheme('dark', true), 'dark', 'forced dark with system dark');
  assertEqual(resolveEffectiveTheme('light', false), 'light', 'forced light with system light');
  assertEqual(resolveEffectiveTheme('light', true), 'light', 'forced light with system dark');
  assertEqual(resolveEffectiveTheme('auto', false), 'light', 'auto with system light resolves to light');
  assertEqual(resolveEffectiveTheme('auto', true), 'dark', 'auto with system dark resolves to dark');
});

describe('getStoredTheme() and setStoredTheme() with mock storage', () => {
  const store = {};
  const mockStorage = {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, val) => { store[key] = String(val); },
  };

  assertEqual(getStoredTheme(mockStorage), 'auto', 'defaults to "auto" when empty');

  setStoredTheme('dark', mockStorage);
  assertEqual(getStoredTheme(mockStorage), 'dark', 'reads persisted "dark"');

  setStoredTheme('light', mockStorage);
  assertEqual(getStoredTheme(mockStorage), 'light', 'reads persisted "light"');

  setStoredTheme('invalid-val', mockStorage);
  assertEqual(getStoredTheme(mockStorage), 'auto', 'falls back to "auto" on invalid stored value');

  // Fault-tolerant error simulation
  const failingStorage = {
    getItem: () => { throw new Error('QuotaExceeded or SecurityError'); },
    setItem: () => { throw new Error('QuotaExceeded or SecurityError'); },
  };

  assertEqual(getStoredTheme(failingStorage), 'auto', 'gracefully handles localStorage.getItem exception');
  assert(setStoredTheme('dark', failingStorage) === false, 'gracefully handles localStorage.setItem exception');
});

console.log(`\n${'─'.repeat(40)}`);
console.log(`Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
