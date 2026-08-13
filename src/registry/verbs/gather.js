import { designedVerb } from "../define.js";
export default designedVerb({
  id: "gather",
  spokenForms: ["gather these", "keep these together"],
  description: "Bring related moments from several documents into one set.",
  roomDescription: "Gather will build a named set of moments from different documents without flattening their sources.",
  testReference: "test/registry.test.mjs",
});

