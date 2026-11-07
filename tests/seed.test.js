/**
 * tests/seed.test.js
 * Asserts that a fresh database seeds Academia with its group.
 */

import 'fake-indexeddb/auto';
import {
  DB_NAME,
  DB_VERSION,
  getDB,
  closeDB,
  getActivities,
  DEFAULT_MUSCLE_GROUPS,
} from '../src/storage/storage.js';

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

async function run() {
  console.log('Seed Test: Fresh database seeds Academia with its group');

  const db = await getDB();

  assertEqual(db.version, 3, 'database version is 3');
  assert(db.objectStoreNames.contains('activities'), 'activities store exists');
  assert(db.objectStoreNames.contains('completions'), 'completions store exists');
  assert(db.objectStoreNames.contains('dayEntries'), 'dayEntries store exists');
  assert(!db.objectStoreNames.contains('muscleGroups'), 'old muscleGroups store does not exist');

  const activities = await getActivities();
  assertEqual(activities.length, 1, 'exactly one default activity seeded');

  const act = activities[0];
  assertEqual(act.id, 'act_academia', 'activity id is act_academia');
  assertEqual(act.name, 'Academia', 'activity name is Academia');
  assertEqual(act.icon, 'barbell', 'activity icon is barbell');
  assertEqual(act.color, '#007aff', 'activity color is #007aff');
  assert(Array.isArray(act.groups), 'activity has groups array');
  assertEqual(act.groups.length, 1, 'activity has exactly one group');

  const group = act.groups[0];
  assertEqual(group.name, 'Grupos musculares', 'group name is "Grupos musculares"');
  assertEqual(group.multiple, true, 'group multiple is true');
  assertEqual(group.archived, false, 'group archived is false');
  assert(Array.isArray(group.options), 'group options is an array');
  assertEqual(group.options.length, DEFAULT_MUSCLE_GROUPS.length, `group has all ${DEFAULT_MUSCLE_GROUPS.length} options`);

  const optionNames = group.options.map((o) => o.name);
  assertEqual(optionNames, DEFAULT_MUSCLE_GROUPS, 'options match default muscle groups order');
  assert(group.options.every((o) => typeof o.id === 'string' && o.id.length > 0), 'all options have IDs');
  assert(group.options.every((o) => o.archived === false), 'all options are not archived');

  await closeDB();

  if (failed > 0) {
    console.error(`\nTests failed: ${failed}`);
    process.exit(1);
  } else {
    console.log(`\nAll ${passed} assertions passed!`);
  }
}

run();
