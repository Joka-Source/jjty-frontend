import { emptyGlassState, type GlassState } from "./state.ts";

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatScore(value: unknown): string {
  return typeof value === "number" ? value.toFixed(2) : "—";
}

function transcriptPanel(state: GlassState): string {
  const rows = state.transcript.length
    ? state.transcript.map((line) => {
        const classification = line.classification ?? "unresolved";
        const stateText = classification === "reading" ? "Reading" : classification === "command" ? "Instruction" : "Not decided";
        return `<li class="transcript-line is-${classification}">
          <span class="speech-text">${escapeHtml(line.text)}</span>
          <span class="line-state">${stateText} · ${formatScore(line.confidence)}${line.final ? " · final" : " · changing"}</span>
        </li>`;
      }).join("")
    : `<li class="empty">Words will appear here as jt hears them.</li>`;
  return `<section class="glass-panel transcript-panel" aria-labelledby="transcript-title">
    <header><p class="eyebrow">Hear</p><h2 id="transcript-title">Live words</h2></header>
    <ul class="transcript-list">${rows}</ul>
    <p class="key"><span class="key-reading">Reading</span><span class="key-command">Instruction</span><span class="key-unresolved">Not decided</span></p>
  </section>`;
}

function matchPanel(state: GlassState): string {
  const match = state.match;
  const rows = match?.blocks.length
    ? match.blocks.map((block) => {
        const selected = match.selected?.blockId === block.blockId;
        const bestSpan = block.spans[0];
        return `<li class="score-row${selected ? " is-pinned" : ""}">
          <span class="block-name">Passage ${block.blockIndex + 1}</span>
          <span class="score-track" aria-label="score ${formatScore(block.score)}"><span style="--score:${block.score}"></span></span>
          <strong>${formatScore(block.score)}</strong>
          ${bestSpan ? `<small>${selected ? "Pinned" : "Best span"}: ${bestSpan.start}–${bestSpan.end} ${bestSpan.unit === "token" ? "tokens" : "characters"}${bestSpan.text ? ` “${escapeHtml(bestSpan.text)}”` : ""}</small>` : `<small>No matching span</small>`}
        </li>`;
      }).join("")
    : `<li class="empty">Scores will appear when jt compares the words with the document.</li>`;
  return `<section class="glass-panel match-panel" aria-labelledby="match-title">
    <header><p class="eyebrow">Compare</p><h2 id="match-title">Match view</h2></header>
    ${match ? `<p class="query">Compared “${escapeHtml(match.query)}”</p>` : ""}
    <ol class="score-list">${rows}</ol>
  </section>`;
}

function decisionPanel(state: GlassState): string {
  const rows = state.decisions.length
    ? state.decisions.map((decision) => {
        const result = decision.result === "ask" ? "Asked you" : decision.result === "act" ? "Acted" : decision.result === "handled" ? "Handled" : decision.result === "reading" ? "Kept reading" : "Did not act";
        const ambiguities = Array.isArray(decision.ambiguities) && decision.ambiguities.length
          ? `<p class="alternatives">Choices: ${decision.ambiguities.map((item: any) => `${escapeHtml(item.label)} ${formatScore(item.confidence)}`).join(" · ")}</p>`
          : "";
        return `<li><span class="decision-result">${result}</span><p>${escapeHtml(decision.reason)}</p>${ambiguities}</li>`;
      }).join("")
    : `<li class="empty">Reasons will appear when jt decides what to do.</li>`;
  return `<section class="glass-panel decision-panel" aria-labelledby="decision-title">
    <header><p class="eyebrow">Decide</p><h2 id="decision-title">Why jt acted</h2></header>
    <ol class="decision-list">${rows}</ol>
  </section>`;
}

function recordPanel(state: GlassState): string {
  const latest = state.records.at(-1) as any;
  let label = "No record yet";
  let status = "unchecked";
  if (latest?.schema?.valid === true) { label = "Valid"; status = "valid"; }
  if (latest?.schema?.valid === false) { label = "Needs attention"; status = "invalid"; }
  if (latest?.schema?.valid === null) { label = "Not checked"; status = "unchecked"; }
  const errors = latest?.schema?.errors?.length
    ? `<ul class="schema-errors">${latest.schema.errors.map((error: string) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>`
    : "";
  const raw = latest ? escapeHtml(JSON.stringify(latest.record, null, 2)) : "Nothing has been saved in this replay yet.";
  return `<section class="glass-panel record-panel" aria-labelledby="record-title">
    <header><p class="eyebrow">Keep</p><h2 id="record-title">Saved record</h2></header>
    <p class="schema-state is-${status}"><span>${label}</span>${latest?.schema?.name ? ` against ${escapeHtml(latest.schema.name)}` : ""}</p>
    ${errors}<details ${latest ? "" : "open"}><summary>Show raw data</summary><pre>${raw}</pre></details>
  </section>`;
}

function latencyPanel(state: GlassState): string {
  const rows = state.latencies.length
    ? state.latencies.map((item: any) => {
        const over = item.durationMs > item.budgetMs;
        const fill = Math.min((item.durationMs / item.budgetMs) * 100, 100);
        return `<li class="timing-row ${over ? "is-over" : "is-within"}">
          <div><strong>${escapeHtml(item.stage)}</strong><span>${over ? "Over budget" : "Within budget"}</span></div>
          <span class="timing-track"><span style="--fill:${fill}%"></span></span>
          <p>${item.durationMs} ms <small>of ${item.budgetMs} ms</small></p>
        </li>`;
      }).join("")
    : `<li class="empty">Timing appears after work is measured.</li>`;
  return `<section class="glass-panel timing-panel" aria-labelledby="timing-title">
    <header><p class="eyebrow">Measure</p><h2 id="timing-title">Timing</h2></header>
    <ul class="timing-list">${rows}</ul>
  </section>`;
}

export function renderGlassMarkup(state: GlassState): string {
  return `${transcriptPanel(state)}${matchPanel(state)}${decisionPanel(state)}${recordPanel(state)}${latencyPanel(state)}`;
}

const HTMLElementBase = (globalThis.HTMLElement ?? class {}) as typeof HTMLElement;

export class JtGlassElement extends HTMLElementBase {
  #state: GlassState = emptyGlassState();

  set state(value: GlassState) {
    this.#state = value;
    this.render();
  }

  get state(): GlassState {
    return this.#state;
  }

  connectedCallback(): void {
    this.classList.add("glass-grid");
    this.render();
  }

  render(): void {
    this.innerHTML = renderGlassMarkup(this.#state);
  }
}

export function registerGlassPanels(): void {
  if (globalThis.customElements && !customElements.get("jt-glass-panels")) {
    customElements.define("jt-glass-panels", JtGlassElement);
  }
}
