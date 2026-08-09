import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("pins the zero-spend CI environment and verification order", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/quality.yml", import.meta.url),
    "utf8",
  );

  assert.equal(workflow.match(/^\s+runs-on:\s*(\S+)$/m)?.[1], "ubuntu-24.04");
  assert.deepEqual(
    [...workflow.matchAll(/^\s+- uses:\s*(\S+)$/gm)].map((match) => match[1]),
    [
      "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
      "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
    ],
  );
  assert.equal(workflow.match(/^\s+node-version:\s*(\S+)$/m)?.[1], "22.13.0");

  const commands = [...workflow.matchAll(/^\s+run:\s*(.+)$/gm)].map(
    (match) => match[1].trim(),
  );
  assert.deepEqual(commands, [
    "npm ci",
    "npm run lint",
    "npm run build",
    "npm run test:contracts",
  ]);
});
