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
  rainedDateSet,
  getDayDotIndicators,
  getDayMarkerIndicators,
  getNextAvailablePresetColor,
  PRESET_COLORS,
  EMOJI_TO_ICON_KEY,
  normalizeCompletionRecord,
  noneToPlanned,
  noneToDone,
  plannedToDone,
  plannedToMissed,
  resolvedToPlanned,
  doneToNone,
  plannedToNone,
  applyTransition,
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
    groups: [
      {
        id: 'grp_1',
        name: 'Intensidade',
        multiple: false,
        archived: false,
        options: [
          { id: 'opt_1', name: 'Leve', archived: false },
          { id: 'opt_2', name: 'Moderada', archived: false },
        ],
      },
    ],
  });
  assert(valid.valid, 'valid activity is accepted');
  assertEqual(valid.sanitized.name, 'Caminhada', 'name is trimmed');
  assertEqual(valid.sanitized.icon, 'person-simple-walk', 'icon key is preserved');
  assertEqual(valid.sanitized.color, '#34c759', 'color is preserved');
  assertEqual(valid.sanitized.groups.length, 1, 'groups array preserved');
  assertEqual(valid.sanitized.groups[0].name, 'Intensidade', 'group name preserved');
  assertEqual(valid.sanitized.groups[0].multiple, false, 'group multiple preserved');
  assertEqual(valid.sanitized.groups[0].options.length, 2, 'group options preserved');
  assert(typeof valid.sanitized.id === 'string' && valid.sanitized.id.startsWith('act_'), 'id is generated');

  const emptyName = validateActivity({ name: '   ' });
  assert(!emptyName.valid, 'empty name is rejected');
  assert(emptyName.errors.length > 0, 'returns validation error message');

  const defaults = validateActivity({ name: 'Leitura' });
  assert(defaults.valid, 'missing optional fields still valid');
  assertEqual(defaults.sanitized.icon, 'barbell', 'defaults icon to barbell');
  assertEqual(defaults.sanitized.color, '#007aff', 'defaults color to fallback');
  assertEqual(defaults.sanitized.groups, [], 'defaults groups to empty array');
  assertEqual(defaults.sanitized.allowsNote, false, 'defaults allowsNote to false');

  const withNote = validateActivity({ name: 'Meditação', allowsNote: true });
  assertEqual(withNote.sanitized.allowsNote, true, 'preserves allowsNote true');
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
  assertEqual(def.color, '#007aff', 'default color is blue');
  assert(Array.isArray(def.groups), 'groups is array');
  assertEqual(def.groups.length, 1, 'has one group');
  assertEqual(def.groups[0].name, 'Grupos musculares', 'group name is "Grupos musculares"');
  assertEqual(def.groups[0].multiple, true, 'group multiple is true');
  assertEqual(def.groups[0].archived, false, 'group archived is false');
  assertEqual(def.groups[0].options.length, 9, 'has 9 default muscle group options');
  assertEqual(def.groups[0].options[0].name, 'Superiores', 'first option is Superiores');
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

describe('getDayMarkerIndicators() - planning states markers', () => {
  const activities = [
    { id: 'act_1', name: 'Atividade 1', color: '#007aff', createdAt: 1000 },
    { id: 'act_2', name: 'Atividade 2', color: '#34c759', createdAt: 2000 },
    { id: 'act_3', name: 'Atividade 3', color: '#ff9500', createdAt: 3000 },
    { id: 'act_4', name: 'Atividade 4', color: '#ff2d55', createdAt: 4000 },
    { id: 'act_5', name: 'Atividade 5', color: '#af52de', createdAt: 5000 },
  ];

  const zero = getDayMarkerIndicators([], activities);
  assertEqual(zero, { markers: [], hasOverflow: false, total: 0 }, 'zero completions yields no markers');

  const mixed = getDayMarkerIndicators([
    { activityId: 'act_2', status: 'planned' },
    { activityId: 'act_1', status: 'done' },
    { activityId: 'act_3', status: 'missed' },
  ], activities);

  assertEqual(mixed, {
    markers: [
      { color: '#007aff', status: 'done' },
      { color: '#34c759', status: 'planned' },
      { color: '#ff9500', status: 'missed' },
    ],
    hasOverflow: false,
    total: 3,
  }, 'orders markers by createdAt preserving done/planned/missed status');

  const five = getDayMarkerIndicators([
    { activityId: 'act_5', status: 'planned' },
    { activityId: 'act_4', status: 'missed' },
    { activityId: 'act_3', status: 'done' },
    { activityId: 'act_2', status: 'done' },
    { activityId: 'act_1', status: 'planned' },
  ], activities);

  assertEqual(five.hasOverflow, true, '5 entries triggers overflow');
  assertEqual(five.markers.length, 3, 'overflow shows 3 markers');
  assertEqual(five.markers[0], { color: '#007aff', status: 'planned' }, 'first marker is act_1');
});

