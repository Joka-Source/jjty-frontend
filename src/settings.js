// jt — settings. A tiny typed layer over localStorage. Everything stays on
// this device; nothing here talks to a network. Values are read once at boot
// into a live object that the rest of the app consults, and every write goes
// straight back to storage so a reload sees the same state.

const KEYS = {
  welcomed: "jt.welcomed", // "1" once first-run has been seen
  mic: "jt.mic", // "on" | "off" (off = read-only until invited)
  engine: "jt.engine", // "wasm" | "js" (URL ?engine= overrides)
  lang: "jt.lang", // BCP-47 tag for speech recognition
  motion: "jt.motion", // "calm" | "usual" | "lively"
  person: "jt.person", // JSON { id, name } — who "you" are in spaces
  installHintSeen: "jt.installHintSeen", // "1" after the installable hint appears
};

export const INSTALL_HINT_KEY = KEYS.installHintSeen;

export const LANGS = [
  ["en-US", "english (US)"],
  ["en-GB", "english (UK)"],
  ["en-IN", "english (India)"],
  ["hi-IN", "hindi"],
];

export const MOTION_LEVELS = ["calm", "usual", "lively"];

/** How the motion setting scales the physics: ripple energy and the
 * marker medium's entry speed. "usual" is exactly the shipped W2 feel. */
export const MOTION_PARAMS = {
  calm: { energy: 2.5, entry: 0.7, tension: 170 },
  usual: { energy: 5, entry: 0.82, tension: 210 },
  lively: { energy: 9, entry: 0.9, tension: 260 },
};

export function loadSettings(storage = localStorage) {
  const get = (k, fallback) => storage.getItem(KEYS[k]) ?? fallback;
  const s = {
    welcomed: get("welcomed", "") === "1",
    mic: get("mic", ""),
    engine: get("engine", "wasm") === "js" ? "js" : "wasm",
    lang: get("lang", "en-US"),
    motion: MOTION_LEVELS.includes(get("motion", "usual")) ? get("motion", "usual") : "usual",
    set(key, value) {
      s[key] = value;
      if (key === "welcomed") storage.setItem(KEYS.welcomed, value ? "1" : "");
      else storage.setItem(KEYS[key], String(value));
    },
  };
  return s;
}

export function loadPerson(storage = localStorage) {
  try {
    const raw = storage.getItem(KEYS.person);
    if (raw) return JSON.parse(raw);
  } catch {
    /* fall through */
  }
  return null;
}

export function savePerson(person, storage = localStorage) {
  storage.setItem(KEYS.person, JSON.stringify(person));
}

/** Wipe every trace jt keeps in web storage (IndexedDB is wiped separately). */
export function clearSettings(storage = localStorage) {
  for (const k of Object.values(KEYS)) storage.removeItem(k);
}
