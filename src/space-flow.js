// jt — local space-flow primitives (PROVISIONAL).
//
// Pure behavior shared by the spaces surface and node tests. Persistence and
// DOM work stay at the app boundary; matching reuses jt-speech's recognizer-
// tolerant phrase scoring so voice and picker destinations agree.

import { normalize, phraseSimilarity } from "../vendor/jt-speech/fuzzy.js";
import { envelopeHash } from "jt-sync/src/hash.ts";
import { contentDigest } from "jt-connectors";
import { nowIso, rid } from "./records.js";

const MATCH_THRESHOLD = 0.72;
const AMBIGUITY_DELTA = 0.08;

/** Resolve speech against only the spaces supplied by the caller. */
export function resolveSpaceName(query, spaces) {
  const wanted = normalize(String(query ?? ""));
  if (!wanted) return { kind: "none" };

  const exact = spaces.filter((space) => normalize(space.name) === wanted);
  if (exact.length === 1) return { kind: "match", space: exact[0], score: 1 };
  if (exact.length > 1) {
    return {
      kind: "ambiguous",
      candidates: exact.map((space) => ({ space, score: 1 })),
    };
  }

  const ranked = spaces
    .map((space) => ({ space, score: phraseSimilarity(wanted, space.name) }))
    .filter(({ score }) => score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.space.name.localeCompare(b.space.name));
  if (!ranked.length) return { kind: "none" };

  const close = ranked.filter(({ score }) => ranked[0].score - score <= AMBIGUITY_DELTA);
  if (close.length > 1) return { kind: "ambiguous", candidates: close };
  return { kind: "match", ...ranked[0] };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Wrap a full existing moment for an append-only local space feed. */
export async function makeSpaceFeedItem({
  moment,
  space,
  spaceContext,
  person,
  momentId = rid("spm"),
  at = nowIso(),
  sourceContentHash = null,
}) {
  const contextualMoment = {
    ...clone(moment),
    spaceContext: clone(spaceContext),
  };
  return {
    id: momentId,
    spaceId: space.id,
    spaceName: space.name,
    arrivedAt: at,
    placedBy: person ? { id: person.id, name: person.name } : null,
    sourceContentHash,
    sourceSpaceContext: moment.spaceContext ? clone(moment.spaceContext) : null,
    contentHash: await envelopeHash(contextualMoment),
    moment: contextualMoment,
  };
}

function importedBlock(block) {
  const text = block.kind === "math" ? block.spoken || block.content : block.content;
  return { text: String(text ?? ""), kind: block.kind === "math" ? "math" : "paragraph" };
}

/** Turn the excerpt inside a feed item into a normal jt document. */
export async function documentFromSpaceFeedItem(item, { id = rid("doc"), at = nowIso() } = {}) {
  const blocks = item.moment.blocks.map(importedBlock);
  const text = blocks.map((block) => block.text).join("\n\n");
  const sourceTitle = item.moment.provenance?.sourceTitle || "a moment";
  return {
    id,
    title: `${sourceTitle} — from ${item.spaceName}`,
    text,
    blocks,
    createdAt: at,
    revision: 1,
    provenance: {
      sourceKind: "space moment",
      title: sourceTitle,
      capturedAt: at,
      byteSize: new TextEncoder().encode(text).byteLength,
      contentDigest: await contentDigest(text),
      original: clone(item.moment.provenance ?? {}),
      spaceImport: {
        spaceId: item.spaceId,
        spaceName: item.spaceName,
        arrivedAt: item.arrivedAt,
        contentHash: item.contentHash,
        sourceContentHash: item.sourceContentHash,
        sourceSpaceContext: clone(item.sourceSpaceContext),
        spaceContext: clone(item.moment.spaceContext),
        moment: clone(item.moment),
      },
    },
  };
}
