// Conformance suite for jt-contracts.
//
// For every schema in schemas/:
//   - every fixture in fixtures/<record>/ must validate;
//   - the fixture in fixtures/invalid/<record>.json must NOT validate.
//
// Run with: node --test  (or npm test)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemasDir = join(root, "schemas");
const fixturesDir = join(root, "fixtures");
const invalidDir = join(fixturesDir, "invalid");

// strictRequired is off because Anchor uses `anyOf: [{required: [...]}, ...]`
// to demand at least one locator; the properties are defined at the parent level.
const ajv = new Ajv2020.default({ allErrors: true, strict: true, strictRequired: false });
addFormats.default(ajv);

// Load every schema; key by record name derived from the filename
// (e.g. schemas/source.schema.json -> "source").
const schemaFiles = readdirSync(schemasDir).filter((f) => f.endsWith(".schema.json"));
const validators = new Map();
for (const file of schemaFiles) {
  const schema = JSON.parse(readFileSync(join(schemasDir, file), "utf8"));
  const record = file.replace(/\.schema\.json$/, "");
  validators.set(record, { schema, validate: ajv.compile(schema) });
}

const EXPECTED_RECORDS = [
  "source",
  "anchor",
  "context",
  "cursor",
  "action",
  "receipt",
  "relationship",
  "placepack",
  "rightsrecord",
  "capabilityprofile",
  "provenanceenvelope",
  // Organizational layer (PROVISIONAL, pending founder WhatsApp handoff 2026-08-12):
  "institution",
  "cohort",
  "space",
  "membership",
  "spacecontext",
];

test(`all ${EXPECTED_RECORDS.length} portable records have a schema`, () => {
  for (const record of EXPECTED_RECORDS) {
    assert.ok(validators.has(record), `missing schema for record '${record}'`);
  }
  assert.equal(validators.size, EXPECTED_RECORDS.length, "unexpected extra schemas present");
});

test("every schema declares $id, schemaVersion requirement, and closed properties", () => {
  for (const [record, { schema }] of validators) {
    assert.match(schema.$id ?? "", /^jt-contracts\/[a-z]+\/v\d+\.\d+\.\d+$/, `${record}: bad $id`);
    assert.ok(schema.required.includes("schemaVersion"), `${record}: schemaVersion not required`);
    assert.equal(schema.additionalProperties, false, `${record}: additionalProperties must be false`);
  }
});

for (const record of EXPECTED_RECORDS) {
  const { validate } = validators.get(record) ?? {};

  test(`${record}: golden fixtures validate`, () => {
    assert.ok(validate, `no validator for ${record}`);
    const dir = join(fixturesDir, record);
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    assert.ok(files.length >= 2, `${record}: expected at least 2 golden fixtures, found ${files.length}`);
    for (const file of files) {
      const data = JSON.parse(readFileSync(join(dir, file), "utf8"));
      const ok = validate(data);
      assert.ok(ok, `${record}/${file} should be valid:\n${JSON.stringify(validate.errors, null, 2)}`);
    }
  });

  test(`${record}: invalid fixture is rejected`, () => {
    assert.ok(validate, `no validator for ${record}`);
    const data = JSON.parse(readFileSync(join(invalidDir, `${record}.json`), "utf8"));
    const ok = validate(data);
    assert.equal(ok, false, `invalid/${record}.json unexpectedly passed validation`);
  });
}
