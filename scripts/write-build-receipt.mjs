import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const receiptName = "build-receipt.json";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function filesBelow(directory, prefix = "") {
  return readdirSync(directory).sort().flatMap((name) => {
    const relative = path.posix.join(prefix, name);
    const absolute = path.join(directory, name);
    return statSync(absolute).isDirectory() ? filesBelow(absolute, relative) : [relative];
  });
}

const trackedDirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8" }).trim() !== "";
const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const githubSha = process.env.GITHUB_SHA?.trim();
const committed = Boolean(githubSha) || !trackedDirty;
const sourceRevision = githubSha || (committed ? gitHead : "WORKING_TREE");
const files = filesBelow(dist).filter((name) => name !== receiptName).map((name) => {
  const bytes = readFileSync(path.join(dist, name));
  return { path: name, bytes: bytes.length, sha256: sha256(bytes) };
});
const aggregateInput = files.map((file) => `${file.sha256}  ${file.path}\n`).join("");
const receipt = {
  schema: "jjty.pwa-build-receipt/v1",
  sourceRevision,
  committed,
  fileCount: files.length,
  totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  aggregateSha256: sha256(aggregateInput),
  files,
};
writeFileSync(path.join(dist, receiptName), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`Wrote ${receiptName}: ${files.length} files, ${receipt.aggregateSha256}, source ${sourceRevision}`);
