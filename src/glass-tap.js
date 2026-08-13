import { createTap, validateTapEvent } from "@jt/glass/tap";

const key = "jt.glass.events.v1";

function storedEvents() {
  if (!import.meta.env?.DEV) return [];
  try {
    const rows = JSON.parse(sessionStorage.getItem(key) || "[]");
    if (!Array.isArray(rows)) return [];
    const valid = rows.flatMap((value) => {
      const checked = validateTapEvent(value);
      return checked.ok ? [checked.event] : [];
    });
    const sessionId = valid[0]?.sessionId;
    return valid.filter((event) => event.sessionId === sessionId);
  } catch { return []; }
}

// randomUUID exists only in secure contexts; fall back so the app boots on
// plain-http origins too (the e2e harness serves from one).
function sessionToken() {
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const restored = storedEvents();
export const glassTap = createTap(restored[0]?.sessionId ?? `jt-web-${sessionToken()}`);
for (const event of restored) glassTap.ingest(event);

export function emitGlass(event) {
  const emitted = glassTap.emit(event);
  if (import.meta.env?.DEV) {
    try { sessionStorage.setItem(key, JSON.stringify(glassTap.events().slice(-2000))); }
    catch { /* storage is optional */ }
  }
  return emitted;
}

export function readGlassEvents() {
  return [...glassTap.events()];
}
