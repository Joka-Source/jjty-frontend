import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gate = path.join(root, "scripts", "check-vocabulary.mjs");

function fixture(files) {
  const directory = mkdtempSync(path.join(tmpdir(), "jt-vocabulary-"));
  for (const [relative, contents] of Object.entries(files)) {
    const destination = path.join(directory, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, contents);
  }
  return directory;
}

function runGate(directory) {
  try {
    return {
      status: 0,
      output: execFileSync(process.execPath, [gate, "--root", directory], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (error) {
    return {
      status: error.status,
      output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    };
  }
}

test("vocabulary gate reports a banned user-facing word with its file and line", (t) => {
  const directory = fixture({
    "index.html": "<main>safe</main>\n<p>drop a file here</p>\n",
    "scripts/vocabulary-allowlist.txt": "",
  });
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const result = runGate(directory);

  assert.equal(result.status, 1);
  assert.match(result.output, /index\.html:2: drop: drop a file here/);
});

test("vocabulary gate ignores code comments and accepts a commented internal-literal allowlist entry", (t) => {
  const directory = fixture({
    "index.html": "<main>safe copy</main>\n",
    "src/main.js": [
      "// drop is discussed only in this internal comment",
      'addEventListener("drop", () => {});',
      "const shellState = true;",
      "",
    ].join("\n"),
    "scripts/vocabulary-allowlist.txt": [
      "# Browser event type; it is never rendered to a person.",
      "src/main.js|drop|drop",
      "",
    ].join("\n"),
  });
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const result = runGate(directory);

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /Vocabulary gate passed/);
});

test("vocabulary gate rejects allowlist entries without an explanatory comment", (t) => {
  const directory = fixture({
    "index.html": "<main>safe copy</main>\n",
    "src/main.js": 'addEventListener("drop", () => {});\n',
    "scripts/vocabulary-allowlist.txt": "src/main.js|drop|drop\n",
  });
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const result = runGate(directory);

  assert.equal(result.status, 2);
  assert.match(result.output, /must have a preceding comment/);
});
