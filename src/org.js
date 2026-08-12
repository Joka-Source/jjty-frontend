// jt — the organizational layer (PROVISIONAL; pending founder handoff).
//
// Browser port of jt-contracts' reference OrgStore: institutions, cohorts,
// spaces, and memberships. Every record is validated against the vendored
// schemas in contracts/org/ before the store accepts it — the store cannot
// hold a record the contract would reject. Persistence is a pluggable
// key/value storage (localStorage in the app, a plain object in tests);
// everything stays on this device.

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import institutionSchema from "../contracts/org/institution.schema.json" with { type: "json" };
import cohortSchema from "../contracts/org/cohort.schema.json" with { type: "json" };
import spaceSchema from "../contracts/org/space.schema.json" with { type: "json" };
import membershipSchema from "../contracts/org/membership.schema.json" with { type: "json" };
import spaceContextSchema from "../contracts/org/spacecontext.schema.json" with { type: "json" };

const AjvCtor = Ajv2020.default ?? Ajv2020;
const withFormats = addFormats.default ?? addFormats;

const ajv = new AjvCtor({ allErrors: true, strict: true, strictRequired: false });
withFormats(ajv);

const SCHEMA_VERSION = "0.1.0";

const validators = {
  institution: ajv.compile(institutionSchema),
  cohort: ajv.compile(cohortSchema),
  space: ajv.compile(spaceSchema),
  membership: ajv.compile(membershipSchema),
  spacecontext: ajv.compile(spaceContextSchema),
};

export const SPACE_KINDS = spaceSchema.properties.kind.enum;
export const MEMBER_ROLES = membershipSchema.properties.role.enum;

export class ValidationError extends Error {
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

  /** Walk parentSpaceId links from a space up to its root. */
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

  /** Persist into a Storage-like object (localStorage in the app). */
  save(storage, key = "jt.org") {
    storage.setItem(key, JSON.stringify(this.toJSON()));
  }

  static fromJSON(data) {
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

  /** Load from a Storage-like object; a broken blob yields a fresh store
   * rather than a dead surface (the raw blob stays untouched in storage). */
  static load(storage, key = "jt.org") {
    try {
      const raw = storage.getItem(key);
      if (!raw) return new OrgStore();
      return OrgStore.fromJSON(JSON.parse(raw));
    } catch {
      return new OrgStore();
    }
  }
}
