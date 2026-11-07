/**
 * storage.js – IndexedDB storage layer for Dad's Calendar / Agenda.
 * Pure async API, completely decoupled from the UI.
 * Schema v3: activities, completions, dayEntries.
 */

import {
  validateActivity,
  createDefaultActivity,
  extractCompletedDates,
  DEFAULT_MUSCLE_GROUPS,
  muscleGroupSlug,
} from '../logic/activityLogic.js';

export const DB_NAME = 'DadsCalendarDB';
export const DB_VERSION = 3;

export { DEFAULT_MUSCLE_GROUPS, muscleGroupSlug };

let dbPromise = null;

/**
 * Closes the current database connection and resets the singleton promise.
 * Useful for tests, migrations, and clean restarts.
 * @returns {Promise<void>}
 */
export async function closeDB() {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch (_) {}
    dbPromise = null;
  }
}

/**
 * Opens or retrieves the singleton IndexedDB connection.
 * @returns {Promise<IDBDatabase>}
 */
export function getDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not available in this environment'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Drop all old stores and recreate them with the new schema
      for (const name of Array.from(db.objectStoreNames)) {
        db.deleteObjectStore(name);
      }

      const actStore = db.createObjectStore('activities', { keyPath: 'id' });
      const compStore = db.createObjectStore('completions', { keyPath: 'id' });
      compStore.createIndex('date', 'date', { unique: false });
      compStore.createIndex('activityId', 'activityId', { unique: false });
      db.createObjectStore('dayEntries', { keyPath: 'date' });

      // Seed defaults
      const defaultAct = createDefaultActivity();
      actStore.put(defaultAct);
    };

    request.onsuccess = async (event) => {
      const db = event.target.result;
      try {
        await seedDefaultActivityIfNeeded(db);
        resolve(db);
      } catch (err) {
        reject(err);
      }
    };

    request.onerror = (event) => {
      reject(event.target.error || new Error('Failed to open IndexedDB'));
    };
  });

  return dbPromise;
}

/**
 * Seeds the default activity "Academia" if no activities exist.
 * @param {IDBDatabase} db
 * @returns {Promise<void>}
 */
function seedDefaultActivityIfNeeded(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('activities', 'readwrite');
    const store = tx.objectStore('activities');
    const countReq = store.count();

    countReq.onsuccess = () => {
      if (countReq.result === 0) {
        const defaultAct = createDefaultActivity();
        store.put(defaultAct);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(event.target.error);
  });
}

/* ─────────────────────────────────────────────────────────────
   ACTIVITIES
   ───────────────────────────────────────────────────────────── */

/**
 * Returns all activities, sorted by creation date.
 * @returns {Promise<Array<object>>}
 */
export async function getActivities() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('activities', 'readonly');
    const store = tx.objectStore('activities');
    const request = store.getAll();

    request.onsuccess = () => {
      const list = request.result || [];
      list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      resolve(list);
    };

    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Retrieves a single activity by its ID.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getActivity(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('activities', 'readonly');
    const store = tx.objectStore('activities');
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Validates and saves an activity (insert or update).
 * @param {object} rawActivity
 * @returns {Promise<object>} The saved and validated activity.
 */
export async function saveActivity(rawActivity) {
  const validation = validateActivity(rawActivity);
  if (!validation.valid) {
    throw new Error(validation.errors.join('; '));
  }

  const sanitized = validation.sanitized;
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('activities', 'readwrite');
    const store = tx.objectStore('activities');
    const request = store.put(sanitized);

    request.onsuccess = () => resolve(sanitized);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Deletes an activity and all its completions.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteActivity(id) {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['activities', 'completions'], 'readwrite');
    const actStore = tx.objectStore('activities');
    const compStore = tx.objectStore('completions');

    actStore.delete(id);

    const compIndex = compStore.index('activityId');
    const compRequest = compIndex.openCursor(IDBKeyRange.only(id));

    compRequest.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(event.target.error);
  });
}

/* ─────────────────────────────────────────────────────────────
   DAY ENTRIES (RF06, RF09: RAIN & NOTES)
   ───────────────────────────────────────────────────────────── */

/**
 * Retrieves the day entry for a date (date, rained, notes).
 * @param {string} dateStr – "YYYY-MM-DD"
 * @returns {Promise<{ date: string, rained: boolean, notes: string }>}
 */
