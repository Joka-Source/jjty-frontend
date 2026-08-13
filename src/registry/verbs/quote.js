import { designedVerb } from "../define.js";
export default designedVerb({
  id: "quote",
  spokenForms: ["quote this", "extract this passage"],
  description: "Lift an exact passage with its source still attached.",
  roomDescription: "Quote will copy the exact passage together with its document and place so the source never disappears.",
  testReference: "test/registry.test.mjs",
});

