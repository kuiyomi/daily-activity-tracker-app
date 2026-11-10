/**
 * activityLogic.js – pure logic functions for activities and completions.
 * No DOM, no storage side-effects, fully unit-testable.
 */

import { todayString } from './dateUtils.js';

export const EMOJI_TO_ICON_KEY = {
  '🏋️': 'barbell',
  '🏃': 'person-simple-run',
  '🚴': 'bicycle',
  '🚶': 'person-simple-walk',
  '🏊': 'person-simple-swim',
  '🧘': 'flower-lotus',
  '⚽': 'soccer-ball',
  '💊': 'pill',
  '🥗': 'bowl-food',
  '📖': 'book-open',
  '🎯': 'target',
  '💧': 'drop',
  '💪': 'barbell',
  '⭐️': 'target',
};

export const DEFAULT_MUSCLE_GROUPS = [
  'Superiores',
  'Inferiores',
  'Peito',
  'Costas',
  'Pernas',
  'Ombros',
  'Bíceps',
  'Tríceps',
  'Cardio',
];

export function muscleGroupSlug(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Validates and sanitizes activity input data.
 * Maps legacy emojis to Phosphor icon keys while preserving unknown icons for backward compatibility.
 * @param {object} input
 * @param {string} [input.id]
 * @param {string} input.name
 * @param {string} [input.icon]
 * @param {string} [input.color]
 * @param {Array<{ id: string, name: string, multiple: boolean, archived: boolean, options: Array<{ id: string, name: string, archived: boolean }> }>} [input.groups]
 * @param {number} [input.createdAt]
 * @returns {{ valid: boolean, errors: string[], sanitized: object | null }}
 */
export function validateActivity(input = {}) {
  const errors = [];

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) {
    errors.push('Nome da atividade é obrigatório');
  } else if (name.length > 50) {
    errors.push('Nome da atividade não pode ter mais de 50 caracteres');
  }

  const rawIcon = typeof input.icon === 'string' && input.icon.trim() ? input.icon.trim() : 'barbell';
  const icon = EMOJI_TO_ICON_KEY[rawIcon] || rawIcon;

  const color = typeof input.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(input.color.trim())
    ? input.color.trim()
    : '#007aff';

  const groups = Array.isArray(input.groups)
    ? input.groups.map((g, gIdx) => ({
        id: typeof g.id === 'string' && g.id.trim() ? g.id.trim() : `grp_${Date.now()}_${gIdx}`,
        name: typeof g.name === 'string' ? g.name.trim() : '',
        multiple: Boolean(g.multiple),
        archived: Boolean(g.archived),
        options: Array.isArray(g.options)
          ? g.options.map((opt, oIdx) => ({
              id: typeof opt.id === 'string' && opt.id.trim() ? opt.id.trim() : `opt_${Date.now()}_${oIdx}`,
              name: typeof opt.name === 'string' ? opt.name.trim() : '',
              archived: Boolean(opt.archived),
            }))
          : [],
      }))
    : [];

  const allowsNote = Boolean(input.allowsNote);

  if (errors.length > 0) {
    return { valid: false, errors, sanitized: null };
  }

  const id = input.id && typeof input.id === 'string' ? input.id : generateActivityId();
  const createdAt = typeof input.createdAt === 'number' ? input.createdAt : Date.now();

  return {
    valid: true,
    errors: [],
    sanitized: {
      id,
      name,
      icon,
      color,
      groups,
      allowsNote,
      createdAt,
    },
  };
}

/**
 * Generates a unique activity ID.
 * @returns {string}
 */
export function generateActivityId() {
  const rnd = Math.random().toString(36).substring(2, 9);
  return `act_${Date.now()}_${rnd}`;
}

/**
 * Creates the default "Academia" seed activity with Phosphor icon key "barbell",
 * blue color, and embedded "Grupos musculares" group.
 * @returns {object}
 */
export function createDefaultActivity() {
  return {
    id: 'act_academia',
    name: 'Academia',
    icon: 'barbell',
    color: '#007aff',
    groups: [
      {
        id: 'grp_grupos_musculares',
        name: 'Grupos musculares',
        multiple: true,
        archived: false,
        options: DEFAULT_MUSCLE_GROUPS.map((name) => ({
          id: `opt_${muscleGroupSlug(name)}`,
          name,
          archived: false,
        })),
      },
    ],
    allowsNote: false,
    createdAt: 1700000000000,
  };
}

/**
 * Pure helper to toggle an activity ID in an array of completed activity IDs.
 * @param {string[]} completedIds
 * @param {string} activityId
 * @returns {string[]}
 */
export function toggleCompletionId(completedIds = [], activityId) {
  if (!activityId) return [...completedIds];
  if (completedIds.includes(activityId)) {
    return completedIds.filter((id) => id !== activityId);
  }
  return [...completedIds, activityId];
}

