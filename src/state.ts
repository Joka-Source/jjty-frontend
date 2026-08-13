import { validateTapEvent, type TapEvent, type MatchScores } from "./tap.ts";

export type TranscriptLine = {
  seq: number;
  text: string;
  final: boolean;
  source: "speech" | "typed" | "sim";
  classification?: "reading" | "command" | "unresolved";
  confidence?: number;
};

export type GlassState = {
  throughSeq: number;
  transcript: TranscriptLine[];
  match: (Omit<MatchScores, "v" | "kind" | "sessionId" | "eventId" | "at">) | null;
  decisions: Array<Record<string, unknown>>;
  acts: Array<Record<string, unknown>>;
  records: Array<Record<string, unknown>>;
  latencies: Array<Record<string, unknown>>;
};

export function emptyGlassState(): GlassState {
  return { throughSeq: 0, transcript: [], match: null, decisions: [], acts: [], records: [], latencies: [] };
}

export function reduceGlassState(state: GlassState, event: TapEvent): GlassState {
  const next: GlassState = {
    ...state,
    throughSeq: event.seq,
    transcript: state.transcript.slice(),
    decisions: state.decisions.slice(),
    acts: state.acts.slice(),
    records: state.records.slice(),
    latencies: state.latencies.slice(),
  };
  switch (event.kind) {
    case "transcriptEvent":
      if (
        next.transcript.at(-1)?.final === false &&
        next.transcript.at(-1)?.classification === undefined &&
        next.transcript.at(-1)?.source === event.source
      ) {
        next.transcript[next.transcript.length - 1] = { seq: event.seq, text: event.text, final: event.final, source: event.source };
      } else {
        next.transcript.push({ seq: event.seq, text: event.text, final: event.final, source: event.source });
      }
      break;
    case "segmentationDecision": {
      const index = next.transcript.findLastIndex((line) => line.text === event.segmentText && line.classification === undefined);
      if (index >= 0) next.transcript[index] = { ...next.transcript[index], classification: event.classification, confidence: event.confidence };
      break;
    }
    case "matchScores":
      next.match = {
        seq: event.seq,
        query: event.query,
        blocks: structuredClone(event.blocks),
        ...(event.selected ? { selected: { ...event.selected } } : {}),
      };
      break;
    case "intentResult":
      next.decisions.push({
        seq: event.seq,
        result: event.result,
        ...(event.intent !== undefined ? { intent: event.intent } : {}),
        ...(event.confidence !== undefined ? { confidence: event.confidence } : {}),
        ambiguities: structuredClone(event.ambiguities),
        thresholds: { ...event.thresholds },
        reason: event.reason,
      });
      break;
    case "actCommitted":
      next.acts.push({ seq: event.seq, act: event.act, input: event.input, target: { ...event.target } });
      break;
    case "recordWritten":
      next.records.push({ seq: event.seq, record: structuredClone(event.record), schema: structuredClone(event.schema) });
      break;
    case "latencyMark":
      next.latencies.push({ seq: event.seq, stage: event.stage, durationMs: event.durationMs, budgetMs: event.budgetMs });
      break;
  }
  return next;
}

export function replayEvents(events: readonly TapEvent[], throughSeq = Number.POSITIVE_INFINITY): GlassState {
  const checked = events.map((event, index) => {
    const result = validateTapEvent(event);
    if (!result.ok) throw new TypeError(`Event ${index + 1} is invalid: ${result.errors.join("; ")}`);
    return result.event;
  });
  if (new Set(checked.map((event) => event.sessionId)).size > 1) {
    throw new TypeError("Replay events must belong to one session");
  }
  return checked
    .filter((event) => event.seq <= throughSeq)
    .sort((a, b) => a.seq - b.seq || a.eventId.localeCompare(b.eventId))
    .reduce(reduceGlassState, emptyGlassState());
}

export function stateOutcome(state: GlassState): GlassState {
  return structuredClone(state);
}
