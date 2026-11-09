/**
 * demoData.test.js – Unit tests for demoData.js generator and safety rules.
 */

import {
  generateDemoData,
  filterDemoDataForSeeding,
  getDemoRecordKeysToRemove,
  shiftDateString,
  DEMO_ACTIVITIES,
} from '../src/logic/demoData.js';

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

const FIXED_TODAY = '2026-11-15';
const demoData = generateDemoData(FIXED_TODAY);

describe('1. Demo Activities Generation', () => {
  assertEqual(demoData.activities.length, 3, 'Generates exactly 3 demo activities');

  const actIds = demoData.activities.map((a) => a.id);
  assert(actIds.every((id) => id.startsWith('demo_')), 'All demo activity IDs are prefixed with demo_');

  const caminhada = demoData.activities.find((a) => a.id === 'demo_caminhada');
  assert(Boolean(caminhada), 'Activity Caminhada exists');
  assertEqual(caminhada.name, 'Caminhada', 'Name is Caminhada');
  assertEqual(caminhada.groups.length, 1, 'Caminhada has 1 detail group');
  assertEqual(caminhada.groups[0].name, 'Local', 'Group name is Local');
  assertEqual(caminhada.groups[0].multiple, false, 'Group Local is single-choice (multiple: false)');
  assertEqual(caminhada.groups[0].options.map((o) => o.name), ['Parque', 'Esteira'], 'Options are Parque and Esteira');
  assert(caminhada.demo === true, 'Caminhada has demo: true');

  const natacao = demoData.activities.find((a) => a.id === 'demo_natacao');
  assert(Boolean(natacao), 'Activity Natação exists');
  assertEqual(natacao.name, 'Natação', 'Name is Natação');
  assert(natacao.demo === true, 'Natação has demo: true');

  const faculdade = demoData.activities.find((a) => a.id === 'demo_faculdade');
  assert(Boolean(faculdade), 'Activity Faculdade exists');
  assertEqual(faculdade.name, 'Faculdade', 'Name is Faculdade');
  assertEqual(faculdade.allowsNote, true, 'Faculdade allowsNote is true');
  assert(faculdade.demo === true, 'Faculdade has demo: true');
});

describe('2. Demo Completions Generation & Status Rules', () => {
  const { completions } = demoData;
  assert(completions.length > 0, 'Completions are generated');

  assert(completions.every((c) => c.demo === true), 'Every completion record has demo: true');

  const actIds = new Set(completions.map((c) => c.activityId));
  assert(actIds.has('act_academia'), 'Includes completions for real Academia (act_academia)');
  assert(actIds.has('demo_caminhada'), 'Includes completions for demo_caminhada');
  assert(actIds.has('demo_natacao'), 'Includes completions for demo_natacao');
  assert(actIds.has('demo_faculdade'), 'Includes completions for demo_faculdade');

  const academiaComps = completions.filter((c) => c.activityId === 'act_academia');
  const hasMuscleOptions = academiaComps.some((c) => Array.isArray(c.optionIds) && c.optionIds.length > 0);
  assert(hasMuscleOptions, 'Academia completions include muscle options');

  // Statuses
  const statuses = new Set(completions.map((c) => c.status));
  assert(statuses.has('done'), 'Includes done entries');
  assert(statuses.has('missed'), 'Includes missed entries');
  assert(statuses.has('planned'), 'Includes planned entries');
  assert(Array.from(statuses).every((s) => ['done', 'missed', 'planned'].includes(s)), 'Only valid statuses used');

  // Pending planned entries on past days
  const pastPlanned = completions.filter((c) => c.date < FIXED_TODAY && c.status === 'planned');
  assert(pastPlanned.length > 0, 'Some planned entries are still pending on past days');

  // NEVER create done on future days
  const futureDone = completions.filter((c) => c.date > FIXED_TODAY && c.status === 'done');
  assertEqual(futureDone.length, 0, 'NEVER create "done" on future days');

  // No missed on future days
  const futureMissed = completions.filter((c) => c.date > FIXED_TODAY && c.status === 'missed');
  assertEqual(futureMissed.length, 0, 'NEVER create "missed" on future days');

  // Notes
  const withNotes = completions.filter((c) => typeof c.note === 'string' && c.note.trim().length > 0);
  assert(withNotes.length > 0, 'Some completions contain notes');

  // Date range: 5 weeks before (-35 days) to 2 weeks after (+14 days)
  const minDate = completions.reduce((min, c) => (c.date < min ? c.date : min), FIXED_TODAY);
  const maxDate = completions.reduce((max, c) => (c.date > max ? c.date : max), FIXED_TODAY);
  const expectedMin = shiftDateString(FIXED_TODAY, -35);
  const expectedMax = shiftDateString(FIXED_TODAY, 14);
  assert(minDate <= expectedMin, `Covers 5 weeks before today (min: ${minDate}, expected: ${expectedMin})`);
  assert(maxDate >= expectedMax, `Covers 2 weeks after today (max: ${maxDate}, expected: ${expectedMax})`);
});

