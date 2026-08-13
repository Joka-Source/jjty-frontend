import { defineVerb, objectArgs } from "../define.js";

export default defineVerb({
  id: "open-document",
  spokenForms: ["open the document", "open document"],
  description: "Open a document that is already on this device.",
  argsSchema: objectArgs({ documentName: { type: "string" }, document: { type: "object" } }),
  recordKinds: ["return"],
  status: "real",
  testReference: "test/intents.test.mjs",
  intentNames: ["document.open"],
  commandFromIntent(event, evidence) {
    return { type: "open", verbId: "open-document", documentName: event.args.documentName ?? "", evidence };
  },
  describeIntent: (args) => `open “${args.documentName ?? ""}”`,
  execute(ctx, args) {
    return ctx.openDocument(args);
  },
});