export async function getDayEntry(dateStr) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dayEntries', 'readonly');
    const store = tx.objectStore('dayEntries');
    const request = store.get(dateStr);

    request.onsuccess = () => {
      const record = request.result || {
        date: dateStr,
        rained: false,
        notes: '',
      };
      resolve(record);
    };

    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Retrieves day entries in [startDate, endDate] with a single range query
 * on the date keyPath (same pattern as getCompletionsForDateRange).
 *
 * @param {string} [startDateStr] – "YYYY-MM-DD"
 * @param {string} [endDateStr] – "YYYY-MM-DD"
 * @returns {Promise<Array<{ date: string, rained: boolean, notes: string }>>}
 */
export async function getDayEntriesForDateRange(startDateStr, endDateStr) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dayEntries', 'readonly');
    const store = tx.objectStore('dayEntries');

    let request;
    if (startDateStr && endDateStr) {
      request = store.getAll(IDBKeyRange.bound(startDateStr, endDateStr));
    } else {
      request = store.getAll();
    }

    request.onsuccess = () => {
      resolve(request.result || []);
    };
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Sets the rained toggle for a specific day.
 * @param {string} dateStr – "YYYY-MM-DD"
 * @param {boolean} rained
 * @returns {Promise<void>}
 */
export async function setDayRained(dateStr, rained) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dayEntries', 'readwrite');
    const store = tx.objectStore('dayEntries');
    const getReq = store.get(dateStr);

    getReq.onsuccess = () => {
      const existing = getReq.result || { date: dateStr, rained: false, notes: '' };
      existing.rained = Boolean(rained);
      store.put(existing);
    };

    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Sets notes for a specific day.
 * @param {string} dateStr – "YYYY-MM-DD"
 * @param {string} notes
 * @returns {Promise<void>}
 */
export async function setDayNotes(dateStr, notes) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dayEntries', 'readwrite');
    const store = tx.objectStore('dayEntries');
    const getReq = store.get(dateStr);

    getReq.onsuccess = () => {
      const existing = getReq.result || { date: dateStr, rained: false, notes: '' };
      existing.notes = String(notes || '');
      store.put(existing);
    };

    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(event.target.error);
  });
}

/* ─────────────────────────────────────────────────────────────
   COMPLETIONS (RF04, RF05)
   ───────────────────────────────────────────────────────────── */

/**
 * Retrieves completion records with full details for a given date.
 * @param {string} dateStr – "YYYY-MM-DD"
 * @returns {Promise<Array<{ id: string, date: string, activityId: string, completedAt?: number, optionIds?: string[] }>>}
 */
export async function getCompletionsWithDetailsForDate(dateStr) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('completions', 'readonly');
    const store = tx.objectStore('completions');
    const index = store.index('date');
    const request = index.getAll(IDBKeyRange.only(dateStr));

    request.onsuccess = () => {
      const records = (request.result || []).map((r) => ({
        ...r,
        status: r.status || 'done',
        wasPlanned: Boolean(r.wasPlanned),
        optionIds: Array.isArray(r.optionIds)
          ? r.optionIds
          : Array.isArray(r.muscleGroupIds)
          ? r.muscleGroupIds
          : [],
        note: typeof r.note === 'string' ? r.note : '',
      }));
      resolve(records);
    };
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Retrieves the list of completed activity IDs for a given date (YYYY-MM-DD).
 * @param {string} dateStr – "YYYY-MM-DD"
 * @returns {Promise<string[]>}
 */
export async function getCompletionsForDate(dateStr) {
  const records = await getCompletionsWithDetailsForDate(dateStr);
  return records.filter((r) => (r.status || 'done') === 'done').map((r) => r.activityId);
}

/**
 * Saves a full completion record (insert or update).
 * Preserves status ('planned' | 'done' | 'missed') and wasPlanned.
 *
 * @param {object} record
 * @returns {Promise<object>}
 */
