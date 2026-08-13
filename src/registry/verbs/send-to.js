import { defineVerb, objectArgs } from "../define.js";

export default defineVerb({
  id: "send-to",
  spokenForms: ["send this to", "send that to"],
  description: "Send the latest kept moment to a named destination.",
  argsSchema: objectArgs({ recipient: { type: "string" } }, ["recipient"]),
  recordKinds: ["moment"],
  status: "real",
  testReference: "test/sync.e2e.test.mjs",
  intentNames: ["send.to"],
  commandFromIntent(event, evidence) {
    return { type: "send", verbId: "send-to", recipient: event.args.recipient ?? "", evidence };
  },
  describeIntent: (args) => `send this to “${args.recipient ?? ""}”`,
  execute(ctx, args) {
    return ctx.sendTo(args);
  },
});

