#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TERMS = [
  { name: "locus", pattern: /\blocus\b/giu },
  { name: "settle", pattern: /\bsettle\b/giu },
  { name: "recede", pattern: /\brecede\b/giu },
  { name: "receipt", pattern: /\breceipt\b/giu },
  { name: "Margin", pattern: /\bMargin\b/gu },
  { name: "QR", pattern: /\bQR\b/gu },
  { name: "sea", pattern: /\bsea\b/giu },
  { name: "drop", pattern: /\bdrop\b/giu },
  { name: "shell", pattern: /\bshell\b/giu },
  { name: "bubble", pattern: /\bbubble\b/giu },
  { name: "island", pattern: /\bisland\b/giu },
];

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootIndex = process.argv.indexOf("--root");
const scanRoot = rootIndex === -1 ? repositoryRoot : path.resolve(process.argv[rootIndex + 1] ?? "");
const allowlistPath = path.join(scanRoot, "scripts", "vocabulary-allowlist.txt");

function normalize(value) {
  return value.replace(/\s+/gu, " ").trim();
}

function listJavaScriptFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const destination = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(destination);
    return entry.isFile() && entry.name.endsWith(".js") ? [destination] : [];
  });
}

function htmlStrings(source) {
  return source.split(/\r?\n/u).flatMap((line, index) => {
    const values = [];
    const text = normalize(line.replace(/<[^>]*>/gu, " "));
    if (text) values.push({ line: index + 1, value: text });
    for (const match of line.matchAll(/\b(?:alt|aria-label|placeholder|title|value)=(["'])(.*?)\1/giu)) {
      const value = normalize(match[2]);
      if (value) values.push({ line: index + 1, value });
    }
    return values;
  });
}

function javaScriptStrings(source) {
  const values = [];
  let index = 0;
  let line = 1;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === "\n") {
      line += 1;
      index += 1;
      continue;
    }
    if (char === "/" && next === "/") {
      index = source.indexOf("\n", index + 2);
      if (index === -1) break;
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        if (source[index] === "\n") line += 1;
        index += 1;
      }
      index += 2;
      continue;
    }
    if (char !== '"' && char !== "'" && char !== "`") {
      index += 1;
      continue;
    }

    const quote = char;
    const startLine = line;
    let value = "";
    index += 1;
    while (index < source.length) {
      const current = source[index];
      if (current === "\\") {
        value += current;
        if (source[index + 1] === "\n") line += 1;
        value += source[index + 1] ?? "";
        index += 2;
        continue;
      }
      if (current === quote) {
        index += 1;
        break;
      }
      if (current === "\n") line += 1;
      value += current;
      index += 1;
    }
    const normalized = normalize(value);
    if (normalized) values.push({ line: startLine, value: normalized });
  }
  return values;
}

function readAllowlist() {
  if (!existsSync(allowlistPath)) {
    throw new Error(`missing allowlist: ${path.relative(scanRoot, allowlistPath)}`);
  }
  const entries = new Map();
  let comment = "";
  for (const [index, raw] of readFileSync(allowlistPath, "utf8").split(/\r?\n/u).entries()) {
    const line = raw.trim();
    if (!line) {
      comment = "";
      continue;
    }
    if (line.startsWith("#")) {
      comment = line.slice(1).trim();
      continue;
    }
    if (!comment) throw new Error(`allowlist line ${index + 1} must have a preceding comment`);
    const parts = line.split("|");
    if (parts.length !== 3 || parts.some((part) => !part.trim())) {
      throw new Error(`allowlist line ${index + 1} must be path|term|exact string`);
    }
    const key = parts.map((part) => part.trim()).join("|");
    if (entries.has(key)) throw new Error(`duplicate allowlist entry on line ${index + 1}: ${key}`);
    entries.set(key, { comment, used: false });
    comment = "";
  }
  return entries;
}

function findingsFor(relative, candidates, allowlist) {
  const findings = [];
  for (const candidate of candidates) {
    for (const term of TERMS) {
      term.pattern.lastIndex = 0;
      if (!term.pattern.test(candidate.value)) continue;
      const key = `${relative}|${term.name}|${candidate.value}`;
      const allowed = allowlist.get(key);
      if (allowed) {
        allowed.used = true;
        continue;
      }
      findings.push({ ...candidate, file: relative, term: term.name });
    }
  }
  return findings;
}

function run() {
  const allowlist = readAllowlist();
  const sources = [];
  const htmlPath = path.join(scanRoot, "index.html");
  if (existsSync(htmlPath)) {
    sources.push({
      relative: "index.html",
      candidates: htmlStrings(readFileSync(htmlPath, "utf8")),
    });
  }
  for (const file of listJavaScriptFiles(path.join(scanRoot, "src"))) {
    sources.push({
      relative: path.relative(scanRoot, file).split(path.sep).join("/"),
      candidates: javaScriptStrings(readFileSync(file, "utf8")),
    });
  }

  const findings = sources.flatMap(({ relative, candidates }) =>
    findingsFor(relative, candidates, allowlist)
  );
  const stale = [...allowlist.entries()].filter(([, entry]) => !entry.used);
  if (stale.length > 0) {
    console.error("Vocabulary allowlist contains stale entries:");
    for (const [entry] of stale) console.error(entry);
    process.exitCode = 2;
    return;
  }
  if (findings.length > 0) {
    console.error(`Vocabulary gate failed with ${findings.length} banned user-facing string(s):`);
    for (const finding of findings) {
      console.error(`${finding.file}:${finding.line}: ${finding.term}: ${finding.value}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`Vocabulary gate passed (${sources.length} user-facing source files scanned).`);
}

try {
  run();
} catch (error) {
  console.error(`Vocabulary gate configuration error: ${error.message}`);
  process.exitCode = 2;
}
