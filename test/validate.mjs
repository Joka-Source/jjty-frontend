// Shared ajv setup: compile the vendored jt-contracts schemas.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function load(name) {
  return JSON.parse(readFileSync(path.join(root, "contracts", name), "utf8"));
}

const ajv = new Ajv2020.default({ allErrors: true, strict: true });
addFormats.default(ajv);

export const validateCursor = ajv.compile(load("cursor.schema.json"));
export const validateReceipt = ajv.compile(load("receipt.schema.json"));

export function errorsOf(validate) {
  return (validate.errors ?? [])
    .map((e) => `${e.instancePath || "/"} ${e.message}`)
    .join("; ");
}

export { root };
