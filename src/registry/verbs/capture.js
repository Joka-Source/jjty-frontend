import { designedVerb } from "../define.js";
export default designedVerb({
  id: "capture",
  spokenForms: ["capture this page", "take in this page"],
  description: "Bring a physical page into jt with its origin recorded.",
  roomDescription: "Capture will use the device camera to bring in a physical page and keep where and when it came from.",
  testReference: "test/registry.test.mjs",
});

