import { defineVerb, noArgs } from "../define.js";

export default defineVerb({
  id: "show-history",
  spokenForms: ["show my acts", "what have I done"],
  description: "Show every act and the evidence that came with it.",
  argsSchema: noArgs,
  recordKinds: [],
  status: "real",
  testReference: "test/intents.test.mjs",
  intentNames: ["acts.show"],
  commandFromIntent(_event, evidence) {
    return { type: "show", verbId: "show-history", evidence };
  },
  describeIntent: () => "show what you have done",
  execute(ctx, args) {
    return ctx.showHistory(args);
  },
});