describe('rainedDateSet()', () => {
  const rainy = rainedDateSet([
    { date: '2026-10-28', rained: true },
    { date: '2026-10-29', rained: false },
    { date: '2026-10-30', rained: true, notes: 'chuva' },
    { rained: true },
    null,
  ]);
  assert(rainy.has('2026-10-28'), 'includes days with rained true');
  assert(rainy.has('2026-10-30'), 'includes another rainy day');
  assert(!rainy.has('2026-10-29'), 'excludes days with rained false');
  assertEqual(rainy.size, 2, 'ignores entries without a date string');
  assertEqual(rainedDateSet(null).size, 0, 'returns empty set for non-arrays');
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

describe('normalizeCompletionRecord()', () => {
  assert(normalizeCompletionRecord(null) === null, 'null record returns null');
  const legacy = { id: '2026-11-06:act_1', date: '2026-11-06', activityId: 'act_1' };
  const normLegacy = normalizeCompletionRecord(legacy);
  assertEqual(normLegacy.status, 'done', 'legacy entry without status defaults to done');
  assertEqual(normLegacy.wasPlanned, false, 'legacy entry without wasPlanned defaults to false');
  assertEqual(normLegacy.optionIds, [], 'missing optionIds defaults to empty array');
  assertEqual(normLegacy.note, '', 'missing note defaults to empty string');

  const withNote = { id: '2026-11-06:act_1', date: '2026-11-06', activityId: 'act_1', note: '  Treino forte \n ' };
  const normWithNote = normalizeCompletionRecord(withNote);
  assertEqual(normWithNote.note, 'Treino forte', 'note is trimmed');

  const longNote = { id: '2026-11-06:act_1', date: '2026-11-06', activityId: 'act_1', note: 'a'.repeat(600) };
  assertEqual(normalizeCompletionRecord(longNote).note.length, 500, 'note is limited to max 500 characters');

  const planned = { id: '2026-11-06:act_1', date: '2026-11-06', activityId: 'act_1', status: 'planned', wasPlanned: true };
  const normPlanned = normalizeCompletionRecord(planned);
  assertEqual(normPlanned.status, 'planned', 'preserves status planned');
  assertEqual(normPlanned.wasPlanned, true, 'preserves wasPlanned true');
});

describe('planning transitions', () => {
  const TODAY = '2026-11-06';
  const FUTURE = '2026-11-07';
  const PAST = '2026-11-05';

  // 1. none → planned
  const plannedFuture = noneToPlanned({ dateStr: FUTURE, activityId: 'act_run', optionIds: ['opt_1'] });
  assertEqual(plannedFuture.status, 'planned', 'none -> planned on future date creates planned status');
  assertEqual(plannedFuture.wasPlanned, true, 'none -> planned has wasPlanned true');
  assertEqual(plannedFuture.optionIds, ['opt_1'], 'none -> planned preserves optionIds');

  const plannedToday = noneToPlanned({ dateStr: TODAY, activityId: 'act_gym' });
  assertEqual(plannedToday.status, 'planned', 'none -> planned on today creates planned status');

  const plannedPast = noneToPlanned({ dateStr: PAST, activityId: 'act_walk' });
  assertEqual(plannedPast.status, 'planned', 'none -> planned on past date creates planned status');

  // 2. none → done
  const doneToday = noneToDone({ dateStr: TODAY, activityId: 'act_gym', optionIds: ['opt_2'] }, TODAY);
  assertEqual(doneToday.status, 'done', 'none -> done on today creates done status');
  assertEqual(doneToday.wasPlanned, false, 'none -> done has wasPlanned false');
  assert(typeof doneToday.completedAt === 'number', 'none -> done sets completedAt');

  const donePast = noneToDone({ dateStr: PAST, activityId: 'act_gym' }, TODAY);
  assertEqual(donePast.status, 'done', 'none -> done on past date creates done status');

  let futureDoneThrew = false;
  try {
    noneToDone({ dateStr: FUTURE, activityId: 'act_gym' }, TODAY);
  } catch (err) {
    futureDoneThrew = true;
  }
  assert(futureDoneThrew, 'none -> done on future date is rejected (throws)');

  // 3. planned → done
  const resolvedDone = plannedToDone(plannedToday, TODAY);
  assertEqual(resolvedDone.status, 'done', 'planned -> done sets status done');
  assertEqual(resolvedDone.wasPlanned, true, 'planned -> done keeps wasPlanned true');

  const resolvedPastDone = plannedToDone(plannedPast, TODAY);
  assertEqual(resolvedPastDone.status, 'done', 'planned -> done on past date is allowed');

  let futurePlannedToDoneThrew = false;
  try {
    plannedToDone(plannedFuture, TODAY);
  } catch (err) {
    futurePlannedToDoneThrew = true;
  }
  assert(futurePlannedToDoneThrew, 'planned -> done on future date is rejected (throws)');

  // 4. planned → missed
  const resolvedMissed = plannedToMissed(plannedToday, TODAY);
  assertEqual(resolvedMissed.status, 'missed', 'planned -> missed sets status missed');
  assertEqual(resolvedMissed.wasPlanned, true, 'planned -> missed keeps wasPlanned true');

  let futureMissedThrew = false;
  try {
    plannedToMissed(plannedFuture, TODAY);
  } catch (err) {
    futureMissedThrew = true;
  }
  assert(futureMissedThrew, 'planned -> missed on future date is rejected (throws)');

  // 5. done or missed (when wasPlanned) → planned
  const revertedFromDone = resolvedToPlanned(resolvedDone, TODAY);
  assertEqual(revertedFromDone.status, 'planned', 'done (when wasPlanned) -> planned reverts to planned');
  assertEqual(revertedFromDone.wasPlanned, true, 'reverted entry retains wasPlanned true');

  const revertedFromMissed = resolvedToPlanned(resolvedMissed, TODAY);
  assertEqual(revertedFromMissed.status, 'planned', 'missed (when wasPlanned) -> planned reverts to planned');

  let nonPlannedRevertThrew = false;
  try {
    resolvedToPlanned(doneToday, TODAY);
  } catch (err) {
    nonPlannedRevertThrew = true;
  }
  assert(nonPlannedRevertThrew, 'done (when not wasPlanned) -> planned is rejected');

  // 6. done (when not wasPlanned) → none
  const uncheckDone = doneToNone(doneToday, TODAY);
  assertEqual(uncheckDone, null, 'done (when not wasPlanned) -> none returns null');

  let plannedUncheckThrew = false;
  try {
    doneToNone(resolvedDone, TODAY);
  } catch (err) {
    plannedUncheckThrew = true;
  }
  assert(plannedUncheckThrew, 'doneToNone rejects entries where wasPlanned is true');

  // Legacy entry without status: doneToNone works
  const legacyDone = { id: `${TODAY}:act_legacy`, date: TODAY, activityId: 'act_legacy' };
  assertEqual(doneToNone(legacyDone, TODAY), null, 'doneToNone works for legacy entries without status');

  // 7. planned → none
  assertEqual(plannedToNone(plannedFuture), null, 'planned -> none on future returns null');
  assertEqual(plannedToNone(plannedToday), null, 'planned -> none on today returns null');
  assertEqual(plannedToNone(plannedPast), null, 'planned -> none on past returns null');

  // applyTransition dispatcher helper
  const p1 = applyTransition(null, 'planned', { dateStr: TODAY, activityId: 'act_1' }, TODAY);
  assertEqual(p1.status, 'planned', 'applyTransition none -> planned');
  const d1 = applyTransition(p1, 'done', { dateStr: TODAY, activityId: 'act_1' }, TODAY);
  assertEqual(d1.status, 'done', 'applyTransition planned -> done');
  const r1 = applyTransition(d1, 'planned', { dateStr: TODAY, activityId: 'act_1' }, TODAY);
  assertEqual(r1.status, 'planned', 'applyTransition done (wasPlanned) -> planned');
  const m1 = applyTransition(r1, 'missed', { dateStr: TODAY, activityId: 'act_1' }, TODAY);
  assertEqual(m1.status, 'missed', 'applyTransition planned -> missed');
  const n1 = applyTransition(m1, 'none', { dateStr: TODAY, activityId: 'act_1' }, TODAY);
  assertEqual(n1, null, 'applyTransition planned -> none');
});

console.log(`\n${'─'.repeat(40)}`);
console.log(`Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
