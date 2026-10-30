/**
 * dateUtils.test.js – unit tests for src/logic/dateUtils.js
 *
 * Run with Node.js (no build step needed):
 *   node --experimental-vm-modules tests/dateUtils.test.js
 *
 * Or after "npm test" once package.json is wired up.
 */

import {
  toDateString,
  parseDateString,
  firstDayOfMonth,
  lastDayOfMonth,
  buildMonthGrid,
  nextMonth,
  prevMonth,
  formatMonthHeading,
  weekdayLabels,
} from '../src/logic/dateUtils.js';

// ── Tiny test harness ──────────────────────────────────────────────────────
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

// ── Tests ──────────────────────────────────────────────────────────────────

describe('toDateString()', () => {
  assertEqual(toDateString(new Date(2024, 0, 1)),  '2024-01-01', 'Jan 1 2024');
  assertEqual(toDateString(new Date(2024, 11, 31)), '2024-12-31', 'Dec 31 2024');
  assertEqual(toDateString(new Date(2000, 1, 29)),  '2000-02-29', 'Leap day 2000');
  assertEqual(toDateString(new Date(1900, 1, 28)),  '1900-02-28', 'Non-leap 1900');
});

describe('parseDateString()', () => {
  const d = parseDateString('2026-10-30');
  assertEqual(d.getFullYear(), 2026, 'year 2026');
  assertEqual(d.getMonth(),    9,    'month index 9 (October)');
  assertEqual(d.getDate(),     30,   'day 30');
});

describe('firstDayOfMonth()', () => {
  assertEqual(firstDayOfMonth(2026, 9).getDay(), 4, 'Oct 2026 starts on Thursday (4)');
  assertEqual(firstDayOfMonth(2024, 0).getDay(), 1, 'Jan 2024 starts on Monday (1)');
});

describe('lastDayOfMonth()', () => {
  assertEqual(lastDayOfMonth(2024, 1).getDate(), 29, 'Feb 2024 has 29 days (leap)');
  assertEqual(lastDayOfMonth(2023, 1).getDate(), 28, 'Feb 2023 has 28 days');
  assertEqual(lastDayOfMonth(2024, 0).getDate(), 31, 'Jan 2024 has 31 days');
});

describe('buildMonthGrid()', () => {
  // October 2026: starts Thu (4), ends Sat (6) → startOffset=4, endOffset=0
  const grid = buildMonthGrid(2026, 9);
  assert(grid.length % 7 === 0, 'grid length is a multiple of 7');
  assert(grid.length >= 35,     'grid has at least 35 cells');

  // First cell should be Sunday Sep 27 2026
  assertEqual(toDateString(grid[0]), '2026-09-27', 'first cell is Sun Sep 27 2026');

  // The 1st of October is at index 4 (after 4 padding days)
  assertEqual(toDateString(grid[4]), '2026-10-01', '5th cell is Oct 1 2026');

  // Last day of October is the 31st (a Saturday = index 6 of last week)
  const oct31 = grid.find(d => toDateString(d) === '2026-10-31');
  assert(oct31 !== undefined, 'Oct 31 2026 is in the grid');

  // A month starting on Sunday (e.g. Sep 2024): startOffset = 0
  const sepGrid = buildMonthGrid(2024, 8); // Sep 2024
  assertEqual(toDateString(sepGrid[0]), '2024-09-01', 'Sep 2024: first cell is Sep 1');

  // All weeks are complete
  for (const [year, month] of [[2024, 0], [2024, 1], [2023, 1], [2026, 9]]) {
    const g = buildMonthGrid(year, month);
    assert(g.length % 7 === 0, `buildMonthGrid(${year}, ${month}) length % 7 === 0`);
    assert(g[0].getDay() === 0, `buildMonthGrid(${year}, ${month}) first cell is Sunday`);
  }
});

describe('nextMonth()', () => {
  assertEqual(nextMonth(2026, 9),  { year: 2026, month: 10 }, 'Oct → Nov');
  assertEqual(nextMonth(2026, 11), { year: 2027, month: 0 },  'Dec → Jan next year');
});

describe('prevMonth()', () => {
  assertEqual(prevMonth(2026, 9), { year: 2026, month: 8 }, 'Oct → Sep');
  assertEqual(prevMonth(2026, 0), { year: 2025, month: 11 }, 'Jan → Dec prev year');
});

describe('formatMonthHeading()', () => {
  const heading = formatMonthHeading(2026, 9);
  assert(heading.includes('2026'),    'heading contains year 2026');
  assert(heading.startsWith('Outubro'), 'heading starts with "Outubro" (first letter capitalised)');
  assert(heading.includes(' de '),    'heading keeps "de" lowercase');
});

describe('weekdayLabels()', () => {
  const labels = weekdayLabels();
  assertEqual(labels.length, 7, 'returns 7 labels');
  // First must be Sunday in Portuguese
  assert(labels[0].toLowerCase().startsWith('dom'), `first label starts with "dom" (got "${labels[0]}")`);
  // Last must be Saturday
  assert(labels[6].toLowerCase().startsWith('sáb') || labels[6].toLowerCase().startsWith('sab'),
    `last label starts with "sáb" (got "${labels[6]}")`);
});

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`);
console.log(`Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