export async function saveCompletion(record) {
  if (!record || !record.date || !record.activityId) {
    throw new Error('date e activityId são obrigatórios no registro de completion');
  }
  const db = await getDB();
  const id = record.id || `${record.date}:${record.activityId}`;
  const toSave = {
    ...record,
    id,
    status: record.status || 'done',
    wasPlanned: Boolean(record.wasPlanned),
    optionIds: Array.isArray(record.optionIds) ? record.optionIds : [],
    note: typeof record.note === 'string' ? record.note.trim().slice(0, 500) : '',
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('completions', 'readwrite');
    const store = tx.objectStore('completions');
    store.put(toSave);
    tx.oncomplete = () => resolve(toSave);
    tx.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Deletes a completion record by date and activityId.
 *
 * @param {string} dateStr – "YYYY-MM-DD"
 * @param {string} activityId
 * @returns {Promise<void>}
 */
export async function deleteCompletion(dateStr, activityId) {
  const db = await getDB();
  const id = `${dateStr}:${activityId}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction('completions', 'readwrite');
    const store = tx.objectStore('completions');
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Sets or unsets completion for an activity on a specific date.
 * If unchecking (completed=false), clears the completion.
 *
 * @param {string} dateStr – "YYYY-MM-DD"
 * @param {string} activityId
 * @param {boolean} completed
 * @param {string[]} [optionIds=[]]
 * @returns {Promise<void>}
 */
export async function setCompletion(dateStr, activityId, completed, optionIds = []) {
  const db = await getDB();
  const id = `${dateStr}:${activityId}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction('completions', 'readwrite');
    const store = tx.objectStore('completions');

    if (completed) {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const existing = getReq.result;
        store.put({
          id,
          date: dateStr,
          activityId,
          status: 'done',
          wasPlanned: existing ? Boolean(existing.wasPlanned) : false,
          completedAt: Date.now(),
          optionIds: Array.isArray(optionIds) ? optionIds : [],
          note: existing ? (existing.note || '') : '',
        });
      };
    } else {
      store.delete(id);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Sets the note for a completion entry.
 * @param {string} dateStr
 * @param {string} activityId
 * @param {string} note
 * @returns {Promise<string>}
 */
export async function setCompletionNote(dateStr, activityId, note) {
  const db = await getDB();
  const id = `${dateStr}:${activityId}`;
  const sanitized = typeof note === 'string' ? note.trim().slice(0, 500) : '';

  return new Promise((resolve, reject) => {
    const tx = db.transaction('completions', 'readwrite');
    const store = tx.objectStore('completions');
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) {
        resolve('');
        return;
      }
      existing.note = sanitized;
      store.put(existing);
    };

    tx.oncomplete = () => resolve(sanitized);
    tx.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Updates selected optionIds for an activity completion on a date.
 * @param {string} dateStr – "YYYY-MM-DD"
 * @param {string} activityId
 * @param {string[]} optionIds
 * @returns {Promise<void>}
 */
export async function setCompletionOptionIds(dateStr, activityId, optionIds = []) {
  const db = await getDB();
  const id = `${dateStr}:${activityId}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction('completions', 'readwrite');
    const store = tx.objectStore('completions');
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const record = getReq.result;
      if (!record) return;
      record.optionIds = Array.isArray(optionIds) ? optionIds : [];
      store.put(record);
    };

    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(event.target.error);
  });
}

export const setCompletionMuscleGroups = setCompletionOptionIds;

/**
 * Retrieves all completion records within the [startDate, endDate] range using
 * a single IndexedDB range query on the 'date' index.
 * Returns array of completion records ({ id, date, activityId, completedAt, optionIds }).
 *
 * @param {string} [startDateStr] – "YYYY-MM-DD"
 * @param {string} [endDateStr] – "YYYY-MM-DD"
 * @returns {Promise<Array<{ id: string, date: string, activityId: string, completedAt?: number, optionIds?: string[] }>>}
 */
export async function getCompletionsForDateRange(startDateStr, endDateStr) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('completions', 'readonly');
    const store = tx.objectStore('completions');
    const index = store.index('date');

    let request;
    if (startDateStr && endDateStr) {
      request = index.getAll(IDBKeyRange.bound(startDateStr, endDateStr));
    } else {
      request = store.getAll();
    }

    request.onsuccess = () => {
      const records = (request.result || []).map((r) => ({
        ...r,
        status: r.status || 'done',
        wasPlanned: Boolean(r.wasPlanned),
        optionIds: Array.isArray(r.optionIds)
          ? r.optionIds
          : Array.isArray(r.muscleGroupIds)
          ? r.muscleGroupIds
          : [],
        note: typeof r.note === 'string' ? r.note : '',
      }));
      resolve(records);
    };

    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Retrieves a Set of all date strings (YYYY-MM-DD) that have at least one completion
 * within the optional [startDate, endDate] range.
 * @param {string} [startDateStr]
 * @param {string} [endDateStr]
 * @returns {Promise<Set<string>>}
 */
export async function getDatesWithCompletions(startDateStr, endDateStr) {
  const records = await getCompletionsForDateRange(startDateStr, endDateStr);
  return extractCompletedDates(records);
}
