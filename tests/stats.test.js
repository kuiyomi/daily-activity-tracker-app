/**
 * stats.test.js – Unit tests for monthly statistics pure functions (RF10).
 */

import {
  computeActiveDays,
  computeRainDays,
  computeDoneByActivity,
  computePlanStats,
  computeAdherence,
  computeMissedOnRainDays,
  computeBlockedByRainCount,
  computeImpededOptionsStats,
  computeMonthlyStats,
  computeActivityMonthlyStats,
  computeActivityOptionStats,
  getActivityNotesForMonth,
  filterByMonth,
  getMonthFilter,
} from '../src/logic/stats.js';

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

describe('1. Active Days (days with at least one done entry)', () => {
  assertEqual(computeActiveDays([]), 0, 'Empty completions gives 0 active days');

  const completions = [
    { date: '2026-11-02', activityId: 'act_gym', status: 'done' },
    { date: '2026-11-02', activityId: 'act_run', status: 'done' }, // Same day, different activity
    { date: '2026-11-05', activityId: 'act_gym', status: 'done' },
    { date: '2026-11-07', activityId: 'act_gym', status: 'planned' }, // Planned, not done
    { date: '2026-11-08', activityId: 'act_gym', status: 'missed' },  // Missed, not done
  ];

  assertEqual(computeActiveDays(completions), 2, 'Two distinct dates with done status');
});

describe('2. Rain Days', () => {
  assertEqual(computeRainDays([]), 0, 'Empty day entries gives 0 rain days');

  const dayEntries = [
    { date: '2026-11-01', rained: true },
    { date: '2026-11-02', rained: false },
    { date: '2026-11-05', rained: true },
    { date: '2026-11-05', rained: true }, // duplicate date safety
  ];

  assertEqual(computeRainDays(dayEntries), 2, 'Counts distinct dates where rained is true');
});

describe('3. Done by activity (days done per activity)', () => {
  const completions = [
    { date: '2026-11-01', activityId: 'act_gym', status: 'done' },
    { date: '2026-11-01', activityId: 'act_gym', status: 'done' }, // Same activity twice on same day
    { date: '2026-11-02', activityId: 'act_gym', status: 'done' },
    { date: '2026-11-02', activityId: 'act_run', status: 'done' },
    { date: '2026-11-03', activityId: 'act_run', status: 'planned' },
    { date: '2026-11-04', activityId: 'act_swim', status: 'missed' },
  ];

  const result = computeDoneByActivity(completions);
  assertEqual(result, { act_gym: 2, act_run: 1 }, 'Computes unique days done per activity');
});

describe('4. Plan stats (done, missed, pending, upcoming)', () => {
  const todayStr = '2026-11-10';

  const completions = [
    // Unplanned entries should be ignored in plan stats
    { date: '2026-11-01', activityId: 'act_gym', status: 'done', wasPlanned: false },

    // Planned and completed
    { date: '2026-11-02', activityId: 'act_gym', status: 'done', wasPlanned: true },
    { date: '2026-11-04', activityId: 'act_gym', status: 'done', wasPlanned: true },

    // Planned and missed
    { date: '2026-11-03', activityId: 'act_gym', status: 'missed', wasPlanned: true },

    // Planned, status planned, before today (pending)
    { date: '2026-11-06', activityId: 'act_gym', status: 'planned', wasPlanned: true },
    { date: '2026-11-08', activityId: 'act_run', status: 'planned', wasPlanned: true },

    // Planned, status planned, today or later (upcoming)
    { date: '2026-11-10', activityId: 'act_gym', status: 'planned', wasPlanned: true }, // today
    { date: '2026-11-12', activityId: 'act_gym', status: 'planned', wasPlanned: true }, // future
  ];

  const plan = computePlanStats(completions, todayStr);
  assertEqual(plan.done, 2, '2 planned done');
  assertEqual(plan.missed, 1, '1 planned missed');
  assertEqual(plan.pending, 2, '2 pending (planned before today)');
  assertEqual(plan.upcoming, 2, '2 upcoming (planned on today or later)');
  assertEqual(plan.earliestPendingDate, '2026-11-06', 'Earliest pending date is 2026-11-06');
});

