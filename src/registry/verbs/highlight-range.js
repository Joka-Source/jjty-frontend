import { defineVerb, objectArgs } from "../define.js";

export default defineVerb({
  id: "highlight-range",
  spokenForms: ["highlight from this to that", "highlight this range"],
  description: "Highlight everything between two spoken places.",
  argsSchema: objectArgs(
    { fromAnchor: { type: "string" }, toAnchor: { type: "string" } },
    ["fromAnchor", "toAnchor"],
  ),
  recordKinds: ["act", "intention", "proof"],
  status: "real",
  testReference: "test/e2e.test.mjs",
  intentNames: ["highlight.range"],
  recordAct: "highlight",
  recordDefault: false,
  effectVerbId: "highlight",
  historyTitle: "highlighted",
  commandFromIntent(event, evidence, confidence) {
    return {
      type: "range",
      verbId: "highlight-range",
      fromAnchor: event.args.fromAnchor,
      toAnchor: event.args.toAnchor,
      evidence,
      confidence,
    };
  },
  describeIntent(args) {
    return `highlight from “${args.fromAnchor}” to “${args.toAnchor}”`;
  },
  execute(ctx, args) {
    return ctx.performRange("highlight-range", args);
  },
  recordDescription: ({ target }) => `highlight the selected range (${target})`,
  recordResult: ({ target }) => `${target} highlighted`,
});
