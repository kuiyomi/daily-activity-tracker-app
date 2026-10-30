/**
 * activityLogic.test.js – unit tests for src/logic/activityLogic.js
 *
 * Run with Node.js:
 *   node tests/activityLogic.test.js
 */

import {
  validateActivity,
  generateActivityId,
  createDefaultActivity,
  toggleCompletionId,
  isActivityCompleted,
  extractCompletedDates,
  EMOJI_TO_ICON_KEY,
} from '../src/logic/activityLogic.js';

let passed = 0;
let failed = 0;

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
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    console.error(`     expected: ${JSON.stringify(expected)}`);
    console.error(`     actual  : ${JSON.stringify(actual)}`);
    failed++;
  }
}

function describe(suiteName, fn) {
  console.log(`\n${suiteName}`);
  fn();
}

describe('validateActivity()', () => {
  const valid = validateActivity({
    name: '  Caminhada ',
    icon: 'person-simple-walk',
    color: '#34c759',
    usesMuscleGroups: false,
  });
  assert(valid.valid, 'valid activity is accepted');
  assertEqual(valid.sanitized.name, 'Caminhada', 'name is trimmed');
  assertEqual(valid.sanitized.icon, 'person-simple-walk', 'icon key is preserved');
  assertEqual(valid.sanitized.color, '#34c759', 'color is preserved');
  assertEqual(valid.sanitized.usesMuscleGroups, false, 'usesMuscleGroups boolean');
  assert(typeof valid.sanitized.id === 'string' && valid.sanitized.id.startsWith('act_'), 'id is generated');

  const emptyName = validateActivity({ name: '   ' });
  assert(!emptyName.valid, 'empty name is rejected');
  assert(emptyName.errors.length > 0, 'returns validation error message');

  const defaults = validateActivity({ name: 'Leitura' });
  assert(defaults.valid, 'missing optional fields still valid');
  assertEqual(defaults.sanitized.icon, 'barbell', 'defaults icon to barbell');
  assertEqual(defaults.sanitized.color, '#007aff', 'defaults color to fallback');
  assertEqual(defaults.sanitized.usesMuscleGroups, false, 'defaults usesMuscleGroups to false');
});

describe('backward compatibility and icon mapping', () => {
  const legacyRun = validateActivity({ name: 'Corrida', icon: '🏃' });
  assertEqual(legacyRun.sanitized.icon, 'person-simple-run', 'maps old 🏃 emoji to person-simple-run');

  const legacyGym = validateActivity({ name: 'Academia', icon: '🏋️' });
  assertEqual(legacyGym.sanitized.icon, 'barbell', 'maps old 🏋️ emoji to barbell');

  const legacyYoga = validateActivity({ name: 'Yoga', icon: '🧘' });
  assertEqual(legacyYoga.sanitized.icon, 'flower-lotus', 'maps old 🧘 emoji to flower-lotus');

  const unknownIcon = validateActivity({ name: 'Violão', icon: '🎸' });
  assertEqual(unknownIcon.sanitized.icon, '🎸', 'preserves unknown icon for backward compatibility');
});

describe('createDefaultActivity()', () => {
  const def = createDefaultActivity();
  assertEqual(def.name, 'Academia', 'default name is Academia');
  assertEqual(def.icon, 'barbell', 'default icon is barbell key');
  assertEqual(def.usesMuscleGroups, true, 'usesMuscleGroups is true for Academia');
});

describe('generateActivityId()', () => {
  const id1 = generateActivityId();
  const id2 = generateActivityId();
  assert(id1.startsWith('act_'), 'starts with act_ prefix');
  assert(id1 !== id2, 'generated IDs are unique');
});

describe('toggleCompletionId()', () => {
  const initial = ['act_1', 'act_2'];
  const toggledOn = toggleCompletionId(initial, 'act_3');
  assertEqual(toggledOn, ['act_1', 'act_2', 'act_3'], 'adds new activity ID');

  const toggledOff = toggleCompletionId(toggledOn, 'act_2');
  assertEqual(toggledOff, ['act_1', 'act_3'], 'removes existing activity ID');
});

describe('isActivityCompleted()', () => {
  const list = ['act_1', 'act_2'];
  assert(isActivityCompleted(list, 'act_1'), 'returns true when present');
  assert(!isActivityCompleted(list, 'act_3'), 'returns false when absent');
});

describe('extractCompletedDates()', () => {
  const records = [
    { date: '2026-10-01', activityId: 'act_1' },
    { date: '2026-10-01', activityId: 'act_2' },
    { date: '2026-10-05', activityId: 'act_1' },
  ];
  const dates = extractCompletedDates(records);
  assert(dates instanceof Set, 'returns a Set');
  assertEqual(dates.size, 2, 'deduplicates dates');
  assert(dates.has('2026-10-01'), 'contains 2026-10-01');
  assert(dates.has('2026-10-05'), 'contains 2026-10-05');
  assert(!dates.has('2026-10-02'), 'does not contain missing date');
});

console.log(`\n${'─'.repeat(40)}`);
console.log(`Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
