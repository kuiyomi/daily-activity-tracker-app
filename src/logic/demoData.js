/**
 * demoData.js – Pure logic for generating and safely applying sample/demo data.
 * No DOM, no storage side-effects, fully unit-testable.
 */

import { toDateString, todayString } from './dateUtils.js';

/**
 * Three demo activities with IDs prefixed demo_.
 * - Caminhada: single-choice detail group "Local" (Parque, Esteira)
 * - Natação
 * - Faculdade: allowsNote true
 */
export const DEMO_ACTIVITIES = [
  {
    id: 'demo_caminhada',
    name: 'Caminhada',
    icon: 'person-simple-walk',
    color: '#34c759',
    allowsNote: false,
    demo: true,
    groups: [
      {
        id: 'grp_local',
        name: 'Local',
        multiple: false,
        archived: false,
        options: [
          { id: 'opt_parque', name: 'Parque', archived: false },
          { id: 'opt_esteira', name: 'Esteira', archived: false },
        ],
      },
    ],
    createdAt: 1700000000001,
  },
  {
    id: 'demo_natacao',
    name: 'Natação',
    icon: 'person-simple-swim',
    color: '#32ade6',
    allowsNote: false,
    demo: true,
    groups: [],
    createdAt: 1700000000002,
  },
  {
    id: 'demo_faculdade',
    name: 'Faculdade',
    icon: 'book-open',
    color: '#af52de',
    allowsNote: true,
    demo: true,
    groups: [],
    createdAt: 1700000000003,
  },
];

/**
 * Shifts a local YYYY-MM-DD date string by a number of days.
 * @param {string} baseDateStr – "YYYY-MM-DD"
 * @param {number} dayDelta
 * @returns {string} "YYYY-MM-DD"
 */
export function shiftDateString(baseDateStr, dayDelta) {
  const [y, m, d] = String(baseDateStr).split('-').map(Number);
  const date = new Date(y, m - 1, d + dayDelta);
  return toDateString(date);
}

/**
 * Generates sample data covering 5 weeks before today and 2 weeks after.
 *
 * @param {string | Date} [todayArg] – reference date (defaults to todayString())
 * @returns {{
 *   activities: Array<object>,
 *   completions: Array<object>,
 *   dayEntries: Array<object>,
 * }}
 */
