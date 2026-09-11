import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const SENSITIVE_PATTERNS = [
  ["bearer credential", /\bbearer\s+[a-z0-9_=-]{24,}/i],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["GitHub token", /\b(?:gh(?:p|o|u|s|r)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})/],
  ["Slack token", /\bxox(?:a|b|p|r|s)-[A-Za-z0-9-]{16,}/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
];

export function isAllowedTraceUrl(rawUrl) {
  const url = new URL(rawUrl);
  return (
    url.protocol === "data:" ||
    (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))
  );
}

export function findSensitiveTraceText(bytes) {
  const text = Buffer.from(bytes).toString("latin1");
  return SENSITIVE_PATTERNS
    .filter(([, pattern]) => pattern.test(text))
    .map(([label]) => label);
}

export async function assertSafeTraceMembers(listingPath) {
  const names = (await readFile(listingPath, "utf8"))
    .split(/\r?\n/)
    .filter(Boolean);
  for (const name of names) {
    const normalized = path.posix.normalize(name.replaceAll("\\", "/"));
    if (
      name.startsWith("/") ||
      normalized === ".." ||
      normalized.startsWith("../") ||
      /^[A-Za-z]:\//.test(name)
    ) {
      throw new Error(`unsafe trace member path: ${name}`);
    }
  }
  return names;
}

export async function inspectTraceArchive(archivePath) {
  const listing = execFileSync("unzip", ["-Z1", archivePath], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  const names = listing.split(/\r?\n/).filter(Boolean);
  for (const name of names) {
    const normalized = path.posix.normalize(name.replaceAll("\\", "/"));
    if (
      name.startsWith("/") ||
      normalized === ".." ||
      normalized.startsWith("../") ||
      /^[A-Za-z]:\//.test(name)
    ) {
      throw new Error(`unsafe trace member path: ${name}`);
    }
  }

  const findings = new Set();
  for (const name of names) {
    const bytes = execFileSync("unzip", ["-p", archivePath, name], {
      encoding: "buffer",
      maxBuffer: 128 * 1024 * 1024,
    });
    for (const finding of findSensitiveTraceText(bytes)) findings.add(finding);
  }
  if (findings.size) {
    throw new Error(`trace privacy scan failed: ${[...findings].join(", ")}`);
  }

  const archive = await readFile(archivePath);
  const metadata = await stat(archivePath);
  return {
    members: names.length,
    bytes: metadata.size,
    sha256: createHash("sha256").update(archive).digest("hex"),
  };
}