describe('5. Adherence = done ÷ (done + missed)', () => {
  assertEqual(computeAdherence(0, 0), null, 'Adherence is null when done + missed is 0');
  assertEqual(computeAdherence(3, 1), 0.75, 'Adherence is 0.75 (75%) for 3 done, 1 missed');
  assertEqual(computeAdherence(5, 0), 1.0, 'Adherence is 1.0 (100%) for 5 done, 0 missed');
  assertEqual(computeAdherence(0, 4), 0.0, 'Adherence is 0.0 (0%) for 0 done, 4 missed');
});

describe('6. Missed on rain days', () => {
  const dayEntries = [
    { date: '2026-11-02', rained: true },
    { date: '2026-11-03', rained: false },
    { date: '2026-11-04', rained: true },
  ];

  const completions = [
    // Missed on a rainy day -> counts
    { date: '2026-11-02', activityId: 'act_gym', status: 'missed', wasPlanned: true },
    // Missed on a non-rainy day -> does not count
    { date: '2026-11-03', activityId: 'act_gym', status: 'missed', wasPlanned: true },
    // Done on a rainy day -> does not count
    { date: '2026-11-04', activityId: 'act_gym', status: 'done', wasPlanned: true },
    // Missed on rainy day but wasPlanned is false -> does not count
    { date: '2026-11-02', activityId: 'act_run', status: 'missed', wasPlanned: false },
  ];

  const count = computeMissedOnRainDays(completions, dayEntries);
  assertEqual(count, 1, 'Counts 1 missed wasPlanned completion on a rain day');
});

describe('7. Month boundaries and full monthly computation', () => {
  const todayStr = '2026-11-15';
  const completions = [
    // Month boundary: Previous month (October 31)
    { date: '2026-10-31', activityId: 'act_gym', status: 'done', wasPlanned: true },
    // Current month (November)
    { date: '2026-11-01', activityId: 'act_gym', status: 'done', wasPlanned: false },
    { date: '2026-11-02', activityId: 'act_gym', status: 'done', wasPlanned: true },
    { date: '2026-11-05', activityId: 'act_gym', status: 'missed', wasPlanned: true },
    { date: '2026-11-10', activityId: 'act_gym', status: 'planned', wasPlanned: true }, // pending (< 15)
    { date: '2026-11-20', activityId: 'act_run', status: 'planned', wasPlanned: true }, // upcoming (>= 15)
    // Month boundary: Next month (December 01)
    { date: '2026-12-01', activityId: 'act_gym', status: 'done', wasPlanned: true },
  ];

  const dayEntries = [
    { date: '2026-10-31', rained: true },
    { date: '2026-11-05', rained: true }, // 11-05 was missed on rain day!
    { date: '2026-11-12', rained: true },
    { date: '2026-12-01', rained: true },
  ];

  // Month 10 in 0-based is November
  const stats = computeMonthlyStats(completions, dayEntries, {
    year: 2026,
    month: 10,
    todayStr,
  });

  assertEqual(stats.activeDays, 2, 'Active days: 2026-11-01 and 2026-11-02');
  assertEqual(stats.rainDays, 2, 'Rain days: 2026-11-05 and 2026-11-12');
  assertEqual(stats.doneByActivity, { act_gym: 2 }, 'Gym done 2 days in November');
  assertEqual(stats.plan.done, 1, '1 planned done in November');
  assertEqual(stats.plan.missed, 1, '1 planned missed in November');
  assertEqual(stats.plan.pending, 1, '1 pending (2026-11-10)');
  assertEqual(stats.plan.upcoming, 1, '1 upcoming (2026-11-20)');
  assertEqual(stats.adherence, 0.5, 'Adherence is 1 / (1 + 1) = 0.5');
  assertEqual(stats.missedOnRainDays, 1, '1 missed on rain day (2026-11-05)');
  assertEqual(stats.earliestPendingDate, '2026-11-10', 'Earliest pending date is 2026-11-10');
});

