const REQUIRED_FIELDS = [
  "id",
  "spokenForms",
  "description",
  "argsSchema",
  "recordKinds",
  "status",
  "execute",
  "testReference",
];

export const noArgs = Object.freeze({ type: "object", additionalProperties: false });

export function objectArgs(properties, required = []) {
  return Object.freeze({
    type: "object",
    properties: Object.freeze({ ...properties }),
    required: Object.freeze([...required]),
    additionalProperties: true,
  });
}

export function assertVerbModule(verb) {
  for (const field of REQUIRED_FIELDS) {
    if (verb?.[field] == null) throw new TypeError(`verb module is missing ${field}`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(verb.id)) throw new TypeError(`invalid verb id: ${verb.id}`);
  if (typeof verb.description !== "string" || !verb.description.trim()) {
    throw new TypeError(`${verb.id}: description must be plain words`);
  }
  if (!Array.isArray(verb.spokenForms) || verb.spokenForms.some(form => typeof form !== "string" || !form.trim())) {
    throw new TypeError(`${verb.id}: spokenForms must contain nonempty strings`);
  }
  if (!Array.isArray(verb.recordKinds)) throw new TypeError(`${verb.id}: recordKinds must be an array`);
  if (verb.recordKinds.some((kind) => typeof kind !== "string" || !kind)) {
    throw new TypeError(`${verb.id}: recordKinds must contain names`);
  }
  if (!verb.argsSchema || typeof verb.argsSchema !== "object" || verb.argsSchema.type !== "object") {
    throw new TypeError(`${verb.id}: argsSchema must describe an object`);
  }
  if (typeof verb.testReference !== "string" || !/^test\/.+\.test\.mjs$/.test(verb.testReference)) {
    throw new TypeError(`${verb.id}: testReference must name a test file`);
  }
  if (verb.intentNames != null && (
    !Array.isArray(verb.intentNames) || verb.intentNames.some((name) => typeof name !== "string" || !name)
  )) {
    throw new TypeError(`${verb.id}: intentNames must contain names`);
  }
  if (!["real", "partial", "designed"].includes(verb.status)) {
    throw new TypeError(`${verb.id}: invalid status ${verb.status}`);
  }
  if (typeof verb.execute !== "function") throw new TypeError(`${verb.id}: execute must be a function`);
  if (verb.recordAct != null) {
    if (typeof verb.recordAct !== "string" || !verb.recordAct) {
      throw new TypeError(`${verb.id}: recordAct must be a name`);
    }
    if (typeof verb.recordDescription !== "function" || typeof verb.recordResult !== "function") {
      throw new TypeError(`${verb.id}: record verbs need recordDescription and recordResult`);
    }
  }
  if (verb.status === "designed" && (
    typeof verb.roomDescription !== "string" || !verb.roomDescription.trim()
  )) {
    throw new TypeError(`${verb.id}: designed verbs need a roomDescription`);
  }
  return verb;
}

export function defineVerb(definition) {
  assertVerbModule(definition);
  return Object.freeze({
    ...definition,
    spokenForms: Object.freeze([...definition.spokenForms]),
    recordKinds: Object.freeze([...definition.recordKinds]),
    intentNames: Object.freeze([...(definition.intentNames ?? [])]),
  });
}

export function targetedVerb({ intentArgs = () => ({}), ...definition }) {
  const { id, recordAct } = definition;
  return defineVerb({
    ...definition,
    commandFromIntent(event, evidence, confidence) {
      const args = intentArgs(event.args ?? {});
      return { type: "act", act: recordAct, verbId: id, ...args, evidence, confidence };
    },
    execute(ctx, args) {
      return ctx.performTargeted(id, args);
    },
  });
}

export function designedVerb({ id, spokenForms, description, roomDescription, testReference }) {
  return defineVerb({
    id,
    spokenForms,
    description,
    roomDescription,
    argsSchema: noArgs,
    recordKinds: [],
    status: "designed",
    testReference,
    execute(ctx) {
      ctx.openRoom({ id, description: roomDescription });
      return { kind: "designed-room", id };
    },
  });
}
