import type { Moment } from "./envelope.js";

export interface PendingMoment {
  id: string;
  createdAt: string;
  attemptCount: number;
  lastError: string | null;
  moment: Omit<Moment, "transport"> & { transport?: Partial<Moment["transport"]> };
}

interface StoredPendingMoment extends PendingMoment {
  key: string;
  deviceId: string;
}

interface IndexedDbOutboxStoreOptions {
  indexedDB?: IDBFactory;
  databaseName?: string;
  deviceId: string;
}

const STORE_NAME = "momentOutbox";

/** Durable at-least-once send intent, separate from append-only delivery evidence. */
export class IndexedDbOutboxStore {
  private readonly factory: IDBFactory;
  private readonly databaseName: string;
  private readonly deviceId: string;
  private database?: Promise<IDBDatabase>;

  constructor(options: IndexedDbOutboxStoreOptions) {
    this.factory = options.indexedDB ?? globalThis.indexedDB;
    this.databaseName = options.databaseName ?? "jt-sync-outbox";
    this.deviceId = options.deviceId;
    if (!this.factory) throw new TypeError("IndexedDB is required for the browser moment outbox.");
    if (!this.deviceId) throw new TypeError("A device identity is required for the browser moment outbox.");
  }

  async put(entry: PendingMoment): Promise<void> {
    await this.write("put", { ...entry, key: this.key(entry.id), deviceId: this.deviceId });
  }

  async recordFailure(id: string, error: string): Promise<void> {
    const entry = (await this.readAll()).find((candidate) => candidate.id === id);
    if (!entry) return;
    await this.put({ ...entry, attemptCount: entry.attemptCount + 1, lastError: error });
  }

  async remove(id: string): Promise<void> { await this.write("delete", this.key(id)); }

  async replaceAll(entries: PendingMoment[]): Promise<void> {
    const database = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const keys = store.getAllKeys();
      keys.onsuccess = () => {
        for (const key of keys.result) {
          if (String(key).startsWith(`${this.deviceId}:`)) store.delete(key);
        }
        for (const entry of entries) store.put({ ...entry, key: this.key(entry.id), deviceId: this.deviceId });
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async readAll(): Promise<PendingMoment[]> {
    const database = await this.open();
    const rows = await new Promise<StoredPendingMoment[]>((resolve, reject) => {
      const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result as StoredPendingMoment[]);
      request.onerror = () => reject(request.error);
    });
    return rows.filter((row) => row.deviceId === this.deviceId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(({ key: _key, deviceId: _deviceId, ...entry }) => entry);
  }

  private key(id: string): string { return `${this.deviceId}:${id}`; }

  private async write(action: "put" | "delete", value: StoredPendingMoment | string): Promise<void> {
    const database = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      if (action === "put") store.put(value as StoredPendingMoment); else store.delete(value as string);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  private open(): Promise<IDBDatabase> {
    if (!this.database) this.database = new Promise((resolve, reject) => {
      const request = this.factory.open(this.databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.database;
  }
}
