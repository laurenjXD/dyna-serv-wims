import type { OfflineQueueEnvelope } from "./index";

const DATABASE_NAME = "dyna-serv-wims-offline";
const DATABASE_VERSION = 1;
const OUTBOX_STORE = "outbox";
const CACHE_STORE = "offline_cache";
const SYNC_LOG_STORE = "sync_log";

export type OfflineStorageErrorCode = "offline_storage_unavailable" | "offline_storage_failed";

function indexedDb(): IDBFactory {
  const value = (globalThis as typeof globalThis & { indexedDB?: IDBFactory }).indexedDB;
  if (!value) throw new Error("offline_storage_unavailable");
  return value;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDb().open(DATABASE_NAME, DATABASE_VERSION);
    } catch {
      reject(new Error("offline_storage_unavailable"));
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      const outbox = database.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
      outbox.createIndex("status", "status", { unique: false });
      outbox.createIndex("createdAt", "createdAt", { unique: false });
      outbox.createIndex("orderingKey", "orderingKey", { unique: false });
      outbox.createIndex("capturedByUserId", "capturedByUserId", { unique: false });
      database.createObjectStore(CACHE_STORE, { keyPath: "key" });
      database.createObjectStore(SYNC_LOG_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("offline_storage_failed"));
    request.onblocked = () => reject(new Error("offline_storage_failed"));
  });
}

function transact<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("offline_storage_failed"));
    transaction.onabort = () => reject(new Error("offline_storage_failed"));
    transaction.oncomplete = () => database.close();
  }));
}

export async function enqueueOfflineEntry(entry: OfflineQueueEnvelope, orderingKey: string): Promise<void> {
  await transact(OUTBOX_STORE, "readwrite", (store) => store.add({ ...entry, orderingKey }));
}

export async function listPendingOfflineEntries(capturedByUserId?: string): Promise<OfflineQueueEnvelope[]> {
  const rows = await transact<OfflineQueueEnvelope[]>(OUTBOX_STORE, "readonly", (store) =>
    capturedByUserId === undefined
      ? store.getAll()
      : store.index("capturedByUserId").getAll(capturedByUserId),
  );
  // A tab can close after marking an entry syncing. Treat that state as
  // resumable work on the next startup rather than stranding the scan.
  return rows.filter((row) => row.status === "pending" || row.status === "failed" || row.status === "syncing");
}

export async function listOfflineEntries(): Promise<OfflineQueueEnvelope[]> {
  return transact<OfflineQueueEnvelope[]>(OUTBOX_STORE, "readonly", (store) => store.getAll());
}

export async function updateOfflineEntry(entry: OfflineQueueEnvelope): Promise<void> {
  await transact(OUTBOX_STORE, "readwrite", (store) => store.put(entry));
}

export async function deleteOfflineEntry(id: string): Promise<void> {
  await transact(OUTBOX_STORE, "readwrite", (store) => store.delete(id));
}

export async function putOfflineCache(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) throw new Error("invalid_cache_ttl");
  await transact(CACHE_STORE, "readwrite", (store) => store.put({ key, value, cachedAt: Date.now(), expiresAt: Date.now() + ttlSeconds * 1000 }));
}

export async function getOfflineCache<T>(key: string): Promise<{ value: T; stale: boolean } | null> {
  const row = await transact<{ value: T; expiresAt: number } | undefined>(CACHE_STORE, "readonly", (store) => store.get(key));
  if (!row) return null;
  return { value: row.value, stale: row.expiresAt <= Date.now() };
}

export async function clearExpiredOfflineData(now = Date.now()): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([OUTBOX_STORE, CACHE_STORE], "readwrite");
    const outbox = transaction.objectStore(OUTBOX_STORE);
    const cache = transaction.objectStore(CACHE_STORE);
    for (const store of [outbox, cache]) {
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const value = cursor.value as { createdAt?: number; cachedAt?: number; status?: string };
        const age = now - (value.createdAt ?? value.cachedAt ?? now);
        const maxAge = value.status === "pending" || value.cachedAt !== undefined
          ? 7 * 86400000
          : 30 * 86400000;
        if (age > maxAge) cursor.delete();
        cursor.continue();
      };
      request.onerror = () => reject(new Error("offline_storage_failed"));
    }
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => reject(new Error("offline_storage_failed"));
  });
}
