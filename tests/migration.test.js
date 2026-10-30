/**
 * tests/migration.test.js
 * Asserts that upgrading DadsCalendarDB from v1 to v2:
 * 1. Preserves existing activities and completions.
 * 2. Adds the new stores: 'muscleGroups' and 'dayEntries'.
 * 3. Seeds the default muscle groups.
 * 4. Allows saving and reading from new stores.
 */

import 'fake-indexeddb/auto';
import {
  DB_NAME,
  DB_VERSION,
  getDB,
  closeDB,
  getActivity,
  getCompletionsForDate,
  getMuscleGroups,
  getDayEntry,
  setDayRained,
  setDayNotes,
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
  if (actual === expected) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message} (expected "${expected}", got "${actual}")`);
    failed++;
  }
}

async function run() {
  console.log('Database Migration (v1 → v2)');

  // Step 1: Create a genuine v1 database
  await new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      const actStore = db.createObjectStore('activities', { keyPath: 'id' });
      const compStore = db.createObjectStore('completions', { keyPath: 'id' });
      compStore.createIndex('date', 'date', { unique: false });
      compStore.createIndex('activityId', 'activityId', { unique: false });
    };
    req.onsuccess = (event) => {
      const db = event.target.result;
      const tx = db.transaction(['activities', 'completions'], 'readwrite');
      
      // Seed legacy v1 data
      tx.objectStore('activities').put({
        id: 'act_corrida',
        name: 'Corrida ao ar livre',
        icon: 'person-simple-run',
        color: '#34c759',
        usesMuscleGroups: false,
        createdAt: 1000,
      });

      tx.objectStore('activities').put({
        id: 'act_academia',
        name: 'Academia',
        icon: 'barbell',
        color: '#007aff',
        usesMuscleGroups: true,
        createdAt: 1001,
      });

      tx.objectStore('completions').put({
        id: '2026-10-15:act_corrida',
        date: '2026-10-15',
        activityId: 'act_corrida',
        completedAt: 1234567,
      });

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = (e) => reject(e.target.error);
    };
    req.onerror = (e) => reject(e.target.error);
  });

  // Step 2: Open database with new code (triggers onupgradeneeded to v2)
  const db = await getDB();

  assertEqual(db.version, 2, 'database version upgraded to 2');
  assert(db.objectStoreNames.contains('activities'), 'activities store exists');
  assert(db.objectStoreNames.contains('completions'), 'completions store exists');
  assert(db.objectStoreNames.contains('muscleGroups'), 'new muscleGroups store exists');
  assert(db.objectStoreNames.contains('dayEntries'), 'new dayEntries store exists');

  // Step 3: Verify v1 data survived intact
  const act = await getActivity('act_corrida');
  assert(Boolean(act), 'legacy activity act_corrida was retrieved');
  assertEqual(act.name, 'Corrida ao ar livre', 'activity name preserved');
  assertEqual(act.color, '#34c759', 'activity color preserved');

  const completions = await getCompletionsForDate('2026-10-15');
  assertEqual(completions.length, 1, 'legacy completion survived');
  assertEqual(completions[0], 'act_corrida', 'completed activity ID is act_corrida');

  // Step 4: Verify default muscle groups were seeded
  const muscleGroups = await getMuscleGroups();
  assertEqual(muscleGroups.length, DEFAULT_MUSCLE_GROUPS.length, 'default muscle groups seeded');
  assertEqual(muscleGroups[0].name, 'Peito', 'first muscle group is Peito');
  assert(muscleGroups.some((g) => g.name === 'Abdômen'), 'Abdômen is present');
  assert(muscleGroups.some((g) => g.name === 'Cardio'), 'Cardio is present');
  assert(!muscleGroups.some((g) => g.archived), 'seeded groups are not archived');

  // Step 5: Verify new dayEntries store works
  const entryBefore = await getDayEntry('2026-10-15');
  assertEqual(entryBefore.rained, false, 'default rained is false');
  assertEqual(entryBefore.notes, '', 'default notes is empty');

  await setDayRained('2026-10-15', true);
  await setDayNotes('2026-10-15', 'Dia chuvoso e treino bom');

  const entryAfter = await getDayEntry('2026-10-15');
  assertEqual(entryAfter.rained, true, 'setDayRained persisted');
  assertEqual(entryAfter.notes, 'Dia chuvoso e treino bom', 'setDayNotes persisted');

  await closeDB();

  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Migration test fatal error:', err);
  process.exit(1);
});