describe('8. Activity Monthly Stats (done, planned, missed)', () => {
  const completions = [
    // Previous month entry
    { date: '2026-10-31', activityId: 'act_gym', status: 'done' },
    // Current month entries for act_gym
    { date: '2026-11-02', activityId: 'act_gym', status: 'done' },
    { date: '2026-11-04', activityId: 'act_gym', status: 'done' },
    { date: '2026-11-06', activityId: 'act_gym', status: 'planned', wasPlanned: true },
    { date: '2026-11-08', activityId: 'act_gym', status: 'missed', wasPlanned: true },
    // Duplicate date check
    { date: '2026-11-04', activityId: 'act_gym', status: 'done' },
    // Different activity entry in current month
    { date: '2026-11-02', activityId: 'act_run', status: 'done' },
    { date: '2026-11-10', activityId: 'act_run', status: 'planned' },
  ];

  const stats = computeActivityMonthlyStats(completions, 'act_gym', { year: 2026, month: 10 });
  assertEqual(stats.done, 2, 'Gym has 2 days done in November (02 and 04)');
  assertEqual(stats.planned, 1, 'Gym has 1 day planned in November (06)');
  assertEqual(stats.missed, 1, 'Gym has 1 day missed in November (08)');
  assertEqual(stats.totalPlanned, 2, 'Gym has 2 total wasPlanned days');
});

describe('9. Activity Option Stats (groups, descending sort, archived counted, 0-day excluded)', () => {
  const activity = {
    id: 'act_gym',
    name: 'Musculação',
    groups: [
      {
        id: 'grp_muscle',
        name: 'Grupos musculares',
        options: [
          { id: 'opt_peito', name: 'Peito', archived: false },
          { id: 'opt_costas', name: 'Costas', archived: false },
          { id: 'opt_pernas', name: 'Pernas', archived: false }, // 0 days -> should be omitted
          { id: 'opt_ombros', name: 'Ombros', archived: true },   // archived, 1 day -> should be included!
        ],
      },
      {
        id: 'grp_equipment',
        name: 'Equipamento',
        options: [
          { id: 'opt_halteres', name: 'Halteres', archived: false }, // 0 days -> entire group omitted
        ],
      },
    ],
  };

  const completions = [
    // Peito on 3 days
    { date: '2026-11-02', activityId: 'act_gym', status: 'done', optionIds: ['opt_peito', 'opt_costas'] },
    { date: '2026-11-04', activityId: 'act_gym', status: 'done', optionIds: ['opt_peito', 'opt_ombros'] },
    { date: '2026-11-06', activityId: 'act_gym', status: 'planned', optionIds: ['opt_peito'] },
    // Costas on 1 day (2026-11-02)
    // Ombros (archived) on 1 day (2026-11-04)
    // Different activity completion with opt_peito (should not count for act_gym)
    { date: '2026-11-08', activityId: 'act_run', status: 'done', optionIds: ['opt_peito'] },
    // Outside month (October)
    { date: '2026-10-28', activityId: 'act_gym', status: 'done', optionIds: ['opt_costas'] },
  ];

  const groupStats = computeActivityOptionStats(completions, activity, { year: 2026, month: 10 });
  assertEqual(groupStats.length, 1, 'Only 1 group has options with at least one day (Equipamento is omitted)');

  const muscleGroup = groupStats[0];
  assertEqual(muscleGroup.name, 'Grupos musculares', 'Group title is "Grupos musculares"');
  assertEqual(muscleGroup.options.length, 3, 'Pernas (0 days) is omitted, Peito, Costas, Ombros (archived) are included');

  // Sorted descending: Peito (3), Costas (1), Ombros (1)
  assertEqual(muscleGroup.options[0].name, 'Peito', 'Peito is 1st (3 days)');
  assertEqual(muscleGroup.options[0].days, 3, 'Peito days is 3');
  assertEqual(muscleGroup.options[0].pct, 100, 'Peito pct is 100%');

  // Costas vs Ombros tie (1 day each)
  assertEqual(muscleGroup.options[1].days, 1, '2nd option has 1 day');
  assertEqual(muscleGroup.options[1].pct, 33, '1/3 is rounded to 33%');
  assertEqual(muscleGroup.options[2].days, 1, '3rd option has 1 day');
  assertEqual(muscleGroup.options[2].pct, 33, '1/3 is rounded to 33%');

  const archivedOption = muscleGroup.options.find((o) => o.id === 'opt_ombros');
  assert(Boolean(archivedOption), 'Archived option Ombros is counted and included');
});

