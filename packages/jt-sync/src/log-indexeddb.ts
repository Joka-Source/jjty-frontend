import type { LogEntry, LogStore } from "./log.js";

interface IndexedDbLogStoreOptions {
  indexedDB?: IDBFactory;
  databaseName?: string;
  deviceId: string;
}

interface StoredLogEntry extends LogEntry {
  key: string;
  deviceId: string;
}

const STORE_NAME = "momentLog";

/** Browser-backed append-only delivery evidence, partitioned by device. */
export class IndexedDbLogStore implements LogStore {
  private readonly factory: IDBFactory;
  private readonly databaseName: string;
  private readonly deviceId: string;
  private database?: Promise<IDBDatabase>;

  constructor(options: IndexedDbLogStoreOptions) {
    this.factory = options.indexedDB ?? globalThis.indexedDB;
    this.databaseName = options.databaseName ?? "jt-sync";
    this.deviceId = options.deviceId;
    if (!this.factory) throw new TypeError("IndexedDB is required for the browser moment log.");
    if (!this.deviceId) throw new TypeError("A device identity is required for the browser moment log.");
  }

  async append(entry: LogEntry): Promise<void> {
    const database = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).add({
        ...entry,
        key: this.key(entry.logSeq),
        deviceId: this.deviceId,
      } satisfies StoredLogEntry);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async readAll(): Promise<LogEntry[]> {
    const database = await this.open();
    const rows = await new Promise<StoredLogEntry[]>((resolve, reject) => {
      const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result as StoredLogEntry[]);
      request.onerror = () => reject(request.error);
    });
    return rows
      .filter((row) => row.deviceId === this.deviceId)
      .sort((left, right) => left.logSeq - right.logSeq)
      .map(({ key: _key, deviceId: _deviceId, ...entry }) => entry);
  }

  async nextSeq(): Promise<number> {
    const entries = await this.readAll();
    return entries.length === 0 ? 0 : entries[entries.length - 1].logSeq + 1;
  }

  private key(logSeq: number): string {
    return `${this.deviceId}:${String(logSeq).padStart(12, "0")}`;
  }

  private open(): Promise<IDBDatabase> {
    if (!this.database) {
      this.database = new Promise((resolve, reject) => {
        const request = this.factory.open(this.databaseName, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) {
            request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return this.database;
  }
}
