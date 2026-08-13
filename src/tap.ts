export const TAP_VERSION = 1 as const;

export type TapEnvelope = {
  v: typeof TAP_VERSION;
  sessionId: string;
  eventId: string;
  seq: number;
  at: string;
};

export type TranscriptEvent = TapEnvelope & {
  kind: "transcriptEvent";
  text: string;
  final: boolean;
  source: "speech" | "typed" | "sim";
};

export type SegmentationDecision = TapEnvelope & {
  kind: "segmentationDecision";
  segmentText: string;
  classification: "reading" | "command" | "unresolved";
  confidence: number;
  reason: string;
};

export type MatchSpan = {
  start: number;
  end: number;
  score: number;
  unit: "token" | "character";
  text?: string;
};

export type MatchBlock = {
  blockId: string;
  blockIndex: number;
  score: number;
  spans: MatchSpan[];
};

export type MatchScores = TapEnvelope & {
  kind: "matchScores";
  query: string;
  blocks: MatchBlock[];
  selected?: {
    blockId: string;
    blockIndex: number;
    start: number;
    end: number;
    unit: "token" | "character";
  };
};

export type IntentResult = TapEnvelope & {
  kind: "intentResult";
  result: "reading" | "act" | "ask" | "handled" | "none";
  intent?: string;
  confidence?: number;
  ambiguities: Array<{ label: string; confidence: number }>;
  thresholds: { accept: number; askBelow: number; closeGap: number };
  reason: string;
};

export type ActCommitted = TapEnvelope & {
  kind: "actCommitted";
  act: string;
  input: string;
  target: {
    blockId: string;
    blockIndex: number;
    start?: number;
    end?: number;
    text?: string;
  };
};

export type RecordWritten = TapEnvelope & {
  kind: "recordWritten";
  record: Record<string, unknown>;
  schema: { name: string; valid: boolean | null; errors: string[] };
};

export type LatencyMark = TapEnvelope & {
  kind: "latencyMark";
  stage: string;
  durationMs: number;
  budgetMs: number;
};

export type TapEvent =
  | TranscriptEvent
  | SegmentationDecision
  | MatchScores
  | IntentResult
  | ActCommitted
  | RecordWritten
  | LatencyMark;

export type TapEventInput = TapEvent extends infer Event
  ? Event extends TapEvent
    ? Omit<Event, keyof TapEnvelope>
    : never
  : never;

export type ValidationResult =
  | { ok: true; event: TapEvent }
  | { ok: false; errors: string[] };

function objectAt(value: unknown, path: string, errors: string[]): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  return value as Record<string, unknown>;
}

function textAt(value: unknown, path: string, errors: string[]): value is string {
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${path} must be a non-empty string`);
    return false;
  }
  return true;
}

function numberAt(value: unknown, path: string, errors: string[], score = false): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${path} must be a finite number`);
    return false;
  }
  if (score && (value < 0 || value > 1)) {
    errors.push(`${path} must be between 0 and 1`);
    return false;
  }
  return true;
}

function integerAt(value: unknown, path: string, errors: string[], minimum = 0): value is number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    errors.push(`${path} must be an integer at least ${minimum}`);
    return false;
  }
  return true;
}

function stringListAt(value: unknown, path: string, errors: string[]): value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    errors.push(`${path} must be a list of strings`);
    return false;
  }
  return true;
}

function validateSpan(value: unknown, path: string, errors: string[]): void {
  const span = objectAt(value, path, errors);
  if (!span) return;
  integerAt(span.start, `${path}.start`, errors);
  integerAt(span.end, `${path}.end`, errors);
  if (typeof span.start === "number" && typeof span.end === "number" && span.end < span.start) {
    errors.push(`${path}.end must not come before start`);
  }
  numberAt(span.score, `${path}.score`, errors, true);
  if (!["token", "character"].includes(span.unit as string)) {
    errors.push(`${path}.unit must be token or character`);
  }
  if (span.text !== undefined && typeof span.text !== "string") errors.push(`${path}.text must be a string`);
}

function validateBlock(value: unknown, path: string, errors: string[]): void {
  const block = objectAt(value, path, errors);
  if (!block) return;
  textAt(block.blockId, `${path}.blockId`, errors);
  integerAt(block.blockIndex, `${path}.blockIndex`, errors);
  numberAt(block.score, `${path}.score`, errors, true);
  if (!Array.isArray(block.spans)) errors.push(`${path}.spans must be a list`);
  else block.spans.forEach((span, index) => validateSpan(span, `${path}.spans[${index}]`, errors));
}

