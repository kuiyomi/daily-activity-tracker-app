/**
 * storage.js – IndexedDB storage layer for Dad's Calendar.
 * Pure async API, completely decoupled from the UI.
 */

import {
  validateActivity,
  createDefaultActivity,
  extractCompletedDates,
} from '../logic/activityLogic.js';

const DB_NAME = 'DadsCalendarDB';
const DB_VERSION = 1;

let dbPromise = null;

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

      // Activities store: keyPath = id
      if (!db.objectStoreNames.contains('activities')) {
        db.createObjectStore('activities', { keyPath: 'id' });
      }

      // Completions store: keyPath = id ("YYYY-MM-DD:activityId")
      if (!db.objectStoreNames.contains('completions')) {
        const compStore = db.createObjectStore('completions', { keyPath: 'id' });
        compStore.createIndex('date', 'date', { unique: false });
        compStore.createIndex('activityId', 'activityId', { unique: false });
      }
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
 * Retrieves a single activity by ID.
 * @param {string} id
 * @returns {Promise<object | null>}
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
 * Saves (creates or updates) an activity.
 * Validates data before persisting.
 * @param {object} activity
 * @returns {Promise<object>} the sanitized saved activity
 */
export async function saveActivity(activity) {
  const validation = validateActivity(activity);
  if (!validation.valid) {
    throw new Error(validation.errors.join('; '));
  }

  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('activities', 'readwrite');
    const store = tx.objectStore('activities');
    const request = store.put(validation.sanitized);

    request.onsuccess = () => resolve(validation.sanitized);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Deletes an activity and its associated completions.
 * @param {string} activityId
 * @returns {Promise<void>}
 */
export async function deleteActivity(activityId) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['activities', 'completions'], 'readwrite');
    const actStore = tx.objectStore('activities');
    const compStore = tx.objectStore('completions');

    actStore.delete(activityId);

    // Delete related completions using the activityId index
    const actIndex = compStore.index('activityId');
    const req = actIndex.openCursor(IDBKeyRange.only(activityId));

    req.onsuccess = (event) => {
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

/**
 * Retrieves the list of completed activity IDs for a given date (YYYY-MM-DD).
 * @param {string} dateStr – "YYYY-MM-DD"
 * @returns {Promise<string[]>}
 */
export async function getCompletionsForDate(dateStr) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('completions', 'readonly');
    const store = tx.objectStore('completions');
    const index = store.index('date');
    const request = index.getAll(IDBKeyRange.only(dateStr));

    request.onsuccess = () => {
      const results = request.result || [];
      const activityIds = results.map((r) => r.activityId);
      resolve(activityIds);
    };

    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Sets or unsets completion for an activity on a specific date.
 * @param {string} dateStr – "YYYY-MM-DD"
 * @param {string} activityId
 * @param {boolean} completed
 * @returns {Promise<void>}
 */
export async function setCompletion(dateStr, activityId, completed) {
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
        muscleGroupIds: [],
      });
    } else {
      store.delete(id);
    }

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
 * @returns {Promise<Array<{ id: string, date: string, activityId: string, completedAt?: number }>>}
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
