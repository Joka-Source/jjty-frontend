import { createLaterController } from "./model.mjs";

const pages = {
  saved: {
    first: { items: [{ id: "s1", text: "Review the research packet", detail: "Today" }, { id: "s2", text: "Check the recovery evidence", detail: "Tomorrow" }], nextCursor: "saved-2" },
    "saved-2": { items: [{ id: "s3", text: "Ask what still blocks the pilot", detail: "Friday" }], nextCursor: null },
  },
  completed: { first: { items: [{ id: "c1", text: "Preserve the original evidence", detail: "Completed" }], nextCursor: null } },
};
const stateNode = document.querySelector("#state");
const itemsNode = document.querySelector("#items");
const actionsNode = document.querySelector("#actions");
const failNext = document.querySelector("#fail-next");

const transport = async ({ tab, cursor }) => {
  await new Promise((resolve) => setTimeout(resolve, tab === "saved" ? 700 : 300));
  if (failNext.checked) {
    failNext.checked = false;
    throw new Error("simulated connection failure");
  }
  return structuredClone(pages[tab][cursor ?? "first"]);
};

function render(state) {
  document.querySelector(".lab").setAttribute("aria-busy", String(state.status.startsWith("loading")));
  for (const tab of ["saved", "completed"]) document.querySelector(`#tab-${tab}`).setAttribute("aria-selected", String(state.tab === tab));
  stateNode.className = state.status.startsWith("error") ? "error" : "";
  stateNode.textContent = {
    idle: "Ready to load.", loading: `Loading ${state.tab} items…`, "loading-older": "Loading older items…",
    ready: state.items.length ? `${state.items.length} item${state.items.length === 1 ? "" : "s"} loaded.` : "Nothing here yet.",
    error: `Could not load this list: ${state.error}.`, "error-older": `Older items did not load: ${state.error}. Your loaded items are still here.`,
  }[state.status];
  itemsNode.replaceChildren();
  if (state.status === "loading") for (let i = 0; i < 3; i += 1) { const row = document.createElement("li"); row.className = "skeleton"; row.setAttribute("aria-hidden", "true"); itemsNode.append(row); }
  else for (const item of state.items) { const row = document.createElement("li"); const title = document.createElement("strong"); title.textContent = item.text; const detail = document.createElement("span"); detail.textContent = item.detail; row.append(title, detail); itemsNode.append(row); }
  actionsNode.replaceChildren();
  if (state.failedRequest) { const retry = document.createElement("button"); retry.className = "primary"; retry.textContent = "Retry"; retry.onclick = () => controller.retry(); actionsNode.append(retry); }
  if (state.status === "ready" && state.nextCursor) { const older = document.createElement("button"); older.textContent = "Load older items"; older.onclick = () => controller.loadOlder(); actionsNode.append(older); }
  if (state.status === "loading-older") { const waiting = document.createElement("button"); waiting.disabled = true; waiting.textContent = "Loading older items…"; actionsNode.append(waiting); }
}

const controller = createLaterController({ fetchPage: transport, onChange: render });
for (const tab of ["saved", "completed"]) document.querySelector(`#tab-${tab}`).addEventListener("click", () => controller.selectTab(tab));
document.querySelector('[role="tablist"]').addEventListener("keydown", (event) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const tab = controller.state().tab === "saved" ? "completed" : "saved";
  document.querySelector(`#tab-${tab}`).focus();
});
controller.load();
window.__laterLab = controller;
