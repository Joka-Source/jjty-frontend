/**
 * The records inside a Moment envelope conform to the jt-contracts schemas,
 * validated with ajv against the same schema files the golden fixtures use.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { CONTRACTS_DIR, makeMoment } from "./helpers.js";

const ajv = new Ajv2020.default({ allErrors: true, strict: false });
addFormats.default(ajv);

function loadSchema(name: string) {
  return JSON.parse(readFileSync(join(CONTRACTS_DIR, "schemas", `${name}.schema.json`), "utf8"));
}
function loadFixture(rel: string) {
  return JSON.parse(readFileSync(join(CONTRACTS_DIR, "fixtures", rel), "utf8"));
}

const validateCursor = ajv.compile(loadSchema("cursor"));
const validateReceipt = ajv.compile(loadSchema("receipt"));

test("golden fixtures validate (sanity: we read the schemas the contracts repo means)", () => {
  for (const shape of ["cursor", "receipt"]) {
    const validate = shape === "cursor" ? validateCursor : validateReceipt;
    for (const variant of ["minimal", "full"]) {
      const ok = validate(loadFixture(`${shape}/${variant}.json`));
      assert.equal(ok, true, `${shape}/${variant} should validate: ${JSON.stringify(validate.errors)}`);
    }
    assert.equal(validate(loadFixture(`invalid/${shape}.json`)), false, `invalid/${shape} must fail`);
  }
});

test("moment envelope's CursorRecord conforms to jt-contracts/cursor", () => {
  const m = makeMoment(1, true);
  const ok = validateCursor(m.cursor);
  assert.equal(ok, true, JSON.stringify(validateCursor.errors));
});

test("moment envelope's ReceiptRecord conforms to jt-contracts/receipt", () => {
  const m = makeMoment(1);
  const ok = validateReceipt(m.receipt);
  assert.equal(ok, true, JSON.stringify(validateReceipt.errors));
});
