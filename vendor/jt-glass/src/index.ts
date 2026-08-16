import { registerGlassPanels, type JtGlassElement } from "./panels.ts";
import { registerReplayLab, type JtReplayLabElement } from "./replay-lab.ts";
import type { Tap, TapEvent } from "./tap.ts";

export * from "./tap.ts";
export * from "./state.ts";
export * from "./replay.ts";
export * from "./panels.ts";
export * from "./replay-lab.ts";

export type MountGlassOptions = {
  events?: TapEvent[];
  expected?: unknown;
  tap?: Tap;
  title?: string;
};

export function renderGlassIntro(title: string): string {
  const safeTitle = title
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  return `<header class="glass-intro"><p class="brand">jt <span>glass</span></p><h1>${safeTitle}</h1><p>Follow the words, comparisons, choices, saved data, and timing behind each act.</p></header>`;
}

export function mountGlass(root: HTMLElement, options: MountGlassOptions = {}): () => void {
  registerGlassPanels();
  registerReplayLab();
  root.classList.add("jt-glass-root");
  root.innerHTML = `${renderGlassIntro(options.title ?? "See what jt understood")}<jt-replay-lab></jt-replay-lab><jt-glass-panels></jt-glass-panels>`;
  const lab = root.querySelector("jt-replay-lab") as JtReplayLabElement;
  const panels = root.querySelector("jt-glass-panels") as JtGlassElement;
  lab.onState = (state) => { panels.state = state; };
  lab.load({ events: options.events ?? [], expected: options.expected, tap: options.tap });
  return () => { root.replaceChildren(); root.classList.remove("jt-glass-root"); };
}
