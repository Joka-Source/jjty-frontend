import { validateTapEvent, type Tap, type TapEvent } from "./tap.ts";

export function parseJsonl(text: string): TapEvent[] {
  const events: TapEvent[] = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      throw new SyntaxError(`Line ${index + 1} is not JSON: ${(error as Error).message}`);
    }
    const checked = validateTapEvent(value);
    if (!checked.ok) throw new TypeError(`Line ${index + 1} is not a tap event: ${checked.errors.join("; ")}`);
    events.push(checked.event);
  }
  for (let index = 1; index < events.length; index++) {
    if (events[index].sessionId !== events[0].sessionId) throw new TypeError(`Line ${index + 1} belongs to another session`);
    if (events[index].seq <= events[index - 1].seq) throw new TypeError(`Line ${index + 1} does not increase seq`);
  }
  return events;
}

export type OutcomeDiff = {
  path: string;
  expected?: unknown;
  actual?: unknown;
  kind: "changed" | "missing" | "extra";
};

function joinPath(base: string, key: string | number): string {
  return typeof key === "number" ? `${base}[${key}]` : `${base}.${key}`;
}

export function diffOutcome(expected: unknown, actual: unknown, path = "$", found: OutcomeDiff[] = []): OutcomeDiff[] {
  if (Object.is(expected, actual)) return found;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const length = Math.max(expected.length, actual.length);
    for (let index = 0; index < length; index++) {
      if (index >= expected.length) found.push({ path: joinPath(path, index), actual: actual[index], kind: "extra" });
      else if (index >= actual.length) found.push({ path: joinPath(path, index), expected: expected[index], kind: "missing" });
      else diffOutcome(expected[index], actual[index], joinPath(path, index), found);
    }
    return found;
  }
  if (expected && actual && typeof expected === "object" && typeof actual === "object" && !Array.isArray(expected) && !Array.isArray(actual)) {
    const expectedRecord = expected as Record<string, unknown>;
    const actualRecord = actual as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(expectedRecord), ...Object.keys(actualRecord)])].sort();
    for (const key of keys) {
      if (!(key in expectedRecord)) found.push({ path: joinPath(path, key), actual: actualRecord[key], kind: "extra" });
      else if (!(key in actualRecord)) found.push({ path: joinPath(path, key), expected: expectedRecord[key], kind: "missing" });
      else diffOutcome(expectedRecord[key], actualRecord[key], joinPath(path, key), found);
    }
    return found;
  }
  found.push({ path, expected, actual, kind: "changed" });
  return found;
}

export type Recorder = {
  start(): void;
  stop(): void;
  clear(): void;
  events(): readonly TapEvent[];
  toJSONL(): string;
  readonly recording: boolean;
};

export function createRecorder(tap: Tap, onCapture?: (event: TapEvent) => void): Recorder {
  let captured: TapEvent[] = [];
  let unsubscribe: (() => void) | null = null;
  const recorder: Recorder = {
    start() {
      if (unsubscribe) return;
      unsubscribe = tap.subscribe((event) => {
        captured.push(event);
        onCapture?.(event);
      });
    },
    stop() {
      unsubscribe?.();
      unsubscribe = null;
    },
    clear() {
      captured = [];
    },
    events: () => captured.slice(),
    toJSONL: () => captured.map((event) => JSON.stringify(event)).join("\n") + (captured.length ? "\n" : ""),
    get recording() {
      return unsubscribe !== null;
    },
  };
  return recorder;
}
