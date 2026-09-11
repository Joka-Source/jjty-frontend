import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { findSensitiveTraceText, isAllowedTraceUrl } from "../scripts/trace-artifact.mjs";

test("traced journeys allow only the owned localhost preview", () => {
  assert.equal(isAllowedTraceUrl("http://127.0.0.1:4962/assets/app.js"), true);
  assert.equal(isAllowedTraceUrl("http://localhost:4962/"), true);
  assert.equal(isAllowedTraceUrl("https://example.com/tracker"), false);
  assert.equal(isAllowedTraceUrl("data:text/plain,fixture"), true);
});

test("trace privacy scan reports credential-shaped values without flagging field names", async () => {
  const clean = Buffer.from(
    JSON.stringify({ field: "authorization", fixture: "synthetic-jett-document" }),
  );
  assert.deepEqual(findSensitiveTraceText(clean), []);

  const exposed = Buffer.from(
    "Authorization: Bearer sk_test_abcdefghijklmnopqrstuvwxyz123456",
  );
  assert.deepEqual(findSensitiveTraceText(exposed), ["bearer credential"]);
  assert.deepEqual(
    findSensitiveTraceText(Buffer.from("github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz")),
    ["GitHub token"],
  );
});

test("trace archive inspection rejects unsafe member paths before extraction", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "jett-trace-test-"));
  const listing = path.join(directory, "listing.txt");
  await writeFile(listing, "trace.trace\n../escaped-secret.txt\n", "utf8");

  const { assertSafeTraceMembers } = await import("../scripts/trace-artifact.mjs");
  await assert.rejects(
    () => assertSafeTraceMembers(listing),
    /unsafe trace member path/,
  );
});

test("synthetic browser failure retains a clean trace while a passing journey retains none", { timeout: 120000 }, async () => {
  const artifactDirectory = path.resolve(".artifacts", "failure-trace-test");
  await rm(artifactDirectory, { recursive: true, force: true });

  const common = {
    cwd: path.resolve("."),
    encoding: "utf8",
    env: { ...process.env, JT_TRACE_OUTPUT_DIR: artifactDirectory },
  };
  const passing = spawnSync(
    process.execPath,
    ["scripts/run-traced-critical-journey.mjs"],
    common,
  );
  assert.equal(passing.status, 0, passing.stderr || passing.stdout);
  assert.equal(existsSync(path.join(artifactDirectory, "trace.zip")), false);

  const failing = spawnSync(
    process.execPath,
    ["scripts/run-traced-critical-journey.mjs"],
    { ...common, env: { ...common.env, JT_TRACE_PROBE_FAIL: "1" } },
  );
  assert.notEqual(failing.status, 0, "the controlled failure unexpectedly passed");
  assert.equal(existsSync(path.join(artifactDirectory, "trace.zip")), true);
  const receipt = JSON.parse(
    await readFile(path.join(artifactDirectory, "receipt.json"), "utf8"),
  );
  assert.equal(receipt.synthetic, true);
  assert.equal(receipt.privacy_scan.status, "pass");
  assert.equal(receipt.archive.members > 0, true);
  assert.match(receipt.archive.sha256, /^[0-9a-f]{64}$/);
});
