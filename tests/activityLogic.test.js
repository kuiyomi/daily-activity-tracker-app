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
  groupCompletionsByDate,
  getDayDotIndicators,
  getNextAvailablePresetColor,
  PRESET_COLORS,
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

describe('groupCompletionsByDate()', () => {
  assertEqual(groupCompletionsByDate([]), {}, 'handles empty array');
  assertEqual(groupCompletionsByDate(null), {}, 'handles null/undefined');

  const records = [
    { date: '2026-10-10', activityId: 'act_gym' },
    { date: '2026-10-10', activityId: 'act_run' },
    { date: '2026-10-10', activityId: 'act_gym' }, // duplicate
    { date: '2026-10-11', activityId: 'act_read' },
    null,
    { invalid: true },
  ];

  const grouped = groupCompletionsByDate(records);
  assertEqual(Object.keys(grouped).sort(), ['2026-10-10', '2026-10-11'], 'groups into exact dates');
  assertEqual(grouped['2026-10-10'], ['act_gym', 'act_run'], 'deduplicates activity IDs on the same date');
  assertEqual(grouped['2026-10-11'], ['act_read'], 'records single activity ID on date');
});

describe('getDayDotIndicators() - grouping, ordering, and overflow', () => {
  const activities = [
    { id: 'act_1', name: 'Atividade 1', color: '#007aff', createdAt: 1000 },
    { id: 'act_2', name: 'Atividade 2', color: '#34c759', createdAt: 2000 },
    { id: 'act_3', name: 'Atividade 3', color: '#ff9500', createdAt: 3000 },
    { id: 'act_4', name: 'Atividade 4', color: '#ff2d55', createdAt: 4000 },
    { id: 'act_5', name: 'Atividade 5', color: '#af52de', createdAt: 5000 },
    { id: 'act_6', name: 'Atividade 6', color: '#5856d6', createdAt: 6000 },
  ];

  // 0 activities
  const zero = getDayDotIndicators([], activities);
  assertEqual(zero, { dots: [], hasOverflow: false, total: 0 }, 'zero completed activities yields no dots');

  // 1 activity
  const one = getDayDotIndicators(['act_2'], activities);
  assertEqual(one, { dots: ['#34c759'], hasOverflow: false, total: 1 }, '1 completed activity has 1 colored dot');

  // 3 activities in scrambled order -> must be ordered by activity creation order (createdAt)
  const threeScrambled = getDayDotIndicators(['act_3', 'act_1', 'act_2'], activities);
  assertEqual(
    threeScrambled,
    { dots: ['#007aff', '#34c759', '#ff9500'], hasOverflow: false, total: 3 },
    'orders dots strictly by activity createdAt (act_1, act_2, act_3)'
  );

  // 4 activities -> exactly 4 dots, no overflow
  const four = getDayDotIndicators(['act_4', 'act_2', 'act_1', 'act_3'], activities);
  assertEqual(
    four,
    { dots: ['#007aff', '#34c759', '#ff9500', '#ff2d55'], hasOverflow: false, total: 4 },
    '4 completed activities shows all 4 dots without overflow'
  );

  // 5 activities -> overflow: shows first 3 dots in creation order + hasOverflow = true
  const five = getDayDotIndicators(['act_5', 'act_4', 'act_3', 'act_2', 'act_1'], activities);
  assertEqual(
    five,
    { dots: ['#007aff', '#34c759', '#ff9500'], hasOverflow: true, total: 5 },
    '5 completed activities shows 3 dots with overflow flag'
  );

  // 6 activities -> overflow: shows first 3 dots in creation order + hasOverflow = true
  const six = getDayDotIndicators(['act_6', 'act_5', 'act_4', 'act_3', 'act_2', 'act_1'], activities);
  assertEqual(
    six,
    { dots: ['#007aff', '#34c759', '#ff9500'], hasOverflow: true, total: 6 },
    '6 completed activities shows 3 dots with overflow flag'
  );

  // Unknown or deleted activity ID is ignored gracefully
  const withUnknown = getDayDotIndicators(['deleted_act', 'act_2'], activities);
  assertEqual(
    withUnknown,
    { dots: ['#34c759'], hasOverflow: false, total: 1 },
    'ignores deleted or unknown activity IDs'
  );
});

describe('getNextAvailablePresetColor()', () => {
  // Empty activity list -> 1st preset
  assertEqual(
    getNextAvailablePresetColor([]),
    PRESET_COLORS[0],
    'defaults to first preset color when no activities exist'
  );

  // 1st preset used -> 2nd preset
  const oneUsed = [{ id: 'a1', color: PRESET_COLORS[0] }];
  assertEqual(
    getNextAvailablePresetColor(oneUsed),
    PRESET_COLORS[1],
    'picks second preset when first is used'
  );

  // Case-insensitive comparison
  const upperCaseUsed = [{ id: 'a1', color: PRESET_COLORS[0].toUpperCase() }];
  assertEqual(
    getNextAvailablePresetColor(upperCaseUsed),
    PRESET_COLORS[1],
    'performs case-insensitive color comparison'
  );

  // Gaps: 1st and 3rd preset used -> picks 2nd
  const gap = [
    { id: 'a1', color: PRESET_COLORS[0] },
    { id: 'a2', color: PRESET_COLORS[2] },
  ];
  assertEqual(
    getNextAvailablePresetColor(gap),
    PRESET_COLORS[1],
    'picks first unused preset even when there are gaps'
  );

  // All presets used -> wraps around / falls back to first preset
  const allUsed = PRESET_COLORS.map((col, idx) => ({ id: `act_${idx}`, color: col }));
  assertEqual(
    getNextAvailablePresetColor(allUsed),
    PRESET_COLORS[0],
    'falls back to first preset when all presets are taken'
  );
});

console.log(`\n${'─'.repeat(40)}`);
console.log(`Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
