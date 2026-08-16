import { glassTap, type Tap, type TapEvent } from "./tap.ts";
import { createRecorder, diffOutcome, parseJsonl, type OutcomeDiff, type Recorder } from "./replay.ts";
import { replayEvents, stateOutcome, type GlassState } from "./state.ts";
import { escapeHtml } from "./panels.ts";

const HTMLElementBase = (globalThis.HTMLElement ?? class {}) as typeof HTMLElement;

export type ReplayLoad = {
  events: TapEvent[];
  expected?: unknown;
  tap?: Tap;
};

export class JtReplayLabElement extends HTMLElementBase {
  #events: TapEvent[] = [];
  #expected: unknown = null;
  #index = 0;
  #timer: ReturnType<typeof setInterval> | null = null;
  #recorder: Recorder = createRecorder(glassTap);

  onState: ((state: GlassState) => void) | null = null;

  private recorderFor(tap: Tap): Recorder {
    return createRecorder(tap, (event) => {
      this.#events.push(event);
      this.#index = this.#events.length;
      this.updateReadout();
      this.publish();
    });
  }

  connectedCallback(): void {
    this.classList.add("replay-lab");
    this.render();
  }

  disconnectedCallback(): void {
    this.pause();
    this.#recorder.stop();
  }

  load({ events, expected, tap = glassTap }: ReplayLoad): void {
    this.pause();
    this.#events = events.slice();
    this.#expected = expected ?? null;
    this.#index = this.#events.length;
    this.#recorder.stop();
    this.#recorder = this.recorderFor(tap);
    this.render();
    this.publish();
  }

  private state(): GlassState {
    const through = this.#index === 0 ? 0 : this.#events[this.#index - 1]?.seq ?? 0;
    return replayEvents(this.#events, through);
  }

  private differences(): OutcomeDiff[] {
    return this.#expected === null ? [] : diffOutcome(this.#expected, stateOutcome(this.state()));
  }

  private publish(): void {
    const state = this.state();
    this.onState?.(state);
    this.dispatchEvent(new CustomEvent("glass-state", { detail: state, bubbles: true }));
  }

  private setIndex(index: number): void {
    this.#index = Math.max(0, Math.min(index, this.#events.length));
    const range = this.querySelector<HTMLInputElement>("#replay-position");
    if (range) range.value = String(this.#index);
    this.updateReadout();
    this.publish();
  }

  private updateReadout(): void {
    const at = this.querySelector<HTMLElement>("#replay-at");
    if (at) at.textContent = `${this.#index} of ${this.#events.length} events`;
    const diff = this.querySelector<HTMLElement>("#replay-diff");
    if (diff) diff.innerHTML = this.renderDiff();
  }

  private play(): void {
    if (this.#timer || !this.#events.length) return;
    if (this.#index >= this.#events.length) this.setIndex(0);
    this.#timer = setInterval(() => {
      if (this.#index >= this.#events.length) return this.pause();
      this.setIndex(this.#index + 1);
    }, 520);
    this.render();
  }

  private pause(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    if (this.isConnected) this.render();
  }

  private renderDiff(): string {
    if (this.#expected === null) return `<p class="empty">Load an expected outcome to compare this replay.</p>`;
    const differences = this.differences();
    if (!differences.length) return `<p class="diff-clear">The replay matches the expected outcome.</p>`;
    return `<p class="diff-count">${differences.length} ${differences.length === 1 ? "difference" : "differences"}</p><ol>${differences.map((item) => `<li><code>${escapeHtml(item.path)}</code><span>${item.kind === "changed" ? `${escapeHtml(JSON.stringify(item.expected))} → ${escapeHtml(JSON.stringify(item.actual))}` : item.kind === "missing" ? "Expected data is missing" : "Replay has extra data"}</span></li>`).join("")}</ol>`;
  }

  private async loadFile(file: File, kind: "session" | "expected"): Promise<void> {
    try {
      const text = await file.text();
      if (kind === "session") {
        this.#events = parseJsonl(text);
        this.#index = this.#events.length;
      } else {
        this.#expected = JSON.parse(text);
      }
      this.render();
      this.publish();
    } catch (error) {
      const message = this.querySelector<HTMLElement>("#replay-message");
      if (message) message.textContent = `Could not load that file: ${(error as Error).message}`;
    }
  }

  private downloadRecording(): void {
    const jsonl = this.#recorder.toJSONL();
    const url = URL.createObjectURL(new Blob([jsonl], { type: "application/x-ndjson" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "jt-glass-session.jsonl";
    link.click();
    URL.revokeObjectURL(url);
  }

  private bind(): void {
    this.querySelector("#replay-back")?.addEventListener("click", () => this.setIndex(this.#index - 1));
    this.querySelector("#replay-play")?.addEventListener("click", () => this.#timer ? this.pause() : this.play());
    this.querySelector("#replay-forward")?.addEventListener("click", () => this.setIndex(this.#index + 1));
    this.querySelector<HTMLInputElement>("#replay-position")?.addEventListener("input", (event) => this.setIndex(Number((event.target as HTMLInputElement).value)));
    this.querySelector<HTMLInputElement>("#session-file")?.addEventListener("change", (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) void this.loadFile(file, "session");
    });
    this.querySelector<HTMLInputElement>("#expected-file")?.addEventListener("change", (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) void this.loadFile(file, "expected");
    });
    this.querySelector("#record-toggle")?.addEventListener("click", () => {
      if (this.#recorder.recording) {
        this.#recorder.stop();
      } else {
        this.#recorder.clear();
        this.#events = [];
        this.#index = 0;
        this.#recorder.start();
      }
      this.render();
      this.publish();
    });
    this.querySelector("#record-download")?.addEventListener("click", () => this.downloadRecording());
  }

  render(): void {
    this.innerHTML = `<section class="lab-shell" aria-labelledby="lab-title">
      <div class="lab-heading"><div><p class="eyebrow">Replay Lab</p><h2 id="lab-title">Move through one session</h2></div><p id="replay-at">${this.#index} of ${this.#events.length} events</p></div>
      <div class="transport">
        <button id="replay-back" type="button" aria-label="Previous event">←</button>
        <button id="replay-play" type="button">${this.#timer ? "Pause" : "Play"}</button>
        <button id="replay-forward" type="button" aria-label="Next event">→</button>
        <input id="replay-position" type="range" min="0" max="${this.#events.length}" value="${this.#index}" aria-label="Session position">
      </div>
      <div class="lab-tools">
        <label class="file-control">Load session<input id="session-file" type="file" accept=".jsonl,application/x-ndjson"></label>
        <label class="file-control">Load expected outcome<input id="expected-file" type="file" accept=".json,application/json"></label>
        <button id="record-toggle" type="button">${this.#recorder.recording ? "Stop recording" : "Record live events"}</button>
        <button id="record-download" type="button" ${this.#recorder.events().length ? "" : "disabled"}>Save recording</button>
      </div>
      <p id="replay-message" class="message" aria-live="polite"></p>
      <div id="replay-diff" class="diff-box"><h3>Outcome check</h3>${this.renderDiff()}</div>
    </section>`;
    this.bind();
  }
}

export function registerReplayLab(): void {
  if (globalThis.customElements && !customElements.get("jt-replay-lab")) {
    customElements.define("jt-replay-lab", JtReplayLabElement);
  }
}
