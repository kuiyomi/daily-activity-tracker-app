/**
 * stats.js – Pure calculation functions for monthly statistics (RF10).
 * No DOM, no side-effects, easy to unit-test.
 */

import { todayString } from './dateUtils.js';

/**
 * Normalizes a month filter string (YYYY-MM) from either options.year & options.month
 * (where month is 0-based), or options.monthStr.
 *
 * @param {{ year?: number, month?: number, monthStr?: string }} [options]
 * @returns {string | null}
 */
export function getMonthFilter(options = {}) {
  if (typeof options.monthStr === 'string' && options.monthStr.length >= 7) {
    return options.monthStr.slice(0, 7);
  }
  if (typeof options.year === 'number' && typeof options.month === 'number') {
    const y = options.year;
    const m = String(options.month + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  return null;
}

/**
 * Filters an array of items with a `date` property (YYYY-MM-DD) to a given month.
 *
 * @template T
 * @param {T[]} items
 * @param {string | null} monthFilter – "YYYY-MM"
 * @returns {T[]}
 */
export function filterByMonth(items, monthFilter) {
  if (!Array.isArray(items)) return [];
  if (!monthFilter) return items;
  return items.filter((item) => typeof item?.date === 'string' && item.date.startsWith(monthFilter));
}

/**
 * Computes the number of distinct days with at least one 'done' completion.
 *
 * @param {Array<{ date: string, status?: string }>} completions
 * @returns {number}
 */
export function computeActiveDays(completions = []) {
  const dates = new Set();
  for (const c of completions) {
    if ((c?.status || 'done') === 'done' && typeof c.date === 'string') {
      dates.add(c.date);
    }
  }
  return dates.size;
}

/**
 * Computes the number of distinct days marked as rained.
 *
 * @param {Array<{ date: string, rained?: boolean }>} dayEntries
 * @returns {number}
 */
export function computeRainDays(dayEntries = []) {
  const dates = new Set();
  for (const entry of dayEntries) {
    if (Boolean(entry?.rained) && typeof entry.date === 'string') {
      dates.add(entry.date);
    }
  }
  return dates.size;
}

/**
 * Computes days done per activity: { [activityId]: daysCount }.
 * Each activity counts distinct dates where status was 'done'.
 *
 * @param {Array<{ date: string, activityId: string, status?: string }>} completions
 * @returns {Record<string, number>}
 */
export function computeDoneByActivity(completions = []) {
  const activityDates = new Map();
  for (const c of completions) {
    if (!c?.activityId || typeof c.date !== 'string') continue;
    if ((c.status || 'done') !== 'done') continue;

    if (!activityDates.has(c.activityId)) {
      activityDates.set(c.activityId, new Set());
    }
    activityDates.get(c.activityId).add(c.date);
  }

  const result = {};
  for (const [activityId, dates] of activityDates.entries()) {
    result[activityId] = dates.size;
  }
  return result;
}

/**
 * Computes plan statistics over wasPlanned entries:
 * - done: wasPlanned entries with status 'done'
 * - missed: wasPlanned entries with status 'missed'
 * - pending: wasPlanned entries with status 'planned' and date before today
 * - upcoming: wasPlanned entries with status 'planned' and date today or later
 * Also tracks the earliest pending date.
 *
 * @param {Array<{ date: string, status?: string, wasPlanned?: boolean }>} completions
 * @param {string} [todayStr] – "YYYY-MM-DD"
 * @returns {{
 *   done: number,
 *   missed: number,
 *   pending: number,
 *   upcoming: number,
 *   earliestPendingDate: string | null
 * }}
 */
export function computePlanStats(completions = [], todayStr = todayString()) {
  let done = 0;
  let missed = 0;
  let pending = 0;
  let upcoming = 0;
  let earliestPendingDate = null;

  for (const c of completions) {
    if (!Boolean(c?.wasPlanned) || typeof c.date !== 'string') continue;
    const status = c.status || 'done';

    if (status === 'done') {
      done++;
    } else if (status === 'missed') {
      missed++;
    } else if (status === 'planned') {
      if (c.date < todayStr) {
        pending++;
        if (!earliestPendingDate || c.date < earliestPendingDate) {
          earliestPendingDate = c.date;
        }
      } else {
        upcoming++;
      }
    }
  }

  return { done, missed, pending, upcoming, earliestPendingDate };
}

/**
 * Computes adherence = done ÷ (done + missed) over wasPlanned entries.
 * Returns null if (done + missed) === 0.
 *
 * @param {number} done
 * @param {number} missed
 * @returns {number | null}
 */
export function computeAdherence(done, missed) {
  const total = done + missed;
  if (total <= 0) return null;
  return done / total;
}

/**
 * Computes count of wasPlanned entries with status 'missed' on a day with rained true.
 *
 * @param {Array<{ date: string, status?: string, wasPlanned?: boolean }>} completions
 * @param {Array<{ date: string, rained?: boolean }> | Set<string>} dayEntriesOrRainSet
 * @returns {number}
 */
export function computeMissedOnRainDays(completions = [], dayEntriesOrRainSet = []) {
  let rainSet;
  if (dayEntriesOrRainSet instanceof Set) {
    rainSet = dayEntriesOrRainSet;
  } else if (Array.isArray(dayEntriesOrRainSet)) {
    rainSet = new Set(
      dayEntriesOrRainSet
        .filter((d) => Boolean(d?.rained) && typeof d.date === 'string')
        .map((d) => d.date)
    );
  } else {
    rainSet = new Set();
  }

  let count = 0;
  for (const c of completions) {
    if (Boolean(c?.wasPlanned) && c?.status === 'missed' && typeof c.date === 'string') {
      if (rainSet.has(c.date)) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Computes full monthly stats from completions and day entries.
 *
 * @param {Array<object> | { completions?: Array<object>, dayEntries?: Array<object>, todayStr?: string, year?: number, month?: number }} completionsOrParams
 * @param {Array<object>} [dayEntriesArg]
 * @param {{ todayStr?: string, year?: number, month?: number, monthStr?: string }} [optionsArg]
 * @returns {{
 *   activeDays: number,
 *   rainDays: number,
 *   doneByActivity: Record<string, number>,
 *   plan: { done: number, missed: number, pending: number, upcoming: number },
 *   adherence: number | null,
 *   missedOnRainDays: number,
 *   earliestPendingDate: string | null
 * }}
 */
export function computeMonthlyStats(completionsOrParams, dayEntriesArg, optionsArg) {
  let rawCompletions;
  let rawDayEntries;
  let options;

  if (Array.isArray(completionsOrParams)) {
    rawCompletions = completionsOrParams;
    rawDayEntries = Array.isArray(dayEntriesArg) ? dayEntriesArg : [];
    options = optionsArg || {};
  } else if (completionsOrParams && typeof completionsOrParams === 'object') {
    rawCompletions = completionsOrParams.completions || [];
    rawDayEntries = completionsOrParams.dayEntries || [];
    options = completionsOrParams;
  } else {
    rawCompletions = [];
    rawDayEntries = [];
    options = {};
  }

  const monthFilter = getMonthFilter(options);
  const completions = filterByMonth(rawCompletions, monthFilter);
  const dayEntries = filterByMonth(rawDayEntries, monthFilter);
  const todayStr = options.todayStr || todayString();

  const activeDays = computeActiveDays(completions);
  const rainDays = computeRainDays(dayEntries);
  const doneByActivity = computeDoneByActivity(completions);
  const planStats = computePlanStats(completions, todayStr);
  const plan = {
    done: planStats.done,
    missed: planStats.missed,
    pending: planStats.pending,
    upcoming: planStats.upcoming,
  };
  const adherence = computeAdherence(plan.done, plan.missed);
  const missedOnRainDays = computeMissedOnRainDays(completions, dayEntries);
  const blockedByRainCount = computeBlockedByRainCount(completions);

  return {
    activeDays,
    rainDays,
    doneByActivity,
    plan,
    adherence,
    missedOnRainDays,
    blockedByRainCount,
    earliestPendingDate: planStats.earliestPendingDate,
  };
}

/**
 * Computes the number of missed entries flagged with blockedByRain in a month.
 *
 * @param {Array<{ status?: string, blockedByRain?: boolean, date?: string }>} completions
 * @param {{ year?: number, month?: number, monthStr?: string }} [options]
 * @returns {number}
 */
export function computeBlockedByRainCount(completions = [], options = {}) {
  const monthFilter = getMonthFilter(options);
  const filtered = filterByMonth(completions, monthFilter);
  let count = 0;
  for (const c of filtered) {
    if (c?.status === 'missed' && Boolean(c?.blockedByRain)) {
      count++;
    }
  }
  return count;
}

/**
 * Computes impeded entries stats grouped by activity and option for the "Por opção" card.
 * Lists each activity that has impeded entries, and its options with the number of impeded entries.
 *
 * @param {Array<object>} completions
 * @param {Array<object>} [activities]
 * @param {{ year?: number, month?: number, monthStr?: string }} [options]
 * @returns {Array<{
 *   activityId: string,
 *   activityName: string,
 *   color: string,
 *   icon: string,
 *   options: Array<{ id: string, name: string, count: number }>
 * }>}
 */
export function computeImpededOptionsStats(completions = [], activities = [], options = {}) {
  const monthFilter = getMonthFilter(options);
  const filtered = filterByMonth(completions, monthFilter);
  const impeded = filtered.filter((c) => c?.status === 'missed' && Boolean(c?.blockedByRain));

  const actMap = new Map((activities || []).map((a) => [a.id, a]));
  const actOptCounts = new Map(); // actId -> Map(optId -> count)

  for (const comp of impeded) {
    if (!comp?.activityId) continue;
    const optIds = Array.isArray(comp.optionIds)
      ? comp.optionIds
      : Array.isArray(comp.muscleGroupIds)
      ? comp.muscleGroupIds
      : [];

    if (!actOptCounts.has(comp.activityId)) {
      actOptCounts.set(comp.activityId, new Map());
    }
    const optCounts = actOptCounts.get(comp.activityId);

    for (const optId of optIds) {
      optCounts.set(optId, (optCounts.get(optId) || 0) + 1);
    }
  }

  const result = [];
  for (const [actId, optCounts] of actOptCounts.entries()) {
    const act = actMap.get(actId) || { id: actId, name: actId, color: '#007aff', icon: 'barbell' };
    const optionsList = [];

    const allGroupOptions = new Map();
    for (const group of (act.groups || [])) {
      for (const opt of (group.options || [])) {
        allGroupOptions.set(opt.id, opt.name);
      }
    }

    for (const [optId, count] of optCounts.entries()) {
      if (count > 0) {
        optionsList.push({
          id: optId,
          name: allGroupOptions.get(optId) || optId,
          count,
        });
      }
    }

    if (optionsList.length > 0) {
      optionsList.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      result.push({
        activityId: act.id,
        activityName: act.name,
        color: act.color || '#007aff',
        icon: act.icon || 'barbell',
        options: optionsList,
      });
    }
  }

  result.sort((a, b) => a.activityName.localeCompare(b.activityName));
  return result;
}

/**
 * Computes monthly counts for a specific activity:
 * - done: distinct days with status 'done' (or missing legacy status)
 * - planned: distinct days with status 'planned'
 * - missed: distinct days with status 'missed'
 *
 * @param {Array<object>} completions
 * @param {string} activityId
 * @param {{ year?: number, month?: number, monthStr?: string }} [options]
 * @returns {{ done: number, planned: number, missed: number, totalPlanned: number }}
 */
export function computeActivityMonthlyStats(completions = [], activityId, options = {}) {
  const monthFilter = getMonthFilter(options);
  let filtered = filterByMonth(completions, monthFilter);
  if (activityId) {
    filtered = filtered.filter((c) => c?.activityId === activityId);
  }

  const doneDates = new Set();
  const plannedDates = new Set();
  const missedDates = new Set();
  const totalPlannedDates = new Set();

  for (const c of filtered) {
    if (!c || typeof c.date !== 'string') continue;
    const status = c.status || 'done';

    if (status === 'done') {
      doneDates.add(c.date);
    } else if (status === 'planned') {
      plannedDates.add(c.date);
    } else if (status === 'missed') {
      missedDates.add(c.date);
    }

    if (Boolean(c.wasPlanned)) {
      totalPlannedDates.add(c.date);
    }
  }

  return {
    done: doneDates.size,
    planned: plannedDates.size,
    missed: missedDates.size,
    totalPlanned: totalPlannedDates.size,
  };
}

/**
 * Computes monthly option statistics for an activity or list of detail groups:
 * - Iterates all groups and all options (including archived options)
 * - Counts distinct days each option was selected in the month
 * - Keeps only options with at least one day (days >= 1)
 * - Sorts options descending by days (secondary by name)
 * - Calculates thin bar percentage relative to the max days in the group
 *
 * @param {Array<object>} completions
 * @param {object | Array<object>} groupsOrActivity
 * @param {{ year?: number, month?: number, monthStr?: string, activityId?: string }} [options]
 * @returns {Array<{
 *   id: string,
 *   name: string,
 *   archived: boolean,
 *   options: Array<{ id: string, name: string, days: number, count: number, pct: number, archived: boolean }>
 * }>}
 */
export function computeActivityOptionStats(completions = [], groupsOrActivity = [], options = {}) {
  const monthFilter = getMonthFilter(options);
  let filteredCompletions = filterByMonth(completions, monthFilter);

  let groups = [];
  let activityId = options.activityId || null;

  if (groupsOrActivity && Array.isArray(groupsOrActivity.groups)) {
    groups = groupsOrActivity.groups;
    if (!activityId) activityId = groupsOrActivity.id;
  } else if (Array.isArray(groupsOrActivity)) {
    groups = groupsOrActivity;
  }

  if (activityId) {
    filteredCompletions = filteredCompletions.filter((c) => c?.activityId === activityId);
  }

  const result = [];
  for (const group of groups) {
    if (!group || !Array.isArray(group.options)) continue;
    const optionStats = [];

    for (const opt of group.options) {
      if (!opt || !opt.id) continue;
      const dates = new Set();
      for (const c of filteredCompletions) {
        if (!c || typeof c.date !== 'string') continue;
        const optIds = Array.isArray(c.optionIds)
          ? c.optionIds
          : Array.isArray(c.muscleGroupIds)
          ? c.muscleGroupIds
          : [];
        if (optIds.includes(opt.id)) {
          dates.add(c.date);
        }
      }

      if (dates.size > 0) {
        optionStats.push({
          id: opt.id,
          name: opt.name || opt.id,
          days: dates.size,
          count: dates.size,
          archived: Boolean(opt.archived),
        });
      }
    }

    if (optionStats.length > 0) {
      optionStats.sort((a, b) => b.days - a.days || a.name.localeCompare(b.name));
      const maxDays = Math.max(...optionStats.map((o) => o.days), 1);
      const optionsWithPct = optionStats.map((opt) => ({
        ...opt,
        pct: Math.max(4, Math.round((opt.days / maxDays) * 100)),
      }));

      result.push({
        id: group.id,
        name: group.name || '',
        archived: Boolean(group.archived),
        options: optionsWithPct,
      });
    }
  }

  return result;
}

/**
 * Returns activity notes for a given month, sorted newest first.
 * Filters out entries without a note or with blank notes.
 *
 * @param {Array<object>} completions
 * @param {string} activityId
 * @param {{ year?: number, month?: number, monthStr?: string }} [options]
 * @returns {Array<{ date: string, note: string }>}
 */
export function getActivityNotesForMonth(completions = [], activityId, options = {}) {
  const monthFilter = getMonthFilter(options);
  let filtered = filterByMonth(completions, monthFilter);
  if (activityId) {
    filtered = filtered.filter((c) => c?.activityId === activityId);
  }

  const notes = [];
  for (const c of filtered) {
    if (!c || typeof c.date !== 'string') continue;
    const note = typeof c.note === 'string' ? c.note.trim() : '';
    if (note.length > 0) {
      notes.push({
        date: c.date,
        note,
      });
    }
  }

  notes.sort((a, b) => b.date.localeCompare(a.date));
  return notes;
}

