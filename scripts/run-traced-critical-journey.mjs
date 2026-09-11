import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

import { inspectTraceArchive, isAllowedTraceUrl } from "./trace-artifact.mjs";

const root = path.resolve(".");
const outputDirectory = path.resolve(
  process.env.JT_TRACE_OUTPUT_DIR ?? ".artifacts/failure-trace",
);
const tracePath = path.join(outputDirectory, "trace.zip");
const receiptPath = path.join(outputDirectory, "receipt.json");
const chrome =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = Number(process.env.JT_TRACE_PORT ?? 4962);

async function waitFor(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The preview process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`preview did not become ready at ${url}`);
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

if (!existsSync(path.join(root, "dist", "index.html"))) {
  execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
    cwd: root,
    stdio: "inherit",
  });
}

const server = spawn(
  process.execPath,
  [path.join(root, "node_modules", "vite", "bin", "vite.js"), "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: root, stdio: "ignore" },
);

let browser;
let context;
let failure;
try {
  await waitFor(`http://127.0.0.1:${port}/`);
  browser = await chromium.launch({
    executablePath: chrome,
    headless: true,
    args: ["--no-first-run", "--no-sandbox", "--disable-setuid-sandbox"],
  });
  context = await browser.newContext();
  await context.route("**/*", async (route) => {
    if (isAllowedTraceUrl(route.request().url())) await route.continue();
    else await route.abort("blockedbyclient");
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/#/home`, { waitUntil: "load" });
  await page.locator("#app-main").waitFor({ state: "visible" });
  assert.equal(await page.locator("#app-main").count(), 1);
  if (process.env.JT_TRACE_PROBE_FAIL === "1") {
    assert.equal(
      await page.locator("[data-synthetic-failure-probe]").count(),
      1,
      "controlled synthetic failure: diagnostic target is intentionally absent",
    );
  }
} catch (error) {
  failure = error;
} finally {
  if (context) {
    if (failure) await context.tracing.stop({ path: tracePath });
    else await context.tracing.stop();
  }
  await browser?.close();
  server.kill("SIGTERM");
}

if (failure) {
  const archive = await inspectTraceArchive(tracePath);
  const receipt = {
    schema: "jett.synthetic-failure-trace/v1",
    synthetic: true,
    generated_at: new Date().toISOString(),
    journey: "home shell boot",
    failure: "controlled absent diagnostic target",
    privacy_scan: {
      status: "pass",
      patterns: ["bearer credential", "private key", "GitHub token", "Slack token", "AWS access key"],
    },
    archive,
    boundary: "Synthetic localhost content only. The trace contains no account session or user document.",
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  process.stderr.write(`${failure.stack ?? failure}\n`);
  process.exitCode = 1;
}
