import { targetedVerb, objectArgs } from "../define.js";

export default targetedVerb({
  id: "mark-important",
  spokenForms: ["mark this important", "this is important"],
  description: "Mark the selected passage as important.",
  argsSchema: objectArgs({ blockIndex: { type: "integer", minimum: 0 } }),
  recordKinds: ["act", "intention", "proof"],
  status: "real",
  testReference: "test/e2e.test.mjs",
  intentNames: ["mark.important"],
  recordAct: "important",
  historyTitle: "marked important",
  recordDescription: ({ target }) => `mark the selected text important (${target})`,
  recordResult: ({ span }) => `${span} marked important`,
  describeIntent: () => "mark this block important",
  applyEffect(block) {
    block.classList.add("important");
  },
  reverseEffect(block) {
    block.classList.remove("important");
  },
});