/**
 * Checks if an activity is completed.
 * @param {string[]} completedIds
 * @param {string} activityId
 * @returns {boolean}
 */
export function isActivityCompleted(completedIds = [], activityId) {
  return completedIds.includes(activityId);
}

/**
 * Extracts a Set of unique dates from a list of completion records.
 * Only completed records (status === 'done' or missing legacy status) are included.
 * @param {Array<{ date: string, status?: string }>} completions
 * @returns {Set<string>}
 */
export function extractCompletedDates(completions = []) {
  const dates = new Set();
  for (const item of completions) {
    if (item && typeof item.date === 'string') {
      const status = item.status || 'done';
      if (status === 'done') {
        dates.add(item.date);
      }
    }
  }
  return dates;
}

export const PRESET_COLORS = [
  '#007aff', // iOS blue
  '#34c759', // iOS green
  '#ff9500', // iOS orange
  '#ff2d55', // iOS pink
  '#af52de', // iOS purple
  '#5856d6', // iOS indigo
  '#ffcc00', // iOS yellow
  '#32ade6', // iOS cyan
];

/**
 * Returns the first preset color not currently used by any existing activity.
 * If all preset colors are used, falls back to the first preset color.
 *
 * @param {Array<{ color?: string }>} existingActivities
 * @param {string[]} [presetColors=PRESET_COLORS]
 * @returns {string}
 */
export function getNextAvailablePresetColor(existingActivities = [], presetColors = PRESET_COLORS) {
  const usedColors = new Set(
    existingActivities
      .filter((a) => a && typeof a.color === 'string')
      .map((a) => a.color.trim().toLowerCase())
  );

  for (const preset of presetColors) {
    if (!usedColors.has(preset.toLowerCase())) {
      return preset;
    }
  }

  return presetColors[0] || '#007aff';
}

/**
 * Groups an array of completion records by date string (YYYY-MM-DD).
 * Only entries with status === 'done' (or missing legacy status) count as completions.
 *
 * @param {Array<{ date: string, activityId: string, status?: string }>} completions
 * @returns {Record<string, string[]>} map of dateStr -> array of completed activityIds
 */
export function groupCompletionsByDate(completions = []) {
  if (!Array.isArray(completions)) return {};
  const result = {};
  for (const item of completions) {
    if (!item || !item.date || !item.activityId) continue;
    const status = item.status || 'done';
    if (status !== 'done') continue;
    if (!result[item.date]) {
      result[item.date] = [];
    }
    if (!result[item.date].includes(item.activityId)) {
      result[item.date].push(item.activityId);
    }
  }
  return result;
}

/**
 * Collects YYYY-MM-DD strings whose day entry has rained === true.
 *
 * @param {Array<{ date?: string, rained?: boolean }>} dayEntries
 * @returns {Set<string>}
 */
export function rainedDateSet(dayEntries = []) {
  const dates = new Set();
  if (!Array.isArray(dayEntries)) return dates;
  for (const entry of dayEntries) {
    if (entry && entry.rained && typeof entry.date === 'string') {
      dates.add(entry.date);
    }
  }
  return dates;
}

/**
 * Computes dot indicators for a single day:
 * - One dot per completed activity in that activity's color
 * - Ordered by activity creation order (createdAt)
 * - Maximum 4 dots; if > 4, returns 3 dots with hasOverflow = true (to show a '+')
 *
 * @param {string[]} completedActivityIds – activity IDs completed on that day
 * @param {Array<{ id: string, color?: string, createdAt?: number }>} activities – all activities
 * @param {number} [maxDots=4]
 * @returns {{ dots: string[], hasOverflow: boolean, total: number }}
 */
export function getDayDotIndicators(completedActivityIds = [], activities = [], maxDots = 4) {
  if (!completedActivityIds || completedActivityIds.length === 0) {
    return { dots: [], hasOverflow: false, total: 0 };
  }

  const actMap = new Map();
  for (const act of activities) {
    if (act && act.id) {
      actMap.set(act.id, act);
    }
  }

  const matching = [];
  for (const id of completedActivityIds) {
    const act = actMap.get(id);
    if (act) {
      matching.push(act);
    }
  }

  // Order strictly by activity creation order (createdAt)
  matching.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  const total = matching.length;
  if (total <= maxDots) {
    return {
      dots: matching.map((a) => a.color || '#007aff'),
      hasOverflow: false,
      total,
    };
  }

  return {
    dots: matching.slice(0, 3).map((a) => a.color || '#007aff'),
    hasOverflow: true,
    total,
  };
}

