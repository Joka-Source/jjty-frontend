import { designedVerb } from "../define.js";
export default designedVerb({
  id: "translate-this",
  spokenForms: ["translate this", "say this in another language"],
  description: "Translate a selected passage without losing the original.",
  roomDescription: "Translate this will keep the original passage beside the translation and identify words it cannot place safely.",
  testReference: "test/registry.test.mjs",
});

