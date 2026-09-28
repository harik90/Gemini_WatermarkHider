/**
 * IndexedDB session persistence.
 * Persists the current queue across accidental tab reloads without storing data on a server.
 */

const DB_NAME = 'clearmark_session_db';
const DB_VERSION = 1;
const STORE_NAME = 'queue_items';

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSessionFile(item) {
  try {
    const db = await openDB();
    if (!db) return;

    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // Save serializable properties
    const record = {
      id: item.id,
      name: item.name,
      size: item.size,
      type: item.type,
      status: item.status,
      progress: item.progress,
      isVideo: item.isVideo,
      confidence: item.confidence,
      width: item.width,
      height: item.height,
      outputSize: item.outputSize,
      fileBlob: item.file instanceof Blob ? item.file : null,
      resultBlob: item.blob instanceof Blob ? item.blob : null,
      updatedAt: Date.now(),
    };

    store.put(record);
  } catch (err) {
    console.warn('Failed to save to IndexedDB session:', err);
  }
}

export async function loadSessionFiles() {
  try {
    const db = await openDB();
    if (!db) return [];

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const records = req.result || [];
        resolve(records);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function removeSessionFile(id) {
  try {
    const db = await openDB();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
  } catch (err) {
    console.warn('Failed to remove from IndexedDB session:', err);
  }
}

export async function clearSessionDB() {
  try {
    const db = await openDB();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
  } catch (err) {
    console.warn('Failed to clear IndexedDB session:', err);
  }
}
