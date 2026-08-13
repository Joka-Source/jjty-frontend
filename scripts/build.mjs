import { stripTypeScriptTypes } from "node:module";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceDir = path.join(root, "src");
const outputDir = path.join(root, "dist");

function browserModule(source) {
  return stripTypeScriptTypes(source, { mode: "strip", sourceMap: false })
    .replace(/(["'])(\.\.?\/[^"']+)\.ts\1/g, "$1$2.js$1")
    .replace(/(["'])\.\/src\/([^"']+)\.js\1/g, "$1./$2.js$1");
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const name of await readdir(sourceDir)) {
  if (!name.endsWith(".ts")) continue;
  const source = await readFile(path.join(sourceDir, name), "utf8");
  await writeFile(path.join(outputDir, name.replace(/\.ts$/, ".js")), browserModule(source));
}

const demoSource = await readFile(path.join(root, "demo.ts"), "utf8");
await writeFile(path.join(outputDir, "demo.js"), browserModule(demoSource));
await writeFile(path.join(outputDir, "styles.css"), await readFile(path.join(sourceDir, "styles.css")));
await writeFile(path.join(outputDir, "index.html"), await readFile(path.join(root, "index.html")));

const fixtureText = await readFile(path.join(root, "fixtures", "demo-session.jsonl"), "utf8");
const events = fixtureText.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const expected = JSON.parse(await readFile(path.join(root, "fixtures", "demo-expected.json"), "utf8"));
await writeFile(
  path.join(outputDir, "demo-data.js"),
  `export const demoEvents = ${JSON.stringify(events, null, 2)};\nexport const demoExpected = ${JSON.stringify(expected, null, 2)};\n`,
);

console.log(`built ${outputDir}`);

