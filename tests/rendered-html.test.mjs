import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders the truthful JJTY launch contract", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  const visibleMarkupText = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,:;!?])/g, "$1");
  assert.match(html, /<title>JJTY — capture, not commands<\/title>/i);
  assert.equal((html.match(/<h1\b/gi) ?? []).length, 1);
  assert.match(visibleMarkupText, /An operating system that begins with capture, not commands\./i);
  assert.match(html, /31 August 2026/i);
  assert.match(html, /Android beta/i);
  assert.match(html, /Linux developer preview/i);
  assert.match(html, /href="#contract"/i);
  assert.match(html, /href="#releases"/i);
  assert.match(html, /href="#main-content"/i);
  assert.match(html, /id="main-content"/i);
  assert.match(html, /<ol[^>]*class="[^"]*truth-ladder/i);

  for (const tier of [
    "PASS_LOCAL",
    "PASS_EMULATOR",
    "PASS_DEVICE",
    "PASS_HUMAN",
  ]) {
    assert.match(html, new RegExp(tier));
  }

  assert.doesNotMatch(html, /codex-preview|Codex is working/i);
  assert.doesNotMatch(html, /screenless assistant/i);
  assert.doesNotMatch(html, /<form\b/i);
});

test("ships production metadata without starter markers", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /<link rel="canonical" href="https:\/\/jjty\.in\/?"/i);
  assert.match(html, /property="og:title" content="JJTY — capture, not commands"/i);
  assert.match(html, /property="og:image" content="https:\/\/jjty\.in\/og\.png"/i);
  assert.match(html, /name="twitter:card" content="summary_large_image"/i);
  assert.match(html, /name="twitter:image" content="https:\/\/jjty\.in\/og\.png"/i);
  assert.doesNotMatch(html, /Starter Project|Your site is taking shape/i);
});
