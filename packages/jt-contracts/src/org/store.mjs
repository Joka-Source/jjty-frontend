// PROVISIONAL (pending founder WhatsApp handoff, 2026-08-12).
//
// Reference in-memory organizational store for the jt org layer:
// institutions, cohorts, spaces, and memberships (person <-> space, with
// institutional identity such as a roll number).
//
// Every object this module emits is validated against the corresponding
// schema in schemas/ before it is accepted — the store cannot hold a record
// the contract would reject. State can be persisted to / loaded from a
// single JSON file.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schemasDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "schemas");

const ajv = new Ajv2020.default({ allErrors: true, strict: true, strictRequired: false });
addFormats.default(ajv);

const SCHEMA_VERSION = "0.1.0";
const RECORDS = ["institution", "cohort", "space", "membership", "spacecontext"];

const validators = {};
for (const record of RECORDS) {
  const schema = JSON.parse(readFileSync(join(schemasDir, `${record}.schema.json`), "utf8"));
  validators[record] = ajv.compile(schema);
}

class ValidationError extends Error {
  constructor(record, errors) {
    super(`${record} failed schema validation: ${ajv.errorsText(errors)}`);
    this.name = "ValidationError";
    this.record = record;
    this.errors = errors;
  }
}

function assertValid(record, data) {
  const validate = validators[record];
  if (!validate(data)) throw new ValidationError(record, validate.errors);
  return data;
}

/** Drop undefined values so emitted records carry only real fields. */
function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

export class OrgStore {
  constructor() {
    this.institutions = new Map();
    this.cohorts = new Map();
    this.spaces = new Map();
    this.memberships = new Map();
    this._seq = 0;
  }

  _nextId(prefix) {
    this._seq += 1;
    return `${prefix}-${String(this._seq).padStart(4, "0")}`;
  }

  // --- creation -----------------------------------------------------------

  createInstitution({ id, name, shortName, kind, affiliatedTo, location, academicYearStartMonth }) {
    const record = compact({
      schemaVersion: SCHEMA_VERSION,
      id: id ?? this._nextId("inst"),
      name,
      shortName,
      kind,
      affiliatedTo,
      location,
      academicYearStartMonth,
    });
    assertValid("institution", record);
    if (this.institutions.has(record.id)) throw new Error(`duplicate institution id '${record.id}'`);
    this.institutions.set(record.id, record);
    return record;
  }

  createCohort({ id, institutionId, label, programme, entryYear, expectedGraduationYear }) {
    if (!this.institutions.has(institutionId)) {
      throw new Error(`unknown institution '${institutionId}'`);
    }
    const record = compact({
      schemaVersion: SCHEMA_VERSION,
      id: id ?? this._nextId("coh"),
      institutionId,
      label,
      programme,
      entryYear,
      expectedGraduationYear,
    });
    assertValid("cohort", record);
    if (this.cohorts.has(record.id)) throw new Error(`duplicate cohort id '${record.id}'`);
    this.cohorts.set(record.id, record);
    return record;
  }

  createSpace({ id, institutionId, kind, name, parentSpaceId, cohortId, capacity }) {
    if (!this.institutions.has(institutionId)) {
      throw new Error(`unknown institution '${institutionId}'`);
    }
    if (parentSpaceId !== undefined && !this.spaces.has(parentSpaceId)) {
      throw new Error(`unknown parent space '${parentSpaceId}'`);
    }
    if (cohortId !== undefined && !this.cohorts.has(cohortId)) {
      throw new Error(`unknown cohort '${cohortId}'`);
    }
    const record = compact({
      schemaVersion: SCHEMA_VERSION,
      id: id ?? this._nextId("spc"),
      institutionId,
      kind,
      name,
      parentSpaceId,
      cohortId,
      capacity,
    });
    assertValid("space", record);
    if (this.spaces.has(record.id)) throw new Error(`duplicate space id '${record.id}'`);
    this.spaces.set(record.id, record);
    return record;
  }

  addMember({ id, personId, spaceId, role, institutionalIdentity, joinedAt, leftAt }) {
    if (!this.spaces.has(spaceId)) throw new Error(`unknown space '${spaceId}'`);
    const record = compact({
      schemaVersion: SCHEMA_VERSION,
      id: id ?? this._nextId("mem"),
      personId,
      spaceId,
      role,
      institutionalIdentity,
      joinedAt,
      leftAt,
    });
    assertValid("membership", record);
    if (this.memberships.has(record.id)) throw new Error(`duplicate membership id '${record.id}'`);
    const dup = [...this.memberships.values()].find(
      (m) => m.personId === record.personId && m.spaceId === record.spaceId && m.leftAt === undefined,
    );
    if (dup && record.leftAt === undefined) {
      throw new Error(`person '${personId}' already has a current membership in space '${spaceId}'`);
    }
    this.memberships.set(record.id, record);
    return record;
  }

  // --- resolution ---------------------------------------------------------

  /** All spaces a person currently belongs to (memberships without leftAt). */
  spacesOf(personId, { includePast = false } = {}) {
    const spaceIds = new Set(
      [...this.memberships.values()]
        .filter((m) => m.personId === personId && (includePast || m.leftAt === undefined))
        .map((m) => m.spaceId),
    );
    return [...spaceIds].map((sid) => this.spaces.get(sid));
  }

  /** All current members of a space, each with their membership record. */
  membersOf(spaceId, { includePast = false } = {}) {
    return [...this.memberships.values()].filter(
      (m) => m.spaceId === spaceId && (includePast || m.leftAt === undefined),
    );
  }

  /** Walk parentSpaceId links from a space up to its root (hostel > floor > room, reversed). */
  spaceChain(spaceId) {
    const chain = [];
    let current = this.spaces.get(spaceId);
    while (current) {
      chain.unshift(current);
      current = current.parentSpaceId ? this.spaces.get(current.parentSpaceId) : undefined;
    }
    return chain;
  }

  /** Build the SpaceContext a moment-carrying record would attach for a space. */
  spaceContextFor(spaceId, { cohortId, visibility } = {}) {
    const space = this.spaces.get(spaceId);
    if (!space) throw new Error(`unknown space '${spaceId}'`);
    const record = compact({
      schemaVersion: SCHEMA_VERSION,
      spaceId: space.id,
      institutionId: space.institutionId,
      cohortId: cohortId ?? space.cohortId,
      visibility,
    });
    return assertValid("spacecontext", record);
  }

  // --- persistence --------------------------------------------------------

  toJSON() {
    return {
      seq: this._seq,
      institutions: [...this.institutions.values()],
      cohorts: [...this.cohorts.values()],
      spaces: [...this.spaces.values()],
      memberships: [...this.memberships.values()],
    };
  }

  save(filePath) {
    writeFileSync(filePath, JSON.stringify(this.toJSON(), null, 2) + "\n", "utf8");
  }

  static load(filePath) {
    const data = JSON.parse(readFileSync(filePath, "utf8"));
    const store = new OrgStore();
    for (const r of data.institutions ?? []) {
      assertValid("institution", r);
      store.institutions.set(r.id, r);
    }
    for (const r of data.cohorts ?? []) {
      assertValid("cohort", r);
      store.cohorts.set(r.id, r);
    }
    for (const r of data.spaces ?? []) {
      assertValid("space", r);
      store.spaces.set(r.id, r);
    }
    for (const r of data.memberships ?? []) {
      assertValid("membership", r);
      store.memberships.set(r.id, r);
    }
    store._seq = data.seq ?? 0;
    return store;
  }
}

export { ValidationError };