describe('3. Demo Day Entries Generation (Rain & Day Notes)', () => {
  const { dayEntries } = demoData;
  assert(dayEntries.length > 0, 'Day entries are generated');
  assert(dayEntries.every((d) => d.demo === true), 'Every day entry has demo: true');

  const rainDays = dayEntries.filter((d) => Boolean(d.rained));
  const rainPct = (rainDays.length / dayEntries.length) * 100;
  assert(rainPct >= 20 && rainPct <= 30, `About 25% rainy days (actual: ${rainPct.toFixed(1)}%)`);

  const withDayNotes = dayEntries.filter((d) => typeof d.notes === 'string' && d.notes.trim().length > 0);
  assert(withDayNotes.length >= 3, `A few day notes are included (actual: ${withDayNotes.length})`);
});

describe('4. Safety Rules: filterDemoDataForSeeding', () => {
  const realActivity = {
    id: 'demo_caminhada', // hypothetical collision with real activity
    name: 'Minha Caminhada Real',
    color: '#ff0000',
    demo: false, // NOT demo!
  };

  const realCompletion = {
    id: '2026-11-10:demo_caminhada',
    date: '2026-11-10',
    activityId: 'demo_caminhada',
    status: 'done',
    demo: false, // real completion
  };

  const realDayEntry = {
    date: '2026-11-10',
    rained: true,
    notes: 'Nota real do usuário',
    demo: false, // real day entry
  };

  const existingData = {
    activities: [realActivity],
    completions: [realCompletion],
    dayEntries: [realDayEntry],
  };

  const safe = filterDemoDataForSeeding(demoData, existingData);

  // Real activity demo_caminhada must NOT be overwritten (skipped)
  const caminhadaInSafe = safe.activities.find((a) => a.id === 'demo_caminhada');
  assert(!caminhadaInSafe, 'Demo activity colliding with real activity is skipped');

  // Real completion on 2026-11-10:demo_caminhada must NOT be overwritten (skipped)
  const compInSafe = safe.completions.find((c) => c.date === '2026-11-10' && c.activityId === 'demo_caminhada');
  assert(!compInSafe, 'Demo completion colliding with real completion is skipped');

  // Real day entry on 2026-11-10 must NOT be touched (skipped)
  const dayInSafe = safe.dayEntries.find((d) => d.date === '2026-11-10');
  assert(!dayInSafe, 'Demo day entry colliding with real day entry is skipped');

  // Other demo completions for days without real entries ARE preserved
  assert(safe.completions.length > 0, 'Other non-colliding completions are preserved');
  assert(safe.dayEntries.length > 0, 'Other non-colliding day entries are preserved');
});

describe('5. Safety Rules: getDemoRecordKeysToRemove', () => {
  const mixedData = {
    activities: [
      { id: 'act_academia', name: 'Academia', demo: false }, // real
      { id: 'act_custom', name: 'Alongamento', demo: false }, // real
      { id: 'demo_caminhada', name: 'Caminhada', demo: true }, // demo
      { id: 'demo_natacao', name: 'Natação', demo: true }, // demo
    ],
    completions: [
      { id: '2026-11-01:act_academia', date: '2026-11-01', activityId: 'act_academia', demo: false }, // real
      { id: '2026-11-02:act_academia', date: '2026-11-02', activityId: 'act_academia', demo: true },  // demo entry for academia
      { id: '2026-11-02:demo_caminhada', date: '2026-11-02', activityId: 'demo_caminhada', demo: true }, // demo
    ],
    dayEntries: [
      { date: '2026-11-01', rained: false, demo: false }, // real
      { date: '2026-11-02', rained: true, demo: true },   // demo
    ],
  };

  const toRemove = getDemoRecordKeysToRemove(mixedData);

  assertEqual(toRemove.activityIds, ['demo_caminhada', 'demo_natacao'], 'Only demo activities selected for removal');
  assertEqual(toRemove.completionIds, ['2026-11-02:act_academia', '2026-11-02:demo_caminhada'], 'Only demo completions selected for removal');
  assertEqual(toRemove.dayEntryDates, ['2026-11-02'], 'Only demo day entries selected for removal');

  // Verify real records are NOT included
  assert(!toRemove.activityIds.includes('act_academia'), 'Real Academia activity is NOT in removal list');
  assert(!toRemove.activityIds.includes('act_custom'), 'Real custom activity is NOT in removal list');
  assert(!toRemove.completionIds.includes('2026-11-01:act_academia'), 'Real completion is NOT in removal list');
  assert(!toRemove.dayEntryDates.includes('2026-11-01'), 'Real day entry is NOT in removal list');
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
