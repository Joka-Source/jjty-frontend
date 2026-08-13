import { targetedVerb, objectArgs } from "../define.js";

export default targetedVerb({
  id: "annotate",
  spokenForms: ["add a note", "note that"],
  description: "Attach your words as a note beside the selected passage.",
  argsSchema: objectArgs({ noteText: { type: "string" } }, ["noteText"]),
  recordKinds: ["act", "intention", "proof"],
  status: "real",
  testReference: "test/e2e.test.mjs",
  intentNames: ["annotate.this"],
  intentArgs: (args) => ({ noteText: args.note ?? "" }),
  recordAct: "note",
  historyTitle: "note added",
  recordDescription: ({ target }) => `attach a spoken note to the selected text (${target})`,
  recordResult: ({ span, noteText }) => `note attached to ${span}: "${noteText}"`,
  describeIntent: (args) => `add the note “${args.note ?? ""}”`,
  applyEffect(block, entry) {
    const note = document.createElement("span");
    note.className = "note";
    note.dataset.entry = entry.id;
    note.textContent = entry.noteText;
    block.appendChild(note);
  },
  reverseEffect(block, entry) {
    block.querySelector(`.note[data-entry="${entry.id}"]`)?.remove();
  },
});
