import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const root = new URL("..", import.meta.url);

test("the build produces a self-contained browser demo", () => {
  execFileSync(process.execPath, ["scripts/build.mjs"], { cwd: root, stdio: "pipe" });

  const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
  const demo = readFileSync(new URL("../dist/demo.js", import.meta.url), "utf8");
  const tap = readFileSync(new URL("../dist/tap.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../dist/styles.css", import.meta.url), "utf8");

  assert.match(html, /\.\/demo\.js/);
  assert.match(demo, /mountGlass/);
  assert.ok(!html.match(/https?:\/\//));
  assert.ok(!css.match(/https?:\/\//));
  assert.ok(!tap.match(/from ["'][^"']+\.ts["']/));
});

