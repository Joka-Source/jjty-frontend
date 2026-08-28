export const launch = {
  date: "31 August 2026",
  dateTime: "2026-08-31",
  timezone: "India time",
  scope: "Android beta + Linux developer preview",
} as const;

export const principles = [
  {
    number: "01",
    title: "Capture before command",
    body: "JJTY begins with what you chose to keep. It does not wait for a general command or turn every moment into a prompt.",
  },
  {
    number: "02",
    title: "The interior stays yours",
    body: "Private material is device-owned by default. Anything that leaves does so through an explicit act with a visible receipt.",
  },
  {
    number: "03",
    title: "Uncertainty is stated",
    body: "The system says what it sensed, what it inferred, and what it could not know. A coarse truth beats a precise guess.",
  },
  {
    number: "04",
    title: "Failure has a way home",
    body: "Permission denial, network loss, interrupted capture, reboot, and rollback are part of the product—not footnotes after it.",
  },
] as const;

export const releases = [
  {
    code: "A",
    eyebrow: "Controlled release",
    title: "Android beta",
    body: "A native, capture-first path with a device-owned private store, explicit permissions, and recovery designed into the first use.",
    gate: "Launch gate: the signed candidate must pass the complete journey on a physical Android device.",
  },
  {
    code: "L",
    eyebrow: "Developer release",
    title: "Linux developer preview",
    body: "A reproducible image for a named reference target, released with checksums, provenance, and a documented update and rollback path.",
    gate: "Launch gate: the exact image must boot, update, and roll back on the physical reference target.",
  },
] as const;

export const evidenceTiers = [
  {
    name: "PASS_LOCAL",
    title: "The code behaves here",
    body: "A useful start, never a platform claim.",
  },
  {
    name: "PASS_EMULATOR",
    title: "The platform shape behaves",
    body: "Good enough to find integration failures, not enough to speak for hardware.",
  },
  {
    name: "PASS_DEVICE",
    title: "The real device survives it",
    body: "Install, permissions, storage, network loss, reboot, and recovery are observed on hardware.",
  },
  {
    name: "PASS_HUMAN",
    title: "A person recognises the outcome",
    body: "The ritual makes sense outside the team that built it.",
  },
] as const;

export const openWork = [
  "Consumer hardware remains a research programme until physical evidence exists.",
  "iOS is not part of the 31 August release promise.",
  "Hinglish remains a named open problem, not a hidden quality claim.",
] as const;