/**
 * Computes marker indicators for a single day including all planning states:
 * - feita ('done'): filled dot
 * - planejada ('planned'): hollow ring
 * - não feita ('missed'): small x
 * Ordered by activity creation order (createdAt)
 * Maximum 4 markers; if > 4, returns 3 markers with hasOverflow = true
 *
 * @param {Array<object|string>} dayCompletions
 * @param {Array<{ id: string, color?: string, createdAt?: number }>} activities
 * @param {number} [maxMarkers=4]
 * @returns {{ markers: Array<{ color: string, status: string }>, hasOverflow: boolean, total: number }}
 */
export function getDayMarkerIndicators(dayCompletions = [], activities = [], maxMarkers = 4) {
  if (!dayCompletions || dayCompletions.length === 0) {
    return { markers: [], hasOverflow: false, total: 0 };
  }

  const actMap = new Map();
  for (const act of activities) {
    if (act && act.id) {
      actMap.set(act.id, act);
    }
  }

  const matching = [];
  const seenActIds = new Set();
  for (const item of dayCompletions) {
    if (!item) continue;
    const comp = typeof item === 'string' ? { activityId: item, status: 'done' } : item;
    if (!comp.activityId || seenActIds.has(comp.activityId)) continue;
    seenActIds.add(comp.activityId);
    const act = actMap.get(comp.activityId);
    if (act) {
      matching.push({
        act,
        color: act.color || '#007aff',
        status: comp.status || 'done',
      });
    }
  }

  // Order strictly by activity creation order (createdAt)
  matching.sort((a, b) => (a.act.createdAt || 0) - (b.act.createdAt || 0));

  const total = matching.length;
  if (total <= maxMarkers) {
    return {
      markers: matching.map((m) => ({ color: m.color, status: m.status })),
      hasOverflow: false,
      total,
    };
  }

  return {
    markers: matching.slice(0, 3).map((m) => ({ color: m.color, status: m.status })),
    hasOverflow: true,
    total,
  };
}

/* ─────────────────────────────────────────────────────────────
   PLANNING & STATUS TRANSITIONS
   Status model: 'planned' | 'done' | 'missed'
   wasPlanned: boolean
   Legacy entries without status count as 'done' with wasPlanned: false.
   Future dates only allow none ↔ planned. Today and past allow all.
   ───────────────────────────────────────────────────────────── */

/**
 * Trims and limits note string to 500 characters.
 * @param {string} [note]
 * @returns {string}
 */
export function sanitizeNote(note) {
  return typeof note === 'string' ? note.trim().slice(0, 500) : '';
}

/**
 * Normalizes a completion record so legacy entries without status/wasPlanned
 * count as status 'done' with wasPlanned false, and note is trimmed (max 500 chars).
 * @param {object|null} record
 * @returns {object|null}
 */
export function normalizeCompletionRecord(record) {
  if (!record) return null;
  const rawNote = typeof record.note === 'string' ? record.note : '';
  const status = record.status || 'done';
  return {
    ...record,
    status,
    wasPlanned: Boolean(record.wasPlanned),
    blockedByRain: status === 'missed' ? Boolean(record.blockedByRain) : false,
    optionIds: Array.isArray(record.optionIds)
      ? record.optionIds
      : Array.isArray(record.muscleGroupIds)
      ? record.muscleGroupIds
      : [],
    note: rawNote.trim().slice(0, 500),
  };
}

/**
 * Transition: none → planned
 * Allowed on all dates (future, today, past).
 *
 * @param {{ dateStr: string, activityId: string, optionIds?: string[], note?: string }} params
 * @returns {object} The new planned completion record
 */
export function noneToPlanned({ dateStr, activityId, optionIds = [], note = '' }) {
  if (!dateStr || !activityId) {
    throw new Error('dateStr e activityId são obrigatórios');
  }
  return {
    id: `${dateStr}:${activityId}`,
    date: dateStr,
    activityId,
    status: 'planned',
    wasPlanned: true,
    optionIds: Array.isArray(optionIds) ? [...optionIds] : [],
    note: sanitizeNote(note),
  };
}

/**
 * Transition: none → done
 * Allowed only on today and past dates (future dates only allow none ↔ planned).
 *
 * @param {{ dateStr: string, activityId: string, optionIds?: string[], note?: string }} params
 * @param {string} [todayStr]
 * @returns {object} The new done completion record (wasPlanned: false)
 */
export function noneToDone({ dateStr, activityId, optionIds = [], note = '' }, todayStr = todayString()) {
  if (!dateStr || !activityId) {
    throw new Error('dateStr e activityId são obrigatórios');
  }
  if (dateStr > todayStr) {
    throw new Error('Não é permitido marcar como feita em datas futuras');
  }
  return {
    id: `${dateStr}:${activityId}`,
    date: dateStr,
    activityId,
    status: 'done',
    wasPlanned: false,
    optionIds: Array.isArray(optionIds) ? [...optionIds] : [],
    note: sanitizeNote(note),
    completedAt: Date.now(),
  };
}

