/**
 * JSON-lines log store with single-writer discipline (node side only —
 * never imported by the browser-safe client library).
 *
 * Single-writer: an exclusive lock file created with O_EXCL ('wx'). A second
 * writer on the same log path fails fast instead of interleaving writes.
 */

import { appendFileSync, closeSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import type { LogEntry, LogStore } from "./log.js";

export class SingleWriterViolation extends Error {}

export class FileLogStore implements LogStore {
  private lockFd: number;
  private count: number;

  constructor(private readonly path: string) {
    const lockPath = path + ".lock";
    try {
      this.lockFd = openSync(lockPath, "wx");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") {
        throw new SingleWriterViolation(
          `log ${path} already has a writer (lock ${lockPath} exists)`,
        );
      }
      throw err;
    }
    writeSync(this.lockFd, String(process.pid));
    this.count = this.readAllSync().length;
  }

  private readAllSync(): LogEntry[] {
    let text = "";
    try {
      text = readFileSync(this.path, "utf8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    return text
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as LogEntry);
  }

  async append(entry: LogEntry): Promise<void> {
    appendFileSync(this.path, JSON.stringify(entry) + "\n");
    this.count += 1;
  }

  async readAll(): Promise<LogEntry[]> {
    return this.readAllSync();
  }

  async nextSeq(): Promise<number> {
    return this.count;
  }

  close(): void {
    closeSync(this.lockFd);
    try {
      unlinkSync(this.path + ".lock");
    } catch {
      /* already gone */
    }
  }
}
