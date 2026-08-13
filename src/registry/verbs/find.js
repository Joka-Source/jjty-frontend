import { designedVerb } from "../define.js";
export default designedVerb({
  id: "find",
  spokenForms: ["where did it say", "find this"],
  description: "Find where remembered words appear in your documents.",
  roomDescription: "Find will return the exact passages where remembered words appear and show why each match belongs.",
  testReference: "test/registry.test.mjs",
});

