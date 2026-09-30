// Minimal promise wrapper around IndexedDB with an in-memory fallback, so the toy
// still works (without persistence) where storage is blocked (private browsing).

export type StoreName = 'projects' | 'samples' | 'kv';

const DB_NAME = 'monster-synth';
const DB_VERSION = 1;
const STORES: StoreName[] = ['projects', 'samples', 'kv'];

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, unknown>();

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        if (!db) return reject(new Error('no-idb'));
        const tx = db.transaction(store, mode);
        const req = op(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result as T);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

const memKey = (store: StoreName, key: string) => `${store}:${key}`;

export async function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  try {
    return await run<T | undefined>(store, 'readonly', (s) => s.get(key));
  } catch {
    return memory.get(memKey(store, key)) as T | undefined;
  }
}

export async function idbPut(store: StoreName, key: string, value: unknown): Promise<void> {
  try {
    await run(store, 'readwrite', (s) => s.put(value, key));
  } catch {
    memory.set(memKey(store, key), value);
  }
}

export async function idbDelete(store: StoreName, key: string): Promise<void> {
  try {
    await run(store, 'readwrite', (s) => s.delete(key));
  } catch {
    memory.delete(memKey(store, key));
  }
}

export async function idbKeys(store: StoreName): Promise<string[]> {
  try {
    const keys = await run<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys());
    return keys.map(String);
  } catch {
    const prefix = `${store}:`;
    return [...memory.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
  }
}

/** Ask the browser not to evict the kids' songs under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
