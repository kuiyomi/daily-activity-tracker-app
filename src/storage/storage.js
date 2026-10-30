/**
 * storage.js – IndexedDB storage layer for Dad's Calendar / Agenda.
 * Pure async API, completely decoupled from the UI.
 * Schema v2: activities, completions, muscleGroups, dayEntries.
 */

import {
  validateActivity,
  createDefaultActivity,
  extractCompletedDates,
} from '../logic/activityLogic.js';

export const DB_NAME = 'DadsCalendarDB';
export const DB_VERSION = 2;

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
      const oldVersion = event.oldVersion || 0;

      // Existing object stores are never deleted, so v1 data survives the bump.
      if (!db.objectStoreNames.contains('activities')) {
        db.createObjectStore('activities', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('completions')) {
        const compStore = db.createObjectStore('completions', { keyPath: 'id' });
        compStore.createIndex('date', 'date', { unique: false });
        compStore.createIndex('activityId', 'activityId', { unique: false });
      }

      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains('muscleGroups')) {
          db.createObjectStore('muscleGroups', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('dayEntries')) {
          db.createObjectStore('dayEntries', { keyPath: 'date' });
        }
      }
    };

    request.onsuccess = async (event) => {
      const db = event.target.result;
      try {
        await Promise.all([
          seedDefaultActivityIfNeeded(db),
          seedDefaultMuscleGroupsIfNeeded(db),
        ]);
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

/**
 * Seeds default muscle groups if none exist.
 * @param {IDBDatabase} db
 * @returns {Promise<void>}
 */
function seedDefaultMuscleGroupsIfNeeded(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('muscleGroups', 'readwrite');
    const store = tx.objectStore('muscleGroups');
    const countReq = store.count();

    countReq.onsuccess = () => {
      if (countReq.result === 0) {
        DEFAULT_MUSCLE_GROUPS.forEach((name, index) => {
          const slug = muscleGroupSlug(name);
          store.put({
            id: `mg_${slug}`,
            name,
            archived: false,
            order: index,
            createdAt: Date.now() + index,
          });
        });
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
   MUSCLE GROUPS (RF05)
   ───────────────────────────────────────────────────────────── */

/**
 * Retrieves muscle groups.
 * @param {boolean} [includeArchived=false]
 * @returns {Promise<Array<{ id: string, name: string, archived: boolean, order?: number, createdAt?: number }>>}
 */
export async function getMuscleGroups(includeArchived = false) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('muscleGroups', 'readonly');
    const store = tx.objectStore('muscleGroups');
    const request = store.getAll();

    request.onsuccess = () => {
      let list = request.result || [];
      if (!includeArchived) {
        list = list.filter((g) => !g.archived);
      }
      list.sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) {
          return a.order - b.order;
        }
        return (a.createdAt || 0) - (b.createdAt || 0);
      });
      resolve(list);
    };

    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Saves a muscle group (create or update name/order).
 * @param {{ id?: string, name: string, archived?: boolean, order?: number }} group
 * @returns {Promise<{ id: string, name: string, archived: boolean }>}
 */
export async function saveMuscleGroup(group) {
  if (!group || !group.name || !group.name.trim()) {
    throw new Error('Nome do grupo muscular não pode ser vazio.');
  }

  const db = await getDB();
  const trimmedName = group.name.trim();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('muscleGroups', 'readwrite');
    const store = tx.objectStore('muscleGroups');

    const putRecord = (record) => {
      const request = store.put(record);
      request.onsuccess = () => resolve(record);
    };

    if (group.id) {
      const getReq = store.get(group.id);
      getReq.onsuccess = () => {
        const existing = getReq.result;
        putRecord({
          id: group.id,
          name: trimmedName,
          archived:
            group.archived !== undefined
              ? Boolean(group.archived)
              : Boolean(existing?.archived),
          order:
            typeof group.order === 'number'
              ? group.order
              : existing?.order ?? Date.now(),
          createdAt: existing?.createdAt || group.createdAt || Date.now(),
        });
      };
    } else {
      putRecord({
        id: `mg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: trimmedName,
        archived: Boolean(group.archived),
        order: typeof group.order === 'number' ? group.order : Date.now(),
        createdAt: group.createdAt || Date.now(),
      });
    }

    tx.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Marks a muscle group as archived so it disappears from new selections
 * while preserving its presence in history.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function archiveMuscleGroup(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('muscleGroups', 'readwrite');
    const store = tx.objectStore('muscleGroups');
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const record = getReq.result;
      if (!record) return resolve();
      record.archived = true;
      store.put(record);
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
 * @returns {Promise<Array<{ id: string, date: string, activityId: string, completedAt?: number, muscleGroupIds?: string[] }>>}
 */
export async function getCompletionsWithDetailsForDate(dateStr) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('completions', 'readonly');
    const store = tx.objectStore('completions');
    const index = store.index('date');
    const request = index.getAll(IDBKeyRange.only(dateStr));

    request.onsuccess = () => resolve(request.result || []);
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
  return records.map((r) => r.activityId);
}

/**
 * Sets or unsets completion for an activity on a specific date.
 * If unchecking (completed=false), clears the completion.
 *
 * @param {string} dateStr – "YYYY-MM-DD"
 * @param {string} activityId
 * @param {boolean} completed
 * @param {string[]} [muscleGroupIds=[]]
 * @returns {Promise<void>}
 */
export async function setCompletion(dateStr, activityId, completed, muscleGroupIds = []) {
  const db = await getDB();
  const id = `${dateStr}:${activityId}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction('completions', 'readwrite');
    const store = tx.objectStore('completions');

    if (completed) {
      store.put({
        id,
        date: dateStr,
        activityId,
        completedAt: Date.now(),
        muscleGroupIds: Array.isArray(muscleGroupIds) ? muscleGroupIds : [],
      });
    } else {
      store.delete(id);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Updates selected muscleGroupIds for an activity completion on a date.
 * @param {string} dateStr – "YYYY-MM-DD"
 * @param {string} activityId
 * @param {string[]} muscleGroupIds
 * @returns {Promise<void>}
 */
export async function setCompletionMuscleGroups(dateStr, activityId, muscleGroupIds = []) {
  const db = await getDB();
  const id = `${dateStr}:${activityId}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction('completions', 'readwrite');
    const store = tx.objectStore('completions');
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const record = getReq.result;
      if (!record) return;
      record.muscleGroupIds = Array.isArray(muscleGroupIds) ? muscleGroupIds : [];
      store.put(record);
    };

    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Retrieves all completion records within the [startDate, endDate] range using
 * a single IndexedDB range query on the 'date' index.
 * Returns array of completion records ({ id, date, activityId, completedAt, muscleGroupIds }).
 *
 * @param {string} [startDateStr] – "YYYY-MM-DD"
 * @param {string} [endDateStr] – "YYYY-MM-DD"
 * @returns {Promise<Array<{ id: string, date: string, activityId: string, completedAt?: number, muscleGroupIds?: string[] }>>}
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
      resolve(request.result || []);
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