export function generateDemoData(todayArg) {
  let todayStr;
  if (typeof todayArg === 'string' && todayArg.length >= 10) {
    todayStr = todayArg.slice(0, 10);
  } else if (todayArg instanceof Date) {
    todayStr = toDateString(todayArg);
  } else {
    todayStr = todayString();
  }

  const activities = DEMO_ACTIVITIES.map((act) => ({
    ...act,
    groups: act.groups.map((g) => ({
      ...g,
      options: g.options.map((o) => ({ ...o })),
    })),
    demo: true,
  }));

  const completions = [];
  const dayEntries = [];

  // 5 weeks before today (-35 days) to 2 weeks after today (+14 days)
  const START_OFFSET = -35;
  const END_OFFSET = 14;

  const academiaMuscleSets = [
    ['opt_peito', 'opt_triceps'],
    ['opt_costas', 'opt_biceps'],
    ['opt_pernas', 'opt_inferiores'],
    ['opt_ombros', 'opt_superiores'],
    ['opt_cardio'],
  ];

  const faculdadeNotes = [
    'Apresentação do trabalho em grupo de gestão',
    'Prova semestral de cálculo e estatística',
    'Início do projeto interdisciplinar',
    'Entrega do relatório final de estágio',
    'Seminário sobre inteligência artificial',
    'Revisão para os exames finais',
  ];

  const dayNotesMap = {
    '-32': 'Fim de semana tranquilo com a família',
    '-24': 'Feriado prolongado em casa',
    '-16': 'Dia frio e chuvoso',
    '-8': 'Consulta de rotina no cardiologista',
    '4': 'Almoço de domingo em família',
  };

  for (let offset = START_OFFSET; offset <= END_OFFSET; offset++) {
    const dateStr = shiftDateString(todayStr, offset);
    const isPast = offset < 0;
    const isToday = offset === 0;
    const isFuture = offset > 0;

    // Day Entries: ~25% rainy days (every 4th day)
    // Offset -32, -28, -24, -20, -16, -12, -8, -4, 0, 4, 8, 12 -> 12 out of 50 = 24%
    const isRained = Math.abs(offset) % 4 === 0;
    const dayNote = dayNotesMap[String(offset)] || '';

    dayEntries.push({
      date: dateStr,
      rained: isRained,
      notes: dayNote,
      demo: true,
    });

    // 1. Academia (act_academia) – real activity entries
    // Scheduled every 2 days (plus first day of range)
    if (Math.abs(offset) % 2 === 0 || offset === START_OFFSET) {
      const muscleIdx = Math.abs(offset) % academiaMuscleSets.length;
      const optionIds = academiaMuscleSets[muscleIdx];
      let status = 'done';
      let wasPlanned = true;
      let note = '';
      let blockedByRain = false;

      if (isFuture) {
        status = 'planned';
        wasPlanned = true;
      } else if (isToday) {
        status = 'done';
        wasPlanned = true;
        note = 'Treino concluído com boa disposição';
      } else {
        // In past: mostly done, occasional missed, and some pending planned
        if (offset === -4 || offset === -18) {
          status = 'missed';
          wasPlanned = true;
          // offset -4 is a rainy day
          blockedByRain = offset === -4;
        } else if (offset === -2 || offset === -10) {
          // Planned entry still pending on past day
          status = 'planned';
          wasPlanned = true;
        } else {
          status = 'done';
          wasPlanned = offset % 4 === 0; // mix of wasPlanned true/false
          if (offset === -14) {
            note = 'Aumentei a carga no supino para 25kg de cada lado';
          }
        }
      }

      completions.push({
        id: `${dateStr}:act_academia`,
        date: dateStr,
        activityId: 'act_academia',
        status,
        wasPlanned,
        blockedByRain,
        optionIds: [...optionIds],
        note,
        demo: true,
      });
    }

    // 2. Caminhada (demo_caminhada)
    // Scheduled every 3 days (offset % 3 === 0)
    if (Math.abs(offset) % 3 === 0) {
      const localOpt = Math.abs(offset) % 6 === 0 ? 'opt_parque' : 'opt_esteira';
      let status = 'done';
      let wasPlanned = true;
      let blockedByRain = false;

      if (isFuture) {
        status = 'planned';
        wasPlanned = true;
      } else if (isToday) {
        status = 'planned';
        wasPlanned = true;
      } else {
        if (offset === -6 || offset === -24) {
          status = 'missed';
          wasPlanned = true;
          // offset -24 is a rainy day
          blockedByRain = offset === -24;
        } else if (offset === -3) {
          // Pending planned entry
          status = 'planned';
          wasPlanned = true;
        } else {
          status = 'done';
          wasPlanned = offset % 6 === 0;
        }
      }

      completions.push({
        id: `${dateStr}:demo_caminhada`,
        date: dateStr,
        activityId: 'demo_caminhada',
        status,
        wasPlanned,
        blockedByRain,
        optionIds: [localOpt],
        note: '',
        demo: true,
      });
    }

    // 3. Natação (demo_natacao)
    // Scheduled every 5 days (offset % 5 === 1)
    if (Math.abs(offset) % 5 === 1) {
      let status = 'done';
      let wasPlanned = true;

      if (isFuture) {
        status = 'planned';
        wasPlanned = true;
      } else if (isToday) {
        status = 'done';
        wasPlanned = true;
      } else {
        if (offset === -9) {
          status = 'missed';
          wasPlanned = true;
        } else {
          status = 'done';
          wasPlanned = true;
        }
      }

      completions.push({
        id: `${dateStr}:demo_natacao`,
        date: dateStr,
        activityId: 'demo_natacao',
        status,
        wasPlanned,
        blockedByRain: false,
        optionIds: [],
        note: '',
        demo: true,
      });
    }

    // 4. Faculdade (demo_faculdade) – allowsNote true
    // Scheduled every 4 days (offset % 4 === 2)
    if (Math.abs(offset) % 4 === 2) {
      let status = 'done';
      let wasPlanned = true;
      let note = '';

      if (isFuture) {
        status = 'planned';
        wasPlanned = true;
        note = 'Reunião de orientação do trabalho de conclusão';
      } else if (isToday) {
        status = 'done';
        wasPlanned = true;
        note = 'Aula prática no laboratório';
      } else {
        if (offset === -14) {
          status = 'missed';
          wasPlanned = true;
        } else if (offset === -6) {
          // Pending planned entry
          status = 'planned';
          wasPlanned = true;
          note = 'Estudar para a prova de recuperação';
        } else {
          status = 'done';
          wasPlanned = true;
          const noteIdx = Math.abs(Math.floor(offset / 4)) % faculdadeNotes.length;
          note = faculdadeNotes[noteIdx];
        }
      }

      completions.push({
        id: `${dateStr}:demo_faculdade`,
        date: dateStr,
        activityId: 'demo_faculdade',
        status,
        wasPlanned,
        blockedByRain: false,
        optionIds: [],
        note,
        demo: true,
      });
    }
  }

  return {
    activities,
    completions,
    dayEntries,
  };
}

