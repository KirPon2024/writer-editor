// Unified Word review-transport bookmark-name generator V1 (node builtins only).
//
// This bounded module owns ONE concern: deriving the canonical Word bookmark
// name for a full-manuscript review-transport block, from a single set of
// internal identities. Before this module existed the name was invented in
// THREE places with three divergent formulas:
//
//   * fullManuscriptDocxReviewPacketSource.js —
//     `YRTK_<sceneOrdinal+1:2d>_<blockIndex+1:4d>_<seedHash.slice(0,8)>`
//     (declared in block.wordSignals[].bookmarkName.value.name).
//   * docxReviewPacketBuilder.js buildBookmarkName —
//     `YRTK_<index+1:4d>_<sanitized(blockId)>.slice(0,40)` (emitted into
//     w:bookmarkStart), and normalizeReviewPacketBlocks dropped wordSignals so
//     the declared name never reached the builder.
//   * revisionBridge index.mjs resolver — synthesized a name from blockId +
//     globalBlockIndex using the SAME formula as the builder (resolver-index
//     name), IN ADDITION to the declared bookmarkName signal.
//
// That split-brain meant the declared, emitted and resolved names were three
// different strings, and the resolver could fabricate authority for a bookmark
// that matched the synthesized form but had NO declared bookmarkName signal.
//
// deriveWordBookmarkNameV1 is the SINGLE source of truth. Every site that needs
// a review bookmark name MUST call it; the builder is forbidden from inventing a
// name and the resolver is forbidden from synthesizing one. The output is:
//
//   `YRTK_` + sha256hex('word-bookmark-v1' + canonical({roundId, sceneId,
//           roundBlockOccurrenceId})).slice(0, 32)
//
// which is exactly 37 characters, deterministic, lowercase-hex, and differs
// across rounds, scenes and per-scene block occurrences.

import crypto from 'node:crypto';

export const RTK_WORD_BOOKMARK_V1_DOMAIN = 'word-bookmark-v1';

// ---------------------------------------------------------------------------
// Stable canonical JSON — same approach as reviewTransportZipEvidenceV1.mjs so
// digests match across sibling modules.
// ---------------------------------------------------------------------------
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function canonicalWordBookmarkIdentityJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalWordBookmarkIdentityJson(item)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalWordBookmarkIdentityJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

// ---------------------------------------------------------------------------
// deriveWordBookmarkNameV1({ roundId, sceneId, roundBlockOccurrenceId })
//
//   Produces the canonical Word bookmark name for a review-transport block.
//
//   Inputs are coerced to strings; roundBlockOccurrenceId is the per-scene
//   occurrence index of the block (0-based) — it disambiguates two blocks that
//   share a scene within one round. The three identities are canonicalized with
//   sorted keys and domain-separated before hashing so the name is stable and
//   collision-resistant across rounds/scenes/blocks.
//
//   Output: `YRTK_` + 32 lowercase hex chars = exactly 37 characters. Matches
//   /^YRTK_[0-9a-f]{32}$/u.
// ---------------------------------------------------------------------------
export function deriveWordBookmarkNameV1(input = {}) {
  const source = isPlainObject(input) ? input : {};
  const roundId = String(source.roundId ?? '');
  const sceneId = String(source.sceneId ?? '');
  const roundBlockOccurrenceId = String(source.roundBlockOccurrenceId ?? '');
  const identity = canonicalWordBookmarkIdentityJson({
    roundBlockOccurrenceId,
    roundId,
    sceneId,
  });
  const digest = sha256Hex(`${RTK_WORD_BOOKMARK_V1_DOMAIN}${identity}`);
  return `YRTK_${digest.slice(0, 32)}`;
}
