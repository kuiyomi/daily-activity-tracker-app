/**
 * activityLogic.js – pure logic functions for activities and completions.
 * No DOM, no storage side-effects, fully unit-testable.
 */

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

/**
 * Validates and sanitizes activity input data.
 * Maps legacy emojis to Phosphor icon keys while preserving unknown icons for backward compatibility.
 * @param {object} input
 * @param {string} [input.id]
 * @param {string} input.name
 * @param {string} [input.icon]
 * @param {string} [input.color]
 * @param {boolean} [input.usesMuscleGroups]
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

  const usesMuscleGroups = Boolean(input.usesMuscleGroups);

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
      usesMuscleGroups,
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
 * Creates the default "Academia" seed activity with Phosphor icon key "barbell".
 * @returns {object}
 */
export function createDefaultActivity() {
  return {
    id: 'act_academia',
    name: 'Academia',
    icon: 'barbell',
    color: '#007aff',
    usesMuscleGroups: true,
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
 * @param {Array<{ date: string }>} completions
 * @returns {Set<string>}
 */
export function extractCompletedDates(completions = []) {
  const dates = new Set();
  for (const item of completions) {
    if (item && typeof item.date === 'string') {
      dates.add(item.date);
    }
  }
  return dates;
}
