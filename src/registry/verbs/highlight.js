import { applyInlineHighlight, removeInlineHighlight } from "../../highlight.js";
import { targetedVerb, objectArgs } from "../define.js";

export default targetedVerb({
  id: "highlight",
  spokenForms: ["highlight this", "highlight that"],
  description: "Keep the selected words highlighted in the document.",
  argsSchema: objectArgs({ blockIndex: { type: "integer", minimum: 0 } }),
  recordKinds: ["act", "intention", "proof"],
  status: "real",
  testReference: "test/e2e.test.mjs",
  intentNames: ["highlight.this"],
  recordAct: "highlight",
  recordDefault: true,
  historyTitle: "highlighted",
  describeIntent: () => "highlight this block",
  recordDescription: ({ target }) => `highlight the selected text (${target})`,
  recordResult: ({ target }) => `${target} highlighted`,
  applyEffect(block, entry) {
    const resolved = entry.resolvedAnchor;
    if (
      resolved &&
      resolved.blockIndex === Number(block.dataset.block) &&
      (entry.arrival === "exact" || entry.arrival === "refound")
    ) {
      applyInlineHighlight(block, entry.id, resolved.tokenStart, resolved.tokenEnd);
      return;
    }
    block.classList.add("hl-fallback");
    block.dataset.fallbackEntry = entry.id;
  },
  reverseEffect(block, entry) {
    removeInlineHighlight(block, entry.id);
    if (block.dataset.fallbackEntry === entry.id) {
      block.classList.remove("hl-fallback");
      delete block.dataset.fallbackEntry;
    }
  },
});
