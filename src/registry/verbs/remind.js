import { designedVerb } from "../define.js";
export default designedVerb({
  id: "remind",
  spokenForms: ["remind me about this", "bring this back later"],
  description: "Bring a chosen moment back at a useful time.",
  roomDescription: "Remind will bring this moment back at the time you choose, with the passage and source still intact.",
  testReference: "test/registry.test.mjs",
});

