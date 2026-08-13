import { defineVerb, objectArgs } from "../define.js";

export default defineVerb({
  id: "undo",
  spokenForms: ["undo", "undo that"],
  description: "Reverse a previous act while keeping the history intact.",
  argsSchema: objectArgs({ entryId: { type: ["string", "null"] } }),
  recordKinds: ["undo", "intention", "proof"],
  status: "real",
  testReference: "test/e2e.test.mjs",
  intentNames: ["undo"],
  recordAct: "undo",
  historyKind: "undo",
  historyTitle: "undone",
  undoRoute: "redo by performing the original act again",
  commandFromIntent(_event, evidence) {
    return { type: "undo", verbId: "undo", evidence };
  },
  describeIntent: () => "undo the last act",
  execute(ctx, args) {
    return ctx.undo(args);
  },
  recordDescription: ({ undoes }) => `undo the act recorded as ${undoes}`,
  recordResult: ({ undoes, span }) => `act ${undoes} reversed; ${span} restored`,
});
