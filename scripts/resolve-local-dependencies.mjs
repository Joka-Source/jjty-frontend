import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const localDependencies = Object.entries(manifest.dependencies ?? {})
  .filter(([, specifier]) => specifier.startsWith("file:"));

for (const [name, specifier] of localDependencies) {
  const relativeTarget = specifier.slice("file:".length);
  const canonicalTarget = path.resolve(root, relativeTarget);
  const worktreeTarget = path.resolve(root, "..", relativeTarget);
  const target = existsSync(canonicalTarget) ? canonicalTarget : worktreeTarget;

  if (!existsSync(target)) {
    throw new Error(`Missing local dependency ${name}: checked ${canonicalTarget} and ${worktreeTarget}`);
  }

  const linkPath = path.join(root, "node_modules", ...name.split("/"));
  const alreadyLinked = existsSync(linkPath)
    && lstatSync(linkPath).isSymbolicLink()
    && realpathSync(linkPath) === realpathSync(target);

  if (alreadyLinked) continue;

  rmSync(linkPath, { recursive: true, force: true });
  mkdirSync(path.dirname(linkPath), { recursive: true });
  symlinkSync(path.relative(path.dirname(linkPath), target), linkPath, "dir");
  console.log(`Linked ${name} to ${target}`);
}