/**
 * Pure safety filter: ensures seeding NEVER overwrites or modifies non-demo records.
 * - Skips any activity whose ID matches an existing non-demo activity.
 * - Skips any completion whose date+activityId matches an existing non-demo completion.
 * - Skips any day entry whose date matches an existing non-demo day entry.
 *
 * @param {{ activities: Array<object>, completions: Array<object>, dayEntries: Array<object> }} demoData
 * @param {{ activities?: Array<object>, completions?: Array<object>, dayEntries?: Array<object> }} existingData
 * @returns {{ activities: Array<object>, completions: Array<object>, dayEntries: Array<object> }}
 */
export function filterDemoDataForSeeding(demoData, existingData = {}) {
  const existingActivities = Array.isArray(existingData.activities) ? existingData.activities : [];
  const existingCompletions = Array.isArray(existingData.completions) ? existingData.completions : [];
  const existingDayEntries = Array.isArray(existingData.dayEntries) ? existingData.dayEntries : [];

  const realActivityIds = new Set(
    existingActivities.filter((a) => a && !a.demo).map((a) => a.id)
  );

  const realCompletionKeys = new Set(
    existingCompletions
      .filter((c) => c && !c.demo)
      .map((c) => `${c.date}:${c.activityId}`)
  );

  const realDayEntryDates = new Set(
    existingDayEntries.filter((d) => d && !d.demo).map((d) => d.date)
  );

  // 1. Activities to insert: skip if existing has same ID and is real
  const activities = (demoData.activities || []).filter(
    (act) => act && !realActivityIds.has(act.id)
  );

  // 2. Completions to insert: skip if day+activity already has real entry
  const completions = (demoData.completions || []).filter((comp) => {
    if (!comp || !comp.date || !comp.activityId) return false;
    const key = `${comp.date}:${comp.activityId}`;
    return !realCompletionKeys.has(key);
  });

  // 3. Day entries: skip if date already has real day entry
  const dayEntries = (demoData.dayEntries || []).filter(
    (d) => d && d.date && !realDayEntryDates.has(d.date)
  );

  return { activities, completions, dayEntries };
}

/**
 * Pure safety selector: identifies only records flagged with demo: true for removal.
 * Real records are never selected for removal.
 *
 * @param {{ activities?: Array<object>, completions?: Array<object>, dayEntries?: Array<object> }} existingData
 * @returns {{ activityIds: string[], completionIds: string[], dayEntryDates: string[] }}
 */
export function getDemoRecordKeysToRemove(existingData = {}) {
  const activities = Array.isArray(existingData.activities) ? existingData.activities : [];
  const completions = Array.isArray(existingData.completions) ? existingData.completions : [];
  const dayEntries = Array.isArray(existingData.dayEntries) ? existingData.dayEntries : [];

  const activityIds = activities
    .filter((a) => a && Boolean(a.demo))
    .map((a) => a.id);

  const completionIds = completions
    .filter((c) => c && Boolean(c.demo))
    .map((c) => c.id || `${c.date}:${c.activityId}`);

  const dayEntryDates = dayEntries
    .filter((d) => d && Boolean(d.demo))
    .map((d) => d.date);

  return { activityIds, completionIds, dayEntryDates };
}