export function validateTapEvent(value: unknown): ValidationResult {
  const errors: string[] = [];
  const event = objectAt(value, "event", errors);
  if (!event) return { ok: false, errors };

  if (event.v !== TAP_VERSION) errors.push(`v must be ${TAP_VERSION}`);
  textAt(event.sessionId, "sessionId", errors);
  textAt(event.eventId, "eventId", errors);
  integerAt(event.seq, "seq", errors, 1);
  if (
    !textAt(event.at, "at", errors) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(event.at as string) ||
    !Number.isFinite(Date.parse(event.at as string))
  ) {
    errors.push("at must be an ISO date and time");
  }
  textAt(event.kind, "kind", errors);

  switch (event.kind) {
    case "transcriptEvent":
      if (typeof event.text !== "string") errors.push("text must be a string");
      if (typeof event.final !== "boolean") errors.push("final must be true or false");
      if (!["speech", "typed", "sim"].includes(event.source as string)) {
        errors.push("source must be speech, typed, or sim");
      }
      break;
    case "segmentationDecision":
      if (typeof event.segmentText !== "string") errors.push("segmentText must be a string");
      if (!["reading", "command", "unresolved"].includes(event.classification as string)) {
        errors.push("classification must be reading, command, or unresolved");
      }
      numberAt(event.confidence, "confidence", errors, true);
      textAt(event.reason, "reason", errors);
      break;
    case "matchScores": {
      if (typeof event.query !== "string") errors.push("query must be a string");
      if (!Array.isArray(event.blocks)) errors.push("blocks must be a list");
      else event.blocks.forEach((block, index) => validateBlock(block, `blocks[${index}]`, errors));
      if (event.selected !== undefined) {
        const selected = objectAt(event.selected, "selected", errors);
        if (selected) {
          textAt(selected.blockId, "selected.blockId", errors);
          integerAt(selected.blockIndex, "selected.blockIndex", errors);
          integerAt(selected.start, "selected.start", errors);
          integerAt(selected.end, "selected.end", errors);
          if (!["token", "character"].includes(selected.unit as string)) {
            errors.push("selected.unit must be token or character");
          }
        }
      }
      break;
    }
    case "intentResult": {
      if (!["reading", "act", "ask", "handled", "none"].includes(event.result as string)) {
        errors.push("result must be reading, act, ask, handled, or none");
      }
      if (event.intent !== undefined && typeof event.intent !== "string") errors.push("intent must be a string");
      if (event.confidence !== undefined) numberAt(event.confidence, "confidence", errors, true);
      if (!Array.isArray(event.ambiguities)) errors.push("ambiguities must be a list");
      else event.ambiguities.forEach((item, index) => {
        const ambiguity = objectAt(item, `ambiguities[${index}]`, errors);
        if (!ambiguity) return;
        textAt(ambiguity.label, `ambiguities[${index}].label`, errors);
        numberAt(ambiguity.confidence, `ambiguities[${index}].confidence`, errors, true);
      });
      const thresholds = objectAt(event.thresholds, "thresholds", errors);
      if (thresholds) {
        numberAt(thresholds.accept, "thresholds.accept", errors, true);
        numberAt(thresholds.askBelow, "thresholds.askBelow", errors, true);
        numberAt(thresholds.closeGap, "thresholds.closeGap", errors, true);
      }
      textAt(event.reason, "reason", errors);
      break;
    }
    case "actCommitted": {
      textAt(event.act, "act", errors);
      if (typeof event.input !== "string") errors.push("input must be a string");
      const target = objectAt(event.target, "target", errors);
      if (target) {
        textAt(target.blockId, "target.blockId", errors);
        integerAt(target.blockIndex, "target.blockIndex", errors);
        if (target.start !== undefined) integerAt(target.start, "target.start", errors);
        if (target.end !== undefined) integerAt(target.end, "target.end", errors);
        if (target.text !== undefined && typeof target.text !== "string") errors.push("target.text must be a string");
      }
      break;
    }
    case "recordWritten": {
      objectAt(event.record, "record", errors);
      const schema = objectAt(event.schema, "schema", errors);
      if (schema) {
        textAt(schema.name, "schema.name", errors);
        if (schema.valid !== null && typeof schema.valid !== "boolean") errors.push("schema.valid must be true, false, or null");
        stringListAt(schema.errors, "schema.errors", errors);
      }
      break;
    }
    case "latencyMark":
      textAt(event.stage, "stage", errors);
      numberAt(event.durationMs, "durationMs", errors);
      numberAt(event.budgetMs, "budgetMs", errors);
      if (typeof event.durationMs === "number" && event.durationMs < 0) errors.push("durationMs must not be negative");
      if (typeof event.budgetMs === "number" && event.budgetMs <= 0) errors.push("budgetMs must be greater than zero");
      break;
    default:
      errors.push(`kind is not supported: ${String(event.kind)}`);
  }

  return errors.length ? { ok: false, errors } : { ok: true, event: value as TapEvent };
}

export type Tap = {
  readonly sessionId: string;
  emit(input: TapEventInput): TapEvent;
  ingest(value: unknown): TapEvent;
  subscribe(listener: (event: TapEvent) => void): () => void;
  events(): readonly TapEvent[];
  clear(): void;
  toJSONL(): string;
};

export function createTap(
  sessionId: string,
  options: {
    now?: () => string;
    id?: (seq: number) => string;
  } = {},
): Tap {
  if (!sessionId) throw new Error("sessionId is required");
  const now = options.now ?? (() => new Date().toISOString());
  const id = options.id ?? ((seq) => `${sessionId}-${seq}`);
  const listeners = new Set<(event: TapEvent) => void>();
  let captured: TapEvent[] = [];
  let seq = 0;

  function publish(event: TapEvent): TapEvent {
    captured.push(event);
    seq = Math.max(seq, event.seq);
    listeners.forEach((listener) => listener(event));
    return event;
  }

  return {
    sessionId,
    emit(input) {
      const next = seq + 1;
      const event = { v: TAP_VERSION, sessionId, eventId: id(next), seq: next, at: now(), ...input } as TapEvent;
      const checked = validateTapEvent(event);
      if (!checked.ok) throw new TypeError(`Invalid tap event: ${checked.errors.join("; ")}`);
      return publish(checked.event);
    },
    ingest(value) {
      const checked = validateTapEvent(value);
      if (!checked.ok) throw new TypeError(`Invalid tap event: ${checked.errors.join("; ")}`);
      if (checked.event.sessionId !== sessionId) throw new TypeError("Tap event belongs to another session");
      if (checked.event.seq <= seq) throw new TypeError("Tap event sequence must increase");
      return publish(checked.event);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    events: () => captured.slice(),
    clear() {
      captured = [];
      seq = 0;
    },
    toJSONL: () => captured.map((event) => JSON.stringify(event)).join("\n") + (captured.length ? "\n" : ""),
  };
}

const liveSessionId = `jt-live-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
export const glassTap = createTap(liveSessionId);
