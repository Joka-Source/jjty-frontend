import underline from './verbs/underline.js';
import underlineRange from './verbs/underline-range.js';
import strikethrough from './verbs/strikethrough.js';
import strikethroughRange from './verbs/strikethrough-range.js';
import { assertVerbModule, defineVerb } from "./define.js";
import highlight from "./verbs/highlight.js";
import highlightRange from "./verbs/highlight-range.js";
import annotate from "./verbs/annotate.js";
import markImportant from "./verbs/mark-important.js";
import sendTo from "./verbs/send-to.js";
import sendToSpace from "./verbs/send-to-space.js";
import undo from "./verbs/undo.js";
import returnVerb from "./verbs/return.js";
import openDocument from "./verbs/open-document.js";
import mathKeep from "./verbs/math-keep.js";
import showHistory from "./verbs/show-history.js";
import find from "./verbs/find.js";
import quote from "./verbs/quote.js";
import gather from "./verbs/gather.js";
import compare from "./verbs/compare.js";
import remind from "./verbs/remind.js";
import translateThis from "./verbs/translate-this.js";
import capture from "./verbs/capture.js";
import shareSheetIntake from "./verbs/share-sheet-intake.js";
import crossDeviceDrop from "./verbs/cross-device-drop.js";
import togetherness from "./verbs/togetherness.js";

const builtInModules = [
  underline,underlineRange,strikethrough,strikethroughRange,
  highlight,
  highlightRange,
  annotate,
  markImportant,
  sendTo,
  sendToSpace,
  undo,
  returnVerb,
  openDocument,
  mathKeep,
  showHistory,
  find,
  quote,
  gather,
  compare,
  remind,
  translateThis,
  capture,
  shareSheetIntake,
  crossDeviceDrop,
  togetherness,
];

export function createVerbRegistry(initialModules = builtInModules) {
  const byId = new Map();
  const byIntent = new Map();
  const byStoredAlias = new Map();

  function register(module) {
    let verb = assertVerbModule(module);
    if (byId.has(verb.id)) throw new Error(`verb ${verb.id} is already registered`);
    if (byStoredAlias.has(verb.id)) {
      throw new Error(`verb id ${verb.id} collides with record alias`);
    }
    for (const intent of verb.intentNames ?? []) {
      if (byIntent.has(intent)) throw new Error(`speech intent ${intent} is already registered`);
    }
    if (verb.recordAct && verb.recordDefault !== false && byStoredAlias.has(verb.recordAct)) {
      throw new Error(`record alias ${verb.recordAct} is already registered`);
    }
    if (verb.recordAct && verb.recordDefault !== false && verb.recordAct !== verb.id && byId.has(verb.recordAct)) {
      throw new Error(`record alias ${verb.recordAct} collides with verb id`);
    }
    if (verb.status === "designed") {
      const { id, roomDescription } = verb;
      verb = {
        ...verb,
        execute(ctx) {
          if (typeof ctx?.openRoom !== "function") throw new TypeError(`${id}: openRoom context is required`);
          ctx.openRoom({ id, description: roomDescription });
          return { kind: "designed-room", id };
        },
      };
    }
    verb = defineVerb(verb);
    byId.set(verb.id, verb);
    for (const intent of verb.intentNames ?? []) byIntent.set(intent, verb);
    if (verb.recordAct && verb.recordDefault !== false) byStoredAlias.set(verb.recordAct, verb);
    return verb;
  }

  for (const module of initialModules) register(module);

  return Object.freeze({
    register,
    list: () => [...byId.values()],
    get: (id) => byId.get(id) ?? null,
    forIntent: (intent) => byIntent.get(intent) ?? null,
    resolve: (idOrAlias) => byId.get(idOrAlias) ?? byStoredAlias.get(idOrAlias) ?? null,
  });
}

export const verbRegistry = createVerbRegistry();

export function executeVerb(id, ctx, args = {}) {
  const verb = verbRegistry.get(id);
  if (!verb) throw new Error(`unknown verb: ${id}`);
  return verb.execute(ctx, args);
}

export function historyTitleFor(entry) {
  const verb = verbRegistry.resolve(entry.verbId ?? entry.act);
  return verb?.historyTitle ?? verb?.id.replaceAll("-", " ") ?? entry.verbId ?? entry.act;
}
