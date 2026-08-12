import { INSTALL_HINT_KEY } from "./settings.js";

export function isIosDevice(nav = navigator) {
  return /iPad|iPhone|iPod/.test(nav.userAgent) ||
    (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
}

export function manualInstallText(nav = navigator) {
  return isIosDevice(nav)
    ? "In Safari, tap Share, then Add to Home Screen."
    : "Open your browser menu, then choose Install jt or Add to home screen.";
}

export function initInstallUx({ win = window, doc = document, storage = localStorage } = {}) {
  const button = doc.getElementById("install-button");
  const manual = doc.getElementById("install-manual");
  const state = doc.getElementById("install-state");
  const hint = doc.getElementById("install-hint");
  const hintLink = doc.getElementById("install-hint-link");
  const hintDismiss = doc.getElementById("install-hint-dismiss");
  if (!button || !manual || !state || !hint) return null;

  let promptEvent = null;
  manual.textContent = manualInstallText(win.navigator);
  manual.hidden = false;
  button.hidden = true;
  hint.hidden = true;

  const hideHint = () => {
    hint.hidden = true;
  };
  hintLink?.addEventListener("click", hideHint);
  hintDismiss?.addEventListener("click", hideHint);

  win.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    promptEvent = event;
    manual.hidden = true;
    button.hidden = false;
    state.textContent = "jt can be installed on this device.";
    if (storage.getItem(INSTALL_HINT_KEY) !== "1") {
      storage.setItem(INSTALL_HINT_KEY, "1");
      hint.hidden = false;
    }
  });

  button.addEventListener("click", async () => {
    if (!promptEvent) return;
    hideHint();
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    promptEvent = null;
    button.hidden = true;
    if (choice.outcome === "accepted") {
      state.textContent = "jt is installed.";
      manual.hidden = true;
    } else {
      state.textContent = "jt was not installed. You can still add it from the browser menu.";
      manual.hidden = false;
    }
  });

  win.addEventListener("appinstalled", () => {
    promptEvent = null;
    button.hidden = true;
    manual.hidden = true;
    hideHint();
    state.textContent = "jt is installed.";
  });

  return { available: () => promptEvent !== null };
}
