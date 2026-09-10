const DEFINITIONS = {
  loading: {
    eyebrow: "Working",
    title: "Opening your work",
    message: "JETT is restoring the latest local state and checking what changed.",
    action: { label: "Work offline", event: "continue-offline" },
    live: "polite",
  },
  empty: {
    eyebrow: "Start here",
    title: "Bring in the first document",
    message: "Open a file or paste text. JETT keeps its source and a record of every act.",
    action: { label: "Open a document", event: "open-document" },
    live: "polite",
  },
  offline: {
    eyebrow: "On this device",
    title: "You can keep working offline",
    message: "Changes stay safely in the outbox and can travel after the connection returns.",
    action: { label: "Retry connection", event: "retry-connection" },
    live: "polite",
  },
  permission: {
    eyebrow: "Voice is paused",
    title: "Microphone access is off",
    message: "Reading and touch still work. Turn on microphone access when you want to speak.",
    action: { label: "Try microphone again", event: "request-microphone" },
    live: "polite",
  },
  error: {
    eyebrow: "Nothing was lost",
    title: "That action did not finish",
    message: "Your document is unchanged. Try the action again or inspect its record.",
    action: { label: "Try again", event: "retry-action" },
    live: "assertive",
  },
  recovery: {
    eyebrow: "Recovered locally",
    title: "We found an unfinished draft",
    message: "It was saved on this device before the page closed. Review it before continuing.",
    action: { label: "Restore draft", event: "restore-draft" },
    live: "polite",
  },
};

export const JETT_UI_STATES = Object.freeze(DEFINITIONS);

export function stateViewModel(name) {
  const state = JETT_UI_STATES[name];
  if (!state) throw new Error(`Unknown JETT UI state: ${name}`);
  return { name, ...state, action: { ...state.action } };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderStateSurface(name) {
  const state = stateViewModel(name);
  const role = state.live === "assertive" ? "alert" : "status";
  return `<div class="jett-state jett-state--${escapeHtml(name)}" data-state="${escapeHtml(name)}" role="${role}" aria-live="${state.live}" aria-atomic="true">
    <span class="jett-state__signal" aria-hidden="true"></span>
    <p class="jett-state__eyebrow">${escapeHtml(state.eyebrow)}</p>
    <h2>${escapeHtml(state.title)}</h2>
    <p class="jett-state__message">${escapeHtml(state.message)}</p>
    <button type="button" data-state-action="${escapeHtml(state.action.event)}">${escapeHtml(state.action.label)}</button>
  </div>`;
}

export function mountStateSurface(root, name, onAction = () => {}) {
  root.innerHTML = renderStateSurface(name);
  const state = stateViewModel(name);
  root.querySelector("[data-state-action]")?.addEventListener("click", () => onAction(state.action.event));
  return state;
}
