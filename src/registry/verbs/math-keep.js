import { defineVerb, objectArgs } from "../define.js";

export default defineVerb({
  id: "math-keep",
  spokenForms: ["keep that", "keep expression"],
  description: "Keep spoken mathematics with its words and rendered expression.",
  argsSchema: objectArgs({ modality: { type: "string" } }),
  recordKinds: ["act", "intention", "proof"],
  status: "real",
  testReference: "test/math.test.mjs",
  intentNames: [],
  recordAct: "math",
  historyTitle: "mathematics kept",
  execute(ctx, args) {
    return ctx.keepMath(args);
  },
  recordDescription: ({ target }) => `keep spoken mathematics at ${target}`,
  recordResult: ({ span, mathLatex }) => `mathematics kept at ${span}: ${mathLatex}`,
  extendEntry(entry, { mathSpeech, mathLatex, mathUnparsed }) {
    entry.mathSpeech = mathSpeech;
    entry.mathLatex = mathLatex;
    entry.mathUnparsed = [...(mathUnparsed ?? [])];
  },
  momentBlock(entry, { document, blockIndex }) {
    return {
      kind: "math",
      content: entry.mathLatex,
      spoken: entry.mathSpeech,
      unparsed: [...(entry.mathUnparsed ?? [])],
      anchorId: `anc-${document.id}-b${blockIndex}`,
    };
  },
  applyEffect(block, entry, { renderMath } = {}) {
    const math = document.createElement("span");
    math.className = "kept-math";
    math.dataset.entry = entry.id;
    math.dataset.latex = entry.mathLatex;
    if (renderMath) renderMath(math, entry);
    else math.textContent = entry.mathLatex;
    block.appendChild(math);
  },
  reverseEffect(block, entry) {
    block.querySelector(`.kept-math[data-entry="${entry.id}"]`)?.remove();
  },
});
