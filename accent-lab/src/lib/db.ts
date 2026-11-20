// Minimal IndexedDB key-value storage with a localStorage fallback.

const DB_NAME = 'accent-lab';
const STORES = ['kv', 'blobs'] as const;
type StoreName = typeof STORES[number];

let dbp: Promise<IDBDatabase | null> | null = null;
function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise(resolve => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}

export async function get<T>(key: string, store: StoreName = 'kv'): Promise<T | undefined> {
  const db = await open();
  if (!db) { try { const v = localStorage.getItem(`${store}:${key}`); return v ? JSON.parse(v) : undefined; } catch { return undefined; } }
  return new Promise(resolve => {
    try {
      const r = db.transaction(store).objectStore(store).get(key);
      r.onsuccess = () => resolve(r.result as T);
      r.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  });
}

export async function set(key: string, value: unknown, store: StoreName = 'kv'): Promise<void> {
  const db = await open();
  if (!db) { if (store === 'kv') { try { localStorage.setItem(`${store}:${key}`, JSON.stringify(value)); } catch { /* storage full */ } } return; }
  return new Promise(resolve => {
    try {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  });
}

export async function del(key: string, store: StoreName = 'kv'): Promise<void> {
  const db = await open();
  if (!db) { try { localStorage.removeItem(`${store}:${key}`); } catch { /* ignore */ } return; }
  return new Promise(resolve => {
    try { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key); tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); } catch { resolve(); }
  });
}

export async function clearAll(): Promise<void> {
  const db = await open();
  if (db) for (const s of STORES) await new Promise<void>(r => { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).clear(); tx.oncomplete = () => r(); tx.onerror = () => r(); });
  try { Object.keys(localStorage).filter(k => k.startsWith('kv:')).forEach(k => localStorage.removeItem(k)); } catch { /* ignore */ }
}

/** Ask the browser to keep this site's data (helps on iPhone home-screen apps). */
export async function persist() { try { await navigator.storage?.persist?.(); } catch { /* not supported */ } }