describe('10. Activity Notes for Month (newest first, empty notes filtered)', () => {
  const completions = [
    // Previous month
    { date: '2026-10-31', activityId: 'act_gym', note: 'Treino de sábado anterior' },
    // Current month entries
    { date: '2026-11-02', activityId: 'act_gym', note: 'Treino leve com halteres' },
    { date: '2026-11-04', activityId: 'act_gym', note: '' }, // empty -> filtered
    { date: '2026-11-06', activityId: 'act_gym', note: 'Aumentei a carga no supino' },
    { date: '2026-11-08', activityId: 'act_gym' }, // no note property -> filtered
    // Other activity
    { date: '2026-11-05', activityId: 'act_run', note: 'Corrida no parque' },
  ];

  const notes = getActivityNotesForMonth(completions, 'act_gym', { year: 2026, month: 10 });
  assertEqual(notes.length, 2, '2 notes found for act_gym in November');
  assertEqual(notes[0].date, '2026-11-06', 'Newest note is from 2026-11-06');
  assertEqual(notes[0].note, 'Aumentei a carga no supino', 'Correct note content');
  assertEqual(notes[1].date, '2026-11-02', 'Second note is from 2026-11-02');
  assertEqual(notes[1].note, 'Treino leve com halteres', 'Correct note content');
});

describe('11. Blocked by rain count', () => {
  const completions = [
    { date: '2026-11-02', activityId: 'act_gym', status: 'missed', blockedByRain: true },
    { date: '2026-11-04', activityId: 'act_run', status: 'missed', blockedByRain: true },
    { date: '2026-11-05', activityId: 'act_gym', status: 'missed', blockedByRain: false },
    { date: '2026-11-06', activityId: 'act_gym', status: 'done', blockedByRain: true }, // done should not count
    { date: '2026-10-30', activityId: 'act_gym', status: 'missed', blockedByRain: true }, // outside month
  ];

  const count = computeBlockedByRainCount(completions, { year: 2026, month: 10 });
  assertEqual(count, 2, '2 missed entries with blockedByRain in November 2026');
});

describe('12. Impeded options stats for "Por opção" card', () => {
  const activities = [
    {
      id: 'act_caminhada',
      name: 'Caminhada',
      color: '#34c759',
      icon: 'sneaker',
      groups: [
        {
          id: 'grp_local',
          name: 'Local',
          options: [
            { id: 'opt_parque', name: 'Parque' },
            { id: 'opt_esteira', name: 'Esteira' },
          ],
        },
      ],
    },
    {
      id: 'act_academia',
      name: 'Academia',
      color: '#007aff',
      icon: 'barbell',
      groups: [
        {
          id: 'grp_muscles',
          name: 'Grupos musculares',
          options: [
            { id: 'opt_peito', name: 'Peito' },
            { id: 'opt_pernas', name: 'Pernas' },
          ],
        },
      ],
    },
  ];

  const completions = [
    {
      date: '2026-11-02',
      activityId: 'act_caminhada',
      status: 'missed',
      blockedByRain: true,
      optionIds: ['opt_parque'],
    },
    {
      date: '2026-11-05',
      activityId: 'act_caminhada',
      status: 'missed',
      blockedByRain: true,
      optionIds: ['opt_parque'],
    },
    {
      date: '2026-11-06',
      activityId: 'act_academia',
      status: 'missed',
      blockedByRain: true,
      optionIds: ['opt_peito'],
    },
    // Not blocked by rain
    {
      date: '2026-11-07',
      activityId: 'act_caminhada',
      status: 'missed',
      blockedByRain: false,
      optionIds: ['opt_esteira'],
    },
  ];

  const result = computeImpededOptionsStats(completions, activities, { year: 2026, month: 10 });
  assertEqual(result.length, 2, 'Two activities have impeded options');

  const caminhada = result.find((r) => r.activityId === 'act_caminhada');
  assert(Boolean(caminhada), 'Caminhada found in impeded stats');
  assertEqual(caminhada.options.length, 1, 'Only Parque was selected');
  assertEqual(caminhada.options[0].name, 'Parque', 'Option name is Parque');
  assertEqual(caminhada.options[0].count, 2, 'Parque has count 2');

  const academia = result.find((r) => r.activityId === 'act_academia');
  assert(Boolean(academia), 'Academia found in impeded stats');
  assertEqual(academia.options[0].name, 'Peito', 'Option name is Peito');
  assertEqual(academia.options[0].count, 1, 'Peito has count 1');
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