/**
 * Transition: planned → done
 * Allowed only on today and past dates.
 *
 * @param {object} entry
 * @param {string} [todayStr]
 * @returns {object} The updated done completion record (wasPlanned: true)
 */
export function plannedToDone(entry, todayStr = todayString()) {
  if (!entry) throw new Error('Entrada não encontrada');
  const normalized = normalizeCompletionRecord(entry);
  if (normalized.status !== 'planned') {
    throw new Error('Apenas entradas planejadas podem ser marcadas como feita');
  }
  if (normalized.date > todayStr) {
    throw new Error('Não é permitido marcar como feita em datas futuras');
  }
  return {
    ...normalized,
    status: 'done',
    wasPlanned: true,
    blockedByRain: false,
    completedAt: normalized.completedAt || Date.now(),
  };
}

/**
 * Transition: planned → missed
 * Allowed only on today and past dates.
 *
 * @param {object} entry
 * @param {string} [todayStr]
 * @param {{ blockedByRain?: boolean } | boolean} [params]
 * @returns {object} The updated missed completion record (wasPlanned: true)
 */
export function plannedToMissed(entry, todayStr = todayString(), params = {}) {
  if (!entry) throw new Error('Entrada não encontrada');
  const normalized = normalizeCompletionRecord(entry);
  if (normalized.status !== 'planned') {
    throw new Error('Apenas entradas planejadas podem ser marcadas como não feita');
  }
  if (normalized.date > todayStr) {
    throw new Error('Não é permitido marcar como não feita em datas futuras');
  }
  const blockedByRain = typeof params === 'object' && params !== null
    ? Boolean(params.blockedByRain)
    : (typeof params === 'boolean' ? params : false);

  return {
    ...normalized,
    status: 'missed',
    wasPlanned: true,
    blockedByRain,
  };
}

/**
 * Transition: done or missed (when wasPlanned) → planned
 * Allowed on today and past dates.
 *
 * @param {object} entry
 * @param {string} [todayStr]
 * @returns {object} The reverted planned completion record (wasPlanned: true)
 */
export function resolvedToPlanned(entry, todayStr = todayString()) {
  if (!entry) throw new Error('Entrada não encontrada');
  const normalized = normalizeCompletionRecord(entry);
  if (!normalized.wasPlanned) {
    throw new Error('Apenas entradas planejadas podem voltar para planejada');
  }
  if (normalized.status !== 'done' && normalized.status !== 'missed') {
    throw new Error('Apenas entradas feitas ou não feitas podem voltar para planejada');
  }
  return {
    ...normalized,
    status: 'planned',
    wasPlanned: true,
    blockedByRain: false,
  };
}

/**
 * Transition: done (when not wasPlanned) → none
 * Allowed on today and past dates.
 *
 * @param {object} entry
 * @param {string} [todayStr]
 * @returns {null}
 */
export function doneToNone(entry, todayStr = todayString()) {
  if (!entry) throw new Error('Entrada não encontrada');
  const normalized = normalizeCompletionRecord(entry);
  if (normalized.status !== 'done' || normalized.wasPlanned) {
    throw new Error('Apenas entradas feitas e não planejadas podem ser desmarcadas para none');
  }
  if (normalized.date > todayStr) {
    throw new Error('Transição não permitida em datas futuras');
  }
  return null;
}

/**
 * Transition: planned → none
 * Allowed on all dates (future, today, past).
 *
 * @param {object} entry
 * @returns {null}
 */
export function plannedToNone(entry) {
  if (!entry) throw new Error('Entrada não encontrada');
  return null;
}

/**
 * Helper to apply a status transition cleanly.
 *
 * @param {object|null} entry – current completion record or null if none
 * @param {'planned'|'done'|'missed'|'none'} action – target status
 * @param {{ dateStr: string, activityId: string, optionIds?: string[] }} context
 * @param {string} [todayStr]
 * @returns {object|null} New record or null if deleted/none
 */
export function applyTransition(entry, action, { dateStr, activityId, optionIds = [] }, todayStr = todayString()) {
  const norm = entry ? normalizeCompletionRecord(entry) : null;

  if (action === 'planned') {
    if (!norm) {
      return noneToPlanned({ dateStr, activityId, optionIds });
    }
    return resolvedToPlanned(norm, todayStr);
  }

  if (action === 'done') {
    if (!norm) {
      return noneToDone({ dateStr, activityId, optionIds }, todayStr);
    }
    return plannedToDone(norm, todayStr);
  }

  if (action === 'missed') {
    return plannedToMissed(norm, todayStr);
  }

  if (action === 'none') {
    if (!norm) return null;
    if (norm.wasPlanned) {
      return plannedToNone(norm);
    }
    return doneToNone(norm, todayStr);
  }

  throw new Error(`Ação desconhecida: ${action}`);
}

