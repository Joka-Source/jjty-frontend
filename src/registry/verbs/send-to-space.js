import { defineVerb, objectArgs } from "../define.js";

export default defineVerb({
  id: "send-to-space",
  spokenForms: ["send this to my space", "place this in my space"],
  description: "Place a kept moment in one of your current spaces.",
  argsSchema: objectArgs({ entry: { type: "object" }, spaceId: { type: "string" } }, ["entry", "spaceId"]),
  recordKinds: ["space-moment"],
  status: "real",
  testReference: "test/spaces.e2e.test.mjs",
  intentNames: [],
  execute(ctx, args) {
    return ctx.sendToSpace(args);
  },
});

