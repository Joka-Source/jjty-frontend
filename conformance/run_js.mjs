// Reference runner: executes the conformance cases against the original
// JS matcher (jt-demo-voice-highlight/src/match.js) and prints results as
// JSON to stdout. NaN is encoded as the string "NaN" so it survives JSON.
//
// Usage: node conformance/run_js.mjs [path/to/match.js] > conformance/js_out.json

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const matchPath =
  process.argv[2] ?? "/Users/apple/projects/jt-demo-voice-highlight/src/match.js";
const { normalize, tokenize, tokenSimilarity, findMatch, matchTranscript } =
  await import(pathToFileURL(matchPath));

const spec = JSON.parse(
  readFileSync(new URL("./cases.json", import.meta.url), "utf8"),
);

const docTokens = {};
for (const [name, blocks] of Object.entries(spec.docs)) {
  docTokens[name] = blocks.flatMap((b) => tokenize(b));
}

const num = (x) => (Number.isNaN(x) ? "NaN" : x);
const matchOut = (m) =>
  m === null ? null : { start: m.start, end: m.end, score: num(m.score) };

const results = spec.cases.map((c) => {
  switch (c.kind) {
    case "normalize":
      return normalize(c.text);
    case "tokenize":
      return tokenize(c.text);
    case "similarity":
      return num(tokenSimilarity(c.a, c.b));
    case "findMatch":
      return matchOut(
        findMatch(docTokens[c.doc], tokenize(c.spoken), c.opts ?? {}) ?? null,
      );
    case "matchTranscript":
      return matchOut(
        matchTranscript(docTokens[c.doc], c.transcript, c.opts ?? {}) ?? null,
      );
    default:
      throw new Error(`unknown kind ${c.kind}`);
  }
});

process.stdout.write(JSON.stringify(results, null, 2) + "\n");
